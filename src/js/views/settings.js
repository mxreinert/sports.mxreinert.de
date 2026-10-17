// Einstellungen: Phasen, Coach-Ziele, Ringe & Plan, Volumen, Übungs-Zuordnung, Hevy-Gruppen, Pausen-Wochen, Verbindungen, Daten.
// Ziele, Ring-Regeln und Volumen-Ziele sind versioniert: Speichern legt immer eine neue Version mit "gültig ab" an.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import {
  btn, card, cardHead, largeTitle, group, row, seg, toggle, numField, textField, dateField, selectField,
  dayPicker, sheet, toast, confirmSheet, chip, empty, iconBtn,
} from '../ui/kit.js';
import * as db from '../store/db.js';
import { loadDemo } from '../store/demo.js';
import { coachAt, ringsAt, musclesAt, lookupOf, weekOf } from '../lib/engine.js';
import { musclesOf } from '../lib/training.js';
import { sortVersions } from '../lib/versions.js';
import { dateFull, num, kw, weekRange, slug } from '../lib/format.js';
import { today } from '../lib/dates.js';
import {
  APP, BASE_DATE, PHASE, MUSCLES, MUSCLE_LABEL, HEVY_GROUPS, HEVY_GROUP_LABEL, DEFAULT_GROUP_MAP, WEEKDAYS, RINGS, EXCEPTION_REASONS,
} from '../config.js';
import { openException } from './week.js';
import { infoNote, phaseCard } from './common.js';
import * as cloud from '../store/cloud.js';
import { openSetup } from './setup.js';
import { phaseAt, phaseStatus } from '../lib/phases.js';

const WHERE = cloud.enabled ? 'online (auf allen Geräten)' : 'in diesem Browser';
const PAGES = { phasen, coach, ringe, volumen, uebungen, gruppen, pausen, verbindungen, daten };
const back = go => iconBtn('chevL', { label: 'Zurück', onClick: () => go('#/einstellungen'), cls: 'back-btn' });
const phaseLabel = id => PHASE[id]?.label || id;
const validFromLabel = v => (v.valid_from === BASE_DATE ? 'Startwerte (Basis)' : `ab ${dateFull(v.valid_from)}`);

export function renderSettings(root, ctx) {
  const page = PAGES[ctx.params[0]];
  if (page) return page(root, ctx);

  const { snap, now, go } = ctx;
  const c = coachAt(snap, now);
  const missing = exerciseList(snap).filter(e => e.m.source === 'fehlt').length;
  root.append(largeTitle('Einstellungen'));
  const ps = phaseStatus(snap.phases, now);
  root.append(group([
    row({ iconName: 'history', color: ps.phase ? PHASE[ps.phase.phase].color : '#8e8e93', title: 'Phasen', sub: ps.phase ? `${phaseLabel(ps.phase.phase)} ${ps.phase.end ? `bis ${dateFull(ps.phase.end)}` : 'ohne Enddatum'}${ps.next ? ` · danach ${phaseLabel(ps.next.phase)}` : ''}` : 'Noch keine Phase', chevron: true, onClick: () => go('#/einstellungen/phasen') }),
    row({ iconName: 'target', color: '#ff375f', title: 'Coach-Ziele', sub: `${phaseLabel(c.phase)} · ${c.kcal ? `${num(c.kcal)} kcal` : 'kcal fehlt'} · ${c.protein ? `${c.protein} g Protein` : 'Protein fehlt'}`, chevron: true, onClick: () => go('#/einstellungen/coach') }),
    row({ iconName: 'today', color: '#30d158', title: 'Ringe & Trainingsplan', sub: 'Regeln, Trainingstage, Wochenstart', chevron: true, onClick: () => go('#/einstellungen/ringe') }),
    row({ iconName: 'muscle', color: '#ff9f0a', title: 'Volumen-Ziele', sub: 'Sätze pro Muskelgruppe', chevron: true, onClick: () => go('#/einstellungen/volumen') }),
  ], { header: 'Ziele (versioniert)' }));
  root.append(group([
    row({ iconName: 'dumbbell', color: '#5e5ce6', title: 'Übungs-Zuordnung', sub: 'Muskelgruppen & Hauptübungen', value: missing ? h('span.badge', String(missing)) : null, chevron: true, onClick: () => go('#/einstellungen/uebungen') }),
    row({ iconName: 'layers', color: '#64d2ff', title: 'Hevy-Muskelgruppen', sub: 'Hevy-Gruppe → App-Gruppe', chevron: true, onClick: () => go('#/einstellungen/gruppen') }),
    row({ iconName: 'pause', color: '#8e8e93', title: 'Pausen-Wochen', sub: 'Deload, Krankheit, Urlaub', value: snap.exceptions.length ? String(snap.exceptions.length) : null, chevron: true, onClick: () => go('#/einstellungen/pausen') }),
  ], { header: 'Training' }));
  root.append(group([
    row({ iconName: 'link', color: '#ff2d55', title: 'Hevy & Strava', sub: 'ab Phase 2 (online)', chevron: true, onClick: () => go('#/einstellungen/verbindungen') }),
    row({ iconName: 'database', color: '#0a84ff', title: 'Daten', sub: 'Export, Import, Demo-Daten, Löschen', chevron: true, onClick: () => go('#/einstellungen/daten') }),
  ], { header: 'Verbindungen & Daten' }));
  if (cloud.enabled) {
    const email = h('span.muted', '…');
    cloud.session().then(s => { email.textContent = s?.user.email || ''; });
    root.append(group([
      row({ iconName: 'link', color: '#30d158', title: 'Angemeldet', sub: email }),
      row({ iconName: 'x', color: '#ff453a', title: 'Abmelden', danger: true, onClick: async () => {
        if (await confirmSheet('Auf diesem Gerät abmelden?', { title: 'Abmelden', ok: 'Abmelden', danger: true })) await cloud.signOut();
      } }),
    ], { header: 'Konto', footer: 'Anmeldung mit Passwort und 2FA. Deine Daten liegen geschützt in Supabase (EU).' }));
  }
  root.append(h('p.footnote.center', `${APP.name} ${APP.version} · ${cloud.enabled ? 'Online – synchron auf allen Geräten' : 'Lokaler Testmodus – Daten nur in diesem Browser'}`));
}

// ---------- Phasen ----------

function phasen(root, { snap, now, go }) {
  root.append(largeTitle('Phasen', { left: back(go), sub: 'Bulk, Cut, Maintenance – mit Start und Ende' }));
  const current = phaseCard(snap, now);
  if (current) root.append(current);
  const st = phaseStatus(snap.phases, now);
  root.append(h('div.btn-row',
    btn('Neue Phase starten', { iconName: 'plus', cls: 'grow', onClick: () => openSetup('new') }),
    st.phase ? btn('Ende ändern', { kind: 'gray', onClick: () => editEnd(st.phase) }) : null));
  root.append(infoNote('Eine neue Phase legt ab ihrem Start neue Ziele an. Bis dahin und für alle alten Wochen gelten weiter die damaligen Werte – es wird nichts gelöscht. Startet die neue Phase vor dem geplanten Ende, endet die laufende Phase am Vortag.', 'history'));
  const list = [...snap.phases].sort((a, b) => b.start.localeCompare(a.start));
  root.append(group(list.length ? list.map(p => {
    const v = snap.coach.find(x => x.phase_id === p.id);
    const status = p.start > now ? 'geplant' : p === st.phase ? (st.status === 'expired' ? 'abgelaufen' : 'aktiv') : 'beendet';
    return row({
      iconName: 'history', color: PHASE[p.phase].color,
      title: h('span', phaseLabel(p.phase), h(`span.chip${status === 'aktiv' ? '.chip-ok' : ''}`, status)),
      sub: [`${dateFull(p.start)} – ${p.end ? dateFull(p.end) : 'offen'}`, v ? `${num(v.kcal)} kcal · ${v.protein} g P${v.check_macros ? ` · ${v.carbs} KH / ${v.fat} F` : ''}` : null, p.note].filter(Boolean).join(' · '),
      right: status === 'geplant' ? iconBtn('trash', { label: 'Geplante Phase löschen', onClick: async e => {
        e.stopPropagation();
        if (!(await confirmSheet(`Geplante ${phaseLabel(p.phase)}-Phase ab ${dateFull(p.start)} löschen? Ihre Ziele werden mit entfernt.`, { title: 'Phase löschen', ok: 'Löschen', danger: true }))) return;
        try { await db.deletePlannedPhase(p.id); toast('Phase gelöscht'); } catch (err) { toast(err.message, { kind: 'error' }); }
      } }) : null,
    });
  }) : [row({ title: h('span.muted', 'Noch keine Phase') })], { header: 'Alle Phasen' }));
}

function editEnd(p) {
  const end = dateField({ label: 'Geplantes Ende', value: p.end || '', min: p.start });
  const s = sheet({
    title: `${phaseLabel(p.phase)}: Ende`, size: 'sm',
    body: h('div.form', h('div.sheet-sub', `Start ${dateFull(p.start)}`), end.el, h('p.footnote', 'Leer lassen = ohne Enddatum.')),
    footer: h('div.btn-row', btn('Speichern', { cls: 'grow', onClick: async () => {
      try { await db.setPhaseEnd(p.id, end.get()); s.close(); toast('Ende gespeichert'); } catch (e) { toast(e.message, { kind: 'error' }); }
    } })),
  });
}

// ---------- Coach-Ziele ----------

function coach(root, { snap, now, go }) {
  const cur = coachAt(snap, now);
  const curV = sortVersions(snap.coach).find(v => v.valid_from <= now);
  root.append(largeTitle('Coach-Ziele', { left: back(go), sub: 'Was die Coachin vorgibt' }));
  root.append(infoNote('Jede Änderung wird als neue Version mit „gültig ab“ gespeichert. Alte Wochen werden weiter mit den Zielen bewertet, die damals galten.', 'history'));

  let checkMacros = !!cur.check_macros;
  const F = {
    kcal: numField({ label: 'kcal-Ziel', unit: 'kcal', value: cur.kcal, min: 800, max: 10000, placeholder: 'von Coachin' }),
    kcal_tol: numField({ label: 'Toleranz grün', unit: '± kcal', value: cur.kcal_tol, min: 0, max: 2000 }),
    kcal_tol_yellow: numField({ label: 'Toleranz gelb', unit: '± kcal', value: cur.kcal_tol_yellow, min: 0, max: 3000 }),
    protein: numField({ label: 'Protein', unit: 'g', value: cur.protein, min: 0, max: 600, placeholder: 'von Coachin' }),
    protein_tol_yellow: numField({ label: 'Protein gelb bis', unit: '− g', value: cur.protein_tol_yellow, min: 0, max: 200 }),
    carbs: numField({ label: 'Kohlenhydrate', unit: 'g', value: cur.carbs, min: 0, max: 1500 }),
    fat: numField({ label: 'Fett', unit: 'g', value: cur.fat, min: 0, max: 600 }),
    macro_tol: numField({ label: 'Makros grün', unit: '± g', value: cur.macro_tol, min: 0, max: 300 }),
    macro_tol_yellow: numField({ label: 'Makros gelb', unit: '± g', value: cur.macro_tol_yellow, min: 0, max: 500 }),
    gym_goal: numField({ label: 'Gym-Sessions', unit: '/ Woche', value: cur.gym_goal, min: 0, max: 14 }),
    run_goal: numField({ label: 'Läufe', unit: '/ Woche', value: cur.run_goal, min: 0, max: 14 }),
    nutrition_goal: numField({ label: 'Grüne Tage', unit: '/ Woche', value: cur.nutrition_goal, min: 0, max: 7 }),
    weigh_goal: numField({ label: 'Wiegungen', unit: '/ Woche', value: cur.weigh_goal, min: 0, max: 7 }),
  };
  const macroWrap = h('div.grid-2', F.macro_tol.el, F.macro_tol_yellow.el);
  macroWrap.hidden = !checkMacros;
  const validFrom = dateField({ label: 'Gültig ab', value: now });
  const note = textField({ label: 'Notiz', placeholder: 'z. B. „Von Coachin am 15.10. besprochen: +150 kcal“', multiline: true, rows: 2 });

  root.append(card(cardHead('Neue Version', { sub: curV ? `aktuell: ${validFromLabel(curV)}` : null }),
    h('div.form',
      h('p.footnote', 'Für Anpassungen innerhalb der Phase (z. B. +150 kcal). Neue Phase (z. B. Cut) unter „Phasen“ starten.'),
      h('div.form-sec', 'Ernährung'),
      F.kcal.el,
      h('div.grid-2', F.kcal_tol.el, F.kcal_tol_yellow.el),
      h('div.grid-2', F.protein.el, F.protein_tol_yellow.el),
      h('div.grid-2', F.carbs.el, F.fat.el),
      h('div.toggle-row', h('div', h('b', 'KH & Fett prüfen'), h('div.muted', 'Makros zählen für grüne Tage')), toggle(checkMacros, v => { checkMacros = v; macroWrap.hidden = !v; })),
      macroWrap,
      h('div.form-sec', 'Wochenziele'),
      h('div.grid-2', F.gym_goal.el, F.run_goal.el, F.nutrition_goal.el, F.weigh_goal.el),
      h('div.form-sec', 'Version'),
      validFrom.el, note.el,
      btn('Als neue Version speichern', { cls: 'full', onClick: async () => {
        if (!Object.values(F).every(f => f.validate())) { toast('Bitte die rot markierten Werte prüfen', { kind: 'error' }); return; }
        if (!validFrom.get()) { toast('Bitte „gültig ab“ wählen', { kind: 'error' }); return; }
        const data = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, f.get()]));
        for (const k of ['kcal_tol', 'kcal_tol_yellow', 'protein_tol_yellow', 'macro_tol', 'macro_tol_yellow', 'gym_goal', 'run_goal', 'nutrition_goal', 'weigh_goal']) data[k] ??= 0;
        if (data.kcal_tol_yellow < data.kcal_tol) { toast('Gelb-Toleranz muss ≥ Grün-Toleranz sein', { kind: 'error' }); return; }
        const phase = phaseAt(snap.phases, validFrom.get())?.phase ?? cur.phase;
        await db.addVersion('coach', { valid_from: validFrom.get(), phase, phase_id: phaseAt(snap.phases, validFrom.get())?.id, check_macros: checkMacros, note: note.get(), ...data });
        toast(`Neue Version ab ${dateFull(validFrom.get())} gespeichert`);
      } }))));

  root.append(versionHistory(snap.coach, v => `${phaseLabel(v.phase)} · ${v.kcal ? `${num(v.kcal)} kcal ±${v.kcal_tol}` : 'kein kcal-Ziel'} · ${v.protein ? `${v.protein} g P` : '–'}${v.check_macros ? ` · ${v.carbs ?? '–'} KH / ${v.fat ?? '–'} F` : ''} · Gym ${v.gym_goal} · Lauf ${v.run_goal} · Grün ${v.nutrition_goal} · Waage ${v.weigh_goal}`, 'coach', now));
}

function versionHistory(versions, summary, kind, now) {
  const list = sortVersions(versions);
  const active = list.find(v => v.valid_from <= now);
  return group(list.map(v => row({
    title: h('span', validFromLabel(v), v === active ? h('span.chip.chip-ok', 'aktiv') : v.valid_from > now ? h('span.chip', 'geplant') : null),
    sub: [summary(v), v.note].filter(Boolean).join(' — '),
    right: v.valid_from !== BASE_DATE ? iconBtn('trash', { label: 'Version löschen', onClick: async e => {
      e.stopPropagation();
      if (!(await confirmSheet(`Version ${validFromLabel(v)} löschen? Nur für Korrekturen gedacht – betroffene Wochen werden dann mit der vorherigen Version bewertet.`, { title: 'Version löschen', ok: 'Löschen', danger: true }))) return;
      await db.deleteVersion(kind, v.id);
      toast('Version gelöscht');
    } }) : null,
  })), { header: 'Verlauf aller Versionen', footer: 'Neueste oben. Die Basis-Version gilt für alles vor der ersten Änderung.' });
}

// ---------- Ringe & Plan ----------

function ringe(root, { snap, now, go }) {
  const r = structuredClone(ringsAt(snap, now));
  root.append(largeTitle('Ringe & Plan', { left: back(go) }));

  const f = (path, label, unit, min, max, dec = false) => {
    const [ring, key] = path.split('.');
    const fld = numField({ label, unit, value: r[ring][key], min, max, decimals: dec });
    fld.input.addEventListener('input', () => { r[ring][key] = fld.get(); });
    fields.push(fld);
    return fld.el;
  };
  const fields = [];
  const tog = (ring, key, label, sub) => h('div.toggle-row', h('div', h('b', label), sub ? h('div.muted', sub) : null), toggle(r[ring][key], v => { r[ring][key] = v; }));

  root.append(card(cardHead('Gym', { iconName: 'dumbbell', color: 'var(--gym)' }),
    tog('gym', 'active', 'Ring anzeigen'),
    h('div.grid-2', f('gym.min_duration', 'Mindestdauer', 'min', 0, 300), f('gym.min_sets', 'Mind. Arbeitssätze', 'Sätze', 0, 100), f('gym.max_per_day', 'Max. pro Tag', 'Sessions', 0, 5)),
    tog('gym', 'allow_over', 'Über 100 % erlaubt'),
    h('div.field', h('span.field-label', 'Geplante Trainingstage'), dayPicker(WEEKDAYS, r.gym.days, v => { r.gym.days = v; }))));

  root.append(card(cardHead('Laufen', { iconName: 'run', color: 'var(--run)' }),
    tog('run', 'active', 'Ring anzeigen'),
    h('div.grid-2', f('run.min_duration', 'Mindestdauer', 'min', 0, 300), f('run.min_km', 'oder Mindestdistanz', 'km', 0, 100, true)),
    tog('run', 'allow_over', 'Über 100 % erlaubt'),
    h('div.field', h('span.field-label', 'Geplante Lauftage'), dayPicker(WEEKDAYS, r.run.days, v => { r.run.days = v; }))));

  root.append(card(cardHead('Ernährung', { iconName: 'food', color: 'var(--nutrition)' }),
    tog('nutrition', 'active', 'Ring anzeigen'),
    tog('nutrition', 'yellow', '„Gelber Tag“ = halber Punkt', 'Knapp verfehlt (Toleranz gelb) zählt ½'),
    tog('nutrition', 'allow_over', 'Über 100 % erlaubt'),
    h('p.footnote', 'kcal-/Protein-Ziele, Toleranzen und „grüne Tage pro Woche“ stehen in den Coach-Zielen.')));

  root.append(card(cardHead('Wiegen', { iconName: 'scale', color: 'var(--weigh)' }),
    tog('weigh', 'active', 'Ring anzeigen'),
    tog('weigh', 'allow_over', 'Über 100 % erlaubt')));

  const validFrom = dateField({ label: 'Gültig ab', value: now });
  root.append(card(cardHead('Speichern'),
    h('div.form', validFrom.el, h('p.footnote', 'Ring-Regeln gelten wochenweise: Maßgeblich ist die Version, die am ersten Tag einer Woche gültig ist.'),
      btn('Als neue Version speichern', { cls: 'full', onClick: async () => {
        if (!fields.every(x => x.validate())) { toast('Bitte die rot markierten Werte prüfen', { kind: 'error' }); return; }
        if (!validFrom.get()) { toast('Bitte „gültig ab“ wählen', { kind: 'error' }); return; }
        for (const ring of ['gym', 'run']) for (const k of ['min_duration', 'min_sets', 'max_per_day', 'min_km']) if (k in r[ring]) r[ring][k] ??= 0;
        const { id, created_at, valid_from, note, ...rest } = r;
        await db.addVersion('rings', { ...rest, valid_from: validFrom.get(), note: 'Geändert in der App' });
        toast('Ring-Regeln gespeichert');
      } }))));

  // Allgemein (nicht versioniert)
  root.append(group([
    row({ title: 'Wochenstart', right: seg([[1, 'Montag'], [0, 'Sonntag']], snap.settings.week_start, v => db.saveSettings({ week_start: v }), { small: true }) }),
    row({ title: 'Erinnerung ab', right: seg([[20, '20 Uhr'], [21, '21 Uhr'], [22, '22 Uhr']], snap.settings.reminder_hour ?? 21, v => db.saveSettings({ reminder_hour: v }), { small: true }) }),
  ], { header: 'Allgemein', footer: 'Wochenstart ändert die Wochengrenzen für alle Wochen. Push-Erinnerungen kommen in Phase 2; bis dahin erscheint ein Hinweis im Dashboard.' }));

  root.append(versionHistory(snap.rings, v => `Gym ≥${v.gym?.min_duration} min/≥${v.gym?.min_sets} Sätze · Lauf ≥${v.run?.min_duration} min o. ${num(v.run?.min_km, 1)} km`, 'rings', now));
}

// ---------- Volumen ----------

function volumen(root, { snap, now, go }) {
  const m = structuredClone(musclesAt(snap, now));
  root.append(largeTitle('Volumen-Ziele', { left: back(go), sub: 'Arbeitssätze pro Woche' }));
  const fields = [];
  root.append(card(
    h('div.vol-grid',
      h('div.vol-head', h('span', 'Muskel'), h('span', 'Min'), h('span', 'Max')),
      MUSCLES.map(mu => {
        const [mn, mx] = m.targets[mu.id] || [0, 0];
        const a = numField({ value: mn, min: 0, max: 60, label: `${mu.label} min` });
        const b = numField({ value: mx, min: 0, max: 60, label: `${mu.label} max` });
        fields.push([mu.id, a, b]);
        return h('div.vol-row', h('span.vol-name', mu.label), a.el, b.el);
      }))));
  let mode = m.primary_only ? 'primary' : 'half';
  root.append(card(cardHead('Zählregeln'),
    h('div.field', h('span.field-label', 'Sekundärmuskel'), seg([['half', '½ Satz'], ['primary', 'Nur Primärmuskel']], mode, v => { mode = v; })),
    h('p.footnote', 'Aufwärmsätze zählen nie. Arbeitssätze = normal, failure, dropset (so markiert Hevy die Satztypen).')));
  const validFrom = dateField({ label: 'Gültig ab', value: now });
  root.append(card(h('div.form', validFrom.el, btn('Als neue Version speichern', { cls: 'full', onClick: async () => {
    const targets = {};
    for (const [id, a, b] of fields) {
      if (!a.validate() || !b.validate()) { toast('Bitte Werte prüfen', { kind: 'error' }); return; }
      const lo = a.get() ?? 0, hi = b.get() ?? 0;
      if (hi < lo) { toast(`${MUSCLE_LABEL[id]}: Max muss ≥ Min sein`, { kind: 'error' }); return; }
      targets[id] = [lo, hi];
    }
    if (!validFrom.get()) { toast('Bitte „gültig ab“ wählen', { kind: 'error' }); return; }
    await db.addVersion('muscles', { valid_from: validFrom.get(), targets, secondary_factor: 0.5, primary_only: mode === 'primary', note: 'Geändert in der App' });
    toast('Volumen-Ziele gespeichert');
  } }))));
  root.append(versionHistory(snap.muscles, v => `${v.primary_only ? 'nur Primär' : 'Sekundär ½'} · Brust ${v.targets?.chest?.join('–')} · Rücken ${v.targets?.back?.join('–')} · Quads ${v.targets?.quads?.join('–')}`, 'muscles', now));
}

// ---------- Übungs-Zuordnung ----------

const uState = { filter: 'all' };

function exerciseList(snap) {
  const lookup = lookupOf(snap);
  const used = new Map();
  for (const w of snap.workouts) for (const e of w.exercises) {
    const u = used.get(e.template_id) || { id: e.template_id, title: e.title, count: 0, last: w.date };
    u.count++; u.last = w.date;
    used.set(e.template_id, u);
  }
  for (const m of Object.values(snap.mappings)) if (!used.has(m.template_id)) used.set(m.template_id, { id: m.template_id, title: m.title || snap.templates[m.template_id]?.title || m.template_id, count: 0 });
  return [...used.values()].map(u => ({ ...u, title: snap.templates[u.id]?.title || u.title, m: musclesOf(u.id, lookup), map: snap.mappings[u.id], tpl: snap.templates[u.id] }))
    .sort((a, b) => (b.m.source === 'fehlt') - (a.m.source === 'fehlt') || a.title.localeCompare(b.title));
}

function uebungen(root, { snap, go, rerender }) {
  root.append(largeTitle('Übungs-Zuordnung', { left: back(go), sub: 'Eigene Zuordnung hat Vorrang vor Hevy' }));
  const all = exerciseList(snap);
  const filters = [['all', 'Alle'], ['fehlt', `Fehlt (${all.filter(e => e.m.source === 'fehlt').length})`], ['manuell', 'Manuell'], ['main', 'Haupt']];
  root.append(h('div.sticky-seg', seg(filters, uState.filter, v => { uState.filter = v; rerender(); }, { small: true })));
  const list = all.filter(e => uState.filter === 'all' || (uState.filter === 'main' ? e.map?.main : e.m.source === uState.filter));
  if (!all.length) { root.append(card(empty('dumbbell', 'Noch keine Übungen', 'Sobald Workouts von Hevy da sind, erscheinen hier alle Übungen.'))); return; }
  root.append(group(list.map(e => row({
    title: h('span', e.title, e.map?.main ? h('span.star', icon('sparkle', 13)) : null),
    sub: e.m.primary ? `${MUSCLE_LABEL[e.m.primary]}${e.m.secondary.length ? ` · ${e.m.secondary.map(g => MUSCLE_LABEL[g]).join(', ')} (½)` : ''}` : 'keine Muskelgruppe – zählt nicht fürs Volumen',
    value: h(`span.src.src-${e.m.source}`, e.m.source === 'hevy' ? 'Hevy' : e.m.source === 'manuell' ? 'Manuell' : 'Fehlt'),
    chevron: true, onClick: () => editExercise(snap, e),
  })), { footer: '★ = Hauptübung (für Top-Sätze und 1RM-Verlauf in Berichten).' }));
}

function editExercise(snap, e) {
  const hevyM = musclesOf(e.id, { ...lookupOf(snap), mappings: {} });
  let primary = e.map?.primary || e.m.primary || '';
  const secondary = new Set(e.map?.primary ? e.map.secondary || [] : e.m.secondary);
  let main = !!e.map?.main;
  const prim = selectField({ label: 'Primärmuskel (1 Satz)', value: primary, options: [['', '— keine (zählt nicht)'], ...MUSCLES.map(m => [m.id, m.label])] });
  prim.input.addEventListener('change', () => { primary = prim.get() || ''; });
  const s = sheet({
    title: e.title,
    body: h('div.form',
      h('div.sheet-sub', e.tpl ? `Hevy: ${HEVY_GROUP_LABEL[e.tpl.primary] || e.tpl.primary || '–'}${e.tpl.secondary?.length ? ` · ${e.tpl.secondary.map(g => HEVY_GROUP_LABEL[g] || g).join(', ')}` : ''}${e.tpl.custom ? ' · eigene Übung' : ''}` : 'Keine Hevy-Vorlage bekannt'),
      prim.el,
      h('div.field', h('span.field-label', 'Sekundärmuskeln (½ Satz)'),
        h('div.day-picker', MUSCLES.map(m => {
          const b = h('button.day-chip.wide', { type: 'button', 'aria-pressed': String(secondary.has(m.id)), onClick: () => { secondary.has(m.id) ? secondary.delete(m.id) : secondary.add(m.id); b.setAttribute('aria-pressed', String(secondary.has(m.id))); } }, m.label);
          return b;
        }))),
      h('div.toggle-row', h('div', h('b', 'Hauptübung'), h('div.muted', 'Top-Sätze & 1RM-Verlauf')), toggle(main, v => { main = v; })),
      hevyM.primary ? h('p.footnote', `Hevy-Zuordnung: ${MUSCLE_LABEL[hevyM.primary]}${hevyM.secondary.length ? ` · ${hevyM.secondary.map(g => MUSCLE_LABEL[g]).join(', ')}` : ''}`) : null),
    footer: h('div.btn-row',
      e.map?.primary ? btn('Hevy verwenden', { kind: 'gray', onClick: async () => {
        if (main) await db.saveMapping({ template_id: e.id, title: e.title, primary: null, secondary: [], main });
        else await db.deleteMapping(e.id);
        s.close(); toast('Zurück auf Hevy-Zuordnung');
      } }) : null,
      btn('Speichern', { cls: 'grow', onClick: async () => {
        const changedMuscles = primary !== (hevyM.primary || '') || [...secondary].sort().join() !== [...hevyM.secondary].sort().join();
        await db.saveMapping({ template_id: e.id, title: e.title, primary: changedMuscles ? primary || null : null, secondary: changedMuscles && primary ? [...secondary].filter(g => g !== primary) : [], main });
        s.close(); toast('Zuordnung gespeichert');
      } })),
  });
}

// ---------- Hevy-Gruppen ----------

function gruppen(root, { snap, go }) {
  const map = { ...DEFAULT_GROUP_MAP, ...(snap.settings.group_map || {}) };
  root.append(largeTitle('Hevy-Gruppen', { left: back(go), sub: 'Wie Hevys Muskelgruppen in deine Liste übersetzt werden' }));
  root.append(group(HEVY_GROUPS.map(([id, label]) => {
    const sel = selectField({ value: map[id] ?? '', options: [['', 'zählt nicht'], ...MUSCLES.map(m => [m.id, m.label])] });
    sel.input.addEventListener('change', async () => {
      await db.saveSettings({ group_map: { ...(snap.settings.group_map || {}), [id]: sel.get() } });
      toast(`${label} → ${sel.get() ? MUSCLE_LABEL[sel.get()] : 'zählt nicht'}`);
    });
    return row({ title: label, sub: id, right: h('div.row-select', sel.el) });
  }), { footer: 'Gilt rückwirkend für alle Wochen. Einzelne Übungen kannst du in der Übungs-Zuordnung abweichend festlegen.' }));
  root.append(h('div.center-action', btn('Auf Standard zurücksetzen', { kind: 'gray', onClick: async () => { await db.saveSettings({ group_map: {} }); toast('Standard wiederhergestellt'); } })));
}

// ---------- Pausen-Wochen ----------

function pausen(root, { snap, now, go }) {
  root.append(largeTitle('Pausen-Wochen', { left: back(go), sub: 'Ringziele reduzieren oder aussetzen' }));
  const list = [...snap.exceptions].sort((a, b) => b.week.localeCompare(a.week));
  root.append(group(list.length ? list.map(ex => row({
    iconName: 'pause', color: '#8e8e93',
    title: `${kw(ex.week)} · ${EXCEPTION_REASONS.find(r => r.id === ex.reason)?.label || 'Pause'}`,
    sub: `${weekRange(ex.week)} · ${ex.mode === 'pause' ? 'ausgesetzt' : `auf ${Math.round((ex.factor ?? 0.5) * 100)} %`} · ${ex.rings?.length ? ex.rings.map(r => RINGS.find(x => x.id === r)?.label).join(', ') : 'alle Ringe'}${ex.note ? ` · ${ex.note}` : ''}`,
    chevron: true, onClick: () => openException(ex.week, ex),
  })) : [row({ title: h('span.muted', 'Keine Pausen-Wochen') })]));
  root.append(h('div.center-action', btn('Pausen-Woche hinzufügen', { iconName: 'plus', kind: 'tinted', onClick: () => {
    const d = dateField({ label: 'Ein Tag in der Woche', value: now });
    const s = sheet({ title: 'Welche Woche?', size: 'sm', body: d.el, footer: h('div.btn-row', btn('Weiter', { cls: 'grow', onClick: () => {
      if (!d.get()) return;
      s.close();
      setTimeout(() => openException(weekOf(snap, d.get()), snap.exceptions.find(e => weekOf(snap, e.week) === weekOf(snap, d.get())) || null), 250);
    } })) });
  } })));
}

// ---------- Verbindungen ----------

function verbindungen(root, { go }) {
  root.append(largeTitle('Hevy & Strava', { left: back(go) }));
  const conn = (name, color, iconName, text, steps) => card(
    cardHead(name, { iconName, color, right: h('span.chip.chip-muted', 'Phase 2') }),
    h('p.muted', text), h('ol.steps', steps.map(s => h('li', s))));
  root.append(conn('Hevy', '#5e5ce6', 'dumbbell', 'Workouts automatisch über die offizielle Hevy-API (Hevy Pro).', [
    'API-Key unter hevy.com/settings?developer erstellen',
    'Key als Umgebungsvariable HEVY_API_KEY in Netlify hinterlegen – nie im Repo',
    'Netlify Function holt Workouts + Übungsvorlagen (täglich + beim Öffnen + per Button)',
  ]));
  root.append(conn('Strava', '#fc4c02', 'run', 'Läufe automatisch über die offizielle Strava-API (OAuth). Uhr → Strava → App.', [
    'Strava-App unter strava.com/settings/api anlegen',
    'STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET in Netlify hinterlegen',
    'Einmal verbinden – Refresh-Token wird verschlüsselt in der Datenbank gespeichert',
  ]));
  root.append(infoNote('Im lokalen Testmodus laufen keine Netlify Functions. Workouts und Läufe in den Demo-Daten sind im echten Hevy-/Strava-Format erzeugt und laufen durch dieselben Import-Funktionen.'));
}

// ---------- Daten ----------

function daten(root, { snap, go }) {
  root.append(largeTitle('Daten', { left: back(go) }));
  const counts = `${Object.keys(snap.logs).length} Tage · ${snap.workouts.length} Workouts · ${snap.runs.length} Läufe`;
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!(await confirmSheet(`„${file.name}“ importieren? Alle aktuellen Daten ${WHERE} werden ersetzt.`, { title: 'Import', ok: 'Ersetzen & importieren', danger: true }))) return;
      await db.importAll(json);
      toast('Import abgeschlossen');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'Datei ist kein gültiges JSON' : err.message, { kind: 'error' });
    }
  } });
  root.append(fileInput);
  root.append(group([
    row({ iconName: 'download', color: '#0a84ff', title: 'Alles exportieren (JSON)', sub: counts, onClick: async () => {
      const data = await db.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: slug(`mx-sports-export_${today()}.json`) });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Export heruntergeladen');
    } }),
    row({ iconName: 'upload', color: '#30d158', title: 'Import aus Datei', sub: `Ersetzt alle Daten ${WHERE}`, onClick: () => fileInput.click() }),
  ], { header: 'Sichern', footer: 'Der Export enthält alles (auch alle Versionen) und dient später zum Umzug in die Online-Datenbank.' }));
  root.append(group([
    cloud.enabled ? null : row({ iconName: 'sparkle', color: '#bf5af2', title: 'Demo-Daten laden', sub: '12 Wochen Beispieldaten im Hevy-/Strava-Format', onClick: async () => {
      if (!(await confirmSheet('Demo-Daten laden? Alle aktuellen Daten in diesem Browser werden ersetzt.', { title: 'Demo-Daten', ok: 'Laden', danger: true }))) return;
      await loadDemo();
      toast('Demo-Daten geladen');
      go('#/heute');
    } }),
    row({ iconName: 'trash', color: '#ff453a', title: 'Alle Daten löschen', danger: true, onClick: async () => {
      if (!(await confirmSheet(`Wirklich alle Daten ${WHERE} löschen? Das kann nicht rückgängig gemacht werden. Tipp: vorher exportieren.`, { title: 'Alles löschen', ok: 'Endgültig löschen', danger: true }))) return;
      await db.wipe();
      toast('Alle Daten gelöscht');
      go('#/heute');
    } }),
  ], { header: cloud.enabled ? 'Zurücksetzen' : 'Testen' }));
}
