import { advanceDay } from './engine';
import type { GameState, VerificationMetrics, VerificationRun } from './types';
import { nextId } from './util';

/**
 * 도구 효과 검증 (반사실 비교).
 *
 * 현재 상태를 두 벌 복제해 한쪽은 도구 없이, 한쪽은 도구를 적용해 같은 기간을 진행한다.
 * 시장가격·수요·업체 응답 같은 외부 사건은 (시드, 날짜, 대상) 키로 뽑기 때문에
 * 두 세계에서 똑같이 일어난다. 차이는 도구 적용 여부에서만 생긴다.
 */

function metricsBetween(before: GameState, after: GameState): VerificationMetrics {
  const a = before.stats;
  const b = after.stats;
  const closed = b.closedCases - a.closedCases;
  return {
    compareMinutes: b.compareMinutes - a.compareMinutes,
    casesCompared: b.casesCompared - a.casesCompared,
    quotesProcessed: b.quotesProcessed - a.quotesProcessed,
    entryErrors: b.entryErrors - a.entryErrors,
    selectionLossKRW: b.selectionLossKRW - a.selectionLossKRW,
    invoiceMismatches: b.invoiceMismatches - a.invoiceMismatches,
    totalEmployeeMinutes: b.employeeMinutes - a.employeeMinutes,
    overtimeMinutes: b.overtimeMinutes - a.overtimeMinutes,
    priceSavingKRW: b.priceSavingKRW - a.priceSavingKRW,
    stockoutDays: b.stockoutDays - a.stockoutDays,
    avgCycleDays: closed > 0 ? (b.cycleDaysSum - a.cycleDaysSum) / closed : 0,
  };
}

export function runVerification(
  state: GameState,
  toolId: string,
  version: string,
  days: number,
): VerificationRun {
  const start = structuredClone(state);

  const baseWorld = structuredClone(start);
  baseWorld.tools = baseWorld.tools.filter((t) => t.toolId !== toolId);
  const toolWorld = structuredClone(start);
  toolWorld.tools = toolWorld.tools.filter((t) => t.toolId !== toolId);
  toolWorld.tools.push({ toolId, version, appliedDay: start.day });

  const baseStart = structuredClone(baseWorld);
  const toolStart = structuredClone(toolWorld);
  for (let i = 0; i < days; i++) {
    advanceDay(baseWorld);
    advanceDay(toolWorld);
  }

  const run: VerificationRun = {
    id: nextId(state, 'VR'),
    day: state.day,
    toolId,
    toolVersion: version,
    days,
    baseline: metricsBetween(baseStart, baseWorld),
    withTool: metricsBetween(toolStart, toolWorld),
  };
  return run;
}
