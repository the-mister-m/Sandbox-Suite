// queue widget — one view, every gate record for the bound session
//
// Pending rows first, then resolved. Pending rows settle through gate_action.
// A row opens its ledger detail. claude_cache_ttl and claude_exclude_dynamic
// are this instance's own options; the old view sent them as edit_track and
// this one does not.
//
// State: every request carries this instance id and each reply is dropped
// unless it echoes it back.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};
  const G = MX.gates;

  function detailText(d) {
    if (!d) return "loading…";
    try { return JSON.stringify(d, null, 2); } catch (e) { return String(d); }
  }

  function render(frame) {
    const q = frame._q;
    if (!q) return;
    q.list.textContent = "";

    const rows = q.records.slice().sort((a, b) => {
      const pa = G.isPending(a) ? 1 : 0;
      const pb = G.isPending(b) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.parked || 0) - (a.parked || 0);
    });

    const pending = rows.filter(G.isPending).length;
    q.count.textContent = String(rows.length) + " records · " + String(pending) + " pending";

    if (!rows.length) {
      const none = document.createElement("div");
      none.className = "cq-empty";
      none.textContent = "no gate records on this session";
      q.list.appendChild(none);
      return;
    }

    for (const r of rows) {
      const el = document.createElement("div");
      const pend = G.isPending(r);
      el.className = "cq-row" + (pend ? " cq-pending" : " cq-settled");

      const t = document.createElement("span");
      t.className = "cq-t";
      t.textContent = G.fmtTime(r.parked);

      const who = document.createElement("span");
      who.className = "cq-region";
      const rid = G.regionOf(r);
      who.textContent = q.names[rid] || rid || "—";

      const edge = document.createElement("span");
      edge.className = "cq-edge cq-" + G.color(r);
      edge.textContent = r.edge || r.action_type || "?";

      const what = document.createElement("span");
      what.className = "cq-what";
      what.textContent = r.summary || G.target(r);
      what.title = G.target(r);

      el.appendChild(t);
      el.appendChild(who);
      el.appendChild(edge);
      el.appendChild(what);
      if (pend) {
        el.appendChild(G.settleButtons(frame, r.id,
          () => frame.send({ type: "feed", inst: frame.id }), rid));
      }

      el.addEventListener("click", () => {
        if (q.open[r.id]) { delete q.open[r.id]; render(frame); return; }
        q.open[r.id] = true;
        if (!q.details[r.id]) {
          frame.send({ type: "ledger_detail", id: r.id, inst: frame.id });
        }
        render(frame);
      });
      q.list.appendChild(el);

      if (q.open[r.id]) {
        const det = document.createElement("pre");
        det.className = "cq-detail";
        det.textContent = detailText(q.details[r.id]);
        q.list.appendChild(det);
      }
    }
  }

  MX.registerWidget("queue", {
    mount(frame) {
      const q = frame._q = {
        records: [], names: Object.create(null),
        details: Object.create(null), open: Object.create(null),
      };

      const wrap = document.createElement("div");
      wrap.className = "cq-queue";

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
      frame.subscribe(["feed", "ledger_detail", "ade_init", "track_list"]);
      frame.send({ type: "roster", inst: frame.id });
      render(frame);
      frame.send({ type: "feed", inst: frame.id });
    },

    unmount(frame) {
      frame._q = null;
    },

    onFrame(frame, msg) {
      const q = frame._q;
      if (!q) return;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        q.names = G.namesFrom(msg, Object.create(null));
        render(frame);
        return;
      }

      if (msg.type === "feed") {
        if (msg.inst && msg.inst !== frame.id) return;
        q.records = G.actionRecords(msg);
        for (const r of q.records) {
          const cached = q.details[r.id];
          if (cached && cached.outcome !== r.outcome) delete q.details[r.id];
        }
        render(frame);
        return;
      }

      if (msg.type === "ledger_detail") {
        if (msg.inst && msg.inst !== frame.id) return;
        const d = msg.detail;
        if (d && d.id) {
          q.details[d.id] = d;
          if (q.open[d.id]) render(frame);
        }
      }
    },

    // claude_cache_ttl and claude_exclude_dynamic are plain scalars with no
    // widget-side mirror; the frame already carries them in frame.options
    onOption(frame, key, value) {
      if (key === "claude_cache_ttl" || key === "claude_exclude_dynamic") {
        frame.options[key] = value;
      }
    },

    getOptions(frame) {
      return JSON.parse(JSON.stringify(frame.options));
    },
  });
})();
