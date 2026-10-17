// Deutsche Formatierung für Zahlen, Daten, Dauer und Pace.
import { parse, isoWeek, addDays } from './dates.js';

const nfCache = {};
const nf = (min, max) => (nfCache[`${min}-${max}`] ||= new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max }));

/** Zahl mit bis zu d Nachkommastellen; null → – */
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : nf(0, d).format(v));
/** Zahl mit genau d Nachkommastellen */
export const fixed = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : nf(d, d).format(v));
export const signed = (v, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fixed(Math.abs(v), d)}`);

const df = opts => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...opts });
const F = {
  long: df({ weekday: 'long', day: 'numeric', month: 'long' }),
  medium: df({ weekday: 'short', day: 'numeric', month: 'short' }),
  short: df({ day: 'numeric', month: 'short' }),
  dm: df({ day: '2-digit', month: '2-digit' }),
  full: df({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  wd: df({ weekday: 'short' }),
  month: df({ month: 'long', year: 'numeric' }),
};

export const dateLong = s => F.long.format(parse(s));        // Donnerstag, 15. Oktober
export const dateMedium = s => F.medium.format(parse(s));    // Do., 15. Okt.
export const dateShort = s => F.short.format(parse(s));      // 15. Okt.
export const dateDM = s => F.dm.format(parse(s));            // 15.10.
export const dateFull = s => F.full.format(parse(s));        // 15.10.2026
export const wdShort = s => F.wd.format(parse(s)).replace('.', ''); // Do

export const kw = s => `KW ${isoWeek(s).week}`;
export const weekRange = ws => `${dateDM(ws)} – ${dateDM(addDays(ws, 6))}`;

export function duration(min) {
  if (min == null) return '–';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** min/km → "5:12 /km" */
export function pace(durationMin, km) {
  if (!durationMin || !km) return '–';
  const s = Math.round((durationMin * 60) / km);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
}

/** Datei-sicherer Name */
export const slug = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
