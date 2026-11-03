import { useEffect, useRef, useState } from 'react';
import { LUNCH_MINUTES, LUNCH_START } from '../../sim/calendar';
import { formatDay } from '../../sim/util';
import { ALERT_LABELS, alertKind, useAlerts, type AlertKind } from '../alerts';
import { currentBlock, useRealtime } from '../realtime';
import { isIOS, isStandalone } from '../install';
import { disablePush, enablePush, pushAvailable, usePushOn } from '../push';
import { useStore } from '../store';

/** 오늘이 며칠차인지 (실시간이면 현실 날짜 기준) */
export function useTodayDay(): number {
  const { state } = useStore();
  const rt = useRealtime();
  if (!rt.isRealtime || rt.phase === 'ahead') return state.day;
  if (rt.phase === 'before') return rt.target + 1;
  return Math.max(1, rt.target);
}

const PHASE_TEXT: Record<string, string> = {
  before: '출근 전',
  working: '근무 중',
  after: '퇴근',
  holiday: '휴일',
};

const two = (n: number) => String(n).padStart(2, '0');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const realDate = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}(${WD[d.getDay()]})`;

/** "2026-11-03(화)"에서 요일 부분만 작게 */
function DateWithDay({ text }: { text: string }) {
  const m = text.match(/^(.*)(\(.\))$/);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className="chip-weekday">{m[2]}</span>
    </>
  );
}

export type Light = 'green' | 'orange' | 'red' | 'off';

/** 상태 불: 근무 중 초록, 점심 주황, 퇴근 빨강, 출근 전·휴일·실시간이 아닐 때 회색 */
export function useLight(): { light: Light; text: string } {
  const rt = useRealtime();
  if (!rt.isRealtime) return { light: 'off', text: '수동 진행' };
  if (rt.phase === 'ahead') return { light: 'off', text: `현실보다 ${rt.aheadDays}일 앞섬` };
  if (rt.phase === 'working') {
    const lunch = rt.liveMinute !== null && rt.liveMinute >= LUNCH_START && rt.liveMinute < LUNCH_START + LUNCH_MINUTES;
    return lunch ? { light: 'orange', text: '점심시간' } : { light: 'green', text: '근무 중' };
  }
  // 퇴근은 빨강, 출근 전과 휴일은 회색
  return { light: rt.phase === 'after' ? 'red' : 'off', text: PHASE_TEXT[rt.phase] };
}

/** 헤더 날짜 칩 */
export function ClockChip({ title }: { title: string }) {
  const { state } = useStore();
  const rt = useRealtime();
  const day = useTodayDay();
  const light = useLight();
  return (
    <span className="chip-glass clock-chip" title={title}>
      {rt.isRealtime ? (
        <span className={`live-dot light-${light.light}`} aria-hidden title={light.text} />
      ) : (
        <span className="label">{state.company.name}</span>
      )}
      <span className="val">
        <DateWithDay text={rt.isRealtime && rt.phase === 'holiday' ? realDate(rt.now) : formatDay(state.startDate, day)} />
      </span>
      {rt.isRealtime && (
        <>
          <span className="val">
            {two(rt.now.getHours())}:{two(rt.now.getMinutes())}
          </span>
          <span className="label">{light.text}</span>
        </>
      )}
      <span className="sep">•</span>
      <span className="val">{day}일차</span>
    </span>
  );
}

/** 지금 담당자가 하는 일 한 줄 */
export function useLiveStatus(): string {
  const { state } = useStore();
  const rt = useRealtime();
  if (!rt.isRealtime) return `${formatDay(state.startDate, state.day)} 근무 시작 전`;
  if (rt.phase === 'ahead') return `현실보다 ${rt.aheadDays}영업일 앞서 진행됨`;
  if (rt.phase === 'before') return `오늘 09:00 출근 예정`;
  if (rt.phase === 'holiday') return '오늘은 쉬는 날';
  if (rt.phase === 'after') return `오늘 근무 끝, 다음 영업일 09:00 출근`;
  const b = currentBlock(state, rt);
  return b ? `지금 ${state.employee.name} ${state.employee.rank}: ${b.label.replace(/ \(계속\)$/, '')}` : `지금 ${state.employee.name} ${state.employee.rank}: 업무 정리 중`;
}

const BellIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** 헤더 알림 종 + 알림함 */
export function AlertsBell() {
  const { openCase } = useStore();
  const a = useAlerts();
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="theme-btn bell-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`알림 ${a.unread}건`} title="알림">
        <BellIcon />
        {a.unread > 0 && <span className="bell-badge">{a.unread > 99 ? '99+' : a.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="알림" data-lenis-prevent>
          <div className="bell-head">
            <b>알림</b>
            <div className="row" style={{ gap: '0.25rem' }}>
              <button className="bell-link" onClick={() => setShowPrefs((s) => !s)}>
                {showPrefs ? '목록' : '설정'}
              </button>
              {a.unread > 0 && (
                <button className="bell-link" onClick={a.markAllRead}>
                  모두 읽음
                </button>
              )}
            </div>
          </div>
          {showPrefs ? (
            <div className="bell-prefs">
              <p className="faint">받을 알림을 고르세요. 이 브라우저에만 저장됩니다.</p>
              {(Object.keys(ALERT_LABELS) as AlertKind[]).map((k) => (
                <label key={k} className="bell-pref">
                  <input type="checkbox" checked={a.prefs[k]} onChange={(e) => a.setPref(k, e.target.checked)} />
                  {ALERT_LABELS[k]}
                </label>
              ))}
            </div>
          ) : a.items.length === 0 ? (
            <div className="empty">아직 알림이 없습니다.</div>
          ) : (
            <ul className="bell-list">
              {a.items.slice(0, 30).map((it) => (
                <li key={it.e.id}>
                  <button
                    className={`bell-item ${it.unread ? 'unread' : ''}`}
                    onClick={() => {
                      a.markRead(it.e);
                      if (it.e.caseId) {
                        openCase(it.e.caseId);
                        setOpen(false);
                      }
                    }}
                  >
                    <span className={`bell-kind k-${it.kind}`}>{ALERT_LABELS[it.kind]}</span>
                    <span className="bell-title">{it.e.title}</span>
                    <span className="bell-when">{it.when}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="bell-foot">
            {a.permission === 'unsupported' ? (
              <span className="faint">
                {isIOS() && !isStandalone()
                  ? '아이폰은 홈 화면에 추가해서 앱으로 열어야 알림을 켤 수 있어요. 공유 버튼 → 홈 화면에 추가.'
                  : '이 브라우저는 알림 팝업을 지원하지 않아요.'}
              </span>
            ) : a.permission === 'granted' ? (
              <span className="faint">브라우저 알림 켜짐. 사이트를 열어 둔 동안 팝업으로 알려 드려요.</span>
            ) : a.permission === 'denied' ? (
              <span className="faint">브라우저 설정에서 이 사이트의 알림이 막혀 있어요.</span>
            ) : (
              <button className="pill pill-sm pill-dark" onClick={() => void a.requestPermission()}>
                브라우저 알림 켜기
              </button>
            )}
            <PushToggle />
          </div>
        </div>
      )}
    </div>
  );
}

/** 닫아 둔 동안에도 받기 (웹 푸시). 알림 서버가 설정돼 있고 브라우저가 지원할 때만 보인다 */
function PushToggle() {
  const { state } = useStore();
  const on = usePushOn();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!pushAvailable()) return null;
  const toggle = async () => {
    setBusy(true);
    setErr('');
    try {
      if (on) await disablePush();
      else await enablePush(state);
    } catch (e) {
      setErr(e instanceof Error && e.message.includes('권한') ? e.message : '연결하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bell-push">
      <div>
        <b>닫아 둔 동안에도 받기</b>
        <span className="faint">{on ? '켜짐. 앞으로 6주치 알림을 서버에 맡겨 두었어요.' : '사이트를 닫아도 폰으로 알려 드려요.'}</span>
        {err && <span className="faint">{err}</span>}
      </div>
      <button className={`pill pill-sm ${on ? '' : 'pill-dark'}`} disabled={busy} onClick={() => void toggle()}>
        {busy ? '연결 중' : on ? '끄기' : '켜기'}
      </button>
    </div>
  );
}

/** 자리를 비운 동안 있었던 일 */
export function AwayModal() {
  const { state, openCase } = useStore();
  const rt = useRealtime();
  if (!rt.away) return null;
  const { fromDay, toDay } = rt.away;
  const evs = state.events.filter((e) => e.day >= fromDay && e.day <= toDay);
  const important = evs.filter((e) => alertKind(e));
  const counts = new Map<AlertKind, number>();
  for (const e of important) counts.set(alertKind(e)!, (counts.get(alertKind(e)!) ?? 0) + 1);
  const closed = state.cases.filter((c) => c.closedDay !== undefined && c.closedDay >= fromDay && c.closedDay <= toDay).length;
  const ordered = state.cases.filter((c) => c.po && c.po.orderDay >= fromDay && c.po.orderDay <= toDay).length;
  const days = toDay - fromDay + 1;
  return (
    <>
      <div className="drawer-backdrop" onClick={rt.dismissAway} />
      <div className="away-modal" role="dialog" aria-modal="true" aria-label="자리를 비운 동안">
        <span className="eyebrow">While you were away</span>
        <h2>
          자리를 비운 동안
          <br />
          {days}영업일이 지났어요
        </h2>
        <p className="muted">
          {formatDay(state.startDate, fromDay)} ~ {formatDay(state.startDate, toDay)} 동안 회사는 계속 돌아갔어요. 발주 {ordered}건, 구매 완료 {closed}건이 있었습니다.
        </p>
        <div className="away-counts">
          {(Object.keys(ALERT_LABELS) as AlertKind[]).filter((k) => k !== 'payroll').map((k) => (
            <div key={k} className={`away-count ${counts.get(k) ? 'has' : ''}`}>
              <span>{ALERT_LABELS[k]}</span>
              <b>{counts.get(k) ?? 0}</b>
            </div>
          ))}
        </div>
        {important.length > 0 && (
          <ul className="away-list">
            {important
              .slice(-8)
              .reverse()
              .map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => {
                      if (e.caseId) {
                        rt.dismissAway();
                        openCase(e.caseId);
                      }
                    }}
                  >
                    <span className="faint">{formatDay(state.startDate, e.day)}</span> {e.title}
                  </button>
                </li>
              ))}
          </ul>
        )}
        <button className="pill pill-dark" onClick={rt.dismissAway} style={{ alignSelf: 'flex-start' }}>
          확인
        </button>
      </div>
    </>
  );
}
