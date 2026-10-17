// Sync mit Hevy und Strava über die Netlify Functions. Die App schickt nur ihren Login mit –
// Hevy-Key und Strava-Token kennt allein der Server.
import { toast } from '../ui/kit.js';
import * as cloud from '../store/cloud.js';
import * as db from '../store/db.js';

const LAST = 'mx-sports-last-sync';
let running = null;

/** Aufruf einer Netlify Function mit dem Login */
export async function api(name, body) {
  const s = await cloud.session();
  if (!s) throw new Error('Nicht angemeldet.');
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${s.access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(location.hostname === 'localhost' ? 'Server-Funktionen laufen nur online (Netlify).' : `Server antwortet nicht (${res.status}).`);
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

/** Holt neue Workouts/Läufe. silent: ohne Meldungen (automatisch beim Öffnen) */
export function runSync({ silent = false } = {}) {
  if (!cloud.enabled) {
    if (!silent) toast('Sync gibt es nur online (mit Login)', { kind: 'error' });
    return Promise.resolve();
  }
  running ||= (async () => {
    document.body.classList.add('syncing');
    try {
      let res = { done: false }, cursor, counts;
      for (let i = 0; i < 40 && !res.done; i++) {
        res = await api('sync', { cursor, counts });
        ({ cursor, counts } = res);
      }
      try { localStorage.setItem(LAST, String(Date.now())); } catch { /* privat-Modus: dann eben öfter */ }
      if (counts.runs || counts.workouts || counts.deleted) await db.refresh();
      if (!silent) toast(counts.workouts || counts.runs ? `Synchronisiert: ${counts.workouts} Workouts, ${counts.runs} Läufe` : 'Alles aktuell');
    } catch (e) {
      if (!silent) toast(e.message, { kind: 'error', ms: 4000 });
      else console.warn('Auto-Sync:', e.message);
    } finally {
      document.body.classList.remove('syncing');
      running = null;
    }
  })();
  return running;
}

/** Beim Öffnen: höchstens alle 30 Minuten automatisch */
export function autoSync() {
  let last = 0;
  try { last = Number(localStorage.getItem(LAST) || 0); } catch { /* egal */ }
  if (cloud.enabled && Date.now() - last > 30 * 60e3) runSync({ silent: true });
}
