// Start, Hash-Router und Tab-Leiste.
import * as db from './store/db.js';
import * as cloud from './store/cloud.js';
import { h } from './ui/h.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/kit.js';
import { today } from './lib/dates.js';
import { renderToday } from './views/today.js';
import { renderWeek } from './views/week.js';
import { renderHistory } from './views/history.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { maybeOpenSetup } from './views/setup.js';
import { ensureLogin } from './views/login.js';
import { api, autoSync } from './views/sync.js';

const ROUTES = { heute: renderToday, woche: renderWeek, verlauf: renderHistory, berichte: renderReports, einstellungen: renderSettings };
const TABS = [
  ['heute', 'Heute', 'today'],
  ['woche', 'Woche', 'week'],
  ['verlauf', 'Verlauf', 'chart'],
  ['berichte', 'Berichte', 'report'],
  ['einstellungen', 'Einstellungen', 'gear'],
];

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: ROUTES[name] ? name : 'heute', params };
}

function go(hash, { replace = false } = {}) {
  if (replace) { history.replaceState(null, '', hash); render({ keepScroll: true }); }
  else if (location.hash === hash) render();
  else location.hash = hash;
}

let lastName = null;
function render({ keepScroll = false } = {}) {
  const { name, params } = parseHash();
  const y = window.scrollY;
  const page = h('main.page', { class: name !== lastName ? 'page-enter' : '' });
  const ctx = { snap: db.snap, now: today(), go, params, rerender: () => render({ keepScroll: true }) };
  try {
    ROUTES[name](page, ctx);
  } catch (e) {
    console.error(e);
    page.append(h('section.card.error-card', h('h3', 'Hier ist etwas schiefgelaufen'), h('pre', String(e?.stack || e))));
  }
  app.replaceChildren(page);
  window.scrollTo(0, keepScroll ? y : 0);
  lastName = name;
  for (const b of tabbar.querySelectorAll('.tab')) b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
  maybeOpenSetup();
}

let pending = false;
const scheduleRender = () => {
  if (pending) return;
  pending = true;
  // Mehrere Änderungen bündeln, ohne von requestAnimationFrame abzuhängen (pausiert in Hintergrund-Tabs)
  setTimeout(() => { pending = false; render({ keepScroll: true }); }, 0);
};

function buildTabbar() {
  tabbar.append(...TABS.map(([id, label, ic]) => h('a.tab', { href: `#/${id}`, dataset: { tab: id }, onClick: e => {
    // erneutes Tippen auf aktiven Tab → nach oben
    if (parseHash().name === id && location.hash.split('/').length <= 2) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  } }, icon(ic, 24), h('span', label))));
}

async function boot() {
  buildTabbar();
  try {
    if (cloud.enabled) {
      await ensureLogin();
      await db.init(cloud);
      // Abmelden (auch in einem anderen Tab) → zurück zum Login
      cloud.client().auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') location.reload(); });
    } else {
      await db.init();
    }
  } catch (e) {
    app.replaceChildren(h('main.page', h('section.card.error-card', h('h3', 'Daten konnten nicht geladen werden'),
      h('p', cloud.enabled
        ? 'Keine Verbindung zur Datenbank. Bitte Internetverbindung prüfen und neu laden.'
        : 'Der Browser erlaubt keinen lokalen Speicher (z. B. im privaten Modus). Bitte in einem normalen Fenster öffnen.'),
      h('pre', String(e?.message || e)))));
    return;
  }
  db.onChange(scheduleRender);
  // Kein stilles Scheitern: unerwartete Fehler (z. B. beim Speichern) sichtbar machen
  window.addEventListener('unhandledrejection', e => {
    console.error(e.reason);
    toast(`Fehler: ${e.reason?.message || e.reason}`, { kind: 'error', ms: 4500 });
  });
  window.addEventListener('hashchange', () => render());
  // Tageswechsel, wenn die App lange offen bzw. im Hintergrund war
  let day = today();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== day) { day = today(); render({ keepScroll: true }); } });
  if (!location.hash) history.replaceState(null, '', '#/heute');
  render();
  if (cloud.enabled) {
    await finishStravaConnect();
    autoSync();
  }

  const local = ['localhost', '127.0.0.1'].includes(location.hostname) || /^(192\.168|10\.)/.test(location.hostname);
  if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/** Rückkehr von Strava: /?strava=1&code=…&state=…&scope=… → Verbindung abschließen */
async function finishStravaConnect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('strava')) return;
  history.replaceState(null, '', '/#/einstellungen/verbindungen');
  render();
  if (q.get('error') || !q.get('code')) { toast('Strava-Verbindung abgebrochen', { kind: 'error' }); return; }
  try {
    await api('integrations', { action: 'strava-finish', code: q.get('code'), state: q.get('state'), scope: q.get('scope') || '' });
    toast('Strava verbunden');
    render();
  } catch (e) {
    toast(e.message, { kind: 'error', ms: 4500 });
  }
}

boot();
