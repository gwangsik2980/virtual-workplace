import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import { CODE_ALPHABET, decodeState, encodeState, formatCode, makeCode, normalizeCode } from '../src/ui/sync';

describe('기기 연결: 연결 코드', () => {
  it('서버가 받는 12자리 형식으로 만든다', () => {
    const server = /^[0-9A-HJKMNP-TV-Z]{12}$/; // worker/src/index.ts GROUP과 같은 글자
    expect(CODE_ALPHABET).toHaveLength(32);
    for (const c of CODE_ALPHABET) expect(server.test(c.repeat(12))).toBe(true);
    for (let i = 0; i < 50; i++) expect(server.test(makeCode())).toBe(true);
  });

  it('입력한 코드를 정리한다: 하이픈·띄어쓰기·소문자, 헷갈리는 글자', () => {
    expect(normalizeCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizeCode(' 0O1I L234 5678 ')).toBe('001112345678');
    expect(normalizeCode('ABCD')).toBeNull();
    expect(normalizeCode('ABCDEFGHJKMU')).toBeNull();
    expect(formatCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });
});

describe('기기 연결: 저장본 압축', () => {
  it('압축했다 풀면 같은 회사가 되고, 한 달치가 넉넉히 작다', async () => {
    const s = createInitialState(3, '2026-11-03', 'realtime');
    advanceDays(s, 22);
    const packed = await encodeState(s);
    const back = await decodeState(packed);
    expect(back.day).toBe(s.day);
    expect(JSON.stringify(back.events)).toBe(JSON.stringify(s.events));
    expect(packed.length).toBeLessThan(JSON.stringify(s).length / 3);
  });

  it('저장본이 아니면 거절한다', async () => {
    await expect(decodeState(btoa('nope'))).rejects.toThrow();
  });
});
