import { useMemo } from 'react';
import { activeTool } from '../../sim/compare';
import { dailyUsage } from '../../sim/market';
import { onOrderQty, reorderPoint } from '../../sim/operations';
import type { DeptId, GameState, MaterialId } from '../../sim/types';
import { DEPT_NAMES, formatDay, formatDayShort, wonShort } from '../../sim/util';
import { LineChart } from '../components/Chart';
import { Card, EventBadge, PageHead, pct, Stat } from '../components/Common';
import { useStore } from '../store';

function Intro() {
  const { advance, setScreen } = useStore();
  return (
    <Card title="처음 오셨나요?">
      <div className="stack" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>
          가상의 식품 제조기업 <b>가온식품</b>이 매일 운영되고, 구매팀 <b>서지우 사원</b>이 실제 구매 업무를 처리합니다. 여러분은 그 과정을
          어깨너머로 관찰하면서 구매 업무를 배우고, 비효율을 찾아 개선 도구를 업무에 붙여 봅니다.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }} className="muted">
          <li>
            상단의 <b>하루 진행</b>을 누르면 하루가 지나갑니다. 시장가격이 움직이고 생산팀이 원료를 쓰고, 재고가 줄면 구매 요청이 옵니다.
          </li>
          <li>
            <b>직원 업무</b>에서 담당자의 하루 일정, 메일, 견적서를 봅니다. <b>프로세스 맵</b>에서 구매 건이 어느 단계에 있는지 봅니다.
          </li>
          <li>
            업무를 처음 관찰할 때마다 <b>학습 노트</b>에 개념 카드가 열립니다.
          </li>
          <li>
            <b>AI Tool Lab</b>에서 견적 비교 도구를 업무에 적용하고, 도구가 없을 때와 비교해 효과를 검증합니다.
          </li>
        </ol>
        <div className="row">
          <button className="btn btn-primary" onClick={() => advance(1)}>
            첫날 시작하기
          </button>
          <button className="btn" onClick={() => setScreen('desk')}>
            담당자 소개 보기
          </button>
        </div>
      </div>
    </Card>
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
        <text x={(colX[0] + colX[1]) / 2 - 22} y={122} textAnchor="middle">
          입고 대기 {inTransit}건
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

  return (
    <>
      <PageHead
        title="기업 현황"
        desc={`${state.company.industry} · 주력 제품 ${state.company.product} · 일 생산능력 ${state.company.capacityPerDay.toLocaleString('ko-KR')}세트`}
      />
      {state.day === 1 && <Intro />}

      <div className="grid grid-6">
        <Stat label="현금" value={`${wonShort(state.finance.cash)}원`} note="매출채권 회수·대금 지급 반영" />
        <Stat label="원료 재고자산" value={`${wonShort(last?.inventoryValue ?? 0)}원`} note="이동평균 단가 기준" />
        <Stat label="누적 가격 절감액" value={`${wonShort(s.priceSavingKRW)}원`} note="협상 전 최초 견적 대비" tone={s.priceSavingKRW > 0 ? 'ok' : undefined} />
        <Stat label="진행 중 구매" value={`${open}건`} note={`완료 ${s.closedCases}건`} />
        <Stat label="납기 준수율" value={deliveries ? pct(s.deliveriesOnTime / deliveries, 0) : '-'} note={`입고 ${deliveries}건`} />
        <Stat label="결품 발생일" value={`${s.stockoutDays}일`} tone={s.stockoutDays > 0 ? 'danger' : undefined} note="원료 부족으로 생산 차질" />
      </div>

      <Card title="자재 흐름" sub={last ? `${formatDay(state.startDate, last.day)} 기준` : '하루를 진행하면 흐름이 표시됩니다'}>
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
