
'use strict';

let _send = null;
let _getTracks = null;
let _nameOf = null;
let _bar = null;
let _feed = null;
let _wrap = null;
let _head = null;

let _records = [];
let _visible = {};
let _open = {};
let _details = {};
let _asked = {};



const QL_COLS = [
  { key: 'time',    label: 'time',    w: 62,  min: 48  },
  { key: 'action',  label: 'action',  w: 118, min: 80  },
  { key: 'target',  label: 'target',  w: 240, min: 90  },
  { key: 'track',   label: 'track',   w: 130, min: 70  },
  { key: 'summary', label: 'summary', w: 280, min: 90  },
  { key: 'model',   label: 'model',   w: 110, min: 60  },
];
const QL_COLS_KEY = 'ade.queuelog.cols';

let _cols = QL_COLS.map((c) => ({ ...c }));

function colsOrDefault(stored) {
  if (!Array.isArray(stored)) return QL_COLS.map((c) => ({ ...c }));
  const byKey = new Map(QL_COLS.map((c) => [c.key, c]));
  const out = [];
  for (const s of stored) {
    const def = byKey.get(s && s.key);
    if (!def || out.some((o) => o.key === def.key)) continue;
    const w = Number(s.w);
    out.push({ ...def, w: (isFinite(w) && w >= def.min) ? w : def.w });
  }
  for (const def of QL_COLS) {
    if (!out.some((o) => o.key === def.key)) out.push({ ...def });
  }
  return out;
}

function loadCols() {
  let stored = null;
  try { stored = JSON.parse(window.localStorage.getItem(QL_COLS_KEY)); } catch (e) { stored = null; }
  _cols = colsOrDefault(stored);
}

function saveCols() {
  try {
    window.localStorage.setItem(QL_COLS_KEY,
      JSON.stringify(_cols.map((c) => ({ key: c.key, w: c.w }))));
  } catch (e) {  }
}

function applyGrid() {
  if (!_wrap) return;
  _wrap.style.setProperty('--ql-grid', _cols.map((c) => c.w + 'px').join(' '));
}

function esc(s) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
function isClaudeModel(model) { return CLAUDE_MODELS.includes(model); }

function cacheTtlToggle(t) {
  const wrap = document.createElement('span');
  wrap.className = 'ql-ttl';
  wrap.style.display = 'inline-flex';
  wrap.style.gap = '3px';
  wrap.style.marginLeft = '6px';
  let cur = (t.settings && t.settings.claude_cache_ttl) || '1h';
  const btns = [];
  const paint = () => { btns.forEach(({ btn, v }) => { btn.style.opacity = (v === cur) ? '1' : '.45'; }); };
  ['5m', '1h'].forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn';
    b.textContent = v;
    b.style.padding = '1px 6px';
    b.style.fontSize = '9.5px';
    btns.push({ btn: b, v });
    b.onclick = (ev) => {
      ev.stopPropagation();
      if (v === cur) return;
      if (!window.confirm(`Reset this track's Claude cache to ${v} TTL?\n\nA warm (persistent) session respawns and re-pays cache creation on its next turn.`)) return;
      cur = v;
      t.settings = Object.assign({}, t.settings, { claude_cache_ttl: v });
      paint();
      _send({ type: 'edit_track', track: t.id, fields: { claude_cache_ttl: v } });
    };
    wrap.appendChild(b);
  });
  paint();
  return wrap;
}

function excludeDynamicToggle(t) {
  const wrap = document.createElement('span');
  wrap.className = 'ade-exclude-dynamic';
  wrap.style.display = 'inline-flex';
  wrap.style.gap = '3px';
  wrap.style.marginLeft = '4px';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tb-btn';
  b.style.padding = '1px 6px';
  b.style.fontSize = '9.5px';
  const paint = () => {
    const on = !!(t.settings && t.settings.claude_exclude_dynamic);
    b.textContent = on ? 'trim:on' : 'trim:off';
    b.style.opacity = on ? '1' : '.45';
  };
  b.onclick = (ev) => {
    ev.stopPropagation();
    const was = !!(t.settings && t.settings.claude_exclude_dynamic);
    const next = !was;
    const msg = next
      ? "Turn ON --exclude-dynamic-system-prompt-sections for this track?\n\nStrips date/cwd/git-status from Claude's system prompt so a warm-restart cache hits instead of re-writing the whole prefix. Tradeoff: the model loses that situational awareness. A warm (persistent) session respawns to pick this up."
      : "Turn OFF --exclude-dynamic-system-prompt-sections for this track?\n\nRestores date/cwd/git-status in Claude's system prompt. A warm (persistent) session respawns to pick this up.";
    if (!window.confirm(msg)) return;
    t.settings = Object.assign({}, t.settings, { claude_exclude_dynamic: next });
    paint();
    _send({ type: 'edit_track', track: t.id, fields: { claude_exclude_dynamic: next } });
  };
  wrap.appendChild(b);
  paint();
  return wrap;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function getTarget(r) {
  const p = r.payload || {};
  return p.path || p.command || p.url || p.target || p.query || p.note || '—';
}


function regionOf(r) {
  if (!r) return null;
  if (r.region != null) return r.region;
  return r.schema === 1 ? r.track : null;
}

function isPending(r) { return r.outcome === null || r.outcome === undefined; }
function gateColor(r) {
  if (r.action_type === 'user_action') return 'white';
  if (r.hook === null || r.hook === undefined) return 'white';
  if (r.outcome === 'parked') return 'white';
  if (r.outcome === 'killed' || r.outcome === 'timeout') return 'white';
  if (r.outcome === 'locked') return 'red';
  if (isPending(r)) return 'yellow';
  if (r.answer === false) return 'red';
  if (r.hook === 'open') return 'green';
  return 'blue';
}

function isFailedWrite(r) {
  if (r.failed) return true;
  if (r.action_type !== 'write') return false;
  return /^\[WRITE/.test(r.summary || '');
}

export function mount(el, ctx) {
  _send = ctx.send;
  _getTracks = ctx.getTracks;
  _nameOf = ctx.nameOf;
  el.innerHTML =
    '<div id="qlBar"></div>' +
    '<div id="qlWrap">' +
      '<div id="qlHead" class="ql-cols"></div>' +
      '<div id="qlFeed"></div>' +
    '</div>';
  _bar = el.querySelector('#qlBar');
  _wrap = el.querySelector('#qlWrap');
  _head = el.querySelector('#qlHead');
  _feed = el.querySelector('#qlFeed');
  loadCols();
  applyGrid();
  renderHead();
  render();
}

export function refresh() {
  if (_send) _send({ type: 'feed' });
}

export function onFrame(msg) {
  if (!msg) return;
  if (msg.type === 'feed') {
    _records = (msg.records || []).filter(r => r.kind === 'action');
    for (const r of _records) {
      const cached = _details[r.id];
      if (cached && cached.outcome !== r.outcome) {
        delete _details[r.id];
        delete _asked[r.id];
        if (_open[r.id]) requestDetail(r.id);
      }
    }
    render();
    return;
  }
  if (msg.type === 'ledger_detail') {
    const d = msg.detail;
    if (d && d.id) { _details[d.id] = d; if (_open[d.id]) render(); }
    return;
  }
}



export function rowsForRegion(regionId) {
  if (!regionId) return [];
  return _records
    .filter((r) => regionOf(r) === regionId)
    .map((r) => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r))
    .map((r) => ({
      id:      r.id,
      time:    fmtTime(r.parked),
      edge:    r.edge || r.action_type || '?',
      target:  getTarget(r),
      summary: r.summary || '',
      color:   gateColor(r),
      pending: isPending(r),
      parked:  r.parked || 0,
    }))
    .sort((a, b) => (b.pending - a.pending) || (b.parked - a.parked));
}

export function pendingByRegion() {
  const out = {};
  for (const r of _records) {
    if (!isPending(r)) continue;
    const id = regionOf(r);
    if (id) out[id] = (out[id] || 0) + 1;
  }
  return out;
}

function requestDetail(id) {
  if (!_send || !id || _asked[id]) return;
  _asked[id] = true;
  _send({ type: 'ledger_detail', id });
}

export function onEsc() {
  const hadOpen = Object.keys(_open).some((k) => _open[k]);
  if (!hadOpen) return false;
  _open = {};
  render();
  return true;
}

function renderBar() {
  if (!_bar) return;
  const tracks = _getTracks() || [];
  for (const t of tracks) if (!(t.id in _visible)) _visible[t.id] = true;

  _bar.innerHTML = '';
  tracks.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'trackchip ' + (_visible[t.id] !== false ? 'on' : 'off');
    chip.innerHTML =
      '<span class="tc-n">' + esc(t.name || t.id) + '</span>' +
      (t.model ? '<span class="chip">' + esc(t.model) + '</span>' : '');
    chip.onclick = () => { _visible[t.id] = !(_visible[t.id] !== false); render(); };
    if (isClaudeModel(t.model)) chip.appendChild(cacheTtlToggle(t));
    if (isClaudeModel(t.model)) chip.appendChild(excludeDynamicToggle(t));
    _bar.appendChild(chip);
  });

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  _bar.appendChild(spacer);

  const all = document.createElement('button');
  all.className = 'tb-btn'; all.textContent = 'all';
  all.onclick = () => { tracks.forEach(t => { _visible[t.id] = true; }); render(); };
  _bar.appendChild(all);

  const none = document.createElement('button');
  none.className = 'tb-btn'; none.textContent = 'none';
  none.onclick = () => { tracks.forEach(t => { _visible[t.id] = false; }); render(); };
  _bar.appendChild(none);
}



function renderHead() {
  if (!_head) return;
  _head.innerHTML = '';
  _cols.forEach((c, i) => {
    const cell = document.createElement('div');
    cell.className = 'qlh';
    cell.draggable = true;
    cell.dataset.key = c.key;
    cell.innerHTML = '<span class="qlh-l">' + esc(c.label) + '</span>' +
                     '<span class="qlh-grip" draggable="false"></span>';

    cell.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', c.key);
      cell.classList.add('dragging');
    });
    cell.addEventListener('dragend', () => renderHead());
    cell.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      cell.classList.add('dragover');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
    cell.addEventListener('drop', (ev) => {
      ev.preventDefault();
      cell.classList.remove('dragover');
      const from = _cols.findIndex((x) => x.key === ev.dataTransfer.getData('text/plain'));
      if (from < 0 || from === i) return;
      const [moved] = _cols.splice(from, 1);
      _cols.splice(i, 0, moved);
      saveCols();
      applyGrid();
      renderHead();
      render();
    });

    const grip = cell.querySelector('.qlh-grip');
    grip.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const startW = c.w;
      grip.setPointerCapture(ev.pointerId);
      grip.classList.add('resizing');
      const move = (e) => {
        c.w = Math.max(c.min, Math.round(startW + (e.clientX - startX)));
        applyGrid();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        grip.classList.remove('resizing');
        saveCols();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });

    _head.appendChild(cell);
  });
}

export function resetCols() {
  _cols = QL_COLS.map((c) => ({ ...c }));
  saveCols();
  applyGrid();
  renderHead();
  render();
}

function settleHtml(r) {
  return '<div class="ql-settle">' +
    '<span class="sq-q">' + esc(r.edge || r.action_type || '') + ' ' + esc(getTarget(r)) + ' — waiting on you</span>' +
    '<button class="sbtn approve" data-settle="approve">approve</button>' +
    '<button class="sbtn deny" data-settle="deny">deny</button>' +
    '<button class="sbtn queue" data-settle="queue">queue</button>' +
  '</div>';
}

export function settle(id, action) {
  if (!_send) return;
  _send({ type: 'gate_action', action, id });
  refresh();
  setTimeout(refresh, 400);
  setTimeout(refresh, 1500);
}

function ioBox(label, text, note, extra) {
  const head = '<div class="io-l">' + esc(label) +
    (extra ? '<span class="io-x">' + esc(extra) + '</span>' : '') + '</div>';
  if (text !== null && text !== undefined && text !== '') {
    return '<div class="ql-io-box">' + head +
           '<div class="scrollbox">' + esc(text) + '</div></div>';
  }
  return '<div class="ql-io-box">' + head +
         '<div class="io-blank">' + esc(note || '—') + '</div></div>';
}

function inputText(r, d) {
  const src = d || r;
  if (src.prompt) return src.prompt;
  if (src.gate_prompt) return src.gate_prompt;
  const p = src.payload || {};
  const chosen = (p.args && typeof p.args === 'object') ? p.args : p;
  const keys = Object.keys(chosen).filter(
    k => k !== 'target' && k !== 'args' && !/^prior/.test(k)
         && chosen[k] !== null && chosen[k] !== undefined && chosen[k] !== '');
  if (!keys.length) return null;
  return keys.map(k => k + ': ' +
    (typeof chosen[k] === 'string' ? chosen[k] : JSON.stringify(chosen[k], null, 2))
  ).join('\n');
}

function bytesNote(n) {
  if (!n) return '';
  return n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}

function detailEl(r) {
  const d = _details[r.id] || null;
  const waiting = !d && _asked[r.id];
  const miss = '— (record not found)';
  const inp = inputText(r, d);
  const out = d ? d.result : r.result;
  const blobbedIn  = !inp && (r.prompt_blob || r.gate_prompt_blob);
  const blobbedOut = !out && r.result_blob;

  const el = document.createElement('div');
  el.className = 'ql-detail';
  el.addEventListener('click', (ev) => ev.stopPropagation());
  el.innerHTML = '<div class="ql-io">' +
    ioBox('input',  inp, waiting && blobbedIn  ? '— loading…' : (blobbedIn  ? miss : '—')) +
    ioBox('output', out, waiting && blobbedOut ? '— loading…' : (blobbedOut ? miss : '—'),
          bytesNote(r.result_bytes)) +
  '</div>';
  return el;
}

function render() {
  renderBar();
  if (!_feed) return;

  const tracks = _getTracks() || [];
  const byId = new Map(tracks.map(t => [t.id, t]));

  const rows = _records
    .filter(r => !(r.action_type === 'gate' && r.merged))
    .filter(r => _visible[regionOf(r)] !== false)
    .map(r => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
  rows.sort((a, b) => (b.parked || 0) - (a.parked || 0));

  _feed.innerHTML = '';
  if (!rows.length) {
    _feed.innerHTML = '<div class="empty">no records</div>';
    return;
  }

  rows.forEach((r) => {
    const trk = byId.get(regionOf(r));
    const color = gateColor(r);
    const pending = isPending(r);
    const merged = r.action_type !== 'gate' && !!r.gate_id;
    const denied = color === 'red';
    const failed = isFailedWrite(r);
    const isUser = r.driver === 'human';
    const target = getTarget(r);
    const model = trk ? trk.model : (r.vessel || '');
    const trackName = (_nameOf ? _nameOf(regionOf(r)) : (trk ? trk.name : regionOf(r))) || '—';
    const open = !!_open[r.id];

    const cell = {
      time:    '<div class="ql-t">' + fmtTime(r.parked) + '</div>',
      action:  '<div><span class="ql-edge ' + color + '">' + esc(r.edge || r.action_type || '?') + '</span></div>',
      target:  '<div class="ql-tgt" title="' + escAttr(target) + '">' + esc(target) +
                 (isUser ? '<span class="ql-you">you</span>' : '') + '</div>',
      track:   '<div class="ql-tr" title="' + escAttr(trackName) + '">' + esc(trackName) + '</div>',
      summary: '<div class="ql-sum" title="' + escAttr(r.summary || '') + '">' + esc(r.summary || '') + '</div>',
      model:   '<div class="ql-mdl" title="' + escAttr(model) + '">' + esc(model) + '</div>',
    };

    const row = document.createElement('div');
    row.className = 'qlrow ql-cols'
      + (merged ? ' merged' : '')
      + (pending ? ' pending' : '')
      + (denied ? ' denied' : '')
      + (failed ? ' failed' : '')
      + (open ? ' is-open' : '');

    row.innerHTML = _cols.map((c) => cell[c.key] || '<div></div>').join('') +
      (pending ? settleHtml(r) : '');

    row.addEventListener('click', () => {
      _open[r.id] = !_open[r.id];
      if (_open[r.id]) requestDetail(r.id);
      render();
    });
    if (pending) {
      row.querySelectorAll('[data-settle]').forEach((b) => {
        b.addEventListener('click', (ev) => { ev.stopPropagation(); settle(r.id, b.dataset.settle); });
      });
    }

    _feed.appendChild(row);
    if (open) _feed.appendChild(detailEl(r));
  });
}
