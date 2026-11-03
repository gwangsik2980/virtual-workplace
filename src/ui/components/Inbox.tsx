import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Message, Quote } from '../../sim/types';
import { dayToDate, formatDay } from '../../sim/util';
import { clock } from './Common';
import { SectionHead } from './Editorial';
import { Reveal } from '../motion';
import { useRealtime } from '../realtime';
import { useStore } from '../store';
import './inbox.css';

/**
 * 메일함 (소통 공간 화면). 일반 메일 프로그램처럼 세 칸으로 나눈다.
 * 왼쪽 폴더, 가운데 날짜별 목록(모든 항목 / 읽지 않음), 오른쪽 읽기 창.
 * 읽음 표시는 보는 사람마다 다른 정보라 GameState가 아니라 이 브라우저(localStorage)에 둔다.
 */

type Folder = 'inbox' | 'sent' | 'quotes';
type Tab = 'all' | 'unread';

const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'inbox', label: '받은 편지함' },
  { id: 'sent', label: '보낸 편지함' },
  { id: 'quotes', label: '견적서' },
];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const SHOW = 200;
const READ_KEY = 'virtual-workplace/mail-read';

function loadRead(company: string): Set<string> {
  try {
    const s = JSON.parse(localStorage.getItem(READ_KEY) ?? 'null') as { company: string; ids: string[] } | null;
    return new Set(s && s.company === company ? s.ids : []);
  } catch {
    return new Set();
  }
}
function saveRead(company: string, ids: Set<string>) {
  try {
    // 오래된 것부터 버려서 너무 커지지 않게 한다
    localStorage.setItem(READ_KEY, JSON.stringify({ company, ids: [...ids].slice(-1500) }));
  } catch {
    /* 저장이 막혀도 화면은 동작한다 */
  }
}

/** 미리 보기 한 줄: 인사말("안녕하세요," / "○○입니다.")은 건너뛴다 */
function preview(body: string): string {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = lines[0] === '안녕하세요,' ? 2 : 0;
  return lines[start] ?? '';
}

export function Inbox() {
  const { state, openCase } = useStore();
  const rt = useRealtime();
  const me = state.employee.name;
  const company = `${state.seed}/${state.startDate}`;
  const [folder, setFolder] = useState<Folder>('inbox');
  const [tab, setTab] = useState<Tab>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [read, setRead] = useState<Set<string>>(() => loadRead(company));
  useEffect(() => setRead(loadRead(company)), [company]);

  // 실시간 근무 중이면 지금 시각까지 온 메일만
  const visible = useMemo(() => {
    const live = rt.isRealtime && rt.phase === 'working' && rt.liveMinute !== null;
    return state.messages.filter((m) => !live || m.day < rt.target || (m.minute ?? 0) <= rt.liveMinute!);
  }, [state.messages, rt.isRealtime, rt.phase, rt.target, rt.liveMinute]);

  const isSent = (m: Message) => m.from === me;
  const isUnread = useCallback((m: Message) => !isSent(m) && !read.has(m.id), [read, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const inFolder = useMemo(() => {
    const byFolder: Record<Folder, Message[]> = { inbox: [], sent: [], quotes: [] };
    for (const m of visible) {
      if (isSent(m)) byFolder.sent.push(m);
      else byFolder.inbox.push(m);
      if (m.quoteId) byFolder.quotes.push(m);
    }
    for (const k of Object.keys(byFolder) as Folder[]) byFolder[k].reverse();
    return byFolder;
  }, [visible, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = (f: Folder) => inFolder[f].filter(isUnread).length;
  const list = (tab === 'unread' ? inFolder[folder].filter(isUnread) : inFolder[folder]).slice(0, SHOW);

  // 날짜별 묶음: 오늘, 어제(달력 기준), 그 전은 날짜
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = rt.isRealtime ? rt.now : dayToDate(state.startDate, Math.max(1, state.day - 1));
  const todayKey = key(now);
  const yesterdayKey = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const isToday = (day: number) => key(dayToDate(state.startDate, day)) === todayKey;
  const groupLabel = (day: number) => {
    const d = dayToDate(state.startDate, day);
    if (key(d) === todayKey) return '오늘';
    if (key(d) === yesterdayKey) return '어제';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  };
  const groups: { label: string; items: Message[] }[] = [];
  for (const m of list) {
    const label = groupLabel(m.day);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(m);
    else groups.push({ label, items: [m] });
  }

  const quoteMap = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const c of state.cases) for (const q of c.quotes) map.set(q.id, q);
    return map;
  }, [state.cases]);

  const sel = selId ? visible.find((m) => m.id === selId) : undefined;
  const quote = sel?.quoteId ? quoteMap.get(sel.quoteId) : undefined;

  const open = (m: Message) => {
    setSelId(m.id);
    if (!isSent(m) && !read.has(m.id)) {
      const next = new Set(read);
      next.add(m.id);
      setRead(next);
      saveRead(company, next);
    }
  };

  const markAllRead = () => {
    const next = new Set(read);
    for (const m of inFolder.inbox) next.add(m.id);
    setRead(next);
    saveRead(company, next);
  };

  const when = (m: Message) => (isToday(m.day) && m.minute !== undefined ? clock(m.minute) : formatDay(state.startDate, m.day).slice(5, 10).replace('-', '/'));

  return (
    <>
      <SectionHead eyebrow="Mail" title="메일함" desc="거래처와의 견적·발주·클레임, 사내 공식 요청이 메일로 오갑니다. 견적서가 붙은 메일에서는 업체마다 다른 양식을 직접 볼 수 있습니다." />
      <Reveal y={1.25}>
        <section className="card card-lg mail-card">
          <div className="mail">
            <nav className="mail-folders" aria-label="메일 폴더">
              <div className="mail-account">{me}</div>
              {FOLDERS.map((f) => {
                const n = f.id === 'sent' ? inFolder.sent.length : unreadCount(f.id);
                return (
                  <button
                    key={f.id}
                    className={`mail-folder ${folder === f.id ? 'on' : ''}`}
                    aria-pressed={folder === f.id}
                    onClick={() => {
                      setFolder(f.id);
                      setSelId(null);
                    }}
                  >
                    <span>{f.label}</span>
                    {n > 0 && <span className={`mail-count ${f.id === 'sent' ? 'muted' : ''}`}>{n}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="mail-list-pane">
              <div className="mail-tabs" role="tablist" aria-label="보기">
                {(
                  [
                    ['all', '모든 항목'],
                    ['unread', '읽지 않음'],
                  ] as [Tab, string][]
                ).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                    {l}
                  </button>
                ))}
                {folder !== 'sent' && unreadCount('inbox') > 0 && (
                  <button className="mail-allread" onClick={markAllRead}>
                    모두 읽음
                  </button>
                )}
              </div>
              <div className="mail-list" data-lenis-prevent>
                {groups.length === 0 ? (
                  <div className="mail-empty-list">{tab === 'unread' ? '읽지 않은 메일이 없습니다.' : '메일이 없습니다.'}</div>
                ) : (
                  groups.map((g) => (
                    <div key={g.label} className="mail-group">
                      <div className="mail-group-head">{g.label}</div>
                      {g.items.map((m) => (
                        <button key={m.id} className={`mail-item ${sel?.id === m.id ? 'active' : ''} ${isUnread(m) ? 'unread' : ''}`} onClick={() => open(m)}>
                          <span className="mail-who">{isSent(m) ? `받는 사람: ${m.to}` : m.from}</span>
                          <span className="mail-line">
                            <span className="mail-subj">
                              {m.quoteId ? '📎 ' : ''}
                              {m.subject}
                            </span>
                            <span className="mail-time">{when(m)}</span>
                          </span>
                          <span className="mail-preview">{preview(m.body)}</span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mail-view" data-lenis-prevent>
              {!sel ? (
                <div className="mail-empty">
                  <svg width="2.75rem" height="2.75rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                    <rect x="3" y="5" width="18" height="14" rx="1.5" />
                    <path d="M3.5 6l8.5 7 8.5-7" />
                  </svg>
                  <b>읽을 메일을 선택하세요</b>
                  <span>왼쪽 목록에서 메일을 누르면 여기에 열립니다.</span>
                </div>
              ) : (
                <>
                  <div className="mail-view-head">
                    <h3>{sel.subject}</h3>
                    <div className="mail-meta">
                      <span>
                        <b>{sel.from}</b>
                      </span>
                      <span>받는 사람 {sel.to}</span>
                      <span>
                        {formatDay(state.startDate, sel.day)}
                        {sel.minute !== undefined ? ` ${clock(sel.minute)}` : ''}
                      </span>
                    </div>
                  </div>
                  <pre className="msg-body">{sel.body}</pre>
                  {sel.quoteId && (
                    <div className="stack" style={{ gap: '0.5rem' }}>
                      <h4>첨부: 견적서</h4>
                      {!quote ? (
                        <div className="faint">첨부 파일을 찾을 수 없습니다.</div>
                      ) : quote.docText === '' ? (
                        <div className="notice">보관 기간이 지나 원문이 정리됨 (수치 기록은 구매 건 상세에 남아 있습니다)</div>
                      ) : (
                        <>
                          {quote.scanned && <div className="notice notice-warn">스캔 이미지: 도구는 텍스트를 읽을 수 없고 사람이 눈으로 읽어 입력합니다</div>}
                          <pre className={`doc ${quote.scanned ? 'scanned' : ''}`}>{quote.docText}</pre>
                        </>
                      )}
                    </div>
                  )}
                  {sel.caseId && (
                    <div>
                      <button className="pill pill-sm" onClick={() => openCase(sel.caseId!)}>
                        {sel.caseId} 구매 건 보기 →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
