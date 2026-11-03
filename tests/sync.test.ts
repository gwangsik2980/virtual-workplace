import { describe, expect, it } from 'vitest';
import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import { KEY_ALPHABET as SERVER_ALPHABET, KEY_LENGTH as SERVER_LENGTH } from '../worker/src/box';
import { decodeState, encodeState, formatKey, KEY_ALPHABET, KEY_LENGTH, normalizeKey } from '../src/ui/sync';

describe('관리자 키 입력', () => {
  it('서버가 만드는 키와 같은 글자·길이', () => {
    expect(KEY_ALPHABET).toBe(SERVER_ALPHABET);
    expect(KEY_LENGTH).toBe(SERVER_LENGTH);
  });

  it('입력한 키를 정리한다: 하이픈·띄어쓰기·소문자, 헷갈리는 글자', () => {
    expect(normalizeKey('abcd-efgh-jkmn-pqrs-tvwx')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normalizeKey(' 0O1I L234 5678 9ABC DEFG')).toBe('0011123456789ABCDEFG');
    expect(normalizeKey('ABCD')).toBeNull();
    expect(normalizeKey('ABCDEFGHJKMNPQRSTVWU')).toBeNull();
    expect(formatKey('ABCDEFGHJKMNPQRSTVWX')).toBe('ABCD-EFGH-JKMN-PQRS-TVWX');
  });
});

describe('저장본 압축', () => {
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
