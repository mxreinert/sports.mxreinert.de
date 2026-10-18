// Supplements: Fälligkeit, Wirkung auf den Ernährungsring, Versionen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suppDay, suppCondition, isDue } from '../src/js/lib/supplements.js';
import { evaluateWeek, dayChecks } from '../src/js/lib/engine.js';
import { DEFAULTS } from '../src/js/config.js';

const MON = '2026-10-19'; // Montag
const kreatin = { id: 'k', name: 'Kreatin', dose: '5 g', days: [], ring: true };
const vitD = { id: 'd', name: 'Vitamin D', dose: '2000 IE', days: [], ring: true };
const omega = { id: 'o', name: 'Omega 3', dose: '2 Kapseln', days: [1, 3, 5], ring: false }; // Mo, Mi, Fr

function snap(extra = {}) {
  return {
    logs: {}, workouts: [], runs: [], exceptions: [], mappings: {}, templates: {}, settings: { week_start: 1 },
    coach: [{ id: 'c', valid_from: '2000-01-01', ...DEFAULTS.coach, kcal: 3000, protein: 170 }],
    rings: [{ id: 'r', valid_from: '2000-01-01', ...structuredClone(DEFAULTS.rings) }],
    muscles: [{ id: 'm', valid_from: '2000-01-01', ...structuredClone(DEFAULTS.muscles) }],
    supps: [{ id: 's1', valid_from: '2026-10-19', items: [kreatin, vitD, omega] }],
    ...extra,
  };
}

test('Fällig: täglich oder an gewählten Wochentagen', () => {
  assert.ok(isDue(kreatin, MON));
  assert.ok(isDue(omega, MON));
  assert.ok(!isDue(omega, '2026-10-20')); // Dienstag
  assert.equal(suppDay(snap(), '2026-10-20').due.length, 2);
  assert.equal(suppDay(snap(), '2026-10-18').due.length, 0, 'vor dem Plan nichts fällig');
});

test('Ring-Bedingung: alle genommen ok, eins vergessen gelb, zwei rot – nicht-relevante zählen nicht', () => {
  const s = snap();
  const cond = taken => suppCondition(suppDay({ ...s, logs: { [MON]: { supps: taken } } }, MON)).state;
  assert.equal(cond({ k: true, d: true }), 'ok', 'Omega fehlt, zählt aber nicht für den Ring');
  assert.equal(cond({ k: true }), 'near');
  assert.equal(cond({}), 'miss');
  assert.equal(suppCondition(suppDay(snap({ supps: [{ id: 'x', valid_from: '2026-10-19', items: [omega] }] }), MON)), null);
});

test('Ernährungstag: perfekte Makros, aber Supplement vergessen → gelb statt grün', () => {
  const s = snap();
  s.logs[MON] = { kcal: 3000, protein: 175, supps: { k: true, d: true } };
  s.logs['2026-10-20'] = { kcal: 3000, protein: 175, supps: { k: true } };
  s.logs['2026-10-21'] = { kcal: 3000, protein: 175 };
  const days = evaluateWeek(s, MON, '2026-10-30').rings.nutrition.days;
  assert.deepEqual(days.slice(0, 3).map(d => d.status), ['green', 'yellow', 'red']);
});

test('Tages-Check zeigt alle fälligen Supplements, heute offen statt verfehlt', () => {
  const s = snap();
  s.logs[MON] = { kcal: 3000, protein: 175, supps: { k: true } };
  const today = dayChecks(s, MON, MON).items.filter(i => i.key === 'supps');
  assert.equal(today.length, 1, 'nur eine Supplement-Zeile');
  assert.equal(today[0].actual, '1/3');
  assert.equal(today[0].state, 'open');
  assert.equal(dayChecks(s, MON, '2026-10-25').items.find(i => i.key === 'supps').state, 'near');
});

test('Neue Plan-Version ändert vergangene Tage nicht', () => {
  const s = snap();
  s.supps.push({ id: 's2', valid_from: '2026-10-26', items: [kreatin] });
  s.logs[MON] = { kcal: 3000, protein: 175, supps: { k: true } };
  assert.equal(evaluateWeek(s, MON, '2026-11-30').rings.nutrition.days[0].status, 'yellow', 'Vitamin D war damals Pflicht');
  s.logs['2026-10-26'] = { kcal: 3000, protein: 175, supps: { k: true } };
  assert.equal(evaluateWeek(s, '2026-10-26', '2026-11-30').rings.nutrition.days[0].status, 'green');
});
