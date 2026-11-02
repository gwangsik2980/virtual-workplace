import { useRef, useState } from 'react';
import { exportJson, importJson } from './sim/persistence';
import { formatDay } from './sim/util';
import { CaseDrawer } from './ui/components/CaseDrawer';
import { Assumptions } from './ui/screens/Assumptions';
import { Desk } from './ui/screens/Desk';
import { Learning } from './ui/screens/Learning';
import { Market } from './ui/screens/Market';
import { Overview } from './ui/screens/Overview';
import { Performance } from './ui/screens/Performance';
import { ProcessMap } from './ui/screens/ProcessMap';
import { ToolLab } from './ui/screens/ToolLab';
import { StoreProvider, useStore, type ScreenId } from './ui/store';

const NAV: { id: ScreenId; label: string; icon: string }[] = [
  { id: 'overview', label: '기업 현황', icon: '◫' },
  { id: 'desk', label: '직원 업무', icon: '◉' },
  { id: 'process', label: '프로세스 맵', icon: '⇉' },
  { id: 'market', label: '시장·원가·업체', icon: '∿' },
  { id: 'lab', label: 'AI Tool Lab', icon: '⚙' },
  { id: 'performance', label: '성과·타임라인', icon: '▤' },
  { id: 'learning', label: '학습 노트', icon: '✎' },
  { id: 'assumptions', label: '가정·설정', icon: '≡' },
];

function Shell() {
  const { state, advance, screen, setScreen, caseId, openCase, saveOk, replace, reset } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const newConcepts = Object.keys(state.learning.unlocked).filter((k) => !state.learning.understood[k]).length;

  const doExport = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `virtual-workplace-day${state.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenu(false);
  };

  const doImport = async (f: File) => {
    try {
      replace(importJson(await f.text()));
      setMenu(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    }
  };

  const doReset = () => {
    if (confirm('처음부터 다시 시작할까요? 현재 진행 상황은 사라집니다. (필요하면 먼저 내보내기를 하세요)')) {
      reset();
      setMenu(false);
    }
  };

  const Screen = {
    overview: Overview,
    desk: Desk,
    process: ProcessMap,
    market: Market,
    lab: ToolLab,
    performance: Performance,
    learning: Learning,
    assumptions: Assumptions,
  }[screen];

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-title">VIRTUAL WORKPLACE</div>
          <div className="brand-sub">구매 직무 관찰·학습·개선</div>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-btn ${screen === n.id ? 'active' : ''}`} onClick={() => setScreen(n.id)}>
            <span aria-hidden style={{ width: 16, textAlign: 'center' }}>
              {n.icon}
            </span>
            {n.label}
            {n.id === 'learning' && newConcepts > 0 && <span className="nav-badge">{newConcepts}</span>}
          </button>
        ))}
        <div className="sidebar-foot">
          회사·인물·업체·시세는 모두 가상 데이터입니다.
          <br />
          {saveOk ? '이 브라우저에 자동 저장됨' : '자동 저장 실패: 내보내기로 백업하세요'}
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="topbar-date">
            <strong>
              {state.company.name} · {formatDay(state.startDate, state.day)}
            </strong>
            <span>
              {state.day}일차 근무 시작 전 · 담당 {state.employee.name} {state.employee.rank}
            </span>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => advance(1)}>
              하루 진행 ▶
            </button>
            <button className="btn" onClick={() => advance(5)}>
              1주 ▶▶
            </button>
            <button className="btn" onClick={() => advance(20)}>
              1개월 ▶▶▶
            </button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost" onClick={() => setMenu((m) => !m)} aria-label="메뉴">
                ⋯
              </button>
              {menu && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 40, zIndex: 20, width: 220, padding: 8 }}>
                  <button className="nav-btn" onClick={doExport}>
                    저장 파일 내보내기
                  </button>
                  <button className="nav-btn" onClick={() => fileRef.current?.click()}>
                    저장 파일 불러오기
                  </button>
                  <button className="nav-btn" onClick={doReset} style={{ color: 'var(--danger)' }}>
                    처음부터 다시 시작
                  </button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doImport(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </header>
        <main className="content">
          <Screen />
        </main>
      </div>
      {caseId && <CaseDrawer caseId={caseId} onClose={() => openCase(null)} />}
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
