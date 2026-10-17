// Strava-API (OAuth 2). Client-ID/Secret nur als Netlify-Umgebungsvariablen.
import { env, HttpError } from './server.mjs';

const SCOPE = 'read,activity:read_all';

export function authorizeUrl(redirectUri, state) {
  const q = new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state });
  return `https://www.strava.com/oauth/authorize?${q}`;
}

async function token(params) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), ...params }),
  });
  if (!res.ok) throw new HttpError(400, 'Strava hat die Verbindung abgelehnt – bitte neu verbinden.');
  return res.json(); // { access_token, refresh_token, expires_at, athlete? }
}

export const exchangeCode = code => token({ code, grant_type: 'authorization_code' });
export const refresh = refreshToken => token({ refresh_token: refreshToken, grant_type: 'refresh_token' });

export async function deauthorize(accessToken) {
  await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } }).catch(() => {});
}

/** Aktivitäten nach einem Unix-Zeitstempel, eine Seite à 100 */
export async function activities(accessToken, after, page) {
  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new HttpError(400, 'Strava-Zugriff abgelaufen – bitte neu verbinden.');
  if (res.status === 429) throw new HttpError(429, 'Strava-Limit erreicht – in 15 Minuten erneut versuchen.');
  if (!res.ok) throw new HttpError(502, `Strava antwortet nicht (${res.status}).`);
  return res.json();
}
