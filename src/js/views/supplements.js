// Supplements: Plan einrichten (Einstellungen), heute abhaken (Karte auf „Heute“), Chips für den Check-in.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { btn, card, cardHead, dayPicker, group, iconBtn, largeTitle, row, sheet, textField, toast, toggle, confirmSheet } from '../ui/kit.js';
import * as db from '../store/db.js';
import { snap } from '../store/db.js';
import { suppDay } from '../lib/supplements.js';
import { sortVersions } from '../lib/versions.js';
import { dateFull } from '../lib/format.js';
import { WEEKDAYS } from '../config.js';

const DAY_SHORT = Object.fromEntries(WEEKDAYS.map(d => [d.id, d.short]));
const daysText = item => (!item.days?.length || item.days.length === 7 ? 'täglich' : WEEKDAYS.filter(d => item.days.includes(d.id)).map(d => DAY_SHORT[d.id]).join(', '));

/** Aktueller (neuester) Plan – Grundlage für Änderungen */
const currentItems = () => structuredClone(sortVersions(snap.supps)[0]?.items || []);

// ---------- Einstellungen ----------

export function suppSettings(root, { now, go }) {
  root.append(largeTitle('Supplements', {
    left: iconBtn('chevL', { label: 'Zurück', onClick: () => go('#/einstellungen'), cls: 'back-btn' }),
    sub: 'Plan einrichten · Abhaken auf „Heute“ und im Check-in',
  }));
  const items = currentItems();
  root.append(group(items.length ? items.map(it => row({
    iconName: 'pill', color: it.ring ? 'var(--nutrition)' : '#8e8e93',
    title: h('span', it.name, it.ring ? h('span.chip', { style: { '--chip': 'var(--nutrition)' } }, 'Ring') : null),
    sub: [it.dose, daysText(it), it.time ? `Erinnerung ${it.time}` : null].filter(Boolean).join(' · '),
    chevron: true, onClick: () => editItem(it, now),
  })) : [row({ title: h('span.muted', 'Noch keine Supplements') })], {
    footer: '„Ring“ = zählt für den Ernährungsring: alle genommen = ok, eins vergessen = gelber Tag, mehr = roter Tag. Änderungen gelten ab heute – vergangene Tage behalten ihre Bewertung.',
  }));
  root.append(h('div.center-action', btn('Supplement hinzufügen', { iconName: 'plus', kind: 'tinted', onClick: () => editItem(null, now) })));
  const versions = sortVersions(snap.supps);
  if (versions.length > 1) {
    root.append(group(versions.slice(0, 6).map(v => row({ title: `ab ${dateFull(v.valid_from)}`, sub: v.items.map(i => i.name).join(', ') || 'kein Supplement' })), { header: 'Verlauf' }));
  }
}

function editItem(item, now) {
  const it = item ? structuredClone(item) : { id: crypto.randomUUID(), name: '', dose: '', days: [], ring: true, time: null };
  const name = textField({ label: 'Name', value: it.name, placeholder: 'z. B. Kreatin' });
  const dose = textField({ label: 'Dosis', value: it.dose, placeholder: 'z. B. 5 g' });
  let daily = !it.days?.length || it.days.length === 7;
  let days = daily ? [] : [...it.days];
  const picker = h('div', dayPicker(WEEKDAYS, days, v => { days = v; }));
  picker.hidden = daily;
  const time = h('input.text-input', { type: 'time', value: it.time || '' });

  const save = async items => { await db.saveSuppPlan(items, now); s.close(); };
  const s = sheet({
    title: item ? it.name : 'Neues Supplement',
    body: h('div.form',
      name.el, dose.el,
      h('div.toggle-row', h('div', h('b', 'Täglich')), toggle(daily, v => { daily = v; picker.hidden = v; })),
      picker,
      h('div.toggle-row', h('div', h('b', 'Zählt für den Ernährungsring'), h('div.muted', 'Vergessen macht den Tag gelb/rot')), toggle(it.ring, v => { it.ring = v; })),
      h('label.field', h('span.field-label', 'Erinnerung (optional)'), h('span.field-box', time),
        h('span.field-hint', 'Uhrzeit für die Push-Erinnerung – Push wird im nächsten Schritt aktiviert.'))),
    footer: h('div.btn-row',
      item ? btn('', { kind: 'gray', iconName: 'trash', cls: 'btn-square', onClick: async () => {
        if (!(await confirmSheet(`„${it.name}“ ab heute aus dem Plan nehmen? Vergangene Tage bleiben, wie sie waren.`, { title: 'Supplement entfernen', ok: 'Entfernen', danger: true }))) return;
        await save(currentItems().filter(x => x.id !== it.id));
        toast('Entfernt');
      } }) : null,
      btn('Speichern', { cls: 'grow', onClick: async () => {
        if (!name.get()) { toast('Bitte einen Namen eingeben', { kind: 'error' }); return; }
        if (!daily && !days.length) { toast('Bitte mindestens einen Tag wählen', { kind: 'error' }); return; }
        const next = { ...it, name: name.get(), dose: dose.get(), days: daily ? [] : [...days].sort(), time: time.value || null };
        const items = currentItems();
        const i = items.findIndex(x => x.id === next.id);
        if (i >= 0) items[i] = next; else items.push(next);
        await save(items);
        toast(item ? 'Gespeichert – gilt ab heute' : 'Hinzugefügt');
      } })),
  });
}

// ---------- Abhaken ----------

/** Chips der fälligen Supplements. selected: { id: true }, onToggle(id) */
export function suppChips(due, selected, onToggle) {
  return h('div.supp-chips', due.map(it => {
    const b = h('button.supp-chip', {
      type: 'button', 'aria-pressed': String(!!selected[it.id]),
      onClick: () => {
        onToggle(it.id);
        b.setAttribute('aria-pressed', String(!!selected[it.id]));
        b.firstChild.replaceWith(icon(selected[it.id] ? 'check' : 'pill', 16));
      },
    }, icon(selected[it.id] ? 'check' : 'pill', 16), h('span', h('b', it.name), it.dose ? h('small', it.dose) : null));
    return b;
  }));
}

/** Karte auf „Heute“ – ein Tipp = genommen */
export function suppCard(date, go) {
  const sd = suppDay(snap, date);
  if (!sd.due.length) return null;
  const taken = { ...(snap.logs[date]?.supps || {}) };
  return card(
    cardHead('Supplements heute', { iconName: 'pill', color: 'var(--nutrition)', sub: `${sd.taken.length} von ${sd.due.length} genommen`, right: h('button.link-btn', { type: 'button', onClick: () => go('#/einstellungen/supplements') }, 'Plan') }),
    suppChips(sd.due, taken, id => { taken[id] = !taken[id]; db.toggleSupp(date, id); }));
}

