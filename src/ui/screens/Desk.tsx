import { useMemo, useState } from 'react';
import { RANKS } from '../../sim/employee';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { Quote, SkillId, TimeBlock, WorkKind } from '../../sim/types';
import { formatDay, formatDayShort } from '../../sim/util';
import { CaseStatus, clock } from '../components/Common';
import { HeroFacts, RowList, ScreenHero, SectionHead } from '../components/Editorial';
import { ArrowRight, Reveal } from '../motion';
import { useLiveStatus } from '../components/LiveWidgets';
import { useStore } from '../store';
import './desk.css';

const SKILL_NAMES: Record<SkillId, string> = {
  market: '시장조사',
  costing: '원가분석',
  negotiation: '협상',
  docs: '문서와 데이터',
};

const SKILL_DESC: Record<SkillId, string> = {
  market: '시세와 환율을 읽는 속도',
  costing: '목표가를 잡는 정확도',
  negotiation: '할인을 끌어내는 힘',
  docs: '입력 속도와 오입력 확률',
};

const KIND_COLORS: Record<WorkKind, string> = {
  case: 'var(--series-1)',
  mail: 'var(--series-3)',
  meeting: 'var(--series-4)',
  report: 'var(--series-5)',
  claim: 'var(--danger)',
  adhoc: 'var(--series-2)',
  expedite: 'var(--warn)',
};

const KIND_LABELS: Record<WorkKind, string> = {
  case: '구매 건',
  mail: '메일',
  meeting: '회의',
  report: '보고서',
  claim: '클레임',
  adhoc: '일상 업무',
  expedite: '납기 독촉',
};

type MailFilter = 'all' | 'in' | 'out';

function useRank() {
  const { state } = useStore();
  const e = state.employee;
  const nextRank = RANKS.find((r) => r.xp > e.xp);
  const curRank = [...RANKS].reverse().find((r) => r.xp <= e.xp) ?? RANKS[0];
  const rankProgress = nextRank ? (e.xp - curRank.xp) / (nextRank.xp - curRank.xp) : 1;
  return { nextRank, rankProgress };
}

export function Desk() {
  const { state, deskDay, setDeskDay, openCase, advance } = useStore();
  const e = state.employee;
  const lastDay = state.day - 1;
  const day = deskDay ?? lastDay;
  const { nextRank, rankProgress } = useRank();
  const liveStatus = useLiveStatus();

  const blocks = useMemo(() => state.schedule.filter((b) => b.day === day).sort((a, b) => a.start - b.start), [state.schedule, day]);
  const minDay = useMemo(() => state.schedule.reduce((m, b) => Math.min(m, b.day), lastDay), [state.schedule, lastDay]);
  const openCases = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');
  const lastDayMinutes = state.schedule.filter((b) => b.day === lastDay).reduce((a, b) => a + b.minutes, 0);

  const heroLines = [`${e.name} ${e.rank}의`, '하루'];

  if (state.day === 1 && state.schedule.length === 0) {
    return (
      <>
        <ScreenHero
          eyebrow="02 — The Desk"
          lines={heroLines}
          watermark="DESK"
          lead="가상 구매 담당자가 하루를 어떻게 쓰는지 시간대별로 따라갑니다. 일정, 메일, 견적서, 진행 중인 구매 건이 모두 여기에 쌓입니다."
          aside={
            <div className="desk-start">
              <span className="faint">아직 근무 기록이 없습니다</span>
              <p>하루를 진행하면 {e.name}의 첫 근무일이 시작되고, 시간대별 업무와 주고받은 메일이 여기에 나타납니다.</p>
              <button className="pill pill-dark pill-arrow" onClick={() => advance(1)}>
                첫날 시작하기
                <span className="arrow-badge">
                  <ArrowRight />
                </span>
              </button>
            </div>
          }
        />
        <Skills />
        <Career />
      </>
    );
  }

  const dayLabel = formatDay(state.startDate, day);

  return (
    <>
      <ScreenHero
        eyebrow="02 — The Desk"
        lines={heroLines}
        watermark="DESK"
        lead="담당자가 어떤 순서로 일하고 어디서 시간이 새는지 따라가 보세요. 막대나 업무 줄을 누르면 해당 구매 건의 기록이 열립니다."
        aside={
          <HeroFacts
            items={[
              { label: '완료한 구매 건', value: `${e.completedCases}건` },
              {
                label: '경험치',
                value: Math.round(e.xp).toLocaleString('ko-KR'),
                note: nextRank ? `${nextRank.name}까지 ${Math.ceil(nextRank.xp - e.xp).toLocaleString('ko-KR')}` : '최고 직급',
              },
              {
                label: '어제 근무',
                value: `${(lastDayMinutes / 60).toFixed(1)}시간`,
                note: `${Math.floor(lastDayMinutes / 60)}시간 ${lastDayMinutes % 60}분${lastDayMinutes > state.params.workdayMinutes ? `, 연장 ${lastDayMinutes - state.params.workdayMinutes}분` : ''}`,
              },
              { label: '진행 중 업무', value: `${openCases.length + state.backlog.length}건`, note: `구매 건 ${openCases.length}, 기타 ${state.backlog.length}` },
            ]}
          />
        }
        footer={
          <>
            <span>입사 {formatDay(state.startDate, e.joinedDay)}</span>
            <span>{liveStatus}</span>
            <span className="row" style={{ gap: '0.5rem' }}>
              {nextRank ? `다음 직급 ${nextRank.name}` : '최고 직급'}
              <span className="desk-rankbar" aria-hidden>
                <span style={{ width: `${Math.round(rankProgress * 100)}%` }} />
              </span>
            </span>
          </>
        }
      />

      <Skills />

      <SectionHead
        eyebrow="Timeline"
        title="하루 일정"
        desc={dayLabel}
        actions={
          <>
            <button className="pill pill-sm" disabled={day <= minDay} onClick={() => setDeskDay(Math.max(minDay, day - 1))}>
              ← 이전날
            </button>
            <button className="pill pill-sm" disabled={day >= lastDay} onClick={() => setDeskDay(day + 1 >= lastDay ? null : day + 1)}>
              다음날 →
            </button>
          </>
        }
      />
      <Reveal y={1.25}>
        <section className="card card-lg">
          <DayTimeline blocks={blocks} workday={state.params.workdayMinutes} onOpen={openCase} />
        </section>
      </Reveal>

      <SectionHead eyebrow="In progress" title="진행 중 업무" desc={`구매 건 ${openCases.length}건, 그 밖의 업무 ${state.backlog.length}건`} />
      <div className="desk-rows">
        <RowList
          empty="진행 중인 구매 건이 없습니다."
          items={openCases.map((c) => {
            const m = state.materials[c.materialId];
            const left = c.neededByDay - state.day;
            const waiting = c.stageMinutesTotal === 0 || c.stageMinutesLeft === 0;
            return {
              key: c.id,
              index: c.id.replace('PR-', ''),
              title: (
                <span className="desk-row-title">
                  {m.name}
                  <span className="faint num">
                    {c.qty.toLocaleString('ko-KR')}
                    {m.unit}
                  </span>
                </span>
              ),
              desc: waiting ? (
                `${STAGE_LABELS[c.stage]}, 담당자가 기다리는 단계`
              ) : (
                <span className="stack" style={{ gap: '0.375rem' }}>
                  <span>
                    {STAGE_LABELS[c.stage]} 남은 작업 {c.stageMinutesLeft}분 / {c.stageMinutesTotal}분
                  </span>
                  <span className="desk-mini-bar" aria-hidden>
                    <span style={{ width: `${Math.round((1 - c.stageMinutesLeft / c.stageMinutesTotal) * 100)}%` }} />
                  </span>
                </span>
              ),
              meta: (
                <>
                  <span className={`badge ${left < 0 ? 'badge-danger' : left <= 2 ? 'badge-warn' : ''}`}>{left >= 0 ? `D-${left}` : `${-left}일 지남`}</span>
                  <CaseStatus c={c} />
                </>
              ),
              onClick: () => openCase(c.id),
            };
          })}
        />
        {state.backlog.length > 0 && (
          <>
            <h4 className="desk-subhead">그 밖의 업무</h4>
            <RowList
              items={state.backlog.map((b) => ({
                key: b.id,
                title: <span className="desk-row-title desk-row-title-sm">{b.title}</span>,
                desc: `${KIND_LABELS[b.kind]}${b.from ? `, ${b.from} 요청` : ''}`,
                meta: (
                  <>
                    <span className="badge" style={{ ['--blk' as string]: KIND_COLORS[b.kind] }}>
                      <span className="swatch" />
                      {KIND_LABELS[b.kind]}
                    </span>
                    <span className="faint num">
                      마감 {formatDayShort(state.startDate, b.dueDay)}, 남은 {b.minutesLeft}분
                    </span>
                  </>
                ),
                onClick: b.caseId ? () => openCase(b.caseId!) : undefined,
              }))}
            />
          </>
        )}
      </div>

      <Inbox />
      <Career />
    </>
  );
}

function Skills() {
  const { state } = useStore();
  const e = state.employee;
  return (
    <>
      <SectionHead eyebrow="Skills" title="숙련도" desc="일을 할수록 올라갑니다. 숙련도가 높으면 같은 일을 더 빨리, 더 적은 실수로 처리합니다." />
      <ul className="skill-grid">
        {(Object.keys(SKILL_NAMES) as SkillId[]).map((k, i) => (
          <Reveal as="li" key={k} delay={i * 80} y={1}>
            <div className="skill-tile">
              <span className="skill-name">{SKILL_NAMES[k]}</span>
              <span className="skill-num">
                {Math.round(e.skills[k])}
                <small>/100</small>
              </span>
              <span className="skill-bar" aria-hidden>
                <span style={{ width: `${Math.round(e.skills[k])}%` }} />
              </span>
              <span className="faint">{SKILL_DESC[k]}</span>
            </div>
          </Reveal>
        ))}
      </ul>
    </>
  );
}

function Career() {
  const { state } = useStore();
  const ms = [...state.employee.milestones].reverse().slice(0, 12);
  return (
    <>
      <SectionHead eyebrow="Career" title="경력 기록" desc="첫 출근부터 승진과 숙련도 달성까지 담당자의 이력이 쌓입니다." />
      <Reveal y={1}>
        <ol className="career">
          {ms.map((m, i) => (
            <li key={i} className={i === 0 ? 'latest' : ''}>
              <span className="career-dot" aria-hidden />
              <span className="career-day">{formatDay(state.startDate, m.day)}</span>
              <span className="career-text">{m.text}</span>
            </li>
          ))}
        </ol>
      </Reveal>
    </>
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
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="day-summary">
        <span className="day-total">
          {Math.floor(total / 60)}
          <small>시간</small> {total % 60}
          <small>분</small>
        </span>
        <span className="faint">
          {total > workday ? `정규 8시간에서 ${total - workday}분 연장` : '정규 8시간 안에서 끝남'}
          {toolMin > 0 ? `, 도구 사용 ${toolMin}분` : ''}
        </span>
      </div>
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
      <div className="timeline-legend">
        {[...byKind.entries()].map(([k, m]) => (
          <span key={k} style={{ ['--blk' as string]: KIND_COLORS[k] }}>
            <span className="swatch" />
            {KIND_LABELS[k]} <b className="num">{m}분</b>
          </span>
        ))}
      </div>
      <ul className="block-list">
        {blocks.map((b, i) => (
          <li key={i}>
            <button type="button" className={`block-row ${b.caseId ? 'clickable' : ''}`} disabled={!b.caseId} onClick={() => b.caseId && onOpen(b.caseId)}>
              <span className="block-time num" style={{ ['--blk' as string]: KIND_COLORS[b.kind] }}>
                <span className="swatch" />
                {clock(b.start)}–{clock(b.start + b.minutes)}
              </span>
              <span className="block-label">{b.label}</span>
              <span className="block-meta">
                {b.toolId && <span className="badge badge-accent">AI 도구</span>}
                <span className="num">{b.minutes}분</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
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
