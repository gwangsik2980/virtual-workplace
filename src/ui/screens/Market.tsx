import { useMemo, useState } from 'react';
import { dailyUsage } from '../../sim/market';
import { onOrderQty, reorderPoint } from '../../sim/operations';
import type { MaterialId, QuoteFormat, SupplierCandidate } from '../../sim/types';
import { formatDay, formatDayShort, num, won, wonShort } from '../../sim/util';
import { LineChart } from '../components/Chart';
import { Card, CaseStatus, pct } from '../components/Common';
import { HeroFacts, RowList, ScreenHero, SectionHead } from '../components/Editorial';
import { Reveal } from '../motion';
import { useStore } from '../store';
import './perf.css';

const FORMAT_LABELS: Record<QuoteFormat, string> = {
  A: '국문 표준',
  B: '영문, USD',
  C: '포장단위, VAT 포함',
  D: '불규칙, 스캔본',
};

const CANDIDATE_STATUS: Record<SupplierCandidate['status'], string> = {
  searching: '탐색 중',
  sampling: '샘플 시험 중',
  registering: '등록 진행 중',
  approved: '등록 완료',
  rejected: '샘플 불합격',
};

export function Market() {
  const { state, openCase } = useStore();
  const ids = Object.keys(state.materials) as MaterialId[];
  const [sel, setSel] = useState<MaterialId>('flour');
  const m = state.materials[sel];

  const labels = useMemo(() => state.history.map((h) => formatDayShort(state.startDate, h.day)), [state.history, state.startDate]);
  const priceSeries = useMemo(
    () => [{ name: `${m.name} 시세`, color: 'var(--series-1)', values: state.history.map((h) => h.prices[sel]) }],
    [state.history, sel, m.name],
  );
  const fxSeries = useMemo(() => [{ name: 'USD/KRW', color: 'var(--series-2)', values: state.history.map((h) => h.fx) }], [state.history]);

  const usage = dailyUsage(state, sel);
  const rop = reorderPoint(state, sel);
  const onOrder = onOrderQty(state, sel);
  const cover = m.stock / Math.max(1, usage);
  const market = state.market.prices[sel];
  const change = useMemo(() => {
    const first = state.history[0]?.prices[sel] ?? m.baseMarketPrice;
    return market / first - 1;
  }, [state.history, sel, market, m.baseMarketPrice]);

  const recent = useMemo(
    () =>
      state.cases
        .filter((c) => c.materialId === sel && c.cost)
        .slice(-10)
        .reverse(),
    [state.cases, sel],
  );

  const supplierRows = useMemo(
    () =>
      state.suppliers.map((s) => {
        const h = s.history;
        const deliveries = h.onTime + h.late;
        return {
          s,
          onTime: deliveries > 0 ? h.onTime / deliveries : null,
          defect: h.receivedQty > 0 ? h.defectQty / h.receivedQty : null,
        };
      }),
    [state.suppliers],
  );

  const coverRows = ids.map((id) => {
    const mm = state.materials[id];
    const u = Math.max(1, dailyUsage(state, id));
    return { id, name: mm.name, days: mm.stock / u, ropDays: reorderPoint(state, id) / u };
  });
  const coverMax = Math.max(20, ...coverRows.map((r) => Math.max(r.days, r.ropDays)));

  const callouts: { title: string; sub: string }[] = [];
  if (state.market.demandBoost > 1) {
    callouts.push({
      title: `판촉으로 수요 +${Math.round((state.market.demandBoost - 1) * 100)}%`,
      sub: `${formatDay(state.startDate, state.market.demandBoostUntil)}까지 원료 사용량이 늘어납니다`,
    });
  }
  for (const s of state.market.shocks) {
    callouts.push({
      title: `${state.materials[s.materialId].name} 시세 ${s.drift > 0 ? '상승세' : '하락세'}`,
      sub: `하루 ${s.drift > 0 ? '+' : ''}${pct(s.drift, 2)}, ${formatDay(state.startDate, s.until)}까지 (가상 시황)`,
    });
  }

  return (
    <>
      <ScreenHero
        eyebrow="04 — Market"
        lines={['시세와 원가,', '업체 실적']}
        watermark="MARKET"
        lead="담당자가 구매를 판단할 때 근거로 삼는 시세, 원가, 공급업체 실적입니다. 원료를 고르면 오른쪽 숫자가 바뀝니다."
        aside={
          <>
            <div className="chip-row hero-chips" role="group" aria-label="원료 선택">
              {ids.map((id) => (
                <button key={id} className={`chip-toggle ${id === sel ? 'on' : ''}`} aria-pressed={id === sel} onClick={() => setSel(id)}>
                  {state.materials[id].name}
                </button>
              ))}
            </div>
            <HeroFacts
              items={[
                { label: '오늘 시세', value: `${won(market)}`, note: `${m.unit}당, 시작 대비 ${change >= 0 ? '+' : ''}${pct(change)}` },
                { label: '재고 일수', value: `${cover.toFixed(1)}일`, note: `${num(m.stock)}${m.unit} 보유` },
                { label: '재주문점', value: `${num(rop)}`, note: `${m.unit}, 하루 ${num(usage)}${m.unit} 사용` },
                { label: '발주 진행량', value: `${num(onOrder)}`, note: `${m.unit}, ${m.imported ? '수입 원료라 환율 영향' : '국내 조달'}` },
              ]}
            />
          </>
        }
        footer={
          <>
            <span>시세와 환율은 모두 가상 값입니다</span>
            <span>원/{m.unit}, VAT 별도</span>
          </>
        }
      />

      {callouts.length > 0 && (
        <div className="callouts">
          {callouts.map((c, i) => (
            <Reveal key={c.title} delay={i * 80}>
              <div className="ink callout">
                <span className="callout-dot" />
                <div>
                  <b>{c.title}</b>
                  <span>{c.sub}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <SectionHead eyebrow="Prices" title={`${m.name} 시세 흐름`} />
      <div className="chart-grid">
        <Reveal>
          <Card className="card-lg" title={`${m.name} 시세`} sub={`원/${m.unit}, VAT 별도`}>
            <LineChart series={priceSeries} labels={labels} format={(v) => num(v)} height={200} />
          </Card>
        </Reveal>
        <div className="stack" style={{ gap: '1rem' }}>
          <Reveal delay={90}>
            <Card title="환율" sub="원/USD. 대두유와 정백당 시세에 반영">
              <LineChart series={fxSeries} labels={labels} format={(v) => num(v)} height={130} />
            </Card>
          </Reveal>
          <Reveal delay={160}>
            <Card title="재고 여유" sub="막대 = 남은 일수, 세로선 = 재주문점">
              <ul className="cover-list">
                {coverRows.map((r) => {
                  const color = r.days < 3 ? 'var(--danger)' : r.days < r.ropDays ? 'var(--accent)' : 'var(--foreground)';
                  return (
                    <li key={r.id} className={`cover-item ${r.id === sel ? 'sel' : ''}`}>
                      <span className="cover-name">{r.name}</span>
                      <span className="cover-track">
                        <span className="cover-fill" style={{ width: `${Math.min(100, (r.days / coverMax) * 100)}%`, background: color }} />
                        <span className="cover-rop" style={{ left: `${Math.min(100, (r.ropDays / coverMax) * 100)}%` }} />
                      </span>
                      <span className="cover-val" style={{ color }}>
                        {r.days.toFixed(1)}일
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Reveal>
        </div>
      </div>

      <SectionHead eyebrow="Costing" title="원가분석 기록" desc="목표가 = (시장가 + 물류비) × (1 + 표준마진). 최종 단가가 목표가보다 낮으면 잘 산 것입니다." />
      <RowList
        empty="아직 이 원료의 원가분석 기록이 없습니다."
        items={recent.map((c) => {
          const cost = c.cost!;
          const final = c.negotiation?.finalPrice;
          const diff = final !== undefined ? final / cost.targetPrice - 1 : null;
          return {
            key: c.id,
            index: String(Number(c.id.replace('PR-', ''))),
            title: (
              <>
                목표가 {num(cost.targetPrice)}원
                <span className="row-sub">{final !== undefined ? `최종 단가 ${num(final)}원` : '협상 전'}</span>
              </>
            ),
            desc: `시장가 ${num(cost.marketPrice)}원, 물류비 ${num(cost.logisticsPerUnit)}원, 표준마진 ${pct(cost.standardMargin, 0)}`,
            meta: (
              <>
                <span className={diff === null ? '' : diff > 0 ? 'saving-neg' : 'saving-pos'}>{diff === null ? '-' : `${diff > 0 ? '+' : ''}${pct(diff)}`}</span>
                <CaseStatus c={c} />
              </>
            ),
            onClick: () => openCase(c.id),
          };
        })}
      />

      <SectionHead eyebrow="Suppliers" title="공급업체 평가" desc="거래가 쌓일수록 실적 값이 채워집니다. 큰 숫자는 납기 준수율입니다." />
      <ul className="supplier-grid">
        {supplierRows.map(({ s, onTime, defect }, i) => (
          <Reveal as="li" key={s.id} delay={Math.min(i, 6) * 70} y={2}>
            <article className={`ink supplier-card ${s.active === false ? 'is-off' : ''}`}>
              <div className="supplier-top">
                <div>
                  <h3>{s.name}</h3>
                  <p>{s.materialIds.map((id) => state.materials[id].name).join(', ')}</p>
                </div>
                <span className="supplier-chips">
                  {s.active === false && <span className="tag-chip off">거래 중지</span>}
                  {s.addedDay !== undefined && <span className="tag-chip">신규 {formatDayShort(state.startDate, s.addedDay)}</span>}
                  {s.active !== false && (s.warnings ?? 0) > 0 && <span className="tag-chip warn">평가 미달 {s.warnings}회</span>}
                  <span className="tag-chip">{FORMAT_LABELS[s.quoteFormat]}</span>
                </span>
              </div>
              <div className="supplier-big">
                <strong>{onTime === null ? '-' : Math.round(onTime * 100)}</strong>
                <span>{onTime === null ? '거래 실적 없음' : `% 납기 준수, 발주 ${s.history.orders}건`}</span>
              </div>
              <dl className="supplier-stats">
                <div>
                  <dt>실적 불량률</dt>
                  <dd className={defect !== null && defect > 0.02 ? 'warn' : ''}>{defect === null ? '-' : pct(defect)}</dd>
                </div>
                <div>
                  <dt>등록 불량률</dt>
                  <dd>{pct(s.defectRate)}</dd>
                </div>
                <div>
                  <dt>결제 / 리드타임</dt>
                  <dd>
                    {s.paymentTermsDays}일 / {s.leadTimeDays}일
                  </dd>
                </div>
                <div>
                  <dt>누적 구매액</dt>
                  <dd>{s.history.spend > 0 ? `${wonShort(s.history.spend)}원` : '-'}</dd>
                </div>
              </dl>
            </article>
          </Reveal>
        ))}
      </ul>
      <SectionHead
        eyebrow="Sourcing"
        title="공급업체 관리"
        desc={`분기마다 납기·품질 실적으로 업체를 평가합니다. 기준 미달이면 개선 미팅을 하고, 두 분기 연속 미달이면 거래를 중지합니다. 신규 업체는 탐색, 샘플 시험, 등록을 거쳐 견적 대상에 들어갑니다. 지금까지 신규 등록 ${state.stats.suppliersAdded ?? 0}곳, 거래 중지 ${state.stats.suppliersSuspended ?? 0}곳, 개선 미팅 ${state.stats.supplierMeetings ?? 0}번.`}
      />
      <RowList
        empty="아직 신규 공급처를 찾아본 적이 없습니다. 거래 실적이 쌓이면 업체가 적은 원료부터 찾습니다."
        items={[...state.sourcing.candidates].reverse().map((c) => ({
          key: c.id,
          title: c.name,
          desc: `${c.materialIds.map((id) => state.materials[id].name).join(', ')}${
            c.sampleDefectRate !== undefined ? ` · 샘플 불량률 ${pct(c.sampleDefectRate)}` : ''
          }${c.foundDay !== undefined ? ` · 발굴 ${formatDay(state.startDate, c.foundDay)}` : ''}`,
          meta: CANDIDATE_STATUS[c.status],
        }))}
      />
      <Reveal>
        <p className="formula">
          <b>업체 평가 점수 v2</b> (원/기준단위, 낮을수록 유리) = 단가 − 결제 유예 금융효과(연 5%, 30일 기준) + 품질 위험(단가 × 불량률 × 1.5) + 결품 위험(기대
          결품 일수 × 결품 하루 손실 ÷ 구매 수량) + 신뢰도 위험(단가 × (1 − 납기 신뢰도) × 5%). 기대 결품 일수는 도착 예정일이 재고가 바닥나는 날을 넘는 일수를, 약속을
          어길 확률(1~4일 지연)까지 넣어 계산합니다. 결품 하루 손실은 그날 못 만든 세트의 공헌이익(판매가 − 변동비)입니다. 불량률과 납기 신뢰도는 거래 실적이 있으면
          실적값을, 없으면 등록값을 씁니다. 결제 유예와 품질 가중치는 가정치입니다.
        </p>
      </Reveal>
    </>
  );
}
