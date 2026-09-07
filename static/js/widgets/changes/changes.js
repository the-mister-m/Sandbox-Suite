// changes widget — files/agents grouping, diff pane, pending gate flag
//
// State per instance: records off the feed, expanded groups, fetched
// ledger details, selection. Grouping and diff logic are the old design,
// unchanged. Wire only: frame.subscribe/send/onFrame instead of a host
// context object, mx:open-ledger instead of a ledger window.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const STYLE_ID = "mx-changes-style";
  const STYLE_CSS = `
#chgToggle{
  flex-shrink:0; display:flex; gap:6px; padding:8px 10px;
  background:var(--surface-1); border-bottom:1px solid var(--gridline);
}
.chg-tbtn{
  font:inherit; font-size:11px; padding:4px 11px; border-radius:5px; cursor:pointer;
  background:var(--surface-2); border:1px solid var(--border); color:var(--text-3);
}
.chg-tbtn.active{ background:var(--surface-3); border-color:var(--border-2); color:var(--text-1); }

#chgWrap{ flex:1; display:flex; min-height:0; }
#chgTree{ width:36%; flex-shrink:0; border-right:1px solid var(--gridline); overflow-y:auto; background:var(--surface-1); }

.cparent{ padding:8px 12px; border-bottom:1px solid var(--gridline); cursor:pointer; user-select:none; }
.cparent .cp-top{ display:flex; align-items:center; gap:7px; }
.cparent .cp-caret{ width:10px; flex-shrink:0; color:var(--text-4); font-size:10px; }
.cparent .cp-label{ font-family:var(--mono); font-size:11.5px; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }
.cparent .cp-count{ font-size:10px; color:var(--text-4); font-family:var(--mono); }
.cparent.pending{ background:rgba(201,133,0,0.07); }
.cparent.pending .cp-label{ color:var(--gate-yellow); }
.pendflag{
  font-size:9px; text-transform:uppercase; letter-spacing:.05em; font-weight:700;
  color:var(--gate-yellow); background:var(--fill-yellow); border:1px solid rgba(201,133,0,.45);
  padding:1px 5px; border-radius:3px; animation:pipPulse 1.4s ease-in-out infinite;
}

.cchild{
  display:flex; align-items:center; gap:8px; padding:6px 12px 6px 26px;
  border-bottom:1px solid var(--gridline); cursor:pointer; font-size:11px; position:relative;
}
.cchild::before{ content:''; position:absolute; left:14px; top:0; bottom:0; width:1px; background:var(--gridline); }
.cchild.sel{ background:var(--surface-3); box-shadow:inset 2px 0 0 var(--text-2); }
.cchild.pending{ background:rgba(201,133,0,0.06); }
.cc-what{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--mono); color:var(--text-1); font-size:11px; }
.cc-t{ font-family:var(--mono); font-size:10px; color:var(--text-4); }

#chgDiff{ flex:1; overflow:auto; background:var(--deep); min-width:0; }
#chgDiffHead{
  position:sticky; top:0; z-index:2; background:var(--surface-1);
  border-bottom:1px solid var(--gridline); padding:7px 14px;
  display:flex; align-items:center; gap:10px; font-size:11px; color:var(--text-3);
}
#chgDiffHead .dh-path{ font-family:var(--mono); color:var(--text-1); }
.diffstat{ font-family:var(--mono); font-weight:600; }
.diffstat .ds-add{ color:var(--gate-green); }
.diffstat .ds-del{ color:var(--gate-red); margin-left:6px; }
#chgDiffHead .ph-spacer{ flex:1; }
.jumpbtn{
  background:var(--fill-blue); border:1px solid rgba(57,135,229,.45); color:var(--gate-blue);
  border-radius:5px; padding:3px 9px; font-size:10.5px; cursor:pointer; white-space:nowrap; font-weight:600;
}
#chgDiffBody{ padding:8px 0; }
.dline{ font-family:var(--mono); font-size:11.5px; padding:1px 14px; white-space:pre; line-height:1.6; cursor:pointer; }
.dline.add{ background:rgba(12,163,12,0.10); color:#a6e8a6; }
.dline.add::before{ content:'+ '; color:var(--gate-green); }
.dline.del{ background:rgba(208,59,59,0.10); color:#f0b0b0; }
.dline.del::before{ content:'- '; color:var(--gate-red); }
.dline.ctx{ color:var(--text-3); }
.dline.ctx::before{ content:'  '; }
`;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = STYLE_CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    s = (s === undefined || s === null) ? "" : String(s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function isPending(r) { return r.outcome === null || r.outcome === undefined; }

  // four views agree: parked, killed, timeout read white, same as queuelog.js
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

  function ioBox(label, text, blobPath, resolving) {
    if (text !== null && text !== undefined && text !== "") {
      return '<div class="ql-io-box"><div class="io-l">' + esc(label) + "</div>" +
             '<div class="scrollbox">' + esc(text) + "</div></div>";
    }
    const note = resolving ? "— (resolving…)" : (blobPath ? "— (too large to show inline)" : "—");
    return '<div class="ql-io-box"><div class="io-l">' + esc(label) + "</div>" +
           '<div class="io-blank">' + esc(note) + "</div></div>";
  }

  function isHumanChangeVerb(edge) {
    return edge === "editor_save" || edge === "file_delete" || edge === "file_move";
  }

  function regionOf(r) {
    if (!r) return null;
    if (r.region != null) return r.region;
    return r.schema === 1 ? r.track : null;
  }

  function toEvent(r, eventKind) {
    const p = r.payload || {};
    return {
      id: r.id,
      ts: r.parked || 0,
      path: p.path || p.target || "(unknown path)",
      track: (r.track === undefined || r.track === null) ? null : r.track,
      region: regionOf(r),
      turn: (r.turn === undefined) ? null : r.turn,
      eventKind,
      edge: r.edge || r.action_type || "?",
      priorExisted: p.prior_existed,
      prior: (p.prior === undefined) ? null : p.prior,
      priorBlob: p.prior_blob || null,
      result: (r.result === undefined) ? null : r.result,
      resultBlob: r.result_blob || null,
      raw: r,
    };
  }

  function reduceEvents(records) {
    const out = [];
    for (const r of records) {
      if (r.action_type === "write") {
        if (isPending(r)) { out.push(toEvent(r, "pending")); continue; }
        if (isFailedWrite(r)) continue;
        out.push(toEvent(r, "write"));
      } else if (r.action_type === "gate" && r.edge === "write" && isPending(r)) {
        out.push(toEvent(r, "pending"));
      } else if (r.action_type === "user_action" && isHumanChangeVerb(r.edge)) {
        out.push(toEvent(r, "human"));
      }
    }
    return out;
  }

  // region -> track name, filled in from track_list rows as they arrive
  function nameOf(c, region) {
    if (region == null) return region;
    const n = c.trackNames[region];
    return n === undefined ? region : n;
  }

  function whoLabel(c, e) {
    if (e.eventKind === "human") return "you";
    if (e.region == null) return "unassigned";
    return nameOf(c, e.region);
  }

  function finishGroups(map) {
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.children.sort((a, b) => a.ts - b.ts);
      g.pending = g.children.some((ch) => ch.eventKind === "pending");
      g.latestTs = g.children.reduce((m, ch) => Math.max(m, ch.ts), 0);
    }
    groups.sort((a, b) => b.latestTs - a.latestTs);
    return groups;
  }

  function groupByFile(events) {
    const map = new Map();
    for (const e of events) {
      if (!map.has(e.path)) map.set(e.path, { key: e.path, label: e.path, children: [] });
      map.get(e.path).children.push(e);
    }
    return finishGroups(map);
  }

  function groupByAgent(c, events) {
    const map = new Map();
    for (const e of events) {
      const key = e.region == null ? " unassigned" : e.region;
      if (!map.has(key)) map.set(key, { key, label: whoLabel(c, e), children: [] });
      map.get(key).children.push(e);
    }
    return finishGroups(map);
  }

  function pickDefaultSelected(c, events) {
    if (!events.length) return undefined;
    if (c.selected === null) return null;
    if (c.selected && events.some((e) => e.id === c.selected)) return c.selected;
    let best = events[0];
    for (const e of events) if (e.ts > best.ts) best = e;
    return best.id;
  }

  function overlayGate(r) {
    return r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r;
  }

  const DIFF_MAX_CELLS = 4000000;

  function diffLines(oldText, newText) {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    if (a.length * b.length > DIFF_MAX_CELLS) return null;
    const n = a.length, m = b.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ t: "ctx", text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", text: a[i] }); i++; }
      else { out.push({ t: "add", text: b[j] }); j++; }
    }
    while (i < n) { out.push({ t: "del", text: a[i] }); i++; }
    while (j < m) { out.push({ t: "add", text: b[j] }); j++; }
    return out;
  }

  function priorTextFor(c, e) {
    if (e.priorExisted === false) return "";
    const d = c.details[e.id];
    if (d && d.payload && d.payload.prior !== null && d.payload.prior !== undefined) return d.payload.prior;
    return e.prior;
  }

  function resultTextFor(c, e) {
    const d = c.details[e.id];
    if (d && d.result !== null && d.result !== undefined) return d.result;
    return e.result;
  }

  function diffStatHtml(stat) {
    return '<span class="diffstat"><span class="ds-add">+' + stat.add + "</span>" +
           '<span class="ds-del">-' + stat.del + "</span></span>";
  }

  // jump button and diff-line clicks open the ledger widget instead of a window
  function openLedger(track, turn) {
    document.dispatchEvent(new CustomEvent("mx:open-ledger", { detail: { track, turn } }));
  }

  function requestDetail(frame, c, id) {
    if (!id || c.asked[id]) return;
    c.asked[id] = true;
    frame.send({ type: "ledger_detail", id, inst: frame.id });
  }

  function renderToggle(frame, c) {
    if (!c.toggleEl) return;
    c.toggleEl.innerHTML =
      '<button class="chg-tbtn' + (c.mode === "files" ? " active" : "") + '" data-mode="files">files</button>' +
      '<button class="chg-tbtn' + (c.mode === "agent" ? " active" : "") + '" data-mode="agent">agents</button>';
    c.toggleEl.querySelectorAll("[data-mode]").forEach((b) => {
      b.addEventListener("click", () => { c.mode = b.dataset.mode; render(frame); });
    });
  }

  function renderTree(frame, c, groups) {
    if (!c.treeEl) return;
    c.treeEl.innerHTML = "";
    if (!groups.length) {
      c.treeEl.innerHTML = '<div class="empty">nothing changed this session</div>';
      return;
    }
    groups.forEach((g) => {
      const gkey = "g:" + g.key;
      if (!(gkey in c.expanded)) c.expanded[gkey] = true;
      const open = c.expanded[gkey];

      const parentEl = document.createElement("div");
      parentEl.className = "cparent" + (g.pending ? " pending" : "");
      parentEl.innerHTML =
        '<div class="cp-top">' +
          '<span class="cp-caret">' + (open ? "▾" : "▸") + "</span>" +
          '<span class="cp-label" title="' + escAttr(g.label) + '">' + esc(g.label) + "</span>" +
          (g.pending ? '<span class="pendflag">gate</span>' : "") +
          '<span class="cp-count">' + g.children.length + "</span>" +
        "</div>";
      parentEl.querySelector(".cp-top").addEventListener("click", () => {
        c.expanded[gkey] = !c.expanded[gkey];
        render(frame);
      });
      c.treeEl.appendChild(parentEl);

      if (!open) return;
      g.children.forEach((e) => {
        const color = gateColor(overlayGate(e.raw));
        const row = document.createElement("div");
        row.className = "cchild" + (e.id === c.selected ? " sel" : "") + (e.eventKind === "pending" ? " pending" : "");
        const secondary = c.mode === "files" ? whoLabel(c, e) : e.path;
        row.innerHTML =
          '<span class="ql-edge ' + color + '">' + esc(e.edge) + "</span>" +
          '<span class="cc-what" title="' + escAttr(secondary) + '">' + esc(secondary) + "</span>" +
          '<span class="cc-t">' + fmtTime(e.ts) + "</span>";
        row.addEventListener("click", (ev) => { ev.stopPropagation(); c.selected = e.id; render(frame); });
        c.treeEl.appendChild(row);
      });
    });
  }

  function renderDiffHead(c, e, stat) {
    c.diffHeadEl.innerHTML =
      '<span class="dh-path">' + esc(e.path) + "</span>" +
      (stat ? diffStatHtml(stat) : "") +
      "<span>" + esc(whoLabel(c, e)) + " · " + fmtTime(e.ts) + "</span>" +
      (e.eventKind === "pending" ? '<span class="pendflag">waiting on gate</span>' : "") +
      '<span class="ph-spacer"></span>' +
      '<button class="jumpbtn" id="chgJumpBtn">open in ledger →</button>';
    const jb = c.diffHeadEl.querySelector("#chgJumpBtn");
    if (jb) jb.addEventListener("click", () => openLedger(e.track, e.turn));
  }

  function dlineEl(l, e) {
    const el = document.createElement("div");
    el.className = "dline " + l.t;
    el.textContent = l.text;
    el.addEventListener("click", () => openLedger(e.track, e.turn));
    return el;
  }

  function renderDiffBody(frame, c, e) {
    c.diffBodyEl.innerHTML = "";

    if (e.eventKind === "pending") {
      c.diffBodyEl.innerHTML = '<div class="empty">not applied yet — waiting on the gate</div>';
      return null;
    }
    if (e.eventKind === "human") {
      c.diffBodyEl.innerHTML = '<div class="empty">human change — no prior recorded for this kind of edit</div>';
      return null;
    }

    const priorText = priorTextFor(c, e);
    const resultText = resultTextFor(c, e);
    const priorAvailable = priorText !== null && priorText !== undefined;
    const resultAvailable = resultText !== null && resultText !== undefined;

    if (!priorAvailable || !resultAvailable) {
      if ((e.priorBlob || e.resultBlob) && !c.asked[e.id]) requestDetail(frame, c, e.id);
      const resolving = !c.details[e.id] && !!(e.priorBlob || e.resultBlob);
      c.diffBodyEl.innerHTML =
        '<div class="ql-io">' +
          ioBox("prior", priorAvailable ? priorText : null, e.priorBlob, resolving) +
          ioBox("written", resultAvailable ? resultText : null, e.resultBlob, resolving) +
        "</div>";
      return null;
    }

    const lines = diffLines(priorText, resultText);
    if (!lines) {
      c.diffBodyEl.innerHTML =
        '<div class="muted" style="padding:8px 14px;">file too large to diff inline — showing prior/written separately</div>' +
        '<div class="ql-io">' + ioBox("prior", priorText, null) + ioBox("written", resultText, null) + "</div>";
      return null;
    }
    lines.forEach((l) => c.diffBodyEl.appendChild(dlineEl(l, e)));
    let add = 0, del = 0;
    for (const l of lines) { if (l.t === "add") add++; else if (l.t === "del") del++; }
    return { add, del };
  }

  function renderDiff(frame, c, e, hasEvents) {
    if (!e) {
      c.diffHeadEl.innerHTML = "";
      c.diffBodyEl.innerHTML = '<div class="empty">' +
        (hasEvents ? "no change selected" : "nothing changed this session") + "</div>";
      return;
    }
    const stat = renderDiffBody(frame, c, e);
    renderDiffHead(c, e, stat);
  }

  function render(frame) {
    const c = frame._changes;
    if (!c || !c.treeEl) return;
    renderToggle(frame, c);

    const events = reduceEvents(c.records);
    c.selected = pickDefaultSelected(c, events);

    const groups = c.mode === "files" ? groupByFile(events) : groupByAgent(c, events);
    renderTree(frame, c, groups);

    const selectedEvent = (c.selected != null)
      ? (events.find((e) => e.id === c.selected) || null)
      : null;
    renderDiff(frame, c, selectedEvent, events.length > 0);
  }

  MX.registerWidget("changes", {
    mount(frame) {
      injectStyle();
      const c = frame._changes = {
        records: [], mode: "files", expanded: {}, details: {}, asked: {},
        selected: undefined, trackNames: {},
      };

      frame.host.innerHTML =
        '<div id="chgToggle"></div>' +
        '<div id="chgWrap">' +
          '<div id="chgTree"></div>' +
          '<div id="chgDiff">' +
            '<div id="chgDiffHead"></div>' +
            '<div id="chgDiffBody"></div>' +
          "</div>" +
        "</div>";

      c.toggleEl = frame.host.querySelector("#chgToggle");
      c.treeEl = frame.host.querySelector("#chgTree");
      c.diffHeadEl = frame.host.querySelector("#chgDiffHead");
      c.diffBodyEl = frame.host.querySelector("#chgDiffBody");

      frame.subscribe(["track_list", "feed", "ledger_detail"]);
      frame.send({ type: "feed", inst: frame.id });
      render(frame);
    },

    unmount(frame) {
      frame._changes = null;
    },

    onFrame(frame, msg) {
      const c = frame._changes;
      if (!c) return;

      if (msg.type === "track_list") {
        for (const row of (msg.rows || [])) {
          if (row && row.id !== undefined) c.trackNames[row.id] = row.name !== undefined ? row.name : row.id;
        }
        render(frame);
        return;
      }
      if (msg.type === "feed") {
        c.records = (msg.records || [])
          .filter((r) => r.kind === "action")
          .filter((r) => !(r.action_type === "gate" && r.merged))
          .map((r) => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
        render(frame);
        return;
      }
      if (msg.type === "ledger_detail") {
        const d = msg.detail;
        if (d && d.id) { c.details[d.id] = d; if (d.id === c.selected) render(frame); }
        return;
      }
    },
  });
})();
