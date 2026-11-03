import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isBusinessDay, minutesIntoWorkday, realtimeTargetDay, WORK_END_MIN, WORK_START_MIN } from '../sim/calendar';
import type { EventLog, GameState, PurchaseCase, Stage } from '../sim/types';
import { useStore } from './store';

/**
 * 현실 시간과 함께 흐르는 회사.
 * - 영업일 09:00이 되면 그날 업무를 계산한다 (하루치 일정이 한 번에 정해지고, 화면은 현실 시각에 맞춰 보여 준다).
 * - 사이트를 닫아 둔 동안 지난 영업일은 다시 열 때 한꺼번에 따라잡는다.
 * - 사건은 그날 몇 분째에 일어났는지(minute)를 갖고 있어서, 현실 시각이 그 시각을 지나야 알림으로 나간다.
 */

export type WorkPhase = 'before' | 'working' | 'after' | 'holiday' | 'manual' | 'ahead';

interface RealtimeInfo {
  isRealtime: boolean;
  now: Date;
  /** 지금까지 계산이 끝나 있어야 하는 마지막 날 */
  target: number;
  /** 버튼으로 현실보다 앞서 진행한 영업일 수 */
  aheadDays: number;
  /** 근무 중이면 09:00부터 지난 분 */
  liveMinute: number | null;
  phase: WorkPhase;
  /** 이 사건이 현실 시각 기준으로 이미 일어났는지 */
  isReleased(e: EventLog): boolean;
  away: { fromDay: number; toDay: number } | null;
  dismissAway(): void;
}

const Ctx = createContext<RealtimeInfo | null>(null);

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    const onVis = () => !document.hidden && setNow(new Date());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms]);
  return now;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { state, advance, checkpoint } = useStore();
  const now = useNow(15000);
  const isRealtime = state.clock?.mode === 'realtime';
  const target = isRealtime ? realtimeTargetDay(state.startDate, now) : state.day - 1;
  const simulatedThrough = state.day - 1;
  const [away, setAway] = useState<{ fromDay: number; toDay: number } | null>(null);
  // 같은 상태에서 두 번 따라잡지 않게 기억한다 (개발 모드의 이중 실행 대비).
  // 값(시드·날짜)이 아니라 상태 객체로 구분한다. 처음부터 다시 시작하거나 다른 기기 저장본을 받으면
  // 시드와 날짜가 예전과 같아도 새 객체라서 다시 따라잡아야 한다.
  const syncedFrom = useRef<GameState | null>(null);

  // 밀린 영업일 따라잡기
  useEffect(() => {
    if (!isRealtime) return;
    const n = target - simulatedThrough;
    if (n <= 0 || syncedFrom.current === state) return;
    syncedFrom.current = state;
    const fromDay = state.day;
    if (n >= 2) checkpoint('자리를 비운 동안');
    advance(n, { record: false });
    if (n >= 2) setAway({ fromDay, toDay: target });
  }, [isRealtime, target, simulatedThrough, state, advance, checkpoint]);

  const value = useMemo<RealtimeInfo>(() => {
    const aheadDays = isRealtime ? Math.max(0, simulatedThrough - target) : 0;
    const mins = now.getHours() * 60 + now.getMinutes();
    let phase: WorkPhase = 'manual';
    if (isRealtime) {
      if (aheadDays > 0) phase = 'ahead';
      else if (!isBusinessDay(now)) phase = 'holiday';
      else if (mins < WORK_START_MIN) phase = 'before';
      else if (mins >= WORK_END_MIN) phase = 'after';
      else phase = 'working';
    }
    const liveMinute = phase === 'working' ? minutesIntoWorkday(now) : null;
    const releasedUpTo = phase === 'working' ? (liveMinute ?? 0) : Infinity;
    return {
      isRealtime,
      now,
      target,
      aheadDays,
      liveMinute,
      phase,
      isReleased: (e) => !isRealtime || phase !== 'working' || e.day < target || (e.minute ?? 0) <= releasedUpTo,
      away,
      dismissAway: () => setAway(null),
    };
  }, [isRealtime, now, target, simulatedThrough, away]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime(): RealtimeInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error('RealtimeProvider가 필요합니다');
  return v;
}

/** 지금 이 시각에 담당자가 하고 있는 업무 (실시간 근무 중일 때만) */
export function currentBlock(state: GameState, rt: RealtimeInfo) {
  if (rt.liveMinute === null) return null;
  return state.schedule.find((b) => b.day === rt.target && b.start <= rt.liveMinute! && rt.liveMinute! < b.start + b.minutes) ?? null;
}

/**
 * 실시간 근무 중 '지금 시각' 기준의 구매 단계.
 * 하루치 업무는 09:00에 한꺼번에 계산되어 구매 건 상태는 그날 저녁 기준이므로,
 * 오늘 일정 블록에 남긴 단계로 지금 시점의 단계를 거꾸로 찾는다.
 */
export function stageAtNow(state: GameState, c: PurchaseCase, rt: { target: number; liveMinute: number | null }): Stage {
  if (rt.liveMinute === null) return c.stage;
  const now = rt.liveMinute;
  const today = state.schedule.filter((b) => b.day === rt.target && b.caseId === c.id && b.stage).sort((a, b) => a.start - b.start);
  if (today.length === 0) return c.stage;
  const started = today.filter((b) => b.start <= now);
  if (started.length === 0) return today[0].stage!;
  const last = started[started.length - 1];
  if (now < last.start + last.minutes) return last.stage!;
  const upcoming = today.find((b) => b.start > now);
  return upcoming ? upcoming.stage! : c.stage;
}
