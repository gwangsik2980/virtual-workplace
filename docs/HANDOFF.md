# 작업 인계 (2026-11-03 기준)

새 세션에서 이어서 작업할 때 먼저 읽는 문서. 규칙과 명령은 `CLAUDE.md`, 수치 근거는 `docs/ASSUMPTIONS.md`에 있다.

## 지금 상태

- 저장소 `gwangsik2980/virtual-workplace`, 배포 https://gwangsik2980.github.io/virtual-workplace/
- `main`에 푸시하면 GitHub Actions가 바로 배포한다. **사용자가 "배포해줘"라고 한 뒤에만** `main`에 올린다. 작업은 세션 브랜치에서 하고, 끝나면 "배포할까요?"라고 묻는다.
- 2026-11-03 세션의 작업은 모두 `main`에 배포했다. 마지막 커밋은 `git log -1`로 확인.
- 테스트 67개 통과 (`npm test`), 타입 검사 통과 (`npx tsc --noEmit`)
- 하위 세션을 열면 프롬프트에 "main 푸시 금지"를 분명히 쓰고, 끝나면 바로 보관한다. (2026-11-03 공휴일 대조 하위 세션이 끝난 뒤 다시 깨어나 main에 직접 올린 일이 있었다. 내용은 검토한 것과 같아 문제는 없었다.)

## 지금까지 만든 것 (요약)

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| 시뮬레이션 | 가상 식품회사 가온식품, 구매 담당자 GWANG의 하루. 구매 단계 머신, 견적 비교, 반사실 검증 | `src/sim/engine.ts`, `purchasing.ts`, `verify.ts` |
| 손익 | 영업이익률 연 4.9~6.8% (시드 4개 1년), 가끔 적자인 달 있음 | `operations.ts`, `seed.ts` |
| 실시간 모드 | 현실 시간과 1:1. 09~18시, 점심 12~13시, 주말·공휴일 휴무. 오늘(2026-11-03)이 1일차. 밀린 날은 다시 열 때 따라잡음 | `src/sim/calendar.ts`, `src/ui/realtime.tsx` |
| 공휴일 | 2030년까지 목록, 2031년부터 양력 고정 공휴일만. 2026. 4. 30. 규정 개정으로 노동절(5/1)·제헌절(7/17) 포함. 관보·법령 원문 대조 완료 | `calendar.ts`, `ASSUMPTIONS.md` 근무 달력 |
| 알림 | 결품, 긴급, 지연, 품질, 정산, 납기 위험, 급여 입금. 사이트를 열어 둔 동안 브라우저 알림 | `src/ui/alerts.tsx` |
| PWA | 홈 화면 설치 가능 | `public/sw.js`, `src/ui/install.ts` |
| 첫 화면 | 날짜·초 단위 시각·상태 불(근무 초록, 점심 주황, 퇴근 빨강, 그 외 회색)·지금 단계 | `src/ui/screens/Overview.tsx`, `components/LiveWidgets.tsx` |
| 헤더 | About 드롭다운, 날짜 칩, 알림 종, 테마, 맨 오른쪽 MENU(숫자는 새 개념 수만). 진행 버튼과 실시간·수동 전환은 사용자 요청으로 뺐다. 웹은 실시간 모드만 쓰고, 수동 저장 파일도 열 때 실시간으로 바꾼다(`store.tsx` `asRealtime`). sim의 수동 모드는 테스트용 | `src/App.tsx` |
| 메뉴 | 01 기업 현황, 02 직원 업무, 03 팀 채팅, 04 프로세스 맵, 05 시장·원가·업체, 06 AI Tool Lab, 07 성과·타임라인, 08 학습 노트. 가정·설정은 하단 "처음부터 다시 시작" 오른쪽 회색 글씨 | `src/App.tsx`, `components/Common.tsx` EYEBROWS |
| 직원 업무 | 히어로의 근무 칸: 근무 중이면 "오늘 근무"(09:00부터 지금까지), 출근 전·휴일이면 "지난 근무일", 작은 글씨로 누적·연장 | `src/ui/screens/Desk.tsx` |
| 팀 채팅 | 사내 메신저. 팀장 지시와 생산·품질·물류·재무·영업 협조만 (사원이라 부하 방 없음). 기존 사건에 맞춰 대화가 생기고 실시간이면 그 시각에 보인다. 상황마다 문장 2~3가지를 시드로 고른다. 읽음 표시는 localStorage `virtual-workplace/chat-read`(회사별, GameState 아님). 안 읽은 수는 메뉴를 열었을 때 "팀 채팅" 옆에만 | `src/sim/chat.ts`, `src/ui/screens/TeamChat.tsx`, `src/ui/chatRead.ts` |
| 급여 | 통장(가상은행), 10일 전월 급여, 25일 연장근로수당·월 성과급, 휴일이면 직전 영업일. 2026년 4대보험 요율, 소득세는 추정. 입사 월 일할 | `src/sim/payroll.ts`, `components/PayrollPanel.tsx` |
| 승진·연봉 | 매년 1월 첫 영업일 정기 심사만. 사원 2년 → 주임, 주임 2년 → 대리, 대리 4년 → 과장. 근속 1년 이상 매년 3% 인상. 사원 4,200 / 주임 4,600 / 대리 5,200 / 과장 6,000만원 (가정치) | `src/sim/employee.ts`, `payroll.ts` |
| 손실 | 불량 반품 처리비, 생산 중 불량 폐기와 보상 클레임, 결품 직전 긴급 현물 구매(시세 +12~18%, 못 구할 때도 있음), 견적 뒤 인상 요구, 연초 단가 인상 협상. 기타 손실은 `finance.otherExpenseCum`으로 영업이익에서 뺀다. 성과 화면 "손해 본 돈" | `src/sim/losses.ts`, `purchasing.ts` |
| 공급업체 관리 | 신규 공급처 탐색→샘플 시험→등록, 분기 평가→개선 미팅·거래 중지, 분기 사내 교육(하루 종일, 연 32시간). 공급업체 화면 "공급업체 관리" | `src/sim/suppliers.ts` |
| 업체 선정 기준 v2 | 견적 점수의 납기 위험 = 기대 결품 일수 × 결품 하루 공헌이익 ÷ 구매 수량. 납기 신뢰도는 입고 3건부터 실적값. v1(하루 3%)은 `state.selectionRule = 'v1'`로 비교용. 시드 8개 1년: 결품 6.3일 → 2.6일, 이익률 5.92% → 6.19% | `src/sim/compare.ts` `scoreQuote` |

## 남은 일과 보류 항목

1. **포트폴리오**: `docs/PORTFOLIO.md`(저장소 안 문서, 사이트에는 안 나옴). 업체 선정 기준 v2 뒷이야기는 2026-11-03에 반영했다. **사용자가 먼저 "포트폴리오 써 보자"고 할 때만 손댄다.** 기능을 바꿀 때마다 따라 고치지 않는다.
2. **가정치 근거**: `ASSUMPTIONS.md` "근거 대조 (2026-11-03)" 표에 정리. 반품 처리비 15%, 생산 중 불량, 현물을 구할 확률 60%, 개선 미팅 성공 60%, 샘플 합격 2%는 공개 근거를 못 찾았다(회사 내부 자료). 업체 평가 기준(납기 80%)은 업계 통념 95%보다 느슨하지만, 근거가 업체 블로그 수준이라 사용자가 바꾸지 않기로 했다.
3. **공휴일**: 2028년 공식 월력요항은 2027년 6월쯤 관보에 나오면 다시 대조. 2031년 이후는 목록을 더 넣어야 설·추석이 쉬는 날이 된다.
4. **보류 (사용자 결정)**: 다른 부서 확장, 닫아 둔 동안 오는 폰 알림(서버 필요).
5. **필요 없다고 정한 것**: 성과 평가 등급(S/A/B).
6. **남은 원격 브랜치**: `wip-desk-process`, `wip-autoplay`, `claude/holiday-source-check`. 사용자가 GitHub Branches 화면에서 지우면 된다.

## 사용자 선호 (작업 방식)

- 한국어로 답한다. 소제목과 줄바꿈으로 나누고, 이유와 근거를 함께 쓴다.
- 수치에는 출처를 남기고, 추정이면 추정이라고 밝힌다. "원문 확인"과 "검색 요약"을 구분한다.
- 부족한 점은 돌려 말하지 않고 짚는다. 하지만 비중이 작은 일(예: 공휴일)에 보고를 길게 하지 않는다.
- 포트폴리오 글은 사용자가 요청할 때만 고친다. 기능 작업 끝에 "포트폴리오에 반영할까요"라고 묻지 않는다.
- 사용자에게 경험을 물을 때는 번호 매긴 구체적인 질문을 먼저 한다.
- 과하게 큰 UI 요소를 싫어한다. 화면을 바꾸면 Playwright로 1440px·390px, 라이트·다크를 찍어 확인한다.
- 링크 페이지(`gwangsik2980.github.io/links/`) 같은 다른 공개 페이지를 바꿀 때는 먼저 확인받는다.
- 앱 안에서는 실제 기업명을 쓰지 않는다. 실제 기업과 비슷한 이름은 앞뒤를 바꾼다 (예: 대한제분유통 → 제분대한유통).

## 화면 확인 요령

- 데이터가 쌓인 상태: Vitest로 `createInitialState(seed, '2026-11-03', 'realtime')` 후 `advanceDays`를 돌려 JSON으로 저장한다.
- Playwright에서 저장 파일은 **`context.addInitScript`로 페이지가 뜨기 전에** localStorage `virtual-workplace/save/v1`에 넣는다. 페이지를 연 뒤 `evaluate`로 넣고 새로고침하면, 실시간 따라잡기가 새 회사를 저장하면서 덮어쓸 때가 있다.
- 근무 중 화면을 보려면 `newContext({ timezoneId: 'Asia/Seoul' })`. 컨테이너 시계는 UTC다.
- 테마는 localStorage `virtual-workplace/theme`(`light`/`dark`), 첫 화면은 `virtual-workplace/screen`(`chat`, `desk` 등).
- `npm run build` 후 `npx vite preview --port 4173`, 주소 `http://localhost:4173/virtual-workplace/`. 서버를 끌 때는 `lsof -t -i:4173 | xargs kill` (`pkill -f`는 자기 셸까지 죽인다).
- 헤더 nav는 화면 폭 1880px 이상에서만 보인다. 메뉴 항목은 `.navmenu-item`으로 찾는다 (`getByText`는 숨은 헤더 버튼을 먼저 잡는다).

## 환경 메모 (클라우드 세션)

- 네트워크 설정을 사용자가 넓혀서 curl과 Playwright로 외부 사이트(law.go.kr, astro.kasi.re.kr 등)를 열 수 있다. WebFetch 도구는 DNS 오류가 나서 curl이나 브라우저를 쓴다. 자바스크립트로 본문을 불러오는 법령 페이지는 Playwright로 열어 `innerText`를 읽는다.
