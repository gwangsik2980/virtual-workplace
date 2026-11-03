import { chat } from './chat';
import { unlockConcept } from './learning';
import { dailyUsage } from './market';
import { makeRng } from './rng';
import type { BacklogItem, GameState, PurchaseCase, Supplier } from './types';
import { addStat, chargeExpense, formatDay, logEvent, nextId, sendMessage, won } from './util';

/**
 * 손해 보는 상황: 불량 처리, 생산 중 불량, 긴급 현물 구매.
 * 수치는 모두 가정치다 (docs/ASSUMPTIONS.md "손실 상황").
 * 난수 키에는 구매 건·날짜·원료만 넣는다 (도구 적용 여부는 넣지 않는다).
 */

/** 불량 반품에 드는 회사 몫 비용 (운송 대기, 재검사, 격리 보관). 불량 금액 대비. 가정치 */
export const RETURN_HANDLING_RATE = 0.15;
/** 검수를 통과했다가 생산 중에 드러나는 불량의 발생 확률 = 업체 평균 불량률 × 이 배수 (최대 15%). 가정치 */
export const LATENT_DEFECT_FACTOR = 4;
/** 생산 중 불량 폐기 처리비 (폐기 원료 금액 대비). 가정치 */
export const SCRAP_DISPOSAL_RATE = 0.03;
/** 생산 중 불량 클레임으로 업체가 보상하는 비율 범위. 가정치 */
export const CLAIM_RECOVERY = [0.3, 0.8] as const;
/** 긴급 현물 구매 웃돈 범위 (시세 대비). 계약 밖 구매 손실 12~18% 자료에 맞춤 (docs/ASSUMPTIONS.md) */
export const SPOT_PREMIUM = [0.12, 0.18] as const;
/** 하루 안에 현물을 구할 수 있을 확률. 가정치 */
export const SPOT_AVAILABILITY = 0.6;
/** 긴급 현물 구매 업무 시간(분). 가정치 */
export const SPOT_MINUTES = 45;

/** 입고 검수에서 불량이 나왔을 때: 반품 처리비를 물고, 숨은 불량이 있을지 정한다 */
export function onDefectsReceived(state: GameState, c: PurchaseCase, s: Supplier, defectQty: number, accepted: number): void {
  const po = c.po!;
  if (defectQty > 0) {
    const cost = defectQty * po.unitPriceAgreed * RETURN_HANDLING_RATE;
    chargeExpense(state, cost);
    addStat(state, 'defectHandlingKRW', Math.round(cost));
  }
  const rng = makeRng(state.seed, 'latent', c.id);
  const p = Math.min(0.15, s.defectRate * LATENT_DEFECT_FACTOR);
  if (accepted > 0 && rng.chance(p)) {
    c.latentDefect = { day: state.day + rng.int(2, 8), qty: Math.round(accepted * rng.range(0.1, 0.3)) };
  }
}

/** 생산 전에: 오늘 드러나는 숨은 불량을 처리한다 (원료 폐기, 생산 차질 위험, 손실 보상 클레임) */
export function checkLatentDefects(state: GameState): void {
  for (const c of state.cases) {
    const ld = c.latentDefect;
    if (!ld || ld.found || ld.day > state.day) continue;
    ld.found = true;
    const m = state.materials[c.materialId];
    const qty = Math.min(ld.qty, m.stock);
    if (qty <= 0) continue;
    const s = state.suppliers.find((x) => x.id === c.po!.supplierId)!;
    const value = qty * m.avgCost;
    m.stock -= qty;
    // 재고는 이미 돈을 낸 자산이라 장부에서만 덜어내고, 폐기 처리비는 현금으로 나간다
    chargeExpense(state, value, false);
    chargeExpense(state, value * SCRAP_DISPOSAL_RATE);
    addStat(state, 'scrapKRW', Math.round(value * (1 + SCRAP_DISPOSAL_RATE)));
    addStat(state, 'qualityIncidents', 1);
    unlockConcept(state, 'claim');
    state.backlog.push({
      id: nextId(state, 'BL'),
      kind: 'claim',
      claimType: 'production',
      claimAmount: Math.round(value),
      title: `${s.name} 생산 불량 손실 보상 청구 (${c.id})`,
      createdDay: state.day,
      dueDay: state.day + 3,
      minutesLeft: 60,
      minutesTotal: 60,
      caseId: c.id,
    });
    logEvent(
      state,
      'quality',
      'quality',
      `생산 중 ${m.name} 이물·규격 불량 발견`,
      `${s.name} 입고분(${c.id}) 중 ${qty.toLocaleString('ko-KR')}${m.unit}를 폐기했습니다. 손실 약 ${won(value)}.`,
      c.id,
    );
    chat(state, 'qa', [
      ['them', [`생산 중에 ${s.name} ${m.name}에서 이물이 나와서 ${qty.toLocaleString('ko-KR')}${m.unit} 폐기했어요. 손실 보상 청구 부탁드립니다.`, `${m.name} 투입하다가 규격 벗어난 게 나와서 ${qty.toLocaleString('ko-KR')}${m.unit} 버렸어요. ${s.name} 로트예요.`]],
      ['me', ['확인했습니다. 로트 번호랑 사진 보내 주시면 오늘 바로 청구할게요.', '아이고, 알겠습니다. 폐기 내역서 주시면 업체에 보상 요청하겠습니다.']],
    ], c.id);
    sendMessage(state, {
      from: '품질팀 정주임',
      to: `${state.employee.name}, 생산팀`,
      subject: `[긴급] ${m.name} 생산 중 불량 발견, ${qty.toLocaleString('ko-KR')}${m.unit} 폐기`,
      body: `생산 투입 과정에서 ${s.name} 입고분에 불량이 확인되어 해당 로트를 폐기하였음을 알려 드립니다.\n\n- 폐기 수량: ${qty.toLocaleString('ko-KR')}${m.unit}\n- 폐기 금액: 약 ${won(value)}\n\n번거로우시겠지만 업체에 손실 보상 청구를 진행해 주시기 바랍니다.`,
      caseId: c.id,
    });
  }
}

/** 클레임 업무를 마쳤을 때: 입고 불량은 대체 납품, 생산 불량은 손실 일부 보상 */
export function finishClaim(state: GameState, b: BacklogItem): void {
  const c = state.cases.find((x) => x.id === b.caseId);
  if (!c?.po) return;
  const s = state.suppliers.find((x) => x.id === c.po!.supplierId)!;
  const m = state.materials[c.materialId];
  if (b.claimType === 'production') {
    const rng = makeRng(state.seed, 'recovery', c.id);
    const recovered = Math.round((b.claimAmount ?? 0) * rng.range(CLAIM_RECOVERY[0], CLAIM_RECOVERY[1]));
    chargeExpense(state, -recovered);
    addStat(state, 'claimRecoveredKRW', recovered);
    sendMessage(state, {
      from: s.name,
      to: state.employee.name,
      subject: `RE: ${c.po.id} 불량 손실 보상 건`,
      body: `먼저 불편을 끼쳐 드린 점 진심으로 사과드립니다.\n협의 결과에 따라 아래와 같이 처리하겠습니다.\n\n- 보상 금액: ${won(recovered)}\n- 처리 방법: 다음 대금에서 차감\n\n같은 일이 다시 없도록 품질 관리에 더욱 힘쓰겠습니다.`,
      caseId: c.id,
    });
    logEvent(state, 'quality', 'purchasing', `${s.name} 불량 손실 일부 보상 (${c.id})`, `청구 ${won(b.claimAmount ?? 0)} 중 ${won(recovered)} 보상 합의.`, c.id);
    return;
  }
  // 입고 검수 불량: 업체가 같은 수량을 다시 보낸다 (리드타임의 절반쯤)
  const qty = c.delivery?.defectQty ?? 0;
  if (qty <= 0) return;
  const arriveDay = state.day + Math.max(1, Math.ceil(s.leadTimeDays / 2));
  state.inbound.push({
    id: nextId(state, 'IN'),
    kind: 'replacement',
    materialId: c.materialId,
    qty,
    unitPrice: c.po.unitPriceAgreed,
    arriveDay,
    supplierName: s.name,
    caseId: c.id,
  });
  sendMessage(state, {
    from: s.name,
    to: state.employee.name,
    subject: `RE: ${c.po.id} 불량 클레임 건`,
    body: `불량으로 불편을 드려 대단히 죄송합니다.\n말씀해 주신 건은 아래와 같이 조치하겠습니다.\n\n- 불량분 ${qty.toLocaleString('ko-KR')}${m.unit}: 회수\n- 대체품 입고 예정일: ${formatDay(state.startDate, arriveDay)}\n\n재발하지 않도록 출하 검사를 강화하겠습니다.`,
    caseId: c.id,
  });
}

/** 대체 납품·긴급 현물 구매 입고 (생산 전) */
export function receiveInbound(state: GameState): void {
  const due = state.inbound.filter((l) => l.arriveDay <= state.day);
  if (due.length === 0) return;
  state.inbound = state.inbound.filter((l) => l.arriveDay > state.day);
  for (const l of due) {
    const m = state.materials[l.materialId];
    const newStock = m.stock + l.qty;
    m.avgCost = newStock > 0 ? (m.avgCost * m.stock + l.unitPrice * l.qty) / newStock : l.unitPrice;
    m.stock = newStock;
    // 대체 납품분은 원래 불량분 대금을 내지 않았으므로 이번에 지급한다. 현물 구매는 주문 때 이미 냈다
    if (l.kind === 'replacement') {
      const amount = l.unitPrice * l.qty;
      state.finance.payables.push({ day: state.day + 20, amount, poId: l.id });
      state.finance.purchaseCum += amount;
    }
    logEvent(
      state,
      'delivery',
      'logistics',
      `${m.name} ${l.kind === 'spot' ? '긴급 구매분' : '대체품'} 입고`,
      `${l.supplierName} ${l.qty.toLocaleString('ko-KR')}${m.unit} 입고.`,
      l.caseId,
    );
  }
}

/** 구매팀이 알고 있는 입고 예정일 (지연을 알기 전에는 약속일을 믿는다) */
function expectedArrival(c: PurchaseCase): number | undefined {
  if (c.stage !== 'awaitDelivery' || !c.po) return undefined;
  return c.delayKnownDay !== undefined ? c.po.actualArrivalDay : c.po.promisedDay;
}

/**
 * 생산 후에: 내일 생산분도 안 남았는데 내일까지 들어올 물량이 없으면, 시세보다 비싸게 현물을 사서 다음 날 받는다.
 * 결품은 막지만 웃돈만큼 원가가 오른다.
 */
export function emergencySpotBuy(state: GameState): void {
  for (const m of Object.values(state.materials)) {
    const usage = dailyUsage(state, m.id);
    if (m.stock >= usage) continue;
    const soon = (d: number | undefined) => d !== undefined && d <= state.day + 1;
    if (state.cases.some((c) => c.materialId === m.id && soon(expectedArrival(c)))) continue;
    if (state.inbound.some((l) => l.materialId === m.id && l.arriveDay <= state.day + 1)) continue;
    const rng = makeRng(state.seed, 'spot', m.id, state.day);
    if (!rng.chance(SPOT_AVAILABILITY)) {
      // 오늘은 못 구했다. 시간만 쓰고 내일 다시 찾는다
      addStat(state, 'spotFailures', 1);
      state.backlog.push({ id: nextId(state, 'BL'), kind: 'spot', title: `[긴급] ${m.name} 현물 수소문 (못 구함)`, createdDay: state.day, dueDay: state.day, minutesLeft: 30, minutesTotal: 30 });
      logEvent(state, 'stockout', 'purchasing', `${m.name} 현물을 구하지 못함`, `내일 생산분이 모자라는데 당장 받을 수 있는 물량을 찾지 못했습니다. 결품 위험이 있습니다.`);
      continue;
    }
    const market = state.market.prices[m.id];
    const premium = rng.range(SPOT_PREMIUM[0], SPOT_PREMIUM[1]);
    const unitPrice = Math.round(market * (1 + premium));
    const qty = Math.ceil((usage * 3) / 100) * 100;
    const amount = unitPrice * qty;
    state.finance.cash -= amount;
    state.finance.purchaseCum += amount;
    state.finance.monthSpend += amount;
    addStat(state, 'spotPremiumKRW', Math.round((unitPrice - market) * qty));
    addStat(state, 'spotBuys', 1);
    unlockConcept(state, 'spot-buy');
    state.inbound.push({ id: nextId(state, 'IN'), kind: 'spot', materialId: m.id, qty, unitPrice, arriveDay: state.day + 1, supplierName: '현물 도매상' });
    state.backlog.push({
      id: nextId(state, 'BL'),
      kind: 'spot',
      title: `[긴급] ${m.name} 현물 구매`,
      createdDay: state.day,
      dueDay: state.day,
      minutesLeft: SPOT_MINUTES,
      minutesTotal: SPOT_MINUTES,
    });
    logEvent(
      state,
      'order',
      'purchasing',
      `[긴급] ${m.name} 현물 구매 (시세 +${Math.round(premium * 100)}%)`,
      `재고가 내일 생산분(${Math.round(usage).toLocaleString('ko-KR')}${m.unit})에 못 미치고 내일까지 들어올 물량이 없어 ${qty.toLocaleString('ko-KR')}${m.unit}를 ${won(unitPrice)}/${m.unit}에 샀습니다. 웃돈 약 ${won((unitPrice - market) * qty)}.`,
    );
    chat(state, 'lead', [
      ['me', [`팀장님, ${m.name} 내일 생산분이 모자라서 현물로 ${qty.toLocaleString('ko-KR')}${m.unit} 샀습니다. 시세보다 ${Math.round(premium * 100)}% 비쌉니다.`, `팀장님, ${m.name} 급하게 현물로 구했습니다. ${qty.toLocaleString('ko-KR')}${m.unit}, 시세 대비 +${Math.round(premium * 100)}%입니다.`]],
      ['them', ['라인 서는 것보단 낫죠. 사후 품의 오늘 중으로 올리고, 왜 모자랐는지도 같이 적어 줘요.', '잘했어요. 대신 현물 자꾸 쓰면 원가 올라가니까 재주문 시점 다시 봐 줘요.']],
    ]);
    sendMessage(state, {
      from: '생산팀 김대리',
      to: state.employee.name,
      subject: `[긴급] ${m.name} 내일 생산분 부족`,
      body: `${m.name} 재고가 내일 생산 계획량에 미치지 못할 것으로 확인되어 급히 연락드립니다.\n단가가 다소 높더라도 내일 입고가 가능한 곳에서 확보해 주시면 감사하겠습니다.`,
    });
  }
}
