// target option — current targets, graph shelf list, new-target flow
//
// MX.targetsFor(sid, types): target values held on a session, only by
// widgets of those types when types is given.
// MX.targetControl(listFn, onNew): optionControls entry for a select.
// MX.graphTargets(): shelf names merged with targets held by graph widgets.
// MX.graphTargetNew(frame): pick a codebase folder, scan it, set the target.
// Routes are section 2.5 of SPEC-session-agent-phases1-3.md, 1A's to
// build. 1A's receipt was not in when this was written; response shapes
// below are assumed from that section and named in the receipt.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // state: widget types of the wayfinder family.
  const GRAPH_TYPES = ["graph_cards", "graph_files", "graph_force", "graph_stack"];

  MX.targetsFor = function (sid, types) {
    if (!sid) return Promise.resolve([]);
    return fetch(`/api/targets/${sid}`)
      .then((r) => r.json())
      .then((data) => (data && Array.isArray(data.targets) ? data.targets : []))
      .then((rows) => rows
        .filter((t) => !types || (t.types || []).some((ty) => types.indexOf(ty) >= 0))
        .map((t) => t.value))
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
    const current = MX.targetsFor(MX.grid && MX.grid.sid, GRAPH_TYPES);
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
      // shared root browser, native or suite per global.json
      MX.openRootBrowser("/", (path) => {
        if (!path) { resolve(); return; }
        fetch("/api/library/graphs/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ root: path }),
        })
          .then((r) => r.json().then((data) => ({ ok: r.ok, data: data })))
          .then(({ ok, data }) => {
            if (ok && data && data.name) {
              if (data.problems && data.problems.length) {
                console.warn("graph scan problems:", data.problems);
              }
              // widgets already on this name reload; this frame switches if it isn't
              if (MX.graphRescanned) MX.graphRescanned(data.name);
              if (frame.options.target !== data.name) frame.setOption("target", data.name);
            } else {
              console.warn("graphTargetNew refused:", (data && data.error) || data);
            }
            resolve();
          })
          .catch((e) => {
            console.warn("graphTargetNew failed:", e);
            resolve();
          });
      }, {});
    });
  };
})();
