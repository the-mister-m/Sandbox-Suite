// shell.js — ESM entry point.
// Owns: WebSocket connection, frame router, header toggle buttons,
// resizable quadrant gutters, gate modal, and pane registration.
//
// Conference room mode: if ?room=<id> is in the URL, connects to /ws/room
// and mounts the conference UI instead of the normal pane grid. The room id
// (Rung 14 — room registry) is carried straight through as a querystring on
// the /ws/room URL itself, so the server can join-or-create the shared room
// before the socket handler even starts reading frames. ?room=1 (the old
// "just open a room" link) maps to the room id 'default'; ?room=lobby joins
// (or creates) a room called 'lobby'. An optional ?name=<label> sets this
// connection's display label in the presence transcript — omit it and the
// server assigns 'guest-N'.
//
// Daemon window mode (DAEMON-SPEC §6): if the page is served at /daemon,
// connects to /ws/daemon and mounts the 4-pane daemon layout (chat / queue /
// log / settings) instead of the normal grid — same pattern as room mode:
// one entry point, mode detected client-side, a dedicated WS endpoint.

import chatPane, { append as chatAppend } from './panes/chat.js';
import terminalPane from './panes/terminal.js';
import editorPane   from './panes/editor.js';
import filesPane    from './panes/browser.js';
import previewPane  from './panes/preview.js';
import ledgerPane   from './panes/ledger.js';
import settingsPane from './panes/settings.js';
import conferenceUI from './panes/conference.js';
import queuePane      from './panes/queue.js';
import daemonLogPane  from './panes/daemonlog.js';
import { wireKillswitch } from './killswitch.js';
import { modalMode, gateKeyboard, refresh as refreshGlobalFlags } from './globalflags.js';

// ── Conference room / daemon window detection ─────────────────────────────────
const _roomParam = new URLSearchParams(location.search).get('room');
const _isRoom    = _roomParam !== null;
// '1' (and '') is the bare "?room=1" link's value — map it to a stable id
// rather than treating "1" itself as a meaningful room name.
const _roomId    = _isRoom ? ((_roomParam === '1' || _roomParam === '') ? 'default' : _roomParam) : null;
let _roomName    = new URLSearchParams(location.search).get('name') || '';
const _isDaemon  = !_isRoom && location.pathname.replace(/\/+$/, '') === '/daemon';
// ROOM mode with no ?name= — prompt for a display name before the socket
// connects (see the showPrompt call near the bottom of the file) so the name
// rides the very first ?name= query param the server sees, rather than
// landing as guest-N and never getting fixed up. Everything else (normal /ws,
// /ws/daemon) connects synchronously exactly as before.
const _needsNamePrompt = _isRoom && !_roomName;

// ── WebSocket ─────────────────────────────────────────────────────────────────
function _roomWsPath() {
  const q = new URLSearchParams({ id: _roomId });
  if (_roomName) q.set('name', _roomName);
  return `/ws/room?${q.toString()}`;
}
// `ws` is deferred (not `const`-assigned here) only for the ROOM+no-name case —
// see _connectRoomSocket() near the bottom of the file, called after the name
// prompt resolves. Every other mode still connects synchronously, right here.
let ws;
if (!_needsNamePrompt) {
  ws = new WebSocket(`ws://${location.host}${_isRoom ? _roomWsPath() : _isDaemon ? '/ws/daemon' : '/ws'}`);
}

// Frames issued before the socket is OPEN used to be silently dropped — that's
// why the files pane never populated (filesPane.mount fires requestTree('.') at
// page load, while ws is still CONNECTING). Queue pre-open frames and flush them
// on open so any mount-time request is actually delivered. In the deferred
// ROOM+no-name case, `ws` doesn't exist yet at all (still awaiting the name
// prompt) — guard on that too, same queue, same flush-on-open path.
const _preopenQueue = [];
function wsSend(frame) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  else _preopenQueue.push(frame);
}

// ctx object passed to every pane mount. answerGate is the single gate-answer
// path (defined below, hoisted) shared by the modal and the chat bar fallback.
// showConfirm and showTriple are added after their definitions (ctx is a mutable object).
const ctx = { send: wsSend, answerGate };

// ── Pane registry ─────────────────────────────────────────────────────────────
// Order: chat | terminal | editor | files | preview
// Each entry: { pane, el, btn, visible }
const PANES = [
  { pane: chatPane,     el: null, btn: null, visible: true  },
  { pane: terminalPane, el: null, btn: null, visible: false },
  { pane: editorPane,   el: null, btn: null, visible: true  },
  { pane: filesPane,    el: null, btn: null, visible: true  },
  { pane: ledgerPane,   el: null, btn: null, visible: true  },
  { pane: previewPane,  el: null, btn: null, visible: false },
];

// ── Grid management ───────────────────────────────────────────────────────────
const grid    = document.getElementById('grid');
const gutterV = document.getElementById('gutter-v');
const gutterH = document.getElementById('gutter-h');

const root = document.documentElement;

// Gutter size matches --gutter-sz in the skin files (css/skins/*.css) (6px)
const GUTTER = '6px';

function getVisible() {
  return PANES.filter(p => p.visible);
}

function setGridTemplate(cols, rows) {
  grid.style.gridTemplateColumns = cols;
  grid.style.gridTemplateRows    = rows;
}

// Place a pane cell in the grid at given col/row (1-based CSS grid coords)
function placeAt(entry, col, row) {
  entry.el.style.gridColumn = String(col);
  entry.el.style.gridRow    = String(row);
  grid.appendChild(entry.el);
}

function updateGrid() {
  const vis = getVisible();
  const count = vis.length;

  // Remove all pane cells from grid (gutters stay in DOM, just hidden)
  for (const entry of PANES) {
    if (entry.el.parentNode === grid) grid.removeChild(entry.el);
  }
  gutterV.style.display = 'none';
  gutterH.style.display = 'none';

  if (count === 0) {
    setGridTemplate('1fr', '1fr');
    return;
  }

  if (count === 1) {
    setGridTemplate('1fr', '1fr');
    vis[0].el.style.gridColumn = '1';
    vis[0].el.style.gridRow    = '1';
    grid.appendChild(vis[0].el);
    return;
  }

  if (count === 2) {
    // two columns, vertical gutter only
    setGridTemplate(`var(--col-split) ${GUTTER} 1fr`, '1fr');
    gutterV.style.display = '';
    gutterV.style.gridRow = '1';

    vis[0].el.style.gridColumn = '1'; vis[0].el.style.gridRow = '1';
    gutterV.style.gridColumn   = '2'; gutterV.style.gridRow   = '1';
    vis[1].el.style.gridColumn = '3'; vis[1].el.style.gridRow = '1';

    grid.appendChild(vis[0].el);
    grid.appendChild(gutterV);
    grid.appendChild(vis[1].el);
    return;
  }

  if (count === 3) {
    // Left column: first pane spans full height.
    // Right column: two panes stacked with horizontal gutter.
    setGridTemplate(`var(--col-split) ${GUTTER} 1fr`, `var(--row-split) ${GUTTER} 1fr`);
    gutterV.style.display = '';
    gutterH.style.display = '';

    vis[0].el.style.gridColumn = '1'; vis[0].el.style.gridRow = '1 / 4';
    gutterV.style.gridColumn   = '2'; gutterV.style.gridRow   = '1 / 4';
    vis[1].el.style.gridColumn = '3'; vis[1].el.style.gridRow = '1';
    gutterH.style.gridColumn   = '3'; gutterH.style.gridRow   = '2';
    vis[2].el.style.gridColumn = '3'; vis[2].el.style.gridRow = '3';

    grid.appendChild(vis[0].el);
    grid.appendChild(gutterV);
    grid.appendChild(vis[1].el);
    grid.appendChild(gutterH);
    grid.appendChild(vis[2].el);
    return;
  }

  if (count === 4) {
    // Full 2x2
    setGridTemplate(`var(--col-split) ${GUTTER} 1fr`, `var(--row-split) ${GUTTER} 1fr`);
    gutterV.style.display = '';
    gutterH.style.display = '';

    vis[0].el.style.gridColumn = '1'; vis[0].el.style.gridRow = '1';
    vis[1].el.style.gridColumn = '3'; vis[1].el.style.gridRow = '1';
    vis[2].el.style.gridColumn = '1'; vis[2].el.style.gridRow = '3';
    vis[3].el.style.gridColumn = '3'; vis[3].el.style.gridRow = '3';

    gutterV.style.gridColumn = '2'; gutterV.style.gridRow = '1 / 4';
    gutterH.style.gridColumn = '1 / 4'; gutterH.style.gridRow = '2';

    grid.appendChild(vis[0].el);
    grid.appendChild(gutterV);
    grid.appendChild(vis[1].el);
    grid.appendChild(gutterH);
    grid.appendChild(vis[2].el);
    grid.appendChild(vis[3].el);
    return;
  }

  if (count === 6) {
    // Six visible panes → 3×2: six equal columns, each pane spans two, two rows.
    // Equal fr cells, no draggable gutters (same simplification as the 5-up case).
    // Before this branch the 5-up fallthrough placed only vis[0..4], so a sixth
    // pane got no grid coords at all (LEDGER-SPEC §4 Pass 3).
    setGridTemplate('repeat(6, 1fr)', '1fr 1fr');
    vis[0].el.style.gridColumn = '1 / 3'; vis[0].el.style.gridRow = '1';
    vis[1].el.style.gridColumn = '3 / 5'; vis[1].el.style.gridRow = '1';
    vis[2].el.style.gridColumn = '5 / 7'; vis[2].el.style.gridRow = '1';
    vis[3].el.style.gridColumn = '1 / 3'; vis[3].el.style.gridRow = '2';
    vis[4].el.style.gridColumn = '3 / 5'; vis[4].el.style.gridRow = '2';
    vis[5].el.style.gridColumn = '5 / 7'; vis[5].el.style.gridRow = '2';
    grid.appendChild(vis[0].el);
    grid.appendChild(vis[1].el);
    grid.appendChild(vis[2].el);
    grid.appendChild(vis[3].el);
    grid.appendChild(vis[4].el);
    grid.appendChild(vis[5].el);
    return;
  }

  // count === 5: 6-column base, top 3 span 2 cols each, bottom 2 span 3 cols each.
  // This gives 3 equal top cells and 2 equal bottom cells with no resizable gutters.
  // We skip draggable gutters for the 5-up case (equal fr cells).
  setGridTemplate('repeat(6, 1fr)', '1fr 1fr');

  vis[0].el.style.gridColumn = '1 / 3'; vis[0].el.style.gridRow = '1';
  vis[1].el.style.gridColumn = '3 / 5'; vis[1].el.style.gridRow = '1';
  vis[2].el.style.gridColumn = '5 / 7'; vis[2].el.style.gridRow = '1';
  vis[3].el.style.gridColumn = '1 / 4'; vis[3].el.style.gridRow = '2';
  vis[4].el.style.gridColumn = '4 / 7'; vis[4].el.style.gridRow = '2';

  grid.appendChild(vis[0].el);
  grid.appendChild(vis[1].el);
  grid.appendChild(vis[2].el);
  grid.appendChild(vis[3].el);
  grid.appendChild(vis[4].el);
}

// ── Resizable gutters ─────────────────────────────────────────────────────────
function makeDragGutter(gutter, axis) {
  gutter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = grid.getBoundingClientRect();
    gutter.classList.add('dragging');

    function onMove(e) {
      const gutterPx = 6;
      if (axis === 'v') {
        const leftPx = Math.max(120, Math.min(rect.width - gutterPx - 120, e.clientX - rect.left));
        root.style.setProperty('--col-split', leftPx + 'px');
        grid.style.gridTemplateColumns = `${leftPx}px ${GUTTER} 1fr`;
      } else {
        const topPx = Math.max(80, Math.min(rect.height - gutterPx - 80, e.clientY - rect.top));
        root.style.setProperty('--row-split', topPx + 'px');
        grid.style.gridTemplateRows = `${topPx}px ${GUTTER} 1fr`;
      }
      positionGridSettingsBtn();
    }

    function onUp() {
      gutter.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      terminalPane.fit();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

makeDragGutter(gutterV, 'v');
makeDragGutter(gutterH, 'h');

// ── Settings overlay ──────────────────────────────────────────────────────────
const settingsOverlay  = document.getElementById('settings-overlay');
const hdrSettings      = document.getElementById('hdr-settings');
const gridSettingsBtn  = document.getElementById('grid-settings-btn');
let settingsOpen = false;

function setScrollMode(mode) {
  chatPane.setScrollMode(mode);
  settingsPane.setScrollMode(mode);
}

function openSettings() {
  settingsOpen = true;
  settingsOverlay.classList.add('visible');
  hdrSettings.classList.add('active');
  if (gridSettingsBtn) gridSettingsBtn.classList.add('active');
}

function closeSettings() {
  settingsOpen = false;
  settingsOverlay.classList.remove('visible');
  hdrSettings.classList.remove('active');
  if (gridSettingsBtn) gridSettingsBtn.classList.remove('active');
}

hdrSettings.onclick = () => settingsOpen ? closeSettings() : openSettings();
if (gridSettingsBtn) gridSettingsBtn.onclick = () => settingsOpen ? closeSettings() : openSettings();

// Track the master-settings button to wherever the two gutters currently
// cross; falls back to dead-center when fewer than both gutters are showing
// (1/2/5-pane layouts have no true crosshair yet).
function positionGridSettingsBtn() {
  if (!gridSettingsBtn) return;
  const bothGutters = gutterV.style.display !== 'none' && gutterH.style.display !== 'none';
  if (bothGutters) {
    gridSettingsBtn.style.left = 'var(--col-split)';
    gridSettingsBtn.style.top  = 'var(--row-split)';
  } else {
    gridSettingsBtn.style.left = '50%';
    gridSettingsBtn.style.top  = '50%';
  }
}

// ── Gate modal ────────────────────────────────────────────────────────────────
const gateModal  = document.getElementById('gate-modal');
const gatePrompt = document.getElementById('gate-prompt');
const gateDiff   = document.getElementById('gate-diff');
const gateAnswer = document.getElementById('gate-answer');
const gateYes    = document.getElementById('gate-yes');
const gateAlt    = document.getElementById('gate-alt');
const gateQueue  = document.getElementById('gate-queue');
const gateNo     = document.getElementById('gate-no');

let _gateKeyHandler = null;
let _activeGateId = null;   // id of the gate now in the modal — routes its answer (queue)

// MODAL-SPEC Phase C — the ONE gate surface for real agent gates, shown two
// ways: as the full-screen overlay (windowed=false) or a non-blocking corner
// card (windowed=true, WINDOW mode). Same DOM either way; `.windowed` on
// #gate-modal switches the presentation (app.css). The prompt's first line is
// the summary; the rest (a diff / content preview) drops into the scrollable
// #gate-diff. Three actions — approve (y) / deny (n) / queue (defer, parks in
// the Ledger). Keyboard answers honor the global gate_keyboard toggle.
function showGate(prompt, id, windowed) {
  _activeGateId = id ?? null;
  const nl = prompt.indexOf('\n');
  const header = nl === -1 ? prompt : prompt.slice(0, nl);
  // strip a trailing "apply? [y/N]" — the buttons say it now
  const body = (nl === -1 ? '' : prompt.slice(nl + 1))
    .replace(/\n*\s*apply\?\s*\[y\/N\]\s*$/i, '').trim();
  gatePrompt.textContent = header;
  gateDiff.textContent = body;
  gateDiff.style.display = body ? 'block' : 'none';
  gateAnswer.value = '';
  gateQueue.style.display = '';                       // real agent gate → offer queue
  gateModal.classList.toggle('windowed', !!windowed);
  gateModal.classList.add('visible');

  // A parked gate is a new pending record — refresh the Ledger pane so it shows
  // in the pending view alongside this surface (LEDGER-SPEC §4 Pass 3 verify).
  wsSend({ type: 'ledger_list' });

  // Keyboard answering is a global toggle (gate_keyboard). ON (default): answer
  // on a single keystroke from anywhere — captured at the document so it works
  // even if focus is in the chat bar. OFF: mouse-only, no handler bound (a stray
  // keystroke has answered a gate before — decided-by: Brandon).
  if (gateKeyboard()) {
    gateAnswer.focus();
    _gateKeyHandler = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'y') { e.preventDefault(); e.stopPropagation(); answerGate('y'); }
      else if (k === 'n' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); answerGate('n'); }
    };
    document.addEventListener('keydown', _gateKeyHandler, true);
  }
}

function hideGate() {
  gateModal.classList.remove('visible');
  gateModal.classList.remove('windowed');
  gateAnswer.value = '';
  // reset the Phase C extras so a reused-modal local confirm (showConfirm/
  // showPrompt) never inherits a stale diff or the queue button
  gateDiff.textContent = '';
  gateDiff.style.display = 'none';
  gateQueue.style.display = 'none';
  if (_gateKeyHandler) {
    document.removeEventListener('keydown', _gateKeyHandler, true);
    _gateKeyHandler = null;
  }
}

// The ONE answer path for a gate — used by the y/n buttons, the keyboard
// handler, the gate text box, and the chat bar's awaiting fallback. The old bug
// sent the answer from two places (chat bar + modal), putting a stale reply on
// the server queue and leaving the modal stuck open. One function: send once,
// clear awaiting, hide.
function answerGate(text) {
  if (_confirmCallback) { _answerConfirm(text !== undefined ? text : gateAnswer.value.trim()); return; }
  const answer = text !== undefined ? text : gateAnswer.value.trim();
  if (!answer) return;
  wsSend({ type: 'answer', text: answer, id: _activeGateId });
  wsSend({ type: 'ledger_list' });   // the answer resolves a record — refresh the pane
  _activeGateId = null;
  chatPane.clearAwaiting();
  chatPane.clearFlag();   // keyboard/button answer must also clear the alert flag
  hideGate();
}

gateYes.onclick = () => {
  if (_confirmCallback && _confirmCallback.triple) _answerTriple('yes');
  else if (_confirmCallback && _confirmCallback.prompt) _answerPrompt('submit');
  else answerGate('y');
};
if (gateAlt) gateAlt.onclick = () => _answerTriple('alt');
// MODAL-SPEC Phase C — 'queue' defers: the server parks the action (ask→queue)
// and the agent unblocks as 'parked'; it stays pending in the Ledger to fire
// later. answerGate sends the raw text; web_io.resolve_gate routes it to
// defer_gate. Only bound for real agent gates (not local confirm/prompt).
if (gateQueue) gateQueue.onclick = () => { if (!_confirmCallback) answerGate('queue'); };
gateNo.onclick  = () => {
  if (_confirmCallback && _confirmCallback.triple) _answerTriple('no');
  else if (_confirmCallback && _confirmCallback.prompt) _answerPrompt('cancel');
  else answerGate('n');
};
gateAnswer.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); answerGate(); }
});

// ── Gate presentation routing (MODAL-SPEC Phase C) ───────────────────────────
// The `ask` frame is IDENTICAL on the wire in every mode (invariant #1). Only
// the SURFACE changes, per the global modal_mode setting (global.json):
//   fullscreen → showGate() as the full-screen overlay (the IDE's classic
//                hard-stop). #gate-modal body UNCHANGED beyond the Phase C
//                diff/queue additions.
//   window     → showGate() as a non-blocking corner CARD (windowed=true). The
//                SAME surface — summary + scrollable diff + approve/deny/queue —
//                just not a full-screen takeover. The rest of the UI stays live.
//   off        → park only, no surface. The engine already degraded ask→queue
//                (agent_loop._resolve_gate → policy's no-human path), so an ask
//                frame normally never arrives in OFF; if one does (a race, or a
//                process that doesn't degrade), we still never surface a modal —
//                just refresh the Ledger pane so the parked row shows.
// A1 coordination: showGate() emits the ledger_list refresh in fullscreen/window;
// the off branch emits it directly so the pane stays current when a gate parks.
// Conference (inRoom): honors modal_mode uniformly (default fullscreen = current
// behavior, no regression). MODAL-SPEC §2 wants conference pinned to the pane
// once A2's conference Ledger pane is merged.
function routeGate(m, inRoom) {
  const mode = modalMode();
  if (mode === 'off' || mode === 'corner') {
    wsSend({ type: 'ledger_list' });        // park only — mirror showGate()'s A1 refresh
    // 'corner' (Brandon 2026-07-21): the gate is ALWAYS parked first, exactly
    // like 'off'; the small corner pop is presentation only, layered on top.
    if (mode === 'corner') showCornerPop(m);
  } else {
    showGate(m.prompt, m.id, mode === 'window');
  }
  if (!inRoom) chatPane.onFrame(m);          // track `awaiting` → chat-bar answer path
  fireAlert('gate');
}

// ── Local confirm (reuses gate modal, no WebSocket) ───────────────────────────
// For purely local decisions (e.g. delete a save). Same visual as an agent gate.
// Guard: won't open if a real agent gate is already up.
let _confirmCallback = null;

function showConfirm(prompt, onYes, onNo) {
  if (gateModal.classList.contains('visible')) return; // agent gate in progress
  _confirmCallback = { onYes, onNo };
  gatePrompt.textContent = prompt;
  gateAnswer.value = '';
  gateModal.classList.add('visible');
  gateAnswer.focus();
  _gateKeyHandler = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'y') { e.preventDefault(); e.stopPropagation(); _answerConfirm('y'); }
    else if (k === 'n' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _answerConfirm('n'); }
  };
  document.addEventListener('keydown', _gateKeyHandler, true);
}

function _answerConfirm(answer) {
  if (_confirmCallback && _confirmCallback.triple) return;  // triple has its own path
  if (_confirmCallback && _confirmCallback.prompt) { _answerPrompt('submit'); return; }
  const cb = _confirmCallback;
  _confirmCallback = null;
  hideGate();
  if (answer === 'y' && cb && cb.onYes) cb.onYes();
  else if (cb && cb.onNo) cb.onNo();
}

// Text-input modal: same DOM as confirm but accepts freeform input.
// Does NOT capture single-key y/n — user types and presses Enter or Escape.
function showPrompt(promptText, defaultValue, onSubmit, onCancel) {
  if (gateModal.classList.contains('visible')) return;
  _confirmCallback = { onSubmit, onCancel, prompt: true };
  gatePrompt.textContent = promptText;
  gateAnswer.value = defaultValue || '';
  gateYes.textContent = 'ok';
  gateModal.classList.add('visible');
  gateAnswer.focus();
  gateAnswer.select();
  _gateKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _answerPrompt('cancel'); }
  };
  document.addEventListener('keydown', _gateKeyHandler, true);
}

function _answerPrompt(which) {
  const cb = _confirmCallback;
  const value = gateAnswer.value.trim();
  _confirmCallback = null;
  gateYes.textContent = 'y';
  hideGate();
  if (which === 'submit' && cb && cb.onSubmit) cb.onSubmit(value);
  else if (cb && cb.onCancel) cb.onCancel();
}

// 3-way confirm: overwrite / keep-both / cancel. Reuses the gate modal with a
// third button (#gate-alt) that's hidden during normal gates.
function showTriple(prompt, yesLabel, altLabel, noLabel, onYes, onAlt, onNo) {
  if (gateModal.classList.contains('visible')) return;
  _confirmCallback = { onYes, onAlt, onNo, triple: true };
  gatePrompt.textContent = prompt;
  gateAnswer.value = '';
  gateYes.textContent = yesLabel;
  if (gateAlt) { gateAlt.textContent = altLabel; gateAlt.style.display = ''; }
  gateNo.textContent = noLabel;
  gateModal.classList.add('visible');
  gateAnswer.focus();
  _gateKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _answerTriple('no'); }
  };
  document.addEventListener('keydown', _gateKeyHandler, true);
}

function _answerTriple(which) {
  const cb = _confirmCallback;
  _confirmCallback = null;
  gateYes.textContent = 'y';
  gateNo.textContent = 'n';
  if (gateAlt) gateAlt.style.display = 'none';
  hideGate();
  if (which === 'yes' && cb && cb.onYes) cb.onYes();
  else if (which === 'alt' && cb && cb.onAlt) cb.onAlt();
  else if (cb && cb.onNo) cb.onNo();
}

// Expose modal helpers on ctx so panes can use them without importing shell.js
ctx.showConfirm = showConfirm;
ctx.showTriple  = showTriple;
ctx.showPrompt  = showPrompt;

// ── Alerts ──────────────────────────────────────────────────────────────────
// Channels (all toggleable in settings, persisted in localStorage):
//   flash overlay (done only — the gate already has its modal), in-chat flag,
//   desktop notification, sound (default beep or a user-uploaded clip).
// Fires on two events: 'gate' (a permission ask) and 'done' (idle after busy).
// Gated by alert_when: 'unfocused' (default) only fires when the tab isn't the
// active focus, so it never nags while you're watching it work.
function aPref(key, dflt) {
  const v = localStorage.getItem('alert_' + key);
  return v === null ? dflt : v === '1';
}
function shouldAlert() {
  const when = localStorage.getItem('alert_when') || 'unfocused';
  return when === 'always' || document.hidden || !document.hasFocus();
}

let _audioCtx = null;
function beep() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
    o.connect(g); g.connect(_audioCtx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    const t = _audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.36);
  } catch (e) {}
}
function playAlertSound() {
  const data = localStorage.getItem('alert_sound_data');  // data-URI of an uploaded clip
  if (data) { try { new Audio(data).play().catch(() => {}); return; } catch (e) {} }
  beep();
}

function notify(text) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { try { new Notification(text); } catch (e) {} }
  else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') { try { new Notification(text); } catch (e) {} }
    });
  }
}

let _flashEl = null;
function showFlash(text) {
  if (!_flashEl) {
    _flashEl = document.createElement('div');
    _flashEl.id = 'alert-flash';
    _flashEl.addEventListener('click', () => _flashEl.classList.remove('visible'));
    document.body.appendChild(_flashEl);
  }
  _flashEl.textContent = text;
  _flashEl.classList.add('visible');
  clearTimeout(_flashEl._t);
  _flashEl._t = setTimeout(() => _flashEl.classList.remove('visible'), 2800);
}

// ── Corner gate pop (MODAL-SPEC 'corner' presentation, Brandon 2026-07-21) ────
// A small corner card, NOT the full #gate-modal takeover. The gate is ALWAYS
// parked first (routeGate's corner branch mirrors 'off'); this card is
// presentation only. Answering resolves the PARKED record via ledger_action
// (→ dq.answer_gate/deny on the server), never the live `answer` path — the
// model already unblocked as parked. Scaffold = showFlash's inject/.visible/
// timer idiom, shrunk to a card with approve/deny/queue + a dismiss ✕. Newest
// pop replaces the current one (single slot) — safe, every gate is parked.
// AUTO-DISMISS interval: 8000ms — a gate deserves more dwell than showFlash's
// 2800ms "done" flash (default OFF; opt-in via the alert_pop_autodismiss pref).
const CORNER_DISMISS_MS = 8000;
let _cornerEl = null;
let _cornerGateId = null;
let _cornerTimer = null;

function _buildCornerEl() {
  const el = document.createElement('div');
  el.id = 'gate-corner';
  el.innerHTML =
    '<div class="gc-head"><span class="gc-kind">gate</span>' +
    '<span class="gc-summary"></span>' +
    '<button class="gc-x" title="dismiss — leaves the gate parked">&#10005;</button></div>' +
    '<div class="gc-btns">' +
      '<button class="gc-b gc-approve">approve</button>' +
      '<button class="gc-b gc-deny">deny</button>' +
      '<button class="gc-b gc-queue">queue</button>' +
    '</div>';
  el.querySelector('.gc-x').onclick = () => hideCornerPop();
  el.querySelector('.gc-approve').onclick = () => _answerCornerPop('approve');
  el.querySelector('.gc-deny').onclick    = () => _answerCornerPop('deny');
  el.querySelector('.gc-queue').onclick   = () => _answerCornerPop('queue');
  document.body.appendChild(el);
  return el;
}

// Two placements (client pref alert_pop_pos): 'pane' (default) anchors over the
// Ledger pane region if it's mounted; else — and for 'corner' — the bottom
// corner of the viewport.
function _positionCornerPop() {
  const pos = localStorage.getItem('alert_pop_pos') || 'pane';
  const pane = pos === 'pane' ? document.querySelector('.lg-pane') : null;
  _cornerEl.style.left = '';
  if (pane) {
    const r = pane.getBoundingClientRect();
    _cornerEl.style.right  = Math.max(8, window.innerWidth  - r.right  + 8) + 'px';
    _cornerEl.style.bottom = Math.max(8, window.innerHeight - r.bottom + 8) + 'px';
  } else {
    _cornerEl.style.right  = '16px';
    _cornerEl.style.bottom = '16px';
  }
}

function showCornerPop(m) {
  if (!_cornerEl) _cornerEl = _buildCornerEl();
  _cornerGateId = m.id ?? null;
  const prompt = m.prompt || '';
  const nl = prompt.indexOf('\n');
  const summary = (nl === -1 ? prompt : prompt.slice(0, nl))
    .replace(/\s*apply\?\s*\[y\/N\]\s*$/i, '').trim();
  _cornerEl.querySelector('.gc-summary').textContent = summary;
  _positionCornerPop();
  _cornerEl.classList.add('visible');
  clearTimeout(_cornerTimer);
  if (aPref('pop_autodismiss', false)) {
    _cornerTimer = setTimeout(() => hideCornerPop(), CORNER_DISMISS_MS);
  }
}

// Dismiss the SURFACE only — the gate stays parked in the queue/Ledger.
function hideCornerPop() {
  if (!_cornerEl) return;
  _cornerEl.classList.remove('visible');
  _cornerGateId = null;
  clearTimeout(_cornerTimer);
}

// Resolve the PARKED record. approve/deny → ledger_action (dq.answer_gate/deny);
// 'queue' leaves it parked (already queued — apply_action has no queue arm), so
// it just clears the pop, kept as a distinct button for the modal's decision
// vocabulary. Always refresh the Ledger pane and clear the chat awaiting flag.
function _answerCornerPop(action) {
  const id = _cornerGateId;
  hideCornerPop();
  if (!id) return;
  if (action === 'approve' || action === 'deny') {
    wsSend({ type: 'ledger_action', action, id });
  }
  wsSend({ type: 'ledger_list' });
  chatPane.clearAwaiting();
  chatPane.clearFlag();
}

function fireAlert(kind) {  // 'gate' | 'done'
  if (!shouldAlert()) return;
  if (kind === 'done' && aPref('overlay', true)) showFlash('DONE');
  if (aPref('chatflag', true)) {
    chatPane.showFlag(kind === 'gate'
      ? '⚠ permission needed — click to dismiss'
      : '✓ task done — click to dismiss', kind);
  }
  if (aPref('notify', true)) notify('LLM Sandbox — ' + (kind === 'gate' ? 'permission needed' : 'task done'));
  if (aPref('sound', true)) playAlertSound();
}

// Exposed so the settings pane can play a preview of the current sound.
window._previewAlertSound = playAlertSound;

let _wasBusy = false;

// ── Bar divider (input area resize) ──────────────────────────────────────────
const bar        = document.getElementById('bar');
const barDivider = document.getElementById('bar-divider');
const msgEl      = document.getElementById('msg');

barDivider.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const startY = e.clientY;
  const startH = bar.offsetHeight;
  barDivider.classList.add('dragging');
  function onMove(e) {
    const h = Math.max(56, Math.min(400, startH + (startY - e.clientY)));
    bar.style.height = h + 'px';
    msgEl.style.height = Math.max(36, h - 20) + 'px';
  }
  function onUp() {
    barDivider.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

// ── Header toggle buttons ─────────────────────────────────────────────────────
function togglePane(entry) {
  entry.visible = !entry.visible;
  entry.btn.classList.toggle('active', entry.visible);
  // Attach/detach the cell FIRST so show() runs against an element that's in
  // the DOM — Monaco (created lazily in editor.show()) needs an attached host.
  updateGrid();
  positionGridSettingsBtn();
  if (entry.visible) entry.pane.show();
  else entry.pane.hide();
}

// ── Drag-to-reorder panes ───────────────────────────────────────────────────
// Pane placement follows PANES array order (getVisible/updateGrid index into the
// layout slots by that order). Dragging one header button onto another reorders
// the array, re-syncs the button row, and re-lays out the grid. Click still
// toggles visibility — a plain click doesn't start a drag.
let _dragEntry = null;

function reorderPanes(fromEntry, toEntry) {
  const from = PANES.indexOf(fromEntry);
  const to   = PANES.indexOf(toEntry);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = PANES.splice(from, 1);
  PANES.splice(to, 0, moved);
  const headerPaneBtns = document.getElementById('header-pane-btns');
  PANES.forEach(p => headerPaneBtns.appendChild(p.btn));  // re-order the button row
  // shown panes need show() after the grid re-attaches their cell
  updateGrid();
  positionGridSettingsBtn();
  PANES.forEach(p => { if (p.visible) p.pane.show(); });
}

function wirePaneDrag(btn, entry) {
  btn.draggable = true;
  btn.addEventListener('dragstart', (e) => { _dragEntry = entry; e.dataTransfer.effectAllowed = 'move'; });
  btn.addEventListener('dragend',   () => { _dragEntry = null; btn.classList.remove('drag-over'); });
  btn.addEventListener('dragover',  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (_dragEntry && _dragEntry !== entry) btn.classList.add('drag-over'); });
  btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
  btn.addEventListener('drop', (e) => {
    e.preventDefault();
    btn.classList.remove('drag-over');
    if (_dragEntry && _dragEntry !== entry) reorderPanes(_dragEntry, entry);
    _dragEntry = null;
  });
}

// ── Frame router ──────────────────────────────────────────────────────────────
// tree → filesPane (NOT editorPane anymore)
const ROUTE = {
  out:          chatPane,
  meters:       chatPane,
  speak:        chatPane,       // browser SpeechSynthesis (text-to-speech out)
  audio:        chatPane,       // server-synthesized audio bytes (kokoro/clone)
  transcript:   chatPane,       // session_load/session_new full chat replay (ADE-RUNWAY S3 rider)
  ask:          null,          // shell modal
  settings:     settingsPane,
  models:       settingsPane,
  crew_list:    settingsPane,
  term:         terminalPane,
  file:         editorPane,
  saved:        editorPane,
  deleted:      filesPane,
  tree:         filesPane,
  moved:        filesPane,      // pre-existing gap (see multiuse.js header) — now closed
  renamed:      filesPane,      // rename reply (LANE 4 context menu)
  made:         filesPane,      // mkdir reply (LANE 4 context menu)
  ledger_state:  ledgerPane,    // the unified Ledger pane (LEDGER-SPEC §4 Pass 3)
  ledger_detail: ledgerPane,
  queue_state:  queuePane,       // daemon page still mounts these until Pass 4
  log_tail:     daemonLogPane,
};

// Attaches the three socket handlers to whatever `ws` currently points at.
// Called immediately below for the synchronous-connect modes (normal /ws,
// /ws/daemon, ROOM with ?name= already present); called again later, from
// _connectRoomSocket(), for the deferred ROOM+no-name case — at that point
// `ws` is the freshly-created socket from the resolved name prompt.
function _wireSocket() {
  ws.onopen  = () => {
    if (!_isRoom) chatAppend('[socket open]\n', 'dim');
    // ?load=NAME — same-project "open in new tab"
    const _loadParam = new URLSearchParams(location.search).get('load');
    if (_loadParam && !_isRoom) wsSend({ type: 'session_load', name: _loadParam });
    // ?loadpath=ABS_PATH — cross-project "open in new tab" (server switches root)
    const _loadPath = new URLSearchParams(location.search).get('loadpath');
    if (_loadPath && !_isRoom) wsSend({ type: 'session_load', path: _loadPath });
    while (_preopenQueue.length) ws.send(JSON.stringify(_preopenQueue.shift()));
  };
  ws.onclose = () => { if (!_isRoom) chatAppend('\n[socket closed]\n', 'dim'); };

  ws.onmessage = (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }

  // ── Conference room frame routing ──────────────────────────────────────────
  if (_isRoom) {
    if (m.type === 'ask') {
      routeGate(m, true);   // conference path — MODAL-SPEC Phase C presentation routing
      return;
    }
    // Pass 4 (LEDGER-SPEC §4): the room mounts the Ledger pane, and this
    // branch returns before the ROUTE table below — route its frames here.
    if (m.type === 'ledger_state' || m.type === 'ledger_detail') {
      ledgerPane.onFrame(m);
      return;
    }
    // room_status drives the send button busy state
    if (m.type === 'room_status') {
      const busy = m.phase && m.phase !== 'idle';
      const sendBtn = document.getElementById('conf-send');
      if (sendBtn) sendBtn.disabled = busy;
      if (!busy && _wasBusy) fireAlert('done');
      _wasBusy = busy;
    }
    conferenceUI.onFrame(m);
    return;
  }

  // ── Normal session frame routing ───────────────────────────────────────────
  if (m.type === 'ask') {
    routeGate(m, false);   // MODAL-SPEC Phase C — surface per modal_mode (see routeGate)
    return;
  }

  // Turn lifecycle phase: drive the chat indicator/meter, disable send while
  // busy, and fire the done-alert on the idle edge (busy → idle).
  if (m.type === 'status') {
    chatPane.onFrame(m);
    const busy = m.phase && m.phase !== 'idle';
    const sendBtn = document.getElementById('send');
    if (sendBtn) sendBtn.disabled = busy;
    if (!busy && _wasBusy) { fireAlert('done'); filesPane.refresh(); }
    _wasBusy = busy;
    return;
  }

  // Session save/load ack — update chat awareness label
  if (m.type === 'session_save_ack') {
    chatPane.onFrame(m);
    return;
  }

  // Propagate workspace root from tree frames to settings pane
  if (m.type === 'tree' && m.data && m.data.root) {
    settingsPane.setWorkspaceRoot(m.data.root);
  }

  const target = ROUTE[m.type];
  if (target) target.onFrame(m);

  // Fan-out: refresh files pane after any write (saved also goes to editorPane above)
  if (m.type === 'saved') filesPane.onFrame(m);
  // Fan-out: chat pane watches settings to drive continuous (VAD) listening
  if (m.type === 'settings') chatPane.onFrame(m);

  // Fan-out: auto-load HTML files into preview pane when opened in editor
  if (m.type === 'file' && m.path && m.path.toLowerCase().endsWith('.html')) {
    previewPane.loadHtml(m.content);
  }
  };
}
if (!_needsNamePrompt) _wireSocket();

// Which settings tabs belong to which pane — drives each pane's own corner
// button. Panes with no entry here (preview, log — no matching section) fall
// back to toggling the master (center-divide) settings instead.
const PANE_SCOPE = {
  chat:     { tabs: ['model', 'chat', 'speech'], title: 'model / chat / speech' },
  editor:   { tabs: ['editor'],   title: 'editor' },
  terminal: { tabs: ['terminal'], title: 'terminal' },
  browser:  { tabs: ['files'],    title: 'files' },
};

// ── Mount everything ──────────────────────────────────────────────────────────
function init() {
  const headerPaneBtns = document.getElementById('header-pane-btns');

  PANES.forEach(entry => {
    // create the pane cell
    const cell = document.createElement('div');
    cell.className = 'pane-cell';
    cell.id = 'pane-cell-' + entry.pane.id;
    entry.el = cell;

    // create the header toggle button
    const btn = document.createElement('button');
    btn.className = 'hdr-btn' + (entry.visible ? ' active' : '');
    btn.textContent = entry.pane.label;
    btn.onclick = () => togglePane(entry);
    entry.btn = btn;
    wirePaneDrag(btn, entry);   // drag a header button onto another to reorder
    headerPaneBtns.appendChild(btn);

    // mount the pane
    try {
      entry.pane.mount(cell, ctx);
    } catch (e) {
      console.error(`pane ${entry.pane.id} mount failed:`, e);
    }

    // per-pane settings corner button. Scoped panes get their own knobs
    // rendered lazily, in place, over the pane's own content — no trip to
    // the header/center settings for the tabs that pane owns. Unscoped
    // panes (preview, log) just toggle the master view.
    const scope = PANE_SCOPE[entry.pane.id];
    const paneBtn = document.createElement('button');
    paneBtn.className = 'pane-settings-btn' + (entry.pane.id === 'chat' ? ' corner-bl' : '');
    paneBtn.title = 'settings';
    paneBtn.textContent = '⚙';
    cell.appendChild(paneBtn);

    let paneOverlay = null;
    let paneSettingsOpen = false;
    paneBtn.onclick = () => {
      if (!scope) { settingsOpen ? closeSettings() : openSettings(); return; }
      if (!paneOverlay) {
        paneOverlay = document.createElement('div');
        paneOverlay.className = 'pane-settings-overlay';
        cell.appendChild(paneOverlay);
        settingsPane.mount(paneOverlay, ctx, {
          scopeTabs: scope.tabs,
          title: scope.title,
          onClose: () => {
            paneOverlay.classList.remove('visible');
            paneSettingsOpen = false;
            paneBtn.classList.remove('active');
          },
        });
      }
      paneSettingsOpen = !paneSettingsOpen;
      paneOverlay.classList.toggle('visible', paneSettingsOpen);
      paneBtn.classList.toggle('active', paneSettingsOpen);
    };
  });

  // mount settings overlay
  settingsPane.mount(settingsOverlay, ctx, {
    onClose: closeSettings,
    onScrollMode: setScrollMode,
    onTerminalToggle: (v) => {
      terminalPane.setShowTerminal(v);
    },
    onShellInputToggle: (v) => {
      terminalPane.setShowShellInput(v);
    },
    onWordWrap: (v) => {
      editorPane.setWordWrap(v);
    },
  });

  // wire chat input bar
  chatPane.wireInputBar(
    document.getElementById('msg'),
    document.getElementById('send'),
    document.getElementById('stop'),
    ctx,
  );

  updateGrid();
  positionGridSettingsBtn();
}

// ── Conference room init (replaces normal pane init when ?room=1) ─────────────
function initRoom() {
  // Hide normal pane infrastructure
  const barWrap = document.getElementById('bar-wrap');
  if (barWrap) barWrap.style.display = 'none';
  const grid = document.getElementById('grid');
  if (grid) grid.style.display = 'none';
  const headerBtns = document.getElementById('header-pane-btns');
  if (headerBtns) headerBtns.style.display = 'none';
  const sessWrap = document.getElementById('sessions-wrap');
  if (sessWrap) sessWrap.style.marginLeft = 'auto';

  // Mount conference UI into #main (above bar-wrap which is now hidden).
  // Pass 4 (LEDGER-SPEC §4): the room shows the same Ledger face as every
  // other shell — conference left, Ledger panel right (#room-ledger-cell,
  // styled in index.html beside the daemon window CSS).
  const main = document.getElementById('main');
  const confWrap = document.createElement('div');
  confWrap.id = 'conf-wrap';
  confWrap.style.cssText = 'flex:1;display:flex;flex-direction:row;overflow:hidden;min-height:0;';
  main.insertBefore(confWrap, main.firstChild);

  const confContainer = document.createElement('div');
  confContainer.id = 'conf-container';
  confContainer.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-width:0;';
  confWrap.appendChild(confContainer);

  const recCell = document.createElement('div');
  recCell.id = 'room-ledger-cell';
  confWrap.appendChild(recCell);

  conferenceUI.mount(confContainer, ctx);
  ledgerPane.mount(recCell, ctx);

  // Mount the settings pane into the header-gear overlay (the same overlay the
  // IDE uses in init()). Without this, initRoom left the gear active but the
  // overlay empty — clicking it in a room revealed nothing ("settings aren't
  // showing up"). The terminal/editor callbacks are harmless no-ops here (those
  // panes aren't mounted in room mode; the setters just flip flags).
  settingsPane.mount(settingsOverlay, ctx, {
    onClose: closeSettings,
    onScrollMode: setScrollMode,
    onTerminalToggle: (v) => { terminalPane.setShowTerminal(v); },
    onShellInputToggle: (v) => { terminalPane.setShowShellInput(v); },
    onWordWrap: (v) => { editorPane.setWordWrap(v); },
  });

  // Wire gate answer path to conference room (uses same modal as normal sessions)
  // The default answerGate in ctx already works — it sends {type:'answer'} over ws.
}

// ── Daemon window init (DAEMON-SPEC §6) ───────────────────────────────────────
// Replaces the normal 5-pane grid with a fixed 2x2 layout: chat / queue / log /
// settings. chat and settings are the SAME pane modules used everywhere else
// (reuse, not reinvention — the project invariant); queue and daemonlog are
// the two new panes this pass adds. The chat input bar (#bar-wrap) stays put
// at the bottom, wired to the chat pane exactly as in the normal shell.
function initDaemon() {
  const grid = document.getElementById('grid');
  if (grid) grid.style.display = 'none';
  const headerBtns = document.getElementById('header-pane-btns');
  if (headerBtns) headerBtns.style.display = 'none';
  // The header gear opens the OLD overlay-based settings flow (#settings-overlay,
  // never mounted in daemon mode) — the daemon page's settings live in their own
  // pane cell instead (house rule: buttons live in the pane that owns their data).
  hdrSettings.style.display = 'none';

  const main = document.getElementById('main');
  const container = document.createElement('div');
  container.id = 'daemon-container';
  main.insertBefore(container, main.firstChild);

  const cells = {};
  // Pass 4 (LEDGER-SPEC §4): + ledger — the same Ledger face as every shell,
  // a full-width bottom strip (grid CSS in index.html). queue + daemonlog stay
  // mounted (preserved as suite views, decided-by: Brandon 2026-07-15).
  for (const key of ['chat', 'queue', 'log', 'settings', 'ledger']) {
    const cell = document.createElement('div');
    cell.className = 'daemon-cell';
    cell.id = 'daemon-cell-' + key;
    container.appendChild(cell);
    cells[key] = cell;
  }

  chatPane.mount(cells.chat, ctx);
  queuePane.mount(cells.queue, ctx);
  daemonLogPane.mount(cells.log, ctx);
  settingsPane.mount(cells.settings, ctx, {});
  ledgerPane.mount(cells.ledger, ctx);

  chatPane.wireInputBar(
    document.getElementById('msg'),
    document.getElementById('send'),
    document.getElementById('stop'),
    ctx,
  );

  // Verification-only console hook (DAEMON-SPEC §8 build step 4: "trigger a
  // gate that resolves to queue, or park via a test frame"). Not a button,
  // not part of the spec'd queue-pane action set — just a way to drive a
  // queue round-trip from CDP/console without a live model turn.
  window._daemonSend = wsSend;

  wsSend({ type: 'queue_list' });
  wsSend({ type: 'log_tail', limit: 200 });
}

// Creates the deferred room socket (using whatever _roomName the name prompt
// resolved to) and wires its handlers. Only used in the _needsNamePrompt path
// — every other mode (room-with-?name=, /ws/daemon, normal /ws) already
// created and wired `ws` synchronously up top, exactly as before this feature.
function _connectRoomSocket() {
  ws = new WebSocket(`ws://${location.host}${_roomWsPath()}`);
  _wireSocket();
}

if (_isRoom) {
  initRoom();
  if (_needsNamePrompt) {
    // Prompt-before-connect: ask for a display name before the room socket
    // exists at all, so the name rides the very first ?name= the server sees
    // (showing up as "<name> entered", not "guest-N entered" then a rename).
    // Fires after gateModal/showPrompt are defined (both far above this point
    // in module execution order) and after initRoom() has mounted the room UI,
    // so the modal overlays a fully-formed room rather than a blank shell.
    // Empty submit or cancel both fall through to a nameless connect — the
    // server assigns guest-N exactly as it did before this feature existed.
    showPrompt('Enter your display name:', '', (name) => {
      _roomName = (name || '').trim();
      _connectRoomSocket();
    }, () => {
      _connectRoomSocket();
    });
  }
} else if (_isDaemon) {
  initDaemon();
} else {
  init();
}

// ── Killswitch button (CONTROL-CENTER.md §1b) ────────────────────────────────
// IDE + daemon share the one #bar; room mode hides #bar-wrap entirely and
// wires its own button inside conference.js. Fires the literal "/killswitch"
// through the same user frame the chat bar sends — slash text routes to
// handle_command server-side.
const _ksBtn = document.getElementById('killswitch');
if (_ksBtn && !_isRoom) wireKillswitch(_ksBtn, (text) => wsSend({ type: 'user', text }));

// ── Modal presentation toggle (MODAL-SPEC Phase C, §0 "a BUTTON to turn the
// modal off") ────────────────────────────────────────────────────────────────
// One header button cycles the GLOBAL gate presentation: fullscreen → window →
// off → fullscreen. Reaching "off" satisfies Brandon's "a button to turn the
// modal off — it just goes to queue." Writes global.json via /api/global (the
// same store as skin/killswitch), then refreshes the live flag cache so
// routeGate() sees the new value on the very next gate. The full 3-way control
// also lives in the control center (control.js).
const _modalBtn = document.getElementById('modal-toggle');
if (_modalBtn) {
  const _MODAL_CYCLE = { fullscreen: 'window', window: 'corner', corner: 'off', off: 'fullscreen' };
  const _MODAL_LABEL = { fullscreen: 'modal: full', window: 'modal: window', corner: 'modal: corner', off: 'modal: off' };
  const _paintModalBtn = () => {
    const mode = modalMode();
    _modalBtn.textContent = _MODAL_LABEL[mode] || _MODAL_LABEL.fullscreen;
    _modalBtn.title = `gate presentation: ${mode} — click to cycle (full → window → corner → off)`;
    _modalBtn.classList.toggle('modal-off', mode === 'off');
  };
  _paintModalBtn();
  refreshGlobalFlags().then(_paintModalBtn);   // reflect server truth once /api/global loads
  _modalBtn.onclick = () => {
    const next = _MODAL_CYCLE[modalMode()] || 'fullscreen';
    fetch('/api/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modal_mode: next }),
    })
      .then(() => refreshGlobalFlags())
      .then(_paintModalBtn)
      .catch(() => {});
  };
}

// ── Sessions panel (Rung 11) ─────────────────────────────────────────────────
const _sessionsBtn   = document.getElementById('sessions-btn');
const _sessionsPanel = document.getElementById('sessions-panel');

if (_sessionsBtn && _sessionsPanel) {
  _sessionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _sessionsPanel.classList.toggle('open');
  });
  document.addEventListener('click', () => _sessionsPanel.classList.remove('open'));
}

// Poll /api/sessions every 2s — no cross-tab WS writes, no connection interference.
function _pollSessions() {
  fetch('/api/sessions').then(r => r.json()).then(d => _renderSessions(d.list || [])).catch(() => {});
}
_pollSessions();
setInterval(_pollSessions, 2000);

function _renderSessions(list) {
  if (_sessionsBtn) {
    _sessionsBtn.textContent = `● ${list.length}`;
    const anyBusy = list.some(s => s.status && s.status !== 'idle');
    _sessionsBtn.classList.toggle('active', anyBusy);
  }
  if (!_sessionsPanel) return;
  const rows = list.map(s => {
    const busy = s.status && s.status !== 'idle';
    const dot  = busy ? '●' : '○';
    return `<div class="session-row${busy ? ' s-busy' : ''}">` +
           `<span class="s-dot">${dot}</span>` +
           `<span class="s-model">${s.model || '(default)'}</span>` +
           `<span class="s-status">${s.status || 'idle'}</span></div>`;
  }).join('');
  // Rung 14: ?room=1 now joins the shared 'default' room (rooms are a
  // registry, not one-per-socket) — "+ new conference" needs a fresh id per
  // click to still mean "a new, empty room" rather than "the same one every
  // time." Anyone wanting the shared default can still type /?room=1 by hand.
  const _freshRoomId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).slice(0, 8);
  _sessionsPanel.innerHTML = rows +
    `<div id="session-new-row">` +
    `<a href="/ide" target="_blank">+ new session</a>` +
    `<a href="/?room=${_freshRoomId}" target="_blank" style="margin-left:10px;color:var(--accent);">+ new conference</a>` +
    `</div>`;
}

// ── Context inject button ────────────────────────────────────────────────────
// Snapshots current editor file + files-pane directory into the chat textarea.
const ctxInjectBtn = document.getElementById('ctx-inject');
if (ctxInjectBtn) {
  ctxInjectBtn.onclick = () => {
    const parts = [];
    try {
      const ec = editorPane.getContext();
      if (ec) parts.push(`[file: ${ec.path || 'untitled'}]\n\`\`\`\n${ec.content}\n\`\`\``);
    } catch (e) {}
    try {
      const fc = filesPane.getContext();
      if (fc) parts.push(`[dir: ${fc.path}]\n${fc.entries}`);
    } catch (e) {}
    if (!parts.length) {
      const orig = ctxInjectBtn.textContent;
      ctxInjectBtn.textContent = '(nothing open)';
      setTimeout(() => { ctxInjectBtn.textContent = orig; }, 1200);
      return;
    }
    const existing = msgEl.value.trim();
    msgEl.value = parts.join('\n\n') + (existing ? '\n\n' + existing : '');
    msgEl.focus();
    msgEl.setSelectionRange(msgEl.value.length, msgEl.value.length);
  };
}
