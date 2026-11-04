import { runComparison, skillTimeFactor } from './compare';
import { gainExperience } from './employee';
import { unlockConcept } from './learning';
import { chat } from './chat';
import { onDefectsReceived } from './losses';
import { generateQuote } from './quotes';
import { makeRng } from './rng';
import type { GameState, MaterialId, PurchaseCase, SkillId, Stage } from './types';
import { addStat, formatDay, formatDayShort, logEvent, nextId, sendMessage, won } from './util';

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

/** 시세 상승기에 업체가 견적 후 인상을 요구할 확률과 요구 폭. 가정치 */
export const PRICE_UP_CHANCE = 0.45;
export const PRICE_UP_RANGE = [0.02, 0.05] as const;

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
  /** true면 메신저 대화를 남기지 않는다. 같은 날 요청 여러 건을 requestChats로 한 번에 묶을 때 쓴다 */
  quiet = false,
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
    body: `${reason}\n아래와 같이 구매를 요청드립니다.\n\n- 품목: ${m.name}\n- 수량: ${qty.toLocaleString('ko-KR')}${m.unit}\n- 필요일: ${formatDay(state.startDate, neededByDay)}\n\n검토 후 진행 부탁드립니다.`,
    caseId: c.id,
  });
  if (!quiet) requestChats(state, [c]);
  return c;
}

/**
 * 생산팀의 구매 요청 대화. 같은 날 여러 건이면 한 메시지에 목록으로 묶고, GWANG도 한 번에 답한다.
 * (예전에는 건마다 묻고 답해서 몇 분 사이에 '요청 → 답 → 요청 → 답'이 다섯 번씩 오갔다)
 * 긴급 건이 있으면 팀장도 한 번만 짚는다.
 */
export function requestChats(state: GameState, cases: PurchaseCase[]): void {
  if (cases.length === 0) return;
  const name = (c: PurchaseCase) => state.materials[c.materialId].name;
  const need = (c: PurchaseCase) => formatDayShort(state.startDate, c.neededByDay);
  const list = (cs: PurchaseCase[]) => cs.map((c) => `${name(c)} ${need(c)}`).join(', ');
  const urgent = cases.filter((c) => c.urgent);
  const normal = cases.filter((c) => !c.urgent);
  const first = urgent[0] ?? cases[0];
  // 요청은 출근해서 재고를 본 뒤에 올라온다. 출근 직후 사건(결품 등)과 같은 분에 겹치지 않게 조금 뒤로 둔다 (말 시각만 바뀐다)
  const saved = state.nowMinute;
  state.nowMinute = Math.max(saved ?? 0, makeRng(state.seed, 'reqchat', state.day).int(8, 35));
  const n = cases.length;

  if (n === 1) {
    const c = cases[0];
    const m = name(c);
    const d = need(c);
    if (c.urgent) {
      chat(state, 'prod', [
        ['them', [`GWANG님 ${m} 재고가 거의 바닥이에요. 방금 긴급으로 요청 올렸습니다. ${d}까지는 꼭 들어와야 해요.`, `${m} 긴급 요청 넣었어요! ${d} 넘으면 라인 멈춰요.`, `급해요 ㅠ ${m} 며칠분 안 남았어요. ${d}까지 부탁드립니다.`]],
        ['me', ['네 확인했습니다. 오늘 바로 견적 돌려서 제일 빨리 되는 곳으로 잡아볼게요.', '봤습니다. 납기 되는 업체 위주로 바로 알아볼게요.', '알겠습니다. 오늘 중으로 어디서 받을지 말씀드릴게요.']],
      ], c.id);
    } else {
      chat(state, 'prod', [
        ['them', [`${m} 구매요청 올렸어요. 필요일은 ${d}입니다.`, `${m} 요청 넣었습니다~ ${d}까지만 들어오면 돼요.`, `GWANG님 ${m} 구매요청 하나 올렸어요. 필요일 ${d}이요.`]],
        ['me', ['확인했습니다. 견적 받아보고 일정 말씀드릴게요.', '네 봤습니다. 업체 확인하고 입고일 알려 드릴게요.', '접수했어요. 진행되면 공유드릴게요.']],
      ], c.id);
    }
  } else if (urgent.length === 0) {
    chat(state, 'prod', [
      ['them', [`GWANG님 구매요청 ${n}건 올렸어요.\n${list(normal)}까지 필요해요.`, `오늘 요청 ${n}건 넣었습니다~\n${list(normal)}\n날짜까지만 들어오면 돼요.`]],
      ['me', [`네 ${n}건 다 확인했습니다. 견적 받아보고 입고일 정리해서 한 번에 말씀드릴게요.`, `접수했어요. ${n}건 업체 확인해서 일정 같이 공유드릴게요.`]],
    ], first.id);
  } else if (normal.length === 0) {
    chat(state, 'prod', [
      ['them', [`급해요 ㅠ 긴급 요청 ${n}건 넣었어요.\n${list(urgent)}\n이날 넘으면 라인 멈춰요.`, `GWANG님 긴급 ${n}건 올렸습니다. ${list(urgent)}까지는 꼭 들어와야 해요.`]],
      ['me', [`네 ${n}건 다 봤습니다. 오늘 바로 견적 돌려서 빨리 되는 곳으로 잡고, 어디서 받을지 한 번에 말씀드릴게요.`, `확인했어요. 납기 되는 업체 위주로 ${n}건 같이 알아보고 오늘 안에 알려 드릴게요.`]],
    ], first.id);
  } else {
    const un = urgent.map(name).join(', ');
    chat(state, 'prod', [
      ['them', [`GWANG님 구매요청 ${n}건 올렸어요.\n긴급: ${list(urgent)}\n일반: ${list(normal)}\n긴급 건은 그날 넘으면 라인 멈춰요 ㅠ`, `오늘 요청 ${n}건이에요. ${un} 재고가 거의 바닥이라 긴급으로 올렸고 (${list(urgent)}), 나머지는 ${list(normal)}까지만 들어오면 돼요.`]],
      ['me', [`네 ${n}건 다 확인했습니다. 긴급인 ${un} 먼저 오늘 견적 돌리고, 나머지는 업체 확인해서 입고일 같이 말씀드릴게요.`, `봤습니다. ${un}부터 납기 되는 곳으로 잡고, 일반 건은 견적 받아서 한 번에 공유드릴게요.`]],
    ], first.id);
  }

  if (urgent.length === 1) {
    const m = name(urgent[0]);
    chat(state, 'lead', [
      ['them', [`${m} 긴급 건 봤어요. 단가보다 납기 우선으로 보고, 진행 상황 수시로 공유해 줘요.`, `${m} 긴급이라면서요? 이번엔 몇 % 비싸도 빨리 오는 데로 가요.`, `${m} 건은 오늘 견적 받으면 바로 나한테 보고해요. 품의는 빨리 봐 줄게요.`]],
      ['me', ['네 팀장님, 견적 받는 대로 보고드리겠습니다.', '네, 납기 기준으로 추려서 말씀드리겠습니다.', '알겠습니다. 오후에 한 번 중간 보고드릴게요.']],
    ], urgent[0].id);
  } else if (urgent.length > 1) {
    const un = urgent.map(name).join(', ');
    chat(state, 'lead', [
      ['them', [`오늘 긴급이 ${urgent.length}건이네요 (${un}). 이번엔 단가보다 납기 우선으로 보고, 견적 나오면 한 번에 보고해 줘요.`, `${un} 긴급 건 봤어요. 몇 % 비싸도 빨리 오는 데로 가고, 품의는 묶어서 올려 주면 빨리 볼게요.`]],
      ['me', [`네 팀장님, ${urgent.length}건 견적 받는 대로 같이 정리해서 보고드리겠습니다.`, `알겠습니다. 납기 기준으로 추려서 오후에 한 번에 말씀드릴게요.`]],
    ], urgent[0].id);
  }
  state.nowMinute = saved;
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
      const cands = state.suppliers.filter((s) => s.materialIds.includes(c.materialId) && s.active !== false);
      c.rfqSupplierIds = cands.map((s) => s.id);
      for (const s of cands) {
        sendMessage(state, {
          from: state.employee.name,
          to: s.name,
          subject: `[견적요청] ${m.name} ${c.qty.toLocaleString('ko-KR')}${m.unit}`,
          body: `아래 조건으로 견적을 요청드립니다.\n\n- 품목: ${m.name}\n- 수량: ${c.qty.toLocaleString('ko-KR')}${m.unit}\n- 희망 납기: ${formatDay(state.startDate, c.neededByDay)}\n\n바쁘시겠지만 견적서 회신 부탁드립니다.`,
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
      const initial = q.truth.unitPriceKRW;
      // 시세가 오르는 중이면 업체가 견적 뒤에 인상을 요구할 수 있다. 협상력(ratio)만큼 막아낸다
      const upRng = makeRng(state.seed, 'nego-up', c.id, s.id);
      const rising =
        state.market.shocks.some((x) => x.materialId === c.materialId && x.drift > 0) ||
        state.market.prices[c.materialId] > (c.marketPriceAtStart ?? Infinity) * 1.02;
      const requested = rising && upRng.chance(PRICE_UP_CHANCE) ? upRng.range(PRICE_UP_RANGE[0], PRICE_UP_RANGE[1]) : 0;
      if (requested > 0) {
        const up = requested * (1 - ratio * 0.8);
        const final = Math.round(initial * (1 + up));
        c.negotiation = { initialPrice: initial, finalPrice: final, discountRate: -up };
        c.priceIncrease = { requested, final: up };
        addStat(state, 'priceIncreaseKRW', Math.round((final - initial) * c.qty));
        addStat(state, 'priceIncreaseCases', 1);
        unlockConcept(state, 'price-increase');
        sendMessage(state, {
          from: s.name,
          to: state.employee.name,
          subject: `RE: 단가 조정 요청 건 (${c.id}) - 원자재 상승으로 인상 요청`,
          body: `원자재 가격 상승으로 기존 견적 단가를 유지하기 어려운 상황이 되어 양해를 구합니다.\n당초 ${(requested * 100).toFixed(1)}% 인상을 요청드렸으나, 말씀해 주신 사정을 고려하여 ${(up * 100).toFixed(1)}%만 반영하고자 합니다.\n\n- 변경 전: ${won(initial)}/${m.unit}\n- 변경 후: ${won(final)}/${m.unit}\n\n너그러운 이해 부탁드립니다.`,
          caseId: c.id,
        });
        chat(state, 'lead', [
          ['me', [`팀장님, ${s.name}에서 ${m.name} 단가를 ${(requested * 100).toFixed(1)}% 올려 달라고 합니다. 협상해서 ${(up * 100).toFixed(1)}%까지 낮췄습니다.`, `팀장님, ${s.name}이 ${m.name} 원료값 올랐다고 ${(requested * 100).toFixed(1)}% 인상 요청해서 ${(up * 100).toFixed(1)}%로 합의했습니다.`]],
          ['them', ['원자재 오른 건 맞으니 어느 정도는 어쩔 수 없죠. 다음 견적 때는 다른 업체도 꼭 같이 받아 봐요.', '수고했어요. 시세 내려가면 다시 낮춰 달라고 요청할 수 있게 근거 남겨 둬요.']],
        ], c.id);
        logEvent(state, 'market', 'purchasing', `${s.name} ${m.name} 단가 인상 요구 (${c.id})`, `요구 ${(requested * 100).toFixed(1)}%, 협상 후 ${(up * 100).toFixed(1)}% 인상으로 합의.`, c.id);
        enterStage(state, c, 'approve');
        break;
      }
      const discount = s.negotiationRoom * ratio * (c.urgent ? 0.6 : 1);
      const final = Math.round(initial * (1 - discount));
      c.negotiation = { initialPrice: initial, finalPrice: final, discountRate: discount };
      sendMessage(state, {
        from: s.name,
        to: state.employee.name,
        subject: `RE: 단가 조정 요청 건 (${c.id})`,
        body: `말씀해 주신 내용 검토하였습니다.\n아래와 같이 단가를 조정해 드리겠습니다.\n\n- 변경 전: ${won(initial)}/${m.unit}\n- 변경 후: ${won(final)}/${m.unit} (${(discount * 100).toFixed(1)}% 인하)\n\n앞으로도 잘 부탁드립니다.`,
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
        body: `아래와 같이 발주서를 송부드립니다.\n\n- 품목: ${m.name}\n- 수량: ${c.qty.toLocaleString('ko-KR')}${m.unit}\n- 단가: ${won(unitPriceEntered)}/${m.unit}\n- 납기: ${formatDay(state.startDate, promised)}\n- 결제: 납품 후 ${q.truth.paymentTermsDays}일\n\n납기 준수 부탁드리며, 일정에 변동이 생기면 미리 알려 주시기 바랍니다.`,
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
    // 양수 = 구매 기간 중 시장가격 상승분. 구매 활동과 무관한 변화라 절감액과 분리해 기록한다
    marketMoveKRW: Math.round((marketNow - (c.marketPriceAtStart ?? marketNow)) * accepted),
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
          body: q.scanned ? '요청하신 견적서를 스캔본으로 첨부드립니다.\n검토 부탁드립니다.' : '요청하신 견적서를 첨부드립니다.\n검토 부탁드립니다.',
          caseId: c.id,
          quoteId: q.id,
        });
      }
      enterStage(state, c, 'compare');
    } else if (c.stage === 'approve' && c.waitUntilDay !== undefined && state.day >= c.waitUntilDay) {
      // 금액이 큰 품의만 팀장이 메신저로 따로 말한다 (매번 오면 대화방이 승인 알림으로 도배된다)
      if (c.negotiation && c.negotiation.finalPrice * c.qty > 30_000_000) {
        chat(state, 'lead', [
          ['them', [`${c.id} ${state.materials[c.materialId].name} 품의 승인했어요. 금액이 커서 재무팀에도 공유해 뒀으니 발주 진행하세요.`, `${c.id} 승인 났어요. 금액 커서 결제 일정은 재무팀이랑 한 번 맞춰 줘요.`]],
          ['me', ['감사합니다. 바로 발주서 보내겠습니다.', '네, 발주 넣고 재무팀에도 공유하겠습니다.']],
        ], c.id);
      }
      sendMessage(state, {
        from: '구매팀 이팀장',
        to: state.employee.name,
        subject: `[승인] ${c.id} 품의 승인`,
        body: '품의 내용 확인하였습니다.\n승인하오니 진행해 주시기 바랍니다.',
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
  if (late) {
    state.stats.deliveriesLate += 1;
    state.stats.lateDaysSum += state.day - po.promisedDay;
  }
  else state.stats.deliveriesOnTime += 1;
  state.stats.defectQty += defectQty;
  state.stats.receivedQtyByMaterial[c.materialId] = (state.stats.receivedQtyByMaterial[c.materialId] ?? 0) + po.qty;
  if (mismatch) state.stats.invoiceMismatches += 1;
  onDefectsReceived(state, c, s, defectQty, accepted);

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
  if (late) {
    chat(state, 'logi', [
      ['them', [`${m.name} 이제 들어왔어요. 약속일보다 ${state.day - po.promisedDay}일 늦었네요.`, `${m.name} 방금 하차했어요. ${state.day - po.promisedDay}일 늦게 왔네요.`, `늦었던 ${m.name} 입고 끝났습니다. 검수 넘겼어요.`]],
      ['me', ['고생 많으셨어요. 업체에 재발 방지 요청해 둘게요.', '감사합니다! 늦은 건 업체 평가에 반영해 둘게요.', '다행이네요. 다음엔 출하 전에 미리 확인하겠습니다.']],
    ], c.id);
  }
  if (defectRate > 0.02) {
    chat(state, 'qa', [
      ['them', [`${m.name} 입고분 검사했는데 불량률 ${(defectRate * 100).toFixed(1)}% 나왔어요. 불량분은 격리해 뒀습니다. 클레임 부탁드려요.`, `이번 ${m.name} 상태가 안 좋아요. 불량 ${(defectRate * 100).toFixed(1)}%라서 따로 빼 뒀어요.`, `${m.name} 검사 결과 불량률 ${(defectRate * 100).toFixed(1)}%예요. 기준 넘어서 반품해야 할 것 같아요.`]],
      ['me', [`네, ${s.name}에 대체 납품 요청하겠습니다. 사진 몇 장만 보내 주세요.`, `알겠습니다. ${s.name}에 클레임 걸고 대체품 일정 받을게요.`, `확인했어요. 검사 성적서 보내 주시면 ${s.name}에 바로 전달할게요.`]],
    ], c.id);
    state.backlog.push({
      id: nextId(state, 'BL'),
      kind: 'claim',
      claimType: 'receiving',
      title: `${s.name} 불량 클레임, 대체 납품 요청 (${c.id})`,
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
      body: `입고 검사 결과를 아래와 같이 공유드립니다.\n\n- 불량 수량: ${defectQty.toLocaleString('ko-KR')}${m.unit}\n- 불량률: ${(defectRate * 100).toFixed(1)}%\n\n번거로우시겠지만 업체 클레임 진행 부탁드립니다.`,
      caseId: c.id,
    });
  }
  if (mismatch) {
    chat(state, 'fin', [
      ['them', [`${po.id} 발주서 단가랑 업체 청구 단가가 달라요. 어느 쪽이 맞는 거예요?`, `GWANG님, ${po.id} 정산하려는데 단가가 안 맞아요. 확인 부탁드려요.`]],
      ['me', ['확인해 보니 제가 비교표에 잘못 옮긴 것 같아요. 수정 발주 올리겠습니다. 죄송합니다.', '아, 제가 단가 입력을 잘못했네요. 바로 고쳐서 다시 보내 드릴게요.']],
    ], c.id);
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
      body: `${po.id} 정산 과정에서 단가가 일치하지 않아 확인을 요청드립니다.\n\n- 발주서 단가: ${won(po.unitPriceEntered)}\n- 청구서 단가: ${won(po.unitPriceAgreed)}\n\n확인 후 수정 부탁드립니다.`,
      caseId: c.id,
    });
  }
  enterStage(state, c, 'inspect');
}
