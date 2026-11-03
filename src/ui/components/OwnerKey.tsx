import { useEffect, useState } from 'react';
import { disablePush, isPushOn } from '../push';
import { useStore } from '../store';
import { claimOwner, enterOwnerKey, forgetOwnerKey, formatKey, KEY_LENGTH, ownerClaimed, useSyncInfo } from '../sync';

const time = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/**
 * 메뉴 하단 '관리자 키'에서 여는 작은 창.
 * 서버 회사는 누구나 보지만, 바꾸기와 알림은 키를 넣은 기기만 한다. 키는 기기마다 처음 한 번 넣는다.
 */
export function OwnerKeyDialog({ onClose }: { onClose: () => void }) {
  const { state, replace } = useStore();
  const { key, at } = useSyncInfo();
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (key) return;
    ownerClaimed().then(setClaimed, () => setClaimed(true));
  }, [key]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error && /키/.test(e.message) ? e.message : '서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const make = () => {
    if (!confirm('이 기기의 회사가 서버 회사가 돼요. 다른 기기도 이 회사를 보게 됩니다. 만들까요?')) return;
    void run(async () => void (await claimOwner(state)));
  };

  const enter = () =>
    run(async () => {
      const next = await enterOwnerKey(input, state);
      if (next) replace(next, { remote: true });
      setInput('');
    });

  const forget = () => {
    if (!confirm('이 기기에서 키를 지울까요? 회사는 계속 보이지만, 여기서 바꾼 것은 서버에 올라가지 않고 알림도 꺼져요.')) return;
    void run(async () => {
      if (isPushOn()) await disablePush();
      forgetOwnerKey();
    });
  };

  const copy = () => {
    if (!key) return;
    void navigator.clipboard?.writeText(key).then(
      () => setMsg('키를 복사했어요.'),
      () => undefined,
    );
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="sync-modal" role="dialog" aria-modal="true" aria-label="관리자 키">
        <div className="sync-head">
          <b>관리자 키</b>
          <button className="sync-close" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        </div>
        {key ? (
          <>
            <p className="muted">이 기기는 회사를 바꾸고 알림을 받을 수 있어요. 다른 기기에도 이 키를 한 번 넣어 주세요.</p>
            <div className="sync-code">{formatKey(key)}</div>
            <span className="faint">{at ? `서버와 마지막으로 맞춘 시각 ${time(at)}` : '아직 서버와 맞추지 않았어요'}</span>
            <div className="sync-actions">
              <button className="pill pill-sm" onClick={copy} disabled={busy}>
                키 복사
              </button>
              <button className="pill pill-sm" onClick={forget} disabled={busy}>
                이 기기에서 지우기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">회사는 누구나 볼 수 있고, 바꾸기와 알림은 키를 넣은 기기만 해요. 기기마다 처음 한 번만 넣으면 돼요.</p>
            {claimed === false && (
              <button className="pill pill-sm pill-dark" onClick={make} disabled={busy} style={{ alignSelf: 'flex-start' }}>
                이 기기 회사로 키 만들기
              </button>
            )}
            <form
              className="sync-join"
              onSubmit={(e) => {
                e.preventDefault();
                void enter();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`관리자 키 ${KEY_LENGTH}자리`}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="관리자 키"
              />
              <button className="pill pill-sm" type="submit" disabled={busy || input.replace(/[\s-]/g, '').length < KEY_LENGTH}>
                확인
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
