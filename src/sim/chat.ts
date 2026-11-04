import { makeRng } from './rng';
import type { ChatThread, GameState } from './types';
import { dayToDate, formatDayShort, isWeekStart, nextId, weekKey } from './util';

/**
 * 가상 팀 채팅 (사내 메신저).
 * 메일은 공식 요청·문서, 메신저는 상사 지시와 다른 부서와의 짧은 협조를 담는다.
 * GWANG은 사원이라 부하 직원 대화방은 없다. 모든 인물은 가상이다.
 * 'team'은 구매팀 단체방(이팀장, 최대리, GWANG)이다.
 */

export const CHAT_PEOPLE: Record<ChatThread, { name: string; dept: string; role: string; group?: boolean }> = {
  team: { name: '구매팀', dept: '구매팀', role: '이팀장, 최대리, GWANG', group: true },
  lead: { name: '이팀장', dept: '구매팀', role: '직속 상사' },
  prod: { name: '김대리', dept: '생산팀', role: '구매 요청·재고' },
  qa: { name: '정주임', dept: '품질팀', role: '입고 검사·불량' },
  logi: { name: '오사원', dept: '물류팀', role: '입고 일정' },
  fin: { name: '한사원', dept: '재무팀', role: '매입 정산' },
  sales: { name: '박과장', dept: '영업팀', role: '판촉·수요' },
};

const MAX_CHATS = 1500;

/**
 * 대화 한 묶음을 남긴다. lines의 첫 줄은 지금 시각(state.nowMinute), 다음 줄은 몇 분씩 뒤에 온다.
 * 'me'는 GWANG, 'them'은 대화 상대.
 */
export type ChatLine = ['me' | 'them', string | string[], string?];

export function chat(state: GameState, thread: ChatThread, lines: ChatLine[], caseId?: string): void {
  if (!state.chats) state.chats = [];
  const rng = makeRng(state.seed, 'chat', thread, state.day, state.counters['CH'] ?? 0);
  // 시간 순서: 같은 방에서 오늘 이미 오간 대화보다 앞선 시각으로 끼어들지 않게, 마지막 말 뒤에서 시작한다
  let lastToday = -1;
  for (let i = state.chats.length - 1; i >= 0 && state.chats[i].day === state.day; i--) {
    if (state.chats[i].thread === thread) lastToday = Math.max(lastToday, state.chats[i].minute);
  }
  let minute = Math.max(state.nowMinute ?? 0, lastToday + 1);
  // 같은 상황에도 말투가 조금씩 다르게: 문장 후보 중 하나를 고른다 (시드·날짜·순번으로 정해져 재현된다)
  for (const [from, text, who] of lines) {
    const pick = Array.isArray(text) ? rng.pick(text) : text;
    state.chats.push({ id: nextId(state, 'CH'), day: state.day, minute, thread, from, text: pick, caseId, ...(who ? { who } : {}) });
    minute += rng.int(1, 8);
  }
  if (state.chats.length > MAX_CHATS) state.chats = state.chats.slice(-MAX_CHATS);
}

/** 같은 날 같은 방에 같은 종류의 말을 반복하지 않게 (연초 인상 공문처럼 여러 건이 한꺼번에 올 때) */
export function chatOncePerDay(state: GameState, thread: ChatThread, key: string, lines: ChatLine[]): void {
  const k = `chat:${key}:${state.day}`;
  if (state.counters[k]) return;
  state.counters[k] = 1;
  // 오래된 키는 지운다 (저장 크기)
  for (const old of Object.keys(state.counters)) {
    if (old.startsWith(`chat:${key}:`) && old !== k) delete state.counters[old];
  }
  chat(state, thread, lines);
}

// ── 구매팀 단체방 ─────────────────────────────────────

/** 회의 정리 메시지가 이 말로 시작한다 (업무 일지가 찾아 쓴다) */
export const MEETING_NOTE = '오늘 회의 정리합니다.';

/** 주간 회의 정리: 이번 주 입고 예정, 진행 중 구매(긴급), 지난주 결품 일수 */
function meetingSummary(state: GameState, today: Date): ChatLine[] {
  const wk = weekKey(today);
  const open = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');
  const arrivals = open
    .filter((c) => c.po && weekKey(dayToDate(state.startDate, c.po.promisedDay)) === wk)
    .sort((a, b) => a.po!.promisedDay - b.po!.promisedDay);
  const name = (id: (typeof open)[number]) => state.materials[id.materialId].name;
  // 긴급 건 중 아직 발주 전인 것만 (이미 발주한 긴급 건은 입고 예정에 나온다)
  const urgent = open.filter((c) => c.urgent && !c.po);
  const lastWeek = state.history.filter((h) => weekKey(dayToDate(state.startDate, h.day)) === wk - 7 * 86_400_000);
  const stockoutDays = lastWeek.filter((h) => h.shortMaterial).length;
  const arrivalText = arrivals.length
    ? `${arrivals.length}건 (${arrivals.slice(0, 3).map((c) => `${name(c)} ${formatDayShort(state.startDate, c.po!.promisedDay)}`).join(', ')}${arrivals.length > 3 ? ' 외' : ''})`
    : '없음';
  const lines = [
    MEETING_NOTE,
    `- 이번 주 입고 예정: ${arrivalText}`,
    `- 진행 중 구매: ${open.length}건${urgent.length ? `, 발주 전 긴급 ${urgent.map(name).join(', ')}` : ''}`,
    ...(lastWeek.length ? [`- 지난주 결품: ${stockoutDays}일`] : []),
    urgent.length ? 'GWANG님은 긴급 건부터 이번 주 안에 발주까지 마무리해 주세요.' : stockoutDays > 0 ? '결품 원인은 이번 주 안에 정리해서 공유해 주세요.' : '이번 주도 납기 위주로 챙겨 봅시다.',
  ];
  return [
    ['them', lines.join('\n'), '이팀장'],
    ['them', ['네 확인했습니다.', '네, 입고 일정 같이 챙기겠습니다.'], '최대리'],
    ['me', urgent.length ? ['네, 긴급 건부터 챙기겠습니다.', '네 팀장님, 이번 주 안에 발주까지 마무리하겠습니다.'] : ['네 확인했습니다.', '네, 입고 예정 건 업체에 미리 확인해 두겠습니다.']],
  ];
}

/**
 * 구매팀 단체방. 주 첫 영업일 아침 인사와 주간 공유 요청, 주 마지막 영업일 마무리,
 * 그날 결품이나 입고 불량이 있으면 최대리가 짚는다. 하루 일이 끝난 뒤(advanceDay 끝) 부른다.
 */
export function teamChat(state: GameState): void {
  const today = dayToDate(state.startDate, state.day);
  const firstOfWeek = isWeekStart(state.startDate, state.day);
  const lastOfWeek = weekKey(dayToDate(state.startDate, state.day + 1)) !== weekKey(today);
  const rng = makeRng(state.seed, 'teamchat', state.day);
  const saved = state.nowMinute;
  const todays = state.events.filter((e) => e.day === state.day);

  if (firstOfWeek) {
    state.nowMinute = rng.int(2, 12);
    chat(state, 'team', [
      ['them', ['좋은 아침입니다. 이번 주도 잘 부탁드립니다. 금요일 오후까지 주간 구매 현황 공유해 주세요.', '한 주 시작이네요. 이번 주 납기 걸린 건 먼저 챙겨 주시고, 금요일에 주간 현황 공유 부탁드립니다.', '다들 주말 잘 쉬셨죠? 이번 주 입고 예정 건 오전 중에 한 번씩 확인 부탁드립니다.'], '이팀장'],
      ['them', ['네 팀장님, 정리해서 올리겠습니다.', '네, 이번 주 입고 일정부터 확인하겠습니다.'], '최대리'],
      ['me', ['네 알겠습니다!', '네, 맡은 건 정리해서 금요일에 올리겠습니다.', '네 팀장님, 확인하겠습니다.']],
    ]);
  }

  // 주간 팀 회의가 끝나면 이팀장이 실제 숫자로 회의 내용을 정리한다
  const meeting = state.schedule.find((b) => b.day === state.day && b.label === '주간 팀 회의');
  if (meeting) {
    state.nowMinute = meeting.start + meeting.minutes + rng.int(2, 8);
    chat(state, 'team', meetingSummary(state, today), undefined);
  }

  const stockout = todays.find((e) => e.type === 'stockout' && e.title.includes('생산 차질'));
  if (stockout) {
    state.nowMinute = rng.int(300, 420);
    chat(state, 'team', [
      ['them', [`오늘 ${stockout.title.replace(' 부족으로 생산 차질', '')} 결품으로 생산 차질이 있었네요. 원인 같이 한번 봐요.`, `결품 소식 들으셨죠? ${stockout.title.replace(' 부족으로 생산 차질', '')} 건이요. 재주문 시점이 늦었던 건지 확인해 봐야겠어요.`], '최대리'],
      ['me', ['네, 발주 시점이랑 입고 일정 정리해서 공유드리겠습니다.', '네 대리님, 재고 추이부터 확인해 보겠습니다.']],
      ['them', ['좋아요. 내일 아침에 짧게 같이 봅시다.', '고마워요. 정리되면 팀장님께도 같이 보고드리죠.'], '이팀장'],
    ]);
  }

  const defect = todays.find((e) => e.type === 'quality' && e.title.includes('입고 불량'));
  if (defect && !stockout) {
    state.nowMinute = rng.int(240, 400);
    chat(state, 'team', [
      ['them', ['입고 불량 건 클레임 넣을 때 지난 불량 이력도 같이 적어 주세요. 반복되면 평가에 반영해야 해서요.', '불량 건 보셨죠? 업체에 회신 받으면 대체품 일정도 꼭 확인해 주세요.'], '최대리'],
      ['me', ['네, 이력까지 정리해서 보내겠습니다.', '네, 대체품 일정 확인해서 공유드리겠습니다.']],
    ]);
  }

  if (lastOfWeek) {
    state.nowMinute = rng.int(500, 530);
    chat(state, 'team', [
      ['them', ['이번 주도 다들 고생 많았습니다. 주간 현황은 월요일 아침에 같이 보죠.', '한 주 수고하셨습니다. 급한 건 없으면 오늘은 제때 퇴근하세요.', '이번 주 고생 많았어요. 다음 주 납기 건만 한 번 더 확인 부탁드립니다.'], '이팀장'],
      ['them', ['수고하셨습니다!', '고생하셨습니다. 주말 잘 보내세요.'], '최대리'],
      ['me', ['수고하셨습니다!', '고생 많으셨습니다. 좋은 주말 보내세요!']],
    ]);
  }
  // 조용한 날: 하루 종일 메신저가 비어 있으면 어색하다. 최대리가 실제 진행 중인 건을 짚는다
  if (!state.chats.some((c) => c.day === state.day)) {
    state.nowMinute = rng.int(240, 470);
    const open = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');
    const next = open.filter((c) => c.po && c.po.promisedDay > state.day).sort((a, b) => a.po!.promisedDay - b.po!.promisedDay)[0];
    if (next) {
      const name = state.materials[next.materialId].name;
      const d = formatDayShort(state.startDate, next.po!.promisedDay);
      chat(state, 'team', [
        ['them', [`오늘은 조용하네요. ${d}에 들어오는 ${name} 건 업체에 출하 한 번만 확인해 줘요.`, `특별한 건 없죠? ${name} ${d} 입고 예정이니까 하루 전에 업체랑 통화해 두세요.`], '최대리'],
        ['me', ['네, 오후에 통화해 보겠습니다.', '넵 출하 일정 확인해 두겠습니다.']],
      ]);
    } else if (open.length > 0) {
      chat(state, 'team', [
        ['them', [`오늘은 조용하네요. 진행 중인 ${open.length}건 견적 회신이랑 품의 상태만 한 번씩 챙겨 주세요.`, `급한 건 없죠? 진행 중인 ${open.length}건 중에 막힌 데 있으면 말해 줘요.`], '최대리'],
        ['me', ['네, 퇴근 전에 한 번 정리해 두겠습니다.', '지금은 막힌 건 없어요. 내일 아침에 다시 보겠습니다.']],
      ]);
    } else {
      chat(state, 'team', [
        ['them', ['오늘은 급한 건 없네요. 남는 시간에 업체별 단가표 최신으로 정리해 둡시다.', '조용한 날이네요. 다음 달 발주 예정 품목 미리 한 번 훑어봐 줘요.'], '이팀장'],
        ['me', ['네 팀장님, 정리해 두겠습니다.', '네, 오늘 중으로 보겠습니다.']],
      ]);
    }
  }
  state.nowMinute = saved;
}
