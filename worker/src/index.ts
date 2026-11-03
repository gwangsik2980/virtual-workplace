/**
 * 가온식품 서버 (Cloudflare Worker + Durable Object).
 * 회사는 서버에 하나만 있다. 누구나 볼 수 있고, 바꾸기와 알림은 관리자 키가 있는 기기만 한다.
 * 1) 회사 저장본: 관리자 기기가 바꾸면 올리고, 모든 기기가 열 때 받아 간다.
 * 2) 닫아 둔 동안 알림: 사이트가 계산해 올린 예정표를 시각에 맞춰 웹 푸시로 보낸다.
 * 서버는 회사 계산을 하지 않는다. 저장하고, 시각에 맞춰 보내기만 한다.
 *
 * 무료 요금제는 Worker 요청당 CPU 10ms라서, 앞단 Worker는 본문을 읽지 않고 Durable Object로 넘긴다.
 */
import { addMember, claimOwner, getState, isOwner, ownerClaimed, putState, removeMember, runDue, saveSchedule, defaultSender, validSub, vapidKeys, type Store } from './box';

interface DOState {
  storage: Store;
}
interface DOStub {
  fetch(req: Request): Promise<Response>;
}
interface DONamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DOStub;
}
interface Env {
  BOX: DONamespace;
}

const ORIGINS = ['https://gwangsik2980.github.io', 'http://localhost:4173', 'http://localhost:5173'];
const PATHS = new Set(['/key', '/owner', '/claim', '/check', '/state', '/schedule', '/subscribe', '/unsubscribe', '/test']);

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const withHeaders = (r: Response, h: Record<string, string>) => {
  const out = new Response(r.body, r);
  for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
  return out;
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (!PATHS.has(url.pathname)) return json({ error: 'not found' }, 404, h);
    try {
      const box = env.BOX.get(env.BOX.idFromName('main'));
      const fwd = new Request(`https://box${url.pathname}${url.search}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
        body: req.method === 'POST' ? req.body : undefined,
      });
      return withHeaders(await box.fetch(fwd), h);
    } catch (e) {
      return json({ error: String(e) }, 500, h);
    }
  },
};

/** 회사 하나의 저장소 */
export class PushBox {
  private store: Store;
  constructor(state: DOState) {
    this.store = state.storage;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const s = this.store;
    try {
      if (req.method === 'GET') {
        if (path === '/key') return json({ publicKey: (await vapidKeys(s)).publicKey });
        if (path === '/owner') return json(await ownerClaimed(s));
        if (path === '/state') return json(await getState(s, Number(url.searchParams.get('since') ?? 0) || 0));
        return json({ error: 'not found' }, 404);
      }
      if (path === '/claim') return json(await claimOwner(s));
      // 여기부터는 관리자 키가 있어야 한다
      const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!(await isOwner(s, key))) return json({ error: 'forbidden' }, 403);
      if (path === '/check') return json({ ok: true });
      const body = (await req.json()) as { state?: unknown; items?: unknown; subscription?: unknown; prefs?: unknown; endpoint?: unknown };
      if (path === '/state') return json(await putState(s, body.state));
      if (path === '/schedule') return json(await saveSchedule(s, body.items));
      if (path === '/unsubscribe') return json(await removeMember(s, String(body.endpoint ?? '')));
      if (path === '/subscribe' || path === '/test') {
        if (!validSub(body.subscription)) return json({ error: 'bad subscription' }, 400);
        const keys = await vapidKeys(s);
        if (path === '/subscribe') return json(await addMember(s, body.subscription, body.prefs, keys));
        const r = await defaultSender(body.subscription, { title: '알림이 연결됐어요', body: '사이트를 닫아 두어도 결품, 긴급 요청 같은 일이 생기면 알려 드립니다.', tag: 'vw-test' }, keys);
        return json({ status: r.status }, r.status >= 200 && r.status < 300 ? 200 : 502);
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e instanceof Error ? e.message : e) }, 400);
    }
  }

  async alarm(): Promise<void> {
    await runDue(this.store);
  }
}
