import { useMemo, useState } from 'react';
import type { DeptId, EventType, SkillId } from '../../sim/types';
import { DEPT_NAMES, formatDay, formatDayShort, num, wonShort } from '../../sim/util';
import { getTool } from '../../tools/registry';
import { BarList, LineChart } from '../components/Chart';
import { Card, DeptBadge, EVENT_TYPE_LABELS, EventBadge, PageHead, Stat, pct } from '../components/Common';
import { useStore } from '../store';

const SKILL_NAMES: Record<SkillId, string> = { market: '시장조사', costing: '원가분석', negotiation: '협상', docs: '문서·데이터 처리' };
const PAGE = 50;

export function Performance() {
  const { state, openCase } = useStore();
  const st = state.stats;
  const [dept, setDept] = useState<DeptId | 'all'>('all');
  const [type, setType] = useState<EventType | 'all'>('all');
  const [shown, setShown] = useState(PAGE);

  const closed = useMemo(() => state.cases.filter((c) => c.stage === 'done' && c.savings).reverse(), [state.cases]);

  const kpi = useMemo(() => {
    let saving = 0;
    let base = 0;
    for (const c of closed) {
      saving += c.savings!.priceSavingKRW;
      base += c.savings!.baselinePrice * c.savings!.qty;
    }
    const deliveries = st.deliveriesOnTime + st.deliveriesLate;
    const received = Object.values(st.receivedQtyByMaterial).reduce((a, b) => a + b, 0);
    return {
      savingRate: base > 0 ? saving / base : null,
      onTime: deliveries > 0 ? st.deliveriesOnTime / deliveries : null,
      defect: received > 0 ? st.defectQty / received : null,
      cycle: st.closedCases > 0 ? st.cycleDaysSum / st.closedCases : null,
    };
  }, [closed, st]);

  const labels = useMemo(() => state.history.map((h) => formatDayShort(state.startDate, h.day)), [state.history, state.startDate]);

  const markers = useMemo(() => {
    const out: { index: number; label: string }[] = [];
    for (const t of state.tools) {
      const idx = state.history.findIndex((h) => h.day >= t.appliedDay);
      if (idx >= 0) out.push({ index: idx, label: `도구 v${t.version} 적용` });
      if (t.removedDay !== undefined) {
        const r = state.history.findIndex((h) => h.day >= t.removedDay!);
        if (r >= 0) out.push({ index: r, label: '해제' });
      }
    }
    return out;
  }, [state.tools, state.history]);

  const savingsSeries = useMemo(
    () => [
      { name: '누적 가격 절감액', color: 'var(--series-1)', values: state.history.map((h) => h.priceSavingCum) },
      { name: '누적 선택 손실', color: 'var(--series-2)', values: state.history.map((h) => h.selectionLossCum), dashed: true },
    ],
    [state.history],
  );
  const cashSeries = useMemo(
    () => [
      { name: '현금', color: 'var(--series-1)', values: state.history.map((h) => h.cash) },
      { name: '재고자산', color: 'var(--series-3)', values: state.history.map((h) => h.inventoryValue) },
    ],
    [state.history],
  );
  const prodSeries = useMemo(
    () => [
      { name: '수요', color: 'var(--series-4)', values: state.history.map((h) => h.demand), dashed: true },
      { name: '생산', color: 'var(--series-1)', values: state.history.map((h) => h.produced) },
    ],
    [state.history],
  );

  const events = useMemo(
    () =>
      state.events
        .filter((e) => (dept === 'all' || e.dept === dept) && (type === 'all' || e.type === type))
        .slice()
        .reverse(),
    [state.events, dept, type],
  );

  const supName = (id: string) => state.suppliers.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <PageHead title="성과·타임라인" desc="구매 성과와 기업·직원·도구의 변화를 시간 순서로 돌아봅니다." />

      <div className="grid grid-4">
        <Stat label="누적 가격 절감액" value={wonShort(st.priceSavingKRW)} note={`완료 ${st.closedCases}건 기준`} tone="ok" />
        <Stat label="평균 절감률" value={kpi.savingRate === null ? '-' : pct(kpi.savingRate)} note="절감액 ÷ (기준가격 × 입고 수량)" />
        <Stat
          label="납기 준수율"
          value={kpi.onTime === null ? '-' : pct(kpi.onTime, 0)}
          note={`정시 ${st.deliveriesOnTime} · 지연 ${st.deliveriesLate}`}
          tone={kpi.onTime !== null && kpi.onTime < 0.85 ? 'warn' : undefined}
        />
        <Stat label="입고 불량률" value={kpi.defect === null ? '-' : pct(kpi.defect)} tone={kpi.defect !== null && kpi.defect > 0.02 ? 'warn' : undefined} />
        <Stat label="결품일수" value={`${st.stockoutDays}일`} tone={st.stockoutDays > 0 ? 'danger' : undefined} note="원료 부족으로 생산 차질" />
        <Stat label="평균 구매 리드타임" value={kpi.cycle === null ? '-' : `${kpi.cycle.toFixed(1)}일`} note="구매요청 → 정산 완료" />
        <Stat label="견적 오입력" value={`${st.entryErrors}건`} note={`견적서 ${st.quotesProcessed}건 처리`} tone={st.entryErrors > 0 ? 'warn' : undefined} />
        <Stat label="정산 불일치" value={`${st.invoiceMismatches}건`} note="발주 단가 ≠ 청구 단가" tone={st.invoiceMismatches > 0 ? 'warn' : undefined} />
      </div>

      <div className="notice">
        절감액 기준: 기준가격은 선정 업체의 협상 전 최초 견적 단가이고, 절감액 = (기준가격 − 최종 단가) × 입고 수량입니다. 시장가격 변동분은 따로 기록합니다. 전년 단가와 단순 비교하면 시장
        하락이나 환율 변화를 구매 성과로 잘못 계산할 수 있기 때문입니다.
      </div>

      <Card title="누적 절감액" sub="점선: 견적 오입력으로 잘못 고른 업체 때문에 더 쓴 금액">
        <LineChart series={savingsSeries} labels={labels} format={wonShort} zeroBased markers={markers} />
      </Card>

      <Card title="구매 건별 절감 내역" sub={`완료 ${closed.length}건 · 행을 누르면 상세`}>
        {closed.length === 0 ? (
          <div className="empty">아직 완료된 구매 건이 없습니다.</div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>구매 건</th>
                  <th>원료</th>
                  <th>업체</th>
                  <th className="r">기준가</th>
                  <th className="r">최종가</th>
                  <th className="r">입고 수량</th>
                  <th className="r">절감액</th>
                  <th className="r" title="(정산일 시장가 − 시장조사 시점 시장가) × 수량. 양수면 시장 상승. 구매 성과와 무관해 절감액과 분리">시장 변동분(+상승)</th>
                  <th>비교 방식</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((c) => {
                  const sv = c.savings!;
                  const m = state.materials[c.materialId];
                  return (
                    <tr key={c.id} className="clickable" onClick={() => openCase(c.id)} title={sv.formula}>
                      <td className="mono">{c.id}</td>
                      <td>{m.name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.po ? supName(c.po.supplierId) : '-'}</td>
                      <td className="r">{num(sv.baselinePrice)}</td>
                      <td className="r">{num(sv.finalPrice)}</td>
                      <td className="r">
                        {num(sv.qty)}
                        {m.unit}
                      </td>
                      <td className="r" style={{ color: 'var(--ok)', fontWeight: 600 }}>
                        {wonShort(sv.priceSavingKRW)}
                      </td>
                      <td className="r faint">{sv.marketMoveKRW > 0 ? "+" : ""}{wonShort(sv.marketMoveKRW)}</td>
                      <td>
                        {c.comparison?.method === 'tool' ? (
                          <span className="badge badge-accent">도구 v{c.comparison.toolVersion}</span>
                        ) : (
                          <span className="badge">수작업</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="현금과 재고자산" sub="매출 대금은 출고 후 회수일에, 구매 대금은 결제일에 현금이 움직입니다">
          <LineChart series={cashSeries} labels={labels} format={wonShort} />
        </Card>
        <Card title="수요와 생산" sub="세트/일 · 생산이 수요보다 낮은 날은 결품 또는 설비 한계">
          <LineChart series={prodSeries} labels={labels} format={(v) => num(v)} zeroBased />
        </Card>
      </div>

      <Card
        title="이벤트 타임라인"
        sub={`${events.length}건`}
        actions={
          <>
            <select
              value={dept}
              onChange={(e) => {
                setDept(e.target.value as DeptId | 'all');
                setShown(PAGE);
              }}
              aria-label="부서"
            >
              <option value="all">전체 부서</option>
              {(Object.keys(DEPT_NAMES) as DeptId[]).map((d) => (
                <option key={d} value={d}>
                  {DEPT_NAMES[d]}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as EventType | 'all');
                setShown(PAGE);
              }}
              aria-label="유형"
            >
              <option value="all">전체 유형</option>
              {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </>
        }
      >
        {events.length === 0 ? (
          <div className="empty">조건에 맞는 이벤트가 없습니다.</div>
        ) : (
          <div className="list">
            {events.slice(0, shown).map((e) => (
              <div
                key={e.id}
                className="list-item"
                style={{ cursor: e.caseId ? 'pointer' : undefined }}
                onClick={e.caseId ? () => openCase(e.caseId!) : undefined}
              >
                <div className="row" style={{ gap: 6 }}>
                  <span className="faint num" style={{ minWidth: 92 }}>
                    {formatDay(state.startDate, e.day)}
                  </span>
                  <EventBadge type={e.type} />
                  <DeptBadge dept={e.dept} />
                  <strong style={{ fontSize: 13 }}>{e.title}</strong>
                  {e.caseId && <span className="faint mono">{e.caseId}</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {e.detail}
                </div>
              </div>
            ))}
          </div>
        )}
        {events.length > shown && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => setShown((s) => s + PAGE)}>
              더 보기 ({events.length - shown}건 남음)
            </button>
          </div>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title={`직원 성장 · ${state.employee.name} ${state.employee.rank}`} sub={`경험치 ${Math.round(state.employee.xp)} · 완료 ${state.employee.completedCases}건`}>
          <BarList
            items={(Object.keys(SKILL_NAMES) as SkillId[]).map((k) => ({ label: SKILL_NAMES[k], value: state.employee.skills[k] }))}
            format={(v) => v.toFixed(1)}
            max={100}
          />
          <h4 style={{ margin: '16px 0 6px' }}>경력 이정표</h4>
          <div className="list">
            {state.employee.milestones
              .slice()
              .reverse()
              .map((ms, i) => (
                <div key={i} className="list-item row" style={{ gap: 10 }}>
                  <span className="faint num" style={{ minWidth: 92 }}>
                    {formatDay(state.startDate, ms.day)}
                  </span>
                  <span>{ms.text}</span>
                </div>
              ))}
          </div>
        </Card>
        <Card title="도구 적용 이력">
          {state.tools.length === 0 ? (
            <div className="empty">아직 적용한 도구가 없습니다. AI Tool Lab에서 도구를 적용할 수 있습니다.</div>
          ) : (
            <div className="list">
              {state.tools
                .slice()
                .reverse()
                .map((t, i) => (
                  <div key={i} className="list-item">
                    <div className="row between">
                      <strong style={{ fontSize: 13 }}>{getTool(t.toolId)?.name ?? t.toolId}</strong>
                      <span className={`badge ${t.removedDay === undefined ? 'badge-accent' : ''}`}>
                        v{t.version} · {t.removedDay === undefined ? '적용 중' : '해제됨'}
                      </span>
                    </div>
                    <div className="faint">
                      {formatDay(state.startDate, t.appliedDay)} 적용
                      {t.removedDay !== undefined ? ` → ${formatDay(state.startDate, t.removedDay)} 해제` : ''}
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
