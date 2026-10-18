// Web Push ohne Bibliothek: Verschlüsselung nach RFC 8291 (aes128gcm) und VAPID-Signatur nach RFC 8292.
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign } from 'node:crypto';

const b64u = buf => Buffer.from(buf).toString('base64url');
const fromB64u = s => Buffer.from(s, 'base64url');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * Nachricht für ein Abo verschlüsseln.
 * keys: { p256dh, auth } aus der PushSubscription (base64url). Für Tests: feste salt/serverPrivateKey.
 */
export function encrypt(payload, keys, { salt = randomBytes(16), serverPrivateKey } = {}) {
  const uaPublic = fromB64u(keys.p256dh);
  const authSecret = fromB64u(keys.auth);
  const ecdh = createECDH('prime256v1');
  if (serverPrivateKey) ecdh.setPrivateKey(serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // RFC 8291, Abschnitt 3.4
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** VAPID-Schlüssel aus base64url (public = 65 Byte unkomprimiert, private = 32 Byte) */
function vapidKey(publicKey, privateKey) {
  const pub = fromB64u(publicKey);
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}

export function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidKey(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${publicKey}`;
}

/** Senden. Rückgabe: 'ok' | 'gone' (Abo abgelaufen → löschen) | 'error' */
export async function send(subscription, message, vapid) {
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: vapidAuthorization(subscription.endpoint, vapid),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(4 * 3600),
      urgency: 'high',
    },
    body: encrypt(JSON.stringify(message), subscription.keys),
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'ok' : 'error';
}

/** Neues VAPID-Schlüsselpaar (einmalig für die Einrichtung) */
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
