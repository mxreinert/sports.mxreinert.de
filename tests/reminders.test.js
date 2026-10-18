// Erinnerungen: Uhrzeit-Fenster, schon erledigt, schon verschickt, Wochentage, Zeitzone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, localNow } from '../netlify/lib/reminders.mjs';

const plan = [
  { id: 'checkin', kind: 'checkin', time: '21:00' },
  { id: 'supp-08:00', kind: 'supp', time: '08:00', items: [
    { id: 'k', name: 'Kreatin', dose: '5 g', days: [] },
    { id: 'o', name: 'Omega 3', dose: '2 Kapseln', days: [1, 3, 5] },
  ] },
];
const at = (hhmm, weekday = 1) => { const [h, m] = hhmm.split(':').map(Number); return { date: '2026-10-19', minutes: h * 60 + m, weekday }; };

test('Erst ab der Uhrzeit und höchstens 30 Minuten danach', () => {
  assert.equal(dueReminders(plan, {}, at('07:59')).length, 0);
  assert.deepEqual(dueReminders(plan, {}, at('08:00')).map(r => r.id), ['supp-08:00']);
  assert.equal(dueReminders(plan, {}, at('08:30')).length, 1);
  assert.equal(dueReminders(plan, {}, at('08:31')).length, 0);
});

test('Supplements: nur fällige und noch nicht genommene', () => {
  const mon = dueReminders(plan, {}, at('08:05', 1))[0];
  assert.equal(mon.title, 'Supplements nehmen');
  assert.equal(mon.body, 'Kreatin 5 g · Omega 3 2 Kapseln');
  const tue = dueReminders(plan, {}, at('08:05', 2))[0];
  assert.equal(tue.title, 'Kreatin nehmen', 'Omega nur Mo/Mi/Fr');
  assert.equal(dueReminders(plan, { done: { supps: ['k', 'o'] } }, at('08:05', 1)).length, 0, 'schon abgehakt → keine Erinnerung');
});

test('Check-in-Erinnerung nur, wenn noch nicht eingetragen; nie doppelt', () => {
  assert.equal(dueReminders(plan, {}, at('21:10'))[0].id, 'checkin');
  assert.equal(dueReminders(plan, { done: { checkin: true } }, at('21:10')).length, 0);
  assert.equal(dueReminders(plan, { sent: ['checkin'] }, at('21:10')).length, 0);
});

test('Ortszeit Luxemburg inkl. Sommer-/Winterzeit', () => {
  assert.deepEqual(localNow(new Date('2026-11-16T19:00:00Z')), { date: '2026-11-16', minutes: 20 * 60, weekday: 1 }); // Winterzeit UTC+1
  assert.deepEqual(localNow(new Date('2026-07-13T19:00:00Z')), { date: '2026-07-13', minutes: 21 * 60, weekday: 1 }); // Sommerzeit UTC+2
  assert.equal(localNow(new Date('2026-10-19T23:30:00Z')).date, '2026-10-20', 'nach Mitternacht Ortszeit');
});
