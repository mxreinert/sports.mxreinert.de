// Morgen-Routine: feste Schritte in Reihenfolge, Häkchen gelten nur für den heutigen Tag.
// Völlig unabhängig: zählt für keinen Ring, keine Auswertung, kein Verlauf.

/** Heute erledigte Schritte – ein Stand von gestern zählt nicht mehr (automatisches Zurücksetzen) */
export const doneToday = (progress, date) => new Set(progress?.date === date ? progress.done : []);

/** Erster offener Schritt in der Reihenfolge */
export const nextStep = (steps, done) => steps.find(s => !done.has(s.id)) || null;

/** Schritt in der Liste nach oben (-1) oder unten (+1) verschieben */
export function move(steps, id, dir) {
  const list = [...steps];
  const i = list.findIndex(s => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

export function toggle(progress, date, id) {
  const done = doneToday(progress, date);
  if (done.has(id)) done.delete(id);
  else done.add(id);
  return { date, done: [...done] };
}
