import { salaryRecord, setSalary, SALARY_BY_RANK } from './payroll';
import type { GameState, SkillId } from './types';
import { dayToDate, logEvent } from './util';

/**
 * 직급. 승진은 매년 1월 첫 영업일 정기 심사에서만 한다.
 * years: 바로 아래 직급에서 채워야 하는 연수, xp: 심사 때 필요한 누적 경험치(업무 실적)
 */
export const RANKS: { name: string; xp: number; years: number }[] = [
  { name: '사원', xp: 0, years: 0 },
  { name: '주임', xp: 900, years: 2 },
  { name: '대리', xp: 2600, years: 2 },
  { name: '과장', xp: 6000, years: 4 },
];

/** 정기 연봉 인상률 (가정치) */
export const ANNUAL_RAISE = 0.03;

/** 오늘이 정기 심사일(1월 첫 영업일)인지 */
export function isReviewDay(startDate: string, day: number): boolean {
  const d = dayToDate(startDate, day);
  if (d.getMonth() !== 0) return false;
  return day === 1 ? d.getDate() <= 7 : dayToDate(startDate, day - 1).getMonth() !== 0;
}

/** 다음 정기 심사일 (영업일 번호) */
export function nextReviewDay(startDate: string, fromDay: number): number {
  for (let d = fromDay; d < fromDay + 300; d++) if (isReviewDay(startDate, d)) return d;
  return fromDay;
}

/** 그 날짜에 지금 직급에서 몇 년을 채웠는지 (달력 기준) */
export function yearsInRank(state: GameState, day: number): number {
  const since = dayToDate(state.startDate, state.employee.rankSinceDay ?? state.employee.joinedDay);
  const now = dayToDate(state.startDate, day);
  return (now.getTime() - since.getTime()) / (365.25 * 86_400_000);
}

/** 다음 직급 승진 조건과 충족 여부 */
export function promotionStatus(state: GameState, day = state.day) {
  const e = state.employee;
  const idx = RANKS.findIndex((r) => r.name === e.rank);
  const next = RANKS[idx + 1];
  if (!next) return null;
  const years = yearsInRank(state, day);
  return { next, years, yearsOk: years >= next.years - 0.01, xpOk: e.xp >= next.xp };
}

/**
 * 정기 심사: 연차와 실적을 채웠으면 승진, 아니어도 근속 1년이 넘었으면 연봉을 올린다.
 * advanceDay에서 급여 계산보다 먼저 실행한다.
 */
export function annualReview(state: GameState): void {
  if (!isReviewDay(state.startDate, state.day)) return;
  const e = state.employee;
  const joined = dayToDate(state.startDate, e.joinedDay);
  const today = dayToDate(state.startDate, state.day);
  const tenure = (today.getTime() - joined.getTime()) / (365.25 * 86_400_000);
  const current = salaryRecord(state, today).annual;
  const st = promotionStatus(state);

  if (st && st.yearsOk && st.xpOk) {
    e.rank = st.next.name;
    e.rankSinceDay = state.day;
    const annual = Math.max(SALARY_BY_RANK[st.next.name], Math.round((current * (1 + ANNUAL_RAISE)) / 100_000) * 100_000);
    setSalary(state, today, annual);
    e.milestones.push({ day: state.day, text: `${st.next.name}(으)로 승진, 연봉 ${Math.round(annual / 10_000).toLocaleString('ko-KR')}만원` });
    logEvent(state, 'career', 'purchasing', `${e.name} ${st.next.name} 승진`, `정기 심사에서 ${st.next.name}(으)로 승진했습니다. 연봉은 ${Math.round(annual / 10_000).toLocaleString('ko-KR')}만원입니다.`);
    return;
  }
  if (tenure >= 1 - 0.01) {
    const annual = Math.round((current * (1 + ANNUAL_RAISE)) / 100_000) * 100_000;
    setSalary(state, today, annual);
    e.milestones.push({ day: state.day, text: `정기 연봉 조정, ${Math.round(annual / 10_000).toLocaleString('ko-KR')}만원` });
    logEvent(state, 'career', 'purchasing', `${e.name} 연봉 조정`, `정기 심사에서 연봉이 ${Math.round(annual / 10_000).toLocaleString('ko-KR')}만원으로 올랐습니다.`);
  }
}

/** 업무 수행으로 경험치와 숙련도가 오른다. 숙련도가 높을수록 성장 폭은 줄어든다. */
export function gainExperience(state: GameState, skill: SkillId, minutes: number): void {
  const e = state.employee;
  e.xp += minutes / 10;
  const before = e.skills[skill];
  const gain = 0.22 * (1 - before / 100) * Math.min(1, minutes / 30);
  e.skills[skill] = Math.min(100, before + gain);

  const crossed = [20, 30, 40, 50, 60, 70, 80].find((t) => before < t && e.skills[skill] >= t);
  if (crossed && crossed >= 40) {
    const names: Record<SkillId, string> = { market: '시장조사', costing: '원가분석', negotiation: '협상', docs: '문서·데이터 처리' };
    e.milestones.push({ day: state.day, text: `${names[skill]} 숙련도 ${crossed} 달성` });
  }
}

/** 연차 조건을 채우는 가장 빠른 정기 심사일. 최고 직급이면 null */
export function earliestPromotionDay(state: GameState): number | null {
  const st = promotionStatus(state);
  if (!st) return null;
  let d = nextReviewDay(state.startDate, state.day);
  for (let i = 0; i < 12; i++) {
    if (yearsInRank(state, d) >= st.next.years - 0.01) return d;
    d = nextReviewDay(state.startDate, d + 1);
  }
  return null;
}
