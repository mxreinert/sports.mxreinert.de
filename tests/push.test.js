// Ablauf-Test Push: Gerät anmelden, Plan speichern, Erinnerung verschicken, nicht doppelt, tote Geräte entfernen.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { generateVapidKeys } from '../netlify/lib/webpush.mjs';

const vapidKeys = generateVapidKeys();
process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;

const { SUPABASE } = await import('../src/js/env.js');
const { useStoreForTests } = await import('../netlify/lib/pushstore.mjs');
const { default: push } = await import('../netlify/functions/push.mjs');
const { runReminders } = await import('../netlify/functions/push-reminders.mjs');

let blobs, pushed, goneEndpoints;
const memory = {
  async get(k) { return blobs.has(k) ? structuredClone(blobs.get(k)) : null; },
  async setJSON(k, v) { blobs.set(k, structuredClone(v)); },
  async delete(k) { blobs.delete(k); },
  async list() { return { blobs: [...blobs.keys()].map(key => ({ key })) }; },
};
useStoreForTests(memory);

globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith(`${SUPABASE.url}/auth/v1/user`)) return new Response(JSON.stringify({ id: 'u1' }));
  if (String(url).startsWith('https://push.example/')) {
    pushed.push({ url: String(url), headers: init.headers, size: init.body.length });
    return new Response(null, { status: goneEndpoints.includes(String(url)) ? 410 : 201 });
  }
  throw new Error(`Unerwarteter Aufruf: ${url}`);
};

const jwt = `x.${Buffer.from(JSON.stringify({ aal: 'aal2' })).toString('base64url')}.y`;
const call = (body, aal = jwt) => push(new Request('https://mxsports.mxreinert.de/.netlify/functions/push', {
  method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${aal}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
}));
const subscription = endpoint => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  return { endpoint, keys: { p256dh: ua.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } };
};
const plan = [
  { id: 'checkin', kind: 'checkin', time: '21:00' },
  { id: 'supp-08:00', kind: 'supp', time: '08:00', items: [{ id: 'k', name: 'Kreatin', dose: '5 g', days: [] }] },
];
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return { date, minutes: h * 60 + m, weekday: 1 }; };

beforeEach(() => { blobs = new Map(); pushed = []; goneEndpoints = []; });

test('Ohne 2FA kein Zugriff', async () => {
  const noMfa = `x.${Buffer.from(JSON.stringify({ aal: 'aal1' })).toString('base64url')}.y`;
  assert.equal((await call(null, noMfa)).status, 403);
});

test('Gerät anmelden, Plan speichern, Erinnerung genau einmal verschicken', async () => {
  assert.equal((await (await call(null)).json()).publicKey, vapidKeys.publicKey);
  assert.equal((await call({ action: 'subscribe', subscription: { endpoint: 'http://unsicher' } })).status, 400);
  await call({ action: 'subscribe', subscription: subscription('https://push.example/handy') });
  await call({ action: 'state', plan, today: { date: '2026-10-19', checkin: false, supps: [] } });

  await runReminders(at('2026-10-19', '07:55'));
  assert.equal(pushed.length, 0, 'zu früh');
  await runReminders(at('2026-10-19', '08:00'));
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].headers['content-encoding'], 'aes128gcm');
  assert.match(pushed[0].headers.authorization, /^vapid t=.+, k=/);
  await runReminders(at('2026-10-19', '08:05'));
  assert.equal(pushed.length, 1, 'nicht doppelt');
});

test('Schon in der App erledigt → keine Erinnerung', async () => {
  await call({ action: 'subscribe', subscription: subscription('https://push.example/handy') });
  await call({ action: 'state', plan, today: { date: '2026-10-19', checkin: true, supps: ['k'] } });
  await runReminders(at('2026-10-19', '08:00'));
  await runReminders(at('2026-10-19', '21:00'));
  assert.equal(pushed.length, 0);
});

test('Abgelaufenes Gerät wird entfernt, andere bekommen weiter Push; Test-Push', async () => {
  await call({ action: 'subscribe', subscription: subscription('https://push.example/alt') });
  await call({ action: 'subscribe', subscription: subscription('https://push.example/neu') });
  await call({ action: 'state', plan, today: { date: '2026-10-19', checkin: false, supps: [] } });
  goneEndpoints = ['https://push.example/alt'];
  await runReminders(at('2026-10-19', '21:00'));
  assert.deepEqual(blobs.get('u1/subs').map(s => s.endpoint), ['https://push.example/neu']);
  const res = await (await call({ action: 'test' })).json();
  assert.equal(res.sent, 1);
});

test('Alte Tages-Einträge werden aufgeräumt, Plan bleibt', async () => {
  blobs.set('u1/plan', plan);
  blobs.set('u1/subs', []);
  blobs.set('u1/day/2026-10-10', {});
  blobs.set('u1/sent/2026-10-10', []);
  blobs.set('u1/day/2026-10-18', {});
  await runReminders(at('2026-10-19', '12:00'));
  assert.ok(!blobs.has('u1/day/2026-10-10') && !blobs.has('u1/sent/2026-10-10'));
  assert.ok(blobs.has('u1/day/2026-10-18') && blobs.has('u1/plan'));
});

test('Plan wird bereinigt (ungültige Zeiten/Arten fliegen raus)', async () => {
  await call({ action: 'state', plan: [...plan, { id: 'x', kind: 'hack', time: '08:00' }, { id: 'y', kind: 'supp', time: '25:99' }], today: {} });
  assert.deepEqual(blobs.get('u1/plan').map(r => r.id), ['checkin', 'supp-08:00']);
});
