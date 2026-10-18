// Tab „Morgen“: Morgen-Routine als Checkliste in fester Reihenfolge. Wird täglich zurückgesetzt,
// zählt für keinen Ring und erscheint in keiner Auswertung.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { btn, card, empty, iconBtn, largeTitle, sheet, textField, toast } from '../ui/kit.js';
import * as db from '../store/db.js';
import { doneToday, nextStep, move } from '../lib/routine.js';
import { dateLong } from '../lib/format.js';

const SUGGESTIONS = ['Glas Wasser trinken', 'Wiegen (nüchtern)', 'Schlaf eintragen', 'Supplements nehmen', 'Zähne putzen', 'Duschen', 'Bett machen', 'Frühstück', 'Tagesplan checken', 'Dehnen / Mobility'];

export function renderMorning(root, { snap, now }) {
  const steps = snap.routine;
  const done = doneToday(snap.routineToday, now);
  const next = nextStep(steps, done);
  const count = steps.filter(s => done.has(s.id)).length;

  root.append(largeTitle('Morgen', {
    sub: dateLong(now),
    right: steps.length ? h('button.link-btn', { type: 'button', onClick: () => editRoutine() }, 'Bearbeiten') : null,
  }));

  if (!steps.length) {
    root.append(card(empty('sun', 'Deine Morgen-Routine', 'Leg die Schritte fest, die du morgens nach dem Wecker abhakst – in deiner Reihenfolge. Jeden Tag startet die Liste neu.',
      btn('Routine einrichten', { iconName: 'plus', onClick: () => editRoutine() }))));
    return;
  }

  const all = count === steps.length;
  root.append(card({ class: all ? 'routine-head routine-done' : 'routine-head' },
    h('div.routine-count', h('b', `${count}`), h('span', ` / ${steps.length}`)),
    h('div.routine-text', all ? 'Alles erledigt – guten Start in den Tag! ☀️' : next ? `Als Nächstes: ${next.title}` : ''),
    h('div.score-bar', h('span', { style: { width: `${(count / steps.length) * 100}%` } }))));

  root.append(h('div.routine', steps.map((s, i) => h('button.routine-step', {
    type: 'button',
    class: [done.has(s.id) && 'is-done', next?.id === s.id && 'is-next'].filter(Boolean).join(' '),
    'aria-pressed': String(done.has(s.id)),
    onClick: () => db.toggleRoutineStep(now, s.id),
  }, h('span.routine-num', done.has(s.id) ? icon('check', 16) : String(i + 1)), h('span.routine-title', s.title)))));

  if (count) root.append(h('div.center-action', h('button.link-btn', { type: 'button', onClick: () => db.resetRoutineToday() }, 'Heute zurücksetzen')));
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
      title: 'Routine bearbeiten',
      body: h('div.form',
        steps.length ? h('div.routine-edit', steps.map((st, i) => h('div.routine-edit-row',
          h('span.routine-num', String(i + 1)),
          h('span.routine-title', st.title),
          iconBtn('chevU', { label: 'Nach oben', onClick: () => save(move(steps, st.id, -1)) }),
          iconBtn('chevD', { label: 'Nach unten', onClick: () => save(move(steps, st.id, 1)) }),
          iconBtn('trash', { label: 'Löschen', onClick: () => save(steps.filter(x => x.id !== st.id)) })))) : h('p.muted', 'Noch keine Schritte.'),
        h('form.routine-add', { onSubmit: e => { e.preventDefault(); add(); } }, input.el, btn('Hinzufügen', { iconName: 'plus', kind: 'tinted', onClick: () => add() })),
        unused.length ? h('div.field', h('span.field-label', 'Vorschläge'), h('div.chips', unused.map(x => h('button.chip.chip-btn', { type: 'button', onClick: () => add(x) }, `+ ${x}`)))) : null),
      footer: h('div.btn-row', btn('Fertig', { cls: 'grow', onClick: () => { s.close(); if (db.snap.routine.length) toast('Routine gespeichert'); } })),
    };
  };
  s = sheet(view());
}
