// Server-Sicherheit: Verschlüsselung der Hevy-/Strava-Schlüssel und das signierte Strava-„state“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, sign, verify, secretKey } from '../netlify/lib/server.mjs';

const key = randomBytes(32);
const otherKey = randomBytes(32);

test('Verschlüsseln und Entschlüsseln', () => {
  const blob = encrypt('hevy-geheimer-key-123', key);
  assert.notEqual(blob, 'hevy-geheimer-key-123');
  assert.equal(decrypt(blob, key), 'hevy-geheimer-key-123');
  assert.notEqual(encrypt('x', key), encrypt('x', key), 'zufälliger IV');
});

test('Manipulierte oder fremde Daten werden abgelehnt', () => {
  const blob = encrypt('geheim', key);
  const [iv, tag, data] = blob.split('.');
  const flipped = Buffer.from(data, 'base64'); flipped[0] ^= 1;
  assert.throws(() => decrypt([iv, tag, flipped.toString('base64')].join('.'), key));
  assert.throws(() => decrypt(blob, otherKey));
});

test('Schlüssel muss 32 Byte haben', () => {
  assert.equal(secretKey(randomBytes(32).toString('base64')).length, 32);
  assert.throws(() => secretKey(randomBytes(16).toString('base64')), /32 Byte/);
});

test('Signiertes state: gültig, gefälscht, abgelaufen', () => {
  const now = Date.now();
  const token = sign({ uid: 'u1', exp: now + 60_000 }, key);
  assert.equal(verify(token, key, now).uid, 'u1');
  assert.equal(verify(token, otherKey, now), null);
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'angreifer', exp: now + 60_000 })).toString('base64url');
  assert.equal(verify(`${forged}.${mac}`, key, now), null);
  assert.equal(verify(token, key, now + 120_000), null);
  assert.equal(verify('', key, now), null);
  assert.ok(body);
});
