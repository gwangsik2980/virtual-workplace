import { describe, expect, it } from 'vitest';
import { alertKind } from '../src/sim/alertKinds';
import { advanceDays } from '../src/sim/engine';
import { buildPushSchedule, eventTime } from '../src/sim/pushSchedule';
import { createInitialState } from '../src/sim/seed';

const at = (iso: string) => new Date(iso); // 테스트 환경 시간대 기준 현지 시각

describe('닫아 둔 동안 보낼 알림 예정표', () => {
  it('미리 계산한 알림이 나중에 실제로 따라잡은 회사의 사건과 같다', () => {
    const start = createInitialState(7, '2026-11-03', 'realtime');
    advanceDays(start, 3); // 11/3~11/5까지 계산된 상태
    const now = at('2026-11-05T10:30:00');
    const items = buildPushSchedule(start, now, 20);

    // 사이트를 다시 열어 따라잡았을 때의 회사
    const later = structuredClone(start);
    advanceDays(later, 20);
    const expected = later.events
      .filter((e) => alertKind(e) && eventTime(later.startDate, e) > now.getTime())
      .map((e) => eventTime(later.startDate, e));
    const pushed = items.filter((i) => i.kind !== 'horizon').map((i) => i.at);
    expect(expected.length).toBeGreaterThan(0);
    expect(pushed).toEqual(expected.sort((a, b) => a - b));
  });

  it('원래 상태를 바꾸지 않는다', () => {
    const s = createInitialState(3, '2026-11-03', 'realtime');
    advanceDays(s, 2);
    const before = JSON.stringify(s);
    buildPushSchedule(s, at('2026-11-04T09:30:00'), 5);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('이미 지난 시각은 넣지 않고, 종류를 달고, 마지막 날 끝 안내를 붙인다', () => {
    const s = createInitialState(5, '2026-11-03', 'realtime');
    advanceDays(s, 1);
    const now = at('2026-11-03T15:00:00');
    const items = buildPushSchedule(s, now, 30);
    expect(items.every((i) => i.at > now.getTime())).toBe(true);
    expect(items.every((i) => i.kind)).toBe(true);
    expect(items[items.length - 1].kind).toBe('horizon');
  });
});
