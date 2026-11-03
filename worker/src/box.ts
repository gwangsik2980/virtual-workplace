/**
 * 서버 저장소 (회사 하나).
 * - 회사 저장본: 누구나 받아 갈 수 있다(보기). 올리기는 관리자 키가 있는 기기만.
 * - 알림 예정표와 구독: 관리자 키가 있는 기기만. 시각이 되면 구독한 기기(폰)로 보낸다.
 * - 관리자 키: 처음 한 번 서버가 만들어 돌려주고, 서버에는 해시만 남긴다.
 * Durable Object 저장소를 직접 쓰지 않고 아래 Store 인터페이스만 써서, 테스트에서는 가짜 저장소로 돌린다.
 */
import { generateVapidKeys, sendPush, type PushSubscriptionJSON, type SendResult, type VapidKeys } from './webpush';

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface PushItem {
  /** 보낼 시각 (epoch ms) */
  at: number;
  kind: string;
  title: string;
  body: string;
  tag: string;
}

export interface Member {
  sub: PushSubscriptionJSON;
  /** 받을 알림 종류 (기기마다 다를 수 있다) */
  prefs: Record<string, boolean>;
}

export type Sender = (sub: PushSubscriptionJSON, payload: unknown, keys: VapidKeys) => Promise<SendResult>;

export const SUBJECT = 'https://gwangsik2980.github.io/virtual-workplace/';
export const MAX_ITEMS = 500;
export const MAX_MEMBERS = 10;
/** 회사 저장본 최대 크기 (압축 후 base64). Durable Object 값 한도 2MB 안쪽 */
export const MAX_STATE_CHARS = 1_900_000;
/** 이보다 오래 밀린 알림은 보내지 않는다 (서버가 멈췄던 경우) */
export const STALE_MS = 6 * 3600_000;

const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export const defaultSender: Sender = (sub, payload, keys) => sendPush(sub, payload, keys, SUBJECT);

/** 브라우저 푸시 서비스 주소만 받는다 (서버가 아무 주소로나 요청을 보내는 데 쓰이지 않도록) */
export function validSub(s: unknown): s is PushSubscriptionJSON {
  const sub = s as PushSubscriptionJSON;
  if (!sub || typeof sub.endpoint !== 'string' || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return false;
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

export async function vapidKeys(store: Store): Promise<VapidKeys> {
  const have = await store.get<VapidKeys>('vapid');
  if (have) return have;
  const keys = await generateVapidKeys();
  await store.put('vapid', keys);
  return keys;
}

// ── 관리자 키 ─────────────────────────────────────

/** 헷갈리는 글자(I, L, O, U)를 뺀 32글자. 사이트(src/ui/sync.ts)와 같다 */
export const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const KEY_LENGTH = 20;

async function sha256(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function ownerClaimed(store: Store) {
  return { claimed: !!(await store.get<string>('ownerHash')) };
}

/** 관리자 키를 처음 한 번만 만든다. 이미 있으면 거절 */
export async function claimOwner(store: Store) {
  if (await store.get<string>('ownerHash')) throw new Error('already claimed');
  const key = Array.from(crypto.getRandomValues(new Uint8Array(KEY_LENGTH)), (b) => KEY_ALPHABET[b & 31]).join('');
  await store.put('ownerHash', await sha256(key));
  return { key };
}

export async function isOwner(store: Store, key: string | null | undefined) {
  const h = await store.get<string>('ownerHash');
  return !!h && !!key && h === (await sha256(key));
}

// ── 회사 저장본 ─────────────────────────────────────

export async function putState(store: Store, state: unknown, now = Date.now()) {
  if (typeof state !== 'string' || state.length === 0) throw new Error('bad state');
  if (state.length > MAX_STATE_CHARS) throw new Error('state too large');
  const rev = ((await store.get<number>('rev')) ?? 0) + 1;
  await store.put('state', state);
  await store.put('rev', rev);
  await store.put('stateAt', now);
  return { rev };
}

export async function getState(store: Store, since: number) {
  const rev = (await store.get<number>('rev')) ?? 0;
  if (rev <= since) return { rev };
  return { rev, state: await store.get<string>('state'), at: await store.get<number>('stateAt') };
}

// ── 알림 ─────────────────────────────────────

export async function addMember(store: Store, sub: PushSubscriptionJSON, prefs: unknown, keys: VapidKeys) {
  const members = ((await store.get<Member[]>('members')) ?? []).filter((m) => m.sub.endpoint !== sub.endpoint);
  const p = prefs && typeof prefs === 'object' ? (prefs as Record<string, boolean>) : {};
  members.push({ sub, prefs: p });
  await store.put('members', members.slice(-MAX_MEMBERS));
  await store.put('keys', keys);
  return { members: members.length };
}

export async function removeMember(store: Store, endpoint: string) {
  const members = ((await store.get<Member[]>('members')) ?? []).filter((m) => m.sub.endpoint !== endpoint);
  await store.put('members', members);
  return { members: members.length };
}

function clean(items: unknown): PushItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is PushItem => !!i && typeof i.at === 'number' && typeof i.title === 'string')
    .slice(0, MAX_ITEMS)
    .map((i) => ({
      at: i.at,
      kind: String(i.kind ?? '').slice(0, 16),
      title: i.title.slice(0, 120),
      body: String(i.body ?? '').slice(0, 400),
      tag: String(i.tag ?? '').slice(0, 64),
    }))
    .sort((a, b) => a.at - b.at);
}

async function arm(store: Store, items: PushItem[]) {
  if (items.length) await store.setAlarm(items[0].at);
  else await store.deleteAlarm();
}

export async function saveSchedule(store: Store, rawItems: unknown, now = Date.now()) {
  const items = clean(rawItems).filter((i) => i.at > now - 60_000);
  await store.put('items', items);
  await arm(store, items);
  return { count: items.length, next: items[0]?.at ?? null };
}

/** 시각이 된 알림을 그룹의 각 기기로 보낸다. 기기마다 끈 종류는 빼고, 여러 건이면 하나로 묶는다 */
export async function runDue(store: Store, send: Sender = defaultSender, now = Date.now()) {
  const items = (await store.get<PushItem[]>('items')) ?? [];
  const members = (await store.get<Member[]>('members')) ?? [];
  const keys = await store.get<VapidKeys>('keys');
  const due = items.filter((i) => i.at <= now + 5_000 && i.at > now - STALE_MS);
  const rest = items.filter((i) => i.at > now + 5_000);
  let sent = 0;
  const gone = new Set<string>();
  if (due.length && keys) {
    for (const m of members) {
      const mine = due.filter((i) => m.prefs[i.kind] !== false);
      if (!mine.length) continue;
      const payload =
        mine.length === 1
          ? { title: mine[0].title, body: mine[0].body, tag: mine[0].tag }
          : { title: `새 알림 ${mine.length}건`, body: mine.slice(0, 3).map((i) => i.title).join('\n'), tag: `vw-${now}` };
      try {
        const r = await send(m.sub, payload, keys);
        if (r.gone) gone.add(m.sub.endpoint);
        else sent++;
      } catch {
        /* 한 기기 실패가 다른 기기를 막지 않게 */
      }
    }
  }
  if (gone.size) await store.put('members', members.filter((m) => !gone.has(m.sub.endpoint)));
  await store.put('items', rest);
  await arm(store, rest);
  return { sent, gone: gone.size };
}
