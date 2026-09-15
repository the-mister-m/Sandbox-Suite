// queue log widget — ledger feed across all tracks, gate settle inline
//
// Subscribes to track_list, feed, ledger_detail. Requests feed and
// ledger_detail tagged with this instance's id; ignores tagged replies
// meant for another instance. Untagged replies (broadcast refreshes
// after a settle fired by any widget) are accepted by every instance.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const QL_COLS = [
    { key: "time",    label: "time",    w: 62,  min: 48  },
    { key: "action",  label: "action",  w: 118, min: 80  },
    { key: "target",  label: "target",  w: 240, min: 90  },
    { key: "track",   label: "track",   w: 130, min: 70  },
    { key: "summary", label: "summary", w: 280, min: 90  },
    { key: "model",   label: "model",   w: 110, min: 60  },
  ];
  const QL_COLS_KEY = "ade.queuelog.cols";

  function colsOrDefault(stored) {
    if (!Array.isArray(stored)) return QL_COLS.map((c) => Object.assign({}, c));
    const byKey = new Map(QL_COLS.map((c) => [c.key, c]));
    const out = [];
    for (const s of stored) {
      const def = byKey.get(s && s.key);
      if (!def || out.some((o) => o.key === def.key)) continue;
      const w = Number(s.w);
      out.push(Object.assign({}, def, { w: (isFinite(w) && w >= def.min) ? w : def.w }));
    }
    for (const def of QL_COLS) {
      if (!out.some((o) => o.key === def.key)) out.push(Object.assign({}, def));
    }
    return out;
  }

  function loadCols() {
    let stored = null;
    try { stored = JSON.parse(window.localStorage.getItem(QL_COLS_KEY)); } catch (e) { stored = null; }
    return colsOrDefault(stored);
  }

  function saveCols(cols) {
    try {
      window.localStorage.setItem(QL_COLS_KEY,
        JSON.stringify(cols.map((c) => ({ key: c.key, w: c.w }))));
    } catch (e) { /* best effort */ }
  }

  function applyGrid(st) {
    if (!st.wrap) return;
    st.wrap.style.setProperty("--ql-grid", st.cols.map((c) => c.w + "px").join(" "));
  }

  function esc(s) {
    s = (s === undefined || s === null) ? "" : String(s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }

  function cacheTtlToggle(t, frame) {
    const wrap = document.createElement("span");
    wrap.className = "ql-ttl";
    wrap.style.display = "inline-flex";
    wrap.style.gap = "3px";
    wrap.style.marginLeft = "6px";
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
        cur = v;
        t.settings = Object.assign({}, t.settings, { claude_cache_ttl: v });
        paint();
        frame.send({ type: "edit_track", track: t.id, fields: { claude_cache_ttl: v } });
      };
      wrap.appendChild(b);
    });
    paint();
    return wrap;
  }

  function excludeDynamicToggle(t, frame) {
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
      t.settings = Object.assign({}, t.settings, { claude_exclude_dynamic: next });
      paint();
      frame.send({ type: "edit_track", track: t.id, fields: { claude_exclude_dynamic: next } });
    };
    wrap.appendChild(b);
    paint();
    return wrap;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function getTarget(r) {
    const p = r.payload || {};
    return p.path || p.command || p.url || p.target || p.query || p.note || "—";
  }

  function regionOf(r) {
    if (!r) return null;
    if (r.region != null) return r.region;
    return r.schema === 1 ? r.track : null;
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

  function isFailedWrite(r) {
    if (r.failed) return true;
    if (r.action_type !== "write") return false;
    return /^\[WRITE/.test(r.summary || "");
  }

  function settleHtml(r) {
    return '<div class="ql-settle">' +
      '<span class="sq-q">' + esc(r.edge || r.action_type || "") + " " + esc(getTarget(r)) + " — waiting on you</span>" +
      '<button class="sbtn approve" data-settle="approve">approve</button>' +
      '<button class="sbtn deny" data-settle="deny">deny</button>' +
      '<button class="sbtn queue" data-settle="queue">queue</button>' +
    "</div>";
  }

  function ioBox(label, text, note, extra) {
    const head = '<div class="io-l">' + esc(label) +
      (extra ? '<span class="io-x">' + esc(extra) + "</span>" : "") + "</div>";
    if (text !== null && text !== undefined && text !== "") {
      return '<div class="ql-io-box">' + head +
             '<div class="scrollbox">' + esc(text) + "</div></div>";
    }
    return '<div class="ql-io-box">' + head +
           '<div class="io-blank">' + esc(note || "—") + "</div></div>";
  }

  function inputText(r, d) {
    const src = d || r;
    if (src.prompt) return src.prompt;
    if (src.gate_prompt) return src.gate_prompt;
    const p = src.payload || {};
    if (p.command) return p.command;
    const chosen = (p.args && typeof p.args === "object") ? p.args : p;
    const keys = Object.keys(chosen).filter(
      (k) => k !== "target" && k !== "args" && !/^prior/.test(k)
           && chosen[k] !== null && chosen[k] !== undefined && chosen[k] !== "");
    if (!keys.length) return null;
    return keys.map((k) => k + ": " +
      (typeof chosen[k] === "string" ? chosen[k] : JSON.stringify(chosen[k], null, 2))
    ).join("\n");
  }

  function bytesNote(n) {
    if (!n) return "";
    return n >= 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B";
  }

  function detailEl(r, st) {
    const d = st.details[r.id] || null;
    const waiting = !d && st.asked[r.id];
    const miss = "— (record not found)";
    const inp = inputText(r, d);
    const out = d ? d.result : r.result;
    const blobbedIn  = !inp && (r.prompt_blob || r.gate_prompt_blob);
    const blobbedOut = !out && r.result_blob;

    const el = document.createElement("div");
    el.className = "ql-detail";
    el.addEventListener("click", (ev) => ev.stopPropagation());
    el.innerHTML = '<div class="ql-io">' +
      ioBox("input",  inp, waiting && blobbedIn  ? "— loading…" : (blobbedIn  ? miss : "—")) +
      ioBox("output", out, waiting && blobbedOut ? "— loading…" : (blobbedOut ? miss : "—"),
            bytesNote(r.result_bytes)) +
    "</div>";
    return el;
  }

  function requestDetail(frame, st, id) {
    if (!id || st.asked[id]) return;
    st.asked[id] = true;
    frame.send({ type: "ledger_detail", id, inst: frame.id });
  }

  function settle(frame, id, action) {
    MX.feedRows.settle(frame.send, id, action);
  }

  function nameOf(st, regionId) {
    const t = st.tracks.find((x) => x.id === regionId);
    return (t && t.name) || st.names[regionId] || regionId;
  }

  function renderBar(frame, st) {
    if (!st.bar) return;
    const tracks = st.tracks;
    for (const t of tracks) if (!(t.id in st.visible)) st.visible[t.id] = true;

    st.bar.innerHTML = "";
    tracks.forEach((t) => {
      const chip = document.createElement("div");
      chip.className = "trackchip " + (st.visible[t.id] !== false ? "on" : "off");
      chip.innerHTML =
        '<span class="tc-n">' + esc(t.name || t.id) + "</span>" +
        (t.model ? '<span class="chip">' + esc(t.model) + "</span>" : "");
      chip.onclick = () => { st.visible[t.id] = !(st.visible[t.id] !== false); render(frame); };
      // claude check reads the region row's provider field, not a model name list
      if (t.provider === "claude") chip.appendChild(cacheTtlToggle(t, frame));
      if (t.provider === "claude") chip.appendChild(excludeDynamicToggle(t, frame));
      st.bar.appendChild(chip);
    });

    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    st.bar.appendChild(spacer);

    const all = document.createElement("button");
    all.className = "tb-btn"; all.textContent = "all";
    all.onclick = () => { tracks.forEach((t) => { st.visible[t.id] = true; }); render(frame); };
    st.bar.appendChild(all);

    const none = document.createElement("button");
    none.className = "tb-btn"; none.textContent = "none";
    none.onclick = () => { tracks.forEach((t) => { st.visible[t.id] = false; }); render(frame); };
    st.bar.appendChild(none);
  }

  function renderHead(frame, st) {
    if (!st.head) return;
    st.head.innerHTML = "";
    st.cols.forEach((c, i) => {
      const cell = document.createElement("div");
      cell.className = "qlh";
      cell.draggable = true;
      cell.dataset.key = c.key;
      cell.innerHTML = '<span class="qlh-l">' + esc(c.label) + "</span>" +
                       '<span class="qlh-grip" draggable="false"></span>';

      cell.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", c.key);
        cell.classList.add("dragging");
      });
      cell.addEventListener("dragend", () => renderHead(frame, st));
      cell.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        cell.classList.add("dragover");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("dragover"));
      cell.addEventListener("drop", (ev) => {
        ev.preventDefault();
        cell.classList.remove("dragover");
        const from = st.cols.findIndex((x) => x.key === ev.dataTransfer.getData("text/plain"));
        if (from < 0 || from === i) return;
        const [moved] = st.cols.splice(from, 1);
        st.cols.splice(i, 0, moved);
        saveCols(st.cols);
        applyGrid(st);
        renderHead(frame, st);
        render(frame);
      });

      const grip = cell.querySelector(".qlh-grip");
      grip.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const startX = ev.clientX;
        const startW = c.w;
        grip.setPointerCapture(ev.pointerId);
        grip.classList.add("resizing");
        const move = (e) => {
          c.w = Math.max(c.min, Math.round(startW + (e.clientX - startX)));
          applyGrid(st);
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          grip.removeEventListener("pointercancel", up);
          grip.classList.remove("resizing");
          saveCols(st.cols);
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
        grip.addEventListener("pointercancel", up);
      });

      st.head.appendChild(cell);
    });
  }

  function render(frame) {
    const st = frame._ql;
    if (!st) return;
    renderBar(frame, st);
    if (!st.feed) return;

    const byId = new Map(st.tracks.map((t) => [t.id, t]));
    const mergeGates = frame.options.merge_gates !== false;

    const rows = st.records
      .filter((r) => (mergeGates ? !(r.action_type === "gate" && r.merged) : true))
      .filter((r) => st.visible[regionOf(r)] !== false)
      .map((r) => (mergeGates && r.gate_id
        ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer })
        : r));
    rows.sort((a, b) => (b.parked || 0) - (a.parked || 0));

    st.feed.innerHTML = "";
    if (!rows.length) {
      st.feed.innerHTML = '<div class="empty">no records</div>';
      return;
    }

    rows.forEach((r) => {
      const trk = byId.get(regionOf(r));
      const color = gateColor(r);
      const pending = isPending(r);
      const merged = r.action_type !== "gate" && !!r.gate_id;
      const denied = color === "red";
      const failed = isFailedWrite(r);
      const isUser = r.driver === "human";
      const target = getTarget(r);
      const model = trk ? trk.model : (r.vessel || "");
      const trackName = nameOf(st, regionOf(r));
      const open = !!st.open[r.id];

      const cell = {
        time:    '<div class="ql-t">' + fmtTime(r.parked) + "</div>",
        action:  '<div><span class="ql-edge ' + color + '">' + esc(r.edge || r.action_type || "?") + "</span></div>",
        target:  '<div class="ql-tgt" title="' + escAttr(target) + '">' + esc(target) +
                   (isUser ? '<span class="ql-you">you</span>' : "") + "</div>",
        track:   '<div class="ql-tr" title="' + escAttr(trackName) + '">' + esc(trackName) + "</div>",
        summary: '<div class="ql-sum" title="' + escAttr(r.summary || "") + '">' + esc(r.summary || "") + "</div>",
        model:   '<div class="ql-mdl" title="' + escAttr(model) + '">' + esc(model) + "</div>",
      };

      const row = document.createElement("div");
      row.className = "qlrow ql-cols"
        + (merged ? " merged" : "")
        + (pending ? " pending" : "")
        + (denied ? " denied" : "")
        + (failed ? " failed" : "")
        + (open ? " is-open" : "");

      row.innerHTML = st.cols.map((c) => cell[c.key] || "<div></div>").join("") +
        (pending ? settleHtml(r) : "");

      row.addEventListener("click", () => {
        st.open[r.id] = !st.open[r.id];
        if (st.open[r.id]) requestDetail(frame, st, r.id);
        render(frame);
      });
      if (pending) {
        row.querySelectorAll("[data-settle]").forEach((b) => {
          b.addEventListener("click", (ev) => { ev.stopPropagation(); settle(frame, r.id, b.dataset.settle); });
        });
      }

      st.feed.appendChild(row);
      if (open) st.feed.appendChild(detailEl(r, st));
    });
  }

  const QL_CSS = `
.mx-queue-log{ display:flex; flex-direction:column; height:100%; min-height:0; }
.mx-queue-log .qlBar{
  flex-shrink:0; display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:8px 10px; background:var(--surface-1); border-bottom:1px solid var(--gridline);
}
.mx-queue-log .trackchip{
  display:flex; align-items:center; gap:6px; padding:4px 9px; border-radius:14px;
  background:var(--surface-2); border:1px solid var(--border); cursor:pointer;
  font-size:11.5px; color:var(--text-3); user-select:none; white-space:nowrap;
}
.mx-queue-log .trackchip.on{ background:var(--surface-3); border-color:var(--border-2); color:var(--text-1); }
.mx-queue-log .trackchip.off{ opacity:.42; }
.mx-queue-log .trackchip .tc-n{ font-weight:600; }

.mx-queue-log .qlWrap{
  --ql-grid: 62px 118px 240px 130px 280px 110px;
  flex:1; display:flex; flex-direction:column; min-height:0; overflow-x:auto;
}
.mx-queue-log .ql-cols{
  display:grid; grid-template-columns:var(--ql-grid); gap:10px; align-items:center;
  min-width:max-content;
}

.mx-queue-log .qlh{ position:relative; cursor:grab; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-queue-log .qlh:active{ cursor:grabbing; }
.mx-queue-log .qlh.dragging{ opacity:.4; }
.mx-queue-log .qlh.dragover{ box-shadow:inset 2px 0 0 var(--text-2); }
.mx-queue-log .qlh-grip{
  position:absolute; top:-6px; bottom:-6px; right:-8px; width:11px;
  cursor:col-resize; z-index:2;
}
.mx-queue-log .qlh-grip::after{
  content:''; position:absolute; top:0; bottom:0; left:4px; width:1px;
  background:var(--border); opacity:0; transition:opacity .12s;
}
.mx-queue-log .qlh-grip:hover::after, .mx-queue-log .qlh-grip.resizing::after{ opacity:1; background:var(--text-3); }
.mx-queue-log .qlHead{
  flex-shrink:0; padding:6px 12px; background:var(--surface-2);
  border-bottom:1px solid var(--border); font-size:10px; text-transform:uppercase;
  letter-spacing:.06em; color:var(--text-4); user-select:none;
}
.mx-queue-log .qlFeed{ flex:1; overflow-y:auto; min-height:0; padding:3px 0; }

.mx-queue-log .qlrow{
  padding:6px 12px; border-bottom:1px solid var(--gridline);
  font-size:11.5px; cursor:pointer; color:var(--text-2);
}
.mx-queue-log .qlrow.merged{
  border:1px solid var(--border-2); border-radius:4px;
  margin:2px 6px; border-bottom:1px solid var(--border-2);
}
.mx-queue-log .qlrow.pending{ background:var(--fill-yellow); border-color:var(--gate-yellow); }
.mx-queue-log .qlrow.denied { background:var(--fill-red); }
.mx-queue-log .qlrow.is-open{ background:rgba(255,255,255,0.045); }

.mx-queue-log .ql-edge{
  font-family:var(--mono); font-size:10.5px; font-weight:700; letter-spacing:.02em;
  padding:2px 7px; border-radius:3px; justify-self:start; white-space:nowrap;
  border:1px solid currentColor;
}
.mx-queue-log .ql-edge.white { color:var(--gate-white); background:transparent; }
.mx-queue-log .ql-edge.green { color:var(--gate-green); background:var(--fill-green); }
.mx-queue-log .ql-edge.blue  { color:var(--gate-blue);  background:var(--fill-blue); }
.mx-queue-log .ql-edge.yellow{ color:var(--gate-yellow); background:var(--fill-yellow); }
.mx-queue-log .ql-edge.red   { color:var(--gate-red);   background:var(--fill-red); }
.mx-queue-log .qlrow.pending .ql-edge{ animation:qlpulse 1.6s ease-in-out infinite; }
@keyframes qlpulse{ 0%,100%{ opacity:1 } 50%{ opacity:.5 } }

.mx-queue-log .ql-t   { font-family:var(--mono); font-size:10.5px; color:var(--text-4); }
.mx-queue-log .ql-tgt { font-family:var(--mono); color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-queue-log .ql-sum { color:var(--text-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-queue-log .ql-tr  { color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-queue-log .ql-mdl { font-size:10.5px; color:var(--text-4); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-queue-log .qlrow.failed .ql-tgt{ text-decoration:line-through; color:var(--text-4); }
.mx-queue-log .ql-you{ font-size:9.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-4); margin-left:5px; }

.mx-queue-log .ql-settle{
  grid-column:1 / -1; display:flex; align-items:center; gap:8px;
  margin-top:6px; padding-top:6px; border-top:1px dashed var(--gate-yellow);
}
.mx-queue-log .ql-settle .sq-q{ flex:1; font-size:11px; color:var(--gate-yellow); }
.mx-queue-log .sbtn{
  font:inherit; font-size:10.5px; padding:3px 12px; border-radius:3px; cursor:pointer;
  background:var(--surface-3); color:var(--text-2); border:1px solid var(--border-2);
}

.mx-queue-log .ql-detail{
  padding:2px 12px 12px 12px; background:rgba(0,0,0,0.16);
  border-bottom:1px solid var(--gridline);
}
.mx-queue-log .qlrow.merged + .ql-detail{ margin:0 6px; border-radius:0 0 4px 4px; }
.mx-queue-log .ql-io{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
@media (max-width:1100px){ .mx-queue-log .ql-io{ grid-template-columns:1fr; } }
.mx-queue-log .ql-io-box .io-l{
  display:flex; align-items:baseline; gap:8px;
  font-size:9.5px; text-transform:uppercase; letter-spacing:.07em;
  color:var(--text-4); margin:8px 0 3px;
}
.mx-queue-log .ql-io-box .io-l .io-x{ font-size:9px; letter-spacing:.04em; color:var(--text-4); opacity:.75; }
.mx-queue-log .ql-io-box .scrollbox{ min-height:96px; max-height:340px; }
.mx-queue-log .ql-io-box .io-blank{
  font-size:11px; color:var(--text-4); font-style:italic;
  padding:6px 8px; border-left:2px solid var(--border); background:var(--surface-2);
}
`;

  let _styleInjected = false;
  function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    const style = document.createElement("style");
    style.textContent = QL_CSS;
    document.head.appendChild(style);
  }

  MX.registerWidget("queue_log", {
    mount(frame) {
      injectStyle();

      const st = frame._ql = {
        tracks: [],
        names: {},
        feedDirtyTimer: null,
        records: [],
        visible: {},
        open: {},
        details: {},
        asked: {},
        cols: loadCols(),
      };

      const wrap = document.createElement("div");
      wrap.className = "mx-queue-log";
      wrap.innerHTML =
        '<div class="qlBar"></div>' +
        '<div class="qlWrap">' +
          '<div class="qlHead ql-cols"></div>' +
          '<div class="qlFeed"></div>' +
        "</div>";
      frame.host.appendChild(wrap);

      st.bar  = wrap.querySelector(".qlBar");
      st.wrap = wrap.querySelector(".qlWrap");
      st.head = wrap.querySelector(".qlHead");
      st.feed = wrap.querySelector(".qlFeed");

      applyGrid(st);
      renderHead(frame, st);
      render(frame);

      frame.subscribe(["track_list", "ade_init", "feed", "feed_dirty", "ledger_detail"]);
      frame.send({ type: "roster", inst: frame.id });
      frame.send({ type: "feed", inst: frame.id });
    },

    unmount(frame) {
      const st = frame._ql;
      if (st && st.feedDirtyTimer) clearTimeout(st.feedDirtyTimer);
      frame._ql = null;
    },

    onFrame(frame, msg) {
      const st = frame._ql;
      if (!st) return;
      if (msg.inst !== undefined && msg.inst !== null && msg.inst !== frame.id) return;

      if (msg.type === "track_list" || msg.type === "ade_init") {
        st.tracks = msg.tracks || [];
        st.names = Object.assign({}, st.names, msg.names || {});
        render(frame);
        return;
      }
      if (msg.type === "feed_dirty") {
        if (st.feedDirtyTimer) clearTimeout(st.feedDirtyTimer);
        st.feedDirtyTimer = setTimeout(() => {
          st.feedDirtyTimer = null;
          frame.send({ type: "feed", inst: frame.id });
        }, 1000);
        return;
      }
      if (msg.type === "feed") {
        st.records = (msg.records || []).filter((r) => r.kind === "action");
        for (const r of st.records) {
          const cached = st.details[r.id];
          if (cached && cached.outcome !== r.outcome) {
            delete st.details[r.id];
            delete st.asked[r.id];
            if (st.open[r.id]) requestDetail(frame, st, r.id);
          }
        }
        render(frame);
        return;
      }
      if (msg.type === "ledger_detail") {
        const d = msg.detail;
        if (d && d.id) { st.details[d.id] = d; if (st.open[d.id]) render(frame); }
        return;
      }
    },

    onOption(frame, key) {
      if (key === "merge_gates") render(frame);
    },
  });
})();
