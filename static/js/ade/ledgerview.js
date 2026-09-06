
'use strict';

import { makeChatPane } from './chat.js';

let _send = null;
let _getTracks = null;
let _nameOf = null;
let _isGone = null;
let _host = null;

let _transcripts = {};
let _txRequested = {};

let _records = [];
let _totals = {};
let _atOpen = false;
let _visible = {};
let _hiddenCols = { in: true, cread: true, cwrite: true };
let _sort = { key: 'time', dir: -1 };
let _open = {};
let _openSub = {};
let _pendingFocus = null;
let _dragSrcKey = null;
let _colWidths = {};
let _resizingCol = null;

function esc(s) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function fmtDur(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return ms + 'ms';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  const m = Math.floor(s / 60), rs = Math.round(s - m * 60);
  return m + 'm ' + rs + 's';
}
function num(n) { return (n === null || n === undefined) ? '—' : n.toLocaleString(); }

function getTarget(r) {
  const p = r.payload || {};
  return p.path || p.command || p.url || p.target || p.query || p.note || '—';
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

function ioBox(label, text, blobPath) {
  if (text !== null && text !== undefined && text !== '') {
    return '<div class="ql-io-box"><div class="io-l">' + esc(label) + '</div>' +
           '<div class="scrollbox">' + esc(text) + '</div></div>';
  }
  const note = blobPath ? '— (too large to show inline)' : '—';
  return '<div class="ql-io-box"><div class="io-l">' + esc(label) + '</div>' +
         '<div class="io-blank">' + esc(note) + '</div></div>';
}

function reduceActions(records) {
  return records
    .filter(r => r.kind === 'action')
    .filter(r => !(r.action_type === 'gate' && r.merged))
    .map(r => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
}

function allTurns() { return _records.filter(r => r.kind === 'turn'); }


function chipIds() {
  return [...new Set(allTurns().map(regionOf).filter(Boolean))];
}


function regionOf(r) {
  if (!r) return null;
  if (r.region != null) return r.region;
  return r.schema === 1 ? r.track : null;
}

function sameTurn(a, t) {
  const ar = regionOf(a), tr = regionOf(t);
  if (ar == null || a.turn == null || tr == null || t.turn == null) return false;
  return String(ar) === String(tr) && String(a.turn) === String(t.turn);
}
function matchedActions(t) {
  const acts = reduceActions(_records);
  return acts.filter(a => sameTurn(a, t));
}


const COLS = [
  { key: 'time',       label: 'Time',       sort: true,  pin: true },
  { key: 'track',      label: 'Track',      sort: true },
  { key: 'turn',       label: 'Turn',       sort: true },
  { key: 'call',       label: 'Call',       sort: true },
  { key: 'duration',   label: 'Duration',   sort: true },
  { key: 'model',      label: 'Model',      sort: true },
  { key: 'stop',       label: 'Stop',       sort: false },
  { key: 'actions',    label: 'Actions',    sort: true },
  { key: 'cost',       label: 'Cost $',     sort: true },
  { key: 'out',        label: 'Out',        sort: true },
  { key: 'readbilled', label: 'Read',       sort: true },
  { key: 'readpeak',   label: 'Read Peak',  sort: true },
  { key: 'cw5m',       label: 'Write 5m',   sort: true },
  { key: 'cw1h',       label: 'Write 1h',   sort: true },
  { key: 'in',         label: 'In (legacy)',       sort: true },
  { key: 'cread',      label: 'Cache R (legacy)',  sort: true },
  { key: 'cwrite',     label: 'Cache W (legacy)',  sort: true },
];
function shownCols() {
  return COLS.filter(c => !_hiddenCols[c.key]);
}



function usageOf(t) {
  const c = t && t._call;
  if (c) {
    return { in: c.input, out: c.output, cread: c.cache_read,
             cw: null, cw5m: c.cache_write_5m, cw1h: c.cache_write_1h,
             readBilled: c.cache_read, readPeak: c.cache_read };
  }
  const u = (t && t.usage) || {};
  const hasSplit = u.cache_read_billed != null || u.cache_read_peak != null;
  return {
    in: u.in_tokens, out: u.out_tokens, cread: u.cache_read, cw: u.cache_creation,
    cw5m: u.cache_write_5m != null ? u.cache_write_5m : null,
    cw1h: u.cache_write_1h != null ? u.cache_write_1h : null,
    readBilled: hasSplit ? u.cache_read_billed : u.cache_read,
    readPeak: hasSplit ? u.cache_read_peak : u.cache_read,
  };
}

function costOf(t) {
  if (t && t._call) return t._call.cost_usd;
  return t ? t.cost_usd : null;
}

function rowKey(t) { return t._call ? (t.id + '::' + t._call.id) : t.id; }

function trackName(id) {
  if (id == null || id === '') return '—';
  return (_nameOf ? _nameOf(id) : id) || '—';
}


function goneCls(id) {
  return (_isGone && _isGone(id)) ? ' led-gone' : '';
}

function sortVal(key, t) {
  switch (key) {
    case 'time':      return t.started || 0;
    case 'track':     return trackName(regionOf(t));
    case 'turn':      return t.turn == null ? -1 : t.turn;
    case 'duration':  return t.duration_ms == null ? -1 : t.duration_ms;
    case 'model':     return t.vessel || '';
    case 'stop':      return t.stop_reason || '';
    case 'actions':   return matchedActions(t).length;
    case 'cost':      return costOf(t) == null ? -1 : costOf(t);
    case 'call':      return t._call ? (t._call.id || '') : '';
    case 'in':        return uv(usageOf(t).in);
    case 'out':       return uv(usageOf(t).out);
    case 'cread':     return uv(usageOf(t).cread);
    case 'cwrite':    return uv(usageOf(t).cw);
    case 'cw5m':      return uv(usageOf(t).cw5m);
    case 'cw1h':      return uv(usageOf(t).cw1h);
    case 'readbilled': return uv(usageOf(t).readBilled);
    case 'readpeak':   return uv(usageOf(t).readPeak);
    default:          return 0;
  }
}
function uv(n) { return n == null ? -1 : n; }

function cellFor(key, t) {
  const u = usageOf(t);
  switch (key) {
    case 'time':      return '<span class="caret">' + (_open[t.id] ? '▾' : '▸') + '</span>' + fmtTime(t.started);
    case 'track':     {
      const rid = regionOf(t), rn = trackName(rid);
      return '<span class="' + ('track-name' + goneCls(rid)) + '" title="' + escAttr(rn) + '">' + esc(rn) + '</span>';
    }
    case 'turn':      return t.turn == null ? '—' : String(t.turn);
    case 'duration':  return fmtDur(t.duration_ms);
    case 'model':     return t.vessel ? '<span class="chip">' + esc(t.vessel) + '</span>' : '—';
    case 'stop':      return esc(t.stop_reason || '—');
    case 'actions':   return String(matchedActions(t).length);
    case 'cost':      return costOf(t) == null ? '—' : '$' + Number(costOf(t)).toFixed(4);
    case 'call':      return t._call
                        ? '<span class="chip" title="' + escAttr(t._call.id) + '">' + esc(shortId(t._call.id)) + '</span>'
                        : '<span class="muted" title="this vessel reports no per-call usage">—</span>';
    case 'in':        return u.in    == null ? '—' : num(u.in);
    case 'out':       return u.out   == null ? '—' : num(u.out);
    case 'cread':     return u.cread == null ? '—' : num(u.cread);
    case 'cwrite':    return u.cw    == null ? '—' : num(u.cw);
    case 'cw5m':      return u.cw5m  == null ? '—' : num(u.cw5m);
    case 'cw1h':      return u.cw1h  == null ? '—' : num(u.cw1h);
    case 'readbilled': return u.readBilled == null ? '—' : num(u.readBilled);
    case 'readpeak':   return u.readPeak   == null ? '—' : num(u.readPeak);
  }
  return '';
}
function shortId(s) {
  s = String(s || '');
  return s.length <= 14 ? s : (s.slice(0, 8) + '…' + s.slice(-4));
}
const NUMCOLS = ['duration', 'actions', 'cost', 'in', 'out', 'cread', 'cwrite', 'cw5m', 'cw1h', 'readbilled', 'readpeak'];

export function mount(el, ctx, initFilter) {
  _send = ctx.send;
  _getTracks = ctx.getTracks;
  _nameOf = ctx.nameOf;
  _isGone = ctx.isGone;
  _host = el;
  if (initFilter && (initFilter.track != null || initFilter.turn != null)) {
    _pendingFocus = initFilter;
  }
  el.innerHTML =
    '<div class="ledgerRoot">' +
      '<div id="ledBar"></div>' +
      '<div id="rollup"></div>' +
      '<div id="agentTotals"></div>' +
      '<div id="ledScroll">' +
        '<table class="led"><colgroup id="ledCols"></colgroup><thead><tr id="ledHead"></tr></thead><tbody id="ledBody"></tbody></table>' +
      '</div>' +
      '<div id="legend"></div>' +
    '</div>';
  render();
}

export function refresh() {
  _transcripts = {};
  _txRequested = {};
  if (_send) _send({ type: 'feed' });
}

export function onFrame(msg) {
  if (!msg) return;
  if (msg.type === 'feed') {
    _records = msg.records || [];
    _totals = msg.totals || {};
    render();
  } else if (msg.type === 'transcript') {
    _transcripts[msg.id] = msg.messages || [];
    render();
  }
}

export function onEsc() {
  const hadOpen = Object.keys(_open).some((k) => _open[k]) ||
                  Object.keys(_openSub).some((k) => _openSub[k]);
  if (!hadOpen) return false;
  _open = {};
  _openSub = {};
  render();
  return true;
}

export function openLedgerWindow(filter) {
  let url = '/ade/ledger';
  if (filter) {
    const p = new URLSearchParams();
    if (filter.track != null) p.set('track', filter.track);
    if (filter.turn != null) p.set('turn', String(filter.turn));
    const qs = p.toString();
    if (qs) url += '?' + qs;
  }
  window.open(url, '_blank', 'width=1100,height=700');
}

function render() {
  if (!_host) return;
  renderBar();
  renderRollup();
  renderAgentTotals();
  renderBody();
  renderLegend();
}

function renderBar() {
  const bar = _host.querySelector('#ledBar');
  if (!bar) return;
  const tracks = _getTracks ? _getTracks() : [];
  const regionIds = chipIds();
  let html = '<div class="led-chips">';
  for (const id of regionIds) {
    const on = _visible[id] !== false;
    const cls = (on ? 'chip on' : 'chip off') + goneCls(id);
    html += '<span class="' + cls + '" data-track="' + escAttr(id) + '">' + esc(trackName(id)) + '</span>';
  }
  html += '<button class="tb-btn" id="ledTrackAll">all</button><button class="tb-btn" id="ledTrackNone">none</button>';
  html += '</div>';
  html += '<div class="led-bar-right">';
  html += '<button class="btn-cols" id="colsBtn">Columns ▾</button>';
  html += '<div class="cols-panel hidden" id="colsPanel">';
  for (const c of COLS) {
    if (c.pin) continue;
    const checked = !_hiddenCols[c.key] ? ' checked' : '';
    html += '<label><input type="checkbox" data-col="' + c.key + '"' + checked + '> ' + esc(c.label) + '</label>';
  }
  html += '<button class="tb-btn" id="ledColAll">all</button><button class="tb-btn" id="ledColNone">none</button>';
  html += '</div></div>';
  bar.innerHTML = html;
  bar.querySelectorAll('.chip').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.track;
      _visible[id] = _visible[id] === false;
      render();
    };
  });
  const trackAll = bar.querySelector('#ledTrackAll');
  if (trackAll) trackAll.onclick = () => { regionIds.forEach(id => { _visible[id] = true; }); render(); };
  const trackNone = bar.querySelector('#ledTrackNone');
  if (trackNone) trackNone.onclick = () => { regionIds.forEach(id => { _visible[id] = false; }); render(); };
  const colsBtn = bar.querySelector('#colsBtn');
  const colsPanel = bar.querySelector('#colsPanel');
  if (colsBtn && colsPanel) {
    colsBtn.onclick = (e) => { e.stopPropagation(); colsPanel.classList.toggle('hidden'); };
    document.addEventListener('click', () => colsPanel.classList.add('hidden'), { once: false });
    colsPanel.onclick = (e) => e.stopPropagation();
    colsPanel.querySelectorAll('input[data-col]').forEach(inp => {
      inp.onchange = () => {
        _hiddenCols[inp.dataset.col] = !inp.checked;
        render();
      };
    });
    const colAll = colsPanel.querySelector('#ledColAll');
    if (colAll) colAll.onclick = () => { _hiddenCols = {}; render(); };
    const colNone = colsPanel.querySelector('#ledColNone');
    if (colNone) colNone.onclick = () => { COLS.filter(c => !c.pin).forEach(c => { _hiddenCols[c.key] = true; }); render(); };
  }
}


function renderRollup() {
  const el = _host.querySelector('#rollup');
  if (!el) return;
  const turns = allTurns().filter(t => _visible[regionOf(t)] !== false);
  let cost = 0, totalOut = 0, readBilled = 0, readPeak = 0, cw5m = 0, cw1h = 0, dur = 0, actions = 0;
  for (const t of turns) {
    cost += costOf(t) || 0;
    const u = usageOf(t);
    totalOut   += u.out        || 0;
    readBilled += u.readBilled || 0;
    readPeak   += u.readPeak   || 0;
    cw5m       += u.cw5m       || 0;
    cw1h       += u.cw1h       || 0;
    dur += t.duration_ms || 0;
    actions += matchedActions(t).length;
  }
  const chip = (label, value, dim) =>
    '<div class="rchip"><div class="rv' + (dim ? ' dim' : '') + '">' + esc(value) + '</div>' +
    '<div class="rl">' + esc(label) + '</div></div>';
  el.innerHTML =
    chip('Turns', String(turns.length), !turns.length) +
    chip('Duration', fmtDur(dur), !dur) +
    chip('Cost', '$' + cost.toFixed(4), !cost) +
    chip('Actions', String(actions), !actions) +
    chip('Out', num(totalOut), !totalOut) +
    chip('Read', num(readBilled), !readBilled) +
    chip('Read Peak', num(readPeak), !readPeak) +
    chip('Write 5m', num(cw5m), !cw5m) +
    chip('Write 1h', num(cw1h), !cw1h) +
    '<div class="rchip spacer"></div>';
}






function renderAgentTotals() {
  const el = _host.querySelector('#agentTotals');
  if (!el) return;
  const chips = chipIds();
  const ids = Object.keys(_totals || {})
    .filter(id => chips.includes(id) && _visible[id] !== false);
  if (!ids.length) { el.innerHTML = ''; return; }
  ids.sort((a, b) => (_totals[b].read_peak || 0) - (_totals[a].read_peak || 0));

  const topPeak = _totals[ids[0]].read_peak || 0;
  const summary = ids.length + (ids.length === 1 ? ' agent' : ' agents') +
                  (topPeak ? ' · peak ' + num(topPeak) : '');
  let html = '<div class="at-head' + (_atOpen ? '' : ' closed') + '" id="atToggle">' +
    '<span class="at-caret">' + (_atOpen ? '\u25be' : '\u25b8') + '</span>' +
    '<span>Per-Agent Totals</span>' +
    '<span class="at-sum">' + esc(summary) + '</span>' +
    '</div>';

  if (_atOpen) {
    html += '<table class="at"><thead><tr>'
      + '<th>Agent</th><th>Turns</th><th title="the largest context this agent ever held — a MAX across turns, and the number the context reset cap fires on">Read Peak</th>'
      + '<th title="every cached token this agent paid to read — a SUM across turns">Read</th>'
      + '<th>Out</th><th>Write 5m</th><th>Write 1h</th><th>Cost $</th></tr></thead><tbody>';
    for (const id of ids) {
      const e = _totals[id] || {};
      html += '<tr>'
        + '<td class="at-name' + goneCls(id) + '">' + esc(trackName(id)) + '</td>'
        + '<td>' + num(e.turns) + '</td>'
        + '<td class="at-peak">' + num(e.read_peak) + '</td>'
        + '<td>' + num(e.read_billed) + '</td>'
        + '<td>' + num(e.out) + '</td>'
        + '<td>' + num(e.write_5m) + '</td>'
        + '<td>' + num(e.write_1h) + '</td>'
        + '<td>' + (e.cost_usd ? '$' + Number(e.cost_usd).toFixed(4) : '—') + '</td>'
        + '</tr>';
    }
    html += '</tbody></table>';
  }
  el.innerHTML = html;

  const head = el.querySelector('#atToggle');
  if (head) head.onclick = () => { _atOpen = !_atOpen; render(); };
}

function renderLegend() {
  const el = _host.querySelector('#legend');
  if (!el) return;
  el.innerHTML =
    '<div class="lg"><span class="lgl">Color = gate outcome</span>' +
    '<span class="sw" style="background:var(--gate-white)"></span>no gate' +
    '<span class="sw" style="background:var(--gate-green)"></span>pre-permitted' +
    '<span class="sw" style="background:var(--gate-blue)"></span>asked &rarr; approved' +
    '<span class="sw" style="background:var(--gate-yellow)"></span>queued, pending' +
    '<span class="sw" style="background:var(--gate-red)"></span>denied</div>';
}

function renderBody() {
  const headEl = _host.querySelector('#ledHead');
  const bodyEl = _host.querySelector('#ledBody');
  if (!headEl || !bodyEl) return;

  const cols = shownCols();

  const colsEl = _host.querySelector('#ledCols');
  if (colsEl) {
    let colgroupHtml = '';
    for (const c of cols) {
      const w = _colWidths[c.key];
      colgroupHtml += '<col data-col="' + c.key + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>';
    }
    colsEl.innerHTML = colgroupHtml;
  }

  let headHtml = '';
  for (const c of cols) {
    const sortable = c.sort ? ' class="sortable"' : '';
    const arrow = _sort.key === c.key ? (_sort.dir > 0 ? ' ▲' : ' ▼') : '';
    headHtml += '<th' + sortable + ' data-col="' + c.key + '">' + esc(c.label) + arrow +
                '<span class="col-resizer" data-col="' + c.key + '" draggable="false"></span></th>';
  }
  headEl.innerHTML = headHtml;
  headEl.querySelectorAll('th.sortable').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.col;
      if (_sort.key === k) _sort.dir *= -1;
      else { _sort.key = k; _sort.dir = 1; }
      render();
    };
  });
  headEl.querySelectorAll('.col-resizer').forEach(handle => {
    handle.onclick = (e) => e.stopPropagation();
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = handle.dataset.col;
      const th = handle.closest('th');
      startColResize(key, e.clientX, th ? th.getBoundingClientRect().width : (_colWidths[key] || 120));
    });
  });
  headEl.querySelectorAll('th').forEach(th => {
    th.draggable = true;
    th.addEventListener('dragstart', (e) => {
      _dragSrcKey = th.dataset.col;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', th.dataset.col);
      th.classList.add('dragging');
    });
    th.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      th.classList.add('drag-over');
    });
    th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
    th.addEventListener('drop', (e) => {
      e.preventDefault();
      th.classList.remove('drag-over');
      if (_dragSrcKey && _dragSrcKey !== th.dataset.col) reorderColumn(_dragSrcKey, th.dataset.col);
      _dragSrcKey = null;
    });
    th.addEventListener('dragend', () => {
      headEl.querySelectorAll('th').forEach(x => x.classList.remove('dragging', 'drag-over'));
      _dragSrcKey = null;
    });
  });

  let turns = allTurns().filter(t => _visible[regionOf(t)] !== false);

  turns.sort((a, b) => {
    const av = sortVal(_sort.key, a), bv = sortVal(_sort.key, b);
    if (av < bv) return -_sort.dir;
    if (av > bv) return _sort.dir;
    return 0;
  });

  let _focusHitId = null;
  if (_pendingFocus && turns.length) {
    const pf = _pendingFocus;
    _pendingFocus = null;
    for (const t of turns) {
      const match = (pf.track == null || String(regionOf(t)) === String(pf.track)) &&
                    (pf.turn == null || String(t.turn) === String(pf.turn));
      if (match) { _open[t.id] = true; _focusHitId = t.id; break; }
    }
  }

  let bodyHtml = '';
  for (const t of turns) {
    const open = _open[t.id];
    const rowCls = open ? 'trow open' : 'trow';
    bodyHtml += '<tr class="' + rowCls + '" data-id="' + escAttr(t.id) + '">';
    for (const c of cols) {
      const numCls = NUMCOLS.includes(c.key) ? ' class="num"' : '';
      bodyHtml += '<td' + numCls + '>' + cellFor(c.key, t) + '</td>';
    }
    bodyHtml += '</tr>';
    if (open) {
      bodyHtml += subRowsFor(t, cols.length);
    }
  }
  if (!turns.length) {
    bodyHtml = '<tr><td colspan="' + cols.length + '" class="empty">No turns recorded yet.</td></tr>';
  }
  bodyEl.innerHTML = bodyHtml;

  for (const t of turns) {
    if (!_open[t.id]) continue;
    const wrap = bodyEl.querySelector('#tx-' + CSS.escape(t.id));
    if (wrap) mountTranscript(t, wrap);
  }

  bodyEl.querySelectorAll('tr.trow').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest('.srow')) return;
      const id = tr.dataset.id;
      _open[id] = !_open[id];
      render();
    };
  });

  bodyEl.querySelectorAll('.srow[data-subid]').forEach(sr => {
    sr.onclick = (e) => {
      e.stopPropagation();
      const subid = sr.dataset.subid;
      _openSub[subid] = !_openSub[subid];
      render();
    };
  });

  if (_focusHitId != null) {
    const row = bodyEl.querySelector('tr[data-id="' + escAttr(_focusHitId) + '"]');
    if (row) {
      row.classList.add('flash');
      row.scrollIntoView({ block: 'center' });
    }
  }
}

function reorderColumn(srcKey, targetKey) {
  let srcIdx = -1, targetIdx = -1;
  for (let i = 0; i < COLS.length; i++) {
    if (COLS[i].key === srcKey) srcIdx = i;
    if (COLS[i].key === targetKey) targetIdx = i;
  }
  if (srcIdx === -1 || targetIdx === -1) return;
  const moved = COLS.splice(srcIdx, 1)[0];
  COLS.splice(targetIdx, 0, moved);
  render();
}

function startColResize(key, startX, startW) {
  _resizingCol = { key, x: startX, w: startW };
  document.addEventListener('mousemove', onColResize);
  document.addEventListener('mouseup', endColResize);
}
function onColResize(e) {
  if (!_resizingCol) return;
  const w = Math.max(40, Math.round(_resizingCol.w + (e.clientX - _resizingCol.x)));
  _colWidths[_resizingCol.key] = w;
  applyColWidths();
}
function endColResize() {
  _resizingCol = null;
  document.removeEventListener('mousemove', onColResize);
  document.removeEventListener('mouseup', endColResize);
}
function applyColWidths() {
  const colsEl = _host && _host.querySelector('#ledCols');
  if (!colsEl) return;
  colsEl.querySelectorAll('col').forEach(col => {
    const w = _colWidths[col.dataset.col];
    if (w) col.style.width = w + 'px';
  });
}

function subRowsFor(t, colSpan) {
  const acts = matchedActions(t).sort((a, b) => (a.parked || 0) - (b.parked || 0));
  let html = '';

  if (!acts.length) {
    html += '<tr class="srow last"><td colspan="' + colSpan + '">' +
            '<div class="sline"><span class="muted">no matched action records for this turn</span></div>' +
            '</td></tr>';
    html += transcriptRowHtml(t, colSpan);
    return html;
  }

  acts.forEach((r, i) => {
    const key = t.id + '::' + r.id;
    const open = !!_openSub[key];
    const color = gateColor(r);
    const failed = isFailedWrite(r);
    const isUser = r.driver === 'human';
    const lastCls = (i === acts.length - 1) ? ' last' : '';
    html += '<tr class="srow' + lastCls + '" data-subid="' + escAttr(key) + '"><td colspan="' + colSpan + '">' +
      '<div class="sline">' +
        '<span class="skind gate"><span class="ql-edge ' + color + '">' + esc(r.edge || r.action_type || '?') + '</span></span>' +
        '<div class="sbody can">' +
          '<span class="sfact mono' + (failed ? ' failed' : '') + '">' + esc(getTarget(r)) + '</span>' +
          (r.summary ? ' <span class="muted" style="font-size:10.5px">— ' + esc(r.summary) + '</span>' : '') +
          (isUser ? '<span class="ql-you">you</span>' : '') +
          (r.duration_ms != null ? ' <span class="muted" style="font-size:10.5px">' + r.duration_ms + 'ms</span>' : '') +
          (open ? '<div class="ql-io" style="margin-top:6px">' + ioBox('input', r.prompt, r.prompt_blob) + ioBox('output', r.result, r.result_blob) + '</div>' : '') +
        '</div>' +
      '</div>' +
    '</td></tr>';
  });

  html += transcriptRowHtml(t, colSpan);
  return html;
}

function transcriptRowHtml(t, colSpan) {
  return '<tr class="srow srow-transcript"><td colspan="' + colSpan + '">' +
         '<div class="cp-script tx-wrap" id="tx-' + escAttr(t.id) + '" ' +
         'style="max-height:280px;overflow-y:auto"></div>' +
         '</td></tr>';
}

function mountTranscript(t, wrap) {
  const rgn = regionOf(t);
  if (rgn == null) {
    wrap.innerHTML = '<div class="empty">no track</div>';
    return;
  }
  const all = _transcripts[rgn];
  if (all === undefined) {
    wrap.innerHTML = '<div class="empty">loading transcript…</div>';
    if (_send && !_txRequested[rgn]) {
      _txRequested[rgn] = true;
      _send({ type: 'transcript', track: rgn });
    }
    return;
  }
  const mine = (all || []).filter(m => m && m._turn === t.turn);
  if (!mine.length) {
    wrap.innerHTML = '<div class="empty">no transcript for this turn</div>';
    return;
  }
  const gateListEl = document.createElement('div');
  const pane = makeChatPane({ scriptEl: wrap, gateListEl }, _send, {});
  pane.setTrack(rgn, trackName(rgn));
  pane.renderTranscript(mine);
}
