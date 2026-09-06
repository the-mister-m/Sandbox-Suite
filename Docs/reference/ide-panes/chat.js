// chat.js — chat log pane + meters readout.
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
// Code fences (```...```) in assistant output are rendered as copyable mono blocks.

import { shouldConfirm } from '../globalflags.js';

let _ctx = null;
let _log = null;
let _msg = null;
let _send = null;
let _stop = null;
let _metCtx = null;
let _metCache = null;
let _metNow = null;
let _metAvg = null;
let _metStatus = null;   // static phase word: waiting | thinking | working | idle
let _busyEl = null;      // animated in-window busy indicator (caps word + dot)
let _busyWord = null;
let _undo = null;
let _jumpBtn = null;     // "jump to bottom" button, shown when scrolled up
let _chatFlag = null;    // dismissible in-chat alert flag (done / gate)

// ── Phase timers (thinking vs working) + tab title ──────────────────────────
// Front-end-only. Driven entirely off the status frames (waiting|thinking|
// working|idle) that already arrive — no server change. Two accumulators per
// turn (think + work), the active one ticking live; a per-burst timer rides the
// Hmmm summary; the current phase + its elapsed go in the browser tab title so
// each open tab advertises what its model is doing.
const _baseTitle = (typeof document !== 'undefined') ? document.title : 'LLM Sandbox';
const _appName   = _baseTitle.split(' — ')[0];   // "LLM Sandbox" from "LLM Sandbox — web"
let _phase       = 'idle';   // last applied phase
let _phaseStart  = 0;        // performance.now() at start of current phase
let _waitMs      = 0;        // accumulated waiting time this turn (first-token latency)
let _thinkMs     = 0;        // accumulated thinking time this turn
let _workMs      = 0;        // accumulated working time this turn
let _timerTick   = null;     // setInterval handle, live only while busy
let _tWaitEl     = null;     // #timer-wait span
let _tThinkEl    = null;     // #timer-think span
let _tWorkEl     = null;     // #timer-work span
let _hmmTimeEl   = null;     // .hmm-time span of the active thinking burst
let _hmmStart    = 0;        // performance.now() at start of that burst

// shared chat state
let awaiting = null;
let thinkingEl = null;
let scrollMode = 'auto';
let pinned = true;

// session save/load state
let _saveName = null;          // bound file stem, or null = unsaved scratch
let _sessLabelEl = null;
let _sessLoadDropdown = null;

// Per-turn assistant text accumulation for fence rendering
let _assistantTurn = null;  // null = no active turn; string = accumulating text
let _assistantEl = null;    // the DOM container for the current assistant turn

// ── Continuous voice-activity capture (VAD) ─────────────────────────────────
// Front-end-only. AnalyserNode RMS → speech onset starts a MediaRecorder; a
// silence window stops it and auto-submits via the existing PTT staging path
// (_attachments + submitChat). Pauses while the model is busy / speaking so the
// mic never hears the TTS (v1 no-barge-in). Barge-in is an opt-in toggle.
let _vadOn = false;          // continuous engine running
let _vadStream = null;
let _vadCtx = null;
let _vadAnalyser = null;
let _vadRec = null;
let _vadChunks = [];
let _vadRaf = null;
let _vadCapturing = false;   // between speech-onset and silence-stop
let _vadLoudAt = 0;
let _vadModelBusy = false;
let _vadSpeaking = false;
let _currentAudio = null;     // retained server-audio element so STOP can reach it
let _vadPaused = false;       // continuous listening paused by user (warm — stream stays alive)
const VAD_DEFAULTS = { threshold: 0.005, silenceMs: 1200, bargeIn: false };
function _vadCfg() {
  return {
    threshold: parseFloat(localStorage.getItem('vad_threshold')) || VAD_DEFAULTS.threshold,
    silenceMs: parseInt(localStorage.getItem('vad_silence_ms'), 10) || VAD_DEFAULTS.silenceMs,
    bargeIn:   localStorage.getItem('vad_bargein') === '1',
  };
}

function scrollIfPinned() {
  if (scrollMode === 'auto' && pinned) _log.scrollTop = _log.scrollHeight;
  updateJumpBtn();
}

// Unconditional scroll to the newest line — used for 'send' events (user OR
// model sending) and the jump-to-bottom button. Re-pins so auto mode resumes.
function scrollToBottom() {
  if (!_log) return;
  _log.scrollTop = _log.scrollHeight;
  pinned = true;
  updateJumpBtn();
}

// Show the jump button only when the user has scrolled up away from the bottom.
function updateJumpBtn() {
  if (!_jumpBtn || !_log) return;
  const atBottom = (_log.scrollHeight - _log.scrollTop - _log.clientHeight) < 40;
  _jumpBtn.classList.toggle('hidden', atBottom);
}

// ── Busy indicator (animated, in-window) + static phase word ───────────────────
// phase ∈ waiting | thinking | working | idle. idle hides the animation and
// blanks nothing-to-show; the static meter word always reflects the last phase.
const _PHASE_LABEL = { waiting: 'WAITING', thinking: 'THINKING', working: 'WORKING', idle: 'IDLE' };

function renderBusyWord(word) {
  if (!_busyWord) return;
  _busyWord.innerHTML = '';
  for (const ch of word) {
    const s = document.createElement('span');
    s.className = 'busy-l';
    s.textContent = ch;
    _busyWord.appendChild(s);
  }
}

// mm:ss over a minute, else one-decimal seconds (jitters visibly = reads "live").
function fmtDur(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// One tick: paint both bottom timers (active one ticking), the live Hmmm burst
// timer, and the tab title. Called on every phase transition and every 250ms
// while busy.
function _renderTimers() {
  const now = performance.now();
  const onWait  = _phase === 'waiting';
  const onThink = _phase === 'thinking';
  const onWork  = _phase === 'working';
  const wait  = _waitMs  + (onWait  ? now - _phaseStart : 0);
  const think = _thinkMs + (onThink ? now - _phaseStart : 0);
  const work  = _workMs  + (onWork  ? now - _phaseStart : 0);
  if (_tWaitEl)  { _tWaitEl.textContent  = 'wait '  + fmtDur(wait);  _tWaitEl.classList.toggle('t-active', onWait); }
  if (_tThinkEl) { _tThinkEl.textContent = 'think ' + fmtDur(think); _tThinkEl.classList.toggle('t-active', onThink); }
  if (_tWorkEl)  { _tWorkEl.textContent  = 'work '  + fmtDur(work);  _tWorkEl.classList.toggle('t-active', onWork); }
  if (_hmmTimeEl) _hmmTimeEl.textContent = fmtDur(now - _hmmStart);
  document.title = (_phase && _phase !== 'idle')
    ? `${_phase} ${fmtDur(now - _phaseStart)} · ${_appName}`
    : _baseTitle;
}

// Close out the phase we're leaving, start the new one, manage the 250ms tick.
// Accumulators reset on the idle→busy edge (a new user turn).
function _advancePhase(phase) {
  const now = performance.now();
  const next = phase || 'idle';
  if (_phase === 'waiting')       _waitMs  += now - _phaseStart;
  else if (_phase === 'thinking') _thinkMs += now - _phaseStart;
  else if (_phase === 'working')  _workMs  += now - _phaseStart;
  const wasBusy = _phase && _phase !== 'idle';
  const nowBusy = next !== 'idle';
  if (!wasBusy && nowBusy) { _waitMs = 0; _thinkMs = 0; _workMs = 0; }   // new turn
  _phase = next;
  _phaseStart = now;
  if (nowBusy && !_timerTick) {
    _timerTick = setInterval(_renderTimers, 250);
  } else if (!nowBusy && _timerTick) {
    clearInterval(_timerTick);
    _timerTick = null;
  }
  _renderTimers();   // immediate paint on the edge (don't wait for the interval)
}

function applyPhase(phase) {
  _advancePhase(phase);
  if (_metStatus) _metStatus.textContent = phase || 'idle';
  const busy = phase && phase !== 'idle';
  if (_busyEl) _busyEl.classList.toggle('busy-hidden', !busy);
  if (busy) renderBusyWord(_PHASE_LABEL[phase] || 'WORKING');
}

// ── In-chat alert flag (one of the alert channels; see shell.js fireAlert) ─────
function showFlag(text, kind) {
  if (!_chatFlag) return;
  _chatFlag.textContent = text;
  _chatFlag.className = 'flag-' + (kind || 'done');  // styled per kind, removes 'hidden'
}
function clearFlag() {
  if (_chatFlag) _chatFlag.className = 'hidden';
}

function _updateSessLabel() {
  if (!_sessLabelEl) return;
  if (_saveName) {
    _sessLabelEl.textContent = `● ${_saveName}`;
    _sessLabelEl.className = 'bound';
  } else {
    _sessLabelEl.textContent = '○ unsaved';
    _sessLabelEl.className = '';
  }
}

export function append(text, cls) {
  if (!_log) return;
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  _log.appendChild(span);
  scrollIfPinned();
}

function setScrollMode(mode) {
  scrollMode = mode;
  pinned = (mode === 'auto');
}

// ── Fence parser / renderer ───────────────────────────────────────────────────
// Parses a string that may contain ``` fenced code blocks.
// Returns an array of {type:'text'|'code', content, lang?} segments.
function parseFences(str) {
  const segments = [];
  // regex: optional language tag after opening ```
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let lastIdx = 0;
  let m;
  while ((m = fenceRe.exec(str)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: 'text', content: str.slice(lastIdx, m.index) });
    }
    segments.push({ type: 'code', lang: m[1].trim(), content: m[2] });
    lastIdx = fenceRe.lastIndex;
  }
  if (lastIdx < str.length) {
    segments.push({ type: 'text', content: str.slice(lastIdx) });
  }
  return segments;
}

// Build DOM for a completed assistant turn from accumulated text
function renderAssistantTurn(container, text) {
  container.innerHTML = '';
  const segments = parseFences(text);
  for (const seg of segments) {
    if (seg.type === 'text') {
      const span = document.createElement('span');
      span.textContent = seg.content;
      container.appendChild(span);
    } else {
      // code block
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
        } catch (e) {
          copyBtn.textContent = 'err';
        }
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

// ── Turn lifecycle helpers ────────────────────────────────────────────────────
function beginAssistantTurn() {
  _assistantTurn = '';
  _assistantEl = document.createElement('div');
  _assistantEl.className = 'assistant-turn';
  _log.appendChild(_assistantEl);
  // 'on send' mode scrolls on any send event — the model starting to reply is
  // a send event too (but a gate 'ask' is NOT; that path never calls this).
  if (scrollMode === 'send') scrollToBottom();
}

function appendToTurn(text) {
  if (_assistantEl) {
    _assistantTurn += text;
    // While the turn is still streaming, show as plain text for low latency.
    // Re-render with fences when turn ends (see endAssistantTurn).
    const plain = _assistantEl.querySelector('.turn-plain') || (() => {
      const s = document.createElement('span');
      s.className = 'turn-plain';
      _assistantEl.appendChild(s);
      return s;
    })();
    plain.textContent = _assistantTurn;
    scrollIfPinned();
  }
}

function endAssistantTurn() {
  if (_assistantEl && _assistantTurn !== null) {
    // Re-render with fence detection
    try {
      renderAssistantTurn(_assistantEl, _assistantTurn);
    } catch (e) {
      console.error('renderAssistantTurn failed:', e);
    }
    scrollIfPinned();
  }
  _assistantTurn = null;
  _assistantEl = null;
}

// ── Media attachments (image + audio) ──────────────────────────────────────────
// Provider-neutral media that rides on the user frame: {kind, mime, data_b64}.
// The server re-validates and caps everything (see _sanitize_media in server.py) —
// this client guard is just for fast feedback. base64 inflates ~33%; we cap raw size.
const MAX_IMG_BYTES   = 10 * 1024 * 1024;   // 10 MB raw per image
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;   // 50 MB raw per audio clip
let _attachments = [];                       // [{kind, mime, data_b64, name}]

function _renderAttachStrip() {
  const strip = document.getElementById('attach-strip');
  if (!strip) return;
  strip.innerHTML = '';
  if (!_attachments.length) { strip.classList.add('hidden'); return; }
  strip.classList.remove('hidden');
  _attachments.forEach((a, i) => {
    const t = document.createElement('div');
    t.className = 'attach-thumb';
    t.title = a.name || a.mime;
    const img = document.createElement('img');
    img.src = `data:${a.mime};base64,${a.data_b64}`;
    t.appendChild(img);
    const rm = document.createElement('button');
    rm.className = 'attach-rm';
    rm.textContent = '×';
    rm.title = 'remove';
    rm.onclick = () => { _attachments.splice(i, 1); _renderAttachStrip(); };
    t.appendChild(rm);
    strip.appendChild(t);
  });
}

function _addFiles(fileList) {
  for (const file of fileList) {
    const isImage = file.type && file.type.startsWith('image/');
    const isAudio = file.type && file.type.startsWith('audio/');
    if (!isImage && !isAudio) continue;
    const kind    = isAudio ? 'audio' : 'image';
    const maxBytes = isAudio ? MAX_AUDIO_BYTES : MAX_IMG_BYTES;
    if (file.size > maxBytes) {
      append(`\n[attach skipped: ${file.name} exceeds ${(maxBytes / 1048576) | 0}MB]\n`, 'dim');
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const uri = String(reader.result);          // "data:audio/wav;base64,XXXX"
      const comma = uri.indexOf(',');
      const b64 = comma >= 0 ? uri.slice(comma + 1) : uri;
      _attachments.push({ kind, mime: file.type, data_b64: b64, name: file.name });
      _renderAttachStrip();
    };
    reader.readAsDataURL(file);
  }
}

// Echo the just-sent images into the chat log so the user sees what they sent.
function _echoAttachments(items) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-attached';
  for (const a of items) {
    const img = document.createElement('img');
    img.src = `data:${a.mime};base64,${a.data_b64}`;
    wrap.appendChild(img);
  }
  _log.appendChild(wrap);
}

async function _vadStart() {
  if (_vadOn) return;
  try {
    _vadStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (e) { append('\n[continuous: mic denied — ' + e.message + ']\n', 'dim'); return; }
  _vadCtx = new (window.AudioContext || window.webkitAudioContext)();
  try { await _vadCtx.resume(); } catch (e) {}
  const src = _vadCtx.createMediaStreamSource(_vadStream);
  _vadAnalyser = _vadCtx.createAnalyser();
  _vadAnalyser.fftSize = 2048;
  src.connect(_vadAnalyser);
  _vadOn = true; _vadCapturing = false; _vadModelBusy = false; _vadSpeaking = false; _vadPaused = false;
  _vadLoudAt = performance.now();
  _vadShowControls(true);
  const _pb = document.getElementById('vad-pause'); if (_pb) _pb.textContent = '⏸';
  _vadTick();
}

function _vadStop() {
  _vadOn = false;
  if (_vadRaf) cancelAnimationFrame(_vadRaf);
  _vadRaf = null;
  if (_vadRec && _vadRec.state === 'recording') { try { _vadRec.stop(); } catch (e) {} }
  if (_vadStream) _vadStream.getTracks().forEach(t => t.stop());
  if (_vadCtx) { try { _vadCtx.close(); } catch (e) {} }
  _vadStream = null; _vadCtx = null; _vadAnalyser = null;
  _vadRec = null; _vadChunks = []; _vadCapturing = false;
  _vadShowControls(false);
}

function _vadTick() {
  if (!_vadOn || !_vadAnalyser) return;
  const cfg = _vadCfg();
  const buf = new Float32Array(_vadAnalyser.fftSize);
  _vadAnalyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  const loud = rms > cfg.threshold;
  const blocked = _vadPaused || ((_vadModelBusy || _vadSpeaking) && !cfg.bargeIn);

  if (loud) {
    if (cfg.bargeIn && _vadSpeaking) {
      try { speechSynthesis.cancel(); } catch (e) {}
      _vadSpeaking = false;
    }
    _vadLoudAt = performance.now();
    if (!_vadCapturing && !blocked) _vadStartUtterance();
  }
  if (_vadCapturing && (performance.now() - _vadLoudAt) > cfg.silenceMs) {
    _vadStopUtterance();
  }
  _vadSetState(_vadPaused ? 'paused (you)' : blocked ? 'paused' : _vadCapturing ? '● rec' : 'listening');
  _vadRaf = requestAnimationFrame(_vadTick);
}

function _vadStartUtterance() {
  if (!_vadStream) return;
  _vadChunks = [];
  try { _vadRec = new MediaRecorder(_vadStream); } catch (e) { return; }
  _vadRec.ondataavailable = e => { if (e.data && e.data.size) _vadChunks.push(e.data); };
  _vadRec.onstop = () => {
    const blob = new Blob(_vadChunks, { type: _vadRec.mimeType || 'audio/webm' });
    if (blob.size < 1200) return;   // too short — noise blip, ignore
    const reader = new FileReader();
    reader.onload = () => {
      const uri = String(reader.result);
      const b64 = uri.slice(uri.indexOf(',') + 1);
      _attachments.push({ kind: 'audio', mime: blob.type, data_b64: b64, name: 'mic.webm' });
      _renderAttachStrip();
      _vadModelBusy = true;   // optimistic: block re-capture until status confirms
      submitChat();
    };
    reader.readAsDataURL(blob);
  };
  _vadRec.start();
  _vadCapturing = true;
}

function _vadStopUtterance() {
  if (!_vadCapturing) return;
  _vadCapturing = false;
  if (_vadRec && _vadRec.state === 'recording') { try { _vadRec.stop(); } catch (e) {} }
}

function _vadOnStatus(phase) {
  _vadModelBusy = !!(phase && phase !== 'idle');
  if (!_vadModelBusy) _vadLoudAt = performance.now();   // ignore trailing audio
}

// ── Readback control: stop ALL TTS (browser speechSynthesis + server Audio) ─────
function _stopAudioPlayback() {
  if (_currentAudio) {
    try { _currentAudio.pause(); _currentAudio.currentTime = 0; } catch (e) {}
    _currentAudio = null;
  }
}
function _stopReadback() {
  try { speechSynthesis.cancel(); } catch (e) {}
  _stopAudioPlayback();
  _vadSpeaking = false;
  _vadLoudAt = performance.now();   // ignore the tail so the mic doesn't self-trigger
}

function _vadApplySettings(s) {
  if (!s) return;
  const want = !!s.listen && s.listen_mode === 'continuous';
  if (want && !_vadOn) _vadStart();
  else if (!want && _vadOn) _vadStop();
}

function _vadShowControls(on) {
  const bar = document.getElementById('vad-bar');
  if (bar) bar.classList.toggle('hidden', !on);
}
function _vadSetState(label) {
  const el = document.getElementById('vad-state');
  if (el && el.textContent !== label) el.textContent = label;
}
function _vadWireControls(root) {
  // Query within the pane root, NOT document: this runs during mount() before the
  // pane is attached to the document, so document.getElementById() returns null and
  // silently skips every control. el.querySelector works on the detached subtree.
  const q = sel => (root || document).querySelector(sel);
  const cfg = _vadCfg();
  const sens = q('#vad-sens');
  const wait = q('#vad-wait');
  const barge = q('#vad-barge');
  const pause = q('#vad-pause');
  if (sens) { sens.value = cfg.threshold; sens.oninput = () => localStorage.setItem('vad_threshold', sens.value); }
  if (wait) { wait.value = cfg.silenceMs; wait.oninput = () => localStorage.setItem('vad_silence_ms', wait.value); }
  if (barge) { barge.checked = cfg.bargeIn; barge.onchange = () => localStorage.setItem('vad_bargein', barge.checked ? '1' : '0'); }
  if (pause) {
    pause.textContent = _vadPaused ? '▶' : '⏸';
    pause.onclick = () => {
      _vadPaused = !_vadPaused;
      pause.textContent = _vadPaused ? '▶' : '⏸';
      if (_vadPaused) _vadStopUtterance();   // abort any in-flight capture
      else _vadLoudAt = performance.now();
    };
  }
}

function wireAttach() {
  const btn = document.getElementById('attach');
  const input = document.getElementById('attach-input');
  if (btn && input) {
    btn.onclick = () => input.click();
    input.addEventListener('change', () => { _addFiles(input.files); input.value = ''; });
  }
  if (_msg) {
    _msg.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      const files = [];
      for (const it of items) {
        if (it.kind === 'file' && (it.type.startsWith('image/') || it.type.startsWith('audio/'))) files.push(it.getAsFile());
      }
      if (files.length) { e.preventDefault(); _addFiles(files); }
    });
  }
  // Push-to-talk microphone. Records while held/toggled; on stop, the blob
  // rides the existing _attachments rail as {kind:'audio'}.
  const micBtn = document.getElementById('mic');
  if (micBtn) {
    let rec = null, chunks = [];
    micBtn.onclick = async () => {
      if (rec && rec.state === 'recording') { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream);
        chunks = [];
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => {
            const uri = String(reader.result);
            const b64 = uri.slice(uri.indexOf(',') + 1);
            _attachments.push({ kind: 'audio', mime: blob.type, data_b64: b64, name: 'mic.webm' });
            _renderAttachStrip();
          };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach(t => t.stop());
          micBtn.classList.remove('recording');
          micBtn.textContent = '● rec';
        };
        rec.start();
        micBtn.classList.add('recording');
        micBtn.textContent = '■ stop';
      } catch (e) { append('\n[mic denied: ' + e.message + ']\n', 'dim'); }
    };
  }
  const bar = document.getElementById('bar');
  if (bar) {
    bar.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        bar.classList.add('drag-over');
      }
    });
    bar.addEventListener('dragleave', () => bar.classList.remove('drag-over'));
    bar.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); _addFiles(e.dataTransfer.files); }
      bar.classList.remove('drag-over');
    });
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submitChat() {
  const text = _msg ? _msg.value.trim() : '';
  const hasMedia = _attachments.length > 0;
  if ((!text && !hasMedia) || !_ctx) return;
  clearFlag();  // sending counts as interacting — dismiss any standing alert flag
  // End any open assistant turn before sending (safety)
  if (_assistantTurn !== null) endAssistantTurn();
  if (scrollMode !== 'static') scrollToBottom();
  if (awaiting !== null) {
    // Gate answer is a y/n — media doesn't apply; leave any attachments pending
    // for the next real message rather than dropping them.
    append(text + '\n', 'you');
    // Route through the shell's single gate-answer path so the modal also
    // closes and we never double-answer. clearAwaiting() (called inside) resets
    // awaiting + placeholder.
    if (_ctx.answerGate) _ctx.answerGate(text);
    else { _ctx.send({ type: 'answer', text }); awaiting = null; }
  } else {
    append('\nyou> ' + (text || '(image)') + '\n', 'you');
    const frame = { type: 'user', text };
    if (hasMedia) {
      _echoAttachments(_attachments);
      frame.media = _attachments.map(a => ({ kind: a.kind, mime: a.mime, data_b64: a.data_b64 }));
    }
    _ctx.send(frame);
    _attachments = [];
    _renderAttachStrip();
  }
  if (_msg) _msg.value = '';
}

// ── Session save prompt ───────────────────────────────────────────────────────
// Uses ctx.showPrompt (text-input modal in shell.js — no single-key y/n capture).
// After the user types a name, checks for collision and shows a 3-way gate if needed.
function _promptSaveName(ctx) {
  if (!ctx.showPrompt) return;
  const label = _saveName ? `save as (current: ${_saveName}):` : 'save session as:';
  ctx.showPrompt(label, _saveName || '', (raw) => {
    const name = raw.replace(/[^\w\-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (name) _doSave(ctx, name);
  }, null);
}

function _doSave(ctx, name) {
  // Check for collision before sending
  fetch('/api/saves')
    .then(r => r.json())
    .then(d => {
      const exists = (d.list || []).some(s => s.id === name);
      if (exists && name !== _saveName) {
        // Collision and not already bound to this name
        if (ctx.showTriple) {
          ctx.showTriple(
            `session '${name}' already exists`,
            'overwrite', 'keep both', 'cancel',
            () => ctx.send({ type: 'session_save', name }),
            () => {
              // keep-both: auto-increment suffix
              const suffixed = _nextAvailableName(name, d.list || []);
              ctx.send({ type: 'session_save', name: suffixed });
            },
            null,
          );
        } else {
          ctx.send({ type: 'session_save', name });
        }
      } else {
        ctx.send({ type: 'session_save', name });
      }
    })
    .catch(() => ctx.send({ type: 'session_save', name }));
}

function _nextAvailableName(base, list) {
  const ids = new Set(list.map(s => s.id));
  let n = 2;
  let candidate = `${base}-${n}`;
  while (ids.has(candidate)) { n++; candidate = `${base}-${n}`; }
  return candidate;
}

// ── Load dropdown ─────────────────────────────────────────────────────────────
function _toggleLoadDropdown(ctx) {
  if (!_sessLoadDropdown) return;
  const isOpen = _sessLoadDropdown.classList.contains('open');
  if (isOpen) { _sessLoadDropdown.classList.remove('open'); return; }
  _sessLoadDropdown.innerHTML = '<div class="sld-empty">loading…</div>';
  _sessLoadDropdown.classList.add('open');
  // One flat list, index-backed (scope=all): every save in the fixed sessions/ folder
  // plus any legacy strays still registered. Sessions no longer split by project.
  fetch('/api/saves?scope=all')
    .then(r => r.json())
    .then(d => _renderLoadDropdown(ctx, d.list || []))
    .catch(() => { _sessLoadDropdown.innerHTML = '<div class="sld-empty">(error loading saves)</div>'; });
}

function _renderLoadDropdown(ctx, list) {
  if (!_sessLoadDropdown) return;

  if (!list.length) {
    _sessLoadDropdown.innerHTML = '<div class="sld-empty">(no saves yet)</div>';
    return;
  }

  // Bound (active) session first, then the rest as fetched (recency desc).
  // Every row is index-backed and acts on data-path (one flat list).
  const sorted = [
    ...list.filter(s => s.id === _saveName),
    ...list.filter(s => s.id !== _saveName),
  ];
  const rows = sorted.map(s => {
    const isBound = s.id === _saveName;
    const preview = s.preview || '(empty)';
    const chip = s.project_name ? `<span class="sld-project">${_esc(s.project_name)}</span>` : '';
    return `<div class="sld-row${isBound ? ' sld-active' : ''}">` +
      chip +
      `<span class="sld-name">${_esc(s.id)}</span>` +
      `<span class="sld-preview">${_esc(preview)}</span>` +
      `<button class="sld-resume" data-path="${_esc(s.file)}" title="load into this tab">resume</button>` +
      `<button class="sld-open"   data-path="${_esc(s.file)}" title="open in new tab">open</button>` +
      `<button class="sld-del"    data-path="${_esc(s.file)}" title="delete">✕</button>` +
      `</div>`;
  }).join('');

  _sessLoadDropdown.innerHTML = rows;
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Transcript replay helpers (ADE-RUNWAY S3 rider) ─────────────────────────
// A TEXT-mode tool result is stored in sess.messages as role:'user' (see
// engine/read_tool.py's result_text — "no 'tool' role here") so the model
// sees it, but it's NEVER echoed into the live chat pane (only the dim
// "[name → N chars]" annotation is, via a separate 'out' frame) — replaying
// it verbatim would dump raw tool output into a "you>" line the human never
// saw. Detect and drop it same as a real role:'tool' message.
const _TOOL_RESULT_ECHO_RE = /^\[\w+ result\]\n/;

// content is a plain string in every message this server produces; the
// array-of-parts branch is defensive only (never actually emitted here).
function _transcriptText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(p => (typeof p === 'string' ? p : (p && p.text) || '[image]')).join('');
  }
  return '';
}

// msg.media (engine/read_tool.py's provider-neutral attachment list) never
// carries a blob into the replay — one placeholder tag per item.
function _mediaPlaceholder(media) {
  if (!Array.isArray(media) || !media.length) return '';
  return media.map(m => `[${(m && m.kind) || 'image'}]`).join(' ');
}

const chatPane = {
  id: 'chat',
  label: 'chat',

  mount(el, ctx) {
    _ctx = ctx;
    el.innerHTML = `
      <div id="chat-flag" class="hidden"></div>
      <div id="log"></div>
      <button id="jump-bottom" class="hidden" title="jump to latest">↓ latest</button>
      <div id="busy-indicator" class="busy-hidden">
        <span id="busy-word"></span><span id="busy-dot"></span>
        <span id="timer-wait" class="phase-timer">wait 0.0s</span>
        <span id="timer-think" class="phase-timer">think 0.0s</span>
        <span id="timer-work" class="phase-timer">work 0.0s</span>
      </div>
      <div id="vad-bar" class="hidden">
        <span id="vad-dot">🎙</span><span id="vad-state">listening</span>
        <button id="vad-pause" title="pause / resume listening">⏸</button>
        <label>sens<input type="range" id="vad-sens" min="0.0025" max="0.15" step="0.0025"></label>
        <label>wait<input type="range" id="vad-wait" min="400" max="2500" step="100"></label>
        <label class="vad-chk"><input type="checkbox" id="vad-barge">barge-in</label>
      </div>
      <div id="chat-meters">
        <span id="met-status">idle</span>
        <span id="met-ctx">ctx —</span>
        <span id="met-cache">cache —</span>
        <span id="met-ts-now">t/s —</span>
        <span id="met-ts-avg">avg —</span>
        <div id="chat-session-controls">
          <button id="sess-new"  class="sess-btn" title="clear transcript (autosave off)">new</button>
          <button id="sess-save" class="sess-btn" title="save/bind session to a named file">save</button>
          <div id="sess-load-wrap">
            <button id="sess-load" class="sess-btn" title="load a saved session">load ▾</button>
            <div id="sess-load-dropdown"></div>
          </div>
          <span id="sess-label">○ unsaved</span>
        </div>
      </div>
    `;
    _chatFlag = el.querySelector('#chat-flag');
    _log     = el.querySelector('#log');
    _metCtx  = el.querySelector('#met-ctx');
    _metCache = el.querySelector('#met-cache');
    _metNow  = el.querySelector('#met-ts-now');
    _metAvg  = el.querySelector('#met-ts-avg');
    _metStatus = el.querySelector('#met-status');
    _busyEl  = el.querySelector('#busy-indicator');
    _busyWord = el.querySelector('#busy-word');
    _tWaitEl  = el.querySelector('#timer-wait');
    _tThinkEl = el.querySelector('#timer-think');
    _tWorkEl  = el.querySelector('#timer-work');
    _jumpBtn = el.querySelector('#jump-bottom');
    _sessLabelEl     = el.querySelector('#sess-label');
    _sessLoadDropdown = el.querySelector('#sess-load-dropdown');

    _log.addEventListener('scroll', () => {
      pinned = (_log.scrollHeight - _log.scrollTop - _log.clientHeight) < 40;
      updateJumpBtn();
    });
    _jumpBtn.addEventListener('click', scrollToBottom);
    _log.addEventListener('click', clearFlag);

    // ── session controls ────────────────────────────────────────────────────
    // session_new confirm (POLISH.md LANE G): a bound session is already
    // saved (no data loss), so it clears without asking regardless of the
    // confirm{} state — only unbound scratch work is at risk of discard.
    el.querySelector('#sess-new').addEventListener('click', () => {
      const doNew = () => { ctx.send({ type: 'session_new' }); };
      if (_saveName) {
        doNew();
      } else if (shouldConfirm('session_new') && ctx.showConfirm) {
        ctx.showConfirm('discard unsaved session?', doNew, null);
      } else {
        doNew();
      }
    });

    el.querySelector('#sess-save').addEventListener('click', () => _promptSaveName(ctx));

    el.querySelector('#sess-load').addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleLoadDropdown(ctx);
    });

    // Permanent delegation for dropdown rows — wired once, works for every render.
    // All rows are index-backed and act on data-path (one flat list).
    _sessLoadDropdown.addEventListener('click', (e) => {
      const resume = e.target.closest('.sld-resume');
      const open   = e.target.closest('.sld-open');
      const del    = e.target.closest('.sld-del');
      const row = resume || open || del;
      if (!row) return;
      e.stopPropagation();
      _sessLoadDropdown.classList.remove('open');
      const filePath = row.dataset.path;
      if (!filePath) return;
      const label = filePath.split('/').pop().replace(/\.json$/, '');

      if (resume) {
        const go = () => ctx.send({ type: 'session_load', path: filePath });
        if (shouldConfirm('session_load') && ctx.showConfirm) ctx.showConfirm(`replace current context with '${label}'?`, go, null);
        else go();
      } else if (open) {
        window.open('/ide?loadpath=' + encodeURIComponent(filePath), '_blank');
      } else if (del) {
        const go = () => fetch('/api/saves?path=' + encodeURIComponent(filePath), { method: 'DELETE' }).catch(() => {});
        if (shouldConfirm('delete_saved_session') && ctx.showConfirm) ctx.showConfirm(`delete '${label}'?`, go, null);
        else go();
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      if (_sessLoadDropdown) _sessLoadDropdown.classList.remove('open');
    });
    _vadWireControls(el);
  },

  show() {},
  hide() {},

  onFrame(m) {
    if (m.type === 'out') {
      if (m.dim && m.end === '') {
        // thinking token — end any open assistant turn first
        if (_assistantTurn !== null) endAssistantTurn();
        if (!thinkingEl) {
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
          _log.appendChild(details);
          thinkingEl = body;
          _hmmTimeEl = ht;            // this burst's live timer
          _hmmStart = performance.now();
        }
        thinkingEl.textContent += m.text;
        scrollIfPinned();
      } else {
        // regular content token
        if (thinkingEl) {
          thinkingEl.parentElement.classList.remove('thinking');
          thinkingEl = null;
          if (_hmmTimeEl) {   // freeze this burst's thinking time in its summary
            _hmmTimeEl.textContent = fmtDur(performance.now() - _hmmStart);
            _hmmTimeEl = null;
          }
        }
        if (m.dim) {
          // dim output (tool/system annotations) — flush turn and append dim span
          if (_assistantTurn !== null) endAssistantTurn();
          append(m.text + (m.end ?? ''), 'dim');
        } else {
          // normal assistant streaming text
          if (_assistantTurn === null) beginAssistantTurn();
          const chunk = m.text + (m.end ?? '');
          appendToTurn(chunk);
          // heuristic: if end === '\n' and text ends with '\n', the server
          // likely just emitted a final newline signalling turn end.
          // More robustly: the server sends a bare {type:'out',text:'\n',end:'\n'}
          // or just text='' end='\n' as a turn delimiter — we end then.
          // We also end on empty text to catch the trailing newline flush.
          if (m.end === '\n' && m.text === '') {
            endAssistantTurn();
          }
        }
      }
    } else if (m.type === 'session_save_ack') {
      _saveName = m.name || null;
      _updateSessLabel();
    } else if (m.type === 'transcript') {
      // Clear log and replay all user+assistant messages from a loaded save
      // (also fires on session_new, whose sole message is the bare system
      // row — skipped below, so the pane just ends up empty). Mount-order
      // guard: this frame can in principle land before this pane's own
      // mount() has run — never throw, just drop it (a fresh session_load
      // is always followed by activity/settings frames too, so nothing is
      // silently lost, only this one replay).
      if (!_log) return;
      if (_assistantTurn !== null) endAssistantTurn();
      thinkingEl = null;
      _hmmTimeEl = null;
      _log.innerHTML = '';
      for (const msg of (m.messages || [])) {
        // system rows (incl. the _seat_context row, which is always role
        // 'system' but checked explicitly too — belt & suspenders) and
        // native-mode tool results (role 'tool') never render as chat lines.
        if (msg.role === 'system' || msg._seat_context || msg.role === 'tool') continue;
        if (msg.role === 'user') {
          const content = _transcriptText(msg.content);
          if (_TOOL_RESULT_ECHO_RE.test(content)) continue;   // TEXT-mode tool-result echo
          const tag  = _mediaPlaceholder(msg.media);
          const line = content.trim() ? content + (tag ? ' ' + tag : '') : tag;
          if (line) append('\nyou> ' + line + '\n', 'you');
        } else if (msg.role === 'assistant') {
          // tool_calls / _author ride along on saved assistant messages but
          // render as plain text only — same as a live turn's chat bubble.
          const content = _transcriptText(msg.content);
          if (content.trim()) {
            const div = document.createElement('div');
            div.className = 'assistant-turn';
            renderAssistantTurn(div, content);
            _log.appendChild(div);
          }
        }
      }
      scrollToBottom();
    } else if (m.type === 'ask') {
      // The gate modal (shell.js) owns the prompt and grabs focus + the keyboard.
      // We only track awaiting so a typed answer in the chat bar still works as a
      // fallback — but we must NOT steal focus back from the modal (that was the
      // bug that made y/n land in the chat box).
      if (_assistantTurn !== null) endAssistantTurn();
      awaiting = m.prompt;
      if (_msg) _msg.placeholder = 'answer (y/n)…';
    } else if (m.type === 'status') {
      applyPhase(m.phase);
      _vadOnStatus(m.phase);
    } else if (m.type === 'meters') {
      if (_assistantTurn !== null) endAssistantTurn();
      const d = m.meters;
      const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
      if (_metCtx) _metCtx.textContent = `ctx ${fmtK(d.ctx_used)}/${fmtK(d.ctx_max)}`;
      if (_metCache) _metCache.textContent = `cache ${fmtK(d.cached || 0)}`;
      if (_metNow) _metNow.textContent = `t/s ${d.ts_now.toFixed(1)}`;
      if (_metAvg) _metAvg.textContent = `avg ${d.ts_avg.toFixed(1)}`;
    } else if (m.type === 'speak') {
      try {
        const u = new SpeechSynthesisUtterance(m.text);
        if (m.voice) {
          const v = speechSynthesis.getVoices().find(x => x.name === m.voice);
          if (v) u.voice = v;
        }
        _vadSpeaking = true;
        u.onend = u.onerror = () => { _vadSpeaking = false; _vadLoudAt = performance.now(); };
        speechSynthesis.cancel();   // barge-in: drop any prior utterance
        speechSynthesis.speak(u);
      } catch (e) { console.error('speak failed', e); _vadSpeaking = false; }
    } else if (m.type === 'audio') {
      try {
        _stopAudioPlayback();           // drop any prior clip first
        const a = new Audio('data:' + (m.mime || 'audio/wav') + ';base64,' + m.data);
        _currentAudio = a;
        _vadSpeaking = true;            // mute the continuous mic while server audio plays (ask A)
        a.onended = a.onerror = () => {
          if (_currentAudio === a) _currentAudio = null;
          _vadSpeaking = false; _vadLoudAt = performance.now();
        };
        a.play().catch(e => { console.error('audio play failed', e); _vadSpeaking = false; });
      } catch (e) { console.error('audio frame failed', e); _vadSpeaking = false; }
    } else if (m.type === 'settings') {
      _vadApplySettings(m.settings);
    }
  },

  getAwaiting() { return awaiting; },
  clearAwaiting() {
    awaiting = null;
    if (_msg) _msg.placeholder = 'message the model…';
  },
  showFlag,
  clearFlag,
  applyPhase,
  wireInputBar(msgEl, sendEl, stopEl, ctx) {
    _msg  = msgEl;
    _send = sendEl;
    _stop = stopEl;
    _ctx  = ctx;
    _undo = document.getElementById('undo');

    _send.onclick = submitChat;
    if (_undo) {
      _undo.onclick = () => {
        _msg.focus();
        document.execCommand('undo');
      };
    }
    _msg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChat(); }
    });
    // Focusing the message box counts as "I saw it" → clear any alert flag.
    _msg.addEventListener('focus', clearFlag);
    _stop.onclick = () => {
      if (_assistantTurn !== null) endAssistantTurn();
      _stopReadback();              // kill any readback immediately (browser + server audio)
      ctx.send({ type: 'stop' });
    };
    wireAttach();   // image attach button + paste + drag-drop
  },
  setScrollMode,
};

export default chatPane;
