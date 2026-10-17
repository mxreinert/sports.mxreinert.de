// Minimaler DOM-Baukasten: h('div.card', { onClick }, kinder…)
const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, props, isSvg) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', [el.getAttribute('class'), v].filter(Boolean).join(' '));
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (val == null) continue;
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (!isSvg && (k === 'value' || (k in el && typeof v !== 'string'))) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function build(el, props, children) {
  // Props sind optional: h('div', kind) ist erlaubt
  if (props instanceof Node || Array.isArray(props) || typeof props !== 'object' || props === null) {
    children.unshift(props);
    props = null;
  }
  apply(el, props, el.namespaceURI === SVG_NS);
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** tag: 'div.klasse1.klasse2' */
export function h(tag, props, ...children) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  return build(el, props, children);
}

export const s = (tag, props, ...children) => build(document.createElementNS(SVG_NS, tag), props, children);
