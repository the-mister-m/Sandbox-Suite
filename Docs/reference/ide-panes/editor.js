// editor.js — Monaco editor pane.
// File tree and HTML preview are now separate panes (files + preview).
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
// Guarded: Monaco failures leave the pane inert without breaking other panes.
//
// Monaco is created LAZILY: mount() only builds DOM; ensureEditor() does the
// actual monaco.editor.create() call. ensureEditor() is called from show(),
// which runs AFTER shell.js's updateGrid() has re-attached the host element.
// Creating Monaco against a detached node produces a silent no-layout failure.

import { currentDir } from './browser.js';
import { shouldConfirm } from '../globalflags.js';

let _ctx = null;
let _editorPath = null;
let _editorStatus = null;

// Monaco state — shared with the global guarded init in index.html
let _monacoReady = false;
let _monacoEditor = null;
let _currentEditorPath = null;
let _pendingFileFrame = null;

// Confirm baseline (POLISH.md LANE G): the content as it was loaded at
// open — what the save confirm diffs the buffer against.
let _loadedContent = '';
let _loadedPath = null;

// Lazy-creation state
let _host = null;          // the #monaco-editor div, set in mount()
let _editorCreated = false; // true once monaco.editor.create() succeeded

// ── save-location picker modal ──────────────────────────────────────────
// Mirrors browser.js's root-picker modal (same tree frame, same directories-
// only browse/choose shape) but scoped to wherever save is landing, not the
// workspace root. tag:'esave' on the tree request keeps replies out of the
// files pane's own tree (multiuse.js routes by that tag).
let _saveModalEl = null;
let _saveModalUpBtn = null;
let _saveModalCloseBtn = null;
let _saveModalChooseBtn = null;
let _saveModalPathLbl = null;
let _saveModalList = null;
let _saveModalOpen = false;
let _saveModalPath = null;
let _saveModalParent = null;
let _saveModalFellBack = false;   // one-shot: don't loop if '/' errors too

function dirnameOf(path) {
  if (!path) return null;
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '/';
}

function baseNameOf(path) {
  if (!path) return path;
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}

export function editorGuessLanguage(path) {
  if (!path) return 'plaintext';
  const ext = path.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', ts: 'typescript', py: 'python', html: 'html',
    css: 'css', json: 'json', md: 'markdown', sh: 'shell',
    yml: 'yaml', yaml: 'yaml', txt: 'plaintext', rs: 'rust',
    go: 'go', c: 'c', cpp: 'cpp', java: 'java', rb: 'ruby',
  };
  return map[ext] || 'plaintext';
}

export function setMonacoInstance(editor) {
  _monacoEditor = editor;
  _monacoReady = true;
  // wire Ctrl+S
  try {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, editorSave);
  } catch (_) {}
  // replay any pending file frame
  if (_pendingFileFrame) {
    const m = _pendingFileFrame;
    _pendingFileFrame = null;
    applyFileFrame(m);
  }
}

export function applyFileFrame(m) {
  _currentEditorPath = m.path;
  _loadedContent = m.content ?? '';
  _loadedPath = m.path || null;
  if (_editorPath) _editorPath.value = m.path || '';
  if (_editorStatus) { _editorStatus.textContent = ''; _editorStatus.className = ''; }
  if (_monacoReady && _monacoEditor) {
    try {
      const lang = editorGuessLanguage(m.path);
      monaco.editor.setModelLanguage(_monacoEditor.getModel(), lang);
      _monacoEditor.setValue(m.content);
      _monacoEditor.setScrollPosition({ scrollTop: 0 });
    } catch (e) {
      console.error('monaco setModelLanguage failed:', e);
    }
  } else {
    _pendingFileFrame = m;
  }
}

// New blank file: clear the editor, seed an editable filename, focus it. The
// actual location is chosen at save time via the folder picker — the
// save-location setting only decides which folder that picker opens to.
export function editorNew() {
  if (_editorPath) { _editorPath.value = 'untitled.txt'; }
  _currentEditorPath = '';
  _loadedContent = '';
  _loadedPath = null;
  if (_monacoReady && _monacoEditor) {
    try {
      monaco.editor.setModelLanguage(_monacoEditor.getModel(), 'plaintext');
      _monacoEditor.setValue('');
    } catch (e) {}
  }
  if (_editorStatus) { _editorStatus.textContent = 'new'; _editorStatus.className = ''; }
  if (_editorPath) { _editorPath.focus(); _editorPath.select(); }
}

// Save now always goes through the folder picker (openSaveModal below) —
// hitting save/Ctrl+S opens it, "choose this folder" resolves the full path
// and runs the same confirm/write flow the old direct save used.
export function editorSave() {
  if (!_monacoReady || !_ctx) return;
  openSaveModal();
}

function _finishSave(dir) {
  const name = baseNameOf((_editorPath ? _editorPath.value : '').trim()) || 'untitled.txt';
  const path = dir.replace(/\/+$/, '') + '/' + name;
  if (_editorPath) _editorPath.value = path;
  let content;
  try {
    content = _monacoEditor.getValue();
  } catch (e) {
    console.error('editorSave failed:', e);
    return;
  }
  if (shouldConfirm('editor_save') && _ctx.showConfirm) {
    _ctx.showConfirm(saveConfirmText(path, content), () => _doSave(path, content));
    return;
  }
  _doSave(path, content);
}

// openSaveModal() seeds the picker: an already-open file starts browsing at
// its own directory; a new/untitled file starts at whatever the "new file →"
// setting says (workspace root, or the files pane's current directory).
function openSaveModal() {
  if (!_saveModalEl) return;
  _saveModalOpen = true;
  _saveModalFellBack = false;
  _saveModalEl.hidden = false;
  const loaded = _currentEditorPath ? dirnameOf(_currentEditorPath) : null;
  let start = loaded;
  if (!start) {
    const loc = localStorage.getItem('newFileLoc') || 'root';
    start = (loc === 'dir' && currentDir()) ? currentDir() : '.';
  }
  requestSaveModalTree(start);
}

function closeSaveModal() {
  _saveModalOpen = false;
  if (_saveModalEl) _saveModalEl.hidden = true;
}

function requestSaveModalTree(path) {
  if (!_ctx) return;
  _ctx.send({ type: 'tree', path, hidden: false, tag: 'esave' });
}

function renderSaveModalData(data) {
  if (data.error) {
    // The server's error names the path REQUESTED ('.'), which says nothing;
    // the resolved absolute path rides along in the same payload
    // (read_tool.py's list_dir returns {error, path}). Show that one.
    if (_saveModalPathLbl) {
      _saveModalPathLbl.textContent =
        '(error: ' + data.error + (data.path ? ' → ' + data.path : '') + ')';
    }
    // _saveModalPath/_saveModalParent are left alone on purpose: if a
    // directory vanishes mid-browse, the previous location is still valid and
    // Up still works. But when they're null NOTHING has ever loaded — the
    // seed itself failed, which is what a deleted workspace root does to the
    // '.' seed below. Up is disabled, the list is empty, and "save in this
    // folder" closes the modal and drops the save on the floor. Fall back
    // once to '/', which always exists, so the picker stays navigable.
    if (!_saveModalPath && !_saveModalFellBack) {
      _saveModalFellBack = true;
      requestSaveModalTree('/');
      return;
    }
    if (_saveModalChooseBtn) _saveModalChooseBtn.disabled = !_saveModalPath;
    return;
  }
  _saveModalPath = data.path;
  _saveModalParent = data.parent;
  if (_saveModalPathLbl) _saveModalPathLbl.textContent = _saveModalPath;
  if (_saveModalUpBtn) _saveModalUpBtn.disabled = !_saveModalParent;
  if (_saveModalChooseBtn) _saveModalChooseBtn.disabled = !_saveModalPath;
  if (!_saveModalList) return;
  _saveModalList.innerHTML = '';
  (data.entries || []).filter(e => e.isDir).forEach(e => {
    const li = document.createElement('li');
    li.className = 'esm-row';
    li.textContent = e.name;
    li.onclick = () => requestSaveModalTree(e.path);
    _saveModalList.appendChild(li);
  });
}

function _doSave(path, content) {
  _ctx.send({ type: 'save', path, content });
  if (_editorStatus) { _editorStatus.textContent = 'saving…'; _editorStatus.className = ''; }
}

// ── editor_save confirm (POLISH.md LANE G) ──────────────────────────────────
// "Flash the diff in my face": saving back to the loaded path → line diff of
// the buffer vs the content at open; a new/other path → a head preview.
// #gate-prompt already scrolls (pre-wrap, max-height 40vh) so long text needs
// no modal changes.
const DIFF_MAX_LINES = 800;   // LCS is O(n·m) — bigger files get a summary

function saveConfirmText(path, content) {
  if (_loadedPath && path === _loadedPath) {
    const diff = lineDiff(_loadedContent, content);
    if (diff === null) {
      return `overwrite ${path}?\n(too large to diff: ` +
             `${_loadedContent.split('\n').length} → ${content.split('\n').length} lines)`;
    }
    if (!diff.length) return `overwrite ${path}?\n(no changes)`;
    return `overwrite ${path}?\n\n${diff.join('\n')}`;
  }
  const lines = content.split('\n');
  const preview = lines.slice(0, 20).join('\n');
  const rest = lines.length - 20;
  return `save new file ${path}? (${lines.length} lines)\n\n` +
         preview + (rest > 0 ? `\n… (${rest} more lines)` : '');
}

function lineDiff(oldText, newText) {
  const A = oldText.split('\n'), B = newText.split('\n');
  const n = A.length, m = B.length;
  if (n > DIFF_MAX_LINES || m > DIFF_MAX_LINES) return null;
  const W = m + 1;
  const L = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1
                                   : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; }
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) out.push('- ' + A[i++]);
    else out.push('+ ' + B[j++]);
  }
  while (i < n) out.push('- ' + A[i++]);
  while (j < m) out.push('+ ' + B[j++]);
  // No output cap — #gate-prompt scrolls, and Brandon wants the whole diff.
  return out;
}

// ensureEditor — idempotent; safe to call multiple times.
// Guards: already created | Monaco AMD not yet loaded | host not in DOM.
// The host-in-DOM guard is the critical one: Monaco silently mislays itself
// when created against a detached node.
function ensureEditor() {
  if (_editorCreated) return;
  if (!_host) return;
  if (!window._monacoLoaded) return;
  if (!document.body.contains(_host)) return;

  try {
    const editor = monaco.editor.create(_host, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: (localStorage.getItem('editorWordWrap') || 'on'),
    });
    _editorCreated = true;
    window._monacoEditorInstance = editor;  // preview pane reads this
    setMonacoInstance(editor);
    console.log('[editor] Monaco editor created');
  } catch (e) {
    console.error('[editor] monaco.editor.create failed:', e);
  }
}

const editorPane = {
  id: 'editor',
  label: 'editor',

  mount(el, ctx) {
    _ctx = ctx;
    el.innerHTML = `
      <div id="editor-bar">
        <button id="editor-new" title="new blank file">new</button>
        <input id="editor-path" type="text" placeholder="(no file open)" spellcheck="false" autocomplete="off">
        <button id="editor-save">save</button>
        <button id="editor-toctx" title="inject editor content into chat">to ctx</button>
        <span id="editor-status"></span>
      </div>
      <div id="monaco-wrap"><div id="monaco-editor"></div></div>
      <div id="editor-save-modal" hidden>
        <div id="esm-box">
          <div id="esm-hdr">
            <button id="esm-up" title="up one level" disabled>&#8593;</button>
            <span id="esm-path"></span>
            <button id="esm-close" title="cancel">&times;</button>
          </div>
          <ul id="esm-list"></ul>
          <div id="esm-ftr">
            <button id="esm-choose">save in this folder</button>
          </div>
        </div>
      </div>
    `;

    _editorPath   = el.querySelector('#editor-path');
    _editorStatus = el.querySelector('#editor-status');

    _saveModalEl        = el.querySelector('#editor-save-modal');
    _saveModalUpBtn     = el.querySelector('#esm-up');
    _saveModalCloseBtn  = el.querySelector('#esm-close');
    _saveModalChooseBtn = el.querySelector('#esm-choose');
    _saveModalPathLbl   = el.querySelector('#esm-path');
    _saveModalList      = el.querySelector('#esm-list');

    _saveModalCloseBtn.onclick = () => closeSaveModal();
    _saveModalUpBtn.onclick = () => { if (_saveModalParent) requestSaveModalTree(_saveModalParent); };
    _saveModalChooseBtn.onclick = () => {
      // Check BEFORE closing. The old order closed the picker and then
      // dropped the save when _saveModalPath was null — the modal vanished
      // and nothing was written, which reads exactly like a successful save.
      const dir = _saveModalPath;
      if (!dir) return;
      closeSaveModal();
      _finishSave(dir);
    };

    el.querySelector('#editor-save').onclick = editorSave;
    el.querySelector('#editor-new').onclick = editorNew;
    el.querySelector('#editor-toctx').onclick = () => {
      if (!_monacoReady || !_monacoEditor) return;
      const content = _monacoEditor.getValue();
      const path = _currentEditorPath || (_editorPath ? _editorPath.value.trim() : '');
      const msgEl = document.getElementById('msg');
      if (!msgEl) return;
      const snippet = path ? `[file: ${path}]\n\`\`\`\n${content}\n\`\`\`` : content;
      const existing = msgEl.value.trim();
      msgEl.value = snippet + (existing ? '\n\n' + existing : '');
      msgEl.focus();
      msgEl.setSelectionRange(msgEl.value.length, msgEl.value.length);
    };
    // Live-set the language from the filename so highlighting matches as you type
    // a new file's name (typing .md gives markdown highlighting immediately).
    _editorPath.addEventListener('input', () => {
      if (_monacoReady && _monacoEditor) {
        try { monaco.editor.setModelLanguage(_monacoEditor.getModel(), editorGuessLanguage(_editorPath.value)); } catch (e) {}
      }
    });
    _editorPath.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); editorSave(); }
    });

    // Store the host element for later — do NOT create the editor here.
    // The pane cell is detached from the DOM at mount time (shell.js only
    // appends visible panes), so creating Monaco now would bind to an
    // off-document element and never render.
    _host = el.querySelector('#monaco-editor');

    // If Monaco AMD finishes loading while the pane is visible and already
    // attached, ensureEditor() will pick it up. If it fires while detached,
    // ensureEditor() silently skips and show() will retry on next open.
    window._onMonacoReady = ensureEditor;
  },

  show() {
    // ensureEditor() is idempotent — safe to call every time.
    // shell.js calls updateGrid() (attaches cell) BEFORE show(), so the host
    // is in the DOM by the time we reach here.
    ensureEditor();
    // re-layout monaco when pane becomes visible
    if (_monacoReady && _monacoEditor) {
      try { _monacoEditor.layout(); } catch (_) {}
    }
  },

  hide() {},

  newFile: editorNew,

  getContext() {
    const path = _currentEditorPath || (_editorPath ? _editorPath.value.trim() : '');
    const content = (_monacoReady && _monacoEditor) ? _monacoEditor.getValue() : '';
    if (!path && !content) return null;
    return { path, content };
  },

  // Toggle Monaco's word wrap live (called by the settings pane).
  setWordWrap(on) {
    localStorage.setItem('editorWordWrap', on ? 'on' : 'off');
    if (_monacoReady && _monacoEditor) {
      try { _monacoEditor.updateOptions({ wordWrap: on ? 'on' : 'off' }); } catch (_) {}
    }
  },

  onFrame(m) {
    if (m.type === 'file') {
      applyFileFrame(m);
    } else if (m.type === 'saved') {
      if (_editorStatus) {
        const ok = !m.result.startsWith('[save denied') && !m.result.startsWith('[WRITE refused');
        _editorStatus.textContent = ok ? 'saved' : 'denied';
        _editorStatus.className   = ok ? 'ok' : 'err';
        setTimeout(() => { _editorStatus.textContent = ''; _editorStatus.className = ''; }, 2500);
      }
    }
    // 'tree' is normally routed to the files pane; multiuse.js sends only
    // esave-tagged replies here, for the save-location picker.
    else if (m.type === 'tree' && m.data) {
      if (_saveModalOpen) renderSaveModalData(m.data);
    }
  },
};

export default editorPane;
