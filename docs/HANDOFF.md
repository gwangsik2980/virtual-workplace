# 작업 인계 (2026-11-03 기준)

새 세션에서 이어서 작업할 때 먼저 읽는 문서. 규칙과 명령은 `CLAUDE.md`, 수치 근거는 `docs/ASSUMPTIONS.md`에 있다.

## 지금 상태

- 저장소 `gwangsik2980/virtual-workplace`, 배포 https://gwangsik2980.github.io/virtual-workplace/
- `main`에 푸시하면 GitHub Actions가 바로 배포한다. 지금까지는 사용자가 요청한 기능을 확인 후 `main`에 바로 올려 왔다.
- 마지막 커밋: `git log -1`로 확인
- 테스트 65개 통과 (`npm test`), 타입 검사 통과 (`npx tsc --noEmit`)

## 지금까지 만든 것 (요약)

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| 시뮬레이션 | 가상 식품회사 가온식품, 구매 담당자 GWANG의 하루. 구매 단계 머신, 견적 비교, 반사실 검증 | `src/sim/engine.ts`, `purchasing.ts`, `verify.ts` |
| 손익 | 영업이익률 약 5% (1년 3.1~6.5%) | `operations.ts`, `seed.ts` |
| 실시간 모드 | 현실 시간과 1:1. 09~18시, 점심 12~13시, 주말·공휴일 휴무(2030년까지 목록, 2031년부터 양력 고정 공휴일만. 노동절·제헌절 포함). 오늘(2026-11-03)이 1일차. 밀린 날은 다시 열 때 따라잡음 | `src/sim/calendar.ts`, `src/ui/realtime.tsx` |
| 알림 | 결품, 긴급, 지연, 품질, 정산, 납기 위험, 급여 입금. 사이트를 열어 둔 동안 브라우저 알림 | `src/ui/alerts.tsx` |
| PWA | 홈 화면 설치 가능 | `public/sw.js`, `src/ui/install.ts` |
| 첫 화면 | 날짜·초 단위 시각·상태 불(근무 초록, 점심 주황, 퇴근 빨강, 그 외 회색)·지금 단계 | `src/ui/screens/Overview.tsx`, `components/LiveWidgets.tsx` |
| 헤더 | About 드롭다운, 날짜 칩, 알림 종, 테마, 맨 오른쪽 MENU. 진행 버튼(되돌리기/하루/1주)과 실시간·수동 전환은 사용자 요청으로 뺐다. 웹은 실시간 모드만 쓰고, 수동으로 저장된 회사도 열 때 실시간으로 바꾼다(`src/ui/store.tsx` `asRealtime`). sim의 수동 모드는 테스트용으로 남겨 둠 | `src/App.tsx` |
| 급여 | 통장(가상은행), 10일 전월 급여, 25일 연장근로수당·월 성과급, 휴일이면 직전 영업일. 2026년 4대보험 요율, 소득세는 추정 계산. 입사 월 일할 계산 | `src/sim/payroll.ts`, `components/PayrollPanel.tsx` |
| 승진 | 매년 1월 첫 영업일 정기 심사만. 사원 2년 → 주임, 주임 2년 → 대리, 대리 4년 → 과장. 근속 1년 이상이면 매년 3% 인상. 연봉 이력은 달별 저장 | `src/sim/employee.ts` |
| 손실 | 불량 반품 처리비, 생산 중 불량 폐기와 보상 클레임, 결품 직전 긴급 현물 구매(못 구할 때도 있음), 견적 뒤 인상 요구, 연초 단가 인상 협상. 기타 손실은 `finance.otherExpenseCum`으로 영업이익에서 뺀다. 성과 화면 "손해 본 돈" | `src/sim/losses.ts`, `purchasing.ts` |
| 공급업체 관리 | 신규 공급처 탐색→샘플 시험→등록, 분기 평가→개선 미팅·거래 중지, 분기 사내 교육. 공급업체 화면 "공급업체 관리" | `src/sim/suppliers.ts` |
| 팀 채팅 | 사내 메신저. 팀장 지시와 생산·품질·물류·재무·영업 협조만 (사원이라 부하 방 없음). 기존 사건에 맞춰 대화가 생기고 실시간이면 그 시각에 보인다. 상황마다 문장 2~3가지를 시드로 골라 쓴다. 읽음 표시는 브라우저 localStorage `virtual-workplace/chat-read`(회사별, GameState 아님). 메뉴 03번, 안 읽은 수는 메뉴·MENU 배지에 | `src/sim/chat.ts`, `src/ui/screens/TeamChat.tsx` |
| 메뉴 | 01 기업 현황 ~ 08 학습 노트. 가정·설정은 번호 메뉴에서 빼고 하단 "처음부터 다시 시작" 오른쪽 회색 글씨 | `src/App.tsx` |
| 연봉 | 사원 4,200 / 주임 4,600 / 대리 5,200 / 과장 6,000만원 (가정치, 대형 식자재 유통사 수준. 출처는 ASSUMPTIONS) | `payroll.ts` `SALARY_BY_RANK` |

## 남은 일과 보류 항목

사용자가 정할 것, 또는 다음에 할 수 있는 것.

1. **성과 평가 등급**: 사용자가 필요 없다고 정함 (2026-11-03). 승진은 연차 기준 그대로.
2. **공휴일**: 2026-11-03 관보 월력요항(2026·2027), 천문연 달력자료(2028), 관공서 공휴일 규정·공직선거법 원문으로 대조 완료 (`docs/ASSUMPTIONS.md` 근무 달력). 2028년 공식 월력요항은 2027년 6월쯤 관보에 나오면 다시 대조한다. 2031년 이후는 목록을 더 넣어야 설·추석이 쉬는 날이 된다.
3. **보류 (사용자 결정)**: 다른 부서 확장, 닫아 둔 동안 오는 폰 알림(서버 필요), 포트폴리오 "배운 것" 보강(`docs/PORTFOLIO.md`).
4. **남은 원격 브랜치**: `wip-desk-process`, `wip-autoplay`. 프록시 때문에 세션에서 못 지웠다. 사용자가 GitHub Branches 화면에서 지우면 된다.

## 사용자 선호 (작업 방식)

- 한국어로 답한다. 소제목과 줄바꿈으로 나누고, 이유와 근거를 함께 쓴다.
- 수치에는 출처를 남기고, 추정이면 추정이라고 밝힌다. 공식 자료를 못 찾으면 그렇다고 말한다.
- 부족한 점은 돌려 말하지 않고 짚는다.
- 과하게 큰 UI 요소를 싫어한다. 화면을 바꾸면 Playwright로 1440px·390px, 라이트·다크를 찍어 확인한다.
- 링크 페이지(`gwangsik2980.github.io/links/`) 같은 다른 공개 페이지를 바꿀 때는 먼저 확인받는다.
- 앱 안에서는 실제 기업명을 쓰지 않는다 (예: 연봉 기준 회사명은 문서에만).

## 화면 확인 요령

- 데이터가 쌓인 상태를 보려면 Vitest로 `createInitialState(seed, '2026-11-03', 'manual')` 후 `advanceDays`를 돌려 JSON으로 저장하고, Playwright에서 localStorage `virtual-workplace/save/v1`에 넣고 새로고침한다.
- 테마는 localStorage `virtual-workplace/theme`(`light`/`dark`).
- `npm run build` 후 `npx vite preview --port 4173`, 주소는 `http://localhost:4173/virtual-workplace/`. 서버를 끌 때 `pkill -f`는 자기 셸까지 죽이므로 `lsof -t -i:4173 | xargs kill`을 쓴다.
