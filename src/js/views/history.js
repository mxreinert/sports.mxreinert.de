// Verlauf: Gewicht, Ernährung, Kraft (e1RM), Volumen über Wochen, Trainingsliste.
import { h } from '../ui/h.js';
import { btn, card, cardHead, largeTitle, seg, group, row, empty } from '../ui/kit.js';
import { lineChart, columns, miniBars } from '../ui/charts.js';
import { evaluateWeek, weekChecks, weightSeries, weekOf, weekWeight, avgOf, coachAt } from '../lib/engine.js';
import { topSets, rangeState } from '../lib/training.js';
import { addDays, daysBetween } from '../lib/dates.js';
import { dateShort, dateMedium, dateDM, duration, num, fixed, signed, pace, kw, wdShort } from '../lib/format.js';
import { MUSCLES, PHASE } from '../config.js';
import { phaseStatus } from '../lib/phases.js';
import { openWorkout, openRun } from './training-sheets.js';

const TABS = [['gewicht', 'Gewicht'], ['ernaehrung', 'Essen'], ['kraft', 'Kraft'], ['volumen', 'Volumen'], ['training', 'Training']];
const state = { range: 90, listLimit: 40, scope: 'phase' };

export function renderHistory(root, ctx) {
  const tab = TABS.some(([id]) => id === ctx.params[0]) ? ctx.params[0] : 'gewicht';
  root.append(largeTitle('Verlauf'));
  root.append(h('div.sticky-seg', seg(TABS, tab, v => ctx.go(`#/verlauf/${v}`, { replace: true }))));
  const ph = currentPhase(ctx);
  if (ph) {
    root.append(h('div.scope-bar',
      seg([['phase', `${PHASE[ph.phase].label} seit ${dateShort(ph.start)}`], ['all', 'Alles']], state.scope, v => { state.scope = v; ctx.rerender(); }, { small: true })));
  }
  const start = scopeStart(ctx);
  if (start && start > ctx.now && tab !== 'training') {
    root.append(card(empty('history', 'Deine Phase startet am ' + dateShort(start), 'Ab dann füllt sich der Verlauf. Mit „Alles“ siehst du die Daten von vorher.')));
    return;
  }
  ({ gewicht, ernaehrung, kraft, volumen, training })[tab](root, ctx);
}

/** Laufende Phase (oder die nächste geplante) */
const currentPhase = ({ snap, now }) => { const st = phaseStatus(snap.phases, now); return st.phase || st.next || null; };

/** Ab wann der Verlauf zählt: Start der aktuellen Phase – oder null bei „Alles“ */
const scopeStart = ctx => (state.scope === 'phase' ? currentPhase(ctx)?.start ?? null : null);

/** Die letzten n Wochen, bei „Phase“ nur Wochen ab Phasenstart */
function lastWeeks(ctx, n) {
  const { snap, now } = ctx;
  const start = scopeStart(ctx);
  const weeks = Array.from({ length: n }, (_, i) => addDays(weekOf(snap, now), -7 * (n - 1 - i)));
  return start ? weeks.filter(w => addDays(w, 6) >= start) : weeks;
}

/** Erster Tag eines Tageszeitraums (nicht vor Phasenstart) */
const fromDay = (ctx, days) => { const from = addDays(ctx.now, -(days - 1)); const start = scopeStart(ctx); return start && start > from ? start : from; };

// ---------- Gewicht ----------

function gewicht(root, ctx) {
  const { snap, now, rerender } = ctx;
  const from = fromDay(ctx, state.range);
  const series = weightSeries(snap, from, now);
  const vals = series.filter(p => p.weight != null);
  const firstAvg = series.find(p => p.avg != null)?.avg ?? null;
  const lastAvg = [...series].reverse().find(p => p.avg != null)?.avg ?? null;
  const weeks = Math.max(1, daysBetween(from, now).length / 7);

  const head = h('div.scrub-head');
  const setHead = i => {
    const p = i == null ? null : series[i];
    head.replaceChildren(p
      ? h('div', h('div.big-num', p.weight != null ? fixed(p.weight, 1) : '–', h('small', ' kg')), h('div.muted', `${dateMedium(p.date)} · Ø ${p.avg != null ? fixed(p.avg, 1) : '–'} kg`))
      : h('div', h('div.big-num', lastAvg != null ? fixed(lastAvg, 1) : '–', h('small', ' kg')), h('div.muted', 'aktueller 7-Tage-Schnitt')));
  };
  setHead(null);

  root.append(card(
    h('div.card-toolbar', seg([[30, '30 T'], [90, '90 T'], [180, '6 M'], [365, '1 J']], state.range, v => { state.range = v; rerender(); }, { small: true })),
    head,
    vals.length ? lineChart({
      height: 210, labels: series.map(p => dateShort(p.date)), onScrub: setHead,
      series: [
        { values: series.map(p => p.weight), kind: 'dots', color: 'var(--weigh)' },
        { values: series.map(p => p.avg), kind: 'area', color: 'var(--weigh)', endDot: true },
      ],
    }) : empty('scale', 'Noch keine Wiegungen', 'Trag morgens dein Gewicht ein – der Verlauf erscheint hier.'),
    h('div.stats',
      h('div.stat', h('div.stat-label', 'Veränderung'), h('div.stat-val', firstAvg != null && lastAvg != null ? `${signed(lastAvg - firstAvg, 1)} kg` : '–'), h('div.stat-sub', `im Zeitraum (Ø)`)),
      h('div.stat', h('div.stat-label', 'pro Woche'), h('div.stat-val', firstAvg != null && lastAvg != null ? `${signed((lastAvg - firstAvg) / weeks, 2)} kg` : '–'), h('div.stat-sub', firstAvg && lastAvg ? `${signed(((lastAvg - firstAvg) / firstAvg / weeks) * 100, 2)} %` : null)),
      h('div.stat', h('div.stat-label', 'Wiegungen'), h('div.stat-val', String(vals.length)), h('div.stat-sub', `von ${daysBetween(from, now).length} Tagen`))),
    h('p.footnote', 'Reine Info für den Coach – der Wiege-Ring bewertet nur, ob du einträgst, nicht was die Waage zeigt.')));

  const ws = lastWeeks(ctx, 8).reverse();
  root.append(group(ws.map((w, i) => {
    const avg = weekWeight(snap, w);
    const prev = weekWeight(snap, addDays(w, -7));
    return row({ title: `${kw(w)}`, sub: `${dateDM(w)} – ${dateDM(addDays(w, 6))}`, value: h('span', avg != null ? `${fixed(avg, 1)} kg` : '–', avg != null && prev != null ? h('small.delta', ` ${signed(avg - prev, 1)}`) : null) });
  }), { header: 'Wochenschnitt' }));
}

// ---------- Ernährung ----------

function ernaehrung(root, ctx) {
  const { snap, now } = ctx;
  const weeks = lastWeeks(ctx, 8);
  const evs = weeks.map(w => evaluateWeek(snap, w, now));
  const goal = evs[evs.length - 1].rings.nutrition.goal || coachAt(snap, now).nutrition_goal;
  root.append(card(cardHead('Ernährungstage pro Woche', { iconName: 'food', color: 'var(--nutrition)', sub: 'grün = 1 Punkt, gelb = ½ Punkt' }),
    columns(evs.map(ev => ({ label: kw(ev.ws).replace('KW ', ''), value: ev.rings.nutrition.value, color: ev.rings.nutrition.done ? 'var(--nutrition)' : 'color-mix(in srgb, var(--nutrition) 45%, transparent)' })), { goal, max: 7 })));

  // Verteilung 28 Tage
  const days = daysBetween(fromDay(ctx, 28), now);
  const dist = { green: 0, yellow: 0, red: 0, none: 0 };
  for (const ev of evs) for (const d of ev.rings.nutrition.days) if (d.date >= days[0] && d.date <= now) dist[d.status]++;
  const total = days.length;
  root.append(card(cardHead(days.length < 28 ? `Seit ${dateShort(days[0])}` : 'Letzte 28 Tage'),
    h('div.dist', [['green', 'var(--ok)', 'Grün'], ['yellow', 'var(--near)', 'Gelb'], ['red', 'var(--miss)', 'Rot'], ['none', 'var(--surface-3)', 'Fehlt']].map(([k, c]) =>
      dist[k] ? h('span', { style: { flex: dist[k], background: c }, title: `${dist[k]} Tage` }) : null)),
    h('div.dist-legend', [['green', 'var(--ok)', 'Grün'], ['yellow', 'var(--near)', 'Gelb'], ['red', 'var(--miss)', 'Rot'], ['none', 'var(--surface-3)', 'nicht eingetragen']].map(([k, c, l]) =>
      h('span', h('i', { style: { background: c } }), `${l} ${dist[k]}`))),
    h('div.stats',
      ...[['kcal', 'kcal', ''], ['protein', 'Protein', ' g'], ['carbs', 'KH', ' g'], ['fat', 'Fett', ' g']].map(([k, l, u]) => {
        const avg = avgOf(snap, days, k);
        const t = coachAt(snap, now)[k];
        return h('div.stat', h('div.stat-label', `Ø ${l}`), h('div.stat-val', avg != null ? `${num(avg)}${u}` : '–'), h('div.stat-sub', t ? `Ziel ${num(t)}${u}` : null));
      }))));

  // Befinden 14 Tage
  const d14 = daysBetween(addDays(now, -13), now);
  root.append(card(cardHead('Befinden · 14 Tage', { iconName: 'moon', color: '#5e5ce6' }),
    ...[['sleep', 'Schlaf', '#5e5ce6'], ['energy', 'Energie', '#ffd60a'], ['hunger', 'Hunger', '#ff9f0a']].map(([k, l, c]) =>
      h('div.feel', h('div.feel-head', h('span', l), h('span.muted', `Ø ${num(avgOf(snap, d14, k), 1)}`)), miniBars(d14.map(d => snap.logs[d]?.[k] ?? null), { color: c, labels: d14.map(d => wdShort(d).slice(0, 1)) })))));
}

// ---------- Kraft ----------

function kraft(root, ctx) {
  const { snap, go } = ctx;
  const mains = Object.values(snap.mappings).filter(m => m.main);
  if (!mains.length) {
    root.append(card(empty('dumbbell', 'Keine Hauptübungen markiert', 'Markiere in der Übungs-Zuordnung deine Hauptübungen (z. B. Bankdrücken, Kniebeuge). Dann siehst du hier dein geschätztes 1RM.',
      btn('Zur Übungs-Zuordnung', { onClick: () => go('#/einstellungen/uebungen') }))));
    return;
  }
  const weeks = lastWeeks(ctx, 12);
  const colors = ['var(--gym)', 'var(--run)', 'var(--nutrition)', 'var(--weigh)', '#bf5af2', '#ff375f'];
  for (const [idx, m] of mains.entries()) {
    const per = weeks.map(w => {
      const ws = snap.workouts.filter(x => x.date >= w && x.date <= addDays(w, 6));
      return topSets(ws, [m.template_id])[m.template_id] || null;
    });
    const vals = per.map(p => p?.e1rm ?? null);
    const known = vals.filter(v => v != null);
    const first = known[0], last = known[known.length - 1];
    const best = per.filter(Boolean).sort((a, b) => b.e1rm - a.e1rm)[0];
    const title = snap.templates[m.template_id]?.title || m.title || m.template_id;
    root.append(card(
      cardHead(title, { sub: best ? `Bester Satz: ${num(best.weight_kg, 2)} kg × ${best.reps} (${dateShort(best.date)})` : 'Noch keine Sätze' }),
      h('div.kpi', h('div.big-num', last != null ? num(last, 1) : '–', h('small', ' kg e1RM')), first != null && last != null && known.length > 1 ? h(`span.delta-chip${last >= first ? '.up' : '.down'}`, `${signed(last - first, 1)} kg / 12 Wo.`) : null),
      known.length ? lineChart({ height: 130, labels: weeks.map(w => kw(w).replace('KW ', 'KW')), series: [{ values: vals, kind: 'area', color: colors[idx % colors.length], endDot: true }] }) : null));
  }
  root.append(h('p.footnote.pad', 'Geschätztes 1RM nach Epley aus dem besten Arbeitssatz der Woche (bis 12 Wdh.).'));
}

// ---------- Volumen ----------

function volumen(root, ctx) {
  const { snap, now } = ctx;
  const weeks = lastWeeks(ctx, 8);
  const evs = weeks.map(w => evaluateWeek(snap, w, now));
  root.append(card(cardHead('Sätze pro Muskelgruppe', { iconName: 'muscle', color: 'var(--gym)', sub: '8 Wochen · Farbe = Zielspanne' }),
    h('div.heat-scroll', h('table.heat',
      h('thead', h('tr', h('th', ''), evs.map(ev => h('th', kw(ev.ws).replace('KW ', ''))))),
      h('tbody', MUSCLES.map(m => h('tr', h('th', m.label), evs.map(ev => {
        const v = ev.muscles.sets[m.id] || 0;
        const t = ev.muscles.targets[m.id];
        const st = ev.muscles.paused ? 'paused' : t ? rangeState(v, t, { open: !ev.complete }) : 'off';
        return h(`td.hc-${st}`, { title: t ? `${num(v, 1)} / ${t[0]}–${t[1]}` : num(v, 1) }, num(v, 1));
      })))))),
    h('div.rbar-legend', h('span', h('i', { style: { background: 'var(--ok)' } }), 'im Ziel'), h('span', h('i', { style: { background: 'var(--near)' } }), 'über Max'), h('span', h('i', { style: { background: 'var(--miss)' } }), 'unter Min'), h('span', h('i', { style: { background: 'var(--surface-3)' } }), 'läuft / Pause'))));

  root.append(card(cardHead('Gesamtvolumen pro Woche', { sub: 'kg × Wdh. der Arbeitssätze' }),
    columns(evs.map(ev => ({ label: kw(ev.ws).replace('KW ', ''), value: ev.tonnage / 1000, text: `${num(ev.tonnage / 1000, 1)} t`, color: ev.exception ? 'var(--surface-3)' : 'var(--gym)' })))));

  const chk = evs.map(ev => weekChecks(ev));
  root.append(card(cardHead('Wochenziele erreicht'),
    columns(chk.map((c, i) => ({ label: kw(evs[i].ws).replace('KW ', ''), value: c.hit, text: `${c.hit}/${c.total}`, color: c.hit === c.total ? 'var(--ok)' : 'var(--accent)' })), { max: Math.max(...chk.map(c => c.total)) })));
}

// ---------- Training ----------

function training(root, ctx) {
  const { snap, now, rerender } = ctx;
  const start = scopeStart(ctx);
  const inScope = d => !start || start > now || d >= start;
  const items = [
    ...snap.workouts.map(w => ({ date: w.date, sort: w.start, kind: 'gym', w })),
    ...snap.runs.map(r => ({ date: r.date, sort: r.start || `${r.date}T12`, kind: 'run', r })),
  ].filter(it => inScope(it.date)).sort((a, b) => b.sort.localeCompare(a.sort));
  root.append(h('div.center-action', btn('Lauf eintragen', { kind: 'tinted', iconName: 'plus', onClick: () => openRun(null) })));
  if (!items.length) { root.append(card(empty('dumbbell', 'Noch keine Trainings', 'Workouts kommen von Hevy, Läufe von Strava – sobald die App online ist.'))); return; }
  const shown = items.slice(0, state.listLimit);
  const byWeek = new Map();
  for (const it of shown) {
    const k = weekOf(snap, it.date);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(it);
  }
  for (const [w, list] of byWeek) {
    root.append(group(list.map(it => it.kind === 'gym'
      ? row({ iconName: 'dumbbell', color: 'var(--gym)', title: it.w.title, sub: `${dateMedium(it.date)} · ${duration(it.w.duration_min)} · ${it.w.exercises.length} Übungen`, chevron: true, onClick: () => openWorkout(it.w) })
      : row({ iconName: 'run', color: 'var(--run)', title: it.r.name || 'Lauf', sub: `${dateMedium(it.date)} · ${num(it.r.distance_km, 2)} km · ${pace(it.r.duration_min, it.r.distance_km)}${it.r.source === 'manual' ? ' · manuell' : ''}`, chevron: true, onClick: () => openRun(it.r) })),
    { header: `${kw(w)} · ${dateDM(w)} – ${dateDM(addDays(w, 6))}` }));
  }
  if (items.length > shown.length) root.append(h('div.center-action', btn('Mehr anzeigen', { kind: 'gray', onClick: () => { state.listLimit += 40; rerender(); } })));
}
