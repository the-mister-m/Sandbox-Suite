// ledger.js — the unified Ledger pane (LEDGER-SPEC §4 Pass 3).
// One pane, three views (pending / resolved / all) + a per-record detail view
// (user-toggled: inline accordion OR right-hand drawer, default inline). Replaces
// log.js; queue.js + daemonlog.js are KEPT (Brandon 2026-07-15) as the daemon
// window's own panes. Ported from mockups/recordface-mock.html —
// the mock's render/detail logic is kept intact; its window.RECORD_DATA /
// window.RECORD_BLOBS are swapped for live frames, and its in-memory approve is
// replaced by the REAL gate (ledger_action → dq.answer_gate on the server).
//
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
//
// Frames it consumes:
//   ledger_state  { records:[schema-1,...], sid }   full snapshot, replaces list
//   ledger_detail { detail:{...record, prompt, result} }   one record, on click
// Frames it sends:
//   ledger_list                            request a fresh snapshot
//   ledger_detail { id }                   request one record's full detail
//   ledger_action { action, id }           approve | deny  (A1 scope)
//     approve is HOLD-TO-FIRE — a parked MODEL action is the highest-consequence
//     click in the suite; wired via wireHoldToFire, same as the queue pane.

import { wireHoldToFire } from '../killswitch.js';
import { approveHold } from '../globalflags.js';

// action_type → the word shown in the row (the SYMBOL). Colour still = gate outcome.
const WORD = {
  read: 'read', list: 'list', write: 'write', run: 'run', fetch: 'fetch',
  delegate: 'delegate', remember: 'remember', recall: 'recall',
  settings_change: 'settings', logic_transport: 'transport', web_open: 'open',
};

let _ctx = null;
let _el = null;        // pane root (the grid cell)
let _pane = null;      // .lg-pane wrapper inside the cell
let _body = null;      // scrolling record list (.lg-body)
let _drawer = null;    // right-hand detail drawer  (appended to <body>)
let _backdrop = null;  // drawer backdrop           (appended to <body>)
let _peek = null;      // hover tooltip             (appended to <body>)
let _records = [];     // latest ledger_state snapshot
let _details = {};     // id -> detail object (from ledger_detail frames)
let _sid = null;       // this shell's session id (scope=session filter)
const _state = { sessionOnly: true, merged: true, view: 'pending', openId: null, openIds: new Set(), detailMode: 'inline', showUserActions: true };

// Merged view: hide the gate half of a gate↔execution pair, and overlay the
// gate's colour (hook/answer) onto the surviving execution row so it reads as
// "how it was allowed". Split view leaves every record untouched.
function collapsePairs(list) {
  return list.filter(r => !r.merged)
             .map(r => r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r);
}

// ── resizable columns ───────────────────────────────────────────────────────
// Custody columns are always on now (custody visibility moved to global
// settings). Every column is a fixed px width the user can drag, EXCEPT summary
// (index 4), which flexes to fill remaining space so the grid always spans the
// pane. _state.cols[4] is a placeholder, never read.
const SUMMARY_IDX = 4;
_state.cols = [66, 90, 92, 150, 0, 58, 96, 84, 62, 118];
let _resizing = null;
function applyCols() {
  if (!_pane) return;
  const tpl = _state.cols.map((w, i) => i === SUMMARY_IDX ? 'minmax(60px,1fr)' : w + 'px').join(' ');
  _pane.style.setProperty('--lg-cols', tpl);
}
function startResize(ev, col) {
  ev.preventDefault(); ev.stopPropagation();
  _resizing = { col, x: ev.clientX, w: _state.cols[col] };
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', endResize);
}
function onResize(ev) {
  if (!_resizing) return;
  _state.cols[_resizing.col] = Math.max(40, _resizing.w + (ev.clientX - _resizing.x));
  applyCols();
}
function endResize() {
  _resizing = null;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', endResize);
}

// ── helpers (ported from the mock) ──────────────────────────────────────────
function esc(s) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function isPending(r) { return r.outcome === null || r.outcome === undefined; }

// COLOR = how the action was allowed (the gate-hue LAW, tokens.css §A).
// NOTE: reordered from the mock's gateColor so a resolved pre-permitted record
// (hook="open", answer=null, outcome="fired") reads GREEN, not yellow — the mock
// checked answer===null before the open/pending split, which misfires on real
// "open" records. pending→yellow now wins first; open→green stays reachable.
function gateColor(r) {
  if (r.hook === null || r.hook === undefined) return 'white'; // no gate (thinking/text)
  if (r.outcome === 'parked') return 'white';                  // abandoned — never answered (socket dropped / timed out)
  // Session-teardown terminals (daemon_queue.terminate_session) — no decision
  // was ever made, same class as parked. Without this they read blue/approved.
  if (r.outcome === 'killed' || r.outcome === 'timeout') return 'white';
  if (r.outcome === 'locked') return 'red';                    // blocked by policy
  if (isPending(r)) return 'yellow';                           // queued, still pending
  if (r.answer === false) return 'red';                        // denied
  if (r.hook === 'open') return 'green';                       // pre-permitted (open)
  return 'blue';                                               // asked → approved
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function fmtFullTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }) + ' ' + fmtTime(ms);
}
function fmtDur(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'm';
}
function getTarget(r) {
  const p = r.payload || {};
  if (r.action_type === 'settings_change') return p.edge ? ('policy:' + p.edge) : 'WORKSPACE_ROOT';
  return p.path || p.command || p.url || p.target || p.query || p.note || '—';
}
function recordById(id) {
  for (const r of _records) if (r.id === id) return r;
  return null;
}

// ── list rendering ──────────────────────────────────────────────────────────
// Session scope keeps LIVE pending rows visible even when their sid differs:
// a sid dies on every tab reload, but a parked gate (a model may be BLOCKED
// waiting on it) survives in the queue under the old sid — filtering it out
// leaves an invisible, unanswerable gate (the deferred-approve trap, 2026-07-15).
function sessionScope(list) {
  if (!(_state.sessionOnly && _sid)) return list;
  return list.filter(r => r.session === _sid || (r.live && isPending(r)));
}

function visibleRecords() {
  let list = sessionScope(_records.slice());
  if (_state.merged) list = collapsePairs(list);
  if (!_state.showUserActions) list = list.filter(r => r.action_type !== 'user_action');
  if (_state.view === 'pending') list = list.filter(isPending);
  else if (_state.view === 'resolved') list = list.filter(r => !isPending(r));
  list.sort((a, b) => (b.parked || 0) - (a.parked || 0));
  return list;
}

function updateCounts() {
  let base = sessionScope(_records.slice());
  if (_state.merged) base = base.filter(r => !r.merged);
  if (!_state.showUserActions) base = base.filter(r => r.action_type !== 'user_action');
  const pending = base.filter(isPending).length;
  _el.querySelector('.lg-n-pending').textContent = pending;
  _el.querySelector('.lg-n-resolved').textContent = base.length - pending;
  _el.querySelector('.lg-n-all').textContent = base.length;
}

// Pending rows get action buttons. A LIVE queue record (r.live) can be approved
// (fires the real parked action) or denied. An ORPHAN — pending in the log with
// no live waiter — has nothing to fire, so it shows a single "dismiss" that just
// clears it (routes through deny → _deny_orphan on the server).
function actionButtons(r, wrap) {
  const approveTitle = approveHold() ? 'hold to approve' : 'approve';
  const inner = r.live
    ? '<button class="lg-btn approve" data-act="approve" data-id="' + r.id + '" title="' + approveTitle + '">approve</button>' +
      '<button class="lg-btn deny" data-act="deny" data-id="' + r.id + '">deny</button>'
    : '<button class="lg-btn deny" data-act="deny" data-id="' + r.id + '" title="no live action behind this — clear it">dismiss</button>';
  return '<div class="' + wrap + '">' + inner + '</div>';
}

// Approve wiring honors the global approve_hold toggle (Brandon 2026-07-15):
// hold-to-fire when on; when off the delegated click handlers fire it like
// deny, so there is nothing to wire here.
function wireApprove(root) {
  if (!approveHold()) return;
  root.querySelectorAll('.lg-btn.approve').forEach(b =>
    wireHoldToFire(b, () => action('approve', b.dataset.id)));
}

function rowHtml(r) {
  const color = gateColor(r);
  const word = WORD[r.action_type] || r.action_type || '?';
  const pending = isPending(r);
  const open = _state.detailMode === 'inline' ? _state.openIds.has(r.id) : _state.openId === r.id;
  const cls = 'lg-row' + (pending ? ' is-pending' : '') + (open ? ' is-open' : '');
  const rowInner =
    '<div class="' + cls + '" data-id="' + r.id + '">' +
      '<div class="lg-time">' + fmtTime(r.parked) + '</div>' +
      '<div><span class="aw ' + color + '">' + esc(word) + '</span></div>' +
      '<div class="lg-edge" title="' + escAttr(r.edge) + '">' + esc(r.edge) + '</div>' +
      '<div class="lg-target" title="' + escAttr(getTarget(r)) + '">' + esc(getTarget(r)) + '</div>' +
      '<div class="lg-summary" title="' + escAttr(r.summary) + '">' + esc(r.summary) + '</div>' +
      '<div class="lg-dur">' + fmtDur(r.duration_ms) + '</div>' +
      '<div class="cc">' + esc(r.machine) + '</div>' +
      '<div class="cc">' + esc(r.shell) + '</div>' +
      '<div class="cc">' + esc(r.seat || '—') + '</div>' +
      '<div class="cc" title="' + escAttr(r.vessel || '') + '">' + esc(r.vessel || '—') + '</div>' +
    '</div>';
  return rowInner + (open && _state.detailMode === 'inline' ? inlineDetail(r) : '');
}

function render() {
  const list = visibleRecords();
  _body.innerHTML = list.length
    ? list.map(rowHtml).join('')
    : '<div class="empty">no records in this view</div>';
  updateCounts();
  // approve wiring per the approve_hold toggle — after every render
  // (rows + any open inline detail). deny stays a plain click (delegated below).
  wireApprove(_body);
}

// ── detail (shared guts, both modes) ────────────────────────────────────────
function conditionMarks(conditions) {
  const out = [];
  for (const k in (conditions || {})) {
    const v = conditions[k];
    let pass = true;
    if (v && typeof v === 'object' && 'answer' in v) pass = !!v.answer;
    out.push('<div class="dw-cond"><span class="mark ' + (pass ? 'pass' : 'fail') + '">' +
      (pass ? '✓' : '✕') + '</span>' + esc(k) + '</div>');
  }
  return out.join('') || '<div class="dw-cond muted">no conditions recorded</div>';
}

function blobBox(label, text, fallback) {
  return '<div class="lg-blob"><div class="dw-section-label">' + label + '</div>' +
    '<div class="scrollbox">' + esc(text || fallback) + '</div></div>';
}

// The detail GUTS — shared by inline accordion + slide-in drawer. Custody / chain
// / conditions come from the record itself (already in _records); the two blobs
// (prompt + result) arrive per-click via the ledger_detail frame → _details cache.
function detailInner(r) {
  const d = _details[r.id];
  const loading = !d;
  const promptFallback = loading ? 'loading…'
    : (r.hook === 'open' || r.hook === null)
      ? '(no prompt — action was pre-permitted, hook=' + (r.hook === null ? 'none' : r.hook) + ')'
      : '(prompt not captured for this row — see summary above)';
  const resultFallback = loading ? 'loading…'
    : isPending(r)
      ? '(pending — not yet executed)'
      : '(output not captured — summary: ' + r.summary + (r.result_bytes ? (', ' + r.result_bytes + ' bytes') : '') + ')';

  const custodyLine =
    '<div class="dw-custody">' +
      esc(r.action_type) + ' · ' + esc(getTarget(r)) + ' · driver ' + esc(r.driver) + ' · seat ' + esc(r.seat || '—') +
      '<br>vessel ' + esc(r.vessel || '—') + ' · shell ' + esc(r.shell) + ' · ' + esc(r.machine) + ' · root ' + esc(r.root) +
    '</div>';

  const timesLine =
    '<div class="dw-times">parked ' + fmtFullTime(r.parked) +
    (r.resolved ? ('&nbsp;&nbsp;resolved ' + fmtFullTime(r.resolved) + '&nbsp;&nbsp;(' + fmtDur(r.duration_ms) + ')') : '&nbsp;&nbsp;unresolved') +
    '</div>';

  const chain =
    '<div class="dw-chain">' +
      '<span class="gbadge ' + gateColor(r) + '">' + (r.hook === null ? 'none' : esc(r.hook)) + '</span>' +
      '<span class="arrow">→</span>' +
      '<span class="muted">' + esc(r.answered_by || 'null') + '</span>' +
      '<span class="arrow">→</span>' +
      '<span class="gbadge ' + gateColor(r) + '">' + (r.outcome === null ? 'pending' : esc(r.outcome)) + '</span>' +
      (r.exit_code !== null && r.exit_code !== undefined ? ('<span class="muted">&nbsp;&nbsp;exit ' + r.exit_code + '</span>') : '') +
    '</div>';

  const conditions = '<div class="dw-conditions">' + conditionMarks(r.conditions) + '</div>';

  let actionsHtml = '';
  if (isPending(r)) {
    actionsHtml = actionButtons(r, 'dw-actions');
  }

  return custodyLine + timesLine + chain + conditions +
    '<div class="lg-blobs">' +
      blobBox('the prompt shown', d ? d.prompt : null, promptFallback) +
      blobBox('what it produced', d ? d.result : null, resultFallback) +
    '</div>' + actionsHtml;
}

function inlineDetail(r) {
  return '<div class="lg-detail"><div class="rd-id">ledger ' + r.id + '</div>' + detailInner(r) + '</div>';
}

// ── drawer ──────────────────────────────────────────────────────────────────
function openDrawer(id) {
  const r = recordById(id);
  if (!r) return;
  _state.openId = id;
  _drawer.querySelector('.dw-id').textContent = 'ledger ' + id;
  fillDrawer(id);
  _drawer.classList.add('open');
  _backdrop.classList.add('show');
  render(); // is-open highlight on the row behind it
}
function fillDrawer(id) {
  const r = recordById(id);
  if (!r) return;
  const dwBody = _drawer.querySelector('.dw-body');
  dwBody.innerHTML = detailInner(r);
  wireApprove(dwBody);
}
function closeDrawer() {
  if (_drawer) _drawer.classList.remove('open');
  if (_backdrop) _backdrop.classList.remove('show');
}

// ── peek (hover tooltip) ────────────────────────────────────────────────────
function showPeek(ev, r) {
  _peek.innerHTML =
    '<div class="pk-kind">' + esc(r.action_type) + ' · ' + esc(r.edge) + '</div>' +
    '<div><b>' + esc(getTarget(r)) + '</b></div>' +
    '<div class="pk-row"><span>summary</span><span>' + esc(r.summary) + '</span></div>' +
    '<div class="pk-row"><span>hook</span><span>' + (r.hook === null ? 'none' : esc(r.hook)) + '</span></div>' +
    '<div class="pk-row"><span>duration</span><span>' + fmtDur(r.duration_ms) + '</span></div>';
  _peek.style.display = 'block';
  positionPeek(ev);
}
function positionPeek(ev) {
  let x = ev.clientX + 16, y = ev.clientY + 16;
  const maxX = window.innerWidth - 440, maxY = window.innerHeight - 160;
  if (x > maxX) x = ev.clientX - 436;
  if (y > maxY) y = ev.clientY - 140;
  _peek.style.left = x + 'px';
  _peek.style.top = y + 'px';
}
function hidePeek() { if (_peek) _peek.style.display = 'none'; }

// ── auto-refresh (POLISH LANE I item 1 — the cheap-poll fallback) ───────────
// Push-on-change (server notifier → ledger_state on every mutation) is the
// real fix; this is the 5s poll named as the fallback if that threading gets
// hairy. Open rows survive a poll untouched — onFrame's ledger_state handler
// only replaces _records + calls render(), never touches openIds.
const POLL_MS = 5000;
let _pollTimer = null;
function startPoll() { if (!_pollTimer) _pollTimer = setInterval(requestState, POLL_MS); }
function stopPoll() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

// ── frame senders ───────────────────────────────────────────────────────────
function requestState() { if (_ctx && _ctx.send) _ctx.send({ type: 'ledger_list' }); }
function requestDetail(id) {
  if (_details[id]) return;                 // already cached
  if (_ctx && _ctx.send) _ctx.send({ type: 'ledger_detail', id });
}
function action(act, id) {
  if (_ctx && _ctx.send) _ctx.send({ type: 'ledger_action', action: act, id });
  // collapse any open detail for this row; the server re-sends ledger_state,
  // which re-renders the list with the row moved to resolved.
  if (_state.openId === id) { _state.openId = null; closeDrawer(); }
  _state.openIds.delete(id);
}

// ── open a record's detail (inline accordion or drawer) ─────────────────────
// Inline mode: each row toggles independently (openIds is a set) so several
// rows can sit expanded at once. Drawer mode stays single — it's one slide-in
// panel, not a per-row affordance.
function openDetail(id) {
  if (_state.detailMode === 'drawer') {
    requestDetail(id);
    openDrawer(id);
  } else {
    if (_state.openIds.has(id)) _state.openIds.delete(id);
    else { _state.openIds.add(id); requestDetail(id); }
    render();
  }
}

// ── one-time DOM: the drawer + peek live on <body> (fixed-position overlays) ──
function ensureOverlays() {
  if (_drawer) return; // idempotent (mount runs once, but guard anyway)
  _backdrop = document.createElement('div');
  _backdrop.id = 'lg-backdrop';
  _drawer = document.createElement('div');
  _drawer.id = 'lg-drawer';
  _drawer.className = 'lg-scope';
  _drawer.innerHTML =
    '<div class="dw-head"><div class="dw-id mono"></div><div class="dw-spacer"></div>' +
    '<button class="dw-close" title="close (Esc)">✕</button></div>' +
    '<div class="dw-body"></div>';
  _peek = document.createElement('div');
  _peek.id = 'lg-peek';
  _peek.className = 'lg-scope';
  document.body.appendChild(_backdrop);
  document.body.appendChild(_drawer);
  document.body.appendChild(_peek);

  // drawer interactions
  _drawer.querySelector('.dw-body').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'deny') action('deny', b.dataset.id);
    else if (b.dataset.act === 'approve' && !approveHold()) action('approve', b.dataset.id);
    _state.openId = null; closeDrawer(); render();
  });
  _drawer.querySelector('.dw-close').addEventListener('click', () => { _state.openId = null; closeDrawer(); render(); });
  _backdrop.addEventListener('click', () => { _state.openId = null; closeDrawer(); render(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && _state.openId) { _state.openId = null; closeDrawer(); render(); }
  });
}

// ── the pane ────────────────────────────────────────────────────────────────
const ledgerPane = {
  id: 'ledger',
  label: 'queuelog',

  mount(el, ctx) {
    _ctx = ctx;
    _el = el;
    el.innerHTML = `
      <div class="lg-pane lg-scope">
        <div class="lg-topbar">
          <div class="lg-brand">Queue/Log</div>
          <div class="lg-detailmode">
            <span class="lg-dm-label">rows</span>
            <div class="lg-pills lg-merge-pills">
              <button class="lg-pill active" data-merge="merged">merged</button>
              <button class="lg-pill" data-merge="split">split</button>
            </div>
          </div>
          <div class="lg-detailmode">
            <span class="lg-dm-label">scope</span>
            <div class="lg-pills lg-scope-pills">
              <button class="lg-pill active" data-scope="session">session</button>
              <button class="lg-pill" data-scope="global">global</button>
            </div>
          </div>
          <div class="lg-detailmode">
            <span class="lg-dm-label">detail</span>
            <div class="lg-pills lg-detail-pills">
              <button class="lg-pill active" data-detail="inline">inline</button>
              <button class="lg-pill" data-detail="drawer">drawer</button>
            </div>
          </div>
          <div class="lg-detailmode">
            <span class="lg-dm-label">user</span>
            <div class="lg-pills lg-user-pills">
              <button class="lg-pill active" data-user="shown">shown</button>
              <button class="lg-pill" data-user="hidden">hidden</button>
            </div>
          </div>
          <div class="lg-pills lg-view-pills">
            <button class="lg-pill active" data-view="pending">pending <span class="lg-n lg-n-pending"></span></button>
            <button class="lg-pill" data-view="resolved">resolved <span class="lg-n lg-n-resolved"></span></button>
            <button class="lg-pill" data-view="all">all <span class="lg-n lg-n-all"></span></button>
          </div>
          <button class="lg-refresh" title="refresh">⟳</button>
        </div>
        <div class="lg-head">
          <div class="lg-hcell" data-col="0">time<span class="lg-resizer" data-col="0"></span></div>
          <div class="lg-hcell" data-col="1">action<span class="lg-resizer" data-col="1"></span></div>
          <div class="lg-hcell" data-col="2">edge<span class="lg-resizer" data-col="2"></span></div>
          <div class="lg-hcell" data-col="3">target<span class="lg-resizer" data-col="3"></span></div>
          <div class="lg-hcell">summary</div>
          <div class="lg-hcell lg-dur-h" data-col="5">dur<span class="lg-resizer" data-col="5"></span></div>
          <div class="lg-hcell" data-col="6">machine<span class="lg-resizer" data-col="6"></span></div>
          <div class="lg-hcell" data-col="7">shell<span class="lg-resizer" data-col="7"></span></div>
          <div class="lg-hcell" data-col="8">seat<span class="lg-resizer" data-col="8"></span></div>
          <div class="lg-hcell" data-col="9">vessel<span class="lg-resizer" data-col="9"></span></div>
        </div>
        <div class="lg-body"></div>
      </div>`;
    _pane = el.querySelector('.lg-pane');
    _body = el.querySelector('.lg-body');
    ensureOverlays();

    // column resize → drag a header cell's right edge to set that column's width
    applyCols();
    el.querySelectorAll('.lg-resizer').forEach(h =>
      h.addEventListener('mousedown', (ev) => startResize(ev, +h.dataset.col)));
    // merge pills → collapse each gate↔execution pair into one row, or split them
    el.querySelector('.lg-merge-pills').addEventListener('click', (ev) => {
      const b = ev.target.closest('.lg-pill'); if (!b) return;
      _state.merged = (b.dataset.merge === 'merged');
      el.querySelectorAll('.lg-merge-pills .lg-pill').forEach(p => p.classList.toggle('active', p === b));
      _state.openId = null; _state.openIds.clear(); closeDrawer(); render();
    });
    // scope pills → this-session vs the whole ledger
    el.querySelector('.lg-scope-pills').addEventListener('click', (ev) => {
      const b = ev.target.closest('.lg-pill'); if (!b) return;
      _state.sessionOnly = (b.dataset.scope === 'session');
      el.querySelectorAll('.lg-scope-pills .lg-pill').forEach(p => p.classList.toggle('active', p === b));
      render();
    });
    // view pills
    el.querySelector('.lg-view-pills').addEventListener('click', (ev) => {
      const b = ev.target.closest('.lg-pill'); if (!b) return;
      _state.view = b.dataset.view;
      el.querySelectorAll('.lg-view-pills .lg-pill').forEach(p => p.classList.toggle('active', p === b));
      render();
    });
    // detail-mode pills (inline | drawer)
    el.querySelector('.lg-detail-pills').addEventListener('click', (ev) => {
      const b = ev.target.closest('.lg-pill'); if (!b) return;
      _state.detailMode = b.dataset.detail;
      el.querySelectorAll('.lg-detail-pills .lg-pill').forEach(p => p.classList.toggle('active', p === b));
      _state.openId = null; _state.openIds.clear(); closeDrawer(); render();
    });
    // user pill → show/hide user_action rows (the human's own clicks: gate
    // answers, saves — noise when you just want to watch the model's actions)
    el.querySelector('.lg-user-pills').addEventListener('click', (ev) => {
      const b = ev.target.closest('.lg-pill'); if (!b) return;
      _state.showUserActions = (b.dataset.user === 'shown');
      el.querySelectorAll('.lg-user-pills .lg-pill').forEach(p => p.classList.toggle('active', p === b));
      render();
    });
    // refresh
    el.querySelector('.lg-refresh').addEventListener('click', requestState);

    // body: row click opens detail; deny is a delegated click; approve is a
    // click here too UNLESS approve_hold is on (then it's wired per-render).
    _body.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]');
      if (act) {
        ev.stopPropagation();
        if (act.dataset.act === 'deny') action('deny', act.dataset.id);
        else if (act.dataset.act === 'approve' && !approveHold()) action('approve', act.dataset.id);
        return;
      }
      const row = ev.target.closest('.lg-row');
      if (row) openDetail(row.dataset.id);
    });
    _body.addEventListener('mousemove', (ev) => {
      const row = ev.target.closest('.lg-row');
      if (!row) { hidePeek(); return; }
      const r = recordById(row.dataset.id);
      if (!r) { hidePeek(); return; }
      if (_peek.style.display === 'block') positionPeek(ev); else showPeek(ev, r);
    });
    _body.addEventListener('mouseleave', hidePeek);

    render();
    requestState();  // initial snapshot
    startPoll();
  },

  show() { startPoll(); },
  hide() { hidePeek(); stopPoll(); },

  onFrame(m) {
    if (m.type === 'ledger_state') {
      _records = m.records || [];
      if (m.sid !== undefined && m.sid !== null) _sid = m.sid;
      if (!_body) return;                 // frame arrived before mount — ignore
      render();
      // a still-open drawer refreshes against the new snapshot
      if (_state.openId && _state.detailMode === 'drawer' && _drawer.classList.contains('open')) {
        if (recordById(_state.openId)) fillDrawer(_state.openId);
        else { _state.openId = null; closeDrawer(); }
      }
    } else if (m.type === 'ledger_detail') {
      const d = m.detail;
      if (!d || !d.id) return;
      _details[d.id] = d;
      if (_state.openId === d.id) {
        if (_state.detailMode === 'drawer') fillDrawer(d.id);
        else render();
      }
    }
  },
};

export default ledgerPane;
