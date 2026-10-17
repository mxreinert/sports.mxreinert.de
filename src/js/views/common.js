// Bausteine, die mehrere Seiten nutzen: Ring-Karte, Checklisten, Wochen-Navigation, Tagesleiste.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { stateDot, iconBtn } from '../ui/kit.js';
import { activityRings } from '../ui/rings.js';
import { RINGS, PHASE, MUSCLES } from '../config.js';
import { num, kw, weekRange, wdShort, dateShort } from '../lib/format.js';
import { parse } from '../lib/dates.js';
import { phaseStatus } from '../lib/phases.js';

const RING_UNIT = { gym: 'Sessions', run: 'Läufe', nutrition: 'Tage', weigh: 'Tage' };

const activeRings = ev => RINGS.filter(r => ev.rings[r.id].active);

/** Große Ringe + Legende */
export function ringsBlock(ev, { size = 176, onClick } = {}) {
  const list = activeRings(ev);
  const legend = h('div.legend', list.map(r => {
    const x = ev.rings[r.id];
    return h('div.legend-row', { style: { '--c': `var(--${r.id})` } },
      h('div.legend-name', r.label),
      x.paused
        ? h('div.legend-val.muted', 'Pause')
        : h('div.legend-val', h('b', num(x.value, 1)), h('span', `/${x.goal}`), h('small', RING_UNIT[r.id])),
      h('div.legend-pct', x.paused ? '' : `${Math.round(x.raw * 100)} %`));
  }));
  return h(`div.rings-block${onClick ? '.tappable' : ''}`, { onClick },
    h('div.rings-wrap', activityRings(list.map(r => ({ id: r.id, progress: ev.rings[r.id].progress, paused: ev.rings[r.id].paused })), { size })),
    legend);
}

const fmtActual = it => {
  if (it.actual == null) return '–';
  if (typeof it.actual === 'string') return it.actual;
  return num(it.actual, it.key === 'volume' ? 0 : 1);
};

/** Checkliste mit ✅🟡❌ und Ist/Ziel */
export function checkList(items, { onItem } = {}) {
  return h('div.checks', items.map(it => h(onItem ? 'button.check' : 'div.check', { type: onItem ? 'button' : null, onClick: onItem ? () => onItem(it) : null, class: `check-${it.state}` },
    stateDot(it.state),
    h('div.check-label', it.label),
    h('div.check-val',
      h('b', fmtActual(it)),
      it.target != null ? h('span', ` / ${num(it.target, 1)}${it.unit && it.unit !== 'kg' ? ` ${it.unit}` : ''}`) : null,
      it.min != null ? h('span', ` / ${it.min}–${it.max}`) : null,
      it.unit === 'kg' && it.actual != null ? h('span', ' kg') : null))));
}

/** "X von Y" mit Fortschrittsbalken */
export function scoreBar(hit, total) {
  return h('div.score',
    h('div.score-text', h('b', `${hit} von ${total}`), ' Wochenzielen erreicht'),
    h('div.score-bar', h('span', { style: { width: `${total ? (hit / total) * 100 : 0}%` } })));
}

export function weekNav(ws, { onPrev, onNext, onToday, isCurrent }) {
  return h('div.week-nav',
    iconBtn('chevL', { onClick: onPrev, label: 'Vorherige Woche' }),
    h('div.week-nav-mid', h('div.week-nav-kw', kw(ws)), h('div.week-nav-range', weekRange(ws))),
    h('div.week-nav-right',
      !isCurrent ? h('button.link-btn', { type: 'button', onClick: onToday }, 'Heute') : null,
      iconBtn('chevR', { onClick: onNext, label: 'Nächste Woche' })));
}

/** Tagesleiste Mo–So mit Punkten pro Ring */
export function dayStrip(ev, snap, now, onDay) {
  const nutr = Object.fromEntries(ev.rings.nutrition.days.map(d => [d.date, d.status]));
  const gymDays = new Set(ev.rings.gym.items.filter(i => i.counted).map(i => i.workout.date));
  const runDays = new Set(ev.rings.run.items.filter(i => i.ok).map(i => i.run.date));
  return h('div.days', ev.days.map(d => {
    const future = d > now;
    const dots = [
      ev.rings.gym.active && h('span.dot', { class: gymDays.has(d) ? 'on' : '', style: { '--c': 'var(--gym)' } }),
      ev.rings.run.active && h('span.dot', { class: runDays.has(d) ? 'on' : '', style: { '--c': 'var(--run)' } }),
      ev.rings.nutrition.active && h('span.dot', { class: `n-${nutr[d]}`, style: { '--c': 'var(--nutrition)' } }),
      ev.rings.weigh.active && h('span.dot', { class: snap.logs[d]?.weight != null ? 'on' : '', style: { '--c': 'var(--weigh)' } }),
    ];
    return h('button.day', { type: 'button', class: [d === now && 'is-today', future && 'is-future'].filter(Boolean).join(' '), onClick: () => onDay(d) },
      h('span.day-wd', wdShort(d)),
      h('span.day-num', String(parse(d).getUTCDate())),
      h('span.day-dots', dots.filter(Boolean)));
  }));
}

/** Aktuelle Phase mit Fortschritt („Bulk · Woche 3 von 13“) */
export function phaseCard(snap, now, { onClick } = {}) {
  const st = phaseStatus(snap.phases, now);
  if (st.status === 'none') return null;
  if (st.status === 'upcoming') {
    const p = PHASE[st.next.phase];
    return h('button.phase-bar', { type: 'button', onClick, style: { '--pc': p.color } },
      h('div.phase-bar-top', h('span.phase-dot'), h('b', p.label), h('span.muted', `startet am ${dateShort(st.next.start)}`)));
  }
  const p = PHASE[st.phase.phase];
  const sub = st.status === 'expired'
    ? `seit ${dateShort(st.phase.end)} abgelaufen`
    : st.phase.end ? `noch ${st.daysLeft + 1} ${st.daysLeft === 0 ? 'Tag' : 'Tage'} · bis ${dateShort(st.phase.end)}` : 'ohne Enddatum';
  return h('button.phase-bar', { type: 'button', onClick, style: { '--pc': p.color } },
    h('div.phase-bar-top',
      h('span.phase-dot'),
      h('b', `${p.label} · Woche ${st.week}${st.totalWeeks ? ` von ${st.totalWeeks}` : ''}`),
      h('span.muted', sub)),
    st.progress != null ? h('div.phase-progress', h('span', { style: { width: `${st.progress * 100}%` } })) : null,
    st.next ? h('div.phase-next', `Danach: ${PHASE[st.next.phase].label} ab ${dateShort(st.next.start)}`) : null);
}

/** Balken-Zeilen „Sätze pro Muskelgruppe“: alle Gruppen mit Ziel, dazu trainierte Gruppen ohne Ziel */
export function muscleRows(ev, wc) {
  const rows = wc.muscles.map(m => ({ key: m.key, label: m.label, value: m.actual, min: m.min, max: m.max, state: m.state }));
  for (const m of MUSCLES) {
    if (!ev.muscles.targets[m.id] && ev.muscles.sets[m.id] > 0) rows.push({ key: m.id, label: m.label, value: ev.muscles.sets[m.id], min: null, max: null, state: 'off' });
  }
  return rows;
}

export function pill(text, kind) {
  return h(`span.pill.pill-${kind}`, text);
}

export const NUT_LABEL = { green: 'Grüner Tag', yellow: 'Gelber Tag', red: 'Roter Tag', none: 'Nicht eingetragen' };
export const NUT_KIND = { green: 'ok', yellow: 'near', red: 'miss', none: 'open' };

export function infoNote(text, iconName = 'info') {
  return h('div.note', icon(iconName, 17), h('div', text));
}
