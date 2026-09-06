

const _TOOL_RESULT_ECHO_RE = /^\[\w+ result\]\n/;

const _MAIL_FROM_RE   = /^\[message from (.+?) \(id: [^)]+\) — another agent, not the user\. Reply to that id with send_message\.\]\n?/;
const _MAIL_NOTICE_RE = /^\[NOTICE from the harness — not a user, not another agent\]\n?/;
const _MAIL_ALERT_RE  = /^● NEW MAIL — /;

function _classifyInbound(text) {
  let m = _MAIL_FROM_RE.exec(text);
  if (m) return { kind: 'mail', who: m[1], body: text.slice(m[0].length) };
  m = _MAIL_NOTICE_RE.exec(text);
  if (m) return { kind: 'notice', who: 'harness', body: text.slice(m[0].length) };
  if (_MAIL_ALERT_RE.test(text)) return { kind: 'notice', who: 'mail', body: text };
  return null;
}

const _SEND_CMD_RE = /SEND:\s*([^\n]+)[\s\S]*?---BEGIN---\n[\s\S]*?\n?---END---/g;
function _stripSendBlocks(text) {
  if (!text) return text;
  return text.replace(_SEND_CMD_RE, (_, who) => '→ message sent to ' + who.trim());
}

function _text(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(p => (typeof p === 'string' ? p : (p && p.text) || '[image]')).join('');
  }
  return '';
}

function _mediaTag(media) {
  if (!Array.isArray(media) || !media.length) return '';
  return media.map(m => `[${(m && m.kind) || 'image'}]`).join(' ');
}

const _IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;

export function makeImageIntake({ inputEl, scriptEl }) {
  let pending = [];

  const row = inputEl ? inputEl.closest('.cp-input') : null;

  function sync() {
    if (!row) return;
    if (pending.length) {
      row.dataset.pending =
        pending.length + (pending.length > 1 ? ' images' : ' image') + ' · esc';
    } else {
      delete row.dataset.pending;
    }
  }

  if (inputEl) {
    inputEl.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      const files = [];
      for (const it of items) {
        if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => {
        const r = new FileReader();
        r.onload = () => {
          const uri = String(r.result);
          const c = uri.indexOf(',');
          pending.push({ mime: f.type, data_b64: c >= 0 ? uri.slice(c + 1) : uri });
          sync();
        };
        r.readAsDataURL(f);
      });
    });
  }

  [scriptEl, row].forEach((el) => {
    if (!el) return;
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (row) row.classList.add('drop-lit');
    });
    el.addEventListener('dragleave', () => {
      if (row) row.classList.remove('drop-lit');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (row) row.classList.remove('drop-lit');
      const path = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (!path || !_IMG_EXT.test(path)) return;
      pending.push({ path });
      sync();
    });
  });

  return {
    count: () => pending.length,
    clear() { pending = []; sync(); },
    drain() {
      const media = pending.filter((p) => p.data_b64)
        .map((p) => ({ kind: 'image', mime: p.mime, data_b64: p.data_b64 }));
      const paths = pending.filter((p) => p.path).map((p) => p.path);
      const echo  = pending.length ? pending.map(() => ({ kind: 'image' })) : null;
      pending = [];
      sync();
      return { media, paths, echo };
    },
  };
}

export function _groupTurns(messages) {
  const turns = [];
  let current = null;
  for (const msg of (messages || [])) {
    if (!msg || msg.role === 'system' || msg._seat_context || msg.role === 'tool') continue;
    const text = _text(msg.content);
    if (msg.role === 'user') {
      if (_TOOL_RESULT_ECHO_RE.test(text)) continue;
      const inbound = _classifyInbound(text);
      if (inbound && inbound.kind === 'notice' && inbound.who === 'mail') continue;
      current = inbound
        ? { user: inbound.body, media: msg.media, agent: [], thinking: [], kind: inbound.kind, who: inbound.who }
        : { user: text, media: msg.media, agent: [], thinking: [] };
      turns.push(current);
    } else if (msg.role === 'assistant') {
      if (!current) { current = { user: '', media: null, agent: [], thinking: [] }; turns.push(current); }
      if (text.trim()) current.agent.push(text);
      const think = _text(msg.thinking);
      if (think.trim()) current.thinking.push(think);
    }
  }
  return turns;
}


export function _buildTurnBlock(rowName, turn, idx, live, onTurnHover) {
  const blk = document.createElement('div');
  blk.className = 'turnblock';
  blk.dataset.turn = String(idx);

  if (turn.kind === 'mail') {
    const mark = document.createElement('div');
    mark.className = 'msg-mark';
    mark.textContent = '← message from ' + (turn.who || 'a peer');
    blk.appendChild(mark);
  } else {
    const userText = (turn.user || '') + (turn.media ? ' ' + _mediaTag(turn.media) : '');
    if (userText.trim()) {
      const row = document.createElement('div');
      row.className = 'msg ' + (turn.kind === 'notice' ? 'notice' : 'user');
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = turn.who || 'you';
      const bub = document.createElement('div');
      bub.className = 'bub';
      bub.textContent = userText;
      row.appendChild(who);
      row.appendChild(bub);
      blk.appendChild(row);
    }
  }

  const thinkingText = (turn.thinking || []).join('\n\n');
  if (thinkingText.trim()) {
    const tb = _makeThinkingBlock();
    tb.el.classList.remove('thinking');
    tb.body.textContent = thinkingText;
    blk.appendChild(tb.el);
  }

  let liveBub = null;
  const agentText = (turn.agent || []).join('\n\n');
  if (agentText || live) {
    const row = document.createElement('div');
    row.className = 'msg agent';
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = rowName || 'agent';
    const bub = document.createElement('div');
    bub.className = 'bub';
    if (agentText && !live) _renderFenced(bub, _stripSendBlocks(agentText));
    else bub.textContent = agentText;
    row.appendChild(who);
    row.appendChild(bub);
    blk.appendChild(row);
    if (live) liveBub = bub;
  }

  const foot = document.createElement('div');
  foot.className = 'tb-foot';
  const hint = document.createElement('span');
  hint.className = 'tb-hint';
  hint.textContent = 'ledger → (S8)';
  foot.appendChild(hint);
  blk.appendChild(foot);

  blk.addEventListener('mouseenter', () => {
    if (typeof onTurnHover === 'function') onTurnHover(turn, idx);
  });

  return { blk, liveBub };
}

export function mailRows(evt) {
  const bodies  = (evt && evt.bodies) || [];
  const from    = (evt && evt.from) || [];
  const system  = (evt && evt.system) || [];
  const paired  = from.length === bodies.length;
  const fallback = from.join(', ') || 'unknown sender';
  return bodies.map((body, i) => {
    const who = paired ? from[i] : fallback;
    return { who, body: body || '', system: paired && system.indexOf(who) !== -1 };
  });
}

function _buildMailBlock(evt) {
  const blk = document.createElement('div');
  blk.className = 'turnblock';
  const rows = mailRows(evt);
  if (!rows.length) return null;
  rows.forEach(r => {
    if (!r.system) {
      const mark = document.createElement('div');
      mark.className = 'msg-mark';
      mark.textContent = '← message from ' + (r.who || 'a peer');
      blk.appendChild(mark);
      return;
    }
    const row = document.createElement('div');
    row.className = 'msg notice';
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = 'harness';
    const bub = document.createElement('div');
    bub.className = 'bub';
    bub.textContent = r.body;
    row.appendChild(who);
    row.appendChild(bub);
    blk.appendChild(row);
  });
  return blk;
}


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
    if (!g.settled && typeof onSettle === 'function') {
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

function _scrollToLatestTurnIn(scriptEl) {
  const blocks = scriptEl.querySelectorAll('.turnblock');
  if (!blocks.length) return;
  const blk = blocks[blocks.length - 1];
  blk.scrollIntoView({ block: 'center' });
  blk.classList.add('flash');
  setTimeout(() => blk.classList.remove('flash'), 1900);
}


const _PHASE_LABEL = { waiting: 'WAITING', thinking: 'THINKING', working: 'WORKING', idle: 'IDLE' };

function fmtDur(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

const _baseTitle = (typeof document !== 'undefined') ? document.title : 'ADE';
const _appName   = _baseTitle.split(' — ')[0];

function makeBusyMeters(els, opts) {
  const ownsTitle = !!(opts && opts.ownsTitle);
  const e = els || {};
  let phase = 'idle', phaseStart = 0;
  let waitMs = 0, thinkMs = 0, workMs = 0;
  let timerTick = null;
  let hmmTimeEl = null, hmmStartT = 0;

  function renderBusyWord(word) {
    if (!e.busyWord) return;
    e.busyWord.innerHTML = '';
    for (const ch of word) {
      const s = document.createElement('span');
      s.className = 'busy-l';
      s.textContent = ch;
      e.busyWord.appendChild(s);
    }
  }

  function renderTimers() {
    const now = performance.now();
    const onWait  = phase === 'waiting';
    const onThink = phase === 'thinking';
    const onWork  = phase === 'working';
    const wait  = waitMs  + (onWait  ? now - phaseStart : 0);
    const think = thinkMs + (onThink ? now - phaseStart : 0);
    const work  = workMs  + (onWork  ? now - phaseStart : 0);
    if (e.tWaitEl)  { e.tWaitEl.textContent  = 'wait '  + fmtDur(wait);  e.tWaitEl.classList.toggle('t-active', onWait); }
    if (e.tThinkEl) { e.tThinkEl.textContent = 'think ' + fmtDur(think); e.tThinkEl.classList.toggle('t-active', onThink); }
    if (e.tWorkEl)  { e.tWorkEl.textContent  = 'work '  + fmtDur(work);  e.tWorkEl.classList.toggle('t-active', onWork); }
    if (hmmTimeEl) hmmTimeEl.textContent = fmtDur(now - hmmStartT);
    if (ownsTitle) {
      document.title = (phase && phase !== 'idle')
        ? `${phase} ${fmtDur(now - phaseStart)} · ${_appName}`
        : _baseTitle;
    }
  }

  function advancePhase(p) {
    const now = performance.now();
    const next = p || 'idle';
    if (phase === 'waiting')       waitMs  += now - phaseStart;
    else if (phase === 'thinking') thinkMs += now - phaseStart;
    else if (phase === 'working')  workMs  += now - phaseStart;
    const wasBusy = phase && phase !== 'idle';
    const nowBusy = next !== 'idle';
    if (!wasBusy && nowBusy) { waitMs = 0; thinkMs = 0; workMs = 0; }
    phase = next;
    phaseStart = now;
    if (nowBusy && !timerTick) timerTick = setInterval(renderTimers, 250);
    else if (!nowBusy && timerTick) { clearInterval(timerTick); timerTick = null; }
    renderTimers();
  }

  function setStatus(p) {
    advancePhase(p);
    if (e.metStatus) e.metStatus.textContent = p || 'idle';
    const busy = p && p !== 'idle';
    if (e.busyEl) e.busyEl.classList.toggle('busy-hidden', !busy);
    if (busy) renderBusyWord(_PHASE_LABEL[p] || 'WORKING');
  }

  function setMeters(d) {
    if (!d) return;
    const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
    if (e.metCtx)   e.metCtx.textContent   = `ctx ${fmtK(d.ctx_used)}/${fmtK(d.ctx_max)}`;
    if (e.metCache) e.metCache.textContent = `cache ${fmtK(d.cached || 0)}`;
    if (e.metNow)   e.metNow.textContent   = `t/s ${(d.ts_now || 0).toFixed(1)}`;
    if (e.metAvg)   e.metAvg.textContent   = `avg ${(d.ts_avg || 0).toFixed(1)}`;
  }

  function hmmBegin(el) { hmmTimeEl = el || null; hmmStartT = performance.now(); }
  function hmmFreeze() {
    if (hmmTimeEl) { hmmTimeEl.textContent = fmtDur(performance.now() - hmmStartT); hmmTimeEl = null; }
  }

  function reset() {
    if (timerTick) { clearInterval(timerTick); timerTick = null; }
    phase = 'idle'; phaseStart = performance.now();
    waitMs = 0; thinkMs = 0; workMs = 0; hmmTimeEl = null;
    if (e.busyEl) e.busyEl.classList.add('busy-hidden');
    if (e.metStatus) e.metStatus.textContent = 'idle';
    renderTimers();
  }

  return { setStatus, setMeters, hmmBegin, hmmFreeze, reset };
}

function _makeThinkingBlock() {
  const details = document.createElement('details');
  details.className = 'cot thinking';
  const summary = document.createElement('summary');
  summary.innerHTML = '<span class="hmm-l">H</span><span class="hmm-l">m</span><span class="hmm-l">m</span><span class="hmm-l">m</span><span class="hmm-d1"> ...</span><span class="hmm-d2"> ...</span><span class="hmm-d3"> ...</span>';
  const ht = document.createElement('span');
  ht.className = 'hmm-time';
  summary.appendChild(ht);
  details.appendChild(summary);
  const body = document.createElement('div');
  body.className = 'cot-body';
  details.appendChild(body);
  return { el: details, body, timeEl: ht };
}

function _appendDimRow(scriptEl, text, pin) {
  if (!text) return;
  const row = document.createElement('div');
  row.className = 'bub dim';
  row.textContent = text;
  scriptEl.appendChild(row);
  pin.scrollIfPinned();
}

function parseFences(str) {
  const segments = [];
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let lastIdx = 0, m;
  while ((m = fenceRe.exec(str)) !== null) {
    if (m.index > lastIdx) segments.push({ type: 'text', content: str.slice(lastIdx, m.index) });
    segments.push({ type: 'code', lang: m[1].trim(), content: m[2] });
    lastIdx = fenceRe.lastIndex;
  }
  if (lastIdx < str.length) segments.push({ type: 'text', content: str.slice(lastIdx) });
  return segments;
}

function _renderFenced(container, text) {
  container.innerHTML = '';
  const segments = parseFences(text || '');
  for (const seg of segments) {
    if (seg.type === 'text') {
      const span = document.createElement('span');
      span.textContent = seg.content;
      container.appendChild(span);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'code-fence';
      const header = document.createElement('div');
      header.className = 'code-fence-header';
      if (seg.lang) {
        const langLabel = document.createElement('span');
        langLabel.className = 'code-fence-lang';
        langLabel.textContent = seg.lang;
        header.appendChild(langLabel);
      }
      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-fence-copy';
      copyBtn.textContent = 'copy';
      const codeText = seg.content;
      copyBtn.onclick = () => {
        try {
          navigator.clipboard.writeText(codeText).then(() => {
            copyBtn.textContent = 'copied';
            setTimeout(() => { copyBtn.textContent = 'copy'; }, 1500);
          }).catch(() => { copyBtn.textContent = 'err'; });
        } catch (err) { copyBtn.textContent = 'err'; }
      };
      header.appendChild(copyBtn);
      wrap.appendChild(header);
      const pre = document.createElement('pre');
      pre.className = 'code-fence-body';
      const code = document.createElement('code');
      code.textContent = codeText;
      pre.appendChild(code);
      wrap.appendChild(pre);
      container.appendChild(wrap);
    }
  }
}

function _streamOut(scriptEl, rowName, state, busyMeters, text, o, onTurnHover, pin) {
  const t = text || '';
  const emp = scriptEl.querySelector('.empty');
  if (emp && (t || o.dim)) emp.remove();

  if (o.dim && o.end === '') {
    if (state.liveBub) {
      _renderFenced(state.liveBub, _stripSendBlocks(state.liveText));
      state.liveBub = null; state.liveText = '';
    }
    if (!state.thinkingEl) {
      const tb = _makeThinkingBlock();
      scriptEl.appendChild(tb.el);
      state.thinkingEl = tb.body;
      if (busyMeters) busyMeters.hmmBegin(tb.timeEl);
    }
    state.thinkingEl.textContent += t;
    pin.scrollIfPinned();
    return;
  }

  if (state.thinkingEl) {
    state.thinkingEl.parentElement.classList.remove('thinking');
    state.thinkingEl = null;
    if (busyMeters) busyMeters.hmmFreeze();
  }

  if (!o.dim && !t && o.end === '\n' && !state.liveBub) return;

  if (o.dim) {
    if (state.liveBub) {
      _renderFenced(state.liveBub, _stripSendBlocks(state.liveText));
      state.liveBub = null; state.liveText = '';
    }
    _appendDimRow(scriptEl, t + (o.end || ''), pin);
    return;
  }

  if (!state.liveBub) {
    const { blk, liveBub } = _buildTurnBlock(
      rowName, { user: '', media: null, agent: [] },
      scriptEl.querySelectorAll('.turnblock').length, true, onTurnHover);
    scriptEl.appendChild(blk);
    state.liveBub = liveBub;
    state.liveText = '';
  }
  state.liveText += t + (o.end || '');
  state.liveBub.textContent = state.liveText;
  pin.scrollIfPinned();
  if (o.end === '\n' && t === '') {
    _renderFenced(state.liveBub, _stripSendBlocks(state.liveText));
    state.liveBub = null;
    state.liveText = '';
  }
}

function makeScrollPin(scriptEl, jumpBtn) {
  let pinned = true;
  function updateBtn() {
    if (jumpBtn) jumpBtn.classList.toggle('hidden', pinned);
  }
  function scrollIfPinned() {
    if (pinned) scriptEl.scrollTop = scriptEl.scrollHeight;
  }
  function scrollToBottom() {
    scriptEl.scrollTop = scriptEl.scrollHeight;
    pinned = true;
    updateBtn();
  }
  function reset() {
    pinned = true;
    updateBtn();
  }
  scriptEl.addEventListener('scroll', () => {
    pinned = (scriptEl.scrollHeight - scriptEl.scrollTop - scriptEl.clientHeight) < 40;
    updateBtn();
  });
  if (jumpBtn) jumpBtn.addEventListener('click', scrollToBottom);
  return { scrollIfPinned, scrollToBottom, reset };
}

export function makeChatPane(els, send, opts) {
  const { scriptEl, gateListEl, inputEl, sendBtn, nameEl } = els;
  const onTurnHover = opts && opts.onTurnHover;
  const onSettle = opts && opts.onSettle;

  let trackId = null;
  let trackName = '';

  const _stream = { liveBub: null, liveText: '', thinkingEl: null };

  const _paneRoot = (scriptEl && scriptEl.closest && scriptEl.closest('.pane')) || document;
  const busyMeters = makeBusyMeters({
    busyEl:    _paneRoot.querySelector('.cp-busy'),
    busyWord:  _paneRoot.querySelector('.cp-busy-word'),
    dotEl:     _paneRoot.querySelector('.cp-busy-dot'),
    tWaitEl:   _paneRoot.querySelector('.cp-timer-wait'),
    tThinkEl:  _paneRoot.querySelector('.cp-timer-think'),
    tWorkEl:   _paneRoot.querySelector('.cp-timer-work'),
    metStatus: _paneRoot.querySelector('.cp-met-status'),
    metCtx:    _paneRoot.querySelector('.cp-met-ctx'),
    metCache:  _paneRoot.querySelector('.cp-met-cache'),
    metNow:    _paneRoot.querySelector('.cp-met-tsnow'),
    metAvg:    _paneRoot.querySelector('.cp-met-tsavg'),
  }, { ownsTitle: !!(opts && opts.ownsTitle) });

  const pin = makeScrollPin(scriptEl, _paneRoot.querySelector('.cp-jump-bottom'));

  let _gates = [];


  function _turnCount() {
    return scriptEl.querySelectorAll('.turnblock').length;
  }

  function renderTranscript(messages) {
    scriptEl.innerHTML = '';
    _stream.liveBub = null;
    _stream.liveText = '';
    _stream.thinkingEl = null;
    const turns = _groupTurns(messages);
    if (!turns.length) {
      scriptEl.innerHTML = '<div class="empty">no turns on this track</div>';
      return;
    }
    turns.forEach((t, idx) => {
      const { blk } = _buildTurnBlock(trackName, t, idx, false, onTurnHover);
      scriptEl.appendChild(blk);
    });
    pin.scrollToBottom();
  }

  function appendOut(text, appendOpts) {
    _streamOut(scriptEl, trackName, _stream, busyMeters, text, appendOpts || {}, onTurnHover, pin);
  }

  function renderMail(evt) {
    const blk = _buildMailBlock(evt);
    if (!blk) return;
    const wasEmpty = scriptEl.querySelector('.empty');
    if (wasEmpty) scriptEl.innerHTML = '';
    scriptEl.appendChild(blk);
    pin.scrollIfPinned();
  }


  function _localSettle(gateId, action) {
    const outcome = _settleOutcome(action);
    const g = outcome && _gates.find(x => x.id === gateId);
    if (g) {
      g.active = false;
      g.settled = true;
      g.outcome = outcome;
      g.settledAt = ++_settleSeq;
      _gates = _capSettledGates(_gates);
      _renderGateList();
    }
    if (typeof onSettle === 'function') onSettle(gateId, action);
  }

  function _renderGateList() {
    _renderGateListInto(gateListEl, _gates, () => _scrollToLatestTurnIn(scriptEl), _localSettle);
  }

  function renderGateHistory(records) {
    _gates = _gates.filter(g => !g.hist).concat(_histRows(records));
    _renderGateList();
  }

  function renderGate(frame) {
    if (!frame) return;
    if (frame.type === 'gate_pending') {
      const next = [];
      if (frame.active) next.push({ id: frame.active.id, prompt: frame.active.prompt, active: true });
      (frame.pending || []).forEach(p => next.push({ id: p.id, prompt: p.prompt, active: false }));
      _gates = _reconcileGates(_gates, next);
    } else if (frame.type === 'ask') {
      const existing = _gates.find(g => g.id === frame.id);
      if (existing) { existing.prompt = frame.prompt; existing.active = true; existing.settled = false; existing.outcome = undefined; }
      else _gates.push({ id: frame.id, prompt: frame.prompt, active: true });
    } else {
      return;
    }
    _renderGateList();
  }


  function setTrack(id, name) {
    trackId = id;
    trackName = name || '';
    if (nameEl) nameEl.textContent = trackName;
    _gates = [];
    gateListEl.innerHTML = '';
    _stream.liveBub = null;
    _stream.liveText = '';
    _stream.thinkingEl = null;
    busyMeters.reset();
    pin.reset();
  }

  function clear() {
    scriptEl.innerHTML = '';
    gateListEl.innerHTML = '';
    _gates = [];
    _stream.liveBub = null;
    _stream.liveText = '';
    _stream.thinkingEl = null;
    busyMeters.reset();
    pin.reset();
  }

  const imgs = makeImageIntake({ inputEl, scriptEl });


  function _submit() {
    const text = inputEl.value.trim();
    if (!text && !imgs.count()) return;
    const { media, paths, echo } = imgs.drain();
    const { blk } = _buildTurnBlock(trackName, { user: text, media: echo, agent: [] }, _turnCount(), false, onTurnHover);
    scriptEl.appendChild(blk);
    pin.scrollToBottom();
    const frame = { type: 'user', text };
    if (media.length) frame.media = media;
    if (paths.length) frame.image_paths = paths;
    send(frame);
    inputEl.value = '';
  }

  if (sendBtn) sendBtn.onclick = _submit;
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submit(); }
      else if (e.key === 'Escape' && imgs.count() && !inputEl.value) {
        e.preventDefault();
        imgs.clear();
      }
    });
  }

  return {
    setTrack,
    renderTranscript,
    appendOut,
    renderGate,
    renderGateHistory,
    renderMail,
    clear,
    setStatus: busyMeters.setStatus,
    setMeters: busyMeters.setMeters,
    getTrackId: () => trackId,
  };
}

export default makeChatPane;


function _focusEls() {
  return {
    scriptEl: document.getElementById('focusScript'),
    gateListEl: document.getElementById('focusGates'),
    nameEl: document.getElementById('focusName'),
  };
}

let _mTrack = null;
const _mStream = { liveBub: null, liveText: '', thinkingEl: null };
let _mGates = [];

let _mirrorSettleFn = null;
export function wireMirrorSettle(fn) {
  _mirrorSettleFn = fn;
}

let _mBusy = null;
function _focusBusyEls() {
  const root = document.getElementById('focus') || document;
  return {
    busyEl:    root.querySelector('.cp-busy'),
    busyWord:  root.querySelector('.cp-busy-word'),
    dotEl:     root.querySelector('.cp-busy-dot'),
    tWaitEl:   root.querySelector('.cp-timer-wait'),
    tThinkEl:  root.querySelector('.cp-timer-think'),
    tWorkEl:   root.querySelector('.cp-timer-work'),
    metStatus: root.querySelector('.cp-met-status'),
    metCtx:    root.querySelector('.cp-met-ctx'),
    metCache:  root.querySelector('.cp-met-cache'),
    metNow:    root.querySelector('.cp-met-tsnow'),
    metAvg:    root.querySelector('.cp-met-tsavg'),
  };
}
function _ensureMBusy() {
  if (!_mBusy) _mBusy = makeBusyMeters(_focusBusyEls(), { ownsTitle: false });
  return _mBusy;
}

let _mPin = null;
function _ensureMPin() {
  if (!_mPin) {
    const root = document.getElementById('focus') || document;
    _mPin = makeScrollPin(document.getElementById('focusScript'), root.querySelector('.cp-jump-bottom'));
  }
  return _mPin;
}

function _mirrorReset(track) {
  _mTrack = track;
  _mStream.liveBub = null;
  _mStream.liveText = '';
  _mStream.thinkingEl = null;
  _mGates = [];
  _ensureMBusy().reset();
  _ensureMPin().reset();
  const { scriptEl, gateListEl, nameEl } = _focusEls();
  if (scriptEl) scriptEl.innerHTML = '<div class="empty">no turns on this track</div>';
  if (gateListEl) gateListEl.innerHTML = '';
  if (nameEl) nameEl.textContent = track || '—';
}

export function mirrorDetach() { _mirrorReset(null); }

export function mirrorAttach(trackId) { _mirrorReset(trackId); }

export function appendMirrorEcho(text) {
  const { scriptEl } = _focusEls();
  if (!scriptEl || !_mTrack) return;
  const wasEmpty = scriptEl.querySelector('.empty');
  if (wasEmpty) scriptEl.innerHTML = '';
  const idx = scriptEl.querySelectorAll('.turnblock').length;
  const { blk } = _buildTurnBlock('', { user: text, media: null, agent: [] }, idx, false, undefined);
  scriptEl.appendChild(blk);
  _ensureMPin().scrollToBottom();
}

function _paintMirrorGates() {
  const { scriptEl, gateListEl } = _focusEls();
  if (!gateListEl) return;
  const onSettle = _mirrorSettleFn && ((gateId, action) => {
    _mirrorSettleFn(gateId, action, _mTrack);
    const outcome = _settleOutcome(action);
    const g = outcome && _mGates.find(x => x.id === gateId);
    if (g) {
      g.active = false;
      g.settled = true;
      g.outcome = outcome;
      g.settledAt = ++_settleSeq;
      _mGates = _capSettledGates(_mGates);
    }
    _paintMirrorGates();
  });
  _renderGateListInto(gateListEl, _mGates, () => _scrollToLatestTurnIn(scriptEl), onSettle);
}

export function renderMirror(m) {
  if (!m || !m.track) return;
  const { scriptEl, gateListEl } = _focusEls();
  if (!scriptEl || !gateListEl) return;
  if (m.track !== _mTrack) _mirrorReset(m.track);

  switch (m.kind) {
    case 'transcript': {
      if (!scriptEl.querySelector('.empty')) break;
      const turns = _groupTurns(m.messages || []);
      if (!turns.length) break;
      scriptEl.innerHTML = '';
      turns.forEach((t, idx) => {
        const { blk } = _buildTurnBlock(m.track, t, idx, false, undefined);
        scriptEl.appendChild(blk);
      });
      _ensureMPin().scrollToBottom();
      break;
    }

    case 'out':
      _streamOut(scriptEl, m.track, _mStream, _ensureMBusy(),
                 m.text, { dim: m.dim, end: m.end }, undefined, _ensureMPin());
      break;

    case 'gate': {
      const f = m.frame || {};
      if (f.id) {
        const existing = _mGates.find(g => g.id === f.id);
        if (existing) { existing.prompt = f.prompt; existing.active = true; existing.settled = false; existing.outcome = undefined; }
        else _mGates.push({ id: f.id, prompt: f.prompt, active: true });
      }
      _paintMirrorGates();
      break;
    }

    case 'gatelog': {
      _mGates = _mGates.filter(g => !g.hist).concat(_histRows(m.records || []));
      _paintMirrorGates();
      break;
    }

    case 'status':
      _ensureMBusy().setStatus(m.phase);
      break;
    case 'meters':
      _ensureMBusy().setMeters(m.d);
      break;

    case 'term':
      break;

    case 'event': {
      const evt = m.evt || {};
      if (evt.kind !== 'mail') break;
      const blk = _buildMailBlock(evt);
      if (!blk) break;
      if (scriptEl.querySelector('.empty')) scriptEl.innerHTML = '';
      scriptEl.appendChild(blk);
      _ensureMPin().scrollIfPinned();
      break;
    }

    default:
      break;
  }
}
