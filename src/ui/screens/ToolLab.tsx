import { useMemo, useState } from 'react';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { GameState, Improvement, ImprovementStage, VerificationMetrics, VerificationRun } from '../../sim/types';
import { formatDay, logEvent, nextId, num, won, wonShort } from '../../sim/util';
import { runVerification } from '../../sim/verify';
import { TOOL_REGISTRY } from '../../tools/registry';
import type { ToolDefinition, ToolTarget } from '../../tools/types';
import { BarList } from '../components/Chart';
import { Card, PageHead, pct } from '../components/Common';
import { useStore } from '../store';
import './lab.css';

const STEPS: { title: string; output: string; desc: string }[] = [
  { title: '관찰', output: '업무 관찰 기록', desc: '담당자의 업무 단계와 입력 자료 확인' },
  { title: '문제 정의', output: '문제 정의서', desc: '반복·대기·오류·정보 탐색 구간 찾기' },
  { title: '개선 설계', output: '기능 명세', desc: '자동화 범위와 사람이 검토할 지점 결정' },
  { title: '개발', output: '작동하는 프로그램', desc: 'AI를 활용해 도구 구현' },
  { title: '업무 적용', output: '적용된 업무 프로세스', desc: '가상 직원의 업무 흐름에 연결' },
  { title: '검증', output: '개선 효과 보고서', desc: '기존 방식과 개선 방식 비교' },
];

const IMPROVEMENT_STAGES: { id: ImprovementStage; label: string }[] = [
  { id: 'observe', label: '관찰' },
  { id: 'define', label: '문제정의' },
  { id: 'design', label: '개선설계' },
  { id: 'develop', label: '개발' },
  { id: 'apply', label: '업무적용' },
  { id: 'verify', label: '검증' },
];

function targetLabel(t: ToolTarget): string {
  return t === 'report' ? '월간 구매 실적 보고' : STAGE_LABELS[t];
}

function nextUseText(tool: ToolDefinition): string {
  if (tool.targetStage === 'report') return '다음 월말 보고부터';
  if (tool.targetStage === 'awaitDelivery') return '내일 점검부터';
  return `다음 ${targetLabel(tool.targetStage)}부터`;
}

const PRIORITY_LABEL: Record<Improvement['priority'], string> = { high: '높음', mid: '보통', low: '낮음' };

export function ToolLab() {
  const { setScreen } = useStore();
  return (
    <>
      <PageHead
        title="AI Tool Lab"
        desc="관찰한 업무에서 비효율을 찾고, 도구를 만들어 가상 직원의 실제 업무에 연결한 뒤 효과를 검증합니다."
      />
      <Card title="도구 개발·적용 절차" sub="기획서 6장">
        <div className="lab-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="lab-step">
              <span className="lab-step-no">{i + 1}단계</span>
              <strong>{s.title}</strong>
              <span className="faint">{s.desc}</span>
              <span className="badge badge-accent" style={{ marginTop: 6 }}>
                {s.output}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <div className="notice notice-warn row between">
        <span>
          아래의 시간·오류 수치는 <b>가정·설정</b>의 비용 모델(견적 필드 1개 입력 시간, 오입력 확률 등)로 계산한 값입니다. 현장에서 측정한 값이
          아니라 가정치이므로 값을 바꾸면 결과도 달라집니다.
        </span>
        <button className="btn btn-sm" onClick={() => setScreen('assumptions')}>
          가정값 보기
        </button>
      </div>
      {TOOL_REGISTRY.map((t) => (
        <ToolCard key={t.id} tool={t} />
      ))}
      <LiveMetrics />
      {TOOL_REGISTRY.map((t) => (
        <VerificationPanel key={t.id} tool={t} />
      ))}
      <ReportsCard />
      <ImprovementBoard />
      <Card title="새 도구를 추가하려면">
        <p className="muted" style={{ margin: 0 }}>
          도구는 업무 단계에 끼워 넣는 순수 함수입니다. 같은 입력이면 같은 결과를 내고, 실패한 필드는 엔진이 자동으로 수작업으로 돌려보냅니다.
          만드는 방법과 규격은{' '}
          <a href="https://github.com/gwangsik2980/virtual-workplace/blob/main/docs/TOOL_GUIDE.md" target="_blank" rel="noreferrer">
            docs/TOOL_GUIDE.md
          </a>
          에 정리되어 있습니다. 새 도구를 <span className="mono">src/tools/registry.ts</span>에 등록하면 이 화면에 나타납니다.
        </p>
      </Card>
    </>
  );
}

function ToolCard({ tool }: { tool: ToolDefinition }) {
  const { state, update } = useStore();
  const active = state.tools.find((t) => t.toolId === tool.id && t.removedDay === undefined);
  const latest = tool.versions[tool.versions.length - 1].version;
  const [version, setVersion] = useState(active?.version ?? latest);
  const history = state.tools.filter((t) => t.toolId === tool.id);

  const apply = () =>
    update((d) => {
      for (const t of d.tools) if (t.toolId === tool.id && t.removedDay === undefined) t.removedDay = d.day;
      d.tools.push({ toolId: tool.id, version, appliedDay: d.day });
      logEvent(d, 'tool', 'purchasing', `${tool.name} v${version} 업무 적용`, `${targetLabel(tool.targetStage)} 업무에 도구를 연결했습니다. ${nextUseText(tool)} 사용됩니다.`);
    });

  const remove = () =>
    update((d) => {
      const a = d.tools.find((t) => t.toolId === tool.id && t.removedDay === undefined);
      if (!a) return;
      a.removedDay = d.day;
      logEvent(d, 'tool', 'purchasing', `${tool.name} v${a.version} 적용 해제`, `${nextUseText(tool)} 기존 수작업 방식으로 돌아갑니다.`);
    });

  return (
    <Card
      title={tool.name}
      sub={`연결 업무: ${targetLabel(tool.targetStage)}`}
      actions={active ? <span className="badge badge-ok">v{active.version} 적용 중</span> : <span className="badge">미적용 (수작업)</span>}
    >
      <p style={{ marginTop: 0 }}>{tool.summary}</p>
      <div className="lab-cols">
        <div>
          <h4>자동화하는 일</h4>
          <ul>
            {tool.automates.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>사람이 검토·승인하는 지점</h4>
          <ul>
            {tool.humanReview.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>검증 규칙</h4>
          <ul>
            {tool.validation.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>

      <h4 style={{ marginTop: 16, marginBottom: 8 }}>버전 기록</h4>
      <div className="stack">
        {tool.versions.map((v) => (
          <div key={v.version} className={`lab-version ${active?.version === v.version ? 'active' : ''}`}>
            <div className="row">
              <strong>v{v.version}</strong>
              {active?.version === v.version && <span className="badge badge-ok">적용 중</span>}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {v.releasedNote}
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <select value={version} onChange={(e) => setVersion(e.target.value)} aria-label="적용할 버전">
          {tool.versions.map((v) => (
            <option key={v.version} value={v.version}>
              v{v.version}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={apply} disabled={active?.version === version}>
          {active ? '이 버전으로 교체' : '업무에 적용'}
        </button>
        {active && (
          <button className="btn" onClick={remove}>
            적용 해제
          </button>
        )}
      </div>
      <p className="faint" style={{ marginBottom: 0 }}>
        적용하면 다음 견적 비교부터 도구가 쓰입니다. 도구가 읽지 못하거나 검증 규칙을 통과하지 못한 필드는 담당자가 직접 입력하기 때문에 도구가
        실패해도 업무는 멈추지 않습니다.
      </p>
      {history.length > 0 && (
        <div className="faint" style={{ marginTop: 8 }}>
          적용 이력:{' '}
          {history
            .map((h) => `v${h.version} ${formatDay(state.startDate, h.appliedDay)} ~ ${h.removedDay !== undefined ? formatDay(state.startDate, h.removedDay) : '현재'}`)
            .join(' / ')}
        </div>
      )}
    </Card>
  );
}

interface Group {
  key: string;
  cases: number;
  quotes: number;
  minutes: number;
  fields: number;
  manualFields: number;
  errors: number;
  loss: number;
  mismatches: number;
}

function LiveMetrics() {
  const { state } = useStore();
  const { groups, suppliers } = useMemo(() => computeLive(state), [state]);

  return (
    <Card title="실제 업무 기록" sub="이번 진행에서 담당자가 실제로 처리한 견적 비교 (도구 적용 전후)">
      {groups.length === 0 ? (
        <div className="empty">아직 견적 비교가 끝난 구매 건이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>방식</th>
                <th className="r">구매 건</th>
                <th className="r">견적서</th>
                <th className="r">견적 1건당 시간</th>
                <th className="r">오입력(100필드당)</th>
                <th className="r">수작업 필드 비율</th>
                <th className="r">잘못된 선택 손실</th>
                <th className="r">정산 불일치</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key}>
                  <td>
                    <span className={`badge ${g.key === '수작업' ? '' : 'badge-accent'}`}>{g.key}</span>
                  </td>
                  <td className="r">{g.cases}</td>
                  <td className="r">{g.quotes}</td>
                  <td className="r">{num(g.minutes / Math.max(1, g.quotes), 1)}분</td>
                  <td className="r">{num((g.errors / Math.max(1, g.fields)) * 100, 2)}</td>
                  <td className="r">{pct(g.manualFields / Math.max(1, g.fields), 0)}</td>
                  <td className="r">{won(g.loss)}</td>
                  <td className="r">{g.mismatches}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 style={{ marginTop: 18, marginBottom: 4 }}>수작업 복귀가 발생한 업체</h4>
      <p className="faint" style={{ marginTop: 0 }}>
        도구가 읽지 못해 사람이 입력한 필드를 업체별로 모은 표입니다. v1.0을 쓰면서 띄어쓰기가 불규칙한 양식을 쓰는 업체에 수작업이 몰린 것이
        v1.1을 만든 근거였습니다. 스캔본은 텍스트가 없어서 두 버전 모두 수작업입니다.
      </p>
      {suppliers.length === 0 ? (
        <div className="empty">도구를 적용한 견적 비교 기록이 아직 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>버전</th>
                <th>업체</th>
                <th className="r">견적서</th>
                <th className="r">스캔본</th>
                <th className="r">수작업 필드</th>
                <th className="r">비율</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.version + s.name}>
                  <td>v{s.version}</td>
                  <td>{s.name}</td>
                  <td className="r">{s.quotes}</td>
                  <td className="r">{s.scanned}</td>
                  <td className="r">{s.manual}</td>
                  <td className="r">
                    <span className={s.manual / Math.max(1, s.fields) > 0.3 ? 'badge badge-warn' : ''}>{pct(s.manual / Math.max(1, s.fields), 0)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function computeLive(state: GameState) {
  const map = new Map<string, Group>();
  const sup = new Map<string, { version: string; name: string; quotes: number; scanned: number; manual: number; fields: number }>();
  for (const c of state.cases) {
    const cmp = c.comparison;
    // 비교 단계가 아직 끝나지 않은 건은 제외 (결과가 업무에 반영되기 전)
    if (!cmp || c.stage === 'compare') continue;
    const key = cmp.method === 'manual' ? '수작업' : `도구 v${cmp.toolVersion}`;
    const g = map.get(key) ?? { key, cases: 0, quotes: 0, minutes: 0, fields: 0, manualFields: 0, errors: 0, loss: 0, mismatches: 0 };
    g.cases += 1;
    g.quotes += c.quotes.length;
    g.minutes += cmp.minutes;
    g.fields += cmp.fieldsTotal;
    g.manualFields += cmp.fieldsManual;
    g.errors += cmp.errorCount;
    g.loss += cmp.selectionLossKRW;
    if (c.delivery?.invoiceMismatch) g.mismatches += 1;
    map.set(key, g);

    if (cmp.method === 'tool') {
      const perQuoteFields = cmp.fieldsTotal / Math.max(1, cmp.entered.length);
      for (const e of cmp.entered) {
        const s = state.suppliers.find((x) => x.id === e.supplierId);
        const q = c.quotes.find((x) => x.id === e.quoteId);
        const k = `${cmp.toolVersion}|${e.supplierId}`;
        const row = sup.get(k) ?? { version: cmp.toolVersion ?? '', name: s?.name ?? e.supplierId, quotes: 0, scanned: 0, manual: 0, fields: 0 };
        row.quotes += 1;
        if (q?.scanned) row.scanned += 1;
        row.manual += e.manualFields.length;
        row.fields += perQuoteFields;
        sup.set(k, row);
      }
    }
  }
  const groups = [...map.values()].sort((a, b) => (a.key === '수작업' ? -1 : b.key === '수작업' ? 1 : a.key.localeCompare(b.key)));
  const suppliers = [...sup.values()].sort((a, b) => a.version.localeCompare(b.version) || b.manual / b.fields - a.manual / a.fields);
  return { groups, suppliers };
}

type MetricRow = { key: string; label: string; get: (m: VerificationMetrics) => number; fmt: (v: number) => string; lowerBetter: boolean };

const REPORT_ROWS: MetricRow[] = [
  { key: 'rpt', label: '월간 보고 작성 시간', get: (m) => m.reportMinutes ?? 0, fmt: (v) => `${num(v)}분`, lowerBetter: true },
  { key: 'rptn', label: '작성한 보고서', get: (m) => m.reportsWritten ?? 0, fmt: (v) => `${num(v)}건`, lowerBetter: false },
  { key: 'emp', label: '담당자 총 근무시간', get: (m) => m.totalEmployeeMinutes, fmt: (v) => `${num(v)}분`, lowerBetter: true },
  { key: 'cycle', label: '구매 건 평균 처리일수', get: (m) => m.avgCycleDays, fmt: (v) => `${num(v, 1)}일`, lowerBetter: true },
  { key: 'stock', label: '결품일', get: (m) => m.stockoutDays, fmt: (v) => `${num(v)}일`, lowerBetter: true },
];

const DELIVERY_ROWS: MetricRow[] = [
  { key: 'lated', label: '약속일 대비 지연 일수 합', get: (m) => m.lateDaysSum ?? 0, fmt: (v) => `${num(v)}일`, lowerBetter: true },
  { key: 'laten', label: '지연 입고 건수', get: (m) => m.lateDeliveries ?? 0, fmt: (v) => `${num(v)}건`, lowerBetter: true },
  { key: 'rec', label: '독촉으로 만회한 일수', get: (m) => m.expediteRecoveredDays ?? 0, fmt: (v) => `${num(v)}일`, lowerBetter: false },
  { key: 'stock', label: '결품일', get: (m) => m.stockoutDays, fmt: (v) => `${num(v)}일`, lowerBetter: true },
  { key: 'cycle', label: '구매 건 평균 처리일수', get: (m) => m.avgCycleDays, fmt: (v) => `${num(v, 1)}일`, lowerBetter: true },
  { key: 'emp', label: '담당자 총 근무시간', get: (m) => m.totalEmployeeMinutes, fmt: (v) => `${num(v)}분`, lowerBetter: true },
];

function interpretDelivery(run: VerificationRun): string[] {
  const b = run.baseline;
  const t = run.withTool;
  if (!b.lateDeliveries && !t.lateDeliveries && !b.expediteRecoveredDays) return ['이 기간에는 납기 지연이 없어서 효과를 비교할 수 없습니다. 기간을 늘려 보세요.'];
  const lines = [
    `지연 일수 합 ${num(b.lateDaysSum)}일 → ${num(t.lateDaysSum)}일, 지연 입고 ${b.lateDeliveries}건 → ${t.lateDeliveries}건. 독촉으로 만회한 일수 ${b.expediteRecoveredDays}일 → ${t.expediteRecoveredDays}일.`,
  ];
  if (b.stockoutDays === t.stockoutDays) {
    lines.push(
      '결품일은 달라지지 않았습니다. 결품이 난 건을 보면 처음부터 필요일보다 늦게 오는 업체를 고른 경우가 많아서, 약속보다 늦는 것을 줄이는 이 도구로는 막을 수 없습니다. 견적 비교에서 납기를 얼마나 무겁게 보는지가 다음 개선 대상입니다.',
    );
  } else {
    lines.push(`결품일 ${b.stockoutDays}일 → ${t.stockoutDays}일.`);
  }
  lines.push('일찍 알수록 만회 폭이 커진다는 규칙(남은 시간의 절반까지 만회, 성공 확률 65%)은 가정치입니다.');
  return lines;
}

const METRIC_ROWS: MetricRow[] = [
  { key: 'cmp', label: '견적 비교 시간', get: (m) => m.compareMinutes, fmt: (v) => `${num(v)}분`, lowerBetter: true },
  { key: 'perq', label: '견적 1건당 시간', get: (m) => m.compareMinutes / Math.max(1, m.quotesProcessed), fmt: (v) => `${num(v, 1)}분`, lowerBetter: true },
  { key: 'err', label: '오입력', get: (m) => m.entryErrors, fmt: (v) => `${num(v)}건`, lowerBetter: true },
  { key: 'loss', label: '잘못된 업체 선택 손실', get: (m) => m.selectionLossKRW, fmt: (v) => won(v), lowerBetter: true },
  { key: 'mis', label: '정산 불일치', get: (m) => m.invoiceMismatches, fmt: (v) => `${num(v)}건`, lowerBetter: true },
  { key: 'emp', label: '담당자 총 근무시간', get: (m) => m.totalEmployeeMinutes, fmt: (v) => `${num(v)}분`, lowerBetter: true },
  { key: 'cycle', label: '구매 건 평균 처리일수', get: (m) => m.avgCycleDays, fmt: (v) => `${num(v, 1)}일`, lowerBetter: true },
  { key: 'stock', label: '결품일', get: (m) => m.stockoutDays, fmt: (v) => `${num(v)}일`, lowerBetter: true },
  { key: 'save', label: '가격 절감액', get: (m) => m.priceSavingKRW, fmt: (v) => won(v), lowerBetter: false },
];

function interpretReport(run: VerificationRun): string[] {
  const b = run.baseline;
  const t = run.withTool;
  if (!b.reportsWritten && !t.reportsWritten) return ['이 기간에는 월말 보고가 없어서 효과를 비교할 수 없습니다. 기간을 늘려 보세요.'];
  const lines = [`월간 보고 작성 시간 ${num(b.reportMinutes)}분 → ${num(t.reportMinutes)}분 (보고서 ${b.reportsWritten}건 → ${t.reportsWritten}건).`];
  const saved = b.totalEmployeeMinutes - t.totalEmployeeMinutes;
  if (saved > 0) lines.push(`담당자는 ${run.days}영업일 동안 약 ${num(saved / 60, 1)}시간을 다른 업무에 쓸 수 있게 됐습니다.`);
  lines.push('보고서 내용은 두 방식 모두 같은 기록에서 나오므로 품질 차이는 측정하지 않았습니다. 시간 차이는 가정값(수작업 150분, 검토 35분)에서 나옵니다.');
  return lines;
}

function interpret(run: VerificationRun): string[] {
  const b = run.baseline;
  const t = run.withTool;
  const lines: string[] = [];
  if (b.casesCompared === 0 && t.casesCompared === 0) return ['이 기간에는 견적 비교가 없어서 도구 효과를 비교할 수 없습니다. 기간을 늘려 보세요.'];
  const red = b.compareMinutes > 0 ? (1 - t.compareMinutes / b.compareMinutes) * 100 : 0;
  lines.push(
    `견적 비교 시간 ${num(b.compareMinutes)}분 → ${num(t.compareMinutes)}분 (${red >= 0 ? `${num(red, 0)}% 감소` : `${num(-red, 0)}% 증가`}). 오입력 ${b.entryErrors}건 → ${t.entryErrors}건.`,
  );
  if (b.selectionLossKRW === t.selectionLossKRW) {
    lines.push(
      b.selectionLossKRW === 0
        ? '이 기간에는 두 방식 모두 업체를 잘못 고른 일이 없어서, 도구가 업체 선택 결과를 바꾸지는 않았습니다.'
        : '업체 선택 손실이 두 방식에서 같아서, 도구가 업체 선택 결과를 바꾸지는 않았습니다.',
    );
  } else {
    lines.push(`잘못된 업체 선택 손실 ${won(b.selectionLossKRW)} → ${won(t.selectionLossKRW)}.`);
  }
  if (b.invoiceMismatches !== t.invoiceMismatches) lines.push(`정산 불일치 ${b.invoiceMismatches}건 → ${t.invoiceMismatches}건.`);
  const saved = b.totalEmployeeMinutes - t.totalEmployeeMinutes;
  if (saved > 0) lines.push(`담당자는 ${run.days}영업일 동안 약 ${num(saved / 60, 1)}시간을 다른 업무에 쓸 수 있게 됐습니다.`);
  if (b.avgCycleDays.toFixed(1) === t.avgCycleDays.toFixed(1) && b.stockoutDays === t.stockoutDays) {
    lines.push('처리일수와 결품일은 달라지지 않았습니다. 담당자 업무에 여유가 있어서 아낀 시간이 일정 단축으로 이어지지는 않았습니다.');
  }
  return lines;
}

function VerificationPanel({ tool }: { tool: ToolDefinition }) {
  const { state, update } = useStore();
  const [days, setDays] = useState(40);
  const [version, setVersion] = useState(tool.versions[tool.versions.length - 1].version);
  const [busy, setBusy] = useState(false);
  const runs = state.verifications.filter((v) => v.toolId === tool.id);
  const latest = runs[runs.length - 1];
  const isReport = tool.targetStage === 'report';
  const isDelivery = tool.id === 'delivery-risk';
  const rows = isReport ? REPORT_ROWS : isDelivery ? DELIVERY_ROWS : METRIC_ROWS;

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try {
        const result = runVerification(structuredClone(state), tool.id, version, days);
        update((d) => {
          d.verifications.push({ ...result, id: nextId(d, 'VR') });
        });
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <Card title="효과 검증 (반사실 비교)" sub={tool.name}>
      <p className="muted" style={{ marginTop: 0 }}>
        지금 상태를 두 벌 복사해서 한쪽은 도구 없이, 다른 쪽은 도구를 적용해 같은 기간을 진행합니다. 시장가격·수요·업체 회신 같은 외부 사건은
        같은 시드로 정해지므로 두 세계에서 똑같이 일어나고, 차이는 도구 적용 여부에서만 생깁니다. 미래를 미리 돌려 보는 것이라 현재 진행 상황은
        바뀌지 않습니다.
      </p>
      <div className="row">
        <label className="row" style={{ gap: 6 }}>
          기간
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[20, 40, 60].map((d) => (
              <option key={d} value={d}>
                {d}영업일
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ gap: 6 }}>
          버전
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {tool.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? '검증 중…' : '검증 실행'}
        </button>
      </div>

      {latest && (
        <div className="stack" style={{ marginTop: 16, gap: 14 }}>
          <div className="faint">
            최근 결과: {formatDay(state.startDate, latest.day)} 시점부터 {latest.days}영업일 진행, v{latest.toolVersion}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>지표</th>
                  <th className="r">도구 없음</th>
                  <th className="r">도구 적용</th>
                  <th className="r">차이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.get(latest.baseline);
                  const t = r.get(latest.withTool);
                  const diff = t - b;
                  const better = Math.abs(diff) < 1e-9 ? null : r.lowerBetter ? diff < 0 : diff > 0;
                  return (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="r">{r.fmt(b)}</td>
                      <td className="r">{r.fmt(t)}</td>
                      <td className="r" style={{ color: better === null ? 'var(--text-3)' : better ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>
                        {better === null ? '변화 없음' : `${diff > 0 ? '+' : ''}${r.fmt(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <BarList
            items={
              isDelivery
                ? [
                    { label: '지연 일수 합 · 도구 없음', value: latest.baseline.lateDaysSum ?? 0, color: 'var(--series-2)' },
                    { label: '지연 일수 합 · 도구 적용', value: latest.withTool.lateDaysSum ?? 0, color: 'var(--series-1)' },
                  ]
                : isReport
                ? [
                    { label: '보고 작성 시간 · 도구 없음', value: latest.baseline.reportMinutes ?? 0, color: 'var(--series-2)' },
                    { label: '보고 작성 시간 · 도구 적용', value: latest.withTool.reportMinutes ?? 0, color: 'var(--series-1)' },
                  ]
                : [
                    { label: '견적 비교 시간 · 도구 없음', value: latest.baseline.compareMinutes, color: 'var(--series-2)' },
                    { label: '견적 비교 시간 · 도구 적용', value: latest.withTool.compareMinutes, color: 'var(--series-1)' },
                  ]
            }
            format={(v) => (isDelivery ? `${num(v)}일` : `${num(v)}분`)}
          />
          <div className="notice">
            {(isReport ? interpretReport(latest) : isDelivery ? interpretDelivery(latest) : interpret(latest)).map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {runs.length > 1 && !isReport && !isDelivery && (
        <>
          <h4 style={{ marginTop: 18, marginBottom: 6 }}>검증 기록</h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>시점</th>
                  <th>버전</th>
                  <th className="r">기간</th>
                  <th className="r">비교 시간 (없음 → 적용)</th>
                  <th className="r">오입력</th>
                  <th className="r">선택 손실</th>
                </tr>
              </thead>
              <tbody>
                {[...runs].reverse().map((r) => (
                  <tr key={r.id}>
                    <td>{formatDay(state.startDate, r.day)}</td>
                    <td>v{r.toolVersion}</td>
                    <td className="r">{r.days}일</td>
                    <td className="r">
                      {num(r.baseline.compareMinutes)} → {num(r.withTool.compareMinutes)}분
                    </td>
                    <td className="r">
                      {r.baseline.entryErrors} → {r.withTool.entryErrors}
                    </td>
                    <td className="r">
                      {wonShort(r.baseline.selectionLossKRW)} → {wonShort(r.withTool.selectionLossKRW)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function ImprovementBoard() {
  const { state, update } = useStore();
  const items = state.learning.improvements;
  const [title, setTitle] = useState('');

  const add = (imp: Omit<Improvement, 'id' | 'createdDay'>) =>
    update((d) => {
      d.learning.improvements.push({ ...imp, id: nextId(d, 'IMP'), createdDay: d.day });
    });

  const edit = (id: string, fn: (i: Improvement) => void) =>
    update((d) => {
      const i = d.learning.improvements.find((x) => x.id === id);
      if (i) fn(i);
    });

  const remove = (id: string) =>
    update((d) => {
      d.learning.improvements = d.learning.improvements.filter((x) => x.id !== id);
    });

  const loadExample = () =>
    add({
      title: '견적서 입력·비교 자동화',
      stage: 'develop',
      priority: 'high',
      toolId: 'quote-compare',
      fields: {
        observe: '담당자가 견적서 필드를 하나씩 비교표에 옮겨 적는다. 업체마다 단위(kg/포대), VAT 포함 여부, 통화(원/달러)가 달라서 환산이 필요하다.',
        define: '견적 1건당 입력 시간이 길고, 환산을 잘못하면 비싼 업체를 고르거나 발주 단가가 틀려서 정산 불일치가 생긴다.',
        design: '견적서에서 필드를 자동으로 추출하고 원문 근거를 함께 보여준다. 검증 규칙(시장가 ±40% 등)을 통과하지 못한 필드는 담당자가 직접 입력한다.',
        develop: 'quote-compare v1.0 (표준 라벨 인식), v1.1 (라벨 띄어쓰기 정규화, 추가 라벨 인식)',
      },
    });

  return (
    <Card title="개선 과제 보드" sub="발견한 비효율을 과제로 등록하고 단계별로 기록합니다">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="새 개선 과제 (예: 월간 구매 실적 보고서 초안 자동 생성)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button
          className="btn btn-primary"
          disabled={!title.trim()}
          onClick={() => {
            add({ title: title.trim(), stage: 'observe', priority: 'mid', fields: {} });
            setTitle('');
          }}
        >
          추가
        </button>
        {items.length === 0 && (
          <button className="btn" onClick={loadExample}>
            예시 과제 불러오기
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="empty">등록된 개선 과제가 없습니다.</div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {items.map((i) => (
            <ImprovementItem key={i.id} item={i} edit={edit} onDelete={() => remove(i.id)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ImprovementItem({
  item,
  edit,
  onDelete,
}: {
  item: Improvement;
  edit: (id: string, fn: (i: Improvement) => void) => void;
  onDelete: () => void;
}) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const stageIdx = IMPROVEMENT_STAGES.findIndex((s) => s.id === item.stage);
  const tool = TOOL_REGISTRY.find((t) => t.id === item.toolId);
  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <div className="row between">
        <div className="row">
          <strong>{item.title}</strong>
          <span className={`badge ${item.priority === 'high' ? 'badge-danger' : item.priority === 'mid' ? 'badge-warn' : ''}`}>
            우선순위 {PRIORITY_LABEL[item.priority]}
          </span>
          <span className="badge badge-accent">{IMPROVEMENT_STAGES[stageIdx]?.label}</span>
          {tool && <span className="badge">도구: {tool.name}</span>}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? '접기' : '열기'}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              if (confirm('이 개선 과제를 삭제할까요?')) onDelete();
            }}
          >
            삭제
          </button>
        </div>
      </div>
      <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'nowrap' }}>
        {IMPROVEMENT_STAGES.map((s, idx) => (
          <div key={s.id} style={{ flex: 1, minWidth: 0 }}>
            <div className="progress" style={{ height: 4 }}>
              <div style={{ width: idx <= stageIdx ? '100%' : '0%' }} />
            </div>
            <div className="faint" style={{ fontSize: 11, textAlign: 'center' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="row">
            <label className="row" style={{ gap: 6 }}>
              단계
              <select value={item.stage} onChange={(e) => edit(item.id, (i) => void (i.stage = e.target.value as ImprovementStage))}>
                {IMPROVEMENT_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="row" style={{ gap: 6 }}>
              우선순위
              <select value={item.priority} onChange={(e) => edit(item.id, (i) => void (i.priority = e.target.value as Improvement['priority']))}>
                <option value="high">높음</option>
                <option value="mid">보통</option>
                <option value="low">낮음</option>
              </select>
            </label>
            <label className="row" style={{ gap: 6 }}>
              연결 도구
              <select value={item.toolId ?? ''} onChange={(e) => edit(item.id, (i) => void (i.toolId = e.target.value || undefined))}>
                <option value="">없음</option>
                {TOOL_REGISTRY.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="faint">등록 {formatDay(state.startDate, item.createdDay)}</span>
          </div>
          {IMPROVEMENT_STAGES.map((s) => (
            <div key={s.id} className="improve-stage">
              <h4 style={{ paddingTop: 6 }}>{s.label}</h4>
              <textarea
                defaultValue={item.fields[s.id] ?? ''}
                placeholder={`${s.label} 단계 기록`}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v !== (item.fields[s.id] ?? '')) edit(item.id, (i) => void (i.fields[s.id] = v));
                }}
              />
            </div>
          ))}
          <div className="faint" style={{ marginTop: 6 }}>
            입력란 밖을 누르면 자동 저장됩니다.
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsCard() {
  const { state } = useStore();
  const reports = [...state.reports].reverse();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = reports.find((r) => r.id === openId) ?? reports[0];
  return (
    <Card title="작성된 월간 보고서" sub="담당자가 월말에 작성한 보고서. 도구를 쓰면 초안을 검토해 마무리합니다">
      {reports.length === 0 ? (
        <div className="empty">아직 월말이 지나지 않았습니다. 월말 영업일에 보고 요청이 오고 이틀 안에 작성됩니다.</div>
      ) : (
        <div className="stack">
          <div className="row">
            {reports.map((r) => (
              <button key={r.id} className={`btn btn-sm ${open?.id === r.id ? 'btn-primary' : ''}`} onClick={() => setOpenId(r.id)}>
                {formatDay(state.startDate, r.toDay).slice(0, 7)} · {r.method === 'tool' ? `도구 v${r.toolVersion}` : '수작업'} · {r.minutes}분
              </button>
            ))}
          </div>
          {open && <pre className="doc">{open.text}</pre>}
        </div>
      )}
    </Card>
  );
}
