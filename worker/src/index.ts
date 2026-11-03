/**
 * 가온식품 알림 서버 (Cloudflare Worker + Durable Object).
 * 사이트가 열려 있을 때 앞으로 올 알림 예정표를 계산해 여기에 맡기고,
 * 사이트를 닫아 두어도 이 서버가 그 시각에 웹 푸시를 보낸다.
 * 회사 계산은 하지 않는다. 받은 예정표를 시각에 맞춰 보내기만 한다.
 */
import { defaultSender, runDue, saveSchedule, vapidKeys, type Store } from './box';
import type { PushSubscriptionJSON } from './webpush';

interface DOState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(at: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
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
/** 브라우저 푸시 서비스 주소만 받는다 (아무 주소로나 요청을 보내는 데 쓰이지 않도록) */
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

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

function validSub(s: unknown): s is PushSubscriptionJSON {
  const sub = s as PushSubscriptionJSON;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const path = new URL(req.url).pathname;
    const keysBox = env.BOX.get(env.BOX.idFromName('vapid'));
    try {
      if (req.method === 'GET' && path === '/key') {
        const r = await keysBox.fetch(new Request('https://box/key'));
        return json(await r.json(), 200, h);
      }
      if (req.method !== 'POST') return json({ error: 'not found' }, 404, h);
      const body = (await req.json()) as { subscription?: unknown; items?: unknown; endpoint?: string };
      const sub = body.subscription;
      const endpoint = validSub(sub) ? sub.endpoint : body.endpoint;
      if (typeof endpoint !== 'string' || (path !== '/unsubscribe' && !validSub(sub))) return json({ error: 'bad subscription' }, 400, h);
      const box = env.BOX.get(env.BOX.idFromName(endpoint));
      if (path === '/schedule' || path === '/test' || path === '/unsubscribe') {
        const keys = await (await keysBox.fetch(new Request('https://box/key-private'))).json();
        const r = await box.fetch(new Request(`https://box${path}`, { method: 'POST', body: JSON.stringify({ subscription: sub, items: body.items, keys }) }));
        return json(await r.json(), r.status, h);
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: String(e) }, 500, h);
    }
  },
};

/** 구독 하나마다 하나씩 생기는 저장소. 이름이 'vapid'인 것은 서버 서명 키만 들고 있다 */
export class PushBox {
  private store: Store;
  constructor(state: DOState) {
    this.store = state.storage;
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === '/key') return json({ publicKey: (await vapidKeys(this.store)).publicKey });
    if (path === '/key-private') return json(await vapidKeys(this.store));
    const body = (await req.json()) as { subscription: PushSubscriptionJSON; items: unknown; keys: Awaited<ReturnType<typeof vapidKeys>> };
    if (path === '/schedule') return json(await saveSchedule(this.store, body.subscription, body.keys, body.items));
    if (path === '/test') {
      const r = await defaultSender(body.subscription, { title: '알림이 연결됐어요', body: '사이트를 닫아 두어도 결품, 긴급 요청 같은 일이 생기면 알려 드립니다.', tag: 'vw-test' }, body.keys);
      return json({ status: r.status }, r.status >= 200 && r.status < 300 ? 200 : 502);
    }
    if (path === '/unsubscribe') {
      await this.store.deleteAll();
      await this.store.deleteAlarm();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }

  async alarm(): Promise<void> {
    await runDue(this.store);
  }
}
