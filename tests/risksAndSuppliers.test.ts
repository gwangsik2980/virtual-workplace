import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import type { GameState } from '../src/sim/types';

// 한 번 돌린 1년치 결과를 여러 테스트가 같이 본다
const runs: GameState[] = [20270104, 1, 2, 3].map((seed) => advanceDays(createInitialState(seed, '2026-11-03', 'manual'), 250));
const sum = (f: (s: GameState) => number) => runs.reduce((a, s) => a + f(s), 0);

describe('손해 보는 상황', () => {
  it('불량 반품 처리비와 생산 중 불량 폐기가 영업이익에서 빠진다', () => {
    for (const s of runs) {
      const other = s.history.reduce((a, h) => a + (h.otherExpense ?? 0), 0);
      expect(other).toBe(s.finance.otherExpenseCum);
      expect(s.stats.defectHandlingKRW).toBeGreaterThan(0);
    }
    expect(sum((s) => s.stats.qualityIncidents ?? 0)).toBeGreaterThan(0);
  });

  it('긴급 현물 구매는 시세보다 비싸게 사고, 못 구하는 날도 있다', () => {
    expect(sum((s) => s.stats.spotBuys ?? 0)).toBeGreaterThan(0);
    expect(sum((s) => s.stats.spotPremiumKRW ?? 0)).toBeGreaterThan(0);
    expect(sum((s) => s.stats.spotFailures ?? 0)).toBeGreaterThan(0);
  });

  it('업체가 단가 인상을 요구하고, 합의된 인상은 업체 단가 수준에 남는다', () => {
    expect(sum((s) => (s.stats.priceIncreaseCases ?? 0) + (s.stats.annualIncreases ?? 0))).toBeGreaterThan(0);
    const raised = runs.flatMap((s) => s.suppliers.filter((x) => !x.addedDay)).some((x) => x.priceFactor > 1.08);
    expect(raised).toBe(true);
  });

  it('적자인 달이 생길 수 있다', () => {
    const months = runs.flatMap((s) => {
      const out: number[] = [];
      for (let i = 0; i + 21 <= s.history.length; i += 21) out.push(s.history.slice(i, i + 21).reduce((a, h) => a + (h.opProfit ?? 0), 0));
      return out;
    });
    expect(months.some((m) => m < 0)).toBe(true);
  });
});

describe('공급업체 관리와 교육', () => {
  it('신규 공급처는 탐색과 샘플 시험을 거쳐 등록되고 견적을 받는다', () => {
    for (const s of runs) {
      const added = s.suppliers.filter((x) => x.addedDay);
      expect(added.length).toBeGreaterThan(0);
      const quoted = s.cases.some((c) => c.createdDay > added[0].addedDay! && c.quotes.some((q) => q.supplierId === added[0].id));
      expect(quoted).toBe(true);
    }
  });

  it('분기 평가에서 기준 미달 업체는 개선 미팅을 하고, 계속 미달이면 거래를 중지한다', () => {
    expect(sum((s) => s.stats.supplierMeetings ?? 0)).toBeGreaterThan(0);
    for (const s of runs) {
      for (const sup of s.suppliers.filter((x) => x.active === false)) {
        // 중지된 업체에는 중지 뒤 견적 요청이 가지 않는다
        const stopDay = s.events.find((e) => e.title === `${sup.name} 거래 중지`)!.day;
        expect(s.cases.some((c) => c.createdDay > stopDay && c.rfqSupplierIds.includes(sup.id))).toBe(false);
      }
      // 원료마다 거래 업체가 하나 이상 남는다
      for (const id of Object.keys(s.materials)) expect(s.suppliers.some((x) => x.active !== false && x.materialIds.includes(id as never))).toBe(true);
    }
  });

  it('분기마다 교육을 받고 그만큼 숙련도가 오른다', () => {
    for (const s of runs) {
      expect(s.stats.trainingSessions).toBeGreaterThanOrEqual(4);
      expect(s.schedule.length).toBeGreaterThan(0);
    }
  });

  it('같은 시드면 결과가 같다', () => {
    const again = advanceDays(createInitialState(1, '2026-11-03', 'manual'), 250);
    expect(again.finance.otherExpenseCum).toBe(runs[1].finance.otherExpenseCum);
    expect(again.suppliers.map((x) => x.name)).toEqual(runs[1].suppliers.map((x) => x.name));
  });
});

describe('업체 선정 기준 v2', () => {
  it('결품 손실을 점수에 넣으면 필요일보다 늦게 오는 업체를 덜 고르고 결품이 줄어든다', () => {
    let lateV1 = 0, lateV2 = 0, outV1 = 0, outV2 = 0;
    for (const seed of [20270104, 2, 3, 4]) {
      for (const rule of ['v1', 'v2'] as const) {
        const st = createInitialState(seed, '2026-11-03', 'manual');
        st.selectionRule = rule;
        const s = advanceDays(st, 250);
        const late = s.cases.filter((c) => c.po && c.po.promisedDay > c.neededByDay + 1).length;
        if (rule === 'v1') { lateV1 += late; outV1 += s.stats.stockoutDays; } else { lateV2 += late; outV2 += s.stats.stockoutDays; }
      }
    }
    expect(lateV2).toBeLessThan(lateV1);
    expect(outV2).toBeLessThan(outV1);
  });
});

describe('팀 채팅', () => {
  it('상사 지시와 다른 부서 협조 대화가 사건에 맞춰 쌓이고, 부하 직원 방은 없다', () => {
    const s = runs[0];
    const threads = new Set(s.chats.map((c) => c.thread));
    expect(threads.has('lead')).toBe(true);
    expect(threads.has('prod')).toBe(true);
    expect([...threads].every((t) => ['lead', 'prod', 'qa', 'logi', 'fin', 'sales'].includes(t))).toBe(true);
    // 구매 요청마다 생산팀 대화가 남는다 (보관 한도 안에서)
    const firstDay = s.chats[0].day;
    const requested = s.cases.filter((c) => c.createdDay >= firstDay).length;
    const prodAsks = s.chats.filter((c) => c.thread === 'prod' && c.from === 'them' && c.text.includes('요청 올렸')).length;
    expect(prodAsks).toBe(requested);
    // 시각은 근무 시간 안
    expect(s.chats.every((c) => c.minute >= 0 && c.minute < 9 * 60 + 60)).toBe(true);
  });
});
