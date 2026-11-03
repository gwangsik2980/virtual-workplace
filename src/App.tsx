import { useEffect, useRef, useState } from 'react';
import { exportJson, importJson } from './sim/persistence';
import { formatDay } from './sim/util';
import { CaseDrawer } from './ui/components/CaseDrawer';
import {
  applyAdaptiveGrid,
  ArrowRight,
  CloseIcon,
  initSmoothScroll,
  lockScroll,
  markIntroDone,
  Mark,
  MenuIcon,
  scrollToTop,
  unlockScroll,
} from './ui/motion';
import { Assumptions } from './ui/screens/Assumptions';
import { Desk } from './ui/screens/Desk';
import { Learning } from './ui/screens/Learning';
import { Market } from './ui/screens/Market';
import { Overview } from './ui/screens/Overview';
import { Performance } from './ui/screens/Performance';
import { ProcessMap } from './ui/screens/ProcessMap';
import { ToolLab } from './ui/screens/ToolLab';
import { StoreProvider, useStore, type ScreenId } from './ui/store';

const NAV: { id: ScreenId; label: string }[] = [
  { id: 'overview', label: '기업 현황' },
  { id: 'desk', label: '직원 업무' },
  { id: 'process', label: '프로세스 맵' },
  { id: 'market', label: '시장·원가·업체' },
  { id: 'lab', label: 'AI Tool Lab' },
  { id: 'performance', label: '성과·타임라인' },
  { id: 'learning', label: '학습 노트' },
  { id: 'assumptions', label: '가정·설정' },
];

const SCREENS = {
  overview: Overview,
  desk: Desk,
  process: ProcessMap,
  market: Market,
  lab: ToolLab,
  performance: Performance,
  learning: Learning,
  assumptions: Assumptions,
};

/* ------------------------------------------------------------------
   인트로 로더: 000 → 100을 1.3초 동안 세고 위로 밀려 올라간다
   ------------------------------------------------------------------ */
function PageLoader() {
  const [progress, setProgress] = useState(0);
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    lockScroll();
    const FILL_MS = 1300;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FILL_MS);
      setProgress(Math.round(ease(t) * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setOut(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => {
      setGone(true);
      markIntroDone();
      unlockScroll();
    }, 750);
    return () => clearTimeout(t);
  }, [out]);

  if (gone) return null;
  return (
    <div className={`loader ${out ? 'out' : ''}`} role="status" aria-live="polite">
      <div className="loader-center">
        <div className="loader-brand">
          <span className="brand-mark">
            <Mark />
          </span>
          Virtual Workplace
        </div>
        <p className="loader-tag">가상 직장에서 구매를 배우고, 도구로 일을 바꿉니다.</p>
      </div>
      <div className="loader-progress">
        <div className="loader-track">
          <div className="loader-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loader-meta">
          <span>Loading</span>
          <span className="count">{String(progress).padStart(3, '0')}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   전체 화면 메뉴
   ------------------------------------------------------------------ */
function NavMenu({ open, onClose, onExport, onImport, onReset }: { open: boolean; onClose: () => void; onExport: () => void; onImport: () => void; onReset: () => void }) {
  const { state, screen, setScreen } = useStore();
  const newConcepts = Object.keys(state.learning.unlocked).filter((k) => !state.learning.understood[k]).length;

  useEffect(() => {
    if (!open) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  return (
    <div className={`navmenu ${open ? 'open' : ''}`} aria-hidden={!open} role="dialog" aria-modal="true" aria-label="메뉴">
      <div className="shell navmenu-top">
        <span className="brand">
          <span className="brand-mark" style={{ color: 'var(--accent-from)' }}>
            <Mark />
          </span>
          Virtual Workplace
        </span>
        <button className="navmenu-close" onClick={onClose} tabIndex={open ? 0 : -1}>
          <CloseIcon /> Close
        </button>
      </div>
      <ul className="shell navmenu-list">
        {NAV.map((n, i) => (
          <li key={n.id}>
            <button
              className={`navmenu-item ${screen === n.id ? 'current' : ''}`}
              style={{ transitionDelay: open ? `${i * 45 + 80}ms` : '0ms' }}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onClose();
                setScreen(n.id);
              }}
            >
              <span className="idx">0{i + 1}</span>
              <span className="lbl">{n.label}</span>
              {n.id === 'learning' && newConcepts > 0 && <span className="nbadge">새 개념 {newConcepts}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="shell navmenu-bottom">
        <span>
          {formatDay(state.startDate, state.day)} — {state.day}일차
        </span>
        <div className="actions">
          <button tabIndex={open ? 0 : -1} onClick={onExport}>
            저장 파일 내보내기
          </button>
          <button tabIndex={open ? 0 : -1} onClick={onImport}>
            불러오기
          </button>
          <button tabIndex={open ? 0 : -1} onClick={onReset} style={{ color: '#e3a173' }}>
            처음부터 다시 시작
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { state, advance, screen, setScreen, caseId, openCase, saveOk, replace, reset } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const newConcepts = Object.keys(state.learning.unlocked).filter((k) => !state.learning.understood[k]).length;

  useEffect(() => {
    initSmoothScroll();
    applyAdaptiveGrid();
    window.addEventListener('resize', applyAdaptiveGrid);
    return () => window.removeEventListener('resize', applyAdaptiveGrid);
  }, []);

  useEffect(() => {
    scrollToTop();
  }, [screen]);

  useEffect(() => {
    if (!caseId) return;
    lockScroll();
    return () => unlockScroll();
  }, [caseId]);

  const doExport = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `virtual-workplace-day${state.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
    if (confirm('처음부터 다시 시작할까요? 현재 진행 상황은 사라집니다. 필요하면 먼저 내보내기를 하세요.')) {
      reset();
      setMenu(false);
    }
  };

  const Screen = SCREENS[screen];

  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <PageLoader />
      <header className="header">
        <div className="shell header-row">
          <button className="brand" onClick={() => setScreen('overview')} aria-label="기업 현황으로">
            <span className="brand-mark">
              <Mark />
            </span>
            Virtual Workplace
          </button>
          <nav className="header-nav" aria-label="화면">
            {NAV.map((n) => (
              <button key={n.id} aria-current={screen === n.id ? 'page' : undefined} onClick={() => setScreen(n.id)}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="header-right">
            <span className="chip-glass clock-chip" title={saveOk ? '이 브라우저에 자동 저장됨' : '자동 저장 실패: 내보내기로 백업하세요'}>
              <span className="label">{state.company.name}</span>
              <span className="val">{formatDay(state.startDate, state.day)}</span>
              <span className="sep">•</span>
              <span className="val">{state.day}일차</span>
            </span>
            <button className="menu-btn" onClick={() => setMenu(true)} aria-label="메뉴 열기">
              <MenuIcon />
              <span>Menu</span>
              {newConcepts > 0 && <span className="badge-dot">{newConcepts}</span>}
            </button>
          </div>
          <div className="day-controls">
            <button className="pill pill-dark pill-arrow" onClick={() => advance(1)}>
              하루 진행
              <span className="arrow-badge">
                <ArrowRight />
              </span>
            </button>
            <button className="pill pill-sm" onClick={() => advance(5)}>
              1주
            </button>
            <button className="pill pill-sm" onClick={() => advance(20)}>
              1개월
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="shell content">
        <Screen key={screen} />
      </main>
      <footer className="shell" style={{ paddingBottom: '2.5rem' }}>
        <div className="row between faint" style={{ borderTop: '1px solid var(--line)', paddingTop: '1.25rem', fontSize: '0.75rem' }}>
          <span>회사, 인물, 업체, 시세는 모두 가상 데이터입니다.</span>
          <span>{saveOk ? '이 브라우저에 자동 저장됨' : '자동 저장 실패: 메뉴에서 내보내기로 백업하세요'}</span>
        </div>
      </footer>
      <NavMenu
        open={menu}
        onClose={() => setMenu(false)}
        onExport={doExport}
        onImport={() => fileRef.current?.click()}
        onReset={doReset}
      />
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
      {caseId && <CaseDrawer caseId={caseId} onClose={() => openCase(null)} />}
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
