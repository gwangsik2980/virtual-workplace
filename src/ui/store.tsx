import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { advanceDay } from '../sim/engine';
import { clearLocal, loadLocal, saveLocal } from '../sim/persistence';
import { createInitialState } from '../sim/seed';
import type { GameState } from '../sim/types';

export type ScreenId = 'overview' | 'desk' | 'process' | 'market' | 'lab' | 'performance' | 'learning' | 'assumptions';

interface Store {
  state: GameState;
  /** 상태를 복제해 수정한다. 수정 내용은 자동 저장된다. */
  update(fn: (draft: GameState) => void): void;
  advance(days: number): void;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => loadLocal() ?? createInitialState());
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

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveOk(saveLocal(state));
  }, [state]);

  const update = useCallback((fn: (draft: GameState) => void) => {
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const advance = useCallback((days: number) => {
    setState((prev) => {
      const next = structuredClone(prev);
      for (let i = 0; i < days; i++) advanceDay(next);
      return next;
    });
    setDeskDay(null);
  }, []);

  const replace = useCallback((next: GameState) => setState(next), []);

  const reset = useCallback((seed?: number) => {
    clearLocal();
    setState(createInitialState(seed));
    setDeskDay(null);
  }, []);

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
    () => ({ state, update, advance, replace, reset, saveOk, screen, setScreen, openCase: setCaseId, caseId, deskDay, setDeskDay }),
    [state, update, advance, replace, reset, saveOk, screen, setScreen, caseId, deskDay],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider가 필요합니다');
  return s;
}
