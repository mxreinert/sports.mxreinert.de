// Online-Backend: Supabase. Gleiche Schnittstelle wie idb.js (open, all, put, del, clear),
// dazu Login mit Passwort + 2FA (TOTP). supabase-js wird als Datei geladen (src/vendor, global `supabase`).
import { SUPABASE } from '../env.js';
import { STORES } from './schema.js';

/** Online-Modus, wenn Zugangsdaten eingetragen sind. Nur am eigenen Rechner (localhost) erzwingt ?lokal den Testmodus. */
const forceLocal = location.hostname === 'localhost' && new URLSearchParams(location.search).has('lokal');
export const enabled = !!(SUPABASE.url && SUPABASE.anonKey) && !forceLocal;

let sb = null;
let userId = null;

export function client() {
  if (!sb) sb = window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return sb;
}

const fail = error => {
  const msg = error.message || String(error);
  throw new Error(/Failed to fetch|NetworkError|Load failed/i.test(msg) ? 'Keine Verbindung zum Server. Internet prüfen und erneut versuchen.' : msg);
};

// ---------- Login & 2FA ----------

export async function session() {
  const { data, error } = await client().auth.getSession();
  if (error) fail(error);
  return data.session;
}

/** 'aal2' = mit 2FA angemeldet · 'aal1' = nur Passwort · null = nicht angemeldet */
export async function level() {
  if (!(await session())) return null;
  const { data, error } = await client().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) fail(error);
  return data.currentLevel;
}

export async function signIn(email, password) {
  // Handy-Tastaturen schreiben den ersten Buchstaben gern groß – E-Mails immer klein vergleichen
  const { error } = await client().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) fail(error.message === 'Invalid login credentials' ? { message: 'E-Mail oder Passwort falsch.' } : error);
}

export async function signOut() {
  await client().auth.signOut();
}

/** Bestätigter TOTP-Faktor oder null */
export async function verifiedFactor() {
  const { data, error } = await client().auth.mfa.listFactors();
  if (error) fail(error);
  return data.totp.find(f => f.status === 'verified') || null;
}

/** Neuen Authenticator einrichten. Abgebrochene (unbestätigte) Versuche werden vorher entfernt. */
export async function enrollTotp() {
  const { data: list, error: e1 } = await client().auth.mfa.listFactors();
  if (e1) fail(e1);
  for (const f of list.all.filter(x => x.status !== 'verified')) await client().auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await client().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'mx sports' });
  if (error) fail(error);
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(factorId, code) {
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) fail(error.message?.includes('Invalid') ? { message: 'Code falsch oder abgelaufen.' } : error);
}

// ---------- Speicher-Schnittstelle (wie idb.js) ----------

const PAGE = 1000;
const CHUNK = 500;

export async function open() {
  const s = await session();
  if (!s) throw new Error('Nicht angemeldet.');
  userId = s.user.id;
}

export async function all(store) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client().from(store).select('data').order('k').range(from, from + PAGE - 1);
    if (error) fail(error);
    out.push(...data.map(r => r.data));
    if (data.length < PAGE) return out;
  }
}

export async function put(store, rows) {
  const list = [].concat(rows).map(r => ({ user_id: userId, k: String(r[STORES[store]]), data: r }));
  for (let i = 0; i < list.length; i += CHUNK) {
    const { error } = await client().from(store).upsert(list.slice(i, i + CHUNK), { onConflict: 'user_id,k' });
    if (error) fail(error);
  }
}

export async function del(store, key) {
  const { error } = await client().from(store).delete().eq('user_id', userId).eq('k', String(key));
  if (error) fail(error);
}

export async function clear(store) {
  const { error } = await client().from(store).delete().eq('user_id', userId);
  if (error) fail(error);
}
