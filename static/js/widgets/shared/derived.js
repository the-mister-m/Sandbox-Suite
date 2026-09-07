// shared derived — file and message handoffs merged into one wire list
//
// MX.derived = { deriveFileHandoffs(records), deriveMessageHandoffs(rows),
// mergeDerived(files, messages) }.
//
// mergeDerived output shape, one entry per handoff:
//   from   — region id the handoff originates on
//   to     — region id the handoff lands on
//   wire   — "file" or "message"
//   count  — number of actions folded into this entry
//   at     — timestamp (ms) of the most recent action folded in
//   paths  — file paths involved ("file" wire) or [] ("message" wire)
//
// deriveFileHandoffs is deriveCables from cables.js, unchanged, over feed
// records. deriveMessageHandoffs folds wp_feed lines into the same shape.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const WRITE = 'write';
  const READ  = 'read';

  function normPath(p) {
    const out = [];
    for (const seg of String(p).split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { if (out.length) out.pop(); continue; }
      out.push(seg);
    }
    return '/' + out.join('/');
  }

  function expandUser(p, home) {
    if (p === '~') return home || p;
    if (p.startsWith('~/')) return home ? home.replace(/\/+$/, '') + '/' + p.slice(2) : p;
    return p;
  }

  function resolveTarget(target, base, home) {
    if (typeof target !== 'string') return null;
    const raw = target.trim();
    if (!raw) return null;
    const ex = expandUser(raw, home);
    if (ex.startsWith('/')) return normPath(ex);
    if (ex.startsWith('~')) return 'rel:' + ex;
    if (base) return normPath(String(base) + '/' + ex);
    return 'rel:' + normPath(ex).slice(1);
  }

  function stampOf(r) {
    const t = r.parked != null ? r.parked : (r.resolved != null ? r.resolved : r.started);
    return typeof t === 'number' ? t : 0;
  }

  function isFiredFileAction(r) {
    if (!r || r.kind === 'turn') return false;
    if (r.action_type !== WRITE && r.action_type !== READ) return false;
    if (r.outcome !== 'fired') return false;
    if (r.failed === true) return false;
    const p = r.payload;
    return !!(p && typeof p.target === 'string' && r.region != null);
  }

  function deriveCables(records, opts) {
    const o = opts || {};
    const roots = o.roots || {};
    const nodes = o.nodes || {};

    const acts = (records || []).filter(isFiredFileAction).slice().reverse();
    acts.sort((a, b) => stampOf(a) - stampOf(b));

    const writes = new Map();
    const cables = new Map();

    for (const r of acts) {
      const base = roots[r.region] != null ? roots[r.region] : r.root;
      const key  = resolveTarget(r.payload.target, base, o.home);
      if (!key) continue;

      if (r.action_type === WRITE) {
        if (!writes.has(key)) writes.set(key, []);
        writes.get(key).push(r);
        continue;
      }

      for (const w of (writes.get(key) || [])) {
        if (w.region === r.region) continue;
        const id = w.region + ' ' + r.region;
        let cable = cables.get(id);
        if (!cable) {
          cable = {
            id: id,
            from: w.region,
            to: r.region,
            fromNode: nodes[w.region] != null ? nodes[w.region] : null,
            toNode:   nodes[r.region]  != null ? nodes[r.region]  : null,
            paths: [],
            count: 0,
            at: stampOf(r),
            edges: [],
          };
          cables.set(id, cable);
        }
        if (cable.paths.indexOf(key) === -1) cable.paths.push(key);
        cable.count += 1;
        cable.at = stampOf(r);
        cable.edges.push({ write: w.id, read: r.id, path: key });
      }
    }

    return Array.from(cables.values());
  }

  // wp_feed lines: { id, from, to[], body, said (ms), status, heard }.
  // A line that never landed — "dead" or "denied" — is not a handoff.
  // One entry per from/to pair, folded, newest stamp wins. paths stays empty.
  function deriveMessageHandoffs(rows) {
    const out = new Map();
    for (const l of (rows || [])) {
      if (!l || !l.from) continue;
      if (l.status === 'dead' || l.status === 'denied') continue;
      const at = typeof l.said === 'number' ? l.said : 0;
      for (const to of (l.to || [])) {
        if (!to || to === l.from) continue;
        const id = l.from + ' ' + to;
        let m = out.get(id);
        if (!m) {
          m = { from: l.from, to: to, count: 0, at: at, paths: [] };
          out.set(id, m);
        }
        m.count += 1;
        if (at > m.at) m.at = at;
      }
    }
    return Array.from(out.values());
  }

  function mergeDerived(files, messages) {
    const out = [];
    for (const c of (files || [])) {
      out.push({ from: c.from, to: c.to, wire: "file", count: c.count, at: c.at, paths: c.paths || [] });
    }
    for (const m of (messages || [])) {
      out.push({ from: m.from, to: m.to, wire: "message", count: m.count, at: m.at, paths: m.paths || [] });
    }
    return out;
  }

  MX.derived = {
    deriveFileHandoffs: deriveCables,
    deriveMessageHandoffs: deriveMessageHandoffs,
    mergeDerived: mergeDerived,
  };
})();
