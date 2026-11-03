import { useState } from 'react';
import { ArrowUpRight, Mark } from '../motion';

const KEY = 'virtual-workplace/intro-open';
const REPO = 'https://github.com/gwangsik2980/virtual-workplace';

/**
 * 프로젝트 소개 배너. 첫 화면 맨 위에 둔다.
 * 처음에는 넓은 화면에서 펼치고 폰에서는 접는다. 사용자가 고른 상태는 이 브라우저에 기억한다.
 */
export function IntroBanner() {
  const [open, setOpen] = useState<boolean>(() => {
    // 저장된 선택이 없으면 넓은 화면은 펼치고, 폰은 첫 화면을 가리지 않게 접어서 시작한다
    const wide = typeof window === 'undefined' || window.innerWidth >= 768;
    try {
      const v = localStorage.getItem(KEY);
      return v === null ? wide : v === '1';
    } catch {
      return wide;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? '0' : '1');
      } catch {
        /* 저장이 막혀도 동작은 한다 */
      }
      return !o;
    });
  };

  return (
    <section className={`ink intro-banner ${open ? 'open' : ''}`} aria-label="프로젝트 소개">
      <div className="intro-top">
        <span className="intro-mark" aria-hidden>
          <Mark />
        </span>
        <div className="intro-headline">
          <span className="intro-eyebrow">About this project</span>
          <strong>가상 기업에서 구매 업무를 관찰하고, 도구로 바꾸고, 효과를 검증하는 시뮬레이션입니다.</strong>
        </div>
        <button className="intro-toggle" onClick={toggle} aria-expanded={open}>
          {open ? '접기' : '소개 보기'}
        </button>
      </div>

      {open && (
        <div className="intro-body">
          <div className="intro-col">
            <h3>무엇인가</h3>
            <p>
              떡볶이 밀키트를 만드는 가상 식품회사 가온식품이 매일 돌아가고, 구매팀 서지우 사원이 구매요청부터 견적, 협상, 발주, 입고, 정산까지 열두 단계의
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
      )}
    </section>
  );
}
