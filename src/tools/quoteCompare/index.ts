import type { ToolDefinition } from '../types';
import { extractQuote } from './parser';

export const quoteCompareTool: ToolDefinition = {
  id: 'quote-compare',
  name: '견적서 정보 추출 · 비교표 자동 생성',
  targetStage: 'compare',
  summary:
    '업체마다 양식이 다른 견적서에서 단가·납기·결제조건을 추출하고 단위·부가세·통화를 정규화해 비교표를 만든다.',
  automates: [
    '견적서 필드 읽기와 비교표 입력',
    '포장 단위 → 기준 단위 환산, VAT 포함가 → VAT 별도가 환산',
    'USD 단가 → 견적일 환율로 원화 환산',
  ],
  humanReview: [
    '추출값마다 원문 근거 문자열을 보고 확인 (견적 1건당 검토 시간 발생)',
    '추출 실패·검증 실패 필드는 담당자가 직접 입력',
    '업체 선정과 발주 승인은 담당자와 팀장이 결정',
  ],
  validation: [
    '단가: 오늘 시장가격 대비 ±40% 범위를 벗어나면 실패 처리 → 수작업',
    '납기: 1~60영업일 범위 밖이면 실패 처리',
    '결제조건: 0~120일 범위 밖이면 실패 처리',
  ],
  versions: [
    {
      version: '1.0',
      releasedNote:
        '첫 버전. 표준 라벨(단가, 납기, 결제조건 등)만 인식한다. 스캔본과 라벨 띄어쓰기가 불규칙한 양식은 수작업으로 넘긴다.',
      extractQuote: (q, ctx) => extractQuote(q, ctx, { normalizeLabelSpacing: false, extraLabels: false }),
    },
    {
      version: '1.1',
      releasedNote:
        'v1.0 적용 후 수작업 복귀가 특정 업체(띄어쓰기가 불규칙한 양식)에 몰리는 것을 확인하고 라벨 띄어쓰기 정규화와 "결제/최소수량" 라벨을 추가했다. 스캔본은 여전히 수작업이다.',
      extractQuote: (q, ctx) => extractQuote(q, ctx, { normalizeLabelSpacing: true, extraLabels: true }),
    },
  ],
};
