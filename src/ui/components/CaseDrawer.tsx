import { Fragment, useEffect, useMemo, useState } from 'react';
import { scoreQuote } from '../../sim/compare';
import { STAGE_LABELS, STAGE_ORDER } from '../../sim/purchasing';
import type { EntryErrorKind, GameState, QuoteFormat } from '../../sim/types';
import { formatDay, nextId, won } from '../../sim/util';
import { useStore } from '../store';
import { Card, CaseStatus } from './Common';
import './drawer.css';

const FORMAT_LABELS: Record<QuoteFormat, string> = {
  A: 'A 국문표준',
  B: 'B 영문·USD',
  C: 'C 포장단위·VAT포함',
  D: 'D 비정형·스캔',
};

const ERROR_LABELS: Record<EntryErrorKind, string> = {
  digit: '숫자 오입력',
  unit: '단위 환산 실수',
  vat: '부가세 미제외',
  currency: '환율 적용 실수',
  leadtime: '납기 오입력',
  terms: '결제조건 오입력',
};

const FIELD_LABELS: Record<string, string> = {
  unitPrice: '단가',
  leadTime: '납기',
  paymentTerms: '결제조건',
  moq: '최소주문량',
  validUntil: '유효기간',
};

export function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { state, update } = useStore();
  const c = state.cases.find((x) => x.id === caseId);
  const [observer, setObserver] = useState(false);
  const [openQuote, setOpenQuote] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sup = (id?: string) => state.suppliers.find((s) => s.id === id);

  const scores = useMemo(() => {
    if (!c?.comparison) return new Map<string, number>();
    // 비교 당시 저장된 점수를 쓴다. 예전 저장 파일처럼 점수가 없으면 비교일 기준으로 다시 계산한다
    // (이 경우 업체 실적은 현재 값이라 약간 다를 수 있음)
    const asOf = { ...state, day: c.comparison.day } as GameState;
    const map = new Map<string, number>();
    for (const e of c.comparison.entered) {
      if (e.score !== undefined) {
        map.set(e.quoteId, e.score);
        continue;
      }
      const s = sup(e.supplierId);
      if (s) map.set(e.quoteId, scoreQuote(asOf, c, s, e.unitPriceKRW, e.leadTimeDays, e.paymentTermsDays));
    }
    return map;
  }, [c, state]);

  if (!c) {
    return (
      <>
        <div className="drawer-backdrop" onClick={onClose} />
        <aside className="drawer">
          <div className="drawer-head">
            <strong>{caseId}</strong>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
              닫기
            </button>
          </div>
          <div className="drawer-body">
            <div className="empty">구매 건을 찾을 수 없습니다.</div>
          </div>
        </aside>
      </>
    );
  }

  const m = state.materials[c.materialId];
  const unit = m.unit;
  const curIdx = STAGE_ORDER.indexOf(c.stage);
  const cmp = c.comparison;
  const notes = state.learning.notes.filter((n) => n.caseId === c.id);
  const fd = (d: number) => formatDay(state.startDate, d);

  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    update((draft) => {
      draft.learning.notes.push({ id: nextId(draft, 'NOTE'), day: draft.day, caseId: c.id, text });
    });
    setNote('');
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${c.id} 상세`}>
        <div className="drawer-head">
          <span className="mono faint">{c.id}</span>
          <strong>{m.name}</strong>
          <CaseStatus c={c} />
          <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            닫기 ✕
          </button>
        </div>
        <div className="drawer-body">
          <div className="steps">
            {STAGE_ORDER.map((s, i) => (
              <div key={s} className={`step ${i < curIdx ? 'past' : ''} ${i === curIdx ? 'current' : ''}`}>
                <span className="dot" />
                {STAGE_LABELS[s]}
              </div>
            ))}
          </div>

          <Card title="요청 정보">
            <dl className="kv">
              <dt>요청 사유</dt>
              <dd>{c.reason}</dd>
              <dt>수량</dt>
              <dd>
                {c.qty.toLocaleString('ko-KR')}
                {unit}
              </dd>
              <dt>요청일</dt>
              <dd>{fd(c.createdDay)}</dd>
              <dt>필요일</dt>
              <dd>{fd(c.neededByDay)}</dd>
              <dt>담당자 투입 시간</dt>
              <dd>{c.minutesSpent}분</dd>
              {c.closedDay !== undefined && (
                <>
                  <dt>완료일</dt>
                  <dd>
                    {fd(c.closedDay)} (총 {c.closedDay - c.createdDay}영업일)
                  </dd>
                </>
              )}
            </dl>
          </Card>

          <Card title="시장조사 · 원가분석">
            {!c.cost ? (
              <div className="faint">아직 원가분석 전입니다.</div>
            ) : (
              <>
                <dl className="kv">
                  <dt>조사 시점 시장가</dt>
                  <dd>
                    {won(c.cost.marketPrice)}/{unit}
                  </dd>
                  {c.cost.fx !== undefined && (
                    <>
                      <dt>환율</dt>
                      <dd>{c.cost.fx.toLocaleString('ko-KR')}원/USD</dd>
                    </>
                  )}
                  <dt>물류비</dt>
                  <dd>
                    {won(c.cost.logisticsPerUnit)}/{unit}
                  </dd>
                  <dt>표준마진</dt>
                  <dd>{(c.cost.standardMargin * 100).toFixed(1)}%</dd>
                  <dt>목표가</dt>
                  <dd>
                    <strong>
                      {won(c.cost.targetPrice)}/{unit}
                    </strong>
                  </dd>
                </dl>
                <div className="faint" style={{ marginTop: 6 }}>
                  목표가 = (시장가 + 물류비) × (1 + 표준마진)
                </div>
              </>
            )}
          </Card>

          <Card title="견적" sub={c.quotes.length ? `${c.quotes.length}개 업체 회신` : undefined}>
            {c.quotes.length === 0 ? (
              <div className="faint">{c.rfqSupplierIds.length ? '업체 회신을 기다리는 중입니다.' : '아직 견적요청 전입니다.'}</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>업체</th>
                      <th>양식</th>
                      <th>회신일</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {c.quotes.map((q) => (
                      <Fragment key={q.id}>
                        <tr>
                          <td>
                            {sup(q.supplierId)?.name}
                            {q.scanned && <span className="badge badge-warn" style={{ marginLeft: 6 }}>스캔본</span>}
                          </td>
                          <td>{FORMAT_LABELS[q.format]}</td>
                          <td>{fd(q.receivedDay)}</td>
                          <td className="r">
                            <button className="btn btn-sm" onClick={() => setOpenQuote(openQuote === q.id ? null : q.id)}>
                              {openQuote === q.id ? '접기' : '원문 보기'}
                            </button>
                          </td>
                        </tr>
                        {openQuote === q.id && (
                          <tr>
                            <td colSpan={4}>
                              {q.docText === '' ? (
                                <div className="notice">보관 기간이 지나 원문이 정리됨</div>
                              ) : (
                                <>
                                  {q.scanned && (
                                    <div className="notice notice-warn" style={{ marginBottom: 6 }}>
                                      스캔 이미지: 도구는 텍스트를 읽을 수 없고 사람이 눈으로 읽어 입력합니다
                                    </div>
                                  )}
                                  <pre className={`doc ${q.scanned ? 'scanned' : ''}`}>{q.docText}</pre>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="견적 비교표"
            actions={
              cmp && (
                <label className="switch">
                  <input type="checkbox" checked={observer} onChange={(e) => setObserver(e.target.checked)} />
                  관찰자 모드: 오입력 확인
                </label>
              )
            }
          >
            {!cmp ? (
              <div className="faint">아직 견적 비교 전입니다.</div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${cmp.method === 'tool' ? 'badge-accent' : ''}`}>
                    {cmp.method === 'tool' ? `도구 v${cmp.toolVersion}` : '수작업'}
                  </span>
                  <span className="badge">소요 {cmp.minutes}분</span>
                  <span className="badge">
                    수작업 입력 {cmp.fieldsManual}/{cmp.fieldsTotal} 필드
                  </span>
                  {c.stage === 'compare' && <span className="badge badge-warn">작성 중</span>}
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>업체</th>
                        <th className="r">단가(원/{unit})</th>
                        <th className="r">납기</th>
                        <th className="r">결제</th>
                        <th className="r">평가점수</th>
                        {observer && <th>실제값과 비교</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {cmp.entered.map((e) => {
                        const errs = e.errors;
                        const errOf = (f: string) => observer && errs.some((x) => x.field === f);
                        const selected = e.supplierId === cmp.selectedSupplierId;
                        return (
                          <tr key={e.quoteId} className={observer && errs.length ? 'err-row' : ''}>
                            <td>
                              {sup(e.supplierId)?.name}
                              {selected && <span className="badge badge-accent" style={{ marginLeft: 6 }}>선정</span>}
                              {observer && e.supplierId === cmp.trueBestSupplierId && (
                                <span className="badge badge-ok" style={{ marginLeft: 4 }}>실제 최적</span>
                              )}
                              {e.manualFields.length > 0 && cmp.method === 'tool' && (
                                <div className="faint">수작업: {e.manualFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}</div>
                              )}
                            </td>
                            <td className={`r ${errOf('unitPrice') ? 'cell-err' : ''}`}>{Math.round(e.unitPriceKRW).toLocaleString('ko-KR')}</td>
                            <td className={`r ${errOf('leadTime') ? 'cell-err' : ''}`}>{e.leadTimeDays}일</td>
                            <td className={`r ${errOf('paymentTerms') ? 'cell-err' : ''}`}>{e.paymentTermsDays}일</td>
                            <td className="r">{scores.has(e.quoteId) ? Math.round(scores.get(e.quoteId)!).toLocaleString('ko-KR') : '-'}</td>
                            {observer && (
                              <td style={{ fontSize: 12 }}>
                                {errs.length === 0 ? (
                                  <span className="faint">일치</span>
                                ) : (
                                  errs.map((x, i) => (
                                    <div key={i}>
                                      {FIELD_LABELS[x.field] ?? x.field} · {ERROR_LABELS[x.kind]}: 입력 {Math.round(x.enteredValue).toLocaleString('ko-KR')} → 실제{' '}
                                      {Math.round(x.trueValue).toLocaleString('ko-KR')}
                                    </div>
                                  ))
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="faint">
                  평가점수 = 단가 − 결제 유예 효과 + 품질 위험 + 납기 위험 (원/{unit} 환산, 낮을수록 유리). 업체 실적은 현재 기준이라 비교 당시와 조금 다를 수 있습니다.
                </div>
                {observer && (
                  <div className={`notice ${cmp.errorCount > 0 ? 'notice-warn' : ''}`}>
                    담당자는 이 사실을 모른 채 입력값으로 판단했다.{' '}
                    {cmp.errorCount === 0
                      ? '이 건은 오입력 없이 처리되었습니다.'
                      : `오입력 ${cmp.errorCount}건이 있었습니다.`}{' '}
                    {cmp.selectionLossKRW > 0
                      ? `실제 최적 업체는 ${sup(cmp.trueBestSupplierId)?.name}였고, 잘못된 선택으로 약 ${won(cmp.selectionLossKRW)}를 더 쓰게 되었습니다.`
                      : '업체 선택은 실제 최적과 같았습니다.'}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="협상">
            {!c.negotiation ? (
              <div className="faint">아직 협상 전입니다.</div>
            ) : (
              <dl className="kv">
                <dt>협상 업체</dt>
                <dd>{sup(c.selectedSupplierId)?.name}</dd>
                <dt>최초 견적</dt>
                <dd>
                  {won(c.negotiation.initialPrice)}/{unit}
                </dd>
                <dt>최종 단가</dt>
                <dd>
                  <strong>
                    {won(c.negotiation.finalPrice)}/{unit}
                  </strong>{' '}
                  <span className="badge badge-ok">{(c.negotiation.discountRate * 100).toFixed(1)}% 인하</span>
                </dd>
                {c.cost && (
                  <>
                    <dt>목표가 대비</dt>
                    <dd>
                      {c.negotiation.finalPrice <= c.cost.targetPrice
                        ? `목표가 이하 달성 (${won(c.cost.targetPrice - c.negotiation.finalPrice)} 낮음)`
                        : `목표가보다 ${won(c.negotiation.finalPrice - c.cost.targetPrice)} 높음`}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </Card>

          <Card title="발주">
            {!c.po ? (
              <div className="faint">아직 발주 전입니다.</div>
            ) : (
              <>
                <dl className="kv">
                  <dt>발주번호</dt>
                  <dd className="mono">{c.po.id}</dd>
                  <dt>업체</dt>
                  <dd>{sup(c.po.supplierId)?.name}</dd>
                  <dt>발주서 단가</dt>
                  <dd className={c.po.unitPriceEntered !== c.po.unitPriceAgreed ? 'cell-err' : ''}>
                    {won(c.po.unitPriceEntered)}/{unit}
                  </dd>
                  <dt>합의 단가</dt>
                  <dd>
                    {won(c.po.unitPriceAgreed)}/{unit}
                  </dd>
                  <dt>발주 금액</dt>
                  <dd>{won(c.po.amountKRW)}</dd>
                  <dt>발주일 / 약속 납기</dt>
                  <dd>
                    {fd(c.po.orderDay)} / {fd(c.po.promisedDay)}
                  </dd>
                  <dt>결제조건</dt>
                  <dd>납품 후 {c.po.paymentTermsDays}일</dd>
                </dl>
                {c.po.unitPriceEntered !== c.po.unitPriceAgreed && (
                  <div className="notice notice-warn" style={{ marginTop: 8 }}>
                    발주서 단가가 합의 단가와 다릅니다. 견적 비교표의 입력값이 발주서로 옮겨졌기 때문이며 정산 단계에서 드러납니다.
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="입고 · 정산">
            {!c.delivery ? (
              <div className="faint">{c.po ? `입고 예정일 ${fd(c.po.promisedDay)}` : '아직 입고 전입니다.'}</div>
            ) : (
              <dl className="kv">
                <dt>입고일</dt>
                <dd>
                  {fd(c.delivery.arrivedDay)}{' '}
                  {c.delivery.late ? (
                    <span className="badge badge-warn">약속일 대비 {c.delivery.arrivedDay - (c.po?.promisedDay ?? c.delivery.arrivedDay)}일 지연</span>
                  ) : (
                    <span className="badge badge-ok">납기 준수</span>
                  )}
                </dd>
                <dt>불량</dt>
                <dd>
                  {c.delivery.defectQty.toLocaleString('ko-KR')}
                  {unit} ({((c.delivery.defectQty / (c.po?.qty || 1)) * 100).toFixed(1)}%)
                </dd>
                <dt>정산 대조</dt>
                <dd>
                  {c.delivery.invoiceMismatch ? (
                    <span className="badge badge-danger">발주·청구 단가 불일치 → 재작업 {state.params.mismatchReworkMinutes}분</span>
                  ) : (
                    <span className="badge badge-ok">일치</span>
                  )}
                </dd>
              </dl>
            )}
          </Card>

          <Card title="절감 성과">
            {!c.savings ? (
              <div className="faint">구매 건이 완료되면 계산됩니다.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <dl className="kv">
                  <dt>가격 절감액</dt>
                  <dd>
                    <strong style={{ color: 'var(--ok)' }}>{won(c.savings.priceSavingKRW)}</strong>
                  </dd>
                  <dt>기준가격</dt>
                  <dd>
                    {won(c.savings.baselinePrice)}/{unit} (협상 전 최초 견적)
                  </dd>
                  <dt>최종 단가</dt>
                  <dd>
                    {won(c.savings.finalPrice)}/{unit}
                  </dd>
                  <dt>목표가 대비</dt>
                  <dd>{won(c.savings.vsTargetKRW)}</dd>
                  <dt>시장 변동분</dt>
                  <dd>
                    {c.savings.marketMoveKRW > 0 ? '+' : ''}
                    {won(c.savings.marketMoveKRW)} {c.savings.marketMoveKRW > 0 ? '(시장 상승)' : c.savings.marketMoveKRW < 0 ? '(시장 하락)' : ''}
                  </dd>
                </dl>
                <div className="mono faint">{c.savings.formula}</div>
                <div className="faint">시장 변동분: 구매 성과와 분리해 기록합니다. 조사 시점부터 완료 시점까지 시장가격이 움직인 효과로, 담당자의 협상 성과에 넣지 않습니다.</div>
              </div>
            )}
          </Card>

          <Card title="관찰 메모" sub="이 구매 건을 보며 배운 점이나 발견한 비효율을 적어 두세요">
            <div className="stack" style={{ gap: 8 }}>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 포대 단위 견적을 kg 단가로 바꾸는 데 시간이 오래 걸린다" />
              <div>
                <button className="btn btn-primary btn-sm" disabled={!note.trim()} onClick={addNote}>
                  메모 저장
                </button>
              </div>
              {notes.length > 0 && (
                <div className="list">
                  {[...notes].reverse().map((n) => (
                    <div key={n.id} className="list-item" style={{ fontSize: 13 }}>
                      <div className="faint">{fd(n.day)}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </aside>
    </>
  );
}
