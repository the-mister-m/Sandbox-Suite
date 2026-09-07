// feed-rows — ledger record helpers shared by strip, queue, mini-queue widgets
//
// records come in on a 'feed' frame; setRecords stores them, rowsForRegion
// and pendingByRegion read them back per region, settle fires a gate action.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  let _records = [];

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

  // call from onFrame on a 'feed' message, before reading rows
  function setRecords(records) {
    _records = (records || []).filter((r) => r.kind === "action");
  }

  function rowsForRegion(regionId) {
    if (!regionId) return [];
    return _records
      .filter((r) => regionOf(r) === regionId)
      .map((r) => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r))
      .map((r) => ({
        id:      r.id,
        time:    fmtTime(r.parked),
        edge:    r.edge || r.action_type || "?",
        target:  getTarget(r),
        summary: r.summary || "",
        color:   gateColor(r),
        pending: isPending(r),
        parked:  r.parked || 0,
      }))
      .sort((a, b) => (b.pending - a.pending) || (b.parked - a.parked));
  }

  function pendingByRegion() {
    const out = {};
    for (const r of _records) {
      if (!isPending(r)) continue;
      const id = regionOf(r);
      if (id) out[id] = (out[id] || 0) + 1;
    }
    return out;
  }

  // send is the caller's own frame.send — settle fires the gate action, then
  // asks for a fresh feed twice so the row's outcome catches up
  function settle(send, id, action) {
    if (!send) return;
    send({ type: "gate_action", action, id });
    setTimeout(() => send({ type: "feed" }), 400);
    setTimeout(() => send({ type: "feed" }), 1500);
  }

  MX.feedRows = { setRecords, rowsForRegion, pendingByRegion, settle };
})();
