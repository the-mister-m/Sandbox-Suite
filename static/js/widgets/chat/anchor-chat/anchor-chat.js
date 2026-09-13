// anchor chat — a chat pane with a region switcher, no gate list
//
// One instance binds to one region through its head select, sends
// `follow` to stream that region live and `unfollow` for the one it
// leaves, `transcript` to reload it, `user` to run a turn, `stop` to end
// one. Several instances in one window each stream their own region.
//
// State: frame._anchorChat holds the DOM refs, the busy meters, the
// scroll pin, the live-stream buffer, the roster rows, the bound region
// id and the region currently followed.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // speech — one chat speaks at a time, across the windows of one browser;
  // the lock key is shared with the chat widget so the two never talk over
  // each other. A non-browser tts engine sends rendered audio instead of
  // text, played back through playAudio() the same way.
  const SPEECH_LOCK_KEY = "mx.speech.lock";
  const SPEECH_LOCK_MS = 15000;

  function _readSpeechLock() {
    try {
      const raw = window.localStorage.getItem(SPEECH_LOCK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _claimSpeechLock(holder) {
    const now = Date.now();
    const cur = _readSpeechLock();
    if (cur && cur.holder !== holder && (now - (cur.at || 0)) < SPEECH_LOCK_MS) return false;
    try {
      window.localStorage.setItem(SPEECH_LOCK_KEY, JSON.stringify({ holder: holder, at: now }));
    } catch (e) {
      return true;
    }
    return true;
  }

  function _releaseSpeechLock(holder) {
    const cur = _readSpeechLock();
    if (cur && cur.holder !== holder) return;
    try { window.localStorage.removeItem(SPEECH_LOCK_KEY); } catch (e) { /* nothing held */ }
  }

  function _speak(frame, text, voice) {
    const c = frame._anchorChat;
    if (!c || !frame.options.speech_enabled) return;
    if (!window.speechSynthesis) return;
    if (!_claimSpeechLock(frame.id)) {
      c.speechNote.textContent = "another chat is speaking";
      return;
    }
    c.speechNote.textContent = "speaking";
    const u = new SpeechSynthesisUtterance(text || "");
    const want = voice || c.voice;
    if (want) {
      const match = window.speechSynthesis.getVoices().find((v) => v.name === want);
      if (match) u.voice = match;
    }
    const renew = setInterval(() => _claimSpeechLock(frame.id), SPEECH_LOCK_MS / 3);
    const done = () => {
      clearInterval(renew);
      _releaseSpeechLock(frame.id);
      if (frame._anchorChat) frame._anchorChat.speechNote.textContent = "";
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  function _playAudio(frame, b64, mime) {
    const c = frame._anchorChat;
    if (!c || !frame.options.speech_enabled || !b64) return;
    if (!_claimSpeechLock(frame.id)) {
      c.speechNote.textContent = "another chat is speaking";
      return;
    }
    c.speechNote.textContent = "speaking";
    const audio = new Audio("data:" + (mime || "audio/wav") + ";base64," + b64);
    const renew = setInterval(() => _claimSpeechLock(frame.id), SPEECH_LOCK_MS / 3);
    const done = () => {
      clearInterval(renew);
      _releaseSpeechLock(frame.id);
      if (frame._anchorChat) frame._anchorChat.speechNote.textContent = "";
    };
    audio.onended = done;
    audio.onerror = done;
    c.audio = audio;
    audio.play().catch(done);
  }

  const _IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;

  function makeImageIntake({ inputEl, hostEl }) {
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

    [hostEl, row].forEach((el) => {
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

  function mailRows(evt) {
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

  const _PHASE_LABEL = { waiting: 'WAITING', thinking: 'THINKING', working: 'WORKING', idle: 'IDLE' };

  function fmtDur(ms) {
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function makeBusyMeters(els) {
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

  const _SEND_CMD_RE = /SEND:\s*([^\n]+)[\s\S]*?---BEGIN---\n[\s\S]*?\n?---END---/g;
  function _stripSendBlocks(text) {
    if (!text) return text;
    return text.replace(_SEND_CMD_RE, (_, who) => '→ message sent to ' + who.trim());
  }

  function _streamOut(scriptEl, rowName, state, busyMeters, text, o, pin) {
    const t = text || '';
    const emp = scriptEl.querySelector('.empty');
    if (emp && (t || o.dim)) emp.remove();

    if (o.dim && o.end === '') {
      if (state.liveBub) {
        MX.turns.renderMarkdown(state.liveBub, _stripSendBlocks(state.liveText));
        state.liveBub = null; state.liveText = '';
      }
      if (!state.thinkingEl) {
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
        scriptEl.appendChild(details);
        state.thinkingEl = body;
        if (busyMeters) busyMeters.hmmBegin(ht);
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
        MX.turns.renderMarkdown(state.liveBub, _stripSendBlocks(state.liveText));
        state.liveBub = null; state.liveText = '';
      }
      if (t + (o.end || '')) {
        const row = document.createElement('div');
        row.className = 'bub dim';
        row.textContent = t + (o.end || '');
        scriptEl.appendChild(row);
        pin.scrollIfPinned();
      }
      return;
    }

    if (!state.liveBub) {
      const { blk, liveBub } = MX.turns._buildTurnBlock(
        rowName, { user: '', media: null, agent: [] },
        scriptEl.querySelectorAll('.turnblock').length, true, null);
      scriptEl.appendChild(blk);
      state.liveBub = liveBub;
      state.liveText = '';
    }
    state.liveText += t + (o.end || '');
    MX.turns.renderMarkdown(state.liveBub, state.liveText);
    pin.scrollIfPinned();
    if (o.end === '\n' && t === '') {
      MX.turns.renderMarkdown(state.liveBub, _stripSendBlocks(state.liveText));
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

  // styles copied from static/css/ade.css, same class names, injected once
  const _STYLE_ID = 'mx-anchor-chat-style';
  function _ensureStyle() {
    if (document.getElementById(_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = _STYLE_ID;
    style.textContent = `
.mx-anchor-chat{ display:flex; flex-direction:column; height:100%; min-height:0; }
.cp-script{ flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:4px; min-height:0; }
.cp-scriptwrap{ position:relative; flex:1; min-height:0; display:flex; flex-direction:column; }
.cp-head{ flex-shrink:0; display:flex; align-items:center; gap:6px; padding:4px 8px; border-bottom:1px solid var(--gridline); background:var(--surface-2); }
.cp-pick{ flex:1; min-width:0; background:var(--surface-1); color:var(--text-2); border:1px solid var(--border); border-radius:4px; font:11px/1.5 var(--mono); padding:2px 4px; }
.cp-live{ font:10px/1.4 var(--mono); color:var(--text-4); text-transform:uppercase; letter-spacing:.08em; }
.cp-live.cp-on{ color:var(--gate-blue); }
.cp-speech{ font:10px/1.4 var(--mono); color:var(--text-4); margin-left:6px; }
.cp-jump-bottom{ position:absolute; right:14px; bottom:10px; z-index:6; background:var(--accent-mid); color:var(--accent-dim); border:1px solid var(--accent-bdr); border-radius:14px; padding:3px 11px; font-size:10.5px; cursor:pointer; box-shadow:0 2px 8px var(--shadow-1); }
.cp-jump-bottom:hover{ background:var(--accent-dark); color:var(--text-1); }
.cp-jump-bottom.hidden{ display:none; }
.turnblock{ display:flex; flex-direction:column; gap:8px; padding:7px 8px; margin:2px -4px; border-radius:8px; cursor:pointer; border:1px solid transparent; }
.turnblock.flash{ animation:tbFlash 1.8s ease-out 1; }
@keyframes tbFlash{ 0%,45%{ background:rgba(57,135,229,.24); border-color:var(--gate-blue); } 100%{ background:transparent; border-color:transparent; } }
.tb-foot{ display:flex; align-items:center; gap:6px; font-size:9.5px; color:var(--text-4); font-family:var(--mono); padding-left:2px; }
.tb-foot .tb-hint{ margin-left:auto; color:var(--gate-blue); font-weight:600; }
.cp-input{ flex-shrink:0; border-top:1px solid var(--gridline); padding:8px; display:flex; gap:6px; background:var(--surface-1); align-items:flex-end; }
.cp-input input, .cp-input textarea{ flex:1; min-width:0; background:var(--surface-2); border:1px solid var(--border); border-radius:7px; color:var(--text-1); padding:7px 10px; font-family:var(--sans); font-size:calc(12.5px * var(--cp-zoom, 1)); }
.cp-input textarea{ resize:vertical; overflow-y:auto; line-height:1.4; min-height:34px; max-height:60vh; }
.cp-input[data-pending]::after{ content:attr(data-pending); align-self:center; flex-shrink:0; font-size:9.5px; letter-spacing:.04em; line-height:1; white-space:nowrap; padding:3px 7px; border-radius:9px; background:var(--gate-blue); color:var(--surface-1); }
.cp-input.drop-lit input, .cp-input.drop-lit textarea{ border-color:var(--gate-blue); }
.cp-input input:focus, .cp-input textarea:focus{ outline:none; border-color:var(--gate-blue); }
.cp-input button{ background:var(--surface-2); border:1px solid var(--border); color:var(--text-2); border-radius:7px; padding:0 13px; cursor:pointer; font-size:12px; }
.cp-btns{ display:flex; flex-direction:column; gap:4px; flex-shrink:0; }
.cp-btns button{ min-height:26px; }
.cp-stop{ color:var(--text-3); }
.cp-stop:hover:not(:disabled){ color:var(--gate-red); border-color:var(--gate-red); background:var(--fill-red); }
.cp-stop:disabled{ opacity:.38; cursor:default; }
.cp-stop.cp-stop-fired{ animation:cpStopFired .6s ease-out 1; }
@keyframes cpStopFired{ 0%{ background:var(--fill-red); border-color:var(--gate-red); color:var(--gate-red); } 100%{ background:var(--surface-2); border-color:var(--border); color:var(--text-3); } }
.msg{ max-width:94%; line-height:1.45; }
.msg .who{ font-size:calc(9.5px * var(--cp-zoom, 1)); color:var(--text-4); margin-bottom:3px; text-transform:uppercase; letter-spacing:.06em; }
.msg.user{ align-self:flex-end; }
.msg.user .bub{ background:rgba(57,135,229,0.13); border:1px solid rgba(57,135,229,.30); color:#dbe8fa; }
.msg.agent .bub{ background:var(--surface-2); border:1px solid var(--border); }
.msg.mail .bub{ background:var(--surface-3); border:1px solid var(--border-2); border-left:3px solid var(--text-3); border-radius:9px 9px 9px 3px; }
.msg.mail .who{ color:var(--text-2); }
.msg.notice .bub{ background:var(--fill-white); border:1px dashed var(--border-2); color:var(--text-3); font-style:italic; }
.msg.notice .who{ color:var(--text-4); }
.bub{ padding:8px 10px; border-radius:9px; white-space:pre-wrap; font-size:calc(12.5px * var(--cp-zoom, 1)); overflow-wrap:anywhere; }
.bub p{ margin:0 0 6px; }
.bub ul, .bub ol{ margin:0 0 6px; padding-left:18px; }
.bub h1, .bub h2, .bub h3, .bub h4{ margin:6px 0 4px; font-size:12px; }
.bub blockquote{ margin:0 0 6px; padding-left:8px; border-left:2px solid var(--gridline); color:var(--text-2); }
.bub table{ border-collapse:collapse; margin-bottom:6px; }
.bub th, .bub td{ border:1px solid var(--gridline); padding:2px 5px; }
.bub pre, .bub .cq-plain{ background:var(--well); border:1px solid var(--gridline); border-radius:3px; padding:6px; overflow-x:auto; font-family:var(--mono); font-size:11px; white-space:pre-wrap; margin:0 0 6px; }
.bub code{ font-family:var(--mono); font-size:11px; }
.bub pre code{ background:transparent; padding:0; }
details.cot{ margin:2px 0 4px; }
details.cot summary{ color:var(--text-4); font:11px/1.5 var(--mono); cursor:pointer; user-select:none; list-style:none; padding:1px 0; }
details.cot summary::-webkit-details-marker{ display:none; }
details.cot summary::before{ content:"▶ "; }
details.cot[open] summary::before{ content:"▼ "; }
.hmm-time{ margin-left:8px; color:var(--text-2); font-variant-numeric:tabular-nums; opacity:.8; }
details.cot .cot-body{ color:var(--text-3); padding-left:14px; margin-top:2px; white-space:pre-wrap; overflow-wrap:anywhere; }
@keyframes hmm-h{ 0%,100%{ opacity:.25 } 50%{ opacity:1 } }
@keyframes hmm-d{ 0%,100%{ opacity:.15 } 50%{ opacity:.85 } }
details.cot.thinking .hmm-l{ animation:hmm-h 2s ease-in-out infinite; }
details.cot.thinking .hmm-l:nth-child(2){ animation-delay:.2s; }
details.cot.thinking .hmm-l:nth-child(3){ animation-delay:.4s; }
details.cot.thinking .hmm-l:nth-child(4){ animation-delay:.6s; }
details.cot.thinking .hmm-d1{ animation:hmm-d 2s ease-in-out infinite .8s; }
details.cot.thinking .hmm-d2{ animation:hmm-d 2s ease-in-out infinite 1.2s; }
details.cot.thinking .hmm-d3{ animation:hmm-d 2s ease-in-out infinite 1.6s; }
.cp-script .bub.dim{ align-self:stretch; background:none; border:none; color:var(--text-3); font:11px/1.5 var(--mono); padding:2px 2px; }
.cp-script .msg-mark{ align-self:flex-start; background:none; border:none; color:var(--text-4); font:10.5px/1.5 var(--mono); padding:1px 2px; letter-spacing:.03em; opacity:.9; }
.code-fence{ display:block; background:var(--deep); border:1px solid var(--border); border-radius:4px; margin:4px 0; overflow:hidden; }
.code-fence-header{ display:flex; align-items:center; justify-content:space-between; padding:3px 8px; background:var(--surface-2); border-bottom:1px solid var(--gridline); min-height:26px; }
.code-fence-lang{ font:11px/1.5 var(--mono); color:var(--text-4); text-transform:lowercase; }
.code-fence-copy{ background:var(--surface-3); color:var(--text-4); border:1px solid var(--border); border-radius:3px; padding:1px 8px; font:11px/1.5 var(--mono); cursor:pointer; }
.code-fence-copy:hover{ background:var(--well); color:var(--text-1); }
.code-fence-body{ margin:0; padding:6px 12px; overflow-x:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.5 var(--mono); color:var(--text-3); }
.code-fence-body code{ font:inherit; background:none; }
.cp-busy{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:4px 10px; background:var(--surface-3); border-top:1px solid var(--gridline); font:12px/1.5 var(--mono); color:var(--text-2); letter-spacing:.18em; flex-shrink:0; }
.cp-busy.busy-hidden{ display:none; }
.cp-phase-timer{ font:11px/1.5 var(--mono); letter-spacing:.04em; color:var(--text-4); font-variant-numeric:tabular-nums; opacity:.55; }
.cp-phase-timer.t-active{ color:var(--text-2); opacity:1; }
.cp-timer-wait{ margin-left:auto; }
.cp-busy-word .busy-l{ display:inline-block; animation:busy-wave 1.2s ease-in-out infinite; }
.cp-busy-word .busy-l:nth-child(1){ animation-delay:0s; }
.cp-busy-word .busy-l:nth-child(2){ animation-delay:.1s; }
.cp-busy-word .busy-l:nth-child(3){ animation-delay:.2s; }
.cp-busy-word .busy-l:nth-child(4){ animation-delay:.3s; }
.cp-busy-word .busy-l:nth-child(5){ animation-delay:.4s; }
.cp-busy-word .busy-l:nth-child(6){ animation-delay:.5s; }
.cp-busy-word .busy-l:nth-child(7){ animation-delay:.6s; }
.cp-busy-word .busy-l:nth-child(8){ animation-delay:.7s; }
.cp-busy-dot{ width:7px; height:7px; border-radius:50%; background:var(--text-2); animation:busy-pulse 1s ease-in-out infinite; }
@keyframes busy-wave{ 0%,100%{ opacity:.3; transform:translateY(0); } 50%{ opacity:1; transform:translateY(-2px); } }
@keyframes busy-pulse{ 0%,100%{ opacity:.25; transform:scale(.8); } 50%{ opacity:1; transform:scale(1.25); } }
.cp-meters{ display:flex; gap:12px; flex-wrap:wrap; padding:4px 10px; background:var(--surface-3); border-top:1px solid var(--gridline); font:11px/1.5 var(--mono); color:var(--text-3); flex-shrink:0; }
.cp-met-status{ color:var(--text-2); text-transform:uppercase; letter-spacing:.08em; }
`;
    document.head.appendChild(style);
  }

  function regionOf(frame) {
    return (frame.options && frame.options.region) || '';
  }

  // stops following the old region, follows the newly bound one
  function _bind(frame, regionId) {
    const c = frame._anchorChat;
    const old = c.following;
    if (old && old !== regionId) {
      frame.send({ type: 'unfollow', track: old, inst: frame.id });
      c.following = null;
    }
    c.region = regionId || '';
    frame.options.region = c.region;
    c.pane.setTrack(c.region, '');
    if (c.region) {
      c.following = c.region;
      frame.send({ type: 'follow', track: c.region, inst: frame.id });
      frame.send({ type: 'transcript', track: c.region, inst: frame.id });
    }
    _renderHead(frame);
  }

  // region select fed by the roster; the pill says whether this pane streams
  function _renderHead(frame) {
    const c = frame._anchorChat;
    if (!c || !c.picker) return;
    const rid = c.region;
    c.picker.textContent = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— region —';
    c.picker.appendChild(none);
    for (const r of c.regions) {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.name || r.id;
      if (r.id === rid) o.selected = true;
      c.picker.appendChild(o);
    }
    const live = !!(rid && c.following === rid);
    c.livePill.textContent = live ? 'live' : 'not live';
    c.livePill.className = 'cp-live' + (live ? ' cp-on' : '');
  }

  MX.registerWidget('anchor_chat', {
    defaults: { region: '', speech_enabled: false },

    mount(frame) {
      const c = frame._anchorChat = { region: '', regions: [], following: null, voice: '' };
      if (typeof frame.options.region !== 'string') frame.options.region = '';

      const wrap = document.createElement('div');
      wrap.className = 'mx-anchor-chat';

      const head = document.createElement('div');
      head.className = 'cp-head';
      c.picker = document.createElement('select');
      c.picker.className = 'cp-pick';
      c.picker.addEventListener('change', () => _bind(frame, c.picker.value));
      c.livePill = document.createElement('span');
      c.livePill.className = 'cp-live';
      c.livePill.textContent = 'not live';
      c.speechNote = document.createElement('span');
      c.speechNote.className = 'cp-speech';
      head.appendChild(c.picker);
      head.appendChild(c.livePill);
      head.appendChild(c.speechNote);

      const scriptWrap = document.createElement('div');
      scriptWrap.className = 'cp-scriptwrap';
      const scriptEl = document.createElement('div');
      scriptEl.className = 'cp-script';
      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'cp-jump-bottom hidden';
      jumpBtn.textContent = '↓ latest';
      scriptWrap.appendChild(scriptEl);
      scriptWrap.appendChild(jumpBtn);

      const busyEl = document.createElement('div');
      busyEl.className = 'cp-busy busy-hidden';
      const busyWord = document.createElement('span');
      busyWord.className = 'cp-busy-word';
      const busyDot = document.createElement('span');
      busyDot.className = 'cp-busy-dot';
      const tWait = document.createElement('span');
      tWait.className = 'cp-phase-timer cp-timer-wait';
      tWait.textContent = 'wait 0.0s';
      const tThink = document.createElement('span');
      tThink.className = 'cp-phase-timer cp-timer-think';
      tThink.textContent = 'think 0.0s';
      const tWork = document.createElement('span');
      tWork.className = 'cp-phase-timer cp-timer-work';
      tWork.textContent = 'work 0.0s';
      busyEl.appendChild(busyWord);
      busyEl.appendChild(busyDot);
      busyEl.appendChild(tWait);
      busyEl.appendChild(tThink);
      busyEl.appendChild(tWork);

      const inputRow = document.createElement('div');
      inputRow.className = 'cp-input';
      const inputEl = document.createElement('textarea');
      inputEl.rows = 1;
      inputEl.placeholder = 'Message the bound region…';
      const btns = document.createElement('div');
      btns.className = 'cp-btns';
      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      const stopBtn = document.createElement('button');
      stopBtn.className = 'cp-stop';
      stopBtn.title = "stop this region's current turn";
      stopBtn.textContent = 'Stop';
      btns.appendChild(sendBtn);
      btns.appendChild(stopBtn);
      inputRow.appendChild(inputEl);
      inputRow.appendChild(btns);

      const metersRow = document.createElement('div');
      metersRow.className = 'cp-meters';
      const metStatus = document.createElement('span');
      metStatus.className = 'cp-met-status';
      metStatus.textContent = 'idle';
      const metCtx = document.createElement('span');
      metCtx.className = 'cp-met-ctx';
      metCtx.textContent = 'ctx —';
      const metCache = document.createElement('span');
      metCache.className = 'cp-met-cache';
      metCache.textContent = 'cache —';
      const metNow = document.createElement('span');
      metNow.className = 'cp-met-tsnow';
      metNow.textContent = 't/s —';
      const metAvg = document.createElement('span');
      metAvg.className = 'cp-met-tsavg';
      metAvg.textContent = 'avg —';
      metersRow.appendChild(metStatus);
      metersRow.appendChild(metCtx);
      metersRow.appendChild(metCache);
      metersRow.appendChild(metNow);
      metersRow.appendChild(metAvg);

      wrap.appendChild(head);
      wrap.appendChild(scriptWrap);
      wrap.appendChild(busyEl);
      wrap.appendChild(inputRow);
      wrap.appendChild(metersRow);
      frame.host.appendChild(wrap);
      _ensureStyle();

      const busyMeters = makeBusyMeters({
        busyEl, busyWord, tWaitEl: tWait, tThinkEl: tThink, tWorkEl: tWork,
        metStatus, metCtx, metCache, metNow, metAvg,
      });
      const pin = makeScrollPin(scriptEl, jumpBtn);
      const _stream = { liveBub: null, liveText: '', thinkingEl: null };
      let trackName = '';

      const pane = {
        setTrack(id, name) {
          trackName = name || '';
          _stream.liveBub = null; _stream.liveText = ''; _stream.thinkingEl = null;
          scriptEl.innerHTML = '';
          busyMeters.reset();
          pin.reset();
        },
        renderTranscript(messages) {
          scriptEl.innerHTML = '';
          _stream.liveBub = null; _stream.liveText = ''; _stream.thinkingEl = null;
          const turns = MX.turns._groupTurns(messages);
          if (!turns.length) {
            scriptEl.innerHTML = '<div class="empty">no turns on this track</div>';
            return;
          }
          turns.forEach((t, idx) => {
            const { blk } = MX.turns._buildTurnBlock(trackName, t, idx, false, null);
            scriptEl.appendChild(blk);
          });
          pin.scrollToBottom();
        },
        appendOut(text, o) {
          _streamOut(scriptEl, trackName, _stream, busyMeters, text, o || {}, pin);
        },
        renderMail(evt) {
          const blk = _buildMailBlock(evt);
          if (!blk) return;
          const wasEmpty = scriptEl.querySelector('.empty');
          if (wasEmpty) scriptEl.innerHTML = '';
          scriptEl.appendChild(blk);
          pin.scrollIfPinned();
        },
        setStatus: busyMeters.setStatus,
        setMeters: busyMeters.setMeters,
      };

      c.pane = pane;
      c.scriptEl = scriptEl;

      const imgs = makeImageIntake({ inputEl, hostEl: wrap });

      function submit() {
        const text = inputEl.value.trim();
        if (!text && !imgs.count()) return;
        const { media, paths, echo } = imgs.drain();
        const { blk } = MX.turns._buildTurnBlock(
          trackName, { user: text, media: echo, agent: [] },
          scriptEl.querySelectorAll('.turnblock').length, false, null);
        scriptEl.appendChild(blk);
        pin.scrollToBottom();
        const out = { type: 'user', text, inst: frame.id };
        if (media.length) out.media = media;
        if (paths.length) out.image_paths = paths;
        if (c.region) out.track = c.region;
        frame.send(out);
        inputEl.value = '';
      }

      sendBtn.onclick = submit;
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape' && imgs.count() && !inputEl.value) {
          e.preventDefault();
          imgs.clear();
        }
      });
      // the fired state holds until the server's dim stopped line lands
      stopBtn.onclick = () => {
        const out = { type: 'stop', inst: frame.id };
        if (c.region) out.track = c.region;
        frame.send(out);
        stopBtn.classList.remove('cp-stop-fired');
        void stopBtn.offsetWidth;
        stopBtn.classList.add('cp-stop-fired');
        stopBtn.disabled = true;
        setTimeout(() => { stopBtn.disabled = false; }, 1200);
      };
      c.stopBtn = stopBtn;

      frame.subscribe(['ade_init', 'track_list', 'track_transcript', 'transcript',
                       'chat_history', 'out', 'status', 'meters', 'mirror',
                       'activity', 'track_removed', 'region_replaced', 'speak', 'audio']);
      frame.send({ type: 'roster', inst: frame.id });
      _renderHead(frame);
      _bind(frame, regionOf(frame));
      fetch('/api/session-settings/' + encodeURIComponent(frame.sid || ''))
        .then((r) => r.json())
        .then((g) => {
          const v = (g && g.effective && g.effective.voices) || {};
          c.voice = v.tts_voice || '';
        })
        .catch(() => { /* no voice named */ });
    },

    unmount(frame) {
      const c = frame._anchorChat;
      if (c && c.following) {
        frame.send({ type: 'unfollow', track: c.following, inst: frame.id });
      }
      if (c && c.audio) {
        try { c.audio.pause(); } catch (e) { /* already stopped */ }
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      _releaseSpeechLock(frame.id);
      frame._anchorChat = null;
    },

    onOption(frame, key, value) {
      if (key === 'region') { _bind(frame, value || ''); return; }
      if (key === 'speech_enabled' && !frame.options.speech_enabled) {
        _releaseSpeechLock(frame.id);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (frame._anchorChat) frame._anchorChat.speechNote.textContent = '';
      }
    },

    onFrame(frame, msg) {
      const c = frame._anchorChat;
      if (!c || !c.pane) return;
      const rid = c.region;

      // the dim line for a stopped turn clears the Stop button's fired state
      const streamOut = (text, o) => {
        if (o.dim && c.stopBtn) {
          c.stopBtn.classList.remove('cp-stop-fired');
          c.stopBtn.disabled = false;
        }
        c.pane.appendOut(text, o);
      };

      if (msg.type === 'ade_init' || msg.type === 'track_list') {
        c.regions = MX.gates.regionRows(msg);
        if (!rid && c.regions.length) { _bind(frame, c.regions[0].id); return; }
        _renderHead(frame);
        return;
      }

      // the live stream for this instance's own region
      if (msg.type === 'mirror') {
        if (msg.track !== rid) return;
        if (msg.kind === 'transcript') c.pane.renderTranscript(msg.messages || []);
        else if (msg.kind === 'out') streamOut(msg.text || '', { dim: msg.dim, end: msg.end });
        else if (msg.kind === 'status') c.pane.setStatus(msg.phase);
        else if (msg.kind === 'meters') c.pane.setMeters(msg.d);
        else if (msg.kind === 'event') c.pane.renderMail(msg.evt);
        else if (msg.kind === 'speak') _speak(frame, msg.text, msg.voice);
        else if (msg.kind === 'audio') _playAudio(frame, msg.data, msg.mime);
        return;
      }

      if (msg.inst && msg.inst !== frame.id) return;

      switch (msg.type) {
        case 'track_transcript':
        case 'transcript':
          if (msg.id !== rid) return;
          c.pane.setTrack(rid, '');
          c.pane.renderTranscript(msg.messages || []);
          break;
        case 'activity':
          c.pane.renderMail(msg.event);
          break;
        case 'speak':
          _speak(frame, msg.text, msg.voice);
          break;
        case 'audio':
          _playAudio(frame, msg.data, msg.mime);
          break;
        case 'track_removed':
          if (msg.id === rid) _bind(frame, '');
          break;
        case 'region_replaced':
          if (msg.old_id === rid) _bind(frame, msg.new_id);
          break;
        case 'chat_history':
          // gate history moved to the gate-list widget; nothing to do here
          break;
        default:
          break;
      }
    },
  });
})();
