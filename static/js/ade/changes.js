
'use strict';

import { openLedgerWindow } from './ledgerview.js';

let _send = null;
let _getTracks = null;
let _nameOf = null;

let _root = null;
let _toggleEl = null;
let _treeEl = null;
let _diffHeadEl = null;
let _diffBodyEl = null;

let _records = [];
let _mode = 'files';
let _expanded = {};
let _details = {};
let _asked = {};
let _selected = undefined;

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


function isPending(r) { return r.outcome === null || r.outcome === undefined; }
function gateColor(r) {
  if (r.action_type === 'user_action') return 'white';
  if (r.hook === null || r.hook === undefined) return 'white';
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

function ioBox(label, text, blobPath, resolving) {
  if (text !== null && text !== undefined && text !== '') {
    return '<div class="ql-io-box"><div class="io-l">' + esc(label) + '</div>' +
           '<div class="scrollbox">' + esc(text) + '</div></div>';
  }
  const note = resolving ? '— (resolving…)' : (blobPath ? '— (too large to show inline)' : '—');
  return '<div class="ql-io-box"><div class="io-l">' + esc(label) + '</div>' +
         '<div class="io-blank">' + esc(note) + '</div></div>';
}



function isHumanChangeVerb(edge) {
  return edge === 'editor_save' || edge === 'file_delete' || edge === 'file_move';
}

function regionOf(r) {
  if (!r) return null;
  if (r.region != null) return r.region;
  return r.schema === 1 ? r.track : null;
}

function toEvent(r, eventKind) {
  const p = r.payload || {};
  return {
    id: r.id,
    ts: r.parked || 0,
    path: p.path || p.target || '(unknown path)',
    track: (r.track === undefined || r.track === null) ? null : r.track,
    region: regionOf(r),
    turn: (r.turn === undefined) ? null : r.turn,
    eventKind,
    edge: r.edge || r.action_type || '?',
    priorExisted: p.prior_existed,
    prior: (p.prior === undefined) ? null : p.prior,
    priorBlob: p.prior_blob || null,
    result: (r.result === undefined) ? null : r.result,
    resultBlob: r.result_blob || null,
    raw: r,
  };
}

function reduceEvents(records) {
  const out = [];
  for (const r of records) {
    if (r.action_type === 'write') {
      if (isPending(r)) { out.push(toEvent(r, 'pending')); continue; }
      if (isFailedWrite(r)) continue;
      out.push(toEvent(r, 'write'));
    } else if (r.action_type === 'gate' && r.edge === 'write' && isPending(r)) {
      out.push(toEvent(r, 'pending'));
    } else if (r.action_type === 'user_action' && isHumanChangeVerb(r.edge)) {
      out.push(toEvent(r, 'human'));
    }
  }
  return out;
}

function whoLabel(e) {
  if (e.eventKind === 'human') return 'you';
  if (e.region == null) return 'unassigned';
  return _nameOf ? _nameOf(e.region) : e.region;
}

function finishGroups(map) {
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.children.sort((a, b) => a.ts - b.ts);
    g.pending = g.children.some((c) => c.eventKind === 'pending');
    g.latestTs = g.children.reduce((m, c) => Math.max(m, c.ts), 0);
  }
  groups.sort((a, b) => b.latestTs - a.latestTs);
  return groups;
}

function groupByFile(events) {
  const map = new Map();
  for (const e of events) {
    if (!map.has(e.path)) map.set(e.path, { key: e.path, label: e.path, children: [] });
    map.get(e.path).children.push(e);
  }
  return finishGroups(map);
}

function groupByAgent(events) {
  const map = new Map();
  for (const e of events) {
    const key = e.region == null ? ' unassigned' : e.region;
    if (!map.has(key)) map.set(key, { key, label: whoLabel(e), children: [] });
    map.get(key).children.push(e);
  }
  return finishGroups(map);
}

function pickDefaultSelected(events) {
  if (!events.length) return undefined;
  if (_selected === null) return null;
  if (_selected && events.some((e) => e.id === _selected)) return _selected;
  let best = events[0];
  for (const e of events) if (e.ts > best.ts) best = e;
  return best.id;
}

export function mount(el, ctx) {
  _send = ctx.send;
  _getTracks = ctx.getTracks;
  _nameOf = ctx.nameOf;
  el.innerHTML =
    '<div id="chgToggle"></div>' +
    '<div id="chgWrap">' +
      '<div id="chgTree"></div>' +
      '<div id="chgDiff">' +
        '<div id="chgDiffHead"></div>' +
        '<div id="chgDiffBody"></div>' +
      '</div>' +
    '</div>';
  _root = el;
  _toggleEl = el.querySelector('#chgToggle');
  _treeEl = el.querySelector('#chgTree');
  _diffHeadEl = el.querySelector('#chgDiffHead');
  _diffBodyEl = el.querySelector('#chgDiffBody');
  render();
}

export function refresh() {
  if (_send) _send({ type: 'feed' });
}

export function onFrame(msg) {
  if (!msg) return;
  if (msg.type === 'feed') {
    _records = (msg.records || [])
      .filter((r) => r.kind === 'action')
      .filter((r) => !(r.action_type === 'gate' && r.merged))
      .map((r) => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
    render();
    return;
  }
  if (msg.type === 'ledger_detail') {
    const d = msg.detail;
    if (d && d.id) { _details[d.id] = d; if (d.id === _selected) render(); }
    return;
  }
}

function requestDetail(id) {
  if (!_send || !id || _asked[id]) return;
  _asked[id] = true;
  _send({ type: 'ledger_detail', id });
}

export function onEsc() {
  const hadOpen = (_selected !== null && _selected !== undefined)
    || Object.keys(_expanded).some((k) => _expanded[k]);
  if (!hadOpen) return false;
  _selected = null;
  Object.keys(_expanded).forEach((k) => { _expanded[k] = false; });
  render();
  return true;
}

function renderToggle() {
  if (!_toggleEl) return;
  _toggleEl.innerHTML =
    '<button class="chg-tbtn' + (_mode === 'files' ? ' active' : '') + '" data-mode="files">files</button>' +
    '<button class="chg-tbtn' + (_mode === 'agent' ? ' active' : '') + '" data-mode="agent">agents</button>';
  _toggleEl.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => { _mode = b.dataset.mode; render(); });
  });
}

function renderTree(groups) {
  if (!_treeEl) return;
  _treeEl.innerHTML = '';
  if (!groups.length) {
    _treeEl.innerHTML = '<div class="empty">nothing changed this session</div>';
    return;
  }
  groups.forEach((g) => {
    const gkey = 'g:' + g.key;
    if (!(gkey in _expanded)) _expanded[gkey] = true;
    const open = _expanded[gkey];

    const parentEl = document.createElement('div');
    parentEl.className = 'cparent' + (g.pending ? ' pending' : '');
    parentEl.innerHTML =
      '<div class="cp-top">' +
        '<span class="cp-caret">' + (open ? '▾' : '▸') + '</span>' +
        '<span class="cp-label" title="' + escAttr(g.label) + '">' + esc(g.label) + '</span>' +
        (g.pending ? '<span class="pendflag">gate</span>' : '') +
        '<span class="cp-count">' + g.children.length + '</span>' +
      '</div>';
    parentEl.querySelector('.cp-top').addEventListener('click', () => {
      _expanded[gkey] = !_expanded[gkey];
      render();
    });
    _treeEl.appendChild(parentEl);

    if (!open) return;
    g.children.forEach((e) => {
      const color = gateColor(overlayGate(e.raw));
      const row = document.createElement('div');
      row.className = 'cchild' + (e.id === _selected ? ' sel' : '') + (e.eventKind === 'pending' ? ' pending' : '');
      const secondary = _mode === 'files' ? whoLabel(e) : e.path;
      row.innerHTML =
        '<span class="ql-edge ' + color + '">' + esc(e.edge) + '</span>' +
        '<span class="cc-what" title="' + escAttr(secondary) + '">' + esc(secondary) + '</span>' +
        '<span class="cc-t">' + fmtTime(e.ts) + '</span>';
      row.addEventListener('click', (ev) => { ev.stopPropagation(); _selected = e.id; render(); });
      _treeEl.appendChild(row);
    });
  });
}

function overlayGate(r) {
  return r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r;
}

const DIFF_MAX_CELLS = 4000000;

function diffLines(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  if (a.length * b.length > DIFF_MAX_CELLS) return null;
  const n = a.length, m = b.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'ctx', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', text: a[i] }); i++; }
    else { out.push({ t: 'add', text: b[j] }); j++; }
  }
  while (i < n) { out.push({ t: 'del', text: a[i] }); i++; }
  while (j < m) { out.push({ t: 'add', text: b[j] }); j++; }
  return out;
}

function priorTextFor(e) {
  if (e.priorExisted === false) return '';
  const d = _details[e.id];
  if (d && d.payload && d.payload.prior !== null && d.payload.prior !== undefined) return d.payload.prior;
  return e.prior;
}

function resultTextFor(e) {
  const d = _details[e.id];
  if (d && d.result !== null && d.result !== undefined) return d.result;
  return e.result;
}

function diffStatHtml(stat) {
  return '<span class="diffstat"><span class="ds-add">+' + stat.add + '</span>' +
         '<span class="ds-del">-' + stat.del + '</span></span>';
}

function renderDiffHead(e, stat) {
  _diffHeadEl.innerHTML =
    '<span class="dh-path">' + esc(e.path) + '</span>' +
    (stat ? diffStatHtml(stat) : '') +
    '<span>' + esc(whoLabel(e)) + ' · ' + fmtTime(e.ts) + '</span>' +
    (e.eventKind === 'pending' ? '<span class="pendflag">waiting on gate</span>' : '') +
    '<span class="ph-spacer"></span>' +
    '<button class="jumpbtn" id="chgJumpBtn">open in queue/log →</button>';
  const jb = _diffHeadEl.querySelector('#chgJumpBtn');
  if (jb) jb.addEventListener('click', () => openLedgerWindow({ track: e.track, turn: e.turn }));
}

function dlineEl(l, e) {
  const el = document.createElement('div');
  el.className = 'dline ' + l.t;
  el.textContent = l.text;
  el.addEventListener('click', () => openLedgerWindow({ track: e.track, turn: e.turn }));
  return el;
}

function renderDiffBody(e) {
  _diffBodyEl.innerHTML = '';

  if (e.eventKind === 'pending') {
    _diffBodyEl.innerHTML = '<div class="empty">not applied yet — waiting on the gate</div>';
    return null;
  }
  if (e.eventKind === 'human') {
    _diffBodyEl.innerHTML = '<div class="empty">human change — no prior recorded for this kind of edit</div>';
    return null;
  }

  const priorText = priorTextFor(e);
  const resultText = resultTextFor(e);
  const priorAvailable = priorText !== null && priorText !== undefined;
  const resultAvailable = resultText !== null && resultText !== undefined;

  if (!priorAvailable || !resultAvailable) {
    if ((e.priorBlob || e.resultBlob) && !_asked[e.id]) requestDetail(e.id);
    const resolving = !_details[e.id] && !!(e.priorBlob || e.resultBlob);
    _diffBodyEl.innerHTML =
      '<div class="ql-io">' +
        ioBox('prior', priorAvailable ? priorText : null, e.priorBlob, resolving) +
        ioBox('written', resultAvailable ? resultText : null, e.resultBlob, resolving) +
      '</div>';
    return null;
  }

  const lines = diffLines(priorText, resultText);
  if (!lines) {
    _diffBodyEl.innerHTML =
      '<div class="muted" style="padding:8px 14px;">file too large to diff inline — showing prior/written separately</div>' +
      '<div class="ql-io">' + ioBox('prior', priorText, null) + ioBox('written', resultText, null) + '</div>';
    return null;
  }
  lines.forEach((l) => _diffBodyEl.appendChild(dlineEl(l, e)));
  let add = 0, del = 0;
  for (const l of lines) { if (l.t === 'add') add++; else if (l.t === 'del') del++; }
  return { add, del };
}

function renderDiff(e, hasEvents) {
  if (!e) {
    _diffHeadEl.innerHTML = '';
    _diffBodyEl.innerHTML = '<div class="empty">' +
      (hasEvents ? 'no change selected' : 'nothing changed this session') + '</div>';
    return;
  }
  const stat = renderDiffBody(e);
  renderDiffHead(e, stat);
}

function render() {
  renderToggle();
  if (!_treeEl) return;

  const events = reduceEvents(_records);
  _selected = pickDefaultSelected(events);

  const groups = _mode === 'files' ? groupByFile(events) : groupByAgent(events);
  renderTree(groups);

  const selectedEvent = (_selected != null)
    ? (events.find((e) => e.id === _selected) || null)
    : null;
  renderDiff(selectedEvent, events.length > 0);
}
