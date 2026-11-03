import type { GameState, MaterialId } from '../../sim/types';
import { formatDay } from '../../sim/util';

/**
 * 월간 구매 실적 보고서 초안 생성.
 * 시뮬레이션 기록(구매 건, 입고, 이벤트)에서 숫자를 모아 보고서 본문을 만든다.
 * 담당자는 초안을 검토하고 코멘트만 보탠다.
 */

export interface ReportPeriod {
  fromDay: number;
  toDay: number;
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function monthPeriod(state: GameState, endDay: number): ReportPeriod {
  // endDay가 속한 달의 첫 영업일을 찾는다
  const month = formatDay(state.startDate, endDay).slice(0, 7);
  let from = endDay;
  while (from > 1 && formatDay(state.startDate, from - 1).slice(0, 7) === month) from--;
  return { fromDay: from, toDay: endDay };
}

export interface ReportFacts {
  ordersCount: number;
  orderAmount: number;
  closedCount: number;
  priceSaving: number;
  baselineAmount: number;
  deliveries: number;
  late: number;
  defectQty: number;
  receivedQty: number;
  stockoutDays: number;
  mismatches: number;
  byMaterial: { id: MaterialId; name: string; amount: number; saving: number }[];
  bySupplier: { name: string; amount: number; late: number; deliveries: number }[];
  issues: string[];
  risks: string[];
}

export function collectFacts(state: GameState, p: ReportPeriod): ReportFacts {
  const inRange = (d?: number) => d !== undefined && d >= p.fromDay && d <= p.toDay;
  const ordered = state.cases.filter((c) => inRange(c.po?.orderDay));
  const closed = state.cases.filter((c) => inRange(c.closedDay));
  const delivered = state.cases.filter((c) => inRange(c.delivery?.arrivedDay));
  const byMat = new Map<MaterialId, { amount: number; saving: number }>();
  for (const c of ordered) {
    const e = byMat.get(c.materialId) ?? { amount: 0, saving: 0 };
    e.amount += c.po!.amountKRW;
    byMat.set(c.materialId, e);
  }
  for (const c of closed) {
    const e = byMat.get(c.materialId) ?? { amount: 0, saving: 0 };
    e.saving += c.savings?.priceSavingKRW ?? 0;
    byMat.set(c.materialId, e);
  }
  const bySup = new Map<string, { amount: number; late: number; deliveries: number }>();
  for (const c of ordered) {
    const s = state.suppliers.find((x) => x.id === c.po!.supplierId)!;
    const e = bySup.get(s.name) ?? { amount: 0, late: 0, deliveries: 0 };
    e.amount += c.po!.amountKRW;
    bySup.set(s.name, e);
  }
  for (const c of delivered) {
    const s = state.suppliers.find((x) => x.id === c.po!.supplierId)!;
    const e = bySup.get(s.name) ?? { amount: 0, late: 0, deliveries: 0 };
    e.deliveries += 1;
    if (c.delivery!.late) e.late += 1;
    bySup.set(s.name, e);
  }
  const events = state.events.filter((e) => inRange(e.day));
  const issues = events
    .filter((e) => e.type === 'stockout' || e.type === 'delay' || e.type === 'quality' || e.type === 'finance')
    .map((e) => `${formatDay(state.startDate, e.day)} ${e.title}`);
  const risks: string[] = [];
  for (const sh of state.market.shocks.filter((s) => s.until > p.toDay)) {
    risks.push(`${state.materials[sh.materialId].name} 시세 ${sh.drift > 0 ? '상승' : '하락'} 흐름이 ${formatDay(state.startDate, sh.until)}경까지 이어질 전망 (가상 시황)`);
  }
  if (state.market.demandBoostUntil > p.toDay) risks.push(`판촉으로 ${formatDay(state.startDate, state.market.demandBoostUntil)}까지 원료 사용량 증가`);
  const urgentOpen = state.cases.filter((c) => c.urgent && c.stage !== 'done').length;
  if (urgentOpen) risks.push(`진행 중인 긴급 구매 ${urgentOpen}건`);

  return {
    ordersCount: ordered.length,
    orderAmount: ordered.reduce((a, c) => a + c.po!.amountKRW, 0),
    closedCount: closed.length,
    priceSaving: closed.reduce((a, c) => a + (c.savings?.priceSavingKRW ?? 0), 0),
    baselineAmount: closed.reduce((a, c) => a + (c.savings ? c.savings.baselinePrice * c.savings.qty : 0), 0),
    deliveries: delivered.length,
    late: delivered.filter((c) => c.delivery!.late).length,
    defectQty: delivered.reduce((a, c) => a + c.delivery!.defectQty, 0),
    receivedQty: delivered.reduce((a, c) => a + c.po!.qty, 0),
    stockoutDays: state.history.filter((h) => inRange(h.day) && h.shortMaterial).length,
    mismatches: delivered.filter((c) => c.delivery!.invoiceMismatch).length,
    byMaterial: [...byMat.entries()].map(([id, v]) => ({ id, name: state.materials[id].name, ...v })).sort((a, b) => b.amount - a.amount),
    bySupplier: [...bySup.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount),
    issues,
    risks,
  };
}

export function draftMonthlyReport(state: GameState, p: ReportPeriod): string {
  const f = collectFacts(state, p);
  const title = `${formatDay(state.startDate, p.toDay).slice(0, 7).replace('-', '년 ')}월 구매 실적 보고`;
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push(`기간: ${formatDay(state.startDate, p.fromDay)} ~ ${formatDay(state.startDate, p.toDay)} / 작성: 구매팀 ${state.employee.name}`);
  lines.push('');
  lines.push('## 1. 요약');
  lines.push(`- 발주 ${f.ordersCount}건, 발주액 ${won(f.orderAmount)}`);
  lines.push(
    `- 완료 ${f.closedCount}건, 가격 절감액 ${won(f.priceSaving)}${f.baselineAmount > 0 ? ` (절감률 ${pct(f.priceSaving / f.baselineAmount)}, 기준: 협상 전 최초 견적)` : ''}`,
  );
  lines.push(`- 입고 ${f.deliveries}건 중 납기 지연 ${f.late}건${f.deliveries ? ` (준수율 ${pct((f.deliveries - f.late) / f.deliveries)})` : ''}`);
  lines.push(`- 입고 불량률 ${f.receivedQty ? pct(f.defectQty / f.receivedQty) : '-'}, 결품 발생 ${f.stockoutDays}일, 정산 불일치 ${f.mismatches}건`);
  lines.push('');
  lines.push('## 2. 원료별 실적');
  if (f.byMaterial.length === 0) lines.push('- 해당 기간 발주 없음');
  for (const m of f.byMaterial) lines.push(`- ${m.name}: 발주액 ${won(m.amount)}, 절감액 ${won(m.saving)}`);
  lines.push('');
  lines.push('## 3. 공급업체별 실적');
  if (f.bySupplier.length === 0) lines.push('- 해당 기간 거래 없음');
  for (const s of f.bySupplier) lines.push(`- ${s.name}: 발주액 ${won(s.amount)}, 입고 ${s.deliveries}건 중 지연 ${s.late}건`);
  lines.push('');
  lines.push('## 4. 주요 이슈');
  if (f.issues.length === 0) lines.push('- 특이사항 없음');
  for (const i of f.issues.slice(0, 8)) lines.push(`- ${i}`);
  if (f.issues.length > 8) lines.push(`- 외 ${f.issues.length - 8}건`);
  lines.push('');
  lines.push('## 5. 다음 달 유의사항');
  if (f.risks.length === 0) lines.push('- 특이사항 없음');
  for (const r of f.risks) lines.push(`- ${r}`);
  lines.push('');
  lines.push('## 6. 담당자 코멘트');
  lines.push('- (검토 후 작성)');
  return lines.join('\n');
}
