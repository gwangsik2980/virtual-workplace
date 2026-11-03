import { useMemo } from 'react';
import { activeTool } from '../../sim/compare';
import { STAGE_LABELS, STAGE_ORDER } from '../../sim/purchasing';
import type { PurchaseCase, Stage } from '../../sim/types';
import { formatDay, formatDayShort } from '../../sim/util';
import { HeroFacts, RowList, ScreenHero, SectionHead } from '../components/Editorial';
import { Reveal } from '../motion';
import { stageAtNow, useRealtime } from '../realtime';
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
  inspect: '품질, 경영지원',
  done: '구매',
};

const WAIT_STAGES: Stage[] = ['awaitQuotes', 'approve', 'awaitDelivery'];

const DEPTS: { name: string; role: string }[] = [
  { name: '생산', role: '재고가 재주문점 아래면 구매요청' },
  { name: '구매', role: '시장조사부터 발주까지' },
  { name: '경영지원', role: '품의 승인과 대금 정산' },
  { name: '물류', role: '입고와 납기 지연 확인' },
  { name: '품질', role: '입고 검사와 클레임' },
];

/** 단계에 연결된 도구 */
const STAGE_TOOLS: Partial<Record<Stage, { id: string; name: string }>> = {
  compare: { id: 'quote-compare', name: '견적 비교' },
  awaitDelivery: { id: 'delivery-risk', name: '납기 위험 알림' },
};

export function ProcessMap() {
  const { state, openCase } = useStore();
  const rt = useRealtime();
  const liveKey = rt.liveMinute === null ? 'off' : `${rt.target}:${rt.liveMinute}`;
  // 실시간 근무 중에는 지금 시각 기준 단계로 보여 준다 (오늘 저녁 결과를 미리 보여 주지 않는다)
  const stageOf = useMemo(() => {
    const m = new Map<string, Stage>();
    for (const c of state.cases) m.set(c.id, stageAtNow(state, c, rt));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, liveKey]);
  const st = (c: PurchaseCase) => stageOf.get(c.id) ?? c.stage;

  const byStage = useMemo(() => {
    const map = new Map<Stage, PurchaseCase[]>();
    for (const c of state.cases) {
      const s = st(c);
      if (s === 'done' || s === 'cancelled') continue;
      const arr = map.get(s) ?? [];
      arr.push(c);
      map.set(s, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.neededByDay - b.neededByDay);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cases, stageOf]);

  const recentDone = useMemo(
    () =>
      state.cases
        .filter((c) => st(c) === 'done')
        .sort((a, b) => (b.closedDay ?? 0) - (a.closedDay ?? 0))
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.cases, stageOf],
  );

  const openCases = [...byStage.values()].flat();
  const urgentCount = openCases.filter((c) => c.urgent).length;
  const waitingCount = openCases.filter((c) => WAIT_STAGES.includes(st(c))).length;
  const supName = (id?: string) => state.suppliers.find((s) => s.id === id)?.name;
  const reportTool = activeTool(state, 'monthly-report');

  const KCard = ({ c }: { c: PurchaseCase }) => {
    const m = state.materials[c.materialId];
    const left = c.neededByDay - state.day;
    const sup = supName(c.selectedSupplierId);
    return (
      <button className={`kcard ${c.urgent ? 'urgent' : ''}`} onClick={() => openCase(c.id)}>
        <span className="kcard-top">
          <span className="id">{c.id}</span>
          {c.urgent && <span className="badge badge-danger">긴급</span>}
        </span>
        <strong>{m.name}</strong>
        <span className="faint num">
          {c.qty.toLocaleString('ko-KR')}
          {m.unit}, {left >= 0 ? `필요일 D-${left}` : `필요일 ${-left}일 지남`}
        </span>
        {sup && <span className="faint">{sup}</span>}
      </button>
    );
  };

  return (
    <>
      <ScreenHero
        eyebrow="04 — Process"
        lines={['구매요청부터', '정산까지 12단계']}
        watermark="FLOW"
        lead="구매 건 하나가 생산팀의 요청에서 시작해 입고와 정산으로 끝나기까지 어느 단계에 머물러 있는지 보여줍니다. 카드를 누르면 단계별 기록이 열립니다."
        aside={
          <HeroFacts
            items={[
              { label: '진행 중', value: `${openCases.length}건` },
              { label: '긴급', value: `${urgentCount}건`, note: urgentCount ? '재고가 리드타임보다 짧음' : '현재 없음' },
              { label: '대기 단계', value: `${waitingCount}건`, note: '회신, 승인, 입고 대기' },
              { label: '누적 완료', value: `${state.stats.closedCases}건` },
            ]}
          />
        }
      />

      <Reveal y={0.75}>
        <ul className="dept-legend" aria-label="참여 부서">
          {DEPTS.map((d) => (
            <li key={d.name}>
              <strong>{d.name}</strong>
              <span>{d.role}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <SectionHead
        eyebrow="Stages"
        title="단계별 진행 현황"
        desc="회색 줄무늬 단계는 담당자가 손쓸 일 없이 업체 회신, 팀장 승인, 입고를 기다리는 구간입니다. 주황 표시는 도구를 붙일 수 있는 지점입니다."
      />
      <Reveal y={1.25}>
        <div className="flow">
          {STAGE_ORDER.map((s, i) => {
            const isDone = s === 'done';
            const list = isDone ? [] : byStage.get(s) ?? [];
            const wait = WAIT_STAGES.includes(s);
            const toolDef = STAGE_TOOLS[s];
            const tool = toolDef ? activeTool(state, toolDef.id) : undefined;
            return (
              <section key={s} className={`flow-col ${wait ? 'wait' : ''} ${toolDef ? 'has-tool' : ''} ${tool ? 'tool-on' : ''} ${isDone ? 'done' : ''}`} aria-label={STAGE_LABELS[s]}>
                <header className="flow-head">
                  <span className="flow-no">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flow-count num">{isDone ? state.stats.closedCases : list.length}</span>
                  <strong className="flow-label">{STAGE_LABELS[s]}</strong>
                  <span className="flow-dept">
                    {STAGE_DEPT[s]}
                    {wait ? ', 대기' : ''}
                  </span>
                  {toolDef && <span className={`flow-tool ${tool ? 'on' : ''}`}>{tool ? `${toolDef.name} v${tool.version} 적용 중` : `도구 연결 지점: ${toolDef.name}`}</span>}
                </header>
                <div className="flow-cards">
                  {isDone ? (
                    <span className="faint">아래 최근 완료 목록 참고</span>
                  ) : list.length === 0 ? (
                    <span className="flow-empty">없음</span>
                  ) : (
                    list.map((c) => <KCard key={c.id} c={c} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </Reveal>
      <p className="faint flow-note">
        월간 구매 실적 보고서 도구는 구매 단계가 아니라 월말 보고 업무에 붙습니다.
        {reportTool ? ` 현재 v${reportTool.version} 적용 중입니다.` : ' 지금은 담당자가 직접 작성합니다.'}
      </p>

      <SectionHead eyebrow="Completed" title="최근 완료" desc={`누적 ${state.stats.closedCases}건 중 최근 ${recentDone.length}건`} />
      <div className="desk-rows">
        <RowList
          empty="아직 완료된 구매 건이 없습니다."
          items={recentDone.map((c) => {
            const m = state.materials[c.materialId];
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
              desc: supName(c.po?.supplierId ?? c.selectedSupplierId) ?? '',
              meta: (
                <span className="faint num" title={formatDay(state.startDate, c.closedDay ?? state.day)}>
                  {formatDayShort(state.startDate, c.closedDay ?? state.day)} 완료
                </span>
              ),
              onClick: () => openCase(c.id),
            };
          })}
        />
      </div>
    </>
  );
}
