import { makeRng } from './rng';
import type { GameState, Material, PurchaseCase, Quote, QuoteTerms, Supplier } from './types';
import { formatDay, nextId } from './util';

/**
 * 견적서 생성.
 * 업체마다 양식이 다르다. 이 차이가 수작업 입력 오류와 도구의 파싱 실패를 만드는 원인이다.
 *  A: 국문 표준 양식 (KRW/기준단위, VAT 별도)
 *  B: 영문 양식 (USD 단가 → 원화 환산 필요)
 *  C: 포장 단위 단가 + VAT 포함 (단위 환산과 부가세 제외 필요)
 *  D: 국문 양식이지만 절반가량이 스캔 이미지 (텍스트 추출 불가), 나머지는 띄어쓰기가 불규칙
 */

export const PACK_SIZE: Record<string, { size: number; label: string }> = {
  kg: { size: 20, label: '20kg 1포' },
  m: { size: 500, label: '500m 1롤' },
};

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function generateQuote(state: GameState, c: PurchaseCase, sup: Supplier): Quote {
  const rng = makeRng(state.seed, 'quote', c.id, sup.id);
  const m = state.materials[c.materialId];
  const market = state.market.prices[c.materialId];
  const urgentPremium = c.urgent ? 1.02 : 1;
  const unitPriceKRW = Math.round(market * sup.priceFactor * urgentPremium * (1 + 0.02 * rng.normal()));
  const truth: QuoteTerms = {
    unitPriceKRW,
    leadTimeDays: Math.max(1, sup.leadTimeDays + rng.int(-1, 1)),
    paymentTermsDays: sup.paymentTermsDays,
    moq: Math.round((c.qty * rng.range(0.2, 0.4)) / 100) * 100,
    validUntilDay: state.day + 10,
  };
  const scanned = sup.quoteFormat === 'D' && rng.chance(0.5);
  const quoteNo = `Q${state.day}${sup.id.slice(1)}${rng.int(10, 99)}`;
  const docText = renderDoc(state, c, sup, m, truth, quoteNo, rng.chance(0.5));
  return {
    id: nextId(state, 'QT'),
    caseId: c.id,
    supplierId: sup.id,
    receivedDay: state.day,
    format: sup.quoteFormat,
    docText,
    scanned,
    truth,
  };
}

function renderDoc(
  state: GameState,
  c: PurchaseCase,
  sup: Supplier,
  m: Material,
  t: QuoteTerms,
  quoteNo: string,
  variant: boolean,
): string {
  const today = formatDay(state.startDate, state.day);
  const valid = formatDay(state.startDate, t.validUntilDay);
  switch (sup.quoteFormat) {
    case 'A':
      return [
        '견 적 서',
        `견적번호: ${quoteNo}    견적일: ${today}`,
        `수신: ${state.company.name} 구매팀 ${state.employee.name} 님`,
        `공급자: ${sup.name}`,
        '',
        `품명: ${m.name}`,
        `수량: ${fmt(c.qty)} ${m.unit}`,
        `단가: ${fmt(t.unitPriceKRW)}원/${m.unit} (부가세 별도)`,
        `납기: 발주 후 ${t.leadTimeDays}영업일`,
        `결제조건: 납품 후 ${t.paymentTermsDays}일`,
        `최소주문량(MOQ): ${fmt(t.moq)} ${m.unit}`,
        `견적 유효기간: ${valid}까지`,
      ].join('\n');
    case 'B': {
      const usd = t.unitPriceKRW / state.market.fx;
      const unitLabel = m.unit === 'kg' ? 'kg' : 'meter';
      return [
        'QUOTATION',
        `Quote No.: ${quoteNo}    Date: ${today}`,
        `To: ${state.company.name} Purchasing Team (Attn. ${state.employee.name})`,
        `From: ${sup.name}`,
        '',
        `Item: ${m.name}`,
        `Quantity: ${fmt(c.qty)} ${unitLabel}`,
        `Unit Price: USD ${usd.toFixed(3)} / ${unitLabel} (excl. VAT)`,
        `Lead Time: ${t.leadTimeDays} business days after PO`,
        `Payment Terms: Net ${t.paymentTermsDays}`,
        `MOQ: ${fmt(t.moq / (m.unit === 'kg' ? 1000 : 1), m.unit === 'kg' ? 1 : 0)} ${m.unit === 'kg' ? 'MT' : 'meter'}`,
        `Valid Until: ${valid}`,
      ].join('\n');
    }
    case 'C': {
      const pack = PACK_SIZE[m.unit];
      const packPriceVat = Math.round(t.unitPriceKRW * pack.size * 1.1);
      return [
        '[견적 안내]',
        `${state.company.name} 귀중 / 담당 ${state.employee.name}`,
        `발행: ${sup.name}  (${today})`,
        '',
        `품목: ${m.name}`,
        `요청수량: ${fmt(c.qty)}${m.unit} (${fmt(Math.ceil(c.qty / pack.size))}${m.unit === 'kg' ? '포' : '롤'})`,
        `공급단가: ${fmt(packPriceVat)}원 / ${pack.label} (VAT 포함)`,
        `납품기간: 발주일로부터 ${t.leadTimeDays}일 이내`,
        `대금지급: 월말 마감 후 ${t.paymentTermsDays}일`,
        `최소주문: ${fmt(Math.ceil(t.moq / pack.size))}${m.unit === 'kg' ? '포' : '롤'}`,
        `유효기간: ${valid}`,
      ].join('\n');
    }
    case 'D':
      // 띄어쓰기가 불규칙한 국문 양식
      return [
        '견    적    서',
        `일 자 : ${today}`,
        `귀 하 : ${state.company.name} ${state.employee.name}`,
        `상 호 : ${sup.name}`,
        '',
        `품 목 : ${m.name}`,
        `수 량 : ${fmt(c.qty)}${m.unit}`,
        variant
          ? `단 가 : ${fmt(t.unitPriceKRW)} 원/${m.unit}  ※부가세별도`
          : `단가 : ${fmt(t.unitPriceKRW)}원/${m.unit} (부가세 별도)`,
        `납 기 : ${t.leadTimeDays}일`,
        `결 제 : 현금 ${t.paymentTermsDays}일`,
        `최소수량 : ${fmt(t.moq)}${m.unit}`,
        `유효기간 : ${valid}`,
      ].join('\n');
  }
}
