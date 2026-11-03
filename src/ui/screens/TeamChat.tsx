import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_PEOPLE } from '../../sim/chat';
import type { ChatMessage, ChatThread } from '../../sim/types';
import { formatDay } from '../../sim/util';
import { clock } from '../components/Common';
import { HeroFacts, ScreenHero, SectionHead } from '../components/Editorial';
import { Reveal } from '../motion';
import { CHAT_THREADS, useChatUnread, useVisibleChats } from '../chatRead';
import { useStore } from '../store';
import './chat.css';

const THREADS = CHAT_THREADS;
const SHOW = 120;

export function TeamChat() {
  const { state, openCase } = useStore();
  const [thread, setThread] = useState<ChatThread>('lead');
  const listRef = useRef<HTMLDivElement>(null);
  const me = state.employee.name;

  // 실시간 근무 중에는 지금 시각까지 온 메시지만 보여 준다
  const visible = useVisibleChats();
  const { unread, total, markRead, lastRead } = useChatUnread();
  // 화면을 열 때 기준으로 어디까지 읽었었는지 (그 아래에 "여기까지 읽음" 줄을 긋는다)
  const [readMark, setReadMark] = useState<Partial<Record<ChatThread, number>>>(() => ({ ...lastRead }));

  const byThread = useMemo(() => {
    const map = new Map<ChatThread, ChatMessage[]>();
    for (const t of THREADS) map.set(t, []);
    for (const c of visible) map.get(c.thread)!.push(c);
    return map;
  }, [visible]);

  const today = state.day - 1;
  const todayCount = visible.filter((c) => c.day === today).length;
  const leadOrders = visible.filter((c) => c.thread === 'lead' && c.from === 'them').length;
  const msgs = (byThread.get(thread) ?? []).slice(-SHOW);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, msgs.length]);

  // 보고 있는 방은 새 메시지가 와도 바로 읽음 처리한다
  useEffect(() => {
    markRead(thread);
  }, [thread, msgs.length, markRead]);

  const openThread = (t: ChatThread) => {
    setReadMark((m) => ({ ...m, [thread]: Infinity, [t]: lastRead[t] ?? 0 }));
    setThread(t);
  };
  const mark = readMark[thread] ?? 0;
  const firstUnreadIdx = msgs.findIndex((c) => c.from === 'them' && Number(c.id.replace(/\D/g, '')) > mark);

  return (
    <>
      <ScreenHero
        eyebrow="03 — Team Chat"
        lines={[`${me} ${state.employee.rank}의`, '팀 채팅']}
        watermark="CHAT"
        lead="공식 요청은 메일로, 상사 지시와 다른 부서와의 짧은 협조는 메신저로 오갑니다. 구매 건과 이어진 말을 누르면 해당 기록이 열립니다."
        aside={
          <HeroFacts
            items={[
              { label: '안 읽은 메시지', value: `${total}개`, note: `오늘 대화 ${todayCount}줄` },
              { label: '팀장 지시', value: `${leadOrders}건`, note: '보관 중인 대화 기준' },
              { label: '대화방', value: `${THREADS.length}개`, note: '상사 1, 다른 부서 5' },
              { label: '보관', value: `${visible.length}줄`, note: '최근 1,500줄까지' },
            ]}
          />
        }
      />

      <SectionHead eyebrow="Messenger" title="사내 메신저" desc="사원이라 아래로 지시하는 방은 없습니다. 팀장 지시를 받고, 생산·품질·물류·재무·영업과 일정을 맞춥니다." />
      <Reveal y={1.25}>
        <section className="card card-lg chat-card">
          <div className="chat">
            <div className="chat-threads" role="tablist" aria-label="대화방" data-lenis-prevent>
              {THREADS.map((t) => {
                const p = CHAT_PEOPLE[t];
                const list = byThread.get(t) ?? [];
                const last = list[list.length - 1];
                const fresh = unread[t];
                return (
                  <button key={t} role="tab" aria-selected={thread === t} className={`chat-thread ${thread === t ? 'active' : ''}`} onClick={() => openThread(t)}>
                    <span className="chat-avatar" aria-hidden>
                      {p.name.slice(0, 1)}
                    </span>
                    <span className="chat-thread-main">
                      <span className="chat-thread-name">
                        {p.dept} {p.name}
                        {fresh > 0 && <span className="chat-dot">{fresh}</span>}
                      </span>
                      <span className="chat-thread-last">{last ? last.text : p.role}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="chat-room">
              <div className="chat-room-head">
                <strong>
                  {CHAT_PEOPLE[thread].dept} {CHAT_PEOPLE[thread].name}
                </strong>
                <span className="faint">{CHAT_PEOPLE[thread].role}</span>
              </div>
              <div className="chat-log" ref={listRef} data-lenis-prevent>
                {msgs.length === 0 ? (
                  <div className="empty">아직 대화가 없습니다. 이 부서와 일이 생기면 여기에 쌓입니다.</div>
                ) : (
                  msgs.map((c, i) => {
                    const newDay = i === 0 || msgs[i - 1].day !== c.day;
                    return (
                      <div key={c.id}>
                        {newDay && <div className="chat-day">{formatDay(state.startDate, c.day)}</div>}
                        {i === firstUnreadIdx && i > 0 && <div className="chat-unread-mark">여기서부터 새 메시지</div>}
                        <div className={`chat-line ${c.from === 'me' ? 'mine' : ''}`}>
                          <div className="chat-bubble">
                            {c.text}
                            {c.caseId && (i === 0 || msgs[i - 1].caseId !== c.caseId) && (
                              <button className="chat-case" onClick={() => openCase(c.caseId!)}>
                                {c.caseId} 보기
                              </button>
                            )}
                          </div>
                          <span className="chat-time">
                            {c.from === 'me' && msgs.slice(i + 1).some((x) => x.from === 'them') && <span className="chat-read">읽음</span>}
                            {clock(c.minute)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
