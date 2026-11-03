import { useEffect, useRef, useState } from 'react';
import { exportJson, importJson } from './sim/persistence';
import { formatDay } from './sim/util';
import { AboutContent } from './ui/components/About';
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
  MoonIcon,
  SunIcon,
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
import { AlertsBell, AwayModal, ClockChip } from './ui/components/LiveWidgets';
import { useInstall } from './ui/install';
import { RealtimeProvider, useRealtime } from './ui/realtime';
import { StoreProvider, useStore, type ScreenId } from './ui/store';
import { applyTheme, getThemePref, resolveTheme, setThemePref, watchSystemTheme, type ThemePref } from './ui/theme';

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

/** 메뉴 하단: 홈 화면 앱 설치 */
function InstallAction({ open }: { open: boolean }) {
  const inst = useInstall();
  if (inst.installed) return null;
  if (inst.canPrompt)
    return (
      <button tabIndex={open ? 0 : -1} onClick={() => void inst.install()} style={{ color: '#e3a173' }}>
        앱으로 설치
      </button>
    );
  if (inst.ios) return <span className="install-hint">아이폰: 공유 버튼 → 홈 화면에 추가</span>;
  return null;
}

/** 헤더 진행 버튼 줄: 실시간 / 수동 전환 */
function ModeSwitch() {
  const { state, update } = useStore();
  const mode = state.clock?.mode ?? 'manual';
  const set = (m: 'realtime' | 'manual') => {
    if (m === mode) return;
    if (m === 'realtime' && !confirm('실시간으로 바꾸면 회사 날짜가 현실 날짜를 따라갑니다. 지금 회사의 시작일이 현실과 다르면 날짜가 어긋날 수 있어서, 처음부터 다시 시작하는 것을 추천해요. 그래도 바꿀까요?')) return;
    update((d) => {
      d.clock = { mode: m };
    });
  };
  return (
    <span className="mode-switch" role="group" aria-label="시간 흐름">
      {(['realtime', 'manual'] as const).map((m) => (
        <button key={m} aria-pressed={mode === m} className={mode === m ? 'on' : ''} onClick={() => set(m)} title={m === 'realtime' ? '현실 시간과 함께 흐름' : '버튼으로만 진행'}>
          {m === 'realtime' ? '실시간' : '수동'}
        </button>
      ))}
    </span>
  );
}

/** 메뉴 하단: 시간 흐름 방식 (실시간 / 수동) */
function TimeModeChoice({ open }: { open: boolean }) {
  const { state, update } = useStore();
  const rt = useRealtime();
  const mode = state.clock?.mode ?? 'manual';
  const set = (m: 'realtime' | 'manual') => {
    if (m === mode) return;
    if (m === 'realtime' && !confirm('실시간으로 바꾸면 회사 날짜가 현실 날짜를 따라갑니다. 지금 진행 중인 회사는 시작일이 현실과 다를 수 있어서, 처음부터 다시 시작하는 것을 추천해요. 그래도 바꿀까요?')) return;
    update((d) => {
      d.clock = { mode: m };
    });
  };
  return (
    <span className="theme-choice" role="group" aria-label="시간 흐름" title={rt.isRealtime ? '현실 날짜와 함께 흐르는 중' : '버튼으로만 진행'}>
      {(['realtime', 'manual'] as const).map((m) => (
        <button key={m} tabIndex={open ? 0 : -1} aria-pressed={mode === m} className={mode === m ? 'on' : ''} onClick={() => set(m)}>
          {m === 'realtime' ? '실시간' : '수동'}
        </button>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------
   전체 화면 메뉴
   ------------------------------------------------------------------ */
function NavMenu({ open, onClose, onExport, onImport, onReset, themePref, onTheme }: { open: boolean; onClose: () => void; onExport: () => void; onImport: () => void; onReset: () => void; themePref: ThemePref; onTheme: (p: ThemePref) => void }) {
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
          <InstallAction open={open} />
          <TimeModeChoice open={open} />
          <span className="theme-choice" role="group" aria-label="화면 테마">
            {(['system', 'light', 'dark'] as ThemePref[]).map((p) => (
              <button key={p} tabIndex={open ? 0 : -1} aria-pressed={themePref === p} className={themePref === p ? 'on' : ''} onClick={() => onTheme(p)}>
                {p === 'system' ? '기기 설정' : p === 'light' ? '라이트' : '다크'}
              </button>
            ))}
          </span>
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
  const { state, advance, undo, undoCount, undoLabel, screen, setScreen, caseId, openCase, saveOk, replace, reset } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  // 폰에서 진행 버튼 줄 펼침 여부 (이 브라우저에 기억)
  const [controlsOpen, setControlsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('virtual-workplace/controls-open') === '1';
    } catch {
      return false;
    }
  });
  const toggleControls = () =>
    setControlsOpen((o) => {
      try {
        localStorage.setItem('virtual-workplace/controls-open', o ? '0' : '1');
      } catch {
        /* 무시 */
      }
      return !o;
    });
  const headerRef = useRef<HTMLElement>(null);
  const newConcepts = Object.keys(state.learning.unlocked).filter((k) => !state.learning.understood[k]).length;
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref);
  const [, bump] = useState(0);
  const resolved = resolveTheme(themePref);
  const toggleTheme = () => {
    // 지금 보이는 테마의 반대로 고정한다
    const next: ThemePref = resolved === 'dark' ? 'light' : 'dark';
    setThemePref(next);
    setThemePrefState(next);
  };
  const chooseTheme = (p: ThemePref) => {
    setThemePref(p);
    setThemePrefState(p);
  };

  useEffect(() => {
    applyTheme(getThemePref());
    return watchSystemTheme(() => bump((x) => x + 1));
  }, []);

  useEffect(() => {
    initSmoothScroll();
    applyAdaptiveGrid();
    window.addEventListener('resize', applyAdaptiveGrid);
    return () => window.removeEventListener('resize', applyAdaptiveGrid);
  }, []);

  useEffect(() => {
    scrollToTop();
    setAbout(false);
  }, [screen]);

  // Ctrl+Z / Cmd+Z 로 되돌리기 (입력칸에서는 원래 동작 유지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // About 패널: Esc나 헤더 바깥을 누르면 닫는다
  useEffect(() => {
    if (!about) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbout(false);
    const onDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setAbout(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [about]);

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
      <header className={`header ${about ? 'about-open' : ''}`} ref={headerRef}>
        <div className="shell header-row">
          <div className="brand-group">
            <button className="brand" onClick={() => setScreen('overview')} aria-label="기업 현황으로">
              <span className="brand-mark">
                <Mark />
              </span>
              <span className="brand-text">Virtual Workplace</span>
            </button>
            <button className="about-btn" onClick={() => setAbout((a) => !a)} aria-expanded={about} aria-controls="about-panel">
              About
              <span className="about-caret" aria-hidden>
                <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
          </div>
          <nav className="header-nav" aria-label="화면">
            {NAV.map((n) => (
              <button key={n.id} aria-current={screen === n.id ? 'page' : undefined} onClick={() => setScreen(n.id)}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="header-right">
            <ClockChip title={saveOk ? '이 브라우저에 자동 저장됨' : '자동 저장 실패: 내보내기로 백업하세요'} />
            <AlertsBell />
            <button
              className="theme-btn"
              onClick={toggleTheme}
              aria-label={resolved === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              title={resolved === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              className="theme-btn controls-toggle"
              onClick={toggleControls}
              aria-expanded={controlsOpen}
              aria-controls="day-controls"
              aria-label={controlsOpen ? '진행 버튼 접기' : '진행 버튼 펼치기'}
              title={controlsOpen ? '진행 버튼 접기' : '진행 버튼 펼치기'}
            >
              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={controlsOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
              </svg>
            </button>
            <button className="menu-btn" onClick={() => setMenu(true)} aria-label="메뉴 열기">
              <MenuIcon />
              <span>Menu</span>
              {newConcepts > 0 && <span className="badge-dot">{newConcepts}</span>}
            </button>
          </div>
          <div className={`day-controls ${controlsOpen ? 'open' : ''}`} id="day-controls">
            <button
              className="pill pill-sm undo-btn"
              onClick={undo}
              disabled={undoCount === 0}
              aria-label={undoCount ? `되돌리기: ${undoLabel} 이전으로` : '되돌릴 내용 없음'}
              title={undoCount ? `${undoLabel} 이전으로 되돌리기 (남은 ${undoCount}번)` : '되돌릴 내용이 없습니다'}
            >
              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
              <span className="undo-text">되돌리기</span>
            </button>
            <button className="pill pill-dark pill-arrow" onClick={() => advance(1)}>
              하루 진행
              <span className="arrow-badge">
                <ArrowRight />
              </span>
            </button>
            <button className="pill pill-sm" onClick={() => advance(5)}>
              1주
            </button>
            <ModeSwitch />
          </div>
        </div>
        <div id="about-panel" className="about-panel" aria-hidden={!about} data-lenis-prevent>
          <div className="about-inner">
            <div className="ink about-sheet">
              <div className="shell about-shell">
                <p className="about-lead">
                  <span className="intro-eyebrow">About this project</span>
                  가상 기업에서 구매 업무를 관찰하고, 도구로 바꾸고, 효과를 검증하는 시뮬레이션입니다.
                </p>
                <AboutContent />
              </div>
            </div>
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
        themePref={themePref}
        onTheme={chooseTheme}
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
      <AwayModal />
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <RealtimeProvider>
        <Shell />
      </RealtimeProvider>
    </StoreProvider>
  );
}
