// 轻量 DOM 帮助 + glass 组件渲染
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk[0] === '-' && sk[1] === '-') e.style.setProperty(sk, v[sk]); else e.style[sk] = v[sk]; } }
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return e;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function mount(node, ...kids) { clear(node); kids.flat().forEach((k) => k && node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k)); return node; }

// 内联 SVG 图标(monoline,currentColor)
const ICONS = {
  video: '<path d="M15 10l4.5-3v10L15 14M4 6h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  cloud: '<path d="M6 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0117 18z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3.9a7 7 0 00-1.7-1L14.5 3h-5l-.4 2.5a7 7 0 00-1.7 1L5 5.6l-2 3.4L5 10.5a7 7 0 000 3L3 15l2 3.4 2.3-.9a7 7 0 001.7 1L9.5 21h5l.4-2.5a7 7 0 001.7-1l2.3.9 2-3.4-2-1.5c.06-.33.1-.66.1-1z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  logout: '<path d="M15 12H3m0 0l4-4m-4 4l4 4M13 4h6a1 1 0 011 1v14a1 1 0 01-1 1h-6"/>',
  inbox: '<path d="M3 13h4l2 3h6l2-3h4M5 5h14l2 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/>',
  touch: '<path d="M9 11V6a2 2 0 114 0v5m0 0V9a2 2 0 114 0v5a6 6 0 01-6 6h-1a5 5 0 01-4-2l-3-4 1.5-1 2.5 2V6a2 2 0 114 0v5"/>',
};
export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

export function statusChip(online) {
  const tt = (typeof window !== 'undefined' && window.__t) ? window.__t : null;
  const label = online ? (tt ? tt('online') : '在线') : (tt ? tt('offline') : '离线');
  return h('span', { class: `chip ${online ? 'stat-online' : 'stat-offline'}` },
    h('span', { class: 'dot' }), label);
}

export function deviceCard(dev, onOpen, opts = {}) {
  const tt = (typeof window !== 'undefined' && window.__t) ? window.__t : null;
  const entering = !!(opts.entering);
  const online = dev.online === 1 || dev.online === true;
  const thumbKids = [];
  if (dev.picture) {
    thumbKids.push(h('img', {
      src: dev.picture, alt: '',
      onerror: function () { this.style.display = 'none'; const ph = this.parentNode && this.parentNode.querySelector('.thumb-ph'); if (ph) ph.hidden = false; },
    }));
  }
  thumbKids.push(h('div', { class: 'thumb-ph', hidden: !!dev.picture }, icon('video', 36)));
  thumbKids.push(h('div', { class: 'thumb-fade' }));
  thumbKids.push(h('span', { class: 'badge' }, statusChip(online)));
  if (entering) {
    thumbKids.push(h('div', { class: 'enter-overlay' },
      h('div', { class: 'spinner' }),
      h('span', {}, tt ? tt('enteringShort') : 'Entering…'),
    ));
  }
  const metas = [];
  if (dev.model) metas.push(h('span', { class: 'meta' }, dev.model));
  if (dev.firmware) metas.push(h('span', { class: 'meta' }, 'v' + String(dev.firmware).replace(/^v/i, '')));
  return h('article', {
    class: 'glass devcard reveal' + (online ? '' : ' is-off') + (entering ? ' is-entering' : ''),
    role: 'button',
    tabindex: entering ? '-1' : '0',
    'aria-busy': entering ? 'true' : 'false',
    onclick: () => { if (!entering) onOpen(dev); },
    onkeydown: (e) => { if (!entering && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(dev); } },
  },
    h('div', { class: 'thumb' }, ...thumbKids),
    h('div', { class: 'body' },
      h('div', { class: 'body-top' },
        h('div', { class: 'name' }, dev.name || '—'),
        h('span', { class: 'enter-cta', 'aria-hidden': 'true' }, icon('chevron', 16)),
      ),
      h('div', { class: 'metaline' }, ...metas),
      h('div', { class: 'card-foot' },
        h('span', { class: 'enter-label' }, tt ? tt('enter') : 'Enter'),
      ),
    ),
  );
}

export function loading(text = '加载中…') {
  return h('div', { class: 'empty' }, h('div', { class: 'spinner' }), h('div', { class: 'faint' }, text));
}
export function emptyState(text = 'No data') {
  const box = h('div', { class: 'empty' });
  box.appendChild(icon('inbox', 46));
  box.appendChild(h('div', { class: 'faint' }, text));
  return box;
}
