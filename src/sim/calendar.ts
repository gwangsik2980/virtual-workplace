/**
 * 영업일 달력: 주말과 대한민국 공휴일을 쉰다.
 *
 * 공휴일 목록은 웹 검색 결과로 정리했다 (2026-11-03 확인, docs/ASSUMPTIONS.md에 출처).
 * 2028~2030년은 검색 결과와 음력 변환 계산을 맞춰 보고 대체공휴일 규정을 적용해 정했다.
 * 출처마다 엇갈린 날짜는 아래 주석에 "확인 필요"로 표시했다.
 * 목록이 끝난 해부터는 양력 고정 공휴일만 쉰다 (FIXED_SOLAR).
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
  '2027-02-09', // 설날 대체공휴일 (설 당일이 일요일이라 연휴 다음 날 하루)
  '2027-03-01',
  '2027-05-05',
  '2027-05-13', // 부처님오신날, 음력 4월 8일 (음력 변환으로 확인)
  '2027-08-16', // 광복절 대체
  '2027-09-14', '2027-09-15', '2027-09-16', // 추석 연휴
  '2027-10-04', // 개천절 대체
  '2027-10-11', // 한글날 대체
  '2027-12-27', // 성탄절 대체 (12/25 토, 2023년부터 성탄절도 대체 대상. 확인 필요)
  // 2028년
  '2028-01-01', // 토요일이지만 신정은 대체공휴일이 없다
  '2028-01-26', '2028-01-27', '2028-01-28', // 설날 연휴 (수~금)
  '2028-03-01',
  '2028-04-12', // 제23대 국회의원 선거일 (임기만료일 전 50일 이후 첫 수요일로 계산, 확인 필요)
  '2028-05-02', // 부처님오신날
  '2028-05-05',
  '2028-06-06',
  '2028-08-15',
  '2028-10-02', '2028-10-03', '2028-10-04', // 추석 연휴 (추석 당일이 개천절과 겹침)
  '2028-10-05', // 추석 대체공휴일 (개천절과 겹친 하루)
  '2028-10-09',
  '2028-12-25',
  // 2029년
  '2029-01-01',
  '2029-02-12', '2029-02-13', '2029-02-14', // 설날 연휴 (월~수)
  '2029-03-01',
  '2029-05-05', '2029-05-07', // 어린이날, 토요일이라 월요일 대체
  '2029-05-20', '2029-05-21', // 부처님오신날, 일요일이라 월요일 대체
  '2029-06-06',
  '2029-08-15',
  '2029-09-21', '2029-09-22', '2029-09-23', // 추석 연휴 (금~일)
  '2029-09-24', // 추석 대체공휴일 (연휴가 일요일과 겹침)
  '2029-10-03',
  '2029-10-09',
  '2029-12-25',
  // 2030년 (검색으로 확인 못 함. 음력 변환과 규정으로 계산한 추정)
  '2030-01-01',
  '2030-02-02', '2030-02-03', '2030-02-04', // 설날 연휴 (토~월)
  '2030-02-05', // 설날 대체공휴일 (연휴가 일요일과 겹침)
  '2030-03-01',
  '2030-03-27', // 제22대 대통령 선거일 (임기만료일 전 70일 이후 첫 수요일로 계산, 확인 필요)
  '2030-05-05', '2030-05-06', // 어린이날, 일요일이라 월요일 대체
  '2030-05-09', // 부처님오신날
  '2030-06-05', // 지방선거일 (확인 필요)
  '2030-06-06',
  '2030-08-15',
  '2030-09-11', '2030-09-12', '2030-09-13', // 추석 연휴 (수~금)
  '2030-10-03',
  '2030-10-09',
  '2030-12-25',
  // 노동절(5/1)과 제헌절(7/17)은 공휴일 지정 여부가 출처마다 달라 넣지 않았다.
]);

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 목록에 들어 있는 마지막 해. 그 다음 해부터는 양력 고정 공휴일만 쉰다 */
const LAST_LISTED_YEAR = 2030;
/** 해마다 날짜가 같은 공휴일 (MM-DD). 음력 공휴일과 대체공휴일은 해마다 달라 넣지 않는다 */
const FIXED_SOLAR = new Set(['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25']);

export function isHoliday(d: Date): boolean {
  const iso = toISO(d);
  if (d.getFullYear() > LAST_LISTED_YEAR) return FIXED_SOLAR.has(iso.slice(5));
  return HOLIDAYS.has(iso);
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
