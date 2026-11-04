import type { TimeBlock, WorkKind } from '../../sim/types';
import { clock } from './Common';

/** 업무 종류별 색과 이름 (직원 업무 하루 일정, 첫 화면 하루 일정 줄) */
export const KIND_COLORS: Record<WorkKind, string> = {
  case: 'var(--series-1)',
  mail: 'var(--series-3)',
  meeting: 'var(--series-4)',
  report: 'var(--series-5)',
  claim: 'var(--danger)',
  adhoc: 'var(--series-2)',
  expedite: 'var(--warn)',
  lunch: 'var(--subtle)',
  spot: 'var(--danger)',
  sourcing: 'var(--series-3)',
  review: 'var(--series-5)',
  training: 'var(--ok)',
};

export const KIND_LABELS: Record<WorkKind, string> = {
  case: '구매 건',
  mail: '메일',
  meeting: '회의·미팅',
  report: '보고서',
  claim: '클레임',
  adhoc: '일상 업무',
  expedite: '납기 독촉',
  lunch: '점심',
  spot: '긴급 구매',
  sourcing: '공급처 발굴',
  review: '업체 평가',
  training: '교육',
};

/** 하루 일정 줄: 시간 눈금, 업무 막대, 실시간이면 지금 위치. 직원 업무 화면과 첫 화면이 같이 쓴다 */
export function DayBar({
  blocks,
  span,
  workEnd,
  end,
  onOpen,
  nowMinute = null,
  compact = false,
}: {
  blocks: TimeBlock[];
  /** 줄 전체 길이 (09:00부터 분) */
  span: number;
  /** 정규 근무 종료 (09:00부터 분) */
  workEnd: number;
  /** 마지막 일정이 끝나는 시각 */
  end: number;
  onOpen: (id: string) => void;
  nowMinute?: number | null;
  /** 첫 화면용 얇은 줄 */
  compact?: boolean;
}) {
  const live = nowMinute !== null;
  const stateOf = (b: TimeBlock) => (!live ? '' : b.start + b.minutes <= nowMinute! ? 'past' : b.start <= nowMinute! ? 'current' : 'future');
  const pctOf = (m: number) => `${(m / span) * 100}%`;
  const hours = span / 60;
  return (
    <div className={`timeline-wrap ${live ? 'live' : ''} ${compact ? 'compact' : ''}`}>
    <div className="timeline">
      <div className="timeline-hours">
        {Array.from({ length: hours - 1 }, (_, i) => (
          <span key={i} style={{ left: pctOf((i + 1) * 60) }}>
            {10 + i}시
          </span>
        ))}
      </div>
      <div className="timeline-track">
        {blocks.map((b, i) => (
          <div
            key={i}
            className={`timeline-block ${b.caseId ? 'clickable' : ''} ${b.toolId ? 'tool' : ''} ${stateOf(b)}`}
            style={{ left: pctOf(b.start), width: pctOf(b.minutes), ['--blk' as string]: KIND_COLORS[b.kind] }}
            title={`${clock(b.start)}~${clock(b.start + b.minutes)} ${b.label}`}
            onClick={() => b.caseId && onOpen(b.caseId)}
          />
        ))}
        {end > workEnd && <div className="timeline-workend" style={{ left: pctOf(workEnd) }} title="정규 근무 종료 (18:00)" />}
        {live && (
          <>
            <div className="timeline-future" style={{ left: pctOf(nowMinute!) }} aria-hidden />
            <div className="timeline-now" style={{ left: pctOf(nowMinute!) }} aria-hidden />
          </>
        )}
      </div>
    </div>
    {live && (
      <span className="timeline-now-label" style={{ left: `clamp(2.5rem, ${(nowMinute! / span) * 100}%, calc(100% - 2.5rem))` }}>
        지금 {clock(nowMinute!)}
      </span>
    )}
    </div>  );
}
