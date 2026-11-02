import { runComparison, skillTimeFactor } from './compare';
import { gainExperience } from './employee';
import { unlockConcept } from './learning';
import { generateQuote } from './quotes';
import { makeRng } from './rng';
import type { GameState, MaterialId, PurchaseCase, SkillId, Stage } from './types';
import { formatDay, logEvent, nextId, sendMessage, won } from './util';

export const STAGE_LABELS: Record<Stage, string> = {
  request: '구매요청 접수',
  market: '시장조사',
  costing: '원가분석',
  rfq: '견적요청',
  awaitQuotes: '견적 회신 대기',
  compare: '견적 비교',
  negotiate: '단가 협상',
  approve: '품의·승인',
  order: '발주',
  awaitDelivery: '입고 대기',
  inspect: '입고 검수·정산',
  done: '완료',
  cancelled: '취소',
};

export const STAGE_ORDER: Stage[] = [
  'request',
  'market',
  'costing',
  'rfq',
  'awaitQuotes',
  'compare',
  'negotiate',
  'approve',
  'order',
  'awaitDelivery',
  'inspect',
  'done',
];

/** 담당자가 직접 손을 쓰는 단계의 기본 작업 시간(분)과 관련 숙련도 */
const STAGE_WORK: Partial<Record<Stage, { minutes: number; skill: SkillId; label: string }>> = {
  request: { minutes: 10, skill: 'docs', label: '구매요청 내용 확인' },
  market: { minutes: 45, skill: 'market', label: '시세·환율·수급 동향 조사' },
  costing: { minutes: 40, skill: 'costing', label: '원가 구성 분석, 목표가 산정' },
  rfq: { minutes: 20, skill: 'docs', label: '견적요청서 작성·발송' },
  compare: { minutes: 0, skill: 'docs', label: '견적 비교표 작성' },
  negotiate: { minutes: 40, skill: 'negotiation', label: '단가 협상 (전화·메일)' },
  approve: { minutes: 15, skill: 'docs', label: '품의서 작성' },
  order: { minutes: 15, skill: 'docs', label: '발주서 작성·발송' },
  inspect: { minutes: 15, skill: 'docs', label: '입고·발주·청구 대조(정산)' },
};

export function stageWorkInfo(stage: Stage) {
  return STAGE_WORK[stage];
}

export function createCase(
  state: GameState,
  materialId: MaterialId,
  qty: number,
  neededByDay: number,
  urgent: boolean,
  reason: string,
): PurchaseCase {
  const c: PurchaseCase = {
    id: nextId(state, 'PR'),
    materialId,
    qty,
    createdDay: state.day,
    neededByDay,
    urgent,
    reason,
    stage: 'request',
    stageMinutesLeft: 0,
    stageMinutesTotal: 0,
    rfqSupplierIds: [],
    quotes: [],
    minutesSpent: 0,
  };
  state.cases.push(c);
  enterStage(state, c, 'request');
  const m = state.materials[materialId];
  logEvent(
    state,
    'request',
    'production',
    `${urgent ? '[긴급] ' : ''}${m.name} 구매요청`,
    `${reason} 요청수량 ${qty.toLocaleString('ko-KR')}${m.unit}, 필요일 ${formatDay(state.startDate, neededByDay)}`,
    c.id,
  );
  sendMessage(state, {
    from: '생산팀 김대리',
    to: state.employee.name,
    subject: `${urgent ? '[긴급] ' : ''}${m.name} 구매 요청드립니다 (${c.id})`,
    body: `안녕하세요, 생산팀입니다.\n${reason}\n\n- 품목: ${m.name}\n- 수량: ${qty.toLocaleString('ko-KR')}${m.unit}\n- 필요일: ${formatDay(state.startDate, neededByDay)}\n\n확인 부탁드립니다.`,
    caseId: c.id,
  });
  return c;
}

function setWork(state: GameState, c: PurchaseCase, baseMinutes: number, skill: SkillId) {
  const minutes = Math.max(1, Math.round(baseMinutes * skillTimeFactor(state.employee.skills[skill])));
  c.stageMinutesLeft = minutes;
  c.stageMinutesTotal = minutes;
}

export function enterStage(state: GameState, c: PurchaseCase, stage: Stage): void {
  c.stage = stage;
  c.stageMinutesLeft = 0;
  c.stageMinutesTotal = 0;
  c.waitUntilDay = undefined;
  const work = STAGE_WORK[stage];
  if (stage === 'compare') {
    c.comparison = runComparison(state, c);
    c.stageMinutesLeft = c.comparison.minutes;
    c.stageMinutesTotal = c.comparison.minutes;
    return;
  }
  if (stage === 'inspect') {
    let base = work!.minutes;
    if (c.delivery?.invoiceMismatch) base += state.params.mismatchReworkMinutes;
    setWork(state, c, base, 'docs');
    return;
  }
  if (work) setWork(state, c, work.minutes, work.skill);
}

/** 담당자가 단계 작업을 끝냈을 때의 효과 */
export function completeStage(state: GameState, c: PurchaseCase): void {
  const work = STAGE_WORK[c.stage];
  if (work) gainExperience(state, work.skill, c.stageMinutesTotal);
  const m = state.materials[c.materialId];
  const sup = (id: string) => state.suppliers.find((s) => s.id === id)!;

  switch (c.stage) {
    case 'request':
      unlockConcept(state, 'pr');
      unlockConcept(state, 'reorder');
      enterStage(state, c, 'market');
      break;
    case 'market':
      unlockConcept(state, 'market');
      if (m.imported) unlockConcept(state, 'fx');
      c.marketPriceAtStart = state.market.prices[c.materialId];
      enterStage(state, c, 'costing');
      break;
    case 'costing': {
      unlockConcept(state, 'costing');
      const marketPrice = state.market.prices[c.materialId];
      const logistics = Math.round(marketPrice * 0.025);
      const margin = 0.03;
      c.cost = {
        marketPrice: Math.round(marketPrice),
        fx: m.imported ? Math.round(state.market.fx * 10) / 10 : undefined,
        logisticsPerUnit: logistics,
        standardMargin: margin,
        targetPrice: Math.round((marketPrice + logistics) * (1 + margin)),
      };
      enterStage(state, c, 'rfq');
      break;
    }
    case 'rfq': {
      unlockConcept(state, 'rfq');
      const cands = state.suppliers.filter((s) => s.materialIds.includes(c.materialId));
      c.rfqSupplierIds = cands.map((s) => s.id);
      for (const s of cands) {
        sendMessage(state, {
          from: state.employee.name,
          to: s.name,
          subject: `[견적요청] ${m.name} ${c.qty.toLocaleString('ko-KR')}${m.unit}`,
          body: `안녕하세요, ${state.company.name} 구매팀 ${state.employee.name}입니다.\n아래 조건으로 견적을 요청드립니다.\n\n- 품목: ${m.name}\n- 수량: ${c.qty.toLocaleString('ko-KR')}${m.unit}\n- 희망 납기: ${formatDay(state.startDate, c.neededByDay)}\n\n회신 부탁드립니다.`,
          caseId: c.id,
        });
      }
      const rng = makeRng(state.seed, 'rfqwait', c.id);
      enterStage(state, c, 'awaitQuotes');
      c.waitUntilDay = state.day + (c.urgent ? 1 : rng.int(1, 3));
      break;
    }
    case 'compare': {
      unlockConcept(state, 'compare');
      if (c.quotes.some((q) => q.format === 'B' || q.format === 'C')) unlockConcept(state, 'normalize');
      const cmp = c.comparison!;
      c.selectedSupplierId = cmp.selectedSupplierId;
      state.stats.compareMinutes += cmp.minutes;
      state.stats.casesCompared += 1;
      state.stats.quotesProcessed += c.quotes.length;
      state.stats.entryErrors += cmp.errorCount;
      state.stats.selectionLossKRW += cmp.selectionLossKRW;
      if (cmp.method === 'tool') {
        logEvent(
          state,
          'tool',
          'purchasing',
          `견적 비교 도구 사용 (${c.id})`,
          `견적 ${c.quotes.length}건, 필드 ${cmp.fieldsTotal}개 중 ${cmp.fieldsTotal - cmp.fieldsManual}개 자동 추출, ${cmp.fieldsManual}개 수작업. 소요 ${cmp.minutes}분.`,
          c.id,
        );
      }
      enterStage(state, c, 'negotiate');
      break;
    }
    case 'negotiate': {
      unlockConcept(state, 'negotiate');
      const s = sup(c.selectedSupplierId!);
      const q = c.quotes.find((x) => x.supplierId === s.id)!;
      const rng = makeRng(state.seed, 'nego', c.id, s.id);
      const skill = state.employee.skills.negotiation / 100;
      const leverage = Math.min(1, (c.quotes.length - 1) / 2);
      const aboveTarget = c.cost ? Math.max(0, q.truth.unitPriceKRW / c.cost.targetPrice - 1) : 0;
      const ratio = Math.min(1, 0.25 + 0.45 * skill + 0.15 * leverage + Math.min(0.15, aboveTarget * 2) + 0.15 * rng.next());
      const discount = s.negotiationRoom * ratio * (c.urgent ? 0.6 : 1);
      const initial = q.truth.unitPriceKRW;
      const final = Math.round(initial * (1 - discount));
      c.negotiation = { initialPrice: initial, finalPrice: final, discountRate: discount };
      sendMessage(state, {
        from: s.name,
        to: state.employee.name,
        subject: `RE: 단가 조정 요청 건 (${c.id})`,
        body: `말씀하신 내용 검토했습니다.\n${won(initial)}/${m.unit}에서 ${won(final)}/${m.unit}로 조정해 드리겠습니다. (${(discount * 100).toFixed(1)}% 인하)`,
        caseId: c.id,
      });
      enterStage(state, c, 'approve');
      break;
    }
    case 'approve': {
      unlockConcept(state, 'approval');
      const amount = c.negotiation!.finalPrice * c.qty;
      const days = amount > 30_000_000 ? 2 : 1;
      c.stage = 'approve';
      c.stageMinutesLeft = 0;
      c.waitUntilDay = state.day + (c.urgent ? 0 : days);
      if (c.urgent) enterStage(state, c, 'order');
      break;
    }
    case 'order': {
      unlockConcept(state, 'po');
      const s = sup(c.selectedSupplierId!);
      const q = c.quotes.find((x) => x.supplierId === s.id)!;
      const entered = c.comparison!.entered.find((e) => e.supplierId === s.id)!;
      const nego = c.negotiation!;
      // 발주서 단가는 비교표의 입력값에 협상 할인율을 적용해 작성한다 → 비교표 오입력이 발주서로 전파된다
      const unitPriceEntered = Math.round(entered.unitPriceKRW * (1 - nego.discountRate));
      const rng = makeRng(state.seed, 'delivery', c.id, s.id);
      const promised = state.day + q.truth.leadTimeDays;
      const delay = rng.chance(1 - s.reliability) ? rng.int(1, 4) : 0;
      c.po = {
        id: nextId(state, 'PO'),
        supplierId: s.id,
        unitPriceEntered,
        unitPriceAgreed: nego.finalPrice,
        qty: c.qty,
        amountKRW: nego.finalPrice * c.qty,
        orderDay: state.day,
        promisedDay: promised,
        actualArrivalDay: promised + delay,
        paymentTermsDays: q.truth.paymentTermsDays,
      };
      s.history.orders += 1;
      state.finance.monthSpend += c.po.amountKRW;
      logEvent(
        state,
        'order',
        'purchasing',
        `${m.name} 발주 (${s.name})`,
        `${c.po.id}: ${c.qty.toLocaleString('ko-KR')}${m.unit} × ${won(nego.finalPrice)} = ${won(c.po.amountKRW)}, 입고 예정 ${formatDay(state.startDate, promised)}`,
        c.id,
      );
      sendMessage(state, {
        from: state.employee.name,
        to: s.name,
        subject: `[발주서] ${c.po.id} ${m.name}`,
        body: `발주서를 송부드립니다.\n\n- 품목: ${m.name}\n- 수량: ${c.qty.toLocaleString('ko-KR')}${m.unit}\n- 단가: ${won(unitPriceEntered)}/${m.unit}\n- 납기: ${formatDay(state.startDate, promised)}\n- 결제: 납품 후 ${q.truth.paymentTermsDays}일`,
        caseId: c.id,
      });
      enterStage(state, c, 'awaitDelivery');
      break;
    }
    case 'inspect': {
      unlockConcept(state, 'threeway');
      closeCase(state, c);
      break;
    }
    default:
      break;
  }
}

function closeCase(state: GameState, c: PurchaseCase): void {
  const po = c.po!;
  const d = c.delivery!;
  const accepted = po.qty - d.defectQty;
  const baseline = c.negotiation!.initialPrice;
  const final = po.unitPriceAgreed;
  const target = c.cost?.targetPrice ?? final;
  const marketNow = state.market.prices[c.materialId];
  c.savings = {
    baselinePrice: baseline,
    finalPrice: final,
    qty: accepted,
    priceSavingKRW: Math.round((baseline - final) * accepted),
    vsTargetKRW: Math.round((target - final) * accepted),
    marketMoveKRW: Math.round(((c.marketPriceAtStart ?? marketNow) - marketNow) * accepted),
    formula: `(협상 전 최초 견적 ${won(baseline)} − 최종 단가 ${won(final)}) × 입고 수량 ${accepted.toLocaleString('ko-KR')}`,
  };
  state.stats.priceSavingKRW += c.savings.priceSavingKRW;
  state.stats.closedCases += 1;
  state.stats.cycleDaysSum += state.day - c.createdDay;
  c.stage = 'done';
  c.closedDay = state.day;
  state.employee.completedCases += 1;
  unlockConcept(state, 'savings');
  if (state.stats.closedCases >= 3) unlockConcept(state, 'supplier-eval');
  if (state.employee.completedCases === 1) {
    state.employee.milestones.push({ day: state.day, text: '첫 구매 건 완료' });
  }
  if (state.employee.completedCases % 10 === 0) {
    state.employee.milestones.push({ day: state.day, text: `구매 건 ${state.employee.completedCases}건 완료` });
  }
}

/** 대기 단계 처리 (견적 회신, 승인, 입고). 담당자 시간을 쓰지 않는다. */
export function processWaits(state: GameState): void {
  for (const c of state.cases) {
    if (c.stage === 'awaitQuotes' && c.waitUntilDay !== undefined && state.day >= c.waitUntilDay) {
      const m = state.materials[c.materialId];
      for (const sid of c.rfqSupplierIds) {
        const s = state.suppliers.find((x) => x.id === sid)!;
        const q = generateQuote(state, c, s);
        c.quotes.push(q);
        sendMessage(state, {
          from: s.name,
          to: state.employee.name,
          subject: `RE: [견적요청] ${m.name} - 견적서 송부${q.scanned ? ' (스캔본 첨부)' : ''}`,
          body: q.scanned ? '견적서 스캔본 첨부드립니다.' : '요청하신 견적서 첨부드립니다.',
          caseId: c.id,
          quoteId: q.id,
        });
      }
      enterStage(state, c, 'compare');
    } else if (c.stage === 'approve' && c.waitUntilDay !== undefined && state.day >= c.waitUntilDay) {
      sendMessage(state, {
        from: '구매팀 이팀장',
        to: state.employee.name,
        subject: `[승인] ${c.id} 품의 승인`,
        body: '품의 내용 확인했습니다. 진행하세요.',
        caseId: c.id,
      });
      enterStage(state, c, 'order');
    } else if (c.stage === 'awaitDelivery' && c.po && state.day >= c.po.actualArrivalDay) {
      receiveDelivery(state, c);
    }
  }
}

function receiveDelivery(state: GameState, c: PurchaseCase): void {
  const po = c.po!;
  const m = state.materials[c.materialId];
  const s = state.suppliers.find((x) => x.id === po.supplierId)!;
  const rng = makeRng(state.seed, 'inspect', c.id);
  const defectRate = Math.max(0, s.defectRate * Math.exp(0.5 * rng.normal()));
  const defectQty = Math.round(po.qty * defectRate);
  const late = state.day > po.promisedDay;
  const mismatch = Math.abs(po.unitPriceEntered - po.unitPriceAgreed) / po.unitPriceAgreed > 0.005;
  c.delivery = { arrivedDay: state.day, late, defectQty, invoiceMismatch: mismatch };

  const accepted = po.qty - defectQty;
  // 재고 이동평균 단가
  const newStock = m.stock + accepted;
  m.avgCost = newStock > 0 ? (m.avgCost * m.stock + po.unitPriceAgreed * accepted) / newStock : po.unitPriceAgreed;
  m.stock = newStock;

  const amount = po.unitPriceAgreed * accepted;
  state.finance.payables.push({ day: state.day + Math.round(po.paymentTermsDays * (5 / 7)), amount, poId: po.id });
  state.finance.purchaseCum += amount;

  s.history.receivedQty += po.qty;
  s.history.defectQty += defectQty;
  s.history.spend += amount;
  if (late) s.history.late += 1;
  else s.history.onTime += 1;
  if (late) state.stats.deliveriesLate += 1;
  else state.stats.deliveriesOnTime += 1;
  state.stats.defectQty += defectQty;
  state.stats.receivedQtyByMaterial[c.materialId] = (state.stats.receivedQtyByMaterial[c.materialId] ?? 0) + po.qty;
  if (mismatch) state.stats.invoiceMismatches += 1;

  unlockConcept(state, 'leadtime');
  unlockConcept(state, 'inspection');
  unlockConcept(state, 'payment');

  logEvent(
    state,
    late ? 'delay' : 'delivery',
    'logistics',
    `${m.name} 입고${late ? ` (약속일 대비 ${state.day - po.promisedDay}일 지연)` : ''}`,
    `${s.name} ${po.qty.toLocaleString('ko-KR')}${m.unit} 입고, 불량 ${defectQty.toLocaleString('ko-KR')}${m.unit} (${(defectRate * 100).toFixed(1)}%)`,
    c.id,
  );
  if (defectRate > 0.02) {
    state.backlog.push({
      id: nextId(state, 'BL'),
      kind: 'claim',
      title: `${s.name} 불량 클레임 처리 (${c.id})`,
      createdDay: state.day,
      dueDay: state.day + 3,
      minutesLeft: 40,
      minutesTotal: 40,
      caseId: c.id,
    });
    logEvent(state, 'quality', 'quality', `${m.name} 입고 불량률 ${(defectRate * 100).toFixed(1)}%`, `품질팀이 ${s.name}에 대한 클레임 처리를 요청했습니다.`, c.id);
    sendMessage(state, {
      from: '품질팀 정주임',
      to: state.employee.name,
      subject: `[불량] ${m.name} 입고분 불량 ${defectQty.toLocaleString('ko-KR')}${m.unit}`,
      body: `입고 검사 결과 불량률 ${(defectRate * 100).toFixed(1)}%입니다. 업체 클레임 진행 부탁드립니다.`,
      caseId: c.id,
    });
  }
  if (mismatch) {
    logEvent(
      state,
      'finance',
      'mgmt',
      `정산 불일치 (${po.id})`,
      `발주서 단가 ${won(po.unitPriceEntered)}와 업체 청구 단가 ${won(po.unitPriceAgreed)}가 다릅니다. 원인 확인과 수정 발주가 필요합니다.`,
      c.id,
    );
    sendMessage(state, {
      from: '재무팀 한사원',
      to: state.employee.name,
      subject: `[확인요청] ${po.id} 발주 단가와 청구 단가 불일치`,
      body: `발주서 단가 ${won(po.unitPriceEntered)}, 청구서 단가 ${won(po.unitPriceAgreed)}입니다.\n확인 후 수정 부탁드립니다.`,
      caseId: c.id,
    });
  }
  enterStage(state, c, 'inspect');
}
