import type { GameState, Quote, Stage } from '../sim/types';

/** 도구가 연결되는 지점: 구매 업무 단계 또는 반복 문서 업무 */
export type ToolTarget = Stage | 'report';

/**
 * 도구 슬롯 규격.
 *
 * 사용자가 만든 도구는 가상 직원의 특정 업무 단계(targetStage)에 연결된다.
 * 도구는 순수 함수여야 한다: 같은 입력이면 같은 결과를 내고 상태를 직접 바꾸지 않는다.
 * 결과를 업무에 반영하는 일(검증 규칙 적용, 실패 시 수작업 복귀, 소요 시간 계산)은
 * 엔진이 맡는다. 그래야 도구가 실패해도 업무가 멈추지 않는다 (기획서 6장 도구 적용 원칙).
 */

export type QuoteField = 'unitPrice' | 'leadTime' | 'paymentTerms' | 'moq' | 'validUntil';

export const QUOTE_FIELDS: QuoteField[] = ['unitPrice', 'leadTime', 'paymentTerms', 'moq', 'validUntil'];

export const QUOTE_FIELD_LABELS: Record<QuoteField, string> = {
  unitPrice: '단가(원/기준단위, VAT 별도)',
  leadTime: '납기(영업일)',
  paymentTerms: '결제조건(일)',
  moq: '최소주문량',
  validUntil: '유효기간',
};

export interface FieldExtraction {
  /** 추출값. 단가는 KRW/기준단위 VAT 별도로 정규화한 값. 실패하면 null */
  value: number | null;
  /** 원문에서 근거가 된 문자열 (원본 대조용) */
  source: string;
  note?: string;
}

export interface QuoteExtraction {
  quoteId: string;
  fields: Partial<Record<QuoteField, FieldExtraction>>;
}

export interface ToolContext {
  /** 읽기 전용으로 다룬다 */
  state: Readonly<GameState>;
  /** 특정 날짜의 USD/KRW 환율 */
  fxOn(day: number): number;
  /** 원료 기준단위 (kg, m) */
  unitOf(quote: Quote): string;
}

export interface ToolVersion {
  version: string;
  releasedNote: string;
  /** 견적 비교 단계 도구 */
  extractQuote?(quote: Quote, ctx: ToolContext): QuoteExtraction;
  /** 월간 보고 도구: 보고서 초안 본문 */
  draftReport?(state: Readonly<GameState>, period: { fromDay: number; toDay: number }): string;
  /** 도구 사용 시 담당자 검토 시간(분). 가정치 */
  reviewMinutes?: number;
  /** 납기 위험 도구: 약속일 며칠 전에 지연 신호를 잡는가 */
  detectLeadDays?: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  targetStage: ToolTarget;
  summary: string;
  /** 자동화하는 일 */
  automates: string[];
  /** 사람이 검토·승인하는 지점 */
  humanReview: string[];
  /** 검증 규칙 설명 */
  validation: string[];
  versions: ToolVersion[];
}
