import { describe, expect, it } from 'vitest';
import { isBusinessDay, minutesIntoWorkday, nextBusinessDayISO, realtimeTargetDay } from '../src/sim/calendar';
import { formatDay } from '../src/sim/util';

const at = (iso: string, hm = '10:00') => new Date(`${iso}T${hm}:00`);

describe('영업일 달력', () => {
  it('주말과 공휴일은 쉰다', () => {
    expect(isBusinessDay(at('2026-11-03'))).toBe(true); // 화
    expect(isBusinessDay(at('2026-11-07'))).toBe(false); // 토
    expect(isBusinessDay(at('2026-12-25'))).toBe(false); // 성탄절
    expect(isBusinessDay(at('2027-01-01'))).toBe(false); // 신정
    expect(isBusinessDay(at('2027-09-15'))).toBe(false); // 추석
  });

  it('2028~2030년 설·추석과 대체공휴일을 쉰다', () => {
    expect(isBusinessDay(at('2028-01-27'))).toBe(false); // 설날
    expect(isBusinessDay(at('2028-10-05'))).toBe(false); // 추석이 개천절과 겹친 대체공휴일
    expect(isBusinessDay(at('2029-01-02'))).toBe(true); // 신정 다음 날, 첫 영업일
    expect(isBusinessDay(at('2029-09-24'))).toBe(false); // 추석 대체공휴일
    expect(isBusinessDay(at('2030-02-05'))).toBe(false); // 설날 대체공휴일
  });

  it('2027년은 관보 월력요항과 같다 (노동절·제헌절·성탄절 대체)', () => {
    expect(isBusinessDay(at('2027-05-03'))).toBe(false); // 노동절(토) 대체
    expect(isBusinessDay(at('2027-07-19'))).toBe(false); // 제헌절(토) 대체
    expect(isBusinessDay(at('2027-12-27'))).toBe(false); // 기독탄신일(토) 대체
    expect(isBusinessDay(at('2027-02-09'))).toBe(false); // 설날 대체
    expect(isBusinessDay(at('2027-06-07'))).toBe(true); // 현충일(일)은 대체 없음
  });

  it('노동절과 제헌절은 2026년 규정 개정부터 공휴일', () => {
    expect(isBusinessDay(at('2026-05-01'))).toBe(false);
    expect(isBusinessDay(at('2026-07-17'))).toBe(false);
    expect(isBusinessDay(at('2028-05-01'))).toBe(false);
    expect(isBusinessDay(at('2028-07-17'))).toBe(false);
    expect(isBusinessDay(at('2029-05-01'))).toBe(false);
    expect(isBusinessDay(at('2030-07-17'))).toBe(false);
  });

  it('선거일: 2028 국회의원, 2030 대통령, 2030 지방선거는 현충일 전날을 피해 6/12', () => {
    expect(isBusinessDay(at('2028-04-12'))).toBe(false);
    expect(isBusinessDay(at('2030-03-27'))).toBe(false);
    expect(isBusinessDay(at('2030-06-12'))).toBe(false);
    expect(isBusinessDay(at('2030-06-05'))).toBe(true);
  });

  it('목록이 끝난 해부터는 양력 고정 공휴일만 쉰다', () => {
    expect(isBusinessDay(at('2031-01-01'))).toBe(false); // 신정 (수)
    expect(isBusinessDay(at('2031-10-09'))).toBe(false); // 한글날 (목)
    expect(isBusinessDay(at('2031-05-01'))).toBe(false); // 노동절 (목)
    expect(isBusinessDay(at('2031-07-17'))).toBe(false); // 제헌절 (목)
    expect(isBusinessDay(at('2031-01-02'))).toBe(true);
  });

  it('일차를 날짜로 바꿀 때 공휴일을 건너뛴다', () => {
    // 2026-12-24(목) 다음 영업일은 12-28(월)
    expect(formatDay('2026-12-24', 2)).toBe('2026-12-28(월)');
  });

  it('휴일에 시작하면 다음 영업일이 1일차', () => {
    expect(nextBusinessDayISO(at('2026-11-07'))).toBe('2026-11-09');
  });
});

describe('실시간 목표 일차', () => {
  const start = '2026-11-03';
  it('첫날 09:00 전에는 아직 0일', () => expect(realtimeTargetDay(start, at(start, '08:30'))).toBe(0));
  it('첫날 09:00가 되면 1일차를 계산', () => expect(realtimeTargetDay(start, at(start, '09:00'))).toBe(1));
  it('주말에는 금요일까지', () => expect(realtimeTargetDay(start, at('2026-11-08', '15:00'))).toBe(4));
  it('다음 주 월요일 출근 전에는 금요일까지, 출근 후에는 월요일까지', () => {
    expect(realtimeTargetDay(start, at('2026-11-09', '08:00'))).toBe(4);
    expect(realtimeTargetDay(start, at('2026-11-09', '09:30'))).toBe(5);
  });
  it('근무 중 경과 분', () => {
    expect(minutesIntoWorkday(at(start, '09:30'))).toBe(30);
    expect(minutesIntoWorkday(at(start, '18:30'))).toBeNull();
    expect(minutesIntoWorkday(at('2026-11-07', '10:00'))).toBeNull();
  });
});

import { advanceDays } from '../src/sim/engine';
import { createInitialState } from '../src/sim/seed';
import { stageAtNow } from '../src/ui/realtime';

describe('지금 시각 기준 구매 단계', () => {
  it('업무 블록 도중이면 그 블록의 단계를, 하루가 끝나면 최종 단계를 돌려준다', () => {
    const s = advanceDays(createInitialState(), 15);
    const day = s.day - 1;
    const blocks = s.schedule.filter((b) => b.day === day && b.caseId && b.stage);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const c = s.cases.find((x) => x.id === b.caseId)!;
      expect(stageAtNow(s, c, { target: day, liveMinute: b.start + Math.floor(b.minutes / 2) })).toBe(b.stage);
      expect(stageAtNow(s, c, { target: day, liveMinute: null })).toBe(c.stage);
    }
  });
});
