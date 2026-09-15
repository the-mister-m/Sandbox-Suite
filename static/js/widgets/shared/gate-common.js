// gate helpers shared by the mini queue and the queue widget
//
// Ledger action records arrive on the `feed` frame. A pending record is one
// with no outcome. Every settle sends the one gate vocabulary: gate_action.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function regionOf(r) {
    if (!r) return null;
    if (r.region !== null && r.region !== undefined) return r.region;
    return r.schema === 1 ? r.track : null;
  }

  function isPending(r) {
    return r && (r.outcome === null || r.outcome === undefined);
  }

  function target(r) {
    const p = (r && r.payload) || {};
    const base = p.path || p.command || p.url || p.target || p.query || p.note;
    if (base) return base;
    if (Array.isArray(p.receivers) && p.receivers.length) return p.receivers.join(", ");
    return "—";
  }

  function color(r) {
    if (!r) return "white";
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

  // gate records carry the gate's own hook and answer under prefixed keys
  function flatten(r) {
    return r && r.gate_id
      ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer })
      : r;
  }

  // mergeGates default true: hide a merged gate row and fold its hook/answer
  // onto the surviving row. false shows the merged gate as its own row again.
  function actionRecords(msg, mergeGates) {
    const merge = mergeGates !== false;
    return (msg && Array.isArray(msg.records) ? msg.records : [])
      .filter((r) => r && r.kind === "action")
      .filter((r) => merge ? !(r.action_type === "gate" && r.merged) : true)
      .map((r) => (merge ? flatten(r) : r));
  }

  // region id to name, from ade_init or track_list
  function namesFrom(msg, into) {
    const out = into || Object.create(null);
    if (!msg) return out;
    if (msg.names && typeof msg.names === "object") {
      for (const id of Object.keys(msg.names)) out[id] = msg.names[id];
    }
    for (const row of (Array.isArray(msg.tracks) ? msg.tracks : [])) {
      if (row && row.id) out[row.id] = row.name || row.id;
    }
    return out;
  }

  function regionRows(msg) {
    return (msg && Array.isArray(msg.tracks) ? msg.tracks : []).filter((r) => r && r.id);
  }

  // approve, deny, queue — the only gate words on the wire
  function settleButtons(frame, gid, onSent, region) {
    const wrap = document.createElement("span");
    wrap.className = "cq-settle";
    const btns = [];
    for (const action of ["approve", "deny", "queue"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cq-sbtn cq-" + action;
      b.textContent = action;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        for (const other of btns) other.disabled = true;
        frame.send({ type: "gate_action", action: action, id: gid,
                     inst: frame.id, region: region || "" });
        if (typeof onSent === "function") onSent(gid, action);
      });
      wrap.appendChild(b);
      btns.push(b);
    }
    return wrap;
  }

  MX.gates = {
    fmtTime, regionOf, isPending, target, color, flatten,
    actionRecords, namesFrom, regionRows, settleButtons,
  };
})();
