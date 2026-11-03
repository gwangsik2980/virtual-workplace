import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import { runVerification } from '../src/sim/verify';
import { exportJson, importJson } from '../src/sim/persistence';
import { makeRng } from '../src/sim/rng';
import { dayToDate, formatDay } from '../src/sim/util';

describe('재현성', () => {
  it('같은 시드면 같은 결과가 나온다', () => {
    const a = advanceDays(createInitialState(1), 60);
    const b = advanceDays(createInitialState(1), 60);
    expect(exportJson(a)).toEqual(exportJson(b));
  });

  it('시드가 다르면 다른 결과가 나온다', () => {
    const a = advanceDays(createInitialState(1), 30);
    const b = advanceDays(createInitialState(2), 30);
    expect(a.market.prices.flour).not.toEqual(b.market.prices.flour);
  });

  it('난수는 키별로 독립이다', () => {
    expect(makeRng(1, 'price', 'flour', 3).next()).toEqual(makeRng(1, 'price', 'flour', 3).next());
    expect(makeRng(1, 'price', 'flour', 3).next()).not.toEqual(makeRng(1, 'price', 'flour', 4).next());
  });
});

describe('연속성', () => {
  it('저장 후 불러와서 이어 진행하면 끊김 없이 진행한 것과 같다', () => {
    const straight = advanceDays(createInitialState(7), 50);
    const half = advanceDays(createInitialState(7), 25);
    const restored = importJson(exportJson(half));
    advanceDays(restored, 25);
    expect(exportJson(restored)).toEqual(exportJson(straight));
  });

  it('잘못된 저장 파일은 거부한다', () => {
    expect(() => importJson('{"hello":1}')).toThrow();
  });
});

describe('구매 업무 흐름', () => {
  const s = advanceDays(createInitialState(), 90);

  it('구매 요청이 생기고 완료까지 이어진다', () => {
    const done = s.cases.filter((c) => c.stage === 'done');
    expect(done.length).toBeGreaterThan(10);
    for (const c of done) {
      expect(c.quotes.length).toBeGreaterThan(0);
      expect(c.comparison).toBeDefined();
      expect(c.negotiation).toBeDefined();
      expect(c.po).toBeDefined();
      expect(c.delivery).toBeDefined();
      expect(c.savings).toBeDefined();
    }
  });

  it('절감액은 기준가격 공식과 일치한다', () => {
    for (const c of s.cases.filter((x) => x.savings)) {
      const sv = c.savings!;
      expect(sv.priceSavingKRW).toBe(Math.round((sv.baselinePrice - sv.finalPrice) * sv.qty));
      expect(sv.baselinePrice).toBeGreaterThanOrEqual(sv.finalPrice);
    }
  });

  it('입고되면 재고가 늘고 지급 예정 채무가 생긴다', () => {
    expect(s.finance.purchaseCum).toBeGreaterThan(0);
    expect(s.stats.deliveriesOnTime + s.stats.deliveriesLate).toBeGreaterThan(0);
  });

  it('점심시간 12:00~13:00에는 업무가 없다', () => {
    for (const b of s.schedule) {
      if (b.kind === 'lunch') {
        expect(b.start).toBe(180);
        expect(b.minutes).toBe(60);
        continue;
      }
      const end = b.start + b.minutes;
      expect(end <= 180 || b.start >= 240).toBe(true);
    }
  });

  it('업무 이력과 관찰 기록이 쌓인다', () => {
    expect(s.schedule.length).toBeGreaterThan(0);
    expect(s.messages.length).toBeGreaterThan(0);
    expect(Object.keys(s.learning.unlocked).length).toBeGreaterThan(5);
  });

  it('하루 근무시간은 연장 한도를 넘지 않는다', () => {
    const byDay = new Map<number, number>();
    for (const b of s.schedule) if (b.kind !== 'lunch') byDay.set(b.day, (byDay.get(b.day) ?? 0) + b.minutes);
    for (const m of byDay.values()) expect(m).toBeLessThanOrEqual(s.params.workdayMinutes + 90 + 60);
  });
});

describe('도구 효과 검증 (반사실 비교)', () => {
  const s = advanceDays(createInitialState(), 30);
  const run = runVerification(s, 'quote-compare', '1.1', 40);

  it('두 세계의 외부 사건은 같다 (시장가격)', () => {
    const a = structuredClone(s);
    const b = structuredClone(s);
    b.tools.push({ toolId: 'quote-compare', version: '1.1', appliedDay: b.day });
    advanceDays(a, 20);
    advanceDays(b, 20);
    expect(a.market.prices).toEqual(b.market.prices);
    expect(a.market.fx).toEqual(b.market.fx);
  });

  it('도구를 쓰면 견적 비교 시간이 줄어든다', () => {
    expect(run.withTool.casesCompared).toBeGreaterThan(0);
    expect(run.withTool.compareMinutes).toBeLessThan(run.baseline.compareMinutes);
  });

  it('도구를 쓰면 입력 오류가 늘지 않는다', () => {
    expect(run.withTool.entryErrors).toBeLessThanOrEqual(run.baseline.entryErrors);
  });

  it('검증 실행이 원래 상태를 바꾸지 않는다', () => {
    expect(s.day).toBe(31);
    expect(s.tools.length).toBe(0);
  });
});

describe('날짜', () => {
  it('영업일만 센다', () => {
    expect(formatDay('2027-01-04', 1)).toBe('2027.01.04(월)');
    expect(formatDay('2027-01-04', 6)).toBe('2027.01.11(월)');
    expect(dayToDate('2027-01-04', 5).getDay()).toBe(5);
  });
});

describe('손익 구조', () => {
  it('1년 영업이익률이 식품 제조업 수준(대략 2~9%) 안에 든다', () => {
    for (const seed of [20270104, 1, 2]) {
      const s = advanceDays(createInitialState(seed), 250);
      const rev = s.history.reduce((a, h) => a + h.revenue, 0);
      const op = s.history.reduce((a, h) => a + (h.opProfit ?? 0), 0);
      const opm = op / rev;
      expect(opm).toBeGreaterThan(0.02);
      expect(opm).toBeLessThan(0.09);
    }
  });
});
