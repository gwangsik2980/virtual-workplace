import { isBusinessDay } from './calendar';
import type { DeptId, EventLog, EventType, GameState, Message } from './types';

/** 영업일 기준 날짜. 1일차 = startDate, 주말과 공휴일은 건너뛴다. 자주 불려서 결과를 기억해 둔다 */
const dateCache = new Map<string, Date[]>();
export function dayToDate(startDate: string, day: number): Date {
  let list = dateCache.get(startDate);
  if (!list) {
    list = [new Date(startDate + 'T00:00:00')];
    dateCache.set(startDate, list);
  }
  while (list.length < day) {
    const d = new Date(list[list.length - 1]);
    do d.setDate(d.getDate() + 1);
    while (!isBusinessDay(d));
    list.push(d);
  }
  return new Date(list[Math.max(0, day - 1)]);
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDay(startDate: string, day: number): string {
  const d = dayToDate(startDate, day);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}(${WEEKDAYS[d.getDay()]})`;
}

export function formatDayShort(startDate: string, day: number): string {
  const d = dayToDate(startDate, day);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 해당 날짜가 월의 마지막 영업일인지 */
export function isMonthEnd(startDate: string, day: number): boolean {
  const today = dayToDate(startDate, day);
  const next = dayToDate(startDate, day + 1);
  return today.getMonth() !== next.getMonth();
}

export function isMonthStart(startDate: string, day: number): boolean {
  if (day === 1) return true;
  return dayToDate(startDate, day - 1).getMonth() !== dayToDate(startDate, day).getMonth();
}

export function nextId(state: GameState, prefix: string): string {
  const n = (state.counters[prefix] ?? 0) + 1;
  state.counters[prefix] = n;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function logEvent(
  state: GameState,
  type: EventType,
  dept: DeptId,
  title: string,
  detail: string,
  caseId?: string,
): EventLog {
  const e: EventLog = { id: nextId(state, 'EV'), day: state.day, minute: state.nowMinute ?? 0, type, dept, title, detail, caseId };
  state.events.push(e);
  return e;
}

export function sendMessage(state: GameState, msg: Omit<Message, 'id' | 'day'>): Message {
  const m: Message = { id: nextId(state, 'MSG'), day: state.day, ...msg };
  state.messages.push(m);
  return m;
}

export const DEPT_NAMES: Record<DeptId, string> = {
  mgmt: '경영지원',
  production: '생산',
  purchasing: '구매',
  logistics: '물류',
  sales: '영업',
  quality: '품질',
};

export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function wonShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}`;
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round(v: number, step = 1): number {
  return Math.round(v / step) * step;
}
