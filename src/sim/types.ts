/**
 * 핵심 데이터 개체 (기획서 9장)
 * 모든 상태는 JSON으로 직렬화할 수 있어야 한다. 저장·불러오기와 반사실 비교가
 * structuredClone 한 번으로 가능하도록 함수나 클래스 인스턴스를 넣지 않는다.
 */

export type MaterialId = 'flour' | 'soyoil' | 'sugar' | 'chili' | 'film';
export type DeptId = 'mgmt' | 'production' | 'purchasing' | 'logistics' | 'sales' | 'quality';

export interface Material {
  id: MaterialId;
  name: string;
  /** 재고·단가 기준 단위 */
  unit: 'kg' | 'm';
  /** 수입 원료 여부 (환율 영향) */
  imported: boolean;
  /** 1일차 기준 시장가격 (KRW / unit, VAT 별도) */
  baseMarketPrice: number;
  /** 일간 가격 변동성 (표준편차 비율) */
  volatility: number;
  /** 제품 1개 생산에 필요한 양 */
  usagePerProduct: number;
  stock: number;
  /** 이동평균 단가 (재고자산 평가용) */
  avgCost: number;
  /** 안전재고 일수 */
  safetyDays: number;
  /** 1회 표준 발주 일수분 */
  orderCoverDays: number;
}

export type QuoteFormat = 'A' | 'B' | 'C' | 'D';

export interface Supplier {
  id: string;
  name: string;
  materialIds: MaterialId[];
  /** 시장가격 대비 견적 수준 (1.05 = 시장가 +5%) */
  priceFactor: number;
  /** 평균 불량률 */
  defectRate: number;
  /** 평균 리드타임(영업일) */
  leadTimeDays: number;
  /** 약속 납기 준수 확률 */
  reliability: number;
  /** 협상으로 내려갈 수 있는 최대 할인율 */
  negotiationRoom: number;
  paymentTermsDays: number;
  /** 견적서 양식 (A: 국문 표준, B: 영문/USD, C: 포대 단위·VAT 포함, D: 스캔본 섞임) */
  quoteFormat: QuoteFormat;
  history: SupplierHistory;
  /** false면 거래 중지 (견적 요청 대상에서 빠진다). 없으면 거래 중 */
  active?: boolean;
  /** 신규 발굴로 등록된 날 (처음부터 있던 업체는 없음) */
  addedDay?: number;
  /** 분기 평가에서 연속으로 기준 미달한 횟수 */
  warnings?: number;
  /** 지난 분기 평가 시점의 실적 (이번 분기 실적 = 지금 − 이 값) */
  reviewBase?: SupplierHistory;
  /** 가장 최근 분기 평가 결과 */
  lastReview?: { day: number; onTimeRate: number; defectRate: number; orders: number; grade: 'good' | 'watch' | 'poor' };
}

/** 신규 공급처 후보. 숨은 조건은 샘플 시험과 거래를 해 봐야 드러난다 */
export interface SupplierCandidate {
  id: string;
  name: string;
  materialIds: MaterialId[];
  profile: Omit<Supplier, 'id' | 'name' | 'materialIds' | 'history'>;
  status: 'searching' | 'sampling' | 'registering' | 'approved' | 'rejected';
  foundDay?: number;
  sampleResultDay?: number;
  sampleDefectRate?: number;
}

/** 구매 건과 따로 들어오는 입고 (대체 납품, 긴급 현물 구매) */
export interface InboundLot {
  id: string;
  kind: 'replacement' | 'spot';
  materialId: MaterialId;
  qty: number;
  unitPrice: number;
  arriveDay: number;
  supplierName: string;
  caseId?: string;
}

export interface SupplierHistory {
  orders: number;
  onTime: number;
  late: number;
  receivedQty: number;
  defectQty: number;
  /** 누적 구매액 (KRW) */
  spend: number;
}

/** 견적의 실제 조건 (진실값). 담당자가 입력한 값과 다를 수 있다. */
export interface QuoteTerms {
  /** 정규화된 단가: KRW / 기준단위, VAT 별도 */
  unitPriceKRW: number;
  leadTimeDays: number;
  paymentTermsDays: number;
  moq: number;
  validUntilDay: number;
}

export interface Quote {
  id: string;
  caseId: string;
  supplierId: string;
  receivedDay: number;
  format: QuoteFormat;
  /** 견적서 원문. 사람이 읽거나 도구가 파싱하는 대상 */
  docText: string;
  /** 스캔 이미지라 텍스트가 없는 견적서 */
  scanned: boolean;
  truth: QuoteTerms;
}

/** 견적 비교표에 입력된 값 (수작업 또는 도구) */
export interface EnteredQuote {
  quoteId: string;
  supplierId: string;
  unitPriceKRW: number;
  leadTimeDays: number;
  paymentTermsDays: number;
  /** 비교 당시 입력값 기준 평가 점수 (KRW/기준단위, 낮을수록 좋음) */
  score?: number;
  /** 비교 당시 진실값 기준 평가 점수 */
  trueScore?: number;
  /** 어떤 필드가 어떻게 틀렸는지 (검증·학습용 기록. 담당자는 이 사실을 모른다) */
  errors: EntryError[];
  /** 도구가 처리하지 못해 사람이 입력한 필드 */
  manualFields: string[];
}

export type EntryErrorKind = 'digit' | 'unit' | 'vat' | 'currency' | 'leadtime' | 'terms';

export interface EntryError {
  field: string;
  kind: EntryErrorKind;
  trueValue: number;
  enteredValue: number;
}

export type CompareMethod = 'manual' | 'tool';

export interface ComparisonRecord {
  method: CompareMethod;
  toolId?: string;
  toolVersion?: string;
  day: number;
  minutes: number;
  entered: EnteredQuote[];
  fieldsTotal: number;
  fieldsManual: number;
  errorCount: number;
  /** 입력값 기준으로 선택한 업체 */
  selectedSupplierId: string;
  /** 진실값 기준 최적 업체 */
  trueBestSupplierId: string;
  /** 잘못된 선택으로 더 지불하게 된 금액 (KRW, 진실값 기준) */
  selectionLossKRW: number;
}

export type Stage =
  | 'request' // 구매 요청 접수
  | 'market' // 시장조사
  | 'costing' // 원가분석·목표가
  | 'rfq' // 견적 요청 발송
  | 'awaitQuotes' // 견적 회신 대기
  | 'compare' // 견적 비교
  | 'negotiate' // 단가 협상
  | 'approve' // 팀장 승인 대기
  | 'order' // 발주
  | 'awaitDelivery' // 입고 대기
  | 'inspect' // 입고 검수·정산
  | 'done'
  | 'cancelled';

export interface CostBreakdown {
  marketPrice: number;
  fx?: number;
  logisticsPerUnit: number;
  standardMargin: number;
  targetPrice: number;
}

export interface SavingsRecord {
  /** 기준가격: 선정 업체의 협상 전 최초 견적 단가 (동일 조건) */
  baselinePrice: number;
  finalPrice: number;
  qty: number;
  /** 가격 절감액 = (기준가격 - 최종단가) × 실제 입고 수량 */
  priceSavingKRW: number;
  /** 목표가 대비 차이 (참고) */
  vsTargetKRW: number;
  /** 시장가격 변동분 = (정산일 시장가 − 시장조사 시점 시장가) × 수량. 양수면 시장 상승. 구매 성과와 분리하기 위한 기록 */
  marketMoveKRW: number;
  formula: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  /** 발주서에 입력된 단가 (입력 오류가 남아 있을 수 있음) */
  unitPriceEntered: number;
  /** 합의된 실제 단가 */
  unitPriceAgreed: number;
  qty: number;
  amountKRW: number;
  orderDay: number;
  promisedDay: number;
  actualArrivalDay: number;
  paymentTermsDays: number;
}

export interface PurchaseCase {
  id: string;
  materialId: MaterialId;
  qty: number;
  createdDay: number;
  neededByDay: number;
  urgent: boolean;
  reason: string;
  stage: Stage;
  /** 현재 단계 남은 작업 시간(분) */
  stageMinutesLeft: number;
  /** 현재 단계 총 작업 시간(분) */
  stageMinutesTotal: number;
  /** 대기 단계 종료일 */
  waitUntilDay?: number;
  marketPriceAtStart?: number;
  cost?: CostBreakdown;
  rfqSupplierIds: string[];
  quotes: Quote[];
  comparison?: ComparisonRecord;
  selectedSupplierId?: string;
  negotiation?: { initialPrice: number; finalPrice: number; discountRate: number };
  po?: PurchaseOrder;
  delivery?: { arrivedDay: number; late: boolean; defectQty: number; invoiceMismatch: boolean };
  savings?: SavingsRecord;
  minutesSpent: number;
  closedDay?: number;
  /** 구매팀이 납기 지연을 알게 된 날과 방법 */
  delayKnownDay?: number;
  delayKnownBy?: 'tool' | 'manual';
  /** 독촉으로 앞당긴 일수 */
  expediteRecoveredDays?: number;
  /** 업체가 단가 인상을 요구했던 건: 요구율과 방어 후 최종 인상률 */
  priceIncrease?: { requested: number; final: number };
  /** 검수를 통과했지만 생산 중에 드러날 불량 (발견일, 수량) */
  latentDefect?: { day: number; qty: number; found?: boolean };
}

export type SkillId = 'market' | 'costing' | 'negotiation' | 'docs';

export interface Employee {
  id: string;
  name: string;
  dept: DeptId;
  rank: string;
  joinedDay: number;
  /** 지금 직급이 된 날 (승진 연차 계산용) */
  rankSinceDay?: number;
  skills: Record<SkillId, number>;
  xp: number;
  completedCases: number;
  /** 경력 이정표 */
  milestones: { day: number; text: string }[];
}

export type WorkKind = 'case' | 'report' | 'mail' | 'claim' | 'meeting' | 'adhoc' | 'expedite' | 'lunch' | 'spot' | 'sourcing' | 'review' | 'training';

export interface TimeBlock {
  day: number;
  /** 09:00 기준 경과 분 */
  start: number;
  minutes: number;
  label: string;
  kind: WorkKind;
  caseId?: string;
  toolId?: string;
  /** 구매 건 업무라면 그때의 구매 단계 (실시간 화면에서 '지금' 단계를 거꾸로 찾는 데 쓴다) */
  stage?: Stage;
}

export interface Message {
  id: string;
  day: number;
  /** 그날 09:00부터 몇 분째에 보냈는지. 예전 저장본에는 없다 */
  minute?: number;
  from: string;
  to: string;
  subject: string;
  body: string;
  caseId?: string;
  quoteId?: string;
}

export type EventType =
  | 'market'
  | 'demand'
  | 'stockout'
  | 'request'
  | 'order'
  | 'delivery'
  | 'quality'
  | 'delay'
  | 'finance'
  | 'tool'
  | 'career'
  | 'payroll'
  | 'system';

export type ChatThread = 'lead' | 'prod' | 'qa' | 'logi' | 'fin' | 'sales';

/** 사내 메신저 한 줄. from이 me면 GWANG이 보낸 것 */
export interface ChatMessage {
  id: string;
  day: number;
  /** 09:00부터 지난 분 */
  minute: number;
  thread: ChatThread;
  from: 'me' | 'them';
  text: string;
  caseId?: string;
}

export interface EventLog {
  id: string;
  day: number;
  /** 그날 09:00부터 지난 분. 실시간 모드에서 알림을 이 시각에 보낸다 */
  minute?: number;
  type: EventType;
  dept: DeptId;
  title: string;
  detail: string;
  caseId?: string;
}

export interface MarketState {
  /** 오늘 시장가격 (KRW / unit) */
  prices: Record<MaterialId, number>;
  /** USD/KRW */
  fx: number;
  /** 수요 배율 (프로모션 등) */
  demandBoost: number;
  demandBoostUntil: number;
  /** 원자재 가격 충격 */
  shocks: { materialId: MaterialId; until: number; drift: number }[];
}

export interface Finance {
  cash: number;
  /** 매출채권: 입금 예정 */
  receivables: { day: number; amount: number }[];
  /** 매입채무: 지급 예정 */
  payables: { day: number; amount: number; poId: string }[];
  revenueCum: number;
  cogsCum: number;
  /** 매출원가 밖의 손실·비용 누계 (반품 처리비, 폐기 손실 − 클레임 회수액). 영업이익에서 뺀다 */
  otherExpenseCum?: number;
  purchaseCum: number;
  fixedCostCum: number;
  monthlyBudget: number;
  monthSpend: number;
}

export interface DailySnapshot {
  day: number;
  cash: number;
  inventoryValue: number;
  revenue: number;
  produced: number;
  demand: number;
  /** 하루 영업이익 = 매출 − 매출원가(추적 원료 + 기타 원재료) − 고정비 − 그날 생긴 기타 손실 */
  opProfit?: number;
  /** 그날 생긴 기타 손실 (반품 처리비, 폐기 손실 − 클레임 회수액) */
  otherExpense?: number;
  /** 원료 부족으로 생산이 줄었다면 그 원료 */
  shortMaterial?: MaterialId;
  priceSavingCum: number;
  selectionLossCum: number;
  entryErrorsCum: number;
  employeeMinutes: number;
  compareMinutes: number;
  openCases: number;
  prices: Record<MaterialId, number>;
  fx: number;
}

export interface Company {
  name: string;
  industry: string;
  product: string;
  productPrice: number;
  productUnitCost: number;
  capacityPerDay: number;
  baseDemand: number;
  /** 인건비, 제조 경비, 판관비 등 하루 고정비 */
  fixedCostPerDay: number;
  /** 구매팀이 다루지 않는 기타 원재료·부자재 (떡, 어묵, 소스 원료 등) 세트당 원가 */
  otherCostPerUnit: number;
}

export interface AppliedTool {
  toolId: string;
  version: string;
  appliedDay: number;
  /** 적용 해제일 (해제되지 않았으면 없음) */
  removedDay?: number;
}

/** 사용자 측 학습·개발 연속성 (기획서 4장 B) */
export interface LearningState {
  /** 관찰로 열린 개념 → 처음 관찰한 날 */
  unlocked: Record<string, number>;
  understood: Record<string, boolean>;
  notes: { id: string; day: number; caseId?: string; conceptId?: string; text: string }[];
  improvements: Improvement[];
}

export type ImprovementStage = 'observe' | 'define' | 'design' | 'develop' | 'apply' | 'verify';

export interface Improvement {
  id: string;
  title: string;
  stage: ImprovementStage;
  createdDay: number;
  priority: 'high' | 'mid' | 'low';
  fields: Partial<Record<ImprovementStage, string>>;
  toolId?: string;
}

export interface VerificationRun {
  id: string;
  day: number;
  toolId: string;
  toolVersion: string;
  days: number;
  baseline: VerificationMetrics;
  withTool: VerificationMetrics;
}

export interface VerificationMetrics {
  compareMinutes: number;
  casesCompared: number;
  quotesProcessed: number;
  entryErrors: number;
  selectionLossKRW: number;
  invoiceMismatches: number;
  totalEmployeeMinutes: number;
  overtimeMinutes: number;
  priceSavingKRW: number;
  stockoutDays: number;
  avgCycleDays: number;
  reportMinutes: number;
  reportsWritten: number;
  lateDeliveries: number;
  lateDaysSum: number;
  expediteRecoveredDays: number;
}

export interface CostModelParams {
  /** 견적서 필드 1개 확인·입력 시간(분) */
  entryMinutesPerField: number;
  /** 필드 1개 입력 오류 확률 (숙련도 보정 전) */
  baseErrorRate: number;
  /** 단위 환산이 필요한 필드의 추가 오류 확률 */
  conversionErrorRate: number;
  /** 비교표 작성·검토 고정 시간(분) */
  compareFixedMinutes: number;
  /** 도구 결과 검토 시간(견적서 1건당, 분) */
  toolReviewMinutesPerQuote: number;
  /** 정산 불일치 발생 시 재작업 시간(분) */
  mismatchReworkMinutes: number;
  /** 일일 근무시간(분) */
  workdayMinutes: number;
}

export interface GameState {
  version: 1;
  seed: number;
  day: number;
  startDate: string;
  company: Company;
  materials: Record<MaterialId, Material>;
  suppliers: Supplier[];
  market: MarketState;
  finance: Finance;
  employee: Employee;
  cases: PurchaseCase[];
  schedule: TimeBlock[];
  messages: Message[];
  events: EventLog[];
  history: DailySnapshot[];
  /** 대기 중인 비사건성 업무 (보고서, 클레임 등) */
  backlog: BacklogItem[];
  tools: AppliedTool[];
  params: CostModelParams;
  learning: LearningState;
  verifications: VerificationRun[];
  /** 작성된 월간 보고서 */
  reports: ReportRecord[];
  counters: Record<string, number>;
  /** 업체 선정 기준. 없으면 v2(결품 손실 반영). v1은 비교 검증용 */
  selectionRule?: 'v1' | 'v2';
  /** 시간 흐름: realtime = 현실 날짜와 함께 흐름, manual = 버튼으로만 진행 */
  clock?: { mode: 'realtime' | 'manual' };
  /** 담당자 급여와 통장 */
  payroll: Payroll;
  /** 사내 메신저 (상사 지시, 다른 부서 협조) */
  chats: ChatMessage[];
  /** 대체 납품·긴급 현물 구매처럼 구매 건 밖에서 들어오는 입고 */
  inbound: InboundLot[];
  /** 신규 공급처 발굴 */
  sourcing: { nextDay: number; candidates: SupplierCandidate[] };
  /** 하루 계산 중 지금 몇 분째인지 (사건 시각 기록용, 계산이 끝나면 비움) */
  nowMinute?: number;
  stats: CumulativeStats;
}

export interface BacklogItem {
  id: string;
  kind: 'report' | 'claim' | 'adhoc' | 'expedite' | 'spot' | 'sourcing' | 'review' | 'meeting' | 'training';
  title: string;
  /** 클레임: 입고 검수 불량(대체 납품 요청)인지 생산 중 불량(손실 보상 요청)인지, 보상 청구 대상 금액 */
  claimType?: 'receiving' | 'production';
  claimAmount?: number;
  /** 업체 관련 업무 (협력사 미팅, 연초 단가 인상 협상) */
  supplierId?: string;
  /** 연초 단가 인상 협상: 업체가 요구한 인상률 */
  priceUpRequest?: number;
  /** 신규 공급처 업무 */
  candidateId?: string;
  sourcingStep?: 'search' | 'register';
  /** 교육으로 오를 숙련도 */
  skill?: SkillId;
  from?: string;
  createdDay: number;
  dueDay: number;
  minutesLeft: number;
  minutesTotal: number;
  caseId?: string;
  /** 보고서 업무: 대상 기간 */
  periodFrom?: number;
  periodTo?: number;
  /** 이 업무에 쓰인 도구 */
  toolId?: string;
  toolVersion?: string;
}

export interface ReportRecord {
  id: string;
  day: number;
  fromDay: number;
  toDay: number;
  method: 'manual' | 'tool';
  toolVersion?: string;
  minutes: number;
  text: string;
}

export interface CumulativeStats {
  priceSavingKRW: number;
  selectionLossKRW: number;
  entryErrors: number;
  invoiceMismatches: number;
  compareMinutes: number;
  quotesProcessed: number;
  casesCompared: number;
  employeeMinutes: number;
  overtimeMinutes: number;
  stockoutDays: number;
  deliveriesOnTime: number;
  deliveriesLate: number;
  receivedQtyByMaterial: Record<string, number>;
  defectQty: number;
  closedCases: number;
  cycleDaysSum: number;
  reportMinutes: number;
  reportsWritten: number;
  /** 약속일 대비 지연 일수 합 (입고 기준) */
  lateDaysSum: number;
  expediteRecoveredDays: number;
  /** 반품 운송·재검사 비용 중 회사가 떠안은 몫 */
  defectHandlingKRW?: number;
  /** 생산 중 불량으로 폐기한 원료 금액 */
  scrapKRW?: number;
  /** 클레임으로 업체에서 돌려받은 금액 */
  claimRecoveredKRW?: number;
  /** 긴급 현물 구매에서 시세보다 더 낸 금액 */
  spotPremiumKRW?: number;
  spotBuys?: number;
  /** 업체 인상 요구로 협상 전 견적보다 더 내게 된 금액 */
  priceIncreaseKRW?: number;
  priceIncreaseCases?: number;
  qualityIncidents?: number;
  /** 연초 단가 인상 통보 건수와 협상 후 평균 인상률 합 */
  annualIncreases?: number;
  annualIncreaseRateSum?: number;
  /** 현물을 구하지 못한 날 */
  spotFailures?: number;
  suppliersAdded?: number;
  suppliersSuspended?: number;
  supplierMeetings?: number;
  trainingSessions?: number;
}

export interface PayLine {
  label: string;
  amount: number;
  /** 지급 항목만: 과세 여부 */
  taxable?: boolean;
}

export interface Payslip {
  id: string;
  /** 지급한 날 (영업일 번호) */
  day: number;
  /** salary = 10일 월급, extra = 25일 연장근로수당·성과급 */
  kind: 'salary' | 'extra';
  /** 어느 달 몫인지 (YYYY-MM) */
  period: string;
  rank: string;
  earnings: PayLine[];
  deductions: PayLine[];
  gross: number;
  totalDeduction: number;
  net: number;
  note?: string;
}

export interface BankTxn {
  day: number;
  amount: number;
  balance: number;
  memo: string;
  payslipId?: string;
}

export interface Payroll {
  account: { bank: string; number: string; balance: number; txns: BankTxn[] };
  payslips: Payslip[];
  /** 연봉 이력. from 달(YYYY-MM)부터 적용 */
  salaryHistory: { from: string; annual: number; rank: string }[];
}
