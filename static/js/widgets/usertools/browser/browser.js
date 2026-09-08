// browser widget — file tree, root chosen through the macOS directory
// picker, right click for duplicate/rename/reveal/open. One instance's
// tree traffic is tagged with its own frame id so two open browsers
// never cross-read each other's tree replies.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // scoped, self-contained styling — matrix.css belongs to another lane
  function ensureStyles() {
    if (document.getElementById("mx-browser-style")) return;
    const style = document.createElement("style");
    style.id = "mx-browser-style";
    style.textContent = `
      .mx-browser { display: flex; flex-direction: column; height: 100%; font-size: 12px; }
      .mx-browser-bar { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
      .mx-browser-rootline { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-browser-tree { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1 1 auto; }
      .mx-browser-children { list-style: none; margin: 0; padding: 0; }
      .mx-browser-row { display: flex; align-items: center; gap: 4px; padding: 2px 4px; cursor: default; }
      .mx-browser-row:hover { background: var(--surface-2, #2a2a2a); }
      .mx-browser-chev { width: 12px; color: var(--text-3, #888); }
      .mx-browser-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-browser-size { color: var(--text-3, #888); font-size: 10px; min-width: 44px; text-align: right; }
    `;
    document.head.appendChild(style);
  }

  function fmtSize(n) {
    if (n === null || n === undefined) return "";
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 10 ? 0 : 1) + " " + units[i];
  }

  function baseName(path) {
    const parts = String(path).replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || path;
  }

  function makeNode(entry, parentPath, depth) {
    return {
      path: entry.path, name: entry.name, isDir: !!entry.isDir,
      depth, parent: parentPath, loaded: false, expanded: false, children: null,
    };
  }

  // adds a tab to an editor or viewer instance, mounting one first if none
  // is open. The editor asks the server for the file on its own instance id;
  // the viewer opens the path as a tab.
  function openInWidget(type, path) {
    if (!MX.grid) return;
    let inst = MX.grid.instances.find((i) => i.type === type);
    if (!inst) inst = MX.grid.addWidget(type);
    const target = MX.grid.frames[inst.id];
    if (!target) return;
    if (type === "editor") target.send({ type: "open", path: path, inst: target.id });
    else if (typeof target.openTab === "function") target.openTab(path);
    else target.setOption("path", path);
  }

  function register(frame) {
    const st = frame._browser = {
      root: null,
      nodeMap: new Map(),
      sizeCache: new Map(),
      treeEl: null,
      rootLine: null,
      menuEl: null,
      dragSrc: null,
    };

    function tag() { return frame.id; }

    function requestTree(path) {
      frame.send({ type: "tree", path: path, hidden: false,
                   tag: tag(), inst: frame.id });
    }

    function closeMenu() {
      if (st.menuEl) { st.menuEl.remove(); st.menuEl = null; }
      document.removeEventListener("click", closeMenu, true);
    }
    st.closeMenu = closeMenu;

    function menuItem(label, onClick) {
      const b = document.createElement("button");
      b.className = "mx-btn";
      b.type = "button";
      b.textContent = label;
      b.style.display = "block";
      b.style.width = "100%";
      b.style.textAlign = "left";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        onClick();
      });
      return b;
    }

    function doDuplicate(node) {
      fetch("/api/fs/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: node.path }),
      }).then(() => refreshDir(node.parent));
    }

    function doReveal(node) {
      fetch("/api/fs/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: node.path }),
      });
    }

    function doRename(node) {
      MX.ui.prompt("Rename", "new name:", node.name, (name) => {
        if (!name || name === node.name) return;
        frame.send({ type: "rename", src: node.path, name: name, inst: frame.id });
      });
    }

    function openMenu(node, x, y) {
      closeMenu();
      const menu = document.createElement("div");
      menu.className = "mx-panel";
      menu.style.position = "fixed";
      menu.style.zIndex = "1000";
      menu.style.minWidth = "160px";
      menu.appendChild(menuItem("Duplicate", () => doDuplicate(node)));
      menu.appendChild(menuItem("Rename", () => doRename(node)));
      menu.appendChild(menuItem("Show in Finder", () => doReveal(node)));
      if (!node.isDir) {
        menu.appendChild(menuItem("Open in Editor", () => openInWidget("editor", node.path)));
        menu.appendChild(menuItem("Open in Viewer", () => openInWidget("viewer", node.path)));
      }
      document.body.appendChild(menu);
      const w = menu.getBoundingClientRect().width || 160;
      menu.style.left = Math.min(x, window.innerWidth - w - 4) + "px";
      menu.style.top = Math.min(y, window.innerHeight - 4) + "px";
      st.menuEl = menu;
      setTimeout(() => document.addEventListener("click", closeMenu, true), 0);
    }

    function loadSize(node, span) {
      if (node.isDir) return;
      if (st.sizeCache.has(node.path)) { span.textContent = fmtSize(st.sizeCache.get(node.path)); return; }
      fetch("/api/fs/stat?path=" + encodeURIComponent(node.path))
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.size === "number") {
            st.sizeCache.set(node.path, d.size);
            span.textContent = fmtSize(d.size);
          }
        })
        .catch(() => {});
    }

    function buildRow(node) {
      const li = document.createElement("li");
      li.className = "mx-browser-node";
      li.style.paddingLeft = (node.depth * 14) + "px";

      const row = document.createElement("div");
      row.className = "mx-browser-row";

      const chev = document.createElement("span");
      chev.className = "mx-browser-chev";
      chev.textContent = node.isDir ? (node.expanded ? "▾" : "▸") : " ";
      row.appendChild(chev);

      const name = document.createElement("span");
      name.className = "mx-browser-name";
      name.textContent = node.name;
      row.appendChild(name);

      const size = document.createElement("span");
      size.className = "mx-browser-size";
      row.appendChild(size);
      loadSize(node, size);

      if (!node.isDir) {
        row.setAttribute("draggable", "true");
        row.addEventListener("dragstart", (e) => {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData("application/x-mx-path", node.path);
          e.dataTransfer.setData("text/plain", node.path);
        });
      }

      row.addEventListener("click", () => {
        if (node.isDir) toggleDir(node);
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMenu(node, e.clientX, e.clientY);
      });

      li.appendChild(row);
      node._li = li;
      node._chev = chev;

      if (node.isDir) {
        const ul = document.createElement("ul");
        ul.className = "mx-browser-children";
        ul.hidden = !node.expanded;
        node._ul = ul;
        li.appendChild(ul);
      }
      return li;
    }

    function renderChildren(node) {
      if (!node._ul) return;
      node._ul.textContent = "";
      (node.children || []).forEach((c) => node._ul.appendChild(buildRow(c)));
    }

    function toggleDir(node) {
      if (!node.loaded) { requestTree(node.path); return; }
      node.expanded = !node.expanded;
      if (node._chev) node._chev.textContent = node.expanded ? "▾" : "▸";
      if (node._ul) node._ul.hidden = !node.expanded;
    }

    function applyEntries(node, entries) {
      node.children = (entries || []).map((e) => {
        const existing = st.nodeMap.get(e.path);
        if (existing) { existing.name = e.name; existing.isDir = !!e.isDir; return existing; }
        const n = makeNode(e, node.path, node.depth + 1);
        st.nodeMap.set(n.path, n);
        return n;
      });
      node.loaded = true;
    }

    function renderRoot() {
      st.treeEl.textContent = "";
      const rootNode = st.nodeMap.get(st.root);
      if (!rootNode) return;
      st.treeEl.appendChild(buildRow(rootNode));
      renderChildren(rootNode);
    }

    function refreshDir(path) {
      const node = st.nodeMap.get(path);
      if (node && node.isDir && node.loaded) requestTree(node.path);
    }

    function refreshAllLoaded() {
      st.nodeMap.forEach((node) => { if (node.isDir && node.loaded) requestTree(node.path); });
    }

    function setRoot(path) {
      st.root = path;
      st.nodeMap.clear();
      requestTree(path);
      if (st.rootLine) st.rootLine.textContent = path;
    }

    function chooseRoot() {
      if (window.showDirectoryPicker) {
        window.showDirectoryPicker().then((handle) => {
          // the picker never hands a script the folder's absolute host
          // path — confirm or correct the name it returns before it
          // becomes the tree root
          MX.ui.prompt("Change Root", "confirm the full path:", handle.name, setRoot);
        }).catch(() => {});
        return;
      }
      MX.ui.prompt("Change Root", "folder path:", "", setRoot);
    }

    frame._browserHooks = { requestTree, refreshDir, refreshAllLoaded, applyEntries, renderRoot, setRoot };

    const wrap = document.createElement("div");
    wrap.className = "mx-browser";

    const bar = document.createElement("div");
    bar.className = "mx-browser-bar";
    const rootBtn = document.createElement("button");
    rootBtn.className = "mx-btn";
    rootBtn.type = "button";
    rootBtn.textContent = "Change Root";
    rootBtn.addEventListener("click", chooseRoot);
    bar.appendChild(rootBtn);
    const rootLine = document.createElement("span");
    rootLine.className = "mx-dim mx-browser-rootline";
    rootLine.textContent = "no root chosen";
    bar.appendChild(rootLine);
    st.rootLine = rootLine;
    wrap.appendChild(bar);

    const treeEl = document.createElement("ul");
    treeEl.className = "mx-browser-tree";
    st.treeEl = treeEl;
    wrap.appendChild(treeEl);

    frame.host.appendChild(wrap);
    frame.subscribe(["tree", "saved", "deleted", "moved", "renamed", "made", "tree_dirty"]);

    // exposed for onFrame below (closure over st via frame._browser)
    frame._browserApply = function (msg) {
      if (msg.type === "tree" && msg.data) {
        const data = msg.data;
        if (data.error) return;
        if (data.tag !== tag()) return;
        if (data.path === st.root) {
          const rootNode = st.nodeMap.get(st.root) || makeNode({ path: st.root, name: baseName(st.root), isDir: true }, null, 0);
          rootNode.path = st.root;
          rootNode.expanded = true;
          st.nodeMap.set(st.root, rootNode);
          applyEntries(rootNode, data.entries);
          renderRoot();
          return;
        }
        const node = st.nodeMap.get(data.path);
        if (!node) return;
        applyEntries(node, data.entries);
        node.expanded = true;
        if (node._chev) node._chev.textContent = "▾";
        if (node._ul) { node._ul.hidden = false; renderChildren(node); }
        return;
      }
      if (["saved", "deleted", "moved", "renamed", "made", "tree_dirty"].indexOf(msg.type) >= 0) {
        refreshAllLoaded();
      }
    };
  }

  MX.registerWidget("browser", {
    mount(frame) {
      ensureStyles();
      register(frame);
    },

    unmount(frame) {
      if (frame._browser && frame._browser.closeMenu) frame._browser.closeMenu();
      frame._browser = null;
      frame._browserApply = null;
      frame._browserHooks = null;
    },

    onFrame(frame, msg) {
      if (frame._browserApply) frame._browserApply(msg);
    },

    getOptions(frame) {
      return JSON.parse(JSON.stringify(frame.options));
    },
  });
})();
