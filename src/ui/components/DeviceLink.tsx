import { useEffect, useState } from 'react';
import { disablePush, isPushOn } from '../push';
import { useStore } from '../store';
import { createGroup, formatCode, joinGroup, leaveGroup, useSyncInfo } from '../sync';

const time = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 메뉴 하단 '기기 연결'에서 여는 작은 창. PC와 폰이 같은 회사를 보게 한다 */
export function DeviceLinkDialog({ onClose }: { onClose: () => void }) {
  const { state, replace } = useStore();
  const { code, at } = useSyncInfo();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error && /코드|회사/.test(e.message) ? e.message : '서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const make = () => run(async () => void (await createGroup(state)));

  const join = () => {
    if (!confirm('이 기기의 회사가 연결한 기기의 회사로 바뀌어요. 계속할까요?')) return;
    void run(async () => {
      const next = await joinGroup(input);
      replace(next, { remote: true });
      setInput('');
    });
  };

  const leave = () => {
    if (!confirm('연결을 끊을까요? 이 기기의 회사는 그대로 남고, 다른 기기와 더 이상 맞추지 않아요.')) return;
    void run(async () => {
      if (isPushOn()) await disablePush();
      leaveGroup();
    });
  };

  const copy = () => {
    if (!code) return;
    void navigator.clipboard?.writeText(code).then(
      () => setMsg('코드를 복사했어요.'),
      () => undefined,
    );
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="sync-modal" role="dialog" aria-modal="true" aria-label="기기 연결">
        <div className="sync-head">
          <b>기기 연결</b>
          <button className="sync-close" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        </div>
        {code ? (
          <>
            <p className="muted">이 코드로 연결된 기기들은 같은 회사를 봐요. 다른 기기에서 메뉴 → 기기 연결에 이 코드를 입력하세요.</p>
            <div className="sync-code">{formatCode(code)}</div>
            <span className="faint">{at ? `마지막으로 맞춘 시각 ${time(at)}` : '아직 맞추지 않았어요'}</span>
            <div className="sync-actions">
              <button className="pill pill-sm" onClick={copy} disabled={busy}>
                코드 복사
              </button>
              <button className="pill pill-sm" onClick={leave} disabled={busy}>
                연결 끊기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">PC와 폰에서 같은 회사를 보려면 한쪽에서 코드를 만들고, 다른 쪽에서 그 코드를 입력하세요.</p>
            <button className="pill pill-sm pill-dark" onClick={() => void make()} disabled={busy} style={{ alignSelf: 'flex-start' }}>
              이 기기 회사로 코드 만들기
            </button>
            <form
              className="sync-join"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="다른 기기의 코드 12자리"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="연결 코드"
              />
              <button className="pill pill-sm" type="submit" disabled={busy || input.replace(/[\s-]/g, '').length < 12}>
                연결
              </button>
            </form>
          </>
        )}
        {busy && <span className="faint">연결 중…</span>}
        {msg && <span className="faint">{msg}</span>}
      </div>
    </>
  );
}
