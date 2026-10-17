// Gemeinsame Server-Hilfen für die Netlify Functions.
// Sicherheit: Jede Anfrage braucht den Login des Nutzers MIT 2FA (aal2). Datenbankzugriffe laufen mit genau diesem
// Login (Row Level Security greift) – ein Service-Key wird nicht gebraucht. Hevy-Key und Strava-Token liegen nur
// verschlüsselt (AES-256-GCM, Schlüssel nur in Netlify) in der Tabelle `integrations`.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SUPABASE } from '../../src/js/env.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Handler mit einheitlicher Fehlerbehandlung */
export const handle = fn => async req => {
  try {
    return await fn(req);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return json({ error: e instanceof HttpError ? e.message : 'Interner Fehler – bitte später erneut versuchen.' }, e.status || 500);
  }
};

export function env(name) {
  const v = process.env[name];
  if (!v) throw new HttpError(500, `Server-Einstellung fehlt: ${name} (in Netlify unter Environment variables setzen)`);
  return v;
}

// ---------- Verschlüsselung ----------

export function secretKey(raw = env('SECRETS_ENCRYPTION_KEY')) {
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new HttpError(500, 'SECRETS_ENCRYPTION_KEY muss 32 Byte (base64) lang sein.');
  return key;
}

export function encrypt(text, key = secretKey()) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

export function decrypt(blob, key = secretKey()) {
  const [iv, tag, data] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

/** Signiertes, ablaufendes Token (für den Strava-OAuth-„state“) */
export function sign(payload, key = secretKey()) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}

export function verify(token, key = secretKey(), now = Date.now()) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(createHmac('sha256', key).update(body).digest('base64url'));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return payload.exp && payload.exp < now ? null : payload;
}

// ---------- Login prüfen ----------

const claims = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

/** Nutzer aus dem Authorization-Header – nur mit gültiger Sitzung UND 2FA */
export async function requireUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Nicht angemeldet.');
  const res = await fetch(`${SUPABASE.url}/auth/v1/user`, { headers: { apikey: SUPABASE.anonKey, authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, 'Sitzung abgelaufen – bitte neu anmelden.');
  const user = await res.json();
  if (claims(token).aal !== 'aal2') throw new HttpError(403, '2FA erforderlich.');
  return { id: user.id, token };
}

// ---------- Datenbank (PostgREST mit dem Login des Nutzers) ----------

export function database({ id, token }) {
  const base = `${SUPABASE.url}/rest/v1`;
  const headers = { apikey: SUPABASE.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const call = async (path, init = {}) => {
    const res = await fetch(`${base}/${path}`, { ...init, headers: { ...headers, ...init.headers } });
    if (!res.ok) throw new HttpError(502, `Datenbank: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 || init.method === 'DELETE' || init.method === 'POST' ? null : res.json();
  };
  const inList = keys => `(${keys.map(k => `"${String(k).replace(/"/g, '')}"`).join(',')})`;
  return {
    /** { schlüssel: data } */
    async get(table, keys) {
      const rows = await call(`${table}?select=k,data${keys ? `&k=in.${encodeURIComponent(inList(keys))}` : ''}`);
      return Object.fromEntries(rows.map(r => [r.k, r.data]));
    },
    async keys(table) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const rows = await call(`${table}?select=k&order=k`, { headers: { range: `${from}-${from + 999}` } });
        out.push(...rows.map(r => r.k));
        if (rows.length < 1000) return out;
      }
    },
    async upsert(table, keyField, rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const body = rows.slice(i, i + 500).map(r => ({ user_id: id, k: String(r[keyField]), data: r }));
        await call(`${table}?on_conflict=user_id,k`, { method: 'POST', body: JSON.stringify(body), headers: { prefer: 'resolution=merge-duplicates,return=minimal' } });
      }
    },
    async remove(table, keys) {
      for (let i = 0; i < keys.length; i += 100) await call(`${table}?k=in.${encodeURIComponent(inList(keys.slice(i, i + 100)))}`, { method: 'DELETE' });
    },
  };
}
