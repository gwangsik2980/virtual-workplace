import { useMemo } from 'react';
import { activeTool } from '../../sim/compare';
import { STAGE_LABELS, STAGE_ORDER } from '../../sim/purchasing';
import type { PurchaseCase, Stage } from '../../sim/types';
import { formatDayShort } from '../../sim/util';
import { Card, PageHead } from '../components/Common';
import { useStore } from '../store';
import './desk.css';

const STAGE_DEPT: Partial<Record<Stage, string>> = {
  request: '생산 → 구매',
  market: '구매',
  costing: '구매',
  rfq: '구매 → 공급업체',
  awaitQuotes: '공급업체',
  compare: '구매',
  negotiate: '구매 ↔ 공급업체',
  approve: '구매팀장',
  order: '구매 → 공급업체',
  awaitDelivery: '공급업체 → 물류',
  inspect: '품질 · 경영지원(정산)',
};

const WAIT_STAGES: Stage[] = ['awaitQuotes', 'approve', 'awaitDelivery'];

export function ProcessMap() {
  const { state, openCase } = useStore();
  const tool = activeTool(state, 'quote-compare');

  const byStage = useMemo(() => {
    const map = new Map<Stage, PurchaseCase[]>();
    for (const c of state.cases) {
      if (c.stage === 'done' || c.stage === 'cancelled') continue;
      const arr = map.get(c.stage) ?? [];
      arr.push(c);
      map.set(c.stage, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.neededByDay - b.neededByDay);
    return map;
  }, [state.cases]);

  const recentDone = useMemo(
    () =>
      state.cases
        .filter((c) => c.stage === 'done')
        .sort((a, b) => (b.closedDay ?? 0) - (a.closedDay ?? 0))
        .slice(0, 8),
    [state.cases],
  );

  const stages = STAGE_ORDER.filter((s) => s !== 'done');
  const openCount = [...byStage.values()].reduce((a, l) => a + l.length, 0);
  const supName = (id?: string) => state.suppliers.find((s) => s.id === id)?.name;

  const KCard = ({ c, done }: { c: PurchaseCase; done?: boolean }) => {
    const m = state.materials[c.materialId];
    const left = c.neededByDay - state.day;
    const sup = supName(c.selectedSupplierId);
    return (
      <button className={`kcard ${c.urgent && !done ? 'urgent' : ''}`} onClick={() => openCase(c.id)}>
        <span className="row between">
          <span className="id">{c.id}</span>
          {c.urgent && !done && <span className="badge badge-danger">긴급</span>}
        </span>
        <strong>{m.name}</strong>
        <span className="faint num">
          {c.qty.toLocaleString('ko-KR')}
          {m.unit}
          {done
            ? ` · ${formatDayShort(state.startDate, c.closedDay ?? state.day)} 완료`
            : ` · ${left >= 0 ? `필요일 D-${left}` : `필요일 ${-left}일 지남`}`}
        </span>
        {sup && <span className="faint">{sup}</span>}
      </button>
    );
  };

  return (
    <>
      <PageHead
        title="프로세스 맵"
        desc="구매요청부터 입고·정산까지 각 구매 건이 지금 어느 단계에 있는지 보여줍니다. 카드를 누르면 단계별 기록을 볼 수 있습니다."
      />
      <Card title="부서 간 연결" sub="구매 업무는 여러 부서를 거쳐 진행됩니다">
        <div className="dept-strip">
          <div>
            <strong>생산</strong>
            <div className="faint">재고가 재주문점 아래로 내려가면 구매요청을 보냅니다.</div>
          </div>
          <div>
            <strong>구매</strong>
            <div className="faint">시장조사 · 원가분석 · 견적 · 협상 · 발주를 맡습니다.</div>
          </div>
          <div>
            <strong>경영지원</strong>
            <div className="faint">품의 승인과 대금 정산(3-way matching)에 관여합니다.</div>
          </div>
          <div>
            <strong>물류</strong>
            <div className="faint">업체에서 온 자재를 입고하고 납기 지연을 확인합니다.</div>
          </div>
          <div>
            <strong>품질</strong>
            <div className="faint">입고 검사로 불량을 걸러내고 클레임을 요청합니다.</div>
          </div>
        </div>
      </Card>
      <Card title="단계별 진행 현황" sub={`진행 중 ${openCount}건 · 누적 완료 ${state.stats.closedCases}건`}>
        <div className="kanban">
          {stages.map((s) => {
            const list = byStage.get(s) ?? [];
            const isCompare = s === 'compare';
            return (
              <div key={s} className={`kanban-col ${WAIT_STAGES.includes(s) ? 'wait' : ''} ${isCompare && tool ? 'tool-on' : ''}`}>
                <div className="kanban-col-head">
                  <span className="title">
                    <span>{STAGE_LABELS[s]}</span>
                    <span className="num faint">{list.length}</span>
                  </span>
                  <span className="dept">
                    {STAGE_DEPT[s]}
                    {WAIT_STAGES.includes(s) ? ' · 대기' : ''}
                  </span>
                  {isCompare && (
                    <span className={`badge ${tool ? 'badge-accent' : ''}`} style={{ alignSelf: 'flex-start', marginTop: 3 }}>
                      도구 연결 지점 · {tool ? `견적 비교 v${tool.version} 적용 중` : '미적용(수작업)'}
                    </span>
                  )}
                </div>
                {list.length === 0 ? <div className="faint" style={{ padding: '6px 2px' }}>없음</div> : list.map((c) => <KCard key={c.id} c={c} />)}
              </div>
            );
          })}
        </div>
        <div className="faint" style={{ marginTop: 6 }}>
          파란 열은 담당자가 손쓸 일이 없는 대기 단계입니다. 업체 회신, 팀장 승인, 입고를 기다립니다.
        </div>
      </Card>
      <Card title="최근 완료" sub={`누적 ${state.stats.closedCases}건 중 최근 ${recentDone.length}건`}>
        {recentDone.length === 0 ? (
          <div className="empty">아직 완료된 구매 건이 없습니다.</div>
        ) : (
          <div className="grid grid-4">
            {recentDone.map((c) => (
              <KCard key={c.id} c={c} done />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
