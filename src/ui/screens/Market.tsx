import { useMemo, useState } from 'react';
import { dailyUsage } from '../../sim/market';
import { onOrderQty, reorderPoint } from '../../sim/operations';
import type { MaterialId, QuoteFormat } from '../../sim/types';
import { formatDay, formatDayShort, num, won, wonShort } from '../../sim/util';
import { BarList, LineChart } from '../components/Chart';
import { Card, CaseStatus, PageHead, Stat, pct } from '../components/Common';
import { useStore } from '../store';

const FORMAT_LABELS: Record<QuoteFormat, string> = {
  A: '국문 표준',
  B: '영문·USD',
  C: '포장단위·VAT 포함',
  D: '불규칙·스캔본',
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
  const fxSeries = useMemo(() => [{ name: 'USD/KRW', color: 'var(--series-3)', values: state.history.map((h) => h.fx) }], [state.history]);

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

  return (
    <>
      <PageHead title="시장·원가·업체" desc="담당자가 구매 판단의 근거로 보는 시세, 원가, 공급업체 실적입니다." />
      <div className="notice">이 화면의 시세와 환율은 모두 시뮬레이션이 만든 가상 값입니다. 실제 시장 데이터가 아닙니다.</div>

      <div className="row">
        {ids.map((id) => (
          <button key={id} className={`btn btn-sm ${id === sel ? 'btn-primary' : ''}`} onClick={() => setSel(id)}>
            {state.materials[id].name}
          </button>
        ))}
      </div>

      <div className="grid grid-4">
        <Stat
          label="오늘 시세"
          value={`${won(market)}/${m.unit}`}
          note={`시작 대비 ${change >= 0 ? '+' : ''}${pct(change)}`}
          tone={change > 0.05 ? 'warn' : undefined}
        />
        <Stat
          label="현재 재고"
          value={`${num(m.stock)}${m.unit}`}
          note={`약 ${cover.toFixed(1)}일분`}
          tone={cover < 3 ? 'danger' : cover < 6 ? 'warn' : undefined}
        />
        <Stat label="재주문점" value={`${num(rop)}${m.unit}`} note={`일평균 사용량 ${num(usage)}${m.unit}`} />
        <Stat label="발주 진행 중" value={`${num(onOrder)}${m.unit}`} note={m.imported ? '수입 원료 · 환율 영향' : '국내 조달'} />
      </div>

      <div className="grid grid-2">
        <Card title={`${m.name} 시세 추이`} sub={`원/${m.unit}, VAT 별도`}>
          <LineChart series={priceSeries} labels={labels} format={(v) => num(v)} />
        </Card>
        <Card title="환율 추이" sub="원/USD · 대두유·정백당 시세에 반영">
          <LineChart series={fxSeries} labels={labels} format={(v) => num(v)} />
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="재고 여유" sub="재고 ÷ 일평균 사용량">
          <BarList
            items={ids.map((id) => {
              const mm = state.materials[id];
              const u = Math.max(1, dailyUsage(state, id));
              const d = mm.stock / u;
              return {
                label: mm.name,
                value: d,
                color: d < 3 ? 'var(--danger)' : d < 6 ? 'var(--warn)' : 'var(--accent)',
                note: `· 재주문점 ${(reorderPoint(state, id) / u).toFixed(1)}일분`,
              };
            })}
            format={(v) => `${v.toFixed(1)}일`}
          />
        </Card>
        <Card title="시장 상황">
          <div className="list">
            {state.market.demandBoost > 1 && (
              <div className="list-item row between">
                <span>판촉으로 수요 증가</span>
                <span className="badge badge-info">
                  +{Math.round((state.market.demandBoost - 1) * 100)}% · {formatDay(state.startDate, state.market.demandBoostUntil)}까지
                </span>
              </div>
            )}
            {state.market.shocks.map((s) => (
              <div key={s.materialId + s.until} className="list-item row between">
                <span>
                  {state.materials[s.materialId].name} 시세 {s.drift > 0 ? '상승세' : '하락세'}
                </span>
                <span className={`badge ${s.drift > 0 ? 'badge-warn' : 'badge-ok'}`}>
                  하루 {s.drift > 0 ? '+' : ''}
                  {pct(s.drift, 2)} · {formatDay(state.startDate, s.until)}까지
                </span>
              </div>
            ))}
            {state.market.demandBoost <= 1 && state.market.shocks.length === 0 && <div className="empty">지금은 특별한 시장 이슈가 없습니다.</div>}
          </div>
        </Card>
      </div>

      <Card title={`${m.name} 원가분석 기록`} sub="목표가 = (시장가 + 물류비) × (1 + 표준마진)">
        {recent.length === 0 ? (
          <div className="empty">아직 이 원료의 원가분석 기록이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>구매 건</th>
                  <th>상태</th>
                  <th className="r">시장가</th>
                  <th className="r">물류비</th>
                  <th className="r">표준마진</th>
                  <th className="r">목표가</th>
                  <th className="r">최종 단가</th>
                  <th className="r">목표가 대비</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => {
                  const cost = c.cost!;
                  const final = c.negotiation?.finalPrice;
                  const diff = final !== undefined ? final / cost.targetPrice - 1 : null;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => openCase(c.id)}>
                      <td className="mono">{c.id}</td>
                      <td>
                        <CaseStatus c={c} />
                      </td>
                      <td className="r">{num(cost.marketPrice)}</td>
                      <td className="r">{num(cost.logisticsPerUnit)}</td>
                      <td className="r">{pct(cost.standardMargin, 0)}</td>
                      <td className="r">{num(cost.targetPrice)}</td>
                      <td className="r">{final !== undefined ? num(final) : '-'}</td>
                      <td className="r" style={{ color: diff === null ? undefined : diff > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                        {diff === null ? '-' : `${diff > 0 ? '+' : ''}${pct(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="공급업체 평가" sub="거래가 쌓일수록 실적 값이 채워집니다">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>업체</th>
                <th>취급 품목</th>
                <th>견적서 양식</th>
                <th className="r">발주</th>
                <th className="r">납기 준수율</th>
                <th className="r">실적 불량률</th>
                <th className="r">등록 불량률</th>
                <th className="r">결제조건</th>
                <th className="r">평균 리드타임</th>
                <th className="r">누적 구매액</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.map(({ s, onTime, defect }) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td>{s.materialIds.map((id) => state.materials[id].name).join(', ')}</td>
                  <td>
                    <span className="badge">{FORMAT_LABELS[s.quoteFormat]}</span>
                  </td>
                  <td className="r">{s.history.orders}</td>
                  <td className="r" style={{ color: onTime !== null && onTime < 0.85 ? 'var(--warn)' : undefined }}>
                    {onTime === null ? '-' : pct(onTime, 0)}
                  </td>
                  <td className="r" style={{ color: defect !== null && defect > 0.02 ? 'var(--warn)' : undefined }}>
                    {defect === null ? '-' : pct(defect)}
                  </td>
                  <td className="r">{pct(s.defectRate)}</td>
                  <td className="r">{s.paymentTermsDays}일</td>
                  <td className="r">{s.leadTimeDays}일</td>
                  <td className="r">{s.history.spend > 0 ? wonShort(s.history.spend) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ marginBottom: 0 }}>
          견적 비교에서 쓰는 업체 평가 점수(원/기준단위, 낮을수록 유리) = 단가 − 결제유예 금융효과(연 5%, 30일 기준) + 품질위험(단가 × 불량률 × 1.5) +
          납기위험(필요일을 넘기는 하루마다 단가의 3%) + 신뢰도위험(단가 × (1 − 납기 신뢰도) × 5%). 불량률은 거래 실적이 있으면 실적값을, 없으면 등록값을 씁니다.
        </p>
      </Card>
    </>
  );
}
