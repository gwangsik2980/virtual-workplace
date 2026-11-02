import type { ToolDefinition } from '../types';
import { draftMonthlyReport } from './draft';

export const monthlyReportTool: ToolDefinition = {
  id: 'monthly-report',
  name: '월간 구매 실적 보고서 초안 생성',
  targetStage: 'report',
  summary:
    '월말마다 담당자가 구매 건, 입고, 이슈 기록을 모아 정리하던 실적 보고서를 시뮬레이션 기록에서 자동으로 집계해 초안으로 만든다.',
  automates: ['발주액·절감액·납기·불량 실적 집계', '원료별·업체별 실적 정리', '기간 중 이슈와 다음 달 유의사항 목록화'],
  humanReview: ['초안 수치를 원 기록(구매 건 상세)과 대조', '담당자 코멘트 작성', '팀장 보고는 담당자가 직접'],
  validation: ['절감액은 완료된 구매 건의 기준가격 공식으로만 계산', '수치 근거가 되는 구매 건 기록을 그대로 집계 (추정값 없음)'],
  versions: [
    {
      version: '1.0',
      releasedNote: '첫 버전. 수작업 150분(가정치)이 들던 월간 보고를 초안 검토와 코멘트 작성 35분(가정치)으로 줄인다.',
      reviewMinutes: 35,
      draftReport: (state, period) => draftMonthlyReport(state as never, period),
    },
  ],
};
