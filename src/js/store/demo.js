// Demo-Daten zum Testen von Design und Funktionen. Workouts und Läufe werden im Rohformat von Hevy/Strava
// erzeugt und laufen durch dieselben Import-Funktionen wie später der echte Sync.
import { BASE_DATE, DEFAULTS } from '../config.js';
import { addDays, today, weekStart, weekday } from '../lib/dates.js';
import { fromHevyTemplate, fromHevyWorkout, fromStravaActivity } from '../lib/imports.js';
import * as db from './db.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = (id, title, primary_muscle_group, secondary_muscle_groups = [], is_custom = false) =>
  ({ id, title, primary_muscle_group, secondary_muscle_groups, is_custom, type: 'weight_reps' });

const TEMPLATES = [
  T('79D0BB3A', 'Bench Press (Barbell)', 'chest', ['triceps', 'shoulders']),
  T('07B38369', 'Incline Bench Press (Dumbbell)', 'chest', ['shoulders', 'triceps']),
  T('7B8D84E8', 'Overhead Press (Barbell)', 'shoulders', ['triceps']),
  T('422B08F1', 'Lateral Raise (Dumbbell)', 'shoulders'),
  T('93A552C6', 'Triceps Pushdown', 'triceps'),
  T('1B2B1E7C', 'Pull Up', 'lats', ['biceps', 'upper_back']),
  T('55E6546F', 'Bent Over Row (Barbell)', 'upper_back', ['lats', 'biceps']),
  T('6A6C31A5', 'Lat Pulldown (Cable)', 'lats', ['biceps']),
  T('BE640BA0', 'Face Pull', 'shoulders', ['upper_back']),
  T('37FCC2BB', 'Bicep Curl (Dumbbell)', 'biceps', ['forearms']),
  T('D04AC939', 'Squat (Barbell)', 'quadriceps', ['glutes', 'hamstrings']),
  T('2B4B7310', 'Romanian Deadlift (Barbell)', 'hamstrings', ['glutes', 'lower_back']),
  T('C7973E0E', 'Leg Press', 'quadriceps', ['glutes']),
  T('11A123F3', 'Seated Leg Curl (Machine)', 'hamstrings'),
  T('06745E58', 'Standing Calf Raise', 'calves'),
  T('23A48484', 'Cable Crunch', 'abdominals'),
  T('D57C2EC7', 'Hip Thrust (Barbell)', 'glutes', ['hamstrings']),
  T('CUSTOM-01', 'Brustpresse Gym 24 (Maschine)', 'other', [], true),
  T('CUSTOM-02', 'Hackenschmidt Kniebeuge', 'other', [], true),
];

// [Vorlage, Sätze, Start-kg, Wdh, kg-Steigerung pro Woche]
const SPLITS = {
  Push: [['79D0BB3A', 4, 82.5, 6, 1.25], ['07B38369', 3, 30, 10, 0.5], ['7B8D84E8', 3, 50, 8, 0.5], ['422B08F1', 3, 12, 15, 0], ['93A552C6', 3, 30, 12, 0.5], ['CUSTOM-01', 2, 60, 12, 1]],
  Pull: [['1B2B1E7C', 4, 0, 8, 0], ['55E6546F', 4, 70, 8, 1], ['6A6C31A5', 3, 60, 10, 1], ['BE640BA0', 3, 20, 15, 0], ['37FCC2BB', 3, 14, 10, 0.25]],
  Legs: [['D04AC939', 4, 110, 5, 1.25], ['2B4B7310', 3, 100, 8, 1.25], ['CUSTOM-02', 3, 80, 10, 2], ['11A123F3', 3, 45, 12, 0.5], ['06745E58', 4, 60, 12, 1]],
  Upper: [['79D0BB3A', 3, 80, 8, 1], ['55E6546F', 3, 70, 10, 1], ['7B8D84E8', 3, 47.5, 10, 0.5], ['6A6C31A5', 3, 60, 12, 1], ['37FCC2BB', 2, 14, 12, 0], ['93A552C6', 2, 30, 12, 0]],
  Lower: [['D04AC939', 3, 100, 8, 1], ['D57C2EC7', 3, 100, 10, 2], ['C7973E0E', 3, 180, 12, 2.5], ['11A123F3', 3, 45, 12, 0.5], ['23A48484', 3, 40, 15, 0.5]],
};
const ROTATION = ['Push', 'Pull', 'Legs', 'Upper', 'Lower'];
const NAMES = Object.fromEntries(TEMPLATES.map(t => [t.id, t.title]));

const pad = n => String(n).padStart(2, '0');
const hexId = r => Array.from({ length: 8 }, () => Math.floor(r() * 16).toString(16)).join('');

export async function loadDemo({ weeks = 12 } = {}) {
  const r = rng(42);
  const gauss = () => (r() + r() + r() + r() - 2) / 1.15;
  const now = today();
  const firstWeek = addDays(weekStart(now, 1), -7 * (weeks - 1));
  const changeWeek = addDays(weekStart(now, 1), -21);
  const deloadWeek = addDays(weekStart(now, 1), -42);

  // Bulk seit 12 Wochen bis Anfang Januar, danach ist ein Cut mit eigenen Makros geplant
  const bulkEnd = addDays(weekStart(now, 1), 7 * 13 - 1);
  const cutStart = addDays(bulkEnd, 1);

  const created = new Date().toISOString();
  const phases = [
    { id: 'demo-p0', phase: 'bulk', start: firstWeek, end: bulkEnd, note: 'Lean Bulk Winter', created_at: created },
    { id: 'demo-p1', phase: 'cut', start: cutStart, end: addDays(cutStart, 7 * 16 - 1), note: 'Cut fürs Frühjahr', created_at: created },
  ];
  const coach = [
    { id: 'demo-cb', valid_from: BASE_DATE, created_at: created, ...DEFAULTS.coach, note: 'Startwerte' },
    { id: 'demo-c0', valid_from: firstWeek, created_at: created, ...DEFAULTS.coach, phase: 'bulk', phase_id: 'demo-p0', kcal: 3000, protein: 170, carbs: 380, fat: 85, note: 'Startwerte vom Coach' },
    { id: 'demo-c1', valid_from: changeWeek, created_at: created, ...DEFAULTS.coach, phase: 'bulk', kcal: 3150, protein: 175, carbs: 400, fat: 85, note: 'Mit Coach besprochen: +150 kcal, Gewicht steigt zu langsam' },
    { id: 'demo-c2', valid_from: cutStart, created_at: created, ...DEFAULTS.coach, phase: 'cut', phase_id: 'demo-p1', kcal: 2500, protein: 190, carbs: 260, fat: 70, check_macros: true, gym_goal: 4, run_goal: 3, note: 'Cut-Makros vom Coach' },
  ];
  const rings = [{ id: 'demo-r0', valid_from: BASE_DATE, created_at: created, ...structuredClone(DEFAULTS.rings), note: 'Startwerte' }];
  const muscles = [{ id: 'demo-m0', valid_from: BASE_DATE, created_at: created, ...structuredClone(DEFAULTS.muscles), note: 'Startwerte' }];
  const exceptions = [{ id: 'demo-e0', week: deloadWeek, reason: 'deload', mode: 'reduce', factor: 0.6, rings: ['gym'], note: 'Deload-Woche nach Block 1', created_at: created }];
  const mappings = [
    { template_id: 'CUSTOM-02', title: NAMES['CUSTOM-02'], primary: 'quads', secondary: ['glutes'] },
    ...['79D0BB3A', 'D04AC939', '2B4B7310', '7B8D84E8', '55E6546F'].map(id => ({ template_id: id, title: NAMES[id], main: true })),
  ];

  const logs = [];
  const workouts = [];
  const runs = [];
  let split = 0;
  let weight = 78.2;

  for (let d = firstWeek, i = 0; d <= now; d = addDays(d, 1), i++) {
    const wd = weekday(d);
    const wIdx = Math.floor(i / 7);
    const isToday = d === now;
    const target = d >= changeWeek ? coach[2] : coach[1];
    const isDeload = d >= deloadWeek && d < addDays(deloadWeek, 7);

    // Gewicht: leichter Aufwärtstrend + Tagesrauschen
    weight += 0.028 + gauss() * 0.05;
    const log = { date: d };
    if (r() < 0.78 || isToday) log.weight = Math.round((weight + gauss() * 0.35) * 10) / 10;

    // Abend-Check-in (heute noch offen)
    if (!isToday && r() < 0.9) {
      const off = gauss() * 190 + (wd === 6 ? 120 : 0);
      log.kcal = Math.round((target.kcal + off) / 10) * 10;
      log.protein = Math.round(target.protein + gauss() * 11 - 2);
      log.carbs = Math.round(target.carbs + off / 5 + gauss() * 15);
      log.fat = Math.round(target.fat + off / 20 + gauss() * 6);
      if (r() < 0.75) {
        log.sleep = Math.min(5, Math.max(1, Math.round(3.7 + gauss())));
        log.energy = Math.min(5, Math.max(1, Math.round(3.6 + gauss())));
        log.hunger = Math.min(5, Math.max(1, Math.round(2.8 + gauss())));
      }
      if (r() < 0.12) log.note = ['Wenig geschlafen, Training trotzdem gut', 'Essen auswärts, kcal geschätzt', 'Knie leicht gereizt bei Kniebeugen', 'Sehr guter Pump heute', 'Stressiger Arbeitstag'][Math.floor(r() * 5)];
    }
    if (Object.keys(log).length > 1) logs.push(log);

    // Gym nach Plan (Mo Di Do Fr Sa), ab und zu ausgelassen
    const gymDay = DEFAULTS.rings.gym.days.includes(wd);
    if (gymDay && !(isToday && r() < 0.5) && r() < (isDeload ? 0.55 : 0.9)) {
      const name = ROTATION[split++ % ROTATION.length];
      const hour = 15 + Math.floor(r() * 3);
      const short = r() < 0.05 && d < weekStart(now, 1);
      workouts.push(hevyWorkout(r, d, hour, name, wIdx, { short, deload: isDeload }));
      if (r() < 0.04) workouts.push(hevyWorkout(r, d, 7, 'Upper', wIdx, { short: true })); // Doppel-Session
    }

    // Läufe Mi + So, gelegentlich zu kurz oder ein Extralauf
    if (!isToday && ((DEFAULTS.rings.run.days.includes(wd) && r() < 0.88) || (wd === 5 && r() < 0.15))) {
      const tooShort = r() < 0.08;
      const km = tooShort ? 1.4 : wd === 0 ? 8 + r() * 4 : 4.5 + r() * 2.5;
      const pace = (tooShort ? 6.1 : 5.05 + r() * 0.5) * 60; // s/km
      runs.push(fromStravaActivity({
        id: 9000000000 + i, name: wd === 0 ? 'Langer Lauf' : tooShort ? 'Einlaufen' : 'Lockerer Lauf', sport_type: 'Run',
        start_date: `${d}T06:${pad(Math.floor(r() * 50))}:00Z`, start_date_local: `${d}T07:${pad(Math.floor(r() * 50))}:00Z`,
        distance: Math.round(km * 1000), moving_time: Math.round(km * pace), elapsed_time: Math.round(km * pace + 60),
        average_heartrate: Math.round(142 + r() * 14), total_elevation_gain: Math.round(20 + r() * 80),
      }));
    }
  }

  await db.wipe({ keepBase: false, silent: true });
  await db.bulk({
    phases, coach_targets: coach, ring_settings: rings, muscle_targets: muscles, week_exceptions: exceptions,
    exercise_mapping: mappings, hevy_templates: TEMPLATES.map(fromHevyTemplate),
    daily_log: logs, workouts, runs,
    kv: [{ key: 'settings', value: { ...DEFAULTS.settings } }],
  });
}

function hevyWorkout(r, date, hour, name, week, { short = false, deload = false } = {}) {
  const exercises = SPLITS[name].slice(0, short ? 2 : undefined).map(([tid, sets, kg, reps, inc], idx) => {
    const top = Math.round((kg + inc * week) * 4) / 4;
    const list = [];
    if (idx === 0 && top > 20) list.push({ type: 'warmup', weight_kg: Math.round(top * 0.5), reps: 10 });
    const n = deload ? Math.max(2, sets - 1) : sets;
    for (let s = 0; s < n; s++) {
      const fail = s === n - 1 && r() < 0.25;
      list.push({ type: fail ? 'failure' : 'normal', weight_kg: tid === '1B2B1E7C' ? 0 : top, reps: Math.max(3, reps - (s > 1 ? 1 : 0) + Math.round((r() - 0.5) * 2)), rpe: fail ? 10 : 7 + Math.round(r() * 2) });
    }
    return { exercise_template_id: tid, title: NAMES[tid], sets: list };
  });
  const minutes = short ? 22 : 50 + Math.round(r() * 30);
  const start = `${date}T${pad(hour)}:${pad(Math.floor(r() * 60))}:00Z`;
  return fromHevyWorkout({
    id: `${hexId(r)}-demo`, title: name, start_time: start,
    end_time: new Date(new Date(start).getTime() + minutes * 60000).toISOString(), exercises,
  });
}
