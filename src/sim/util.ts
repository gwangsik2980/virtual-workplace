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

/** 자동으로 나가는 메일. 인사말 대신 발신 전용 안내를 붙인다 */
const AUTO_SENDERS = new Set(['시장정보 뉴스레터', '납기 위험 알림 도구']);

/**
 * 업무 메일 형식으로 감싼다: "안녕하세요, ○○입니다." / 본문 / "감사합니다. ○○ 드림".
 * 호출하는 쪽은 용건만 정중하게 쓰면 된다.
 */
export function formalMailBody(state: GameState, from: string, body: string): string {
  if (AUTO_SENDERS.has(from)) return `${body}\n\n※ 본 메일은 발신 전용입니다. 문의는 담당 부서로 부탁드립니다.`;
  const who = from === state.employee.name ? `${state.company.name} 구매팀 ${from}` : from;
  return `안녕하세요,\n${who}입니다.\n\n${body}\n\n감사합니다.\n${who} 드림`;
}

export function sendMessage(state: GameState, msg: Omit<Message, 'id' | 'day'>): Message {
  const m: Message = { id: nextId(state, 'MSG'), day: state.day, minute: state.nowMinute ?? 0, ...msg, body: formalMailBody(state, msg.from, msg.body) };
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

/**
 * 매출원가 밖의 손실·비용을 기록한다 (반품 처리비, 폐기 손실, 클레임 회수액은 음수).
 * cash=false면 이미 돈이 나간 재고를 장부에서 덜어내는 경우라 현금은 그대로 둔다.
 */
export function chargeExpense(state: GameState, amount: number, cash = true): void {
  const a = Math.round(amount);
  state.finance.otherExpenseCum = (state.finance.otherExpenseCum ?? 0) + a;
  if (cash) state.finance.cash -= a;
}

/** 선택적 누계 통계를 더한다 (예전 저장 파일에는 필드가 없을 수 있다) */
export function addStat(state: GameState, key: keyof GameState['stats'], amount: number): void {
  const s = state.stats as unknown as Record<string, number>;
  s[key] = (s[key] ?? 0) + amount;
}
