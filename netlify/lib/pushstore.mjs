// Ablage für Push-Erinnerungen in Netlify Blobs (kein Datenbank-Schlüssel nötig).
// Pro Nutzer: <uid>/subs (Geräte), <uid>/plan (Uhrzeiten), <uid>/day/<datum> (heute erledigt), <uid>/sent/<datum> (verschickt).
// Hier liegen keine Gesundheitswerte – nur Uhrzeiten, Supplement-Namen und Häkchen.
import { getStore } from '@netlify/blobs';
import { env } from './server.mjs';

let override = null;
/** Nur für Tests: In-Memory-Speicher statt Netlify Blobs */
export const useStoreForTests = s => { override = s; };
export const store = () => override || getStore('push');

export const vapid = () => ({
  publicKey: env('VAPID_PUBLIC_KEY'),
  privateKey: env('VAPID_PRIVATE_KEY'),
  subject: process.env.VAPID_SUBJECT || 'https://mxsports.mxreinert.de',
});

export const read = async (key, fallback) => (await store().get(key, { type: 'json' })) ?? fallback;
export const write = (key, value) => store().setJSON(key, value);
