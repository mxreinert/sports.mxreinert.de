// Konzentrische Wochenringe (eigene SVG-Komponente, Activity-Stil).
import { s } from './h.js';

let uid = 0;

/**
 * @param {{id: string, progress: number, paused?: boolean}[]} list – außen → innen
 */
export function activityRings(list, { size = 188, animate = true } = {}) {
  const n = list.length || 1;
  const stroke = Math.round(size * (n > 3 ? 0.098 : 0.12));
  const gap = Math.max(2, Math.round(stroke * 0.16));
  const key = `r${++uid}`;
  const svg = s('svg', { class: 'rings', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img' });
  const defs = s('defs');
  defs.append(s('filter', { id: `${key}-sh`, x: '-50%', y: '-50%', width: '200%', height: '200%' },
    s('feDropShadow', { dx: 0, dy: 0, stdDeviation: stroke * 0.18, 'flood-color': '#000', 'flood-opacity': 0.55 })));
  svg.append(defs);

  list.forEach((ring, i) => {
    const r = size / 2 - stroke / 2 - i * (stroke + gap);
    if (r <= stroke / 2) return;
    const c = 2 * Math.PI * r;
    const col = `var(--${ring.id})`;
    const col2 = `var(--${ring.id}-2)`;
    const gid = `${key}-g${i}`;
    defs.append(s('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
      s('stop', { offset: '0%', style: { stopColor: col } }), s('stop', { offset: '100%', style: { stopColor: col2 } })));

    const g = s('g', { transform: `rotate(-90 ${size / 2} ${size / 2})` });
    g.append(s('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none', style: { stroke: col }, 'stroke-opacity': ring.paused ? 0.32 : 0.2,
      'stroke-width': stroke, 'stroke-dasharray': ring.paused ? `${stroke * 0.12} ${stroke * 0.55}` : null, 'stroke-linecap': 'round',
    }));
    const p = ring.paused ? 0 : Math.max(0, ring.progress || 0);
    if (p > 0) {
      const laps = Math.min(p, 1);
      const arc = s('circle', {
        class: 'ring-arc', cx: size / 2, cy: size / 2, r, fill: 'none', stroke: `url(#${gid})`, 'stroke-width': stroke,
        'stroke-linecap': 'round', 'stroke-dasharray': `${c} ${c}`, 'stroke-dashoffset': c * (1 - laps),
        style: animate ? { '--from': c } : null,
      });
      g.append(arc);
      if (p > 1) {
        // zweite Runde mit Schatten am Ende, wie bei Apple
        const extra = Math.min(p - 1, 0.999);
        const over = s('circle', {
          class: 'ring-arc', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke,
          'stroke-linecap': 'round', 'stroke-dasharray': `${c} ${c}`, 'stroke-dashoffset': c * (1 - extra), filter: `url(#${key}-sh)`,
          style: { stroke: col2, ...(animate ? { '--from': c, animationDelay: '.9s' } : {}) },
        });
        g.append(over);
      }
    }
    svg.append(g);
  });

  if (animate) svg.classList.add('rings-anim');
  return svg;
}

