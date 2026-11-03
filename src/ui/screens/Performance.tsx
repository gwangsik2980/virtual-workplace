import { useMemo, useState } from 'react';
import type { DeptId, EventType, SkillId } from '../../sim/types';
import { DEPT_NAMES, formatDay, formatDayShort, num, wonShort } from '../../sim/util';
import { getTool } from '../../tools/registry';
import { BarList, LineChart } from '../components/Chart';
import { Card, DeptBadge, EVENT_TYPE_LABELS, EventBadge, pct } from '../components/Common';
import { HeroFacts, InkStats, RowList, ScreenHero, SectionHead } from '../components/Editorial';
import { Reveal } from '../motion';
import { useStore } from '../store';
import './perf.css';

const SKILL_NAMES: Record<SkillId, string> = { market: '시장조사', costing: '원가분석', negotiation: '협상', docs: '문서·데이터 처리' };
const PAGE = 30;
const CASE_PAGE = 12;

const DOT: Partial<Record<EventType, string>> = {
  stockout: 'var(--danger)',
  delay: 'var(--accent)',
  quality: 'var(--accent)',
  finance: 'var(--accent)',
  tool: 'var(--foreground)',
  career: 'var(--ok)',
  payroll: 'var(--ok)',
};

export function Performance() {
  const { state, openCase } = useStore();
  const st = state.stats;
  const [dept, setDept] = useState<DeptId | 'all'>('all');
  const [type, setType] = useState<EventType | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const [casesShown, setCasesShown] = useState(CASE_PAGE);

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
      { name: '재고자산', color: 'var(--series-2)', values: state.history.map((h) => h.inventoryValue) },
    ],
    [state.history],
  );
  const prodSeries = useMemo(
    () => [
      { name: '수요', color: 'var(--series-2)', values: state.history.map((h) => h.demand), dashed: true },
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
  const deliveries = st.deliveriesOnTime + st.deliveriesLate;

  return (
    <>
      <ScreenHero
        eyebrow="07 — Results"
        lines={['숫자로 보는', '구매 성과']}
        watermark="RESULTS"
        lead="절감액은 선정 업체가 협상 전에 처음 낸 견적을 기준으로 계산합니다. 시장가격이 움직인 몫은 따로 떼어 기록해 구매 활동의 성과와 섞이지 않게 했습니다."
        aside={
          <HeroFacts
            items={[
              { label: '평균 절감률', value: kpi.savingRate === null ? '-' : pct(kpi.savingRate), note: '절감액 ÷ 기준 금액' },
              {
                label: '납기 준수율',
                value: kpi.onTime === null ? '-' : pct(kpi.onTime, 0),
                note: deliveries ? `정시 ${st.deliveriesOnTime}건, 지연 ${st.deliveriesLate}건` : '입고 전',
              },
              { label: '결품일', value: `${st.stockoutDays}일`, note: '원료 부족으로 생산 차질' },
              { label: '평균 리드타임', value: kpi.cycle === null ? '-' : `${kpi.cycle.toFixed(1)}일`, note: '구매요청부터 정산까지' },
            ]}
          />
        }
        footer={
          <>
            <span>완료 {st.closedCases}건 기준</span>
            <span>입고 불량률 {kpi.defect === null ? '-' : pct(kpi.defect)}</span>
          </>
        }
      />

      <InkStats
        eyebrow="Savings"
        title="아낀 돈과 그 과정의 실수"
        items={[
          { value: Math.round(st.priceSavingKRW / 10000), suffix: '만원', label: '누적 가격 절감액' },
          { value: st.closedCases, suffix: '건', label: '완료한 구매 건' },
          { value: st.entryErrors, suffix: '건', label: `견적 오입력, 견적서 ${st.quotesProcessed}건 중` },
          { value: st.invoiceMismatches, suffix: '건', label: '정산 불일치, 발주 단가와 청구 단가가 다름' },
        ]}
      >
        <div className="ink-chart ink-chart-grid">
          <div>
            <div className="ink-chart-head">
              <h3>누적 절감액 추이</h3>
            </div>
            <LineChart series={savingsSeries} labels={labels} format={wonShort} zeroBased markers={markers} height={220} />
          </div>
          <div className="ink-chart-side">
            <p>점선은 견적 오입력 때문에 잘못 고른 업체에 더 낸 금액입니다. 도구를 적용한 날은 세로선으로 표시됩니다.</p>
            <p className="ink-note">
              <b>절감액 = (기준가격 − 최종 단가) × 입고 수량.</b> 기준가격은 선정 업체의 협상 전 최초 견적 단가입니다. 전년 단가와 단순 비교하면 시장 하락이나
              환율 변화까지 구매 성과로 잘못 계산할 수 있어서 이렇게 정했습니다.
            </p>
          </div>
        </div>
      </InkStats>

      <SectionHead
        eyebrow="Losses"
        title="손해 본 돈"
        desc="절감액과 반대로 회사가 잃은 돈입니다. 반품 처리비와 폐기 손실은 영업이익에서 바로 빠지고, 웃돈과 단가 인상은 원료 원가를 올려 이익을 줄입니다."
      />
      <RowList
        items={[
          {
            key: 'scrap',
            title: '생산 중 불량 폐기',
            desc: `검수를 통과한 원료에서 생산 중 불량이 나와 버린 금액. ${st.qualityIncidents ?? 0}건, 클레임으로 ${wonShort(st.claimRecoveredKRW ?? 0)}원 돌려받음`,
            meta: `−${wonShort(Math.max(0, (st.scrapKRW ?? 0) - (st.claimRecoveredKRW ?? 0)))}원`,
          },
          {
            key: 'return',
            title: '불량 반품 처리비',
            desc: `입고 검수 불량을 반품하면서 회사가 떠안은 운송 대기·재검사 비용. 불량 ${num(st.defectQty)}단위`,
            meta: `−${wonShort(st.defectHandlingKRW ?? 0)}원`,
          },
          {
            key: 'spot',
            title: '긴급 현물 구매 웃돈',
            desc: `결품 직전 시세보다 비싸게 산 차액. ${st.spotBuys ?? 0}번 샀고, 못 구한 날 ${st.spotFailures ?? 0}일`,
            meta: `−${wonShort(st.spotPremiumKRW ?? 0)}원`,
          },
          {
            key: 'up',
            title: '업체 단가 인상',
            desc: `시세 상승기 견적 뒤 인상 요구 ${st.priceIncreaseCases ?? 0}건. 연초 단가 인상 합의 ${st.annualIncreases ?? 0}건${
              st.annualIncreases ? `, 평균 ${(((st.annualIncreaseRateSum ?? 0) / st.annualIncreases) * 100).toFixed(1)}%` : ''
            } (이후 견적에 계속 반영)`,
            meta: `−${wonShort(st.priceIncreaseKRW ?? 0)}원`,
          },
          {
            key: 'stockout',
            title: '결품',
            desc: '원료가 모자라 계획보다 덜 만든 날. 못 판 매출은 이익에서 그대로 빠집니다',
            meta: `${st.stockoutDays}일`,
          },
        ]}
      />

      <SectionHead eyebrow="Cases" title="구매 건별 절감 내역" desc={`완료 ${closed.length}건, 최근 것부터 보여 줍니다. 누르면 견적부터 정산까지의 기록이 열립니다.`} />
      <RowList
        empty="아직 완료된 구매 건이 없습니다. 근무일이 지나면 쌓입니다."
        items={closed.slice(0, casesShown).map((c) => {
          const sv = c.savings!;
          const m = state.materials[c.materialId];
          return {
            key: c.id,
            index: String(Number(c.id.replace('PR-', ''))),
            title: (
              <>
                {m.name}
                <span className="row-sub">{c.po ? supName(c.po.supplierId) : '-'}</span>
              </>
            ),
            desc: (
              <>
                {num(sv.baselinePrice)}원 → {num(sv.finalPrice)}원/{m.unit}, {num(sv.qty)}
                {m.unit} 입고
                <br />
                <span className="faint">
                  시장 변동분 {sv.marketMoveKRW > 0 ? '+' : ''}
                  {wonShort(sv.marketMoveKRW)}원 (절감액과 별도)
                </span>
              </>
            ),
            meta: (
              <>
                <span className={sv.priceSavingKRW >= 0 ? 'saving-pos' : 'saving-neg'}>{wonShort(sv.priceSavingKRW)}원</span>
                {c.comparison?.method === 'tool' ? <span className="badge badge-accent">도구 v{c.comparison.toolVersion}</span> : <span className="badge">수작업</span>}
              </>
            ),
            onClick: () => openCase(c.id),
          };
        })}
      />
      {closed.length > casesShown && (
        <div className="more-row">
          <button className="pill pill-sm" onClick={() => setCasesShown((n) => n + CASE_PAGE)}>
            더 보기 ({closed.length - casesShown}건 남음)
          </button>
        </div>
      )}

      <SectionHead eyebrow="Company" title="돈과 생산의 흐름" />
      <div className="perf-cols">
        <Reveal>
          <Card title="현금과 재고자산" sub="매출 대금은 회수일에, 구매 대금은 결제일에 움직입니다">
            <LineChart series={cashSeries} labels={labels} format={wonShort} />
          </Card>
        </Reveal>
        <Reveal delay={90}>
          <Card title="수요와 생산" sub="세트/일. 생산이 수요보다 낮으면 결품이나 설비 한계">
            <LineChart series={prodSeries} labels={labels} format={(v) => num(v)} zeroBased />
          </Card>
        </Reveal>
      </div>

      <SectionHead eyebrow="Timeline" title="그동안 있었던 일" desc={`조건에 맞는 이벤트 ${events.length}건`} />
      <Card className="card-lg">
        <div className="stack" style={{ gap: '0.625rem', marginBottom: '1rem' }}>
          <div className="chip-row" role="group" aria-label="부서">
            {(['all', ...Object.keys(DEPT_NAMES)] as (DeptId | 'all')[]).map((d) => (
              <button
                key={d}
                className={`chip-toggle ${dept === d ? 'on' : ''}`}
                aria-pressed={dept === d}
                onClick={() => {
                  setDept(d);
                  setShown(PAGE);
                }}
              >
                {d === 'all' ? '전체 부서' : DEPT_NAMES[d]}
              </button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="유형">
            {(['all', ...Object.keys(EVENT_TYPE_LABELS)] as (EventType | 'all')[]).map((t) => (
              <button
                key={t}
                className={`chip-toggle ${type === t ? 'on' : ''}`}
                aria-pressed={type === t}
                onClick={() => {
                  setType(t);
                  setShown(PAGE);
                }}
              >
                {t === 'all' ? '전체 유형' : EVENT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        {events.length === 0 ? (
          <div className="empty">조건에 맞는 이벤트가 없습니다.</div>
        ) : (
          <ul className="timeline-list">
            {events.slice(0, shown).map((e) => (
              <li
                key={e.id}
                className={`tl-item ${e.caseId ? 'clickable' : ''}`}
                onClick={e.caseId ? () => openCase(e.caseId!) : undefined}
                style={{ ['--tl-dot' as string]: DOT[e.type] }}
              >
                <span className="tl-date">{formatDay(state.startDate, e.day)}</span>
                <div className="tl-body">
                  <div className="tl-head">
                    <EventBadge type={e.type} />
                    <DeptBadge dept={e.dept} />
                    <span className="tl-title">{e.title}</span>
                    {e.caseId && <span className="tl-case">{e.caseId}</span>}
                  </div>
                  <div className="tl-detail">{e.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {events.length > shown && (
          <div className="more-row">
            <button className="pill pill-sm" onClick={() => setShown((s) => s + PAGE)}>
              더 보기 ({events.length - shown}건 남음)
            </button>
          </div>
        )}
      </Card>

      <SectionHead eyebrow="Growth" title="사람과 도구의 변화" />
      <div className="perf-cols">
        <Reveal>
          <Card title={`${state.employee.name} ${state.employee.rank}`} sub={`경험치 ${Math.round(state.employee.xp)}, 완료 ${state.employee.completedCases}건`}>
            <BarList
              items={(Object.keys(SKILL_NAMES) as SkillId[]).map((k) => ({ label: SKILL_NAMES[k], value: state.employee.skills[k] }))}
              format={(v) => v.toFixed(1)}
              max={100}
            />
            <ul className="milestones">
              {state.employee.milestones
                .slice()
                .reverse()
                .map((ms, i) => (
                  <li key={i}>
                    <span>{formatDay(state.startDate, ms.day)}</span>
                    <span>{ms.text}</span>
                  </li>
                ))}
            </ul>
          </Card>
        </Reveal>
        <Reveal delay={90}>
          <Card title="도구 적용 이력">
            {state.tools.length === 0 ? (
              <div className="empty">아직 적용한 도구가 없습니다. AI Tool Lab에서 도구를 업무에 붙일 수 있습니다.</div>
            ) : (
              <ul className="tool-hist">
                {state.tools
                  .slice()
                  .reverse()
                  .map((t, i) => (
                    <li key={i}>
                      <div className="row between">
                        <strong style={{ fontSize: '0.875rem' }}>{getTool(t.toolId)?.name ?? t.toolId}</strong>
                        <span className={`badge ${t.removedDay === undefined ? 'badge-accent' : ''}`}>
                          v{t.version} {t.removedDay === undefined ? '적용 중' : '해제됨'}
                        </span>
                      </div>
                      <div className="faint" style={{ marginTop: '0.25rem' }}>
                        {formatDay(state.startDate, t.appliedDay)} 적용
                        {t.removedDay !== undefined ? `, ${formatDay(state.startDate, t.removedDay)} 해제` : ''}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>
    </>
  );
}
