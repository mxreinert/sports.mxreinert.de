// Verbindungen zu Hevy und Strava verwalten.
// GET  → Status (ohne Geheimnisse)
// POST { action: 'hevy-save', key } | 'hevy-remove' | 'strava-start' | 'strava-finish' { code, state, scope } | 'strava-remove'
import { handle, json, requireUser, database, encrypt, decrypt, sign, verify, HttpError } from '../lib/server.mjs';
import * as hevy from '../lib/hevy.mjs';
import * as strava from '../lib/strava.mjs';

function status(rows) {
  const h = rows.hevy, s = rows.strava;
  return {
    hevy: h ? { connected: true, connected_at: h.connected_at, last_sync: h.last_sync || null, workouts: h.workouts ?? null } : { connected: false },
    strava: s ? { connected: true, connected_at: s.connected_at, last_sync: s.last_sync || null, athlete: s.athlete || null } : { connected: false },
    strava_ready: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET),
    secrets_ready: !!process.env.SECRETS_ENCRYPTION_KEY,
  };
}

export default handle(async req => {
  const user = await requireUser(req);
  const db = database(user);
  if (req.method === 'GET') return json(status(await db.get('integrations')));
  if (req.method !== 'POST') throw new HttpError(405, 'Methode nicht erlaubt.');

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  switch (body.action) {
    case 'hevy-save': {
      const key = String(body.key || '').trim();
      if (key.length < 10 || /\s/.test(key)) throw new HttpError(400, 'Das sieht nicht nach einem Hevy-API-Key aus.');
      const workouts = await hevy.checkKey(key); // wirft bei ungültigem Key
      await db.upsert('integrations', 'k', [{ k: 'hevy', key_enc: encrypt(key), connected_at: now, last_sync: null, workouts }]);
      break;
    }
    case 'hevy-remove':
      await db.remove('integrations', ['hevy']);
      break;
    case 'strava-start': {
      const redirect = `${new URL(req.url).origin}/?strava=1`;
      return json({ url: strava.authorizeUrl(redirect, sign({ uid: user.id, exp: Date.now() + 10 * 60e3 })) });
    }
    case 'strava-finish': {
      const state = verify(body.state);
      if (!state || state.uid !== user.id) throw new HttpError(400, 'Strava-Verbindung abgelaufen – bitte erneut verbinden.');
      if (!String(body.scope || '').includes('activity:read')) throw new HttpError(400, 'Bitte bei Strava den Zugriff auf Aktivitäten erlauben.');
      const t = await strava.exchangeCode(String(body.code || ''));
      const a = t.athlete || {};
      await db.upsert('integrations', 'k', [{
        k: 'strava', refresh_enc: encrypt(t.refresh_token), access_enc: encrypt(t.access_token), expires_at: t.expires_at,
        athlete: { id: a.id, name: [a.firstname, a.lastname].filter(Boolean).join(' ') }, connected_at: now, last_sync: null,
      }]);
      break;
    }
    case 'strava-remove': {
      const row = (await db.get('integrations', ['strava'])).strava;
      if (row?.access_enc) await strava.deauthorize(decrypt(row.access_enc));
      await db.remove('integrations', ['strava']);
      break;
    }
    default:
      throw new HttpError(400, 'Unbekannte Aktion.');
  }
  return json(status(await db.get('integrations')));
});
