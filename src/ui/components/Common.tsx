import type { ReactNode } from 'react';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { DeptId, EventType, PurchaseCase, Stage } from '../../sim/types';
import { DEPT_NAMES } from '../../sim/util';
import { LineReveal, Reveal } from '../motion';

export function Card({ title, sub, actions, children, className, style }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card ${className ?? ''}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div className="row" style={{ gap: '0.5rem' }}>
            {typeof title === 'string' ? <h3>{title}</h3> : title}
            {sub && <span className="sub">{sub}</span>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : undefined;
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color }}>
        {value}
      </span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

const EYEBROWS: Record<string, string> = {
  '기업 현황': '01 — Company',
  '직원 업무': '02 — The Desk',
  '소통 공간': '03 — Communication',
  '프로세스 맵': '04 — Process',
  '시장·원가·업체': '05 — Market',
  'AI Tool Lab': '06 — Tool Lab',
  '성과·타임라인': '07 — Results',
  '학습 노트': '08 — Learning',
  '가정·설정': 'Settings — Assumptions',
};

/** 화면 제목. 번호와 구분 라벨을 눈썹 글씨로 두고 큰 제목이 줄 단위로 올라온다 */
export function PageHead({ title, desc, actions, eyebrow }: { title: string; desc?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="page-head">
      <Reveal>
        <span className="eyebrow">{eyebrow ?? EYEBROWS[title] ?? title}</span>
      </Reveal>
      <div className="page-head-row">
        <LineReveal lines={[title]} delay={80} />
        {actions && <div className="row">{actions}</div>}
      </div>
      {desc && (
        <Reveal delay={180}>
          <p>{desc}</p>
        </Reveal>
      )}
    </div>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

const STAGE_TONE: Partial<Record<Stage, string>> = {
  awaitQuotes: 'badge-info',
  approve: 'badge-info',
  awaitDelivery: 'badge-info',
  done: 'badge-ok',
  cancelled: 'badge-danger',
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`badge ${STAGE_TONE[stage] ?? 'badge-accent'}`}>{STAGE_LABELS[stage]}</span>;
}

export function CaseStatus({ c }: { c: PurchaseCase }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {c.urgent && <span className="badge badge-danger">긴급</span>}
      <StageBadge stage={c.stage} />
    </span>
  );
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  market: '시장',
  demand: '수요',
  stockout: '결품',
  request: '구매요청',
  order: '발주',
  delivery: '입고',
  quality: '품질',
  delay: '납기지연',
  finance: '정산·재무',
  tool: 'AI 도구',
  career: '경력',
  payroll: '급여',
  system: '업무',
};

const EVENT_TONE: Partial<Record<EventType, string>> = {
  stockout: 'badge-danger',
  delay: 'badge-warn',
  quality: 'badge-warn',
  finance: 'badge-warn',
  tool: 'badge-accent',
  career: 'badge-ok',
  market: 'badge-info',
  demand: 'badge-info',
};

export function EventBadge({ type }: { type: EventType }) {
  return <span className={`badge ${EVENT_TONE[type] ?? ''}`}>{EVENT_TYPE_LABELS[type]}</span>;
}

export function DeptBadge({ dept }: { dept: DeptId }) {
  return <span className="badge">{DEPT_NAMES[dept]}</span>;
}

/** 09:00 기준 분 → "HH:MM" */
export function clock(minFrom9: number): string {
  const total = 9 * 60 + Math.round(minFrom9);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
