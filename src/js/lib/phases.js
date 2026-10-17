// Phasen (Bulk / Cut / Maintenance) mit Start und geplantem Ende.
// Eine Phase legt beim Start eine neue Coach-Version (gültig ab Start) an – alte Daten und Versionen bleiben unberührt.
// Läuft eine Phase ab, ohne dass eine neue geplant ist, fragt die App per Setup nach (Verlängern oder neue Phase).
import { addDays, diffDays } from './dates.js';

const byStart = (a, b) => a.start.localeCompare(b.start) || (a.created_at || '').localeCompare(b.created_at || '');

/** Phase, die an einem Tag gilt (spätester Start <= Tag). Auch nach dem geplanten Ende gilt sie weiter, bis eine neue beginnt. */
export function phaseAt(phases, date) {
  return [...(phases || [])].sort(byStart).filter(p => p.start <= date).pop() || null;
}

/** Nächste geplante Phase nach einem Tag */
function nextPhase(phases, date) {
  return [...(phases || [])].sort(byStart).find(p => p.start > date) || null;
}

/**
 * Zustand für die Anzeige.
 * status: 'none' (noch keine Phase) · 'active' · 'expired' (Ende überschritten, nichts geplant) · 'upcoming' (erste Phase liegt in der Zukunft)
 */
export function phaseStatus(phases, today) {
  const cur = phaseAt(phases, today);
  const next = nextPhase(phases, today);
  if (!cur) return { status: next ? 'upcoming' : 'none', phase: null, next };
  const day = diffDays(cur.start, today) + 1;
  const week = Math.floor((day - 1) / 7) + 1;
  const totalDays = cur.end ? diffDays(cur.start, cur.end) + 1 : null;
  const info = {
    phase: cur, next, day, week,
    totalWeeks: totalDays ? Math.ceil(totalDays / 7) : null,
    daysLeft: cur.end ? diffDays(today, cur.end) : null,
    progress: totalDays ? Math.min(1, day / totalDays) : null,
  };
  const expired = cur.end && cur.end < today;
  return { ...info, status: expired && !next ? 'expired' : 'active' };
}

/** Muss das Setup erscheinen? 'first' | 'expired' | null */
export function setupNeeded(phases, today) {
  const s = phaseStatus(phases, today);
  if (s.status === 'none') return 'first';
  if (s.status === 'expired') return 'expired';
  return null;
}

/**
 * Prüft eine neue Phase und liefert die nötigen Anpassungen an bestehenden Phasen.
 * Regeln: Start nach dem Start aller bestehenden Phasen; Ende (falls gesetzt) nach dem Start.
 * Die vorherige Phase endet am Tag vor dem neuen Start, wenn sie länger geplant war.
 * @returns {{ ok: boolean, error?: string, updates: object[] }}
 */
export function planNewPhase(phases, { start, end }) {
  if (!start) return { ok: false, error: 'Bitte ein Startdatum wählen.', updates: [] };
  if (end && end < start) return { ok: false, error: 'Das Ende muss nach dem Start liegen.', updates: [] };
  const sorted = [...(phases || [])].sort(byStart);
  const last = sorted[sorted.length - 1];
  if (last && start <= last.start) return { ok: false, error: `Der Start muss nach dem Start der letzten Phase (${last.start}) liegen.`, updates: [] };
  const updates = [];
  if (last && (!last.end || last.end >= start)) updates.push({ ...last, end: addDays(start, -1) });
  return { ok: true, updates };
}

/** Aktuelle Phase verlängern / Ende ändern */
export function planNewEnd(phases, id, end) {
  const p = (phases || []).find(x => x.id === id);
  if (!p) return { ok: false, error: 'Phase nicht gefunden.' };
  if (end && end < p.start) return { ok: false, error: 'Das Ende muss nach dem Start liegen.' };
  const next = [...phases].sort(byStart).find(x => x.start > p.start);
  if (next && end && end >= next.start) return { ok: false, error: `Die nächste Phase beginnt am ${next.start}. Ende muss davor liegen.` };
  return { ok: true, row: { ...p, end: end || null } };
}
