// Phasen: Start, Ende, Ablauf, neue Phase (z. B. Bulk bis Januar, dann Cut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, phaseStatus, setupNeeded, planNewPhase, planNewEnd } from '../src/js/lib/phases.js';

const bulk = { id: 'b', phase: 'bulk', start: '2026-10-01', end: '2027-01-10', created_at: '1' };
const cut = { id: 'c', phase: 'cut', start: '2027-01-11', end: '2027-04-30', created_at: '2' };

test('Erster Start: keine Phase → Setup', () => {
  assert.equal(setupNeeded([], '2026-10-16'), 'first');
});

test('Aktive Phase mit Woche und Resttagen', () => {
  const s = phaseStatus([bulk], '2026-10-16');
  assert.equal(s.status, 'active');
  assert.equal(s.phase.id, 'b');
  assert.equal(s.week, 3); // 1.10. = Tag 1, 16.10. = Tag 16
  assert.equal(s.daysLeft, 86);
  assert.equal(setupNeeded([bulk], '2026-10-16'), null);
});

test('Ende überschritten ohne geplante Phase → Setup erneut, Phase gilt weiter', () => {
  assert.equal(setupNeeded([bulk], '2027-01-11'), 'expired');
  assert.equal(phaseAt([bulk], '2027-02-01').id, 'b');
  assert.equal(setupNeeded([bulk], '2027-01-10'), null, 'am letzten Tag noch kein Setup');
});

test('Geplante Cut-Phase im Januar: kein Setup, Wechsel am Starttag', () => {
  assert.equal(setupNeeded([bulk, cut], '2027-01-10'), null);
  assert.equal(phaseAt([bulk, cut], '2027-01-10').phase, 'bulk');
  assert.equal(phaseAt([bulk, cut], '2027-01-11').phase, 'cut');
  assert.equal(phaseStatus([bulk, cut], '2026-12-01').next.id, 'c');
});

test('Neue Phase vorzeitig starten kürzt die laufende Phase', () => {
  const r = planNewPhase([bulk], { start: '2026-12-01', end: '2027-03-01' });
  assert.ok(r.ok);
  assert.deepEqual(r.updates.map(u => [u.id, u.end]), [['b', '2026-11-30']]);
});

test('Neue Phase nach geplantem Ende lässt die alte unverändert', () => {
  const r = planNewPhase([bulk], { start: '2027-01-20' });
  assert.ok(r.ok);
  assert.equal(r.updates.length, 0);
});

test('Ungültige Phasen werden abgelehnt', () => {
  assert.equal(planNewPhase([bulk], { start: '2026-10-01' }).ok, false);
  assert.equal(planNewPhase([bulk], { start: '2026-12-01', end: '2026-11-01' }).ok, false);
  assert.equal(planNewPhase([], {}).ok, false);
});

test('Ende verlängern, aber nicht in die nächste Phase hinein', () => {
  assert.equal(planNewEnd([bulk], 'b', '2027-02-28').row.end, '2027-02-28');
  assert.equal(planNewEnd([bulk, cut], 'b', '2027-01-20').ok, false);
  assert.equal(planNewEnd([bulk], 'b', '2026-09-01').ok, false);
});
