/**
 * 가온식품 서버 (Cloudflare Worker + Durable Object).
 * 1) 기기 연결: 연결 코드가 같은 기기들이 회사 저장본 하나를 함께 쓴다.
 * 2) 닫아 둔 동안 알림: 사이트가 계산해 올린 예정표를 시각에 맞춰 웹 푸시로 보낸다.
 * 서버는 회사 계산을 하지 않는다. 저장하고, 시각에 맞춰 보내기만 한다.
 *
 * 무료 요금제는 Worker 요청당 CPU 10ms라서, 앞단 Worker는 본문을 읽지 않고 Durable Object로 넘긴다.
 */
import { addMember, getState, putState, removeMember, runDue, saveSchedule, defaultSender, validSub, vapidKeys, type Store } from './box';
import type { VapidKeys } from './webpush';

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
/** 연결 코드: 헷갈리는 글자(I, L, O, U)를 뺀 32글자 중 12자리 */
const GROUP = /^\/g\/([0-9A-HJKMNP-TV-Z]{12})(\/[a-z]+)$/;

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    const keysBox = env.BOX.get(env.BOX.idFromName('vapid'));
    try {
      if (req.method === 'GET' && url.pathname === '/key') return withHeaders(await keysBox.fetch(new Request('https://box/key')), h);
      const m = GROUP.exec(url.pathname);
      if (!m) return json({ error: 'not found' }, 404, h);
      const [, id, action] = m;
      const box = env.BOX.get(env.BOX.idFromName(`g:${id}`));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (action === '/subscribe' || action === '/test') {
        headers['x-vapid'] = await (await keysBox.fetch(new Request('https://box/key-private'))).text();
      }
      const fwd = new Request(`https://box${action}${url.search}`, { method: req.method, headers, body: req.method === 'POST' ? req.body : undefined });
      return withHeaders(await box.fetch(fwd), h);
    } catch (e) {
      return json({ error: String(e) }, 500, h);
    }
  },
};

/** 그룹 하나마다 하나씩. 이름이 'vapid'인 것은 서버 서명 키만 들고 있다 */
export class PushBox {
  private store: Store;
  constructor(state: DOState) {
    this.store = state.storage;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path === '/key') return json({ publicKey: (await vapidKeys(this.store)).publicKey });
      if (path === '/key-private') return json(await vapidKeys(this.store));
      if (path === '/state' && req.method === 'GET') return json(await getState(this.store, Number(url.searchParams.get('since') ?? 0) || 0));
      if (req.method !== 'POST') return json({ error: 'not found' }, 404);
      const body = (await req.json()) as { state?: unknown; items?: unknown; subscription?: unknown; prefs?: unknown; endpoint?: unknown };
      if (path === '/state') return json(await putState(this.store, body.state));
      if (path === '/schedule') return json(await saveSchedule(this.store, body.items));
      if (path === '/unsubscribe') return json(await removeMember(this.store, String(body.endpoint ?? '')));
      if (path === '/subscribe' || path === '/test') {
        if (!validSub(body.subscription)) return json({ error: 'bad subscription' }, 400);
        const keys = JSON.parse(req.headers.get('x-vapid') ?? 'null') as VapidKeys;
        if (path === '/subscribe') return json(await addMember(this.store, body.subscription, body.prefs, keys));
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
