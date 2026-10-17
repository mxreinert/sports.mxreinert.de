// node --test tests/
// Grenzfälle aus dem Konzept: Wochenwechsel, Zeitzone Europe/Luxembourg, zwei Workouts am selben Tag,
// fehlende Tage, Zieländerung mitten in der Woche – plus Ernährungsampel, Volumen, Pausen-Wochen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayOf, weekStart, isoWeek, addDays, weekDays } from '../src/js/lib/dates.js';
import { versionAt } from '../src/js/lib/versions.js';
import { fromHevyWorkout, fromStravaActivity } from '../src/js/lib/imports.js';
import { e1rm, muscleSets, musclesOf } from '../src/js/lib/training.js';
import {
  evaluateWeek, weekChecks, dayChecks, nutritionDay, checkinStreak, weightSeries, coachAt, gymItems,
} from '../src/js/lib/engine.js';
import { DEFAULTS, DEFAULT_GROUP_MAP } from '../src/js/config.js';

const WEEK = '2026-10-12'; // Montag, KW 42

function snap(extra = {}) {
  return {
    logs: {}, workouts: [], runs: [], exceptions: [], mappings: {}, templates: {},
    coach: [{ id: 'c0', valid_from: '2000-01-01', created_at: '1', ...DEFAULTS.coach, kcal: 3000, protein: 170 }],
    rings: [{ id: 'r0', valid_from: '2000-01-01', created_at: '1', ...structuredClone(DEFAULTS.rings) }],
    muscles: [{ id: 'm0', valid_from: '2000-01-01', created_at: '1', ...structuredClone(DEFAULTS.muscles) }],
    settings: { week_start: 1 },
    ...extra,
  };
}

/** Workout mit n Arbeitssätzen (+1 Aufwärmsatz) */
function workout(id, date, { min = 60, sets = 10, hour = 17, template = 'bench' } = {}) {
  const start = `${date}T${String(hour).padStart(2, '0')}:00:00Z`;
  return fromHevyWorkout({
    id, title: 'Push', start_time: start, end_time: new Date(new Date(start).getTime() + min * 60000).toISOString(),
    exercises: [{ exercise_template_id: template, title: 'Bankdrücken', sets: [
      { type: 'warmup', weight_kg: 40, reps: 10 },
      ...Array.from({ length: sets }, () => ({ type: 'normal', weight_kg: 80, reps: 8 })),
    ] }],
  });
}

// ---------- Datum & Zeitzone ----------

test('Zeitzone: Training kurz nach Mitternacht Luxemburger Zeit zählt zum neuen Tag', () => {
  // 22:30 UTC im Sommer = 00:30 Luxemburg (UTC+2) am nächsten Tag
  assert.equal(dayOf('2026-07-14T22:30:00Z'), '2026-07-15');
  // im Winter UTC+1: 22:30 UTC = 23:30 → noch derselbe Tag
  assert.equal(dayOf('2026-01-14T22:30:00Z'), '2026-01-14');
});

test('Zeitstempel bei Umstellung auf Winterzeit', () => {
  assert.equal(dayOf('2026-10-24T23:30:00Z'), '2026-10-25'); // 01:30 MESZ
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});

test('Wochenstart Montag und Sonntag, Wochenwechsel', () => {
  assert.equal(weekStart('2026-10-18', 1), '2026-10-12'); // Sonntag gehört zur Woche ab Montag davor
  assert.equal(weekStart('2026-10-19', 1), '2026-10-19');
  assert.equal(weekStart('2026-10-18', 0), '2026-10-18');
  assert.equal(weekStart('2027-01-01', 1), '2026-12-28'); // Jahreswechsel
  assert.deepEqual(isoWeek('2026-10-12'), { week: 42, year: 2026 });
  assert.deepEqual(isoWeek('2027-01-01'), { week: 53, year: 2026 });
});

test('Sonntagabend-Workout in der Woche, Montag in der nächsten', () => {
  const s = snap({ workouts: [workout('a', '2026-10-18', { hour: 20 }), workout('b', '2026-10-19', { hour: 6 })] });
  assert.equal(evaluateWeek(s, WEEK).rings.gym.value, 1);
  assert.equal(evaluateWeek(s, '2026-10-19').rings.gym.value, 1);
});

// ---------- Versionen ----------

test('versionAt: spätestes gültig-ab, bei Gleichstand die neueste', () => {
  const v = [
    { id: 1, valid_from: '2000-01-01', created_at: 'a' },
    { id: 2, valid_from: '2026-10-14', created_at: 'b' },
    { id: 3, valid_from: '2026-10-14', created_at: 'c' },
  ];
  assert.equal(versionAt(v, '2026-10-13').id, 1);
  assert.equal(versionAt(v, '2026-10-14').id, 3);
  assert.equal(versionAt(v, '1999-01-01'), null);
});

test('Zieländerung mitten in der Woche: Tagesziel ab dem Tag, Wochenziel ab Wochenstart', () => {
  const s = snap();
  s.coach.push({ id: 'c1', valid_from: '2026-10-15', created_at: '2', ...DEFAULTS.coach, kcal: 3200, protein: 170, gym_goal: 3 });
  for (const d of weekDays(WEEK)) s.logs[d] = { date: d, kcal: 3000, protein: 175 };
  const ev = evaluateWeek(s, WEEK, '2026-10-30');
  // Mo–Mi: Ziel 3000 → grün · Do–So: Ziel 3200, 3000 = −200 → gelb
  assert.deepEqual(ev.rings.nutrition.days.map(d => d.status), ['green', 'green', 'green', 'yellow', 'yellow', 'yellow', 'yellow']);
  assert.equal(ev.rings.nutrition.value, 5);
  assert.equal(ev.rings.gym.goal, 5, 'Wochenziel der laufenden Woche bleibt');
  assert.equal(evaluateWeek(s, '2026-10-19').rings.gym.goal, 3, 'neue Woche nutzt neue Version');
  assert.equal(coachAt(s, '2026-10-14').kcal, 3000);
});

test('Vergangene Wochen ändern sich nicht durch neue Versionen', () => {
  const s = snap();
  s.logs['2026-10-13'] = { kcal: 3000, protein: 170 };
  const before = evaluateWeek(s, WEEK, '2026-12-01').rings.nutrition.value;
  s.coach.push({ id: 'c2', valid_from: '2026-11-01', created_at: '3', ...DEFAULTS.coach, kcal: 2000, protein: 200, nutrition_goal: 2 });
  const after = evaluateWeek(s, WEEK, '2026-12-01').rings.nutrition;
  assert.equal(after.value, before);
  assert.equal(after.goal, 6);
});

// ---------- Gym ----------

test('Gym: zwei Workouts am selben Tag zählen bei max. 1 pro Tag einmal', () => {
  const s = snap({ workouts: [workout('a', '2026-10-13', { hour: 7 }), workout('b', '2026-10-13', { hour: 17 })] });
  const r = evaluateWeek(s, WEEK).rings.gym;
  assert.equal(r.value, 1);
  assert.equal(r.items.filter(i => i.ok && !i.counted).length, 1);
  s.rings[0].gym.max_per_day = 2;
  assert.equal(evaluateWeek(s, WEEK).rings.gym.value, 2);
});

test('Gym: Mindestdauer und Arbeitssätze (Aufwärmsätze zählen nicht)', () => {
  const items = gymItems([workout('kurz', WEEK, { min: 25 }), workout('wenig', WEEK, { sets: 7 }), workout('ok', '2026-10-14', { sets: 8, min: 30 })], DEFAULTS.rings.gym);
  assert.deepEqual(items.map(i => i.ok), [false, false, true]);
  assert.equal(items[1].sets, 7);
});

test('Gym: über 100 % nur, wenn erlaubt', () => {
  const s = snap({ workouts: weekDays(WEEK).map((d, i) => workout(`w${i}`, d)) });
  assert.equal(evaluateWeek(s, WEEK).rings.gym.progress, 1);
  s.rings[0].gym.allow_over = true;
  assert.equal(evaluateWeek(s, WEEK).rings.gym.progress, 7 / 5);
});

// ---------- Laufen ----------

test('Lauf zählt bei Mindestdauer ODER Mindestdistanz, Strava-Import filtert Nicht-Läufe', () => {
  const runs = [
    fromStravaActivity({ id: 1, sport_type: 'Run', start_date_local: '2026-10-13T07:00:00Z', distance: 1500, moving_time: 16 * 60 }),
    fromStravaActivity({ id: 2, sport_type: 'TrailRun', start_date_local: '2026-10-14T07:00:00Z', distance: 2100, moving_time: 11 * 60 }),
    fromStravaActivity({ id: 3, sport_type: 'Run', start_date_local: '2026-10-15T07:00:00Z', distance: 1000, moving_time: 6 * 60 }),
  ];
  assert.equal(fromStravaActivity({ id: 4, sport_type: 'Ride', start_date_local: '2026-10-15T07:00:00Z' }), null);
  const r = evaluateWeek(snap({ runs }), WEEK).rings.run;
  assert.equal(r.value, 2);
  assert.equal(r.progress, 1);
});

// ---------- Ernährung ----------

test('Ernährungsampel: grün / gelb / rot / nicht eingetragen', () => {
  const t = { ...DEFAULTS.coach, kcal: 3100, protein: 170 };
  assert.equal(nutritionDay({ kcal: 3050, protein: 172 }, t).status, 'green');
  assert.equal(nutritionDay({ kcal: 3050, protein: 162 }, t).status, 'yellow'); // Beispiel aus dem Konzept
  assert.equal(nutritionDay({ kcal: 3350, protein: 175 }, t).status, 'yellow');
  assert.equal(nutritionDay({ kcal: 3450, protein: 175 }, t).status, 'red');
  assert.equal(nutritionDay({ kcal: 3050, protein: 140 }, t).status, 'red');
  assert.equal(nutritionDay({ kcal: 3300, protein: 175 }, t, { yellow: false }).status, 'red');
  assert.equal(nutritionDay({ weight: 80 }, t).status, 'none');
  assert.equal(nutritionDay(undefined, t).status, 'none');
});

test('Ernährung: Makros nur, wenn aktiviert', () => {
  const t = { ...DEFAULTS.coach, kcal: 3000, protein: 170, carbs: 380, fat: 80 };
  const log = { kcal: 3000, protein: 170, carbs: 300, fat: 80 };
  assert.equal(nutritionDay(log, t).status, 'green');
  assert.equal(nutritionDay(log, { ...t, check_macros: true }).status, 'red');
});

test('Ernährung: gelbe Tage geben einen halben Punkt, fehlende Tage keinen', () => {
  const s = snap();
  s.logs['2026-10-12'] = { kcal: 3000, protein: 170 };
  s.logs['2026-10-13'] = { kcal: 3250, protein: 170 };
  s.logs['2026-10-15'] = { weight: 80 };
  const r = evaluateWeek(s, WEEK).rings.nutrition;
  assert.equal(r.value, 1.5);
  assert.deepEqual(r.days.map(d => d.status), ['green', 'yellow', 'none', 'none', 'none', 'none', 'none']);
});

test('Ernährung ohne Coach-Ziele: eingetragene Tage sind grün', () => {
  const s = snap({ coach: [{ id: 'c', valid_from: '2000-01-01', ...DEFAULTS.coach }] });
  s.logs[WEEK] = { kcal: 2500 };
  assert.equal(evaluateWeek(s, WEEK).rings.nutrition.value, 1);
});

// ---------- Wiegen ----------

test('Wiegen zählt Tage mit Gewicht, nicht den Wert', () => {
  const s = snap();
  weekDays(WEEK).forEach((d, i) => { s.logs[d] = { weight: 80 + i }; });
  const r = evaluateWeek(s, WEEK).rings.weigh;
  assert.equal(r.value, 7);
  assert.equal(r.progress, 1);
});

// ---------- Pausen-Woche ----------

test('Pausen-Woche: aussetzen oder reduzieren, optional nur einzelne Ringe', () => {
  const s = snap({ exceptions: [{ id: 'e', week: WEEK, mode: 'pause', reason: 'sick' }] });
  const ev = evaluateWeek(s, WEEK);
  assert.ok(ev.rings.gym.paused && ev.rings.run.paused && ev.rings.weigh.paused);
  s.exceptions[0] = { id: 'e', week: WEEK, mode: 'reduce', factor: 0.5, rings: ['gym'] };
  const ev2 = evaluateWeek(s, WEEK);
  assert.equal(ev2.rings.gym.goal, 3); // 5 × 0,5 = 2,5 → 3
  assert.equal(ev2.rings.run.goal, 2);
  assert.equal(evaluateWeek(s, '2026-10-19').rings.gym.goal, 5);
});

test('Wochen-Checkliste: pausierte Ringe zählen nicht mit', () => {
  const s = snap({ exceptions: [{ id: 'e', week: WEEK, mode: 'pause', rings: ['run'] }] });
  const c = weekChecks(evaluateWeek(s, WEEK, '2026-11-01'));
  assert.equal(c.items.find(i => i.key === 'run').state, 'paused');
  assert.equal(c.total, 4); // gym, nutrition, weigh, volume
});

// ---------- Volumen ----------

test('Sätze pro Muskelgruppe: primär 1, sekundär 0,5, eigene Zuordnung hat Vorrang', () => {
  const templates = { bench: { id: 'bench', primary: 'chest', secondary: ['triceps', 'shoulders'] }, custom: { id: 'custom', primary: 'other', secondary: [] } };
  const w = workout('a', WEEK, { sets: 4 });
  w.exercises.push({ template_id: 'custom', title: 'Maschine X', sets: [{ type: 'normal' }, { type: 'failure' }, { type: 'dropset' }] });
  const lookup = { templates, mappings: {}, groupMap: DEFAULT_GROUP_MAP };
  let r = muscleSets([w], lookup, { secondary_factor: 0.5 });
  assert.equal(r.sets.chest, 4);
  assert.equal(r.sets.triceps, 2);
  assert.equal(r.unmapped[0].sets, 3);
  lookup.mappings = { custom: { primary: 'lats', secondary: ['biceps'] } };
  r = muscleSets([w], lookup, { secondary_factor: 0.5 });
  assert.equal(r.sets.lats, 3);
  assert.equal(r.sets.biceps, 1.5);
  assert.equal(r.unmapped.length, 0);
  r = muscleSets([w], lookup, { primary_only: true });
  assert.equal(r.sets.triceps, 0);
  assert.equal(musclesOf('custom', lookup).source, 'manuell');
});

test('Rücken getrennt: Latissimus, oberer und unterer Rücken; Trapez zählt zum oberen Rücken', () => {
  const lookup = { templates: {
    row: { id: 'row', primary: 'upper_back', secondary: ['lats', 'biceps', 'traps'] },
    rdl: { id: 'rdl', primary: 'hamstrings', secondary: ['glutes', 'lower_back'] },
  }, mappings: {}, groupMap: DEFAULT_GROUP_MAP };
  assert.deepEqual(musclesOf('row', lookup), { primary: 'upper_back', secondary: ['lats', 'biceps'], source: 'hevy' });
  assert.deepEqual(musclesOf('rdl', lookup).secondary, ['glutes', 'lower_back']);
});

test('Alte Zuordnung „Rücken“ fällt auf Hevy zurück, hintere Schulter nur manuell', () => {
  const templates = { face: { id: 'face', primary: 'shoulders', secondary: ['upper_back'] } };
  const old = { templates, groupMap: DEFAULT_GROUP_MAP, mappings: { face: { primary: 'back', secondary: ['back'] } } };
  assert.equal(musclesOf('face', old).source, 'hevy');
  assert.equal(musclesOf('face', old).primary, 'shoulders');
  const manual = { ...old, mappings: { face: { primary: 'rear_delts', secondary: ['upper_back', 'back'] } } };
  assert.deepEqual(musclesOf('face', manual), { primary: 'rear_delts', secondary: ['upper_back'], source: 'manuell' });
});

// ---------- Tag, Streak, Gewicht ----------

test('Tages-Check: offen am heutigen Tag, verfehlt in der Vergangenheit, Ruhetag ausgeblendet', () => {
  const s = snap();
  const today = dayChecks(s, '2026-10-13', '2026-10-13'); // Dienstag = Gym-Tag
  assert.equal(today.items.find(i => i.key === 'gym').state, 'open');
  assert.equal(today.items.find(i => i.key === 'checkin').state, 'open');
  const past = dayChecks(s, '2026-10-13', '2026-10-20');
  assert.equal(past.items.find(i => i.key === 'gym').state, 'miss');
  const wed = dayChecks(s, '2026-10-14', '2026-10-20'); // Mi = Lauftag, kein Gym
  assert.equal(wed.items.find(i => i.key === 'gym'), undefined);
  assert.equal(wed.items.find(i => i.key === 'run').state, 'miss');
});

test('Streak: heute offen bricht nicht, Lücke bricht', () => {
  const s = snap();
  for (const d of ['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14']) s.logs[d] = { kcal: 3000 };
  assert.equal(checkinStreak(s, '2026-10-15'), 3);
  s.logs['2026-10-15'] = { kcal: 2900 };
  assert.equal(checkinStreak(s, '2026-10-15'), 4);
  s.logs['2026-10-16'] = { weight: 80 };
  assert.equal(checkinStreak(s, '2026-10-17'), 0);
});

test('7-Tage-Schnitt nutzt nur vorhandene Wiegungen', () => {
  const s = snap();
  s.logs['2026-10-10'] = { weight: 80 };
  s.logs['2026-10-12'] = { weight: 81 };
  const series = weightSeries(s, '2026-10-12', '2026-10-17');
  assert.equal(series[0].avg, 80.5);
  assert.equal(series[4].avg, 80.5); // 16.10.: Fenster 10.–16. enthält beide Werte
  assert.equal(series[5].avg, 81); // 17.10.: Fenster 11.–17. → 10. fällt raus
});

test('e1RM nach Epley', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(e1rm(100, 5), 116.7);
  assert.equal(e1rm(100, 15), null);
});

test('Adduktoren, Abduktoren, Unterarme kommen von Hevy; Gruppen ohne Ziel zählen, werden aber nicht bewertet', async () => {
  const { MUSCLES } = await import('../src/js/config.js');
  const templates = {
    add: { id: 'add', primary: 'adductors', secondary: [] },
    abd: { id: 'abd', primary: 'abductors', secondary: [] },
    curl: { id: 'curl', primary: 'biceps', secondary: ['forearms'] },
  };
  const w = fromHevyWorkout({ id: 'x', start_time: '2026-10-13T16:00:00Z', end_time: '2026-10-13T17:00:00Z', exercises: [
    { exercise_template_id: 'add', title: 'Adduktoren-Maschine', sets: [{ type: 'normal' }, { type: 'normal' }] },
    { exercise_template_id: 'abd', title: 'Abduktoren-Maschine', sets: [{ type: 'normal' }] },
    { exercise_template_id: 'curl', title: 'Curl', sets: [{ type: 'normal' }, { type: 'normal' }] },
  ] });
  const s = snap({ workouts: [w], templates });
  const ev = evaluateWeek(s, WEEK, '2026-11-01');
  assert.equal(ev.muscles.sets.adductors, 2);
  assert.equal(ev.muscles.sets.abductors, 1);
  assert.equal(ev.muscles.sets.forearms, 1);
  assert.equal(ev.muscles.unmapped.length, 0);
  const c = weekChecks(ev);
  assert.ok(c.muscles.some(m => m.key === 'adductors'), 'Adduktoren haben ein Ziel');
  assert.ok(!c.muscles.some(m => m.key === 'forearms'), 'Unterarme ohne Ziel → nicht bewertet');
  assert.equal(c.muscles.length, MUSCLES.filter(m => DEFAULTS.muscles.targets[m.id]).length);
});

test('Archiv: ausgeblendet, bis die Übung wieder trainiert wird', async () => {
  const { isArchived } = await import('../src/js/lib/training.js');
  assert.equal(isArchived(undefined, '2026-01-01'), false);
  assert.equal(isArchived({ archived_at: '2026-10-17' }, '2025-12-01'), true);
  assert.equal(isArchived({ archived_at: '2026-10-17' }, null), true);
  assert.equal(isArchived({ archived_at: '2026-10-17' }, '2026-10-20'), false, 'wieder trainiert → aktiv');
  assert.equal(isArchived({ archived_at: null }, '2025-01-01'), false, 'wiederhergestellt');
});
