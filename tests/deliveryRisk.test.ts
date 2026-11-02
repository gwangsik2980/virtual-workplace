import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import { runVerification } from '../src/sim/verify';

describe('납기 위험 알림', () => {
  it('수작업이면 약속일 당일 이후에 지연을 안다', () => {
    const s = advanceDays(createInitialState(), 120);
    const known = s.cases.filter((c) => c.delayKnownDay !== undefined);
    expect(known.length).toBeGreaterThan(0);
    for (const c of known) {
      expect(c.delayKnownBy).toBe('manual');
      expect(c.delayKnownDay!).toBeGreaterThanOrEqual(c.po!.promisedDay);
    }
  });

  it('도구를 쓰면 약속일 전에 지연을 알고, 지연 일수가 늘지 않는다', () => {
    const start = advanceDays(createInitialState(), 20);
    const run = runVerification(start, 'delivery-risk', '1.0', 120);
    expect(run.withTool.lateDaysSum).toBeLessThanOrEqual(run.baseline.lateDaysSum);
    expect(run.withTool.expediteRecoveredDays).toBeGreaterThanOrEqual(run.baseline.expediteRecoveredDays);
  });

  it('독촉으로 앞당겨도 약속일보다 빨라지지 않는다', () => {
    const s = structuredClone(advanceDays(createInitialState(), 20));
    s.tools.push({ toolId: 'delivery-risk', version: '1.0', appliedDay: s.day });
    advanceDays(s, 120);
    for (const c of s.cases.filter((x) => x.delivery)) {
      expect(c.delivery!.arrivedDay).toBeGreaterThanOrEqual(c.po!.promisedDay);
      if (c.delayKnownBy === 'tool') expect(c.delayKnownDay!).toBeLessThan(c.po!.promisedDay + 1);
    }
  });
});
