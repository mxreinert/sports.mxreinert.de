// Datumslogik. Ein Tag ist immer ein String 'YYYY-MM-DD' in der Zeitzone Europe/Luxembourg.
// Rechnen passiert in UTC auf reinen Kalenderdaten, damit Sommer-/Winterzeit nichts verschiebt.

const TZ = 'Europe/Luxembourg';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

/** Zeitpunkt (Date oder ISO-String, z. B. Hevy start_time in UTC) → Kalendertag in Luxemburg. */
export function dayOf(input) {
  const d = input instanceof Date ? input : new Date(input);
  return dayFmt.format(d);
}

export const today = (now = new Date()) => dayOf(now);
export const hourNow = (now = new Date()) => Number(hourFmt.format(now));

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = dt => dt.toISOString().slice(0, 10);

export function addDays(s, n) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** 0 = Sonntag … 6 = Samstag */
export const weekday = s => parse(s).getUTCDay();

/** Erster Tag der Woche, in der s liegt. startDay: 1 = Montag (Standard), 0 = Sonntag … */
export function weekStart(s, startDay = 1) {
  return addDays(s, -((weekday(s) - startDay + 7) % 7));
}

export const weekDays = start => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

export function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ISO-Kalenderwoche { week, year } – bezogen auf den Donnerstag der Woche. */
export function isoWeek(s) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { week, year };
}
