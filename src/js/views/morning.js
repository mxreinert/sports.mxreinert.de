// Morgen-Routine als Karte oben auf „Heute“: Checkliste in fester Reihenfolge, wird täglich zurückgesetzt,
// zählt für keinen Ring und erscheint in keiner Auswertung. Erledigt → klappt zu einer Zeile zusammen.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { btn, card, cardHead, iconBtn, sheet, textField, toast } from '../ui/kit.js';
import * as db from '../store/db.js';
import { doneToday, nextStep, move } from '../lib/routine.js';

const SUGGESTIONS = ['Glas Wasser trinken', 'Wiegen (nüchtern)', 'Schlaf eintragen', 'Supplements nehmen', 'Zähne putzen', 'Duschen', 'Bett machen', 'Frühstück', 'Tagesplan checken', 'Dehnen / Mobility'];
let expanded = false; // erledigte Routine wieder aufklappen (nur bis zum Neuladen)

/** { el, done } – done: heute alles abgehakt (Karte gehört dann ans Ende von „Heute“) */
export function routineCard(snap, now) {
  const steps = snap.routine;
  if (!steps.length) {
    return { done: false, el: h('button.routine-collapsed', { type: 'button', onClick: () => editRoutine() },
      h('span.routine-sun', icon('sun', 18)), h('span', 'Morgen-Routine einrichten'), icon('chevR', 16)) };
  }
  const done = doneToday(snap.routineToday, now);
  const next = nextStep(steps, done);
  const count = steps.filter(s => done.has(s.id)).length;
  const all = count === steps.length;

  if (all && !expanded) {
    return { done: true, el: h('button.routine-collapsed.routine-done', { type: 'button', onClick: () => { expanded = true; db.refreshView(); } },
      h('span.routine-sun', icon('check', 18)), h('span', `Morgen-Routine erledigt · ${count}/${steps.length}`), icon('chevD', 16)) };
  }

  return { done: all, el: card({ class: all ? 'routine-card routine-done' : 'routine-card' },
    cardHead('Morgen-Routine', {
      iconName: 'sun', color: '#ffd60a',
      sub: all ? 'Alles erledigt – guten Start! ☀️' : next ? `${count} von ${steps.length} · als Nächstes: ${next.title}` : '',
      right: h('button.link-btn', { type: 'button', onClick: () => editRoutine() }, 'Bearbeiten'),
    }),
    h('div.score-bar', h('span', { style: { width: `${(count / steps.length) * 100}%` } })),
    h('div.routine', steps.map((s, i) => h('button.routine-step', {
      type: 'button',
      class: [done.has(s.id) && 'is-done', next?.id === s.id && 'is-next'].filter(Boolean).join(' '),
      'aria-pressed': String(done.has(s.id)),
      onClick: () => { if (count + 1 === steps.length && !done.has(s.id)) expanded = false; db.toggleRoutineStep(now, s.id); },
    }, h('span.routine-num', done.has(s.id) ? icon('check', 16) : String(i + 1)), h('span.routine-title', s.title)))),
    all ? h('button.link-btn', { type: 'button', onClick: () => { expanded = false; db.refreshView(); } }, 'Zuklappen')
      : count ? h('button.link-btn', { type: 'button', onClick: () => db.resetRoutineToday() }, 'Heute zurücksetzen') : null) };
}

function editRoutine() {
  let s = null;
  const view = () => {
    const steps = db.snap.routine;
    const input = textField({ label: 'Neuer Schritt', placeholder: 'z. B. Glas Wasser trinken' });
    const add = async title => {
      const t = (title ?? input.get()).trim();
      if (!t) return;
      await db.saveRoutine([...db.snap.routine, { id: crypto.randomUUID(), title: t }]);
      s.update(view());
    };
    const save = async list => { await db.saveRoutine(list); s.update(view()); };
    const unused = SUGGESTIONS.filter(x => !steps.some(st => st.title === x));
    return {
      title: 'Morgen-Routine',
      body: h('div.form',
        h('p.muted', 'Deine Schritte nach dem Wecker – in dieser Reihenfolge. Jeden Tag startet die Liste neu.'),
        steps.length ? h('div.routine-edit', steps.map((st, i) => h('div.routine-edit-row',
          h('span.routine-num', String(i + 1)),
          h('span.routine-title', st.title),
          iconBtn('chevU', { label: 'Nach oben', onClick: () => save(move(steps, st.id, -1)) }),
          iconBtn('chevD', { label: 'Nach unten', onClick: () => save(move(steps, st.id, 1)) }),
          iconBtn('trash', { label: 'Löschen', onClick: () => save(steps.filter(x => x.id !== st.id)) })))) : null,
        h('form.routine-add', { onSubmit: e => { e.preventDefault(); add(); } }, input.el, btn('Hinzufügen', { iconName: 'plus', kind: 'tinted', onClick: () => add() })),
        unused.length ? h('div.field', h('span.field-label', 'Vorschläge'), h('div.chips', unused.map(x => h('button.chip.chip-btn', { type: 'button', onClick: () => add(x) }, `+ ${x}`)))) : null),
      footer: h('div.btn-row', btn('Fertig', { cls: 'grow', onClick: () => { s.close(); if (db.snap.routine.length) toast('Routine gespeichert'); } })),
    };
  };
  s = sheet(view());
}
