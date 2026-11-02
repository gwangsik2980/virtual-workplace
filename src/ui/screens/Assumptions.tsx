import { useEffect, useState } from 'react';
import { DEFAULT_PARAMS } from '../../sim/seed';
import type { CostModelParams } from '../../sim/types';
import { logEvent } from '../../sim/util';
import { Card, PageHead } from '../components/Common';
import { useStore } from '../store';
import './lab.css';

type Key = keyof CostModelParams;

interface ParamMeta {
  key: Key;
  label: string;
  unit: string;
  /** 화면 표시 배율 (확률은 % 로 보여준다) */
  scale: number;
  step: number;
  min: number;
  max: number;
  usedIn: string;
}

const META: ParamMeta[] = [
  {
    key: 'entryMinutesPerField',
    label: '견적서 필드 1개 확인·입력 시간',
    unit: '분',
    scale: 1,
    step: 0.1,
    min: 0.1,
    max: 10,
    usedIn: '수작업으로 견적 비교표를 만들 때 필드마다 드는 시간입니다. 견적서 1건에 필드가 5개(단가, 납기, 결제조건, 최소주문량, 유효기간)라서 견적 1건당 약 5배가 됩니다. 스캔본은 1.3배, 단위·통화 환산이 필요한 단가는 1분을 더합니다.',
  },
  {
    key: 'baseErrorRate',
    label: '필드 1개 오입력 확률',
    unit: '%',
    scale: 100,
    step: 0.1,
    min: 0,
    max: 50,
    usedIn: '사람이 단가·납기·결제조건을 옮겨 적을 때 틀릴 확률입니다. 단가는 ±9~10%, 납기는 ±2~3일, 결제조건은 30일↔60일로 틀립니다. 숙련도 보정과 스캔본 보정(1.5배)이 곱해집니다.',
  },
  {
    key: 'conversionErrorRate',
    label: '단위·통화 환산 오류 확률',
    unit: '%',
    scale: 100,
    step: 0.1,
    min: 0,
    max: 50,
    usedIn: '영문(USD) 견적과 포대 단위·VAT 포함 견적의 단가를 사람이 환산할 때 추가로 틀릴 확률입니다. 틀리면 업체 선택이 바뀌거나 발주 단가가 틀려 정산 불일치가 생깁니다.',
  },
  {
    key: 'compareFixedMinutes',
    label: '비교표 작성·검토 고정 시간',
    unit: '분',
    scale: 1,
    step: 1,
    min: 0,
    max: 240,
    usedIn: '견적 건수와 상관없이 비교표를 정리하고 업체를 고르는 데 드는 시간입니다. 도구를 쓰면 표가 자동으로 만들어진다고 보고 40%만 듭니다. 원가분석 숙련도로 보정합니다.',
  },
  {
    key: 'toolReviewMinutesPerQuote',
    label: '도구 결과 검토 시간 (견적 1건당)',
    unit: '분',
    scale: 1,
    step: 0.1,
    min: 0,
    max: 30,
    usedIn: '도구가 추출한 값을 원문 근거와 대조하는 시간입니다. 도구를 써도 사람의 검토가 남는다는 원칙을 반영한 값입니다.',
  },
  {
    key: 'mismatchReworkMinutes',
    label: '정산 불일치 재작업 시간',
    unit: '분',
    scale: 1,
    step: 1,
    min: 0,
    max: 480,
    usedIn: '발주서 단가와 업체 청구 단가가 다를 때 원인을 찾고 수정 발주를 내는 데 드는 시간입니다. 입고 검수·정산 단계에 더해집니다.',
  },
  {
    key: 'workdayMinutes',
    label: '하루 근무시간',
    unit: '분',
    scale: 1,
    step: 10,
    min: 240,
    max: 720,
    usedIn: '담당자가 하루에 일할 수 있는 시간입니다. 긴급 건이 있으면 최대 90분까지 연장 근무를 합니다.',
  },
];

const fmtVal = (m: ParamMeta, v: number) => String(Math.round(v * m.scale * 1000) / 1000);

export function Assumptions() {
  const { state, update, reset } = useStore();
  const params = state.params;
  const toDraft = () => Object.fromEntries(META.map((m) => [m.key, fmtVal(m, params[m.key])])) as Record<Key, string>;
  const [draft, setDraft] = useState<Record<Key, string>>(toDraft);
  const [msg, setMsg] = useState('');
  const [seedInput, setSeedInput] = useState('');

  // 다른 곳(불러오기 등)에서 상태가 바뀌면 입력값을 다시 맞춘다
  useEffect(() => {
    setDraft(toDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const parsed = META.map((m) => {
    const v = Number(draft[m.key]);
    const ok = draft[m.key].trim() !== '' && Number.isFinite(v) && v >= m.min && v <= m.max;
    return { m, value: v / m.scale, ok };
  });
  const allOk = parsed.every((p) => p.ok);
  const changed = parsed.filter((p) => p.ok && Math.abs(p.value - params[p.m.key]) > 1e-9);

  const save = () => {
    if (!allOk || changed.length === 0) return;
    const detail = changed.map((p) => `${p.m.label}: ${fmtVal(p.m, params[p.m.key])}→${fmtVal(p.m, p.value)}${p.m.unit}`).join(', ');
    update((d) => {
      for (const p of changed) d.params[p.m.key] = p.value;
      logEvent(d, 'system', 'mgmt', '가정값 변경', detail);
    });
    setMsg(`저장했습니다. 다음 업무부터 적용됩니다. (${changed.length}개 변경)`);
  };

  const restore = () => {
    const diff = META.filter((m) => params[m.key] !== DEFAULT_PARAMS[m.key]);
    if (diff.length === 0) {
      setDraft(Object.fromEntries(META.map((m) => [m.key, fmtVal(m, DEFAULT_PARAMS[m.key])])) as Record<Key, string>);
      return;
    }
    const detail = diff.map((m) => `${m.label}: ${fmtVal(m, params[m.key])}→${fmtVal(m, DEFAULT_PARAMS[m.key])}${m.unit}`).join(', ');
    update((d) => {
      d.params = { ...DEFAULT_PARAMS };
      logEvent(d, 'system', 'mgmt', '가정값 변경 (기본값 복원)', detail);
    });
    setMsg('기본값으로 되돌렸습니다.');
  };

  const newSeed = () => {
    const raw = seedInput.trim();
    const seed = raw === '' ? Math.floor(Math.random() * 1_000_000_000) : Number(raw);
    if (!Number.isInteger(seed) || seed < 0) {
      alert('시드는 0 이상의 정수로 입력하세요.');
      return;
    }
    if (confirm(`시드 ${seed}로 처음부터 새로 시작할까요? 현재 진행 상황은 사라집니다. (필요하면 먼저 메뉴에서 내보내기를 하세요)`)) {
      reset(seed);
      setSeedInput('');
    }
  };

  return (
    <>
      <PageHead title="가정·설정" desc="시뮬레이션의 시간·오류 계산에 쓰는 가정값과 시드를 관리합니다." />
      <div className="notice notice-warn">
        <b>이 값들은 가정치입니다. 실측 자료가 없습니다.</b> 실제 회사에서 측정한 업무 시간이나 오류율이 아니라, 결과를 계산하려면 숫자가 있어야
        해서 그럴듯한 수준으로 정해 둔 값입니다. 도구 효과를 미리 정해 두지 않고 "필드 입력 시간 × 필드 수", "필드마다 일정 확률로 오입력" 같은
        업무 단위 모델로 계산하기 위해 필요합니다. 그래서 효과 검증 결과는 이 값에 따라 달라지고, 값을 바꿔 보면서 결과가 얼마나 민감하게 움직이는지
        확인할 수 있습니다.
      </div>

      <Card title="비용 모델" sub="변경 내용은 이벤트 기록에 남아 나중에 재현할 수 있습니다">
        <div>
          {parsed.map(({ m, ok }) => (
            <div key={m.key} className="param-row">
              <div>
                <strong style={{ fontSize: 13.5 }}>{m.label}</strong>
                <div className="faint">
                  기본값 {fmtVal(m, DEFAULT_PARAMS[m.key])}
                  {m.unit} · 범위 {m.min}~{m.max}
                  {m.unit}
                </div>
              </div>
              <div>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                  <input
                    type="number"
                    step={m.step}
                    min={m.min}
                    max={m.max}
                    value={draft[m.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                    style={{ borderColor: ok ? undefined : 'var(--danger)' }}
                    aria-label={m.label}
                  />
                  <span className="faint">{m.unit}</span>
                </div>
                {!ok && <div style={{ color: 'var(--danger)', fontSize: 12 }}>범위를 확인하세요</div>}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                <span className="faint">이 값이 쓰이는 곳 · </span>
                {m.usedIn}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={save} disabled={!allOk || changed.length === 0}>
            저장
          </button>
          <button className="btn" onClick={restore}>
            기본값으로 되돌리기
          </button>
          {msg && <span className="faint">{msg}</span>}
        </div>
      </Card>

      <div className="grid grid-2">
        <Card title="숙련도 보정">
          <p className="muted" style={{ marginTop: 0 }}>
            가상 직원의 숙련도(0~100)는 업무를 할수록 오르고, 숙련도가 높을수록 같은 일을 빠르고 정확하게 합니다.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>보정</th>
                  <th>계산식</th>
                  <th className="r">숙련도 0</th>
                  <th className="r">숙련도 100</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>작업 시간</td>
                  <td className="mono">1.4 − 0.6 × 숙련도/100</td>
                  <td className="r">1.4배</td>
                  <td className="r">0.8배</td>
                </tr>
                <tr>
                  <td>오입력 확률</td>
                  <td className="mono">1.5 − 숙련도/100</td>
                  <td className="r">1.5배</td>
                  <td className="r">0.5배</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ marginBottom: 0 }}>
            현재 {state.employee.name}의 문서·데이터 처리 숙련도는 {state.employee.skills.docs.toFixed(1)}이라 입력 시간은{' '}
            {(1.4 - 0.6 * (state.employee.skills.docs / 100)).toFixed(2)}배, 오입력 확률은 {(1.5 - state.employee.skills.docs / 100).toFixed(2)}배입니다.
          </p>
        </Card>
        <Card title="수작업 오입력 모델">
          <ul className="lab-ul">
            <li>
              <b>일반 오입력</b> (오입력 확률 × 숙련도 보정): 단가 ±9~10%, 납기 ±2~3일, 결제조건 30일↔60일
            </li>
            <li>
              <b>영문(USD) 견적의 환율 착오</b> (환산 오류 확률): 지난 환율을 쓰는 식으로 단가가 ±3~6% 틀림
            </li>
            <li>
              <b>포대 단위·VAT 포함 견적</b> (환산 오류 확률): 절반은 VAT 포함가를 그대로 입력(+10%), 절반은 포장 단위를 잘못 나눔(20kg을 25kg으로
              착각해 −20%)
            </li>
            <li>
              <b>스캔본</b>: 입력 시간 1.3배, 오입력 확률 1.5배
            </li>
          </ul>
          <p className="faint" style={{ marginBottom: 0 }}>
            담당자는 틀린 줄 모르고 입력값으로 업체를 고르고 발주서를 씁니다. 비용은 실제 값으로 계산하므로, 오입력의 영향은 정해 둔 개선율이 아니라
            계산 과정에서 나옵니다.
          </p>
        </Card>
      </div>

      <Card title="시드" sub="같은 시드면 시장가격·수요·업체 응답이 항상 똑같이 나옵니다">
        <div className="row">
          <span>
            현재 시드 <span className="mono">{state.seed}</span>
          </span>
          <input type="number" placeholder="새 시드 (비우면 무작위)" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} style={{ width: 200 }} />
          <button className="btn" onClick={newSeed} style={{ color: 'var(--danger)' }}>
            다른 시드로 새로 시작
          </button>
        </div>
      </Card>
    </>
  );
}
