import { makeRng } from './rng';
import type { ChatThread, GameState } from './types';
import { nextId } from './util';

/**
 * 가상 팀 채팅 (사내 메신저).
 * 메일은 공식 요청·문서, 메신저는 상사 지시와 다른 부서와의 짧은 협조를 담는다.
 * GWANG은 사원이라 부하 직원 대화방은 없다. 모든 인물은 가상이다.
 */

export const CHAT_PEOPLE: Record<ChatThread, { name: string; dept: string; role: string }> = {
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
export function chat(state: GameState, thread: ChatThread, lines: ['me' | 'them', string][], caseId?: string): void {
  if (!state.chats) state.chats = [];
  const rng = makeRng(state.seed, 'chat', thread, state.day, state.counters['CH'] ?? 0);
  let minute = state.nowMinute ?? 0;
  for (const [from, text] of lines) {
    state.chats.push({ id: nextId(state, 'CH'), day: state.day, minute, thread, from, text, caseId });
    minute += rng.int(1, 8);
  }
  if (state.chats.length > MAX_CHATS) state.chats = state.chats.slice(-MAX_CHATS);
}

/** 같은 날 같은 방에 같은 종류의 말을 반복하지 않게 (연초 인상 공문처럼 여러 건이 한꺼번에 올 때) */
export function chatOncePerDay(state: GameState, thread: ChatThread, key: string, lines: ['me' | 'them', string][]): void {
  const k = `chat:${key}:${state.day}`;
  if (state.counters[k]) return;
  state.counters[k] = 1;
  // 오래된 키는 지운다 (저장 크기)
  for (const old of Object.keys(state.counters)) {
    if (old.startsWith(`chat:${key}:`) && old !== k) delete state.counters[old];
  }
  chat(state, thread, lines);
}
