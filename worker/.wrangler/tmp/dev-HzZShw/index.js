var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/webpush.ts
var enc = new TextEncoder();
var subtle = /* @__PURE__ */ __name(() => globalThis.crypto.subtle, "subtle");
function b64url(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
function fromB64url(s) {
  const t = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - t.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(fromB64url, "fromB64url");
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
__name(concat, "concat");
async function hmac(key, data) {
  const k = await subtle().importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, data));
}
__name(hmac, "hmac");
function p256Jwk(pub, d) {
  const jwk = { kty: "EC", crv: "P-256", x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true };
  if (d) jwk.d = b64url(d);
  return jwk;
}
__name(p256Jwk, "p256Jwk");
async function generateVapidKeys() {
  const kp = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  const jwk = await subtle().exportKey("jwk", kp.privateKey);
  return { publicKey: b64url(pub), privateKey: jwk.d };
}
__name(generateVapidKeys, "generateVapidKeys");
async function encryptPayload(sub, plaintext, opts = {}) {
  const uaPublic = fromB64url(sub.keys.p256dh);
  const authSecret = fromB64url(sub.keys.auth);
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  let asPrivate;
  let asPublic;
  if (opts.serverKeys) {
    asPublic = opts.serverKeys.publicKey;
    asPrivate = await subtle().importKey("jwk", p256Jwk(asPublic, opts.serverKeys.privateKey), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  } else {
    const kp = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivate = kp.privateKey;
    asPublic = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  }
  const uaKey = await subtle().importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode("Content-Encoding: aes128gcm\0"))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode("Content-Encoding: nonce\0"))).slice(0, 12);
  const aes = await subtle().importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}
__name(encryptPayload, "encryptPayload");
async function vapidAuthorization(endpoint, keys, subject, nowSec = Math.floor(Date.now() / 1e3)) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const pub = fromB64url(keys.publicKey);
  const key = await subtle().importKey("jwk", p256Jwk(pub, fromB64url(keys.privateKey)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}
__name(vapidAuthorization, "vapidAuthorization");
async function sendPush(sub, payload, keys, subject, ttlSec = 3600) {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSec),
      Urgency: "high"
    },
    body
  });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
__name(sendPush, "sendPush");

// src/box.ts
var SUBJECT = "https://gwangsik2980.github.io/virtual-workplace/";
var MAX_ITEMS = 300;
var STALE_MS = 6 * 36e5;
var defaultSender = /* @__PURE__ */ __name((sub, payload, keys) => sendPush(sub, payload, keys, SUBJECT), "defaultSender");
async function vapidKeys(store) {
  const have = await store.get("vapid");
  if (have) return have;
  const keys = await generateVapidKeys();
  await store.put("vapid", keys);
  return keys;
}
__name(vapidKeys, "vapidKeys");
function clean(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((i) => !!i && typeof i.at === "number" && typeof i.title === "string").slice(0, MAX_ITEMS).map((i) => ({ at: i.at, title: i.title.slice(0, 120), body: String(i.body ?? "").slice(0, 400), tag: String(i.tag ?? "").slice(0, 64) })).sort((a, b) => a.at - b.at);
}
__name(clean, "clean");
async function arm(store, items) {
  if (items.length) await store.setAlarm(items[0].at);
  else await store.deleteAlarm();
}
__name(arm, "arm");
async function saveSchedule(store, sub, keys, rawItems, now = Date.now()) {
  const items = clean(rawItems).filter((i) => i.at > now - 6e4);
  await store.put("sub", sub);
  await store.put("keys", keys);
  await store.put("items", items);
  await store.put("updatedAt", now);
  await arm(store, items);
  return { count: items.length, next: items[0]?.at ?? null };
}
__name(saveSchedule, "saveSchedule");
async function runDue(store, send = defaultSender, now = Date.now()) {
  const sub = await store.get("sub");
  const keys = await store.get("keys");
  const items = await store.get("items") ?? [];
  if (!sub || !keys) {
    await store.deleteAll();
    return { sent: 0 };
  }
  const due = items.filter((i) => i.at <= now + 5e3 && i.at > now - STALE_MS);
  const rest = items.filter((i) => i.at > now + 5e3);
  let sent = 0;
  if (due.length) {
    const payload = due.length === 1 ? due[0] : { title: `\uC0C8 \uC54C\uB9BC ${due.length}\uAC74`, body: due.slice(-3).map((i) => i.title).join("\n"), tag: "vw-batch", at: now };
    const r = await send(sub, payload, keys);
    if (r.gone) {
      await store.deleteAll();
      return { sent: 0, gone: true };
    }
    sent = 1;
  }
  await store.put("items", rest);
  await arm(store, rest);
  return { sent };
}
__name(runDue, "runDue");

// src/index.ts
var ORIGINS = ["https://gwangsik2980.github.io", "http://localhost:4173", "http://localhost:5173"];
var PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
function cors(req) {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}
__name(cors, "cors");
var json = /* @__PURE__ */ __name((data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } }), "json");
function validSub(s) {
  const sub = s;
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}
__name(validSub, "validSub");
var src_default = {
  async fetch(req, env) {
    const h = cors(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const path = new URL(req.url).pathname;
    const keysBox = env.BOX.get(env.BOX.idFromName("vapid"));
    try {
      if (req.method === "GET" && path === "/key") {
        const r = await keysBox.fetch(new Request("https://box/key"));
        return json(await r.json(), 200, h);
      }
      if (req.method !== "POST") return json({ error: "not found" }, 404, h);
      const body = await req.json();
      const sub = body.subscription;
      const endpoint = validSub(sub) ? sub.endpoint : body.endpoint;
      if (typeof endpoint !== "string" || path !== "/unsubscribe" && !validSub(sub)) return json({ error: "bad subscription" }, 400, h);
      const box = env.BOX.get(env.BOX.idFromName(endpoint));
      if (path === "/schedule" || path === "/test" || path === "/unsubscribe") {
        const keys = await (await keysBox.fetch(new Request("https://box/key-private"))).json();
        const r = await box.fetch(new Request(`https://box${path}`, { method: "POST", body: JSON.stringify({ subscription: sub, items: body.items, keys }) }));
        return json(await r.json(), r.status, h);
      }
      return json({ error: "not found" }, 404, h);
    } catch (e) {
      return json({ error: String(e) }, 500, h);
    }
  }
};
var PushBox = class {
  static {
    __name(this, "PushBox");
  }
  constructor(state) {
    this.store = state.storage;
  }
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/key") return json({ publicKey: (await vapidKeys(this.store)).publicKey });
    if (path === "/key-private") return json(await vapidKeys(this.store));
    const body = await req.json();
    if (path === "/schedule") return json(await saveSchedule(this.store, body.subscription, body.keys, body.items));
    if (path === "/test") {
      const r = await defaultSender(body.subscription, { title: "\uC54C\uB9BC\uC774 \uC5F0\uACB0\uB410\uC5B4\uC694", body: "\uC0AC\uC774\uD2B8\uB97C \uB2EB\uC544 \uB450\uC5B4\uB3C4 \uACB0\uD488, \uAE34\uAE09 \uC694\uCCAD \uAC19\uC740 \uC77C\uC774 \uC0DD\uAE30\uBA74 \uC54C\uB824 \uB4DC\uB9BD\uB2C8\uB2E4.", tag: "vw-test" }, body.keys);
      return json({ status: r.status }, r.status >= 200 && r.status < 300 ? 200 : 502);
    }
    if (path === "/unsubscribe") {
      await this.store.deleteAll();
      await this.store.deleteAlarm();
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }
  async alarm() {
    await runDue(this.store);
  }
};

// ../../../../root/.npm/_npx/a0592654bef13561/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../root/.npm/_npx/a0592654bef13561/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-MTFt4U/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../root/.npm/_npx/a0592654bef13561/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-MTFt4U/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  PushBox,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
