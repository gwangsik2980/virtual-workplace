import type { GameState } from './types';

/**
 * 저장·불러오기.
 * 브라우저 저장소(localStorage)에 자동 저장하고, 기기를 바꾸거나 저장소가 지워질 때를
 * 대비해 JSON 파일로 내보내기·가져오기를 제공한다.
 */

const KEY = 'virtual-workplace/save/v1';

export function saveLocal(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

export function isValidState(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const g = s as Partial<GameState>;
  return g.version === 1 && typeof g.day === 'number' && typeof g.seed === 'number' && !!g.materials && Array.isArray(g.cases);
}

export function exportJson(state: GameState): string {
  return JSON.stringify(state);
}

export function importJson(text: string): GameState {
  const parsed = JSON.parse(text);
  if (!isValidState(parsed)) throw new Error('올바른 저장 파일이 아닙니다.');
  return parsed;
}
