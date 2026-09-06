// browser.js — file navigator pane ("files").
// LANE 4 rebuild (2026-07-13): was drill-in navigation (one directory on screen
// at a time, root FOLLOWED the pane). Now a VS Code-style collapse/expand tree,
// lazily fed by the SAME single-level {tree,path} frame the server has always
// sent — each expand click is just one more `tree` request.
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
//
// ── THIS IS THE HUMAN'S PANE (Brandon, 2026-08-21) ──────────────────────────
// It belongs to the person driving it, not to any agent, and the server half
// says the same thing (shells/ade/frames.py, THE HUMAN DOOR). Two consequences
// that used to be one muddled thing and are now cleanly separate:
//
//   CHANGE FOLDER (the 📁 button) moves what is DISPLAYED. It sets nothing,
//   moves no agent, and is free to point anywhere on disk.
//
//   MAKE SESSION ROOT (the ⌂ button) is the only control in the ADE that
//   writes a root. It makes the displayed folder the session root — what new
//   agents are born into, what the PreToolUse hook enforces as the wall, and
//   what EVERY live agent's root becomes in one write — and it confirms every
//   single time, with no way to switch the confirm off.
//
// The old single "set root" button collapsed those two into one act, so
// browsing to look at something and re-rooting an agent were the same click
// away from each other.

import { shouldConfirm } from '../globalflags.js';

let _ctx = null;

// ── tree state ───────────────────────────────────────────────────────────
// nodeMap: absolute path -> node. A node is either the root or a descendant
// discovered via some directory's `entries`. Nodes persist for the life of
// the page (LANE 4 spec: "expansion state persists client-side") — collapsing
// a directory just hides its <ul>, it does not forget its children.
//   { path, name, isDir, depth, parent, loaded, expanded, children,
//     isRoot, _li, _row, _chev, _ul }
const nodeMap = new Map();
let rootPath = null;
let rootNode = null;
let _showHidden = false;
let _lastActiveDir = null;   // best-effort "current dir" for currentDir()/getContext()
let _selectedRow = null;
let _dragSrc = null;         // node currently being dragged

// ── DOM refs (files pane proper) ────────────────────────────────────────
let _pathLine = null;
let _msgLine = null;
let _msgTimer = null;
let _chdirBtn = null;
let _makeRootBtn = null;
let _refreshBtn = null;
let _hiddenToggle = null;
let _treeEl = null;

// ── DOM refs (change-folder picker) ─────────────────────────────────────
let _modalEl = null;
let _modalUpBtn = null;
let _modalCloseBtn = null;
let _modalChooseBtn = null;
let _modalPathLbl = null;
let _modalList = null;
let _modalOpen = false;
let _modalPath = null;
let _modalParent = null;

function requestTree(path) {
  if (!_ctx) return;
  _ctx.send({ type: 'tree', path: path || '.', hidden: !!_showHidden, tag: 'tree' });
}

// A listing that becomes the DISPLAYED ROOT — the tree is torn down and rebuilt
// around it. Tagged 'root' so the reply can be told apart from an ordinary node
// load by WHO ASKED, never by guessing from the payload. The old code decided
// this by comparing data.path against data.root, i.e. it asked the SERVER which
// folder the pane was rooted at — fine when the pane was the anchored agent's
// pane, wrong now that the human can display any folder without that folder
// being anybody's root.
function requestDisplayRoot(path) {
  if (!_ctx) return;
  _ctx.send({ type: 'tree', path: path || '.', hidden: !!_showHidden, tag: 'root' });
}

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

function joinPath(dir, name) {
  if (!dir || dir === '/') return '/' + name;
  return dir.replace(/\/+$/, '') + '/' + name;
}

function showMsg(text) {
  if (!_msgLine) return;
  _msgLine.textContent = text;
  _msgLine.hidden = false;
  clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => { _msgLine.hidden = true; }, 4000);
}

// The directory most recently activated (expanded, or the parent of the last
// opened file) — read by the editor's "new file" feature when the
// save-location setting is "current dir". Falls back to the workspace root.
export function currentDir() {
  return _lastActiveDir || rootPath;
}

// ── node model ───────────────────────────────────────────────────────────
function makeNode(entry, parentPath, depth) {
  return {
    path: entry.path, name: entry.name, isDir: !!entry.isDir,
    depth, parent: parentPath,
    loaded: false, expanded: false, children: null,
  };
}

function makeRootNode(absPath) {
  return {
    path: absPath, name: baseNameOf(absPath) || absPath, isDir: true,
    depth: 0, parent: null,
    loaded: false, expanded: true, children: null, isRoot: true,
  };
}

// Drop a node and EVERYTHING BELOW IT. A vanished directory's descendants are
// reachable only through its own children array, so deleting just the top node
// stranded them in nodeMap for the life of the page — where they kept answering
// nodeMap.get() for paths that no longer exist. That stale hit is the part that
// bites: currentDir() reads _lastActiveDir, and the editor's "new file" writes
// into whatever it returns.
function purgeNode(node) {
  if (!node) return;
  (node.children || []).forEach(purgeNode);
  nodeMap.delete(node.path);
  if (_lastActiveDir === node.path) _lastActiveDir = rootPath;
  if (_selectedRow && node._row === _selectedRow) _selectedRow = null;
}

// Reconcile a directory node's children against a fresh entries list —
// existing child nodes (same path) are REUSED so their own loaded/expanded
// state survives a refresh (e.g. after a save/delete/move touches a sibling).
function applyEntries(node, entries) {
  const prevByPath = new Map((node.children || []).map(c => [c.path, c]));
  const next = (entries || []).map(e => {
    const existing = prevByPath.get(e.path);
    if (existing) {
      existing.name = e.name;
      existing.isDir = !!e.isDir;
      prevByPath.delete(e.path);
      return existing;
    }
    const n = makeNode(e, node.path, node.depth + 1);
    nodeMap.set(n.path, n);
    return n;
  });
  // anything left over no longer exists server-side — drop it and its subtree
  prevByPath.forEach(purgeNode);
  node.children = next;
  node.loaded = true;
}

function refreshDir(path) {
  if (!path) return;
  const node = nodeMap.get(path);
  if (node && node.isDir && node.loaded) requestTree(node.path);
}

function refreshAllLoaded() {
  nodeMap.forEach(node => {
    if (node.isDir && node.loaded) requestTree(node.path);
  });
}

// ── rendering ────────────────────────────────────────────────────────────
function renderChildrenInto(ul, node) {
  ul.innerHTML = '';
  (node.children || []).forEach(child => ul.appendChild(buildLi(child)));
}

function wireDropTarget(row, node) {
  row.addEventListener('dragover', (e) => {
    if (!_dragSrc || _dragSrc === node) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('drag-over');
    const src = _dragSrc;
    _dragSrc = null;
    if (!src || !_ctx || src === node) return;
    if (src.path === node.path) return;
    // file_move confirm (POLISH.md LANE G): confirm src → dst before the frame.
    const fire = () => _ctx.send({ type: 'move', src: src.path, dst: node.path });
    if (shouldConfirm('file_move') && _ctx.showConfirm) {
      _ctx.showConfirm(`move ${src.path}\n  → ${node.path}?`, fire);
    } else fire();
  });
}

function wireDrag(row, node) {
  if (!node.isRoot) {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', (e) => {
      _dragSrc = node;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', node.path); } catch (_) { /* ok */ }
    });
    row.addEventListener('dragend', () => {
      _dragSrc = null;
      if (_treeEl) _treeEl.querySelectorAll('.drag-over')
        .forEach(el => el.classList.remove('drag-over'));
    });
  }
  if (node.isDir) wireDropTarget(row, node);
}

function onRowClick(node) {
  if (node.isDir) {
    toggleDir(node);
    return;
  }
  _lastActiveDir = node.parent || rootPath;
  if (_selectedRow) _selectedRow.classList.remove('selected');
  node._row.classList.add('selected');
  _selectedRow = node._row;
  if (_ctx) _ctx.send({ type: 'open', path: node.path });
}

function toggleDir(node) {
  _lastActiveDir = node.path;
  if (!node.loaded) {
    requestTree(node.path);   // lazy first load; onFrame flips expanded+loaded
    return;
  }
  node.expanded = !node.expanded;
  if (node._chev) node._chev.textContent = node.isDir ? (node.expanded ? '▾' : '▸') : '';
  if (node._ul) node._ul.hidden = !node.expanded;
}

// ── delete (file) — shared by the row's × button AND the context menu ──────
function deleteFile(node) {
  if (!_ctx) return;
  // file_delete confirm (POLISH.md LANE G): confirm via the SHARED gate modal —
  // 'silent' = fire without asking, per the confirm{} contract.
  const fire = () => _ctx.send({ type: 'delete', path: node.path });
  if (shouldConfirm('file_delete') && _ctx.showConfirm) _ctx.showConfirm(`delete ${node.path}?`, fire);
  else fire();
}

// ── context menu (LANE 4, VS Code pass) ─────────────────────────────────────
// One menu element, built fresh per open, appended to document.body (escapes
// #files-tree-wrap's overflow:auto so it's never clipped) and positioned at
// the cursor via inline top/left — same recipe as conference.js's
// room-dropdown (_makeDropdown/_showInviteMenu). Dismissed on click-away /
// Esc / scroll. Text-input actions (rename/new file/new folder) route
// through ctx.showPrompt; delete-folder and the shared deleteFile() above
// both route through ctx.showConfirm — the ONE house modal (shell.js's
// #gate-modal), never a second modal (confirm-pattern rule). Both hooks are
// guarded (`_ctx.showPrompt`/`_ctx.showConfirm` may be absent — e.g. the
// ADE's mountMultiUse ctx today only carries `send`+`showConfirm`, no
// `showPrompt` — see this lane's report for the follow-up) so a missing hook
// no-ops instead of throwing.
let _menuEl = null;

function _menuKeyHandler(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
}

function closeMenu() {
  if (_menuEl) { _menuEl.remove(); _menuEl = null; }
  document.removeEventListener('click', closeMenu, true);
  document.removeEventListener('keydown', _menuKeyHandler, true);
  window.removeEventListener('scroll', closeMenu, true);
}

function promptNewFile(dirPath) {
  if (!_ctx || !_ctx.showPrompt) return;
  _ctx.showPrompt('new file name:', '', (name) => {
    name = (name || '').trim();
    if (!name) return;
    _ctx.send({ type: 'save', path: joinPath(dirPath, name), content: '' });
  });
}

function promptNewFolder(dirPath) {
  if (!_ctx || !_ctx.showPrompt) return;
  _ctx.showPrompt('new folder name:', '', (name) => {
    name = (name || '').trim();
    if (!name) return;
    _ctx.send({ type: 'mkdir', path: joinPath(dirPath, name) });
  });
}

function promptRename(node) {
  if (!_ctx || !_ctx.showPrompt) return;
  _ctx.showPrompt(`rename '${node.name}' to:`, node.name, (name) => {
    name = (name || '').trim();
    if (!name || name === node.name) return;
    _ctx.send({ type: 'rename', src: node.path, name });
  });
}

function confirmDeleteFolder(node) {
  if (!_ctx || !_ctx.showConfirm) return;
  _ctx.showConfirm(`delete folder ${node.path} and everything in it?`,
    () => _ctx.send({ type: 'rmdir', path: node.path }));
}

function menuItem(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'ctxm-item';
  btn.type = 'button';
  btn.textContent = label;
  btn.onclick = (e) => { e.stopPropagation(); closeMenu(); onClick(); };
  return btn;
}

// Items by node type (LANE 4 spec W4-d8): file -> open/rename/delete;
// folder -> new file/new folder/rename/delete folder; root -> new file/new
// folder only (checked BEFORE isDir since the root node also has isDir:true).
function menuItemsFor(node) {
  if (node.isRoot) {
    return [
      menuItem('new file',   () => promptNewFile(node.path)),
      menuItem('new folder', () => promptNewFolder(node.path)),
    ];
  }
  if (node.isDir) {
    return [
      menuItem('new file',      () => promptNewFile(node.path)),
      menuItem('new folder',    () => promptNewFolder(node.path)),
      menuItem('rename',        () => promptRename(node)),
      menuItem('delete folder', () => confirmDeleteFolder(node)),
    ];
  }
  return [
    menuItem('open',   () => onRowClick(node)),
    menuItem('rename', () => promptRename(node)),
    menuItem('delete', () => deleteFile(node)),
  ];
}

function openMenu(node, x, y) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'ctxm';
  menuItemsFor(node).forEach(item => menu.appendChild(item));
  document.body.appendChild(menu);
  const mr = menu.getBoundingClientRect();
  const left = Math.max(0, Math.min(x, window.innerWidth  - mr.width  - 4));
  const top  = Math.max(0, Math.min(y, window.innerHeight - mr.height - 4));
  menu.style.left = left + 'px';
  menu.style.top  = top + 'px';
  _menuEl = menu;
  // Deferred registration (matches conference.js's dismiss pattern) so the
  // right-click's own event doesn't immediately close what it just opened.
  setTimeout(() => {
    document.addEventListener('click', closeMenu, true);
    document.addEventListener('keydown', _menuKeyHandler, true);
    window.addEventListener('scroll', closeMenu, true);
  }, 0);
}

function buildLi(node) {
  const li = document.createElement('li');
  li.className = 'tnode' + (node.isDir ? ' tnode-dir' : ' tnode-file') + (node.isRoot ? ' tnode-root' : '');
  li.dataset.path = node.path;

  const row = document.createElement('div');
  row.className = 'trow';
  row.style.setProperty('--depth', node.depth);

  const chev = document.createElement('span');
  chev.className = 'tchev';
  chev.textContent = node.isDir ? (node.expanded ? '▾' : '▸') : '';
  row.appendChild(chev);

  const label = document.createElement('span');
  label.className = 'tname';
  label.textContent = node.name;
  label.title = node.path;
  row.appendChild(label);

  if (!node.isDir) {
    const actions = document.createElement('span');
    actions.className = 'tactions';
    const del = document.createElement('button');
    del.className = 'tdel';
    del.title = 'delete file';
    del.textContent = '×';
    del.onclick = (e) => {
      e.stopPropagation();
      deleteFile(node);
    };
    actions.appendChild(del);
    row.appendChild(actions);
  }

  row.addEventListener('click', () => onRowClick(node));
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(node, e.clientX, e.clientY);
  });
  wireDrag(row, node);

  li.appendChild(row);
  node._row = row;
  node._chev = chev;
  node._li = li;

  if (node.isDir) {
    const ul = document.createElement('ul');
    ul.className = 'tchildren';
    ul.hidden = !node.expanded;
    node._ul = ul;
    if (node.expanded && node.loaded) renderChildrenInto(ul, node);
    li.appendChild(ul);
  }
  return li;
}

function renderTreeRoot() {
  if (!_treeEl) return;
  _treeEl.innerHTML = '';
  _treeEl.appendChild(buildLi(rootNode));
}

// ── incoming tree frames ────────────────────────────────────────────────
// Every `tree` reply is a single-level listing keyed by its own absolute
// `data.path`. Two consumers share this one frame type: the tree itself
// (a node lazy-loading or refreshing) and the root-picker modal (browsing
// for a new root) — routed by whether the modal is currently open, since
// it visually covers the tree while up (see mount()'s modal markup).
function handleTreeFrame(data) {
  if (data.error) {
    console.error('[files] tree error:', data.error);
    // Surface it. A silent return leaves #files-path reading '(loading…)'
    // forever, which is indistinguishable from a hang. The case that bites is
    // a DELETED session root: mount()'s first listing errors, rootPath stays
    // null, and nothing on screen says why.
    if (_pathLine) _pathLine.textContent = rootPath || '(nothing to show — use change folder)';
    // The server's error string names the path REQUESTED ('.'), which says
    // nothing; the resolved absolute path rides along in the same payload
    // (read_tool.py's list_dir returns {error, path}). Show that instead —
    // it's the difference between "no directory at '.'" and being told
    // exactly which directory went missing.
    showMsg('tree error: ' + data.error + (data.path ? ' → ' + data.path : ''));
    return;
  }
  // REBUILD when this reply is the displayed root: an explicit change-folder /
  // make-session-root listing (tag 'root'), or the very first listing to arrive
  // at a pane that has nothing on screen yet. Everything else is a node load.
  if (data.tag === 'root' || rootPath === null) {
    if (data.path !== rootPath) {
      rootPath = data.path;
      nodeMap.clear();
      rootNode = makeRootNode(rootPath);
      nodeMap.set(rootPath, rootNode);
      applyEntries(rootNode, data.entries);
      rootNode.expanded = true;
      renderTreeRoot();
      if (_pathLine) { _pathLine.textContent = rootPath; _pathLine.title = rootPath; }
      _lastActiveDir = rootPath;
      return;
    }
    // Same folder re-listed (a refresh of the root itself) — fall through to
    // the node path below so expansion state downstream survives.
  }
  const node = nodeMap.get(data.path);
  if (!node) return;   // nothing currently displayed cares about this path
  applyEntries(node, data.entries);
  node.expanded = true;
  if (node._chev) node._chev.textContent = '▾';
  if (node._ul) {
    renderChildrenInto(node._ul, node);
    node._ul.hidden = false;
  }
}

function handleMoved(m) {
  showMsg(m.result);
  refreshDir(dirnameOf(m.src));
  refreshDir(m.dst);
}

// ── change-folder picker ─────────────────────────────────────────────────
// HARD CONSTRAINT (LANE 4 spec): a browser cannot hand the server an
// absolute filesystem path from a native picker (showDirectoryPicker
// returns a handle, not a path, and is Chromium-only). This modal is
// rendered entirely from server data via the SAME tree frame, directories
// only, navigable up/down.
//
// It PICKS WHAT IS DISPLAYED and nothing else (Brandon, 2026-08-21). It used
// to fire `setroot` straight from "choose this folder", which is what made
// looking around and re-rooting an agent the same gesture. Choosing here now
// only repoints the tree; making that folder the session root is a separate,
// separately-confirmed button in the toolbar.
//
// shell.js's #gate-modal machinery is off-limits to this lane (NO
// static/js/shell.js edits) — this is a minimal pane-local overlay, tokens
// only, living inside this pane's own detached mount cell.
function openRootModal() {
  if (!_ctx || !_modalEl) return;
  _modalOpen = true;
  _modalEl.hidden = false;
  // Seed from what is displayed when there is something. When there ISN'T —
  // the folder was deleted, so the first listing errored and rootPath is still
  // null — '.' resolves against that same dead directory and errors again,
  // leaving _modalPath/_modalParent null: Up disabled, list empty, "show this
  // folder" a silent no-op. Every way out of the picker was anchored to the
  // broken thing. '/' always exists, so the picker stays navigable.
  requestModalTree(rootPath || '/');
}

function closeRootModal() {
  _modalOpen = false;
  if (_modalEl) _modalEl.hidden = true;
}

function requestModalTree(path) {
  if (!_ctx) return;
  _ctx.send({ type: 'tree', path: path, hidden: false, tag: 'modal' });
}

function renderModalData(data) {
  if (data.error) {
    if (_modalPathLbl) _modalPathLbl.textContent = '(error: ' + data.error + ')';
    // _modalPath/_modalParent are deliberately left alone — if a directory
    // vanishes mid-browse, the previous location stays valid and Up still
    // works. But when they're null (nothing has loaded yet) the choose button
    // is a no-op that looks alive; disable it rather than let it lie.
    if (_modalChooseBtn) _modalChooseBtn.disabled = !_modalPath;
    return;
  }
  _modalPath = data.path;
  _modalParent = data.parent;
  if (_modalPathLbl) _modalPathLbl.textContent = _modalPath;
  if (_modalUpBtn) _modalUpBtn.disabled = !_modalParent;
  if (_modalChooseBtn) _modalChooseBtn.disabled = !_modalPath;
  if (!_modalList) return;
  _modalList.innerHTML = '';
  (data.entries || []).filter(e => e.isDir).forEach(e => {
    const li = document.createElement('li');
    li.className = 'frm-row';
    li.textContent = e.name;
    li.onclick = () => requestModalTree(e.path);
    _modalList.appendChild(li);
  });
}

const filesPane = {
  id: 'browser',       // keep id stable so shell.js routing doesn't need renaming
  label: 'files',

  mount(el, ctx) {
    _ctx = ctx;
    el.innerHTML = `
      <div id="files-toolbar">
        <span id="files-path">(loading…)</span>
        <button id="files-chdir" title="change folder — browse somewhere else to look at it. Sets nothing, moves nobody.">&#128193;</button>
        <button id="files-makeroot" title="make this folder the session root — new agents are born here, the hook wall moves here, and every existing agent is moved here">&#8962;</button>
        <button id="files-refresh" title="refresh listing">&#8635;</button>
        <label id="files-hidden-label" title="show hidden files">
          <input type="checkbox" id="files-hidden-chk"> .hidden
        </label>
      </div>
      <div id="files-msg" hidden></div>
      <div id="files-tree-wrap">
        <ul id="files-tree" class="tree-root"></ul>
      </div>
      <div id="files-root-modal" hidden>
        <div id="frm-box">
          <div id="frm-hdr">
            <button id="frm-up" title="up one level" disabled>&#8593;</button>
            <span id="frm-path"></span>
            <button id="frm-close" title="cancel">&times;</button>
          </div>
          <ul id="frm-list"></ul>
          <div id="frm-ftr">
            <button id="frm-choose">show this folder</button>
          </div>
        </div>
      </div>
    `;

    _pathLine     = el.querySelector('#files-path');
    _msgLine      = el.querySelector('#files-msg');
    _chdirBtn     = el.querySelector('#files-chdir');
    _makeRootBtn  = el.querySelector('#files-makeroot');
    _refreshBtn   = el.querySelector('#files-refresh');
    _hiddenToggle = el.querySelector('#files-hidden-chk');
    _treeEl       = el.querySelector('#files-tree');

    _modalEl        = el.querySelector('#files-root-modal');
    _modalUpBtn     = el.querySelector('#frm-up');
    _modalCloseBtn  = el.querySelector('#frm-close');
    _modalChooseBtn = el.querySelector('#frm-choose');
    _modalPathLbl   = el.querySelector('#frm-path');
    _modalList      = el.querySelector('#frm-list');

    _chdirBtn.onclick = () => openRootModal();
    _modalCloseBtn.onclick = () => closeRootModal();
    _modalUpBtn.onclick = () => { if (_modalParent) requestModalTree(_modalParent); };
    _modalChooseBtn.onclick = () => {
      const path = _modalPath;
      closeRootModal();
      if (!path) return;
      requestDisplayRoot(path);   // display only — no root written, no agent moved
    };

    // MAKE SESSION ROOT — confirmed EVERY time, deliberately not routed through
    // shouldConfirm() (Brandon, 2026-08-21). Every other confirm in this pane is
    // a preference the human can switch off in global flags; this one is not
    // offered as one, because the act it guards is not a file op — it moves the
    // wall the PreToolUse hook enforces and re-roots every live agent in one
    // write. A silenced confirm here would let a mis-click relocate the whole
    // session. If no house modal is reachable, fall back to the browser's own
    // confirm rather than firing unasked: never silent.
    _makeRootBtn.onclick = () => {
      if (!_ctx) return;
      const path = rootPath;
      if (!path) { showMsg('nothing displayed to make root'); return; }
      const ask = `make this the SESSION ROOT?\n\n  ${path}\n\n` +
                  `Every agent is moved here, new agents are born here, and the ` +
                  `hook wall moves with it.`;
      const fire = () => _ctx.send({ type: 'setroot', path });
      if (_ctx.showConfirm) _ctx.showConfirm(ask, fire);
      else if (window.confirm(ask)) fire();
    };

    _refreshBtn.onclick = () => refreshAllLoaded();

    _hiddenToggle.addEventListener('change', () => {
      _showHidden = _hiddenToggle.checked;
      refreshAllLoaded();
    });

    // initial listing — the session root, as the DISPLAYED root
    requestDisplayRoot('.');
  },

  show() {},
  hide() {},

  refresh() {
    refreshAllLoaded();
  },

  getContext() {
    const node = nodeMap.get(_lastActiveDir) || rootNode;
    if (!node) return null;
    const lines = (node.children || []).map(c => c.isDir ? c.name + '/' : c.name);
    return { path: node.path, entries: lines.join('\n') };
  },

  onFrame(m) {
    if (m.type === 'tree' && m.data) {
      try {
        // Route by WHO ASKED (the echoed tag), never by whichever mode the pane
        // happens to be in when the reply lands. Both directions of that race
        // were real: an agent save mid-browse fires refreshAllLoaded(), and
        // those tree replies used to repaint the OPEN modal to a random loaded
        // directory (the picker jumps under the cursor); and a modal reply that
        // arrived just after a close used to fall through to the tree, where its
        // hidden:false entries stripped dotfiles out of a node until refresh.
        if (m.data.tag === 'modal') {
          if (_modalOpen) renderModalData(m.data);   // else: stale, drop it
        } else {
          // 'root' (change folder / make session root / first load), 'tree'
          // (a node lazy-loading or refreshing), and untagged server pushes.
          // handleTreeFrame tells the first apart from the rest by the tag —
          // see its REBUILD comment.
          handleTreeFrame(m.data);
        }
      } catch (e) {
        console.error('files pane tree render failed:', e);
      }
    }
    if (m.type === 'moved') {
      handleMoved(m);
    }
    // A write/delete anywhere can land in any expanded directory (agent
    // writes especially may use a path relative to the model's own turn,
    // not the absolute path this pane keys nodes by) — refresh everything
    // currently loaded rather than guess which node it landed in.
    if (m.type === 'saved' || m.type === 'deleted') {
      refreshAllLoaded();
    }
    // rename/mkdir (context menu, LANE 4) — same "refresh everything loaded"
    // shape as saved/deleted above, plus surfacing the house result string
    // ('[RENAME ok: ...]' / '[MKDIR ok: ...]') via the pane's own message line.
    if (m.type === 'renamed' || m.type === 'made') {
      showMsg(m.result);
      refreshAllLoaded();
    }
  },
};

export default filesPane;
