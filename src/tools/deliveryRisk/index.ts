import type { ToolDefinition } from '../types';

export const deliveryRiskTool: ToolDefinition = {
  id: 'delivery-risk',
  name: '발주 현황 모니터링 · 납기 위험 알림',
  targetStage: 'awaitDelivery',
  summary:
    '입고 대기 중인 발주 건의 출하 현황을 매일 확인해, 약속일보다 늦어질 신호가 보이면 예정일 전에 담당자에게 알린다. 담당자는 남은 시간이 있을 때 독촉해 지연을 만회할 수 있다.',
  automates: ['입고 대기 발주 건 매일 점검', '출하 지연 신호와 현재 재고 일수를 함께 알림', '결품 위험 여부 표시'],
  humanReview: ['알림 내용 확인 후 업체 독촉은 담당자가 직접', '대체 구매나 생산 계획 조정 판단은 담당자와 생산팀'],
  validation: ['입고 대기 단계이고 약속일이 3영업일 이내인 건만 점검', '이미 지연을 파악한 건은 다시 알리지 않음'],
  versions: [
    {
      version: '1.0',
      releasedNote:
        '첫 버전. 약속일 3영업일 전부터 출하 지연 신호를 감지한다. 알림 확인 5분 + 독촉 30분(가정치). 수작업일 때는 예정일 당일 미입고를 보고서야 알고, 확인 15분 + 독촉 30분이 든다.',
      detectLeadDays: 3,
      reviewMinutes: 5,
    },
  ],
};
