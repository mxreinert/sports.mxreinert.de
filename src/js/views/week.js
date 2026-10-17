// Woche: Ringe, Ziel-Check der Woche, Tage, Sätze pro Muskelgruppe, Trainings, Pausen-Woche.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { btn, card, cardHead, largeTitle, sheet, seg, numField, textField, toast, confirmSheet, stateDot, group, row } from '../ui/kit.js';
import { rangeBars } from '../ui/charts.js';
import { evaluateWeek, weekChecks, dayChecks, weekOf, weekWeight, avgOf } from '../lib/engine.js';
import { addDays, weekDays } from '../lib/dates.js';
import { dateLong, dateMedium, duration, num, fixed, signed, pace, kw, weekRange } from '../lib/format.js';
import { EXCEPTION_REASONS, RINGS } from '../config.js';
import * as db from '../store/db.js';
import { ringsBlock, checkList, scoreBar, weekNav, dayStrip, muscleRows, NUT_KIND, NUT_LABEL, pill, infoNote } from './common.js';
import { openCheckin, openWeight } from './checkin.js';
import { openWorkout, openRun } from './training-sheets.js';

export function renderWeek(root, { snap, now, go, params }) {
  const ws = weekOf(snap, /^\d{4}-\d{2}-\d{2}$/.test(params[0] || '') ? params[0] : now);
  const ev = evaluateWeek(snap, ws, now);
  const wc = weekChecks(ev);
  const prev = evaluateWeek(snap, addDays(ws, -7), now);
  const isCurrent = ev.current;

  root.append(largeTitle('Woche', { sub: isCurrent ? 'Laufende Woche' : ev.complete ? 'Abgeschlossen' : 'Kommende Woche' }));
  root.append(weekNav(ws, {
    onPrev: () => go(`#/woche/${addDays(ws, -7)}`, { replace: true }),
    onNext: () => go(`#/woche/${addDays(ws, 7)}`, { replace: true }),
    onToday: () => go(`#/woche/${weekOf(snap, now)}`, { replace: true }),
    isCurrent,
  }));

  if (ev.exception) {
    const ex = ev.exception;
    root.append(h('button.banner.banner-pause', { type: 'button', onClick: () => openException(ws, ex) },
      h('span.banner-ic', icon('pause', 18)),
      h('div', h('b', `Pausen-Woche · ${EXCEPTION_REASONS.find(r => r.id === ex.reason)?.label || 'Pause'}`),
        h('div', `${ex.mode === 'pause' ? 'Ziele ausgesetzt' : `Ziele auf ${Math.round((ex.factor ?? 0.5) * 100)} %`} · ${ex.rings?.length ? ex.rings.map(r => RINGS.find(x => x.id === r)?.label).join(', ') : 'alle Ringe'}${ex.note ? ` · ${ex.note}` : ''}`)),
      icon('chevR', 18)));
  }

  root.append(card(ringsBlock(ev, { size: 196 }), scoreBar(wc.hit, wc.total)));

  // Tage
  root.append(card(cardHead('Tage', { sub: 'Tippen für Details und Nachtragen' }),
    dayStrip(ev, snap, now, d => openDay(snap, d, now)),
    h('div.days-legend',
      h('span', h('i.dot.on', { style: { '--c': 'var(--gym)' } }), 'Gym'),
      h('span', h('i.dot.on', { style: { '--c': 'var(--run)' } }), 'Lauf'),
      h('span', h('i.dot.n-green', { style: { '--c': 'var(--nutrition)' } }), 'Ernährung'),
      h('span', h('i.dot.on', { style: { '--c': 'var(--weigh)' } }), 'Gewogen'))));

  // Ziel-Check der Woche
  root.append(card(cardHead('Ziel-Check der Woche', { iconName: 'target' }), checkList(wc.items)));

  // Volumen
  root.append(card(
    cardHead('Sätze pro Muskelgruppe', { iconName: 'muscle', color: 'var(--gym)', sub: `${num(ev.tonnage)} kg Gesamtvolumen · grau = Vorwoche` }),
    rangeBars(muscleRows(ev, wc), { compare: prev.muscles.sets }),
    h('div.rbar-legend', h('span', h('i.band'), 'Zielspanne'), h('span', h('i', { style: { background: 'var(--ok)' } }), 'im Ziel'), h('span', h('i', { style: { background: 'var(--near)' } }), 'viel Volumen'), h('span', h('i', { style: { background: 'var(--miss)' } }), 'zu wenig')),
    ev.muscles.unmapped.length ? h('button.note.note-warn', { type: 'button', onClick: () => go('#/einstellungen/uebungen') },
      icon('info', 17), h('div', `${ev.muscles.unmapped.length} Übung(en) ohne Muskelgruppe: ${ev.muscles.unmapped.map(u => u.title).join(', ')} – jetzt zuordnen`), icon('chevR', 16)) : null));

  // Woche in Zahlen
  const w = weekWeight(snap, ws), pw = weekWeight(snap, addDays(ws, -7));
  const days = weekDays(ws);
  root.append(card(cardHead('Woche in Zahlen', { iconName: 'chart' }),
    h('div.stats',
      stat('Ø Gewicht', w != null ? `${fixed(w, 1)} kg` : '–', w != null && pw != null ? `${signed(w - pw, 1)} kg` : null),
      stat('Ø kcal', num(avgOf(snap, days, 'kcal')), ev.coach.kcal ? `Ziel ${num(ev.coach.kcal)}` : null),
      stat('Ø Protein', avgOf(snap, days, 'protein') != null ? `${num(avgOf(snap, days, 'protein'))} g` : '–', ev.coach.protein ? `Ziel ${ev.coach.protein} g` : null),
      stat('Volumen', `${num(ev.tonnage / 1000, 1)} t`, `${ev.workouts.length} Workouts`),
      stat('Laufen', `${num(ev.runs.reduce((s, r) => s + r.distance_km, 0), 1)} km`, `${ev.runs.length} Läufe`),
      stat('Ø Schlaf', avgOf(snap, days, 'sleep') != null ? `${num(avgOf(snap, days, 'sleep'), 1)} / 5` : '–'))));

  // Trainings
  const gymRows = ev.rings.gym.items.map(i => row({
    iconName: 'dumbbell', color: 'var(--gym)', title: i.workout.title,
    sub: `${dateMedium(i.workout.date)} · ${duration(i.workout.duration_min)} · ${i.sets} Arbeitssätze${i.reasons.length ? ` · zählt nicht: ${i.reasons.join(', ')}` : ''}`,
    right: stateDot(i.counted ? 'ok' : 'miss'), chevron: true, onClick: () => openWorkout(i.workout),
  }));
  const runRows = ev.rings.run.items.map(i => row({
    iconName: 'run', color: 'var(--run)', title: i.run.name || 'Lauf',
    sub: `${dateMedium(i.run.date)} · ${num(i.run.distance_km, 2)} km · ${duration(i.run.duration_min)} · ${pace(i.run.duration_min, i.run.distance_km)}${i.ok ? '' : ` · ${i.reasons[0]}`}`,
    right: stateDot(i.ok ? 'ok' : 'miss'), chevron: true, onClick: () => openRun(i.run),
  }));
  root.append(group(gymRows.length ? gymRows : [row({ title: h('span.muted', 'Keine Workouts in dieser Woche') })], { header: 'Gym' }));
  root.append(group([...runRows, row({ iconName: 'plus', color: 'var(--surface-3)', title: h('span.accent', 'Lauf manuell eintragen'), onClick: () => openRun(null, { date: ev.current ? now : ws }) })], { header: 'Läufe', footer: 'Läufe kommen später automatisch von Strava. Manuell nur, falls die Uhr nicht synchronisiert.' }));

  // Pause
  if (!ev.exception) {
    root.append(h('div.center-action', btn('Woche als Pause markieren', { kind: 'gray', iconName: 'pause', onClick: () => openException(ws, null) })));
  }
}

const stat = (label, value, sub) => h('div.stat', h('div.stat-label', label), h('div.stat-val', value), sub ? h('div.stat-sub', sub) : null);

function openDay(snap, date, now) {
  const dc = dayChecks(snap, date, now);
  const log = snap.logs[date] || {};
  const future = date > now;
  const s = sheet({
    title: dateLong(date),
    body: h('div',
      h('div.sheet-sub', pill(NUT_LABEL[dc.nutrition], NUT_KIND[dc.nutrition])),
      checkList(dc.items),
      log.note ? infoNote(log.note, 'note') : null,
      (log.sleep || log.energy || log.hunger) ? h('div.chips', log.sleep ? h('span.chip', `Schlaf ${log.sleep}/5`) : null, log.energy ? h('span.chip', `Energie ${log.energy}/5`) : null, log.hunger ? h('span.chip', `Hunger ${log.hunger}/5`) : null) : null),
    footer: future ? null : h('div.btn-row',
      btn('Gewicht', { kind: 'gray', iconName: 'scale', onClick: () => { s.close(); setTimeout(() => openWeight(date), 200); } }),
      btn(log.kcal != null ? 'Check-in bearbeiten' : 'Check-in nachtragen', { cls: 'grow', onClick: () => { s.close(); setTimeout(() => openCheckin(date), 200); } })),
  });
}

export function openException(ws, ex) {
  let mode = ex?.mode || 'reduce';
  let reason = ex?.reason || 'deload';
  const rings = new Set(ex?.rings?.length ? ex.rings : RINGS.map(r => r.id));
  const factor = numField({ label: 'Ziele reduzieren auf', unit: '%', value: Math.round((ex?.factor ?? 0.5) * 100), min: 10, max: 90 });
  const note = textField({ label: 'Notiz', value: ex?.note || '', placeholder: 'z. B. „Erkältung, Coach informiert“' });
  const factorWrap = h('div', factor.el);
  const syncMode = () => { factorWrap.hidden = mode !== 'reduce'; };
  syncMode();

  const save = async () => {
    if (mode === 'reduce' && !factor.validate()) { toast('Bitte 10–90 % eingeben', { kind: 'error' }); return; }
    if (!rings.size) { toast('Mindestens einen Ring wählen', { kind: 'error' }); return; }
    await db.saveException({ id: ex?.id, week: ws, reason, mode, factor: (factor.get() ?? 50) / 100, rings: rings.size === RINGS.length ? [] : [...rings], note: note.get() });
    s.close();
    toast('Pausen-Woche gespeichert');
  };
  const remove = async () => {
    if (!(await confirmSheet('Pausen-Woche aufheben? Die Woche wird wieder mit den normalen Zielen bewertet.', { title: 'Pause aufheben', ok: 'Aufheben', danger: true }))) return;
    await db.deleteException(ex.id);
    s.close();
  };

  const s = sheet({
    title: 'Pausen-Woche',
    body: h('div.form',
      h('div.sheet-sub', `${kw(ws)} · ${weekRange(ws)}`),
      h('div.field', h('span.field-label', 'Grund'), seg(EXCEPTION_REASONS.map(r => [r.id, r.label]), reason, v => { reason = v; }, { small: true })),
      h('div.field', h('span.field-label', 'Was passiert mit den Zielen?'), seg([['reduce', 'Reduzieren'], ['pause', 'Aussetzen']], mode, v => { mode = v; syncMode(); })),
      factorWrap,
      h('div.field', h('span.field-label', 'Betroffene Ringe'),
        h('div.day-picker', RINGS.map(r => {
          const b = h('button.day-chip.wide', { type: 'button', 'aria-pressed': String(rings.has(r.id)), style: { '--chip': `var(--${r.id})` }, onClick: () => { rings.has(r.id) ? rings.delete(r.id) : rings.add(r.id); b.setAttribute('aria-pressed', String(rings.has(r.id))); } }, r.label);
          return b;
        }))),
      note.el),
    footer: h('div.btn-row', ex ? btn('Aufheben', { kind: 'gray', onClick: remove }) : null, btn('Speichern', { cls: 'grow', onClick: save })),
  });
}
