// Morgen-Routine: tägliches Zurücksetzen, nächster Schritt, Umsortieren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doneToday, nextStep, move, toggle } from '../src/js/lib/routine.js';

const steps = [{ id: 'a', title: 'Wasser' }, { id: 'b', title: 'Wiegen' }, { id: 'c', title: 'Kreatin' }];

test('Häkchen gelten nur heute – am nächsten Tag ist alles offen', () => {
  let p = toggle(null, '2026-10-19', 'a');
  p = toggle(p, '2026-10-19', 'b');
  assert.deepEqual([...doneToday(p, '2026-10-19')], ['a', 'b']);
  assert.equal(doneToday(p, '2026-10-20').size, 0);
  const tomorrow = toggle(p, '2026-10-20', 'c');
  assert.deepEqual(tomorrow, { date: '2026-10-20', done: ['c'] }, 'gestern wird verworfen');
});

test('Erneutes Tippen nimmt das Häkchen wieder weg', () => {
  const p = toggle(toggle(null, '2026-10-19', 'a'), '2026-10-19', 'a');
  assert.equal(doneToday(p, '2026-10-19').size, 0);
});

test('Nächster Schritt folgt der Reihenfolge, nicht der Klick-Reihenfolge', () => {
  assert.equal(nextStep(steps, new Set()).id, 'a');
  assert.equal(nextStep(steps, new Set(['b'])).id, 'a');
  assert.equal(nextStep(steps, new Set(['a', 'b'])).id, 'c');
  assert.equal(nextStep(steps, new Set(['a', 'b', 'c'])), null);
});

test('Umsortieren, Ränder bleiben stabil', () => {
  assert.deepEqual(move(steps, 'c', -1).map(s => s.id), ['a', 'c', 'b']);
  assert.deepEqual(move(steps, 'a', -1).map(s => s.id), ['a', 'b', 'c']);
  assert.deepEqual(move(steps, 'c', 1).map(s => s.id), ['a', 'b', 'c']);
});
