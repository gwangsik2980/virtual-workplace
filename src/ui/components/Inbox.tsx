import { useMemo, useState } from 'react';
import type { Quote } from '../../sim/types';
import { formatDay, formatDayShort } from '../../sim/util';
import { SectionHead } from './Editorial';
import { Reveal } from '../motion';
import { useStore } from '../store';
import './inbox.css';

type MailFilter = 'all' | 'in' | 'out';

/** 메일함. 거래처·사내와 주고받은 메일과 첨부 견적서 (소통 공간 화면) */
export function Inbox() {
  const { state, openCase } = useStore();
  const [filter, setFilter] = useState<MailFilter>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const me = state.employee.name;

  const msgs = useMemo(() => {
    const list = [...state.messages].reverse();
    if (filter === 'in') return list.filter((m) => m.from !== me);
    if (filter === 'out') return list.filter((m) => m.from === me);
    return list;
  }, [state.messages, filter, me]);

  const quoteMap = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const c of state.cases) for (const q of c.quotes) map.set(q.id, q);
    return map;
  }, [state.cases]);

  const sel = msgs.find((m) => m.id === selId) ?? msgs[0];
  const quote = sel?.quoteId ? quoteMap.get(sel.quoteId) : undefined;

  return (
    <>
      <SectionHead
        eyebrow="Inbox"
        title="메일함"
        desc={`최근 ${state.messages.length}건을 보관합니다. 견적서가 붙은 메일에서는 업체마다 다른 양식을 직접 볼 수 있습니다.`}
        actions={
          <div className="seg" role="group" aria-label="메일 종류">
            {(
              [
                ['all', '전체'],
                ['in', '받은메일'],
                ['out', '보낸메일'],
              ] as [MailFilter, string][]
            ).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
        }
      />
      <Reveal y={1.25}>
        <section className="card card-lg inbox-card">
          {msgs.length === 0 ? (
            <div className="empty">메일이 없습니다.</div>
          ) : (
            <div className="inbox">
              <div className="inbox-list" data-lenis-prevent>
                {msgs.slice(0, 200).map((m) => (
                  <button key={m.id} className={`inbox-item ${sel?.id === m.id ? 'active' : ''}`} onClick={() => setSelId(m.id)}>
                    <div className="subj">
                      {m.quoteId ? '📎 ' : ''}
                      {m.subject}
                    </div>
                    <div className="meta">
                      <span>{formatDayShort(state.startDate, m.day)}</span>
                      <span>{m.from === me ? `→ ${m.to}` : m.from}</span>
                    </div>
                  </button>
                ))}
              </div>
              {sel && (
                <div className="inbox-view">
                  <div>
                    <h3 className="inbox-subj">{sel.subject}</h3>
                    <div className="faint">
                      {formatDay(state.startDate, sel.day)}, 보낸 사람 {sel.from}, 받는 사람 {sel.to}
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
                </div>
              )}
            </div>
          )}
        </section>
      </Reveal>
    </>
  );
}
