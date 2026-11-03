import type { ReactNode } from 'react';
import { ArrowUpRight, LineReveal, Reveal, useScrollCount } from '../motion';

/**
 * 화면 공통 편집 디자인 부품.
 * 기업 현황 히어로와 같은 문법을 다른 화면에서도 쓰기 위한 것.
 */

/** 화면 맨 위 히어로: 워터마크 + 눈썹 글씨 + 줄 단위 큰 제목 + 설명, 오른쪽에 요약 영역 */
export function ScreenHero({
  eyebrow,
  lines,
  lead,
  watermark,
  aside,
  footer,
}: {
  eyebrow: string;
  lines: string[];
  lead?: ReactNode;
  watermark?: string;
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="screen-hero" aria-label={lines.join(' ')}>
      {watermark && (
        <div className="screen-hero-wm" aria-hidden>
          {watermark}
        </div>
      )}
      <div className="screen-hero-grid">
        <div className="screen-hero-main">
          <Reveal y={0.625}>
            <span className="eyebrow">{eyebrow}</span>
          </Reveal>
          <LineReveal as="h1" lines={lines} delay={80} stagger={110} />
          {lead && (
            <Reveal delay={260} y={0.75}>
              <p className="screen-hero-lead">{lead}</p>
            </Reveal>
          )}
        </div>
        {aside && (
          <Reveal delay={320} y={1} scale={0.97} className="screen-hero-aside">
            {aside}
          </Reveal>
        )}
      </div>
      {footer && (
        <Reveal delay={420} y={0} className="screen-hero-foot">
          {footer}
        </Reveal>
      )}
    </section>
  );
}

/** 히어로 오른쪽에 두는 작은 숫자 묶음 */
export function HeroFacts({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div className="hero-facts">
      {items.map((it) => (
        <div key={it.label} className="hero-fact">
          <span className="hero-fact-label">{it.label}</span>
          <span className="hero-fact-value">{it.value}</span>
          {it.note && <span className="hero-fact-note">{it.note}</span>}
        </div>
      ))}
    </div>
  );
}

/** 섹션 제목: 눈썹 글씨 + 큰 제목 + 오른쪽 동작 */
export function SectionHead({ eyebrow, title, desc, actions }: { eyebrow: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="section-head">
      <div className="section-head-main">
        <Reveal y={0.5}>
          <span className="eyebrow">{eyebrow}</span>
        </Reveal>
        <LineReveal lines={[title]} delay={80} />
        {desc && (
          <Reveal delay={160} y={0.5}>
            <p className="section-head-desc">{desc}</p>
          </Reveal>
        )}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

function CountItem({ value, suffix, label, delay, format }: { value: number; suffix?: string; label: string; delay: number; format?: (v: number) => string }) {
  const [ref, v] = useScrollCount(value);
  return (
    <Reveal as="li" delay={delay} y={1.25}>
      <div ref={ref as React.RefObject<HTMLDivElement>} className="num-big">
        {format ? format(v) : v.toLocaleString('ko-KR')}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="num-label">{label}</div>
    </Reveal>
  );
}

/** 검정 숫자 패널. 스크롤하면 숫자가 올라간다 */
export function InkStats({
  eyebrow,
  title,
  items,
  children,
}: {
  eyebrow: string;
  title: string;
  items: { value: number; suffix?: string; label: string; format?: (v: number) => string }[];
  children?: ReactNode;
}) {
  return (
    <Reveal y={2.5} scale={0.99}>
      <section className="ink stats-panel">
        <span className="eyebrow">{eyebrow}</span>
        <LineReveal lines={[title]} delay={120} />
        <ul className="stats-grid" style={{ listStyle: 'none' }}>
          {items.map((it, i) => (
            <CountItem key={it.label} {...it} delay={i * 90} />
          ))}
        </ul>
        {children}
      </section>
    </Reveal>
  );
}

export interface RowItem {
  key: string;
  index?: string;
  title: ReactNode;
  desc?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
}

/** 줄 목록: 번호, 제목, 설명, 오른쪽 정보와 화살표. 마우스를 올리면 칠해진다 */
export function RowList({ items, empty }: { items: RowItem[]; empty?: ReactNode }) {
  if (items.length === 0) return <div className="empty">{empty ?? '항목이 없습니다.'}</div>;
  return (
    <ul className="row-list">
      {items.map((it, i) => (
        <Reveal as="li" key={it.key} delay={Math.min(i, 8) * 60} y={1}>
          <button className={`row-item ${it.onClick ? 'clickable' : ''}`} onClick={it.onClick} disabled={!it.onClick} type="button">
            {it.index && <span className="row-index">{it.index}</span>}
            <span className="row-title">{it.title}</span>
            {it.desc && <span className="row-desc">{it.desc}</span>}
            {it.meta && <span className="row-meta">{it.meta}</span>}
            {it.onClick && (
              <span className="row-arrow" aria-hidden>
                <ArrowUpRight />
              </span>
            )}
          </button>
        </Reveal>
      ))}
    </ul>
  );
}
