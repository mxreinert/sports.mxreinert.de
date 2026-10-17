// Login-Overlay: E-Mail + Passwort, danach 2FA (Authenticator-App). Beim ersten Mal wird die 2FA eingerichtet.
// ensureLogin() kehrt erst zurück, wenn eine Sitzung mit 2FA (aal2) besteht.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { btn, textField, toast } from '../ui/kit.js';
import { activityRings } from '../ui/rings.js';
import * as cloud from '../store/cloud.js';
import { RINGS } from '../config.js';

export async function ensureLogin() {
  if ((await cloud.level()) === 'aal2') return;
  return new Promise(resolve => {
    const body = h('div.setup-body');
    const root = h('div.setup-root.in', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Anmelden' },
      h('div.setup-panel', body));
    document.body.append(root);
    document.body.classList.add('no-scroll');

    const show = (...content) => body.replaceChildren(h('form.setup-step.login', { onSubmit: e => e.preventDefault() }, content));
    const done = () => { root.remove(); document.body.classList.remove('no-scroll'); resolve(); };

    /** Knopf, der während der Anfrage gesperrt ist und Fehler als Toast zeigt */
    const action = (label, fn) => {
      const b = btn(label, { cls: 'full', onClick: async () => {
        b.disabled = true;
        try { await fn(); } catch (e) { toast(e.message, { kind: 'error', ms: 3500 }); } finally { b.disabled = false; }
      } });
      b.type = 'submit';
      return b;
    };

    async function afterPassword() {
      const factor = await cloud.verifiedFactor();
      if (factor) codeStep(factor.id);
      else await enrollStep();
    }

    function passwordStep() {
      const email = textField({ label: 'E-Mail' });
      email.input.type = 'email';
      email.input.autocomplete = 'username';
      const pw = textField({ label: 'Passwort' });
      pw.input.type = 'password';
      pw.input.autocomplete = 'current-password';
      show(
        h('div.setup-hero', activityRings(RINGS.map((x, k) => ({ id: x.id, progress: [0.8, 0.65, 0.9, 1][k] })), { size: 104 })),
        h('h1.setup-title', 'mx sports'),
        h('p.setup-text', 'Anmelden'),
        email.el, pw.el,
        action('Weiter', async () => {
          if (!email.get() || !pw.input.value) throw new Error('Bitte E-Mail und Passwort eingeben.');
          await cloud.signIn(email.get(), pw.input.value);
          await afterPassword();
        }));
      setTimeout(() => email.input.focus(), 50);
    }

    function codeStep(factorId) {
      const code = codeField();
      show(
        h('div.setup-icon', { style: { background: 'var(--accent)' } }, icon('target', 28)),
        h('h1.setup-title', 'Bestätigungscode'),
        h('p.setup-text', '6-stelligen Code aus deiner Authenticator-App eingeben.'),
        code.el,
        action('Anmelden', async () => {
          await cloud.verifyTotp(factorId, code.get());
          done();
        }),
        h('button.link-btn.setup-demo', { type: 'button', onClick: async () => { await cloud.signOut(); passwordStep(); } }, 'Anderes Konto'));
      setTimeout(() => code.input.focus(), 50);
    }

    async function enrollStep() {
      const { factorId, qr, secret } = await cloud.enrollTotp();
      const code = codeField();
      show(
        h('h1.setup-title', '2FA einrichten'),
        h('p.setup-text', 'Einmalig: QR-Code mit einer Authenticator-App scannen (z. B. Google Authenticator, 1Password, Apple Passwörter) und den angezeigten Code eingeben.'),
        h('div.qr', h('img', { src: qr, alt: 'QR-Code für die Authenticator-App', width: 180, height: 180 })),
        h('details.secret', h('summary', 'QR-Code geht nicht? Schlüssel manuell eingeben'), h('code', secret)),
        code.el,
        action('Bestätigen', async () => {
          await cloud.verifyTotp(factorId, code.get());
          toast('2FA eingerichtet');
          done();
        }));
    }

    function codeField() {
      const f = textField({ label: 'Code', placeholder: '123456' });
      Object.assign(f.input, { inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6 });
      f.input.classList.add('code-input');
      return { el: f.el, input: f.input, get: () => f.get().replace(/\s/g, '') };
    }

    // Schon mit Passwort angemeldet (z. B. App neu geöffnet) → direkt zum Code
    cloud.session().then(s => (s ? afterPassword() : passwordStep())).catch(() => passwordStep());
  });
}
