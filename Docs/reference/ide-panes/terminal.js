// terminal.js — xterm terminal pane + shell input box.
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
// Guarded: xterm failures leave the pane inert without breaking other panes.

import { shouldConfirm } from '../globalflags.js';

let _ctx = null;
let _termWrap = null;
let _term = null;
let _fitAddon = null;
let _shellInputWrap = null;
let _shellInputDivider = null;
let _showTerminal = true;
let _showShellInput = false;
let _lineBuf = '';   // terminal_run confirm: client-side echo of the raw-xterm line in progress

// Fit, but only once xterm reports valid dimensions. xterm is opened at init on
// a DETACHED, zero-size #term, so its per-character size measures as 0 until the
// pane is first attached + painted. While that's true, fit() divides by a bad
// cell size, proposeDimensions() returns undefined, and fit() silently no-ops —
// leaving the terminal stuck at its default 80x24 (clipped in a short pane, which
// is what pushes the input bar off-screen and walks the cursor away). So we retry
// across frames until the char metrics are real, then fit. Public FitAddon API.
function scheduleFit(tries = 0) {
  if (!_fitAddon || !_showTerminal) return;
  requestAnimationFrame(() => {
    if (!_fitAddon || !_showTerminal) return;
    let dims = null;
    try { dims = _fitAddon.proposeDimensions(); } catch (e) {}
    if (dims && dims.rows > 0 && dims.cols > 0 && isFinite(dims.rows)) {
      try { _fitAddon.fit(); } catch (e) {}
    } else if (tries < 30) {
      scheduleFit(tries + 1);   // char size not measured yet — wait a frame
    }
  });
}

function applyVisibility() {
  if (!_termWrap) return;
  _termWrap.style.display = _showTerminal ? '' : 'none';
  if (_shellInputWrap)  _shellInputWrap.style.display  = (_showTerminal && _showShellInput) ? 'flex' : 'none';
  if (_shellInputDivider) _shellInputDivider.style.display = (_showTerminal && _showShellInput) ? '' : 'none';
  // Fit AFTER all display states are set and the layout has settled.
  if (_showTerminal) scheduleFit();
}

function submitShell() {
  if (!_ctx) return;
  const el = document.getElementById('shell-msg');
  if (!el) return;
  const text = el.value;
  if (!text) return;
  const fire = () => { _ctx.send({ type: 'input', data: text + '\n' }); el.value = ''; };
  if (shouldConfirm('terminal_run') && _ctx.showConfirm) { _ctx.showConfirm('run: ' + text, fire); return; }
  fire();
}

// Best-effort echo of the line being typed into the raw xterm — what the
// terminal_run confirm displays. Printables append, backspace pops,
// Enter/^C/^U reset. Arrow keys, history recall (↑), and tab-completion are
// invisible to this buffer — accepted v1 limits (POLISH.md LANE G).
function _trackLine(d) {
  for (const ch of d) {
    if (ch === '\r' || ch === '\n' || ch === '\x03' || ch === '\x15') _lineBuf = '';
    else if (ch === '\x7f') _lineBuf = _lineBuf.slice(0, -1);
    else if (ch >= ' ') _lineBuf += ch;
  }
}

const terminalPane = {
  id: 'terminal',
  label: 'terminal',

  mount(el, ctx) {
    _ctx = ctx;
    el.innerHTML = `
      <div id="term-wrap">
        <div id="term"></div>
      </div>
      <div id="shell-input-divider"></div>
      <div id="shell-input-wrap" style="display:none">
        <textarea id="shell-msg" placeholder="shell command…" rows="1" autocomplete="off"></textarea>
        <button id="shell-send">↵</button>
      </div>
    `;

    _termWrap         = el.querySelector('#term-wrap');
    _shellInputDivider = el.querySelector('#shell-input-divider');
    _shellInputWrap    = el.querySelector('#shell-input-wrap');

    // xterm init — guarded
    try {
      // Theme from the loaded skin's tokens (no hardcoded hex — SKIN-SPEC §5).
      // Read once at init: a skin flip reloads the page anyway (the <link> is
      // server-injected), so live re-theming isn't needed. An empty token
      // resolves to undefined → xterm's own default for that slot.
      const _cs  = getComputedStyle(document.documentElement);
      const _tok = (n) => _cs.getPropertyValue(n).trim() || undefined;
      _term = new Terminal({
        theme: { background: _tok('--deep'), foreground: _tok('--text-1'), cursor: _tok('--text-2') },
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        convertEol: false,
      });
      _fitAddon = new FitAddon.FitAddon();
      _term.loadAddon(_fitAddon);
      _term.open(el.querySelector('#term'));
      scheduleFit();
      window.addEventListener('resize', () => scheduleFit());

      // Auto-fit on ANY container size change — pane toggle, grid resize, input
      // bar show/hide, divider drag. ResizeObserver runs after layout, so the
      // measurement is always correct; scheduleFit guards against stale char
      // metrics on the very first reveal.
      try {
        const fitTarget = el.querySelector('#term');
        const ro = new ResizeObserver(() => {
          if (!_showTerminal) return;
          if (fitTarget.clientWidth < 1 || fitTarget.clientHeight < 1) return;
          scheduleFit();
        });
        ro.observe(fitTarget);
      } catch (e) { /* no ResizeObserver — manual fit calls still cover it */ }

      // Clipboard shortcuts: by default xterm sends Cmd/Ctrl+C/V/A to the PTY.
      // Intercept them so they act like a normal terminal — Cmd+C copies the
      // selection (only when there IS one, else ^C must still interrupt), Cmd+V
      // pastes, Cmd+A selects the buffer. Returning false lets the browser/xterm
      // handle paste; true sends the key to the shell.
      _term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;
        if (!(e.metaKey || e.ctrlKey)) return true;
        const k = e.key.toLowerCase();
        if (k === 'c' && _term.hasSelection()) {
          navigator.clipboard.writeText(_term.getSelection()).catch(() => {});
          return false;  // copied — don't also send ^C to the shell
        }
        if (k === 'a') { _term.selectAll(); return false; }
        if (k === 'v') return false;  // let the browser paste event reach xterm
        return true;
      });

      // wire keyboard → shell input frames. terminal_run confirm (POLISH.md
      // LANE G): keystrokes always flow to the PTY — only the Enter that would
      // fire the line is held for the confirm (holding every key would kill interactive
      // programs). Deny sends ^U (kill-line) so the shell's pending line and
      // the client echo both clear. Pastes with embedded newlines pass
      // ungated — the accepted v1 imperfection.
      _term.onData(d => {
        if (!_ctx) return;
        if (d === '\r' && shouldConfirm('terminal_run') && _ctx.showConfirm) {
          _ctx.showConfirm('run: ' + (_lineBuf || '(empty line)'),
            () => { _lineBuf = ''; _ctx.send({ type: 'input', data: '\r' }); },
            () => { _lineBuf = ''; _ctx.send({ type: 'input', data: '\x15' }); });
          return;
        }
        _trackLine(d);
        _ctx.send({ type: 'input', data: d });
      });

      // focused border — DOM events work across xterm versions
      el.querySelector('#term').addEventListener('focusin',  () => _termWrap.classList.add('term-focused'));
      el.querySelector('#term').addEventListener('focusout', () => _termWrap.classList.remove('term-focused'));
    } catch (e) {
      console.error('terminal init failed:', e);
    }

    // shell input submit
    const shellSend = el.querySelector('#shell-send');
    const shellMsg  = el.querySelector('#shell-msg');
    if (shellSend) shellSend.onclick = submitShell;
    if (shellMsg) {
      shellMsg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitShell(); }
      });
    }

    // shell input resize divider
    if (_shellInputDivider) {
      _shellInputDivider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY  = e.clientY;
        const startH  = _shellInputWrap.offsetHeight;
        _shellInputDivider.classList.add('dragging');
        function onMove(e) {
          const h = Math.max(36, Math.min(300, startH + (startY - e.clientY)));
          _shellInputWrap.style.height = h + 'px';
          const msg = document.getElementById('shell-msg');
          if (msg) msg.style.height = Math.max(20, h - 12) + 'px';
          if (_fitAddon && _showTerminal) _fitAddon.fit();  // reflow term as the input bar grows
        }
        function onUp() {
          _shellInputDivider.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
  },

  show() {
    _showTerminal = true;
    applyVisibility();
  },

  hide() {
    // pane hidden by grid — terminal itself stays alive for output
  },

  onFrame(m) {
    if (m.type === 'term') {
      if (_term) _term.write(m.data.replace(/\r?\n/g, '\r\n'));
    }
  },

  // called by settings pane to toggle sub-elements
  setShowTerminal(v) {
    _showTerminal = v;
    applyVisibility();
  },
  setShowShellInput(v) {
    _showShellInput = v;
    applyVisibility();
  },
  fit() {
    scheduleFit();
  },
};

export default terminalPane;
