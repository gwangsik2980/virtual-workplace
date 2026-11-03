import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventLog, GameState } from '../sim/types';
import { formatDay } from '../sim/util';
import { clock } from './components/Common';
import { useRealtime } from './realtime';
import { useStore } from './store';

/**
 * 알림: 결품, 긴급 요청, 납기 지연, 품질 이슈, 정산 불일치, 납기 위험 알림.
 * 사이트가 열려 있는 동안 브라우저 알림으로도 보낸다 (권한을 허용했을 때).
 * 읽음·알림 보낸 위치와 설정은 이 브라우저에만 저장한다.
 */

export type AlertKind = 'stockout' | 'urgent' | 'delay' | 'quality' | 'finance' | 'risk';

export const ALERT_LABELS: Record<AlertKind, string> = {
  stockout: '결품',
  urgent: '긴급 요청',
  delay: '납기 지연',
  quality: '품질',
  finance: '정산 불일치',
  risk: '납기 위험 알림',
};

export function alertKind(e: EventLog): AlertKind | null {
  if (e.type === 'stockout') return 'stockout';
  if (e.type === 'request' && e.title.startsWith('[긴급]')) return 'urgent';
  if (e.type === 'delay' && !/만회|독촉 결과/.test(e.title)) return 'delay';
  if (e.type === 'quality') return 'quality';
  if (e.type === 'finance' && e.title.startsWith('정산 불일치')) return 'finance';
  if (e.type === 'tool' && e.title.startsWith('납기 위험 알림')) return 'risk';
  return null;
}

const num = (id: string) => Number(id.split('-')[1] ?? 0);
const keyOf = (state: GameState, name: string) => `virtual-workplace/alerts/${name}/${state.seed}/${state.startDate}`;
const PREF_KEY = 'virtual-workplace/alerts/prefs';

function readNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeNum(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* 무시 */
  }
}

export interface AlertItem {
  e: EventLog;
  kind: AlertKind;
  unread: boolean;
  when: string;
}

async function showBrowserNotification(title: string, body: string, tag: string) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const opts = { body, tag, icon: `${import.meta.env.BASE_URL}icon.svg`, badge: `${import.meta.env.BASE_URL}icon.svg` };
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* 지원하지 않는 브라우저 */
  }
}

export function useAlerts() {
  const { state } = useStore();
  const rt = useRealtime();
  const [prefs, setPrefsRaw] = useState<Record<AlertKind, boolean>>(() => {
    const all = { stockout: true, urgent: true, delay: true, quality: true, finance: true, risk: true };
    try {
      return { ...all, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
    } catch {
      return all;
    }
  });
  const [seen, setSeen] = useState(() => readNum(keyOf(state, 'seen')));
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useEffect(() => setSeen(readNum(keyOf(state, 'seen'))), [state.seed, state.startDate]);

  const setPref = (k: AlertKind, v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefsRaw(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      /* 무시 */
    }
  };

  const items = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];
    for (let i = state.events.length - 1; i >= 0 && out.length < 60; i--) {
      const e = state.events[i];
      const kind = alertKind(e);
      if (!kind || !prefs[kind] || !rt.isReleased(e)) continue;
      out.push({ e, kind, unread: num(e.id) > seen, when: `${formatDay(state.startDate, e.day)} ${clock(e.minute ?? 0)}` });
    }
    return out;
  }, [state.events, state.startDate, prefs, rt, seen]);

  const unread = items.filter((i) => i.unread).length;

  const markAllRead = useCallback(() => {
    const max = state.events.reduce((m, e) => Math.max(m, num(e.id)), 0);
    writeNum(keyOf(state, 'seen'), max);
    setSeen(max);
  }, [state]);

  const markRead = useCallback(
    (e: EventLog) => {
      // 하나만 읽음 처리하기보다 그 사건까지를 읽은 것으로 본다 (단순화)
      const n = num(e.id);
      if (n > seen) {
        writeNum(keyOf(state, 'seen'), n);
        setSeen(n);
      }
    },
    [seen, state],
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === 'granted') void showBrowserNotification('알림이 켜졌어요', '사이트를 열어 둔 동안 결품, 긴급 요청 같은 일이 생기면 알려 드립니다.', 'vw-test');
  }, []);

  // 새로 일어난 사건을 브라우저 알림으로 보낸다
  useEffect(() => {
    if (permission !== 'granted') return;
    const key = keyOf(state, 'notified');
    const notified = readNum(key);
    const fresh = items.filter((i) => num(i.e.id) > notified).reverse();
    if (fresh.length === 0) return;
    const max = Math.max(...fresh.map((i) => num(i.e.id)));
    writeNum(key, max);
    // 처음 켰거나 오래 비웠다면 하나로 묶어서 보낸다
    if (notified === 0 && fresh.length > 1) return;
    if (fresh.length > 3) {
      void showBrowserNotification(`새 알림 ${fresh.length}건`, fresh.slice(-3).map((i) => `${ALERT_LABELS[i.kind]}: ${i.e.title}`).join('\n'), 'vw-batch');
      return;
    }
    for (const i of fresh) void showBrowserNotification(`[${ALERT_LABELS[i.kind]}] ${i.e.title}`, i.e.detail, i.e.id);
  }, [items, permission, state]);

  return { items, unread, prefs, setPref, markAllRead, markRead, permission, requestPermission };
}
