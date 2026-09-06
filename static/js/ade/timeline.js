
'use strict';

import { settle } from './queuelog.js';
import { openLedgerWindow } from './ledgerview.js';

let _send = null;
let _getTracks = null;
let _getTrackRows = null;
let _nameOf = null;
let _setFocus = null;
let _editTrack = null;
let _addTrack = null;
let _addRegion = null;

let _heads = null;
let _rows = null;
let _ruler = null;
let _right = null;

let _turns = [];
let _actions = [];
let _openRegion = null;
let _ctxRegion = null;
let _menu = null;
let _settingsClip = null;
let _editing = null;
let _showEnded = false;
let _showPlayhead = false;
let _addPhase = false;
let _refreshMin = 5;
let _refreshTimer = null;

const ZOOM_KEY = 'ade_tl_zoom';
const ZOOM_DEFAULT = 2.5;
function loadZoom() {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY));
    return (isFinite(v) && v > 0) ? v : ZOOM_DEFAULT;
  } catch (e) { return ZOOM_DEFAULT; }
}
function saveZoom(v) {
  try { localStorage.setItem(ZOOM_KEY, String(v)); } catch (e) {}
}
let _zoom = loadZoom();

const PX_PER_MIN = 26;
function pxPerMin() { return PX_PER_MIN * _zoom; }

function esc(s) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
function isClaudeModel(model) { return CLAUDE_MODELS.includes(model); }

function cacheTtlToggle(t) {
  const wrap = document.createElement('span');
  wrap.className = 'tl-ttl';
  wrap.style.display = 'inline-flex';
  wrap.style.gap = '3px';
  wrap.style.flexShrink = '0';
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





function rootLine(tr) {
  const d = document.createElement('div');
  d.className = 'th-root';
  const row  = tr.track || null;
  const root = (row && row.root) || '';
  if (root) {
    const parts = String(root).split('/').filter(Boolean);
    d.textContent = (parts.length > 2 ? '…/' : '/') + parts.slice(-2).join('/');
    d.title = root;
  } else {
    d.className += ' empty';
    d.textContent = 'no root of its own — workspace default';
    d.title = 'this lane has no root set, so it runs wherever the workspace '
            + 'default points at the time it runs';
  }
  if (tr.track) {
    d.classList.add('th-edit');
    d.title = (d.title ? d.title + '\n\n' : '') + 'click to pick a folder';
    d.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openRootBrowser((val) => {
        _send({ type: 'edit_track', track: tr.track.id, fields: { root: val } });
      });
    });
  }
  return d;
}

function openRootBrowser(commit) {
  const stale = document.querySelector('.tl-rootmodal');
  if (stale) stale.remove();

  const ov = document.createElement('div');
  ov.className = 'ts-ctxmodal tl-rootmodal';
  const box = document.createElement('div');
  box.className = 'ts-ctxbox';
  const head = document.createElement('div');
  head.className = 'ts-ctxhead';
  const h3 = document.createElement('h3');
  h3.textContent = 'Agent root';
  head.appendChild(h3);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ts-ctxx';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  head.appendChild(closeBtn);
  box.appendChild(head);
  const sub = document.createElement('div');
  sub.className = 'ts-ctxsub';
  sub.textContent = 'Browse the filesystem and pick a folder. Select copies '
    + 'the path into root — nothing else changes; the server still '
    + 'validates it on submit.';
  box.appendChild(sub);
  const body = document.createElement('div');
  body.className = 'ts-ctxbody';
  box.appendChild(body);
  ov.appendChild(box);
  document.body.appendChild(ov);

  const pathLine = document.createElement('div');
  pathLine.className = 'ts-rootpath mono';
  const listBox = document.createElement('div');
  listBox.className = 'ts-rootlist';
  const selectRow = document.createElement('div');
  selectRow.className = 'ts-popbtnrow';
  const selectBtn = document.createElement('button');
  selectBtn.className = 'ts-ctxbtn';
  selectBtn.type = 'button';
  selectBtn.textContent = 'Select';
  selectRow.appendChild(selectBtn);
  body.appendChild(pathLine);
  body.appendChild(listBox);
  body.appendChild(selectRow);

  let browsePath = '/';
  const parentOf = (p) => {
    const trimmed = p.replace(/\/+$/, '');
    const idx = trimmed.lastIndexOf('/');
    return idx > 0 ? trimmed.slice(0, idx) : '/';
  };
  const joinPath = (base, name) => (base === '/' ? '/' + name : base + '/' + name);

  function scopeLine(text) {
    const s = document.createElement('div');
    s.className = 'ts-gscope';
    s.textContent = text;
    return s;
  }

  function loadDirs(path) {
    pathLine.textContent = path;
    listBox.innerHTML = '';
    listBox.appendChild(scopeLine('loading…'));
    fetch('/api/fs/browse?path=' + encodeURIComponent(path))
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          listBox.innerHTML = '';
          listBox.appendChild(scopeLine(data.error));
          return;
        }
        browsePath = data.path || path;
        pathLine.textContent = browsePath;
        listBox.innerHTML = '';
        if (browsePath !== '/') {
          const up = document.createElement('div');
          up.className = 'ts-rootitem';
          up.textContent = '.. (up one level)';
          up.addEventListener('click', () => loadDirs(parentOf(browsePath)));
          listBox.appendChild(up);
        }
        const dirs = Array.isArray(data.dirs) ? data.dirs : [];
        if (!dirs.length) listBox.appendChild(scopeLine('no subfolders'));
        for (const name of dirs) {
          const item = document.createElement('div');
          item.className = 'ts-rootitem';
          item.textContent = name;
          item.addEventListener('click', () => loadDirs(joinPath(browsePath, name)));
          listBox.appendChild(item);
        }
      })
      .catch(() => {
        listBox.innerHTML = '';
        listBox.appendChild(scopeLine('browse failed'));
      });
  }

  let onKey = null;
  function close() {
    ov.classList.remove('show');
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    ov.remove();
  }
  onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  closeBtn.addEventListener('click', close);
  selectBtn.addEventListener('click', () => {
    commit(browsePath);
    close();
  });

  loadDirs('/');
  ov.classList.add('show');
}




function inlineEdit(el, value, commit, hint) {
  el.classList.add('th-edit');
  el.title = (el.title ? el.title + '\n\n' : '') + 'click to edit';
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (_editing) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'th-input';
    inp.value = value || '';
    if (hint) inp.placeholder = hint;
    const held = el.textContent;
    el.textContent = '';
    el.appendChild(inp);
    _editing = inp;
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      _editing = null;
      const next = inp.value.trim();
      el.textContent = held;
      if (save && next && next !== (value || '')) {
        commit(next);
        refresh();
      }
    };
    inp.addEventListener('keydown', (kev) => {
      kev.stopPropagation();
      if (kev.key === 'Enter') { kev.preventDefault(); finish(true); }
      else if (kev.key === 'Escape') { kev.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', (cev) => cev.stopPropagation());
    inp.addEventListener('contextmenu', (cev) => cev.stopPropagation());
    inp.focus();
    inp.select();
  });
}

function snapshotRegionSettings(r) {
  const settings = Object.assign({}, r.settings || {});
  delete settings.name;
  return {
    settings,
    model:      r.model || '',
    seat:       r.seat || '',
    root:       r.root || '',
    provider:   r.provider || '',
    loop_class: r.loop_class || '',
    mechanism:  r.mechanism || '',
    overlay:    (Array.isArray(r.overlay) && r.overlay.length) ? r.overlay : null,
  };
}

function clipEditFields(c) {
  const out = Object.assign({}, c.settings);
  if (c.model) out.model = c.model;
  out.seat = c.seat;
  if (c.root) out.root = c.root;
  if (c.provider) out.provider = c.provider;
  if (c.loop_class) out.loop_class = c.loop_class;
  if (c.mechanism) out.mechanism = c.mechanism;
  if (c.overlay) out.overlay = c.overlay;
  return out;
}

function clipInsertFrame(c, containerId) {
  const region = {};
  if (c.model) region.model = c.model;
  if (c.seat) region.seat = c.seat;
  if (c.root) region.root = c.root;
  if (c.provider) region.provider = c.provider;
  if (c.loop_class) region.loop_class = c.loop_class;
  if (c.mechanism) region.mechanism = c.mechanism;
  if (c.overlay) region.overlay_rows = c.overlay;
  return {
    type:     'insert_region',
    track:    containerId,
    region,
    settings: Object.assign({}, c.settings),
  };
}



function openTrackMenu(ev, tr) {
  if (!_menu) return;
  ev.preventDefault();
  ev.stopPropagation();
  closeTrackMenu();
  const items = [];
  if (tr.track) {
    items.push(['⧉ duplicate region to new track', () => {
      _send({ type: 'duplicate_region', region: tr.track.id });
      refresh();
    }]);
    items.push(['✎ edit region', () => {
      if (_editTrack) _editTrack(_freshRow(tr.track));
    }]);
    items.push(['⎘ copy region settings', () => {
      const src = _freshRow(tr.track);
      _settingsClip = { from: src.name || src.id, snap: snapshotRegionSettings(src) };
    }]);
    if (_settingsClip) {
      items.push(['📋 paste settings from ' + _settingsClip.from, () => {
        if (!_settingsClip) return;
        _send({ type: 'edit_track', track: tr.track.id,
                fields: clipEditFields(_settingsClip.snap) });
        refresh();
      }]);
    }
    items.push(['↺ reset region', () => {
      if (!window.confirm(`Reset region "${tr.name || tr.track.id}"?\n\n`
        + 'Kills its transcript and context and brings back a new region on '
        + 'the same track — same settings, new id. Cannot be undone.')) return;
      _send({ type: 'reset_track', track: tr.track.id });
    }]);
    items.push(['✕ delete region', () => {
      if (!window.confirm(`Delete region "${tr.name || tr.track.id}"?\n\n`
        + 'This kills the running region — cannot be undone.')) return;
      _send({ type: 'kill_track', track: tr.track.id });
      refresh();
    }]);
  }
  if (tr.container && !tr.track) {

    items.push(['＋ insert region…', () => { if (_addRegion) _addRegion(tr.container); }]);

    items.push(['＋ insert region preset', () => openPresetPick(ev.clientX, ev.clientY, tr), true]);
    if (_settingsClip) {
      items.push(['📋 insert region from ' + _settingsClip.from, () => {
        if (!_settingsClip) return;
        _send(clipInsertFrame(_settingsClip.snap, tr.container));
        refresh();
      }]);
    }
  }
  if (tr.container) {
    items.push(['✕ delete track', () => {
      if (!window.confirm('Delete track "' + tr.name + '"?\n\n'
        + 'Kills the region running on it and removes the lane. Cannot be undone.')) return;
      _send({ type: 'delete_track', track: tr.container });
      refresh();
    }]);
  }
  if (!items.length) return;
  items.forEach(([label, act, keepOpen]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', (cev) => {
      cev.stopPropagation();
      if (!keepOpen) closeTrackMenu();
      act();
    });
    _menu.appendChild(b);
  });


  placeMenu(ev.clientX, ev.clientY);
}

function placeMenu(x, y) {
  _menu.style.left = x + 'px';
  _menu.style.top = y + 'px';
  _menu.classList.add('open');
  const r = _menu.getBoundingClientRect();
  const PAD = 6;
  if (r.right > window.innerWidth - PAD) {
    _menu.style.left = Math.max(PAD, window.innerWidth - PAD - r.width) + 'px';
  }
  if (r.bottom > window.innerHeight - PAD) {
    _menu.style.top = Math.max(PAD, window.innerHeight - PAD - r.height) + 'px';
  }
}




function openPresetPick(x, y, tr) {
  if (!_menu) return;
  _menu.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'tl-ctx-head';
  head.textContent = 'insert region · ' + (tr.name || tr.container);
  _menu.appendChild(head);
  const note = document.createElement('button');
  note.type = 'button';
  note.disabled = true;
  note.textContent = 'loading…';
  _menu.appendChild(note);
  placeMenu(x, y);
  fetch('/api/settings/browse?presets=claude')
    .then((r) => r.json())
    .then((data) => {
      const names = Array.isArray(data.names) ? data.names : [];
      note.textContent = '(none saved)';
      if (!names.length) { placeMenu(x, y); return; }
      note.remove();
      for (const n of names) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = n;
        b.addEventListener('click', (cev) => {
          cev.stopPropagation();
          closeTrackMenu();
          _send({
            type:    'insert_region',
            track:   tr.container,
            presets: n,
          });
          refresh();
        });
        _menu.appendChild(b);
      }
      placeMenu(x, y);
    })
    .catch(() => { note.textContent = 'list failed'; placeMenu(x, y); });
}

function closeTrackMenu() {
  if (!_menu) return;
  _menu.classList.remove('open');
  _menu.innerHTML = '';
}

const SYM = {
  read: 'R', list: 'L', write: 'W', run: '$', boundary: '↗', fetch: 'F',
  screen: '◎', remember: '✎', recall: '⌕', logic: '♪', web: '◐',
  user_action: '●', gate: '?',
};
function symFor(a) {
  const edge = String(a.edge || '').replace(/^approve_/, '');
  if (SYM[edge]) return SYM[edge];
  if (edge.indexOf('logic') >= 0) return SYM.logic;
  if (edge.indexOf('web') >= 0) return SYM.web;
  if (SYM[a.action_type]) return SYM[a.action_type];
  return '?';
}

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

const SEVERITY = { white: 0, green: 1, blue: 2, yellow: 3, red: 4 };
function regionColor(actions) {
  let worst = 'white';
  for (const a of actions) {
    const c = gateColor(a);
    if (SEVERITY[c] > SEVERITY[worst]) worst = c;
  }
  return worst;
}

const SEVERITY_ORDER = ['white', 'green', 'blue', 'yellow', 'red'];
function clusterGradient(colorList) {
  const present = SEVERITY_ORDER.filter((c) => colorList.includes(c));
  if (present.length < 2) return null;
  return 'linear-gradient(90deg, ' + present.map((c) => `var(--fill-${c})`).join(', ') + ')';
}
const RNAME_MIN_PX = 60;

function regionLabel(actions) {
  const pending = actions.find((a) => isPending(a));
  if (pending) return 'waiting on you';
  const denied = actions.some((a) => gateColor(a) === 'red');
  if (denied) return 'denied';
  return '';
}

function settleHtml(a) {
  return '<div class="ql-settle">' +
    '<span class="sq-q">' + esc(a.edge || a.action_type || '') + ' ' + esc(getTarget(a)) + ' — waiting on you</span>' +
    '<button class="sbtn approve" data-settle="approve">approve</button>' +
    '<button class="sbtn deny" data-settle="deny">deny</button>' +
    '<button class="sbtn queue" data-settle="queue">queue</button>' +
  '</div>';
}

function _freshRow(snap) {
  if (!snap || !_getTracks) return snap;
  const live = (_getTracks() || []).find((r) => r && r.id === snap.id);
  return live || snap;
}

export function mount(el, ctx) {
  _send = ctx.send;
  _getTracks = ctx.getTracks;
  _getTrackRows = ctx.getTrackRows;
  _nameOf = ctx.nameOf;
  _setFocus = ctx.setFocus;
  _editTrack = ctx.editTrack;
  _addTrack = ctx.addTrack;
  _addRegion = ctx.addRegion;
  el.innerHTML =
    '<div id="tlScroll">' +
      '<div id="tlHeads"><div class="ruler-pad">' +
        '<label class="tl-endtoggle"><input type="checkbox" id="tlShowEnded"> show ended</label>' +
        '<label class="tl-endtoggle"><input type="checkbox" id="tlPlayhead"> playhead</label>' +
        '<label class="tl-endtoggle"><input type="checkbox" id="tlAddPhase"> add phase</label>' +
        '<label class="tl-refresh">refresh every ' +
          '<input type="number" id="tlRefreshMin" min="1" step="1" value="' + _refreshMin + '"> min</label>' +
        '<span class="tl-zoom" title="timeline zoom">' +
          '<button class="tb-btn" id="tlZoomOut" type="button">−</button>' +
          '<span class="tl-zoomlbl" id="tlZoomLbl"></span>' +
          '<button class="tb-btn" id="tlZoomIn" type="button">+</button>' +
        '</span>' +
      '</div>' +
      '<div id="tlHeadRows"></div>' +
      '<div id="tlHeadActions">' +
        '<button class="tb-btn" id="tlAddTrack">+ add track</button>' +
        '<button class="tb-btn" id="tlAddRegion">+ add region</button>' +
      '</div></div>' +
      '<div class="split v" id="tlSplit" data-split="tlheads"></div>' +
      '<div id="tlRight"><div id="tlRuler"></div><div id="tlRows"></div></div>' +
    '</div>' +
    '<div id="tlCtxMenu"></div>';
  _heads = el.querySelector('#tlHeadRows');
  _rows = el.querySelector('#tlRows');
  _ruler = el.querySelector('#tlRuler');
  _right = el.querySelector('#tlRight');
  _menu = el.querySelector('#tlCtxMenu');
  el.addEventListener('click', (ev) => {
    if (_menu && _menu.contains(ev.target)) return;
    closeTrackMenu();
  }, true);
  el.querySelector('#tlShowEnded').addEventListener('change', (ev) => {
    _showEnded = ev.target.checked;
    render();
  });
  el.querySelector('#tlPlayhead').addEventListener('change', (ev) => {
    _showPlayhead = ev.target.checked;
    render();
  });
  el.querySelector('#tlAddPhase').addEventListener('change', (ev) => {
    _addPhase = ev.target.checked;
  });
  el.querySelector('#tlRefreshMin').addEventListener('change', (ev) => {
    const n = Number(ev.target.value);
    _refreshMin = Number.isFinite(n) && n > 0 ? n : _refreshMin;
    ev.target.value = _refreshMin;
    startRefreshTimer();
    refresh();
  });
  const ZOOM_MIN = 0.25, ZOOM_MAX = 6, ZOOM_STEP = 1.25;
  function paintZoom() {
    const lbl = el.querySelector('#tlZoomLbl');
    if (lbl) lbl.textContent = Math.round(_zoom * 100) + '%';
  }
  function setZoom(v) {
    _zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
    saveZoom(_zoom);
    paintZoom();
    render();
  }
  el.querySelector('#tlZoomOut').addEventListener('click', () => setZoom(_zoom / ZOOM_STEP));
  el.querySelector('#tlZoomIn').addEventListener('click', () => setZoom(_zoom * ZOOM_STEP));
  paintZoom();
  el.querySelector('#tlAddTrack').addEventListener('click', () => { if (_addTrack) _addTrack(); });
  el.querySelector('#tlAddRegion').addEventListener('click', () => { if (_addRegion) _addRegion(); });
  startRefreshTimer();
  render();
}

function startRefreshTimer() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(refresh, _refreshMin * 60000);
}

export function refresh() {
  if (_send) _send({ type: 'feed' });
}

export function onFrame(msg) {
  if (!msg || msg.type !== 'feed') return;
  const all = msg.records || [];
  _turns = all.filter((r) => r.kind === 'turn');
  _actions = all.filter((r) => r.kind === 'action')
    .filter((r) => !(r.action_type === 'gate' && r.merged))
    .map((r) => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
  render();
}

export function onEsc() {
  const menuOpen = !!(_menu && _menu.classList.contains('open'));
  if (_openRegion == null && _ctxRegion == null && !menuOpen) return false;
  _openRegion = null;
  _ctxRegion = null;
  closeTrackMenu();
  render();
  return true;
}


function regionOf(r) {
  if (!r) return null;
  if (r.region != null) return r.region;
  return r.schema === 1 ? r.track : null;
}

function containerOf(r) { return (r && r.track != null) ? r.track : null; }

function turnKey(track, turn) { return track + '#' + turn; }

function groupActions() {
  const matched = new Map();
  const stray = [];
  const unassigned = [];
  for (const a of _actions) {
    const ar = regionOf(a);
    if (ar == null) { unassigned.push(a); continue; }
    if (a.turn == null) { stray.push(a); continue; }
    const k = turnKey(ar, a.turn);
    if (!matched.has(k)) matched.set(k, []);
    matched.get(k).push(a);
  }
  const turnKeys = new Set(_turns.map((t) => turnKey(regionOf(t), t.turn)));
  const inflight = [];
  matched.forEach((acts, k) => {
    if (!turnKeys.has(k)) inflight.push({ key: k, track: regionOf(acts[0]), turn: acts[0].turn, actions: acts });
  });
  return { matched, stray, unassigned, inflight };
}

function xOf(originMs, ms) { return ((ms - originMs) / 60000) * pxPerMin(); }
function wOf(durationMs) { return Math.max((durationMs / 60000) * pxPerMin(), 30); }
function hhmm(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function wireSettle(pop, action) {
  pop.addEventListener('click', (ev) => ev.stopPropagation());
  pop.querySelectorAll('[data-settle]').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      settle(action.id, b.dataset.settle);
      _openRegion = null;
      render();
      refresh();
    });
  });
}

function render() {
  if (!_rows) return;
  closeTrackMenu();
  _editing = null;
  const regions = _getTracks() || [];
  const trackRows = (_getTrackRows && _getTrackRows()) || [];
  const g = groupActions();

  if (!trackRows.length && !_turns.length && !g.inflight.length && !g.stray.length && !g.unassigned.length) {
    _heads.innerHTML = '';
    _ruler.innerHTML = '';
    _rows.innerHTML = '<div class="empty">no turns this session — message a track</div>';
    const old = _right.querySelector('#playhead');
    if (old) old.remove();
    return;
  }

  let origin = Infinity;
  for (const t of _turns) if (t.started != null && t.started < origin) origin = t.started;
  for (const a of _actions) if (a.parked != null && a.parked < origin) origin = a.parked;
  if (!isFinite(origin)) origin = Date.now();
  const now = Date.now();
  const spanMs = Math.max(now - origin, 60000) + 4 * 60000;
  const xAt = (ms) => xOf(origin, ms);

  const W = xAt(origin + spanMs);
  _ruler.innerHTML = '';
  _ruler.style.width = W + 'px';
  for (let m = 0; m * 60000 <= spanMs; m += 5) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = xAt(origin + m * 60000) + 'px';
    tick.textContent = hhmm(origin + m * 60000);
    _ruler.appendChild(tick);
  }

  _heads.innerHTML = '';
  _rows.innerHTML = '';
  _rows.style.width = W + 'px';


  function makeRegionSpan(regionId, turns, inflightEntry, liveTrack, laneName) {
    let start = Infinity, end = -Infinity;
    const actionsAll = [];
    turns.slice().sort((a, b) => a.started - b.started).forEach((t) => {
      if (t.started < start) start = t.started;
      const te = (t.ended != null && t.ended >= t.started) ? t.ended : t.started;
      if (te > end) end = te;
      actionsAll.push(...(g.matched.get(turnKey(regionId, t.turn)) || []));
    });
    if (inflightEntry) {
      for (const a of inflightEntry.actions) if (a.parked != null && a.parked < start) start = a.parked;
      if (now > end) end = now;
      actionsAll.push(...inflightEntry.actions);
    }
    if (!isFinite(start)) return null;

    const waiting = actionsAll.some((a) => gateColor(a) === 'yellow');
    const pending = actionsAll.find((a) => isPending(a));
    const el = document.createElement('div');
    el.className = 'region tl-span ' + (waiting ? 'yellow' : 'white') +
      (inflightEntry ? ' inflight' : '') +
      (_openRegion === regionId ? ' settling' : '');
    el.style.left = xAt(start) + 'px';
    el.style.width = wOf(end - start) + 'px';
    el.innerHTML = '<span class="rlab">' + regionLabel(actionsAll) + '</span>';



    const rname = _nameOf ? _nameOf(regionId) : regionId;
    if (rname && wOf(end - start) >= RNAME_MIN_PX) {
      const layer = document.createElement('div');
      layer.className = 'rname-layer';
      layer.innerHTML = '<span class="rname">' + esc(rname) + '</span>';
      el.appendChild(layer);
    }

    el.addEventListener('click', () => openLedgerWindow({ track: regionId }));

    const isLive = liveTrack && liveTrack.id === regionId;
    if (isLive) {
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        _ctxRegion = (_ctxRegion === regionId) ? null : regionId;
        render();
      });
      if (_ctxRegion === regionId) {
        const menu = document.createElement('div');
        menu.className = 'region-ctxmenu';
        menu.addEventListener('click', (ev) => ev.stopPropagation());
        menu.innerHTML =
          '<button data-act="edit">&#9998; edit settings</button>' +
          '<button data-act="delete">&#10005; delete region</button>';
        menu.querySelector('[data-act="edit"]').addEventListener('click', () => {
          _ctxRegion = null;
          if (_editTrack) _editTrack(_freshRow(liveTrack));
          render();
        });
        menu.querySelector('[data-act="delete"]').addEventListener('click', () => {
          _ctxRegion = null;
          if (!window.confirm(`Delete region "${laneName || regionId}"?\n\nThis kills the running region — cannot be undone.`)) {
            render();
            return;
          }
          _send({ type: 'kill_track', track: liveTrack.id });
        });
        el.appendChild(menu);
      }
    }

    if (actionsAll.length) {
      const MARK_GAP = 23;
      const points = actionsAll
        .map((a) => ({ a, x: xOf(start, a.parked != null ? a.parked : start) }))
        .sort((p, q) => p.x - q.x);
      const clusters = [];
      let lastX = -Infinity;
      points.forEach((p) => {
        const cur = clusters[clusters.length - 1];
        if (cur && p.x - lastX < MARK_GAP) cur.items.push(p.a);
        else clusters.push({ x: p.x, items: [p.a] });
        lastX = p.x;
      });
      clusters.forEach((cl) => {
        const m = document.createElement('span');
        m.style.left = cl.x + 'px';
        if (cl.items.length === 1) {
          const a = cl.items[0];
          m.className = 'pip ' + gateColor(a) + ' tl-actionmark';
          m.textContent = symFor(a);
          m.title = (a.edge || a.action_type || '') + ' ' + getTarget(a);
          m.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openLedgerWindow({ track: regionId, turn: a.turn });
          });
        } else {
          const worst = regionColor(cl.items);
          const grad = clusterGradient(cl.items.map(gateColor));
          m.className = 'pip ' + worst + ' tl-actionmark tl-cluster';
          if (grad) m.style.backgroundImage = grad;
          m.textContent = String(cl.items.length);
          m.title = cl.items.length + ' actions — click to view';
          m.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openLedgerWindow({ track: regionId });
          });
        }
        el.appendChild(m);
      });
    } else {
      const m = document.createElement('span');
      m.className = 'pip white tl-actionmark';
      m.style.left = '10px';
      m.textContent = '·';
      m.title = 'no actions recorded this run';
      el.appendChild(m);
    }

    if (pending) {
      const marker = document.createElement('span');
      marker.className = 'pip yellow tl-marker';
      marker.textContent = '!';
      marker.title = 'waiting on you — click to settle';
      marker.addEventListener('click', (ev) => {
        ev.stopPropagation();
        _openRegion = (_openRegion === regionId) ? null : regionId;
        render();
      });
      el.appendChild(marker);
      if (_openRegion === regionId) {
        const pop = document.createElement('div');
        pop.className = 'region-settle';
        pop.innerHTML = settleHtml(pending);
        wireSettle(pop, pending);
        el.appendChild(pop);
      }
    }
    return el;
  }

  const liveIds = new Set(regions.map((r) => r.id));
  const deadIds = [];
  const seenDead = new Set();
  for (const t of _turns) {
    const r = regionOf(t);
    if (r != null && !liveIds.has(r) && !seenDead.has(r)) {
      seenDead.add(r); deadIds.push(r);
    }
  }
  for (const a of _actions) {
    const r = regionOf(a);
    if (r != null && !liveIds.has(r) && !seenDead.has(r)) {
      seenDead.add(r); deadIds.push(r);
    }
  }

  const regionsByTrack = new Map();
  const multiRegionTracks = new Set();
  for (const r of regions) {
    if (r.track == null) continue;
    if (regionsByTrack.has(r.track)) {
      multiRegionTracks.add(r.track);
      console.error('[timeline] invariant violated — track ' + r.track +
        ' carries more than one region:', regionsByTrack.get(r.track).id, r.id);
    } else {
      regionsByTrack.set(r.track, r);
    }
  }

  const containerOfRegion = new Map();
  for (const r of regions) if (r.track != null) containerOfRegion.set(r.id, r.track);
  for (const rid of deadIds) {
    if (containerOfRegion.has(rid)) continue;
    let found = null;
    for (const t of _turns) { if (regionOf(t) === rid && containerOf(t) != null) { found = containerOf(t); break; } }
    if (found == null) for (const a of _actions) { if (regionOf(a) === rid && containerOf(a) != null) { found = containerOf(a); break; } }
    if (found != null) containerOfRegion.set(rid, found);
  }
  const unattributedDeadIds = deadIds.filter((id) => !containerOfRegion.has(id));
  const runsByContainer = new Map();
  containerOfRegion.forEach((cid, rid) => {
    if (!runsByContainer.has(cid)) runsByContainer.set(cid, []);
    runsByContainer.get(cid).push(rid);
  });

  const lanes = trackRows
    .map((t) => {
      const reg = regionsByTrack.get(t.id) || null;
      const runs = runsByContainer.get(t.id) || [];
      const lastRun = runs.length ? runs[runs.length - 1] : null;
      return {
        id: reg ? reg.id : t.id,
        container: t.id,
        name: t.name || t.id,
        reg_name: reg ? (reg.name || reg.id)
                      : (lastRun && _nameOf ? _nameOf(lastRun) : ''),
        reg_ended: !reg,
        sub: reg ? (reg.model || '') : '',
        track: reg,
        flagged: multiRegionTracks.has(t.id),
        regionIds: runs.length ? runs : (reg ? [reg.id] : []),
      };
    })
    .concat(_showEnded ? unattributedDeadIds.map((id) =>
      ({ id, container: null, name: (_nameOf ? _nameOf(id) : id), reg_name: 'no track',
         reg_ended: true, sub: 'ended', track: null, flagged: false, regionIds: [id] })) : []);

  lanes.forEach((tr) => {
    const h = document.createElement('div');
    h.className = 'tl-head';
    const top = document.createElement('div');
    top.className = 'th-top';
    const txt = document.createElement('div');
    txt.className = 'th-txt';

    const nameEl = document.createElement('div');
    nameEl.className = 'th-name';
    nameEl.textContent = tr.name;
    nameEl.title = tr.name;
    if (tr.container) {
      inlineEdit(nameEl, tr.name, (val) => {
        _send({ type: 'edit_track_row', track: tr.container, fields: { name: val } });
      }, 'track name');
    }
    txt.appendChild(nameEl);

    const regEl = document.createElement('div');
    regEl.className = 'th-reg' + (tr.reg_ended ? ' empty' : '');
    regEl.textContent = tr.reg_name || 'no region';
    regEl.title = tr.reg_name || 'no region';
    if (tr.track) {
      inlineEdit(regEl, tr.reg_name || '', (val) => {
        _send({ type: 'edit_track', track: tr.track.id, fields: { name: val } });
      }, 'region name');
    }
    txt.appendChild(regEl);

    const subEl = document.createElement('div');
    subEl.className = 'th-sub';
    subEl.textContent = tr.sub;
    subEl.title = tr.sub;
    txt.appendChild(subEl);

    top.appendChild(txt);
    if (tr.flagged) {
      const warn = document.createElement('span');
      warn.className = 'tl-warn';
      warn.title = 'more than one region on this track — only the first is shown';
      warn.textContent = '⚠ multiple regions';
      top.appendChild(warn);
    }
    h.appendChild(top);
    if (tr.track) {
      if (isClaudeModel(tr.track.model)) top.appendChild(cacheTtlToggle(tr.track));
      if (isClaudeModel(tr.track.model)) top.appendChild(excludeDynamicToggle(tr.track));
    }
    h.appendChild(rootLine(tr));
    h.addEventListener('contextmenu', (ev) => openTrackMenu(ev, tr));
    _heads.appendChild(h);

    const row = document.createElement('div');
    row.className = 'tl-row';

    tr.regionIds.forEach((rid) => {
      const noStart = [];
      const turnsForRegion = _turns.filter((t) => {
        if (regionOf(t) !== rid) return false;
        if (t.started == null) { noStart.push(t); return false; }
        return true;
      });
      const inflightForRegion = g.inflight.find((ig) => ig.track === rid) || null;
      const spanEl = makeRegionSpan(rid, turnsForRegion, inflightForRegion, tr.track, tr.name);
      if (spanEl) row.appendChild(spanEl);

      noStart.forEach((t) => {
        const tick = document.createElement('div');
        tick.className = 'tl-tick';
        tick.style.left = xAt(t.ended != null ? t.ended : now) + 'px';
        tick.title = 'turn ' + (t.turn == null ? '?' : t.turn) + ' — no start time recorded';
        tick.addEventListener('click', (ev) => { ev.stopPropagation(); openLedgerWindow({ track: rid, turn: t.turn }); });
        row.appendChild(tick);
      });

      g.stray.filter((a) => regionOf(a) === rid).forEach((a) => {
        const tick = document.createElement('div');
        tick.className = 'tl-tick';
        tick.style.left = xAt(a.parked != null ? a.parked : now) + 'px';
        tick.title = (a.edge || a.action_type || '') + ' ' + getTarget(a);
        tick.addEventListener('click', (ev) => { ev.stopPropagation(); openLedgerWindow({ track: rid }); });
        row.appendChild(tick);
      });
    });

    _rows.appendChild(row);
  });

  if (g.unassigned.length) {
    const h = document.createElement('div');
    h.className = 'tl-head';
    h.innerHTML =
      '<div class="th-top"><div class="th-txt">' +
        '<div class="th-name">unassigned</div>' +
        '<div class="th-reg empty">no region</div>' +
        '<div class="th-sub">no track</div>' +
      '</div></div>' +
      '<div class="th-root empty" title="these records name no track, so there '
        + 'is no root to state">no root — records with no track</div>';
    _heads.appendChild(h);

    const row = document.createElement('div');
    row.className = 'tl-row';
    g.unassigned.forEach((a) => {
      const tick = document.createElement('div');
      tick.className = 'tl-tick';
      tick.style.left = xAt(a.parked != null ? a.parked : now) + 'px';
      tick.title = (a.edge || a.action_type || '') + ' ' + getTarget(a);
      tick.addEventListener('click', (ev) => { ev.stopPropagation(); openLedgerWindow({}); });
      row.appendChild(tick);
    });
    _rows.appendChild(row);
  }

  const old = _right.querySelector('#playhead');
  if (old) old.remove();
  if (_showPlayhead) {
    const ph = document.createElement('div');
    ph.id = 'playhead';
    ph.style.left = xAt(now) + 'px';
    _right.appendChild(ph);
  }
}
