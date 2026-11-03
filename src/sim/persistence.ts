import { createInitialState, DEFAULT_PARAMS } from './seed';
import { emptyPayroll } from './payroll';
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
    return isValidState(parsed) ? migrate(parsed) : null;
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
  return migrate(parsed);
}

/**
 * 예전 버전 저장 파일에 없는 필드를 기본값으로 채운다.
 * 새 필드를 GameState에 추가하면 여기서 기본값이 들어가는지 확인할 것.
 */
export function migrate(s: GameState): GameState {
  const base = createInitialState(s.seed);
  const out = { ...base, ...s } as GameState;
  out.params = { ...DEFAULT_PARAMS, ...(s.params ?? {}) };
  out.learning = { ...base.learning, ...(s.learning ?? {}) };
  out.stats = { ...base.stats, ...(s.stats ?? {}) };
  out.counters = s.counters ?? {};
  // 급여 기능 추가 전 저장 파일: 빈 통장으로 시작한다
  if (!s.payroll) out.payroll = emptyPayroll(s.seed);
  // 담당자 이름 변경 (서지우 → GWANG). 예전 저장 파일도 새 이름으로 보이게 한다
  // 비용 구조 변경 (기타 원재료 추가, 고정비 조정). 예전 저장 파일은 새 비용 구조로 바꾼다
  if (out.company && out.company.otherCostPerUnit === undefined) {
    out.company = { ...out.company, otherCostPerUnit: base.company.otherCostPerUnit, fixedCostPerDay: base.company.fixedCostPerDay };
  }
  if (out.employee?.name === '서지우') out.employee = { ...out.employee, name: 'GWANG' };
  return out;
}
