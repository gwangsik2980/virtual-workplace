import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { isPaydayFor, monthlyIncomeTax, salarySlip } from '../src/sim/payroll';
import { migrate } from '../src/sim/persistence';
import { createInitialState } from '../src/sim/seed';
import { formatDay } from '../src/sim/util';

describe('급여', () => {
  it('지급일이 휴일이면 직전 영업일에 준다', () => {
    // 2027-01-10은 일요일 → 1월 8일(금)
    const s = createInitialState(1, '2027-01-04');
    const days = Array.from({ length: 20 }, (_, i) => i + 1).filter((d) => isPaydayFor(s.startDate, d, 10));
    expect(days.map((d) => formatDay(s.startDate, d))).toEqual(['2027-01-08(금)']);
  });

  it('입사한 달은 일할 계산하고 국민연금·건강보험은 다음 달부터', () => {
    const s = createInitialState(7, '2026-11-03', 'manual');
    advanceDays(s, 40);
    const slips = s.payroll.payslips.filter((p) => p.kind === 'salary');
    expect(slips[0].period).toBe('2026-11');
    expect(slips[0].deductions.find((l) => l.label === '국민연금')).toBeUndefined();
    const full = Math.floor(32_000_000 / 12 / 10) * 10;
    expect(slips[0].gross).toBeLessThan(full);
    expect(s.payroll.account.balance).toBe(s.payroll.payslips.reduce((a, p) => a + p.net, 0));
  });

  it('전체 달은 4대보험과 소득세를 모두 공제한다', () => {
    const s = createInitialState(7, '2026-10-01', 'manual');
    advanceDays(s, 30);
    const slip = s.payroll.payslips.find((p) => p.kind === 'salary')!;
    const labels = slip.deductions.map((l) => l.label);
    expect(labels).toEqual(['국민연금', '건강보험', '장기요양보험', '고용보험', '소득세', '지방소득세']);
    expect(slip.net).toBe(slip.gross - slip.totalDeduction);
    // 연봉 3,200만원 실수령은 대략 월 240만원 안팎
    expect(slip.net).toBeGreaterThan(2_300_000);
    expect(slip.net).toBeLessThan(2_500_000);
  });

  it('소득세는 급여가 늘면 늘어난다', () => {
    expect(monthlyIncomeTax(1_000_000)).toBe(0);
    expect(monthlyIncomeTax(3_000_000)).toBeGreaterThan(monthlyIncomeTax(2_500_000));
  });

  it('입사 전 달 몫은 주지 않는다', () => {
    const s = createInitialState(7, '2026-11-03', 'manual');
    // 11월 10일은 10월분인데 11월 입사
    while (!isPaydayFor(s.startDate, s.day, 10)) s.day++;
    expect(salarySlip(s)).toBeNull();
  });

  it('예전 저장 파일에는 빈 통장이 생긴다', () => {
    const s = createInitialState(3) as Partial<ReturnType<typeof createInitialState>>;
    delete s.payroll;
    const m = migrate(s as ReturnType<typeof createInitialState>);
    expect(m.payroll.account.balance).toBe(0);
  });
});

describe('다음 급여일', () => {
  it('입사 첫 달 10일은 건너뛰고 다음 달 10일을 알려 준다', async () => {
    const { nextPayday } = await import('../src/sim/payroll');
    const s = createInitialState(7, '2026-11-03', 'manual');
    const n = nextPayday(s);
    expect(formatDay(s.startDate, n.day)).toBe('2026-12-10(목)');
    expect(n.kind).toBe('salary');
  });
});
