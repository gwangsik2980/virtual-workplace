import { describe, expect, it } from 'vitest';
import { makeToolContext, validateField } from '../src/sim/compare';
import { generateQuote } from '../src/sim/quotes';
import { createCase } from '../src/sim/purchasing';
import { createInitialState } from '../src/sim/seed';
import type { GameState, MaterialId, Quote } from '../src/sim/types';
import { quoteCompareTool } from '../src/tools/quoteCompare';

const v10 = quoteCompareTool.versions.find((v) => v.version === '1.0')!;
const v11 = quoteCompareTool.versions.find((v) => v.version === '1.1')!;

function quotesFor(material: MaterialId, n = 30): { state: GameState; quotes: Quote[] } {
  const state = createInitialState(99);
  const quotes: Quote[] = [];
  for (let i = 0; i < n; i++) {
    const c = createCase(state, material, 5000, 10, false, 'test');
    for (const s of state.suppliers.filter((x) => x.materialIds.includes(material))) {
      quotes.push(generateQuote(state, c, s));
    }
  }
  return { state, quotes };
}

describe('견적서 정보 추출', () => {
  for (const material of ['flour', 'soyoil', 'sugar', 'chili', 'film'] as MaterialId[]) {
    it(`${material}: 추출에 성공한 단가는 진실값과 0.5% 이내로 일치한다 (v1.1)`, () => {
      const { state, quotes } = quotesFor(material);
      const ctx = makeToolContext(state);
      for (const q of quotes) {
        const ex = v11.extractQuote(q, ctx);
        const price = ex.fields.unitPrice?.value;
        if (price == null) continue;
        expect(Math.abs(price / q.truth.unitPriceKRW - 1)).toBeLessThan(0.005);
        expect(ex.fields.leadTime?.value).toBe(q.truth.leadTimeDays);
        expect(ex.fields.paymentTerms?.value).toBe(q.truth.paymentTermsDays);
      }
    });
  }

  it('스캔본은 두 버전 모두 추출하지 않는다 (수작업으로 복귀)', () => {
    const { state, quotes } = quotesFor('chili');
    const ctx = makeToolContext(state);
    const scanned = quotes.filter((q) => q.scanned);
    expect(scanned.length).toBeGreaterThan(0);
    for (const q of scanned) {
      expect(v10.extractQuote(q, ctx).fields.unitPrice?.value).toBeNull();
      expect(v11.extractQuote(q, ctx).fields.unitPrice?.value).toBeNull();
    }
  });

  it('v1.1은 띄어쓰기가 불규칙한 양식에서 v1.0보다 많은 필드를 추출한다', () => {
    const { state, quotes } = quotesFor('chili');
    const ctx = makeToolContext(state);
    const textD = quotes.filter((q) => q.format === 'D' && !q.scanned);
    const count = (v: typeof v10) =>
      textD.reduce((a, q) => a + Object.values(v.extractQuote(q, ctx).fields).filter((f) => f?.value != null).length, 0);
    expect(count(v11)).toBeGreaterThan(count(v10));
  });

  it('표준 양식(A)은 v1.0에서도 모든 필드를 추출한다', () => {
    const { state, quotes } = quotesFor('flour');
    const ctx = makeToolContext(state);
    for (const q of quotes.filter((x) => x.format === 'A')) {
      const ex = v10.extractQuote(q, ctx);
      for (const f of Object.values(ex.fields)) expect(f?.value).not.toBeNull();
    }
  });

  it('포대 단위·VAT 포함 견적(C)을 기준단위 VAT 별도로 환산한다', () => {
    const { state, quotes } = quotesFor('flour');
    const ctx = makeToolContext(state);
    const c = quotes.find((q) => q.format === 'C')!;
    const price = v10.extractQuote(c, ctx).fields.unitPrice!.value!;
    expect(Math.abs(price / c.truth.unitPriceKRW - 1)).toBeLessThan(0.005);
  });
});

describe('검증 규칙', () => {
  it('시장가 대비 ±40%를 벗어난 단가는 실패 처리한다', () => {
    const { state, quotes } = quotesFor('flour', 1);
    const q = quotes[0];
    const market = state.market.prices.flour;
    expect(validateField(state, q, 'unitPrice', market)).toBe(true);
    expect(validateField(state, q, 'unitPrice', market * 2)).toBe(false);
    expect(validateField(state, q, 'unitPrice', null)).toBe(false);
    expect(validateField(state, q, 'leadTime', 0)).toBe(false);
    expect(validateField(state, q, 'leadTime', 7)).toBe(true);
  });
});
