

'use strict';

import { makeChatPane, makeImageIntake, renderMirror, mailRows, wireMirrorSettle, mirrorDetach, mirrorAttach, appendMirrorEcho } from './chat.js';
import { mountMultiUse, routeMultiUseFrame } from './multiuse.js';
import { openTrackMenu } from './tracksettings.js';
import { mount as mountQueueLog, onFrame as routeQueueLogFrame, refresh as refreshQueueLog,
         onEsc as onEscQueueLog } from './queuelog.js';
import { mount as mountTimeline, onFrame as routeTimelineFrame, refresh as refreshTimeline,
         onEsc as onEscTimeline } from './timeline.js';
import { mount as mountChanges, onFrame as routeChangesFrame, refresh as refreshChanges,
         onEsc as onEscChanges } from './changes.js';
import { mount as mountLedgerView, onFrame as routeLedgerFrame, refresh as refreshLedgerView,
         openLedgerWindow, onEsc as onEscLedgerView } from './ledgerview.js';
import { mount as mountArrange, onFrame as routeArrangeFrame, refresh as refreshArrange,
         onEsc as onEscArrange, currentPlan as arrangePlan,
         syncSessionPlan as syncArrangePlan } from './arrange.js';
import { mount as mountMessenger, onFrame as routeMessengerFrame, refresh as refreshMessenger,
         rosterChanged as messengerRosterChanged, onEsc as onEscMessenger } from './messenger.js';
import { mount as mountAgentStrip, onFrame as routeAgentStripFrame,
         refresh as refreshAgentStrip, onEsc as onEscAgentStrip,
         mountPaneChip } from './agentstrip.js';
import { wireKillswitch } from '../killswitch.js';
import { modalMode, modalModeFor, flags as globalFlags, refresh as refreshGlobalFlags } from '../globalflags.js';

let anchorPane = null;
let muPanes = null;

const S = {
  session:   null,
  tracks:    [],
  names:     {},
  trackRows: [],
  anchored:  null,
  focus:     null,
  switchPending: false,
  view:      'timeline',
  muCols:    { files: true, editor: true, term: false },
  models:    [],
  curModel:  null,
  crew:      [],
  edges:     [],
  rails:     null,
};

const $  = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

let ws = null;
let _wsReady = false;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/ade`);

  ws.onopen = () => {
    _wsReady = true;
    _resyncPending = true;
    refreshGlobalFlags();
    if (_pendingLoadSid) {
      sendAdeLoad(_pendingLoadSid);
      _pendingLoadSid = null;
    }
  };
  ws.onclose = () => { _wsReady = false; setTimeout(connect, 1200); };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    route(m);
  };
}

function send(obj) {
  if (_wsReady && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function sendAdeSave(name, asTemplate) {
  send({ type: 'ade_save', name: name || '', template: !!asTemplate,
         plan: arrangePlan() });
}
export function sendAdeLoad(sid) {
  send({ type: 'ade_load', sid: sid || '' });
}
export function sendAdeNew(templateId) {
  send({ type: 'ade_new', template: templateId || '' });
}
export function sendAdeEnd() {
  send({ type: 'ade_end', plan: arrangePlan() });
}

const LOAD_SID_RE = /^[\w-]+$/;
let _pendingLoadSid = null;
{
  const q = new URLSearchParams(window.location.search).get('load');
  if (q && LOAD_SID_RE.test(q)) _pendingLoadSid = q;
}

let _resyncPending = false;



let _alertGateId = null;

let _foreignGateQueue = [];

function _advanceForeignQueue() {
  if (_alertGateId || !_foreignGateQueue.length) return;
  fireForeignGateAlert(_foreignGateQueue.shift());
}

function placeAlert(mode) {
  const al = $('alert');
  const host = mode === 'window' ? $('multiuse') : $('bottomrow');
  if (al && host && al.parentNode !== host) host.appendChild(al);
}

function showAlert(opts) {
  const al = $('alert');
  if (!al) return false;
  const mode = modalModeFor('ade');
  if (mode === 'off' || mode === 'corner') return false;
  placeAlert(mode);

  al.classList.remove('wait', 'deny');
  if (opts.state) al.classList.add(opts.state);
  $('alKind').textContent  = opts.kind || '';
  $('alTrack').textContent = opts.track || '';
  $('alTime').textContent  = fmtClock(opts.ts || Date.now());
  $('alertBody').innerHTML = opts.bodyHTML || '';

  const foot = $('alertFoot');
  foot.innerHTML = '';
  for (const b of (opts.buttons || [])) {
    const el = document.createElement('button');
    el.className = 'al-btn ' + (b.cls || 'al-dismiss');
    el.textContent = b.label;
    el.onclick = b.fn;
    foot.appendChild(el);
  }
  al.classList.add('show');
  return true;
}

function hideAlert() {
  const al = $('alert');
  if (!al) return;
  al.classList.remove('show', 'wait', 'deny');
  $('alertBody').innerHTML = '';
  $('alertFoot').innerHTML = '';
  _alertGateId = null;
  _advanceForeignQueue();
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtClock(ms) {
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function splitGatePrompt(prompt) {
  const p = prompt || '';
  const nl = p.indexOf('\n');
  const header = nl === -1 ? p : p.slice(0, nl);
  const body = (nl === -1 ? '' : p.slice(nl + 1))
    .replace(/\n*\s*apply\?\s*\[y\/N\]\s*$/i, '').trim();
  return { header, body };
}






const _ALERT_GATE_TEXT = { approve: 'y', deny: 'n', queue: 'queue' };

function sendGateAnswer(id, action, track) {
  const frame = { type: 'answer', text: _ALERT_GATE_TEXT[action] || 'n', id };
  if (track) frame.track = track;
  send(frame);
}

function answerAlertGate(action) {
  const id = _alertGateId;
  hideAlert();
  if (!id) return;
  send({ type: 'answer', text: _ALERT_GATE_TEXT[action] || 'n', id });
  send({ type: 'feed' });
  setTimeout(() => send({ type: 'feed' }), 400);
  setTimeout(() => send({ type: 'feed' }), 1500);
}

function fireGateAlert(m) {
  if (!m || !m.id) return;
  const { header, body } = splitGatePrompt(m.prompt);
  const trk = S.tracks.find(t => t.id === S.anchored);
  _alertGateId = m.id;
  const shown = showAlert({
    kind:  'gate',
    state: 'wait',
    track: trk ? trk.name : (S.anchored || ''),
    bodyHTML:
      '<div class="al-grid"><div class="k">asking</div>' +
      '<div class="v">' + esc(header) + '</div></div>' +
      (body ? '<div class="al-payload-lbl">payload</div>' +
              '<div class="al-payload">' + esc(body) + '</div>' : ''),
    buttons: [
      { label: 'approve', cls: 'al-approve',  fn: () => answerAlertGate('approve') },
      { label: 'deny',    cls: 'al-deny',     fn: () => answerAlertGate('deny') },
      { label: 'queue',   cls: 'al-queue',    fn: () => answerAlertGate('queue') },
      { label: 'dismiss', cls: 'al-dismiss',  fn: hideAlert },
    ],
  });
  if (!shown) {
    _alertGateId = null;
    send({ type: 'feed' });
    if (modalModeFor('ade') === 'corner') {
      showAdeCornerPop(m, trk ? trk.name : (S.anchored || ''), header);
    }
  }
}

function fireForeignGateAlert(m) {
  if (!m || !m.id) return;
  if (_alertGateId === m.id) return;
  if (_foreignGateQueue.some((g) => g.id === m.id)) return;
  if (_alertGateId) { _foreignGateQueue.push(m); return; }
  const { header, body } = splitGatePrompt(m.prompt);
  _alertGateId = m.id;
  const shown = showAlert({
    kind:  'gate',
    state: 'wait',
    track: m.track_name || m.track || '',
    bodyHTML:
      '<div class="al-grid"><div class="k">asking</div>' +
      '<div class="v">' + esc(header) + '</div></div>' +
      (body ? '<div class="al-payload-lbl">payload</div>' +
              '<div class="al-payload">' + esc(body) + '</div>' : ''),
    buttons: [
      { label: 'approve', cls: 'al-approve',  fn: () => answerForeignGate('approve') },
      { label: 'deny',    cls: 'al-deny',     fn: () => answerForeignGate('deny') },
      { label: 'queue',   cls: 'al-queue',    fn: () => answerForeignGate('queue') },
      { label: 'dismiss', cls: 'al-dismiss',  fn: hideAlert },
    ],
  });
  if (!shown) {
    _alertGateId = null;
    if (modalModeFor('ade') === 'corner') {
      showAdeCornerPop(m, m.track_name || m.track || '', header);
    }
    _advanceForeignQueue();
  }
}

function answerForeignGate(action) {
  const id = _alertGateId;
  hideAlert();
  if (!id) return;
  send({ type: 'gate_action', action, id });
  send({ type: 'feed' });
  setTimeout(() => send({ type: 'feed' }), 400);
  setTimeout(() => send({ type: 'feed' }), 1500);
}

const CORNER_DISMISS_MS = 8000;
let _adeCornerEl = null;
let _adeCornerGateId = null;
let _adeCornerTimer = null;

function _adeCornerPos() {
  const pos = localStorage.getItem('alert_pop_pos') || 'pane';
  const pane = pos === 'pane' ? $('glPane') : null;
  _adeCornerEl.style.left = '';
  if (pane) {
    const r = pane.getBoundingClientRect();
    _adeCornerEl.style.right  = Math.max(8, window.innerWidth  - r.right  + 8) + 'px';
    _adeCornerEl.style.bottom = Math.max(8, window.innerHeight - r.bottom + 8) + 'px';
  } else {
    _adeCornerEl.style.right  = '16px';
    _adeCornerEl.style.bottom = '16px';
  }
}

function showAdeCornerPop(m, trackName, summary) {
  if (!_adeCornerEl) {
    _adeCornerEl = document.createElement('div');
    _adeCornerEl.id = 'gate-corner';
    document.body.appendChild(_adeCornerEl);
  }
  _adeCornerGateId = m.id;
  const clean = (summary || '').replace(/\s*apply\?\s*\[y\/N\]\s*$/i, '').trim();
  _adeCornerEl.innerHTML =
    '<div class="gc-head"><span class="gc-kind">gate</span>' +
    '<span class="gc-track">' + esc(trackName || '') + '</span>' +
    '<span class="ph-spacer"></span>' +
    '<button class="gc-x" title="dismiss — leaves the gate parked">&#10005;</button></div>' +
    '<div class="gc-summary">' + esc(clean) + '</div>' +
    '<div class="gc-btns">' +
      '<button class="gc-b gc-approve">approve</button>' +
      '<button class="gc-b gc-deny">deny</button>' +
      '<button class="gc-b gc-queue">queue</button>' +
    '</div>';
  _adeCornerEl.querySelector('.gc-x').onclick       = hideAdeCornerPop;
  _adeCornerEl.querySelector('.gc-approve').onclick = () => answerAdeCornerPop('approve');
  _adeCornerEl.querySelector('.gc-deny').onclick    = () => answerAdeCornerPop('deny');
  _adeCornerEl.querySelector('.gc-queue').onclick   = () => answerAdeCornerPop('queue');
  _adeCornerPos();
  _adeCornerEl.classList.add('show');
  clearTimeout(_adeCornerTimer);
  if (localStorage.getItem('alert_pop_autodismiss') === '1') {
    _adeCornerTimer = setTimeout(hideAdeCornerPop, CORNER_DISMISS_MS);
  }
}

function hideAdeCornerPop() {
  if (!_adeCornerEl) return;
  _adeCornerEl.classList.remove('show');
  _adeCornerGateId = null;
  clearTimeout(_adeCornerTimer);
}

function answerAdeCornerPop(action) {
  const id = _adeCornerGateId;
  hideAdeCornerPop();
  if (!id) return;
  send({ type: 'gate_action', action, id });
  send({ type: 'feed' });
  setTimeout(() => send({ type: 'feed' }), 400);
  setTimeout(() => send({ type: 'feed' }), 1500);
}

function wireAdeModalKnobs() {
  const btn = $('adeModalToggle');
  if (btn) {
    const CYCLE = { inherit: 'fullscreen', fullscreen: 'window', window: 'corner', corner: 'off', off: 'inherit' };
    const LABEL = { inherit: 'modal: inherit', fullscreen: 'modal: full', window: 'modal: window', corner: 'modal: corner', off: 'modal: off' };
    const cur = () => { const v = globalFlags().modal_mode_ade; return LABEL[v] ? v : 'inherit'; };
    const paint = () => {
      const v = cur();
      btn.textContent = LABEL[v];
      btn.title = `ADE gate presentation: ${v} — click to cycle (inherit → full → window → corner → off)`;
    };
    paint();
    refreshGlobalFlags().then(paint);
    btn.onclick = () => {
      const next = CYCLE[cur()] || 'inherit';
      fetch('/api/global', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modal_mode_ade: next }),
      }).then(() => refreshGlobalFlags()).then(paint).catch(() => {});
    };
  }
  const posBtn = $('adePopPos');
  if (posBtn) {
    const paint = () => {
      const v = localStorage.getItem('alert_pop_pos') || 'pane';
      posBtn.textContent = v === 'corner' ? 'pop: corner' : 'pop: pane';
    };
    paint();
    posBtn.onclick = () => {
      const v = (localStorage.getItem('alert_pop_pos') || 'pane') === 'pane' ? 'corner' : 'pane';
      localStorage.setItem('alert_pop_pos', v);
      paint();
    };
  }
  const dmBtn = $('adePopDismiss');
  if (dmBtn) {
    const paint = () => {
      dmBtn.textContent = localStorage.getItem('alert_pop_autodismiss') === '1' ? 'auto: on' : 'auto: off';
    };
    paint();
    dmBtn.onclick = () => {
      const on = localStorage.getItem('alert_pop_autodismiss') === '1';
      localStorage.setItem('alert_pop_autodismiss', on ? '0' : '1');
      paint();
    };
  }
}

function fireMailAlert(evt) {
  if (_alertGateId) return;
  const trk = S.tracks.find(t => t.id === evt.track);
  const rows = mailRows(evt);
  const body =
    '<div class="al-grid"><div class="k">arrived</div><div class="v">' +
      esc(String(evt.count || rows.length)) + ' message(s) from ' +
      esc(((evt.from || []).join(', ')) || 'unknown sender') +
    '</div></div>' +
    rows.map(r =>
      '<div class="al-mail' + (r.system ? ' system' : '') + '">' +
        '<div class="al-from">' + esc(r.system ? 'harness notice' : r.who) + '</div>' +
        '<div class="al-payload">' + esc(r.body) + '</div>' +
      '</div>').join('');
  showAlert({
    kind:  'mail',
    track: trk ? trk.name : (evt.track || ''),
    ts:    evt.ts,
    bodyHTML: body,
    buttons: [{ label: 'dismiss', cls: 'al-dismiss', fn: hideAlert }],
  });
}

function handleMailEvent(evt, mirrored) {
  if (!evt || evt.kind !== 'mail') return;
  if (!mirrored && anchorPane && evt.track === S.anchored) anchorPane.renderMail(evt);
  fireMailAlert(evt);
}

let _dirtyStores    = new Set();
let _feedDirtyTimer = null;
let _feedDirtyFirst = 0;
let _treeDirtyTimer = null;
let _treeDirtyFirst = 0;
let _treeDirtyPending = false;

function nameOf(id) {
  if (id == null || id === '') return '';
  const live = (S.tracks || []).find(t => t.id === id);
  if (live) return live.name || live.id;
  const known = S.names && S.names[id];
  return known || id;
}
function mergeNames(names) {
  if (!names) return;
  Object.assign(S.names, names);
}
function isGone(id) {
  if (id == null || id === '') return false;
  if ((S.tracks || []).some(t => t.id === id)) return false;
  return !!(S.names && S.names[id]);
}

function route(m) {
  switch (m.type) {
    case 'ade_init':
      S.session = m.session || null;
      S.tracks  = m.tracks || [];
      S.trackRows = m.rows || [];
      mergeNames(m.names);
      if (S.anchored && !S.tracks.some(t => t.id === S.anchored)) {
        S.anchored = null;
        if (anchorPane) anchorPane.clear();
      }
      if (S.focus && !S.tracks.some(t => t.id === S.focus)) S.focus = null;
      renderRoster();
      syncArrangePlan(S.session && S.session.plan);
      routeArrangeFrame(m);
      if (_resyncPending) {
        _resyncPending = false;
        if (S.anchored) anchor(S.anchored);
        if (S.focus) setFocus(S.focus);
      }
      if (!S.anchored && S.tracks.length) anchor(S.tracks[0].id);
      send({ type: 'feed' });
      send({ type: 'tree', path: '.', hidden: false, tag: 'root' });
      break;

    case 'track_list':
      S.tracks = m.tracks || [];
      S.trackRows = m.rows || [];
      mergeNames(m.names);
      renderRoster();
      messengerRosterChanged();
      try { window.dispatchEvent(new CustomEvent('ade:track_list', { detail: { tracks: S.tracks } })); }
      catch (_) {  }
      routeArrangeFrame(m);
      break;

    case 'track_created':
      if (m.track) { S.tracks.push(m.track); renderRoster(); anchor(m.track.id); }
      routeArrangeFrame(m);
      break;

    case 'reload':
      console.log('[ade] reload:', m.reason || '');
      location.reload();
      break;

    case 'track_removed':
      S.tracks = S.tracks.filter(t => t.id !== m.id);
      if (S.anchored === m.id) S.anchored = null;
      if (S.focus === m.id) S.focus = null;
      renderRoster();
      refreshTimeline();
      break;

    case 'region_replaced':



      if (S.anchored === m.old_id) anchor(m.new_id);
      if (S.focus === m.old_id) setFocus(m.new_id);
      refreshTimeline();
      break;

    case 'track_transcript': {
      S.switchPending = false;
      const tt = S.tracks.find(x => x.id === m.id);
      if (anchorPane) {
        anchorPane.setTrack(m.id, tt ? tt.name : '');
        anchorPane.renderTranscript(m.messages || []);
      }
      break;
    }

    case 'chat_history':
      if (anchorPane) anchorPane.renderGateHistory(m.records || []);
      break;

    case 'out':
      if (anchorPane) anchorPane.appendOut(m.text || '', { dim: m.dim, end: m.end });
      break;

    case 'models':
      S.models   = m.list || [];
      S.curModel = m.current || (S.models[0] || null);
      break;

    case 'crew_list':
      S.crew = m.list || [];
      break;

    case 'gate_edges':
      S.edges = m.edges || [];
      break;

    case 'rail_catalog':
      S.rails = m.catalog || null;
      break;

    case 'tree':
    case 'file':
    case 'saved':
    case 'deleted':
    case 'moved':
    case 'term':
    case 'renamed':
    case 'made':
      routeMultiUseFrame(m);
      break;

    case 'mirror':
      renderMirror(m);
      if (m.kind === 'event') handleMailEvent(m.evt, true);
      break;

    case 'activity':
      handleMailEvent(m.event, false);
      break;

    case 'feed_dirty': {
      const wasEmpty = _dirtyStores.size === 0;
      (m.stores || []).forEach(s => _dirtyStores.add(s));
      if (wasEmpty) _feedDirtyFirst = Date.now();
      clearTimeout(_feedDirtyTimer);
      if (Date.now() - _feedDirtyFirst >= 1000) {
        if (_dirtyStores.has('record'))   send({ type: 'feed' });
        if (_dirtyStores.has('waypoint')) send({ type: 'wp_feed' });
        _dirtyStores.clear();
        _feedDirtyFirst = 0;
      } else {
        _feedDirtyTimer = setTimeout(() => {
          if (_dirtyStores.has('record'))   send({ type: 'feed' });
          if (_dirtyStores.has('waypoint')) send({ type: 'wp_feed' });
          _dirtyStores.clear();
          _feedDirtyFirst = 0;
        }, 300);
      }
      break;
    }

    case 'tree_dirty':
      if (m.track === '*' || (m.track && m.track === S.anchored)) {
        if (!_treeDirtyPending) { _treeDirtyPending = true; _treeDirtyFirst = Date.now(); }
        clearTimeout(_treeDirtyTimer);
        if (Date.now() - _treeDirtyFirst >= 1000) {
          if (muPanes && muPanes.filesPane) muPanes.filesPane.refresh();
          _treeDirtyPending = false;
          _treeDirtyFirst = 0;
        } else {
          _treeDirtyTimer = setTimeout(() => {
            if (muPanes && muPanes.filesPane) muPanes.filesPane.refresh();
            _treeDirtyPending = false;
            _treeDirtyFirst = 0;
          }, 300);
        }
      }
      break;

    case 'feed':
      routeQueueLogFrame(m);
      routeTimelineFrame(m);
      routeChangesFrame(m);
      routeLedgerFrame(m);
      routeArrangeFrame(m);
      routeAgentStripFrame(m);
      break;

    case 'ledger_detail':
      routeQueueLogFrame(m);
      routeChangesFrame(m);
      break;

    case 'wp_feed':
      routeMessengerFrame(m);
      break;

    case 'transcript':
      routeLedgerFrame(m);
      break;

    case 'status':
      if (S.switchPending) break;
      if (anchorPane) anchorPane.setStatus(m.phase);
      break;

    case 'track_status':
      routeAgentStripFrame(m);
      break;

    case 'context_warn':
      routeAgentStripFrame(m);
      break;

    case 'meters':
      if (S.switchPending) break;
      if (anchorPane) anchorPane.setMeters(m.meters);
      break;

    case 'ask':
    case 'gate_pending':
      if (anchorPane) anchorPane.renderGate(m);
      if (m.type === 'ask') fireGateAlert(m);
      else if (_alertGateId && !m.active) hideAlert();
      break;

    case 'gate_broadcast':
      routeAgentStripFrame(m);
      if (m.kind === 'ask') {
        fireForeignGateAlert(m);
      } else if (m.kind === 'resolved') {
        _foreignGateQueue = _foreignGateQueue.filter((g) => g.id !== m.id);
        if (_alertGateId === m.id) hideAlert();
      }
      break;

    default:
      break;
  }
}

function renderRoster() {
  const sel = $('anchorSel');
  const cur = S.anchored;
  sel.innerHTML = '';
  if (!S.tracks.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'no tracks — add region';
    sel.appendChild(o);
  } else {
    for (const t of S.tracks) {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.name + (t.model ? ` · ${t.model}` : '');
      if (t.id === cur) o.selected = true;
      sel.appendChild(o);
    }
  }
  renderFocusRoster();
  refreshAgentStrip();
}

function anchor(trackId) {
  if (!trackId) return;
  S.anchored = trackId;
  const sel = $('anchorSel');
  if (sel.value !== trackId) sel.value = trackId;
  if (anchorPane) anchorPane.clear();
  S.switchPending = true;
  refreshAgentStrip();
  send({ type: 'anchor', track: trackId });
}

function renderFocusRoster() {
  const sel = $('focusSel');
  if (!sel) return;
  const cur = S.focus;
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = ''; none.textContent = '(none)';
  sel.appendChild(none);
  for (const t of S.tracks) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name + (t.model ? ` · ${t.model}` : '');
    if (t.id === cur) o.selected = true;
    sel.appendChild(o);
  }
  if (!cur) sel.value = '';
}

function setFocus(trackId) {
  const tid = trackId || null;
  S.focus = tid;
  if (!tid) mirrorDetach();
  else mirrorAttach(tid);
  const sel = $('focusSel');
  if (sel && sel.value !== (tid || '')) sel.value = tid || '';
  refreshAgentStrip();
  send({ type: 'focus', track: tid });
  const inputEl = $('focusInput'), sendBtn = $('focusSend');
  if (inputEl) {
    inputEl.disabled = !tid;
    inputEl.placeholder = tid ? 'message this track…' : 'select a track above to chat with it';
  }
  if (sendBtn) sendBtn.disabled = !tid;
  const stopBtn = $('focusStop');
  if (stopBtn) stopBtn.disabled = !tid;
}

function _sendStop(trackId, btn) {
  if (!trackId) return;
  send({ type: 'stop', track: trackId });
  if (btn) {
    btn.classList.add('cp-stop-fired');
    setTimeout(() => btn.classList.remove('cp-stop-fired'), 600);
  }
}


let _focusImgs = null;

function _focusSubmit() {
  const inputEl = $('focusInput');
  const text = (inputEl.value || '').trim();
  const imgs = _focusImgs;
  if (!imgs) return;
  if ((!text && !imgs.count()) || !S.focus) return;
  const { media, paths } = imgs.drain();
  appendMirrorEcho(text);
  const frame = { type: 'user', text, track: S.focus };
  if (media.length) frame.media = media;
  if (paths.length) frame.image_paths = paths;
  send(frame);
  inputEl.value = '';
}


const SPLIT = {
  col:       { prop: '--col-left', axis: 'x', min: 220, max: 640,  invert: false, host: () => $('panes') },
  left:      { prop: '--gl-h',     axis: 'y', min: 120, max: 9999, invert: true,  host: () => $('leftcol'), persistKey: 'ade_split_left' },
  row:       { prop: '--bot-h',    axis: 'y', min: 140, max: 9999, invert: true,  host: () => $('rightcol') },
  bot:       { prop: '--focus-w',  axis: 'x', min: 240, max: null, minOther: 300, invert: true, host: () => $('bottomrow') },
  focusgate: { prop: '--focus-gate-h', axis: 'y', min: 40, max: 9999, invert: true, host: () => $('focus'), persistKey: 'ade_split_focusgate' },
  tlheads:   { prop: '--tl-heads-w', axis: 'x', min: 120, max: 400, invert: false, host: () => $('tlScroll') },
};

function loadSplitPx(key) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return (isFinite(v) && v > 0) ? v : null;
  } catch (e) { return null; }
}
function saveSplitPx(key, px) {
  try { localStorage.setItem(key, String(px)); } catch (e) {}
}

function wireSplitters() {
  for (const key in SPLIT) {
    const cfg = SPLIT[key];
    if (!cfg.persistKey) continue;
    const saved = loadSplitPx(cfg.persistKey);
    if (saved != null) cfg.host().style.setProperty(cfg.prop, saved + 'px');
  }
  document.querySelectorAll('.split').forEach(el => {
    if (!el.dataset.split) return;
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      const cfg = SPLIT[el.dataset.split];
      if (!cfg) return;
      const host = cfg.host();
      const rect = host.getBoundingClientRect();
      el.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = cfg.axis === 'x' ? 'col-resize' : 'row-resize';

      const move = (ev) => {
        let px;
        if (cfg.axis === 'x') px = cfg.invert ? (rect.right - ev.clientX) : (ev.clientX - rect.left);
        else                  px = cfg.invert ? (rect.bottom - ev.clientY) : (ev.clientY - rect.top);
        px = Math.max(cfg.min, px);
        if (cfg.max != null) px = Math.min(cfg.max, px);
        if (cfg.minOther != null) {
          const span = cfg.axis === 'x' ? rect.width : rect.height;
          px = Math.min(px, span - cfg.minOther);
        }
        host.style.setProperty(cfg.prop, px + 'px');
      };
      const up = () => {
        el.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (cfg.persistKey) {
          const px = parseFloat(host.style.getPropertyValue(cfg.prop));
          if (isFinite(px)) saveSplitPx(cfg.persistKey, px);
        }
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  });
}

const CP_ZOOM_MIN = 0.7, CP_ZOOM_MAX = 2.2, CP_ZOOM_STEP = 1.1;
function loadCpZoom(key) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return (isFinite(v) && v > 0) ? v : 1;
  } catch (e) { return 1; }
}
function saveCpZoom(key, v) {
  try { localStorage.setItem(key, String(v)); } catch (e) {}
}
function wireChatZoomPane(paneEl, outBtn, inBtn, lbl, key) {
  let zoom = loadCpZoom(key);
  function paint() {
    paneEl.style.setProperty('--cp-zoom', zoom);
    lbl.textContent = Math.round(zoom * 100) + '%';
  }
  function setZoom(v) {
    zoom = Math.max(CP_ZOOM_MIN, Math.min(CP_ZOOM_MAX, v));
    saveCpZoom(key, zoom);
    paint();
  }
  outBtn.addEventListener('click', () => setZoom(zoom / CP_ZOOM_STEP));
  inBtn.addEventListener('click', () => setZoom(zoom * CP_ZOOM_STEP));
  paint();
}
function wireChatZoom() {
  wireChatZoomPane($('anchorPane'), $('anchorZoomOut'), $('anchorZoomIn'), $('anchorZoomLbl'), 'ade_cp_zoom_anchor');
  wireChatZoomPane($('focus'),      $('focusZoomOut'),  $('focusZoomIn'),  $('focusZoomLbl'),  'ade_cp_zoom_focus');
}


const MU_COLS = [
  { key: 'files',  el: 'mvFiles',  prop: '--mu-files',  min: 170 },
  { key: 'editor', el: 'mvEditor', prop: '--mu-editor', min: 260 },
  { key: 'term',   el: 'mvTerm',   prop: '--mu-term',   min: 220 },
];


function syncMuColumns() {
  for (const c of MU_COLS) {
    const on = !!S.muCols[c.key];
    const el = $(c.el);
    if (el) el.classList.toggle('active', on);
    document.querySelectorAll(`.mtab[data-mtab="${c.key}"]`)
      .forEach(t => t.classList.toggle('active', on));
  }

  let seenOpen = false, pending = null;
  for (const child of $('muBody').children) {
    if (child.classList.contains('split')) {
      child.classList.remove('live');
      if (seenOpen) pending = child;
    } else if (child.classList.contains('mview')) {
      if (!child.classList.contains('active')) continue;
      if (seenOpen && pending) pending.classList.add('live');
      seenOpen = true;
      pending = null;
    }
  }

  relayoutMu();
}

function relayoutMu() {
  requestAnimationFrame(() => {
    try { if (muPanes && muPanes.editorPane) muPanes.editorPane.show(); } catch (_) {}
  });
}

function wireMuSplitters() {
  document.querySelectorAll('#muBody .split').forEach(el => {
    el.addEventListener('mousedown', e => {
      const before = muNeighbor(el, -1), after = muNeighbor(el, +1);
      if (!before || !after) return;
      e.preventDefault();
      const root = $('muBody');
      const aRect = $(before.el).getBoundingClientRect();
      const bRect = $(after.el).getBoundingClientRect();
      const span  = aRect.width + bRect.width;
      const budget = muRatio(before) + muRatio(after);
      const originX = aRect.left;
      if (span <= before.min + after.min) return;
      el.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const move = (ev) => {
        let aPx = ev.clientX - originX;
        aPx = Math.max(before.min, Math.min(span - after.min, aPx));
        const rA = budget * (aPx / span);
        root.style.setProperty(before.prop, rA.toFixed(3));
        root.style.setProperty(after.prop, (budget - rA).toFixed(3));
        relayoutMu();
      };
      const up = () => {
        el.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        relayoutMu();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  });
}

function muNeighbor(splitEl, dir) {
  const kids = Array.from($('muBody').children);
  for (let i = kids.indexOf(splitEl) + dir; i >= 0 && i < kids.length; i += dir) {
    const k = kids[i];
    if (!k.classList.contains('mview') || !k.classList.contains('active')) continue;
    return MU_COLS.find(c => c.el === k.id) || null;
  }
  return null;
}

function muRatio(col) {
  const v = parseFloat(getComputedStyle($('muBody')).getPropertyValue(col.prop));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function setMuFull(on) {
  $('shell').classList.toggle('mu-full', !!on);
  document.querySelectorAll('#btnMuFull, #btnMuExpand')
    .forEach(b => b.classList.toggle('active', !!on));
  relayoutMu();
}

function setView(v) {
  S.view = v;
  document.querySelectorAll('.vtab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  const el = $('view-' + v);
  if (el) el.classList.add('active');
  const refreshers = { queue: refreshQueueLog, timeline: refreshTimeline,
                       changes: refreshChanges, ledger: refreshLedgerView,
                       messenger: refreshMessenger, arrange: refreshArrange };
  if (refreshers[v]) refreshers[v]();
}

function wireTabs() {
  document.querySelectorAll('.vtab').forEach(t => { t.onclick = () => setView(t.dataset.view); });
  document.querySelectorAll('.mtab').forEach(t => {
    t.onclick = () => {
      const k = t.dataset.mtab;
      if (!(k in S.muCols)) return;
      const open = Object.values(S.muCols).filter(Boolean).length;
      if (S.muCols[k] && open <= 1) return;
      S.muCols[k] = !S.muCols[k];
      syncMuColumns();
    };
  });
}

function showModal(title, bodyHTML, buttons) {
  const box = $('modalBox');
  box.innerHTML = `<h3>${esc(title)}</h3><div>${bodyHTML}</div>`;
  const row = document.createElement('div');
  row.className = 'mrow';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.danger) el.className = 'danger';
    el.onclick = () => b.fn();
    row.appendChild(el);
  }
  box.appendChild(row);
  $('modal').classList.add('show');
}
function closeModal() { $('modal').classList.remove('show'); }

function showConfirm(prompt, onYes, onNo) {
  showModal('Confirm', `<p style="white-space:pre-wrap;font-size:12.5px;">${esc(prompt)}</p>`, [
    { label: 'Yes', fn: () => { closeModal(); if (onYes) onYes(); } },
    { label: 'No', danger: true, fn: () => { closeModal(); if (onNo) onNo(); } },
  ]);
}

function showPrompt(message, defaultValue, onOk) {
  const submit = () => {
    const inp = $('modalPromptInput');
    const v = inp ? inp.value : '';
    closeModal();
    if (onOk) onOk(v);
  };
  showModal(message,
    '<input type="text" id="modalPromptInput" style="width:100%;box-sizing:border-box;" />', [
    { label: 'OK', fn: submit },
    { label: 'Cancel', fn: closeModal },
  ]);
  const inp = $('modalPromptInput');
  if (inp) {
    inp.value = defaultValue || '';
    inp.focus();
    inp.select();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }
}

function formatSavedDate(ms) {
  if (!ms) return '';
  try { return new Date(ms).toLocaleString(); } catch (_) { return ''; }
}
function pickerRow(id, title, subHTML, del) {
  const text = `<div style="font-size:12.5px;color:var(--text-1);">${esc(title)}</div>` +
               `<div style="font-size:10.5px;color:var(--text-4);">${subHTML}</div>`;
  const base = `class="load-row" data-pick="${esc(id)}" style="padding:7px 4px;` +
               `border-bottom:1px solid var(--gridline);cursor:pointer;`;
  if (!del) return `<div ${base}">${text}</div>`;
  return `<div ${base}display:flex;align-items:center;gap:8px;">` +
         `<div style="flex:1;min-width:0;">${text}</div>` +
         `<button type="button" class="row-del" data-del="${esc(del.id)}" ` +
         `data-delname="${esc(del.name)}" title="delete this session preset" ` +
         `style="flex:0 0 auto;background:none;border:none;color:var(--red,#e5484d);` +
         `font-size:15px;line-height:1;cursor:pointer;padding:2px 6px;">&times;</button></div>`;
}
function openLoadPicker() {
  showModal('Load session', '<p style="font-size:12.5px;">loading&#8230;</p>', [
    { label: 'Cancel', fn: closeModal },
  ]);
  fetch('/api/ade-sessions')
    .then(r => r.json())
    .then(data => {
      const list = (data && data.list) || [];
      const rows = list.length
        ? list.map(s => pickerRow(s.id, s.name || s.id,
            `${esc(formatSavedDate(s.saved))} &middot; ` +
            `${s.tracks || 0} track${s.tracks === 1 ? '' : 's'}`)).join('')
        : '<p style="font-size:12.5px;color:var(--text-3);">no saved sessions</p>';
      showModal('Load session', `<div style="max-height:280px;overflow:auto;">${rows}</div>`, [
        { label: 'Cancel', fn: closeModal },
      ]);
      $('modalBox').querySelectorAll('.load-row').forEach(el => {
        el.onclick = () => { closeModal(); sendAdeLoad(el.dataset.pick); };
      });
    })
    .catch(() => {
      showModal('Load session', '<p style="font-size:12.5px;">failed to load sessions</p>', [
        { label: 'Close', fn: closeModal },
      ]);
    });
}


function newPickerRows(list, note) {
  const blank = pickerRow('', 'blank session', 'no tracks, no regions');
  const body  = list.length
    ? list.map(t => pickerRow(t.id, t.name || t.id,
        `${esc(formatSavedDate(t.saved))} &middot; ` +
        `${t.tracks || 0} agent${t.tracks === 1 ? '' : 's'}`,
        { id: t.id, name: t.name || t.id })).join('')
    : `<p style="font-size:12.5px;color:var(--text-3);">${esc(note)}</p>`;
  return `<div style="max-height:280px;overflow:auto;">${blank}${body}</div>`;
}
function wireNewPicker() {
  const box = $('modalBox');
  box.querySelectorAll('.load-row').forEach(el => {
    el.onclick = () => { closeModal(); sendAdeNew(el.dataset.pick); };
  });
  box.querySelectorAll('.row-del').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const name = btn.dataset.delname || btn.dataset.del;
      if (!window.confirm(`Delete session preset '${name}'? This cannot be undone.`)) return;
      btn.disabled = true;
      fetch('/api/ade-templates/' + encodeURIComponent(btn.dataset.del), { method: 'DELETE' })
        .then(r => r.json())
        .then(d => { if (d && d.error) window.alert('delete failed: ' + d.error); })
        .catch(() => window.alert('delete failed'))
        .finally(() => openNewPicker());
    };
  });
}
function openNewPicker() {
  showModal('New session', '<p style="font-size:12.5px;">loading&#8230;</p>', [
    { label: 'Cancel', fn: closeModal },
  ]);
  fetch('/api/ade-templates')
    .then(r => r.json())
    .then(data => {
      showModal('New session',
                newPickerRows((data && data.list) || [], 'no templates yet'), [
        { label: 'Cancel', fn: closeModal },
      ]);
      wireNewPicker();
    })
    .catch(() => {
      showModal('New session',
                newPickerRows([], 'templates unavailable'), [
        { label: 'Cancel', fn: closeModal },
      ]);
      wireNewPicker();
    });
}


function openSavePrompt(current) {
  const submit = () => {
    const inp  = $('modalPromptInput');
    const box  = $('modalSaveTemplate');
    const name = ((inp && inp.value) || '').trim();
    const tmpl = !!(box && box.checked);
    closeModal();
    if (name) sendAdeSave(name, tmpl);
  };
  showModal('Save session as:',
    '<input type="text" id="modalPromptInput" style="width:100%;box-sizing:border-box;" />' +
    '<label style="display:flex;align-items:center;gap:6px;margin-top:9px;' +
    'font-size:11.5px;color:var(--text-3);cursor:pointer;">' +
    '<input type="checkbox" id="modalSaveTemplate" />' +
    'save as template &mdash; the roster, no conversation</label>', [
    { label: 'OK', fn: submit },
    { label: 'Cancel', fn: closeModal },
  ]);
  const inp = $('modalPromptInput');
  if (inp) {
    inp.value = current || '';
    inp.focus();
    inp.select();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }
}

function wireTrackMenus() {
  $('btnEditTrack').onclick = () => {
    const track = S.tracks.find(t => t.id === S.anchored);
    if (!track) return;
    openTrackMenu({ mode: 'edit', track, models: S.models, crew: S.crew, edges: S.edges, rails: S.rails, send })
      .then((frame) => { if (frame) refreshTimeline(); });
  };
}

const VIEW_ESC = { queue: onEscQueueLog, timeline: onEscTimeline,
                   changes: onEscChanges, ledger: onEscLedgerView,
                   messenger: onEscMessenger, arrange: onEscArrange };
function wireEsc() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = $('modal');
    if (modal && modal.classList.contains('show')) { modal.classList.remove('show'); return; }
    const al = $('alert');
    if (al && al.classList.contains('show')) { hideAlert(); return; }
    if (onEscAgentStrip()) return;
    const onEsc = VIEW_ESC[S.view];
    if (onEsc && onEsc()) return;
  });
}




function wireSessionButtons() {
  $('btnAdeNew').onclick  = () => openNewPicker();
  $('btnAdeLoad').onclick = () => openLoadPicker();
  $('btnAdeSave').onclick = () => openSavePrompt((S.session && S.session.name) || '');
  $('btnAdeEnd').onclick  = () => sendAdeEnd();
}

function boot() {
  anchorPane = makeChatPane(
    { scriptEl: $('anchorBody'), gateListEl: $('glList'), inputEl: $('anchorInput'),
      sendBtn: $('anchorSend'), nameEl: $('glTrackName') }, send,
    { ownsTitle: true, onSettle: (id, action) => sendGateAnswer(id, action) });
  wireMirrorSettle((id, action, track) => sendGateAnswer(id, action, track));
  $('focusInput').disabled = true;
  $('focusInput').placeholder = 'select a track above to chat with it';
  $('focusSend').disabled = true;
  $('focusSend').onclick = _focusSubmit;
  $('anchorStop').onclick = () => _sendStop(S.anchored, $('anchorStop'));
  $('focusStop').disabled = true;
  $('focusStop').onclick = () => _sendStop(S.focus, $('focusStop'));
  _focusImgs = makeImageIntake({ inputEl: $('focusInput'), scriptEl: $('focusScript') });
  $('focusInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _focusSubmit(); }
    else if (e.key === 'Escape' && _focusImgs.count() && !$('focusInput').value) {
      e.preventDefault();
      _focusImgs.clear();
    }
  });
  $('anchorSel').addEventListener('change', e => anchor(e.target.value));
  $('focusSel').addEventListener('change', e => setFocus(e.target.value));
  const focusHead = $('focusName') && $('focusName').closest('.pane-head');
  if (focusHead) {
    focusHead.style.cursor = 'pointer';
    focusHead.addEventListener('click', e => {
      if (e.target.closest('select, button')) return;
      if (S.focus && S.focus !== S.anchored) anchor(S.focus);
    });
  }
  wireTabs();
  wireEsc();
  wireTrackMenus();
  wireSessionButtons();
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  $('alClose').onclick = hideAlert;
  placeAlert(modalModeFor('ade'));
  muPanes = mountMultiUse(
    { filesEl: $('mvFiles'), termEl: $('mvTerm'), editorEl: $('mvEditor') },
    { send, showConfirm, showPrompt });
  syncMuColumns();
  wireMuSplitters();
  const toggleMuFull = () => setMuFull(!$('shell').classList.contains('mu-full'));
  $('btnMuFull').onclick   = toggleMuFull;
  $('btnMuExpand').onclick = toggleMuFull;
  const viewCtx = {
    send,
    getTracks:  () => S.tracks,
    nameOf,
    isGone,
    getTrackRows: () => S.trackRows,
    getSession: () => S.session,
    setFocus,
    editTrack: (track) => openTrackMenu(
      { mode: 'edit', track, models: S.models, crew: S.crew, edges: S.edges, rails: S.rails, send })
      .then((frame) => { if (frame) refreshTimeline(); }),
    addTrack: () => openTrackMenu(
      { mode: 'addTrack', track: null, models: S.models, crew: S.crew, edges: S.edges, rails: S.rails, send })
      .then((frame) => { if (frame) refreshTimeline(); }),
    addRegion: (trackId) => {
      const usedTrackIds = new Set(S.tracks.map((r) => r.track));
      const openTracks = S.trackRows.filter((row) => !usedTrackIds.has(row.id));
      return openTrackMenu(
        { mode: 'add', track: null, targetTrack: trackId || '', models: S.models, crew: S.crew, edges: S.edges, rails: S.rails, tracks: openTracks, send })
        .then((frame) => { if (frame) refreshTimeline(); });
    },
    getAnchored: () => S.anchored,
    showConfirm,
    showPrompt,
  };
  mountQueueLog($('view-queue'), viewCtx);
  mountTimeline($('view-timeline'), viewCtx);
  mountChanges($('view-changes'), viewCtx);
  mountLedgerView($('view-ledger'), viewCtx);
  mountMessenger($('view-messenger'), viewCtx);
  mountArrange($('view-arrange'), viewCtx);
  mountAgentStrip($('agentStrip'), viewCtx);
  (() => {
    const btn = $('btnRetiredChats');
    if (!btn) return;
    let win = null;
    const paint = () => btn.classList.toggle('ag-on', !!(win && !win.closed));
    setInterval(paint, 1000);
    btn.addEventListener('click', () => {
      if (win && !win.closed) { win.close(); win = null; paint(); return; }
      win = window.open('/ade/retired', 'adeRetired', 'width=1200,height=800');
      paint();
    });
  })();
  mountPaneChip($('anchorAgentChip'), () => S.anchored);
  mountPaneChip($('focusAgentChip'),  () => S.focus);
  wireSplitters();
  wireChatZoom();
  $('btnWin3').onclick = () => openLedgerWindow({});
  wireKillswitch($('btnPanic'), () => send({ type: 'killswitch' }));
  wireAdeModalKnobs();
  $('btnAnchorLedger').onclick = () => setView('ledger');
  $('btnFocusLedger').onclick  = () => setView('ledger');
  connect();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
