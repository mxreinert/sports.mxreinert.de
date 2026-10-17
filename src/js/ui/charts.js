// Diagramme ohne Bibliothek: Linien (SVG, passt sich der Breite an), Spannen-Balken und Säulen (HTML).
import { h, s } from './h.js';
import { num } from '../lib/format.js';

/**
 * Container, der sein SVG bei Größenänderung neu zeichnet. Für den Druck feste Breite übergeben.
 * render(width) → SVG-Element
 */
function responsive(render, width) {
  const box = h('div.chart');
  if (width) { box.append(render(width)); return box; }
  let last = 0;
  const draw = () => {
    const w = Math.round(box.clientWidth);
    if (!w || w === last) return;
    last = w;
    box.replaceChildren(render(w));
  };
  const ro = new ResizeObserver(draw);
  ro.observe(box);
  // Aufräumen, sobald das Element aus dem DOM fliegt
  const mo = new MutationObserver(() => { if (!box.isConnected) { ro.disconnect(); mo.disconnect(); } });
  requestAnimationFrame(() => { if (box.isConnected) mo.observe(document.body, { childList: true, subtree: true }); });
  return box;
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= raw) || raw;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] || pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] || pts[i + 1];
    const t = 0.18;
    d += ` C${x1 + (x2 - x0) * t},${y1 + (y2 - y0) * t} ${x2 - (x3 - x1) * t},${y2 - (y3 - y1) * t} ${x2},${y2}`;
  }
  return d;
}

/**
 * Liniendiagramm über Kalendertage.
 * series: [{ values: (number|null)[], color, kind: 'line'|'dots'|'area', width?, opacity?, endDot? }]
 * labels: x-Beschriftungen (gleich lang wie values), es werden nur einige gezeigt.
 */
export function lineChart({ series, labels, height = 180, width, onScrub, light = false, xTicks = 4 }) {
  return responsive(W => {
    const padL = 6, padR = 40, padT = 12, padB = 24;
    const n = Math.max(...series.map(x => x.values.length));
    const all = series.flatMap(x => x.values).filter(v => v != null);
    if (!all.length) return s('svg', { width: W, height }, s('text', { x: W / 2, y: height / 2, 'text-anchor': 'middle', class: 'ch-empty' }, 'Noch keine Daten'));
    let min = Math.min(...all), max = Math.max(...all);
    const padV = (max - min) * 0.15 || Math.abs(max) * 0.02 || 1;
    const ticks = niceTicks(min - padV, max + padV, 3);
    min = ticks[0]; max = ticks[ticks.length - 1];
    const x = i => padL + (n <= 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
    const y = v => padT + (1 - (v - min) / (max - min)) * (height - padT - padB);

    const svg = s('svg', { width: W, height, viewBox: `0 0 ${W} ${height}` });
    for (const t of ticks) {
      svg.append(s('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), class: 'ch-grid' }));
      svg.append(s('text', { x: W - padR + 8, y: y(t) + 4, class: 'ch-label' }, num(t, 1)));
    }
    if (labels?.length) {
      const idx = n <= xTicks ? [...Array(n).keys()] : Array.from({ length: xTicks }, (_, k) => Math.round((k / (xTicks - 1)) * (n - 1)));
      for (const i of idx) {
        svg.append(s('text', { x: x(i), y: height - 6, class: 'ch-label', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, labels[i]));
      }
    }
    for (const ser of series) {
      const pts = ser.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
      if (ser.kind === 'dots') {
        const r = n > 120 ? 1.6 : n > 40 ? 2.4 : 3.4;
        for (const p of pts) if (p) svg.append(s('circle', { cx: p[0], cy: p[1], r, style: { fill: ser.color }, 'fill-opacity': ser.opacity ?? 0.55 }));
      } else {
        // Linie über Lücken hinweg verbinden (gleitender Schnitt hat selten Lücken)
        const valid = pts.filter(Boolean);
        if (ser.kind === 'area' && valid.length > 1) {
          const gid = `ga${Math.random().toString(36).slice(2, 8)}`;
          svg.append(s('defs', s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
            s('stop', { offset: '0%', style: { stopColor: ser.color, stopOpacity: 0.32 } }),
            s('stop', { offset: '100%', style: { stopColor: ser.color, stopOpacity: 0 } }))));
          svg.append(s('path', { d: `${smoothPath(valid)} L${valid[valid.length - 1][0]},${height - padB} L${valid[0][0]},${height - padB} Z`, fill: `url(#${gid})` }));
        }
        svg.append(s('path', { d: smoothPath(valid), fill: 'none', style: { stroke: ser.color }, 'stroke-width': ser.width || 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        if (ser.endDot && valid.length) {
          const [lx, ly] = valid[valid.length - 1];
          svg.append(s('circle', { cx: lx, cy: ly, r: 4.5, style: { fill: ser.color }, stroke: light ? '#fff' : '#000', 'stroke-width': 2 }));
        }
      }
    }
    if (onScrub) {
      const cursor = s('line', { y1: padT, y2: height - padB, class: 'ch-cursor', visibility: 'hidden' });
      svg.append(cursor);
      const move = e => {
        const rect = svg.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (W - padL - padR)) * (n - 1))));
        cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('visibility', 'visible');
        onScrub(i);
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); onScrub(null); });
    }
    return svg;
  }, width);
}

/**
 * Ist vs. Zielspanne als waagerechte Balken (Sätze pro Muskelgruppe).
 * rows: [{ label, value, min, max, state }]
 */
export function rangeBars(rows, { compare } = {}) {
  const top = Math.max(...rows.map(r => Math.max(r.max * 1.2, r.value, compare?.[r.key] ?? 0)), 1);
  const pct = v => `${Math.min(100, (v / top) * 100)}%`;
  return h('div.rbars', rows.map(r => h('div.rbar',
    h('div.rbar-label', r.label),
    h('div.rbar-track',
      h('span.rbar-band', { style: { left: pct(r.min), width: `calc(${pct(r.max)} - ${pct(r.min)})` } }),
      compare && compare[r.key] != null ? h('span.rbar-prev', { style: { width: pct(compare[r.key]) }, title: `Vorwoche: ${num(compare[r.key], 1)}` }) : null,
      h(`span.rbar-fill.st-${r.state}`, { style: { width: pct(r.value) } })),
    h(`div.rbar-val.st-${r.state}`, num(r.value, 1), h('span.rbar-target', ` / ${r.min}–${r.max}`)))));
}

/** Kleine Säulen (z. B. Schlaf 1–5 über 7 Tage) */
export function miniBars(values, { max = 5, color = 'var(--accent)', labels } = {}) {
  return h('div.mbars', values.map((v, i) => h('div.mbar',
    h('div.mbar-col', h('span.mbar-fill', { style: { height: v == null ? '0' : `${(v / max) * 100}%`, background: color } })),
    labels ? h('div.mbar-lbl', labels[i]) : null)));
}

/** Säulen mit Zielmarke (z. B. Wochen im Vergleich) */
export function columns(items, { color = 'var(--accent)', goal, max } = {}) {
  const top = max || Math.max(goal || 0, ...items.map(i => i.value || 0), 1);
  return h('div.cols', items.map(it => h('div.col',
    h('div.col-val', it.text ?? num(it.value, 1)),
    h('div.col-bar',
      goal ? h('span.col-goal', { style: { bottom: `${(goal / top) * 100}%` } }) : null,
      h('span.col-fill', { style: { height: `${((it.value || 0) / top) * 100}%`, background: it.color || color } })),
    h('div.col-lbl', it.label))));
}
