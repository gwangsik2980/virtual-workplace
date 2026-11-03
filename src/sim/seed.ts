import type {
  CostModelParams,
  CumulativeStats,
  GameState,
  Material,
  MaterialId,
  Supplier,
  SupplierHistory,
} from './types';

/**
 * 초기 가상 세계.
 * 회사·인물·업체·가격은 모두 가상으로 정한 값이다. 실제 기업이나 시세와 무관하다.
 */

export const START_DATE = '2027-01-04'; // 월요일

const emptyHistory = (): SupplierHistory => ({
  orders: 0,
  onTime: 0,
  late: 0,
  receivedQty: 0,
  defectQty: 0,
  spend: 0,
});

export const DEFAULT_PARAMS: CostModelParams = {
  entryMinutesPerField: 1.2,
  baseErrorRate: 0.02,
  conversionErrorRate: 0.06,
  compareFixedMinutes: 25,
  toolReviewMinutesPerQuote: 2.5,
  mismatchReworkMinutes: 50,
  workdayMinutes: 480,
};

function makeMaterials(): Record<MaterialId, Material> {
  const list: Material[] = [
    {
      id: 'flour',
      name: '밀가루(중력분)',
      unit: 'kg',
      imported: false,
      baseMarketPrice: 900,
      volatility: 0.006,
      usagePerProduct: 0.25,
      stock: 0,
      avgCost: 900,
      safetyDays: 3,
      orderCoverDays: 12,
    },
    {
      id: 'soyoil',
      name: '대두유',
      unit: 'kg',
      imported: true,
      baseMarketPrice: 2200,
      volatility: 0.009,
      usagePerProduct: 0.02,
      stock: 0,
      avgCost: 2200,
      safetyDays: 5,
      orderCoverDays: 25,
    },
    {
      id: 'sugar',
      name: '정백당',
      unit: 'kg',
      imported: true,
      baseMarketPrice: 1100,
      volatility: 0.007,
      usagePerProduct: 0.03,
      stock: 0,
      avgCost: 1100,
      safetyDays: 4,
      orderCoverDays: 20,
    },
    {
      id: 'chili',
      name: '고춧가루',
      unit: 'kg',
      imported: false,
      baseMarketPrice: 14000,
      volatility: 0.012,
      usagePerProduct: 0.015,
      stock: 0,
      avgCost: 14000,
      safetyDays: 3,
      orderCoverDays: 10,
    },
    {
      id: 'film',
      name: '포장필름(PE)',
      unit: 'm',
      imported: false,
      baseMarketPrice: 180,
      volatility: 0.005,
      usagePerProduct: 0.35,
      stock: 0,
      avgCost: 180,
      safetyDays: 4,
      orderCoverDays: 15,
    },
  ];
  // 초기 재고: 원료별로 남은 일수를 다르게 두어 첫 주부터 구매 요청이 순차적으로 발생하게 한다.
  const coverDays: Record<MaterialId, number> = { flour: 9, soyoil: 16, sugar: 8, chili: 7, film: 13 };
  const out = {} as Record<MaterialId, Material>;
  for (const m of list) {
    m.stock = Math.round(m.usagePerProduct * BASE_DEMAND * coverDays[m.id]);
    out[m.id] = m;
  }
  return out;
}

export const BASE_DEMAND = 4000;

function makeSuppliers(): Supplier[] {
  const s = (
    id: string,
    name: string,
    materialIds: MaterialId[],
    priceFactor: number,
    defectRate: number,
    leadTimeDays: number,
    reliability: number,
    negotiationRoom: number,
    paymentTermsDays: number,
    quoteFormat: Supplier['quoteFormat'],
  ): Supplier => ({
    id,
    name,
    materialIds,
    priceFactor,
    defectRate,
    leadTimeDays,
    reliability,
    negotiationRoom,
    paymentTermsDays,
    quoteFormat,
    history: emptyHistory(),
  });
  return [
    s('S01', '대한제분유통', ['flour', 'sugar'], 1.04, 0.008, 4, 0.95, 0.04, 30, 'A'),
    s('S02', '한결곡물', ['flour'], 1.0, 0.025, 6, 0.82, 0.06, 45, 'C'),
    s('S03', 'Pacific Agri Trading', ['soyoil', 'sugar'], 0.97, 0.012, 12, 0.88, 0.05, 60, 'B'),
    s('S04', '오성유지', ['soyoil'], 1.06, 0.006, 5, 0.96, 0.03, 30, 'A'),
    s('S05', '달콤당업', ['sugar'], 1.05, 0.005, 4, 0.95, 0.03, 30, 'A'),
    s('S06', '청양농산', ['chili'], 1.02, 0.018, 5, 0.9, 0.07, 30, 'D'),
    s('S07', '우리고추유통', ['chili'], 1.08, 0.007, 3, 0.97, 0.04, 30, 'A'),
    s('S08', '미래포장', ['film'], 1.02, 0.01, 7, 0.92, 0.05, 45, 'C'),
    s('S09', '세진패키징', ['film'], 0.98, 0.022, 9, 0.85, 0.06, 60, 'D'),
  ];
}

const emptyStats = (): CumulativeStats => ({
  priceSavingKRW: 0,
  selectionLossKRW: 0,
  entryErrors: 0,
  invoiceMismatches: 0,
  compareMinutes: 0,
  quotesProcessed: 0,
  casesCompared: 0,
  employeeMinutes: 0,
  overtimeMinutes: 0,
  stockoutDays: 0,
  deliveriesOnTime: 0,
  deliveriesLate: 0,
  receivedQtyByMaterial: {},
  defectQty: 0,
  closedCases: 0,
  cycleDaysSum: 0,
  reportMinutes: 0,
  reportsWritten: 0,
  lateDaysSum: 0,
  expediteRecoveredDays: 0,
});

export function createInitialState(seed = 20270104): GameState {
  const materials = makeMaterials();
  const prices = {} as Record<MaterialId, number>;
  for (const m of Object.values(materials)) prices[m.id] = m.baseMarketPrice;

  return {
    version: 1,
    seed,
    day: 1,
    startDate: START_DATE,
    company: {
      name: '가온식품',
      industry: '식품 제조 (가상 기업)',
      product: '떡볶이 밀키트',
      productPrice: 4500,
      productUnitCost: 0,
      capacityPerDay: 5200,
      baseDemand: BASE_DEMAND,
      fixedCostPerDay: 12_500_000,
    },
    materials,
    suppliers: makeSuppliers(),
    market: { prices, fx: 1350, demandBoost: 1, demandBoostUntil: 0, shocks: [] },
    finance: {
      cash: 600_000_000,
      // 이미 운영 중인 회사로 시작: 지난 22영업일 매출의 채권이 순차적으로 들어온다
      receivables: Array.from({ length: 22 }, (_, i) => ({ day: i + 1, amount: BASE_DEMAND * 4500 })),
      payables: [],
      revenueCum: 0,
      cogsCum: 0,
      purchaseCum: 0,
      fixedCostCum: 0,
      monthlyBudget: 60_000_000,
      monthSpend: 0,
    },
    employee: {
      id: 'E01',
      name: 'GWANG',
      dept: 'purchasing',
      rank: '사원',
      joinedDay: 1,
      skills: { market: 30, costing: 25, negotiation: 20, docs: 35 },
      xp: 0,
      completedCases: 0,
      milestones: [{ day: 1, text: '구매팀 사원으로 첫 출근' }],
    },
    cases: [],
    schedule: [],
    messages: [],
    events: [],
    history: [],
    backlog: [],
    tools: [],
    params: { ...DEFAULT_PARAMS },
    learning: { unlocked: {}, understood: {}, notes: [], improvements: [] },
    verifications: [],
    reports: [],
    counters: {},
    stats: emptyStats(),
  };
}
