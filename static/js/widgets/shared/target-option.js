// target option — current targets, graph shelf list, new-target flow
//
// MX.targetsFor(sid): target values held by any widget on a session.
// MX.targetControl(listFn, onNew): optionControls entry for a select.
// MX.graphTargets(): shelf names merged with the grid's current targets.
// MX.graphTargetNew(frame): pick a graph file, import it, set the target.
// Routes are section 2.5 of SPEC-session-agent-phases1-3.md, 1A's to
// build. 1A's receipt was not in when this was written; response shapes
// below are assumed from that section and named in the receipt.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.targetsFor = function (sid) {
    if (!sid) return Promise.resolve([]);
    return fetch(`/api/targets/${sid}`)
      .then((r) => r.json())
      .then((data) => (data && Array.isArray(data.targets)
        ? data.targets.map((t) => t.value) : []))
      .catch(() => []);
  };

  MX.targetControl = function (listFn, onNew) {
    return { kind: "select", values: listFn, onNew: onNew };
  };

  MX.graphTargets = function () {
    const shelf = fetch("/api/library/graphs")
      .then((r) => r.json())
      .then((data) => (data && Array.isArray(data.list)
        ? data.list.map((g) => g.name) : []))
      .catch(() => []);
    const current = MX.targetsFor(MX.grid && MX.grid.sid);
    return Promise.all([shelf, current]).then(([names, held]) => {
      const merged = names.slice();
      for (const name of held) {
        if (merged.indexOf(name) < 0) merged.push(name);
      }
      return merged;
    });
  };

  MX.graphTargetNew = function (frame) {
    return new Promise((resolve) => {
      MX.openRootBrowser("/", (path) => {
        fetch("/api/library/graphs/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: path }),
        })
          .then((r) => r.json().then((data) => ({ ok: r.ok, data: data })))
          .then(({ ok, data }) => {
            if (ok && data && data.name) {
              frame.setOption("target", data.name);
            } else {
              console.warn("graphTargetNew refused:", (data && data.error) || data);
            }
            resolve();
          })
          .catch((e) => {
            console.warn("graphTargetNew failed:", e);
            resolve();
          });
      }, { ext: ".json" });
    });
  };
})();
