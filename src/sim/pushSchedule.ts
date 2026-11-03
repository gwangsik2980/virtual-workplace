/**
 * 사이트를 닫아 두어도 알림이 오도록, 열려 있는 동안 앞으로 올 알림을 미리 계산한다.
 *
 * 회사는 시드와 지금 상태만으로 다음 날이 정해진다(재현성 원칙). 그래서 지금 상태를 복사해
 * 앞으로 며칠을 돌려 보면, 사이트를 다시 열었을 때 따라잡기로 나올 사건과 똑같은 사건이 나온다.
 * 그 사건들의 현실 시각을 예정표로 만들어 알림 서버(worker/)에 맡긴다.
 * 도구를 적용하거나 설정을 바꾸면 사이트가 열려 있는 중이니 예정표를 다시 계산해 덮어쓴다.
 */
import { ALERT_LABELS, alertKind, type AlertKind } from './alertKinds';
import { realtimeTargetDay } from './calendar';
import { advanceDays } from './engine';
import type { EventLog, GameState } from './types';
import { dayToDate } from './util';

/** 미리 계산할 영업일 수 (약 6주). 이 기간 안에 사이트를 한 번도 안 열면 알림이 멈춘다 */
export const PUSH_HORIZON_DAYS = 30;

export interface PushItem {
  /** 보낼 시각 (epoch ms) */
  at: number;
  title: string;
  body: string;
  tag: string;
}

/** 사건이 현실에서 일어나는 시각: 그날 09:00 + 사건의 분 (사이트의 isReleased와 같은 기준) */
export function eventTime(startDate: string, e: EventLog): number {
  const d = dayToDate(startDate, e.day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime() + (e.minute ?? 0) * 60_000;
}

export function buildPushSchedule(
  state: GameState,
  now: Date,
  prefs: Record<AlertKind, boolean>,
  horizon = PUSH_HORIZON_DAYS,
): PushItem[] {
  const target = realtimeTargetDay(state.startDate, now);
  const lastDay = target + horizon;
  const sim = structuredClone(state);
  const n = lastDay - (sim.day - 1);
  if (n > 0) advanceDays(sim, n);

  const nowMs = now.getTime();
  const byAt = new Map<number, { e: EventLog; kind: AlertKind }[]>();
  for (const e of sim.events) {
    if (e.day < target || e.day > lastDay) continue;
    const kind = alertKind(e);
    if (!kind || !prefs[kind]) continue;
    const at = eventTime(sim.startDate, e);
    if (at <= nowMs) continue;
    const list = byAt.get(at) ?? [];
    list.push({ e, kind });
    byAt.set(at, list);
  }

  const items: PushItem[] = [...byAt.entries()].map(([at, list]) =>
    list.length === 1
      ? { at, title: `[${ALERT_LABELS[list[0].kind]}] ${list[0].e.title}`, body: list[0].e.detail, tag: list[0].e.id }
      : {
          at,
          title: `새 알림 ${list.length}건`,
          body: list.slice(0, 3).map((x) => `${ALERT_LABELS[x.kind]}: ${x.e.title}`).join('\n'),
          tag: `vw-${at}`,
        },
  );

  // 예정표가 끝나는 날 퇴근 뒤에 한 번 알려 준다
  const end = dayToDate(sim.startDate, lastDay);
  const endAt = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 18, 10).getTime();
  if (endAt > nowMs) {
    items.push({
      at: endAt,
      title: '알림 예정표가 오늘로 끝나요',
      body: '사이트를 한 번 열면 다음 6주치 알림이 이어집니다.',
      tag: 'vw-horizon',
    });
  }
  return items.sort((a, b) => a.at - b.at);
}
