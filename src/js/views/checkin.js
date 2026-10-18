// Abend-Check-in (< 1 Minute) und Morgen-Eingabe (Gewicht + Schlaf) – beide als Sheet.
import { h } from '../ui/h.js';
import { btn, iconBtn, numField, rating, sheet, textField, toast, confirmSheet } from '../ui/kit.js';
import * as db from '../store/db.js';
import { snap } from '../store/db.js';
import { coachAt, ringsAt, nutritionDay } from '../lib/engine.js';
import { dateLong, num, signed } from '../lib/format.js';
import { addDays, today } from '../lib/dates.js';
import { NUT_KIND, NUT_LABEL, pill } from './common.js';
import { suppDay, suppCondition } from '../lib/supplements.js';
import { suppChips } from './supplements.js';

function lastWeight(before) {
  for (let d = addDays(before, -1), i = 0; i < 60; d = addDays(d, -1), i++) if (snap.logs[d]?.weight != null) return snap.logs[d].weight;
  return null;
}

/** Abend-Check-in. Mit ‹ › lassen sich vergangene Tage nachtragen (nicht in die Zukunft). */
export function openCheckin(date = today()) {
  let s = null;
  let dirty = false;

  const go = async target => {
    if (dirty && !(await confirmSheet('Deine Eingaben für diesen Tag sind noch nicht gespeichert. Verwerfen?', { title: 'Tag wechseln', ok: 'Verwerfen', danger: true }))) return;
    show(target);
  };

  function show(d) {
    date = d;
    dirty = false;
    const view = build(d);
    if (s) s.update(view);
    else s = sheet(view);
    // Fokus erst nach der Animation, damit die Tastatur nicht ruckelt
    if (!snap.logs[d]?.kcal && matchMedia('(pointer:fine)').matches) setTimeout(() => view.focus.focus(), 360);
  }

  function build(d) {
    const log = snap.logs[d] || {};
    const t = coachAt(snap, d);
    const rules = ringsAt(snap, d);
    const isToday = d === today();
    const hint = v => (v ? `Ziel ${num(v)}` : 'kein Ziel');

    const kcal = numField({ label: 'Kalorien', unit: 'kcal', value: log.kcal, placeholder: '0', hint: t.kcal ? `Ziel ${num(t.kcal)} ± ${t.kcal_tol}` : 'kein Ziel', max: 15000, big: true });
    const protein = numField({ label: 'Protein', unit: 'g', value: log.protein, placeholder: '0', hint: hint(t.protein), max: 1000 });
    const carbs = numField({ label: 'Kohlenhydrate', unit: 'g', value: log.carbs, placeholder: '0', hint: hint(t.carbs), max: 2000 });
    const fat = numField({ label: 'Fett', unit: 'g', value: log.fat, placeholder: '0', hint: hint(t.fat), max: 1000 });
    const prev = lastWeight(d);
    const weight = numField({ label: 'Gewicht', unit: 'kg', value: log.weight, decimals: true, placeholder: prev ? num(prev, 1) : '0,0', hint: log.weight != null ? 'bereits eingetragen' : 'falls morgens nicht gewogen', min: 30, max: 300 });
    const energy = rating({ label: 'Energie', iconName: 'bolt', value: log.energy, color: '#ffd60a', onChange: () => { dirty = true; } });
    const hunger = rating({ label: 'Hunger', iconName: 'hunger', value: log.hunger, color: '#ff9f0a', onChange: () => { dirty = true; } });
    const suppSel = { ...(log.supps || {}) };
    const sd = suppDay(snap, d);
    const suppCond = () => suppCondition(suppDay({ ...snap, logs: { ...snap.logs, [d]: { ...log, supps: suppSel } } }, d));
    const note = textField({ label: 'Notiz', value: log.note || '', placeholder: 'Kurz, z. B. „auswärts gegessen“', multiline: true, rows: 2 });

    // Live-Vorschau: Wie wird der Tag bewertet?
    const status = h('div.checkin-status');
    const updateStatus = () => {
      const preview = { kcal: kcal.get(), protein: protein.get(), carbs: carbs.get(), fat: fat.get() };
      const res = nutritionDay(preview, t, rules.nutrition, suppCond());
      status.replaceChildren(...[pill(NUT_LABEL[res.status], NUT_KIND[res.status]),
        res.status !== 'none' && t.kcal && preview.kcal != null ? h('span.muted', `${signed(preview.kcal - t.kcal, 0)} kcal zum Ziel`) : null].filter(Boolean));
    };
    for (const f of [kcal, protein, carbs, fat]) f.input.addEventListener('input', updateStatus);
    updateStatus();

    const save = async () => {
      const fields = [kcal, protein, carbs, fat, weight];
      if (!fields.every(f => f.validate())) { toast('Bitte die rot markierten Werte prüfen', { kind: 'error' }); return; }
      if (kcal.get() == null && (protein.get() != null || carbs.get() != null || fat.get() != null)) {
        kcal.el.classList.add('invalid'); toast('Bitte auch die Kalorien eintragen', { kind: 'error' }); return;
      }
      await db.saveLog(d, {
        kcal: kcal.get(), protein: protein.get(), carbs: carbs.get(), fat: fat.get(), weight: weight.get(),
        energy: energy.get(), hunger: hunger.get(), note: note.get(), supps: suppSel,
      });
      s.close();
      toast(isToday ? 'Check-in gespeichert' : `${dateLong(d)} gespeichert`);
    };

    const remove = async () => {
      if (!(await confirmSheet(`Alle Werte vom ${dateLong(d)} löschen?`, { title: 'Tag löschen', ok: 'Löschen', danger: true }))) return;
      await db.saveLog(d, Object.fromEntries(['kcal', 'protein', 'carbs', 'fat', 'weight', 'sleep', 'energy', 'hunger', 'note'].map(k => [k, null])));
      s.close();
      toast('Tag gelöscht');
    };

    const form = h('form.checkin', { onSubmit: e => { e.preventDefault(); save(); }, onInput: () => { dirty = true; } },
      h('div.day-switch',
        iconBtn('chevL', { label: 'Vorheriger Tag', onClick: () => go(addDays(d, -1)) }),
        h('div.day-switch-mid', h('b', dateLong(d)), h('span', isToday ? 'heute' : snap.logs[d]?.kcal != null ? 'eingetragen' : 'nachtragen')),
        isToday ? h('span.day-switch-gap') : iconBtn('chevR', { label: 'Nächster Tag', onClick: () => go(addDays(d, 1)) })),
      kcal.el,
      h('div.grid-3', protein.el, carbs.el, fat.el),
      sd.due.length ? h('div.field', h('span.field-label', 'Supplements'), suppChips(sd.due, suppSel, id => { suppSel[id] = !suppSel[id]; dirty = true; updateStatus(); })) : null,
      status,
      weight.el,
      h('div.ratings', energy.el, hunger.el),
      note.el,
      h('button', { type: 'submit', hidden: true }));

    return {
      title: isToday ? 'Abend-Check-in' : 'Check-in nachtragen',
      body: form,
      footer: h('div.btn-row',
        snap.logs[d] ? btn('', { kind: 'gray', iconName: 'trash', onClick: remove, cls: 'btn-square' }) : null,
        btn('Speichern', { onClick: save, cls: 'grow' })),
      focus: kcal.input,
    };
  }

  show(date);
}

export function openWeight(date = today()) {
  const log = snap.logs[date] || {};
  const prev = lastWeight(date);
  const weight = numField({ label: 'Gewicht', unit: 'kg', value: log.weight, decimals: true, placeholder: prev ? num(prev, 1) : '0,0', min: 30, max: 300, big: true, hint: prev ? `zuletzt ${num(prev, 1)} kg` : null });
  const sleep = rating({ label: 'Schlaf', iconName: 'moon', value: log.sleep, color: '#5e5ce6' });
  const save = async () => {
    if (!weight.validate()) { toast('Bitte ein Gewicht zwischen 30 und 300 kg eingeben', { kind: 'error' }); return; }
    const v = weight.get();
    if (v != null && prev && Math.abs(v - prev) > 3 && !(await confirmSheet(`${num(v, 1)} kg sind ${num(Math.abs(v - prev), 1)} kg ${v > prev ? 'mehr' : 'weniger'} als zuletzt. Stimmt das?`, { title: 'Großer Sprung', ok: 'Ja, speichern' }))) return;
    await db.saveLog(date, { weight: v, sleep: sleep.get() });
    s.close();
    toast(v == null ? 'Gespeichert' : `${num(v, 1)} kg gespeichert`);
  };
  const s = sheet({
    title: 'Morgens', size: 'sm',
    body: h('form', { onSubmit: e => { e.preventDefault(); save(); } }, h('div.sheet-sub', dateLong(date)), weight.el, h('div.ratings', sleep.el), h('button', { type: 'submit', hidden: true })),
    footer: h('div.btn-row', btn('Speichern', { onClick: save, cls: 'grow' })),
  });
  setTimeout(() => weight.input.focus(), 360);
}
