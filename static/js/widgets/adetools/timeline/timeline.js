// timeline widget — lanes per track, spans per region, action pips
//
// Port of the old timeline view. Lane heads carry name, region name, model,
// root browser and the cache toggles; the right side draws a ruler, one row
// per lane, a span per region run, and pips for actions on that run.
//
// State: per instance on frame._tl — roster rows from track_list, turn and
// action records from feed, derived handoffs, the open change prompt, open
// popover / context region, cached preset names, zoom, refresh timer.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const STYLE_ID = "mx-timeline-style";
  const CSS = `
.mx-timeline{ --tl-heads-w:250px; --tl-lane-h:64px;
  display:flex; flex-direction:column; height:100%; min-height:0; }
.mx-timeline #tlScroll{ flex:1; display:flex; overflow:auto; min-height:0; position:relative; }
.mx-timeline #tlHeads{
  width:var(--tl-heads-w); flex-shrink:0; position:sticky; left:0; z-index:5;
  background:var(--surface-1);
}
.mx-timeline #tlSplit{
  position:sticky; left:var(--tl-heads-w); z-index:6; flex-shrink:0; width:2px;
}
.mx-timeline #tlHeads .ruler-pad{
  min-height:28px; border-bottom:1px solid var(--gridline);
  position:sticky; top:0; z-index:6; background:var(--surface-1);
  display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; padding:4px 9px;
}
.mx-timeline .tl-ruler-controls{
  display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px;
  flex:1 1 auto; min-width:0;
}
.mx-timeline .tl-endtoggle{
  display:flex; align-items:center; gap:5px; font-size:9px;
  color:var(--text-4); cursor:pointer; user-select:none;
}
.mx-timeline .tl-endtoggle input{ margin:0; }
.mx-timeline .tl-refresh{
  display:flex; align-items:center; gap:5px; font-size:9px; color:var(--text-4);
}
.mx-timeline .tl-refresh input{
  width:30px; background:var(--surface-2); border:1px solid var(--border);
  color:var(--text-2); border-radius:3px; padding:1px 3px; font-size:9px;
}
.mx-timeline .tl-zoom{ display:flex; align-items:center; gap:4px; flex-shrink:0; order:-1; }
.mx-timeline .tl-zoom .tb-btn{ padding:1px 7px; font-size:11px; line-height:1.2; }
.mx-timeline .tl-zoomlbl{
  font-size:9.5px; color:var(--text-3); font-family:var(--mono);
  min-width:34px; text-align:center;
}
.mx-timeline .tb-btn{
  background:var(--surface-2); border:1px solid var(--border); color:var(--text-2);
  border-radius:6px; padding:4px 10px; font-size:11.5px; cursor:pointer; white-space:nowrap;
}
.mx-timeline #tlHeadActions{
  display:flex; flex-direction:column; gap:5px; padding:7px 9px;
  border-top:1px solid var(--gridline);
}
.mx-timeline #tlHeadActions .tb-btn{ width:100%; padding:4px 8px; font-size:10.5px; }
.mx-timeline .tl-head{
  height:var(--tl-lane-h); display:flex; flex-direction:column; justify-content:center;
  gap:2px; padding:0 9px; overflow:hidden;
  border-bottom:1px solid var(--gridline); cursor:pointer;
}
.mx-timeline .tl-head .th-top{ display:flex; align-items:center; gap:7px; min-width:0; }
.mx-timeline .tl-head .th-txt{ min-width:0; flex:1; }
.mx-timeline .tl-head .th-name{ font-size:11.5px; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25; }
.mx-timeline .tl-head .th-reg{ font-size:9.5px; color:var(--text-3); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25; }
.mx-timeline .tl-head .th-reg.empty{ color:var(--text-4); font-style:italic; }
.mx-timeline .tl-head .th-sub{ font-size:9.5px; color:var(--text-4); margin-top:1px; font-family:var(--mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25; }
.mx-timeline .tl-head .th-root{
  font-size:9px; color:var(--text-4); font-family:var(--mono);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  line-height:1.2; min-width:0;
}
.mx-timeline .tl-head .th-root.empty{ font-style:italic; font-family:inherit; }
.mx-timeline .tl-warn{
  font-size:8.5px; color:var(--gate-red); border:1px solid var(--gate-red);
  border-radius:3px; padding:1px 4px; flex-shrink:0; white-space:nowrap;
}
.mx-timeline .tl-head .th-edit{ cursor:text; }
.mx-timeline .tl-head .th-root.th-edit{ cursor:pointer; }
.mx-timeline .tl-head .th-edit:hover{
  color:var(--text-1); text-decoration:underline dotted var(--text-4) 1px;
  text-underline-offset:2px;
}
.mx-timeline .tl-head .th-input{
  display:block; width:100%; height:100%; box-sizing:border-box;
  background:var(--surface-3); border:1px solid var(--border-2); border-radius:3px;
  padding:0 3px; margin:0; outline:none;
  font:inherit; color:var(--text-1); letter-spacing:inherit;
}
.mx-timeline .tl-head .th-input:focus{ border-color:var(--text-4); }
.mx-timeline #tlCtxMenu{
  position:fixed; z-index:120; display:none; min-width:170px;
  background:var(--surface-1); border:1px solid var(--border-2); border-radius:8px;
  padding:5px; box-shadow:0 10px 28px rgba(0,0,0,.55);
}
.mx-timeline #tlCtxMenu.open{ display:block; }
.mx-timeline #tlCtxMenu button{
  display:block; width:100%; text-align:left; background:none; border:none;
  color:var(--text-2); border-radius:5px; padding:5px 8px;
  font:11px var(--mono); cursor:pointer; white-space:nowrap;
}
.mx-timeline #tlCtxMenu button:hover{ background:var(--surface-3); color:var(--text-1); }
.mx-timeline #tlCtxMenu .tl-ctx-head{
  padding:4px 8px 5px; margin-bottom:3px;
  border-bottom:1px solid var(--border-2);
  color:var(--text-3); font:10px var(--mono); letter-spacing:.04em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;
}
.mx-timeline #tlCtxMenu button:disabled{ color:var(--text-3); cursor:default; }
.mx-timeline #tlCtxMenu button:disabled:hover{ background:none; color:var(--text-3); }
.mx-timeline #tlRight{ position:relative; min-width:0; }
.mx-timeline #tlRuler{
  height:28px; position:sticky; top:0; z-index:4;
  background:var(--surface-1); border-bottom:1px solid var(--gridline);
}
.mx-timeline .tick{
  position:absolute; top:0; bottom:0; padding-left:5px;
  display:flex; align-items:flex-end; padding-bottom:4px;
  font-size:9.5px; color:var(--text-4); font-family:var(--mono);
  border-left:1px solid var(--gridline);
}
.mx-timeline .tl-row{
  height:var(--tl-lane-h); position:relative; border-bottom:1px solid var(--gridline);
  background-image:repeating-linear-gradient(to right, rgba(255,255,255,.035) 0, rgba(255,255,255,.035) 1px, transparent 1px, transparent 80px);
}
.mx-timeline .empty{ color:var(--text-4); font-size:11.5px; padding:16px; text-align:center; }
.mx-timeline .region{
  position:absolute; top:6px; height:calc(var(--tl-lane-h) - 12px); border-radius:5px; cursor:pointer;
  display:flex; align-items:center; gap:5px; padding:0 6px; overflow:hidden;
  white-space:nowrap; font-size:10.5px;
  transition:filter .12s ease, transform .12s ease, background .25s ease, border-color .25s ease;
}
.mx-timeline .region.settling{ overflow:visible; z-index:40; }
.mx-timeline .region .rlab{ overflow:hidden; text-overflow:ellipsis; }
.mx-timeline .region::before{
  content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background-image:linear-gradient(135deg, rgba(255,255,255,.10), transparent 60%);
}
.mx-timeline .region.white  { background:var(--fill-white);  border:1px solid var(--border);       color:var(--text-2); }
.mx-timeline .region.green  { background:var(--fill-green);  border:1px solid rgba(12,163,12,.45); color:#9ee59e; }
.mx-timeline .region.blue   { background:rgba(255,255,255,.05); border:1px solid var(--border);    color:var(--text-2); }
.mx-timeline .region.blue::before{ background-image:none; }
.mx-timeline .region.yellow { background:var(--fill-yellow); border:1px solid rgba(201,133,0,.55); color:#f2c877;
                 animation:regionWait 1.5s ease-in-out infinite; }
.mx-timeline .region.red    { background:var(--fill-red);    border:1px solid rgba(208,59,59,.55); color:#f0a3a3; }
.mx-timeline .region.inflight{
  background-image:repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 7px, transparent 7px 14px);
}
@keyframes regionWait{
  0%,100%{ box-shadow:0 0 0 0 rgba(201,133,0,.55); }
  50%    { box-shadow:0 0 0 6px rgba(201,133,0,0); }
}
.mx-timeline .pip{
  display:inline-flex; align-items:center; justify-content:center;
  width:17px; height:17px; border-radius:4px; flex-shrink:0;
  font-family:var(--mono); font-size:10.5px; font-weight:700; line-height:1;
}
.mx-timeline .pip.white  { background:var(--fill-white);  color:var(--gate-white);  border:1px solid var(--border); }
.mx-timeline .pip.green  { background:var(--fill-green);  color:var(--gate-green);  border:1px solid rgba(12,163,12,.40); }
.mx-timeline .pip.blue   { background:var(--fill-blue);   color:var(--gate-blue);   border:1px solid rgba(57,135,229,.40); }
.mx-timeline .pip.yellow { background:var(--fill-yellow); color:var(--gate-yellow); border:1px solid rgba(201,133,0,.40); animation:pipPulse 1.4s ease-in-out infinite; }
.mx-timeline .pip.red    { background:var(--fill-red);    color:var(--gate-red);    border:1px solid rgba(208,59,59,.45); }
@keyframes pipPulse{ 0%,100%{ opacity:1; } 50%{ opacity:.45; } }
.mx-timeline .tl-marker{ cursor:pointer; margin-left:2px; }
.mx-timeline .tl-span{ overflow:clip; }
.mx-timeline .tl-span .rname-layer{
  position:absolute; inset:0; display:flex; align-items:flex-end;
  justify-content:flex-end; pointer-events:none; z-index:3;
}
.mx-timeline .tl-span .rname{
  position:sticky; right:6px;
  max-width:calc(100% - 12px); margin:0 6px 3px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:9.5px; font-family:var(--mono); letter-spacing:.02em;
  color:var(--text-3);
}
.mx-timeline .tl-actionmark{
  position:absolute; top:50%; transform:translate(-50%,-50%);
  width:21px; height:21px; font-size:13.5px; z-index:2;
}
.mx-timeline .tl-actionmark.tl-cluster{ font-size:11px; }
.mx-timeline .tl-tick{
  position:absolute; top:6px; bottom:6px; width:2px; border-radius:1px;
  background:var(--text-4); cursor:pointer; opacity:.7;
}
.mx-timeline #tlRows{ position:relative; }
.mx-timeline .tl-handoff{
  position:absolute; top:6px; bottom:6px; width:2px; border-radius:1px;
  background:var(--text-3); cursor:pointer; z-index:4;
}
.mx-timeline .tl-handoff-line{
  position:absolute; width:1px; background:var(--text-3); cursor:pointer; z-index:1;
}
.mx-timeline .tl-handoff-line.file{ background:var(--text-3); }
.mx-timeline .tl-handoff-line.message{ background:var(--gate-blue); }
.mx-timeline #playhead{ position:absolute; top:28px; bottom:0; width:1px; background:var(--text-2); z-index:3; }
.mx-timeline #playhead::before{
  content:''; position:absolute; top:-4px; left:-3.5px; width:8px; height:8px;
  border-radius:50%; background:var(--text-2);
}
.mx-timeline .region-settle{
  position:absolute; top:calc(100% + 5px); left:0; z-index:40;
  background:var(--surface-1); border:1px solid var(--gate-yellow); border-radius:5px;
  padding:6px 9px; box-shadow:0 8px 26px rgba(0,0,0,.55); white-space:nowrap;
  cursor:default;
}
.mx-timeline .region-settle .ql-settle{ margin:0; padding:0; border-top:none; }
.mx-timeline .region-settle .sq-q{ font-family:var(--mono); font-size:10.5px; margin-right:6px; }
.mx-timeline .ql-settle{
  display:flex; align-items:center; gap:8px;
  margin-top:6px; padding-top:6px; border-top:1px dashed var(--gate-yellow);
}
.mx-timeline .ql-settle .sq-q{ flex:1; font-size:11px; color:var(--gate-yellow); }
.mx-timeline .sbtn{
  font:inherit; font-size:10.5px; padding:3px 12px; border-radius:3px; cursor:pointer;
  background:var(--surface-3); color:var(--text-2); border:1px solid var(--border-2);
}
.mx-timeline .region-ctxmenu{
  position:absolute; top:calc(100% + 5px); right:0; z-index:41;
  background:var(--surface-1); border:1px solid var(--border-2); border-radius:5px;
  padding:4px; box-shadow:0 8px 26px rgba(0,0,0,.55); white-space:nowrap;
  cursor:default; display:flex; flex-direction:column; min-width:140px;
}
.mx-timeline .region-ctxmenu button{
  font:inherit; font-size:11px; padding:5px 10px; border-radius:3px; cursor:pointer;
  background:transparent; color:var(--text-2); border:none; text-align:left;
}
.mx-timeline .region-ctxmenu button:hover{ background:var(--surface-3); color:var(--text-1); }
`;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---- pure helpers, no instance state ----

  const ZOOM_KEY = "ade_tl_zoom";
  const ZOOM_DEFAULT = 2.5;
  const ZOOM_MIN = 0.25, ZOOM_MAX = 6, ZOOM_STEP = 1.25;
  const PX_PER_MIN = 26;

  function loadZoom() {
    try {
      const v = parseFloat(localStorage.getItem(ZOOM_KEY));
      return (isFinite(v) && v > 0) ? v : ZOOM_DEFAULT;
    } catch (e) { return ZOOM_DEFAULT; }
  }
  function saveZoom(v) {
    try { localStorage.setItem(ZOOM_KEY, String(v)); } catch (e) {}
  }

  function esc(s) {
    s = (s === undefined || s === null) ? "" : String(s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const CLAUDE_MODELS = ["opus", "sonnet", "haiku", "fable"];
  // matches the alias list plus any fetched model row (tl.modelRows) whose
  // provider is claude, by id or by its resolved id (e.g. claude-sonnet-5)
  function isClaudeModel(model, modelRows) {
    if (CLAUDE_MODELS.includes(model)) return true;
    return (modelRows || []).some((m) =>
      m.provider === "claude" && (m.id === model || m.resolved === model));
  }

  const SYM = {
    read: "R", list: "L", write: "W", run: "$", boundary: "↗", fetch: "F",
    screen: "◎", remember: "✎", recall: "⌕", logic: "♪", web: "◐",
    user_action: "●", gate: "?",
  };
  function symFor(a) {
    const edge = String(a.edge || "").replace(/^approve_/, "");
    if (SYM[edge]) return SYM[edge];
    if (edge.indexOf("logic") >= 0) return SYM.logic;
    if (edge.indexOf("web") >= 0) return SYM.web;
    if (SYM[a.action_type]) return SYM[a.action_type];
    return "?";
  }

  function getTarget(r) {
    const p = r.payload || {};
    return p.path || p.command || p.url || p.target || p.query || p.note || "—";
  }
  function isPending(r) { return r.outcome === null || r.outcome === undefined; }
  function gateColor(r) {
    if (r.action_type === "user_action") return "white";
    if (r.hook === null || r.hook === undefined) return "white";
    if (r.outcome === "parked") return "white";
    if (r.outcome === "killed" || r.outcome === "timeout") return "white";
    if (r.outcome === "locked") return "red";
    if (isPending(r)) return "yellow";
    if (r.answer === false) return "red";
    if (r.hook === "open") return "green";
    return "blue";
  }

  const SEVERITY = { white: 0, green: 1, blue: 2, yellow: 3, red: 4 };
  function regionColor(actions) {
    let worst = "white";
    for (const a of actions) {
      const c = gateColor(a);
      if (SEVERITY[c] > SEVERITY[worst]) worst = c;
    }
    return worst;
  }

  const SEVERITY_ORDER = ["white", "green", "blue", "yellow", "red"];
  function clusterGradient(colorList) {
    const present = SEVERITY_ORDER.filter((c) => colorList.includes(c));
    if (present.length < 2) return null;
    return "linear-gradient(90deg, " + present.map((c) => `var(--fill-${c})`).join(", ") + ")";
  }
  const RNAME_MIN_PX = 60;

  function regionLabel(actions) {
    const pending = actions.find((a) => isPending(a));
    if (pending) return "waiting on you";
    const denied = actions.some((a) => gateColor(a) === "red");
    if (denied) return "denied";
    return "";
  }

  function settleHtml(a) {
    return '<div class="ql-settle">' +
      '<span class="sq-q">' + esc(a.edge || a.action_type || "") + " " + esc(getTarget(a)) + " — waiting on you</span>" +
      '<button class="sbtn approve" data-settle="approve">approve</button>' +
      '<button class="sbtn deny" data-settle="deny">deny</button>' +
      '<button class="sbtn queue" data-settle="queue">queue</button>' +
    "</div>";
  }

  function regionOf(r) {
    if (!r) return null;
    if (r.region != null) return r.region;
    return r.schema === 1 ? r.track : null;
  }
  function containerOf(r) { return (r && r.track != null) ? r.track : null; }
  function turnKey(track, turn) { return track + "#" + turn; }

  function xOf(originMs, ms, ppm) { return ((ms - originMs) / 60000) * ppm; }
  function wOf(durationMs, ppm) { return Math.max((durationMs / 60000) * ppm, 30); }
  function hhmm(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function snapshotRegionSettings(r) {
    const settings = Object.assign({}, r.settings || {});
    delete settings.name;
    return {
      settings,
      model:      r.model || "",
      seat:       r.seat || "",
      root:       r.root || "",
      provider:   r.provider || "",
      loop_class: r.loop_class || "",
      mechanism:  r.mechanism || "",
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
      type:     "insert_region",
      track:    containerId,
      region,
      settings: Object.assign({}, c.settings),
    };
  }

  // ---- outbound events: no windows open from here ----

  function openLedger(detail) {
    try {
      document.dispatchEvent(new CustomEvent("mx:open-ledger", { detail: detail || {} }));
    } catch (e) { /* no listener yet */ }
  }

  // ---- instance plumbing ----

  function send(frame, obj) {
    frame.send(Object.assign({ inst: frame.id }, obj));
  }

  function refresh(frame) {
    send(frame, { type: "feed" });
  }

  function nameOf(tl, id) {
    return (tl.names && tl.names[id]) || id;
  }

  function freshRow(tl, snap) {
    if (!snap) return snap;
    const live = (tl.regions || []).find((r) => r && r.id === snap.id);
    return live || snap;
  }

  function startRefreshTimer(frame) {
    const tl = frame._tl;
    if (tl.refreshTimer) clearInterval(tl.refreshTimer);
    tl.refreshTimer = setInterval(() => refresh(frame), tl.refreshMin * 60000);
  }

  // ---- lane head controls ----

  function cacheTtlToggle(frame, t) {
    const wrap = document.createElement("span");
    wrap.className = "tl-ttl";
    wrap.style.display = "inline-flex";
    wrap.style.gap = "3px";
    wrap.style.flexShrink = "0";
    let cur = (t.settings && t.settings.claude_cache_ttl) || "1h";
    const btns = [];
    const paint = () => { btns.forEach(({ btn, v }) => { btn.style.opacity = (v === cur) ? "1" : ".45"; }); };
    ["5m", "1h"].forEach((v) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tb-btn";
      b.textContent = v;
      b.style.padding = "1px 6px";
      b.style.fontSize = "9.5px";
      btns.push({ btn: b, v });
      b.onclick = (ev) => {
        ev.stopPropagation();
        if (v === cur) return;
        if (!window.confirm(`Reset this track's Claude cache to ${v} TTL?\n\nA warm (persistent) session respawns and re-pays cache creation on its next turn.`)) return;
        // sends only — the button repaints when the roster comes back
        send(frame, { type: "edit_track", track: t.id, fields: { claude_cache_ttl: v } });
      };
      wrap.appendChild(b);
    });
    paint();
    return wrap;
  }

  function excludeDynamicToggle(frame, t) {
    const wrap = document.createElement("span");
    wrap.className = "ade-exclude-dynamic";
    wrap.style.display = "inline-flex";
    wrap.style.gap = "3px";
    wrap.style.marginLeft = "4px";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tb-btn";
    b.style.padding = "1px 6px";
    b.style.fontSize = "9.5px";
    const paint = () => {
      const on = !!(t.settings && t.settings.claude_exclude_dynamic);
      b.textContent = on ? "trim:on" : "trim:off";
      b.style.opacity = on ? "1" : ".45";
    };
    b.onclick = (ev) => {
      ev.stopPropagation();
      const was = !!(t.settings && t.settings.claude_exclude_dynamic);
      const next = !was;
      const msg = next
        ? "Turn ON --exclude-dynamic-system-prompt-sections for this track?\n\nStrips date/cwd/git-status from Claude's system prompt so a warm-restart cache hits instead of re-writing the whole prefix. Tradeoff: the model loses that situational awareness. A warm (persistent) session respawns to pick this up."
        : "Turn OFF --exclude-dynamic-system-prompt-sections for this track?\n\nRestores date/cwd/git-status in Claude's system prompt. A warm (persistent) session respawns to pick this up.";
      if (!window.confirm(msg)) return;
      // sends only — the button repaints when the roster comes back
      send(frame, { type: "edit_track", track: t.id, fields: { claude_exclude_dynamic: next } });
    };
    wrap.appendChild(b);
    paint();
    return wrap;
  }

  function rootLine(frame, tr) {
    const d = document.createElement("div");
    d.className = "th-root";
    // region root when the lane carries one, else the track row's own root
    const row  = tr.track || null;
    const root = (row && row.root) || tr.row_root || "";
    if (root) {
      const parts = String(root).split("/").filter(Boolean);
      d.textContent = (parts.length > 2 ? "…/" : "/") + parts.slice(-2).join("/");
      d.title = root;
    } else {
      d.className += " empty";
      d.textContent = "no root of its own — workspace default";
      d.title = "this lane has no root set, so it runs wherever the workspace "
              + "default points at the time it runs";
    }
    if (tr.track) {
      d.classList.add("th-edit");
      d.title = (d.title ? d.title + "\n\n" : "") + "click to pick a folder";
      d.addEventListener("click", (ev) => {
        ev.stopPropagation();
        MX.openRootBrowser(root || "/", (val) => {
          send(frame, { type: "edit_track", track: tr.track.id, fields: { root: val } });
        }, {});
      });
    }
    return d;
  }

  function inlineEdit(frame, el, value, commit, hint) {
    const tl = frame._tl;
    el.classList.add("th-edit");
    el.title = (el.title ? el.title + "\n\n" : "") + "click to edit";
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (tl.editing) return;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "th-input";
      inp.value = value || "";
      if (hint) inp.placeholder = hint;
      const held = el.textContent;
      el.textContent = "";
      el.appendChild(inp);
      tl.editing = inp;
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        tl.editing = null;
        const next = inp.value.trim();
        el.textContent = held;
        if (save && next && next !== (value || "")) {
          commit(next);
          refresh(frame);
        }
      };
      inp.addEventListener("keydown", (kev) => {
        kev.stopPropagation();
        if (kev.key === "Enter") { kev.preventDefault(); finish(true); }
        else if (kev.key === "Escape") { kev.preventDefault(); finish(false); }
      });
      inp.addEventListener("blur", () => finish(true));
      inp.addEventListener("click", (cev) => cev.stopPropagation());
      inp.addEventListener("contextmenu", (cev) => cev.stopPropagation());
      inp.focus();
      inp.select();
    });
  }

  // ---- lane context menu ----

  function placeMenu(frame, x, y) {
    const menu = frame._tl.menu;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.add("open");
    const r = menu.getBoundingClientRect();
    const PAD = 6;
    if (r.right > window.innerWidth - PAD) {
      menu.style.left = Math.max(PAD, window.innerWidth - PAD - r.width) + "px";
    }
    if (r.bottom > window.innerHeight - PAD) {
      menu.style.top = Math.max(PAD, window.innerHeight - PAD - r.height) + "px";
    }
  }

  function closeTrackMenu(frame) {
    const menu = frame._tl && frame._tl.menu;
    if (!menu) return;
    menu.classList.remove("open");
    menu.innerHTML = "";
  }

  // preset names — one fetch per menu open, held on the instance until the next
  function loadPresetNames(frame) {
    const tl = frame._tl;
    tl.presetNames = null;
    tl.presetFetch = fetch("/api/library/presets")
      .then((r) => r.json())
      .then((data) => {
        const names = Array.isArray(data.names) ? data.names
                    : (Array.isArray(data.list) ? data.list : []);
        tl.presetNames = names;
        return names;
      })
      .catch(() => { tl.presetNames = []; return []; });
    return tl.presetFetch;
  }

  function openPresetSubmenu(frame, x, y, headText, pick) {
    const tl = frame._tl;
    if (!tl.menu) return;
    tl.menu.innerHTML = "";
    const head = document.createElement("div");
    head.className = "tl-ctx-head";
    head.textContent = headText;
    tl.menu.appendChild(head);
    const note = document.createElement("button");
    note.type = "button";
    note.disabled = true;
    note.textContent = "loading…";
    tl.menu.appendChild(note);
    placeMenu(frame, x, y);
    const paint = (names) => {
      note.textContent = "(none saved)";
      if (!names.length) { placeMenu(frame, x, y); return; }
      note.remove();
      for (const n of names) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = n;
        b.addEventListener("click", (cev) => {
          cev.stopPropagation();
          closeTrackMenu(frame);
          pick(n);
        });
        tl.menu.appendChild(b);
      }
      placeMenu(frame, x, y);
    };
    if (Array.isArray(tl.presetNames)) paint(tl.presetNames);
    else (tl.presetFetch || loadPresetNames(frame)).then(paint);
  }

  function openTrackMenu(frame, ev, tr) {
    const tl = frame._tl;
    if (!tl.menu) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (tr.container) tl.lastTrackId = tr.container;
    closeTrackMenu(frame);
    loadPresetNames(frame);
    const mx = ev.clientX, my = ev.clientY;
    const items = [];
    if (tr.track) {
      const rid = tr.track.id;
      const rlabel = tr.name || rid;
      items.push(["⎘ copy region settings", () => {
        const src = freshRow(tl, tr.track);
        tl.settingsClip = { from: src.name || src.id, snap: snapshotRegionSettings(src) };
      }]);
      if (tl.settingsClip) {
        items.push(["📋 paste settings from " + tl.settingsClip.from, () => {
          if (!tl.settingsClip) return;
          send(frame, { type: "edit_track", track: rid,
                        fields: clipEditFields(tl.settingsClip.snap) });
          refresh(frame);
        }]);
      }
      items.push(["💾 save preset", () => {
        const name = window.prompt("Save this region's settings as a preset named:");
        if (!name || !name.trim()) return;
        send(frame, { type: "save_preset", track: rid, name: name.trim() });
      }]);
      items.push(["load preset ▸", () => {
        openPresetSubmenu(frame, mx, my, "load preset · " + rlabel, (n) => {
          send(frame, { type: "load_preset", track: rid, name: n });
        });
      }, true]);
      items.push(["reset with preset ▸", () => {
        openPresetSubmenu(frame, mx, my, "reset with preset · " + rlabel, (n) => {
          if (!window.confirm(`Reset "${rlabel}" and load "${n}"? New id, no transcript, no cache.`)) return;
          send(frame, { type: "load_preset", track: rid, name: n, mode: "reset" });
        });
      }, true]);
      items.push(["↺ reset region", () => {
        if (!window.confirm(`Reset region "${rlabel}"?\n\n`
          + "Kills its transcript and context and brings back a new region on "
          + "the same track — same settings, new id. Cannot be undone.")) return;
        send(frame, { type: "reset_track", track: rid });
      }]);
      items.push(["✕ delete region", () => {
        if (!window.confirm(`Delete region "${rlabel}"?\n\n`
          + "This kills the running region — cannot be undone.")) return;
        send(frame, { type: "kill_track", track: rid });
        refresh(frame);
      }]);
    }
    if (tr.container && !tr.track) {
      // no preset, no fields — the server names the region "untitled"
      items.push(["＋ insert region", () => {
        send(frame, { type: "insert_region", track: tr.container });
        refresh(frame);
      }]);
      items.push(["＋ insert region preset ▸", () => {
        openPresetSubmenu(frame, mx, my, "insert region · " + (tr.name || tr.container), (n) => {
          send(frame, { type: "insert_region", track: tr.container, presets: n });
          refresh(frame);
        });
      }, true]);
      if (tl.settingsClip) {
        items.push(["📋 insert region from " + tl.settingsClip.from, () => {
          if (!tl.settingsClip) return;
          send(frame, clipInsertFrame(tl.settingsClip.snap, tr.container));
          refresh(frame);
        }]);
      }
      items.push(["✕ delete track", () => {
        if (!window.confirm('Delete track "' + tr.name + '"?\n\n'
          + "Kills the region running on it and removes the lane. Cannot be undone.")) return;
        send(frame, { type: "delete_track", track: tr.container });
        refresh(frame);
      }]);
    }
    if (!items.length) return;
    items.forEach(([label, act, keepOpen]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", (cev) => {
        cev.stopPropagation();
        if (!keepOpen) closeTrackMenu(frame);
        act();
      });
      tl.menu.appendChild(b);
    });

    placeMenu(frame, ev.clientX, ev.clientY);
  }

  // ---- record grouping ----

  function groupActions(tl) {
    const matched = new Map();
    const stray = [];
    const unassigned = [];
    for (const a of tl.actions) {
      const ar = regionOf(a);
      if (ar == null) { unassigned.push(a); continue; }
      if (a.turn == null) { stray.push(a); continue; }
      const k = turnKey(ar, a.turn);
      if (!matched.has(k)) matched.set(k, []);
      matched.get(k).push(a);
    }
    const turnKeys = new Set(tl.turns.map((t) => turnKey(regionOf(t), t.turn)));
    const inflight = [];
    matched.forEach((acts, k) => {
      if (!turnKeys.has(k)) inflight.push({ key: k, track: regionOf(acts[0]), turn: acts[0].turn, actions: acts });
    });
    return { matched, stray, unassigned, inflight };
  }

  // change prompt — one popover on the region's span, one button per choice
  function changePromptPopover(frame, cp) {
    const pop = document.createElement("div");
    pop.className = "region-settle";
    pop.addEventListener("click", (ev) => ev.stopPropagation());
    const q = document.createElement("div");
    q.className = "sq-q";
    q.textContent = cp.text || "How would you like to change?";
    pop.appendChild(q);
    const row = document.createElement("div");
    row.className = "ql-settle";
    for (const choice of (cp.choices || [])) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sbtn";
      b.textContent = choice;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        send(frame, { type: "change_answer", token: cp.token, choice: choice });
        frame._tl.changePrompt = null;
        render(frame);
      });
      row.appendChild(b);
    }
    pop.appendChild(row);
    return pop;
  }

  function wireSettle(frame, pop, action) {
    pop.addEventListener("click", (ev) => ev.stopPropagation());
    pop.querySelectorAll("[data-settle]").forEach((b) => {
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        MX.feedRows.settle((obj) => frame.send(obj), action.id, b.dataset.settle);
        frame._tl.openRegion = null;
        render(frame);
        refresh(frame);
      });
    });
  }

  // ---- render ----

  // lane sub-label: resolved model id for an alias, else the raw model id
  function modelSub(tl, reg) {
    const row = (tl.modelRows || []).find((m) => m.id === reg.model);
    if (row && !row.version && row.resolved) return row.resolved;
    return reg.model || "";
  }

  function render(frame) {
    const tl = frame._tl;
    if (!tl || !tl.rows) return;
    closeTrackMenu(frame);
    tl.editing = null;
    const regions = tl.regions || [];
    const trackRows = tl.trackRows || [];
    const g = groupActions(tl);
    const ppm = PX_PER_MIN * tl.zoom;

    if (!trackRows.length && !tl.turns.length && !g.inflight.length && !g.stray.length && !g.unassigned.length) {
      tl.heads.innerHTML = "";
      tl.ruler.innerHTML = "";
      tl.rows.innerHTML = '<div class="empty">no turns this session — message a track</div>';
      const old = tl.right.querySelector("#playhead");
      if (old) old.remove();
      return;
    }

    let origin = Infinity;
    for (const t of tl.turns) if (t.started != null && t.started < origin) origin = t.started;
    for (const a of tl.actions) if (a.parked != null && a.parked < origin) origin = a.parked;
    if (!isFinite(origin)) origin = Date.now();
    const now = Date.now();
    const spanMs = Math.max(now - origin, 60000) + 4 * 60000;
    const xAt = (ms) => xOf(origin, ms, ppm);

    const W = xAt(origin + spanMs);
    tl.ruler.innerHTML = "";
    tl.ruler.style.width = W + "px";
    for (let m = 0; m * 60000 <= spanMs; m += 5) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = xAt(origin + m * 60000) + "px";
      tick.textContent = hhmm(origin + m * 60000);
      tl.ruler.appendChild(tick);
    }

    tl.heads.innerHTML = "";
    tl.rows.innerHTML = "";
    tl.rows.style.width = W + "px";

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

      const waiting = actionsAll.some((a) => gateColor(a) === "yellow");
      const pending = actionsAll.find((a) => isPending(a));
      const el = document.createElement("div");
      el.className = "region tl-span " + (waiting ? "yellow" : "white") +
        (inflightEntry ? " inflight" : "") +
        (tl.openRegion === regionId ? " settling" : "");
      el.style.left = xAt(start) + "px";
      el.style.width = wOf(end - start, ppm) + "px";
      el.innerHTML = '<span class="rlab">' + regionLabel(actionsAll) + "</span>";

      const rname = nameOf(tl, regionId);
      if (rname && wOf(end - start, ppm) >= RNAME_MIN_PX) {
        const layer = document.createElement("div");
        layer.className = "rname-layer";
        layer.innerHTML = '<span class="rname">' + esc(rname) + "</span>";
        el.appendChild(layer);
      }

      el.addEventListener("click", () => openLedger({ track: regionId }));

      const isLive = liveTrack && liveTrack.id === regionId;
      if (isLive) {
        el.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          tl.ctxRegion = (tl.ctxRegion === regionId) ? null : regionId;
          render(frame);
        });
        if (tl.ctxRegion === regionId) {
          const menu = document.createElement("div");
          menu.className = "region-ctxmenu";
          menu.addEventListener("click", (ev) => ev.stopPropagation());
          menu.innerHTML =
            '<button data-act="delete">&#10005; delete region</button>';
          menu.querySelector('[data-act="delete"]').addEventListener("click", () => {
            tl.ctxRegion = null;
            if (!window.confirm(`Delete region "${laneName || regionId}"?\n\nThis kills the running region — cannot be undone.`)) {
              render(frame);
              return;
            }
            send(frame, { type: "kill_track", track: liveTrack.id });
          });
          el.appendChild(menu);
        }
      }

      if (actionsAll.length) {
        const MARK_GAP = 23;
        const points = actionsAll
          .map((a) => ({ a, x: xOf(start, a.parked != null ? a.parked : start, ppm) }))
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
          const m = document.createElement("span");
          m.style.left = cl.x + "px";
          if (cl.items.length === 1) {
            const a = cl.items[0];
            m.className = "pip " + gateColor(a) + " tl-actionmark";
            m.textContent = symFor(a);
            m.title = (a.edge || a.action_type || "") + " " + getTarget(a);
            m.addEventListener("click", (ev) => {
              ev.stopPropagation();
              openLedger({ track: regionId, turn: a.turn });
            });
          } else {
            const worst = regionColor(cl.items);
            const grad = clusterGradient(cl.items.map(gateColor));
            m.className = "pip " + worst + " tl-actionmark tl-cluster";
            if (grad) m.style.backgroundImage = grad;
            m.textContent = String(cl.items.length);
            m.title = cl.items.length + " actions — click to view";
            m.addEventListener("click", (ev) => {
              ev.stopPropagation();
              openLedger({ track: regionId });
            });
          }
          el.appendChild(m);
        });
      } else {
        const m = document.createElement("span");
        m.className = "pip white tl-actionmark";
        m.style.left = "10px";
        m.textContent = "·";
        m.title = "no actions recorded this run";
        el.appendChild(m);
      }

      if (pending) {
        const marker = document.createElement("span");
        marker.className = "pip yellow tl-marker";
        marker.textContent = "!";
        marker.title = "waiting on you — click to settle";
        marker.addEventListener("click", (ev) => {
          ev.stopPropagation();
          tl.openRegion = (tl.openRegion === regionId) ? null : regionId;
          render(frame);
        });
        el.appendChild(marker);
        if (tl.openRegion === regionId) {
          const pop = document.createElement("div");
          pop.className = "region-settle";
          pop.innerHTML = settleHtml(pending);
          wireSettle(frame, pop, pending);
          el.appendChild(pop);
        }
      }

      const cp = tl.changePrompt;
      if (cp && cp.region === regionId) {
        el.classList.add("settling");
        el.appendChild(changePromptPopover(frame, cp));
      }
      return el;
    }

    const liveIds = new Set(regions.map((r) => r.id));
    const deadIds = [];
    const seenDead = new Set();
    for (const t of tl.turns) {
      const r = regionOf(t);
      if (r != null && !liveIds.has(r) && !seenDead.has(r)) {
        seenDead.add(r); deadIds.push(r);
      }
    }
    for (const a of tl.actions) {
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
        console.error("[timeline] invariant violated — track " + r.track +
          " carries more than one region:", regionsByTrack.get(r.track).id, r.id);
      } else {
        regionsByTrack.set(r.track, r);
      }
    }

    const containerOfRegion = new Map();
    for (const r of regions) if (r.track != null) containerOfRegion.set(r.id, r.track);
    for (const rid of deadIds) {
      if (containerOfRegion.has(rid)) continue;
      let found = null;
      for (const t of tl.turns) { if (regionOf(t) === rid && containerOf(t) != null) { found = containerOf(t); break; } }
      if (found == null) for (const a of tl.actions) { if (regionOf(a) === rid && containerOf(a) != null) { found = containerOf(a); break; } }
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
          name: t.name || "untitled",
          row_root: t.root || "",
          reg_name: reg ? (reg.name || reg.id)
                        : (lastRun ? nameOf(tl, lastRun) : ""),
          reg_ended: !reg,
          sub: reg ? modelSub(tl, reg) : "",
          track: reg,
          flagged: multiRegionTracks.has(t.id),
          regionIds: runs.length ? runs : (reg ? [reg.id] : []),
        };
      })
      .concat(tl.showEnded ? unattributedDeadIds.map((id) =>
        ({ id, container: null, name: nameOf(tl, id), row_root: "", reg_name: "no track",
           reg_ended: true, sub: "ended", track: null, flagged: false, regionIds: [id] })) : []);

    const spanByRegion = new Map();
    const rowByRegion = new Map();

    lanes.forEach((tr) => {
      const h = document.createElement("div");
      h.className = "tl-head";
      const top = document.createElement("div");
      top.className = "th-top";
      const txt = document.createElement("div");
      txt.className = "th-txt";

      const nameEl = document.createElement("div");
      nameEl.className = "th-name";
      nameEl.textContent = tr.name;
      nameEl.title = tr.name;
      if (tr.container) {
        inlineEdit(frame, nameEl, tr.name, (val) => {
          send(frame, { type: "edit_track_row", track: tr.container, fields: { name: val } });
        }, "track name");
      }
      txt.appendChild(nameEl);

      const regEl = document.createElement("div");
      regEl.className = "th-reg" + (tr.reg_ended ? " empty" : "");
      regEl.textContent = tr.reg_name || "no region";
      regEl.title = tr.reg_name || "no region";
      if (tr.track) {
        inlineEdit(frame, regEl, tr.reg_name || "", (val) => {
          send(frame, { type: "edit_track", track: tr.track.id, fields: { name: val } });
        }, "region name");
      }
      txt.appendChild(regEl);

      const subEl = document.createElement("div");
      subEl.className = "th-sub";
      subEl.textContent = tr.sub;
      subEl.title = tr.sub;
      txt.appendChild(subEl);

      top.appendChild(txt);
      if (tr.flagged) {
        const warn = document.createElement("span");
        warn.className = "tl-warn";
        warn.title = "more than one region on this track — only the first is shown";
        warn.textContent = "⚠ multiple regions";
        top.appendChild(warn);
      }
      h.appendChild(top);
      if (tr.track) {
        if (isClaudeModel(tr.track.model, tl.modelRows)) top.appendChild(cacheTtlToggle(frame, tr.track));
        if (isClaudeModel(tr.track.model, tl.modelRows)) top.appendChild(excludeDynamicToggle(frame, tr.track));
      }
      h.appendChild(rootLine(frame, tr));
      h.addEventListener("click", () => { if (tr.container) tl.lastTrackId = tr.container; });
      h.addEventListener("contextmenu", (ev) => openTrackMenu(frame, ev, tr));
      tl.heads.appendChild(h);

      const row = document.createElement("div");
      row.className = "tl-row";

      tr.regionIds.forEach((rid) => {
        const noStart = [];
        const turnsForRegion = tl.turns.filter((t) => {
          if (regionOf(t) !== rid) return false;
          if (t.started == null) { noStart.push(t); return false; }
          return true;
        });
        const inflightForRegion = g.inflight.find((ig) => ig.track === rid) || null;
        const spanEl = makeRegionSpan(rid, turnsForRegion, inflightForRegion, tr.track, tr.name);
        if (spanEl) {
          row.appendChild(spanEl);
          spanByRegion.set(rid, spanEl);
          rowByRegion.set(rid, row);
        }

        noStart.forEach((t) => {
          const tick = document.createElement("div");
          tick.className = "tl-tick";
          tick.style.left = xAt(t.ended != null ? t.ended : now) + "px";
          tick.title = "turn " + (t.turn == null ? "?" : t.turn) + " — no start time recorded";
          tick.addEventListener("click", (ev) => { ev.stopPropagation(); openLedger({ track: rid, turn: t.turn }); });
          row.appendChild(tick);
        });

        g.stray.filter((a) => regionOf(a) === rid).forEach((a) => {
          const tick = document.createElement("div");
          tick.className = "tl-tick";
          tick.style.left = xAt(a.parked != null ? a.parked : now) + "px";
          tick.title = (a.edge || a.action_type || "") + " " + getTarget(a);
          tick.addEventListener("click", (ev) => { ev.stopPropagation(); openLedger({ track: rid }); });
          row.appendChild(tick);
        });
      });

      tl.rows.appendChild(row);
    });

    // handoffs — a tick on each end span and one vertical line between the lanes
    for (const hs of (tl.handoffs || [])) {
      const fromSpan = spanByRegion.get(hs.from);
      const toSpan   = spanByRegion.get(hs.to);
      if (!fromSpan || !toSpan || fromSpan === toSpan) continue;
      const x = xAt(hs.at);
      const wire = hs.wire === "message" ? "message" : "file";
      const count = hs.count == null ? 0 : hs.count;

      const outTick = document.createElement("div");
      outTick.className = "tl-handoff out";
      outTick.style.left = (x - (parseFloat(fromSpan.style.left) || 0)) + "px";
      outTick.title = "→ " + nameOf(tl, hs.to) + " · " + count + " file(s)";
      outTick.addEventListener("click", (ev) => { ev.stopPropagation(); openLedger({ track: hs.from }); });
      fromSpan.appendChild(outTick);

      const inTick = document.createElement("div");
      inTick.className = "tl-handoff in";
      inTick.style.left = (x - (parseFloat(toSpan.style.left) || 0)) + "px";
      inTick.title = "← " + nameOf(tl, hs.from) + " · " + count + " file(s)";
      inTick.addEventListener("click", (ev) => { ev.stopPropagation(); openLedger({ track: hs.from }); });
      toSpan.appendChild(inTick);

      const fromRow = rowByRegion.get(hs.from);
      const toRow   = rowByRegion.get(hs.to);
      const y1 = fromRow.offsetTop + fromRow.offsetHeight / 2;
      const y2 = toRow.offsetTop + toRow.offsetHeight / 2;
      const line = document.createElement("div");
      line.className = "tl-handoff-line " + wire;
      line.style.left = x + "px";
      line.style.top = Math.min(y1, y2) + "px";
      line.style.height = Math.abs(y2 - y1) + "px";
      line.title = nameOf(tl, hs.from) + " → " + nameOf(tl, hs.to) + " · " + count + " file(s)";
      line.addEventListener("click", (ev) => { ev.stopPropagation(); openLedger({ track: hs.from }); });
      tl.rows.appendChild(line);
    }

    if (g.unassigned.length) {
      const h = document.createElement("div");
      h.className = "tl-head";
      h.innerHTML =
        '<div class="th-top"><div class="th-txt">' +
          '<div class="th-name">unassigned</div>' +
          '<div class="th-reg empty">no region</div>' +
          '<div class="th-sub">no track</div>' +
        "</div></div>" +
        '<div class="th-root empty" title="these records name no track, so there '
          + 'is no root to state">no root — records with no track</div>';
      tl.heads.appendChild(h);

      const row = document.createElement("div");
      row.className = "tl-row";
      g.unassigned.forEach((a) => {
        const tick = document.createElement("div");
        tick.className = "tl-tick";
        tick.style.left = xAt(a.parked != null ? a.parked : now) + "px";
        tick.title = (a.edge || a.action_type || "") + " " + getTarget(a);
        tick.addEventListener("click", (ev) => { ev.stopPropagation(); openLedger({}); });
        row.appendChild(tick);
      });
      tl.rows.appendChild(row);
    }

    const old = tl.right.querySelector("#playhead");
    if (old) old.remove();
    if (tl.showPlayhead) {
      const ph = document.createElement("div");
      ph.id = "playhead";
      ph.style.left = xAt(now) + "px";
      tl.right.appendChild(ph);
    }
  }

  // ---- widget ----

  MX.registerWidget("timeline", {
    mount(frame) {
      ensureStyle();

      const tl = frame._tl = {
        regions: [], trackRows: [], names: {}, modelRows: [],
        turns: [], actions: [],
        openRegion: null, ctxRegion: null, settingsClip: null, editing: null,
        changePrompt: null, handoffs: [],
        presetNames: null, presetFetch: null,
        showEnded: false, showPlayhead: false, addPhase: false,
        refreshMin: 5, refreshTimer: null,
        zoom: loadZoom(),
        lastTrackId: null,
      };

      const el = document.createElement("div");
      el.className = "mx-timeline";
      el.innerHTML =
        '<div id="tlScroll">' +
          '<div id="tlHeads"><div class="ruler-pad">' +
            '<div class="tl-ruler-controls">' +
              '<label class="tl-endtoggle"><input type="checkbox" id="tlShowEnded"> show ended</label>' +
              '<label class="tl-endtoggle"><input type="checkbox" id="tlPlayhead"> playhead</label>' +
              '<label class="tl-endtoggle"><input type="checkbox" id="tlAddPhase"> add phase</label>' +
              '<label class="tl-refresh">refresh every ' +
                '<input type="number" id="tlRefreshMin" min="1" step="1" value="' + tl.refreshMin + '"> min</label>' +
            "</div>" +
            '<span class="tl-zoom" title="timeline zoom">' +
              '<button class="tb-btn" id="tlZoomOut" type="button">−</button>' +
              '<span class="tl-zoomlbl" id="tlZoomLbl"></span>' +
              '<button class="tb-btn" id="tlZoomIn" type="button">+</button>' +
            "</span>" +
          "</div>" +
          '<div id="tlHeadRows"></div>' +
          '<div id="tlHeadActions"></div></div>' +
          '<div class="split v" id="tlSplit" data-split="tlheads"></div>' +
          '<div id="tlRight"><div id="tlRuler"></div><div id="tlRows"></div></div>' +
        "</div>" +
        '<div id="tlCtxMenu"></div>';
      frame.host.appendChild(el);

      tl.el = el;
      tl.heads = el.querySelector("#tlHeadRows");
      tl.rows = el.querySelector("#tlRows");
      tl.ruler = el.querySelector("#tlRuler");
      tl.right = el.querySelector("#tlRight");
      tl.menu = el.querySelector("#tlCtxMenu");

      el.addEventListener("click", (ev) => {
        if (tl.menu && tl.menu.contains(ev.target)) return;
        closeTrackMenu(frame);
      }, true);
      el.querySelector("#tlShowEnded").addEventListener("change", (ev) => {
        tl.showEnded = ev.target.checked;
        render(frame);
      });
      el.querySelector("#tlPlayhead").addEventListener("change", (ev) => {
        tl.showPlayhead = ev.target.checked;
        render(frame);
      });
      el.querySelector("#tlAddPhase").addEventListener("change", (ev) => {
        tl.addPhase = ev.target.checked;
      });
      el.querySelector("#tlRefreshMin").addEventListener("change", (ev) => {
        const n = Number(ev.target.value);
        tl.refreshMin = Number.isFinite(n) && n > 0 ? n : tl.refreshMin;
        ev.target.value = tl.refreshMin;
        startRefreshTimer(frame);
        refresh(frame);
      });

      const lbl = el.querySelector("#tlZoomLbl");
      function paintZoom() { if (lbl) lbl.textContent = Math.round(tl.zoom * 100) + "%"; }
      function setZoom(v) {
        tl.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
        saveZoom(tl.zoom);
        paintZoom();
        render(frame);
      }
      el.querySelector("#tlZoomOut").addEventListener("click", () => setZoom(tl.zoom / ZOOM_STEP));
      el.querySelector("#tlZoomIn").addEventListener("click", () => setZoom(tl.zoom * ZOOM_STEP));
      paintZoom();

      // head actions: one button, no fields — the server names the track
      // "untitled" and gives it the session root
      const headActions = el.querySelector("#tlHeadActions");
      const addTrack = document.createElement("button");
      addTrack.type = "button";
      addTrack.id = "tlAddTrack";
      addTrack.className = "tb-btn";
      addTrack.textContent = "+ track";
      addTrack.title = "add a lane — named untitled, session root, no region";
      addTrack.addEventListener("click", () => {
        send(frame, { type: "create_track" });
      });
      headActions.appendChild(addTrack);

      // escape closes this instance's popover, change prompt, context region, or lane menu
      tl.onKey = (e) => {
        if (e.key !== "Escape") return;
        const menuOpen = !!(tl.menu && tl.menu.classList.contains("open"));
        if (tl.openRegion == null && tl.ctxRegion == null && tl.changePrompt == null && !menuOpen) return;
        tl.openRegion = null;
        tl.ctxRegion = null;
        tl.changePrompt = null;
        closeTrackMenu(frame);
        render(frame);
      };
      document.addEventListener("keydown", tl.onKey);

      frame.subscribe(["ade_init", "track_list", "track_created", "track_removed",
        "region_replaced", "change_prompt", "feed"]);
      frame.send({ type: "roster", inst: frame.id });

      fetch("/api/library/models").then((r) => r.json()).then((d) => {
        tl.modelRows = (d && d.list) || [];
        render(frame);
      }).catch(() => {});

      startRefreshTimer(frame);
      render(frame);
      refresh(frame);
    },

    unmount(frame) {
      const tl = frame._tl;
      if (!tl) return;
      if (tl.refreshTimer) clearInterval(tl.refreshTimer);
      if (tl.onKey) document.removeEventListener("keydown", tl.onKey);
      frame._tl = null;
    },

    onFrame(frame, msg) {
      const tl = frame._tl;
      if (!tl) return;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        tl.regions = msg.tracks || [];
        tl.trackRows = msg.rows || [];
        tl.names = Object.assign({}, tl.names, msg.names || {});
        render(frame);
        return;
      }

      if (msg.type === "track_created") {
        if (msg.track) tl.regions = tl.regions.concat([msg.track]);
        render(frame);
        return;
      }

      if (msg.type === "track_removed") {
        tl.regions = tl.regions.filter((t) => t.id !== msg.id);
        render(frame);
        refresh(frame);
        return;
      }

      if (msg.type === "region_replaced") {
        refresh(frame);
        return;
      }

      if (msg.type === "change_prompt") {
        const live = (tl.regions || []).some((r) => r && r.id === msg.region);
        if (!live) return;
        tl.changePrompt = msg;
        render(frame);
        return;
      }

      if (msg.type === "feed") {
        const all = msg.records || [];
        const files = MX.derived.deriveFileHandoffs(all);
        tl.handoffs = MX.derived.mergeDerived(files, []);
        tl.turns = all.filter((r) => r.kind === "turn");
        tl.actions = all.filter((r) => r.kind === "action")
          .filter((r) => !(r.action_type === "gate" && r.merged))
          .map((r) => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
        render(frame);
      }
    },
  });
})();
