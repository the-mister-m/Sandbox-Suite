// agent strip widget — one chip per track, ported from static/js/ade/agentstrip.js
//
// Same look, same chip states, same popover. Only the wire changed: the
// old ctx.getTracks/ctx.send pair is now the frame contract, and the three
// ledger-row helpers live in widgets/shared/feed-rows.js.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function esc(s) {
    s = (s === undefined || s === null) ? "" : String(s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }

  function trackById(s, id) { return (s.tracks || []).find((t) => t.id === id) || null; }

  function queued(s, id) {
    if (s.feedGates[id]) return true;
    const set = s.liveGates[id];
    return !!(set && set.size);
  }

  function stateOf(s, id) {
    if (queued(s, id)) return "queue";
    const p = s.phase[id] || "idle";
    return (p && p !== "idle") ? "busy" : "idle";
  }

  function ctxWarned(s, id) { return !!s.ctxWarn[id]; }

  function tipFor(s, id, name) {
    let head = "";
    const w = s.ctxWarn[id];
    if (w) {
      const pct = w.cap ? Math.round(100 * w.peak / w.cap) : null;
      head = "CONTEXT " + (pct == null ? "past 75%" : pct + "% of cap")
           + " (" + Number(w.peak || 0).toLocaleString() + " / "
           + Number(w.cap || 0).toLocaleString() + ") — resets at 100%. ";
    }
    if (queued(s, id)) return head + name + " — waiting on you (gate). Click for its queue/log.";
    const p = s.phase[id] || "idle";
    return head + name + " — " + p + ". Click for its queue/log.";
  }

  function buildChip(frame, el, id, name) {
    const s = frame._strip;
    const state = stateOf(s, id);
    el.className = "ag-chip ag-" + state + (ctxWarned(s, id) ? " ag-ctxwarn" : "");
    el.dataset.track = id;

    const face = document.createElement("span");
    face.className = "ag-face";
    face.setAttribute("role", "button");
    face.tabIndex = 0;
    face.title = tipFor(s, id, name);

    const dot = document.createElement("span");
    dot.className = "ag-dot";
    face.appendChild(dot);

    const word = document.createElement("span");
    word.className = "ag-name";
    const chars = [...(name || "?")];
    chars.forEach((ch, i) => {
      const c = document.createElement("span");
      c.className = "ag-l";
      c.style.animationDelay = (i * 0.06).toFixed(2) + "s";
      c.textContent = ch;
      word.appendChild(c);
    });
    face.appendChild(word);

    const tail = document.createElement("span");
    tail.className = "ag-dots";
    ["·", "·", "·"].forEach((ch, i) => {
      const c = document.createElement("span");
      c.className = "ag-l";
      c.style.animationDelay = ((chars.length + i) * 0.06).toFixed(2) + "s";
      c.textContent = ch;
      tail.appendChild(c);
    });
    face.appendChild(tail);

    el.appendChild(face);

    const kill = document.createElement("button");
    kill.type = "button";
    kill.className = "ag-kill";
    kill.textContent = "stop";
    kill.title = "stop " + name + "'s current run (the seat stays)";
    el.appendChild(kill);

    face.addEventListener("click", (ev) => { ev.stopPropagation(); togglePopover(frame, el, id, name); });
    face.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); togglePopover(frame, el, id, name); }
    });
    kill.addEventListener("click", (ev) => {
      ev.stopPropagation();
      frame.send({ type: "stop", track: id });
      el.classList.add("ag-killed");
      setTimeout(() => el.classList.remove("ag-killed"), 600);
    });
  }

  function paintChip(frame, el, id) {
    const s = frame._strip;
    if (!id) {
      el.className = "ag-chip ag-empty";
      el.dataset.track = "";
      el.dataset.fp = "";
      el.innerHTML = "";
      return;
    }
    const trk = trackById(s, id);
    const name = (trk && trk.name) || (s.names && s.names[id]) || id;
    const state = stateOf(s, id);
    const fp = [id, name, state, ctxWarned(s, id) ? "w" : ""].join("|");
    if (el.dataset.fp === fp) {
      const face = el.querySelector(".ag-face");
      if (face) face.title = tipFor(s, id, name);
      return;
    }
    el.dataset.fp = fp;
    el.innerHTML = "";
    buildChip(frame, el, id, name);
  }

  function renderStrip(frame) {
    const s = frame._strip;
    if (!s || !s.stripEl) return;
    const want = (s.tracks || []).map((t) => t.id);
    const have = new Map();
    s.stripEl.querySelectorAll(".ag-chip").forEach((c) => have.set(c.dataset.track, c));

    have.forEach((el, id) => { if (!want.includes(id)) el.remove(); });

    want.forEach((id) => {
      let el = have.get(id);
      if (!el) {
        el = document.createElement("span");
        el.className = "ag-chip";
        s.stripEl.appendChild(el);
      } else {
        s.stripEl.appendChild(el);
      }
      paintChip(frame, el, id);
    });

    if (s.popover && !want.includes(s.popover.track)) closePopover(s);
  }

  function paintAll(frame) {
    const s = frame._strip;
    if (!s) return;
    if (s.stripEl) s.stripEl.querySelectorAll(".ag-chip").forEach((el) => paintChip(frame, el, el.dataset.track));
    if (s.popover) renderPopoverBody(frame);
  }

  function closePopover(s) {
    if (!s.popover) return;
    s.popover.el.remove();
    document.removeEventListener("mousedown", s.onDocDown, true);
    s.popover = null;
  }

  function onDocDown(frame, ev) {
    const s = frame._strip;
    if (!s || !s.popover) return;
    if (s.popover.el.contains(ev.target)) return;
    if (s.popover.anchor && s.popover.anchor.contains(ev.target)) return;
    closePopover(s);
  }

  function togglePopover(frame, anchorEl, id, name) {
    const s = frame._strip;
    if (s.popover && s.popover.track === id) { closePopover(s); return; }
    closePopover(s);
    const el = document.createElement("div");
    el.className = "ag-pop";
    document.body.appendChild(el);
    s.popover = { el, track: id, name, anchor: anchorEl };
    renderPopoverBody(frame);
    positionPopover(s);
    document.addEventListener("mousedown", s.onDocDown, true);
    frame.send({ type: "feed" });
  }

  function positionPopover(s) {
    if (!s.popover) return;
    const r = s.popover.anchor.getBoundingClientRect();
    const el = s.popover.el;
    el.style.top = (r.bottom + 6) + "px";
    const w = el.offsetWidth || 380;
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
  }

  function renderPopoverBody(frame) {
    const s = frame._strip;
    if (!s.popover) return;
    const id = s.popover.track;
    const rows = MX.feedRows.rowsForRegion(id);
    const head = '<div class="ag-pop-head">' +
        '<span class="ag-pop-name">' + esc(s.popover.name) + "</span>" +
        '<span class="ag-pop-phase">' + esc(s.phase[id] || "idle") + "</span>" +
      "</div>";
    if (!rows.length) {
      s.popover.el.innerHTML = head + '<div class="ag-pop-empty">no records for this agent</div>';
      return;
    }
    const shown = rows.slice(0, 40);
    s.popover.el.innerHTML = head + '<div class="ag-pop-rows">' + shown.map((r) =>
      '<div class="ag-pr' + (r.pending ? " pending" : "") + '" data-id="' + escAttr(r.id) + '">' +
        '<div class="ag-pr-top">' +
          '<span class="ag-pr-t">' + esc(r.time) + "</span>" +
          '<span class="ql-edge ' + r.color + '">' + esc(r.edge) + "</span>" +
          '<span class="ag-pr-tgt" title="' + escAttr(r.target) + '">' + esc(r.target) + "</span>" +
        "</div>" +
        (r.summary ? '<div class="ag-pr-sum" title="' + escAttr(r.summary) + '">' + esc(r.summary) + "</div>" : "") +
        (r.pending
          ? '<div class="ag-pr-settle">' +
              '<button class="sbtn approve" data-settle="approve">approve</button>' +
              '<button class="sbtn deny" data-settle="deny">deny</button>' +
              '<button class="sbtn queue" data-settle="queue">queue</button>' +
            "</div>"
          : "") +
      "</div>").join("") + "</div>" +
      (rows.length > shown.length
        ? '<div class="ag-pop-more">' + (rows.length - shown.length) + " older — open Queue / Log for all</div>"
        : "");

    s.popover.el.querySelectorAll(".ag-pr").forEach((row) => {
      row.querySelectorAll("[data-settle]").forEach((b) => {
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          MX.feedRows.settle(frame.send.bind(frame), row.dataset.id, b.dataset.settle);
        });
      });
    });
  }

  // fallback copy of the ag- rules from static/css/ade.css, in case the
  // matrix page does not load ade.css — see receipt for what was copied
  const STYLE_ID = "mx-strip-ag-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".ag-chip{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;padding:2px 4px 2px 7px;border-radius:11px;background:var(--surface-2);border:1px solid var(--border);font:11px/1.5 var(--mono);text-transform:none;letter-spacing:0;font-weight:400;color:var(--text-3);}",
      ".ag-chip.ag-empty{display:none;}",
      ".ag-face{display:inline-flex;align-items:center;gap:5px;cursor:pointer;min-width:0;}",
      ".ag-face:focus-visible{outline:1px solid var(--border-2);outline-offset:2px;border-radius:8px;}",
      ".ag-dot{width:6px;height:6px;border-radius:50%;background:var(--text-4);flex-shrink:0;}",
      ".ag-name, .ag-dots{font-size:10px;position:relative;top:0.5px;}",
      ".ag-name{white-space:nowrap;}",
      ".ag-l{display:inline-block;}",
      ".ag-dots{display:none;letter-spacing:.14em;}",
      ".ag-kill{font:inherit;font-size:10px;line-height:1;cursor:pointer;flex-shrink:0;background:transparent;color:var(--text-4);border:0;border-radius:50%;padding:3px 4px;}",
      ".ag-kill:hover{color:var(--gate-red);background:var(--fill-red);}",
      ".ag-chip.ag-idle{opacity:.62;}",
      ".ag-chip.ag-busy{color:var(--text-1);border-color:var(--border-2);background:var(--surface-3);}",
      ".ag-chip.ag-busy .ag-dot{background:var(--text-2);animation:busy-pulse 1s ease-in-out infinite;}",
      ".ag-chip.ag-busy .ag-dots{display:inline-block;}",
      ".ag-chip.ag-busy .ag-l{animation:busy-wave 1.2s ease-in-out infinite;}",
      ".ag-chip.ag-queue{color:var(--gate-yellow);border-color:var(--gate-yellow);animation:agFlash 1s ease-in-out infinite;}",
      ".ag-chip.ag-queue .ag-dot{background:var(--gate-yellow);}",
      ".ag-chip.ag-queue .ag-kill:hover{color:var(--gate-red);}",
      "@keyframes agFlash{0%,100%{background:var(--fill-yellow);box-shadow:0 0 0 0 rgba(201,133,0,0);}50%{background:rgba(201,133,0,0.34);box-shadow:0 0 7px 0 rgba(201,133,0,0.45);}}",
      ".ag-chip.ag-ctxwarn{border-color:var(--gate-red) !important;animation:agCtxWarn 1s ease-in-out infinite;}",
      ".ag-chip.ag-ctxwarn .ag-dot{background:var(--gate-red);}",
      "@keyframes agCtxWarn{0%,100%{box-shadow:0 0 0 0 rgba(208,59,59,0);border-color:rgba(208,59,59,0.45);}50%{box-shadow:0 0 8px 1px rgba(208,59,59,0.55);border-color:rgba(208,59,59,1);}}",
      ".ag-chip.ag-killed{animation:agKilled .6s ease-out 1;}",
      "@keyframes agKilled{0%{background:var(--fill-red);border-color:var(--gate-red);}100%{background:var(--surface-2);}}",
      ".ag-pop{position:fixed;z-index:420;width:380px;max-height:52vh;overflow:auto;background:var(--surface-1);border:1px solid var(--border-2);border-radius:8px;box-shadow:0 14px 34px rgba(0,0,0,0.55);font:11.5px/1.5 var(--sans);color:var(--text-2);text-transform:none;letter-spacing:0;font-weight:400;}",
      ".ag-pop-head{display:flex;align-items:baseline;gap:8px;padding:8px 11px;border-bottom:1px solid var(--gridline);background:var(--surface-2);position:sticky;top:0;}",
      ".ag-pop-name{font-size:12px;color:var(--text-1);font-weight:600;}",
      ".ag-pop-phase{font:10.5px var(--mono);color:var(--text-4);}",
      ".ag-pop-empty{padding:14px 11px;color:var(--text-4);}",
      ".ag-pop-more{padding:7px 11px;border-top:1px solid var(--gridline);font:10.5px var(--mono);color:var(--text-4);}",
      ".ag-pr{padding:7px 11px;border-bottom:1px solid var(--gridline);}",
      ".ag-pr:last-child{border-bottom:0;}",
      ".ag-pr.pending{background:var(--fill-yellow);}",
      ".ag-pr-top{display:flex;align-items:center;gap:7px;min-width:0;}",
      ".ag-pr-t{font:10.5px var(--mono);color:var(--text-4);flex-shrink:0;}",
      ".ag-pr-tgt{font-family:var(--mono);font-size:10.5px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".ag-pr-sum{margin-top:3px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".ag-pr-settle{display:flex;gap:7px;margin-top:6px;}",
    ].join("\n");
    document.head.appendChild(style);
  }

  MX.registerWidget("strip", {
    mount(frame) {
      ensureStyle();

      const s = frame._strip = {
        phase: {}, liveGates: {}, feedGates: {}, ctxWarn: {},
        popover: null, stripEl: null, tracks: [], names: {},
      };

      const wrap = document.createElement("div");
      wrap.className = "ag-strip";
      frame.host.appendChild(wrap);
      s.stripEl = wrap;

      s.onDocDown = (ev) => onDocDown(frame, ev);
      s.onResize = () => { if (s.popover) positionPopover(s); };
      window.addEventListener("resize", s.onResize);

      frame.subscribe(["track_list", "ade_init", "track_status", "gate_broadcast", "context_warn", "feed"]);
      frame.send({ type: "roster", inst: frame.id });
    },

    unmount(frame) {
      const s = frame._strip;
      if (!s) return;
      window.removeEventListener("resize", s.onResize);
      closePopover(s);
      frame._strip = null;
    },

    onFrame(frame, msg) {
      const s = frame._strip;
      if (!s || !msg) return;

      if (msg.type === "track_list" || msg.type === "ade_init") {
        s.tracks = msg.tracks || [];
        s.names = Object.assign({}, s.names, msg.names || {});
        renderStrip(frame);
        return;
      }

      if (msg.type === "track_status") {
        s.phase[msg.track] = msg.phase || "idle";
        paintAll(frame);
        return;
      }

      if (msg.type === "gate_broadcast") {
        const id = msg.track;
        if (msg.kind === "ask" && id) {
          (s.liveGates[id] || (s.liveGates[id] = new Set())).add(msg.id);
        } else if (msg.kind === "resolved") {
          Object.keys(s.liveGates).forEach((k) => s.liveGates[k].delete(msg.id));
        }
        paintAll(frame);
        return;
      }

      if (msg.type === "context_warn") {
        if (msg.track) {
          s.ctxWarn[msg.track] = { peak: msg.peak, cap: msg.cap };
          paintAll(frame);
        }
        return;
      }

      if (msg.type === "feed") {
        MX.feedRows.setRecords(msg.records);
        s.feedGates = MX.feedRows.pendingByRegion();
        Object.keys(s.liveGates).forEach((k) => { if (!s.feedGates[k]) s.liveGates[k].clear(); });
        paintAll(frame);
        return;
      }
    },
  });
})();
