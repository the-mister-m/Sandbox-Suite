'use strict';

let _host = null;
let _ctx  = null;

const HUMAN_IDENT = 'Captain';

const SYSTEM_IDENT = '\u00abharness\u00bb';

const HARNESS_KEY = '__harness';
const CAPTAIN_KEY = '__captain';

let LINES  = [];
let COUNTS = {};

let NAME = {}, STATUS = {}, LIVE = new Set();
const _seenArm = new Set();

function tracks() { return (_ctx && _ctx.getTracks && _ctx.getTracks()) || []; }
function rebuildRoster() {
  NAME = {}; STATUS = {}; LIVE = new Set();
  NAME[HUMAN_IDENT] = 'Captain';
  tracks().forEach(t => {
    NAME[t.id] = t.name || t.id;
    STATUS[t.id] = t.status || 'idle';
    LIVE.add(t.id);
    if (!_seenArm.has(t.id)) { _seenArm.add(t.id); armedSend.add(t.id); armedView.add(t.id); }
    if (t.muted) armedSend.delete(t.id);
  });
}

const armedSend = new Set();
const armedView = new Set([CAPTAIN_KEY]);

function $m(id) { return _host.querySelector('#' + id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c])); }
function nameOf(id) {
  if (NAME[id]) return NAME[id];
  const known = _ctx && _ctx.nameOf ? _ctx.nameOf(id) : null;
  return known || id;
}
function isGone(id) {
  if (id === HUMAN_IDENT || id === SYSTEM_IDENT) return false;
  if (LIVE.has(id)) return false;
  return !!(_ctx && _ctx.isGone && _ctx.isGone(id));
}
function goneCls(id) { return isGone(id) ? ' mg-gone' : ''; }
function clock(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  return String(d.getUTCHours()).padStart(2,'0') + ':' +
         String(d.getUTCMinutes()).padStart(2,'0') + ':' +
         String(d.getUTCSeconds()).padStart(2,'0');
}

function setOf(l) { return [...new Set([l.from, ...(l.to || [])])].sort(); }
function keyOf(l) { return setOf(l).join('|'); }
function buildCards() {
  const map = new Map();
  LINES.forEach(l => {
    const k = keyOf(l);
    if (!map.has(k)) map.set(k, { key: k, ids: setOf(l), lines: [] });
    map.get(k).lines.push(l);
  });
  const cards = [...map.values()];
  cards.forEach(c => c.group = c.ids.includes(HUMAN_IDENT));
  cards.sort((a, b) => (b.group ? 1 : 0) - (a.group ? 1 : 0) || b.lines.length - a.lines.length);
  return cards;
}
function statusOf(id) { return STATUS[id] || 'idle'; }

function metaRow(key, label, sub, mail, cls) {
  const d = document.createElement('div');
  d.className = 'mg-row meta ' + cls + (mail ? ' has-mail' : '');
  d.innerHTML =
    `<span class="dot"></span>` +
    `<div class="mg-txt"><div class="mg-name">${esc(label)}</div><div class="mg-sub">${esc(sub)}</div></div>` +
    (mail == null ? '' : `<span class="mg-mail ${mail ? 'unread' : 'none'}">${mail ? mail : ''}</span>`) +
    `<div class="mg-btns"><button class="mg-btn v" data-v="${key}" title="view">✉️</button></div>`;
  return d;
}
function metaRows(el) {
  el.appendChild(metaRow(CAPTAIN_KEY, 'captain', 'your chats · letters to you',
                         COUNTS[HUMAN_IDENT] || 0, 'captain'));
  el.appendChild(metaRow(HARNESS_KEY, 'harness', 'harness notices', null, 'harness'));
}
function renderRows() {
  const el = $m('mgRows'); el.innerHTML = '';
  const ts = tracks();
  if (!ts.length) { el.innerHTML = '<div class="mg-empty">no live tracks — start an agent</div>'; metaRows(el); return; }
  ts.forEach(t => {
    const mail = COUNTS[t.id] || 0;
    const st = t.status || 'idle';
    const d = document.createElement('div'); d.className = 'mg-row' + (t.muted ? ' muted' : '');
    d.innerHTML =
      `<span class="dot ${st}"></span>` +
      `<div class="mg-txt"><div class="mg-name">${esc(t.name || t.id)}</div><div class="mg-sub">${esc(t.model || '')}</div></div>` +
      `<span class="mg-mail ${mail ? '' : 'none'}">${mail ? mail : ''}</span>` +
      `<div class="mg-btns">` +
      `<button class="mg-btn m${t.muted ? ' on' : ''}" data-m="${esc(t.id)}" ` +
      `title="${t.muted ? 'bring back into the session' : 'take out of the session'}">🚫</button>` +
      `<button class="mg-btn s" data-s="${esc(t.id)}" title="send">➤</button>` +
      `<button class="mg-btn v" data-v="${esc(t.id)}" title="view">✉️</button></div>`;
    el.appendChild(d);
  });
  metaRows(el);
}
function syncButtons() {
  _host.querySelectorAll('.mg-btn.s').forEach(b => b.classList.toggle('armed', armedSend.has(b.dataset.s)));
  _host.querySelectorAll('.mg-btn.v').forEach(b => b.classList.toggle('armed', armedView.has(b.dataset.v)));
  const open = tracks().filter(t => !t.muted);
  const armed = open.filter(t => armedSend.has(t.id)).map(t => t.name || t.id);
  const allLive = open.length && armed.length === open.length;
  $m('mgToLine').textContent = allLive ? 'all' : (armed.join(', ') || 'no one');
}
function renderCards() {
  const g = $m('mgGrid'); g.innerHTML = '';
  const cards = buildCards().filter(c => {
    if (!armedView.has(HARNESS_KEY) && c.ids.includes(SYSTEM_IDENT)) return false;
    if (!armedView.has(CAPTAIN_KEY) && c.ids.includes(HUMAN_IDENT))  return false;
    return c.ids.every(id => !LIVE.has(id) || armedView.has(id));
  });
  if (!LINES.length) { g.innerHTML = '<div class="mg-empty">no messages on the waypoint yet</div>'; return; }
  if (!cards.length) { g.innerHTML = '<div class="mg-empty">no chats match this view filter</div>'; return; }
  cards.forEach(c => {
    const last = c.lines[c.lines.length - 1];
    const div = document.createElement('div'); div.className = 'mg-card' + (c.group ? ' group' : '');
    const chips = c.ids.map(id => `<span class="mg-chip${goneCls(id)}"><span class="dot ${statusOf(id)}"></span>${esc(nameOf(id))}</span>`).join('');
    div.innerHTML =
      `<div class="mg-parts">${chips}</div>` +
      `<div class="mg-prev"><b class="${goneCls(last.from).trim()}">${esc(nameOf(last.from))}:</b> ${esc(last.body)}</div>` +
      `<div class="mg-foot"><span class="mg-tag">${c.group ? 'group · you send here' : 'view only'}</span>` +
      `<span class="mg-cnt">${c.lines.length} ${c.lines.length === 1 ? 'line' : 'lines'}</span></div>`;
    div.onclick = () => openChat(c);
    g.appendChild(div);
  });
}
let OPEN = null;
let UNREAD = [];

function unreadToMe(l) {
  return l.status === 'pending' && (l.to || []).includes(HUMAN_IDENT);
}
function markRead(ids) {
  if (!ids.length) return;
  if (_ctx && _ctx.send) _ctx.send({ type: 'wp_read', ids });
}

function renderChat(c) {
  $m('mgTitle').textContent = c.group ? 'Group chat' : c.ids.map(nameOf).join(' · ');
  $m('mgSub').textContent   = (c.group ? 'you send here' : 'view only') + '  —  ' + c.ids.map(nameOf).join(' · ');
  const log = $m('mgLog');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = '';
  UNREAD = c.lines.filter(unreadToMe).map(l => l.id).filter(id => id != null);
  const all = $m('mgReadAll'); if (all) all.hidden = !UNREAD.length;
  c.lines.forEach(l => {
    const from = l.from, mine = from === HUMAN_IDENT;
    const blk = document.createElement('div'); blk.className = 'mg-turn';
    const msg = document.createElement('div');
    msg.className = 'mg-msg ' + (mine ? 'user' : 'agent') +
      (l.status === 'denied' ? ' denied' : '') + (l.status === 'dead' ? ' dead' : '');
    let foot;
    if      (l.status === 'denied')  foot = `<span class="gbadge red">denied</span><span>said ${clock(l.said)}</span>`;
    else if (l.status === 'dead')    foot = `<span class="gbadge white">dead-letter</span><span>said ${clock(l.said)}</span>`;
    else if (l.status === 'pending') foot = `<span>said ${clock(l.said)}</span><span>· unread</span>`;
    else    foot = `<span>said ${clock(l.said)}</span>` + (l.heard != null ? `<span class="mg-heard">heard ${clock(l.heard)}</span>` : '');
    if (unreadToMe(l) && l.id != null) foot += `<button class="mg-btn read" data-read="${l.id}">mark read</button>`;
    msg.innerHTML = `<div class="mg-who${mine ? '' : goneCls(from)}">${mine ? 'you' : esc(nameOf(from))}</div><div class="mg-bub">${esc(l.body)}</div>`;
    const ft = document.createElement('div'); ft.className = 'mg-tfoot'; ft.innerHTML = foot;
    blk.appendChild(msg); blk.appendChild(ft);
    log.appendChild(blk);
  });
  if (atBottom) log.scrollTop = log.scrollHeight;
}
function openChat(c) {
  OPEN = c.key;
  renderChat(c);
  $m('mgChat').classList.add('on');
  const log = $m('mgLog'); log.scrollTop = log.scrollHeight;
}
function refreshChat() {
  if (!OPEN) return;
  const c = buildCards().find(x => x.key === OPEN);
  if (c) renderChat(c);
}
function closeChat() {
  OPEN = null; UNREAD = [];
  const all = $m('mgReadAll'); if (all) all.hidden = true;
  const ch = $m('mgChat'); if (ch) ch.classList.remove('on');
}

export function mount(el, ctx) {
  _host = el; _ctx = ctx;
  el.innerHTML =
    `<div class="mg-panes">` +
      `<aside class="mg-rail">` +
        `<div class="mg-head"><span>Tracks</span><span class="mg-sp"></span>` +
          `<div class="mg-al">` +
            `<div class="mg-alg"><span class="mg-allbl">send</span><span class="mg-albtns">` +
              `<button class="mg-lnk" data-all-send="1">all</button><span class="mg-alsep">·</span>` +
              `<button class="mg-lnk" data-all-send="0">none</button></span></div>` +
            `<div class="mg-alg"><span class="mg-allbl">view</span><span class="mg-albtns">` +
              `<button class="mg-lnk" data-all-view="1">all</button><span class="mg-alsep">·</span>` +
              `<button class="mg-lnk" data-all-view="0">none</button></span></div>` +
          `</div>` +
        `</div>` +
        `<div class="mg-rows" id="mgRows"></div>` +
        `<div class="mg-compose"><div class="mg-to">send to <b id="mgToLine">all</b></div>` +
          `<div class="mg-cin"><input id="mgInput" placeholder="Announce to the group…">` +
          `<button id="mgSend">Send</button></div></div>` +
      `</aside>` +
      `<div class="mg-divider"></div>` +
      `<main class="mg-main">` +
        `<div class="mg-stage" id="mgStage"><div class="mg-grid" id="mgGrid"></div></div>` +
        `<section class="mg-chat" id="mgChat">` +
          `<div class="mg-chead"><button class="mg-back" id="mgBack">← back</button>` +
            `<div><div class="mg-ctitle" id="mgTitle"></div><div class="mg-csub" id="mgSub"></div></div>` +
            `<button class="mg-btn read" id="mgReadAll" hidden>mark all read</button></div>` +
          `<div class="mg-script" id="mgLog"></div>` +
        `</section>` +
      `</main>` +
    `</div>`;

  $m('mgBack').onclick = closeChat;
  $m('mgReadAll').onclick = () => markRead(UNREAD.slice());
  $m('mgLog').addEventListener('click', e => {
    const b = e.target.closest('[data-read]');
    if (b) markRead([Number(b.dataset.read)]);
  });
  $m('mgRows').addEventListener('click', e => {
    const s = e.target.closest('.mg-btn.s'), v = e.target.closest('.mg-btn.v');
    const m = e.target.closest('.mg-btn.m');
    if (m) {
      const id = m.dataset.m, now = !m.classList.contains('on');
      if (now) armedSend.delete(id);
      if (_ctx && _ctx.send) _ctx.send({ type: 'wp_mute', id, muted: now });
    }
    if (s) { armedSend.has(s.dataset.s) ? armedSend.delete(s.dataset.s) : armedSend.add(s.dataset.s); syncButtons(); }
    if (v) { armedView.has(v.dataset.v) ? armedView.delete(v.dataset.v) : armedView.add(v.dataset.v); syncButtons(); renderCards(); }
  });
  el.querySelectorAll('[data-all-send]').forEach(b => b.onclick = () => {
    armedSend.clear();
    if (b.dataset.allSend === '1') tracks().forEach(t => { if (!t.muted) armedSend.add(t.id); });
    syncButtons();
  });
  el.querySelectorAll('[data-all-view]').forEach(b => b.onclick = () => {
    const meta = [HARNESS_KEY, CAPTAIN_KEY].filter(k => armedView.has(k));
    armedView.clear(); if (b.dataset.allView === '1') tracks().forEach(t => armedView.add(t.id));
    meta.forEach(k => armedView.add(k));
    syncButtons(); renderCards();
  });
  function _sendCompose() {
    const input = $m('mgInput');
    const body = (input.value || '').trim();
    if (!body || !armedSend.size) return;
    if (_ctx && _ctx.send) _ctx.send({ type: 'wp_send', to: [...armedSend], body });
    input.value = '';
  }
  $m('mgSend').onclick = _sendCompose;
  $m('mgInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendCompose(); }
  });

  refresh();
}
export function rosterChanged() {
  if (!_host || !$m('mgRows')) return;
  rebuildRoster(); renderRows(); syncButtons();
}
export function refresh() {
  rebuildRoster(); renderRows(); syncButtons(); renderCards();
  if (_ctx && _ctx.send) _ctx.send({ type: 'wp_feed' });
}
export function onFrame(m) {
  if (!m || m.type !== 'wp_feed') return;
  LINES  = m.lines  || [];
  COUNTS = m.counts || {};
  rebuildRoster(); renderRows(); syncButtons(); renderCards(); refreshChat();
}
export function onEsc() {
  const ch = $m('mgChat');
  if (ch && ch.classList.contains('on')) { closeChat(); return true; }
  return false;
}
