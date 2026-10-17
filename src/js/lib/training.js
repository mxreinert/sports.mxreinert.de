// Auswertung von Workouts: Arbeitssätze, Sätze pro Muskelgruppe, Volumen, geschätztes 1RM.
import { MUSCLES } from '../config.js';

export const isWorkingSet = s => s.type !== 'warmup';

export const workingSets = w => w.exercises.reduce((n, e) => n + e.sets.filter(isWorkingSet).length, 0);

/** Gesamtvolumen (kg × Wdh) der Arbeitssätze */
export function tonnage(workouts) {
  let kg = 0;
  for (const w of workouts) for (const e of w.exercises) for (const s of e.sets) {
    if (isWorkingSet(s) && s.weight_kg && s.reps) kg += s.weight_kg * s.reps;
  }
  return Math.round(kg);
}

/** Geschätztes 1RM nach Epley; über 12 Wdh. zu ungenau → null */
export function e1rm(weight, reps) {
  if (!weight || !reps || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Muskelgruppen einer Übung. Reihenfolge: eigene Zuordnung in der App > Hevy-Vorlage (über die Gruppen-Zuordnung).
 * @returns {{primary: string|null, secondary: string[], source: 'manuell'|'hevy'|'fehlt'}}
 */
const KNOWN = new Set(MUSCLES.map(m => m.id));
const known = g => (KNOWN.has(g) ? g : null);

export function musclesOf(templateId, { mappings = {}, templates = {}, groupMap = {} }) {
  const m = mappings[templateId];
  // Eigene Zuordnung zählt nur mit einer gültigen Gruppe (alte Gruppen wie „Rücken“ → zurück auf Hevy)
  if (m && known(m.primary)) {
    return { primary: m.primary, secondary: (m.secondary || []).filter(g => known(g) && g !== m.primary), source: 'manuell' };
  }
  const t = templates[templateId];
  const primary = t ? known(groupMap[t.primary]) : null;
  if (!primary) return { primary: null, secondary: [], source: 'fehlt' };
  const secondary = [...new Set((t.secondary || []).map(g => known(groupMap[g])).filter(g => g && g !== primary))];
  return { primary, secondary, source: 'hevy' };
}

/**
 * Arbeitssätze pro Muskelgruppe. Primär = 1, sekundär = factor (oder 0 bei primary_only).
 * @returns {{sets: Record<string, number>, unmapped: {template_id, title, sets}[]}}
 */
export function muscleSets(workouts, lookup, rules = {}) {
  const factor = rules.primary_only ? 0 : rules.secondary_factor ?? 0.5;
  const sets = Object.fromEntries(MUSCLES.map(m => [m.id, 0]));
  const unmapped = new Map();
  for (const w of workouts) for (const e of w.exercises) {
    const n = e.sets.filter(isWorkingSet).length;
    if (!n) continue;
    const m = musclesOf(e.template_id, lookup);
    if (!m.primary) {
      const u = unmapped.get(e.template_id) || { template_id: e.template_id, title: e.title, sets: 0 };
      u.sets += n;
      unmapped.set(e.template_id, u);
      continue;
    }
    if (m.primary in sets) sets[m.primary] += n;
    if (factor) for (const g of m.secondary) if (g in sets) sets[g] += n * factor;
  }
  return { sets, unmapped: [...unmapped.values()] };
}

/**
 * Archivierte Übung? Archiviert = ausgeblendet in der Übungs-Zuordnung. Wird die Übung nach dem Archivieren
 * wieder trainiert (lastUsed nach archived_at), ist sie automatisch wieder aktiv.
 */
export const isArchived = (mapping, lastUsed) => !!mapping?.archived_at && !(lastUsed && lastUsed > mapping.archived_at);

/** Zustand einer Muskelgruppe gegen die Zielspanne */
export function rangeState(value, [min, max], { open = false } = {}) {
  if (value > max) return 'near';
  if (value >= min) return 'ok';
  return open ? 'open' : 'miss';
}

/** Bester Satz (nach e1RM) je Übung */
export function topSets(workouts, templateIds) {
  const best = {};
  for (const w of workouts) for (const e of w.exercises) {
    if (templateIds && !templateIds.includes(e.template_id)) continue;
    for (const s of e.sets) {
      if (!isWorkingSet(s)) continue;
      const est = e1rm(s.weight_kg, s.reps);
      if (est == null) continue;
      const cur = best[e.template_id];
      if (!cur || est > cur.e1rm) best[e.template_id] = { template_id: e.template_id, title: e.title, weight_kg: s.weight_kg, reps: s.reps, e1rm: est, date: w.date };
    }
  }
  return best;
}
