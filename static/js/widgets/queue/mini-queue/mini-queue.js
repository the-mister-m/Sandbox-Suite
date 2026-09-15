// mini queue widget — pending gate rows for the bound session's regions
//
// The old chat pane drew these rows under its transcript. Here they are their
// own widget. Every settle sends gate_action. Fills from the `feed` frame,
// then follows `gate_broadcast`, `ask`, and `gate_pending`.
//
// State: every request carries this instance id; a gate row always carries the
// region the gate belongs to, so no row draws blank.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};
  const G = MX.gates;

  function render(frame) {
    const q = frame._mq;
    if (!q) return;
    q.list.textContent = "";
    const rows = Object.keys(q.rows).map((id) => q.rows[id])
      .sort((a, b) => (b.parked || 0) - (a.parked || 0));
    q.count.textContent = rows.length ? String(rows.length) + " pending" : "none pending";
    if (!rows.length) {
      const none = document.createElement("div");
      none.className = "cq-empty";
      none.textContent = "no gate is waiting on you";
      q.list.appendChild(none);
      return;
    }
    for (const row of rows) {
      const el = document.createElement("div");
      el.className = "cq-row cq-pending";

      const t = document.createElement("span");
      t.className = "cq-t";
      t.textContent = G.fmtTime(row.parked);

      const who = document.createElement("span");
      who.className = "cq-region";
      who.textContent = q.names[row.region] || row.region || "—";

      const edge = document.createElement("span");
      edge.className = "cq-edge cq-yellow";
      edge.textContent = row.edge || "gate";

      const what = document.createElement("span");
      what.className = "cq-what";
      what.textContent = row.text || "";
      what.title = row.text || "";

      el.appendChild(t);
      el.appendChild(who);
      el.appendChild(edge);
      el.appendChild(what);
      el.appendChild(G.settleButtons(frame, row.id, (gid) => drop(frame, gid), row.region));
      q.list.appendChild(el);
    }
  }

  function put(frame, row) {
    const q = frame._mq;
    if (!q || !row || !row.id) return;
    q.rows[row.id] = Object.assign({}, q.rows[row.id] || {}, row);
    render(frame);
  }

  function drop(frame, gid) {
    const q = frame._mq;
    if (!q || !gid) return;
    delete q.rows[gid];
    render(frame);
  }

  // pending gates are never merged, so merge_gates has no visible effect
  // here; kept so the feed rebuilds from the same option the other two
  // queue widgets read.
  function applyFeed(frame) {
    const q = frame._mq;
    if (!q || !q.raw) return;
    q.rows = Object.create(null);
    for (const r of G.actionRecords(q.raw, frame.options.merge_gates)) {
      if (!G.isPending(r)) continue;
      q.rows[r.id] = {
        id: r.id, src: "feed", region: G.regionOf(r), parked: r.parked || 0,
        edge: r.edge || r.action_type || "gate",
        text: r.summary || G.target(r),
      };
    }
    render(frame);
  }

  MX.registerWidget("mini_queue", {
    mount(frame) {
      const q = frame._mq = { rows: Object.create(null), names: Object.create(null) };

      const wrap = document.createElement("div");
      wrap.className = "cq-queue cq-mini";

      const head = document.createElement("div");
      head.className = "cq-head";
      q.count = document.createElement("span");
      q.count.className = "cq-pill";
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "cq-btn";
      refresh.textContent = "refresh";
      refresh.addEventListener("click", () => frame.send({ type: "feed", inst: frame.id }));
      head.appendChild(q.count);
      head.appendChild(refresh);
      wrap.appendChild(head);

      q.list = document.createElement("div");
      q.list.className = "cq-list";
      wrap.appendChild(q.list);

      frame.host.appendChild(wrap);
      frame.subscribe(["feed", "gate_broadcast", "ask", "gate_pending",
                       "ade_init", "track_list"]);
      frame.send({ type: "roster", inst: frame.id });
      render(frame);
      frame.send({ type: "feed", inst: frame.id });
    },

    unmount(frame) {
      frame._mq = null;
    },

    onFrame(frame, msg) {
      const q = frame._mq;
      if (!q) return;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        q.names = G.namesFrom(msg, Object.create(null));
        render(frame);
        return;
      }

      if (msg.type === "feed") {
        if (msg.inst && msg.inst !== frame.id) return;
        q.raw = msg;
        applyFeed(frame);
        return;
      }

      if (msg.type === "gate_broadcast") {
        if (msg.kind === "resolved") drop(frame, msg.id);
        else put(frame, { id: msg.id, src: "broadcast", region: msg.region || msg.track,
                          parked: Date.now(), edge: "ask", text: msg.prompt || "" });
        return;
      }

      if (msg.type === "ask") {
        put(frame, { id: msg.id, src: "socket", region: msg.region || "",
                     parked: Date.now(), edge: "ask", text: msg.prompt || "" });
        return;
      }

      if (msg.type === "gate_pending") {
        const live = [];
        if (msg.active) live.push(msg.active);
        for (const p of (msg.pending || [])) live.push(p);
        for (const p of live) {
          put(frame, { id: p.id, src: "socket", region: p.region || "",
                       parked: Date.now(), edge: "ask", text: p.prompt || "" });
        }
        const ids = new Set(live.map((p) => p.id));
        for (const id of Object.keys(q.rows)) {
          if (q.rows[id].src === "socket" && !ids.has(id)) delete q.rows[id];
        }
        render(frame);
      }
    },

    onOption(frame, key) {
      if (key === "merge_gates") applyFeed(frame);
    },

    getOptions(frame) {
      return JSON.parse(JSON.stringify(frame.options));
    },
  });
})();
