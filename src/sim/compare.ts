import { getToolVersion } from '../tools/registry';
import { QUOTE_FIELDS, type QuoteField, type ToolContext } from '../tools/types';
import { PACK_SIZE } from './quotes';
import { makeRng, type Rng } from './rng';
import type {
  AppliedTool,
  ComparisonRecord,
  EnteredQuote,
  EntryError,
  GameState,
  PurchaseCase,
  Quote,
  Supplier,
} from './types';

/**
 * 견적 비교 단계.
 *
 * 수작업 경로: 담당자가 견적서를 읽고 필드를 하나씩 입력한다. 필드마다 일정 확률로
 * 오입력이 생긴다. 담당자는 틀린 줄 모르고 그 값으로 업체를 고른다.
 * 결과 비용은 진실값으로 계산한다. 그래서 오입력의 영향(잘못된 선택, 정산 불일치)은
 * 정해 둔 "개선율"이 아니라 계산 과정에서 나온다.
 *
 * 도구 경로: 도구가 추출한 값 중 검증 규칙을 통과한 필드는 검토만 하고,
 * 실패한 필드는 수작업 경로와 똑같이 사람이 입력한다.
 */

export function skillTimeFactor(skill: number): number {
  // 숙련도 0 → 1.4배, 100 → 0.8배
  return 1.4 - 0.6 * (skill / 100);
}

export function skillErrorFactor(skill: number): number {
  // 숙련도 0 → 1.5배, 100 → 0.5배
  return 1.5 - skill / 100;
}

function trueValue(q: Quote, field: QuoteField): number {
  switch (field) {
    case 'unitPrice':
      return q.truth.unitPriceKRW;
    case 'leadTime':
      return q.truth.leadTimeDays;
    case 'paymentTerms':
      return q.truth.paymentTermsDays;
    case 'moq':
      return q.truth.moq;
    case 'validUntil':
      return q.truth.validUntilDay;
  }
}

/** 이 필드를 사람이 입력할 때 단위·통화 환산이 필요한가 */
function needsConversion(q: Quote, field: QuoteField): boolean {
  return field === 'unitPrice' && (q.format === 'B' || q.format === 'C');
}

interface ManualResult {
  value: number;
  minutes: number;
  error?: EntryError;
}

export function manualEntry(state: GameState, q: Quote, field: QuoteField, rng: Rng): ManualResult {
  const p = state.params;
  const docs = state.employee.skills.docs;
  const t = trueValue(q, field);
  let minutes = p.entryMinutesPerField * skillTimeFactor(docs) * (q.scanned ? 1.3 : 1);
  if (needsConversion(q, field)) minutes += 1;

  const errFactor = skillErrorFactor(docs) * (q.scanned ? 1.5 : 1);
  // 1) 환산 실수
  if (needsConversion(q, field) && rng.chance(p.conversionErrorRate * errFactor)) {
    if (q.format === 'B') {
      // 지난주 환율을 그대로 쓰는 식의 실수: ±3~6%
      const f = 1 + (rng.chance(0.5) ? 1 : -1) * rng.range(0.03, 0.06);
      const v = Math.round(t * f);
      return { value: v, minutes, error: { field, kind: 'currency', trueValue: t, enteredValue: v } };
    }
    if (rng.chance(0.5)) {
      // VAT 포함가를 그대로 입력
      const v = Math.round(t * 1.1);
      return { value: v, minutes, error: { field, kind: 'vat', trueValue: t, enteredValue: v } };
    }
    // 포장 단위를 잘못 나눔 (20kg 포대를 25kg으로 착각 등)
    const unit = state.materials[state.cases.find((c) => c.id === q.caseId)?.materialId ?? 'flour'].unit;
    const size = PACK_SIZE[unit].size;
    const wrong = size * 1.25;
    const v = Math.round((t * size) / wrong);
    return { value: v, minutes, error: { field, kind: 'unit', trueValue: t, enteredValue: v } };
  }
  // 2) 일반 오입력
  if (field !== 'moq' && field !== 'validUntil' && rng.chance(p.baseErrorRate * errFactor)) {
    if (field === 'unitPrice') {
      const f = rng.pick([0.9, 1.1, 0.91, 1.09]);
      const v = Math.round(t * f);
      return { value: v, minutes, error: { field, kind: 'digit', trueValue: t, enteredValue: v } };
    }
    if (field === 'leadTime') {
      const v = Math.max(1, t + rng.pick([-3, -2, 2, 3]));
      return { value: v, minutes, error: { field, kind: 'leadtime', trueValue: t, enteredValue: v } };
    }
    const v = t === 30 ? 60 : 30;
    return { value: v, minutes, error: { field, kind: 'terms', trueValue: t, enteredValue: v } };
  }
  return { value: t, minutes };
}

/** 도구 출력 검증 규칙 (엔진이 적용) */
export function validateField(state: GameState, q: Quote, field: QuoteField, value: number | null): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  const c = state.cases.find((x) => x.id === q.caseId);
  switch (field) {
    case 'unitPrice': {
      const market = c ? state.market.prices[c.materialId] : value;
      return value > 0 && Math.abs(value / market - 1) <= 0.4;
    }
    case 'leadTime':
      return value >= 1 && value <= 60;
    case 'paymentTerms':
      return value >= 0 && value <= 120;
    default:
      return true;
  }
}

export function makeToolContext(state: GameState): ToolContext {
  return {
    state,
    fxOn: (day) => state.history.find((h) => h.day === day)?.fx ?? state.market.fx,
    unitOf: (q) => {
      const c = state.cases.find((x) => x.id === q.caseId);
      return c ? state.materials[c.materialId].unit : 'kg';
    },
  };
}

/** 업체 평가 점수 (KRW/기준단위 환산, 낮을수록 좋음) */
export function scoreQuote(
  state: GameState,
  c: PurchaseCase,
  sup: Supplier,
  price: number,
  leadTime: number,
  terms: number,
): number {
  // 결제 유예의 금융 효과: 연 5% 기준, 30일 대비
  const financing = price * 0.05 * ((terms - 30) / 365);
  // 품질: 과거 실적이 있으면 실적 불량률, 없으면 업체 등록 시 평가한 불량률
  const h = sup.history;
  const defect = h.receivedQty > 0 ? h.defectQty / h.receivedQty : sup.defectRate;
  const qualityCost = price * defect * 1.5;
  // 납기: 필요일을 넘기면 하루당 3% 위험 비용
  const arrival = state.day + leadTime;
  const lateDays = Math.max(0, arrival - c.neededByDay);
  const latePenalty = price * 0.03 * lateDays;
  // 납기 신뢰도
  const relCost = price * (1 - sup.reliability) * 0.05;
  return price - financing + qualityCost + latePenalty + relCost;
}

export function activeTool(state: GameState, toolId: string): AppliedTool | undefined {
  return state.tools.find((t) => t.toolId === toolId && t.removedDay === undefined);
}

/** 견적 비교 수행. 결과는 case.comparison에 기록되고 소요 시간(분)을 반환한다. */
export function runComparison(state: GameState, c: PurchaseCase): ComparisonRecord {
  const p = state.params;
  const docs = state.employee.skills.docs;
  const applied = activeTool(state, 'quote-compare');
  const toolVersion = applied ? getToolVersion(applied.toolId, applied.version) : undefined;
  const ctx = makeToolContext(state);

  let minutes = 0;
  let fieldsManual = 0;
  const entered: EnteredQuote[] = [];

  for (const q of c.quotes) {
    // 난수 키에 방식(수작업/도구)을 넣지 않는다 → 같은 필드를 사람이 입력하면 두 세계에서 같은 결과
    const extraction = toolVersion?.extractQuote?.(q, ctx);
    if (toolVersion) minutes += p.toolReviewMinutesPerQuote * skillTimeFactor(docs);
    const values: Partial<Record<QuoteField, number>> = {};
    const errors: EntryError[] = [];
    const manualFields: string[] = [];
    for (const field of QUOTE_FIELDS) {
      const rng = makeRng(state.seed, 'entry', q.id, field);
      const ex = extraction?.fields[field];
      if (ex && validateField(state, q, field, ex.value)) {
        values[field] = ex.value as number;
        const t = trueValue(q, field);
        // 도구가 틀린 값을 냈는데 검증을 통과한 경우도 오류로 기록한다
        if ((field === 'unitPrice' || field === 'leadTime' || field === 'paymentTerms') && Math.abs(ex.value! - t) / Math.max(1, t) > 0.005) {
          errors.push({ field, kind: 'digit', trueValue: t, enteredValue: ex.value! });
        }
      } else {
        const r = manualEntry(state, q, field, rng);
        values[field] = r.value;
        minutes += r.minutes;
        fieldsManual++;
        manualFields.push(field);
        if (r.error) errors.push(r.error);
      }
    }
    entered.push({
      quoteId: q.id,
      supplierId: q.supplierId,
      unitPriceKRW: values.unitPrice!,
      leadTimeDays: values.leadTime!,
      paymentTermsDays: values.paymentTerms!,
      errors,
      manualFields,
    });
  }

  minutes += p.compareFixedMinutes * skillTimeFactor(state.employee.skills.costing) * (toolVersion ? 0.4 : 1);

  // 입력값 기준 선택 vs 진실값 기준 최적
  const supOf = (id: string) => state.suppliers.find((s) => s.id === id)!;
  const trueScore = (q: Quote) =>
    scoreQuote(state, c, supOf(q.supplierId), q.truth.unitPriceKRW, q.truth.leadTimeDays, q.truth.paymentTermsDays);
  let selected = entered[0];
  let selScore = Infinity;
  for (const e of entered) {
    const s = scoreQuote(state, c, supOf(e.supplierId), e.unitPriceKRW, e.leadTimeDays, e.paymentTermsDays);
    e.score = Math.round(s * 10) / 10;
    const q = c.quotes.find((x) => x.id === e.quoteId)!;
    e.trueScore = Math.round(trueScore(q) * 10) / 10;
    if (s < selScore) {
      selScore = s;
      selected = e;
    }
  }
  let best = c.quotes[0];
  for (const q of c.quotes) if (trueScore(q) < trueScore(best)) best = q;
  const selectedQuote = c.quotes.find((q) => q.id === selected.quoteId)!;
  const loss = Math.max(0, (trueScore(selectedQuote) - trueScore(best)) * c.qty);

  const fieldsTotal = c.quotes.length * QUOTE_FIELDS.length;
  return {
    method: toolVersion ? 'tool' : 'manual',
    toolId: toolVersion ? applied!.toolId : undefined,
    toolVersion: toolVersion?.version,
    day: state.day,
    minutes: Math.round(minutes),
    entered,
    fieldsTotal,
    fieldsManual,
    errorCount: entered.reduce((s, e) => s + e.errors.length, 0),
    selectedSupplierId: selected.supplierId,
    trueBestSupplierId: best.supplierId,
    selectionLossKRW: Math.round(loss),
  };
}
