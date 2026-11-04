import { useEffect, useRef } from 'react';

/**
 * 브라우저 뒤로가기.
 * 화면을 바꾸거나 드로어·메뉴를 열 때마다 방문 기록을 하나씩 쌓아서,
 * 뒤로가기를 누르면 사이트를 떠나지 않고 직전 화면으로 돌아가거나 열린 창이 닫힌다.
 * (예전에는 화면 전환이 기록에 남지 않아 뒤로가기 한 번에 이전 사이트로 나갔다)
 *
 * 기록에 남기는 값: { screen, overlay? }. 주소에는 화면 이름을 #desk처럼 붙인다.
 */

export interface HistoryEntry {
  screen: string;
  /** 열린 창 이름 (case, menu). 뒤로가기로 닫힌다 */
  overlay?: string;
}

type Listener = (entry: HistoryEntry | null) => void;
const listeners = new Set<Listener>();

// 창을 버튼으로 닫을 때는 기록을 한 칸 되돌린다(history.back). 이 되돌리기는 비동기라서,
// 끝나기 전에 쌓으려는 기록은 기다렸다가 쌓는다. 안 그러면 방금 쌓은 화면 기록이 되돌려진다.
let pendingBack = 0;
const queue: (() => void)[] = [];

function run(fn: () => void) {
  if (pendingBack > 0) queue.push(fn);
  else fn();
}

function current(): HistoryEntry | null {
  const s = window.history.state as HistoryEntry | null;
  return s && typeof s.screen === 'string' ? s : null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (pendingBack > 0) {
      pendingBack--;
      if (pendingBack === 0) queue.splice(0).forEach((f) => f());
      return;
    }
    const e = current();
    // 건너뛰기 링크(#main) 같은 주소 조각 이동은 기록 값이 없다. 화면은 그대로 둔다
    if (!e) return;
    listeners.forEach((l) => l(e));
  });
}

/** 주소의 #화면 이름 (처음 열 때 어느 화면을 보여 줄지) */
export function screenFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash.replace(/^#/, '');
  return h || null;
}

/** 처음 연 화면을 지금 기록에 적는다 (새 기록을 쌓지 않는다) */
export function initHistory(screen: string): void {
  window.history.replaceState({ screen } satisfies HistoryEntry, '', `#${screen}`);
}

/** 다른 화면으로 갈 때 기록을 쌓는다 */
export function pushScreen(screen: string): void {
  run(() => {
    const now = current();
    if (now?.screen === screen && !now.overlay) return;
    // 메뉴·드로어 안에서 화면을 고르면 그 창의 기록을 새 화면으로 바꿔 쓴다
    // (쌓으면 뒤로가기 때 이미 닫힌 창 자리를 한 번 더 거쳐야 한다)
    if (now?.overlay) window.history.replaceState({ screen } satisfies HistoryEntry, '', `#${screen}`);
    else window.history.pushState({ screen } satisfies HistoryEntry, '', `#${screen}`);
  });
}

/** 뒤로가기·앞으로가기로 기록이 바뀔 때 알려 준다 */
export function onHistory(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * 창(드로어·메뉴)이 열려 있는 동안 기록을 하나 쌓아 두고, 뒤로가기를 누르면 닫는다.
 * 버튼으로 닫으면 쌓아 둔 기록을 되돌려서, 뒤로가기를 한 번 더 눌러야 하는 일이 없게 한다.
 */
export function useBackToClose(open: boolean, close: () => void, name: string): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    run(() => {
      const base = current();
      window.history.pushState({ screen: base?.screen ?? '', overlay: name } satisfies HistoryEntry, '');
    });
    let closedByBack = false;
    const off = onHistory((e) => {
      if (e?.overlay !== name) {
        closedByBack = true;
        closeRef.current();
      }
    });
    return () => {
      off();
      if (closedByBack) return;
      run(() => {
        if (current()?.overlay === name) {
          pendingBack++;
          window.history.back();
        }
      });
    };
  }, [open, name]);
}
