import { chat, chatOncePerDay } from './chat';
import { unlockConcept } from './learning';
import { makeRng } from './rng';
import type { BacklogItem, GameState, MaterialId, SkillId, Supplier, SupplierCandidate, SupplierHistory } from './types';
import { addStat, dayToDate, formatDay, isMonthStart, logEvent, nextId, sendMessage } from './util';

/**
 * 공급업체 관리 업무: 신규 공급처 발굴, 분기 업체 평가와 협력사 미팅, 사내 교육.
 * 시간과 숫자는 모두 가정치다 (docs/ASSUMPTIONS.md "공급업체 관리와 교육").
 */

/** 신규 공급처 후보 (모두 가상 업체). 숨은 조건은 이름으로 뽑은 난수로 정해진다 */
const CANDIDATE_POOL: { name: string; materialIds: MaterialId[] }[] = [
  { name: '누리곡산', materialIds: ['flour'] },
  { name: '진성곡물상사', materialIds: ['flour', 'sugar'] },
  { name: '바른유지상사', materialIds: ['soyoil'] },
  { name: 'Blue Harbor Foods', materialIds: ['soyoil', 'sugar'] },
  { name: '설단당업', materialIds: ['sugar'] },
  { name: '해담고추', materialIds: ['chili'] },
  { name: '붉은들농산', materialIds: ['chili'] },
  { name: '청솔포장', materialIds: ['film'] },
  { name: '보람필름', materialIds: ['film'] },
];

/** 원료마다 거래 업체를 이 수까지만 늘린다 */
const MAX_ACTIVE_PER_MATERIAL = 3;
export const SOURCING_SEARCH_MINUTES = 90;
export const SOURCING_REGISTER_MINUTES = 60;
/** 샘플 시험 합격 기준 불량률 */
export const SAMPLE_PASS_DEFECT = 0.02;
export const REVIEW_MINUTES = 120;
export const MEETING_MINUTES = 75;
/** 협력사 개선 미팅이 실제 개선으로 이어질 확률 */
export const MEETING_SUCCESS = 0.6;
/** 분기마다 하루(8시간) 교육, 연 32시간. 1인당 연 교육훈련 37.8시간 통계에 가깝게 (docs/ASSUMPTIONS.md) */
export const TRAINING_MINUTES = 480;
/** 연초 단가 인상 통보 확률(업체별)과 요구 폭. 가정치 */
export const ANNUAL_UP_CHANCE = 0.6;
export const ANNUAL_UP_RANGE = [0.02, 0.06] as const;

const SKILL_TOPIC: Record<SkillId, string> = {
  market: '원자재 시황 분석',
  costing: '원가 분석 실무',
  negotiation: '구매 협상 실무',
  docs: 'ERP·엑셀 데이터 처리',
};

const zeroHistory = (): SupplierHistory => ({ orders: 0, onTime: 0, late: 0, receivedQty: 0, defectQty: 0, spend: 0 });
const activeFor = (state: GameState, id: MaterialId) => state.suppliers.filter((s) => s.active !== false && s.materialIds.includes(id));
const month = (state: GameState) => dayToDate(state.startDate, state.day).getMonth();

/** 오늘 생길 공급업체 관리 업무를 만든다 (출근 직후) */
export function scheduleSupplierWork(state: GameState): void {
  if (isMonthStart(state.startDate, state.day)) {
    // 1·4·7·10월 첫 영업일: 분기 업체 평가 (거래 실적이 쌓인 뒤부터)
    if (month(state) % 3 === 0 && state.day > 20) {
      state.backlog.push(item(state, 'review', '분기 공급업체 평가 (납기·품질 실적)', REVIEW_MINUTES, 5));
    }
    // 1월 첫 영업일: 업체들이 인건비·물류비를 이유로 연간 단가 인상을 통보한다
    if (month(state) === 0 && state.day > 1) {
      const year = dayToDate(state.startDate, state.day).getFullYear();
      for (const s of state.suppliers) {
        if (s.active === false) continue;
        const rng = makeRng(state.seed, 'annual-up', s.id, year);
        if (!rng.chance(ANNUAL_UP_CHANCE)) continue;
        const req = Math.round(rng.range(ANNUAL_UP_RANGE[0], ANNUAL_UP_RANGE[1]) * 1000) / 1000;
        unlockConcept(state, 'price-increase');
        state.backlog.push({ ...item(state, 'meeting', `연간 단가 인상 협상: ${s.name} (요구 +${(req * 100).toFixed(1)}%)`, MEETING_MINUTES, 8), supplierId: s.id, priceUpRequest: req });
        chatOncePerDay(state, 'lead', 'annual-up', [
          ['them', '연초라 업체들 단가 인상 공문 들어오죠? 업체별로 요구율이랑 근거 정리해서 협상 일정 잡아요. 그대로 받아 주면 안 돼요.'],
          ['me', '네 팀장님, 공문 오는 대로 정리하겠습니다.'],
        ]);
        sendMessage(state, {
          from: s.name,
          to: state.employee.name,
          subject: `[공문] ${year}년 공급 단가 조정 요청`,
          body: `인건비와 물류비 상승으로 ${year}년 공급 단가를 ${(req * 100).toFixed(1)}% 인상하고자 합니다. 협의 일정 부탁드립니다.`,
        });
      }
    }
    // 2·5·8·11월 첫 영업일: 사내 교육. 가장 약한 숙련도를 보강한다
    if (month(state) % 3 === 1) {
      const skills = state.employee.skills;
      const skill = (Object.keys(skills) as SkillId[]).reduce((a, b) => (skills[b] < skills[a] ? b : a));
      state.backlog.push({ ...item(state, 'training', `사내 교육: ${SKILL_TOPIC[skill]}`, TRAINING_MINUTES, 0), skill });
      chat(state, 'lead', [
        ['them', [`오늘 ${SKILL_TOPIC[skill]} 교육 하루 종일이죠? 급한 건 제가 볼 테니 교육에 집중해요.`, `${SKILL_TOPIC[skill]} 교육 잘 듣고 와요. 들은 거 다음 주 회의 때 짧게 공유해 주고요.`]],
        ['me', ['감사합니다 팀장님. 끝나고 밀린 건 바로 처리하겠습니다.', '네, 정리해서 공유드리겠습니다.']],
      ]);
    }
  }
  runSourcing(state);
}

function item(state: GameState, kind: BacklogItem['kind'], title: string, minutes: number, dueIn: number): BacklogItem {
  return { id: nextId(state, 'BL'), kind, title, createdDay: state.day, dueDay: state.day + dueIn, minutesLeft: minutes, minutesTotal: minutes };
}

/* ---------------- 신규 공급처 발굴 ---------------- */

function runSourcing(state: GameState): void {
  const sc = state.sourcing;
  // 샘플 시험 결과
  for (const cand of sc.candidates) {
    if (cand.status !== 'sampling' || cand.sampleResultDay === undefined || state.day < cand.sampleResultDay) continue;
    const rng = makeRng(state.seed, 'sample', cand.id);
    cand.sampleDefectRate = Math.max(0, cand.profile.defectRate * Math.exp(0.4 * rng.normal()));
    const pass = cand.sampleDefectRate < SAMPLE_PASS_DEFECT;
    const pct = (cand.sampleDefectRate * 100).toFixed(1);
    logEvent(state, 'quality', 'quality', `${cand.name} 샘플 시험 ${pass ? '합격' : '불합격'}`, `샘플 불량률 ${pct}% (기준 ${SAMPLE_PASS_DEFECT * 100}% 미만).`);
    chat(state, 'qa', [
      ['them', [`${cand.name} 샘플 시험 ${pass ? '합격' : '불합격'}이에요. 불량률 ${pct}% 나왔습니다.`, `${cand.name} 샘플 결과 나왔어요. 불량률 ${pct}%라 ${pass ? '통과예요' : '기준 넘었어요'}.`]],
      ['me', pass ? '감사합니다! 등록 진행할게요.' : '아쉽네요. 다른 후보 찾아보겠습니다. 감사합니다.'],
    ]);
    sendMessage(state, {
      from: '품질팀 정주임',
      to: state.employee.name,
      subject: `[샘플 시험] ${cand.name} ${pass ? '합격' : '불합격'}`,
      body: pass
        ? `${cand.name} 샘플 시험 결과 불량률 ${pct}%로 기준을 통과했습니다. 업체 등록 진행하셔도 됩니다.`
        : `${cand.name} 샘플 불량률이 ${pct}%로 기준을 넘었습니다. 거래는 어렵겠습니다.`,
    });
    if (pass) {
      cand.status = 'registering';
      state.backlog.push({ ...item(state, 'sourcing', `신규 업체 등록: ${cand.name} (거래 조건 협의, ERP 등록)`, SOURCING_REGISTER_MINUTES, 3), candidateId: cand.id, sourcingStep: 'register' });
    } else {
      cand.status = 'rejected';
      sc.nextDay = Math.min(sc.nextDay, state.day + 20);
    }
  }

  if (state.day < sc.nextDay) return;
  if (sc.candidates.some((c) => c.status === 'searching' || c.status === 'sampling' || c.status === 'registering')) return;
  // 거래 업체가 적거나 경고가 쌓인 원료부터 찾는다
  const used = new Set([...sc.candidates.map((c) => c.name), ...state.suppliers.map((s) => s.name)]);
  const options = CANDIDATE_POOL.filter((p) => !used.has(p.name) && p.materialIds.some((id) => activeFor(state, id).length < MAX_ACTIVE_PER_MATERIAL));
  if (options.length === 0) {
    sc.nextDay = state.day + 60;
    return;
  }
  const need = (id: MaterialId) => {
    const act = activeFor(state, id);
    return act.length * 10 - act.reduce((a, s) => a + (s.warnings ?? 0), 0) * 4;
  };
  const pick = options.reduce((a, b) => (Math.min(...b.materialIds.map(need)) < Math.min(...a.materialIds.map(need)) ? b : a));
  const rng = makeRng(state.seed, 'cand', pick.name);
  const cand: SupplierCandidate = {
    id: nextId(state, 'CD'),
    name: pick.name,
    materialIds: pick.materialIds,
    profile: {
      priceFactor: Math.round(rng.range(0.95, 1.06) * 100) / 100,
      defectRate: Math.round(rng.range(0.004, 0.03) * 1000) / 1000,
      leadTimeDays: rng.int(3, 9),
      reliability: Math.round(rng.range(0.8, 0.97) * 100) / 100,
      negotiationRoom: Math.round(rng.range(0.03, 0.07) * 100) / 100,
      paymentTermsDays: rng.pick([30, 45, 60]),
      quoteFormat: rng.pick(['A', 'B', 'C', 'D'] as const),
    },
    status: 'searching',
  };
  sc.candidates.push(cand);
  const names = pick.materialIds.map((id) => state.materials[id].name).join(', ');
  state.backlog.push({ ...item(state, 'sourcing', `신규 공급처 탐색: ${names} (업체 조사, 소개서 검토)`, SOURCING_SEARCH_MINUTES, 5), candidateId: cand.id, sourcingStep: 'search' });
}

export function finishSourcing(state: GameState, b: BacklogItem): void {
  const cand = state.sourcing.candidates.find((c) => c.id === b.candidateId);
  if (!cand) return;
  unlockConcept(state, 'sourcing');
  const names = cand.materialIds.map((id) => state.materials[id].name).join(', ');
  if (b.sourcingStep === 'search') {
    const rng = makeRng(state.seed, 'sample-wait', cand.id);
    cand.status = 'sampling';
    cand.foundDay = state.day;
    cand.sampleResultDay = state.day + rng.int(5, 8);
    logEvent(state, 'system', 'purchasing', `신규 공급처 후보 발굴: ${cand.name}`, `${names} 공급 가능. 샘플을 받아 품질팀 시험을 의뢰했습니다. 결과 예정 ${formatDay(state.startDate, cand.sampleResultDay)}.`);
    sendMessage(state, {
      from: cand.name,
      to: state.employee.name,
      subject: `[회사 소개] ${cand.name} ${names} 공급 제안`,
      body: `안녕하세요, ${cand.name}입니다.\n요청하신 회사 소개서와 ${names} 샘플을 보내드립니다. 결제조건은 납품 후 ${cand.profile.paymentTermsDays}일, 표준 납기는 발주 후 ${cand.profile.leadTimeDays}영업일입니다.`,
    });
    return;
  }
  // 등록: 다음 견적 요청부터 대상에 들어간다
  const n = state.suppliers.length + 1;
  const sup: Supplier = {
    id: `S${String(n).padStart(2, '0')}`,
    name: cand.name,
    materialIds: cand.materialIds,
    ...cand.profile,
    history: zeroHistory(),
    active: true,
    addedDay: state.day,
    warnings: 0,
    reviewBase: zeroHistory(),
  };
  state.suppliers.push(sup);
  cand.status = 'approved';
  state.sourcing.nextDay = state.day + 60;
  addStat(state, 'suppliersAdded', 1);
  logEvent(state, 'system', 'purchasing', `신규 공급업체 등록: ${cand.name}`, `${names} 견적 요청 대상에 추가했습니다.`);
  state.employee.milestones.push({ day: state.day, text: `신규 공급업체 ${cand.name} 발굴·등록` });
}

/* ---------------- 분기 평가와 협력사 미팅 ---------------- */

export function finishReview(state: GameState): void {
  unlockConcept(state, 'supplier-eval');
  const lines: string[] = [];
  for (const s of state.suppliers) {
    if (s.active === false) continue;
    const base = s.reviewBase ?? zeroHistory();
    const h = s.history;
    const deliveries = h.onTime + h.late - (base.onTime + base.late);
    const onTimeRate = deliveries > 0 ? (h.onTime - base.onTime) / deliveries : 1;
    const recv = h.receivedQty - base.receivedQty;
    const defectRate = recv > 0 ? (h.defectQty - base.defectQty) / recv : 0;
    s.reviewBase = { ...h };
    if (deliveries < 2) continue; // 실적이 적으면 평가 보류
    const grade = onTimeRate < 0.8 || defectRate > 0.02 ? 'poor' : onTimeRate < 0.9 || defectRate > 0.012 ? 'watch' : 'good';
    s.lastReview = { day: state.day, onTimeRate, defectRate, orders: deliveries, grade };
    const summary = `${s.name}: 납기 준수 ${Math.round(onTimeRate * 100)}%, 불량률 ${(defectRate * 100).toFixed(1)}% → ${grade === 'good' ? '우수' : grade === 'watch' ? '관찰' : '미달'}`;
    lines.push(summary);
    if (grade === 'good') s.warnings = 0;
    if (grade !== 'poor') continue;
    s.warnings = (s.warnings ?? 0) + 1;
    const replaceable = s.materialIds.every((id) => activeFor(state, id).length >= 2);
    if (s.warnings >= 2 && replaceable) {
      s.active = false;
      addStat(state, 'suppliersSuspended', 1);
      state.sourcing.nextDay = Math.min(state.sourcing.nextDay, state.day + 1);
      chat(state, 'lead', [
        ['them', `${s.name}은 두 분기 연속 미달이네요. 거래 중지하고 대체 업체 찾아봅시다.`],
        ['me', '네, 통보 메일 보내고 신규 업체 탐색 시작하겠습니다.'],
      ]);
      logEvent(state, 'system', 'purchasing', `${s.name} 거래 중지`, `두 분기 연속 평가 기준 미달 (${summary}). 견적 요청 대상에서 뺐습니다.`);
      sendMessage(state, {
        from: state.employee.name,
        to: s.name,
        subject: `[통보] 거래 일시 중지 안내`,
        body: `두 분기 연속 납기·품질 기준에 못 미쳐 신규 발주를 중지합니다. 개선 계획이 확인되면 재평가하겠습니다.`,
      });
    } else {
      state.backlog.push({ ...item(state, 'meeting', `협력사 개선 미팅: ${s.name} (납기·품질 개선 요청)`, MEETING_MINUTES, 10), supplierId: s.id });
      chat(state, 'lead', [
        ['them', [`${s.name} 이번 분기 평가 기준 미달이네요. 미팅 잡아서 개선 계획 받아 와요.`, `평가표 보니 ${s.name} 납기·품질이 안 좋네요. 직접 만나서 원인 들어 봐요.`]],
        ['me', ['네, 이번 주 안으로 미팅 잡겠습니다.', '알겠습니다. 개선 계획서 받아서 공유드릴게요.']],
      ]);
    }
  }
  logEvent(state, 'system', 'purchasing', '분기 공급업체 평가 완료', lines.length ? lines.join('\n') : '평가할 만큼 실적이 쌓인 업체가 없습니다.');
}

export function finishMeeting(state: GameState, b: BacklogItem): void {
  const s = state.suppliers.find((x) => x.id === b.supplierId);
  if (!s) return;
  if (b.priceUpRequest !== undefined) {
    finishPriceTalk(state, s, b.priceUpRequest);
    return;
  }
  addStat(state, 'supplierMeetings', 1);
  const rng = makeRng(state.seed, 'meeting', s.id, state.day);
  const ok = rng.chance(MEETING_SUCCESS);
  if (ok) {
    s.reliability = Math.min(0.98, Math.round((s.reliability + rng.range(0.03, 0.06)) * 100) / 100);
    s.defectRate = Math.round(s.defectRate * rng.range(0.7, 0.85) * 1000) / 1000;
  }
  logEvent(
    state,
    'system',
    'purchasing',
    `${s.name} 개선 미팅 ${ok ? '성과 있음' : '효과 미흡'}`,
    ok ? `업체가 출하 검사 강화와 납기 관리 계획을 내놨습니다.` : `개선 약속은 받았지만 구체적인 조치가 없습니다. 다음 분기 평가에서 다시 봅니다.`,
  );
  sendMessage(state, {
    from: s.name,
    to: state.employee.name,
    subject: `RE: 미팅 후속 조치`,
    body: ok
      ? '말씀 주신 납기·품질 문제는 출하 전 검사 인원을 늘리고 생산 일정을 앞당겨 개선하겠습니다.'
      : '지적하신 부분은 내부적으로 검토하겠습니다.',
  });
}

/** 연초 단가 인상 협상: 협상 숙련도와 경쟁 업체 수만큼 요구 폭을 줄인다. 합의된 인상은 이후 모든 견적에 반영된다 */
function finishPriceTalk(state: GameState, s: Supplier, req: number): void {
  const rng = makeRng(state.seed, 'annual-talk', s.id, state.day);
  const skill = state.employee.skills.negotiation / 100;
  const rivals = Math.min(1, s.materialIds.reduce((a, id) => a + activeFor(state, id).length - 1, 0) / s.materialIds.length / 2);
  const cut = Math.min(0.9, 0.15 + 0.4 * skill + 0.2 * rivals + 0.15 * rng.next());
  const final = Math.round(req * (1 - cut) * 1000) / 1000;
  s.priceFactor = Math.round(s.priceFactor * (1 + final) * 1000) / 1000;
  addStat(state, 'annualIncreases', 1);
  addStat(state, 'annualIncreaseRateSum', final);
  logEvent(state, 'market', 'purchasing', `${s.name} 연간 단가 ${(final * 100).toFixed(1)}% 인상 합의`, `요구 ${(req * 100).toFixed(1)}%에서 ${(final * 100).toFixed(1)}%로 줄였습니다. 앞으로 이 업체 견적에 반영됩니다.`);
  sendMessage(state, {
    from: s.name,
    to: state.employee.name,
    subject: `RE: 공급 단가 조정 협의 결과`,
    body: `협의한 대로 ${(final * 100).toFixed(1)}% 인상으로 정리하겠습니다. 다음 견적부터 반영됩니다.`,
  });
}

/* ---------------- 교육 ---------------- */

export function finishTraining(state: GameState, b: BacklogItem): void {
  const e = state.employee;
  const skill = b.skill ?? 'docs';
  const before = e.skills[skill];
  e.skills[skill] = Math.min(100, before + 6 * (1 - before / 100));
  e.xp += 12;
  addStat(state, 'trainingSessions', 1);
  logEvent(state, 'career', 'purchasing', `${b.title} 이수`, `숙련도 ${before.toFixed(1)} → ${e.skills[skill].toFixed(1)}`);
}
