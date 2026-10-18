// Das Herz der App: Ringe, Ziel-Check (Tag + Woche), Streak, Gewichtsverlauf.
// Reine Funktionen auf einem Daten-Snapshot – keine Datenbank, kein DOM. Getestet in tests/engine.test.js.
//
// Regeln für Versionen:
//  • Tagesziele (kcal, Protein, …) gelten pro Tag → Zieländerung mitten in der Woche wirkt ab diesem Tag.
//  • Wochenziele (Anzahl Sessions, Läufe, grüne Tage, Wiegungen) und Ring-Regeln gelten so, wie sie am
//    ersten Tag der Woche gültig waren → eine Woche wird nie mit zwei Zielen gemessen.

import { DEFAULTS, DEFAULT_GROUP_MAP, MUSCLES, RINGS } from '../config.js';
import { versionAt, withDefaults } from './versions.js';
import { addDays, daysBetween, today as todayFn, weekDays, weekStart, weekday } from './dates.js';
import { muscleSets, rangeState, tonnage, workingSets } from './training.js';
import { suppDay, suppCondition } from './supplements.js';

// ---------- Einstellungen zu einem Datum ----------

export const coachAt = (snap, date) => withDefaults(versionAt(snap.coach, date), DEFAULTS.coach);
export const ringsAt = (snap, date) => withDefaults(versionAt(snap.rings, date), DEFAULTS.rings);
export const musclesAt = (snap, date) => withDefaults(versionAt(snap.muscles, date), DEFAULTS.muscles);
const weekStartDay = snap => snap.settings?.week_start ?? DEFAULTS.settings.week_start;
export const weekOf = (snap, date) => weekStart(date, weekStartDay(snap));

export const lookupOf = snap => ({
  mappings: snap.mappings || {},
  templates: snap.templates || {},
  groupMap: { ...DEFAULT_GROUP_MAP, ...(snap.settings?.group_map || {}) },
});

/** Pausen-Woche, die in die Woche ab ws fällt */
function exceptionFor(snap, ws) {
  const end = addDays(ws, 6);
  return (snap.exceptions || []).find(e => e.week >= ws && e.week <= end) || null;
}

const affects = (ex, ringId) => !!ex && (!ex.rings?.length || ex.rings.includes(ringId));

function adjustGoal(goal, ringId, ex) {
  if (!goal) return 0;
  if (!affects(ex, ringId)) return goal;
  if (ex.mode === 'pause') return 0;
  return Math.max(1, Math.round(goal * (ex.factor ?? 0.5)));
}

function ringResult(id, value, goal, allowOver, active, extra = {}) {
  const raw = goal > 0 ? value / goal : 0;
  return {
    id, active: !!active, value, goal,
    paused: !!active && goal === 0,
    raw, progress: allowOver ? raw : Math.min(1, raw),
    done: goal > 0 && value >= goal,
    ...extra,
  };
}

// ---------- Einzelne Regeln ----------

export function qualifyWorkout(w, r) {
  const sets = workingSets(w);
  const reasons = [];
  if (w.duration_min < r.min_duration) reasons.push(`kürzer als ${r.min_duration} min`);
  if (sets < r.min_sets) reasons.push(`nur ${sets} von ${r.min_sets} Arbeitssätzen`);
  return { ok: reasons.length === 0, sets, reasons };
}

/** Workouts bewerten; pro Tag zählen höchstens max_per_day (0 = unbegrenzt), in zeitlicher Reihenfolge. */
export function gymItems(workouts, r) {
  const perDay = {};
  return [...workouts].sort((a, b) => (a.start || a.date).localeCompare(b.start || b.date)).map(w => {
    const q = qualifyWorkout(w, r);
    let counted = false;
    if (q.ok) {
      perDay[w.date] = (perDay[w.date] || 0) + 1;
      counted = !r.max_per_day || perDay[w.date] <= r.max_per_day;
      if (!counted) q.reasons.push(`max. ${r.max_per_day} pro Tag`);
    }
    return { workout: w, ...q, counted };
  });
}

/** Lauf zählt, wenn Mindestdauer ODER Mindestdistanz erreicht ist. */
export function qualifyRun(run, r) {
  const ok = run.duration_min >= r.min_duration || run.distance_km >= r.min_km;
  return { ok, reasons: ok ? [] : [`unter ${r.min_duration} min und unter ${r.min_km} km`] };
}

const isLogged = log => log != null && log.kcal != null;

/**
 * Ernährungstag bewerten. Jede aktive Bedingung ist ok / near / miss.
 * grün = alles ok · gelb = nichts verfehlt, aber etwas knapp (nur wenn "gelber Tag" an) · rot = sonst.
 * supp: Supplement-Bedingung (suppCondition) oder null
 */
export function nutritionDay(log, t, rules = {}, supp = null) {
  if (!isLogged(log)) return { status: 'none', points: 0, items: [] };
  const items = [];
  const band = (diff, ok, near) => (Math.abs(diff) <= ok ? 'ok' : Math.abs(diff) <= near ? 'near' : 'miss');
  if (t.kcal) {
    items.push({ key: 'kcal', label: 'kcal im Korridor', actual: log.kcal, target: t.kcal, unit: 'kcal', state: band(log.kcal - t.kcal, t.kcal_tol, t.kcal_tol_yellow) });
  }
  if (t.protein) {
    const a = log.protein;
    const state = a == null ? 'miss' : a >= t.protein ? 'ok' : a >= t.protein - t.protein_tol_yellow ? 'near' : 'miss';
    items.push({ key: 'protein', label: 'Protein erreicht', actual: a, target: t.protein, unit: 'g', state });
  }
  if (t.check_macros) {
    for (const [key, label] of [['carbs', 'Kohlenhydrate im Ziel'], ['fat', 'Fett im Ziel']]) {
      if (!t[key]) continue;
      const a = log[key];
      items.push({ key, label, actual: a, target: t[key], unit: 'g', state: a == null ? 'miss' : band(a - t[key], t.macro_tol, t.macro_tol_yellow) });
    }
  }
  if (supp) items.push(supp);
  const miss = items.some(i => i.state === 'miss');
  const near = items.some(i => i.state === 'near');
  const status = miss ? 'red' : near ? (rules.yellow === false ? 'red' : 'yellow') : 'green';
  return { status, points: status === 'green' ? 1 : status === 'yellow' ? 0.5 : 0, items };
}

// ---------- Woche ----------

export function evaluateWeek(snap, ws, now = todayFn()) {
  const days = weekDays(ws);
  const end = days[6];
  const coach = coachAt(snap, ws);
  const rules = ringsAt(snap, ws);
  const ex = exceptionFor(snap, ws);
  const inWeek = x => x.date >= ws && x.date <= end;
  const workouts = (snap.workouts || []).filter(inWeek);
  const runs = (snap.runs || []).filter(inWeek);

  const gym = gymItems(workouts, rules.gym);
  const runItems = [...runs].sort((a, b) => a.date.localeCompare(b.date)).map(run => ({ run, ...qualifyRun(run, rules.run) }));
  const nutDays = days.map(d => ({ date: d, ...nutritionDay(snap.logs?.[d], coachAt(snap, d), rules.nutrition, suppCondition(suppDay(snap, d))) }));
  const weighDays = days.filter(d => snap.logs?.[d]?.weight != null);

  const rings = {
    gym: ringResult('gym', gym.filter(i => i.counted).length, adjustGoal(coach.gym_goal, 'gym', ex), rules.gym.allow_over, rules.gym.active, { items: gym }),
    run: ringResult('run', runItems.filter(i => i.ok).length, adjustGoal(coach.run_goal, 'run', ex), rules.run.allow_over, rules.run.active, { items: runItems }),
    nutrition: ringResult('nutrition', nutDays.reduce((s, d) => s + d.points, 0), adjustGoal(coach.nutrition_goal, 'nutrition', ex), rules.nutrition.allow_over, rules.nutrition.active, { days: nutDays }),
    weigh: ringResult('weigh', weighDays.length, adjustGoal(coach.weigh_goal, 'weigh', ex), rules.weigh.allow_over, rules.weigh.active, { days: weighDays }),
  };

  const mus = musclesAt(snap, ws);
  const vol = muscleSets(workouts, lookupOf(snap), mus);

  return {
    ws, end, days, coach, rules, exception: ex, rings, workouts, runs,
    muscles: { targets: mus.targets, sets: vol.sets, unmapped: vol.unmapped, paused: affects(ex, 'gym') },
    tonnage: tonnage(workouts),
    complete: end < now,
    current: ws <= now && now <= end,
  };
}

const RING_LABEL = { gym: 'Gym-Sessions', run: 'Läufe', nutrition: 'Grüne Ernährungstage', weigh: 'Wiegungen' };

/** Wochen-Checkliste: Ringe + Volumen. Laufende Woche: noch nicht Erreichtes ist "offen", nicht "verfehlt". */
export function weekChecks(ev) {
  const open = !ev.complete;
  const items = [];
  for (const { id } of RINGS) {
    const r = ev.rings[id];
    if (!r.active) continue;
    items.push({
      key: id, label: RING_LABEL[id], actual: r.value, target: r.goal,
      state: r.paused ? 'paused' : r.done ? 'ok' : open ? 'open' : 'miss',
    });
  }
  const muscles = MUSCLES.filter(m => ev.muscles.targets[m.id]).map(m => {
    const target = ev.muscles.targets[m.id];
    const value = ev.muscles.sets[m.id] || 0;
    return { key: m.id, label: m.label, actual: value, min: target[0], max: target[1], state: ev.muscles.paused ? 'paused' : rangeState(value, target, { open }) };
  });
  if (muscles.length) {
    const inRange = muscles.filter(m => m.state === 'ok' || m.state === 'near').length;
    const state = ev.muscles.paused ? 'paused' : inRange === muscles.length ? 'ok' : open ? 'open' : 'miss';
    items.push({ key: 'volume', label: 'Muskelgruppen im Zielbereich', actual: inRange, target: muscles.length, state });
  }
  const counted = items.filter(i => i.state !== 'paused');
  return { items, muscles, hit: counted.filter(i => i.state === 'ok').length, total: counted.length };
}

// ---------- Tag ----------

/** Tages-Checkliste. state: ok | near | miss | open (noch möglich). Ungeplantes, nicht erledigtes Training fehlt. */
export function dayChecks(snap, date, now = todayFn()) {
  const log = snap.logs?.[date];
  const t = coachAt(snap, date);
  const rules = ringsAt(snap, date);
  const ex = exceptionFor(snap, weekOf(snap, date));
  const pending = date < now ? 'miss' : 'open';
  const items = [];

  const sd = suppDay(snap, date);
  const nut = nutritionDay(log, t, rules.nutrition, suppCondition(sd));
  if (rules.nutrition.active) {
    if (nut.status === 'none') {
      if (t.kcal) items.push({ key: 'kcal', label: 'kcal im Korridor', actual: null, target: t.kcal, unit: 'kcal', state: pending });
      if (t.protein) items.push({ key: 'protein', label: 'Protein erreicht', actual: null, target: t.protein, unit: 'g', state: pending });
    } else {
      items.push(...nut.items.filter(i => i.key !== 'supps'));
    }
  }
  // Supplements: alle fälligen zählen; Bewertung nach den Ring-relevanten
  if (sd.due.length) {
    const all = sd.taken.length === sd.due.length;
    const ringMissing = sd.missingRequired.length;
    items.push({
      key: 'supps', label: 'Supplements', actual: `${sd.taken.length}/${sd.due.length}`,
      state: all ? 'ok' : date >= now ? 'open' : ringMissing >= 2 ? 'miss' : 'near',
    });
  }
  if (rules.weigh.active) {
    items.push({ key: 'weight', label: 'Gewogen', actual: log?.weight ?? null, unit: 'kg', state: log?.weight != null ? 'ok' : pending });
  }
  const wd = weekday(date);
  for (const [id, label, list, qualify] of [
    ['gym', 'Gym', snap.workouts || [], w => qualifyWorkout(w, rules.gym).ok],
    ['run', 'Lauf', snap.runs || [], r => qualifyRun(r, rules.run).ok],
  ]) {
    if (!rules[id].active) continue;
    const planned = (rules[id].days || []).includes(wd) && !(affects(ex, id) && ex.mode === 'pause');
    const done = list.some(x => x.date === date && qualify(x));
    if (!planned && !done) continue;
    items.push({ key: id, label: planned ? `${label} (geplant)` : label, actual: done ? 'erledigt' : null, state: done ? 'ok' : pending });
  }
  items.push({ key: 'checkin', label: 'Check-in eingetragen', actual: isLogged(log) ? 'ja' : null, state: isLogged(log) ? 'ok' : pending });
  return { date, items, nutrition: nut.status, logged: isLogged(log) };
}

// ---------- Motivation & Verläufe ----------

/** Tage in Folge mit Check-in. Ein heute noch offener Tag bricht die Serie nicht. */
export function checkinStreak(snap, now = todayFn()) {
  let d = isLogged(snap.logs?.[now]) ? now : addDays(now, -1);
  let n = 0;
  while (isLogged(snap.logs?.[d])) { n++; d = addDays(d, -1); }
  return n;
}

/** Tageswerte + gleitender 7-Tage-Schnitt (über vorhandene Wiegungen der letzten 7 Tage). */
export function weightSeries(snap, from, to) {
  return daysBetween(from, to).map(d => {
    return { date: d, weight: snap.logs?.[d]?.weight ?? null, avg: mean(snap, daysBetween(addDays(d, -6), d), 'weight', 2) };
  });
}

/** Wochenschnitt Gewicht */
export const weekWeight = (snap, ws) => mean(snap, weekDays(ws), 'weight', 2);

/** Durchschnitt eines Felds über Tage (nur eingetragene) */
export const avgOf = (snap, days, key) => mean(snap, days, key, 1);

function mean(snap, days, key, decimals) {
  const vals = days.map(d => snap.logs?.[d]?.[key]).filter(v => v != null);
  if (!vals.length) return null;
  const f = 10 ** decimals;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * f) / f;
}
