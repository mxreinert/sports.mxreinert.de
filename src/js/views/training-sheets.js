// Detail-Sheets für Workouts (Hevy) und Läufe (Strava / manuell).
import { h } from '../ui/h.js';
import { btn, sheet, numField, dateField, textField, toast, confirmSheet, chip } from '../ui/kit.js';
import { snap } from '../store/db.js';
import * as db from '../store/db.js';
import { isWorkingSet, musclesOf, e1rm } from '../lib/training.js';
import { lookupOf, qualifyWorkout, ringsAt, qualifyRun } from '../lib/engine.js';
import { dateLong, duration, num, pace } from '../lib/format.js';
import { today } from '../lib/dates.js';
import { MUSCLE_LABEL } from '../config.js';

const SET_TYPE = { warmup: 'W', normal: '', failure: 'F', dropset: 'D' };

export function openWorkout(w) {
  const q = qualifyWorkout(w, ringsAt(snap, w.date).gym);
  const lookup = lookupOf(snap);
  sheet({
    title: w.title,
    body: h('div',
      h('div.sheet-sub', `${dateLong(w.date)} · ${duration(w.duration_min)} · ${q.sets} Arbeitssätze`),
      h('div.chips',
        q.ok ? chip('zählt für den Gym-Ring', { color: 'var(--ok)' }) : chip(`zählt nicht: ${q.reasons.join(', ')}`, { color: 'var(--miss)' }),
        chip(w.source === 'hevy' ? 'aus Hevy' : 'manuell')),
      w.exercises.map(e => {
        const m = musclesOf(e.template_id, lookup);
        return h('div.ex',
          h('div.ex-head', h('b', e.title),
            h('span.muted', m.primary ? [MUSCLE_LABEL[m.primary], ...m.secondary.map(g => `${MUSCLE_LABEL[g]} ½`)].join(' · ') : 'Muskelgruppe fehlt')),
          h('div.ex-sets', e.sets.map((s, i) => h(`div.set${isWorkingSet(s) ? '' : '.set-warm'}`,
            h('span.set-n', SET_TYPE[s.type] || String(i + 1)),
            h('span', s.weight_kg ? `${num(s.weight_kg, 2)} kg × ${s.reps ?? '–'}` : `${s.reps ?? '–'} Wdh.`),
            h('span.set-meta', [s.rpe ? `RPE ${num(s.rpe, 1)}` : null, e1rm(s.weight_kg, s.reps) && isWorkingSet(s) ? `1RM ≈ ${num(e1rm(s.weight_kg, s.reps), 1)}` : null].filter(Boolean).join(' · '))))));
      })),
  });
}

export function openRun(run, { date } = {}) {
  const editable = !run || run.source === 'manual';
  if (run && !editable) {
    const q = qualifyRun(run, ringsAt(snap, run.date).run);
    sheet({
      title: run.name || 'Lauf',
      body: h('div',
        h('div.sheet-sub', `${dateLong(run.date)} · von Strava`),
        h('div.chips', q.ok ? chip('zählt für den Lauf-Ring', { color: 'var(--ok)' }) : chip(`zählt nicht: ${q.reasons[0]}`, { color: 'var(--miss)' })),
        h('div.stats',
          h('div.stat', h('div.stat-label', 'Distanz'), h('div.stat-val', `${num(run.distance_km, 2)} km`)),
          h('div.stat', h('div.stat-label', 'Dauer'), h('div.stat-val', duration(run.duration_min))),
          h('div.stat', h('div.stat-label', 'Ø Pace'), h('div.stat-val', pace(run.duration_min, run.distance_km))),
          h('div.stat', h('div.stat-label', 'Ø Herzfrequenz'), h('div.stat-val', run.hr ? `${num(run.hr)} bpm` : '–')),
          run.elevation_m != null ? h('div.stat', h('div.stat-label', 'Höhenmeter'), h('div.stat-val', `${num(run.elevation_m)} m`)) : null)),
    });
    return;
  }

  const d = dateField({ label: 'Datum', value: run?.date || date || today(), max: today() });
  const km = numField({ label: 'Distanz', unit: 'km', value: run?.distance_km, decimals: true, placeholder: '5,0', min: 0.1, max: 300 });
  const min = numField({ label: 'Dauer', unit: 'min', value: run?.duration_min, decimals: true, placeholder: '30', min: 1, max: 1500 });
  const hr = numField({ label: 'Ø Herzfrequenz', unit: 'bpm', value: run?.hr, placeholder: 'optional', min: 40, max: 230 });
  const name = textField({ label: 'Name', value: run?.name || '', placeholder: 'z. B. Lockerer Lauf' });
  const preview = h('div.muted.pace-preview');
  const upd = () => { preview.textContent = km.get() && min.get() ? `Pace ${pace(min.get(), km.get())}` : ''; };
  km.input.addEventListener('input', upd); min.input.addEventListener('input', upd); upd();

  const save = async () => {
    if (!d.get()) { toast('Bitte ein Datum wählen', { kind: 'error' }); return; }
    if (![km, min, hr].every(f => f.validate()) || km.get() == null || min.get() == null) { toast('Distanz und Dauer prüfen', { kind: 'error' }); return; }
    await db.saveRun({ id: run?.id, source: 'manual', date: d.get(), distance_km: km.get(), duration_min: min.get(), hr: hr.get(), name: name.get() || 'Lauf' });
    s.close();
    toast('Lauf gespeichert');
  };
  const remove = async () => {
    if (!(await confirmSheet('Diesen Lauf löschen?', { title: 'Lauf löschen', ok: 'Löschen', danger: true }))) return;
    await db.deleteRun(run.id);
    s.close();
  };
  const s = sheet({
    title: run ? 'Lauf bearbeiten' : 'Lauf eintragen',
    body: h('form.form', { onSubmit: e => { e.preventDefault(); save(); } }, d.el, h('div.grid-2', km.el, min.el), preview, hr.el, name.el, h('button', { type: 'submit', hidden: true })),
    footer: h('div.btn-row', run ? btn('', { kind: 'gray', iconName: 'trash', cls: 'btn-square', onClick: remove }) : null, btn('Speichern', { cls: 'grow', onClick: save })),
  });
}
