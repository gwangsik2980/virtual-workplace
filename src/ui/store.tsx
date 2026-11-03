import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { advanceDay } from '../sim/engine';
import { clearLocal, loadLocal, saveLocal } from '../sim/persistence';
import { nextBusinessDayISO } from '../sim/calendar';
import { createInitialState } from '../sim/seed';

/** 새 회사는 오늘(휴일이면 다음 영업일)을 1일차로, 현실 시간과 함께 흐르도록 시작한다 */
const newCompany = (seed?: number) => createInitialState(seed, nextBusinessDayISO(), 'realtime');
/** 웹에서는 실시간 모드만 쓴다. 예전에 수동으로 저장한 회사도 실시간으로 바꿔서 연다 */
const asRealtime = (s: GameState): GameState => (s.clock?.mode === 'realtime' ? s : { ...s, clock: { mode: 'realtime' } });
import type { GameState } from '../sim/types';

export type ScreenId = 'overview' | 'desk' | 'process' | 'market' | 'lab' | 'performance' | 'learning' | 'assumptions';

interface Store {
  state: GameState;
  /** 상태를 복제해 수정한다. 수정 내용은 자동 저장된다. */
  update(fn: (draft: GameState) => void): void;
  /** record=false면 되돌리기 기록을 남기지 않는다 (자동 진행 중) */
  advance(days: number, opts?: { record?: boolean }): void;
  /** 지금 상태를 되돌리기 지점으로 남긴다 (자동 진행 시작 시) */
  checkpoint(label: string): void;
  /** 직전 조작 이전 상태로 되돌린다 (최근 UNDO_LIMIT번까지) */
  undo(): void;
  /** 되돌릴 수 있는 단계 수 */
  undoCount: number;
  /** 가장 최근 되돌리기 대상의 설명 */
  undoLabel: string | null;
  replace(next: GameState): void;
  reset(seed?: number): void;
  saveOk: boolean;
  screen: ScreenId;
  setScreen(s: ScreenId): void;
  openCase(id: string | null): void;
  caseId: string | null;
  /** 직원 업무 화면에서 볼 날짜 */
  deskDay: number | null;
  setDeskDay(d: number | null): void;
}

const Ctx = createContext<Store | null>(null);

/** 상태 하나가 수백 KB~수 MB라서 최근 10번까지만 메모리에 둔다 (새로고침하면 사라짐) */
const UNDO_LIMIT = 10;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => asRealtime(loadLocal() ?? newCompany()));
  const [saveOk, setSaveOk] = useState(true);
  const [screen, setScreenRaw] = useState<ScreenId>(() => {
    try {
      return (localStorage.getItem('virtual-workplace/screen') as ScreenId) || 'overview';
    } catch {
      return 'overview';
    }
  });
  const [caseId, setCaseId] = useState<string | null>(null);
  const [deskDay, setDeskDay] = useState<number | null>(null);
  const first = useRef(true);
  // 연속 클릭에도 최신 상태를 쓰도록 렌더를 기다리지 않고 바로 갱신하는 참조
  const stateRef = useRef(state);
  const undoStack = useRef<{ state: GameState; label: string }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);

  // 상태는 수정할 때마다 새 객체로 바뀌므로(불변) 이전 객체를 그대로 보관해도 안전하다
  const pushUndo = useCallback((label: string) => {
    undoStack.current.push({ state: stateRef.current, label });
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
    setUndoLabel(label);
  }, []);

  const commit = useCallback(
    (next: GameState, label: string, record = true) => {
      if (record) pushUndo(label);
      stateRef.current = next;
      setState(next);
    },
    [pushUndo],
  );

  const checkpoint = useCallback((label: string) => pushUndo(label), [pushUndo]);

  const clearUndo = useCallback(() => {
    undoStack.current = [];
    setUndoCount(0);
    setUndoLabel(null);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveOk(saveLocal(state));
  }, [state]);

  const update = useCallback(
    (fn: (draft: GameState) => void) => {
      const next = structuredClone(stateRef.current);
      fn(next);
      commit(next, '설정 변경');
    },
    [commit],
  );

  const advance = useCallback(
    (days: number, opts?: { record?: boolean }) => {
      const next = structuredClone(stateRef.current);
      for (let i = 0; i < days; i++) advanceDay(next);
      commit(next, days === 1 ? '하루 진행' : `${days}일 진행`, opts?.record ?? true);
      setDeskDay(null);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    stateRef.current = prev.state;
    setState(prev.state);
    setUndoCount(undoStack.current.length);
    setUndoLabel(undoStack.current[undoStack.current.length - 1]?.label ?? null);
    setDeskDay(null);
    setCaseId(null);
  }, []);

  const replace = useCallback(
    (loaded: GameState) => {
      const next = asRealtime(loaded);
      stateRef.current = next;
      setState(next);
      clearUndo();
    },
    [clearUndo],
  );

  const reset = useCallback(
    (seed?: number) => {
      clearLocal();
      const next = newCompany(seed);
      stateRef.current = next;
      setState(next);
      clearUndo();
      setDeskDay(null);
    },
    [clearUndo],
  );

  const setScreen = useCallback((s: ScreenId) => {
    setScreenRaw(s);
    try {
      localStorage.setItem('virtual-workplace/screen', s);
    } catch {
      /* 무시 */
    }
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<Store>(
    () => ({ state, update, advance, checkpoint, undo, undoCount, undoLabel, replace, reset, saveOk, screen, setScreen, openCase: setCaseId, caseId, deskDay, setDeskDay }),
    [state, update, advance, checkpoint, undo, undoCount, undoLabel, replace, reset, saveOk, screen, setScreen, caseId, deskDay],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider가 필요합니다');
  return s;
}
