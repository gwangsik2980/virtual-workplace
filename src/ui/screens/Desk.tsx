import { useMemo, useRef } from 'react';
import { earliestPromotionDay, promotionStatus } from '../../sim/employee';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { SkillId, Stage, TimeBlock, WorkKind } from '../../sim/types';
import { formatDay, formatDayShort } from '../../sim/util';
import { CaseStatus, clock, StageBadge } from '../components/Common';
import { HeroFacts, RowList, ScreenHero, SectionHead } from '../components/Editorial';
import { Reveal } from '../motion';
import { useLiveStatus } from '../components/LiveWidgets';
import { DayBar, KIND_COLORS, KIND_LABELS } from '../components/DayBar';
import { PayrollPanel } from '../components/PayrollPanel';
import { stageAtNow, useRealtime } from '../realtime';
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

const WAIT_STAGE_SET = new Set<Stage>(['awaitQuotes', 'approve', 'awaitDelivery']);


/** 다음 승진: 연차를 얼마나 채웠는지와 가장 빠른 정기 심사일 */
function useRank() {
  const { state } = useStore();
  const st = promotionStatus(state);
  const nextRank = st?.next;
  const rankProgress = st ? Math.min(1, st.years / st.next.years) : 1;
  const reviewDay = earliestPromotionDay(state);
  return { nextRank, rankProgress, reviewDay, xpOk: st?.xpOk ?? true };
}

export function Desk() {
  const { state, deskDay, setDeskDay, openCase } = useStore();
  const e = state.employee;
  const lastDay = state.day - 1;
  const day = deskDay ?? lastDay;
  const { nextRank, rankProgress, reviewDay, xpOk } = useRank();
  const liveStatus = useLiveStatus();
  const rt = useRealtime();
  // 실시간 모드에서 오늘 일정을 볼 때만 '지금' 위치를 표시한다
  const nowMinute = rt.isRealtime && rt.phase === 'working' && day === rt.target ? rt.liveMinute : null;

  const blocks = useMemo(() => state.schedule.filter((b) => b.day === day).sort((a, b) => a.start - b.start), [state.schedule, day]);
  const minDay = useMemo(() => state.schedule.reduce((m, b) => Math.min(m, b.day), lastDay), [state.schedule, lastDay]);
  // 실시간 근무 중에는 지금 시각 기준 단계로 보여 준다
  const live = rt.isRealtime && rt.phase === 'working' && rt.liveMinute !== null;
  const stageOf = (c: (typeof state.cases)[number]) => stageAtNow(state, c, rt);
  const openCases = state.cases.filter((c) => {
    const s = live ? stageOf(c) : c.stage;
    return s !== 'done' && s !== 'cancelled';
  });
  const todayBlocks = (id: string) => state.schedule.filter((b) => b.day === rt.target && b.caseId === id).sort((a, b) => a.start - b.start);
  const lastDayMinutes = state.schedule.filter((b) => b.day === lastDay && b.kind !== 'lunch').reduce((a, b) => a + b.minutes, 0);
  // 근무 칸: 근무 중이면 09:00부터 지금까지 일한 시간, 퇴근 뒤면 오늘 전체, 출근 전·휴일이면 지난 근무일 전체
  const workedToday = rt.isRealtime && (rt.phase === 'working' || rt.phase === 'after');
  const shownMinutes =
    rt.phase === 'working' && rt.liveMinute !== null
      ? state.schedule
          .filter((b) => b.day === rt.target && b.kind !== 'lunch')
          .reduce((a, b) => a + Math.max(0, Math.min(b.minutes, rt.liveMinute! - b.start)), 0)
      : lastDayMinutes;
  // 누적 통계에는 오늘 하루치 예정 시간이 이미 들어 있어서, 근무 중에는 아직 안 한 몫을 뺀다
  const totalHours = Math.round((state.stats.employeeMinutes - (rt.phase === 'working' ? lastDayMinutes - shownMinutes : 0)) / 60);
  const overtimeHours = state.stats.overtimeMinutes / 60;

  const heroLines = [`${e.name} ${e.rank}의`, '하루'];

  if (state.day === 1 && state.schedule.length === 0) {
    return (
      <>
        <ScreenHero
          eyebrow="02 — The Desk"
          lines={heroLines}
          watermark="DESK"
          lead="가상 구매 담당자가 하루를 어떻게 쓰는지 시간대별로 따라갑니다. 일정과 진행 중인 구매 건, 급여와 경력이 여기에 쌓이고, 메일은 소통 공간에서 봅니다."
          aside={
            <div className="desk-start">
              <span className="faint">아직 근무 기록이 없습니다</span>
              <p>첫 근무일 09:00가 되면 {e.name}의 시간대별 업무가 여기에 나타납니다.</p>
            </div>
          }
        />
        <Skills />
        <PayrollPanel />
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
                note: !nextRank
                  ? '최고 직급'
                  : xpOk
                    ? `${nextRank.name} 승진 실적 충족`
                    : `${nextRank.name} 승진까지 ${Math.ceil(nextRank.xp - e.xp).toLocaleString('ko-KR')}`,
              },
              {
                label: workedToday ? '오늘 근무' : '지난 근무일',
                value: `${Math.floor(shownMinutes / 60)}시간 ${Math.round(shownMinutes % 60)}분`,
                note: `누적 ${totalHours.toLocaleString('ko-KR')}시간${overtimeHours >= 0.05 ? `, 연장 ${overtimeHours.toFixed(1)}시간` : ''}`,
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
              {nextRank ? `${nextRank.name} 승진 심사 ${reviewDay ? formatDay(state.startDate, reviewDay).slice(0, 7).replace('-', '년 ') + '월' : ''}` : '최고 직급'}
              <span className="desk-rankbar" aria-hidden>
                <span style={{ width: `${Math.round(rankProgress * 100)}%` }} />
              </span>
            </span>
          </>
        }
      />

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
          <DayTimeline blocks={blocks} workday={state.params.workdayMinutes} onOpen={openCase} nowMinute={nowMinute} />
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
            const s = live ? stageOf(c) : c.stage;
            const tb = live ? todayBlocks(c.id) : [];
            const cur = tb.find((b) => b.start <= rt.liveMinute! && rt.liveMinute! < b.start + b.minutes);
            const nextB = tb.find((b) => b.start > rt.liveMinute!);
            const liveDesc = cur
              ? `${STAGE_LABELS[s]}, 지금 작업 중 (${clock(cur.start)}~${clock(cur.start + cur.minutes)})`
              : nextB
                ? `${STAGE_LABELS[s]}, 오늘 ${clock(nextB.start)} 작업 예정`
                : WAIT_STAGE_SET.has(s)
                  ? `${STAGE_LABELS[s]}, 담당자가 기다리는 단계`
                  : `${STAGE_LABELS[s]}, 다음 영업일에 이어서`;
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
              desc: live ? (
                liveDesc
              ) : waiting ? (
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
                  {live ? (
                    <span className="row" style={{ gap: '0.25rem' }}>
                      {c.urgent && <span className="badge badge-danger">긴급</span>}
                      <StageBadge stage={s} />
                    </span>
                  ) : (
                    <CaseStatus c={c} />
                  )}
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

      <Skills />
      <PayrollPanel />

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

function DayTimeline({
  blocks,
  workday,
  onOpen,
  nowMinute = null,
}: {
  blocks: TimeBlock[];
  workday: number;
  onOpen: (id: string) => void;
  /** 실시간으로 오늘을 볼 때 09:00부터 지난 분. 이후 일정은 흐리게, 지금 하는 일은 강조 */
  nowMinute?: number | null;
}) {
  const currentRef = useRef<HTMLLIElement>(null);
  if (blocks.length === 0) return <div className="empty">이 날의 근무 기록이 없습니다.</div>;
  const live = nowMinute !== null;
  const stateOf = (b: TimeBlock) => (!live ? '' : b.start + b.minutes <= nowMinute! ? 'past' : b.start <= nowMinute! ? 'current' : 'future');
  // 시계 기준 정규 근무 종료 = 8시간 + 점심 1시간 = 18:00
  const workEnd = workday + (blocks.some((b) => b.kind === 'lunch') ? 60 : 0);
  const end = Math.max(workEnd, ...blocks.map((b) => b.start + b.minutes));
  const span = Math.ceil(end / 60) * 60;
  const total = blocks.filter((b) => b.kind !== 'lunch').reduce((a, b) => a + b.minutes, 0);
  const toolMin = blocks.filter((b) => b.toolId).reduce((a, b) => a + b.minutes, 0);
  const byKind = new Map<WorkKind, number>();
  for (const b of blocks) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + b.minutes);

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
      <DayBar blocks={blocks} span={span} workEnd={workEnd} end={end} onOpen={onOpen} nowMinute={nowMinute} />
      <div className="timeline-legend">
        {[...byKind.entries()].map(([k, m]) => (
          <span key={k} style={{ ['--blk' as string]: KIND_COLORS[k] }}>
            <span className="swatch" />
            {KIND_LABELS[k]} <b className="num">{m}분</b>
          </span>
        ))}
      </div>
      {live && (
        <div className="row between now-bar">
          <span className="faint">지금 {clock(nowMinute!)}. 흐린 줄은 아직 오지 않은 일정이에요.</span>
          <button className="pill pill-sm" onClick={() => currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            지금 일정 보기
          </button>
        </div>
      )}
      <ul className="block-list">
        {blocks.map((b, i) => (
          <li key={i} ref={stateOf(b) === 'current' ? currentRef : undefined} className={stateOf(b)}>
            <button type="button" className={`block-row ${b.caseId ? 'clickable' : ''}`} disabled={!b.caseId} onClick={() => b.caseId && onOpen(b.caseId)}>
              <span className="block-time num" style={{ ['--blk' as string]: KIND_COLORS[b.kind] }}>
                <span className="swatch" />
                {clock(b.start)}–{clock(b.start + b.minutes)}
              </span>
              <span className="block-label">{b.label}</span>
              <span className="block-meta">
                {stateOf(b) === 'current' && <span className="badge now-badge">지금</span>}
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

