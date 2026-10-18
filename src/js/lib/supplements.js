// Supplements: Plan (versioniert, „gültig ab“) und was an einem Tag fällig/genommen ist.
// Plan-Eintrag: { id, name, dose, days: [Wochentage 0–6] | [] (= täglich), ring: bool, time: 'HH:MM' | null }
// Genommen wird im Tag gespeichert: daily_log.supps = { [id]: true }
import { versionAt } from './versions.js';
import { weekday } from './dates.js';

export const planAt = (snap, date) => versionAt(snap.supps, date)?.items || [];

export const isDue = (item, date) => !item.days?.length || item.days.includes(weekday(date));

/** Fällige, genommene und für den Ernährungsring nötige Supplements eines Tages */
export function suppDay(snap, date) {
  const due = planAt(snap, date).filter(i => isDue(i, date));
  const taken = snap.logs?.[date]?.supps || {};
  const required = due.filter(i => i.ring);
  return {
    due,
    taken: due.filter(i => taken[i.id]),
    required,
    missingRequired: required.filter(i => !taken[i.id]),
  };
}

/**
 * Bedingung für den Ernährungstag (nur Supplements mit „zählt für den Ring“):
 * alle genommen = ok · eins vergessen = knapp (gelb) · mehr vergessen = verfehlt (rot)
 */
export function suppCondition(sd) {
  if (!sd.required.length) return null;
  const missing = sd.missingRequired.length;
  return {
    key: 'supps', label: 'Supplements genommen', actual: sd.required.length - missing, target: sd.required.length,
    state: missing === 0 ? 'ok' : missing === 1 ? 'near' : 'miss',
  };
}
