/**
 * Web Push 보내기 (외부 라이브러리 없이 WebCrypto만 사용).
 * - 내용 암호화: RFC 8291 (aes128gcm, RFC 8188 형식)
 * - 보낸 서버 확인: RFC 8292 (VAPID, ES256 JWT)
 * Cloudflare Workers와 Node 22 모두 globalThis.crypto.subtle이 있어서 같은 코드로 테스트한다.
 */

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, data));
}

/** 압축하지 않은 P-256 공개키(65바이트)와 비밀값(32바이트)을 JWK로 */
function p256Jwk(pub: Uint8Array, d?: Uint8Array): JsonWebKey {
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true };
  if (d) jwk.d = b64url(d);
  return jwk;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  publicKey: string; // base64url, 65바이트
  privateKey: string; // base64url, 32바이트 (d)
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  const jwk = await subtle().exportKey('jwk', kp.privateKey);
  return { publicKey: b64url(pub), privateKey: jwk.d! };
}

export interface EncryptOptions {
  /** 테스트용: RFC 8291 부록 A 값으로 고정 */
  salt?: Uint8Array;
  serverKeys?: { publicKey: Uint8Array; privateKey: Uint8Array };
}

/** RFC 8291: 받는 브라우저의 키로 내용을 암호화한 본문 (헤더 + 암호문) */
export async function encryptPayload(sub: PushSubscriptionJSON, plaintext: Uint8Array, opts: EncryptOptions = {}): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.keys.p256dh);
  const authSecret = fromB64url(sub.keys.auth);
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));

  let asPrivate: CryptoKey;
  let asPublic: Uint8Array;
  if (opts.serverKeys) {
    asPublic = opts.serverKeys.publicKey;
    asPrivate = await subtle().importKey('jwk', p256Jwk(asPublic, opts.serverKeys.privateKey), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const kp = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    asPrivate = kp.privateKey;
    asPublic = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  }
  const uaKey = await subtle().importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));

  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);

  const aes = await subtle().importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** RFC 8292: 받는 푸시 서비스(애플·구글 등)에 보낼 VAPID 인증 헤더 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const pub = fromB64url(keys.publicKey);
  const key = await subtle().importKey('jwk', p256Jwk(pub, fromB64url(keys.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

export interface SendResult {
  status: number;
  /** 404·410이면 구독이 없어진 것이라 지워야 한다 */
  gone: boolean;
}

export async function sendPush(sub: PushSubscriptionJSON, payload: unknown, keys: VapidKeys, subject: string, ttlSec = 3600): Promise<SendResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSec),
      Urgency: 'high',
    },
    body,
  });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
