// settings.js — full-view exclusive settings overlay.
// Renders all knobs from a SCHEMA ARRAY (the Claude-Code-readiness seam).
// Future: a server `capabilities` frame can feed this array. Don't build that now.

import gateMatrix from '../gatematrix.js';
import { shouldConfirm } from '../globalflags.js';

// ── Knob schema ──────────────────────────────────────────────────────────────
// Each entry describes one control. shell.js reads this to know which IDs exist
// and the server feeds initial values via syncSettings().
//
// type: 'seg'       → segmented button group. values = string[] OR {value,label}[]
// type: 'select'    → <select>  (options = [{value, label}])
// type: 'number'    → <input type=number>
// type: 'checkbox'  → <input type=checkbox>
// type: 'action'    → plain button (fires cmd directly, no value sync needed)
// type: 'root'      → special workspace-root text+button control
// type: 'sound'     → custom alert-sound row (upload / test / default)
// locked: true      → shown disabled with a note (no onchange)
// local: true       → CLIENT-ONLY pref in localStorage (no server round-trip).
//                     localKey = storage key, localDefault = default. checkbox
//                     persists '1'/'0' (or calls onLocal); seg persists the value.
//
// section: 'name', tab: 'name'  starts a new tab.
// subsection: 'name'            subheader within a tab.

const KNOBS = [
  // ── model tab ───────────────────────────────────────────────────────────────
  { section: 'model & agent', tab: 'model' },
  {
    id: 'sel-model', type: 'select', label: 'model',
    options: [],  // populated by `models` server frame
    onChange: (v) => `/model ${v}`,
  },
  {
    id: 'sel-crew', type: 'select', label: 'crew member',
    options: [{ value: '', label: '(none — bare model)' }],  // + roster via `crew_list` frame
    sendFrame: (v) => ({ type: 'set_crew', nick: v }),
  },
  {
    id: 'sel-ctx', type: 'select', label: 'context',
    options: [
      { value: '4096',   label: '4K' },
      { value: '8192',   label: '8K' },
      { value: '16384',  label: '16K' },
      { value: '32768',  label: '32K' },
      { value: '65536',  label: '64K' },
      { value: '131072', label: '128K' },
      { value: '262144', label: '256K' },
    ],
    onChange: (v) => `/ctx ${v}`,
    settingsKey: 'num_ctx',
  },
  {
    id: 'inp-timeout', type: 'number', label: 'timeout (s)', min: 5,
    onChange: (v) => `/timeout ${v}`,
    settingsKey: 'request_timeout',
  },
  {
    id: 'mode', type: 'seg', label: 'mode',
    values: ['text', 'native'],
    ids: ['btn-text', 'btn-native'],
    onChange: (v) => `/mode ${v}`,
    settingsKey: 'mode',
  },
  {
    id: 'inp-max-tools', type: 'number', label: 'max tools', min: 0,
    onChange: (v) => `/tools ${v}`,
    settingsKey: 'max_tools',
  },
  {
    id: 'chk-think', type: 'checkbox', label: 'thinking (chain-of-thought)',
    onChange: (v) => `/think ${v ? 'on' : 'off'}`, settingsKey: 'think',
  },

  { id: 'inp-temperature', type: 'number', label: 'temperature', min: 0, max: 2, step: 0.05,
    onChange: (v) => `/param temperature ${v}`, settingsKey: 'temperature' },
  { id: 'inp-keep-alive', type: 'number', label: 'keep alive (m)  (-1=∞)', min: -1,
    onChange: (v) => `/param keep_alive ${v}`, settingsKey: 'keep_alive' },

  // Advanced sampling/generation knobs — collapsed by default; values sit at
  // Ollama's stock defaults (agent_loop.py), so most sessions never touch these.
  { collapse: 'advanced parameters' },
  { subsection: 'sampling' },
  { id: 'inp-top-k', type: 'number', label: 'top k', min: 1,
    onChange: (v) => `/param top_k ${v}`, settingsKey: 'top_k' },
  { id: 'inp-top-p', type: 'number', label: 'top p', min: 0, max: 1, step: 0.05,
    onChange: (v) => `/param top_p ${v}`, settingsKey: 'top_p' },
  { id: 'inp-min-p', type: 'number', label: 'min p', min: 0, max: 1, step: 0.05,
    onChange: (v) => `/param min_p ${v}`, settingsKey: 'min_p' },

  { subsection: 'repetition' },
  { id: 'inp-repeat-penalty', type: 'number', label: 'repeat penalty', min: 0, max: 2, step: 0.05,
    onChange: (v) => `/param repeat_penalty ${v}`, settingsKey: 'repeat_penalty' },
  { id: 'inp-repeat-last-n', type: 'number', label: 'repeat last n', min: -1,
    onChange: (v) => `/param repeat_last_n ${v}`, settingsKey: 'repeat_last_n' },

  { subsection: 'generation' },
  { id: 'inp-seed', type: 'number', label: 'seed  (0=random)', min: 0,
    onChange: (v) => `/param seed ${v}`, settingsKey: 'seed' },
  { id: 'inp-num-predict', type: 'number', label: 'max tokens  (-1=∞)', min: -2,
    onChange: (v) => `/param num_predict ${v}`, settingsKey: 'num_predict' },

  { subsection: 'mirostat' },
  {
    id: 'mirostat', type: 'seg', label: 'mirostat',
    values: ['0', '1', '2'],
    ids: ['btn-mirostat-0', 'btn-mirostat-1', 'btn-mirostat-2'],
    onChange: (v) => `/param mirostat ${v}`,
    settingsKey: 'mirostat',
  },
  { id: 'inp-mirostat-tau', type: 'number', label: 'tau', min: 0, max: 10, step: 0.5,
    onChange: (v) => `/param mirostat_tau ${v}`, settingsKey: 'mirostat_tau' },
  { id: 'inp-mirostat-eta', type: 'number', label: 'eta', min: 0, max: 1, step: 0.01,
    onChange: (v) => `/param mirostat_eta ${v}`, settingsKey: 'mirostat_eta' },

  { subsection: 'hardware' },
  { id: 'inp-num-gpu', type: 'number', label: 'gpu layers  (-1=auto)', min: -1,
    onChange: (v) => `/param num_gpu ${v}`, settingsKey: 'num_gpu' },
  { id: 'inp-num-thread', type: 'number', label: 'cpu threads  (0=auto)', min: 0,
    onChange: (v) => `/param num_thread ${v}`, settingsKey: 'num_thread' },
  { collapseEnd: true },

  // (the killswitch config moved to the GLOBAL group 2026-07-13 PM — it lives
  //  in global.json, edited via the gate-matrix module's GLOBAL section on the
  //  'global' tab, not per-session settings. CONTROL-CENTER.md §1b.)

  // ── chat tab ─────────────────────────────────────────────────────────────────
  { section: 'chat', tab: 'chat' },
  {
    id: 'scroll-mode', type: 'seg', label: 'scroll mode',
    values: ['auto', 'on send', 'static'],
    ids: ['btn-scroll-auto', 'btn-scroll-send', 'btn-scroll-static'],
  },
  { subsection: 'alerts' },
  { id: 'chk-alert-overlay', type: 'checkbox', label: 'full-window flash (on done)', local: true, localKey: 'alert_overlay',  localDefault: true },
  { id: 'chk-alert-flag',    type: 'checkbox', label: 'in-chat flag',                local: true, localKey: 'alert_chatflag', localDefault: true },
  { id: 'chk-alert-notify',  type: 'checkbox', label: 'desktop notification',        local: true, localKey: 'alert_notify',   localDefault: true },
  { id: 'chk-alert-sound',   type: 'checkbox', label: 'sound',                       local: true, localKey: 'alert_sound',    localDefault: true },
  {
    id: 'seg-alert-when', type: 'seg', label: 'fire when', local: true,
    localKey: 'alert_when', localDefault: 'unfocused',
    values: [{ value: 'unfocused', label: 'tab unfocused' }, { value: 'always', label: 'always' }],
  },
  // Corner-pop knobs (MODAL-SPEC 'corner' presentation, Brandon 2026-07-21) —
  // only take effect in 'corner' modal_mode. Client-only prefs, same alert_*
  // localStorage idiom as the rest of this subsection.
  {
    id: 'seg-alert-pop-pos', type: 'seg', label: 'corner pop position', local: true,
    localKey: 'alert_pop_pos', localDefault: 'pane',
    values: [{ value: 'pane', label: 'over queue/ledger pane' }, { value: 'corner', label: 'bottom corner' }],
  },
  { id: 'chk-alert-pop-dismiss', type: 'checkbox', label: 'corner pop auto-dismiss', local: true, localKey: 'alert_pop_autodismiss', localDefault: false },
  { id: 'snd-alert', type: 'sound', label: 'alert sound' },

  // ── files tab ────────────────────────────────────────────────────────────────
  { section: 'files', tab: 'files' },
  { subsection: 'gates' },
  { id: 'chk-gate-read',  type: 'checkbox', label: 'gate read',        onChange: (v) => `/gate read ${v ? 'on' : 'off'}`,  settingsKey: 'gate_read' },
  { id: 'chk-gate-list',  type: 'checkbox', label: 'gate list',        onChange: (v) => `/gate list ${v ? 'on' : 'off'}`,  settingsKey: 'gate_list' },
  { id: 'chk-step',       type: 'checkbox', label: 'gate every tool',  onChange: (v) => `/step ${v ? 'on' : 'off'}`,        settingsKey: 'step' },
  { id: 'chk-gate-write', type: 'checkbox', label: 'gate write', onChange: (v) => `/gate write_file ${v ? 'on' : 'off'}`, defaultChecked: true },
  { id: 'chk-gate-run',   type: 'checkbox', label: 'gate run',   onChange: (v) => `/gate run_command ${v ? 'on' : 'off'}`, defaultChecked: true },
  { subsection: 'workspace' },
  { id: 'inp-workspace-root', type: 'root', label: 'root' },
  // auto-track is now the files-pane root-lock button (unlocked = follows); no dup toggle here
  { subsection: 'list output' },
  { id: 'chk-recursive', type: 'checkbox', label: 'recursive', onChange: (v) => `/list recursive ${v ? 'on' : 'off'}`, settingsKey: 'list_recursive' },
  { id: 'chk-size',      type: 'checkbox', label: 'size',      onChange: (v) => `/list size ${v ? 'on' : 'off'}`,      settingsKey: 'list_size' },
  { id: 'chk-hidden',    type: 'checkbox', label: 'hidden',    onChange: (v) => `/list hidden ${v ? 'on' : 'off'}`,     settingsKey: 'list_hidden' },

  // ── editor tab ───────────────────────────────────────────────────────────────
  { section: 'editor', tab: 'editor' },
  {
    id: 'seg-newfile', type: 'seg', label: 'new file →', local: true,
    localKey: 'newFileLoc', localDefault: 'root',
    values: [{ value: 'root', label: 'workspace root' }, { value: 'dir', label: 'files-pane dir' }],
  },
  { id: 'chk-wordwrap', type: 'checkbox', label: 'word wrap', local: true, localKey: 'editorWordWrap', localDefault: true, onLocal: (v) => { if (_onWordWrap) _onWordWrap(v); } },

  // ── terminal tab ─────────────────────────────────────────────────────────────
  { section: 'terminal', tab: 'terminal' },
  { id: 'chk-run-stream',  type: 'checkbox', label: 'stream to pane', onChange: (v) => `/run stream ${v ? 'on' : 'off'}`, settingsKey: 'run_stream' },
  { id: 'chk-terminal',    type: 'checkbox', label: 'show terminal',   internal: 'terminal-visibility', defaultChecked: true },
  { id: 'chk-shell-input', type: 'checkbox', label: 'show input',      internal: 'shell-input-visibility' },

  // ── speech tab ─────────────────────────────────────────────────────────────
  { section: 'speech', tab: 'speech' },
  { subsection: 'input — speech to text (the 🎙 mic)' },
  { id: 'chk-listen', type: 'checkbox', label: 'listen (transcribe mic audio)',
    onChange: (v) => `/listen ${v ? 'on' : 'off'}`, settingsKey: 'listen' },
  { id: 'sel-stt-engine', type: 'select', label: 'stt engine',
    options: [
      { value: 'parakeet_mlx',   label: 'parakeet-mlx (best on Mac)' },
      { value: 'faster_whisper', label: 'faster-whisper (portable)' },
      { value: 'whisper_cpp',    label: 'whisper.cpp (portable, large-v3)' },
      { value: 'moonshine',      label: 'moonshine (tiny/edge)' },
    ],
    onChange: (v) => `/stt engine ${v}`, settingsKey: 'stt_engine' },
  { id: 'seg-listen-mode', type: 'seg', label: 'capture',
    values: ['ptt', 'continuous'],
    ids: ['btn-listen-ptt', 'btn-listen-continuous'],
    onChange: (v) => `/listen ${v}`, settingsKey: 'listen_mode' },

  { subsection: 'output — text to speech' },
  { id: 'chk-speak', type: 'checkbox', label: 'speak replies',
    onChange: (v) => `/speak ${v ? 'on' : 'off'}`, settingsKey: 'speak' },
  { id: 'sel-tts-engine', type: 'select', label: 'tts engine',
    options: [
      { value: 'browser',     label: 'browser (web default, zero-install)' },
      { value: 'say',         label: 'macOS say (terminal default)' },
      { value: 'kokoro_onnx', label: 'kokoro-onnx (portable, high quality)' },
      { value: 'kokoro_mlx',  label: 'kokoro-mlx (Mac)' },
      { value: 'piper',       label: 'piper (edge)' },
      { value: 'xtts',        label: 'xtts (cloned voice)' },
      { value: 'f5',          label: 'f5 (cloned voice)' },
    ],
    onChange: (v) => `/tts engine ${v}`, settingsKey: 'tts_engine' },
  { id: 'voices', type: 'voices', label: 'voice' },

  // ── global tab — the MIRROR (CONTROL-CENTER.md §1b: "the GLOBAL group ...
  // is MIRRORED into each shell's settings pane"). Same gatematrix.js module
  // the control center's SETTINGS tab mounts — same policy.json/global.json
  // store, edit-anywhere-shows-everywhere (no live push between mounted
  // instances though; see gatematrix.js's own header comment). A new tab, so
  // it only renders in UNSCOPED (master) settings mounts — the IDE's and
  // conference room's header-gear overlay, and the daemon page's settings
  // cell (mounted with no scopeTabs, i.e. every tab) — never in a per-pane
  // scoped view unless that scope explicitly lists 'global'.
  { section: 'global', tab: 'global' },
  { id: 'global-gatematrix', type: 'gatematrix' },
];

// ── Module state ─────────────────────────────────────────────────────────────
let _ctx = null;
let _overlay = null;
let _onScrollMode = null;
let _onTerminalToggle = null;
let _onShellInputToggle = null;
let _onWordWrap = null;
let _currentRoot = '';

function sendCmd(cmd) {
  if (_ctx) _ctx.send({ type: 'user', text: cmd });
}

// setroot confirm (POLISH.md LANE G): redefines what "inside the workspace"
// means — every boundary gate downstream keys off it.
function sendSetRoot(path) {
  if (!_ctx || !path) return;
  const fire = () => _ctx.send({ type: 'setroot', path });
  if (shouldConfirm('setroot') && _ctx.showConfirm) _ctx.showConfirm(`set workspace root to '${path}'?`, fire);
  else fire();
}

// ── Voice manager control (picker + upload/record clone + test + delete) ──────
// Browser voices come from speechSynthesis (client-side, zero infra). Cloned
// voices come from /api/voices; uploading/recording a reference clip POSTs there.
let _pendingVoiceClip = null;   // {mime, b64} staged for the next "save"

function populateVoices(selArg, listArg) {
  const sel  = selArg  || (_overlay && _overlay.querySelector('#sel-tts-voice'));
  const list = listArg || (_overlay && _overlay.querySelector('#s-voice-list'));
  if (!sel) return;
  fetch('/api/voices').then(r => r.json()).then(d => {
    const cloned = d.voices || {};
    const caps   = (d.caps && d.caps.clone) || {};
    const cur    = sel.value;
    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = '(engine default)';
    sel.appendChild(def);

    const names = Object.keys(cloned);
    if (names.length) {
      const og = document.createElement('optgroup'); og.label = 'cloned';
      names.forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = `${n} (${cloned[n].engine})`;
        o.dataset.engine = cloned[n].engine;   // selecting it also switches tts engine
        og.appendChild(o);
      });
      sel.appendChild(og);
    }

    // Browser voices — only meaningful when tts engine = browser, but harmless to list.
    try {
      const bv = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      if (bv.length) {
        const og = document.createElement('optgroup'); og.label = 'browser';
        bv.forEach(v => {
          const o = document.createElement('option');
          o.value = v.name; o.textContent = v.name;
          og.appendChild(o);
        });
        sel.appendChild(og);
      }
    } catch (e) {}

    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;

    if (list) {
      list.innerHTML = '';
      if (!names.length) {
        list.innerHTML = '<span class="s-voice-empty">no cloned voices yet — name one + upload/record above</span>';
      } else {
        names.forEach(n => {
          const item = document.createElement('div');
          item.className = 's-voice-item';
          const label = document.createElement('span');
          label.textContent = `${n} (${cloned[n].engine})`;
          const del = document.createElement('button');
          del.className = 's-voice-del'; del.textContent = '×'; del.title = 'delete';
          del.onclick = () => {
            const go = () => fetch('/api/voices/' + encodeURIComponent(n), { method: 'DELETE' })
              .then(() => populateVoices()).catch(() => {});
            if (shouldConfirm('delete_voice') && _ctx && _ctx.showConfirm) _ctx.showConfirm(`delete voice '${n}'?`, go);
            else go();
          };
          item.appendChild(label); item.appendChild(del);
          list.appendChild(item);
        });
        if (!(caps.xtts || caps.f5)) {
          const hint = document.createElement('div');
          hint.className = 's-voice-empty';
          hint.textContent = 'cloned-voice playback needs: pip install coqui-tts (xtts)';
          list.appendChild(hint);
        }
      }
    }
  }).catch(() => {});
}

function buildVoicesControl(row, k) {
  row.classList.add('s-voices');

  // line 1: label + picker + test
  const line1 = document.createElement('div');
  line1.className = 's-voices-pick';
  const lbl = document.createElement('span');
  lbl.textContent = k.label;
  const sel = document.createElement('select');
  sel.id = 'sel-tts-voice';
  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    const eng = opt && opt.dataset.engine;   // set only on cloned-voice options
    if (eng) sendCmd(`/tts engine ${eng}`);
    sendCmd(`/tts voice ${sel.value}`);        // '' = engine default (clears)
  };
  const testBtn = document.createElement('button');
  testBtn.className = 's-btn'; testBtn.textContent = '▶ test';
  testBtn.onclick = () => {
    const opt = sel.selectedOptions[0];
    const eng = (opt && opt.dataset.engine) || undefined;
    if (_ctx) _ctx.send({ type: 'speak_test', engine: eng, voice: sel.value });
  };
  line1.appendChild(lbl); line1.appendChild(sel); line1.appendChild(testBtn);

  // line 2: add a voice — name + upload + record + save
  const line2 = document.createElement('div');
  line2.className = 's-voices-add';
  const nameInp = document.createElement('input');
  nameInp.type = 'text'; nameInp.placeholder = 'new voice name'; nameInp.className = 's-voice-name';
  const fileInp = document.createElement('input');
  fileInp.type = 'file'; fileInp.accept = 'audio/*'; fileInp.style.display = 'none';
  const upBtn = document.createElement('button');
  upBtn.className = 's-btn'; upBtn.textContent = 'upload';
  upBtn.onclick = () => fileInp.click();
  const recBtn = document.createElement('button');
  recBtn.className = 's-btn'; recBtn.textContent = '● record';
  const saveBtn = document.createElement('button');
  saveBtn.className = 's-btn'; saveBtn.textContent = 'save'; saveBtn.disabled = true;
  const clipNote = document.createElement('span');
  clipNote.className = 's-voice-clip';

  function stageClip(mime, b64, label) {
    _pendingVoiceClip = { mime, b64 };
    clipNote.textContent = '✓ ' + label;
    saveBtn.disabled = !nameInp.value.trim();
  }
  nameInp.addEventListener('input', () => {
    saveBtn.disabled = !(nameInp.value.trim() && _pendingVoiceClip);
  });
  fileInp.addEventListener('change', () => {
    const f = fileInp.files && fileInp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const uri = String(r.result); const b64 = uri.slice(uri.indexOf(',') + 1);
      stageClip(f.type || 'audio/wav', b64, f.name);
    };
    r.readAsDataURL(f);
  });

  let rec = null, chunks = [];
  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream); chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const r = new FileReader();
        r.onload = () => {
          const uri = String(r.result); const b64 = uri.slice(uri.indexOf(',') + 1);
          stageClip(blob.type, b64, 'recorded clip');
        };
        r.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
        recBtn.textContent = '● record'; recBtn.classList.remove('recording');
      };
      rec.start(); recBtn.textContent = '■ stop'; recBtn.classList.add('recording');
    } catch (e) { clipNote.textContent = 'mic denied: ' + e.message; }
  };

  saveBtn.onclick = () => {
    const name = nameInp.value.trim();
    if (!name || !_pendingVoiceClip) return;
    saveBtn.disabled = true; saveBtn.textContent = 'saving…';
    fetch('/api/voices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mime: _pendingVoiceClip.mime, audio_b64: _pendingVoiceClip.b64 }),
    }).then(r => r.json()).then(d => {
      saveBtn.textContent = 'save';
      _pendingVoiceClip = null; nameInp.value = '';
      clipNote.textContent = (d && d.clone_ready === false)
        ? 'saved — needs pip install coqui-tts to play' : 'saved ✓';
      populateVoices();
    }).catch(() => { saveBtn.textContent = 'save'; clipNote.textContent = 'save failed'; });
  };

  line2.appendChild(nameInp); line2.appendChild(upBtn); line2.appendChild(recBtn);
  line2.appendChild(saveBtn); line2.appendChild(fileInp); line2.appendChild(clipNote);

  // line 3: cloned-voice list (with delete)
  const list = document.createElement('div');
  list.id = 's-voice-list'; list.className = 's-voice-list';

  row.appendChild(line1); row.appendChild(line2); row.appendChild(list);

  // Browser voice list is async on first load — repopulate when it arrives.
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => populateVoices();
  populateVoices(sel, list);   // pass refs: the row isn't in the DOM tree yet
}

// ── DOM builder ──────────────────────────────────────────────────────────────
function buildKnobRow(k) {
  const row = document.createElement('div');
  row.className = 's-row' + (k.locked ? ' locked' : '');

  if (k.type === 'gatematrix') {
    // Full-width block, not a flex '.s-row' knob line — bypass `row` (same
    // early-return shape as 'action' below) and mount a fresh, independent
    // gatematrix.js instance into it.
    const wrap = document.createElement('div');
    wrap.className = 's-gatematrix-mount';
    gateMatrix.mount(wrap, _ctx);
    return wrap;
  }

  if (k.type === 'root') {
    // Workspace root: read-only display label + editable text input + set button
    const lbl = document.createElement('span');
    lbl.textContent = k.label;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = k.id;
    inp.className = 's-root-input';
    inp.placeholder = '/path/to/workspace';
    inp.spellcheck = false;
    inp.value = _currentRoot || '';
    const btn = document.createElement('button');
    btn.className = 's-btn';
    btn.id = 'btn-setroot';
    btn.textContent = 'set';
    btn.onclick = () => {
      const v = inp.value.trim();
      if (v) sendSetRoot(v);
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = inp.value.trim();
        if (v) sendSetRoot(v);
      }
    });
    row.appendChild(lbl);
    row.appendChild(inp);
    row.appendChild(btn);

  } else if (k.type === 'checkbox') {
    const lbl = document.createElement('label');
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.id = k.id;
    if (k.locked) inp.disabled = true;
    if (k.local) {
      // Client-only pref: initial state from localStorage; change writes it
      // (and/or calls onLocal). Never touches the server.
      inp.checked = lbool(k.localKey, k.localDefault);
      inp.addEventListener('change', () => {
        if (k.onLocal) k.onLocal(inp.checked);
        if (k.localKey && !k.onLocal) localStorage.setItem(k.localKey, inp.checked ? '1' : '0');
      });
    } else {
      if (k.defaultChecked) inp.checked = true;
      if (k.onChange && !k.locked) {
        inp.addEventListener('change', () => {
          if (k.internal) return;
          sendCmd(k.onChange(inp.checked));
        });
      }
    }
    lbl.appendChild(inp);
    lbl.appendChild(document.createTextNode(' ' + k.label));
    row.appendChild(lbl);

  } else if (k.type === 'number') {
    const lbl = document.createElement('span');
    lbl.textContent = k.label;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.id = k.id;
    if (k.min  !== undefined) inp.min  = k.min;
    if (k.max  !== undefined) inp.max  = k.max;
    if (k.step !== undefined) inp.step = k.step;
    inp.addEventListener('change', () => sendCmd(k.onChange(inp.value)));
    row.appendChild(lbl);
    row.appendChild(inp);

  } else if (k.type === 'select') {
    const lbl = document.createElement('span');
    lbl.textContent = k.label;
    const sel = document.createElement('select');
    sel.id = k.id;
    k.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = typeof o === 'string' ? o : o.value;
      opt.textContent = typeof o === 'string' ? o : o.label;
      sel.appendChild(opt);
    });
    // sendFrame (e.g. sel-crew) posts a dedicated frame type instead of a
    // '/command' chat line — set_crew isn't a slash-command knob, it's a
    // structural identity swap (see shells/ide/frames.py).
    sel.addEventListener('change', () => {
      if (k.sendFrame) { if (_ctx) _ctx.send(k.sendFrame(sel.value)); }
      else sendCmd(k.onChange(sel.value));
    });
    row.appendChild(lbl);
    row.appendChild(sel);

  } else if (k.type === 'action') {
    const btn = document.createElement('button');
    btn.id = k.id;
    btn.className = 's-btn';
    btn.textContent = k.label;
    btn.onclick = () => sendCmd(k.cmd);
    return btn;

  } else if (k.type === 'seg') {
    const lbl = document.createElement('span');
    lbl.textContent = k.label;
    const seg = document.createElement('div');
    seg.className = 'seg';
    if (k.local) {
      // Client-only segmented pref. values may be strings or {value,label}.
      const cur = lval(k.localKey, k.localDefault);
      k.values.forEach(val => {
        const v = typeof val === 'string' ? val : val.value;
        const text = typeof val === 'string' ? val : val.label;
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.classList.toggle('active', v === cur);
        btn.onclick = () => {
          localStorage.setItem(k.localKey, v);
          [...seg.children].forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
        };
        seg.appendChild(btn);
      });
    } else {
      k.values.forEach((val, i) => {
        const btn = document.createElement('button');
        btn.id = k.ids[i];
        btn.textContent = val;
        btn.onclick = () => {
          if (k.id === 'scroll-mode') {
            if (_onScrollMode) _onScrollMode(val === 'on send' ? 'send' : val);
          } else {
            sendCmd(k.onChange(val));
          }
        };
        seg.appendChild(btn);
      });
    }
    row.appendChild(lbl);
    row.appendChild(seg);

  } else if (k.type === 'voices') {
    buildVoicesControl(row, k);

  } else if (k.type === 'sound') {
    // Custom alert sound: upload (stored as a data-URI), test, reset to default beep.
    const lbl = document.createElement('span');
    lbl.textContent = k.label;
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'audio/*'; file.id = k.id;
    file.style.flex = '1'; file.style.minWidth = '0';
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { localStorage.setItem('alert_sound_data', r.result); }
        catch (e) { alert('sound too large to store — try a shorter clip'); }
      };
      r.readAsDataURL(f);
    });
    const testBtn = document.createElement('button');
    testBtn.className = 's-btn'; testBtn.textContent = 'test'; testBtn.style.flex = '0 0 auto';
    testBtn.onclick = () => { if (window._previewAlertSound) window._previewAlertSound(); };
    const resetBtn = document.createElement('button');
    resetBtn.className = 's-btn'; resetBtn.textContent = 'default'; resetBtn.style.flex = '0 0 auto';
    resetBtn.onclick = () => { localStorage.removeItem('alert_sound_data'); file.value = ''; };
    row.appendChild(lbl); row.appendChild(file); row.appendChild(testBtn); row.appendChild(resetBtn);
  }

  return row;
}

// scopeTabs: optional array of tab names to include (undefined/null = all).
// Renders every included tab as its own bordered `.s-panel` with a title header
// — no tab bar, no hide/show switching. Caller controls layout (columns vs a
// single stacked pane) via CSS on the container's class.
function buildUI(container, scopeTabs) {
  const order = [];
  const panels = {};
  let currentPanel = null;
  let currentTabIncluded = true;
  let pendingActions = [];
  // When inside a { collapse } … { collapseEnd } block, rows append here (the
  // <details> body) instead of straight onto the panel.
  let collapseBody = null;
  const target = () => collapseBody || currentPanel;

  function flushActions() {
    if (!pendingActions.length || !currentPanel) return;
    const row = document.createElement('div');
    row.className = 's-btns';
    pendingActions.forEach(btn => row.appendChild(btn));
    currentPanel.appendChild(row);
    pendingActions = [];
  }

  for (const k of KNOBS) {
    if (k.section) {
      flushActions();
      collapseBody = null;   // a new tab/section always closes any open collapse
      currentTabIncluded = !scopeTabs || (k.tab && scopeTabs.includes(k.tab));
      if (k.tab && currentTabIncluded && !panels[k.tab]) {
        order.push(k.tab);
        const panel = document.createElement('div');
        panel.className = 's-panel';
        panel.dataset.tab = k.tab;
        const title = document.createElement('div');
        title.className = 's-panel-title';
        title.textContent = k.section;
        panel.appendChild(title);
        panels[k.tab] = panel;
      }
      currentPanel = currentTabIncluded ? panels[k.tab] : null;
      continue;
    }
    if (!currentTabIncluded) continue;
    if (!currentPanel) continue;
    if (k.collapse) {
      flushActions();
      const det = document.createElement('details');
      det.className = 's-collapse';
      if (k.open) det.open = true;
      const sum = document.createElement('summary');
      sum.textContent = k.collapse;
      det.appendChild(sum);
      currentPanel.appendChild(det);
      collapseBody = det;
      continue;
    }
    if (k.collapseEnd) {
      collapseBody = null;
      continue;
    }
    if (k.subsection) {
      flushActions();
      const sub = document.createElement('div');
      sub.className = 's-sub';
      sub.textContent = k.subsection;
      target().appendChild(sub);
      continue;
    }
    if (k.type === 'action') {
      pendingActions.push(buildKnobRow(k));
      continue;
    }
    flushActions();
    target().appendChild(buildKnobRow(k));
  }
  flushActions();

  order.forEach(tab => container.appendChild(panels[tab]));
}

// ── localStorage helpers for client-only knobs (local: true in the schema) ────
function lbool(key, dflt) {
  const v = localStorage.getItem(key);
  return v === null ? dflt : v === '1';
}
function lval(key, dflt) {
  const v = localStorage.getItem(key);
  return v === null ? dflt : v;
}

// One-shot initial-state sync for the write/run gate checkboxes (ACCEPTED
// limit: reads once at load; a later flip from the gatematrix tab won't
// live-update these boxes — same as gatematrix instances between themselves).
function syncGateLockState(container) {
  fetch('/api/policy').then(r => r.json()).then(d => {
    const rows = (d && d.rows) || [];
    const modelRows = rows.filter(r => r.driver === 'model');
    const writeRow = modelRows.find(r => r.edge === 'write_file');
    const runRow   = modelRows.find(r => r.edge === 'run_command');
    const chkWrite = container.querySelector('#chk-gate-write');
    const chkRun   = container.querySelector('#chk-gate-run');
    if (chkWrite && writeRow) chkWrite.checked = writeRow.hook !== 'open';
    if (chkRun   && runRow)   chkRun.checked   = runRow.hook !== 'open';
  }).catch(() => {});
}

// ── Internal toggle wiring ───────────────────────────────────────────────────
function wireInternalToggles(container) {
  const chkTerm = container.querySelector('#chk-terminal');
  if (chkTerm && _onTerminalToggle) {
    chkTerm.addEventListener('change', () => _onTerminalToggle(chkTerm.checked));
  }

  const chkShell = container.querySelector('#chk-shell-input');
  if (chkShell && _onShellInputToggle) {
    chkShell.addEventListener('change', () => _onShellInputToggle(chkShell.checked));
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export function syncSettings(s, container) {
  if (!container) return;
  const q = id => container.querySelector('#' + id);

  // mode seg buttons
  const btnText   = q('btn-text');
  const btnNative = q('btn-native');
  if (btnText)   btnText.classList.toggle('active', s.mode === 'text');
  if (btnNative) btnNative.classList.toggle('active', s.mode === 'native');

  // select: model (populated separately by models frame)
  const selModel = q('sel-model');
  if (selModel && s.model && [...selModel.options].some(o => o.value === s.model))
    selModel.value = s.model;

  // select: ctx
  const selCtx = q('sel-ctx');
  if (selCtx && s.num_ctx !== undefined) selCtx.value = String(s.num_ctx);

  // selects: speech engines
  const selStt = q('sel-stt-engine');
  if (selStt && s.stt_engine) selStt.value = s.stt_engine;
  const selTts = q('sel-tts-engine');
  if (selTts && s.tts_engine) selTts.value = s.tts_engine;
  const selVoice = q('sel-tts-voice');
  if (selVoice && s.tts_voice !== undefined
      && [...selVoice.options].some(o => o.value === s.tts_voice)) {
    selVoice.value = s.tts_voice;
  }

  // seg: listen capture mode (ptt | continuous)
  if (s.listen_mode !== undefined) {
    ['ptt', 'continuous'].forEach(v => {
      const btn = q(`btn-listen-${v}`);
      if (btn) btn.classList.toggle('active', s.listen_mode === v);
    });
  }

  // number: max_tools
  const inpTools = q('inp-max-tools');
  if (inpTools && s.max_tools !== undefined) inpTools.value = s.max_tools;

  // number: request_timeout
  const inpTimeout = q('inp-timeout');
  if (inpTimeout && s.request_timeout !== undefined) inpTimeout.value = s.request_timeout;

  // mirostat seg
  if (s.mirostat !== undefined) {
    ['0', '1', '2'].forEach(v => {
      const btn = q(`btn-mirostat-${v}`);
      if (btn) btn.classList.toggle('active', s.mirostat === Number(v));
    });
  }

  // new number params (skip null — means "auto / not set")
  const numParams = {
    'inp-temperature':    'temperature',
    'inp-top-k':         'top_k',
    'inp-top-p':         'top_p',
    'inp-min-p':         'min_p',
    'inp-repeat-penalty':'repeat_penalty',
    'inp-repeat-last-n': 'repeat_last_n',
    'inp-seed':          'seed',
    'inp-num-predict':   'num_predict',
    'inp-keep-alive':    'keep_alive',
    'inp-mirostat-tau':  'mirostat_tau',
    'inp-mirostat-eta':  'mirostat_eta',
    'inp-num-gpu':       'num_gpu',
    'inp-num-thread':    'num_thread',
  };
  Object.entries(numParams).forEach(([id, key]) => {
    const el = q(id);
    if (el && s[key] != null) el.value = s[key];
  });

  // checkboxes
  const map = {
    'chk-recursive':  'list_recursive',
    'chk-size':       'list_size',
    'chk-hidden':     'list_hidden',
    'chk-gate-read':  'gate_read',
    'chk-gate-list':  'gate_list',
    'chk-step':       'step',
    'chk-think':      'think',
    'chk-run-stream': 'run_stream',
    'chk-gate-human': 'gate_human_write',
    'chk-listen':     'listen',
    'chk-speak':      'speak',
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = q(id);
    if (el && s[key] !== undefined) el.checked = s[key];
  });
}

export function populateModels(list, current, container) {
  if (!container) return;
  const sel = container.querySelector('#sel-model');
  if (!sel) return;
  if (!sel.dataset.wired) {
    sel.addEventListener('change', () => sendCmd(`/model ${sel.value}`));
    sel.dataset.wired = '1';
  }
  sel.innerHTML = '';
  list.forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  });
  if (current) sel.value = current;
}

// list: [{nick, tag}, ...] from compiler.roster_entries() (engine/compiler.py).
// current: sess.nick, or '' / null for bare model.
export function populateCrew(list, current, container) {
  if (!container) return;
  const sel = container.querySelector('#sel-crew');
  if (!sel) return;
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = ''; none.textContent = '(none — bare model)';
  sel.appendChild(none);
  (list || []).forEach(entry => {
    const o = document.createElement('option');
    o.value = entry.nick; o.textContent = `${entry.nick} (${entry.tag})`;
    sel.appendChild(o);
  });
  sel.value = current || '';
}

// Every open settings surface (the master center-divide view AND any
// per-pane scoped views) is its own instance here — a frame from the server
// (settings/models/crew_list) fans out to all of them, each queried through
// its own container so duplicate #ids across instances never collide.
let _instances = [];
let _lastSettingsMsg = null;
let _lastModelsMsg = null;
let _lastCrewMsg = null;

const settingsPane = {
  id: 'settings',
  label: 'settings',

  // scopeTabs: array of tab names to restrict this instance to (omit for the
  // full/master view). title: header text (defaults to 'settings').
  mount(el, ctx, { onClose, onScrollMode, onTerminalToggle, onShellInputToggle, onWordWrap, scopeTabs, title } = {}) {
    _ctx = ctx;
    _overlay = el;
    if (onScrollMode)        _onScrollMode = onScrollMode;
    if (onTerminalToggle)    _onTerminalToggle = onTerminalToggle;
    if (onShellInputToggle)  _onShellInputToggle = onShellInputToggle;
    if (onWordWrap)          _onWordWrap = onWordWrap;

    el.innerHTML = `
      <div id="settings-inner" class="${scopeTabs ? 's-scoped' : 's-master'}">
        <div id="settings-header">
          <span id="settings-title">${title || 'settings'}</span>
          <button class="settings-close">close</button>
        </div>
        <div class="settings-knobs"></div>
      </div>
    `;

    const knobsContainer = el.querySelector('.settings-knobs');
    buildUI(knobsContainer, scopeTabs);
    wireInternalToggles(knobsContainer);
    syncGateLockState(knobsContainer);

    el.querySelector('.settings-close').onclick = () => {
      if (onClose) onClose();
    };

    const inst = { el, knobsContainer };
    _instances = _instances.filter(i => i.el !== el);  // re-mount replaces, doesn't duplicate
    _instances.push(inst);

    // A freshly-opened instance starts blank otherwise — backfill from the
    // last frames seen so it doesn't sit empty until the next server push.
    if (_lastSettingsMsg) syncSettings(_lastSettingsMsg.settings, knobsContainer);
    if (_lastModelsMsg)   populateModels(_lastModelsMsg.list, _lastModelsMsg.current, knobsContainer);
    if (_lastCrewMsg)     populateCrew(_lastCrewMsg.list, _lastCrewMsg.current, knobsContainer);
    if (_currentRoot) {
      const inp = knobsContainer.querySelector('#inp-workspace-root');
      if (inp) inp.value = _currentRoot;
    }
  },

  show() {},
  hide() {},

  onFrame(m) {
    if (m.type === 'settings')  _lastSettingsMsg = m;
    if (m.type === 'models')    _lastModelsMsg = m;
    if (m.type === 'crew_list') _lastCrewMsg = m;
    _instances.forEach(({ knobsContainer }) => {
      if (m.type === 'settings')  syncSettings(m.settings, knobsContainer);
      if (m.type === 'models')    populateModels(m.list, m.current, knobsContainer);
      if (m.type === 'crew_list') populateCrew(m.list, m.current, knobsContainer);
    });
  },

  // Called by shell.js when a tree frame arrives carrying data.root
  setWorkspaceRoot(rootPath) {
    _currentRoot = rootPath;
    _instances.forEach(({ knobsContainer }) => {
      const inp = knobsContainer.querySelector('#inp-workspace-root');
      if (inp) inp.value = rootPath;
    });
  },

  // exposed for shell.js
  syncSettings(s) {
    _instances.forEach(({ knobsContainer }) => syncSettings(s, knobsContainer));
  },
  populateModels(list, current) {
    _instances.forEach(({ knobsContainer }) => populateModels(list, current, knobsContainer));
  },
  setScrollMode(mode) {
    _instances.forEach(({ knobsContainer }) => {
      ['auto', 'send', 'static'].forEach(m => {
        const id = m === 'send' ? 'btn-scroll-send' : 'btn-scroll-' + m;
        const btn = knobsContainer.querySelector('#' + id);
        if (btn) btn.classList.toggle('active', m === mode);
      });
    });
  },
};

export default settingsPane;
