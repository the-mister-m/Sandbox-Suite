// ledger widget — turn table, rollup chips, per-agent totals, transcript
// rows under a turn. Ported from static/js/ade/ledgerview.js.
//
// State: one object per instance, held on frame._ledger — records, totals,
// transcripts by region, open rows, visible chips, hidden columns, sort,
// column widths/order, drag/resize in progress.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function esc(s) {
    s = (s === undefined || s === null) ? '' : String(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function fmtDur(ms) {
    if (ms == null) return '—';
    if (ms < 1000) return ms + 'ms';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60), rs = Math.round(s - m * 60);
    return m + 'm ' + rs + 's';
  }
  function num(n) { return (n === null || n === undefined) ? '—' : n.toLocaleString(); }

  function getTarget(r) {
    const p = r.payload || {};
    return p.path || p.command || p.url || p.target || p.query || p.note || '—';
  }

  function isPending(r) { return r.outcome === null || r.outcome === undefined; }
  function gateColor(r) {
    if (r.action_type === 'user_action') return 'white';
    if (r.hook === null || r.hook === undefined) return 'white';
    if (r.outcome === 'parked') return 'white';
    if (r.outcome === 'killed' || r.outcome === 'timeout') return 'white';
    if (r.outcome === 'locked') return 'red';
    if (isPending(r)) return 'yellow';
    if (r.answer === false) return 'red';
    if (r.hook === 'open') return 'green';
    return 'blue';
  }

  function isFailedWrite(r) {
    if (r.failed) return true;
    if (r.action_type !== 'write') return false;
    return /^\[WRITE/.test(r.summary || '');
  }

  function ioBox(label, text, blobPath) {
    if (text !== null && text !== undefined && text !== '') {
      return '<div class="ql-io-box"><div class="io-l">' + esc(label) + '</div>' +
             '<div class="scrollbox">' + esc(text) + '</div></div>';
    }
    const note = blobPath ? '— (too large to show inline)' : '—';
    return '<div class="ql-io-box"><div class="io-l">' + esc(label) + '</div>' +
           '<div class="io-blank">' + esc(note) + '</div></div>';
  }

  function reduceActions(records) {
    return records
      .filter(r => r.kind === 'action')
      .filter(r => !(r.action_type === 'gate' && r.merged))
      .map(r => (r.gate_id ? Object.assign({}, r, { hook: r.gate_hook, answer: r.gate_answer }) : r));
  }

  function allTurns(st) { return st.records.filter(r => r.kind === 'turn'); }

  function chipIds(st) {
    return [...new Set(allTurns(st).map(regionOf).filter(Boolean))];
  }

  function regionOf(r) {
    if (!r) return null;
    if (r.region != null) return r.region;
    return r.schema === 1 ? r.track : null;
  }

  function sameTurn(a, t) {
    const ar = regionOf(a), tr = regionOf(t);
    if (ar == null || a.turn == null || tr == null || t.turn == null) return false;
    return String(ar) === String(tr) && String(a.turn) === String(t.turn);
  }
  function matchedActions(t, st) {
    const acts = reduceActions(st.records);
    return acts.filter(a => sameTurn(a, t));
  }

  const BASE_COLS = [
    { key: 'time',       label: 'Time',       sort: true,  pin: true },
    { key: 'track',      label: 'Track',      sort: true },
    { key: 'turn',       label: 'Turn',       sort: true },
    { key: 'call',       label: 'Call',       sort: true },
    { key: 'duration',   label: 'Duration',   sort: true },
    { key: 'model',      label: 'Model',      sort: true },
    { key: 'stop',       label: 'Stop',       sort: false },
    { key: 'actions',    label: 'Actions',    sort: true },
    { key: 'cost',       label: 'Cost $',     sort: true },
    { key: 'out',        label: 'Out',        sort: true },
    { key: 'readbilled', label: 'Read',       sort: true },
    { key: 'readpeak',   label: 'Read Peak',  sort: true },
    { key: 'cw5m',       label: 'Write 5m',   sort: true },
    { key: 'cw1h',       label: 'Write 1h',   sort: true },
    { key: 'in',         label: 'In (legacy)',       sort: true },
    { key: 'cread',      label: 'Cache R (legacy)',  sort: true },
    { key: 'cwrite',     label: 'Cache W (legacy)',  sort: true },
  ];
  function shownCols(st) {
    return st.cols.filter(c => !st.hiddenCols[c.key]);
  }

  function usageOf(t) {
    const c = t && t._call;
    if (c) {
      return { in: c.input, out: c.output, cread: c.cache_read,
               cw: null, cw5m: c.cache_write_5m, cw1h: c.cache_write_1h,
               readBilled: c.cache_read, readPeak: c.cache_read };
    }
    const u = (t && t.usage) || {};
    const hasSplit = u.cache_read_billed != null || u.cache_read_peak != null;
    return {
      in: u.in_tokens, out: u.out_tokens, cread: u.cache_read, cw: u.cache_creation,
      cw5m: u.cache_write_5m != null ? u.cache_write_5m : null,
      cw1h: u.cache_write_1h != null ? u.cache_write_1h : null,
      readBilled: hasSplit ? u.cache_read_billed : u.cache_read,
      readPeak: hasSplit ? u.cache_read_peak : u.cache_read,
    };
  }

  function costOf(t) {
    if (t && t._call) return t._call.cost_usd;
    return t ? t.cost_usd : null;
  }

  // track_list rows give id/name; a region not in the latest list but seen
  // before is "gone" — the track was removed
  function trackName(id, st) {
    if (id == null || id === '') return '—';
    const row = (st.tracks || []).find(r => r && String(r.id) === String(id));
    if (row && row.name) return row.name;
    return String(id);
  }
  function goneCls(id, st) {
    if (id == null) return '';
    const present = (st.tracks || []).some(r => r && String(r.id) === String(id));
    return (!present && st.knownTrackIds[id]) ? ' led-gone' : '';
  }

  function sortVal(key, t, st) {
    switch (key) {
      case 'time':      return t.started || 0;
      case 'track':     return trackName(regionOf(t), st);
      case 'turn':      return t.turn == null ? -1 : t.turn;
      case 'duration':  return t.duration_ms == null ? -1 : t.duration_ms;
      case 'model':     return t.vessel || '';
      case 'stop':      return t.stop_reason || '';
      case 'actions':   return matchedActions(t, st).length;
      case 'cost':      return costOf(t) == null ? -1 : costOf(t);
      case 'call':      return t._call ? (t._call.id || '') : '';
      case 'in':        return uv(usageOf(t).in);
      case 'out':       return uv(usageOf(t).out);
      case 'cread':     return uv(usageOf(t).cread);
      case 'cwrite':    return uv(usageOf(t).cw);
      case 'cw5m':      return uv(usageOf(t).cw5m);
      case 'cw1h':      return uv(usageOf(t).cw1h);
      case 'readbilled': return uv(usageOf(t).readBilled);
      case 'readpeak':   return uv(usageOf(t).readPeak);
      default:          return 0;
    }
  }
  function uv(n) { return n == null ? -1 : n; }

  function cellFor(key, t, st) {
    const u = usageOf(t);
    switch (key) {
      case 'time':      return '<span class="caret">' + (st.open[t.id] ? '▾' : '▸') + '</span>' + fmtTime(t.started);
      case 'track':     {
        const rid = regionOf(t), rn = trackName(rid, st);
        return '<span class="' + ('track-name' + goneCls(rid, st)) + '" title="' + escAttr(rn) + '">' + esc(rn) + '</span>';
      }
      case 'turn':      return t.turn == null ? '—' : String(t.turn);
      case 'duration':  return fmtDur(t.duration_ms);
      case 'model':     return t.vessel ? '<span class="chip">' + esc(t.vessel) + '</span>' : '—';
      case 'stop':      return esc(t.stop_reason || '—');
      case 'actions':   return String(matchedActions(t, st).length);
      case 'cost':      return costOf(t) == null ? '—' : '$' + Number(costOf(t)).toFixed(4);
      case 'call':      return t._call
                          ? '<span class="chip" title="' + escAttr(t._call.id) + '">' + esc(shortId(t._call.id)) + '</span>'
                          : '<span class="muted" title="this vessel reports no per-call usage">—</span>';
      case 'in':        return u.in    == null ? '—' : num(u.in);
      case 'out':       return u.out   == null ? '—' : num(u.out);
      case 'cread':     return u.cread == null ? '—' : num(u.cread);
      case 'cwrite':    return u.cw    == null ? '—' : num(u.cw);
      case 'cw5m':      return u.cw5m  == null ? '—' : num(u.cw5m);
      case 'cw1h':      return u.cw1h  == null ? '—' : num(u.cw1h);
      case 'readbilled': return u.readBilled == null ? '—' : num(u.readBilled);
      case 'readpeak':   return u.readPeak   == null ? '—' : num(u.readPeak);
    }
    return '';
  }
  function shortId(s) {
    s = String(s || '');
    return s.length <= 14 ? s : (s.slice(0, 8) + '…' + s.slice(-4));
  }
  const NUMCOLS = ['duration', 'actions', 'cost', 'in', 'out', 'cread', 'cwrite', 'cw5m', 'cw1h', 'readbilled', 'readpeak'];

  function newState() {
    return {
      tracks: [],
      knownTrackIds: {},
      records: [],
      totals: {},
      transcripts: {},
      txRequested: {},
      visible: {},
      hiddenCols: { in: true, cread: true, cwrite: true },
      sort: { key: 'time', dir: -1 },
      open: {},
      openSub: {},
      atOpen: false,
      pendingFocus: null,
      dragSrcKey: null,
      colWidths: {},
      resizingCol: null,
      cols: BASE_COLS.map(c => Object.assign({}, c)),
    };
  }

  function render(frame) {
    const st = frame._ledger;
    if (!st || !frame.el) return;
    renderBar(frame, st);
    renderRollup(frame, st);
    renderAgentTotals(frame, st);
    renderBody(frame, st);
    renderLegend(frame, st);
  }

  function renderBar(frame, st) {
    const bar = frame.el.querySelector('#ledBar');
    if (!bar) return;
    const regionIds = chipIds(st);
    let html = '<div class="led-chips">';
    for (const id of regionIds) {
      const on = st.visible[id] !== false;
      const cls = (on ? 'chip on' : 'chip off') + goneCls(id, st);
      html += '<span class="' + cls + '" data-track="' + escAttr(id) + '">' + esc(trackName(id, st)) + '</span>';
    }
    html += '<button class="tb-btn" id="ledTrackAll">all</button><button class="tb-btn" id="ledTrackNone">none</button>';
    html += '</div>';
    html += '<div class="led-bar-right">';
    html += '<button class="btn-cols" id="colsBtn">Columns ▾</button>';
    html += '<div class="cols-panel hidden" id="colsPanel">';
    for (const c of st.cols) {
      if (c.pin) continue;
      const checked = !st.hiddenCols[c.key] ? ' checked' : '';
      html += '<label><input type="checkbox" data-col="' + c.key + '"' + checked + '> ' + esc(c.label) + '</label>';
    }
    html += '<button class="tb-btn" id="ledColAll">all</button><button class="tb-btn" id="ledColNone">none</button>';
    html += '</div></div>';
    bar.innerHTML = html;
    bar.querySelectorAll('.chip').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.track;
        st.visible[id] = st.visible[id] === false;
        render(frame);
      };
    });
    const trackAll = bar.querySelector('#ledTrackAll');
    if (trackAll) trackAll.onclick = () => { regionIds.forEach(id => { st.visible[id] = true; }); render(frame); };
    const trackNone = bar.querySelector('#ledTrackNone');
    if (trackNone) trackNone.onclick = () => { regionIds.forEach(id => { st.visible[id] = false; }); render(frame); };
    const colsBtn = bar.querySelector('#colsBtn');
    const colsPanel = bar.querySelector('#colsPanel');
    if (colsBtn && colsPanel) {
      colsBtn.onclick = (e) => { e.stopPropagation(); colsPanel.classList.toggle('hidden'); };
      document.addEventListener('click', () => colsPanel.classList.add('hidden'), { once: false });
      colsPanel.onclick = (e) => e.stopPropagation();
      colsPanel.querySelectorAll('input[data-col]').forEach(inp => {
        inp.onchange = () => {
          st.hiddenCols[inp.dataset.col] = !inp.checked;
          render(frame);
        };
      });
      const colAll = colsPanel.querySelector('#ledColAll');
      if (colAll) colAll.onclick = () => { st.hiddenCols = {}; render(frame); };
      const colNone = colsPanel.querySelector('#ledColNone');
      if (colNone) colNone.onclick = () => { st.cols.filter(c => !c.pin).forEach(c => { st.hiddenCols[c.key] = true; }); render(frame); };
    }
  }

  function renderRollup(frame, st) {
    const el = frame.el.querySelector('#rollup');
    if (!el) return;
    const turns = allTurns(st).filter(t => st.visible[regionOf(t)] !== false);
    let cost = 0, totalOut = 0, readBilled = 0, readPeak = 0, cw5m = 0, cw1h = 0, dur = 0, actions = 0;
    for (const t of turns) {
      cost += costOf(t) || 0;
      const u = usageOf(t);
      totalOut   += u.out        || 0;
      readBilled += u.readBilled || 0;
      readPeak   += u.readPeak   || 0;
      cw5m       += u.cw5m       || 0;
      cw1h       += u.cw1h       || 0;
      dur += t.duration_ms || 0;
      actions += matchedActions(t, st).length;
    }
    const chip = (label, value, dim) =>
      '<div class="rchip"><div class="rv' + (dim ? ' dim' : '') + '">' + esc(value) + '</div>' +
      '<div class="rl">' + esc(label) + '</div></div>';
    el.innerHTML =
      chip('Turns', String(turns.length), !turns.length) +
      chip('Duration', fmtDur(dur), !dur) +
      chip('Cost', '$' + cost.toFixed(4), !cost) +
      chip('Actions', String(actions), !actions) +
      chip('Out', num(totalOut), !totalOut) +
      chip('Read', num(readBilled), !readBilled) +
      chip('Read Peak', num(readPeak), !readPeak) +
      chip('Write 5m', num(cw5m), !cw5m) +
      chip('Write 1h', num(cw1h), !cw1h) +
      '<div class="rchip spacer"></div>';
  }

  function renderAgentTotals(frame, st) {
    const el = frame.el.querySelector('#agentTotals');
    if (!el) return;
    const chips = chipIds(st);
    const ids = Object.keys(st.totals || {})
      .filter(id => chips.includes(id) && st.visible[id] !== false);
    if (!ids.length) { el.innerHTML = ''; return; }
    ids.sort((a, b) => (st.totals[b].read_peak || 0) - (st.totals[a].read_peak || 0));

    const topPeak = st.totals[ids[0]].read_peak || 0;
    const summary = ids.length + (ids.length === 1 ? ' agent' : ' agents') +
                    (topPeak ? ' · peak ' + num(topPeak) : '');
    let html = '<div class="at-head' + (st.atOpen ? '' : ' closed') + '" id="atToggle">' +
      '<span class="at-caret">' + (st.atOpen ? '▾' : '▸') + '</span>' +
      '<span>Per-Agent Totals</span>' +
      '<span class="at-sum">' + esc(summary) + '</span>' +
      '</div>';

    if (st.atOpen) {
      html += '<table class="at"><thead><tr>'
        + '<th>Agent</th><th>Turns</th><th title="the largest context this agent ever held — a MAX across turns, and the number the context reset cap fires on">Read Peak</th>'
        + '<th title="every cached token this agent paid to read — a SUM across turns">Read</th>'
        + '<th>Out</th><th>Write 5m</th><th>Write 1h</th><th>Cost $</th></tr></thead><tbody>';
      for (const id of ids) {
        const e = st.totals[id] || {};
        html += '<tr>'
          + '<td class="at-name' + goneCls(id, st) + '">' + esc(trackName(id, st)) + '</td>'
          + '<td>' + num(e.turns) + '</td>'
          + '<td class="at-peak">' + num(e.read_peak) + '</td>'
          + '<td>' + num(e.read_billed) + '</td>'
          + '<td>' + num(e.out) + '</td>'
          + '<td>' + num(e.write_5m) + '</td>'
          + '<td>' + num(e.write_1h) + '</td>'
          + '<td>' + (e.cost_usd ? '$' + Number(e.cost_usd).toFixed(4) : '—') + '</td>'
          + '</tr>';
      }
      html += '</tbody></table>';
    }
    el.innerHTML = html;

    const head = el.querySelector('#atToggle');
    if (head) head.onclick = () => { st.atOpen = !st.atOpen; render(frame); };
  }

  function renderLegend(frame) {
    const el = frame.el.querySelector('#legend');
    if (!el) return;
    el.innerHTML =
      '<div class="lg"><span class="lgl">Color = gate outcome</span>' +
      '<span class="sw" style="background:var(--gate-white)"></span>no gate' +
      '<span class="sw" style="background:var(--gate-green)"></span>pre-permitted' +
      '<span class="sw" style="background:var(--gate-blue)"></span>asked &rarr; approved' +
      '<span class="sw" style="background:var(--gate-yellow)"></span>queued, pending' +
      '<span class="sw" style="background:var(--gate-red)"></span>denied</div>';
  }

  function renderBody(frame, st) {
    const headEl = frame.el.querySelector('#ledHead');
    const bodyEl = frame.el.querySelector('#ledBody');
    if (!headEl || !bodyEl) return;

    const cols = shownCols(st);

    const colsEl = frame.el.querySelector('#ledCols');
    if (colsEl) {
      let colgroupHtml = '';
      for (const c of cols) {
        const w = st.colWidths[c.key];
        colgroupHtml += '<col data-col="' + c.key + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>';
      }
      colsEl.innerHTML = colgroupHtml;
    }

    let headHtml = '';
    for (const c of cols) {
      const sortable = c.sort ? ' class="sortable"' : '';
      const arrow = st.sort.key === c.key ? (st.sort.dir > 0 ? ' ▲' : ' ▼') : '';
      headHtml += '<th' + sortable + ' data-col="' + c.key + '">' + esc(c.label) + arrow +
                  '<span class="col-resizer" data-col="' + c.key + '" draggable="false"></span></th>';
    }
    headEl.innerHTML = headHtml;
    headEl.querySelectorAll('th.sortable').forEach(th => {
      th.onclick = () => {
        const k = th.dataset.col;
        if (st.sort.key === k) st.sort.dir *= -1;
        else { st.sort.key = k; st.sort.dir = 1; }
        render(frame);
      };
    });
    headEl.querySelectorAll('.col-resizer').forEach(handle => {
      handle.onclick = (e) => e.stopPropagation();
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = handle.dataset.col;
        const th = handle.closest('th');
        startColResize(frame, st, key, e.clientX, th ? th.getBoundingClientRect().width : (st.colWidths[key] || 120));
      });
    });
    headEl.querySelectorAll('th').forEach(th => {
      th.draggable = true;
      th.addEventListener('dragstart', (e) => {
        st.dragSrcKey = th.dataset.col;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', th.dataset.col);
        th.classList.add('dragging');
      });
      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        th.classList.add('drag-over');
      });
      th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('drag-over');
        if (st.dragSrcKey && st.dragSrcKey !== th.dataset.col) reorderColumn(frame, st, st.dragSrcKey, th.dataset.col);
        st.dragSrcKey = null;
      });
      th.addEventListener('dragend', () => {
        headEl.querySelectorAll('th').forEach(x => x.classList.remove('dragging', 'drag-over'));
        st.dragSrcKey = null;
      });
    });

    let turns = allTurns(st).filter(t => st.visible[regionOf(t)] !== false);

    turns.sort((a, b) => {
      const av = sortVal(st.sort.key, a, st), bv = sortVal(st.sort.key, b, st);
      if (av < bv) return -st.sort.dir;
      if (av > bv) return st.sort.dir;
      return 0;
    });

    let _focusHitId = null;
    if (st.pendingFocus && turns.length) {
      const pf = st.pendingFocus;
      st.pendingFocus = null;
      for (const t of turns) {
        const match = (pf.track == null || String(regionOf(t)) === String(pf.track)) &&
                      (pf.turn == null || String(t.turn) === String(pf.turn));
        if (match) { st.open[t.id] = true; _focusHitId = t.id; break; }
      }
    }

    let bodyHtml = '';
    for (const t of turns) {
      const open = st.open[t.id];
      const rowCls = open ? 'trow open' : 'trow';
      bodyHtml += '<tr class="' + rowCls + '" data-id="' + escAttr(t.id) + '">';
      for (const c of cols) {
        const numCls = NUMCOLS.includes(c.key) ? ' class="num"' : '';
        bodyHtml += '<td' + numCls + '>' + cellFor(c.key, t, st) + '</td>';
      }
      bodyHtml += '</tr>';
      if (open) {
        bodyHtml += subRowsFor(t, cols.length, st);
      }
    }
    if (!turns.length) {
      bodyHtml = '<tr><td colspan="' + cols.length + '" class="empty">No turns recorded yet.</td></tr>';
    }
    bodyEl.innerHTML = bodyHtml;

    for (const t of turns) {
      if (!st.open[t.id]) continue;
      const wrap = bodyEl.querySelector('#tx-' + CSS.escape(t.id));
      if (wrap) mountTranscript(frame, st, t, wrap);
    }

    bodyEl.querySelectorAll('tr.trow').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('.srow')) return;
        const id = tr.dataset.id;
        st.open[id] = !st.open[id];
        render(frame);
      };
    });

    bodyEl.querySelectorAll('.srow[data-subid]').forEach(sr => {
      sr.onclick = (e) => {
        e.stopPropagation();
        const subid = sr.dataset.subid;
        st.openSub[subid] = !st.openSub[subid];
        render(frame);
      };
    });

    if (_focusHitId != null) {
      const row = bodyEl.querySelector('tr[data-id="' + escAttr(_focusHitId) + '"]');
      if (row) {
        row.classList.add('flash');
        row.scrollIntoView({ block: 'center' });
      }
    }
  }

  function reorderColumn(frame, st, srcKey, targetKey) {
    let srcIdx = -1, targetIdx = -1;
    for (let i = 0; i < st.cols.length; i++) {
      if (st.cols[i].key === srcKey) srcIdx = i;
      if (st.cols[i].key === targetKey) targetIdx = i;
    }
    if (srcIdx === -1 || targetIdx === -1) return;
    const moved = st.cols.splice(srcIdx, 1)[0];
    st.cols.splice(targetIdx, 0, moved);
    render(frame);
  }

  function startColResize(frame, st, key, startX, startW) {
    st.resizingCol = { key, x: startX, w: startW };
    const onMove = (e) => onColResize(frame, st, e);
    const onUp = () => endColResize(st, onMove, onUp);
    st._resizeMove = onMove;
    st._resizeUp = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  function onColResize(frame, st, e) {
    if (!st.resizingCol) return;
    const w = Math.max(40, Math.round(st.resizingCol.w + (e.clientX - st.resizingCol.x)));
    st.colWidths[st.resizingCol.key] = w;
    applyColWidths(frame, st);
  }
  function endColResize(st, onMove, onUp) {
    st.resizingCol = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  function applyColWidths(frame, st) {
    const colsEl = frame.el && frame.el.querySelector('#ledCols');
    if (!colsEl) return;
    colsEl.querySelectorAll('col').forEach(col => {
      const w = st.colWidths[col.dataset.col];
      if (w) col.style.width = w + 'px';
    });
  }

  function subRowsFor(t, colSpan, st) {
    const acts = matchedActions(t, st).sort((a, b) => (a.parked || 0) - (b.parked || 0));
    let html = '';

    if (!acts.length) {
      html += '<tr class="srow last"><td colspan="' + colSpan + '">' +
              '<div class="sline"><span class="muted">no matched action records for this turn</span></div>' +
              '</td></tr>';
      html += transcriptRowHtml(t, colSpan);
      return html;
    }

    acts.forEach((r, i) => {
      const key = t.id + '::' + r.id;
      const open = !!st.openSub[key];
      const color = gateColor(r);
      const failed = isFailedWrite(r);
      const isUser = r.driver === 'human';
      const lastCls = (i === acts.length - 1) ? ' last' : '';
      html += '<tr class="srow' + lastCls + '" data-subid="' + escAttr(key) + '"><td colspan="' + colSpan + '">' +
        '<div class="sline">' +
          '<span class="skind gate"><span class="ql-edge ' + color + '">' + esc(r.edge || r.action_type || '?') + '</span></span>' +
          '<div class="sbody can">' +
            '<span class="sfact mono' + (failed ? ' failed' : '') + '">' + esc(getTarget(r)) + '</span>' +
            (r.summary ? ' <span class="muted" style="font-size:10.5px">— ' + esc(r.summary) + '</span>' : '') +
            (isUser ? '<span class="ql-you">you</span>' : '') +
            (r.duration_ms != null ? ' <span class="muted" style="font-size:10.5px">' + r.duration_ms + 'ms</span>' : '') +
            (open ? '<div class="ql-io" style="margin-top:6px">' + ioBox('input', r.prompt, r.prompt_blob) + ioBox('output', r.result, r.result_blob) + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</td></tr>';
    });

    html += transcriptRowHtml(t, colSpan);
    return html;
  }

  function transcriptRowHtml(t, colSpan) {
    return '<tr class="srow srow-transcript"><td colspan="' + colSpan + '">' +
           '<div class="cp-script tx-wrap" id="tx-' + escAttr(t.id) + '" ' +
           'style="max-height:280px;overflow-y:auto"></div>' +
           '</td></tr>';
  }

  // turn blocks straight from turns.js — no chat pane
  function mountTranscript(frame, st, t, wrap) {
    const rgn = regionOf(t);
    if (rgn == null) {
      wrap.innerHTML = '<div class="empty">no track</div>';
      return;
    }
    const all = st.transcripts[rgn];
    if (all === undefined) {
      wrap.innerHTML = '<div class="empty">loading transcript…</div>';
      if (!st.txRequested[rgn]) {
        st.txRequested[rgn] = true;
        frame.send({ type: 'transcript', track: rgn, inst: frame.id });
      }
      return;
    }
    const mine = (all || []).filter(m => m && m._turn === t.turn);
    if (!mine.length) {
      wrap.innerHTML = '<div class="empty">no transcript for this turn</div>';
      return;
    }
    wrap.innerHTML = '';
    const rowName = trackName(rgn, st);
    const grouped = MX.turns._groupTurns(mine);
    grouped.forEach((turn, idx) => {
      const built = MX.turns._buildTurnBlock(rowName, turn, idx, false, null);
      wrap.appendChild(built.blk);
    });
  }

  const STYLE_ID = 'mx-ledger-style';
  const STYLE_CSS = `
.ledgerRoot{ display:flex; flex-direction:column; flex:1; min-height:0; }
#ledBar{ flex-shrink:0; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  padding:8px 14px; background:var(--surface-1); border-bottom:1px solid var(--gridline); }
.led-chips{ display:flex; align-items:center; gap:5px; flex-wrap:wrap; min-width:0; }
.led-chips .chip{ cursor:pointer; padding:3px 10px; border-radius:999px; font-size:10.5px;
  transition:background .12s, border-color .12s, color .12s, opacity .12s; }
.led-chips .chip.on{ background:var(--surface-3); border-color:var(--border-2); color:var(--text-1); }
.led-chips .chip.off{ opacity:.4; }
.led-chips .chip:hover{ border-color:var(--border-2); }
.led-chips .chip.led-gone{ border-style:dashed; }
.led-chips .chip.on.led-gone{ opacity:.55; }
table.led .track-name.led-gone{ opacity:.55; }
.led-chips .tb-btn, .cols-panel .tb-btn{ background:transparent; border-color:transparent; color:var(--text-4);
  padding:2px 5px; font-size:9.5px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; }
.led-chips .tb-btn:hover, .cols-panel .tb-btn:hover{ color:var(--text-1); }
.led-chips #ledTrackAll{ margin-left:4px; }
.led-bar-right{ margin-left:auto; position:relative; display:flex; align-items:center; gap:8px; }
.btn-cols{ background:var(--surface-2); border:1px solid var(--border); color:var(--text-2);
  border-radius:6px; padding:3px 11px; font-size:11px; cursor:pointer; white-space:nowrap;
  transition:border-color .12s, color .12s; }
.btn-cols:hover{ border-color:var(--border-2); color:var(--text-1); }
.cols-panel{ position:absolute; top:calc(100% + 7px); right:0; z-index:30;
  display:flex; flex-direction:column; gap:1px; min-width:158px; padding:7px;
  background:var(--surface-2); border:1px solid var(--border-2); border-radius:8px;
  box-shadow:0 12px 28px rgba(0,0,0,.55); }
.cols-panel.hidden{ display:none; }
.cols-panel label{ display:flex; align-items:center; gap:8px; padding:3px 6px; border-radius:5px;
  font-size:11px; color:var(--text-3); cursor:pointer; white-space:nowrap; }
.cols-panel label:hover{ background:var(--surface-3); color:var(--text-1); }
.cols-panel input[type=checkbox]{ width:12px; height:12px; margin:0; accent-color:var(--gate-blue); }
.cols-panel #ledColAll{ margin-top:5px; padding-top:6px; border-top:1px solid var(--gridline); }
.cols-panel .tb-btn{ text-align:left; }
#ledScroll{ flex:1; overflow:auto; min-height:0; padding:0 14px 40px; }
#rollup{ display:flex; align-items:stretch; gap:0; flex-wrap:wrap; margin:12px 14px;
  background:linear-gradient(180deg, var(--surface-2), var(--surface-1));
  border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.rchip{ padding:10px 20px; min-width:104px; transition:background .12s; }
.rchip + .rchip{ background-image:linear-gradient(var(--gridline), var(--gridline));
  background-size:1px 58%; background-position:left center; background-repeat:no-repeat; }
.rchip .rv{ font-family:var(--mono); font-size:17px; line-height:1.15; color:var(--text-1);
  font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
.rchip .rl{ font-size:9px; text-transform:uppercase; letter-spacing:.11em; color:var(--text-4);
  margin-top:5px; font-weight:600; }
.rchip.spacer{ flex:1; min-width:0; }
.rchip .rv.dim{ color:var(--text-4); }
.rchip:not(.spacer):hover{ background:rgba(255,255,255,0.04); }
.rchip:not(.spacer):hover .rl{ color:var(--text-3); }
#agentTotals:empty{ display:none; }
#agentTotals{ margin:0 14px 12px; border:1px solid var(--border); border-radius:8px;
  background:var(--surface-1); overflow:hidden; }
.at-head{ font-size:9px; text-transform:uppercase; letter-spacing:.11em; color:var(--text-4);
  font-weight:600; padding:8px 12px 6px; border-bottom:1px solid var(--gridline);
  display:flex; align-items:baseline; gap:8px; cursor:pointer; user-select:none; }
.at-head:hover{ color:var(--text-3); }
.at-head.closed{ border-bottom:none; padding-bottom:8px; }
.at-caret{ font-size:10px; line-height:1; letter-spacing:0; }
.at-sum{ text-transform:none; letter-spacing:0; color:var(--text-3);
  font-family:var(--mono); font-size:10px; font-variant-numeric:tabular-nums; }
table.at{ width:100%; border-collapse:collapse; font-family:var(--mono); font-size:11px; }
table.at th{ text-align:right; padding:5px 12px; font-weight:600; font-size:9px;
  text-transform:uppercase; letter-spacing:.08em; color:var(--text-4);
  border-bottom:1px solid var(--gridline); white-space:nowrap; }
table.at td{ text-align:right; padding:5px 12px; color:var(--text-2);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
table.at th:first-child, table.at td:first-child{ text-align:left; }
table.at tr:hover td{ background:rgba(255,255,255,0.03); }
.at-name{ color:var(--text-1); }
.at-peak{ color:var(--text-1); font-weight:600; }
table.led{ width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; background:var(--surface-1); border-radius:8px; }
table.led th, table.led td{ padding:7px 10px; border-bottom:1px solid var(--gridline); text-align:left; vertical-align:top; }
table.led tr.trow > td{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
table.led thead{ position:sticky; top:0; z-index:2; }
table.led th{ position:relative; background:var(--surface-2); font-size:9.5px; text-transform:uppercase;
  letter-spacing:.05em; color:var(--text-4); font-weight:700; cursor:pointer; user-select:none;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
table.led th .arw{ opacity:.6; margin-left:3px; font-size:8px; }
table.led .col-resizer{ position:absolute; top:0; right:-4px; width:8px; height:100%; cursor:col-resize; z-index:1; }
table.led .col-resizer:hover, table.led .col-resizer:active{ background:var(--gate-blue); opacity:.5; }
table.led th.dragging{ opacity:.4; }
table.led th.drag-over{ box-shadow:inset 2px 0 0 var(--text-2); }
table.led td.num{ text-align:right; font-family:var(--mono); font-variant-numeric:tabular-nums; color:var(--text-2); }
table.led td.blank{ text-align:right; color:var(--text-4); }
tr.trow{ cursor:pointer; }
tr.trow.open{ background:rgba(255,255,255,0.05); }
tr.trow.flash{ animation:mxLedFlash 1.6s ease-out 1; }
@keyframes mxLedFlash{ 0%,40%{ background:rgba(57,135,229,.28); } 100%{ background:transparent; } }
tr.trow td:first-child{ white-space:nowrap; }
.caret{ display:inline-block; width:11px; color:var(--text-4); font-size:9px; }
tr.srow td{ border-bottom:none; padding:3px 10px 3px 30px; background:var(--well); }
tr.srow.last td{ border-bottom:1px solid var(--gridline); padding-bottom:8px; }
.sline{ display:flex; align-items:flex-start; gap:9px; }
.skind{ width:70px; flex-shrink:0; font-size:9.5px; text-transform:uppercase; letter-spacing:.05em;
  color:var(--text-4); padding-top:2px; font-weight:600; }
.skind.gate{ color:var(--text-2); }
.sbody{ flex:1; min-width:0; }
.sbody.can{ cursor:pointer; }
.sbody.can .sfact{ text-decoration:underline; }
.sfact{ color:var(--text-2); font-size:12px; }
.sfact.mono{ font-family:var(--mono); font-size:11.5px; }
.sfact.failed{ color:var(--gate-red); }
`;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }

  MX.registerWidget('ledger', {
    mount(frame) {
      ensureStyle();
      const st = frame._ledger = newState();

      frame.el = document.createElement('div');
      frame.el.className = 'mx-ledger ledgerRoot';
      frame.el.innerHTML =
        '<div id="ledBar"></div>' +
        '<div id="rollup"></div>' +
        '<div id="agentTotals"></div>' +
        '<div id="ledScroll">' +
          '<table class="led"><colgroup id="ledCols"></colgroup><thead><tr id="ledHead"></tr></thead><tbody id="ledBody"></tbody></table>' +
        '</div>' +
        '<div id="legend"></div>';
      frame.host.appendChild(frame.el);

      frame._ledgerOpenHandler = (e) => {
        const d = (e && e.detail) || {};
        if (d.track == null && d.turn == null) return;
        st.pendingFocus = { track: d.track, turn: d.turn };
        render(frame);
      };
      document.addEventListener('mx:open-ledger', frame._ledgerOpenHandler);

      frame.subscribe(['track_list', 'feed', 'transcript']);
      frame.send({ type: 'feed', inst: frame.id });

      render(frame);
    },

    unmount(frame) {
      if (frame._ledgerOpenHandler) {
        document.removeEventListener('mx:open-ledger', frame._ledgerOpenHandler);
        frame._ledgerOpenHandler = null;
      }
      frame._ledger = null;
    },

    onFrame(frame, msg) {
      const st = frame._ledger;
      if (!st) return;
      if (msg.inst && msg.inst !== frame.id) return;

      if (msg.type === 'track_list') {
        st.tracks = msg.rows || [];
        for (const r of st.tracks) if (r && r.id != null) st.knownTrackIds[r.id] = true;
        render(frame);
      } else if (msg.type === 'feed') {
        st.records = msg.records || [];
        st.totals = msg.totals || {};
        render(frame);
      } else if (msg.type === 'transcript') {
        st.transcripts[msg.id] = msg.messages || [];
        render(frame);
      }
    },
  });
})();
