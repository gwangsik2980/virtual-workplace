import { useEffect, useRef, useState } from 'react';
import { isValidState, migrate } from '../sim/persistence';
import type { GameState } from '../sim/types';
import { getJson, postJson, SERVER } from './server';
import { useStore } from './store';

/**
 * 기기 연결: 연결 코드가 같은 기기들(PC 브라우저, 폰 홈 화면 앱)이 회사 저장본 하나를 함께 쓴다.
 * - 사용자가 직접 바꾸면(store.userRev) 저장본을 올린다. 마지막에 올린 쪽이 이긴다.
 * - 열 때, 1분마다, 화면으로 돌아올 때 새 번호(rev)가 있으면 받아서 바꾼다. 받은 뒤 따라잡기는 각 기기가 스스로 한다.
 * - 따라잡기 결과는 올리지 않는다. 재현성 원칙 덕분에 어느 기기에서 따라잡아도 같은 회사가 된다.
 * 연결 코드는 이 브라우저의 localStorage에만 둔다 (GameState에 넣지 않는다).
 */

const CODE_KEY = 'virtual-workplace/sync/code';
const REV_KEY = 'virtual-workplace/sync/rev';
const AT_KEY = 'virtual-workplace/sync/at';
export const SYNC_CHANGE = 'vw-sync-change';
const POLL_MS = 60_000;
const UPLOAD_DELAY_MS = 1500;

/** 헷갈리는 글자(I, L, O, U)를 뺀 32글자. 서버(worker/src/index.ts)의 GROUP 정규식과 같다 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 12;

export function makeCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(CODE_LENGTH), (b) => CODE_ALPHABET[b & 31]).join('');
}

/** 사람이 입력한 코드를 정리한다. 띄어쓰기·하이픈은 빼고, 헷갈리는 글자는 비슷한 숫자로 바꾼다. 맞지 않으면 null */
export function normalizeCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== CODE_LENGTH) return null;
  return [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

/** 읽기 쉽게 4자리씩 끊는다 */
export const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

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
export const getSyncCode = (): string | null => (SERVER ? get(CODE_KEY) : null);
const getRev = () => Number(get(REV_KEY) ?? 0) || 0;
const notify = () => window.dispatchEvent(new Event(SYNC_CHANGE));

function saved(rev: number) {
  set(REV_KEY, String(rev));
  set(AT_KEY, String(Date.now()));
  notify();
}

/** 이번에 연 뒤 서버와 한 번이라도 맞췄는지. 맞추기 전에는 알림 예정표를 올리지 않는다 (오래된 회사로 덮어쓰지 않게) */
let ready = false;
export const isSyncReady = () => !getSyncCode() || ready;

async function upload(code: string, state: GameState) {
  const { rev } = await postJson<{ rev: number }>(`/g/${code}/state`, { state: await encodeState(state) });
  saved(rev);
}

/** 이 기기의 회사로 새 연결 코드를 만든다 */
export async function createGroup(state: GameState): Promise<string> {
  const code = makeCode();
  await upload(code, state);
  set(CODE_KEY, code);
  ready = true;
  notify();
  return code;
}

/** 다른 기기의 코드로 연결한다. 그 기기의 회사를 돌려준다 (이 기기 회사는 그것으로 바뀐다) */
export async function joinGroup(input: string): Promise<GameState> {
  const code = normalizeCode(input);
  if (!code) throw new Error('코드는 12자리예요.');
  const r = await getJson<{ rev: number; state?: string }>(`/g/${code}/state?since=0`);
  if (!r.state) throw new Error('이 코드로 연결된 회사가 없어요. 코드를 다시 확인해 주세요.');
  const state = await decodeState(r.state);
  set(CODE_KEY, code);
  saved(r.rev);
  ready = true;
  return state;
}

/** 연결만 끊는다. 이 기기의 회사는 그대로 남는다 */
export function leaveGroup() {
  set(CODE_KEY, null);
  set(REV_KEY, null);
  set(AT_KEY, null);
  ready = false;
  notify();
}

export function useSyncInfo(): { code: string | null; at: number | null } {
  const read = () => ({ code: getSyncCode(), at: Number(get(AT_KEY)) || null });
  const [info, setInfo] = useState(read);
  useEffect(() => {
    const f = () => setInfo(read());
    window.addEventListener(SYNC_CHANGE, f);
    return () => window.removeEventListener(SYNC_CHANGE, f);
  }, []);
  return info;
}

/** 저장본 올리기·받기. App에 하나만 둔다 */
export function DeviceSync() {
  const { state, userRev, replace } = useStore();
  const { code } = useSyncInfo();
  const stateRef = useRef(state);
  stateRef.current = state;
  // 올릴 것이 남아 있는 동안에는 받은 저장본으로 덮지 않는다
  const pending = useRef(false);
  const lastRev = useRef(userRev);

  // 사용자가 바꾸면 잠시 모아서 올린다
  useEffect(() => {
    if (userRev === lastRev.current) return;
    lastRev.current = userRev;
    if (!code) return;
    pending.current = true;
    const id = window.setTimeout(() => {
      upload(code, stateRef.current)
        .catch(() => undefined)
        .finally(() => (pending.current = false));
    }, UPLOAD_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [userRev, code]);

  // 다른 기기가 올린 것 받기
  useEffect(() => {
    if (!code) return;
    let stop = false;
    const pull = async () => {
      if (pending.current || document.hidden) return;
      try {
        const r = await getJson<{ rev: number; state?: string }>(`/g/${code}/state?since=${getRev()}`);
        if (stop || pending.current) return;
        if (r.state) {
          replace(await decodeState(r.state), { remote: true });
          saved(r.rev);
        } else if (r.rev < getRev()) {
          // 서버가 비었다 (새로 배포 등). 이 기기 것을 다시 올린다
          await upload(code, stateRef.current);
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
  }, [code, replace]);

  return null;
}
