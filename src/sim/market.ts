import { chat } from './chat';
import { makeRng } from './rng';
import type { GameState, MaterialId } from './types';
import { logEvent, sendMessage } from './util';

/**
 * 시장 변동. 모든 값은 가상 데이터다 (실제 시세가 아님).
 * 난수 키에 날짜와 원료를 넣어 도구 적용 여부와 무관하게 같은 값이 나오게 한다.
 */
export function updateMarket(state: GameState): void {
  const { day, seed, market } = state;

  // 환율: 평균회귀가 있는 랜덤워크
  const fxRng = makeRng(seed, 'fx', day);
  const prevFx = market.fx;
  const fxDrift = (1350 - prevFx) * 0.02;
  market.fx = Math.max(1100, prevFx * Math.exp(0.004 * fxRng.normal()) + fxDrift);

  // 원자재 가격 충격 발생
  const shockRng = makeRng(seed, 'shock', day);
  market.shocks = market.shocks.filter((s) => s.until >= day);
  if (shockRng.chance(0.015)) {
    const ids = Object.keys(state.materials) as MaterialId[];
    const materialId = shockRng.pick(ids);
    if (!market.shocks.some((s) => s.materialId === materialId)) {
      const up = shockRng.chance(0.7);
      const drift = up ? shockRng.range(0.006, 0.012) : -shockRng.range(0.004, 0.008);
      const length = shockRng.int(8, 18);
      market.shocks.push({ materialId, until: day + length, drift });
      const name = state.materials[materialId].name;
      const title = up ? `${name} 국제 시세 상승세` : `${name} 시세 하락세`;
      const detail = up
        ? `작황·물류 이슈로 ${name} 가격이 당분간 오를 것으로 보입니다. (가상 뉴스)`
        : `공급 증가로 ${name} 가격이 약세를 보입니다. (가상 뉴스)`;
      logEvent(state, 'market', 'purchasing', title, detail);
      sendMessage(state, {
        from: '시장정보 뉴스레터',
        to: state.employee.name,
        subject: `[시황] ${title}`,
        body: detail + '\n\n※ 이 시뮬레이션의 시장 데이터는 모두 가상 값입니다.',
      });
    }
  }

  for (const m of Object.values(state.materials)) {
    const rng = makeRng(seed, 'price', m.id, day);
    const prev = market.prices[m.id];
    const shock = market.shocks.find((s) => s.materialId === m.id);
    const reversion = Math.log(m.baseMarketPrice / prev) * 0.01;
    let next = prev * Math.exp(m.volatility * rng.normal() + reversion + (shock?.drift ?? 0));
    if (m.imported) next *= market.fx / prevFx;
    market.prices[m.id] = next;
  }

  // 판촉 등 수요 변화
  const dRng = makeRng(seed, 'promo', day);
  if (market.demandBoostUntil < day) market.demandBoost = 1;
  if (market.demandBoostUntil < day && dRng.chance(0.02)) {
    const boost = dRng.range(1.15, 1.3);
    const length = dRng.int(6, 12);
    market.demandBoost = boost;
    market.demandBoostUntil = day + length;
    const pct = Math.round((boost - 1) * 100);
    logEvent(
      state,
      'demand',
      'sales',
      `대형마트 판촉 확정 (수요 +${pct}%)`,
      `영업팀: 앞으로 ${length}영업일 동안 판촉 행사로 수요가 약 ${pct}% 늘어날 예정입니다.`,
    );
    sendMessage(state, {
      from: '영업팀 박과장',
      to: '생산팀, 구매팀',
      subject: `[공유] 판촉 행사로 ${length}일간 물량 증가 예상`,
      body: `안녕하세요, 영업팀입니다.\n대형마트 판촉이 확정되어 ${length}영업일 동안 출고량이 약 ${pct}% 늘어날 예정입니다.\n원료 재고 확인 부탁드립니다.`,
    });
    chat(state, 'sales', [
      ['them', [`마트 판촉 확정됐어요. ${length}영업일 동안 물량 ${pct}% 정도 늘 거라 원료 미리 챙겨 주세요.`, `판촉 잡혔어요! ${length}일 정도 출고 ${pct}% 늘 거예요. 원료 모자라지 않게 부탁해요.`]],
      ['me', ['알려 주셔서 감사합니다. 재고 보고 발주 앞당길게요.', '미리 말씀해 주셔서 다행이에요. 재주문 시점 당겨 두겠습니다.']],
    ]);
  }
}

/** 오늘의 수요 (세트) */
export function demandToday(state: GameState): number {
  const rng = makeRng(state.seed, 'demand', state.day);
  const season = 1 + 0.08 * Math.sin((2 * Math.PI * state.day) / 60);
  const noise = 1 + 0.05 * rng.normal();
  return Math.max(0, Math.round(state.company.baseDemand * season * noise * state.market.demandBoost));
}

/** 원료의 일평균 사용량 (기준 수요 기준) */
export function dailyUsage(state: GameState, id: MaterialId): number {
  return state.materials[id].usagePerProduct * state.company.baseDemand * state.market.demandBoost;
}
