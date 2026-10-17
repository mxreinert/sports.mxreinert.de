// Hevy-API (https://api.hevyapp.com/docs, Hevy Pro). Authentifizierung per Header "api-key".
import { HttpError } from './server.mjs';

const BASE = 'https://api.hevyapp.com/v1';

async function get(key, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'api-key': key, accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new HttpError(400, 'Hevy-Key ungültig oder Hevy Pro nicht aktiv.');
  if (res.status === 404) return null; // Seite hinter dem Ende
  if (!res.ok) throw new HttpError(502, `Hevy antwortet nicht (${res.status}).`);
  return res.json();
}

/** Prüft den Key und liefert die Anzahl Workouts */
export async function checkKey(key) {
  const data = await get(key, '/workouts/count');
  return data?.workout_count ?? 0;
}

/** Änderungen seit einem Zeitpunkt (neue/geänderte und gelöschte Workouts), eine Seite à 10 */
export async function workoutEvents(key, since, page) {
  const data = await get(key, `/workouts/events?since=${encodeURIComponent(since)}&page=${page}&pageSize=10`);
  return { events: data?.events || [], pageCount: data?.page_count ?? 0 };
}

/** Eine Seite Übungsvorlagen à 100 */
export async function templates(key, page) {
  const data = await get(key, `/exercise_templates?page=${page}&pageSize=100`);
  return { list: data?.exercise_templates || [], pageCount: data?.page_count ?? 0 };
}
