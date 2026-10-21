// Berichte: Zeitraum wählen → Vorschau → "PDF herunterladen" (Druckdialog mit „Als PDF sichern“).
import { h } from '../ui/h.js';
import { btn, card, iconBtn, largeTitle, seg, textField, toast } from '../ui/kit.js';
import { weekOf } from '../lib/engine.js';
import { addDays } from '../lib/dates.js';
import { kw } from '../lib/format.js';
import * as db from '../store/db.js';
import { weekNav, infoNote } from './common.js';
import { weekReport, biweeklyReport } from './report-doc.js';

const state = { kind: 'woche', ws: null };

export function renderReports(root, { snap, now, rerender, go }) {
  const current = weekOf(snap, now);
  // Standard: aktuelle Woche (Zwischenstand), ältere Wochen mit ‹
  state.ws ||= current;
  const ws = state.ws;
  const noteKey = state.kind === 'woche' ? `week:${ws}` : `questions:${ws}`;

  root.append(largeTitle('Berichte', { sub: 'Für den Coach – als PDF', left: iconBtn('chevL', { label: 'Zurück', onClick: () => go('#/einstellungen'), cls: 'back-btn' }) }));
  root.append(h('div.sticky-seg', seg([['woche', 'Wochenbericht'], ['zwei', 'Zweiwochenbericht']], state.kind, v => { state.kind = v; rerender(); })));
  root.append(weekNav(ws, {
    onPrev: () => { state.ws = addDays(ws, -7); rerender(); },
    onNext: () => { state.ws = addDays(ws, 7); rerender(); },
    onToday: () => { state.ws = current; rerender(); },
    isCurrent: ws === current,
  }));
  if (state.kind === 'zwei') root.append(h('p.footnote.center', `Woche A = ${kw(addDays(ws, -7))}, Woche B = ${kw(ws)}`));

  const text = textField({
    label: state.kind === 'woche' ? 'Anmerkung zur Woche (optional)' : 'Fragen an den Coach',
    value: snap.notes[noteKey] || '', multiline: true, rows: 3,
    placeholder: state.kind === 'woche' ? 'Erscheint unter „Notizen der Woche“' : 'z. B. „Sollen wir die kcal an Trainingstagen erhöhen?“',
  });
  let t;
  text.input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { await db.saveNote(noteKey, text.get()); refresh(); }, 500); });

  const build = () => (state.kind === 'woche'
    ? weekReport(snap, ws, { extraNote: snap.notes[noteKey] })
    : biweeklyReport(snap, ws, { questions: snap.notes[noteKey] }));
  const filename = () => (state.kind === 'woche'
    ? `Wochenbericht_${ws.slice(0, 4)}-${kw(ws).replace(' ', '')}`
    : `Zweiwochenbericht_${ws.slice(0, 4)}-${kw(addDays(ws, -7)).replace(' ', '')}-${kw(ws).replace('KW ', '')}`);

  root.append(card(text.el,
    h('div.btn-row', btn('PDF herunterladen', { iconName: 'download', cls: 'grow', onClick: () => printDoc(build(), filename()) }))));
  root.append(infoNote('Im Druckdialog „Als PDF speichern“ wählen (am iPhone: Teilen → Drucken → zweimal antippen → Teilen/Sichern). Der Dateiname ist schon vorbereitet.'));

  // Vorschau, auf Bildschirmbreite skaliert
  const scaler = h('div.doc-scaler');
  const holder = h('div.doc-holder', scaler);
  const refresh = () => scaler.replaceChildren(build());
  refresh();
  // Nur bei echten Größenänderungen neu skalieren – sonst löst das eigene Setzen der Höhe eine Schleife aus
  let last = '';
  const ro = new ResizeObserver(() => {
    if (!scaler.firstElementChild) return;
    const scale = Math.min(1, holder.clientWidth / 794);
    const height = Math.round(scaler.offsetHeight * scale);
    const key = `${scale}:${height}`;
    if (key === last) return;
    last = key;
    scaler.style.transform = `scale(${scale})`;
    holder.style.height = `${height}px`;
  });
  ro.observe(holder);
  ro.observe(scaler);
  root.append(h('div.sec-title', h('h2', 'Vorschau')), holder);
}

function printDoc(doc, filename) {
  const target = document.getElementById('print-root');
  target.replaceChildren(doc);
  const old = document.title;
  document.title = filename;
  const done = () => {
    document.title = old;
    target.replaceChildren();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // Charts im Bericht haben eine feste Breite und sind sofort fertig gezeichnet
  try { window.print(); } catch { toast('Drucken wird hier nicht unterstützt', { kind: 'error' }); done(); }
}
