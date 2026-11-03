import { LUNCH_MINUTES, LUNCH_START } from './calendar';
import { detectDeliveryRisks, finishExpedite } from './deliveryRisk';
import { gainExperience } from './employee';
import { updateMarket } from './market';
import { checkReorders, generateAdhocWork, runFinance, runProduction, scheduleMonthlyWork } from './operations';
import { completeStage, processWaits, stageWorkInfo, STAGE_LABELS } from './purchasing';
import type { BacklogItem, DailySnapshot, GameState, PurchaseCase, TimeBlock } from './types';
import { draftMonthlyReport } from '../tools/monthlyReport/draft';
import { getToolVersion } from '../tools/registry';
import { logEvent, nextId } from './util';

const MAX_SCHEDULE_DAYS = 40;
const MAX_MESSAGES = 600;
const MAX_EVENTS = 2000;

type Task =
  | { kind: 'case'; c: PurchaseCase; priority: number }
  | { kind: 'backlog'; b: BacklogItem; priority: number };

function casePriority(state: GameState, c: PurchaseCase): number {
  // 낮을수록 먼저. 긴급 → 필요일 임박 → 오래된 순
  return (c.urgent ? 0 : 1000) + (c.neededByDay - state.day) * 10 + c.createdDay / 1000;
}

function collectTasks(state: GameState): Task[] {
  const tasks: Task[] = [];
  for (const c of state.cases) {
    if (c.stageMinutesLeft > 0 && stageWorkInfo(c.stage)) {
      tasks.push({ kind: 'case', c, priority: casePriority(state, c) });
    }
  }
  for (const b of state.backlog) {
    if (b.minutesLeft > 0) {
      // 클레임 > 구매 건(필요일 순) > 보고서·일상 업무(마감 순). 마감이 오늘이면 구매 건과 경쟁한다
      const p = b.kind === 'expedite' ? 400 : b.kind === 'claim' ? 500 : 1000 + (b.dueDay - state.day) * 40;
      tasks.push({ kind: 'backlog', b, priority: p });
    }
  }
  return tasks.sort((a, b) => a.priority - b.priority);
}

/**
 * 담당자의 하루 업무.
 * 단계를 마치면 다음 단계가 바로 열리므로 같은 날 이어서 처리할 수 있다.
 */
function runWorkday(state: GameState): { minutes: number; compareMinutes: number } {
  const p = state.params;
  const blocks: TimeBlock[] = [];
  // t는 09:00부터 지난 시계 분(점심 포함), w()는 실제 일한 분(점심 제외)
  let t = 0;
  let lunchDone = false;
  const w = () => t - (lunchDone ? LUNCH_MINUTES : 0);
  const insertLunch = () => {
    blocks.push({ day: state.day, start: t, minutes: LUNCH_MINUTES, label: '점심시간', kind: 'lunch' });
    t += LUNCH_MINUTES;
    lunchDone = true;
  };
  const push = (b: Omit<TimeBlock, 'day' | 'start'>) => {
    if (b.minutes <= 0) return;
    if (!lunchDone && t >= LUNCH_START) insertLunch();
    if (!lunchDone && t + b.minutes > LUNCH_START) {
      // 12:00에 걸치는 업무는 점심 전후로 나눈다
      const before = LUNCH_START - t;
      blocks.push({ day: state.day, start: t, ...b, minutes: before });
      t += before;
      insertLunch();
      blocks.push({ day: state.day, start: t, ...b, minutes: b.minutes - before });
      t += b.minutes - before;
    } else {
      blocks.push({ day: state.day, start: t, ...b });
      t += b.minutes;
    }
    // 이 블록이 끝나는 시각에 생긴 사건으로 기록된다
    state.nowMinute = t;
  };

  // 메일 확인: 전날 이후 받은 메일 수에 비례
  const inbox = state.messages.filter((m) => m.day === state.day && m.to.includes(state.employee.name)).length;
  push({ minutes: Math.min(60, 15 + inbox * 3), label: `메일 확인 (${inbox}건)`, kind: 'mail' });
  if (state.day % 5 === 1) push({ minutes: 30, label: '주간 팀 회의', kind: 'meeting' });

  let compareMinutes = 0;
  const hasUrgent = () => state.cases.some((c) => c.urgent && c.stageMinutesLeft > 0 && stageWorkInfo(c.stage));
  let guard = 0;
  while (guard++ < 200) {
    const limit = p.workdayMinutes + (hasUrgent() ? 90 : 0);
    if (w() >= limit) break;
    const tasks = collectTasks(state);
    if (tasks.length === 0) break;
    const task = tasks[0];
    const available = limit - w();
    if (task.kind === 'case') {
      const c = task.c;
      if (!c.urgent && w() >= p.workdayMinutes) break;
      const work = Math.min(available, c.stageMinutesLeft);
      const info = stageWorkInfo(c.stage)!;
      const m = state.materials[c.materialId];
      const tool = c.stage === 'compare' && c.comparison?.method === 'tool' ? c.comparison.toolId : undefined;
      const partial = work < c.stageMinutesLeft ? ' (계속)' : '';
      push({
        minutes: work,
        label: `${c.id} ${m.name} · ${info.label}${tool ? ' [도구 사용]' : ''}${partial}`,
        kind: 'case',
        caseId: c.id,
        stage: c.stage,
        toolId: tool,
      });
      c.stageMinutesLeft -= work;
      c.minutesSpent += work;
      if (c.stage === 'compare') compareMinutes += work;
      if (c.stageMinutesLeft <= 0) completeStage(state, c);
    } else {
      const b = task.b;
      if (w() >= p.workdayMinutes) break;
      const work = Math.min(available, b.minutesLeft);
      push({ minutes: work, label: b.title + (work < b.minutesLeft ? ' (계속)' : ''), kind: b.kind, caseId: b.caseId });
      b.minutesLeft -= work;
      if (b.minutesLeft <= 0) {
        if (b.kind !== 'adhoc') gainExperience(state, b.kind === 'report' ? 'docs' : 'negotiation', b.minutesTotal);
        else state.employee.xp += b.minutesTotal / 30;
        if (b.kind === 'report') finishReport(state, b);
        if (b.kind === 'expedite') finishExpedite(state, b);
        if (b.kind !== 'adhoc') logEvent(state, 'system', 'purchasing', `${b.title} 완료`, `소요 ${b.minutesTotal}분`, b.caseId);
      }
    }
  }
  state.backlog = state.backlog.filter((b) => b.minutesLeft > 0);

  state.schedule.push(...blocks);
  const minDay = state.day - MAX_SCHEDULE_DAYS;
  state.schedule = state.schedule.filter((b) => b.day > minDay);
  const worked = w();
  const overtime = Math.max(0, worked - p.workdayMinutes);
  state.stats.employeeMinutes += worked;
  state.stats.overtimeMinutes += overtime;
  return { minutes: worked, compareMinutes };
}

/** 월간 보고서 완료: 도구를 썼으면 도구 초안, 아니면 담당자가 직접 정리한 같은 내용의 보고서가 남는다 */
function finishReport(state: GameState, b: BacklogItem): void {
  const period = { fromDay: b.periodFrom ?? state.day, toDay: b.periodTo ?? state.day };
  const version = b.toolId && b.toolVersion ? getToolVersion(b.toolId, b.toolVersion) : undefined;
  const text = version?.draftReport ? version.draftReport(state, period) : draftMonthlyReport(state, period);
  state.reports.push({
    id: nextId(state, 'RPT'),
    day: state.day,
    fromDay: period.fromDay,
    toDay: period.toDay,
    method: version ? 'tool' : 'manual',
    toolVersion: version?.version,
    minutes: b.minutesTotal,
    text,
  });
  if (state.reports.length > 24) state.reports = state.reports.slice(-24);
  state.stats.reportMinutes += b.minutesTotal;
  state.stats.reportsWritten += 1;
}

function inventoryValue(state: GameState): number {
  return Object.values(state.materials).reduce((a, m) => a + m.stock * m.avgCost, 0);
}

/** 하루 진행. 상태를 직접 바꾼다 (호출 측에서 필요하면 복제해서 넘긴다). */
export function advanceDay(state: GameState): GameState {
  // 출근 전후(시장 변화, 입고, 생산)에 생긴 사건은 09:00로 기록한다
  state.nowMinute = 0;
  updateMarket(state);
  runFinance(state);
  processWaits(state);
  detectDeliveryRisks(state);
  const prod = runProduction(state);
  checkReorders(state);
  scheduleMonthlyWork(state);
  generateAdhocWork(state);
  const work = runWorkday(state);

  const snap: DailySnapshot = {
    day: state.day,
    cash: Math.round(state.finance.cash),
    inventoryValue: Math.round(inventoryValue(state)),
    revenue: prod.produced * state.company.productPrice,
    produced: prod.produced,
    demand: prod.demand,
    opProfit: Math.round(prod.revenue - prod.cogs - state.company.fixedCostPerDay),
    shortMaterial: prod.produced < Math.min(prod.demand, state.company.capacityPerDay) ? prod.shortMaterial : undefined,
    priceSavingCum: state.stats.priceSavingKRW,
    selectionLossCum: state.stats.selectionLossKRW,
    entryErrorsCum: state.stats.entryErrors,
    employeeMinutes: work.minutes,
    compareMinutes: work.compareMinutes,
    openCases: state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled').length,
    prices: { ...state.market.prices },
    fx: state.market.fx,
  };
  state.history.push(snap);

  if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
  // 완료된 지 오래된 구매 건의 견적서 원문은 용량을 줄이기 위해 비운다 (수치 기록은 유지)
  for (const c of state.cases) {
    if (c.stage === 'done' && c.closedDay !== undefined && state.day - c.closedDay > 60) {
      for (const q of c.quotes) if (q.docText) q.docText = '';
    }
  }

  delete state.nowMinute;
  state.day += 1;
  return state;
}

export function advanceDays(state: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) advanceDay(state);
  return state;
}

export function stageLabel(c: PurchaseCase): string {
  return STAGE_LABELS[c.stage];
}
