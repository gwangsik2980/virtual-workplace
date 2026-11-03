import { describe, expect, it } from 'vitest';
import { b64url, encryptPayload, fromB64url, generateVapidKeys, vapidAuthorization } from '../worker/src/webpush';

// RFC 8291 부록 A의 예시 값
const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  cipher: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

describe('web push', () => {
  it('RFC 8291 부록 A 예시와 같은 암호문을 만든다', async () => {
    const out = await encryptPayload(
      { endpoint: 'https://push.example.net/x', keys: { p256dh: V.uaPublic, auth: V.auth } },
      fromB64url(V.plaintext),
      { salt: fromB64url(V.salt), serverKeys: { publicKey: fromB64url(V.asPublic), privateKey: fromB64url(V.asPrivate) } },
    );
    const header = fromB64url(V.header);
    expect(b64url(out.slice(0, header.length))).toBe(V.header);
    expect(b64url(out.slice(header.length))).toBe(V.cipher);
  });

  it('VAPID 서명이 공개키로 검증된다', async () => {
    const keys = await generateVapidKeys();
    const auth = await vapidAuthorization('https://web.push.apple.com/abc', keys, 'https://example.org/', 1_800_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
    expect(claims).toMatchObject({ aud: 'https://web.push.apple.com', sub: 'https://example.org/', exp: 1_800_000_000 + 43200 });
    const pub = await crypto.subtle.importKey('raw', fromB64url(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});
