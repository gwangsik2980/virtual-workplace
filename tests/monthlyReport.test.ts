import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import { runVerification } from '../src/sim/verify';
import { collectFacts, draftMonthlyReport, monthPeriod } from '../src/tools/monthlyReport/draft';

describe('월간 보고서', () => {
  const s = advanceDays(createInitialState(), 45);

  it('월말마다 보고서가 작성된다', () => {
    expect(s.reports.length).toBeGreaterThanOrEqual(1);
    expect(s.reports[0].method).toBe('manual');
    expect(s.reports[0].text).toContain('구매 실적 보고');
  });

  it('보고서 수치는 구매 건 기록과 일치한다', () => {
    const p = monthPeriod(s, 20);
    const f = collectFacts(s, p);
    const ordered = s.cases.filter((c) => c.po && c.po.orderDay >= p.fromDay && c.po.orderDay <= p.toDay);
    expect(f.ordersCount).toBe(ordered.length);
    expect(f.orderAmount).toBe(ordered.reduce((a, c) => a + c.po!.amountKRW, 0));
    expect(draftMonthlyReport(s, p)).toContain(`발주 ${ordered.length}건`);
  });

  it('월 기간은 같은 달 첫 영업일부터 시작한다', () => {
    const p = monthPeriod(s, 20);
    expect(p.fromDay).toBe(1);
  });

  it('도구를 쓰면 보고 작성 시간이 줄어든다 (반사실 비교)', () => {
    const start = advanceDays(createInitialState(), 10);
    const run = runVerification(start, 'monthly-report', '1.0', 45);
    expect(run.withTool.reportsWritten).toBe(run.baseline.reportsWritten);
    expect(run.baseline.reportsWritten).toBeGreaterThan(0);
    expect(run.withTool.reportMinutes).toBeLessThan(run.baseline.reportMinutes);
  });
});
