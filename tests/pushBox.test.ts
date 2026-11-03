import { describe, expect, it } from 'vitest';
import { runDue, saveSchedule, vapidKeys, type Store } from '../worker/src/box';

function fakeStore() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const store: Store = {
    get: async <T,>(k: string) => data.get(k) as T | undefined,
    put: async (k, v) => void data.set(k, structuredClone(v)),
    deleteAll: async () => data.clear(),
    setAlarm: async (t) => void (alarm = t),
    deleteAlarm: async () => void (alarm = null),
  };
  return { store, data, alarm: () => alarm };
}
const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'x', auth: 'y' } };

describe('알림 서버 예정표', () => {
  it('가장 이른 시각에 알람을 맞추고, 시각이 된 것만 보낸다', async () => {
    const { store, alarm } = fakeStore();
    const keys = await vapidKeys(store);
    await saveSchedule(store, sub, keys, [
      { at: 3000_000, title: 'B', body: '', tag: 'b' },
      { at: 2000_000, title: 'A', body: '', tag: 'a' },
    ], 1000_000);
    expect(alarm()).toBe(2000_000);
    const sent: unknown[] = [];
    await runDue(store, async (_s, p) => (sent.push(p), { status: 201, gone: false }), 2000_000);
    expect(sent).toEqual([{ at: 2000_000, title: 'A', body: '', tag: 'a' }]);
    expect(alarm()).toBe(3000_000);
  });

  it('밀린 알림 여러 건은 하나로 묶고, 오래 밀린 것은 버린다', async () => {
    const { store } = fakeStore();
    const keys = await vapidKeys(store);
    const now = 100 * 3600_000;
    await saveSchedule(store, sub, keys, [
      { at: now - 7 * 3600_000 + 120_000, title: 'old', body: '', tag: 'o' },
      { at: now - 60_000 + 30_000, title: 'A', body: '', tag: 'a' },
      { at: now - 10_000, title: 'B', body: '', tag: 'b' },
    ], now - 7 * 3600_000);
    const sent: { title: string }[] = [];
    await runDue(store, async (_s, p) => (sent.push(p as { title: string }), { status: 201, gone: false }), now);
    expect(sent.map((p) => p.title)).toEqual(['새 알림 2건']);
  });

  it('구독이 없어졌으면(410) 저장한 것을 지운다', async () => {
    const { store, data } = fakeStore();
    await saveSchedule(store, sub, await vapidKeys(store), [{ at: 10, title: 'A', body: '', tag: 'a' }], 0);
    const r = await runDue(store, async () => ({ status: 410, gone: true }), 10);
    expect(r).toMatchObject({ gone: true });
    expect(data.size).toBe(0);
  });
});
