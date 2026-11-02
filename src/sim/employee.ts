import type { GameState, SkillId } from './types';
import { logEvent } from './util';

export const RANKS: { name: string; xp: number }[] = [
  { name: '사원', xp: 0 },
  { name: '주임', xp: 900 },
  { name: '대리', xp: 2600 },
  { name: '과장', xp: 6000 },
];

/** 업무 수행으로 경험치와 숙련도가 오른다. 숙련도가 높을수록 성장 폭은 줄어든다. */
export function gainExperience(state: GameState, skill: SkillId, minutes: number): void {
  const e = state.employee;
  e.xp += minutes / 10;
  const before = e.skills[skill];
  const gain = 0.22 * (1 - before / 100) * Math.min(1, minutes / 30);
  e.skills[skill] = Math.min(100, before + gain);

  const crossed = [20, 30, 40, 50, 60, 70, 80].find((t) => before < t && e.skills[skill] >= t);
  if (crossed && crossed >= 40) {
    const names: Record<SkillId, string> = { market: '시장조사', costing: '원가분석', negotiation: '협상', docs: '문서·데이터 처리' };
    e.milestones.push({ day: state.day, text: `${names[skill]} 숙련도 ${crossed} 달성` });
  }

  const next = RANKS.find((r) => r.xp > 0 && e.xp >= r.xp && RANKS.findIndex((x) => x.name === e.rank) < RANKS.indexOf(r));
  if (next) {
    e.rank = next.name;
    e.milestones.push({ day: state.day, text: `${next.name}(으)로 승진` });
    logEvent(state, 'career', 'purchasing', `${e.name} ${next.name} 승진`, `누적 경험치 ${Math.round(e.xp)}를 넘어 ${next.name}(으)로 승진했습니다.`);
  }
}
