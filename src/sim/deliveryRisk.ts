import { chat } from './chat';
import { getToolVersion } from '../tools/registry';
import { dailyUsage } from './market';
import { makeRng } from './rng';
import type { BacklogItem, GameState } from './types';
import { formatDay, logEvent, nextId, sendMessage } from './util';

/**
 * 납기 지연 감지와 독촉(납기 만회).
 *
 * 업체의 출하 지연은 발주 시점에 이미 정해져 있지만(purchasing.ts의 'delivery' 난수),
 * 구매팀이 그 사실을 언제 아느냐는 일하는 방식에 달려 있다.
 *  - 수작업: 입고 예정일에 물건이 안 와야 지연을 안다.
 *  - 도구 적용: 매일 발주 건의 출하 현황을 확인해 예정일 N일 전에 지연 신호를 잡는다.
 *
 * 지연을 알면 담당자가 업체에 독촉한다. 만회 가능 일수는 "실제 입고일까지 남은 시간"에 비례한다
 * (남은 시간이 길수록 대체 출하나 선적 조정 여지가 크다는 가정). 그래서 일찍 알수록 더 만회한다.
 * 개선율을 곱하지 않고, 아는 시점의 차이가 계산을 거쳐 결과로 나오게 했다.
 */

/** 수작업으로 지연을 파악하는 데 드는 시간(분): 미입고 확인, 업체 연락, 현황 파악. 가정치 */
export const MANUAL_DETECT_MINUTES = 15;
/** 독촉·일정 조율 시간(분). 가정치 */
export const EXPEDITE_MINUTES = 30;
/** 독촉이 받아들여질 확률. 가정치 */
export const EXPEDITE_SUCCESS = 0.65;

function activeRiskTool(state: GameState) {
  const a = state.tools.find((t) => t.toolId === 'delivery-risk' && t.removedDay === undefined);
  return a ? getToolVersion(a.toolId, a.version) : undefined;
}

/** 오늘 감지할 지연 건을 찾아 독촉 업무를 만든다. 입고 처리(processWaits) 뒤에 호출한다. */
export function detectDeliveryRisks(state: GameState): void {
  const tool = activeRiskTool(state);
  for (const c of state.cases) {
    if (c.stage !== 'awaitDelivery' || !c.po || c.delayKnownDay !== undefined) continue;
    const delay = c.po.actualArrivalDay - c.po.promisedDay;
    if (delay <= 0) continue;
    const toolSees = tool && state.day >= c.po.promisedDay - (tool.detectLeadDays ?? 3);
    const manualSees = state.day >= c.po.promisedDay;
    if (!toolSees && !manualSees) continue;
    c.delayKnownDay = state.day;
    c.delayKnownBy = toolSees ? 'tool' : 'manual';
    const m = state.materials[c.materialId];
    const s = state.suppliers.find((x) => x.id === c.po!.supplierId)!;
    const usage = dailyUsage(state, c.materialId);
    const coverDays = m.stock / Math.max(1, usage);
    const daysToArrival = c.po.actualArrivalDay - state.day;
    const risky = coverDays < daysToArrival + 1;
    const viaTool = c.delayKnownBy === 'tool';
    const minutes = (viaTool ? tool?.reviewMinutes ?? 5 : MANUAL_DETECT_MINUTES) + EXPEDITE_MINUTES;
    const item: BacklogItem = {
      id: nextId(state, 'BL'),
      kind: 'expedite',
      title: `${s.name} ${m.name} 납기 독촉 (${c.id})`,
      createdDay: state.day,
      dueDay: state.day,
      minutesLeft: minutes,
      minutesTotal: minutes,
      caseId: c.id,
      toolId: viaTool ? 'delivery-risk' : undefined,
    };
    state.backlog.push(item);
    logEvent(
      state,
      viaTool ? 'tool' : 'delay',
      'purchasing',
      viaTool ? `납기 위험 알림: ${m.name} (${c.id})` : `${m.name} 입고 예정일 미입고 (${c.id})`,
      viaTool
        ? `출하 현황에서 지연 신호를 감지했습니다. 약속일 ${formatDay(state.startDate, c.po.promisedDay)}, 현재 재고 ${coverDays.toFixed(1)}일분.${risky ? ' 결품 위험이 있습니다.' : ''}`
        : `약속일인데 입고되지 않았습니다. 업체에 확인이 필요합니다. 현재 재고 ${coverDays.toFixed(1)}일분.${risky ? ' 결품 위험이 있습니다.' : ''}`,
      c.id,
    );
    if (!viaTool) {
      chat(state, 'logi', [
        ['them', `${m.name} 오늘 입고 예정이었는데 아직 차가 안 들어왔어요.`],
        ['me', '업체에 바로 확인해 볼게요. 알려 주셔서 감사해요.'],
      ], c.id);
    }
    sendMessage(state, {
      from: viaTool ? '납기 위험 알림 도구' : '물류팀 오사원',
      to: state.employee.name,
      subject: viaTool ? `[알림] ${c.po.id} ${m.name} 출하 지연 신호` : `[확인요청] ${c.po.id} ${m.name} 오늘 입고 예정분 미도착`,
      body: viaTool
        ? `${s.name} 출하 현황이 약속일보다 늦어지고 있습니다.\n약속일: ${formatDay(state.startDate, c.po.promisedDay)}\n현재 재고: ${coverDays.toFixed(1)}일분\n\n업체에 납기 확인과 독촉을 권장합니다.`
        : `오늘 입고 예정이던 ${m.name}이 도착하지 않았습니다. 업체 확인 부탁드립니다.`,
      caseId: c.id,
    });
  }
}

/** 독촉 업무를 마쳤을 때: 남은 시간에 비례해 입고일을 앞당긴다 */
export function finishExpedite(state: GameState, b: BacklogItem): void {
  const c = state.cases.find((x) => x.id === b.caseId);
  if (!c || !c.po || c.stage !== 'awaitDelivery') return;
  const delay = c.po.actualArrivalDay - c.po.promisedDay;
  if (delay <= 0) return;
  const rng = makeRng(state.seed, 'expedite', c.id);
  const success = rng.chance(EXPEDITE_SUCCESS);
  const remaining = c.po.actualArrivalDay - state.day;
  // 남은 시간의 절반까지 만회 가능, 지연 일수를 넘지 않고 내일보다 빠를 수 없다
  const possible = Math.min(delay, Math.floor(remaining / 2), Math.max(0, c.po.actualArrivalDay - (state.day + 1)));
  const recovered = success ? possible : 0;
  c.po.actualArrivalDay -= recovered;
  c.expediteRecoveredDays = recovered;
  state.stats.expediteRecoveredDays += recovered;
  const m = state.materials[c.materialId];
  const s = state.suppliers.find((x) => x.id === c.po!.supplierId)!;
  sendMessage(state, {
    from: s.name,
    to: state.employee.name,
    subject: `RE: ${c.po.id} 납기 확인 요청`,
    body:
      recovered > 0
        ? `확인 결과 출하가 늦어지고 있었습니다. 요청하신 대로 우선 출하해 ${formatDay(state.startDate, c.po.actualArrivalDay)}에 입고되도록 하겠습니다.`
        : `죄송합니다. 현재로서는 ${formatDay(state.startDate, c.po.actualArrivalDay)} 입고가 최선입니다.`,
    caseId: c.id,
  });
  logEvent(
    state,
    'delay',
    'purchasing',
    recovered > 0 ? `${m.name} 납기 ${recovered}일 만회 (${c.id})` : `${m.name} 납기 독촉 결과: 만회 못 함 (${c.id})`,
    `약속일 대비 ${delay}일 지연이었고, 독촉 시점에 실제 입고까지 ${remaining}일 남아 있었습니다.`,
    c.id,
  );
}
