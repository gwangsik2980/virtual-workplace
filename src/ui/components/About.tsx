import { activeTool } from '../../sim/compare';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { Stage } from '../../sim/types';
import { ArrowUpRight } from '../motion';
import { useStore } from '../store';

const REPO = 'https://github.com/gwangsik2980/virtual-workplace';

/** 헤더의 About 버튼을 누르면 헤더 아래로 펼쳐지는 프로젝트 소개 */
export function AboutContent() {
  return (
    <>
    <div className="intro-body">
      <div className="intro-col">
        <h3>무엇인가</h3>
        <p>
          떡볶이 밀키트를 만드는 가상 식품회사 가온식품이 매일 돌아가고, 구매팀 GWANG 사원이 구매요청부터 견적, 협상, 발주, 입고, 정산까지 열두 단계의
          업무를 처리합니다. 보는 사람은 그 과정을 옆에서 관찰하면서, 반복되는 업무에 도구를 붙였을 때 결과가 어떻게 달라지는지 확인할 수 있습니다.
        </p>
      </div>
      <div className="intro-col">
        <h3>어떻게 동작하나</h3>
        <p>
          업체마다 견적서 양식이 달라서 담당자가 값을 옮겨 적다가 가끔 틀리게 입력하고, 그 값으로 업체를 고르고 발주서를 씁니다. 도구의 효과를 미리 정한
          비율로 넣지 않고 이런 실수가 실제로 생기고 비용으로 드러나게 만들었고, 시장가격과 수요를 날짜별로 고정해 같은 시점에서 도구를 쓴 경우와 안 쓴
          경우를 나란히 비교합니다.
        </p>
      </div>
      <div className="intro-col">
        <h3>만든 도구와 결과</h3>
        <ul className="intro-results">
          <li>
            <b>견적서 정보 추출</b>
            <span>견적 비교 870분 → 388분, 입력 오류 2건 → 0건</span>
          </li>
          <li>
            <b>월간 보고서 초안</b>
            <span>월말 보고 세 번에 450분 → 105분</span>
          </li>
          <li>
            <b>납기 위험 알림</b>
            <span>늦게 들어온 건 5건 → 2건, 결품일은 그대로</span>
          </li>
        </ul>
        <p className="intro-note">61일차 상태에서 60~120영업일을 비교한 시뮬레이션 결과이며, 업무 시간과 오류율은 실측값이 아닌 가정치입니다.</p>
      </div>
      <div className="intro-col">
        <h3>만든 사람</h3>
        <p>
          구매 직무를 공부하는 GWANG이 기획서를 쓰고 방향을 정했고, 구현은 AI 코딩 도구로 했습니다. 회사, 인물, 업체, 시세는 모두 가상이며 구매 절차 설명은
          공개 자료와 대조했지만 실무자 검증은 거치지 않았습니다.
        </p>
        <div className="intro-links">
          <a className="intro-link" href={REPO} target="_blank" rel="noreferrer">
            코드 보기 <ArrowUpRight />
          </a>
          <a className="intro-link" href={`${REPO}/blob/main/docs/PLAN_MAPPING.md`} target="_blank" rel="noreferrer">
            기획 대응표 <ArrowUpRight />
          </a>
          <a className="intro-link" href={`${REPO}/blob/main/docs/ASSUMPTIONS.md`} target="_blank" rel="noreferrer">
            가정과 근거 <ArrowUpRight />
          </a>
        </div>
      </div>
    </div>
    <ProcessStrip />
    </>
  );
}

const PHASES: { name: string; dept: string; stages: Stage[] }[] = [
  { name: '요청', dept: '생산 → 구매', stages: ['request'] },
  { name: '조사·분석', dept: '구매', stages: ['market', 'costing'] },
  { name: '견적·협상', dept: '구매 ↔ 공급업체', stages: ['rfq', 'awaitQuotes', 'compare', 'negotiate'] },
  { name: '승인·발주', dept: '경영지원 → 구매', stages: ['approve', 'order'] },
  { name: '입고·정산', dept: '물류·품질·경영지원', stages: ['awaitDelivery', 'inspect', 'done'] },
];

const WAIT: Stage[] = ['awaitQuotes', 'approve', 'awaitDelivery'];

const TOOL_AT: Partial<Record<Stage, { id: string; label: string }>> = {
  compare: { id: 'quote-compare', label: '견적 추출' },
  awaitDelivery: { id: 'delivery-risk', label: '납기 알림' },
};

/** 구매 12단계 흐름도: 단계별 현재 건수와 도구 연결 지점을 함께 보여 준다 */
function ProcessStrip() {
  const { state } = useStore();
  const count = (st: Stage) =>
    st === 'done' ? state.stats.closedCases : state.cases.filter((c) => c.stage === st).length;
  let n = 0;
  return (
    <div className="pstrip">
      <div className="pstrip-head">
        <h3>구매 업무 흐름</h3>
        <span>숫자는 지금 그 단계에 있는 구매 건 수이고 마지막은 누적 완료입니다. 줄무늬는 기다리는 단계, 점선 칩은 도구를 붙일 수 있는 자리, 채워진 칩은 적용 중인 도구입니다.</span>
      </div>
      <ol className="pstrip-phases">
        {PHASES.map((ph, pi) => (
          <li key={ph.name} className="pstrip-phase">
            <div className="pstrip-phase-head">
              <b>{ph.name}</b>
              <span>{ph.dept}</span>
            </div>
            <ol className="pstrip-steps">
              {ph.stages.map((st) => {
                n += 1;
                const c = count(st);
                const tool = TOOL_AT[st];
                const on = tool ? !!activeTool(state, tool.id) : false;
                return (
                  <li key={st} className={`pstrip-step ${WAIT.includes(st) ? 'wait' : ''} ${st === 'done' ? 'done' : ''} ${c > 0 && st !== 'done' ? 'busy' : ''}`}>
                    <span className="pstrip-no">{String(n).padStart(2, '0')}</span>
                    <span className="pstrip-name">{STAGE_LABELS[st]}</span>
                    <span className="pstrip-count">{c}</span>
                    {tool && (
                      <span className={`pstrip-tool ${on ? 'on' : ''}`} title={on ? `${tool.label} 도구 적용 중` : `${tool.label} 도구를 붙일 수 있는 자리`}>
                        {on ? '● ' : '+ '}
                        {tool.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {pi < PHASES.length - 1 && <span className="pstrip-arrow" aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      <p className="pstrip-foot">월간 보고서 초안 도구는 구매 단계가 아니라 월말 보고 업무에 붙습니다.</p>
    </div>
  );
}
