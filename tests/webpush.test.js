// Web Push: Verschlüsselung gegen den offiziellen Testvektor (RFC 8291, Anhang A) und VAPID-Signatur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'node:crypto';
import { encrypt, vapidAuthorization, generateVapidKeys } from '../netlify/lib/webpush.mjs';

const b = s => Buffer.from(s, 'base64url');
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};

/** Entschlüsseln wie ein Browser (Gegenprobe) */
function decrypt(body, uaPrivate, auth) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const h = (k, d) => createHmac('sha256', k).update(d).digest();
  const ikm = h(h(auth, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const data = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'Ende-Markierung');
  return plain.subarray(0, -1).toString();
}

test('RFC 8291 Testvektor: Kopf stimmt, Browser kann entschlüsseln', () => {
  const body = encrypt(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: b(RFC.salt), serverPrivateKey: b(RFC.asPrivate) });
  // Kopf: salt · Datensatzgröße 4096 · Länge 65 · Server-Public-Key aus dem RFC
  assert.equal(body.subarray(0, 21).toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABB');
  assert.equal(body.subarray(21, 86).toString('base64url'), 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  assert.equal(decrypt(body, b(RFC.uaPrivate), b(RFC.auth)), RFC.plaintext);
  // komplette Nachricht Byte für Byte wie im RFC
  assert.equal(body.toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('Zufällige Verschlüsselung ist jedes Mal anders und bleibt entschlüsselbar', () => {
  const a = encrypt('{"title":"Kreatin"}', { p256dh: RFC.uaPublic, auth: RFC.auth });
  const c = encrypt('{"title":"Kreatin"}', { p256dh: RFC.uaPublic, auth: RFC.auth });
  assert.notDeepEqual(a, c);
  assert.equal(decrypt(a, b(RFC.uaPrivate), b(RFC.auth)), '{"title":"Kreatin"}');
});

test('VAPID: gültige ES256-Signatur, richtige Zielgruppe, Ablauf 12 h', () => {
  const keys = generateVapidKeys();
  const now = Date.parse('2026-10-18T10:00:00Z');
  const auth = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { ...keys, subject: 'mailto:test@example.com' }, now);
  const [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(b(c).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.exp, now / 1000 + 12 * 3600);
  const pub = b(keys.publicKey);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, b(sig)));
});
