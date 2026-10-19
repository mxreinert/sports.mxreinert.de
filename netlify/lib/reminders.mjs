// Welche Erinnerungen sind jetzt fällig? Rein, ohne Netzwerk – getestet in tests/reminders.test.js.
//
// plan:  [{ id: 'checkin', kind: 'checkin', time: '21:00' }, { id: 'supp-08:00', kind: 'supp', time: '08:00', items: [{ id, name, dose, days }] }]
// done:  { checkin: bool, supps: [ids] }  – was in der App heute schon erledigt ist
// sent:  [ids]                           – heute schon verschickt
// Zeiten in Europe/Luxembourg. Eine Erinnerung wird höchstens 30 Minuten nach ihrer Uhrzeit noch verschickt
// (verhindert eine Flut alter Erinnerungen nach Pausen).

const TZ = 'Europe/Luxembourg';
const WINDOW_MIN = 30;
const DAY_START_HOUR = 3; // wie in der App: Tageswechsel um 3 Uhr

const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ortszeit in Luxemburg: { date, weekday } des App-Tags (Wechsel um 3 Uhr), minutes = echte Uhrzeit 0–1439 */
export function localNow(at = new Date()) {
  const clock = Object.fromEntries(parts.formatToParts(at).map(x => [x.type, x.value]));
  const day = Object.fromEntries(parts.formatToParts(new Date(at.getTime() - DAY_START_HOUR * 3600e3)).map(x => [x.type, x.value]));
  return { date: `${day.year}-${day.month}-${day.day}`, minutes: Number(clock.hour) * 60 + Number(clock.minute), weekday: WD[day.weekday] };
}

const toMinutes = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

export function dueReminders(plan, { done = {}, sent = [] } = {}, now = localNow()) {
  const out = [];
  for (const r of plan || []) {
    if (!r.time || sent.includes(r.id)) continue;
    const diff = now.minutes - toMinutes(r.time);
    if (diff < 0 || diff > WINDOW_MIN) continue;
    if (r.kind === 'checkin') {
      if (done.checkin) continue;
      out.push({ id: r.id, title: 'Abend-Check-in', body: 'Heute noch nicht eingetragen – dauert unter einer Minute.', url: '/#/heute' });
    } else if (r.kind === 'supp') {
      const open = (r.items || []).filter(i => (!i.days?.length || i.days.includes(now.weekday)) && !(done.supps || []).includes(i.id));
      if (!open.length) continue;
      out.push({ id: r.id, title: open.length === 1 ? `${open[0].name} nehmen` : 'Supplements nehmen', body: open.map(i => [i.name, i.dose].filter(Boolean).join(' ')).join(' · '), url: '/#/heute' });
    }
  }
  return out;
}
