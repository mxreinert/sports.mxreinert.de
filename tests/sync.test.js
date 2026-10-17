// Ablauf-Test der Netlify Functions mit nachgebautem Supabase (PostgREST + Auth), Hevy und Strava.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.STRAVA_CLIENT_ID = '123';
process.env.STRAVA_CLIENT_SECRET = 'strava-secret';

const { SUPABASE } = await import('../src/js/env.js');
const { encrypt, decrypt } = await import('../netlify/lib/server.mjs');
const { default: integrations } = await import('../netlify/functions/integrations.mjs');
const { default: sync } = await import('../netlify/functions/sync.mjs');

const jwt = aal => `x.${Buffer.from(JSON.stringify({ aal, sub: 'u1' })).toString('base64url')}.y`;
let tables, hevyEvents, stravaRefreshes, calls;

const workout = (id, day, templateId = 'T1') => ({
  id, title: 'Push', start_time: `${day}T16:00:00Z`, end_time: `${day}T17:00:00Z`,
  exercises: [{ exercise_template_id: templateId, title: 'Bankdrücken', sets: [{ type: 'normal', weight_kg: 80, reps: 8 }] }],
});

beforeEach(() => {
  tables = {};
  stravaRefreshes = 0;
  calls = [];
  hevyEvents = [
    [{ type: 'updated', workout: workout('w1', '2026-10-12') }, { type: 'updated', workout: workout('w2', '2026-10-13', 'T2') }],
    [{ type: 'deleted', id: 'w0' }, { type: 'updated', workout: workout('w3', '2026-10-14') }],
  ];
});

const table = name => (tables[name] ||= new Map());
const reply = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status });

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const headers = new Headers(init.headers);
  calls.push(`${init.method || 'GET'} ${u.host}${u.pathname}`);
  if (url.startsWith(`${SUPABASE.url}/auth/v1/user`)) {
    return headers.get('authorization')?.startsWith('Bearer x.') ? reply({ id: 'u1' }) : reply({}, 401);
  }
  if (url.startsWith(`${SUPABASE.url}/rest/v1/`)) {
    const t = table(u.pathname.split('/').pop());
    const inList = u.searchParams.get('k')?.match(/^in\.\((.*)\)$/)?.[1].split(',').map(s => s.replace(/"/g, ''));
    if (init.method === 'POST') { for (const r of JSON.parse(init.body)) t.set(r.k, r.data); return reply(null, 201); }
    if (init.method === 'DELETE') { for (const k of inList) t.delete(k); return reply(null, 204); }
    const rows = [...t.entries()].filter(([k]) => !inList || inList.includes(k)).map(([k, data]) => ({ k, data }));
    return reply(rows);
  }
  if (u.host === 'api.hevyapp.com') {
    if (headers.get('api-key') !== 'good-hevy-key-123') return reply({}, 401);
    if (u.pathname.endsWith('/workouts/count')) return reply({ workout_count: 3 });
    if (u.pathname.endsWith('/workouts/events')) {
      const page = Number(u.searchParams.get('page'));
      return hevyEvents[page - 1] ? reply({ page, page_count: hevyEvents.length, events: hevyEvents[page - 1] }) : reply({}, 404);
    }
    if (u.pathname.endsWith('/exercise_templates')) {
      return reply({ page: 1, page_count: 1, exercise_templates: [
        { id: 'T1', title: 'Bench Press', primary_muscle_group: 'chest', secondary_muscle_groups: ['triceps'] },
        { id: 'T2', title: 'Row', primary_muscle_group: 'upper_back', secondary_muscle_groups: [] },
      ] });
    }
  }
  if (u.host === 'www.strava.com') {
    if (u.pathname === '/oauth/token') {
      const body = JSON.parse(init.body);
      if (body.client_secret !== 'strava-secret') return reply({}, 401);
      if (body.grant_type === 'refresh_token') stravaRefreshes++;
      return reply({ access_token: 'acc-new', refresh_token: 'ref-new', expires_at: Math.floor(Date.now() / 1000) + 21600, athlete: { id: 7, firstname: 'Max', lastname: 'R' } });
    }
    if (u.pathname === '/api/v3/athlete/activities') {
      return Number(u.searchParams.get('page')) > 1 ? reply([]) : reply([
        { id: 1, sport_type: 'Run', name: 'Lauf', start_date: '2026-10-12T06:00:00Z', start_date_local: '2026-10-12T08:00:00Z', distance: 5000, moving_time: 1500 },
        { id: 2, sport_type: 'Ride', start_date_local: '2026-10-12T08:00:00Z' },
      ]);
    }
  }
  throw new Error(`Unerwarteter Aufruf: ${url}`);
};

const req = (fn, body, aal = 'aal2', method = 'POST') => fn(new Request('https://mxsports.mxreinert.de/.netlify/functions/x', {
  method, headers: { authorization: `Bearer ${jwt(aal)}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
}));

test('Ohne 2FA kein Zugriff, ohne Login auch nicht', async () => {
  assert.equal((await req(integrations, null, 'aal1', 'GET')).status, 403);
  const anon = await integrations(new Request('https://x/', { method: 'GET' }));
  assert.equal(anon.status, 401);
});

test('Hevy-Key: falscher Key abgelehnt, richtiger verschlüsselt gespeichert', async () => {
  const bad = await req(integrations, { action: 'hevy-save', key: 'falscher-key-000' });
  assert.equal(bad.status, 400);
  const ok = await (await req(integrations, { action: 'hevy-save', key: 'good-hevy-key-123' })).json();
  assert.equal(ok.hevy.connected, true);
  assert.equal(ok.hevy.workouts, 3);
  const stored = table('integrations').get('hevy');
  assert.ok(!JSON.stringify(stored).includes('good-hevy-key-123'), 'Key nie im Klartext');
  assert.equal(decrypt(stored.key_enc), 'good-hevy-key-123');
  assert.ok(!JSON.stringify(ok).includes('key_enc'), 'Status enthält keine Geheimnisse');
});

test('Strava: state schützt vor fremden Rückleitungen, Verbindung wird verschlüsselt gespeichert', async () => {
  const { url } = await (await req(integrations, { action: 'strava-start' })).json();
  const auth = new URL(url);
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://mxsports.mxreinert.de/?strava=1');
  const state = auth.searchParams.get('state');
  assert.equal((await req(integrations, { action: 'strava-finish', code: 'c', state: 'gefälscht.abc', scope: 'read,activity:read_all' })).status, 400);
  assert.equal((await req(integrations, { action: 'strava-finish', code: 'c', state, scope: 'read' })).status, 400, 'ohne Aktivitäten-Recht');
  const ok = await (await req(integrations, { action: 'strava-finish', code: 'c', state, scope: 'read,activity:read_all' })).json();
  assert.equal(ok.strava.athlete.name, 'Max R');
  assert.equal(decrypt(table('integrations').get('strava').refresh_enc), 'ref-new');
});

test('Sync in Etappen: Strava-Läufe, Hevy-Workouts inkl. Löschung, Übungsvorlagen', async () => {
  table('integrations').set('hevy', { k: 'hevy', key_enc: encrypt('good-hevy-key-123'), connected_at: 'x' });
  table('integrations').set('strava', { k: 'strava', refresh_enc: encrypt('ref-old'), access_enc: encrypt('acc-old'), expires_at: 0, connected_at: 'x' });
  table('workouts').set('hevy-w0', { id: 'hevy-w0' });

  let res = { done: false }, cursor, counts, rounds = 0;
  while (!res.done && rounds++ < 10) {
    res = await (await req(sync, { cursor, counts })).json();
    ({ cursor, counts } = res);
  }
  assert.ok(res.done);
  assert.deepEqual([...table('runs').keys()], ['strava-1'], 'nur Läufe, keine Radfahrten');
  assert.deepEqual([...table('workouts').keys()].sort(), ['hevy-w1', 'hevy-w2', 'hevy-w3'], 'w0 gelöscht');
  assert.equal(table('workouts').get('hevy-w1').date, '2026-10-12');
  assert.deepEqual([...table('hevy_templates').keys()].sort(), ['T1', 'T2']);
  assert.equal(stravaRefreshes, 1, 'abgelaufenes Strava-Token wird erneuert');
  assert.equal(decrypt(table('integrations').get('strava').refresh_enc), 'ref-new');
  assert.ok(table('integrations').get('hevy').last_sync, 'Hevy merkt sich den Sync-Zeitpunkt');
  assert.ok(table('integrations').get('hevy').templates_at);
  assert.equal(res.counts.deleted, 1);

  // Zweiter Sync: Vorlagen sind aktuell → werden nicht erneut geladen
  calls = [];
  hevyEvents = [[]];
  res = await (await req(sync, {})).json();
  assert.ok(res.done);
  assert.ok(!calls.some(c => c.includes('exercise_templates')));
});

test('Sync ohne Verbindungen ist sofort fertig', async () => {
  const res = await (await req(sync, {})).json();
  assert.deepEqual(res, { done: true, counts: { runs: 0, workouts: 0, deleted: 0, templates: 0 } });
});
