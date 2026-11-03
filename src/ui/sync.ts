import { useEffect, useRef, useState } from 'react';
import { isValidState, migrate } from '../sim/persistence';
import type { GameState } from '../sim/types';
import { getJson, postJson, SERVER, ServerError } from './server';
import { useStore } from './store';

/**
 * 회사 저장본 공유. 서버에는 회사가 하나만 있다.
 * - 누구나 열 때, 1분마다, 화면으로 돌아올 때 서버의 새 저장본(rev)을 받아 그 회사를 본다.
 * - 관리자 키가 있는 기기(PC, 폰)만 바꾼 내용을 올린다(store.userRev). 마지막에 올린 쪽이 이긴다.
 *   키가 없는 방문자가 누른 것은 그 브라우저에만 남고 서버 회사는 바뀌지 않는다.
 * - 받은 뒤 따라잡기는 각 기기가 스스로 하고, 올리지 않는다. 재현성 원칙 덕분에 어디서 따라잡아도 같은 회사다.
 * 관리자 키는 이 브라우저의 localStorage에만 둔다 (GameState에 넣지 않는다).
 */

const OWNER_KEY = 'virtual-workplace/owner-key';
const REV_KEY = 'virtual-workplace/sync/rev';
const AT_KEY = 'virtual-workplace/sync/at';
export const SYNC_CHANGE = 'vw-sync-change';
const POLL_MS = 60_000;
const UPLOAD_DELAY_MS = 1500;

/** 헷갈리는 글자(I, L, O, U)를 뺀 32글자. 서버(worker/src/box.ts)와 같다 */
export const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const KEY_LENGTH = 20;

/** 사람이 입력한 키를 정리한다. 띄어쓰기·하이픈은 빼고, 헷갈리는 글자는 비슷한 숫자로 바꾼다. 맞지 않으면 null */
export function normalizeKey(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== KEY_LENGTH) return null;
  return [...s].every((c) => KEY_ALPHABET.includes(c)) ? s : null;
}

/** 읽기 쉽게 4자리씩 끊는다 */
export const formatKey = (key: string) => key.replace(/(.{4})(?=.)/g, '$1-');

// ── 저장본 압축 ─────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeState(state: GameState): Promise<string> {
  return toBase64(await pipe(new TextEncoder().encode(JSON.stringify(state)), new CompressionStream('gzip')));
}

export async function decodeState(b64: string): Promise<GameState> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip'))));
  if (!isValidState(parsed)) throw new Error('bad state');
  return migrate(parsed);
}

// ── 이 브라우저에 남기는 값 ─────────────────────────────────────

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* 무시 */
  }
}

export const syncAvailable = () => !!SERVER && typeof CompressionStream !== 'undefined';
export const getOwnerKey = (): string | null => (SERVER ? get(OWNER_KEY) : null);
const getRev = () => Number(get(REV_KEY) ?? 0) || 0;
const notify = () => window.dispatchEvent(new Event(SYNC_CHANGE));

function saved(rev: number) {
  set(REV_KEY, String(rev));
  set(AT_KEY, String(Date.now()));
  notify();
}

/** 이번에 연 뒤 서버와 한 번이라도 맞췄는지. 맞추기 전에는 알림 예정표를 올리지 않는다 (오래된 회사로 덮어쓰지 않게) */
let ready = false;
export const isSyncReady = () => ready;

async function upload(key: string, state: GameState) {
  const { rev } = await postJson<{ rev: number }>('/state', { state: await encodeState(state) }, key);
  saved(rev);
}

export async function ownerClaimed(): Promise<boolean> {
  return (await getJson<{ claimed: boolean }>('/owner')).claimed;
}

/** 처음 한 번: 관리자 키를 만들고 이 기기의 회사를 서버 회사로 올린다 */
export async function claimOwner(state: GameState): Promise<string> {
  const { key } = await postJson<{ key: string }>('/claim', {});
  set(OWNER_KEY, key);
  await upload(key, state);
  ready = true;
  return key;
}

/** 다른 기기에서 받은 관리자 키를 넣는다. 서버 회사를 돌려준다 (없으면 이 기기 회사를 올리고 null) */
export async function enterOwnerKey(input: string, local: GameState): Promise<GameState | null> {
  const key = normalizeKey(input);
  if (!key) throw new Error(`키는 ${KEY_LENGTH}자리예요.`);
  try {
    await postJson('/check', {}, key);
  } catch (e) {
    if (e instanceof ServerError && e.status === 403) throw new Error('키가 맞지 않아요. 다시 확인해 주세요.');
    throw e;
  }
  set(OWNER_KEY, key);
  const r = await getJson<{ rev: number; state?: string }>('/state?since=0');
  ready = true;
  if (!r.state) {
    await upload(key, local);
    return null;
  }
  saved(r.rev);
  return decodeState(r.state);
}

/** 이 기기에서 키만 지운다. 회사는 계속 보이고, 바꾼 것은 더 이상 올라가지 않는다 */
export function forgetOwnerKey() {
  set(OWNER_KEY, null);
  notify();
}

export function useSyncInfo(): { key: string | null; at: number | null } {
  const read = () => ({ key: getOwnerKey(), at: Number(get(AT_KEY)) || null });
  const [info, setInfo] = useState(read);
  useEffect(() => {
    const f = () => setInfo(read());
    window.addEventListener(SYNC_CHANGE, f);
    return () => window.removeEventListener(SYNC_CHANGE, f);
  }, []);
  return info;
}

/** 저장본 받기(모두)와 올리기(관리자 기기). App에 하나만 둔다 */
export function DeviceSync() {
  const { state, userRev, replace } = useStore();
  const { key } = useSyncInfo();
  const stateRef = useRef(state);
  stateRef.current = state;
  // 올릴 것이 남아 있는 동안에는 받은 저장본으로 덮지 않는다
  const pending = useRef(false);
  const lastRev = useRef(userRev);

  // 관리자 기기에서 바꾸면 잠시 모아서 올린다
  useEffect(() => {
    if (userRev === lastRev.current) return;
    lastRev.current = userRev;
    if (!key) return;
    pending.current = true;
    const id = window.setTimeout(() => {
      upload(key, stateRef.current)
        .catch(() => undefined)
        .finally(() => (pending.current = false));
    }, UPLOAD_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [userRev, key]);

  // 서버 회사 받기
  useEffect(() => {
    if (!syncAvailable()) return;
    let stop = false;
    const pull = async () => {
      if (pending.current || document.hidden) return;
      try {
        const r = await getJson<{ rev: number; state?: string }>(`/state?since=${getRev()}`);
        if (stop || pending.current) return;
        if (r.state) {
          replace(await decodeState(r.state), { remote: true });
          saved(r.rev);
        } else if (r.rev < getRev() && key) {
          // 서버가 비었다. 관리자 기기면 이 기기 것을 다시 올린다
          await upload(key, stateRef.current);
        } else {
          set(AT_KEY, String(Date.now()));
          notify();
        }
        ready = true;
      } catch {
        /* 다음 차례에 다시 */
      }
    };
    void pull();
    const id = window.setInterval(pull, POLL_MS);
    const onVis = () => !document.hidden && void pull();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [key, replace]);

  return null;
}
