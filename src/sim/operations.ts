import { unlockConcept } from './learning';
import { makeRng } from './rng';
import { dailyUsage, demandToday } from './market';
import { createCase } from './purchasing';
import type { GameState, MaterialId } from './types';
import { isMonthEnd, isMonthStart, logEvent, nextId, sendMessage, won } from './util';

/**
 * 구매팀 바깥의 부서 활동. 구매 결정의 결과가 여기서 비용·현금·재고·매출로 나타난다.
 * 회계는 단순화했지만 원칙은 지킨다 (기획서 7장 재무 표현 유의사항):
 *  - 매출은 출고 시 인식, 현금은 매출채권 회수일에 들어온다.
 *  - 원료 구매는 재고자산으로 들어가고 사용될 때 매출원가가 된다.
 *  - 구매 대금은 결제조건에 따라 지급일에 현금이 나간다.
 */

/** 회사의 평균 리드타임 추정치 (재주문점 계산용) */
function expectedLead(state: GameState, id: MaterialId): number {
  const sups = state.suppliers.filter((s) => s.materialIds.includes(id));
  const lead = sups.reduce((a, s) => a + s.leadTimeDays, 0) / Math.max(1, sups.length);
  // 요청 → 견적 → 승인까지 행정 소요 약 4영업일
  return lead + 4;
}

export function reorderPoint(state: GameState, id: MaterialId): number {
  const m = state.materials[id];
  return dailyUsage(state, id) * (expectedLead(state, id) + m.safetyDays);
}

export function onOrderQty(state: GameState, id: MaterialId): number {
  return state.cases
    .filter((c) => c.materialId === id && c.stage !== 'done' && c.stage !== 'cancelled' && c.stage !== 'inspect')
    .reduce((a, c) => a + c.qty, 0);
}

export function runFinance(state: GameState): void {
  const f = state.finance;
  const due = f.receivables.filter((r) => r.day <= state.day);
  for (const r of due) f.cash += r.amount;
  f.receivables = f.receivables.filter((r) => r.day > state.day);
  const pay = f.payables.filter((p) => p.day <= state.day);
  for (const p of pay) f.cash -= p.amount;
  f.payables = f.payables.filter((p) => p.day > state.day);
  f.cash -= state.company.fixedCostPerDay;
  f.fixedCostCum += state.company.fixedCostPerDay;
  if (isMonthStart(state.startDate, state.day)) f.monthSpend = 0;
}

export interface ProductionResult {
  demand: number;
  produced: number;
  shortMaterial?: MaterialId;
}

export function runProduction(state: GameState): ProductionResult {
  const demand = demandToday(state);
  const target = Math.min(demand, state.company.capacityPerDay);
  let possible = target;
  let shortMaterial: MaterialId | undefined;
  for (const m of Object.values(state.materials)) {
    const can = Math.floor(m.stock / m.usagePerProduct);
    if (can < possible) {
      possible = can;
      shortMaterial = m.id;
    }
  }
  const produced = Math.max(0, possible);
  let cogs = 0;
  for (const m of Object.values(state.materials)) {
    const used = produced * m.usagePerProduct;
    m.stock = Math.max(0, m.stock - used);
    cogs += used * m.avgCost;
  }
  const revenue = produced * state.company.productPrice;
  state.finance.revenueCum += revenue;
  state.finance.cogsCum += cogs;
  state.finance.receivables.push({ day: state.day + 22, amount: revenue });

  if (produced < target && shortMaterial) {
    state.stats.stockoutDays += 1;
    unlockConcept(state, 'stockout');
    const lost = (target - produced) * state.company.productPrice;
    logEvent(
      state,
      'stockout',
      'production',
      `${state.materials[shortMaterial].name} 부족으로 생산 차질`,
      `계획 ${target.toLocaleString('ko-KR')}세트 중 ${produced.toLocaleString('ko-KR')}세트만 생산. 매출 손실 약 ${won(lost)}.`,
    );
  }
  return { demand, produced, shortMaterial };
}

/** 생산팀의 구매 요청: 재고 + 발주 진행분이 재주문점 아래면 요청한다 */
export function checkReorders(state: GameState): void {
  for (const m of Object.values(state.materials)) {
    const usage = dailyUsage(state, m.id);
    const rop = reorderPoint(state, m.id);
    const pipeline = onOrderQty(state, m.id);
    const daysLeft = m.stock / Math.max(1, usage);
    const open = state.cases.filter((c) => c.materialId === m.id && c.stage !== 'done' && c.stage !== 'cancelled' && c.stage !== 'inspect');
    if (m.stock + pipeline >= rop) continue;
    const urgent = daysLeft < expectedLead(state, m.id) - 1;
    // 이미 진행 중인 요청이 있으면 긴급 상황에서만 추가 요청
    if (open.length > 0 && !(urgent && open.every((c) => !c.urgent) && m.stock + pipeline < usage * 4)) continue;
    const qty = Math.ceil((usage * m.orderCoverDays) / 100) * 100;
    const neededBy = state.day + Math.max(2, Math.floor(daysLeft) - 1);
    const reason = urgent
      ? `${m.name} 재고가 약 ${daysLeft.toFixed(1)}일분밖에 남지 않았습니다. 생산 차질이 우려됩니다.`
      : `${m.name} 재고가 재주문점(${Math.round(rop).toLocaleString('ko-KR')}${m.unit}) 아래로 내려갔습니다. 현재 약 ${daysLeft.toFixed(1)}일분.`;
    createCase(state, m.id, qty, neededBy, urgent, reason);
  }
}

/** 월말 구매 실적 보고 (반복 문서 업무: 향후 개선 도구 대상) */
export function scheduleMonthlyWork(state: GameState): void {
  if (isMonthEnd(state.startDate, state.day)) {
    state.backlog.push({
      id: nextId(state, 'BL'),
      kind: 'report',
      title: '월간 구매 실적 보고서 작성',
      createdDay: state.day,
      dueDay: state.day + 2,
      minutesLeft: 150,
      minutesTotal: 150,
    });
    sendMessage(state, {
      from: '구매팀 이팀장',
      to: state.employee.name,
      subject: '[요청] 월간 구매 실적 보고',
      body: '이번 달 구매 실적(구매액, 절감액, 납기·품질 이슈) 정리해서 이틀 안에 공유 부탁해요.',
    });
  }
}

const ADHOC_TEMPLATES: { title: string; from: string; min: number; max: number }[] = [
  { title: '생산팀 원료 사양 문의 회신', from: '생산팀', min: 20, max: 45 },
  { title: '업체 영업 담당자 미팅', from: '공급업체', min: 45, max: 90 },
  { title: 'ERP 단가 마스터 갱신', from: '구매팀', min: 30, max: 60 },
  { title: '재무팀 매입 증빙 자료 요청 대응', from: '재무팀', min: 25, max: 50 },
  { title: '신규 공급업체 소개 자료 검토', from: '구매팀', min: 30, max: 60 },
  { title: '품질팀 시험성적서 요청 전달', from: '품질팀', min: 15, max: 30 },
  { title: '물류팀 입고 일정 조율', from: '물류팀', min: 20, max: 40 },
  { title: '영업팀 신제품 원가 문의 대응', from: '영업팀', min: 40, max: 80 },
  { title: '팀장 지시 단가 이력 정리', from: '구매팀 이팀장', min: 40, max: 70 },
];

/**
 * 구매 건 외의 일상 업무. 실제 담당자의 하루는 구매 건 처리만으로 채워지지 않는다.
 * 도구가 시간을 아껴 줘야 의미가 있으려면 담당자에게 업무 부하가 있어야 한다.
 * 난수 키에 날짜만 쓰므로 도구 적용 여부와 무관하게 같은 업무가 생긴다.
 */
export function generateAdhocWork(state: GameState): void {
  const rng = makeRng(state.seed, 'adhoc', state.day);
  const count = rng.int(3, 6);
  for (let i = 0; i < count; i++) {
    const t = rng.pick(ADHOC_TEMPLATES);
    const minutes = rng.int(t.min, t.max);
    state.backlog.push({
      id: nextId(state, 'BL'),
      kind: 'adhoc',
      title: t.title,
      from: t.from,
      createdDay: state.day,
      dueDay: state.day + rng.int(1, 3),
      minutesLeft: minutes,
      minutesTotal: minutes,
    });
  }
}
