// Dashboard "Heute": Ringe der Woche, Schnell-Eingaben, Tages-Check, Gewichtstrend.
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { card, cardHead, largeTitle, iconBtn } from '../ui/kit.js';
import { lineChart } from '../ui/charts.js';
import { evaluateWeek, weekChecks, dayChecks, checkinStreak, weightSeries, weekOf, coachAt } from '../lib/engine.js';
import { addDays, hourNow } from '../lib/dates.js';
import { dateLong, dateShort, duration, num, fixed, signed, pace, kw } from '../lib/format.js';
import { ringsBlock, checkList, scoreBar, phaseCard, NUT_KIND, NUT_LABEL, pill } from './common.js';
import { openCheckin, openWeight } from './checkin.js';
import { runSync } from './sync.js';
import { suppCard } from './supplements.js';

export function renderToday(root, { snap, now, go }) {
  const ws = weekOf(snap, now);
  const ev = evaluateWeek(snap, ws, now);
  const wc = weekChecks(ev);
  const day = dayChecks(snap, now, now);
  const streak = checkinStreak(snap, now);
  const log = snap.logs[now] || {};
  const t = coachAt(snap, now);

  root.append(largeTitle('Heute', {
    sub: dateLong(now),
    right: [
      streak > 0 ? h('span.streak', { title: `${streak} Tage in Folge eingetragen` }, icon('flame', 16), String(streak)) : null,
      iconBtn('sync', { label: 'Jetzt synchronisieren', onClick: () => runSync(), cls: 'sync-btn' }),
    ],
  }));

  const phase = phaseCard(snap, now, { onClick: () => go('#/einstellungen/phasen') });
  if (phase) root.append(phase);

  // Erinnerung ab ~21 Uhr
  if (!day.logged && snap.settings.reminder_hour != null && hourNow() >= snap.settings.reminder_hour) {
    root.append(h('button.banner', { type: 'button', onClick: () => openCheckin(now) },
      h('span.banner-ic', icon('moon', 20)),
      h('div', h('b', 'Abend-Check-in fehlt noch'), h('div', streak ? `Halte deine Serie von ${streak} ${streak === 1 ? 'Tag' : 'Tagen'} am Leben.` : 'Dauert weniger als eine Minute.')),
      icon('chevR', 18)));
  }

  // Gestern vergessen? (nur wenn es davor schon Einträge gibt, nicht am ersten Tag)
  const yesterday = addDays(now, -1);
  if (snap.logs[yesterday]?.kcal == null && Object.keys(snap.logs).some(d => d < yesterday)) {
    root.append(h('button.banner.banner-soft', { type: 'button', onClick: () => openCheckin(yesterday) },
      h('span.banner-ic', icon('history', 18)),
      h('div', h('b', 'Gestern fehlt noch'), h('div', 'Jetzt nachtragen – ältere Tage im Check-in mit ‹ ›.')),
      icon('chevR', 18)));
  }

  // Ringe
  root.append(card(
    cardHead(`Diese Woche · ${kw(ws)}`, { right: h('button.link-btn', { type: 'button', onClick: () => go(`#/woche/${ws}`) }, 'Details') }),
    ev.exception ? h('div.pause-tag', icon('pause', 14), 'Pausen-Woche – Ziele angepasst') : null,
    ringsBlock(ev, { onClick: () => go(`#/woche/${ws}`) }),
    scoreBar(wc.hit, wc.total)));

  // Schnell-Eingabe
  const nut = day.nutrition;
  root.append(h('div.tiles',
    h('button.tile', { type: 'button', onClick: () => openWeight(now) },
      h('div.tile-top', h('span', { style: { color: 'var(--weigh)' } }, icon('scale', 20)), h('span.tile-label', 'Gewicht')),
      h('div.tile-val', log.weight != null ? h('span', fixed(log.weight, 1), h('small', ' kg')) : h('span.muted', 'Eintragen')),
      h('div.tile-sub', log.weight != null ? 'heute gewogen' : 'morgens, nüchtern')),
    h('button.tile', { type: 'button', onClick: () => openCheckin(now) },
      h('div.tile-top', h('span', { style: { color: 'var(--nutrition)' } }, icon('food', 20)), h('span.tile-label', 'Check-in')),
      h('div.tile-val', log.kcal != null ? h('span', num(log.kcal), h('small', ' kcal')) : h('span.muted', 'Eintragen')),
      h('div.tile-sub', log.kcal != null ? pill(NUT_LABEL[nut], NUT_KIND[nut]) : t.kcal ? `Ziel ${num(t.kcal)} kcal` : 'abends, < 1 Minute'))));

  // Supplements zum Abhaken
  const supp = suppCard(now, go);
  if (supp) root.append(supp);

  // Ziel-Check heute
  root.append(card(
    cardHead('Ziel-Check heute', { iconName: 'target', sub: `${day.items.filter(i => i.state === 'ok').length} von ${day.items.length} erledigt` }),
    checkList(day.items, { onItem: it => (it.key === 'weight' ? openWeight(now) : ['gym', 'run'].includes(it.key) ? go(`#/woche/${ws}`) : it.key === 'supps' ? null : openCheckin(now)) })));

  // Training heute
  const todays = [
    ...snap.workouts.filter(w => w.date === now).map(w => ({ kind: 'gym', title: w.title, sub: `${duration(w.duration_min)} · ${w.exercises.length} Übungen` })),
    ...snap.runs.filter(r => r.date === now).map(r => ({ kind: 'run', title: r.name || 'Lauf', sub: `${num(r.distance_km, 2)} km · ${pace(r.duration_min, r.distance_km)}` })),
  ];
  if (todays.length) {
    root.append(card(cardHead('Training heute', { iconName: 'dumbbell', color: 'var(--gym)' }),
      h('div.mini-list', todays.map(x => h('div.mini-item', h('span.mini-dot', { style: { background: `var(--${x.kind})` } }), h('div', h('b', x.title), h('div.muted', x.sub)))))));
  }

  // Gewichtstrend 30 Tage
  root.append(weightCard(snap, now, go));
}

function weightCard(snap, now, go) {
  const from = addDays(now, -29);
  const series = weightSeries(snap, from, now);
  const withVals = series.filter(p => p.weight != null);
  const lastAvg = [...series].reverse().find(p => p.avg != null)?.avg ?? null;
  const prevAvg = series[series.length - 8]?.avg ?? null;
  const header = h('div.scrub-head');
  const setHead = i => {
    const p = i == null ? null : series[i];
    header.replaceChildren(p
      ? h('div', h('div.big-num', p.weight != null ? fixed(p.weight, 1) : '–', h('small', ' kg')), h('div.muted', `${dateShort(p.date)} · Ø ${p.avg != null ? fixed(p.avg, 1) : '–'} kg`))
      : h('div', h('div.big-num', lastAvg != null ? fixed(lastAvg, 1) : '–', h('small', ' kg Ø 7 Tage')),
        h('div.muted', lastAvg != null && prevAvg != null ? `${signed(lastAvg - prevAvg, 1)} kg zur Vorwoche` : 'Trend erscheint nach ein paar Wiegungen')));
  };
  setHead(null);
  return card(
    cardHead('Gewicht · 30 Tage', { iconName: 'scale', color: 'var(--weigh)', right: h('button.link-btn', { type: 'button', onClick: () => go('#/verlauf/gewicht') }, 'Verlauf') }),
    header,
    withVals.length ? lineChart({
      height: 150,
      labels: series.map(p => dateShort(p.date)),
      series: [
        { values: series.map(p => p.weight), kind: 'dots', color: 'var(--weigh)' },
        { values: series.map(p => p.avg), kind: 'area', color: 'var(--weigh)', width: 2.5, endDot: true },
      ],
      onScrub: setHead,
    }) : h('p.muted.pad', 'Noch keine Wiegungen.'),
    h('div.chart-legend', h('span', h('i.lg-dot', { style: { background: 'var(--weigh)' } }), 'Tageswert'), h('span', h('i.lg-line', { style: { background: 'var(--weigh)' } }), '7-Tage-Schnitt')));
}
