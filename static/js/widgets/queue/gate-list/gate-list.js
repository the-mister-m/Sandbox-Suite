// gate list — the gate/queue/log list, detached from the anchor chat
//
// One instance binds to one region (frame.options.region), shows its
// asks and pending gates, settles them. Ported from static/js/ade/chat.js
// lines 248 to 444, the gate list functions, unchanged.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const _MAX_SETTLED_GATES = 50;

  let _settleSeq = 0;

  function _gateTier(g) { return g.active ? 2 : (g.settled ? 0 : 1); }

  function _capSettledGates(gates) {
    const settled = gates.filter(g => g.settled && !g.hist);
    if (settled.length <= _MAX_SETTLED_GATES) return gates;
    const keep = new Set(
      [...settled].sort((a, b) => (b.settledAt || 0) - (a.settledAt || 0))
        .slice(0, _MAX_SETTLED_GATES).map(g => g.id));
    return gates.filter(g => !g.settled || g.hist || keep.has(g.id));
  }

  function _reconcileGates(prev, liveNext) {
    const liveIds = new Set(liveNext.map(g => g.id));
    const prevById = new Map(prev.map(g => [g.id, g]));
    const merged = liveNext.map(g => {
      const was = prevById.get(g.id);
      return (was && was.settled) ? was : g;
    });
    const stillSettled = prev.filter(g => g.settled && !liveIds.has(g.id));
    const newlyUnknown = prev
      .filter(g => !g.settled && !liveIds.has(g.id))
      .map(g => ({ id: g.id, prompt: g.prompt, active: false,
                    settled: true, outcome: 'unknown', settledAt: ++_settleSeq }));
    return _capSettledGates(merged.concat(stillSettled, newlyUnknown));
  }

  function _settleOutcome(action) {
    return action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : null;
  }

  function _settledBadge(g) {
    switch (g.outcome) {
      case 'approved': return { text: 'APPROVED', color: 'blue', pip: 'A' };
      case 'denied':   return { text: 'DENIED',   color: 'red',  pip: 'D' };
      default:         return { text: 'ANSWERED', color: 'white', pip: '?' };
    }
  }

  function _fmtClock(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = n => (n < 10 ? '0' : '') + n;
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function _recTarget(r) {
    const p = (r && r.payload) || {};
    const base = p.path || p.command || p.url || p.target || p.query || p.note;
    if (base) return base;
    if (Array.isArray(p.receivers) && p.receivers.length) return p.receivers.join(', ');
    return '—';
  }

  function _recTargetName(r) {
    const t = _recTarget(r);
    if (typeof t !== 'string' || t === '—') return t || '—';
    if (t.indexOf('/') === -1) return t;
    const parts = t.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || t;
  }

  function _recColor(r) {
    if (r.action_type === 'user_action') return 'white';
    if (r.hook === null || r.hook === undefined) return 'white';
    if (r.outcome === 'parked') return 'white';
    if (r.outcome === 'killed' || r.outcome === 'timeout') return 'white';
    if (r.outcome === 'locked') return 'red';
    if (r.outcome === null || r.outcome === undefined) return 'yellow';
    if (r.answer === false) return 'red';
    if (r.hook === 'open') return 'green';
    return 'blue';
  }

  function _histRows(records) {
    return (records || [])
      .filter(r => r && r.kind === 'action')
      .filter(r => !(r.action_type === 'gate' && r.merged))
      .filter(r => r.outcome !== null && r.outcome !== undefined)
      .map(r => {
        const rr = r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r;
        return {
          id: r.id,
          hist: true,
          settled: true,
          rec: rr,
          parked: r.parked || 0,
          color: _recColor(rr),
          edge: rr.edge || rr.action_type || '?',
          target: _recTargetName(rr),
          fullTarget: _recTarget(rr),
        };
      });
  }

  function _renderGateListInto(gateListEl, gates, onRowClick, onSettle) {
    gateListEl.innerHTML = '';
    if (!gates.length) {
      gateListEl.innerHTML = '<div class="empty">no gates on this track</div>';
      return;
    }
    const ordered = [...gates].sort((a, b) => {
      const ta = _gateTier(a), tb = _gateTier(b);
      if (ta !== tb) return tb - ta;
      if (ta !== 0) return 0;
      const ah = a.hist ? 1 : 0, bh = b.hist ? 1 : 0;
      if (ah !== bh) return ah - bh;
      return ah ? (b.parked || 0) - (a.parked || 0)
                : (b.settledAt || 0) - (a.settledAt || 0);
    });
    ordered.forEach(g => {
      if (g.hist) {
        const row = document.createElement('div');
        row.className = 'evrow settled hist' + (g.color === 'red' ? ' denied' : '');
        const t = document.createElement('span');
        t.className = 'ev-t';
        t.textContent = _fmtClock(g.parked);
        const edge = document.createElement('span');
        edge.className = 'ql-edge ' + g.color;
        edge.textContent = g.edge;
        const what = document.createElement('span');
        what.className = 'ev-what';
        const tgt = document.createElement('span');
        tgt.className = 'tgt';
        tgt.textContent = g.target;
        tgt.title = g.fullTarget || '';
        what.appendChild(tgt);
        row.appendChild(t);
        row.appendChild(edge);
        row.appendChild(what);
        row.onclick = onRowClick;
        gateListEl.appendChild(row);
        return;
      }
      const row = document.createElement('div');
      row.className = 'evrow'
        + (g.settled ? ' settled' + (g.outcome === 'denied' ? ' denied' : '')
                     : (g.active ? '' : ' pending'));
      const t = document.createElement('span');
      t.className = 'ev-t';
      t.textContent = g.settled ? 'done' : (g.active ? 'now' : '…');
      const pip = document.createElement('span');
      const badge = document.createElement('span');
      if (g.settled) {
        const b = _settledBadge(g);
        pip.className = 'pip ' + b.color;
        pip.textContent = b.pip;
        badge.className = 'gbadge ' + b.color;
        badge.textContent = b.text;
      } else {
        pip.className = 'pip yellow';
        pip.textContent = '?';
        badge.className = 'gbadge yellow';
        badge.textContent = g.active ? 'ASK' : 'QUEUED';
      }
      const what = document.createElement('span');
      what.className = 'ev-what';
      const tgt = document.createElement('span');
      tgt.className = 'tgt';
      tgt.textContent = g.prompt || '';
      what.appendChild(tgt);
      row.appendChild(t);
      row.appendChild(pip);
      row.appendChild(what);
      row.appendChild(badge);
      row.onclick = onRowClick;
      if (!g.settled && g.awaiting) {
        const settleEl = document.createElement('div');
        settleEl.className = 'ql-settle';
        const sq = document.createElement('span');
        sq.className = 'sq-q';
        sq.textContent = 'sent…';
        settleEl.appendChild(sq);
        row.appendChild(settleEl);
      } else if (!g.settled && typeof onSettle === 'function') {
        const settleEl = document.createElement('div');
        settleEl.className = 'ql-settle';
        const sq = document.createElement('span');
        sq.className = 'sq-q';
        sq.textContent = 'waiting on you';
        settleEl.appendChild(sq);
        const rowBtns = [];
        ['approve', 'deny', 'queue'].forEach(action => {
          const btn = document.createElement('button');
          btn.className = 'sbtn ' + action;
          btn.dataset.settle = action;
          btn.textContent = action;
          btn.onclick = (e) => {
            e.stopPropagation();
            rowBtns.forEach(b => { b.disabled = true; });
            sq.textContent = 'sent…';
            onSettle(g.id, action);
          };
          settleEl.appendChild(btn);
          rowBtns.push(btn);
        });
        row.appendChild(settleEl);
      }
      gateListEl.appendChild(row);
    });
  }

  // text boot.js sends on the wire for each settle action
  const _ALERT_GATE_TEXT = { approve: 'y', deny: 'n', queue: 'queue' };

  function regionOf(frame) {
    return (frame.options && frame.options.region) || '';
  }

  // asks the server for the bound region's settled gates
  function _askHistory(frame, regionId) {
    if (!regionId) return;
    frame.send({ type: 'chat_history', track: regionId, inst: frame.id });
  }

  // styles copied from static/css/ade.css, same class names, injected once
  const _STYLE_ID = 'mx-gate-list-style';
  function _ensureStyle() {
    if (document.getElementById(_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = _STYLE_ID;
    style.textContent = `
.pip{ display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px; border-radius:4px; flex-shrink:0; font-family:var(--mono); font-size:10.5px; font-weight:700; line-height:1; }
.pip.white{ background:var(--fill-white); color:var(--gate-white); border:1px solid var(--border); }
.pip.green{ background:var(--fill-green); color:var(--gate-green); border:1px solid rgba(12,163,12,.40); }
.pip.blue{ background:var(--fill-blue); color:var(--gate-blue); border:1px solid rgba(57,135,229,.40); }
.pip.yellow{ background:var(--fill-yellow); color:var(--gate-yellow); border:1px solid rgba(201,133,0,.40); animation:pipPulse 1.4s ease-in-out infinite; }
.pip.red{ background:var(--fill-red); color:var(--gate-red); border:1px solid rgba(208,59,59,.45); }
@keyframes pipPulse{ 0%,100%{ opacity:1; } 50%{ opacity:.45; } }
.pips{ display:inline-flex; gap:3px; align-items:center; flex-shrink:0; }
.gbadge{ font-size:9.5px; padding:1px 6px; border-radius:3px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
.gbadge.green{ background:var(--fill-green); color:var(--gate-green); }
.gbadge.blue{ background:var(--fill-blue); color:var(--gate-blue); }
.gbadge.yellow{ background:var(--fill-yellow); color:var(--gate-yellow); }
.gbadge.red{ background:var(--fill-red); color:var(--gate-red); }
.gbadge.white{ background:var(--fill-white); color:var(--gate-white); }
.cp-gates{ flex:1; overflow-y:auto; min-height:0; }
.evrow{ display:flex; align-items:center; flex-wrap:wrap; gap:15px; padding:5px 9px; border-bottom:1px solid var(--gridline); font-size:11.5px; cursor:pointer; }
.evrow .ev-t{ font-family:var(--mono); font-size:10.5px; color:var(--text-4); width:46px; flex-shrink:0; }
.evrow .ev-what{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-2); }
.evrow .ev-what .tgt{ font-family:var(--mono); color:var(--text-1); }
.evrow.pending{ background:rgba(201,133,0,0.07); }
.evrow.denied{ background:rgba(208,59,59,0.07); }
.evrow.settled{ opacity:.58; }
.evrow.settled:hover{ opacity:.85; }
.evrow .ql-settle{ flex-basis:100%; }
.evrow .ql-edge{ flex-shrink:0; }
.evrow.hist{ opacity:.82; }
.evrow.hist:hover{ opacity:1; }
`;
    document.head.appendChild(style);
  }

  MX.registerWidget('gate_list', {
    defaults: { region: '' },

    mount(frame) {
      const g = frame._gateList = { region: '', gates: [] };

      const wrap = document.createElement('div');
      wrap.className = 'mx-gate-list cp-gates';
      frame.host.appendChild(wrap);
      g.el = wrap;
      _ensureStyle();

      g.render = () => {
        _renderGateListInto(g.el, g.gates, () => {}, (gateId, action) => {
          const found = g.gates.find(x => x.id === gateId);
          if (found) {
            found.awaiting = true;
            g.render();
          }
          frame.send({ type: 'gate_action', action: action, id: gateId,
                       inst: frame.id, region: g.region || '' });
        });
      };
      g.render();

      frame.subscribe(['ask', 'gate_pending', 'gate_broadcast', 'chat_history', 'region_replaced']);
      g.region = regionOf(frame);
      _askHistory(frame, g.region);
    },

    unmount(frame) {
      frame._gateList = null;
    },

    onOption(frame, key, value) {
      if (key !== 'region') return;
      const g = frame._gateList;
      if (!g) return;
      g.region = value || '';
      g.gates = [];
      g.render();
      _askHistory(frame, g.region);
    },

    onFrame(frame, msg) {
      const g = frame._gateList;
      if (!g) return;

      switch (msg.type) {
        case 'gate_pending': {
          const next = [];
          if (msg.active && (!g.region || msg.active.region === g.region)) {
            next.push({ id: msg.active.id, prompt: msg.active.prompt, active: true });
          }
          (msg.pending || []).forEach(p => {
            if (g.region && p.region !== g.region) return;
            next.push({ id: p.id, prompt: p.prompt, active: false });
          });
          g.gates = _reconcileGates(g.gates, next);
          g.gates.forEach(x => { x.awaiting = false; });
          g.render();
          break;
        }
        case 'ask': {
          if (g.region && msg.region !== g.region) break;
          const existing = g.gates.find(x => x.id === msg.id);
          if (existing) { existing.prompt = msg.prompt; existing.active = true; existing.settled = false; existing.outcome = undefined; }
          else g.gates.push({ id: msg.id, prompt: msg.prompt, active: true });
          g.render();
          break;
        }
        case 'gate_broadcast': {
          if (g.region && msg.region !== g.region) break;
          if (msg.kind === 'resolved') {
            const found = g.gates.find(x => x.id === msg.id);
            if (found) { found.active = false; found.settled = true; found.settledAt = ++_settleSeq; }
          } else {
            const existing = g.gates.find(x => x.id === msg.id);
            if (existing) { existing.prompt = msg.prompt; existing.active = true; existing.settled = false; existing.outcome = undefined; }
            else g.gates.push({ id: msg.id, prompt: msg.prompt, active: true });
          }
          g.render();
          break;
        }
        case 'chat_history':
          g.gates = g.gates.filter(x => !x.hist).concat(_histRows(msg.records || []));
          g.gates.forEach(x => { x.awaiting = false; });
          g.render();
          break;
        case 'region_replaced':
          if (msg.old_id === g.region) {
            g.region = msg.new_id;
            g.gates = [];
            g.render();
            _askHistory(frame, g.region);
          }
          break;
        default:
          break;
      }
    },
  });
})();
