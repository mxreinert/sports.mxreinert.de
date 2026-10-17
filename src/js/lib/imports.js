// Übersetzt Rohdaten von Hevy und Strava in das App-Format.
// Dieselben Funktionen laufen später in der Netlify Function und jetzt schon für die Demo-Daten.
import { dayOf } from './dates.js';

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Hevy GET /v1/workouts → Workout */
export function fromHevyWorkout(hw) {
  const start = hw.start_time;
  const end = hw.end_time || hw.start_time;
  return {
    id: `hevy-${hw.id}`,
    source: 'hevy',
    hevy_id: hw.id,
    title: hw.title || 'Workout',
    start,
    end,
    date: dayOf(start),
    duration_min: Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000)),
    exercises: (hw.exercises || []).map(e => ({
      template_id: e.exercise_template_id,
      title: e.title,
      sets: (e.sets || []).map(s => ({
        type: s.type || 'normal',
        weight_kg: num(s.weight_kg),
        reps: num(s.reps),
        rpe: num(s.rpe),
      })),
    })),
    updated_at: hw.updated_at || null,
  };
}

/** Hevy GET /v1/exercise_templates → Vorlage mit Muskelgruppen */
export function fromHevyTemplate(t) {
  return {
    id: t.id,
    title: t.title,
    primary: t.primary_muscle_group || null,
    secondary: t.secondary_muscle_groups || [],
    custom: !!t.is_custom,
  };
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

/** Strava GET /athlete/activities → Lauf (oder null, wenn es kein Lauf ist) */
export function fromStravaActivity(a) {
  const type = a.sport_type || a.type;
  if (!RUN_TYPES.has(type)) return null;
  return {
    id: `strava-${a.id}`,
    source: 'strava',
    strava_id: a.id,
    name: a.name || 'Lauf',
    // start_date_local ist bereits Ortszeit ("…Z" ist bei Strava hier irreführend)
    date: (a.start_date_local || dayOf(a.start_date)).slice(0, 10),
    start: a.start_date,
    distance_km: Math.round((a.distance || 0) / 10) / 100,
    duration_min: Math.round(((a.moving_time || a.elapsed_time || 0) / 60) * 10) / 10,
    hr: num(a.average_heartrate),
    elevation_m: num(a.total_elevation_gain),
  };
}
