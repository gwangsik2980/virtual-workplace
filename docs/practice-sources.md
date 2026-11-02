# 구매 실무 내용 출처 검증

## 1. 목적과 조사 방법

- 조사일: 2026-11-02
- 목적: `src/sim/learning.ts`의 개념 카드 18개와 `docs/purchasing-process.md`의 절차 및 규칙이 공개 자료와 맞는지 확인하고, 인용할 수 있는 출처를 붙인다.
- 출처 선정 기준: 표준 기관과 공공 자료(SAP Help, Oracle 문서, APQC, 국가법령 해설, 한국은행 발표 보도)를 우선했다. 없으면 교재형 자료와 업계 용어집을 썼다. 업체 블로그는 여러 곳이 같은 내용을 말할 때만 근거로 삼았다.

### 한계 (반드시 읽을 것)

- **원문을 직접 열어 보지 못했다.** 이 세션의 네트워크 정책 때문에 페이지 열람 도구가 막혔다. `investopedia.com`, `en.wikipedia.org`, `docs.oracle.com` 접속이 거부됐다. 그래서 아래 근거는 모두 **웹 검색 결과의 요약과 발췌**에서 확인한 것이다. 출처 목록의 링크는 검색 결과에 실제로 나온 주소이고 지어낸 주소는 없다. 다만 본문 문장을 직접 대조하지 않았으므로 앱에 인용하기 전에 원문을 한 번 열어 확인해야 한다.
- 원문 확인을 하려면 세션 환경 설정의 네트워크 허용 목록에 해당 도메인을 추가해야 한다.
- CIPS, ISM, ASCM(APICS) 공식 사전 페이지는 검색에 나오지 않았다. 해당 기관 정의는 확인하지 못했다.
- 한국 공공 자료(조달청, 중소벤처기업부, 한국생산성본부)의 구매 실무 지침은 검색되지 않았다. 국가계약법, 부가가치세법, 하도급법 해설과 한국은행 수입물가 보도만 확인했다.
- 판정은 "개념 설명이 공개 자료와 어긋나지 않는가" 기준이다. 시뮬레이션 전용 수치(분, 일, %)는 대부분 공개 근거가 없다.

판정 기준: **일치** 공개 자료와 같은 내용 / **보완 필요** 큰 틀은 맞지만 빠지거나 과장된 부분이 있음 / **확인 불가** 근거를 찾지 못함

## 2. 개념 카드별 검증표

| # | 카드 | 판정 | 근거 요약 | 출처 |
|---|---|---|---|---|
| 1 | 재주문점과 안전재고 | 일치 | 재주문점 = 리드타임 동안 수요(일평균 수요 × 리드타임) + 안전재고라는 식이 여러 자료에서 같다. 안전재고는 수요와 리드타임 변동에 대비하는 완충 재고다. | [1], [2] |
| 2 | 구매요청(PR) | 일치 | SAP 문서는 PR을 "일정 수량의 자재나 용역을 특정 시점까지 조달하라는 구매부서에 대한 요청"으로 정의하고, 품목마다 수량과 납기일을 담는다고 설명한다. 납기일에서 리드타임을 역산해 발주 시점을 정하는 것도 같다. | [3], [4] |
| 3 | 시장조사 | 일치 | 공급업체 가격 인상 요청을 원자재 지수, 생산자물가지수 같은 외부 지표와 비교해 시장보다 과한 인상을 가려내라고 권한다. 카드의 "전월 대비 8% 인상을 시세와 비교" 질문과 맞다. | [5], [6] |
| 4 | 원가분석과 목표가격 | 보완 필요 | 원가분석(should-cost)은 재료비, 노무비, 간접비, 이윤으로 나눠 적정가를 추정하고 협상 목표가로 쓴다는 점은 맞다. 다만 카드 예시는 물류비를 30원(정액)으로, 절차 문서는 시장가의 2.5%로 적어 서로 다르다. 또 시뮬레이션 식은 시장 시세에 물류비와 마진을 더하는 단순화된 방식임을 밝혀야 한다. | [7], [8] |
| 5 | 견적요청(RFQ) | 일치 | 같은 사양으로 여러 업체 견적을 받아 비교하는 절차라는 설명이 같다. 국내 국가계약법도 수의계약 시 2인 이상 견적이 원칙이다. 아시아개발은행은 RFQ를 경쟁 강도가 낮은 방식으로 분류하니, 사양이 명확하고 가격이 주된 변수일 때 쓰는 방식이라는 점을 덧붙이면 좋다. | [9], [10], [11] |
| 6 | 견적 비교: 가격 외 조건 | 일치 | 총소유비용(TCO) 관점에서 단가 외에 품질 실패, 물류, 결제조건 비용을 함께 보라는 것이 공통된 설명이다. 가격만 보는 방식은 품질과 납기 관련 직간접 비용을 놓친다는 연구도 있다. | [12], [13] |
| 7 | 견적 조건 정규화 | 보완 필요 | 단위, 통화, 세금 기준을 하나로 고정한 뒤 비교하라는 설명은 맞다. VAT 포함가를 1.1로 나눠 공급가액을 구하는 방식도 부가가치세법 해설과 같다(22,000 ÷ 1.1 ÷ 20 = 1,000원/kg). 그러나 "수작업 오류가 가장 많이 생기는 지점"이라는 단정은 근거를 찾지 못했다. | [14], [15], [16] |
| 8 | 단가 협상 | 일치 | 구체적이고 믿을 만한 대안(경쟁 견적)이 협상력의 핵심이라는 BATNA 설명과 같다. 대안은 가격뿐 아니라 전환 비용까지 따져야 한다는 점은 덧붙일 만하다. | [17], [18] |
| 9 | 품의와 승인 | 일치 | 금액 구간별로 승인 권한을 나누는 위임전결(DOA)과, 한 사람이 요청부터 지급까지 모두 하지 못하게 하는 직무 분리가 내부통제의 기본이라는 설명과 같다. | [19], [20] |
| 10 | 발주서(PO) | 보완 필요 | PO에 품목, 수량, 단가, 납기, 결제조건을 적는다는 점은 맞다. 다만 PO는 공급업체가 수락해야 계약 효력이 생기는 청약이라는 점, 발주번호와 납품 장소도 들어간다는 점이 빠져 있다. | [21], [22] |
| 11 | 리드타임과 납기 준수율 | 보완 필요 | 납기 준수율 = 약속일 이내 입고 건수 ÷ 전체 입고 예정 건수라는 정의는 맞다. 다만 조기 입고, 분할 입고, 합의된 일정 변경을 어떻게 셀지 먼저 정해야 업체 간 비교가 공정하다는 점이 빠져 있다. | [23], [24] |
| 12 | 입고 검사와 불량 | 일치 | 불합격품은 식별, 격리 후 반품이나 시정조치 요구(SCAR)로 처리하고 업체 평가에 반영한다는 설명과 같다. 검사 범위는 위험에 비례해 정한다는 점은 덧붙일 만하다. | [25] |
| 13 | 3-Way Matching | 보완 필요 | 발주서, 입고 기록, 청구서를 대조해 지급한다는 정의는 맞다. 그러나 실무 시스템은 완전 일치가 아니라 **허용오차 범위 안**이면 지급하고, 벗어나면 지급 보류한다. 2-way, 4-way(검사 결과 추가)도 있다. | [26], [27], [28] |
| 14 | 구매원가 절감 산정 | 보완 필요 | 시장 변동분을 성과에서 분리해야 한다는 취지는 맞다. 다만 공개 자료는 실제 지출 감소(hard savings)와 비용 회피(cost avoidance)를 따로 보고하고, 기준가격은 재무팀과 미리 합의하라고 권한다. 최초 견적을 기준으로 쓰면 업체가 첫 견적을 부풀릴 때 절감이 과대 계상될 수 있다는 점도 알려야 한다. | [29], [30] |
| 15 | 결품 | 일치 | 품절(결품)은 수요나 생산 요구를 채울 수량이 부족한 상태이고, 제조업에서는 생산 중단으로 이어진다는 설명과 같다. 근거 자료의 권위는 낮은 편이다. | [31], [32] |
| 16 | 환율과 수입 원료 | 일치 | 한국은행은 원화 기준 수입물가와, 환율 효과를 뺀 계약통화 기준 수입물가를 따로 발표한다. 환율 상승이 원화 수입가격을 올리고, 환율 효과를 분리해서 봐야 한다는 카드 내용과 같다. | [33], [34] |
| 17 | 결제조건과 현금흐름 | 보완 필요 | 결제기간이 길수록 매입채무 회전일수(DPO)가 늘어 현금 여유가 생긴다는 점은 맞다. 그러나 (1) 기산점은 보통 납품일이 아니라 청구서 발행일이며, (2) 결제기간을 늘리면 업체가 가격에 반영하거나 관계가 나빠질 수 있고, (3) 조기 지급 할인(예: 2/10 net 30)을 포기하는 비용은 연 36% 수준으로 클 수 있다. 하도급 거래라면 목적물 수령일부터 60일 이내 지급 의무가 있다. | [35], [36], [37] |
| 18 | 공급업체 평가 | 일치 | 품질, 납기, 가격, 대응력을 가중 점수로 평가하고 가중치는 품목 중요도에 따라 달라진다는 설명과 같다. | [38], [39] |

집계: 일치 11, 보완 필요 7, 확인 불가 0. 단, 모든 근거가 검색 요약 기반이라 원문 확인 전까지는 잠정 판정이다.

### 보완 필요 카드의 수정 제안 문장

- **4 원가분석과 목표가격**
  - summary: "품목 가격을 재료비, 물류비, 업체 마진 등으로 나눠 보고 적정 구매가격(목표가)을 추정한다. 이 시뮬레이션은 원료 시세에 물류비와 표준마진을 더하는 단순한 방식을 쓴다."
  - check: 절차 문서와 맞추어 "시장가 1,000원, 물류비는 시장가의 2.5%, 표준마진 3%라면 목표가는 얼마일까?"로 바꾸거나, 절차 문서의 식을 정액 물류비로 바꾼다. (정답: (1,000 + 25) × 1.03 = 1,055.75원)
- **7 견적 조건 정규화**
  - why: "기준을 맞추지 않으면 비싼 업체가 싸 보이거나 그 반대가 된다. 단위와 세금, 환율을 직접 계산해야 해서 수작업 오류가 생기기 쉬운 지점이다."
- **10 발주서(PO)**
  - summary: "업체에 보내는 공식 주문서. 발주번호, 품목, 수량, 단가, 납기, 납품 장소, 결제조건을 적는다. 업체가 수락하면 계약으로서 효력이 생긴다."
- **11 리드타임과 납기 준수율**
  - summary 끝에 추가: "조기 입고나 분할 입고를 준수로 볼지는 회사가 미리 정해 둔다."
- **13 3-Way Matching**
  - summary: "발주서, 입고 수량, 업체 청구서를 대조해 정해 둔 허용오차 안에서 일치할 때 대금을 지급한다. 벗어나면 지급을 보류하고 원인을 확인한다."
- **14 구매원가 절감 산정**
  - why 끝에 추가: "실무에서는 실제 지출이 줄어든 절감과 오를 가격을 막은 비용 회피를 따로 보고하고, 기준가격을 재무팀과 미리 합의한다. 최초 견적을 기준으로 삼으면 업체가 첫 견적을 높게 낼 때 절감이 부풀려질 수 있다."
- **17 결제조건과 현금흐름**
  - summary: "청구서 발행 후 30일, 60일처럼 대금 지급 시점을 정한 조건이다. 길수록 회사 현금에 여유가 생기지만, 업체가 그만큼 단가에 반영하거나 조기 지급 할인을 제시하기도 한다."
  - why 끝에 추가: "하도급 거래에는 목적물 수령일부터 60일 안에 지급해야 하는 법적 한도가 있다."

## 3. 구매 절차 검증 (purchasing-process.md)

| 단계 | 시뮬레이션 규칙 | 판정 | 근거 요약 | 출처 |
|---|---|---|---|---|
| 구매요청 | 재고 + 발주 진행분 < 재주문점이면 요청 | 일치 | 재주문점 방식과 같다. 발주 진행분을 더해 판단하는 것은 표준적인 재고 위치 개념이다. | [1], [2] |
| 구매요청 | 남은 재고 일수 < 리드타임이면 긴급 | 확인 불가 | 합리적인 규칙이지만 이 기준을 명시한 공개 자료는 찾지 못했다. | 없음 |
| 시장조사 | 45분 | 확인 불가 | 소요시간 근거 없음. | 없음 |
| 원가분석 | 목표가 = (시장가 + 물류비 2.5%) × 1.03 | 보완 필요 | 원가 구성 요소로 나누는 원리는 맞다. 카드 예시(물류비 30원)와 표기를 맞추고 단순화한 식임을 적는다. | [7], [8] |
| 견적요청 | 취급 업체 전부, 회신 1~3일 | 확인 불가 | 복수 견적은 일치. 회신 일수 근거는 없다. | [9], [10] |
| 견적 비교 | 정규화 후 평가 점수 최저 업체 선정 | 일치 | 단위와 통화, 세금 기준을 고정하고 총비용으로 비교하라는 권고와 같다. | [12], [14], [16] |
| 단가 협상 | 업체 여지 3~7% 안에서 할인 | 확인 불가 (모순 없음) | 업계 자료는 최초 제시가 대비 5~15%, 기존 업체 10~15%, 사례 6% 등을 제시한다. 감사된 통계는 없다. 3~7%는 이 범위의 아래쪽으로 보수적이다. | [40], [41] |
| 품의와 승인 | 3천만 원 초과 2일, 이하 1일, 긴급 당일 | 확인 불가 (구조는 일치) | 금액 구간별 승인 단계는 일치한다. 일수 근거는 없다. APQC는 구매요청부터 발주까지 주기를 측정하며, 중앙값 2일이라는 2차 인용이 있으나 원자료로 확인하지 못했다. | [19], [42], [43] |
| 발주 | 비교표 오입력이 발주서로 전파 | 일치 | 3-way matching이 이런 오류를 지급 전에 잡는 통제라는 설명과 같다. | [26], [28] |
| 입고 | 지연 1~4일, 불량률 2% 초과 시 클레임 | 확인 불가 (모순 없음) | 한 품질 컨설팅 자료가 "90일 누적 입고 불합격률 2% 초과 시 시정조치"를 예시로 든다. 예시일 뿐 표준은 아니다. | [25] |
| 검수·정산 | 단가 불일치 시 재작업 50분 | 확인 불가 | 불일치 시 지급 보류는 일치. 재작업 시간 근거는 없다. | [27] |
| 업체 평가 점수 | 결제 유예 효과 연 5% | 보완 필요 | 결제기간 가치를 자본비용으로 환산하는 방식은 맞다. 5%를 "회사 자본비용 가정"이라고 명시할 것. 조기 지급 할인 조건이 있으면 내재 금리가 훨씬 높을 수 있다. | [36] |
| 실무와 다른 점 | 기존 계약 단가가 있어 매번 견적을 받지 않음 | 일치 | 장기 계약에서는 원자재 지수에 연동한 가격 조정 조항을 쓰는 경우가 많다는 자료와 같다. | [6] |

## 4. 가정치 관련 공개 근거

### 4.1 필드당 입력 시간 1.2분

- **찾은 것**
  - 키 입력 모델(KLM) 기준값: 키 1회 0.28초, 마우스 이동 1.1초, 판단 준비 1.2초. 주소 한 칸(18자) 입력이 약 5초라는 예시가 있다. [44]
  - KLM으로 웹 양식 입력 시간을 예측하고 실측과 비교한 연구가 있다(Katsanos 외, INTERACT 2013). 수치 원문은 확인하지 못했다. [45]
  - APQC 2차 인용: 매입채무 담당자 1명이 연간 처리하는 청구서 중앙값 12,000건. [46] 연 근무 약 1,800시간으로 가정해 단순 나누면 청구서 1건에 약 9분이다(이 계산은 조사자가 한 것이고, 청구서 1건의 전체 처리 시간이지 필드당 시간이 아니다).
- **판정: 확인 불가.** 순수 타이핑만 보면 필드당 수 초라서 1.2분은 길다. 그러나 1.2분은 원문에서 값을 찾고 확인하고 입력하는 시간을 합친 것이라 직접 비교할 자료가 없다. 앱에서는 "타이핑 시간이 아니라 찾기, 확인, 입력을 합친 가정"이라고 설명하고, 사용자가 바꿀 수 있다는 점을 유지하는 것이 맞다.

### 4.2 필드당 오입력 확률 2%

- **찾은 것**
  - 병리 기록 수기 전사 연구: 전체 오류율 2.8%, 필드에 따라 0.5~6.4%. 텍스트 필드가 숫자 필드보다 오류가 많았다. [47]
  - 임상 전사 연구들의 오류율은 대체로 한 자릿수 %이고, 8.8%, 10.2% 사례도 있다. [47]
  - 단일 입력 2.02%, 이중 입력 1.01%라는 인용이 있으나 원 논문 수치와 단위가 어긋난다는 지적이 있어 인용하지 않는 것이 좋다. [48]
  - 체계적 문헌고찰: 데이터베이스 오류율이 1만 필드당 2~2,784건으로 편차가 매우 크다. [47]
  - Barchard & Pace(2011): 단일 입력과 눈으로 확인하는 방식은 이중 입력보다 오류가 약 30배 많았다는 2차 설명이 있다. 정확한 수치는 원문 확인이 필요하다. [49]
  - 업체 블로그에 흔한 "사람 입력 오류율 1~4%(IBM)", "300타당 1개 오류" 같은 수치는 원출처를 확인할 수 없다. [50]
- **판정: 범위 안 (약한 지지).** 2%는 공개 연구의 범위(대체로 0.5~6%) 안에 있다. 다만 연구 대상이 의료와 연구 데이터라 구매 견적 입력과 같다고 볼 수 없다.
- **환산 필드 추가 오류 6%**: 단위, 통화, 세금 환산 오류율에 대한 공개 근거는 찾지 못했다. 확인 불가.

### 4.3 협상 할인 여지 3~7%

- 업계 자료: 최초 제시가 대비 5~15% [40], 기존 업체 협상 10~15% [41], AI 협상 보고서 2~11%(중간값 4~6%, 감사되지 않은 수치) [40].
- **판정: 확인 불가, 모순 없음.** 감사된 통계는 없고 3~7%는 보수적인 쪽이다.

### 4.4 승인 소요일

- APQC는 "구매요청부터 발주까지 일수"를 측정 지표로 정의한다(대기 시간 포함). [42]
- 중앙값 2일이라는 2차 인용 [43], 상위 기업 8시간 대 기타 11시간이라는 과거 APQC 분석 인용 [51]이 있다.
- **판정: 확인 불가.** 시뮬레이션의 1~2일은 2차 인용 수치와 크게 어긋나지 않지만, 승인 단계만 따로 잰 자료는 없다.

### 4.5 기타

- 결제 유예 금융효과 연 5%: 조기 지급 할인 2/10 net 30을 포기하는 비용은 연 약 36.7%(360일 기준)다. [36] 5%는 할인 조건이 없는 경우의 자본비용 가정으로 보면 무리가 없다. 확인 불가(가정치로 표기 유지).
- 정산 재작업 50분, 비교표 고정 25분, 월간 보고 150분: 공개 근거 없음.

## 5. 앱에 반영할 수정 목록 (우선순위순)

1. **원가분석 예시 불일치 해소** (카드 4, 절차 문서): 카드는 물류비 30원 정액, 절차 문서와 실제 계산은 시장가의 2.5%다. 학습자가 카드 질문의 정답을 계산과 다르게 알게 된다. 둘 중 하나로 통일한다.
2. **3-Way Matching에 허용오차 반영** (카드 13): "일치할 때만"을 "허용오차 안에서 일치할 때"로 고치고, 시뮬레이션 정산 규칙에 허용오차가 없다면 그 점을 "실무와 다를 수 있는 부분"에 적는다.
3. **결제조건 기산점과 부작용** (카드 17): "납품 후"를 "청구서 발행 후"로 고치고, 업체의 단가 반영과 조기 지급 할인, 하도급법 60일 한도를 짧게 추가한다.
4. **절감 산정 기준 설명 보강** (카드 14): 비용 회피와 실제 절감을 구분하고, 최초 견적 기준의 한계를 적는다.
5. **발주서의 법적 성격** (카드 10): 업체 수락 시 계약 효력, 발주번호와 납품 장소 항목 추가.
6. **정규화 카드의 단정 표현 완화** (카드 7): "가장 많이 생기는"을 "생기기 쉬운"으로.
7. **납기 준수율 정의 보강** (카드 11): 조기와 분할 입고 처리 기준.
8. **`docs/ASSUMPTIONS.md` 갱신**: 오입력 2%에 "공개 연구 범위(0.5~6%) 안, 다른 분야 자료"라는 근거 수준을, 협상 3~7%에 "업계 자료 5~15%보다 보수적"이라는 메모를 붙인다. 1.2분은 "직접 근거 없음, 타이핑 외 찾기와 확인 포함"으로 적는다.
9. **출처 안내 문구 교체** (`learning.ts` 상단 주석, 절차 문서 머리말): 원문 확인을 마친 뒤 이 문서를 참고 자료로 연결한다. 원문 확인 전에는 "공개 자료와 대조함(검색 요약 기준)" 정도로만 표기한다.
10. **원문 확인 작업**: 네트워크 허용 후 아래 출처 중 [3], [11], [14], [26], [33], [42], [47]부터 원문을 열어 문장을 대조한다.

## 6. 출처 목록

모두 2026-11-02 웹 검색 결과에서 확인한 주소다. 원문은 열람하지 못했다(1장 한계 참조).

1. Calculating reorder point with safety stock: formulas, examples, and tools (Cleverence) — https://www.cleverence.com/articles/for-business/calculating-reorder-point-with-safety-stock-6283/ (접속일 2026-11-02)
2. 재주문 시점 (IT위키) — https://itwiki.kr/w/%EC%9E%AC%EC%A3%BC%EB%AC%B8_%EC%8B%9C%EC%A0%90 (접속일 2026-11-02)
3. SAP Help Portal, Purchase Requisition — https://help.sap.com/saphelp_erp60_sp/helpdata/en/4c/7eb65334e6b54ce10000000a174cb4/content.htm (접속일 2026-11-02)
4. SAP Help Portal, Purchase Requisition (ERP 2005) — https://help.sap.com/saphelp_erp2005/helpdata/EN/75/ee0b6255c811d189900000e8322d00/content.htm (접속일 2026-11-02)
5. How to evaluate supplier price increase requests (softconcis) — https://www.softconcis.de/en/how-to-evaluate-supplier-price-increase-requests/ (접속일 2026-11-02)
6. Procurement Glossary: Price index (Tacto) — https://www.tacto.ai/en/procurement-glossary/price-index (접속일 2026-11-02)
7. Should Cost Analysis (Aavenir glossary) — https://aavenir.com/glossary/should-cost-analysis/ (접속일 2026-11-02)
8. CIPS L4M2 Chapter 1 (1.2) Flashcards (Brainscape) — https://www.brainscape.com/flashcards/9130026/packs/15966669 (접속일 2026-11-02)
9. Request for Quotation (RFQ) (CIO Wiki) — https://cio-wiki.com/wiki/Request_for_Quotation_(RFQ) (접속일 2026-11-02)
10. Request for Quotations (Asian Development Bank) — https://www.adb.org/documents/request-for-quotations (접속일 2026-11-02)
11. 찾기 쉬운 생활법령정보, 국가계약 수의계약 견적서 제출 — https://www.easylaw.go.kr/CSP/SysChartRetrievePLst.laf?csmSeq=519 (접속일 2026-11-02)
12. Total cost of ownership (Zigaflow glossary) — https://zigaflow.com/resources/glossary/total-cost-of-ownership (접속일 2026-11-02)
13. Supplier selection problem: a comparison of the total cost of ownership and analytic hierarchy process approaches (Supply Chain Management, DOI) — https://www.doi.org/10.1108/13598540210436586 (접속일 2026-11-02)
14. 공급대가 vs 공급가액: 개념, 차이점, 계산 방법 완벽 정리 (taxguide.im) — https://taxguide.im/blog/supply-value-vs-total-supply-value-guide (접속일 2026-11-02)
15. Normalizing vendor pricing across bids so you can compare apples to apples (FitGap) — https://us.fitgap.com/stack-guides/normalizing-vendor-pricing-across-bids-so-you-can-compare-apples-to-apples (접속일 2026-11-02)
16. What Is a CBE? Commercial Bid Evaluation (Project Materials) — https://blog.projectmaterials.com/quick-answers/epc/what-is-cbe/ (접속일 2026-11-02)
17. Best alternative to negotiated agreement (BATNA) (Docusign) — https://www.docusign.com/blog/best-alternative-to-negotiated-agreement-batna (접속일 2026-11-02)
18. BATNA (Procurement Tactics) — https://procurementtactics.com/batna (접속일 2026-11-02)
19. Delegation of Authority for approval and segregation of duties for procurement activities (FAO) — https://sfcs.fao.org/asiapacific/events/events-detail/Delegation-of-Authority-for-approval-and-segregation-of-duties-for-procurement-activities/en (접속일 2026-11-02)
20. 4008 Segregation of Duties (Waterloo Region District School Board) — https://www.wrdsb.ca/wp-content/uploads/4008-Segregation-of-Duties.pdf (접속일 2026-11-02)
21. What is a purchase order (Sage) — https://www.sage.com/en-us/blog/what-is-a-purchase-order/ (접속일 2026-11-02)
22. Purchase Orders (PO) (LegalZoom business glossary) — https://legalzoom.com/business-glossary/purchase-orders-po (접속일 2026-11-02)
23. On-Time Delivery (OTD): Definition, Formula, KPI & How to Improve It (SourceDay) — https://sourceday.com/blog/on-time-delivery-metrics/ (접속일 2026-11-02)
24. On-time Supplier Delivery Rate (OpsDog) — https://opsdog.com/products/on-time-supplier-delivery-rate (접속일 2026-11-02)
25. ISO 9001 purchasing controls, supplier evaluation, incoming inspection (iso9001expert) — https://iso9001expert.pages.dev/blog/iso-9001-purchasing-controls-supplier-evaluation-incoming-inspection/ (접속일 2026-11-02)
26. Three-way matching (Microsoft Learn, Dynamics 365 Finance) — https://learn.microsoft.com/en-us/training/modules/accounting-distributions-invoice-validation-dyn365-finance/10-three-way-match (접속일 2026-11-02)
27. Match Approval Level Options (Oracle Cloud Procurement 25B) — https://docs.oracle.com/en/cloud/saas/procurement/25b/oapro/match-approval-level-options.html (검색 결과로만 확인, 직접 접속은 거부됨, 2026-11-02)
28. Two-, Three-, and Four-way Matching (Oracle Payables) — https://docs.oracle.com/cd/A60725_05/html/comnls/us/ap/point04.htm (검색 결과로만 확인, 2026-11-02)
29. Cost avoidance vs cost savings: why both matter for procurement (Suplari) — https://suplari.com/blog/cost-avoidance-vs-cost-savings-why-both-matter-for-procurement (접속일 2026-11-02)
30. Cost savings vs cost avoidance (Precoro) — https://precoro.com/blog/cost-savings-vs-cost-avoidance/ (접속일 2026-11-02)
31. 재고 관리 (IT위키) — https://itwiki.kr/w/%EC%9E%AC%EA%B3%A0_%EA%B4%80%EB%A6%AC (접속일 2026-11-02)
32. Palletization vs stockout (UNISCO) — https://www.unisco.com/ko/comparison/palletization-vs-stockout (접속일 2026-11-02)
33. 지난달 12월 수입물가지수 142.39 (세계일보) — https://www.segye.com/newsView/20260114516332 (접속일 2026-11-02)
34. 수입물가 관련 보도 (경향신문) — https://www.khan.co.kr/article/202501150714001 (접속일 2026-11-02)
35. Days Payable Outstanding (DPO): definition, formula, and interpretation (Allianz Trade) — https://www.allianz-trade.com/en_global/news-insights/business-tips-and-trade-advice/days-payable-outstanding-dpo-definition-formula-examples.html (접속일 2026-11-02)
36. 9.20 "Trade Credit": Relevant Costs (Touro Corporate Finance, Pressbooks) — https://pressbooks.pub/tourocorporatefinance/chapter/9-20-trade-credit-relevant-costs-2 (접속일 2026-11-02)
37. 하도급거래 공정화에 관한 법률 제13조 (하도급대금의 지급 등) (korea.legal) — https://korea.legal/wiki/%ed%95%98%eb%8f%84%ea%b8%89%ea%b1%b0%eb%9e%98-%ea%b3%b5%ec%a0%95%ed%99%94%ec%97%90-%ea%b4%80%ed%95%9c-%eb%b2%95%eb%a5%a0-%ec%a0%9c13%ec%a1%b0/ (접속일 2026-11-02)
38. Supplier scorecard (Tacto procurement glossary) — https://www.tacto.ai/en/procurement-glossary/supplier-scorecard (접속일 2026-11-02)
39. Supplier Evaluation: How to Score and Select Vendors (Lapasar) — https://mall.lapasar.com/articles/supplier-evaluation-guide (접속일 2026-11-02)
40. Procurement Glossary: Negotiation techniques (Tacto) — https://www.tacto.ai/en/procurement-glossary/negotiation-techniques (접속일 2026-11-02)
41. Webinar recording: Category benchmarks (Tacto) — https://www.tacto.ai/en/resources-posts/webinar-recording-category-benchmarks-where-are-your-biggest-potentials-in-procurement (접속일 2026-11-02)
42. Cycle time in days to issue a purchase order for goods (APQC Open Standards Benchmarking) — https://www.apqc.org/what-we-do/benchmarking/open-standards-benchmarking/measures/cycle-time-issue-purchase-order-goods (접속일 2026-11-02)
43. Manufacturing purchase order confirmation workload statistics 2026 (StealthAgents) — https://stealthagents.com/research/manufacturing-purchase-order-confirmation-workload-statistics-2026 (접속일 2026-11-02)
44. Using keystroke level model to save time on forms (UX Movement) — https://uxmovement.com/forms/using-keystroke-level-model-to-save-time-on-forms/ (접속일 2026-11-02)
45. KLM Form Analyzer: Automated Evaluation of Web Form Filling Tasks Using Human Performance Models (Katsanos 외, IFIP) — https://dl.ifip.org/IFIP-LNCS/hal-01501769v1 (접속일 2026-11-02)
46. Accounts Payable Key Benchmarks: Cross Industry (APQC) — https://www.apqc.org/resource-library/resource-listing/accounts-payable-key-benchmarks-cross-industry (접속일 2026-11-02)
47. Measuring the rate of manual transcription error (PMC 문헌) — https://pmc.ncbi.nlm.nih.gov/articles/PMC6351970 (접속일 2026-11-02)
48. PLoS ONE (Jan 2012) data entry study (DOAJ) — https://doaj.org/article/eb28866771ef41bbb62b97d1a687e03b (접속일 2026-11-02)
49. Barchard & Pace (2011) abstract, Computers in Human Behavior — https://online210.psych.wisc.edu/wp-content/uploads/PSY-210_Unit_Materials/PSY-210_Unit05_Materials/Barchard_abstract_CHB_2011.pdf (접속일 2026-11-02)
50. Data Entry Error Rates: How Much Manual Mistakes Really Cost (Lido) — https://lido.app/blog/data-entry-error-rates (접속일 2026-11-02, 원출처 불명 수치의 예로만 인용)
51. One way to cut costs is by decreasing the cycle times associated with procuring materials and services (SDCExec) — https://www.sdcexec.com/warehousing/article/11647230/one-way-to-cut-costs-is-by-decreasing-the-cycle-times-associated-with-procuring-materials-and-services (접속일 2026-11-02)
