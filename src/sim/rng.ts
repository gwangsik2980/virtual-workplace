/**
 * 재현 가능한 난수.
 *
 * 하나의 난수 스트림을 순서대로 소비하면, 도구 적용 여부처럼 사소한 차이만으로도
 * 이후의 모든 사건(시장가격, 수요, 납기 지연)이 달라진다. 그러면 "도구 적용 전후"를
 * 공정하게 비교할 수 없다.
 *
 * 그래서 난수를 (시드, 용도 키)의 해시로 만든다. 예를 들어 '42일차 밀가루 시장가격'은
 * 도구를 켜든 끄든 항상 같은 값이 나온다.
 */

function hashString(str: string): number {
  // cyrb53 변형 (32비트 결과)
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  chance(p: number): boolean;
  /** 평균 0, 표준편차 1 */
  normal(): number;
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seed: number, ...keys: (string | number)[]): Rng {
  const gen = mulberry32(hashString(`${seed}|${keys.join('|')}`));
  const rng: Rng = {
    next: gen,
    range: (min, max) => min + (max - min) * gen(),
    int: (min, maxInclusive) => Math.floor(min + (maxInclusive - min + 1) * gen()),
    chance: (p) => gen() < p,
    normal: () => {
      const u = Math.max(gen(), 1e-12);
      const v = gen();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (arr) => arr[Math.floor(gen() * arr.length)],
  };
  return rng;
}
