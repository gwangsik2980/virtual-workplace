import type { Quote } from '../../sim/types';
import type { FieldExtraction, QuoteExtraction, ToolContext } from '../types';

/**
 * 견적서 정보 추출기.
 * LLM 없이 규칙(정규식)으로 동작한다. 비용이 들지 않고 결과가 항상 같아서
 * 시뮬레이션의 재현성 원칙(기획서 9장)과 맞는다.
 */

export interface ParserOptions {
  /** 라벨 안의 띄어쓰기 정규화 ("단 가" → "단가") */
  normalizeLabelSpacing: boolean;
  /** 추가로 인식할 라벨 */
  extraLabels: boolean;
}

const PACK_RE = /(\d+)\s*(kg|m)\s*1\s*(포|롤)/;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function normalize(text: string, opts: ParserOptions): string {
  if (!opts.normalizeLabelSpacing) return text;
  // 각 줄에서 콜론 앞 라벨 부분의 한글 사이 공백을 제거한다.
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx < 0) return line;
      const label = line.slice(0, idx).replace(/([가-힣])\s+(?=[가-힣])/g, '$1').trim();
      return `${label}: ${line.slice(idx + 1).trim()}`;
    })
    .join('\n');
}

function find(text: string, re: RegExp): RegExpMatchArray | null {
  return text.match(re);
}

export function extractQuote(quote: Quote, ctx: ToolContext, opts: ParserOptions): QuoteExtraction {
  const out: QuoteExtraction = { quoteId: quote.id, fields: {} };
  if (quote.scanned) {
    // 스캔 이미지: 텍스트가 없으므로 모든 필드 실패 → 사람이 입력
    const fail: FieldExtraction = { value: null, source: '', note: '스캔 이미지라 텍스트를 읽을 수 없음' };
    out.fields = { unitPrice: fail, leadTime: fail, paymentTerms: fail, moq: fail, validUntil: fail };
    return out;
  }
  const text = normalize(quote.docText, opts);
  const unit = ctx.unitOf(quote);

  // 단가
  let m: RegExpMatchArray | null;
  if ((m = find(text, /^단가\s*:\s*([\d,]+)\s*원\s*\/\s*(kg|m)\s*.*?(부가세\s*별도|부가세별도|부가세\s*포함)/m))) {
    let v = toNumber(m[1]);
    if (/포함/.test(m[3])) v = v / 1.1;
    out.fields.unitPrice = { value: v, source: m[0].trim() };
  } else if ((m = find(text, /^Unit Price:\s*USD\s*([\d.]+)\s*\/\s*(kg|meter)/m))) {
    const fx = ctx.fxOn(quote.receivedDay);
    out.fields.unitPrice = {
      value: Number(m[1]) * fx,
      source: m[0].trim(),
      note: `견적일 환율 ${fx.toFixed(1)}원/USD 적용`,
    };
  } else if ((m = find(text, /^공급단가:\s*([\d,]+)원\s*\/\s*(.+?)\s*\((VAT 포함|VAT 별도)\)/m))) {
    const pack = m[2].match(PACK_RE);
    if (pack && pack[2] === unit) {
      let v = toNumber(m[1]) / Number(pack[1]);
      if (m[3] === 'VAT 포함') v = v / 1.1;
      out.fields.unitPrice = {
        value: v,
        source: m[0].trim(),
        note: `포장단위 ${pack[1]}${pack[2]}로 나누고 VAT ${m[3] === 'VAT 포함' ? '제외' : '그대로'}`,
      };
    } else {
      out.fields.unitPrice = { value: null, source: m[0].trim(), note: '포장 단위를 해석하지 못함' };
    }
  } else {
    out.fields.unitPrice = { value: null, source: '', note: '단가 라벨을 찾지 못함' };
  }

  // 납기
  if ((m = find(text, /^(?:납기|납품기간):\s*(?:발주 후\s*|발주일로부터\s*)?(\d+)\s*(?:영업일|일)/m))) {
    out.fields.leadTime = { value: Number(m[1]), source: m[0].trim() };
  } else if ((m = find(text, /^Lead Time:\s*(\d+)/m))) {
    out.fields.leadTime = { value: Number(m[1]), source: m[0].trim() };
  } else {
    out.fields.leadTime = { value: null, source: '', note: '납기 라벨을 찾지 못함' };
  }

  // 결제조건
  const termLabels = opts.extraLabels ? '결제조건|대금지급|결제' : '결제조건|대금지급';
  if ((m = find(text, new RegExp(`^(?:${termLabels}):\\s*.*?(\\d+)\\s*일`, 'm')))) {
    out.fields.paymentTerms = { value: Number(m[1]), source: m[0].trim() };
  } else if ((m = find(text, /^Payment Terms:\s*Net\s*(\d+)/m))) {
    out.fields.paymentTerms = { value: Number(m[1]), source: m[0].trim() };
  } else {
    out.fields.paymentTerms = { value: null, source: '', note: '결제조건 라벨을 찾지 못함' };
  }

  // 최소주문량 (비교 판단에는 쓰지 않지만 비교표에 들어가는 항목)
  const moqLabels = opts.extraLabels ? '최소주문량\\(MOQ\\)|최소주문|최소수량' : '최소주문량\\(MOQ\\)|최소주문';
  if ((m = find(text, new RegExp(`^(?:${moqLabels}):\\s*([\\d,.]+)`, 'm')))) {
    out.fields.moq = { value: toNumber(m[1]), source: m[0].trim() };
  } else if ((m = find(text, /^MOQ:\s*([\d,.]+)/m))) {
    out.fields.moq = { value: toNumber(m[1]), source: m[0].trim() };
  } else {
    out.fields.moq = { value: null, source: '', note: 'MOQ 라벨을 찾지 못함' };
  }

  // 유효기간
  if ((m = find(text, /^(?:견적 유효기간|견적유효기간|유효기간|Valid Until):\s*(.+)$/m))) {
    out.fields.validUntil = { value: 1, source: m[0].trim() };
  } else {
    out.fields.validUntil = { value: null, source: '', note: '유효기간 라벨을 찾지 못함' };
  }

  return out;
}
