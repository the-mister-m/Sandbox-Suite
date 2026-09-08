// messenger widget — track rail with send/view arms, chat cards, open chat
//
// State per instance: tracks from the last track_list, lines/counts from
// wp_feed, arming (send/view) and which chat card is open.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const HUMAN_IDENT = "Captain";
  const SYSTEM_IDENT = "«harness»";
  const HARNESS_KEY = "__harness";
  const CAPTAIN_KEY = "__captain";

  const STYLE_ID = "mx-messenger-style";
  const CSS = `
.mx-messenger{ --mg-rail:250px; height:100%; display:flex; flex-direction:column; min-height:0; }
.mx-messenger .mg-panes{ flex:1; display:grid; grid-template-columns:var(--mg-rail) 2px 1fr; min-height:0; }
.mx-messenger .mg-divider{ background:var(--gridline); }
.mx-messenger .mg-rail{ background:var(--surface-1); display:flex; flex-direction:column; min-height:0; }
.mx-messenger .mg-head{ display:flex; align-items:center; gap:8px; flex-shrink:0; padding:7px 11px;
  background:var(--surface-1); border-bottom:1px solid var(--gridline); font-size:10.5px;
  text-transform:uppercase; letter-spacing:.06em; color:var(--text-3); font-weight:600; }
.mx-messenger .mg-sp{ flex:1; }
.mx-messenger .mg-al{ display:flex; align-items:flex-start; gap:4px; }
.mx-messenger .mg-alg{ display:flex; flex-direction:column; align-items:center; gap:3px; min-width:36px; }
.mx-messenger .mg-alg:first-child{ margin-right:12px; }
.mx-messenger .mg-allbl{ color:var(--text-4); text-transform:none; letter-spacing:.03em; font-family:var(--mono); font-size:8.5px; }
.mx-messenger .mg-albtns{ display:flex; align-items:center; gap:3px; }
.mx-messenger .mg-alsep{ color:var(--text-4); }
.mx-messenger .mg-lnk{ background:none; border:none; padding:0; color:var(--gate-blue); font-size:10.5px; cursor:pointer; font-family:inherit; }
.mx-messenger .mg-rows{ flex:1; overflow-y:auto; min-height:0; }
.mx-messenger .mg-row{ display:flex; align-items:center; gap:9px; padding:9px 11px; border-bottom:1px solid var(--gridline); }
.mx-messenger .mg-txt{ flex:1; min-width:0; }
.mx-messenger .mg-name{ font-size:12px; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mx-messenger .mg-sub{ font-size:9.5px; color:var(--text-4); font-family:var(--mono); margin-top:2px; }
.mx-messenger .mg-mail{ font-family:var(--mono); font-size:10px; color:var(--text-3); flex-shrink:0; }
.mx-messenger .mg-mail.none{ color:var(--text-4); }
.mx-messenger .mg-btns{ display:flex; gap:4px; flex-shrink:0; }
.mx-messenger .mg-btn{ font-family:var(--mono); font-size:9px; letter-spacing:.06em; padding:4px 6px; border-radius:4px;
  background:var(--surface-2); border:1px solid var(--border); color:var(--text-3); cursor:pointer; line-height:1; }
.mx-messenger .mg-btn.armed{ background:var(--surface-3); border-color:var(--border-2); color:var(--text-1); }
.mx-messenger .mg-btn.s,
.mx-messenger .mg-btn.v,
.mx-messenger .mg-btn.m{ font-size:12px; line-height:1; padding:3px 5px; }
.mx-messenger .mg-btn.s{ color:#3ddc84; }
.mx-messenger .mg-btn.s.armed{ color:#3ddc84; text-shadow:0 0 6px rgba(61,220,132,.55); }
.mx-messenger .mg-btn.v,
.mx-messenger .mg-btn.m{ filter:grayscale(1); opacity:.5; }
.mx-messenger .mg-btn.v.armed{ filter:none; opacity:1; }
.mx-messenger .mg-btn.m.on{ filter:none; opacity:1; }
.mx-messenger .mg-row.muted .mg-name,
.mx-messenger .mg-row.muted .mg-sub{ opacity:.4; text-decoration:line-through; }
.mx-messenger .mg-row.muted .dot{ opacity:.3; }
.mx-messenger .mg-row.muted .mg-btn.s{ opacity:.25; pointer-events:none; }
.mx-messenger .mg-row.meta{ border-top:1px solid var(--border); border-bottom:none; }
.mx-messenger .mg-row.meta + .mg-row.meta{ border-top:1px solid var(--gridline); }
.mx-messenger .mg-row.meta .mg-name{ font-family:var(--mono); font-size:10.5px; letter-spacing:.06em;
  text-transform:uppercase; }
.mx-messenger .mg-row.meta.captain .dot{ background:var(--status-idle); }
.mx-messenger .mg-row.meta.captain .mg-name{ color:var(--text-1); }
.mx-messenger .mg-row.meta.captain.has-mail .dot{ background:var(--gate-blue);
  box-shadow:0 0 6px var(--gate-blue); animation:pulse 1.5s ease-in-out infinite; }
.mx-messenger .mg-row.meta.harness .dot{ box-shadow:inset 0 0 0 1px var(--border-2); }
.mx-messenger .mg-row.meta.harness .mg-name{ color:var(--text-3); }
.mx-messenger .mg-mail.unread{ color:var(--gate-blue); font-weight:600; }
.mx-messenger .mg-btn.read{ text-transform:lowercase; letter-spacing:.02em; margin-left:auto; }
.mx-messenger .mg-chead .mg-btn.read{ margin-left:auto; align-self:center; }
.mx-messenger .mg-compose{ flex-shrink:0; border-top:1px solid var(--gridline); background:var(--surface-1); padding:8px 10px; }
.mx-messenger .mg-to{ font-family:var(--mono); font-size:9.5px; color:var(--text-4); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
.mx-messenger .mg-to b{ color:var(--text-2); font-weight:600; }
.mx-messenger .mg-cin{ display:flex; gap:6px; }
.mx-messenger .mg-cin input{ flex:1; min-width:0; background:var(--surface-2); border:1px solid var(--border); border-radius:7px;
  color:var(--text-1); padding:7px 10px; font-size:12.5px; font-family:var(--sans); }
.mx-messenger .mg-cin input:focus{ outline:none; border-color:var(--gate-blue); }
.mx-messenger .mg-cin button{ background:var(--surface-2); border:1px solid var(--border); color:var(--text-2); border-radius:7px; padding:0 13px; cursor:pointer; font-size:12px; }
.mx-messenger .mg-main{ min-height:0; min-width:0; display:flex; flex-direction:column; background:var(--plane); position:relative; }
.mx-messenger .mg-stage{ flex:1; overflow-y:auto; min-height:0; padding:14px; }
.mx-messenger .mg-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
.mx-messenger .mg-card{ background:var(--surface-1); border:1px solid var(--border); border-radius:8px; padding:13px;
  cursor:pointer; display:flex; flex-direction:column; min-height:120px; }
.mx-messenger .mg-parts{ display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px; }
.mx-messenger .mg-chip{ font-size:10px; color:var(--text-2); background:var(--surface-2); padding:2px 7px; border-radius:4px;
  white-space:nowrap; font-family:var(--mono); border:1px solid var(--border); display:inline-flex; align-items:center; gap:5px; }
.mx-messenger .mg-chip .dot{ width:6px; height:6px; }
.mx-messenger .mg-prev{ color:var(--text-3); font-size:12px; line-height:1.45; flex:1; overflow:hidden;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.mx-messenger .mg-prev b{ color:var(--text-2); }
.mx-messenger .mg-foot{ display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
.mx-messenger .mg-tag{ font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-4); font-weight:700; }
.mx-messenger .mg-card.group .mg-tag{ color:var(--text-2); }
.mx-messenger .mg-cnt{ font-family:var(--mono); font-size:10px; color:var(--text-4); }
.mx-messenger .mg-chat{ position:absolute; inset:0; background:var(--plane); display:none; flex-direction:column; }
.mx-messenger .mg-chat.on{ display:flex; }
.mx-messenger .mg-chead{ flex-shrink:0; display:flex; align-items:center; gap:12px; padding:7px 12px; background:var(--surface-1); border-bottom:1px solid var(--gridline); }
.mx-messenger .mg-back{ background:var(--surface-2); border:1px solid var(--border); color:var(--text-2); border-radius:6px; padding:4px 11px; font-size:11.5px; cursor:pointer; font-family:inherit; }
.mx-messenger .mg-ctitle{ font-size:12px; color:var(--text-1); }
.mx-messenger .mg-csub{ font-size:10px; color:var(--text-4); text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }
.mx-messenger .mg-script{ flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:4px; min-height:0; }
.mx-messenger .mg-turn{ display:flex; flex-direction:column; gap:6px; padding:7px 8px; margin:2px -4px; border-radius:8px; }
.mx-messenger .mg-msg{ max-width:94%; line-height:1.45; }
.mx-messenger .mg-who{ font-size:9.5px; color:var(--text-4); margin-bottom:3px; text-transform:uppercase; letter-spacing:.06em; }
.mx-messenger .mg-msg.user{ align-self:flex-end; }
.mx-messenger .mg-msg.user .mg-bub{ background:rgba(57,135,229,.13); border:1px solid rgba(57,135,229,.30); color:#dbe8fa; }
.mx-messenger .mg-msg.agent .mg-bub{ background:var(--surface-2); border:1px solid var(--border); }
.mx-messenger .mg-bub{ padding:8px 10px; border-radius:9px; white-space:pre-wrap; font-size:12.5px; }
.mx-messenger .mg-tfoot{ display:flex; align-items:center; gap:8px; font-size:9.5px; color:var(--text-4); font-family:var(--mono); padding-left:2px; }
.mx-messenger .mg-heard{ color:var(--text-3); }
.mx-messenger .mg-gone{ opacity:.55; }
.mx-messenger .mg-chip.mg-gone{ border-style:dashed; }
.mx-messenger .mg-msg.denied .mg-bub{ background:var(--fill-red); border-color:rgba(208,59,59,.30); color:#f0b0b0;
  font-style:italic; text-decoration:line-through; text-decoration-color:rgba(208,59,59,.5); }
.mx-messenger .mg-msg.dead .mg-bub{ color:var(--text-3); }
.mx-messenger .mg-empty{ color:var(--text-4); font-size:11.5px; padding:16px; text-align:center; }
`;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function esc(str) { return String(str == null ? "" : str).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function clock(ms) {
    if (ms == null) return "";
    const d = new Date(ms);
    return String(d.getUTCHours()).padStart(2, "0") + ":" +
           String(d.getUTCMinutes()).padStart(2, "0") + ":" +
           String(d.getUTCSeconds()).padStart(2, "0");
  }

  function newState() {
    return {
      tracks: [],
      lines: [],
      counts: {},
      name: {},
      closedNames: {},
      status: {},
      live: new Set(),
      seenArm: new Set(),
      armedSend: new Set(),
      armedView: new Set([CAPTAIN_KEY]),
      open: null,
      unread: [],
      el: null,
    };
  }

  function nameOf(s, id) { return s.name[id] || s.closedNames[id] || id; }
  function isGone(s, id) {
    if (id === HUMAN_IDENT || id === SYSTEM_IDENT) return false;
    return !s.live.has(id);
  }
  function goneCls(s, id) { return isGone(s, id) ? " mg-gone" : ""; }

  function rebuildRoster(s) {
    s.name = {}; s.status = {}; s.live = new Set();
    s.name[HUMAN_IDENT] = "Captain";
    s.tracks.forEach((t) => {
      s.name[t.id] = t.name || t.id;
      s.status[t.id] = t.status || "idle";
      s.live.add(t.id);
      if (!s.seenArm.has(t.id)) { s.seenArm.add(t.id); s.armedSend.add(t.id); s.armedView.add(t.id); }
      if (t.muted) s.armedSend.delete(t.id);
    });
  }

  function setOf(l) { return [...new Set([l.from, ...(l.to || [])])].sort(); }
  function keyOf(l) { return setOf(l).join("|"); }
  function buildCards(s) {
    const map = new Map();
    s.lines.forEach((l) => {
      const k = keyOf(l);
      if (!map.has(k)) map.set(k, { key: k, ids: setOf(l), lines: [] });
      map.get(k).lines.push(l);
    });
    const cards = [...map.values()];
    cards.forEach((c) => { c.group = c.ids.includes(HUMAN_IDENT); });
    cards.sort((a, b) => (b.group ? 1 : 0) - (a.group ? 1 : 0) || b.lines.length - a.lines.length);
    return cards;
  }
  function statusOf(s, id) { return s.status[id] || "idle"; }
  function unreadToMe(l) { return l.status === "pending" && (l.to || []).includes(HUMAN_IDENT); }

  function metaRow(s, key, label, sub, mail, cls) {
    const d = document.createElement("div");
    d.className = "mg-row meta " + cls + (mail ? " has-mail" : "");
    d.innerHTML =
      `<span class="dot"></span>` +
      `<div class="mg-txt"><div class="mg-name">${esc(label)}</div><div class="mg-sub">${esc(sub)}</div></div>` +
      (mail == null ? "" : `<span class="mg-mail ${mail ? "unread" : "none"}">${mail ? mail : ""}</span>`) +
      `<div class="mg-btns"><button class="mg-btn v" data-v="${key}" title="view">✉️</button></div>`;
    return d;
  }
  function metaRows(s, el) {
    el.appendChild(metaRow(s, CAPTAIN_KEY, "captain", "your chats · letters to you",
      s.counts[HUMAN_IDENT] || 0, "captain"));
    el.appendChild(metaRow(s, HARNESS_KEY, "harness", "harness notices", null, "harness"));
  }

  function renderRows(s, m) {
    const el = m.rows; el.innerHTML = "";
    if (!s.tracks.length) { el.innerHTML = '<div class="mg-empty">no live tracks — start an agent</div>'; metaRows(s, el); return; }
    s.tracks.forEach((t) => {
      const mail = s.counts[t.id] || 0;
      const st = t.status || "idle";
      const d = document.createElement("div"); d.className = "mg-row" + (t.muted ? " muted" : "");
      d.innerHTML =
        `<span class="dot ${st}"></span>` +
        `<div class="mg-txt"><div class="mg-name">${esc(t.name || t.id)}</div><div class="mg-sub">${esc(t.model || "")}</div></div>` +
        `<span class="mg-mail ${mail ? "" : "none"}">${mail ? mail : ""}</span>` +
        `<div class="mg-btns">` +
        `<button class="mg-btn m${t.muted ? " on" : ""}" data-m="${esc(t.id)}" ` +
        `title="${t.muted ? "bring back into the session" : "take out of the session"}">🚫</button>` +
        `<button class="mg-btn s" data-s="${esc(t.id)}" title="send">➤</button>` +
        `<button class="mg-btn v" data-v="${esc(t.id)}" title="view">✉️</button></div>`;
      el.appendChild(d);
    });
    metaRows(s, el);
  }

  function syncButtons(s, m) {
    m.rows.querySelectorAll(".mg-btn.s").forEach((b) => b.classList.toggle("armed", s.armedSend.has(b.dataset.s)));
    m.rows.querySelectorAll(".mg-btn.v").forEach((b) => b.classList.toggle("armed", s.armedView.has(b.dataset.v)));
    const open = s.tracks.filter((t) => !t.muted);
    const armed = open.filter((t) => s.armedSend.has(t.id)).map((t) => t.name || t.id);
    const allLive = open.length && armed.length === open.length;
    m.toLine.textContent = allLive ? "all" : (armed.join(", ") || "no one");
  }

  function renderCards(s, m) {
    const g = m.grid; g.innerHTML = "";
    const cards = buildCards(s).filter((c) => {
      if (!s.armedView.has(HARNESS_KEY) && c.ids.includes(SYSTEM_IDENT)) return false;
      if (!s.armedView.has(CAPTAIN_KEY) && c.ids.includes(HUMAN_IDENT)) return false;
      return c.ids.every((id) => !s.live.has(id) || s.armedView.has(id));
    });
    if (!s.lines.length) { g.innerHTML = '<div class="mg-empty">no messages on the waypoint yet</div>'; return; }
    if (!cards.length) { g.innerHTML = '<div class="mg-empty">no chats match this view filter</div>'; return; }
    cards.forEach((c) => {
      const last = c.lines[c.lines.length - 1];
      const div = document.createElement("div"); div.className = "mg-card" + (c.group ? " group" : "");
      const chips = c.ids.map((id) => `<span class="mg-chip${goneCls(s, id)}"><span class="dot ${statusOf(s, id)}"></span>${esc(nameOf(s, id))}</span>`).join("");
      div.innerHTML =
        `<div class="mg-parts">${chips}</div>` +
        `<div class="mg-prev"><b class="${goneCls(s, last.from).trim()}">${esc(nameOf(s, last.from))}:</b> ${esc(last.body)}</div>` +
        `<div class="mg-foot"><span class="mg-tag">${c.group ? "group · you send here" : "view only"}</span>` +
        `<span class="mg-cnt">${c.lines.length} ${c.lines.length === 1 ? "line" : "lines"}</span></div>`;
      div.onclick = () => openChat(s, m, c);
      g.appendChild(div);
    });
  }

  function markRead(frame, ids) {
    if (!ids.length) return;
    frame.send({ type: "wp_read", ids, inst: frame.id });
    frame.send({ type: "wp_feed", inst: frame.id });
  }

  function renderChat(s, m, c) {
    m.title.textContent = c.group ? "Group chat" : c.ids.map((id) => nameOf(s, id)).join(" · ");
    m.sub.textContent = (c.group ? "you send here" : "view only") + "  —  " + c.ids.map((id) => nameOf(s, id)).join(" · ");
    const log = m.log;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = "";
    s.unread = c.lines.filter(unreadToMe).map((l) => l.id).filter((id) => id != null);
    m.readAll.hidden = !s.unread.length;
    c.lines.forEach((l) => {
      const from = l.from, mine = from === HUMAN_IDENT;
      const blk = document.createElement("div"); blk.className = "mg-turn";
      const msg = document.createElement("div");
      msg.className = "mg-msg " + (mine ? "user" : "agent") +
        (l.status === "denied" ? " denied" : "") + (l.status === "dead" ? " dead" : "");
      let foot;
      if (l.status === "denied") foot = `<span class="gbadge red">denied</span><span>said ${clock(l.said)}</span>`;
      else if (l.status === "dead") foot = `<span class="gbadge white">dead-letter</span><span>said ${clock(l.said)}</span>`;
      else if (l.status === "pending") foot = `<span>said ${clock(l.said)}</span><span>· unread</span>`;
      else foot = `<span>said ${clock(l.said)}</span>` + (l.heard != null ? `<span class="mg-heard">heard ${clock(l.heard)}</span>` : "");
      if (unreadToMe(l) && l.id != null) foot += `<button class="mg-btn read" data-read="${l.id}">mark read</button>`;
      msg.innerHTML = `<div class="mg-who${mine ? "" : goneCls(s, from)}">${mine ? "you" : esc(nameOf(s, from))}</div><div class="mg-bub">${esc(l.body)}</div>`;
      const ft = document.createElement("div"); ft.className = "mg-tfoot"; ft.innerHTML = foot;
      blk.appendChild(msg); blk.appendChild(ft);
      log.appendChild(blk);
    });
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  function openChat(s, m, c) {
    s.open = c.key;
    renderChat(s, m, c);
    m.chat.classList.add("on");
    m.log.scrollTop = m.log.scrollHeight;
  }
  function refreshChat(s, m) {
    if (!s.open) return;
    const c = buildCards(s).find((x) => x.key === s.open);
    if (c) renderChat(s, m, c);
  }
  function closeChat(s, m) {
    s.open = null; s.unread = [];
    m.readAll.hidden = true;
    m.chat.classList.remove("on");
  }

  function rosterChanged(frame) {
    const s = frame._mg;
    if (!s || !s.el) return;
    rebuildRoster(s); renderRows(s, s.el); syncButtons(s, s.el);
  }

  MX.registerWidget("messenger", {
    mount(frame) {
      ensureStyle();
      const s = newState();
      frame._mg = s;

      const wrap = document.createElement("div");
      wrap.className = "mx-messenger";
      wrap.innerHTML =
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
            `<div class="mg-rows"></div>` +
            `<div class="mg-compose"><div class="mg-to">send to <b class="mg-to-line">all</b></div>` +
              `<div class="mg-cin"><input class="mg-input" placeholder="Announce to the group…">` +
              `<button class="mg-send">Send</button></div></div>` +
          `</aside>` +
          `<div class="mg-divider"></div>` +
          `<main class="mg-main">` +
            `<div class="mg-stage"><div class="mg-grid"></div></div>` +
            `<section class="mg-chat">` +
              `<div class="mg-chead"><button class="mg-back">← back</button>` +
                `<div><div class="mg-ctitle"></div><div class="mg-csub"></div></div>` +
                `<button class="mg-btn read mg-read-all" hidden>mark all read</button></div>` +
              `<div class="mg-script"></div>` +
            `</section>` +
          `</main>` +
        `</div>`;
      frame.host.appendChild(wrap);

      const m = {
        rows: wrap.querySelector(".mg-rows"),
        toLine: wrap.querySelector(".mg-to-line"),
        input: wrap.querySelector(".mg-input"),
        sendBtn: wrap.querySelector(".mg-send"),
        grid: wrap.querySelector(".mg-grid"),
        chat: wrap.querySelector(".mg-chat"),
        back: wrap.querySelector(".mg-back"),
        title: wrap.querySelector(".mg-ctitle"),
        sub: wrap.querySelector(".mg-csub"),
        readAll: wrap.querySelector(".mg-read-all"),
        log: wrap.querySelector(".mg-script"),
      };
      s.el = m;

      m.back.onclick = () => closeChat(s, m);
      m.readAll.onclick = () => markRead(frame, s.unread.slice());
      m.log.addEventListener("click", (e) => {
        const b = e.target.closest("[data-read]");
        if (b) markRead(frame, [Number(b.dataset.read)]);
      });
      m.rows.addEventListener("click", (e) => {
        const sBtn = e.target.closest(".mg-btn.s"), vBtn = e.target.closest(".mg-btn.v");
        const mBtn = e.target.closest(".mg-btn.m");
        if (mBtn) {
          const id = mBtn.dataset.m, now = !mBtn.classList.contains("on");
          if (now) s.armedSend.delete(id);
          frame.send({ type: "wp_mute", id, muted: now, inst: frame.id });
        }
        if (sBtn) { s.armedSend.has(sBtn.dataset.s) ? s.armedSend.delete(sBtn.dataset.s) : s.armedSend.add(sBtn.dataset.s); syncButtons(s, m); }
        if (vBtn) { s.armedView.has(vBtn.dataset.v) ? s.armedView.delete(vBtn.dataset.v) : s.armedView.add(vBtn.dataset.v); syncButtons(s, m); renderCards(s, m); }
      });
      wrap.querySelectorAll("[data-all-send]").forEach((b) => b.onclick = () => {
        s.armedSend.clear();
        if (b.dataset.allSend === "1") s.tracks.forEach((t) => { if (!t.muted) s.armedSend.add(t.id); });
        syncButtons(s, m);
      });
      wrap.querySelectorAll("[data-all-view]").forEach((b) => b.onclick = () => {
        const meta = [HARNESS_KEY, CAPTAIN_KEY].filter((k) => s.armedView.has(k));
        s.armedView.clear(); if (b.dataset.allView === "1") s.tracks.forEach((t) => s.armedView.add(t.id));
        meta.forEach((k) => s.armedView.add(k));
        syncButtons(s, m); renderCards(s, m);
      });
      function sendCompose() {
        const body = (m.input.value || "").trim();
        if (!body || !s.armedSend.size) return;
        frame.send({ type: "wp_send", to: [...s.armedSend], body, inst: frame.id });
        m.input.value = "";
      }
      m.sendBtn.onclick = sendCompose;
      m.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCompose(); }
      });

      frame.subscribe(["track_list", "ade_init", "wp_feed"]);
      frame.send({ type: "roster", inst: frame.id });
      rebuildRoster(s); renderRows(s, m); syncButtons(s, m); renderCards(s, m);
      frame.send({ type: "wp_feed", inst: frame.id });
    },

    unmount(frame) {
      frame._mg = null;
    },

    onFrame(frame, msg) {
      const s = frame._mg, m = s && s.el;
      if (!s || !m) return;

      if (msg.type === "track_list" || msg.type === "ade_init") {
        s.tracks = msg.tracks || [];
        s.closedNames = Object.assign({}, s.closedNames, msg.names || {});
        rosterChanged(frame);
        return;
      }
      if (msg.type === "wp_feed") {
        s.lines = msg.lines || [];
        s.counts = msg.counts || {};
        rebuildRoster(s); renderRows(s, m); syncButtons(s, m); renderCards(s, m); refreshChat(s, m);
      }
    },
  });
})();
