// Push-Erinnerungen verwalten (nur mit Login + 2FA).
// GET  → { publicKey, devices }
// POST { action: 'subscribe', subscription } | 'unsubscribe' { endpoint } | 'state' { plan, today } | 'test'
import { handle, json, requireUser, HttpError } from '../lib/server.mjs';
import { send } from '../lib/webpush.mjs';
import { read, write, vapid } from '../lib/pushstore.mjs';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max = 60) => String(v ?? '').slice(0, max);

/** Nur das Nötige übernehmen – nichts Ungeprüftes in den Speicher */
function cleanPlan(plan) {
  if (!Array.isArray(plan)) throw new HttpError(400, 'Ungültiger Plan.');
  return plan.slice(0, 30).filter(r => TIME.test(r?.time) && ['checkin', 'supp'].includes(r.kind)).map(r => ({
    id: text(r.id, 40), kind: r.kind, time: r.time,
    items: r.kind === 'supp' ? (r.items || []).slice(0, 30).map(i => ({
      id: text(i.id, 60), name: text(i.name), dose: text(i.dose, 30),
      days: Array.isArray(i.days) ? i.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    })) : undefined,
  }));
}

export default handle(async req => {
  const user = await requireUser(req);
  const key = k => `${user.id}/${k}`;
  const subs = await read(key('subs'), []);

  if (req.method === 'GET') return json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, devices: subs.length });
  if (req.method !== 'POST') throw new HttpError(405, 'Methode nicht erlaubt.');
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case 'subscribe': {
      const s = body.subscription;
      if (!s?.endpoint?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Ungültiges Push-Abo.');
      const entry = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, added: new Date().toISOString() };
      await write(key('subs'), [...subs.filter(x => x.endpoint !== s.endpoint), entry].slice(-10));
      return json({ ok: true, devices: Math.min(10, subs.filter(x => x.endpoint !== s.endpoint).length + 1) });
    }
    case 'unsubscribe':
      await write(key('subs'), subs.filter(x => x.endpoint !== body.endpoint));
      return json({ ok: true });
    case 'state': {
      await write(key('plan'), cleanPlan(body.plan));
      const t = body.today || {};
      if (DATE.test(t.date)) {
        await write(key(`day/${t.date}`), { checkin: !!t.checkin, supps: Array.isArray(t.supps) ? t.supps.slice(0, 30).map(x => text(x, 60)) : [] });
      }
      return json({ ok: true });
    }
    case 'test': {
      if (!subs.length) throw new HttpError(400, 'Auf keinem Gerät aktiviert.');
      const results = await Promise.all(subs.map(s => send(s, { id: 'test', title: 'mx sports', body: 'Push funktioniert 🎉', url: '/#/heute' }, vapid())));
      const alive = subs.filter((s, i) => results[i] !== 'gone');
      if (alive.length !== subs.length) await write(key('subs'), alive);
      return json({ ok: results.includes('ok'), sent: results.filter(r => r === 'ok').length, devices: alive.length });
    }
    default:
      throw new HttpError(400, 'Unbekannte Aktion.');
  }
});
