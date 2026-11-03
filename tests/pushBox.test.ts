import { describe, expect, it } from 'vitest';
import { addMember, getState, putState, runDue, saveSchedule, validSub, vapidKeys, type Store } from '../worker/src/box';

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
const phone = { endpoint: 'https://web.push.apple.com/phone', keys: { p256dh: 'x', auth: 'y' } };
const pc = { endpoint: 'https://fcm.googleapis.com/fcm/send/pc', keys: { p256dh: 'x', auth: 'y' } };
const item = (at: number, kind: string, title: string) => ({ at, kind, title, body: '', tag: title });

describe('서버: 회사 저장본', () => {
  it('올릴 때마다 번호가 올라가고, 가진 번호보다 새것만 내려준다', async () => {
    const { store } = fakeStore();
    expect(await getState(store, 0)).toEqual({ rev: 0 });
    await putState(store, 'A', 1);
    await putState(store, 'B', 2);
    expect(await getState(store, 1)).toEqual({ rev: 2, state: 'B', at: 2 });
    expect(await getState(store, 2)).toEqual({ rev: 2 });
    await expect(putState(store, '')).rejects.toThrow();
  });
});

describe('서버: 알림', () => {
  it('가장 이른 시각에 알람을 맞추고, 시각이 된 것만 보낸다', async () => {
    const { store, alarm } = fakeStore();
    await addMember(store, phone, {}, await vapidKeys(store));
    await saveSchedule(store, [item(3000_000, 'quality', 'B'), item(2000_000, 'stockout', 'A')], 1000_000);
    expect(alarm()).toBe(2000_000);
    const sent: { title: string }[] = [];
    await runDue(store, async (_s, p) => (sent.push(p as { title: string }), { status: 201, gone: false }), 2000_000);
    expect(sent.map((p) => p.title)).toEqual(['A']);
    expect(alarm()).toBe(3000_000);
  });

  it('기기마다 끈 종류는 빼고 보낸다', async () => {
    const { store } = fakeStore();
    const keys = await vapidKeys(store);
    await addMember(store, phone, { quality: false }, keys);
    await addMember(store, pc, {}, keys);
    await saveSchedule(store, [item(10, 'quality', 'Q')], 0);
    const got: string[] = [];
    await runDue(store, async (s) => (got.push(s.endpoint), { status: 201, gone: false }), 10);
    expect(got).toEqual([pc.endpoint]);
  });

  it('밀린 여러 건은 하나로 묶고, 오래 밀린 것은 버린다', async () => {
    const { store } = fakeStore();
    await addMember(store, phone, {}, await vapidKeys(store));
    const now = 100 * 3600_000;
    await saveSchedule(store, [item(now - 7 * 3600_000 + 120_000, 'delay', 'old'), item(now - 30_000, 'delay', 'A'), item(now - 10_000, 'urgent', 'B')], now - 7 * 3600_000);
    const sent: { title: string }[] = [];
    await runDue(store, async (_s, p) => (sent.push(p as { title: string }), { status: 201, gone: false }), now);
    expect(sent.map((p) => p.title)).toEqual(['새 알림 2건']);
  });

  it('구독이 없어진 기기(410)는 목록에서 뺀다', async () => {
    const { store, data } = fakeStore();
    await addMember(store, phone, {}, await vapidKeys(store));
    await saveSchedule(store, [item(10, 'delay', 'A')], 0);
    await runDue(store, async () => ({ status: 410, gone: true }), 10);
    expect(data.get('members')).toEqual([]);
  });

  it('푸시 서비스 주소가 아니면 받지 않는다', () => {
    expect(validSub(phone)).toBe(true);
    expect(validSub({ endpoint: 'https://evil.example.com/x', keys: { p256dh: 'a', auth: 'b' } })).toBe(false);
  });
});
