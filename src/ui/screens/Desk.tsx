import { useMemo, useState } from 'react';
import { RANKS } from '../../sim/employee';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { Quote, SkillId, TimeBlock, WorkKind } from '../../sim/types';
import { formatDay, formatDayShort } from '../../sim/util';
import { Card, CaseStatus, PageHead, Progress, clock } from '../components/Common';
import { useStore } from '../store';
import './desk.css';

const SKILL_NAMES: Record<SkillId, string> = {
  market: '시장조사',
  costing: '원가분석',
  negotiation: '협상',
  docs: '문서·데이터',
};

const KIND_COLORS: Record<WorkKind, string> = {
  case: 'var(--series-1)',
  mail: 'var(--series-3)',
  meeting: 'var(--series-4)',
  report: 'var(--series-5)',
  claim: 'var(--danger)',
  adhoc: 'var(--series-2)',
};

const KIND_LABELS: Record<WorkKind, string> = {
  case: '구매 건',
  mail: '메일',
  meeting: '회의',
  report: '보고서',
  claim: '클레임',
  adhoc: '일상 업무',
};

type MailFilter = 'all' | 'in' | 'out';

export function Desk() {
  const { state, deskDay, setDeskDay, openCase } = useStore();
  const e = state.employee;
  const lastDay = state.day - 1;
  const day = deskDay ?? lastDay;

  const blocks = useMemo(() => state.schedule.filter((b) => b.day === day).sort((a, b) => a.start - b.start), [state.schedule, day]);
  const minDay = useMemo(() => state.schedule.reduce((m, b) => Math.min(m, b.day), lastDay), [state.schedule, lastDay]);
  const openCases = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');

  if (state.day === 1 && state.schedule.length === 0) {
    return (
      <>
        <PageHead title="직원 업무" desc="가상 구매 담당자의 하루를 어깨너머로 관찰합니다." />
        <Card>
          <div className="empty">
            아직 근무 기록이 없습니다.
            <br />
            위쪽의 <strong>하루 진행 ▶</strong>을 누르면 {e.name} 님의 첫 근무일이 시작되고, 시간대별 업무와 주고받은 메일이 여기에 쌓입니다.
          </div>
        </Card>
        <ProfileCard />
      </>
    );
  }

  return (
    <>
      <PageHead title="직원 업무" desc={`${e.name} ${e.rank}의 일정, 메일, 업무 이력을 관찰합니다. 담당자가 어떤 순서로 일하는지 따라가 보세요.`} />
      <div className="desk-grid">
        <ProfileCard />
        <div className="stack" style={{ gap: 16 }}>
          <Card
            title="하루 일정"
            sub={formatDay(state.startDate, day)}
            actions={
              <>
                <button className="btn btn-sm" disabled={day <= minDay} onClick={() => setDeskDay(Math.max(minDay, day - 1))}>
                  ◀ 이전날
                </button>
                <button className="btn btn-sm" disabled={day >= lastDay} onClick={() => setDeskDay(day + 1 >= lastDay ? null : day + 1)}>
                  다음날 ▶
                </button>
              </>
            }
          >
            <DayTimeline blocks={blocks} workday={state.params.workdayMinutes} onOpen={openCase} />
          </Card>
          <Card title="진행 중 업무" sub={`구매 건 ${openCases.length} · 기타 ${state.backlog.length}`}>
            {openCases.length === 0 && state.backlog.length === 0 ? (
              <div className="empty">진행 중인 업무가 없습니다.</div>
            ) : (
              <div className="list">
                {openCases.map((c) => {
                  const m = state.materials[c.materialId];
                  const left = c.neededByDay - state.day;
                  const waiting = c.stageMinutesTotal === 0 || c.stageMinutesLeft === 0;
                  return (
                    <div key={c.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => openCase(c.id)}>
                      <div className="row between">
                        <span className="row" style={{ gap: 6 }}>
                          <span className="mono faint">{c.id}</span>
                          <strong>{m.name}</strong>
                          <span className="faint num">
                            {c.qty.toLocaleString('ko-KR')}
                            {m.unit}
                          </span>
                        </span>
                        <CaseStatus c={c} />
                      </div>
                      <div className="row between" style={{ marginTop: 4, fontSize: 12 }}>
                        <span className="faint">
                          필요일 {formatDayShort(state.startDate, c.neededByDay)} ({left >= 0 ? `D-${left}` : `${-left}일 지남`})
                        </span>
                        <span className="faint num">
                          {waiting ? `${STAGE_LABELS[c.stage]} (담당자 작업 없음)` : `남은 작업 ${c.stageMinutesLeft}분 / ${c.stageMinutesTotal}분`}
                        </span>
                      </div>
                      {!waiting && (
                        <div style={{ marginTop: 4 }}>
                          <Progress value={1 - c.stageMinutesLeft / c.stageMinutesTotal} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {state.backlog.map((b) => (
                  <div key={b.id} className="list-item">
                    <div className="row between">
                      <span className="row" style={{ gap: 6 }}>
                        <span className="badge" style={{ ['--blk' as string]: KIND_COLORS[b.kind] }}>
                          <span className="swatch" />
                          {KIND_LABELS[b.kind]}
                        </span>
                        <span>{b.title}</span>
                        {b.from && <span className="faint">({b.from})</span>}
                      </span>
                      <span className="faint num" style={{ fontSize: 12 }}>
                        마감 {formatDayShort(state.startDate, b.dueDay)} · 남은 {b.minutesLeft}분
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      <Inbox />
    </>
  );
}

function ProfileCard() {
  const { state } = useStore();
  const e = state.employee;
  const nextRank = RANKS.find((r) => r.xp > e.xp);
  const curRank = [...RANKS].reverse().find((r) => r.xp <= e.xp) ?? RANKS[0];
  const rankProgress = nextRank ? (e.xp - curRank.xp) / (nextRank.xp - curRank.xp) : 1;

  return (
    <Card title={`${e.name} ${e.rank}`} sub={`구매팀 · 입사 ${formatDay(state.startDate, e.joinedDay)}`}>
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <div className="row between" style={{ fontSize: 12.5, marginBottom: 4 }}>
            <span className="muted">경험치 {Math.round(e.xp).toLocaleString('ko-KR')}</span>
            <span className="faint">{nextRank ? `${nextRank.name}까지 ${Math.ceil(nextRank.xp - e.xp).toLocaleString('ko-KR')}` : '최고 직급'}</span>
          </div>
          <Progress value={rankProgress} />
        </div>
        <div className="stack" style={{ gap: 7 }}>
          <h4>숙련도</h4>
          {(Object.keys(SKILL_NAMES) as SkillId[]).map((k) => (
            <div className="skill-row" key={k}>
              <span>{SKILL_NAMES[k]}</span>
              <Progress value={e.skills[k] / 100} />
              <span className="num faint" style={{ textAlign: 'right' }}>
                {Math.round(e.skills[k])}
              </span>
            </div>
          ))}
          <span className="faint">숙련도가 오르면 같은 일을 더 빨리, 더 적은 실수로 처리합니다.</span>
        </div>
        <div className="row between" style={{ fontSize: 12.5 }}>
          <span className="muted">완료한 구매 건</span>
          <strong className="num">{e.completedCases}건</strong>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <h4>경력 기록</h4>
          <div className="list">
            {[...e.milestones]
              .reverse()
              .slice(0, 8)
              .map((m, i) => (
                <div className="list-item" key={i} style={{ padding: '5px 0', fontSize: 12.5 }}>
                  <span className="faint">{formatDayShort(state.startDate, m.day)}</span> {m.text}
                </div>
              ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DayTimeline({ blocks, workday, onOpen }: { blocks: TimeBlock[]; workday: number; onOpen: (id: string) => void }) {
  if (blocks.length === 0) return <div className="empty">이 날의 근무 기록이 없습니다.</div>;
  const end = Math.max(workday, ...blocks.map((b) => b.start + b.minutes));
  const span = Math.ceil(end / 60) * 60;
  const pctOf = (m: number) => `${(m / span) * 100}%`;
  const total = blocks.reduce((a, b) => a + b.minutes, 0);
  const toolMin = blocks.filter((b) => b.toolId).reduce((a, b) => a + b.minutes, 0);
  const byKind = new Map<WorkKind, number>();
  for (const b of blocks) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + b.minutes);
  const hours = span / 60;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="timeline">
        <div className="timeline-hours">
          {Array.from({ length: hours - 1 }, (_, i) => (
            <span key={i} style={{ left: pctOf((i + 1) * 60) }}>
              {10 + i}시
            </span>
          ))}
        </div>
        <div className="timeline-track">
          {blocks.map((b, i) => (
            <div
              key={i}
              className={`timeline-block ${b.caseId ? 'clickable' : ''} ${b.toolId ? 'tool' : ''}`}
              style={{ left: pctOf(b.start), width: pctOf(b.minutes), ['--blk' as string]: KIND_COLORS[b.kind] }}
              title={`${clock(b.start)}~${clock(b.start + b.minutes)} ${b.label}`}
              onClick={() => b.caseId && onOpen(b.caseId)}
            />
          ))}
          {end > workday && <div className="timeline-workend" style={{ left: pctOf(workday) }} title="정규 근무시간(8시간) 종료" />}
        </div>
      </div>
      <div className="row" style={{ gap: 12, fontSize: 12 }}>
        {[...byKind.entries()].map(([k, m]) => (
          <span key={k} className="muted" style={{ ['--blk' as string]: KIND_COLORS[k] }}>
            <span className="swatch" />
            {KIND_LABELS[k]} {m}분
          </span>
        ))}
        <span className="faint" style={{ marginLeft: 'auto' }}>
          총 {Math.floor(total / 60)}시간 {total % 60}분{total > workday ? ` (연장 ${total - workday}분)` : ''}
          {toolMin > 0 ? ` · 도구 사용 ${toolMin}분` : ''}
        </span>
      </div>
      <div className="list block-list">
        {blocks.map((b, i) => (
          <div key={i} className={`list-item ${b.caseId ? 'clickable' : ''}`} onClick={() => b.caseId && onOpen(b.caseId)}>
            <span className="num faint" style={{ ['--blk' as string]: KIND_COLORS[b.kind] }}>
              <span className="swatch" />
              {clock(b.start)}~{clock(b.start + b.minutes)}
            </span>
            <span>{b.label}</span>
            <span className="row" style={{ gap: 4 }}>
              {b.toolId && <span className="badge badge-accent">AI 도구</span>}
              <span className="faint num">{b.minutes}분</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Inbox() {
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
    <Card
      title="메일함"
      sub={`최근 ${state.messages.length}건 보관`}
      actions={
        <div className="seg">
          {(
            [
              ['all', '전체'],
              ['in', '받은메일'],
              ['out', '보낸메일'],
            ] as [MailFilter, string][]
          ).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      }
    >
      {msgs.length === 0 ? (
        <div className="empty">메일이 없습니다.</div>
      ) : (
        <div className="inbox">
          <div className="inbox-list">
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
            <div className="stack" style={{ gap: 10, minWidth: 0 }}>
              <div>
                <h3 style={{ fontSize: 14 }}>{sel.subject}</h3>
                <div className="faint">
                  {formatDay(state.startDate, sel.day)} · 보낸 사람 {sel.from} · 받는 사람 {sel.to}
                </div>
              </div>
              <pre className="msg-body">{sel.body}</pre>
              {sel.quoteId && (
                <div className="stack" style={{ gap: 6 }}>
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
                  <button className="btn btn-sm" onClick={() => openCase(sel.caseId!)}>
                    {sel.caseId} 구매 건 보기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
