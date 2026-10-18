// Zeitgesteuert alle 5 Minuten: fällige Erinnerungen (Supplements, Abend-Check-in) per Web Push verschicken.
import { send } from '../lib/webpush.mjs';
import { dueReminders, localNow } from '../lib/reminders.mjs';
import { store, read, write, vapid } from '../lib/pushstore.mjs';

export const config = { schedule: '*/5 * * * *' };

export default async () => {
  await runReminders(localNow());
  return new Response('ok');
};

/** now: Ortszeit Luxemburg (localNow) – im Test frei wählbar */
export async function runReminders(now) {
  const { blobs } = await store().list();
  const users = new Set(blobs.map(b => b.key.split('/')[0]));

  for (const uid of users) {
    try {
      const [subs, plan] = await Promise.all([read(`${uid}/subs`, []), read(`${uid}/plan`, [])]);
      if (!subs.length || !plan.length) continue;
      const [done, sent] = await Promise.all([read(`${uid}/day/${now.date}`, {}), read(`${uid}/sent/${now.date}`, [])]);
      const due = dueReminders(plan, { done, sent }, now);
      if (!due.length) continue;
      let alive = subs;
      for (const msg of due) {
        const results = await Promise.all(alive.map(s => send(s, msg, vapid())));
        alive = alive.filter((s, i) => results[i] !== 'gone');
        sent.push(msg.id);
      }
      await write(`${uid}/sent/${now.date}`, sent);
      if (alive.length !== subs.length) await write(`${uid}/subs`, alive);
    } catch (e) {
      console.error('Erinnerung fehlgeschlagen', uid, e.message);
    }
  }

  // Aufräumen: Tages-Einträge älter als 3 Tage
  const cutoff = new Date(Date.parse(`${now.date}T12:00:00Z`) - 3 * 864e5).toISOString().slice(0, 10);
  for (const b of blobs) {
    const m = b.key.match(/\/(?:day|sent)\/(\d{4}-\d{2}-\d{2})$/);
    if (m && m[1] < cutoff) await store().delete(b.key);
  }
}
