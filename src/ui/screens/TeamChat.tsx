import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_PEOPLE } from '../../sim/chat';
import type { ChatMessage, ChatThread } from '../../sim/types';
import { dayToDate } from '../../sim/util';
import { clock } from '../components/Common';
import { HeroFacts, ScreenHero, SectionHead } from '../components/Editorial';
import { Inbox } from '../components/Inbox';
import { useLight } from '../components/LiveWidgets';
import { Reveal } from '../motion';
import { CHAT_THREADS, useChatUnread, useVisibleChats } from '../chatRead';
import { useRealtime } from '../realtime';
import { useStore } from '../store';
import './chat.css';

const SHOW = 120;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
/** 목록 위쪽 '즐겨찾기'에 두는 방: 팀 단체방과 직속 상사 */
const FAVORITES: ChatThread[] = ['team', 'lead'];
type Filter = 'all' | 'unread' | 'group';

const idNum = (id: string) => Number(id.replace(/\D/g, '')) || 0;
/** 시간 순서: 날짜, 시각, 쌓인 순서 */
const byTime = (a: ChatMessage, b: ChatMessage) => a.day - b.day || a.minute - b.minute || idNum(a.id) - idNum(b.id);
/** 동그라미 안 머리글자: 사람은 성 한 글자, 단체방은 부서 앞 두 글자 */
const initials = (t: ChatThread) => (CHAT_PEOPLE[t].group ? CHAT_PEOPLE[t].dept.slice(0, 2) : CHAT_PEOPLE[t].name.slice(0, 1));

export function TeamChat() {
  const { state, openCase } = useStore();
  const rt = useRealtime();
  const light = useLight();
  const [thread, setThread] = useState<ChatThread>('team');
  const [filter, setFilter] = useState<Filter>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const me = state.employee.name;

  // 실시간 근무 중에는 지금 시각까지 온 메시지만 보여 준다
  const visible = useVisibleChats();
  const { unread, total, markRead, lastRead } = useChatUnread();
  // 화면을 열 때 기준으로 어디까지 읽었었는지 (그 아래에 "여기서부터 새 메시지" 줄을 긋는다)
  const [readMark, setReadMark] = useState<Partial<Record<ChatThread, number>>>(() => ({ ...lastRead }));

  const byThread = useMemo(() => {
    const map = new Map<ChatThread, ChatMessage[]>();
    for (const t of CHAT_THREADS) map.set(t, []);
    for (const c of visible) map.get(c.thread)?.push(c);
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [visible]);

  const today = state.day - 1;
  const todayCount = visible.filter((c) => c.day === today).length;
  const leadOrders = visible.filter((c) => (c.thread === 'lead' || (c.thread === 'team' && c.who === '이팀장')) && c.from === 'them').length;
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
  const firstUnreadIdx = msgs.findIndex((c) => c.from === 'them' && idNum(c.id) > mark);

  // 날짜 표시: 오늘·어제(달력 기준)는 말로, 그 전은 날짜로
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = rt.isRealtime ? rt.now : dayToDate(state.startDate, Math.max(1, state.day - 1));
  const todayKey = key(now);
  const yesterdayKey = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const dayWord = (day: number) => {
    const d = dayToDate(state.startDate, day);
    if (key(d) === todayKey) return '오늘';
    if (key(d) === yesterdayKey) return '어제';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  };
  const listTime = (c: ChatMessage) => {
    const d = dayToDate(state.startDate, c.day);
    return key(d) === todayKey ? clock(c.minute) : `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // 상태 점: 근무 중 초록, 점심 주황, 그 외 회색 (모두 같은 회사라 근무 시간을 같이 쓴다)
  const presence = light.light === 'green' ? 'green' : light.light === 'orange' ? 'orange' : 'off';
  const presenceText = presence === 'green' ? '대화 가능' : presence === 'orange' ? '자리 비움' : '오프라인';

  const shown = CHAT_THREADS.filter((t) => (filter === 'unread' ? unread[t] > 0 : filter === 'group' ? CHAT_PEOPLE[t].group : true));
  const sections: { title: string; items: ChatThread[] }[] = [
    { title: '즐겨찾기', items: shown.filter((t) => FAVORITES.includes(t)) },
    { title: '채팅', items: shown.filter((t) => !FAVORITES.includes(t)) },
  ].filter((s) => s.items.length > 0);

  const p = CHAT_PEOPLE[thread];

  return (
    <>
      <ScreenHero
        eyebrow="03 — Communication"
        lines={[`${me} ${state.employee.rank}의`, '소통 공간']}
        watermark="TALK"
        lead="거래처와의 공식 요청과 견적은 메일로, 팀장 지시와 다른 부서와의 짧은 협조는 메신저로 오갑니다. 구매 건과 이어진 메일이나 말을 누르면 해당 기록이 열립니다."
        aside={
          <HeroFacts
            items={[
              { label: '안 읽은 메시지', value: `${total}개`, note: `오늘 대화 ${todayCount}줄` },
              { label: '팀장 지시', value: `${leadOrders}건`, note: '보관 중인 대화 기준' },
              { label: '대화방', value: `${CHAT_THREADS.length}개`, note: '팀 단체방 1, 상사 1, 다른 부서 5' },
              { label: '메일', value: `${state.messages.length}건`, note: '받은메일·보낸메일' },
            ]}
          />
        }
      />

      <SectionHead eyebrow="Messenger" title="사내 메신저" desc="구매팀 단체방에서 주간 일정을 맞추고, 팀장 지시를 받고, 생산·품질·물류·재무·영업과 일정을 맞춥니다. 사원이라 아래로 지시하는 방은 없습니다." />
      <Reveal y={1.25}>
        <section className="card card-lg msgr-card">
          <div className="msgr">
            <aside className="msgr-side">
              <div className="msgr-side-head">
                <b>채팅</b>
              </div>
              <div className="msgr-filters" role="group" aria-label="대화방 거르기">
                {(
                  [
                    ['unread', '읽지 않음'],
                    ['group', '모임 채팅'],
                  ] as [Filter, string][]
                ).map(([k, l]) => (
                  <button key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(filter === k ? 'all' : k)}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="msgr-threads" role="tablist" aria-label="대화방" data-lenis-prevent>
                {sections.length === 0 && <div className="msgr-none">해당하는 대화방이 없습니다.</div>}
                {sections.map((sec) => (
                  <div key={sec.title}>
                    <div className="msgr-sec">{sec.title}</div>
                    {sec.items.map((t) => {
                      const person = CHAT_PEOPLE[t];
                      const list = byThread.get(t) ?? [];
                      const last = list[list.length - 1];
                      const fresh = unread[t];
                      const lastText = !last ? person.role : last.from === 'me' ? `나: ${last.text}` : person.group && last.who ? `${last.who}: ${last.text}` : last.text;
                      return (
                        <button key={t} role="tab" aria-selected={thread === t} className={`msgr-thread ${thread === t ? 'active' : ''} ${fresh > 0 ? 'fresh' : ''}`} onClick={() => openThread(t)}>
                          <span className={`msgr-avatar ${person.group ? 'group' : ''}`} aria-hidden>
                            {initials(t)}
                            {!person.group && <span className={`msgr-presence light-${presence}`} />}
                          </span>
                          <span className="msgr-thread-main">
                            <span className="msgr-thread-top">
                              <span className="msgr-thread-name">{person.name}</span>
                              {!person.group && <span className="msgr-thread-dept">{person.dept}</span>}
                              <span className="msgr-thread-time">{last ? listTime(last) : ''}</span>
                            </span>
                            <span className="msgr-thread-bottom">
                              <span className="msgr-thread-last">{lastText}</span>
                              {fresh > 0 && <span className="msgr-badge">{fresh}</span>}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </aside>

            <div className="msgr-room">
              <div className="msgr-room-head">
                <span className={`msgr-avatar ${p.group ? 'group' : ''}`} aria-hidden>
                  {initials(thread)}
                  {!p.group && <span className={`msgr-presence light-${presence}`} />}
                </span>
                <span className="msgr-room-title">
                  <b>{p.name}</b>
                  <span className="faint">{p.group ? p.role : `${p.dept} · ${p.role} · ${presenceText}`}</span>
                </span>
              </div>
              <div className="msgr-log" ref={listRef} data-lenis-prevent>
                {msgs.length === 0 ? (
                  <div className="msgr-none">아직 대화가 없습니다. 이 방에서 일이 생기면 여기에 쌓입니다.</div>
                ) : (
                  msgs.map((c, i) => {
                    const prev = msgs[i - 1];
                    const newDay = !prev || prev.day !== c.day;
                    // 같은 사람이 이어서 말하면 이름·시간은 첫 말에만 (10분 넘게 벌어지면 다시)
                    const sameRun = !newDay && prev && prev.from === c.from && prev.who === c.who && c.minute - prev.minute <= 10 && i !== firstUnreadIdx;
                    const name = c.from === 'me' ? '' : p.group ? c.who ?? p.name : p.name;
                    return (
                      <div key={c.id}>
                        {newDay && (
                          <div className="msgr-day">
                            {dayWord(c.day)} {clock(c.minute)}
                          </div>
                        )}
                        {i === firstUnreadIdx && i > 0 && <div className="msgr-unread-mark">여기서부터 새 메시지</div>}
                        <div className={`msgr-line ${c.from === 'me' ? 'mine' : ''} ${sameRun ? 'cont' : ''}`}>
                          {c.from !== 'me' && (
                            <span className="msgr-line-avatar" aria-hidden>
                              {!sameRun && (name ?? '').slice(0, 1)}
                            </span>
                          )}
                          <div className="msgr-line-body">
                            {!sameRun && (
                              <div className="msgr-meta">
                                {name && <b>{name}</b>}
                                <span>{clock(c.minute)}</span>
                              </div>
                            )}
                            <div className="msgr-bubble">
                              {c.text}
                              {c.caseId && (!prev || prev.caseId !== c.caseId) && (
                                <button className="msgr-case" onClick={() => openCase(c.caseId!)}>
                                  {c.caseId} 보기
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="msgr-compose" aria-hidden>
                <span>관찰 화면이라 메시지를 보낼 수 없어요</span>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Inbox />
    </>
  );
}

