// Holt neue Daten von Strava (Läufe) und Hevy (Workouts + Übungsvorlagen) und speichert sie in Supabase.
// Läuft in Etappen: Ist die Zeit knapp, kommt { done: false, cursor } zurück und die App ruft erneut auf
// (Netlify-Functions dürfen nur ~10 s laufen; der erste Hevy-Import kann länger dauern).
import { handle, json, requireUser, database, encrypt, decrypt, HttpError } from '../lib/server.mjs';
import * as hevy from '../lib/hevy.mjs';
import * as strava from '../lib/strava.mjs';
import { fromHevyWorkout, fromHevyTemplate, fromStravaActivity } from '../../src/js/lib/imports.js';

const BUDGET_MS = 7000;
const DAY = 86400;
const OVERLAP_DAYS = 30;

export default handle(async req => {
  if (req.method !== 'POST') throw new HttpError(405, 'Methode nicht erlaubt.');
  const started = Date.now();
  const timeLeft = () => Date.now() - started < BUDGET_MS;
  const user = await requireUser(req);
  const db = database(user);
  const body = await req.json().catch(() => ({}));
  const integ = await db.get('integrations');
  const c = body.cursor || { step: 'strava', startedAt: new Date().toISOString(), templateIds: [] };
  const counts = { runs: 0, workouts: 0, deleted: 0, templates: 0, ...body.counts };
  const pause = () => json({ done: false, cursor: c, counts });

  // 1) Strava: Läufe ab 30 Tage vor dem letzten Sync – dort werden auch Änderungen, Löschungen und Typ-Wechsel übernommen
  if (c.step === 'strava') {
    if (integ.strava) await syncStrava(db, integ.strava, counts);
    Object.assign(c, { step: 'hevy', page: 1 });
  }

  // 2) Hevy: Änderungs-Ereignisse seit dem letzten Sync (neu/geändert → speichern, gelöscht → entfernen)
  if (c.step === 'hevy') {
    if (!integ.hevy) c.step = 'done';
    else {
      const key = decrypt(integ.hevy.key_enc);
      c.since ||= integ.hevy.last_sync || '1970-01-01T00:00:00Z';
      while (c.step === 'hevy') {
        if (!timeLeft()) return pause();
        const { events, pageCount } = await hevy.workoutEvents(key, c.since, c.page);
        const updated = events.filter(e => e.type === 'updated' && e.workout).map(e => fromHevyWorkout(e.workout));
        const deleted = events.filter(e => e.type === 'deleted').map(e => `hevy-${e.id}`);
        await db.upsert('workouts', 'id', updated);
        if (deleted.length) await db.remove('workouts', deleted);
        counts.workouts += updated.length;
        counts.deleted += deleted.length;
        for (const w of updated) for (const ex of w.exercises) if (ex.template_id && !c.templateIds.includes(ex.template_id)) c.templateIds.push(ex.template_id);
        if (!events.length || c.page >= pageCount) c.step = 'templates';
        else c.page++;
      }
      await saveIntegration(db, 'hevy', { last_sync: c.startedAt });
    }
  }

  // 3) Übungsvorlagen (Muskelgruppen): wöchentlich oder wenn eine unbekannte Übung auftaucht
  if (c.step === 'templates') {
    const row = (await db.get('integrations', ['hevy'])).hevy;
    if (!row) return json({ done: true, counts }); // während des Syncs getrennt
    const known = new Set(await db.keys('hevy_templates'));
    const stale = !row.templates_at || Date.now() - Date.parse(row.templates_at) > 7 * DAY * 1000;
    if (stale || c.templateIds.some(id => !known.has(id))) {
      const key = decrypt(row.key_enc);
      c.tpage ||= 1;
      while (c.step === 'templates') {
        if (!timeLeft()) return pause();
        const { list, pageCount } = await hevy.templates(key, c.tpage);
        await db.upsert('hevy_templates', 'id', list.map(fromHevyTemplate));
        counts.templates += list.length;
        if (!list.length || c.tpage >= pageCount) c.step = 'done';
        else c.tpage++;
      }
      await saveIntegration(db, 'hevy', { templates_at: new Date().toISOString() });
    }
  }

  return json({ done: true, counts });
});

async function saveIntegration(db, k, patch) {
  const row = (await db.get('integrations', [k]))[k];
  if (row) await db.upsert('integrations', 'k', [{ ...row, ...patch }]);
}

async function syncStrava(db, row, counts) {
  const syncStart = new Date().toISOString();
  let access;
  if (!row.expires_at || row.expires_at * 1000 < Date.now() + 60e3) {
    const t = await strava.refresh(decrypt(row.refresh_enc));
    access = t.access_token;
    row = { ...row, access_enc: encrypt(t.access_token), refresh_enc: encrypt(t.refresh_token), expires_at: t.expires_at };
  } else {
    access = decrypt(row.access_enc);
  }
  const now = Math.floor(Date.now() / 1000);
  const after = row.last_sync ? Math.floor(Date.parse(row.last_sync) / 1000) - OVERLAP_DAYS * DAY : now - 365 * DAY;
  const seen = new Set();
  let complete = false;
  for (let page = 1; page <= 20; page++) {
    const list = await strava.activities(access, after, page);
    const runs = list.map(fromStravaActivity).filter(Boolean);
    await db.upsert('runs', 'id', runs);
    for (const r of runs) seen.add(r.id);
    counts.runs += runs.length;
    if (list.length < 100) { complete = true; break; }
  }
  // Nur wenn der ganze Zeitraum geladen ist: Strava-Läufe im Zeitraum, die es dort nicht (mehr) als Lauf gibt, entfernen.
  // Manuell eingetragene Läufe sind nie betroffen.
  if (complete) {
    const stale = (await db.keysWhere('runs', `k=like.strava-*&data->>start=gte.${new Date(after * 1000).toISOString()}`)).filter(k => !seen.has(k));
    if (stale.length) await db.remove('runs', stale);
    counts.deleted += stale.length;
  }
  await db.upsert('integrations', 'k', [{ ...row, last_sync: syncStart }]);
}
