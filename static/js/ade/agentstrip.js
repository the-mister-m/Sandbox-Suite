





import { rowsForRegion, pendingByRegion, settle as settleGate } from './queuelog.js';

let _send = null;
let _getTracks = () => [];

let _phase = {};

let _liveGates = {};

let _feedGates = {};

let _ctxWarn = {};

let _chips = [];
let _stripEl = null;

let _popover = null;

function esc(s) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function trackById(id) { return (_getTracks() || []).find((t) => t.id === id) || null; }

function queued(id) {
  if (_feedGates[id]) return true;
  const s = _liveGates[id];
  return !!(s && s.size);
}

function stateOf(id) {
  if (queued(id)) return 'queue';
  const p = _phase[id] || 'idle';
  return (p && p !== 'idle') ? 'busy' : 'idle';
}


function ctxWarned(id) { return !!_ctxWarn[id]; }

function tipFor(id, name) {
  let head = '';
  const w = _ctxWarn[id];
  if (w) {
    const pct = w.cap ? Math.round(100 * w.peak / w.cap) : null;
    head = 'CONTEXT ' + (pct == null ? 'past 75%' : pct + '% of cap')
         + ' (' + Number(w.peak || 0).toLocaleString() + ' / '
         + Number(w.cap || 0).toLocaleString() + ') — resets at 100%. ';
  }
  if (queued(id)) return head + name + ' — waiting on you (gate). Click for its queue/log.';
  const p = _phase[id] || 'idle';
  return head + name + ' — ' + p + '. Click for its queue/log.';
}

function buildChip(el, id, name, state, phase) {
  el.className = 'ag-chip ag-' + state + (ctxWarned(id) ? ' ag-ctxwarn' : '');
  el.dataset.track = id;

  const face = document.createElement('span');
  face.className = 'ag-face';
  face.setAttribute('role', 'button');
  face.tabIndex = 0;
  face.title = tipFor(id, name);

  const dot = document.createElement('span');
  dot.className = 'ag-dot';
  face.appendChild(dot);

  const word = document.createElement('span');
  word.className = 'ag-name';
  const chars = [...(name || '?')];
  chars.forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ag-l';
    s.style.animationDelay = (i * 0.06).toFixed(2) + 's';
    s.textContent = ch;
    word.appendChild(s);
  });
  face.appendChild(word);

  const tail = document.createElement('span');
  tail.className = 'ag-dots';
  ['·', '·', '·'].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ag-l';
    s.style.animationDelay = ((chars.length + i) * 0.06).toFixed(2) + 's';
    s.textContent = ch;
    tail.appendChild(s);
  });
  face.appendChild(tail);

  el.appendChild(face);

  const kill = document.createElement('button');
  kill.type = 'button';
  kill.className = 'ag-kill';
  kill.textContent = '✕';
  kill.title = 'stop ' + name + "'s current run (the seat stays)";
  el.appendChild(kill);

  face.addEventListener('click', (ev) => { ev.stopPropagation(); togglePopover(el, id, name); });
  face.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); togglePopover(el, id, name); }
  });
  kill.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (_send) _send({ type: 'stop', track: id });
    el.classList.add('ag-killed');
    setTimeout(() => el.classList.remove('ag-killed'), 600);
  });
}

function paintChip(el, id) {
  if (!id) {
    el.className = 'ag-chip ag-empty';
    el.dataset.track = '';
    el.dataset.fp = '';
    el.innerHTML = '';
    return;
  }
  const trk = trackById(id);
  const name = (trk && trk.name) || id;
  const state = stateOf(id);
  const phase = _phase[id] || 'idle';
  const fp = [id, name, state, ctxWarned(id) ? 'w' : ''].join('|');
  if (el.dataset.fp === fp) {
    const face = el.querySelector('.ag-face');
    if (face) face.title = tipFor(id, name);
    return;
  }
  el.dataset.fp = fp;
  el.innerHTML = '';
  buildChip(el, id, name, state, phase);
}

function renderStrip() {
  if (!_stripEl) return;
  const tracks = _getTracks() || [];
  const want = tracks.map((t) => t.id);
  const have = new Map();
  _stripEl.querySelectorAll('.ag-chip').forEach((c) => have.set(c.dataset.track, c));

  have.forEach((el, id) => { if (!want.includes(id)) el.remove(); });

  want.forEach((id) => {
    let el = have.get(id);
    if (!el) {
      el = document.createElement('span');
      el.className = 'ag-chip';
      _stripEl.appendChild(el);
    } else {
      _stripEl.appendChild(el);
    }
    paintChip(el, id);
  });

  if (_popover && !want.includes(_popover.track)) closePopover();
}

function paintAll() {
  if (_stripEl) _stripEl.querySelectorAll('.ag-chip').forEach((el) => paintChip(el, el.dataset.track));
  _chips = _chips.filter((c) => c.el && c.el.isConnected);
  _chips.forEach((c) => paintChip(c.el, c.getId() || ''));
  if (_popover) renderPopoverBody();
}

function closePopover() {
  if (!_popover) return;
  _popover.el.remove();
  _popover = null;
  document.removeEventListener('mousedown', onDocDown, true);
}

function onDocDown(ev) {
  if (!_popover) return;
  if (_popover.el.contains(ev.target)) return;
  if (_popover.anchor && _popover.anchor.contains(ev.target)) return;
  closePopover();
}

function togglePopover(anchorEl, id, name) {
  if (_popover && _popover.track === id) { closePopover(); return; }
  closePopover();
  const el = document.createElement('div');
  el.className = 'ag-pop';
  document.body.appendChild(el);
  _popover = { el, track: id, name, anchor: anchorEl };
  renderPopoverBody();
  positionPopover();
  document.addEventListener('mousedown', onDocDown, true);
  if (_send) _send({ type: 'feed' });
}

function positionPopover() {
  if (!_popover) return;
  const r = _popover.anchor.getBoundingClientRect();
  const el = _popover.el;
  el.style.top = (r.bottom + 6) + 'px';
  const w = el.offsetWidth || 380;
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
}

function renderPopoverBody() {
  if (!_popover) return;
  const id = _popover.track;
  const rows = rowsForRegion(id);
  const head = '<div class="ag-pop-head">' +
      '<span class="ag-pop-name">' + esc(_popover.name) + '</span>' +
      '<span class="ag-pop-phase">' + esc(_phase[id] || 'idle') + '</span>' +
    '</div>';
  if (!rows.length) {
    _popover.el.innerHTML = head + '<div class="ag-pop-empty">no records for this agent</div>';
    return;
  }
  const shown = rows.slice(0, 40);
  _popover.el.innerHTML = head + '<div class="ag-pop-rows">' + shown.map((r) =>
    '<div class="ag-pr' + (r.pending ? ' pending' : '') + '" data-id="' + escAttr(r.id) + '">' +
      '<div class="ag-pr-top">' +
        '<span class="ag-pr-t">' + esc(r.time) + '</span>' +
        '<span class="ql-edge ' + r.color + '">' + esc(r.edge) + '</span>' +
        '<span class="ag-pr-tgt" title="' + escAttr(r.target) + '">' + esc(r.target) + '</span>' +
      '</div>' +
      (r.summary ? '<div class="ag-pr-sum" title="' + escAttr(r.summary) + '">' + esc(r.summary) + '</div>' : '') +
      (r.pending
        ? '<div class="ag-pr-settle">' +
            '<button class="sbtn approve" data-settle="approve">approve</button>' +
            '<button class="sbtn deny" data-settle="deny">deny</button>' +
            '<button class="sbtn queue" data-settle="queue">queue</button>' +
          '</div>'
        : '') +
    '</div>').join('') + '</div>' +
    (rows.length > shown.length
      ? '<div class="ag-pop-more">' + (rows.length - shown.length) + ' older — open Queue / Log for all</div>'
      : '');

  _popover.el.querySelectorAll('.ag-pr').forEach((row) => {
    row.querySelectorAll('[data-settle]').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        settleGate(row.dataset.id, b.dataset.settle);
      });
    });
  });
}

export function mount(el, ctx) {
  _stripEl = el;
  _send = ctx.send;
  _getTracks = ctx.getTracks || (() => []);
  renderStrip();
  window.addEventListener('resize', () => { if (_popover) positionPopover(); });
}

export function mountPaneChip(el, getId) {
  if (!el) return;
  _chips.push({ el, getId, kind: 'pane' });
  paintChip(el, getId() || '');
}

export function refresh() {
  renderStrip();
  paintAll();
}

export function onFrame(msg) {
  if (!msg) return;

  if (msg.type === 'track_status') {
    _phase[msg.track] = msg.phase || 'idle';
    paintAll();
    return;
  }

  if (msg.type === 'gate_broadcast') {
    const id = msg.track;
    if (msg.kind === 'ask' && id) {
      (_liveGates[id] || (_liveGates[id] = new Set())).add(msg.id);
    } else if (msg.kind === 'resolved') {
      Object.keys(_liveGates).forEach((k) => _liveGates[k].delete(msg.id));
    }
    paintAll();
    return;
  }

  if (msg.type === 'context_warn') {
    if (msg.track) {
      _ctxWarn[msg.track] = { peak: msg.peak, cap: msg.cap };
      paintAll();
    }
    return;
  }

  if (msg.type === 'feed') {
    _feedGates = pendingByRegion();
    Object.keys(_liveGates).forEach((k) => { if (!_feedGates[k]) _liveGates[k].clear(); });
    paintAll();
    return;
  }
}

export function onEsc() {
  if (!_popover) return false;
  closePopover();
  return true;
}
