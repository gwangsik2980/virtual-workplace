import { useEffect, useRef, useState } from 'react';
import { exportJson, importJson } from './sim/persistence';
import { formatDay } from './sim/util';
import { AboutContent } from './ui/components/About';
import { CaseDrawer } from './ui/components/CaseDrawer';
import {
  applyAdaptiveGrid,
  initSmoothScroll,
  CloseIcon,
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
import { TeamChat } from './ui/screens/TeamChat';
import { Performance } from './ui/screens/Performance';
import { ProcessMap } from './ui/screens/ProcessMap';
import { ToolLab } from './ui/screens/ToolLab';
import { AlertsBell, AwayModal, ClockChip } from './ui/components/LiveWidgets';
import { useInstall } from './ui/install';
import { useChatUnread } from './ui/chatRead';
import { PushSync } from './ui/push';
import { DeviceSync, syncAvailable } from './ui/sync';
import { OwnerKeyDialog } from './ui/components/OwnerKey';
import { RealtimeProvider } from './ui/realtime';
import { StoreProvider, useStore, type ScreenId } from './ui/store';
import { applyTheme, getThemePref, resolveTheme, setThemePref, watchSystemTheme, type ThemePref } from './ui/theme';

const NAV: { id: ScreenId; label: string }[] = [
  { id: 'overview', label: '기업 현황' },
  { id: 'desk', label: '직원 업무' },
  { id: 'chat', label: '소통 공간' },
  { id: 'process', label: '프로세스 맵' },
  { id: 'market', label: '시장·원가·업체' },
  { id: 'lab', label: 'AI Tool Lab' },
  { id: 'performance', label: '성과·타임라인' },
  { id: 'learning', label: '학습 노트' },
];

const SCREENS = {
  overview: Overview,
  desk: Desk,
  chat: TeamChat,
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

/* ------------------------------------------------------------------
   전체 화면 메뉴
   ------------------------------------------------------------------ */
function NavMenu({ open, onClose, onExport, onImport, onReset, onOwnerKey, themePref, onTheme }: { open: boolean; onClose: () => void; onExport: () => void; onImport: () => void; onReset: () => void; onOwnerKey: () => void; themePref: ThemePref; onTheme: (p: ThemePref) => void }) {
  const { state, screen, setScreen } = useStore();
  const newConcepts = Object.keys(state.learning.unlocked).filter((k) => !state.learning.understood[k]).length;
  const chatUnread = useChatUnread().total;

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
              {n.id === 'chat' && chatUnread > 0 && <span className="nbadge">안 읽음 {chatUnread}</span>}
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
          {syncAvailable() && (
            <button tabIndex={open ? 0 : -1} className="navmenu-settings" onClick={onOwnerKey}>
              관리자 키
            </button>
          )}
          <button
            tabIndex={open ? 0 : -1}
            className="navmenu-settings"
            aria-current={screen === 'assumptions' ? 'page' : undefined}
            onClick={() => {
              onClose();
              setScreen('assumptions');
            }}
          >
            가정·설정
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { state, screen, setScreen, caseId, openCase, saveOk, replace, reset } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const [link, setLink] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const newConcepts = Object.keys(state.learning.unlocked).filter((k) => !state.learning.understood[k]).length;
  // 메뉴 버튼 숫자는 새 개념만. 안 읽은 메신저는 메뉴를 열었을 때 '소통 공간' 옆에만 보인다
  const menuBadge = newConcepts;
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
            <button className="menu-btn" onClick={() => setMenu(true)} aria-label={menuBadge > 0 ? `메뉴 열기, 새 소식 ${menuBadge}개` : '메뉴 열기'}>
              <MenuIcon />
              <span>Menu</span>
              {menuBadge > 0 && <span className="badge-dot">{menuBadge}</span>}
            </button>
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
          <span>© 2026 GWANG. All rights reserved.</span>
          {/* 저장이 실패할 때만 알린다 */}
          {!saveOk && <span>자동 저장 실패: 메뉴에서 내보내기로 백업하세요</span>}
        </div>
      </footer>
      <NavMenu
        open={menu}
        onClose={() => setMenu(false)}
        onExport={doExport}
        onImport={() => fileRef.current?.click()}
        onReset={doReset}
        onOwnerKey={() => {
          setMenu(false);
          setLink(true);
        }}
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
      {link && <OwnerKeyDialog onClose={() => setLink(false)} />}
      <DeviceSync />
      <PushSync />
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
