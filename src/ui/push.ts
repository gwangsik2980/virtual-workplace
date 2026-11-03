import { useEffect, useState } from 'react';
import type { AlertKind } from '../sim/alertKinds';
import { buildPushSchedule } from '../sim/pushSchedule';
import { useRealtime } from './realtime';
import { useStore } from './store';

/**
 * 닫아 둔 동안 오는 알림 (웹 푸시).
 * 사이트가 열려 있을 때 앞으로 6주치 알림을 계산해 알림 서버(worker/)에 맡긴다.
 * 켜져 있으면 열어 둔 동안의 팝업도 서버가 보내므로, 화면 쪽 팝업은 보내지 않는다(같은 알림 두 번 방지).
 */

/** 알림 서버 주소. 비어 있으면 이 기능을 숨긴다 */
export const PUSH_SERVER = '';

const ON_KEY = 'virtual-workplace/push/on';
const SENT_KEY = 'virtual-workplace/push/sent';
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

export const isPushOn = () => !!PUSH_SERVER && get(ON_KEY) === '1';
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

async function post(path: string, body: unknown) {
  const r = await fetch(PUSH_SERVER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한을 허용해야 켤 수 있어요.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = (await (await fetch(PUSH_SERVER + '/key')).json()) as { publicKey: string };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await post('/test', { subscription: sub.toJSON() });
  set(ON_KEY, '1');
  set(SENT_KEY, null);
  notifyPushChange();
}

export async function disablePush(): Promise<void> {
  set(ON_KEY, null);
  set(SENT_KEY, null);
  notifyPushChange();
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await post('/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

export function usePushOn(): boolean {
  const [on, setOn] = useState(isPushOn);
  useEffect(() => {
    const f = () => setOn(isPushOn());
    window.addEventListener(CHANGE, f);
    return () => window.removeEventListener(CHANGE, f);
  }, []);
  return on;
}

/** 하루에 한 번은 같은 예정표라도 다시 보낸다 (서버가 비었을 때 대비) */
const RESEND_MS = 24 * 3600_000;

/** 회사 상태나 알림 설정이 바뀌면 예정표를 다시 계산해서 서버에 맡긴다 */
export function PushSync() {
  const { state } = useStore();
  const rt = useRealtime();
  const on = usePushOn();
  const [prefsTick, setPrefsTick] = useState(0);
  useEffect(() => {
    const f = () => setPrefsTick((t) => t + 1);
    window.addEventListener(CHANGE, f);
    return () => window.removeEventListener(CHANGE, f);
  }, []);

  const caughtUp = state.day - 1 >= rt.target;
  useEffect(() => {
    if (!on || !rt.isRealtime || !caughtUp) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const sub = await currentSubscription();
        if (!sub || cancelled) return;
        const items = buildPushSchedule(state, new Date(), readAlertPrefs());
        const sig = JSON.stringify(items.map((i) => [i.at, i.title]));
        const prev = JSON.parse(get(SENT_KEY) ?? 'null') as { sig: string; t: number; endpoint: string } | null;
        if (prev && prev.sig === sig && prev.endpoint === sub.endpoint && Date.now() - prev.t < RESEND_MS) return;
        await post('/schedule', { subscription: sub.toJSON(), items });
        set(SENT_KEY, JSON.stringify({ sig, t: Date.now(), endpoint: sub.endpoint }));
      } catch {
        /* 다음 변경 때 다시 시도한다 */
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [on, state, rt.isRealtime, caughtUp, prefsTick]);

  return null;
}
