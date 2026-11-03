import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHAT_PEOPLE } from '../sim/chat';
import type { ChatMessage, ChatThread } from '../sim/types';
import { useRealtime } from './realtime';
import { useStore } from './store';

/**
 * 팀 채팅 읽음 표시.
 * 읽었는지는 보는 사람마다 다른 정보라 회사 저장 파일(GameState)이 아니라 이 브라우저에 따로 둔다.
 * 대화방마다 "마지막으로 읽은 메시지 번호"만 기억한다.
 */

const KEY = 'virtual-workplace/chat-read';
const EVENT = 'vw-chat-read';
type ReadMap = Partial<Record<ChatThread, number>>;
interface Stored {
  company: string;
  read: ReadMap;
}

const idNum = (id: string) => Number(id.replace(/\D/g, '')) || 0;
export const CHAT_THREADS = Object.keys(CHAT_PEOPLE) as ChatThread[];

function load(company: string): ReadMap | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return s && s.company === company ? s.read : null;
  } catch {
    return null;
  }
}

function save(company: string, read: ReadMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ company, read } satisfies Stored));
  } catch {
    /* 저장이 막혀도 화면은 동작한다 */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** 실시간 근무 중이면 지금 시각까지 온 메시지만 */
export function useVisibleChats(): ChatMessage[] {
  const { state } = useStore();
  const rt = useRealtime();
  return useMemo(() => {
    const live = rt.isRealtime && rt.phase === 'working' && rt.liveMinute !== null;
    return (state.chats ?? []).filter((c) => !live || c.day < rt.target || c.minute <= rt.liveMinute!);
  }, [state.chats, rt.isRealtime, rt.phase, rt.target, rt.liveMinute]);
}

export function useChatUnread() {
  const { state } = useStore();
  const visible = useVisibleChats();
  // 회사를 새로 시작하면 메시지 번호가 처음부터 다시 매겨지므로 회사별로 따로 기억한다
  const company = `${state.seed}/${state.startDate}`;
  const [ver, setVer] = useState(0);

  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    window.addEventListener(EVENT, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const read = useMemo<ReadMap>(() => {
    const stored = load(company);
    if (stored) return stored;
    // 처음 보는 회사: 오늘 전 대화는 읽은 것으로 시작한다 (수백 개가 한꺼번에 안 읽음으로 뜨지 않게)
    const today = state.day - 1;
    const base: ReadMap = {};
    for (const c of visible) if (c.day < today) base[c.thread] = Math.max(base[c.thread] ?? 0, idNum(c.id));
    save(company, base);
    return base;
    // ver: 다른 화면에서 읽음 처리하면 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, ver]);

  const unread = useMemo(() => {
    const out = {} as Record<ChatThread, number>;
    for (const t of CHAT_THREADS) out[t] = 0;
    for (const c of visible) if (c.from === 'them' && idNum(c.id) > (read[c.thread] ?? 0)) out[c.thread] += 1;
    return out;
  }, [visible, read]);
  const total = CHAT_THREADS.reduce((a, t) => a + unread[t], 0);

  const markRead = useCallback(
    (thread: ChatThread) => {
      const last = visible.filter((c) => c.thread === thread).reduce((m, c) => Math.max(m, idNum(c.id)), 0);
      if (last <= (read[thread] ?? 0)) return;
      save(company, { ...read, [thread]: last });
    },
    [visible, read, company],
  );

  return { unread, total, markRead, lastRead: read };
}
