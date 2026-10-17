// Tabellen der App → Schlüsselfeld im Datensatz. Gilt für IndexedDB (lokal) und Supabase (online).
// Neue Tabelle: hier eintragen UND in supabase/migrations anlegen (tests/schema.test.js prüft das).
export const STORES = {
  daily_log: 'date',
  workouts: 'id',
  runs: 'id',
  coach_targets: 'id',
  ring_settings: 'id',
  muscle_targets: 'id',
  week_exceptions: 'id',
  phases: 'id',
  exercise_mapping: 'template_id',
  hevy_templates: 'id',
  kv: 'key',
};
