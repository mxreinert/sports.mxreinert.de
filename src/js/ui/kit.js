// UI-Bausteine im Apple-Stil: Listen, Karten, Segmente, Schalter, Sheets, Toasts.
import { h } from './h.js';
import { icon } from './icons.js';

// ---------- Zustände (✅ 🟡 ❌) ----------

const STATES = {
  ok: { icon: 'check', label: 'erreicht' },
  near: { icon: 'minus', label: 'knapp' },
  miss: { icon: 'x', label: 'verfehlt' },
  open: { icon: null, label: 'offen' },
  off: { icon: null, label: 'frei' },
  paused: { icon: 'pause', label: 'Pause' },
};

export const stateDot = (state, size = 14) =>
  h(`span.state.state-${state}`, { title: STATES[state]?.label, 'aria-label': STATES[state]?.label }, STATES[state]?.icon ? icon(STATES[state].icon, size) : null);

// ---------- Seitenaufbau ----------

export function largeTitle(title, { sub, right, left } = {}) {
  return h('header.lt',
    h('div.lt-bar', left || h('span'), h('div.lt-actions', right)),
    sub ? h('div.lt-sub', sub) : null,
    h('h1.lt-title', title));
}

export function card(props, ...children) {
  if (props instanceof Node || typeof props === 'string' || Array.isArray(props)) { children.unshift(props); props = {}; }
  return h('section.card', props, children);
}

export function cardHead(title, { sub, right, iconName, color } = {}) {
  return h('div.card-head',
    iconName ? h('span.card-ic', { style: color ? { color } : null }, icon(iconName, 18)) : null,
    h('div.card-titles', h('h3.card-title', title), sub ? h('div.card-sub', sub) : null),
    right ? h('div.card-right', right) : null);
}

/** Inset-Gruppe wie in den iOS-Einstellungen */
export function group(rows, { header, footer } = {}) {
  return h('div.group',
    header ? h('div.group-header', header) : null,
    h('div.group-list', rows.filter(Boolean)),
    footer ? h('div.group-footer', footer) : null);
}

export function row({ iconName, color, title, sub, value, chevron, onClick, right, danger } = {}) {
  const tag = onClick ? 'button.row' : 'div.row';
  return h(tag, { class: danger ? 'row-danger' : null, onClick, type: onClick ? 'button' : null },
    iconName ? h('span.row-ic', { style: { background: color || 'var(--surface-3)' } }, icon(iconName, 17)) : null,
    h('div.row-main', h('div.row-title', title), sub ? h('div.row-sub', sub) : null),
    value != null ? h('div.row-value', value) : null,
    right || null,
    chevron ? h('span.row-chev', icon('chevR', 16)) : null);
}

// ---------- Eingaben ----------

export function seg(options, value, onChange, { small = false } = {}) {
  const el = h(`div.seg${small ? '.seg-sm' : ''}`, { role: 'tablist' });
  const pill = h('span.seg-pill');
  el.append(pill);
  const btns = options.map(([v, label]) => h('button.seg-btn', {
    type: 'button', role: 'tab', 'aria-selected': String(v === value),
    onClick: () => { if (v !== value) { value = v; sync(); onChange(v); } },
  }, label));
  el.append(...btns);
  function sync() {
    const i = options.findIndex(([v]) => v === value);
    btns.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    el.style.setProperty('--n', options.length);
    el.style.setProperty('--i', Math.max(0, i));
  }
  sync();
  return el;
}

export function toggle(checked, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!checked, onChange: e => onChange(e.target.checked) });
  return h('label.switch', input, h('span.switch-track', h('span.switch-thumb')));
}

/** Komma oder Punkt als Dezimaltrenner */
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const fmtInput = (v, decimals) => (v == null ? '' : decimals ? String(v).replace('.', ',') : String(v));

/** Zahlenfeld mit Einheit. get() liefert Zahl oder null. */
export function numField({ label, value, unit, placeholder, decimals = false, min, max, hint, big = false } = {}) {
  const input = h('input.num-input', {
    type: 'text', inputMode: decimals ? 'decimal' : 'numeric', autocomplete: 'off', enterKeyHint: 'next',
    placeholder: placeholder ?? '', value: fmtInput(value, decimals), 'aria-label': label,
    onInput: () => el.classList.remove('invalid'),
  });
  const get = () => parseNum(input.value);
  const validate = () => {
    const v = get();
    const bad = input.value.trim() !== '' && (v == null || (min != null && v < min) || (max != null && v > max));
    el.classList.toggle('invalid', bad);
    return !bad;
  };
  const el = h(`label.field${big ? '.field-big' : ''}`,
    label ? h('span.field-label', label) : null,
    h('span.field-box', input, unit ? h('span.field-unit', unit) : null),
    hint ? h('span.field-hint', hint) : null);
  return { el, input, get, validate };
}

export function textField({ label, value = '', placeholder = '', multiline = false, rows = 3 } = {}) {
  const input = multiline
    ? h('textarea.text-input', { rows, placeholder, value })
    : h('input.text-input', { type: 'text', placeholder, value });
  const el = h('label.field', label ? h('span.field-label', label) : null, h('span.field-box', input));
  return { el, input, get: () => input.value.trim() };
}

export function dateField({ label, value, min, max } = {}) {
  const input = h('input.text-input', { type: 'date', value: value || '', min, max });
  const el = h('label.field', label ? h('span.field-label', label) : null, h('span.field-box', input));
  return { el, input, get: () => input.value || null };
}

export function selectField({ label, value, options } = {}) {
  const sel = h('select.text-input', options.map(([v, l]) => h('option', { value: v ?? '', selected: v === value }, l)));
  const el = h('label.field', label ? h('span.field-label', label) : null, h('span.field-box.select-box', sel, icon('chevD', 16)));
  return { el, input: sel, get: () => sel.value || null };
}

/** 1–5 als runde Knöpfe */
export function rating({ label, value, iconName, color, onChange } = {}) {
  let cur = value ?? null;
  const btns = [1, 2, 3, 4, 5].map(n => h('button.rate-btn', {
    type: 'button', 'aria-label': `${label} ${n}`, 'aria-pressed': String(cur === n),
    onClick: () => { cur = cur === n ? null : n; sync(); onChange?.(cur); },
  }, String(n)));
  const sync = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(cur != null && i + 1 <= cur)));
  sync();
  const el = h('div.rating', { style: color ? { '--rate': color } : null },
    h('div.rating-label', iconName ? icon(iconName, 16) : null, label),
    h('div.rating-btns', btns));
  return { el, get: () => cur };
}

/** Wochentage als Chips (Mehrfachauswahl) */
export function dayPicker(days, selected, onChange) {
  const sel = new Set(selected);
  return h('div.day-picker', days.map(d => {
    const b = h('button.day-chip', { type: 'button', 'aria-pressed': String(sel.has(d.id)), onClick: () => {
      sel.has(d.id) ? sel.delete(d.id) : sel.add(d.id);
      b.setAttribute('aria-pressed', String(sel.has(d.id)));
      onChange([...sel]);
    } }, d.short);
    return b;
  }));
}

export function btn(label, { kind = 'filled', iconName, onClick, cls } = {}) {
  return h(`button.btn.btn-${kind}${cls ? `.${cls}` : ''}`, { type: 'button', onClick },
    iconName ? icon(iconName, 19) : null, label ? h('span', label) : null);
}

export const iconBtn = (name, { onClick, label, cls } = {}) =>
  h(`button.icon-btn${cls ? `.${cls}` : ''}`, { type: 'button', onClick, 'aria-label': label, title: label }, icon(name, 20));

export const chip = (text, { color } = {}) => h('span.chip', { style: color ? { '--chip': color } : null }, text);

export function empty(iconName, title, text, action) {
  return h('div.empty', h('div.empty-ic', icon(iconName, 30)), h('div.empty-title', title), text ? h('p.empty-text', text) : null, action || null);
}

// ---------- Sheet (von unten, auf großen Bildschirmen mittig) ----------

export function sheet({ title, body, footer, onClose, size } = {}) {
  const closeBtn = h('button.icon-btn.sheet-x', { type: 'button', 'aria-label': 'Schließen', onClick: () => close() }, icon('x', 18));
  const titleEl = h('h2.sheet-title', title || '');
  const head = h('div.sheet-head', h('div.sheet-grab'), h('div.sheet-titlebar', titleEl, closeBtn));
  const bodyEl = h('div.sheet-body', body);
  const footEl = h('div.sheet-foot', footer);
  footEl.hidden = !footer;
  const panel = h(`div.sheet${size ? `.sheet-${size}` : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, head, bodyEl, footEl);
  const root = h('div.sheet-root', h('div.sheet-backdrop', { onClick: () => close() }), panel);
  document.body.append(root);
  document.body.classList.add('no-scroll');
  void root.offsetWidth; // Reflow erzwingen, damit die Animation startet
  root.classList.add('in');

  const onKey = e => { if (e.key === 'Escape' && root === [...document.querySelectorAll('.sheet-root')].pop()) close(); };
  document.addEventListener('keydown', onKey);

  // Nach unten wischen zum Schließen
  let startY = null, dy = 0;
  head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; startY = e.clientY; dy = 0; panel.style.transition = 'none'; head.setPointerCapture(e.pointerId); });
  head.addEventListener('pointermove', e => { if (startY == null) return; dy = Math.max(0, e.clientY - startY); panel.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (startY == null) return; startY = null; panel.style.transition = ''; panel.style.transform = ''; if (dy > 110) close(); };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      root.remove();
      if (!document.querySelector('.sheet-root')) document.body.classList.remove('no-scroll');
      onClose?.();
    }, 340);
  }
  /** Inhalt austauschen, ohne das Sheet zu schließen (z. B. anderer Tag) */
  function update({ title: newTitle, body: newBody, footer: newFooter }) {
    titleEl.textContent = newTitle;
    bodyEl.replaceChildren(newBody);
    footEl.replaceChildren(...[newFooter].filter(Boolean));
    footEl.hidden = !newFooter;
    bodyEl.scrollTop = 0;
  }
  return { close, update };
}

export function confirmSheet(text, { title = 'Sicher?', ok = 'Bestätigen', danger = false } = {}) {
  return new Promise(resolve => {
    let result = false;
    const s = sheet({
      title, size: 'sm',
      body: h('p.sheet-text', text),
      footer: h('div.btn-row',
        btn('Abbrechen', { kind: 'gray', onClick: () => s.close() }),
        btn(ok, { kind: danger ? 'danger' : 'filled', onClick: () => { result = true; s.close(); } })),
      onClose: () => resolve(result),
    });
  });
}

// ---------- Toast ----------

let toastTimer;
export function toast(msg, { kind = 'ok', ms = 2200 } = {}) {
  document.querySelector('.toast')?.remove();
  const el = h(`div.toast.toast-${kind}`, { role: 'status' }, icon(kind === 'error' ? 'info' : 'check', 17), h('span', msg));
  document.body.append(el);
  void el.offsetWidth;
  el.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms);
}
