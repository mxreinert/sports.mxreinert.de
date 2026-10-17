// Setup-Overlay: Startwerte beim ersten Start, neue Phase (z. B. Cut ab Januar) und Nachfrage, wenn eine Phase abgelaufen ist.
// Alte Daten bleiben immer erhalten – eine Phase legt nur neue Versionen ab ihrem Startdatum an.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { btn, numField, dateField, textField, toggle, dayPicker, toast } from '../ui/kit.js';
import { activityRings } from '../ui/rings.js';
import * as db from '../store/db.js';
import { snap } from '../store/db.js';
import { loadDemo } from '../store/demo.js';
import { enabled as online } from '../store/cloud.js';
import { coachAt, ringsAt } from '../lib/engine.js';
import { phaseStatus, setupNeeded } from '../lib/phases.js';
import { addDays, today } from '../lib/dates.js';
import { dateFull, dateLong, num } from '../lib/format.js';
import { PHASES, PHASE, RINGS, WEEKDAYS } from '../config.js';

let open = false;
let laterThisSession = false;

/** Nach jedem Zeichnen aufrufen: öffnet das Setup, wenn noch keine Phase existiert oder die Phase abgelaufen ist. */
export function maybeOpenSetup() {
  if (open) return;
  const need = setupNeeded(snap.phases, today());
  if (need === 'first' || (need === 'expired' && !laterThisSession)) openSetup(need);
}

/**
 * mode: 'first' (erster Start, nicht abbrechbar) · 'expired' (Phase abgelaufen) · 'new' (neue Phase aus den Einstellungen)
 */
export function openSetup(mode = 'first') {
  if (open) return;
  open = true;
  const now = today();
  const st = phaseStatus(snap.phases, now);
  const last = [...snap.phases].sort((a, b) => a.start.localeCompare(b.start)).pop();
  // Neue Phase frühestens am Tag nach dem Start der letzten Phase
  const minStart = last ? addDays(last.start, 1) : null;
  const defStart = minStart && minStart > now ? (last.end && last.end >= now ? addDays(last.end, 1) : minStart) : now;
  const c = coachAt(snap, defStart);
  const r = ringsAt(snap, defStart);

  const state = {
    phase: mode === 'first' ? 'bulk' : st.phase?.phase || c.phase || 'bulk',
    start: defStart,
    end: addDays(defStart, 7 * 12 - 1),
    gymDays: [...r.gym.days],
    runDays: [...r.run.days],
    checkMacros: !!c.check_macros,
  };

  const F = {
    kcal: numField({ label: 'kcal-Ziel', unit: 'kcal', value: c.kcal, min: 800, max: 10000, placeholder: 'z. B. 3000', big: true }),
    kcal_tol: numField({ label: 'Toleranz grün', unit: '± kcal', value: c.kcal_tol, min: 0, max: 2000 }),
    kcal_tol_yellow: numField({ label: 'Toleranz gelb', unit: '± kcal', value: c.kcal_tol_yellow, min: 0, max: 3000 }),
    protein: numField({ label: 'Protein', unit: 'g', value: c.protein, min: 0, max: 600, placeholder: 'z. B. 170' }),
    protein_tol_yellow: numField({ label: 'Protein gelb bis', unit: '− g', value: c.protein_tol_yellow, min: 0, max: 200, hint: 'Vorschlag: 15 g' }),
    carbs: numField({ label: 'Kohlenhydrate', unit: 'g', value: c.carbs, min: 0, max: 1500 }),
    fat: numField({ label: 'Fett', unit: 'g', value: c.fat, min: 0, max: 600 }),
    gym_goal: numField({ label: 'Gym-Sessions', unit: '/ Woche', value: c.gym_goal, min: 0, max: 14 }),
    run_goal: numField({ label: 'Läufe', unit: '/ Woche', value: c.run_goal, min: 0, max: 14 }),
    nutrition_goal: numField({ label: 'Grüne Tage', unit: '/ Woche', value: c.nutrition_goal, min: 0, max: 7 }),
    weigh_goal: numField({ label: 'Wiegungen', unit: '/ Woche', value: c.weigh_goal, min: 0, max: 7 }),
  };
  const startF = dateField({ label: 'Start', value: state.start, min: minStart || undefined });
  const endF = dateField({ label: 'Geplantes Ende', value: state.end });
  const note = textField({ label: 'Notiz (optional)', placeholder: 'z. B. „Mit Coachin besprochen am 15.10.“' });

  const steps = [];
  if (mode === 'first') steps.push(welcomeStep);
  if (mode === 'expired') steps.push(expiredStep);
  steps.push(phaseStep, nutritionStep, goalsStep, summaryStep);
  let i = 0;

  const body = h('div.setup-body');
  const dots = h('div.setup-dots');
  const backBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Zurück', onClick: () => go(i - 1) }, icon('chevL', 20));
  const closeBtn = mode !== 'first' ? h('button.icon-btn', { type: 'button', 'aria-label': 'Schließen', onClick: () => close() }, icon('x', 18)) : h('span');
  const foot = h('div.setup-foot');
  const root = h('div.setup-root', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Setup' },
    h('div.setup-panel', h('div.setup-top', backBtn, dots, closeBtn), body, foot));
  document.body.append(root);
  document.body.classList.add('no-scroll');
  void root.offsetWidth; // Reflow erzwingen, damit die Einblendung startet
  root.classList.add('in');

  function go(n) {
    // Eingaben der aktuellen Seite prüfen, bevor es weitergeht
    if (n > i && steps[i].validate && !steps[i].validate()) return;
    i = Math.max(0, Math.min(steps.length - 1, n));
    const step = steps[i]();
    body.replaceChildren(h('div.setup-step', step.content));
    body.scrollTop = 0;
    foot.replaceChildren(...[step.foot].flat().filter(Boolean));
    backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    dots.replaceChildren(...steps.map((_, k) => h('span', { class: k === i ? 'on' : k < i ? 'done' : '' })));
  }
  const next = (label = 'Weiter') => btn(label, { cls: 'full', onClick: () => go(i + 1) });

  function close() {
    // „Später“ / Schließen: in dieser Sitzung nicht erneut nachfragen
    if (mode === 'expired') laterThisSession = true;
    root.classList.remove('in');
    setTimeout(() => {
      root.remove();
      open = false;
      if (!document.querySelector('.sheet-root')) document.body.classList.remove('no-scroll');
    }, 320);
  }

  // ---------- Schritte ----------

  function welcomeStep() {
    return {
      content: [
        h('div.setup-hero', activityRings(RINGS.map((x, k) => ({ id: x.id, progress: [0.8, 0.65, 0.9, 1][k] })), { size: 132 })),
        h('h1.setup-title', 'Willkommen bei mx sports'),
        h('p.setup-text', 'Leg einmal deine Startwerte fest: Phase, Ernährung und Wochenziele. Sie gelten bis zu einem Datum, das du bestimmst. Danach fragt dich die App nach der nächsten Phase – deine bisherigen Daten bleiben dabei immer erhalten.'),
      ],
      foot: [next('Startwerte festlegen'), online ? null : h('button.link-btn.setup-demo', { type: 'button', onClick: async e => {
        e.currentTarget.disabled = true;
        await loadDemo();
        close();
        toast('Demo-Daten geladen');
      } }, 'Erst mal mit Demo-Daten ansehen')],
    };
  }

  function expiredStep() {
    const p = st.phase;
    const ext = dateField({ label: 'Neues Ende', value: addDays(now, 28), min: now });
    return {
      content: [
        h('div.setup-icon', { style: { background: PHASE[p.phase]?.color } }, icon('history', 28)),
        h('h1.setup-title', `${PHASE[p.phase]?.label}-Phase beendet`),
        h('p.setup-text', `Geplant war sie bis ${dateLong(p.end)}. Bis du etwas Neues festlegst, gelten die bisherigen Ziele weiter – nichts geht verloren.`),
        h('div.setup-choice',
          h('div.setup-choice-title', 'Phase verlängern'),
          ext.el,
          btn('Verlängern', { kind: 'gray', cls: 'full', onClick: async () => {
            try { await db.setPhaseEnd(p.id, ext.get()); close(); toast(`Verlängert bis ${dateFull(ext.get())}`); } catch (e) { toast(e.message, { kind: 'error' }); }
          } })),
      ],
      foot: [next('Neue Phase starten'), h('button.link-btn.setup-demo', { type: 'button', onClick: () => close() }, 'Später')],
    };
  }

  function phaseStep() {
    const cards = h('div.phase-cards', PHASES.map(p => h('button.phase-card', {
      type: 'button', 'aria-pressed': String(state.phase === p.id), style: { '--pc': p.color },
      onClick: () => { state.phase = p.id; for (const b of cards.children) b.setAttribute('aria-pressed', String(b.dataset.id === p.id)); },
      dataset: { id: p.id },
    }, h('span.phase-dot'), h('div', h('b', p.label), h('div.muted', p.text)))));
    const quick = h('div.chips', [8, 12, 16, 20].map(w => h('button.chip.chip-btn', { type: 'button', onClick: () => {
      if (!startF.get()) return;
      endF.input.value = addDays(startF.get(), w * 7 - 1);
    } }, `${w} Wochen`)), h('button.chip.chip-btn', { type: 'button', onClick: () => { endF.input.value = ''; } }, 'offen'));
    return {
      content: [h('h2.setup-h', 'Welche Phase?'), cards, h('div.grid-2', startF.el, endF.el), quick,
        h('p.footnote', 'Nach dem Ende fragt dich die App, wie es weitergeht. Eine laufende Phase endet automatisch am Tag vor dem neuen Start.')],
      foot: next(),
    };
  }
  phaseStep.validate = () => {
    state.start = startF.get();
    state.end = endF.get();
    if (!state.start) return err('Bitte ein Startdatum wählen.');
    if (minStart && state.start < minStart) return err(`Start frühestens am ${dateFull(minStart)}.`);
    if (state.end && state.end < state.start) return err('Das Ende muss nach dem Start liegen.');
    return true;
  };

  function nutritionStep() {
    const macroWrap = h('div.grid-2', F.carbs.el, F.fat.el);
    return {
      content: [h('h2.setup-h', 'Ernährung'), h('p.setup-text.small', 'Werte von deiner Coachin. Toleranzen bestimmen, wann ein Tag grün oder gelb ist.'),
        F.kcal.el, h('div.grid-2', F.kcal_tol.el, F.kcal_tol_yellow.el), h('div.grid-2', F.protein.el, F.protein_tol_yellow.el),
        h('div.toggle-row', h('div', h('b', 'KH & Fett prüfen'), h('div.muted', 'Makros zählen für grüne Tage')), toggle(state.checkMacros, v => { state.checkMacros = v; })),
        macroWrap],
      foot: next(),
    };
  }
  nutritionStep.validate = () => {
    if (!['kcal', 'kcal_tol', 'kcal_tol_yellow', 'protein', 'protein_tol_yellow', 'carbs', 'fat'].every(k => F[k].validate())) return err('Bitte die rot markierten Werte prüfen.');
    if (F.kcal.get() == null || F.protein.get() == null) return err('kcal und Protein werden für die Ringe gebraucht.');
    if ((F.kcal_tol_yellow.get() ?? 0) < (F.kcal_tol.get() ?? 0)) return err('Gelb-Toleranz muss ≥ Grün-Toleranz sein.');
    return true;
  };

  function goalsStep() {
    return {
      content: [h('h2.setup-h', 'Wochenziele'),
        h('div.grid-2', F.gym_goal.el, F.run_goal.el, F.nutrition_goal.el, F.weigh_goal.el),
        h('div.field', h('span.field-label', 'Gym-Tage'), dayPicker(WEEKDAYS, state.gymDays, v => { state.gymDays = v; })),
        h('div.field', h('span.field-label', 'Lauftage'), dayPicker(WEEKDAYS, state.runDays, v => { state.runDays = v; }))],
      foot: next(),
    };
  }
  goalsStep.validate = () => (['gym_goal', 'run_goal', 'nutrition_goal', 'weigh_goal'].every(k => F[k].validate()) ? true : err('Bitte die Wochenziele prüfen.'));

  function summaryStep() {
    const p = PHASE[state.phase];
    const v = k => F[k].get();
    return {
      content: [h('h2.setup-h', 'Alles richtig?'),
        h('div.summary', { style: { '--pc': p.color } },
          h('div.summary-head', h('span.phase-dot'), h('b', p.label), h('span.muted', `${dateFull(state.start)} – ${state.end ? dateFull(state.end) : 'offen'}`)),
          h('div.summary-grid',
            kv('kcal', `${num(v('kcal'))} ± ${v('kcal_tol') ?? 0}`), kv('Protein', `${num(v('protein'))} g`),
            kv('KH / Fett', state.checkMacros ? `${num(v('carbs'))} / ${num(v('fat'))} g` : 'nicht geprüft'),
            kv('Gym', `${v('gym_goal') ?? 0}× / Woche`), kv('Laufen', `${v('run_goal') ?? 0}× / Woche`),
            kv('Grüne Tage', `${v('nutrition_goal') ?? 0} / Woche`), kv('Wiegen', `${v('weigh_goal') ?? 0}× / Woche`))),
        note.el,
        state.start > now ? h('p.footnote', `Geplant: Bis ${dateFull(addDays(state.start, -1))} gelten deine bisherigen Ziele.`) : null],
      foot: btn(state.start > now ? 'Phase planen' : 'Phase starten', { cls: 'full', onClick: save }),
    };
  }

  go(0);

  async function save() {
    const coach = { ...c };
    for (const k of ['id', 'created_at', 'valid_from', 'phase_id', 'note']) delete coach[k];
    for (const [k, f] of Object.entries(F)) coach[k] = f.get() ?? (k.endsWith('_goal') || k.includes('tol') ? 0 : null);
    coach.check_macros = state.checkMacros;
    const sameDays = (a, b) => [...a].sort().join() === [...b].sort().join();
    let rings = null;
    if (!sameDays(state.gymDays, r.gym.days) || !sameDays(state.runDays, r.run.days)) {
      const { id, created_at, valid_from, phase_id, note: _n, ...rest } = structuredClone(r);
      rings = { ...rest, gym: { ...rest.gym, days: state.gymDays }, run: { ...rest.run, days: state.runDays } };
    }
    try {
      await db.startPhase({ phase: state.phase, start: state.start, end: state.end, note: note.get(), coach, rings });
      close();
      toast(state.start > now ? `${PHASE[state.phase].label} ab ${dateFull(state.start)} geplant` : `${PHASE[state.phase].label}-Phase gestartet`);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  }
}

const kv = (l, v) => h('div.summary-kv', h('span', l), h('b', v));
function err(msg) { toast(msg, { kind: 'error' }); return false; }
