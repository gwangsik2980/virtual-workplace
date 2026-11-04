# CLAUDE.md

이 저장소에서 작업할 때 참고할 내용.

## 프로젝트

가상 기업 기반 구매 직무 관찰·학습·업무 개선 시뮬레이션. 정적 웹앱(React + TS + Vite), GitHub Pages 배포.
새 세션은 먼저 `docs/HANDOFF.md`(현재 상태, 남은 일, 사용자 선호)를 읽는다.
기획 대응표: `docs/PLAN_MAPPING.md`. 가정: `docs/ASSUMPTIONS.md`. 도구 개발: `docs/TOOL_GUIDE.md`.

## 명령

- `npm test` — Vitest. 커밋 전 반드시 통과
- `npx tsc --noEmit` — 타입 검사
- `npm run build` — 배포 빌드

## 설계 원칙 (깨면 안 되는 것)

1. **재현성**: 난수는 반드시 `makeRng(seed, ...키)`로 뽑는다. 키에 날짜·대상·용도를 넣고, 도구 적용 여부는 넣지 않는다. 반사실 검증(`src/sim/verify.ts`)이 이 원칙에 의존한다.
2. **상태는 JSON**: `GameState`에 함수·클래스·Map을 넣지 않는다. 저장과 `structuredClone`이 깨진다.
3. **sim은 UI와 독립**: `src/sim`은 React를 import하지 않는다.
4. **도구 효과는 계산에서 나오게**: 개선율을 곱하지 말고, 도구가 대체하는 작업을 계산에서 빼는 방식으로 만든다.
5. **가정은 드러낸다**: 새 수치를 넣으면 `docs/ASSUMPTIONS.md`에 근거 수준을 적는다.
6. 회사·인물·업체는 모두 가상. 실제 기업명을 쓰지 않는다.

## UI 규칙

- 화면 구성은 `src/ui/components/Editorial.tsx`의 공통 부품(ScreenHero, HeroFacts, SectionHead, InkStats, RowList)을 쓴다. 기업 현황 히어로와 같은 문법을 유지하기 위해서다.
- 새 CSS는 rem 단위로 쓴다. 루트 글자 크기가 화면 폭에 따라 바뀌어서 px로 쓰면 비율이 깨진다.
- 색은 `styles.css`의 변수로만 쓴다. 다크 모드는 `:root[data-theme='dark']`에서 변수를 바꾸는 방식이라, 색을 직접 쓰면 다크에서 안 바뀐다. 검정 카드는 `.ink` 클래스 안에서 변수가 밝은 값으로 바뀐다.
- `main.tsx`에서 `styles.css`를 App보다 먼저 불러온다. 화면별 CSS가 같은 우선순위의 전역 규칙을 이기게 하기 위해서다.
- 부드러운 스크롤은 Lenis를 쓰되, 입력이 있을 때만 requestAnimationFrame을 돌리고 멈추면 끈다(`motion.tsx`). 자체 스크롤이 있는 영역은 `data-lenis-prevent`를 붙인다.
- 스크롤과 함께 움직이는 카드에는 `backdrop-filter`(블러)를 쓰지 않는다. 배경이 거의 단색이라 눈에 띄는 차이가 없는데 스크롤마다 GPU가 다시 흐리게 계산한다. 헤더와 드로어만 쓴다.
- 계속 도는 애니메이션은 `transform`과 `opacity`만 움직인다. `box-shadow`·`width` 같은 걸 무한 반복하면 가만히 있어도 매 프레임 다시 칠해서 렉이 생긴다.
- 화면을 바꾸면 Playwright로 1440px과 390px, 라이트와 다크를 찍어 확인한다. 과하게 큰 요소를 사용자가 싫어한다.

## 배포

`main`에 푸시하면 바로 사이트에 배포된다. 작업 중인 코드는 main에 올리지 않는다.

## 저장 형식 변경 시

`GameState`에 필드를 추가하면 기존 저장 파일이 깨질 수 있다. `src/sim/persistence.ts`에서 누락 필드를 기본값으로 채우는 마이그레이션을 추가할 것.
