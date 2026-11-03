# 작업 인계 (2026-11-03 기준)

새 세션에서 이어서 작업할 때 먼저 읽는 문서. 규칙과 명령은 `CLAUDE.md`, 수치 근거는 `docs/ASSUMPTIONS.md`에 있다.

## 지금 상태

- 저장소 `gwangsik2980/virtual-workplace`, 배포 https://gwangsik2980.github.io/virtual-workplace/
- `main`에 푸시하면 GitHub Actions가 바로 배포한다. **사용자가 "배포해줘"라고 한 뒤에만** `main`에 올린다. 작업은 세션 브랜치에서 하고, 끝나면 "배포할까요?"라고 묻는다.
- **진행 중 (main에 안 올림)**: 브랜치 `claude/adoring-ptolemy-f90lwf`에 "닫아 둔 동안 알림"과 "기기 연결" 작업이 있다. 새 세션은 이 브랜치를 받아서 이어 간다 (`git fetch origin claude/adoring-ptolemy-f90lwf && git checkout claude/adoring-ptolemy-f90lwf`). 자세한 내용은 아래 "진행 중: 기기 연결과 닫아 둔 동안 알림".
- `main`(사이트)은 커밋 `1e88994` 상태. 그 뒤 작업은 모두 위 브랜치에만 있다.
- 브랜치 기준 테스트 78개 통과 (`npm test`), 타입 검사 통과 (`npx tsc --noEmit`). 새 컨테이너는 `npm ci`부터.
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
| 닫아 둔 동안 알림 (웹 푸시, **브랜치에만 있음**) | 사이트가 열려 있을 때 지금 상태를 복사해 30영업일(약 6주)을 미리 돌려 알림 예정표를 만들고, Cloudflare Worker(`worker/`, Durable Object 알람)에 맡긴다. 서버는 회사 계산을 하지 않고 받은 시각에 보내기만 한다. 도구 적용·설정 변경 때 다시 계산해 덮어쓰므로 알림과 화면 내용이 같다. 켜져 있으면 화면 쪽 팝업은 보내지 않는다. 서명 키(VAPID)는 서버가 처음 쓸 때 만들어 Durable Object에 보관. 아이폰은 홈 화면 앱(iOS 16.4+)에서만. 배포는 `.github/workflows/push-worker.yml`(GitHub Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). 서버 주소는 `src/ui/push.ts` `PUSH_SERVER` | `src/sim/pushSchedule.ts`, `src/ui/push.ts`, `worker/`, `public/sw.js` |

## 진행 중: 기기 연결과 닫아 둔 동안 알림 (2026-11-03 저녁)

**사용자가 원하는 것**
1. 아이폰에서 사이트를 닫아 두어도 알림 7종(결품, 긴급, 지연, 품질, 정산, 납기 위험, 급여)을 모두 받는다. 방식은 웹 푸시로 정했다.
2. PC(크롬·엣지)와 폰이 **같은 회사**를 본다. 지금은 브라우저마다 저장이 따로라서 화면이 다르다.

**설계 (사용자 승인)**
- 서버는 Cloudflare 무료 요금제(Worker + SQLite Durable Object). 회사 계산은 하지 않고 저장과 시각 맞춰 보내기만 한다. 무료 한도를 넘으면 오류가 날 뿐 과금되지 않는다(요금 문서 원문 확인). 사용자에게 비용 걱정 없다고 설명했다.
- 알림: 사이트가 열려 있을 때 지금 상태로 30영업일을 미리 돌려 예정표를 만들어 올린다(`src/sim/pushSchedule.ts`). 재현성 원칙 덕분에 나중에 따라잡은 결과와 같다(테스트로 확인). 도구 적용·설정 변경 때 다시 계산해 덮어쓴다. 서버가 그 시각에 그룹의 모든 구독 기기로 보내고, 기기마다 끈 종류는 서버가 뺀다.
- 기기 연결: 12자리 연결 코드(헷갈리는 글자 I·L·O·U 뺀 32글자)로 그룹을 만든다. 아이폰 홈 화면 앱은 Safari와 저장소가 달라 링크로는 못 넘기므로 **코드를 직접 입력**한다. 그룹이 회사 저장본 하나(gzip 후 base64, 1년치 약 100KB)를 갖고, 사용자 조작이 있으면 올리고(마지막에 올린 쪽이 이김), 다른 기기는 열 때와 1분마다 새 번호(rev)가 있으면 받아서 바꾼 뒤 스스로 따라잡는다. 따라잡기 진행은 올리지 않는다(어느 기기에서나 같은 결과라서).

**끝난 것 (브랜치에 있음)**
- `worker/src/webpush.ts`: RFC 8291 암호화와 VAPID 서명. RFC 부록 A 예시와 암호문이 바이트 단위로 같고, 애플 푸시 서버에 실제로 보내 서명이 통과하는 것을 확인했다(가짜 기기 주소라 `BadDeviceToken`, 망가뜨린 서명은 `BadJwtToken`).
- `worker/src/box.ts`, `index.ts`: 그룹 방식 서버. 경로는 `GET /key`, `GET /g/{코드}/state?since=rev`, `POST /g/{코드}/state|schedule|subscribe|unsubscribe|test`. 서명 키는 서버가 처음 쓸 때 만들어 'vapid' Durable Object에 보관한다. 무료 Worker는 요청당 CPU 10ms라 앞단은 본문을 읽지 않고 넘긴다. 테스트 `tests/pushBox.test.ts`, `tests/webpush.test.ts`.
- `src/sim/pushSchedule.ts`: 예정표 계산(종류를 달고, 종류 거르기는 안 함). 테스트 `tests/pushSchedule.test.ts`.
- `src/sim/alertKinds.ts`: 알림 종류 판정을 sim으로 옮김(화면과 푸시가 같은 기준).
- `public/sw.js`: push 이벤트에서 알림 띄우기.
- `.github/workflows/push-worker.yml`: `worker/`가 바뀌면 `npx wrangler@4.40.0 deploy`. 로컬 `wrangler dev`로 경로가 동작하는 것도 확인했다.

**남은 것 (이 순서로)**
1. `src/ui/push.ts`를 그룹 방식으로 바꾼다. 지금은 **예전 서버 경로**(`/schedule`, `/test` 등 그룹 없는 것)를 부르고 있어서 그대로 켜면 안 된다. 바꿀 점: 알림 켜기 때 그룹이 없으면 만들고 `/g/{코드}/subscribe`(구독 + 이 기기의 알림 종류) → `/test`. 알림 종류를 바꾸면 subscribe를 다시 보낸다. 예정표(`PushSync`)는 이 기기에서 알림을 안 켰어도 그룹이 있으면 올린다(PC에서 도구를 적용해도 폰 예정표가 바뀌도록).
2. `src/ui/sync.ts`(새로): 연결 코드 저장(localStorage, GameState에 넣지 않음), 저장본 올리기·받기, `CompressionStream('gzip')`. `store.tsx`에서 사용자 조작(update, replace, reset, undo)일 때만 바뀜을 알리고, 서버에서 받은 저장본은 알리지 않고 넣는 방법(예: `replace(next, { remote: true })`)을 만든다. 따라잡기(`advance` record:false)는 올리지 않는다.
3. 메뉴 하단 회색 글씨 줄(`src/App.tsx` "처음부터 다시 시작" 옆)에 "기기 연결" 추가. 그룹이 없을 때: [연결 코드 만들기] 또는 [다른 기기 코드 입력]. 코드를 입력하면 이 기기의 회사가 바뀐다고 확인을 받는다. 그룹이 있을 때: 코드 표시, 마지막 동기화 시각, [연결 끊기]. 작게 만든다.
4. 1440·390px, 라이트·다크 확인 → 커밋 → 사용자에게 "배포할까요?"
5. 서버 배포: 사용자가 GitHub Secrets에 `CLOUDFLARE_API_TOKEN`("Edit Cloudflare Workers" 템플릿), `CLOUDFLARE_ACCOUNT_ID`를 넣었는지 확인하고 워크플로를 다시 돌린다(브랜치 푸시 때 Secrets가 없어 실패한 실행이 있을 수 있다. 정상). 배포 기록에서 `https://vw-push.<하위주소>.workers.dev`를 찾아 `src/ui/push.ts`의 `PUSH_SERVER`에 넣는다. 토큰은 채팅으로 받지 않는다.
6. 사이트 배포 후 사용자 확인: PC에서 코드 만들기 → 폰(홈 화면 앱)에서 코드 입력 → 알림 켜기 → "알림이 연결됐어요" 테스트 알림.

**알아 둘 것**
- 사용자 엣지 브라우저에는 실시간 모드 전 **수동 진행 저장본**(시작일 2027-01-04, 현실보다 앞섬)이 남아 있어 화면이 멈춘 것처럼 보인다("현실보다 ○일 앞섬", 회색 불). 기기 연결로 코드를 입력하면 해결된다. 앞선 저장본일 때 "오늘부터 새로 시작" 버튼을 띄울지는 사용자에게 물었고 답을 못 받았다.
- 알림 빈도(시드 1~4, 1년): 연 68건, 한 달 5~6건. 품질 27, 급여 22, 지연 8, 정산 5, 결품 3.5, 긴급 2.5, 납기 위험 0(도구 적용 시에만). 영업일의 78%는 알림 0건. 사용자에게 설명했다.
- 아이폰 웹 푸시는 iOS 16.4 이상, 홈 화면에 추가한 앱에서만 된다(WebKit 블로그 원문 확인).

## 남은 일과 보류 항목

1. **포트폴리오**: `docs/PORTFOLIO.md`(저장소 안 문서, 사이트에는 안 나옴). 업체 선정 기준 v2 뒷이야기는 2026-11-03에 반영했다. **사용자가 먼저 "포트폴리오 써 보자"고 할 때만 손댄다.** 기능을 바꿀 때마다 따라 고치지 않는다.
2. **가정치 근거**: `ASSUMPTIONS.md` "근거 대조 (2026-11-03)" 표에 정리. 반품 처리비 15%, 생산 중 불량, 현물을 구할 확률 60%, 개선 미팅 성공 60%, 샘플 합격 2%는 공개 근거를 못 찾았다(회사 내부 자료). 업체 평가 기준(납기 80%)은 업계 통념 95%보다 느슨하지만, 근거가 업체 블로그 수준이라 사용자가 바꾸지 않기로 했다.
3. **공휴일**: 2028년 공식 월력요항은 2027년 6월쯤 관보에 나오면 다시 대조. 2031년 이후는 목록을 더 넣어야 설·추석이 쉬는 날이 된다.
4. **보류 (사용자 결정)**: 다른 부서 확장.
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
