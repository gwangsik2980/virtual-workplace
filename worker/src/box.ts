/**
 * 구독 하나(폰 하나)의 알림 예정표를 들고 있다가 시각이 되면 보낸다.
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
  title: string;
  body: string;
  tag: string;
}

export type Sender = (sub: PushSubscriptionJSON, payload: unknown, keys: VapidKeys) => Promise<SendResult>;

export const SUBJECT = 'https://gwangsik2980.github.io/virtual-workplace/';
export const MAX_ITEMS = 300;
/** 이보다 오래 밀린 알림은 보내지 않는다 (폰을 오래 꺼 두었거나 서버가 멈췄던 경우) */
export const STALE_MS = 6 * 3600_000;

export const defaultSender: Sender = (sub, payload, keys) => sendPush(sub, payload, keys, SUBJECT);

export async function vapidKeys(store: Store): Promise<VapidKeys> {
  const have = await store.get<VapidKeys>('vapid');
  if (have) return have;
  const keys = await generateVapidKeys();
  await store.put('vapid', keys);
  return keys;
}

function clean(items: unknown): PushItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is PushItem => !!i && typeof i.at === 'number' && typeof i.title === 'string')
    .slice(0, MAX_ITEMS)
    .map((i) => ({ at: i.at, title: i.title.slice(0, 120), body: String(i.body ?? '').slice(0, 400), tag: String(i.tag ?? '').slice(0, 64) }))
    .sort((a, b) => a.at - b.at);
}

async function arm(store: Store, items: PushItem[]) {
  if (items.length) await store.setAlarm(items[0].at);
  else await store.deleteAlarm();
}

export async function saveSchedule(store: Store, sub: PushSubscriptionJSON, keys: VapidKeys, rawItems: unknown, now = Date.now()) {
  const items = clean(rawItems).filter((i) => i.at > now - 60_000);
  await store.put('sub', sub);
  await store.put('keys', keys);
  await store.put('items', items);
  await store.put('updatedAt', now);
  await arm(store, items);
  return { count: items.length, next: items[0]?.at ?? null };
}

/** 시각이 된 알림을 보낸다. 여러 건이 한꺼번에 밀려 있으면 하나로 묶는다 */
export async function runDue(store: Store, send: Sender = defaultSender, now = Date.now()) {
  const sub = await store.get<PushSubscriptionJSON>('sub');
  const keys = await store.get<VapidKeys>('keys');
  const items = (await store.get<PushItem[]>('items')) ?? [];
  if (!sub || !keys) {
    await store.deleteAll();
    return { sent: 0 };
  }
  const due = items.filter((i) => i.at <= now + 5_000 && i.at > now - STALE_MS);
  const rest = items.filter((i) => i.at > now + 5_000);
  let sent = 0;
  if (due.length) {
    const payload =
      due.length === 1
        ? due[0]
        : { title: `새 알림 ${due.length}건`, body: due.slice(-3).map((i) => i.title).join('\n'), tag: 'vw-batch', at: now };
    const r = await send(sub, payload, keys);
    if (r.gone) {
      await store.deleteAll();
      return { sent: 0, gone: true };
    }
    sent = 1;
  }
  await store.put('items', rest);
  await arm(store, rest);
  return { sent };
}
