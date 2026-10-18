// Push-Erinnerungen: auf diesem Gerät an-/abmelden und den Erinnerungsplan an den Server melden.
// Gemeldet werden nur Uhrzeiten, Supplement-Namen/Dosis und was heute schon erledigt ist – keine Gesundheitswerte.
import * as cloud from '../store/cloud.js';
import { snap } from '../store/db.js';
import { planAt } from '../lib/supplements.js';
import { today } from '../lib/dates.js';
import { api } from './sync.js';

const SENT = 'mx-sports-push-state';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad: Push nur als installierte Homescreen-App */
export const needsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone;

const registration = () => navigator.serviceWorker.getRegistration();

export async function deviceSubscription() {
  if (!pushSupported()) return null;
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const toKey = b64 => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export async function enablePush() {
  if (!pushSupported()) throw new Error('Dieser Browser unterstützt keine Push-Mitteilungen.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt (in den Browser-/iPhone-Einstellungen änderbar).');
  const reg = await registration();
  if (!reg) throw new Error('Push geht nur auf der Online-Seite (nicht lokal).');
  const { publicKey } = await api('push');
  if (!publicKey) throw new Error('Auf dem Server fehlt VAPID_PUBLIC_KEY (Netlify-Umgebungsvariablen).');
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await api('push', { action: 'subscribe', subscription: sub.toJSON() });
  await syncPushState({ force: true });
}

export async function disablePush() {
  const sub = await deviceSubscription();
  if (!sub) return;
  await api('push', { action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Erinnerungsplan: Check-in-Uhrzeit + Supplements gruppiert nach Uhrzeit */
export function reminderPlan() {
  const plan = [];
  const hour = snap.settings.reminder_hour;
  if (hour != null) plan.push({ id: 'checkin', kind: 'checkin', time: `${String(hour).padStart(2, '0')}:00` });
  const byTime = new Map();
  for (const it of planAt(snap, today())) {
    if (!it.time) continue;
    if (!byTime.has(it.time)) byTime.set(it.time, []);
    byTime.get(it.time).push({ id: it.id, name: it.name, dose: it.dose, days: it.days || [] });
  }
  for (const [time, items] of byTime) plan.push({ id: `supp-${time}`, kind: 'supp', time, items });
  return plan;
}

/** Plan + „heute erledigt“ an den Server melden – nur wenn sich etwas geändert hat */
export async function syncPushState({ force = false } = {}) {
  if (!cloud.enabled) return;
  const d = today();
  const log = snap.logs[d] || {};
  const state = { plan: reminderPlan(), today: { date: d, checkin: log.kcal != null, supps: Object.keys(log.supps || {}) } };
  const hash = JSON.stringify(state);
  let last = null;
  try { last = localStorage.getItem(SENT); } catch { /* egal */ }
  if (!force && hash === last) return;
  await api('push', { action: 'state', ...state });
  try { localStorage.setItem(SENT, hash); } catch { /* egal */ }
}
