import { useEffect, useMemo, useState } from 'react';
import { activeTool } from '../../sim/compare';
import { dailyUsage } from '../../sim/market';
import { onOrderQty, reorderPoint } from '../../sim/operations';
import { STAGE_LABELS, STAGE_ORDER } from '../../sim/purchasing';
import type { DeptId, GameState, MaterialId, Stage } from '../../sim/types';
import { dayToDate, DEPT_NAMES, formatDay, formatDayShort, wonShort } from '../../sim/util';
import { LineChart } from '../components/Chart';
import { Card, clock, EventBadge, pct, Stat } from '../components/Common';
import { useLight, useLiveStatus, useTodayDay } from '../components/LiveWidgets';
import { currentBlock, stageAtNow, useRealtime } from '../realtime';
import { ArrowRight, DotIcon, LineReveal, Mark, Reveal, useIntroReady, useScrollCount } from '../motion';
import { useStore, type ScreenId } from '../store';

function HeroCard() {
  const { state, setScreen } = useStore();
  const open = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');
  const urgent = open.filter((c) => c.urgent).length;
  const tools = state.tools.filter((t) => t.removedDay === undefined).length;
  const items = [
    { cap: '관찰 대상', title: `구매팀 ${state.employee.name} ${state.employee.rank}`, go: 'desk' as const },
    { cap: '진행 중 구매', title: open.length ? `${open.length}건${urgent ? `, 긴급 ${urgent}건` : ''}` : '아직 없음', go: 'process' as const },
    { cap: '업무에 붙인 도구', title: tools ? `${tools}개 적용 중` : '아직 없음, 모두 수작업', go: 'lab' as const },
  ];
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const n = items.length;
  const step = (d: number) => {
    setDir(d);
    setI((x) => (x + d + n) % n);
  };
  return (
    <div className="hero-card">
      <div className="hero-card-row">
        <button className="hero-card-tile" onClick={() => setScreen(items[i].go)} aria-label={`${items[i].cap} 화면으로`}>
          <Mark />
        </button>
        <div className="hero-card-panel">
          <button className="hero-card-slot" onClick={() => step(1)} aria-label="다음 항목" style={{ textAlign: 'left' }}>
            {items.map((it, k) => {
              const off = k === i ? 0 : (k - i + n) % n === 1 ? dir * 0.875 : -dir * 0.875;
              return (
                <span
                  key={it.cap}
                  className="hero-card-item"
                  aria-hidden={k !== i}
                  style={{ opacity: k === i ? 1 : 0, transform: `translateY(${off}rem)` }}
                >
                  <span className="cap" style={{ display: 'block' }}>
                    {it.cap}
                  </span>
                  <span className="ttl" style={{ display: 'block' }}>
                    {it.title}
                  </span>
                </span>
              );
            })}
          </button>
          <div className="hero-card-foot">
            <div className="hero-dots">
              {items.map((it, k) => (
                <span key={it.cap} className={k === i ? 'on' : ''} />
              ))}
            </div>
            <div className="row" style={{ gap: '0.25rem' }}>
              <button className="round-btn" onClick={() => step(-1)} aria-label="이전">
                <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                  <ArrowRight />
                </span>
              </button>
              <button className="round-btn" onClick={() => step(1)} aria-label="다음">
                <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 초 단위 시계. 첫 화면 큰 시각에만 쓴다 (앱 전체를 매초 다시 그리지 않으려고 따로 둔다) */
function useSecondClock(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

/** 지금 하는 일, 구매 단계, 다음 일정, 진행 중인 구매 */
function NowPanel() {
  const { state, openCase, setScreen } = useStore();
  const rt = useRealtime();
  const status = useLiveStatus();
  const block = currentBlock(state, rt);
  // 지금 시각 기준 단계 (오늘 저녁에 끝날 일을 미리 보여 주지 않는다)
  const at = (c: (typeof state.cases)[number]) => stageAtNow(state, c, rt);
  const open = state.cases
    .filter((c) => (c.stage !== 'done' && c.stage !== 'cancelled') || (rt.liveMinute !== null && c.closedDay === rt.target))
    .map((c) => ({ c, st: at(c) }))
    .filter((x) => x.st !== 'done' && x.st !== 'cancelled');
  const stageNo = (st: Stage) => STAGE_ORDER.indexOf(st) + 1;
  const blockCase = block?.caseId ? state.cases.find((c) => c.id === block.caseId) : undefined;
  const next =
    rt.liveMinute !== null
      ? state.schedule.filter((b) => b.day === rt.target && b.start > rt.liveMinute!).sort((a, b) => a.start - b.start)[0]
      : undefined;
  const progress = block && rt.liveMinute !== null ? Math.min(1, (rt.liveMinute - block.start) / block.minutes) : null;
  const clean = (l: string) => l.replace(/ \(계속\)$/, '');

  return (
    <div className="now-panel">
      <div className="now-main">
        <span className="now-label">지금</span>
        {block ? (
          <>
            <strong className="now-title">{clean(block.label)}</strong>
            <div className="now-meta">
              {blockCase && block.stage && (
                <span className="badge badge-accent">
                  구매 단계 {pad2(stageNo(block.stage))}/12 {STAGE_LABELS[block.stage]}
                </span>
              )}
              <span className="faint">
                {clock(block.start)}~{clock(block.start + block.minutes)}
              </span>
            </div>
            {progress !== null && (
              <div className="progress now-progress" aria-label={`진행 ${Math.round(progress * 100)}%`}>
                <div style={{ width: `${progress * 100}%` }} />
              </div>
            )}
            {next && (
              <span className="now-next">
                다음 {clock(next.start)} {clean(next.label)}
              </span>
            )}
          </>
        ) : (
          <strong className="now-title">{status}</strong>
        )}
      </div>
      <div className="now-cases">
        <span className="now-label">진행 중인 구매 {open.length}건</span>
        {open.length === 0 ? (
          <span className="faint">지금 진행 중인 구매가 없어요. 재고가 줄면 생산팀이 요청을 보냅니다.</span>
        ) : (
          <ul>
            {open.slice(0, 4).map(({ c, st }) => (
              <li key={c.id}>
                <button onClick={() => openCase(c.id)}>
                  <span className="now-stage">{pad2(stageNo(st))}</span>
                  <span className="now-case-name">
                    {state.materials[c.materialId].name}
                    {c.urgent && <span className="badge badge-danger">긴급</span>}
                  </span>
                  <span className="faint">{STAGE_LABELS[st]}</span>
                </button>
              </li>
            ))}
            {open.length > 4 && (
              <li>
                <button className="faint" onClick={() => setScreen('process')}>
                  외 {open.length - 4}건 더 보기
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function Hero() {
  const { state, setScreen } = useStore();
  const ready = useIntroReady();
  const rt = useRealtime();
  const today = useTodayDay();
  const liveStatus = useLiveStatus();
  const light = useLight();
  const showClock = rt.isRealtime && rt.phase !== 'ahead';
  const sec = useSecondClock(showClock);
  const d = showClock ? sec : dayToDate(state.startDate, today);
  const titleLines = [
    <>
      {d.getFullYear()}-{pad2(d.getMonth() + 1)}-{pad2(d.getDate())}
      <span className="hero-weekday">({WEEK[d.getDay()]})</span>
    </>,
    showClock ? `${pad2(sec.getHours())}:${pad2(sec.getMinutes())}:${pad2(sec.getSeconds())}` : `${today}일차`,
  ];
  return (
    <section className="hero" aria-label="소개">
      <div className="hero-watermark reveal-wm" style={{ opacity: ready ? 1 : 0, transform: ready ? 'none' : 'translateY(1.25rem)', transition: 'opacity 1.2s var(--spring) 300ms, transform 1.2s var(--spring) 300ms' }}>
        WORKPLACE
      </div>
      <div className="hero-grid">
        <div className="hero-left">
          <Reveal gated delay={200} y={0.625}>
            <span className={`eyebrow live-eyebrow light-${light.light}`}>
              {light.text} · {today}일차
            </span>
          </Reveal>
          <LineReveal as="h1" gated delay={250} stagger={120} lines={titleLines} className="hero-clock" />
          <Reveal gated delay={500} y={0.75}>
            <NowPanel />
          </Reveal>
          <Reveal gated delay={700} y={0.75}>
            <div className="row" style={{ gap: '0.75rem' }}>
              <button className="pill pill-dark pill-arrow" onClick={() => setScreen('desk')}>
                담당자 업무 보기
                <span className="arrow-badge">
                  <ArrowRight />
                </span>
              </button>
              <button className="pill pill-white" onClick={() => setScreen('process')}>
                프로세스 맵
              </button>
            </div>
          </Reveal>
        </div>
        <div className="hero-right">
          <Reveal gated delay={400} y={1} scale={0.96} className="hero-card-wrap">
            <HeroCard />
          </Reveal>
          <Reveal gated delay={550} y={0.875} className="hero-partners">
            <ul aria-label={`거래 공급업체 ${state.suppliers.length}곳`}>
              {state.suppliers.map((s) => (
                <li key={s.id} title={s.name}>
                  <span style={{ color: 'var(--text-3)', display: 'inline-flex', fontSize: '0.875rem' }}>
                    <DotIcon />
                  </span>
                  {s.name}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
      <Reveal gated delay={900} y={0} className="hero-status">
        <span>
          {liveStatus}
        </span>
        <span>스크롤해서 보기 ↓</span>
      </Reveal>
    </section>
  );
}

function LoopBand() {
  const { setScreen } = useStore();
  const steps: { cls: string; no: string; label: string; desc: string; go: ScreenId }[] = [
    { cls: 'light', no: '01', label: '관찰', desc: '담당자의 하루 보기', go: 'desk' },
    { cls: 'accent', no: '02', label: '발견', desc: '성과와 문제 찾기', go: 'performance' },
    { cls: 'dark', no: '03', label: '개선', desc: '도구를 업무에 적용', go: 'lab' },
    { cls: 'ghost', no: '04', label: '검증', desc: '도구 전후 비교', go: 'lab' },
  ];
  return (
    <ul className="loop-band" aria-label="관찰, 발견, 개선, 검증의 순환">
      {steps.map((t, i) => (
        <Reveal as="li" key={t.no} delay={i * 100} y={1}>
          <button className={`loop-tile ${t.cls}`} onClick={() => setScreen(t.go)}>
            <span className="loop-no">{t.no}</span>
            <span className="loop-label">{t.label}</span>
            <span className="loop-desc">{t.desc}</span>
            <span className="loop-arrow" aria-hidden>
              <ArrowRight />
            </span>
          </button>
        </Reveal>
      ))}
    </ul>
  );
}

function CountStat({ value, suffix, label, delay }: { value: number; suffix?: string; label: string; delay: number }) {
  const [ref, v] = useScrollCount(value);
  return (
    <Reveal as="li" delay={delay} y={1.25}>
      <div ref={ref as React.RefObject<HTMLDivElement>} className="num-big">
        {v.toLocaleString('ko-KR')}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="num-label">{label}</div>
    </Reveal>
  );
}

function StatsPanel() {
  const { state } = useStore();
  const s = state.stats;
  const deliveries = s.deliveriesOnTime + s.deliveriesLate;
  return (
    <Reveal y={2.5} scale={0.99}>
      <section className="ink stats-panel">
        <span className="eyebrow">By the numbers</span>
        <LineReveal lines={['지금까지 이 회사의 구매팀이 해낸 일']} delay={120} />
        <ul className="stats-grid" style={{ listStyle: 'none' }}>
          <CountStat value={Math.round(s.priceSavingKRW / 10000)} suffix="만원" label="누적 가격 절감액, 협상 전 최초 견적 대비" delay={0} />
          <CountStat value={s.closedCases} suffix="건" label="완료한 구매 건" delay={90} />
          <CountStat value={deliveries ? Math.round((s.deliveriesOnTime / deliveries) * 100) : 0} suffix="%" label="납기 준수율" delay={180} />
          <CountStat value={Object.keys(state.learning.unlocked).length} suffix="개" label="관찰로 열린 구매 개념" delay={270} />
        </ul>
      </section>
    </Reveal>
  );
}

const MATERIAL_ORDER: MaterialId[] = ['flour', 'soyoil', 'sugar', 'chili', 'film'];

/** 공급업체 → 창고 → 생산 → 고객 자재 흐름 (2D) */
function MaterialFlow({ state }: { state: GameState }) {
  const last = state.history[state.history.length - 1];
  const inTransit = state.cases.filter((c) => c.stage === 'awaitDelivery').length;
  const rows = MATERIAL_ORDER.map((id) => {
    const m = state.materials[id];
    const usage = dailyUsage(state, id);
    const days = m.stock / Math.max(1, usage);
    const rop = reorderPoint(state, id);
    return { id, name: m.name, days, belowRop: m.stock + onOrderQty(state, id) < rop, ropDays: rop / usage };
  });
  const W = 760;
  const H = 260;
  const colX = [70, 300, 520, 690];
  const maxDays = 25;
  const barX = colX[1] - 98;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ minWidth: 560 }} role="img" aria-label="자재 흐름">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--text-3)" />
          </marker>
        </defs>
        <g>
          <rect x={colX[0] - 60} y={40} width={120} height={180} rx={10} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={colX[0]} y={30} textAnchor="middle" style={{ fill: 'var(--text-2)', fontWeight: 700, fontSize: 12 }}>
            공급업체 {state.suppliers.length}곳
          </text>
          {state.suppliers.slice(0, 9).map((s, i) => (
            <text key={s.id} x={colX[0]} y={62 + i * 18} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--text-2)' }}>
              {s.name}
            </text>
          ))}
        </g>
        <line x1={colX[0] + 64} y1={130} x2={colX[1] - 112} y2={130} stroke="var(--text-3)" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={(colX[0] + 64 + colX[1] - 112) / 2} y={121} textAnchor="middle">
          입고 대기
        </text>
        <text x={(colX[0] + 64 + colX[1] - 112) / 2} y={147} textAnchor="middle" style={{ fontWeight: 600, fill: 'var(--text-2)' }}>
          {inTransit}건
        </text>

        <g>
          <rect x={colX[1] - 108} y={40} width={216} height={180} rx={10} fill="var(--surface)" stroke="var(--border)" />
          <text x={colX[1]} y={30} textAnchor="middle" style={{ fill: 'var(--text-2)', fontWeight: 700, fontSize: 12 }}>
            원료 창고 (재고 일수)
          </text>
          {rows.map((r, i) => {
            const y = 58 + i * 32;
            const w = Math.min(1, r.days / maxDays) * 120;
            const ropX = barX + Math.min(1, r.ropDays / maxDays) * 120;
            const color = r.days < 3 ? 'var(--danger)' : r.belowRop ? 'var(--warn)' : 'var(--accent)';
            return (
              <g key={r.id}>
                <text x={barX} y={y + 4} style={{ fontSize: 11, fill: 'var(--text)' }}>
                  {r.name}
                </text>
                <rect x={barX} y={y + 9} width={120} height={7} rx={3} fill="var(--surface-2)" />
                <rect x={barX} y={y + 9} width={w} height={7} rx={3} fill={color} />
                <line x1={ropX} x2={ropX} y1={y + 6} y2={y + 19} stroke="var(--text-3)" strokeDasharray="2 2" />
                <text x={colX[1] + 98} y={y + 16} textAnchor="end" style={{ fontSize: 11, fill: color, fontWeight: 700 }}>
                  {r.days.toFixed(1)}일
                </text>
              </g>
            );
          })}
        </g>
        <line x1={colX[1] + 112} y1={130} x2={colX[2] - 64} y2={130} stroke="var(--text-3)" strokeWidth={1.5} markerEnd="url(#arrow)" />

        <g>
          <rect x={colX[2] - 60} y={85} width={120} height={90} rx={10} fill="var(--accent-soft)" stroke="var(--accent)" />
          <text x={colX[2]} y={110} textAnchor="middle" style={{ fill: 'var(--accent-text)', fontWeight: 700, fontSize: 12 }}>
            생산
          </text>
          <text x={colX[2]} y={132} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 15, fontWeight: 800 }}>
            {last ? last.produced.toLocaleString('ko-KR') : '-'}
          </text>
          <text x={colX[2]} y={152} textAnchor="middle">
            세트 / 수요 {last ? last.demand.toLocaleString('ko-KR') : '-'}
          </text>
        </g>
        <line x1={colX[2] + 64} y1={130} x2={colX[3] - 44} y2={130} stroke="var(--text-3)" strokeWidth={1.5} markerEnd="url(#arrow)" />

        <g>
          <rect x={colX[3] - 40} y={95} width={80} height={70} rx={10} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={colX[3]} y={122} textAnchor="middle" style={{ fill: 'var(--text-2)', fontWeight: 700, fontSize: 12 }}>
            고객
          </text>
          <text x={colX[3]} y={142} textAnchor="middle">
            {last ? `${wonShort(last.revenue)}원` : '-'}
          </text>
        </g>
        <text x={barX} y={H - 12} style={{ fontSize: 10 }}>
          점선 = 재주문점. 재고와 발주 진행분이 재주문점 아래로 내려가면 생산팀이 구매를 요청합니다.
        </text>
      </svg>
    </div>
  );
}

function deptStatus(state: GameState): Record<DeptId, { text: string; tone?: 'warn' | 'danger' | 'ok' }> {
  const last = state.history[state.history.length - 1];
  const open = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');
  const urgent = open.filter((c) => c.urgent).length;
  const awaiting = state.cases.filter((c) => c.stage === 'awaitDelivery');
  const lateSoon = awaiting.filter((c) => c.po && c.po.promisedDay <= state.day).length;
  const recentDefects = state.events.filter((e) => e.type === 'quality' && e.day >= state.day - 10).length;
  const payDue = state.finance.payables.filter((p) => p.day <= state.day + 5).reduce((a, p) => a + p.amount, 0);
  const budgetUse = state.finance.monthSpend / state.finance.monthlyBudget;
  const boost = state.market.demandBoostUntil >= state.day;
  return {
    mgmt: {
      text: `이번 달 구매 예산 ${pct(budgetUse, 0)} 사용 · 5일 내 지급 예정 ${wonShort(payDue)}원`,
      tone: budgetUse > 1 ? 'danger' : budgetUse > 0.85 ? 'warn' : undefined,
    },
    production: {
      text: last ? `어제 ${last.produced.toLocaleString('ko-KR')}세트 생산 (수요 ${last.demand.toLocaleString('ko-KR')})` : '가동 준비',
      tone: last && last.produced < Math.min(last.demand, state.company.capacityPerDay) ? 'danger' : undefined,
    },
    purchasing: {
      text: `진행 중 구매 ${open.length}건${urgent ? ` (긴급 ${urgent})` : ''} · 대기 업무 ${state.backlog.length}건`,
      tone: urgent ? 'warn' : undefined,
    },
    logistics: { text: `입고 대기 ${awaiting.length}건${lateSoon ? ` · 납기 도래 ${lateSoon}건` : ''}`, tone: lateSoon ? 'warn' : undefined },
    sales: { text: boost ? `판촉 진행 중 (수요 ×${state.market.demandBoost.toFixed(2)})` : '평상시 수요', tone: boost ? 'warn' : undefined },
    quality: { text: recentDefects ? `최근 10일 불량 이슈 ${recentDefects}건` : '최근 불량 이슈 없음', tone: recentDefects ? 'warn' : 'ok' },
  };
}


export function Overview() {
  const { state, openCase } = useStore();
  const last = state.history[state.history.length - 1];
  const s = state.stats;
  const recent = state.history.slice(-80);
  const labels = recent.map((h) => formatDayShort(state.startDate, h.day));
  const status = useMemo(() => deptStatus(state), [state]);
  const yesterdayEvents = state.events.filter((e) => e.day === state.day - 1).slice().reverse();
  const tool = activeTool(state, 'quote-compare');
  const deliveries = s.deliveriesOnTime + s.deliveriesLate;
  const open = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled').length;
  const last20 = state.history.slice(-20);
  const rev20 = last20.reduce((a, h) => a + h.revenue, 0);
  const opm = rev20 > 0 ? last20.reduce((a, h) => a + (h.opProfit ?? 0), 0) / rev20 : null;

  return (
    <>
      <Hero />
      <LoopBand />
      <StatsPanel />

      <div className="grid grid-6">
        <Stat label="현금" value={`${wonShort(state.finance.cash)}원`} note="매출채권 회수와 대금 지급 반영" />
        <Stat label="원료 재고자산" value={`${wonShort(last?.inventoryValue ?? 0)}원`} note="이동평균 단가 기준" />
        <Stat
          label="영업이익률"
          value={opm === null ? '-' : `${(opm * 100).toFixed(1)}%`}
          note="최근 20영업일, 식품 상장사 평균 4.5~6.3%"
          tone={opm !== null && opm < 0 ? 'danger' : undefined}
        />
        <Stat label="진행 중 구매" value={`${open}건`} note={`완료 ${s.closedCases}건`} />
        <Stat label="납기 준수율" value={deliveries ? pct(s.deliveriesOnTime / deliveries, 0) : '-'} note={`입고 ${deliveries}건`} />
        <Stat label="결품 발생일" value={`${s.stockoutDays}일`} tone={s.stockoutDays > 0 ? 'danger' : undefined} note="원료 부족으로 생산 차질" />
      </div>

      <Card title="자재 흐름" sub={last ? `${formatDay(state.startDate, last.day)} 기준` : '첫 근무일이 지나면 흐름이 표시됩니다'}>
        <MaterialFlow state={state} />
      </Card>

      <div className="grid grid-3">
        {(Object.keys(DEPT_NAMES) as DeptId[]).map((d) => (
          <div key={d} className="card" style={{ padding: '12px 14px', borderLeft: `3px solid ${d === 'purchasing' ? 'var(--accent)' : 'var(--border)'}` }}>
            <div className="row between">
              <h4>{DEPT_NAMES[d]}</h4>
              {d === 'purchasing' && <span className="badge badge-accent">관찰 대상</span>}
              {status[d].tone === 'danger' && <span className="badge badge-danger">주의</span>}
              {status[d].tone === 'warn' && <span className="badge badge-warn">확인</span>}
            </div>
            <div style={{ marginTop: 4, fontSize: 13 }}>{status[d].text}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <Card title="현금 흐름" sub="최근 80영업일">
          <LineChart labels={labels} series={[{ name: '현금', color: 'var(--series-1)', values: recent.map((h) => h.cash) }]} format={(v) => wonShort(v)} />
        </Card>
        <Card
          title="어제 있었던 일"
          sub={state.day > 1 ? formatDay(state.startDate, state.day - 1) : ''}
          actions={tool ? <span className="badge badge-accent">견적 비교 도구 v{tool.version} 적용 중</span> : null}
        >
          {yesterdayEvents.length === 0 ? (
            <div className="empty">{state.day === 1 ? '아직 하루도 진행하지 않았습니다.' : '특별한 사건 없이 지나갔습니다.'}</div>
          ) : (
            <div className="list" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {yesterdayEvents.map((e) => (
                <div key={e.id} className="list-item" style={{ cursor: e.caseId ? 'pointer' : undefined }} onClick={() => e.caseId && openCase(e.caseId)}>
                  <div className="row">
                    <EventBadge type={e.type} />
                    <b style={{ fontSize: 13 }}>{e.title}</b>
                  </div>
                  <div className="faint" style={{ marginTop: 2 }}>
                    {e.detail}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
