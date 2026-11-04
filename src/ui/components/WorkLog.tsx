import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MEETING_NOTE } from '../../sim/chat';
import { STAGE_LABELS } from '../../sim/purchasing';
import type { Stage, TimeBlock, WorkKind } from '../../sim/types';
import { formatDay } from '../../sim/util';
import { useBackToClose } from '../history';
import { lockScroll, unlockScroll } from '../motion';
import { useStore } from '../store';
import { clock } from './Common';
import { KIND_COLORS, KIND_LABELS } from './DayBar';
import './workLog.css';

/** 이어지는 같은 업무(점심 전후 "(계속)")를 한 줄로 묶는다 */
type Row = TimeBlock & { end: number };
function mergeBlocks(blocks: TimeBlock[]): Row[] {
  const clean = (l: string) => l.replace(/ \(계속\)$/, '');
  const out: Row[] = [];
  for (const b of blocks) {
    if (b.kind === 'lunch') continue;
    const last = out[out.length - 1];
    if (last && clean(last.label) === clean(b.label) && last.caseId === b.caseId) {
      // 시각은 점심 전후를 이어서 보여 주되, 소요 시간에는 점심을 넣지 않는다
      last.minutes += b.minutes;
      last.end = b.start + b.minutes;
      continue;
    }
    out.push({ ...b, label: clean(b.label), end: b.start + b.minutes });
  }
  return out;
}

/**
 * 업무 일지 (보고서 형식). 그날의 일정 블록과 사건으로 만든다.
 * 근무 시간, 업무별 시간, 시간대별 내역, 구매 건 진행, 주요 사항, 다음 영업일로 넘어가는 일.
 */
export function WorkLogModal({ day, title, onClose }: { day: number; title: string; onClose: () => void }) {
  const { state, openCase } = useStore();
  useBackToClose(true, onClose, 'worklog');
  useEffect(() => {
    lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const e = state.employee;
  const blocks = state.schedule.filter((b) => b.day === day).sort((a, b) => a.start - b.start);
  const rows = mergeBlocks(blocks);
  const workMin = blocks.filter((b) => b.kind !== 'lunch').reduce((a, b) => a + b.minutes, 0);
  const endMin = Math.max(0, ...blocks.map((b) => b.start + b.minutes));
  const overtime = Math.max(0, workMin - state.params.workdayMinutes);

  // 업무 종류별 시간 (많은 순)
  const byKind = new Map<WorkKind, number>();
  for (const b of blocks) if (b.kind !== 'lunch') byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + b.minutes);
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1]);

  // 구매 건: 그날 처음 손댄 단계 → 마지막 단계
  const caseIds = [...new Set(blocks.filter((b) => b.caseId).map((b) => b.caseId!))];
  const caseRows = caseIds.map((id) => {
    const bs = blocks.filter((b) => b.caseId === id && b.stage);
    const c = state.cases.find((x) => x.id === id);
    const from = bs[0]?.stage as Stage | undefined;
    const to = bs[bs.length - 1]?.stage as Stage | undefined;
    const min = blocks.filter((b) => b.caseId === id).reduce((a, b) => a + b.minutes, 0);
    return { id, name: c ? state.materials[c.materialId].name : id, urgent: c?.urgent, from, to, min };
  });

  // 주요 사항: 그날 사건 + 주간 팀 회의 (회의 정리는 단체방의 이팀장 메시지에서 가져온다)
  const meeting = blocks.find((b) => b.label === '주간 팀 회의');
  const note = (state.chats ?? []).find((c) => c.day === day && c.thread === 'team' && c.text.startsWith(MEETING_NOTE));
  const meetingItem = meeting
    ? {
        id: 'meeting',
        minute: meeting.start,
        title: `주간 팀 회의${note ? `: ${note.text.split('\n').slice(1, -1).map((l) => l.replace(/^- /, '')).join(', ')}` : ''}`,
        caseId: undefined as string | undefined,
      }
    : null;
  const events = [
    ...state.events.filter((x) => x.day === day).map((x) => ({ id: x.id, minute: x.minute ?? 0, title: x.title, caseId: x.caseId })),
    ...(meetingItem ? [meetingItem] : []),
  ].sort((a, b) => a.minute - b.minute);
  const openCases = state.cases.filter((c) => c.stage !== 'done' && c.stage !== 'cancelled').length;
  const open = (id?: string) => {
    if (!id) return;
    onClose();
    openCase(id);
  };

  // body에 바로 그린다. 첫 화면의 등장 효과 상자 안에 그리면 헤더 아래에 깔린다
  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="worklog" role="dialog" aria-modal="true" aria-label={title} data-lenis-prevent>
        <header className="worklog-head">
          <div>
            <span className="worklog-kicker">{state.company.name} 구매팀</span>
            <h2>{title}</h2>
          </div>
          <button className="round-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <dl className="worklog-meta">
          <dt>일자</dt>
          <dd>{formatDay(state.startDate, day)}</dd>
          <dt>작성자</dt>
          <dd>
            구매팀 {e.name} {e.rank}
          </dd>
          <dt>근무 시간</dt>
          <dd>09:00 ~ {clock(endMin)}</dd>
          <dt>실근무</dt>
          <dd>
            {Math.floor(workMin / 60)}시간 {workMin % 60}분{overtime > 0 ? ` (연장 ${overtime}분)` : ''}
          </dd>
        </dl>

        <section>
          <h3>1. 업무 요약</h3>
          <div className="worklog-kinds">
            {kinds.map(([k, m]) => (
              <span key={k} style={{ ['--blk' as string]: KIND_COLORS[k] }}>
                <span className="swatch" />
                {KIND_LABELS[k]} <b className="num">{m}분</b>
              </span>
            ))}
          </div>
          <p className="worklog-note">
            구매 건 {caseRows.length}건을 진행했고, 그 밖에 {rows.filter((r) => !r.caseId).length}가지 업무를 처리했습니다.
          </p>
        </section>

        <section>
          <h3>2. 시간대별 업무 내역</h3>
          <table className="worklog-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>업무</th>
                <th className="r">소요</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.caseId ? 'link' : ''} onClick={() => open(r.caseId)}>
                  <td className="num nowrap">
                    {clock(r.start)}~{clock(r.end)}
                  </td>
                  <td>
                    <span className="swatch" style={{ ['--blk' as string]: KIND_COLORS[r.kind] }} />
                    {r.label}
                    {r.toolId && <span className="badge badge-accent">AI 도구</span>}
                  </td>
                  <td className="num r nowrap">{r.minutes}분</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {caseRows.length > 0 && (
          <section>
            <h3>3. 구매 건 진행</h3>
            <table className="worklog-table">
              <thead>
                <tr>
                  <th>건</th>
                  <th>품목</th>
                  <th>단계</th>
                  <th className="r">투입</th>
                </tr>
              </thead>
              <tbody>
                {caseRows.map((c) => (
                  <tr key={c.id} className="link" onClick={() => open(c.id)}>
                    <td className="num nowrap">{c.id}</td>
                    <td className="nowrap">
                      {c.name}
                      {c.urgent && <span className="badge badge-danger">긴급</span>}
                    </td>
                    <td>{c.from && c.to ? (c.from === c.to ? STAGE_LABELS[c.to] : `${STAGE_LABELS[c.from]} → ${STAGE_LABELS[c.to]}`) : '-'}</td>
                    <td className="num r nowrap">{c.min}분</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h3>{caseRows.length > 0 ? '4' : '3'}. 주요 사항</h3>
          {events.length === 0 ? (
            <p className="worklog-note">특이 사항 없음.</p>
          ) : (
            <ul className="worklog-events">
              {events.map((x) => (
                <li key={x.id} className={x.caseId ? 'link' : ''} onClick={() => open(x.caseId)}>
                  <span className="num faint">{clock(x.minute)}</span>
                  <span>{x.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>{caseRows.length > 0 ? '5' : '4'}. 다음 영업일로 넘어가는 일</h3>
          <p className="worklog-note">
            진행 중인 구매 {openCases}건, 그 밖의 업무 {state.backlog.length}건을 이어서 처리합니다.
          </p>
        </section>
      </div>
    </>,
    document.body,
  );
}
