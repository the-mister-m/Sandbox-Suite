// force sim — one spring/repulsion step, and the ViewModel that step feeds
//
// MX.forceSim(nodes, edges, positions, opts) -> {positions, maxMove}. Pure,
// one step per call, positions mutated in place. The swap point for a worker
// or a library: same arguments in, same object out.
// MX.forceLayout(index, filters, positions) -> ViewModel, the shape
// MapView.show takes unchanged (layout.ts :88-101).

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // sim defaults — settle time on the seed graph is in RECEIPT-phase2-2B.md
  const SIM_DEFAULTS = {
    repulsion: 1000, attraction: 0.05, damping: 0.05, step: 0.2,
    gravity: 0.012, dims: 3,
  };

  const MIN_DIST = 6;    // close-range clamp, repulsion
  const REST_K = 6;      // rest length per r1 + r2
  const V_CAP = 14;      // per-axis velocity ceiling

  // sim units to world units. The sim settles in a tight ball; a file tile is
  // TILE 96 world wide (map.js:19), so the ball is opened out for the view.
  const WORLD_SCALE = 6;

  // layout.js :18-22 PLANE_MARGIN, :35-37 R_BASE/R_STEP/R_CAP — copied, not
  // exported through graph-core
  const PLANE_MARGIN = 76;
  const R_BASE = 6.2;
  const R_STEP = 1.05;
  const R_CAP = 8;

  MX.forceSimDefaults = function () {
    return Object.assign({}, SIM_DEFAULTS);
  };

  // sim-to-world factor, so a caller can place a sim point itself
  MX.forceWorldScale = WORLD_SCALE;

  function cap(v) {
    return v > V_CAP ? V_CAP : (v < -V_CAP ? -V_CAP : v);
  }

  MX.forceSim = function (nodes, edges, positions, opts) {
    const o = Object.assign({}, SIM_DEFAULTS, opts || {});
    const flat = o.dims === 2;
    const n = nodes.length;

    const rOf = new Map();
    for (const nd of nodes) rOf.set(nd.id, nd.r || 0);

    // repulsion — every pair, inverse square, clamped close in
    for (let i = 0; i < n; i++) {
      const a = positions.get(nodes[i].id);
      if (!a) continue;
      for (let j = i + 1; j < n; j++) {
        const b = positions.get(nodes[j].id);
        if (!b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = flat ? 0 : b.z - a.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        // two nodes exactly on top of each other have no direction to push
        if (d2 < 1e-9) {
          dx = ((i % 7) - 3) * 0.1 + 0.05;
          dy = ((j % 5) - 2) * 0.1 + 0.05;
          dz = flat ? 0 : 0.07;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        if (d2 < MIN_DIST * MIN_DIST) d2 = MIN_DIST * MIN_DIST;
        const d = Math.sqrt(d2);
        const f = o.repulsion / d2;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        a.vx -= ux * f; a.vy -= uy * f; a.vz -= uz * f;
        b.vx += ux * f; b.vy += uy * f; b.vz += uz * f;
      }
    }

    // attraction — every edge, spring toward a rest length off r1 + r2
    for (const e of edges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) continue;
      const rest = ((rOf.get(e.from) || 0) + (rOf.get(e.to) || 0)) * REST_K;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = flat ? 0 : b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-6) continue;
      const f = o.attraction * (d - rest);
      const ux = dx / d, uy = dy / d, uz = dz / d;
      a.vx += ux * f; a.vy += uy * f; a.vz += uz * f;
      b.vx -= ux * f; b.vy -= uy * f; b.vz -= uz * f;
    }

    // gravity — linear pull to the origin. Not in the 2B recipe; added so the
    // system has a bounded equilibrium instead of a slow outward creep.
    // gravity 0 is the recipe as written. Named in RECEIPT-phase2-2B.md.
    if (o.gravity) {
      for (const nd of nodes) {
        const p = positions.get(nd.id);
        if (!p) continue;
        p.vx -= p.x * o.gravity;
        p.vy -= p.y * o.gravity;
        if (!flat) p.vz -= p.z * o.gravity;
      }
    }

    // damp, step, measure
    let maxMove = 0;
    for (const nd of nodes) {
      const p = positions.get(nd.id);
      if (!p) continue;
      p.vx = cap(p.vx * o.damping);
      p.vy = cap(p.vy * o.damping);
      p.vz = flat ? 0 : cap(p.vz * o.damping);
      const dx = p.vx * o.step;
      const dy = p.vy * o.step;
      const dz = flat ? 0 : p.vz * o.step;
      p.x += dx;
      p.y += dy;
      p.z = flat ? 0 : p.z + dz;
      const move = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (move > maxMove) maxMove = move;
    }

    return { positions, maxMove };
  };

  // rollUp, layout.ts :369-384 — one unit per visible node here, so this only
  // merges parallel edges and counts them
  function rollUp(edges, unitOf) {
    const out = new Map();
    for (const e of edges) {
      const a = unitOf(e.from), b = unitOf(e.to);
      if (!a || !b || a === b) continue;
      const key = `${a} ${b} ${e.kind}`;
      const prev = out.get(key);
      if (!prev) {
        out.set(key, { from: a, to: b, kind: e.kind, resolved: e.resolved, count: 1 });
      } else {
        prev.count++;
        if (e.resolved === "exact") prev.resolved = "exact";
      }
    }
    return [...out.values()];
  }

  MX.forceLayout = function (index, filters, positions) {
    const vis = filters.nodes(index);
    const raw = filters.edges(index, vis);
    const edges = rollUp(raw, (id) => (vis.has(id) ? id : null));

    // degree, containment ignored — planeLayout :114-119
    const reach = new Map();
    for (const e of raw) {
      if (e.kind === "contains") continue;
      reach.set(e.from, (reach.get(e.from) || 0) + 1);
      reach.set(e.to, (reach.get(e.to) || 0) + 1);
    }

    const rootIds = new Set(index.roots().map((f) => f.id));

    const placed = new Map();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const id of vis) {
      const p = positions.get(id);
      if (!p) continue;
      const deg = reach.get(id) || 0;
      const x = p.x * WORLD_SCALE, y = p.y * WORLD_SCALE, z = p.z * WORLD_SCALE;
      placed.set(id, {
        x, y, z,
        plane: 0,
        isFile: rootIds.has(id),
        r: R_BASE + Math.min(deg, R_CAP) * R_STEP,
        reach: deg,
      });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (!placed.size) { minX = maxX = minZ = maxZ = 0; }

    const x0 = minX - PLANE_MARGIN, x1 = maxX + PLANE_MARGIN;
    const z0 = minZ - PLANE_MARGIN, z1 = maxZ + PLANE_MARGIN;
    const plane = {
      name: ".",
      index: 0,
      elevation: 0,
      count: placed.size,
      nodes: placed.size,
      cx: (x0 + x1) / 2,
      cz: (z0 + z1) / 2,
      halfX: (x1 - x0) / 2,
      halfZ: (z1 - z0) / 2,
      corners: [
        { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
      ],
    };

    return {
      mode: "tilt",
      planes: [plane],
      placed,
      pads: [],
      nodes: new Map(index.byId),
      edges,
      camera: { yaw: -0.42, pitch: 0.92 },   // layout.js :31-32
      crumbs: [],
      drillable: new Set(),
      page: 0,
      note: "",
    };
  };
})();
