/**
 * 영업일 달력: 주말과 대한민국 공휴일을 쉰다.
 *
 * 공휴일 목록은 웹 검색 결과로 정리했다 (2026-11-03 확인, docs/ASSUMPTIONS.md에 출처).
 * 출처마다 엇갈린 날짜는 아래 주석에 "확인 필요"로 표시했다. 2028년 이후는 아직 넣지 않았다.
 */

const HOLIDAYS = new Set<string>([
  // 2026년
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', // 설날 연휴
  '2026-03-02', // 삼일절 대체
  '2026-05-05',
  '2026-05-25', // 부처님오신날 대체
  '2026-06-03', // 지방선거 임시공휴일
  '2026-08-17', // 광복절 대체
  '2026-09-24', '2026-09-25', '2026-09-26', // 추석 연휴
  '2026-10-05', // 개천절 대체
  '2026-10-09',
  '2026-12-25',
  // 2027년
  '2027-01-01',
  '2027-02-08', // 설날 연휴 (2/6 토, 2/7 일, 2/8 월)
  '2027-02-09', // 설날 대체공휴일 (확인 필요: 출처마다 설 연휴 휴일 수가 다름)
  '2027-03-01',
  '2027-05-05',
  '2027-05-13', // 부처님오신날, 음력 4월 8일로 계산 (확인 필요: 검색에서 확인 못 함)
  '2027-08-16', // 광복절 대체
  '2027-09-14', '2027-09-15', '2027-09-16', // 추석 연휴
  '2027-10-04', // 개천절 대체
  '2027-10-11', // 한글날 대체
  '2027-12-27', // 성탄절 대체 (확인 필요)
  // 노동절(5/1)과 제헌절(7/17)은 공휴일 지정 여부가 출처마다 달라 넣지 않았다.
]);

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isHoliday(d: Date): boolean {
  return HOLIDAYS.has(toISO(d));
}

export function isBusinessDay(d: Date): boolean {
  const wd = d.getDay();
  return wd !== 0 && wd !== 6 && !isHoliday(d);
}

/** 오늘(또는 주어진 날)이 영업일이 아니면 다음 영업일 */
export function nextBusinessDayISO(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  return toISO(d);
}

/** 근무 시간 (분, 자정 기준) */
export const WORK_START_MIN = 9 * 60;
export const WORK_END_MIN = 18 * 60;
/** 점심시간: 09:00 기준 180분(12:00)부터 60분 */
export const LUNCH_START = 180;
export const LUNCH_MINUTES = 60;

/**
 * 실시간 모드에서 지금까지 시뮬레이션이 끝나 있어야 하는 마지막 날(일차).
 * 영업일 09:00이 되면 그날 업무가 시작되므로 그날까지 계산해 둔다.
 * 09:00 전이거나 휴일이면 직전 영업일까지.
 */
export function realtimeTargetDay(startDate: string, now: Date): number {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < start) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= today) {
    if (isBusinessDay(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (isBusinessDay(today) && minutes < WORK_START_MIN) count--;
  return Math.max(0, count);
}

/** 지금 근무 시간 중이라면 09:00부터 지난 분, 아니면 null */
export function minutesIntoWorkday(now: Date): number | null {
  if (!isBusinessDay(now)) return null;
  const m = now.getHours() * 60 + now.getMinutes() - WORK_START_MIN;
  return m >= 0 && m < WORK_END_MIN - WORK_START_MIN ? m : null;
}
