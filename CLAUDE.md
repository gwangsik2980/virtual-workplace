# CLAUDE.md

이 저장소에서 작업할 때 참고할 내용.

## 프로젝트

가상 기업 기반 구매 직무 관찰·학습·업무 개선 시뮬레이션. 정적 웹앱(React + TS + Vite), GitHub Pages 배포.
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

## 저장 형식 변경 시

`GameState`에 필드를 추가하면 기존 저장 파일이 깨질 수 있다. `src/sim/persistence.ts`에서 누락 필드를 기본값으로 채우는 마이그레이션을 추가할 것.
