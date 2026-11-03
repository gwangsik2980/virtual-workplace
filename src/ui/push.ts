import { useEffect, useState } from 'react';
import type { AlertKind } from '../sim/alertKinds';
import { buildPushSchedule } from '../sim/pushSchedule';
import type { GameState } from '../sim/types';
import { useRealtime } from './realtime';
import { getJson, postJson, SERVER } from './server';
import { useStore } from './store';
import { createGroup, getSyncCode, isSyncReady, SYNC_CHANGE, useSyncInfo } from './sync';

/**
 * 닫아 둔 동안 오는 알림 (웹 푸시).
 * 사이트가 열려 있을 때 앞으로 6주치 알림을 계산해 서버(worker/)의 기기 그룹(연결 코드)에 맡긴다.
 * 서버는 시각이 되면 그룹의 구독 기기마다, 그 기기에서 켠 종류만 보낸다.
 * 켜져 있으면 열어 둔 동안의 팝업도 서버가 보내므로, 화면 쪽 팝업은 보내지 않는다(같은 알림 두 번 방지).
 */

/** 알림 서버 주소. 비어 있으면 이 기능을 숨긴다 (src/ui/server.ts) */
export const PUSH_SERVER = SERVER;

const ON_KEY = 'virtual-workplace/push/on';
const SENT_KEY = 'virtual-workplace/push/sent';
const PREFS_SENT_KEY = 'virtual-workplace/push/prefs-sent';
export const PREF_KEY = 'virtual-workplace/alerts/prefs';
const CHANGE = 'vw-push-change';

const ALL: Record<AlertKind, boolean> = { stockout: true, urgent: true, delay: true, quality: true, finance: true, risk: true, payroll: true };

export function readAlertPrefs(): Record<AlertKind, boolean> {
  try {
    return { ...ALL, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
  } catch {
    return ALL;
  }
}

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

/** 켜져 있다 = 이 기기가 지금 연결 코드의 그룹에 구독돼 있다 */
export const isPushOn = () => !!PUSH_SERVER && !!getSyncCode() && get(ON_KEY) === getSyncCode();
/** 알림 설정이나 켜짐 상태가 바뀌었다고 알린다 */
export const notifyPushChange = () => window.dispatchEvent(new Event(CHANGE));

export function pushAvailable(): boolean {
  return !!PUSH_SERVER && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

function keyBytes(b64: string): Uint8Array {
  const t = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** 이 기기의 구독과 받을 알림 종류를 그룹에 등록한다 (종류를 바꿀 때도 다시 보낸다) */
async function subscribe(code: string, sub: PushSubscription) {
  const prefs = readAlertPrefs();
  await postJson(`/g/${code}/subscribe`, { subscription: sub.toJSON(), prefs });
  set(PREFS_SENT_KEY, JSON.stringify(prefs));
}

/**
 * 닫아 둔 동안 알림 켜기. 연결 코드가 없으면 이 기기의 회사로 새로 만든다.
 * (알림은 그룹 단위로 보내서, 폰 하나만 써도 그룹이 필요하다)
 */
export async function enablePush(state: GameState): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한을 허용해야 켤 수 있어요.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await getJson<{ publicKey: string }>('/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const code = getSyncCode() ?? (await createGroup(state));
  await subscribe(code, sub);
  await postJson(`/g/${code}/test`, { subscription: sub.toJSON() });
  set(ON_KEY, code);
  set(SENT_KEY, null);
  notifyPushChange();
}

export async function disablePush(): Promise<void> {
  const code = get(ON_KEY);
  set(ON_KEY, null);
  set(SENT_KEY, null);
  set(PREFS_SENT_KEY, null);
  notifyPushChange();
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  if (code) await postJson(`/g/${code}/unsubscribe`, { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

export function usePushOn(): boolean {
  const [on, setOn] = useState(isPushOn);
  useEffect(() => {
    const f = () => setOn(isPushOn());
    window.addEventListener(CHANGE, f);
    window.addEventListener(SYNC_CHANGE, f);
    return () => {
      window.removeEventListener(CHANGE, f);
      window.removeEventListener(SYNC_CHANGE, f);
    };
  }, []);
  return on;
}

/** 하루에 한 번은 같은 예정표라도 다시 보낸다 (서버가 비었을 때 대비) */
const RESEND_MS = 24 * 3600_000;

/**
 * 회사 상태가 바뀌면 예정표를 다시 계산해서 그룹에 맡긴다.
 * 이 기기에서 알림을 안 켰어도 연결 코드가 있으면 올린다 (PC에서 도구를 적용해도 폰 예정표가 바뀌도록).
 * 알림 종류를 바꾸면 이 기기의 구독을 다시 보낸다.
 */
export function PushSync() {
  const { state } = useStore();
  const rt = useRealtime();
  const on = usePushOn();
  const { code, at } = useSyncInfo();
  const [prefsTick, setPrefsTick] = useState(0);
  useEffect(() => {
    const f = () => setPrefsTick((t) => t + 1);
    window.addEventListener(CHANGE, f);
    return () => window.removeEventListener(CHANGE, f);
  }, []);

  // 알림 종류가 바뀌었으면 구독을 다시 보낸다
  useEffect(() => {
    if (!on || !code) return;
    if (get(PREFS_SENT_KEY) === JSON.stringify(readAlertPrefs())) return;
    void currentSubscription()
      .then((sub) => sub && subscribe(code, sub))
      .catch(() => undefined);
  }, [on, code, prefsTick]);

  const caughtUp = state.day - 1 >= rt.target;
  const ready = !!code && isSyncReady();
  useEffect(() => {
    if (!code || !ready || !rt.isRealtime || !caughtUp) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const items = buildPushSchedule(state, new Date());
        const sig = JSON.stringify(items.map((i) => [i.at, i.title]));
        const prev = JSON.parse(get(SENT_KEY) ?? 'null') as { sig: string; t: number; code: string } | null;
        if (prev && prev.sig === sig && prev.code === code && Date.now() - prev.t < RESEND_MS) return;
        if (cancelled) return;
        await postJson(`/g/${code}/schedule`, { items });
        set(SENT_KEY, JSON.stringify({ sig, t: Date.now(), code }));
      } catch {
        /* 다음 변경 때 다시 시도한다 */
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // at: 서버와 맞춘 뒤(ready가 바뀐 뒤) 다시 계산하도록
  }, [code, ready, at, state, rt.isRealtime, caughtUp]);

  return null;
}
