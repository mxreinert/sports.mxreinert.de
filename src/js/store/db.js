// Datenschicht. Die App liest nur aus `snap` (alles im Speicher – für eine Person auch nach Jahren klein)
// und schreibt nur über die Funktionen hier. Das Backend ist lokal IndexedDB (idb.js) oder online Supabase (cloud.js).
import * as idb from './idb.js';
import { STORES } from './schema.js';
import { APP, BASE_DATE, DEFAULTS } from '../config.js';
import { planNewPhase, planNewEnd } from '../lib/phases.js';
import { today } from '../lib/dates.js';

export const snap = {
  logs: {}, workouts: [], runs: [], coach: [], rings: [], muscles: [], exceptions: [], phases: [], supps: [],
  mappings: {}, templates: {}, settings: { ...DEFAULTS.settings }, notes: {},
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

let backend = idb;

export async function init(store = idb) {
  backend = store;
  await backend.open();
  await reload();
  if (!snap.coach.length || !snap.rings.length || !snap.muscles.length) await seedBase();
}

async function reload() {
  const [logs, workouts, runs, coach, rings, muscles, exceptions, phases, mappings, templates, kv] = await Promise.all(
    ['daily_log', 'workouts', 'runs', 'coach_targets', 'ring_settings', 'muscle_targets', 'week_exceptions', 'phases', 'exercise_mapping', 'hevy_templates', 'kv'].map(backend.all));
  snap.logs = Object.fromEntries(logs.map(l => [l.date, l]));
  snap.workouts = workouts.sort((a, b) => a.start.localeCompare(b.start));
  snap.runs = runs.sort((a, b) => a.date.localeCompare(b.date));
  snap.coach = coach;
  snap.rings = rings;
  snap.muscles = muscles;
  snap.exceptions = exceptions;
  snap.phases = phases;
  snap.mappings = Object.fromEntries(mappings.map(m => [m.template_id, m]));
  snap.templates = Object.fromEntries(templates.map(t => [t.id, t]));
  const kvMap = Object.fromEntries(kv.map(r => [r.key, r.value]));
  snap.settings = { ...DEFAULTS.settings, ...(kvMap.settings || {}) };
  snap.supps = kvMap.supplement_plans || [];
  snap.notes = Object.fromEntries(Object.entries(kvMap).filter(([k]) => k.startsWith('note:')).map(([k, v]) => [k.slice(5), v]));
}

/** Startwerte als Basis-Version (gilt rückwirkend für alles) */
async function seedBase() {
  const base = { valid_from: BASE_DATE, created_at: nowIso() };
  if (!snap.coach.length) await addVersion('coach', { ...base, ...structuredClone(DEFAULTS.coach) }, { silent: true });
  if (!snap.rings.length) await addVersion('rings', { ...base, ...structuredClone(DEFAULTS.rings), note: 'Startwerte' }, { silent: true });
  if (!snap.muscles.length) await addVersion('muscles', { ...base, ...structuredClone(DEFAULTS.muscles), note: 'Startwerte' }, { silent: true });
}

// ---------- Tageswerte ----------

const LOG_FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'weight', 'sleep', 'energy', 'hunger', 'note', 'supps'];

/** Felder eines Tages setzen (null/'' löscht ein Feld). Ein leerer Tag wird entfernt. */
export async function saveLog(date, patch) {
  const cur = { ...(snap.logs[date] || { date }) };
  for (const [k, v] of Object.entries(patch)) {
    const emptyObj = v && typeof v === 'object' && !Object.values(v).some(Boolean);
    if (v === null || v === '' || v === undefined || emptyObj) delete cur[k];
    else cur[k] = v;
  }
  const empty = !LOG_FIELDS.some(k => cur[k] != null);
  if (empty) {
    await backend.del('daily_log', date);
    delete snap.logs[date];
  } else {
    cur.updated_at = nowIso();
    await backend.put('daily_log', cur);
    snap.logs[date] = cur;
  }
  emit();
}

// ---------- Versionierte Einstellungen ----------

const VERSION_STORE = { coach: 'coach_targets', rings: 'ring_settings', muscles: 'muscle_targets' };

export async function addVersion(kind, data, { silent = false } = {}) {
  const row = { ...data, id: uid(), created_at: nowIso() };
  await backend.put(VERSION_STORE[kind], row);
  snap[kind] = [...snap[kind], row];
  if (!silent) emit();
  return row;
}

/** Löschen nur für Korrekturen (Tippfehler). Die Basis-Version bleibt immer. */
export async function deleteVersion(kind, id) {
  const v = snap[kind].find(x => x.id === id);
  if (!v || v.valid_from === BASE_DATE) throw new Error('Die Basis-Version kann nicht gelöscht werden.');
  await backend.del(VERSION_STORE[kind], id);
  snap[kind] = snap[kind].filter(x => x.id !== id);
  emit();
}

// ---------- Supplements ----------

/** Supplement-Plan als neue Version (versioniert im kv-Speicher, alte Tage bleiben unverändert) */
export async function saveSuppPlan(items, validFrom) {
  const row = { id: uid(), valid_from: validFrom, created_at: nowIso(), items };
  snap.supps = [...snap.supps, row];
  await backend.put('kv', { key: 'supplement_plans', value: snap.supps });
  emit();
}

/** Supplement an einem Tag als genommen/nicht genommen markieren */
export async function toggleSupp(date, id) {
  const cur = { ...(snap.logs[date]?.supps || {}) };
  if (cur[id]) delete cur[id];
  else cur[id] = true;
  await saveLog(date, { supps: cur });
}

// ---------- Phasen ----------

/**
 * Neue Phase starten (auch geplant in der Zukunft). Legt ab dem Start eine neue Coach-Version an
 * (optional auch neue Ring-Regeln). Eine länger geplante vorherige Phase endet am Vortag. Nichts wird gelöscht.
 */
export async function startPhase({ phase, start, end, note, coach, rings }) {
  const plan = planNewPhase(snap.phases, { start, end });
  if (!plan.ok) throw new Error(plan.error);
  const row = { id: uid(), phase, start, end: end || null, note: note || '', created_at: nowIso() };
  await backend.put('phases', [...plan.updates, row]);
  snap.phases = [...snap.phases.filter(p => !plan.updates.some(u => u.id === p.id)), ...plan.updates, row];
  await addVersion('coach', { ...coach, phase, valid_from: start, phase_id: row.id, note: note || 'Phasenstart' }, { silent: true });
  if (rings) await addVersion('rings', { ...rings, valid_from: start, phase_id: row.id, note: 'Phasenstart' }, { silent: true });
  emit();
  return row;
}

export async function setPhaseEnd(id, end) {
  const plan = planNewEnd(snap.phases, id, end);
  if (!plan.ok) throw new Error(plan.error);
  await backend.put('phases', plan.row);
  snap.phases = snap.phases.map(p => (p.id === id ? plan.row : p));
  emit();
}

/** Nur geplante (noch nicht begonnene) Phasen lassen sich löschen – samt der Versionen, die sie angelegt haben. */
export async function deletePlannedPhase(id) {
  const p = snap.phases.find(x => x.id === id);
  if (!p || p.start <= today()) throw new Error('Nur geplante Phasen können gelöscht werden.');
  for (const kind of ['coach', 'rings']) {
    for (const v of snap[kind].filter(x => x.phase_id === id)) await backend.del(VERSION_STORE[kind], v.id);
    snap[kind] = snap[kind].filter(x => x.phase_id !== id);
  }
  await backend.del('phases', id);
  snap.phases = snap.phases.filter(x => x.id !== id);
  emit();
}

// ---------- Training ----------

export async function saveRun(run) {
  const row = { ...run, id: run.id || `manual-${uid()}`, source: run.source || 'manual' };
  await backend.put('runs', row);
  snap.runs = [...snap.runs.filter(r => r.id !== row.id), row].sort((a, b) => a.date.localeCompare(b.date));
  emit();
  return row;
}

export async function deleteRun(id) {
  await backend.del('runs', id);
  snap.runs = snap.runs.filter(r => r.id !== id);
  emit();
}

// ---------- Übungs-Zuordnung, Pausen-Wochen, Einstellungen ----------

export async function saveMapping(m) {
  const row = { ...snap.mappings[m.template_id], ...m, updated_at: nowIso() };
  await backend.put('exercise_mapping', row);
  snap.mappings[row.template_id] = row;
  emit();
}

export async function deleteMapping(templateId) {
  await backend.del('exercise_mapping', templateId);
  delete snap.mappings[templateId];
  emit();
}

export async function saveException(ex) {
  const row = { ...ex, id: ex.id || uid(), created_at: ex.created_at || nowIso() };
  // eine Ausnahme pro Woche
  for (const old of snap.exceptions.filter(e => e.week === row.week && e.id !== row.id)) await backend.del('week_exceptions', old.id);
  await backend.put('week_exceptions', row);
  snap.exceptions = [...snap.exceptions.filter(e => e.week !== row.week), row];
  emit();
}

export async function deleteException(id) {
  await backend.del('week_exceptions', id);
  snap.exceptions = snap.exceptions.filter(e => e.id !== id);
  emit();
}

export async function saveSettings(patch) {
  snap.settings = { ...snap.settings, ...patch };
  await backend.put('kv', { key: 'settings', value: snap.settings });
  emit();
}

export async function saveNote(key, text) {
  if (text) { snap.notes[key] = text; await backend.put('kv', { key: `note:${key}`, value: text }); }
  else { delete snap.notes[key]; await backend.del('kv', `note:${key}`); }
}

// ---------- Export, Import, Löschen ----------

export async function exportAll() {
  const data = {};
  for (const name of Object.keys(STORES)) data[name] = await backend.all(name);
  return { app: APP.name, version: APP.version, exported_at: nowIso(), data };
}

export async function importAll(json) {
  if (!json?.data || typeof json.data !== 'object') throw new Error('Keine gültige Export-Datei.');
  const names = Object.keys(json.data).filter(n => n in STORES);
  if (!names.length) throw new Error('Die Datei enthält keine bekannten Daten.');
  for (const name of Object.keys(STORES)) await backend.clear(name);
  for (const name of names) if (json.data[name].length) await backend.put(name, json.data[name]);
  await reload();
  if (!snap.coach.length || !snap.rings.length || !snap.muscles.length) await seedBase();
  emit();
}

export async function wipe({ keepBase = true, silent = false } = {}) {
  for (const name of Object.keys(STORES)) await backend.clear(name);
  await reload();
  if (keepBase) await seedBase();
  if (!silent) emit();
}

/** Mehrere Tabellen auf einmal schreiben (Demo-Daten), ohne für jede Zeile neu zu zeichnen */
export async function bulk(rowsByStore) {
  for (const [name, rows] of Object.entries(rowsByStore)) if (rows?.length) await backend.put(name, rows);
  await reload();
  emit();
}

/** Nach einem Server-Sync (Hevy/Strava) alles neu laden */
export async function refresh() {
  await reload();
  emit();
}
