// Inhalt der PDF-Berichte (Woche / zwei Wochen) als helles A4-Dokument.
// Wird für die Vorschau und – frisch gebaut – für den Druck/PDF-Export verwendet.
import { h } from '../ui/h.js';
import { stateDot } from '../ui/kit.js';
import { activityRings } from '../ui/rings.js';
import { lineChart, rangeBars } from '../ui/charts.js';
import {
  evaluateWeek, weekChecks, weightSeries, weekWeight, avgOf, coachAt, ringsAt,
} from '../lib/engine.js';
import { topSets } from '../lib/training.js';
import { addDays, diffDays, weekDays, today } from '../lib/dates.js';
import { dateDM, dateFull, dateShort, duration, num, fixed, signed, pace, kw, weekRange, wdShort } from '../lib/format.js';
import { MUSCLES, PHASE, RINGS, EXCEPTION_REASONS } from '../config.js';
import { phaseAt } from '../lib/phases.js';

const CHART_W = 660;
const phaseLabel = id => PHASE[id]?.label || id;

/** „Bulk (Woche 3, bis 10.01.2027)“ – aus dem Phasenplan, sonst aus der Coach-Version */
function phaseText(snap, date) {
  const p = phaseAt(snap.phases, date);
  if (!p) return phaseLabel(coachAt(snap, date).phase);
  const week = Math.floor(diffDays(p.start, date) / 7) + 1;
  return `${phaseLabel(p.phase)} (Woche ${week}${p.end ? `, bis ${dateFull(p.end)}` : ''})`;
}
const STATE_TXT = { ok: 'erreicht', near: 'knapp', miss: 'verfehlt', open: 'offen', paused: 'Pause', off: '–' };

const sec = (n, title, ...body) => h('section.doc-sec', h('h2.doc-h', h('span.doc-n', String(n)), title), body);
const kv = (label, value, sub) => h('div.doc-kv', h('div.doc-kv-l', label), h('div.doc-kv-v', value), sub ? h('div.doc-kv-s', sub) : null);
const table = (head, rows, cls = '') => h(`table.doc-table${cls ? `.${cls}` : ''}`, h('thead', h('tr', head.map(x => h('th', x)))), h('tbody', rows.map(r => h('tr', r.map(c => h('td', c))))));

function header(kind, title, sub, snap, ws) {
  return h('header.doc-head',
    h('div.doc-brand', h('span.doc-logo', activityRings(RINGS.map((r, i) => ({ id: r.id, progress: [0.85, 0.7, 0.9, 1][i] })), { size: 30, animate: false })), h('b', 'mx sports'), h('span', kind)),
    h('h1', title),
    h('div.doc-meta', sub, ` · Phase: ${phaseText(snap, ws)} · erstellt am ${dateFull(today())}`));
}

function checkTable(wc) {
  return table(['', 'Ziel', 'Ist', 'Soll', 'Status'], wc.items.map(i => [
    stateDot(i.state, 11), i.label, num(i.actual, 1), i.min != null ? `${i.min}–${i.max}` : num(i.target, 1), STATE_TXT[i.state],
  ]), 'doc-check');
}

/** Gewicht: Tageswerte als Punkte, 7-Tage-Schnitt als Linie */
function weightChart(series) {
  return lineChart({
    width: CHART_W, height: 150, light: true, labels: series.map(p => dateShort(p.date)), xTicks: 5,
    series: [{ values: series.map(p => p.weight), kind: 'dots', color: 'var(--weigh)', opacity: 0.7 }, { values: series.map(p => p.avg), kind: 'line', color: 'var(--weigh)', endDot: true }],
  });
}

// ---------- Wochenbericht ----------

export function weekReport(snap, ws, { extraNote } = {}) {
  const now = today();
  const ev = evaluateWeek(snap, ws, now);
  const wc = weekChecks(ev);
  const days = weekDays(ws);
  const prevAvg = weekWeight(snap, addDays(ws, -7));
  const avg = weekWeight(snap, ws);
  const series = weightSeries(snap, ws, addDays(ws, 6));
  const c = ev.coach;
  const nutr = ev.rings.nutrition.days;
  const cnt = s => nutr.filter(d => d.status === s).length;
  const mains = Object.values(snap.mappings).filter(m => m.main).map(m => m.template_id);
  const tops = Object.values(topSets(ev.workouts, mains));
  const runs = ev.runs;
  const runKm = runs.reduce((s, r) => s + r.distance_km, 0);
  const runMin = runs.reduce((s, r) => s + r.duration_min, 0);
  const hrs = runs.map(r => r.hr).filter(Boolean);
  const notes = days.filter(d => snap.logs[d]?.note).map(d => [d, snap.logs[d].note]);

  return h('article.doc',
    header('Wochenbericht', `${kw(ws)} · ${weekRange(ws)}${ws.slice(0, 4)}`, ev.complete ? 'abgeschlossene Woche' : 'laufende Woche (Zwischenstand)', snap, ws),
    ev.exception ? h('div.doc-flag', `Pausen-Woche (${EXCEPTION_REASONS.find(r => r.id === ev.exception.reason)?.label}): ${ev.exception.mode === 'pause' ? 'Ziele ausgesetzt' : `Ziele auf ${Math.round(ev.exception.factor * 100)} %`}${ev.exception.note ? ` – ${ev.exception.note}` : ''}`) : null,

    sec(1, 'Ringe & Ziel-Check der Woche',
      h('div.doc-rings',
        activityRings(RINGS.filter(r => ev.rings[r.id].active).map(r => ({ id: r.id, progress: ev.rings[r.id].progress, paused: ev.rings[r.id].paused })), { size: 150, animate: false }),
        h('div.doc-rings-side',
          h('div.doc-score', h('b', `${wc.hit} von ${wc.total}`), ' Wochenzielen erreicht'),
          RINGS.filter(r => ev.rings[r.id].active).map(r => h('div.doc-ring-row', h('i', { style: { background: `var(--${r.id})` } }), h('span', r.label), h('b', ev.rings[r.id].paused ? 'Pause' : `${num(ev.rings[r.id].value, 1)} / ${ev.rings[r.id].goal}`))))),
      checkTable(wc)),

    sec(2, 'Gewicht',
      h('div.doc-kvs',
        kv('Ø Woche', avg != null ? `${fixed(avg, 1)} kg` : '–'),
        kv('Vorwoche', prevAvg != null ? `${fixed(prevAvg, 1)} kg` : '–'),
        kv('Veränderung', avg != null && prevAvg != null ? `${signed(avg - prevAvg, 2)} kg` : '–', avg != null && prevAvg ? `${signed(((avg - prevAvg) / prevAvg) * 100, 2)} %` : null),
        kv('Wiegungen', `${ev.rings.weigh.value} / 7`)),
      table(['', ...days.map(d => `${wdShort(d)} ${dateDM(d)}`)], [
        ['Gewicht', ...series.map(p => (p.weight != null ? fixed(p.weight, 1) : '–'))],
        ['Ø 7 Tage', ...series.map(p => (p.avg != null ? fixed(p.avg, 1) : '–'))],
      ], 'doc-days'),
      weightChart(weightSeries(snap, addDays(ws, -7), addDays(ws, 6)))),

    sec(3, 'Ernährung',
      h('div.doc-kvs',
        ...[['kcal', 'kcal', ''], ['protein', 'Protein', ' g'], ['carbs', 'KH', ' g'], ['fat', 'Fett', ' g']].map(([k, l, u]) => {
          const a = avgOf(snap, days, k);
          return kv(`Ø ${l}`, a != null ? `${num(a)}${u}` : '–', c[k] ? `Ziel ${num(c[k])}${u}${a != null ? ` (${signed(a - c[k], 0)})` : ''}` : 'kein Ziel');
        }),
        kv('Tage', `${cnt('green')} grün · ${cnt('yellow')} gelb`, `${cnt('red')} rot · ${cnt('none')} fehlt`)),
      table(['', ...days.map(d => `${wdShort(d)} ${dateDM(d)}`)], [
        ['kcal', ...days.map(d => num(snap.logs[d]?.kcal))],
        ['Protein', ...days.map(d => num(snap.logs[d]?.protein))],
        ['KH', ...days.map(d => num(snap.logs[d]?.carbs))],
        ['Fett', ...days.map(d => num(snap.logs[d]?.fat))],
        ['Status', ...nutr.map(d => stateDot({ green: 'ok', yellow: 'near', red: 'miss', none: 'open' }[d.status], 11))],
      ], 'doc-days')),

    sec(4, 'Gym',
      h('div.doc-kvs',
        kv('Sessions', `${ev.rings.gym.value} / ${ev.rings.gym.goal}`, `${ev.workouts.length} Workouts gesamt`),
        kv('Gesamtvolumen', `${num(ev.tonnage)} kg`),
        kv('Arbeitssätze', num(ev.rings.gym.items.reduce((s, i) => s + i.sets, 0))),
        kv('Ø Dauer', ev.workouts.length ? duration(ev.workouts.reduce((s, w) => s + w.duration_min, 0) / ev.workouts.length) : '–')),
      h('h3.doc-h3', 'Sätze pro Muskelgruppe vs. Zielspanne'),
      rangeBars(wc.muscles.map(m => ({ key: m.key, label: m.label, value: m.actual, min: m.min, max: m.max, state: m.state }))),
      tops.length ? [h('h3.doc-h3', 'Top-Sätze der Hauptübungen'), table(['Übung', 'Bester Satz', 'e1RM', 'Tag'], tops.map(t => [snap.templates[t.template_id]?.title || t.title, `${num(t.weight_kg, 2)} kg × ${t.reps}`, `${num(t.e1rm, 1)} kg`, dateShort(t.date)]))] : null,
      table(['Workout', 'Tag', 'Dauer', 'Sätze', 'Zählt'], ev.rings.gym.items.map(i => [i.workout.title, dateShort(i.workout.date), duration(i.workout.duration_min), String(i.sets), i.counted ? 'ja' : `nein (${i.reasons.join(', ')})`]))),

    sec(5, 'Laufen',
      h('div.doc-kvs',
        kv('Läufe', `${ev.rings.run.value} / ${ev.rings.run.goal}`, `${runs.length} gesamt`),
        kv('Distanz', `${num(runKm, 1)} km`),
        kv('Dauer', duration(runMin)),
        kv('Ø Pace', pace(runMin, runKm)),
        kv('Ø HF', hrs.length ? `${num(hrs.reduce((a, b) => a + b, 0) / hrs.length)} bpm` : '–')),
      runs.length ? table(['Lauf', 'Tag', 'Distanz', 'Dauer', 'Pace', 'HF'], runs.map(r => [r.name || 'Lauf', dateShort(r.date), `${num(r.distance_km, 2)} km`, duration(r.duration_min), pace(r.duration_min, r.distance_km), r.hr ? `${num(r.hr)}` : '–'])) : h('p.doc-muted', 'Keine Läufe.')),

    sec(6, 'Schlaf · Energie · Hunger (1–5)',
      table(['', ...days.map(d => wdShort(d)), 'Ø'], [['sleep', 'Schlaf'], ['energy', 'Energie'], ['hunger', 'Hunger']].map(([k, l]) =>
        [l, ...days.map(d => snap.logs[d]?.[k] ?? '–'), num(avgOf(snap, days, k), 1)]), 'doc-days')),

    sec(7, 'Notizen der Woche',
      notes.length || extraNote
        ? h('ul.doc-notes', notes.map(([d, n]) => h('li', h('b', `${wdShort(d)} ${dateDM(d)}: `), n)), extraNote ? h('li', h('b', 'Anmerkung: '), extraNote) : null)
        : h('p.doc-muted', 'Keine Notizen.')));
}

// ---------- Zweiwochenbericht ----------

export function biweeklyReport(snap, wsB, { questions } = {}) {
  const now = today();
  const wsA = addDays(wsB, -7);
  const A = evaluateWeek(snap, wsA, now), B = evaluateWeek(snap, wsB, now);
  const cA = weekChecks(A), cB = weekChecks(B);
  const daysA = weekDays(wsA), daysB = weekDays(wsB), all = [...daysA, ...daysB];
  const series = weightSeries(snap, wsA, addDays(wsB, 6));
  const firstAvg = series.find(p => p.avg != null)?.avg;
  const lastAvg = [...series].reverse().find(p => p.avg != null)?.avg;
  const mains = Object.values(snap.mappings).filter(m => m.main).map(m => m.template_id);
  const tA = topSets(A.workouts, mains), tB = topSets(B.workouts, mains);
  const nutr = [...A.rings.nutrition.days, ...B.rings.nutrition.days];
  const green = nutr.filter(d => d.status === 'green').length, yellow = nutr.filter(d => d.status === 'yellow').length;
  const logged = nutr.filter(d => d.status !== 'none').length;
  const c = coachAt(snap, now);
  const r = ringsAt(snap, now);
  const runKm = ev => ev.runs.reduce((s, x) => s + x.distance_km, 0);
  const cmp = (label, a, b, fmt = v => num(v, 1), better = 'up', dec = null) => {
    const d = a != null && b != null ? b - a : null;
    const cls = d == null || d === 0 ? '' : (d > 0) === (better === 'up') ? 'doc-up' : better === 'none' ? '' : 'doc-down';
    const places = dec ?? (Number.isInteger(a) && Number.isInteger(b) ? 0 : 1);
    return [label, fmt(a), fmt(b), d == null ? '–' : h(`span.${cls || 'doc-flat'}`, signed(d, places))];
  };

  return h('article.doc',
    header('Zweiwochenbericht', `${kw(wsA)} + ${kw(wsB)} · ${dateDM(wsA)} – ${dateDM(addDays(wsB, 6))}${wsB.slice(0, 4)}`, 'Woche A vs. Woche B', snap, wsB),

    sec(1, 'Woche A vs. Woche B',
      h('div.doc-two',
        [[A, cA, 'A'], [B, cB, 'B']].map(([ev, wc, l]) => h('div.doc-two-col',
          h('div.doc-two-head', `Woche ${l} · ${kw(ev.ws)}`),
          activityRings(RINGS.filter(x => ev.rings[x.id].active).map(x => ({ id: x.id, progress: ev.rings[x.id].progress, paused: ev.rings[x.id].paused })), { size: 110, animate: false }),
          h('div.doc-score', h('b', `${wc.hit} von ${wc.total}`), ' Zielen')))),
      table(['', `A · ${kw(wsA)}`, `B · ${kw(wsB)}`, 'Δ'], [
        cmp('Wochenziele erreicht', cA.hit, cB.hit, v => String(v)),
        cmp('Gym-Sessions', A.rings.gym.value, B.rings.gym.value, v => String(v)),
        cmp('Läufe', A.rings.run.value, B.rings.run.value, v => String(v)),
        cmp('Lauf-km', runKm(A), runKm(B)),
        cmp('Grüne Ernährungstage', A.rings.nutrition.value, B.rings.nutrition.value),
        cmp('Wiegungen', A.rings.weigh.value, B.rings.weigh.value, v => String(v)),
        cmp('Ø Gewicht (kg)', weekWeight(snap, wsA), weekWeight(snap, wsB), v => fixed(v, 1), 'none'),
        cmp('Ø kcal', avgOf(snap, daysA, 'kcal'), avgOf(snap, daysB, 'kcal'), v => num(v), 'none', 0),
        cmp('Ø Protein (g)', avgOf(snap, daysA, 'protein'), avgOf(snap, daysB, 'protein'), v => num(v), 'up', 0),
        cmp('Volumen (t)', A.tonnage / 1000, B.tonnage / 1000),
        cmp('Ø Schlaf', avgOf(snap, daysA, 'sleep'), avgOf(snap, daysB, 'sleep')),
        cmp('Ø Energie', avgOf(snap, daysA, 'energy'), avgOf(snap, daysB, 'energy')),
      ], 'doc-cmp')),

    sec(2, 'Gewichtsveränderung über 14 Tage',
      h('div.doc-kvs',
        kv('Start (Ø 7 T.)', firstAvg != null ? `${fixed(firstAvg, 1)} kg` : '–'),
        kv('Ende (Ø 7 T.)', lastAvg != null ? `${fixed(lastAvg, 1)} kg` : '–'),
        kv('Veränderung', firstAvg != null && lastAvg != null ? `${signed(lastAvg - firstAvg, 2)} kg` : '–'),
        kv('in %', firstAvg && lastAvg ? `${signed(((lastAvg - firstAvg) / firstAvg) * 100, 2)} %` : '–')),
      weightChart(series)),

    sec(3, 'Kraftentwicklung (geschätztes 1RM)',
      mains.length
        ? table(['Übung', `A · ${kw(wsA)}`, `B · ${kw(wsB)}`, 'Δ'], mains.map(id => {
          const a = tA[id], b = tB[id];
          return cmp(snap.templates[id]?.title || snap.mappings[id]?.title || id, a?.e1rm ?? null, b?.e1rm ?? null, v => (v == null ? '–' : `${num(v, 1)} kg`));
        }), 'doc-cmp')
        : h('p.doc-muted', 'Keine Hauptübungen markiert.')),

    sec(4, 'Volumen pro Muskelgruppe',
      table(['Muskel', 'Ziel', `A · ${kw(wsA)}`, `B · ${kw(wsB)}`], MUSCLES.map(m => {
        const ma = cA.muscles.find(x => x.key === m.id), mb = cB.muscles.find(x => x.key === m.id);
        return [m.label, ma ? `${ma.min}–${ma.max}` : '–',
          h('span.doc-cell', stateDot(ma?.state || 'off', 10), num(ma?.actual ?? 0, 1)),
          h('span.doc-cell', stateDot(mb?.state || 'off', 10), num(mb?.actual ?? 0, 1))];
      }), 'doc-cmp')),

    sec(5, 'Ernährungs-Adhärenz über 14 Tage',
      h('div.doc-strip', nutr.map((d, i) => h('div.doc-strip-cell', h('span', { class: `doc-st-${d.status}` }), h('small', wdShort(all[i]).slice(0, 2))))),
      h('div.doc-kvs',
        kv('Grüne Tage', `${green} / 14`),
        kv('Gelbe Tage', `${yellow} / 14`),
        kv('Eingetragen', `${logged} / 14`),
        kv('Adhärenz', `${Math.round(((green + yellow * 0.5) / 14) * 100)} %`, 'grün = 1, gelb = ½'))),

    sec(6, 'Aktuell gültige Coach-Ziele',
      h('div.doc-kvs',
        kv('Phase', phaseText(snap, now)),
        kv('kcal', c.kcal ? `${num(c.kcal)} ± ${c.kcal_tol}` : '–', `gelb bis ± ${c.kcal_tol_yellow}`),
        kv('Protein', c.protein ? `${c.protein} g` : '–'),
        kv('KH / Fett', `${c.carbs ?? '–'} / ${c.fat ?? '–'} g`, c.check_macros ? 'wird geprüft' : 'nicht geprüft'),
        kv('Wochenziele', `Gym ${c.gym_goal} · Lauf ${c.run_goal}`, `Grün ${c.nutrition_goal} · Waage ${c.weigh_goal}`),
        kv('Gym-Regel', `≥ ${r.gym.min_duration} min, ≥ ${r.gym.min_sets} Sätze`)),
      c.note ? h('p.doc-muted', `Notiz zur Version: ${c.note}`) : null),

    sec(7, 'Fragen an den Coach',
      questions ? h('div.doc-questions', questions) : h('div.doc-questions.doc-empty', 'Keine Fragen eingetragen.')));
}
