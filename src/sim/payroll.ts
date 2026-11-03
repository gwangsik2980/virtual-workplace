import type { GameState, Payslip, PayLine } from './types';
import { dayToDate, logEvent, nextId, sendMessage } from './util';

/**
 * GWANG 급여.
 * - 매달 10일: 전월분 월급 (기본급 + 식대). 4대보험과 소득세를 떼고 통장에 들어간다.
 * - 매달 25일: 전월 연장근로수당 + 월 성과급.
 * - 지급일이 주말·공휴일이면 직전 영업일에 준다.
 * 회사 손익에서는 고정비(fixedCostPerDay) 안에 이미 인건비가 들어 있으므로 따로 빼지 않는다.
 * 요율과 근거 수준은 docs/ASSUMPTIONS.md 참고.
 */

/**
 * 직급별 승진 시 최소 연봉 (가정치).
 * 사원 4,200만원은 대기업 식품·식자재 계열 대졸 신입 수준(4천만원 초중반이라는 공개 후기)을 기준으로 잡았다.
 * 위 직급은 승진할 때마다 10~15% 오르도록 정했다. 근거는 docs/ASSUMPTIONS.md
 */
export const SALARY_BY_RANK: Record<string, number> = {
  사원: 42_000_000,
  주임: 46_000_000,
  대리: 52_000_000,
  과장: 60_000_000,
};

/** 2026년 근로자 부담 요율 */
export const RATES = {
  pension: 0.0475, // 국민연금 9.5%의 절반
  health: 0.03595, // 건강보험 7.19%의 절반
  longTermCare: 0.1314, // 장기요양 = 건강보험료 × 13.14%
  employment: 0.009, // 고용보험 실업급여분
  localTax: 0.1, // 지방소득세 = 소득세 × 10%
};

/** 식대 비과세 한도 (월) */
export const MEAL_ALLOWANCE = 200_000;
/** 월 소정근로시간 (주 40시간 + 주휴) */
export const MONTHLY_HOURS = 209;
/** 연장근로 가산 */
export const OVERTIME_RATE = 1.5;
/** 월 성과급: 전월 가격 절감액의 5%, 상한 30만원 (가정치) */
export const BONUS_RATE = 0.05;
export const BONUS_CAP = 300_000;

export const PAYDAY_SALARY = 10;
export const PAYDAY_EXTRA = 25;

const floor10 = (n: number) => Math.floor(n / 10) * 10;

/** 근로소득공제 (소득세법 제47조) */
function earnedIncomeDeduction(gross: number): number {
  let d: number;
  if (gross <= 5_000_000) d = gross * 0.7;
  else if (gross <= 15_000_000) d = 3_500_000 + (gross - 5_000_000) * 0.4;
  else if (gross <= 45_000_000) d = 7_500_000 + (gross - 15_000_000) * 0.15;
  else if (gross <= 100_000_000) d = 12_000_000 + (gross - 45_000_000) * 0.05;
  else d = 14_750_000 + (gross - 100_000_000) * 0.02;
  return Math.min(d, 20_000_000);
}

/** 기본세율 (소득세법 제55조) */
function basicTax(base: number): number {
  const brackets: [number, number, number][] = [
    [14_000_000, 0.06, 0],
    [50_000_000, 0.15, 1_260_000],
    [88_000_000, 0.24, 5_760_000],
    [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000],
    [500_000_000, 0.4, 25_940_000],
    [1_000_000_000, 0.42, 35_940_000],
    [Infinity, 0.45, 65_940_000],
  ];
  const [, rate, minus] = brackets.find(([cap]) => base <= cap)!;
  return Math.max(0, base * rate - minus);
}

/** 근로소득세액공제 (소득세법 제59조) */
function earnedIncomeTaxCredit(tax: number, gross: number): number {
  const credit = tax <= 1_300_000 ? tax * 0.55 : 715_000 + (tax - 1_300_000) * 0.3;
  let cap: number;
  if (gross <= 33_000_000) cap = 740_000;
  else if (gross <= 70_000_000) cap = Math.max(660_000, 740_000 - (gross - 33_000_000) * 0.008);
  else if (gross <= 120_000_000) cap = Math.max(500_000, 660_000 - (gross - 70_000_000) * 0.5);
  else cap = Math.max(200_000, 500_000 - (gross - 120_000_000) * 0.5);
  return Math.min(credit, cap);
}

/**
 * 월 소득세 추정 (본인 1인, 부양가족 없음).
 * 월 과세급여를 1년치로 늘려 연말정산식으로 세금을 낸 뒤 12로 나눈다.
 * 실제 회사는 국세청 간이세액표를 쓰므로 몇천~몇만원 차이가 날 수 있다.
 */
export function monthlyIncomeTax(monthlyTaxable: number): number {
  const gross = monthlyTaxable * 12;
  if (gross <= 0) return 0;
  const insurance =
    gross * RATES.pension + gross * RATES.health * (1 + RATES.longTermCare) + gross * RATES.employment;
  const base = Math.max(0, gross - earnedIncomeDeduction(gross) - 1_500_000 - insurance);
  const tax = basicTax(base);
  const decided = Math.max(0, tax - earnedIncomeTaxCredit(tax, gross) - 130_000);
  return floor10(decided / 12);
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 오늘(day)이 그달 x일 급여일인지: x일 이하인 그달 마지막 영업일 */
export function isPaydayFor(startDate: string, day: number, x: number): boolean {
  const today = dayToDate(startDate, day);
  if (today.getDate() > x) return false;
  const next = dayToDate(startDate, day + 1);
  return next.getMonth() !== today.getMonth() || next.getDate() > x;
}

/** 다음 급여일까지 남은 영업일과 날짜 */
export function nextPayday(state: GameState, fromDay = state.day): { day: number; kind: 'salary' | 'extra' } {
  // 입사 전 달 몫을 주는 날은 건너뛴다 (입사 첫 달에는 받을 돈이 없다)
  const joined = dayToDate(state.startDate, state.employee.joinedDay);
  for (let d = fromDay; d < fromDay + 70; d++) {
    if (prevMonthOf(dayToDate(state.startDate, d)).end < joined) continue;
    if (isPaydayFor(state.startDate, d, PAYDAY_SALARY)) return { day: d, kind: 'salary' };
    if (isPaydayFor(state.startDate, d, PAYDAY_EXTRA)) return { day: d, kind: 'extra' };
  }
  return { day: fromDay, kind: 'salary' };
}

/** 그 날짜가 속한 달에 적용되는 연봉과 직급 */
export function salaryRecord(state: GameState, d: Date): { from: string; annual: number; rank: string } {
  const label = ym(d);
  const hist = state.payroll.salaryHistory;
  return [...hist].reverse().find((h) => h.from <= label) ?? hist[0];
}

/** 이 날짜가 속한 달부터 새 연봉 적용. 직급은 지금 직급으로 기록 */
export function setSalary(state: GameState, d: Date, annual: number): void {
  const from = ym(d);
  const hist = state.payroll.salaryHistory.filter((h) => h.from !== from);
  hist.push({ from, annual, rank: state.employee.rank });
  state.payroll.salaryHistory = hist.sort((a, b) => a.from.localeCompare(b.from));
}

function prevMonthOf(d: Date): { start: Date; end: Date; label: string } {
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end = new Date(d.getFullYear(), d.getMonth(), 0);
  return { start, end, label: ym(start) };
}

/** 일별 기록 중 그 달에 해당하는 날들 */
function daysInMonthRecords(state: GameState, label: string) {
  return state.history.filter((h) => ym(dayToDate(state.startDate, h.day)) === label);
}

function makeSlip(
  state: GameState,
  kind: Payslip['kind'],
  period: string,
  earnings: PayLine[],
  deductions: PayLine[],
  note: string | undefined,
  rank: string,
): Payslip {
  const gross = earnings.reduce((a, l) => a + l.amount, 0);
  const totalDeduction = deductions.reduce((a, l) => a + l.amount, 0);
  return {
    id: nextId(state, 'PAY'),
    day: state.day,
    kind,
    period,
    rank,
    earnings,
    deductions: deductions.filter((l) => l.amount > 0),
    gross,
    totalDeduction,
    net: gross - totalDeduction,
    note,
  };
}

/** 10일 월급 명세서 (전월분) */
export function salarySlip(state: GameState): Payslip | null {
  const today = dayToDate(state.startDate, state.day);
  const prev = prevMonthOf(today);
  const joined = dayToDate(state.startDate, state.employee.joinedDay);
  if (joined > prev.end) return null; // 전월에는 아직 입사 전

  const rec = salaryRecord(state, prev.start);
  const annual = rec.annual;
  const monthly = floor10(annual / 12);
  // 입사한 달은 일할 계산 (달력 일수 기준)
  const firstMonth = joined >= prev.start;
  const totalDays = prev.end.getDate();
  const ratio = firstMonth ? (totalDays - joined.getDate() + 1) / totalDays : 1;
  const meal = floor10(MEAL_ALLOWANCE * ratio);
  const base = floor10((monthly - MEAL_ALLOWANCE) * ratio);

  // 1일 입사가 아니면 입사한 달 국민연금·건강보험은 내지 않는다 (고용보험은 실제 보수에 부과)
  const skipMonthly = firstMonth && joined.getDate() !== 1;
  const pension = skipMonthly ? 0 : floor10(base * RATES.pension);
  const health = skipMonthly ? 0 : floor10(base * RATES.health);
  const care = skipMonthly ? 0 : floor10(health * RATES.longTermCare);
  const employment = floor10(base * RATES.employment);
  const incomeTax = monthlyIncomeTax(base);
  const localTax = floor10(incomeTax * RATES.localTax);

  const note = firstMonth
    ? `${joined.getMonth() + 1}월 ${joined.getDate()}일 입사로 ${totalDays}일 중 ${totalDays - joined.getDate() + 1}일분을 일할 계산했습니다.${skipMonthly ? ' 1일 입사가 아니어서 입사한 달 국민연금과 건강보험료는 없습니다.' : ''}`
    : undefined;

  return makeSlip(
    state,
    'salary',
    prev.label,
    [
      { label: '기본급', amount: base, taxable: true },
      { label: '식대', amount: meal, taxable: false },
    ],
    [
      { label: '국민연금', amount: pension },
      { label: '건강보험', amount: health },
      { label: '장기요양보험', amount: care },
      { label: '고용보험', amount: employment },
      { label: '소득세', amount: incomeTax },
      { label: '지방소득세', amount: localTax },
    ],
    note,
    rec.rank,
  );
}

/** 25일 추가 지급 명세서 (전월 연장근로 + 성과급) */
export function extraSlip(state: GameState): Payslip | null {
  const today = dayToDate(state.startDate, state.day);
  const prev = prevMonthOf(today);
  const records = daysInMonthRecords(state, prev.label);
  if (records.length === 0) return null;

  const workday = state.params.workdayMinutes;
  const overtimeMin = records.reduce((a, h) => a + Math.max(0, h.employeeMinutes - workday), 0);
  const rec = salaryRecord(state, prev.start);
  const annual = rec.annual;
  // 통상시급: 매달 고정으로 주는 기본급과 식대를 209시간으로 나눈다
  const hourly = floor10(annual / 12 / MONTHLY_HOURS);
  const overtimePay = floor10((overtimeMin / 60) * hourly * OVERTIME_RATE);

  // 성과급: 전월 가격 절감액 기준. 일별 기록의 누적 절감액 차이로 구한다
  const before = [...state.history].reverse().find((h) => h.day < records[0].day)?.priceSavingCum ?? 0;
  const saving = Math.max(0, records[records.length - 1].priceSavingCum - before);
  const bonus = Math.min(BONUS_CAP, floor10(saving * BONUS_RATE));

  if (overtimePay <= 0 && bonus <= 0) return null;

  // 추가 지급분 세금: 월급에 이만큼 더 받았을 때 늘어나는 세금으로 추정
  const annualBase = floor10((annual / 12 - MEAL_ALLOWANCE));
  const extra = overtimePay + bonus;
  const incomeTax = Math.max(0, monthlyIncomeTax(annualBase + extra) - monthlyIncomeTax(annualBase));
  const localTax = floor10(incomeTax * RATES.localTax);
  const employment = floor10(extra * RATES.employment);

  const h = Math.floor(overtimeMin / 60);
  const m = overtimeMin % 60;
  return makeSlip(
    state,
    'extra',
    prev.label,
    [
      { label: `연장근로수당 (${h}시간 ${m}분)`, amount: overtimePay, taxable: true },
      { label: '월 성과급', amount: bonus, taxable: true },
    ].filter((l) => l.amount > 0),
    [
      { label: '고용보험', amount: employment },
      { label: '소득세', amount: incomeTax },
      { label: '지방소득세', amount: localTax },
    ],
    [
      overtimePay > 0 ? `연장근로수당은 통상시급 ${hourly.toLocaleString('ko-KR')}원의 1.5배입니다.` : '',
      bonus > 0 ? `성과급은 전월 가격 절감액 ${Math.round(saving).toLocaleString('ko-KR')}원의 5%이며 상한은 30만원입니다.` : '',
      '국민연금과 건강보험은 매달 정해진 보수월액으로 내므로 이번 지급분에서는 떼지 않습니다.',
    ]
      .filter(Boolean)
      .join(' '),
    rec.rank,
  );
}

function deposit(state: GameState, slip: Payslip): void {
  const acc = state.payroll.account;
  acc.balance += slip.net;
  acc.txns.push({
    day: state.day,
    amount: slip.net,
    balance: acc.balance,
    memo: `${Number(slip.period.slice(5, 7))}월분 ${slip.kind === 'salary' ? '급여' : '수당'}`,
    payslipId: slip.id,
  });
  if (acc.txns.length > 120) acc.txns = acc.txns.slice(-120);
  state.payroll.payslips.push(slip);
  if (state.payroll.payslips.length > 60) state.payroll.payslips = state.payroll.payslips.slice(-60);
}

/** 급여일이면 명세서를 만들고 통장에 입금한다. advanceDay에서 출근 직후(09:00) 실행 */
export function runPayroll(state: GameState): void {
  const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
  const jobs: [number, () => Payslip | null, string][] = [
    [PAYDAY_SALARY, () => salarySlip(state), '급여'],
    [PAYDAY_EXTRA, () => extraSlip(state), '추가 수당'],
  ];
  for (const [x, make, name] of jobs) {
    if (!isPaydayFor(state.startDate, state.day, x)) continue;
    const slip = make();
    if (!slip) continue;
    deposit(state, slip);
    const [y, mo] = slip.period.split('-');
    logEvent(
      state,
      'payroll',
      'mgmt',
      `${Number(mo)}월분 ${name} ${won(slip.net)} 입금`,
      `지급 ${won(slip.gross)}, 공제 ${won(slip.totalDeduction)}. ${state.payroll.account.bank} 통장 잔액 ${won(state.payroll.account.balance)}`,
    );
    sendMessage(state, {
      from: '경영지원팀',
      to: state.employee.name,
      subject: `[급여명세서] ${y}년 ${Number(mo)}월분 ${name}`,
      body: [
        `${y}년 ${Number(mo)}월분 ${name} 명세서를 아래와 같이 보내 드립니다.`,
        '',
        ...slip.earnings.map((l) => `지급 | ${l.label}: ${won(l.amount)}${l.taxable ? '' : ' (비과세)'}`),
        ...slip.deductions.map((l) => `공제 | ${l.label}: ${won(l.amount)}`),
        '',
        `실수령액 ${won(slip.net)}을 ${state.payroll.account.bank} ${state.payroll.account.number}로 입금하였습니다.`,
        ...(slip.note ? ['', slip.note] : []),
      ].join('\n'),
    });
  }
}

export function emptyPayroll(seed: number, startDate: string, rank = '사원'): GameState['payroll'] {
  const tail = String(Math.abs(seed) % 1_000_000).padStart(6, '0');
  return {
    account: { bank: '가상은행', number: `110-${tail.slice(0, 3)}-${tail}`, balance: 0, txns: [] },
    payslips: [],
    salaryHistory: [{ from: startDate.slice(0, 7), annual: SALARY_BY_RANK[rank] ?? SALARY_BY_RANK['사원'], rank }],
  };
}

/** 연봉 기준 한 달 예상 실수령 (전체 달 기준, 수당 제외) */
export function estimateMonthly(annual: number): { annual: number; gross: number; deduction: number; net: number } {
  const monthly = floor10(annual / 12);
  const base = monthly - MEAL_ALLOWANCE;
  const health = floor10(base * RATES.health);
  const tax = monthlyIncomeTax(base);
  const deduction =
    floor10(base * RATES.pension) + health + floor10(health * RATES.longTermCare) + floor10(base * RATES.employment) + tax + floor10(tax * RATES.localTax);
  return { annual, gross: monthly, deduction, net: monthly - deduction };
}
