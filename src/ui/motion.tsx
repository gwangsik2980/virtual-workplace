import Lenis from 'lenis';
import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/* ------------------------------------------------------------------
   부드러운 스크롤 (Lenis)와 스크롤 잠금
   ------------------------------------------------------------------ */

let lenis: Lenis | null = null;
let lockCount = 0;

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function initSmoothScroll(): void {
  if (lenis || reduceMotion()) return;
  lenis = new Lenis({
    smoothWheel: true,
    // 드로어·메뉴처럼 자체 스크롤이 있는 곳은 Lenis가 가로채지 않게 한다
    prevent: (node: HTMLElement) => !!node.closest?.('.drawer, .navmenu, .table-wrap, .kanban, [data-lenis-prevent]'),
  });
  const raf = (t: number) => {
    lenis?.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

export function lockScroll(): void {
  lockCount++;
  lenis?.stop();
  const h = document.documentElement.style;
  h.overflow = 'hidden';
}

export function unlockScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;
  lenis?.start();
  document.documentElement.style.removeProperty('overflow');
}

export function scrollToTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}

/* 1920px보다 넓은 화면에서도 비율대로 계속 커지게 한다 (계수 0.6666) */
export function applyAdaptiveGrid(): void {
  const FONT_BASE = 16;
  const baseWidth = 1920;
  const coef = 0.6666;
  const w = window.innerWidth;
  const widthReduction = ((baseWidth - w) / baseWidth) * 100;
  const size = FONT_BASE - (FONT_BASE * (widthReduction * coef)) / 100;
  if (size > FONT_BASE) document.documentElement.style.fontSize = `${size}px`;
  else document.documentElement.style.removeProperty('font-size');
}

/* ------------------------------------------------------------------
   인트로 완료 신호
   ------------------------------------------------------------------ */

let introDone = false;
const introListeners = new Set<() => void>();

export function markIntroDone(): void {
  introDone = true;
  introListeners.forEach((l) => l());
}

export function useIntroReady(): boolean {
  const [ready, setReady] = useState(introDone);
  useEffect(() => {
    if (introDone) {
      setReady(true);
      return;
    }
    const l = () => setReady(true);
    introListeners.add(l);
    return () => {
      introListeners.delete(l);
    };
  }, []);
  return ready;
}

/* ------------------------------------------------------------------
   화면에 들어오면 한 번 등장
   ------------------------------------------------------------------ */

export function useInViewOnce<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return [ref, inView];
}

interface RevealProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  delay?: number;
  /** 시작 위치 (rem) */
  y?: number;
  scale?: number;
  className?: string;
  style?: CSSProperties;
  /** 인트로가 끝난 뒤에만 시작 */
  gated?: boolean;
}

export function Reveal({ children, as = 'div', delay = 0, y = 1, scale = 1, className = '', style, gated }: RevealProps) {
  const [ref, inView] = useInViewOnce<HTMLElement>();
  const ready = useIntroReady();
  const show = inView && (!gated || ready);
  return createElement(
    as,
    {
      ref,
      className: `reveal ${show ? 'in' : ''} ${className}`,
      style: { ...style, ['--rd' as string]: `${delay}ms`, ['--ry' as string]: `${y}rem`, ['--rs' as string]: scale },
    },
    children,
  );
}

/** 줄 단위로 아래에서 올라오는 제목 */
export function LineReveal({
  lines,
  as = 'h2',
  delay = 0,
  stagger = 110,
  className,
  style,
  gated,
}: {
  lines: ReactNode[];
  as?: keyof JSX.IntrinsicElements;
  delay?: number;
  stagger?: number;
  className?: string;
  style?: CSSProperties;
  gated?: boolean;
}) {
  const [ref, inView] = useInViewOnce<HTMLElement>();
  const ready = useIntroReady();
  const show = inView && (!gated || ready);
  return createElement(
    as,
    { ref, className: `${show ? 'in' : ''} ${className ?? ''}`, style },
    lines.map((l, i) => (
      <span key={i} className="line-mask">
        <span className="line-inner" style={{ ['--ld' as string]: `${delay + i * stagger}ms` }}>
          {l}
        </span>
      </span>
    )),
  );
}

/** 단어 단위로 올라오는 문장 */
export function WordReveal({ parts, as = 'p', className, style, stagger = 35 }: { parts: { text: string; muted?: boolean }[]; as?: keyof JSX.IntrinsicElements; className?: string; style?: CSSProperties; stagger?: number }) {
  const [ref, inView] = useInViewOnce<HTMLElement>();
  let i = 0;
  return createElement(
    as,
    { ref, className: `${inView ? 'in' : ''} ${className ?? ''}`, style },
    parts.map((p, pi) => (
      <span key={pi} style={p.muted ? { color: 'var(--muted)' } : undefined}>
        {p.text.split(' ').map((w, wi) => {
          const d = i++ * stagger;
          return (
            <span key={wi}>
              <span className="word" style={{ ['--wd' as string]: `${d}ms` }}>
                {w}
              </span>{' '}
            </span>
          );
        })}
      </span>
    )),
  );
}

/**
 * 스크롤에 따라 숫자가 올라간다.
 * 요소의 위쪽이 화면 아래에 닿을 때 0, 요소의 가운데가 화면 가운데에 올 때 1.
 */
export function useScrollCount(target: number): [React.RefObject<HTMLElement>, number] {
  const ref = useRef<HTMLElement>(null);
  const [value, setValue] = useState(reduceMotion() ? target : 0);
  useEffect(() => {
    if (reduceMotion()) {
      setValue(target);
      return;
    }
    let last = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh; // top이 화면 아래
      const end = vh / 2 - r.height / 2; // center가 화면 가운데
      const p = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end)));
      // 한 번 올라간 숫자는 다시 내려가지 않는다
      setValue((prev) => Math.min(target, Math.max(prev, Math.round(p * target))));
    };
    const onScroll = () => {
      const now = performance.now();
      if (now - last < 30) {
        if (!frame) frame = requestAnimationFrame(update);
        return;
      }
      last = now;
      update();
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target]);
  return [ref, value];
}

/* ------------------------------------------------------------------
   아이콘 (1em, currentColor)
   ------------------------------------------------------------------ */

const svg = (children: ReactNode, viewBox = '0 0 24 24', extra: Record<string, unknown> = {}) => (
  <svg width="1em" height="1em" viewBox={viewBox} aria-hidden focusable="false" {...extra}>
    {children}
  </svg>
);

/** 앱 표식: 네 칸 중 한 칸이 다른 모양. 관찰 → 발견 → 개선 → 검증의 네 단계를 뜻한다 */
export const Mark = () =>
  svg(
    <>
      <rect x="4" y="4" width="18" height="18" rx="5" fill="currentColor" />
      <rect x="26" y="4" width="18" height="18" rx="9" fill="currentColor" opacity="0.55" />
      <rect x="4" y="26" width="18" height="18" rx="9" fill="currentColor" opacity="0.55" />
      <rect x="26" y="26" width="18" height="18" rx="5" fill="currentColor" opacity="0.55" />
    </>,
    '0 0 48 48',
  );

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const ArrowRight = () => svg(<path d="M5 12h14M13 6l6 6-6 6" {...stroke} />);
export const ArrowUpRight = () => svg(<path d="M7 17 17 7M8 7h9v9" {...stroke} />);
export const CloseIcon = () => svg(<path d="M4 4l16 16M20 4 4 20" {...stroke} />);
export const MenuIcon = () => svg(<path d="M4 6h16M4 12h16M4 18h16" {...stroke} />);
export const DotIcon = () =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </>,
  );
export const Star = () => svg(<path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5z" fill="currentColor" />);
