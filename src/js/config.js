// Feste Listen und Startwerte. Alles, was Max ändern kann, wird als (versionierte) Einstellung gespeichert –
// diese Werte sind nur der Ausgangspunkt beim ersten Start.

export const APP = { name: 'mx sports', version: '0.1.0' };

/** Startdatum der Basis-Version: gilt für alles davor. */
export const BASE_DATE = '2000-01-01';

export const RINGS = [
  { id: 'gym', label: 'Gym', short: 'Gym', unit: 'Sessions' },
  { id: 'run', label: 'Laufen', short: 'Lauf', unit: 'Läufe' },
  { id: 'nutrition', label: 'Ernährung', short: 'Essen', unit: 'grüne Tage' },
  { id: 'weigh', label: 'Wiegen', short: 'Waage', unit: 'Wiegungen' },
];

export const PHASES = [
  { id: 'bulk', label: 'Bulk', color: '#30d158', text: 'Aufbauen – Kalorienüberschuss' },
  { id: 'cut', label: 'Cut', color: '#ff9f0a', text: 'Definieren – Kaloriendefizit' },
  { id: 'maintenance', label: 'Maintenance', color: '#0a84ff', text: 'Halten – Erhaltungskalorien' },
];
export const PHASE = Object.fromEntries(PHASES.map(p => [p.id, p]));

export const MUSCLES = [
  { id: 'chest', label: 'Brust' },
  { id: 'back', label: 'Rücken' },
  { id: 'shoulders', label: 'Schultern' },
  { id: 'biceps', label: 'Bizeps' },
  { id: 'triceps', label: 'Trizeps' },
  { id: 'quads', label: 'Quadrizeps' },
  { id: 'hamstrings', label: 'Beinbeuger' },
  { id: 'glutes', label: 'Gesäß' },
  { id: 'calves', label: 'Waden' },
  { id: 'abs', label: 'Bauch' },
];
export const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map(m => [m.id, m.label]));

/** Muskelgruppen, wie Hevy sie liefert (exercise_templates.primary_muscle_group). */
export const HEVY_GROUPS = [
  ['abdominals', 'Bauch'], ['abductors', 'Abduktoren'], ['adductors', 'Adduktoren'], ['biceps', 'Bizeps'],
  ['calves', 'Waden'], ['cardio', 'Cardio'], ['chest', 'Brust'], ['forearms', 'Unterarme'], ['full_body', 'Ganzkörper'],
  ['glutes', 'Gesäß'], ['hamstrings', 'Beinbeuger'], ['lats', 'Latissimus'], ['lower_back', 'Unterer Rücken'],
  ['neck', 'Nacken'], ['other', 'Sonstige'], ['quadriceps', 'Quadrizeps'], ['shoulders', 'Schultern'],
  ['traps', 'Trapez'], ['triceps', 'Trizeps'], ['upper_back', 'Oberer Rücken'],
];
export const HEVY_GROUP_LABEL = Object.fromEntries(HEVY_GROUPS);

/** Hevy-Gruppe → App-Gruppe (null = zählt nicht). In den Einstellungen änderbar. */
export const DEFAULT_GROUP_MAP = {
  abdominals: 'abs', abductors: 'glutes', adductors: null, biceps: 'biceps', calves: 'calves', cardio: null,
  chest: 'chest', forearms: null, full_body: null, glutes: 'glutes', hamstrings: 'hamstrings', lats: 'back',
  lower_back: null, neck: null, other: null, quadriceps: 'quads', shoulders: 'shoulders', traps: 'back',
  triceps: 'triceps', upper_back: 'back',
};

export const WEEKDAYS = [
  { id: 1, short: 'Mo', label: 'Montag' }, { id: 2, short: 'Di', label: 'Dienstag' }, { id: 3, short: 'Mi', label: 'Mittwoch' },
  { id: 4, short: 'Do', label: 'Donnerstag' }, { id: 5, short: 'Fr', label: 'Freitag' }, { id: 6, short: 'Sa', label: 'Samstag' },
  { id: 0, short: 'So', label: 'Sonntag' },
];

export const EXCEPTION_REASONS = [
  { id: 'deload', label: 'Deload' }, { id: 'sick', label: 'Krankheit' },
  { id: 'vacation', label: 'Urlaub' }, { id: 'other', label: 'Sonstiges' },
];

export const DEFAULTS = {
  /** Coach-Ziele (versioniert). kcal/Protein kommen von der Coachin → anfangs leer. */
  coach: {
    phase: 'maintenance',
    kcal: null, kcal_tol: 150, kcal_tol_yellow: 300,
    protein: null, protein_tol_yellow: 15,
    carbs: null, fat: null, check_macros: false, macro_tol: 20, macro_tol_yellow: 40,
    gym_goal: 5, run_goal: 2, nutrition_goal: 6, weigh_goal: 5,
    note: 'Startwerte',
  },
  /** Ring-Regeln (versioniert). */
  rings: {
    gym: { active: true, min_duration: 30, min_sets: 8, max_per_day: 1, allow_over: false, days: [1, 2, 4, 5, 6] },
    run: { active: true, min_duration: 15, min_km: 2, allow_over: true, days: [3, 0] },
    nutrition: { active: true, yellow: true, allow_over: false },
    weigh: { active: true, allow_over: false },
  },
  /** Sätze pro Muskelgruppe (versioniert). */
  muscles: {
    targets: {
      chest: [10, 16], back: [12, 18], shoulders: [10, 16], biceps: [8, 14], triceps: [8, 14],
      quads: [10, 16], hamstrings: [8, 12], glutes: [8, 14], calves: [6, 12], abs: [6, 10],
    },
    secondary_factor: 0.5,
    primary_only: false,
  },
  /** Nicht versionierte Einstellungen. */
  settings: { week_start: 1, reminder_hour: 21 },
};
