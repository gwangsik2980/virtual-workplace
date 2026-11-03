/**
 * 라이트·다크 테마.
 * 선택값: 'system' (기기 설정 따름), 'light', 'dark'. 이 브라우저에만 저장된다.
 * 실제 적용은 <html data-theme="light|dark">로 한다. index.html의 인라인 스크립트가
 * 첫 화면을 그리기 전에 같은 규칙으로 적용해 깜빡임을 막는다.
 */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'virtual-workplace/theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(pref: ThemePref, animate = false): void {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 400);
  }
  const resolved = resolveTheme(pref);
  root.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0c0c0c' : '#ffffff');
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* 저장이 막혀도 이번 세션에는 적용된다 */
  }
  applyTheme(pref, true);
}

/** 기기 설정이 바뀌면 'system'일 때만 따라간다 */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const h = () => {
    if (getThemePref() === 'system') {
      applyTheme('system', true);
      onChange();
    }
  };
  mq.addEventListener('change', h);
  return () => mq.removeEventListener('change', h);
}
