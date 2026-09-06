// conference.js — Conference room UI.
// Mounted by shell.js when ?room=1 is in the URL.
// Owns: transcript column, participants panel, mode selector, input bar.
// Gate modal and sessions panel stay in shell.js (shared infrastructure).

import { wireKillswitch } from '../killswitch.js';
import { shouldConfirm } from '../globalflags.js';

let _ctx         = null;   // { send, answerGate }
let _root        = null;   // the #conference-root element
let _log         = null;   // transcript scroll container
let _partList    = null;   // participant list ul
let _historyList = null;   // gate history ul
let _modeBtn     = null;   // mode dropdown button
let _msg         = null;   // textarea
let _sendBtn     = null;
let _stopBtn     = null;
let _rtStrip     = null;   // round-table settings strip (turns / delay)

// Room state (mirrors server)
let _participants = [];
let _mode        = "dictate";
let _statuses    = {};    // model → "idle"|"working"
let _allModels   = [];    // full model list from server for invite picker
let _gateHistory = [];    // gate event audit log from server
let _currentSpeaker = null; // turn-based mode: current speaker model
let _otherModels = [];      // turn-based mode: list of other claimable models
let _queueBids   = [];      // queue mode: latest bid round's non-PASS bids [{model,nick,bid}]
let _queueHead   = null;    // queue panel header (sidebar)
let _queueList   = null;    // queue panel bid list (sidebar)
let _crewRoster  = [];      // [{nick, tag}, ...] from the `crew_list` frame (engine/compiler.py's
                            // roster_entries()) — same shape settings.js's populateCrew renders.
                            // May still be empty when the add-participant menu opens (menu can
                            // open before the frame lands) — in that window the nick dropdown
                            // has nothing to list and opens straight into the custom-name box.
                            // Reopening the menu once crew_list has landed shows the roster.

const MODE_LABELS = { dictate: "Dictate", "turn-based": "Turn-based", roundtable: "Round-table", reactive: "Reactive", queue: "Queue" };

// ── Model color badges ────────────────────────────────────────────────────────
// Assign a stable hue per model name for labeled transcript entries.
const _hueCache = {};
function modelHue(model) {
  if (!_hueCache[model]) {
    let h = 0;
    for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) & 0xffff;
    _hueCache[model] = (h % 300) + 30;  // 30-330 avoids near-red for "human"
  }
  return _hueCache[model];
}

function modelColor(model) {
  return `hsl(${modelHue(model)}, 55%, 68%)`;
}

// ── Transcript rendering ──────────────────────────────────────────────────────
function _addTranscriptEntry(entry) {
  if (!_log) return;
  const isHuman = entry.role === "user";
  const isControl = entry.role === "control";
  const wrap  = document.createElement("div");
  wrap.className = "room-entry" + (isHuman ? " room-entry-human" : "") + (isControl ? " room-entry-control" : "");
  wrap.dataset.id = entry.id;

  const tag = document.createElement("span");
  tag.className = "room-tag";
  if (isHuman) {
    tag.textContent = "you";
    tag.style.color = "var(--text-2)";
  } else if (isControl) {
    tag.textContent = "turn";
    tag.style.color = "var(--text-3)";
  } else {
    const displayName = entry.nick || entry.model || "model";
    tag.textContent = displayName;
    tag.style.color = modelColor(entry.model);
  }
  wrap.appendChild(tag);

  const body = document.createElement("div");
  body.className = "room-body";

  // For control entries, render buttons instead of text
  if (isControl) {
    // Parse control payload: "CONTROL:" + JSON {speaker, others}. JSON (not a
    // char-delimited string) because model IDs contain ':' and '|', which would
    // collide with any delimiter (e.g. "gemma4:e4b-it-q8_0").
    let parsed = null;
    if (entry.content.startsWith("CONTROL:")) {
      try { parsed = JSON.parse(entry.content.slice(8)); } catch (e) { parsed = null; }
    }
    if (parsed) {
      const current = parsed.speaker;
      const others = parsed.others || [];

      _currentSpeaker = current;
      _otherModels = others;

      // Create button row
      const btnRow = document.createElement("div");
      btnRow.className = "turn-control-row";

      // PASS button
      const passBtn = document.createElement("button");
      passBtn.className = "turn-btn pass";
      passBtn.textContent = "PASS";
      passBtn.onclick = () => _ctx.send({ type: "turn_pass" });
      btnRow.appendChild(passBtn);

      // Claim buttons for other models
      for (const model of others) {
        const claimBtn = document.createElement("button");
        claimBtn.className = "turn-btn claim";
        const nick = _findNick(model);
        claimBtn.textContent = `@${nick}`;
        claimBtn.title = model;
        claimBtn.onclick = () => _ctx.send({ type: "turn_claim", model });
        btnRow.appendChild(claimBtn);
      }

      body.appendChild(btnRow);
    } else {
      body.textContent = entry.content;
    }
  } else {
    body.textContent = entry.content;
  }

  wrap.appendChild(body);

  _log.appendChild(wrap);
  _log.scrollTop = _log.scrollHeight;
}

// Helper to find nick from model name
function _findNick(model) {
  for (const p of _participants) {
    if ((p.model || p) === model) {
      return p.nick || model;
    }
  }
  return model;
}

// Dim system annotation line (agent streaming header, errors)
function _addAnnotation(text) {
  if (!_log) return;
  const span = document.createElement("span");
  span.className = "room-annotation";
  span.textContent = text;
  _log.appendChild(span);
  _log.scrollTop = _log.scrollHeight;
}

// ── Participant panel ─────────────────────────────────────────────────────────
function _renderParticipants() {
  if (!_partList) return;
  _partList.innerHTML = "";
  _participants.forEach((p, i) => {
    const model = p.model || p;  // tolerate plain strings during transition
    const nick  = p.nick  || model;
    const phase = _statuses[model] || "idle";
    const li = document.createElement("li");
    li.className = "room-participant" + (phase !== "idle" ? " busy" : "");

    const dot = document.createElement("span");
    dot.className = "part-dot";
    dot.style.color = modelColor(model);
    dot.textContent = "●";
    li.appendChild(dot);

    const nameWrap = document.createElement("span");
    nameWrap.className = "part-name";

    const nickSpan = document.createElement("span");
    nickSpan.textContent = nick;
    nickSpan.style.color = modelColor(model);
    nameWrap.appendChild(nickSpan);

    if (nick !== model) {
      const idSpan = document.createElement("span");
      idSpan.className = "part-model-id";
      idSpan.textContent = model;
      nameWrap.appendChild(idSpan);
    }

    li.appendChild(nameWrap);

    const status = document.createElement("span");
    status.className = "part-status";
    status.textContent = phase;
    li.appendChild(status);

    // Reorder: round-robin (turn-based/roundtable/queue re-bid) walks
    // self.participants in order server-side, so moving a seat here is the
    // whole fix — just tell the server the new order.
    const up = document.createElement("button");
    up.className = "part-move";
    up.textContent = "↑";
    up.title = "move up";
    up.disabled = i === 0;
    up.onclick = () => _moveParticipant(i, -1);
    li.appendChild(up);

    const down = document.createElement("button");
    down.className = "part-move";
    down.textContent = "↓";
    down.title = "move down";
    down.disabled = i === _participants.length - 1;
    down.onclick = () => _moveParticipant(i, 1);
    li.appendChild(down);

    const rm = document.createElement("button");
    rm.className = "part-remove";
    rm.textContent = "×";
    rm.title = `Remove ${nick}`;
    rm.onclick = () => {
      const fire = () => _ctx.send({ type: "room_remove", model });
      if (shouldConfirm('room_remove') && _ctx.showConfirm) _ctx.showConfirm(`remove ${nick} from the room?`, fire);
      else fire();
    };
    li.appendChild(rm);

    _partList.appendChild(li);
  });
}

// Swap seat i with its neighbor (i+delta) and send the server the full
// ordered model-ID list — JSON, never a delimited string (model IDs contain
// ':' and '|'). The server re-broadcasts room_init with the new order.
function _moveParticipant(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= _participants.length) return;
  const order = _participants.map(p => p.model || p);
  const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  _ctx.send({ type: "room_reorder", order });
}

// ── Mode controls ─────────────────────────────────────────────────
function _renderModeControls() {
  if (_modeBtn) _modeBtn.textContent = MODE_LABELS[_mode] || _mode;
  if (_rtStrip) _rtStrip.style.display = (_mode === "roundtable") ? "flex" : "none";
  _renderQueuePanel();
}

// ── Queue panel (sidebar) ─────────────────────────────────────────────────────
// Shows the latest bid round's non-PASS bids: nick + one-line intent + a
// "call on them" dispatch button. Only visible in queue mode.
function _renderQueuePanel() {
  if (!_queueHead || !_queueList) return;
  const show = _mode === "queue";
  _queueHead.style.display = show ? "flex" : "none";
  _queueList.style.display = show ? "block" : "none";
  if (!show) return;

  _queueList.innerHTML = "";
  if (!_queueBids.length) {
    const li = document.createElement("li");
    li.className = "queue-empty";
    li.textContent = "no bids — send a message, or all seats passed";
    _queueList.appendChild(li);
    return;
  }
  for (const b of _queueBids) {
    const li = document.createElement("li");
    li.className = "queue-bid";

    const name = document.createElement("div");
    name.className = "queue-bid-name";
    name.textContent = b.nick || b.model;
    name.style.color = modelColor(b.model);
    li.appendChild(name);

    const text = document.createElement("div");
    text.className = "queue-bid-text";
    text.textContent = b.bid;
    li.appendChild(text);

    const btn = document.createElement("button");
    btn.className = "queue-dispatch-btn";
    btn.textContent = "call on them";
    btn.onclick = () => _ctx.send({ type: "room_queue_dispatch", model: b.model });
    li.appendChild(btn);

    _queueList.appendChild(li);
  }
}

function _showModeMenu(anchorEl) {
  const menu = _makeDropdown(anchorEl, Object.entries(MODE_LABELS).map(([v, l]) => ({
    label: l, value: v, active: v === _mode,
  })), (v) => _ctx.send({ type: "room_mode", mode: v }));
  return menu;
}

function _suggestNick(model) {
  if (model.includes("claude-")) {
    const m = model.match(/claude-([^-]+)/);
    return m ? m[1] : model;
  }
  if (model.includes("gemini-")) {
    const m = model.match(/gemini-[\d.]+-(.+)/);
    return m ? m[1] : "gemini";
  }
  // "gemma4:26b-mxfp8" → "gemma26b", "qwen3.5:9b-mxfp8" → "qwen9b"
  const m = model.match(/^([a-z]+[\d.]*)[:\-](\w+)/);
  return m ? m[1].replace(/\./g, "") + m[2].replace(/[^a-z0-9]/gi, "") : model;
}

function _showInviteMenu(anchorEl) {
  const taken = new Set(_participants.map(p => p.model || p));
  const available = _allModels.filter(m => !taken.has(m));
  if (!available.length) {
    _addAnnotation("[no additional models available]");
    return;
  }

  document.querySelectorAll(".room-dropdown").forEach(d => d.remove());
  const menu = document.createElement("div");
  menu.className = "room-dropdown";
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + "px";
  menu.style.left = rect.left + "px";

  function showList() {
    menu.innerHTML = "";
    for (const m of available) {
      const btn = document.createElement("button");
      btn.className = "rd-item";
      btn.textContent = m;
      btn.onclick = () => showNickStep(m);
      menu.appendChild(btn);
    }
  }

  function showNickStep(model) {
    menu.innerHTML = "";

    const lbl = document.createElement("div");
    lbl.className = "rd-nick-label";
    lbl.textContent = model;
    menu.appendChild(lbl);

    // Roster dropdown so picking a real persona can't typo into a red shirt
    // (a nick with no roster match — engine/compiler.py's resolve_agent()
    // still seats it fine, just without a persona's backstory/memories, so
    // that's a legitimate choice, not a failure — hence the explicit "custom
    // nickname" option rather than dropping free text entirely).
    // One option per crew_list roster entry, then custom. The old
    // "(none — bare model)" option is gone (Brandon, 2026-07-13) — seating a
    // nameless model was never the intent, and it sat at the TOP where it
    // caught stray Enters.
    const inp = document.createElement("select");
    inp.className = "rd-nick-input";
    _crewRoster.forEach(entry => {
      const o = document.createElement("option");
      o.value = entry.nick;
      o.textContent = `${entry.nick} (${entry.tag})`;
      inp.appendChild(o);
    });
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__";
    customOpt.textContent = "(custom nickname…)";
    inp.appendChild(customOpt);

    const customInp = document.createElement("input");
    customInp.className = "rd-nick-input";
    customInp.placeholder = "nickname";
    customInp.style.display = "none";

    inp.addEventListener("change", () => {
      const isCustom = inp.value === "__custom__";
      customInp.style.display = isCustom ? "" : "none";
      if (isCustom) customInp.focus();
    });

    // Best-effort preselect: if the naming heuristic's suggestion matches a
    // real roster nick, land on it; else the first crew member. With no roster
    // at all, "custom" is the only option left — open straight into the text
    // box rather than show a select the user can't choose anything from.
    const suggested = _suggestNick(model).toLowerCase();
    const match = _crewRoster.find(e => e.nick.toLowerCase() === suggested);
    inp.value = match       ? match.nick
              : _crewRoster.length ? _crewRoster[0].nick
              : "__custom__";
    if (inp.value === "__custom__") customInp.style.display = "";
    menu.appendChild(inp);
    menu.appendChild(customInp);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;padding:4px 8px 6px";

    const back = document.createElement("button");
    back.className = "rd-item";
    back.style.flex = "1";
    back.textContent = "←";
    back.onclick = showList;

    const add = document.createElement("button");
    add.className = "rd-item";
    add.style.flex = "2";
    add.textContent = "add";

    function submit() {
      const nick = inp.value === "__custom__" ? customInp.value.trim() : inp.value;
      // An empty custom box is the last way left to seat a nameless model —
      // hold the menu open instead of quietly seating the bare one we just
      // removed from the list.
      if (!nick) { customInp.focus(); return; }
      _ctx.send({ type: "room_add", model, nick });
      menu.remove();
      document.removeEventListener("click", dismiss, true);
    }

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); submit(); }
      if (e.key === "Escape") { e.preventDefault(); menu.remove(); }
    });
    customInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); submit(); }
      if (e.key === "Escape") { e.preventDefault(); menu.remove(); }
    });
    add.onclick = submit;

    row.appendChild(back);
    row.appendChild(add);
    menu.appendChild(row);

    requestAnimationFrame(() => {
      (inp.value === "__custom__" ? customInp : inp).focus();
    });
  }

  showList();
  document.body.appendChild(menu);
  const mr = menu.getBoundingClientRect();
  if (mr.right > window.innerWidth) {
    menu.style.left = Math.max(0, rect.right - mr.width) + "px";
  }

  const dismiss = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) {
      menu.remove();
      document.removeEventListener("click", dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener("click", dismiss, true), 0);
}

function _makeDropdown(anchor, items, onSelect) {
  // Remove any existing dropdown
  document.querySelectorAll(".room-dropdown").forEach(d => d.remove());
  if (!items.length) return;

  const menu = document.createElement("div");
  menu.className = "room-dropdown";
  const rect = anchor.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + "px";
  menu.style.left = rect.left + "px";

  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = "rd-item" + (item.active ? " rd-active" : "");
    btn.textContent = item.label;
    btn.onclick = () => { onSelect(item.value); menu.remove(); };
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  // Clamp right edge inside viewport after paint so offsetWidth is known.
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    menu.style.left = Math.max(0, rect.right - menuRect.width) + "px";
  }
  const dismiss = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) {
      menu.remove();
      document.removeEventListener("click", dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener("click", dismiss, true), 0);
  return menu;
}

// ── Save / load room ───────────────────────────────────────────────────────────
// Mirrors chat.js's single-model save UX (showPrompt → collision showTriple), but
// targets /api/rooms + the room_save/room_load frames instead of sessions.
function _promptSaveName(ctx) {
  if (!ctx || !ctx.showPrompt) return;
  ctx.showPrompt('save room as:', '', (raw) => {
    const name = raw.replace(/[^\w\-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (name) _doSaveRoom(ctx, name);
  }, null);
}

function _doSaveRoom(ctx, name) {
  fetch('/api/rooms')
    .then(r => r.json())
    .then(d => {
      const exists = (d.list || []).some(s => s.id === name);
      if (exists && ctx.showTriple) {
        ctx.showTriple(
          `room '${name}' already exists`,
          'overwrite', 'keep both', 'cancel',
          () => ctx.send({ type: 'room_save', name }),
          () => ctx.send({ type: 'room_save', name: _nextRoomName(name, d.list || []) }),
          null,
        );
      } else {
        ctx.send({ type: 'room_save', name });
      }
    })
    .catch(() => ctx.send({ type: 'room_save', name }));
}

function _nextRoomName(base, list) {
  const ids = new Set(list.map(s => s.id));
  let n = 2, candidate = `${base}-${n}`;
  while (ids.has(candidate)) { n++; candidate = `${base}-${n}`; }
  return candidate;
}

// Clone of _showInviteMenu — same wrapper class, positioning, and outside-click
// teardown. Swaps: data source is /api/rooms, rows load a saved room on click.
function _showSavedRoomsMenu(anchorEl) {
  document.querySelectorAll(".room-dropdown").forEach(d => d.remove());
  const menu = document.createElement("div");
  menu.className = "room-dropdown";
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + "px";
  menu.style.left = rect.left + "px";

  const loading = document.createElement("div");
  loading.className = "rd-nick-label";
  loading.textContent = "loading…";
  menu.appendChild(loading);

  const dismiss = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) {
      menu.remove();
      document.removeEventListener("click", dismiss, true);
    }
  };

  function place() {
    const mr = menu.getBoundingClientRect();
    if (mr.right > window.innerWidth) {
      menu.style.left = Math.max(0, rect.right - mr.width) + "px";
    }
  }

  fetch('/api/rooms')
    .then(r => r.json())
    .then(d => {
      const list = d.list || [];
      menu.innerHTML = "";
      if (!list.length) {
        const empty = document.createElement("button");
        empty.className = "rd-item";
        empty.disabled = true;
        empty.textContent = "no saved rooms";
        menu.appendChild(empty);
      } else {
        for (const s of list) {
          const btn = document.createElement("button");
          btn.className = "rd-item";
          const parts = (s.participants || []).join(', ');
          btn.textContent = `${s.id}  ·  ${parts}  ·  ${s.mode}`;
          btn.onclick = () => {
            const fire = () => _ctx.send({ type: 'room_load', name: s.id });
            const close = () => { menu.remove(); document.removeEventListener("click", dismiss, true); };
            if (shouldConfirm('room_load') && _ctx.showConfirm) {
              _ctx.showConfirm(`replace current room with '${s.id}'?`, fire, null);
              close();
            } else {
              fire();
              close();
            }
          };
          menu.appendChild(btn);
        }
      }
      place();
    })
    .catch(() => {
      menu.innerHTML = "";
      const err = document.createElement("div");
      err.className = "rd-nick-label";
      err.textContent = "(error loading rooms)";
      menu.appendChild(err);
    });

  document.body.appendChild(menu);
  place();
  setTimeout(() => document.addEventListener("click", dismiss, true), 0);
}

// ── Gate history ──────────────────────────────────────────────────────────────
function _renderGateHistory() {
  if (!_historyList) return;
  _historyList.innerHTML = "";
  const recent = _gateHistory.slice(-20).reverse();
  for (const entry of recent) {
    const approved = entry.answer === "y" || entry.answer === "yes";
    const li = document.createElement("li");
    li.className = "gate-entry " + (approved ? "gate-approved" : "gate-denied");

    // Prompt format is "[label]\n..." — extract the label for display.
    const labelMatch = entry.prompt.match(/^\[([^\]]+)\]/);
    const label = labelMatch ? labelMatch[1] : "agent";

    const ts = new Date(entry.ts);
    const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const result = document.createElement("span");
    result.className = "gh-result";
    result.textContent = approved ? "✓" : "✗";

    const lbl = document.createElement("span");
    lbl.className = "gh-label";
    lbl.textContent = label;

    const time = document.createElement("span");
    time.className = "gh-time";
    time.textContent = timeStr;

    li.appendChild(result);
    li.appendChild(lbl);
    li.appendChild(time);
    _historyList.appendChild(li);
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────
function _submit() {
  const text = _msg ? _msg.value.trim() : "";
  if (!text) return;
  _ctx.send({ type: "user", text });
  if (_msg) _msg.value = "";
}

// ── Frame handler ─────────────────────────────────────────────────────────────
function onFrame(m) {
  if (m.type === "room_init") {
    _participants = m.participants || [];   // [{model, nick}]
    _mode        = m.mode || "dictate";
    _renderParticipants();
    _renderModeControls();
    return;
  }
  if (m.type === "room_entry") {
    _addTranscriptEntry(m.entry);
    return;
  }
  if (m.type === "room_reset") {
    if (_log) _log.innerHTML = "";
    return;
  }
  if (m.type === "room_status") {
    _statuses[m.model] = m.phase;
    _renderParticipants();
    return;
  }
  if (m.type === "out") {
    // Show complete dim lines (agent headers, tool annotations) but not
    // per-token streaming fragments (end="") — those would flood the transcript.
    if (m.dim && m.end !== "") _addAnnotation(m.text);
    return;
  }
  if (m.type === "models") {
    _allModels = m.list || [];
    return;
  }
  if (m.type === "crew_list") {
    // Cache only — mirrors settings.js's _lastCrewMsg pattern. Nothing to
    // re-render here: the roster only feeds the add-participant dropdown,
    // which is (re)built fresh each time that menu opens.
    _crewRoster = m.list || [];
    return;
  }
  if (m.type === "gate_history") {
    _gateHistory = m.entries || [];
    _renderGateHistory();
    return;
  }
  if (m.type === "room_queue") {
    _queueBids = m.bids || [];
    _renderQueuePanel();
    return;
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────────
function mount(container, ctx) {
  _ctx = ctx;
  container.innerHTML = `
    <div id="conference-root">

      <div id="conf-toolbar">
        <span id="conf-title">conference room</span>
        <div id="conf-mode-wrap">
          <span class="conf-label">mode</span>
          <button id="conf-mode-btn" class="conf-ctrl-btn">Human moderates</button>
        </div>
        <div id="conf-rt-strip" style="display:none">
          <label class="conf-label">turns <input id="conf-rt-turns" type="number" min="1" value="5" style="width:3em"></label>
          <label class="conf-label">delay <input id="conf-rt-delay" type="number" min="0" step="0.5" value="0" style="width:3em">s</label>
        </div>
        <div id="conf-save-wrap">
          <button id="conf-save-btn" class="conf-ctrl-btn" title="save this room to disk">save</button>
          <button id="conf-load-btn" class="conf-ctrl-btn" title="reopen a saved room">saved rooms &#9662;</button>
        </div>
      </div>

      <div id="conf-body">
        <div id="conf-transcript"></div>
        <div id="conf-sidebar">
          <div class="sidebar-head">
            participants
            <button id="conf-invite-btn" class="conf-invite">+ invite</button>
          </div>
          <ul id="conf-part-list"></ul>
          <div class="sidebar-hint" id="conf-hint">
            Dictate: type @nickname message<br>
            Turn-based: one at a time; pass or claim<br>
            Round-table: models talk to each other; set turns/delay, stop anytime<br>
            Reactive: everyone replies at once<br>
            Queue: seats bid one-liners; you dispatch the floor
          </div>
          <div class="sidebar-head" id="conf-queue-head" style="display:none">
            queue
            <button id="conf-queue-skip" class="conf-invite" title="dismiss this round's bids">skip round</button>
          </div>
          <ul id="conf-queue-list" style="display:none"></ul>
          <div class="sidebar-head">gate history</div>
          <ul id="conf-gate-history"></ul>
        </div>
      </div>

      <div id="conf-bar">
        <textarea id="conf-msg" placeholder="message the room… (@model to address one)" autocomplete="off" autofocus></textarea>
        <div id="conf-bar-btns">
          <button id="conf-send">send</button>
          <button id="conf-stop">stop</button>
          <button id="conf-kill" title="killswitch — fires /killswitch">kill</button>
        </div>
      </div>

    </div>
  `;

  _root        = container.querySelector("#conference-root");
  _log         = container.querySelector("#conf-transcript");
  _partList    = container.querySelector("#conf-part-list");
  _historyList = container.querySelector("#conf-gate-history");
  _modeBtn     = container.querySelector("#conf-mode-btn");
  _msg         = container.querySelector("#conf-msg");
  _sendBtn     = container.querySelector("#conf-send");
  _stopBtn     = container.querySelector("#conf-stop");
  _rtStrip     = container.querySelector("#conf-rt-strip");
  _queueHead   = container.querySelector("#conf-queue-head");
  _queueList   = container.querySelector("#conf-queue-list");

  const _rtTurns = container.querySelector("#conf-rt-turns");
  const _rtDelay = container.querySelector("#conf-rt-delay");
  const _sendRtConfig = () => _ctx.send({
    type: "room_config",
    max_turns: parseInt(_rtTurns.value, 10) || 5,
    turn_delay: parseFloat(_rtDelay.value) || 0,
  });
  _rtTurns.onchange = _sendRtConfig;
  _rtDelay.onchange = _sendRtConfig;

  _modeBtn.onclick  = () => _showModeMenu(_modeBtn);
  container.querySelector("#conf-invite-btn").onclick = (e) =>
    _showInviteMenu(e.currentTarget);
  container.querySelector("#conf-save-btn").onclick = () => _promptSaveName(_ctx);
  container.querySelector("#conf-load-btn").onclick = (e) => _showSavedRoomsMenu(e.currentTarget);
  container.querySelector("#conf-queue-skip").onclick = () => {
    // Local dismissal only — no server round-trip. The next bid round
    // (after a dispatch, or a fresh seed message) repopulates the panel.
    _queueBids = [];
    _renderQueuePanel();
  };

  _sendBtn.onclick = _submit;
  _stopBtn.onclick = () => {
    ctx.send({ type: "stop" });        // existing behavior: abort a streaming agent turn
    ctx.send({ type: "room_stop" });   // new: end an autonomous round-table between turns
  };
  // The room's user frame hits the server-side slash intercept
  // (shells/conference/frames.py) — same text, same path as a typed /killswitch.
  wireKillswitch(container.querySelector("#conf-kill"),
    (text) => ctx.send({ type: "user", text }));
  _msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _submit(); }
  });
}

export default { mount, onFrame };
