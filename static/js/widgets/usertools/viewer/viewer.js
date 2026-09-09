// viewer widget — renders a file by type. Path arrives either through the
// widget's own "path" option (browser's Open in Viewer, or hand-typed
// below) or the options panel, which already edits any string option.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];
  const VECTOR_EXT = ["svg"];
  const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];
  const VIDEO_EXT = ["mp4", "webm", "mov", "mkv", "avi"];

  const MARKED_URL = "https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js";
  // vendored mermaid 11.17.2 (pinned) ESM build, static/vendor/mermaid/dist/
  const MERMAID_URL = "/static/vendor/mermaid/dist/mermaid.esm.min.mjs";

  // scoped, self-contained styling — matrix.css belongs to another lane
  function ensureStyles() {
    if (document.getElementById("mx-viewer-style")) return;
    const style = document.createElement("style");
    style.id = "mx-viewer-style";
    style.textContent = `
      .mx-viewer { display: flex; flex-direction: column; height: 100%; font-size: 12px; }
      .mx-viewer-bar { display: flex; gap: 6px; padding: 4px 0; }
      .mx-viewer-bar input { flex: 1 1 auto; font: inherit; }
      .mx-viewer-tabs { display: flex; gap: 2px; overflow-x: auto; flex: 0 0 auto;
        border-bottom: 1px solid var(--border, #333); }
      .mx-viewer-tab { display: flex; align-items: center; gap: 4px; padding: 2px 6px;
        font-size: 11px; cursor: pointer; border: 1px solid var(--border, #333);
        border-bottom: none; color: var(--text-2, #aaa); white-space: nowrap; }
      .mx-viewer-tab.mx-viewer-on { background: var(--surface-2, #1c1c1c);
        color: var(--text-1, #ddd); }
      .mx-viewer-tab-x { border: none; background: none; color: inherit;
        cursor: pointer; font-size: 11px; padding: 0 2px; }
      .mx-viewer-body { flex: 1 1 auto; overflow: auto; position: relative; }
      .mx-viewer-image { max-width: 100%; max-height: 100%; }
      .mx-viewer-video { max-width: 100%; max-height: 100%; }
      .mx-viewer-pdf { width: 100%; height: 100%; border: 0; }
      .mx-viewer-html { width: 100%; height: 100%; border: 0; background: #fff; }
      .mx-viewer-markdown { padding: 6px; overflow: auto; }
      .mx-viewer-mermaid { padding: 6px; overflow: auto; }
      .mx-viewer-csv { border-collapse: collapse; font-size: 11px; }
      .mx-viewer-csv td, .mx-viewer-csv th {
        border: 1px solid var(--border, #383838); padding: 2px 6px;
      }
      .mx-viewer-csv th { background: var(--surface-2, #2a2a2a); }
    `;
    document.head.appendChild(style);
  }

  let _markedPromise = null;
  let _mermaidPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function ensureMarked() {
    if (window.marked) return Promise.resolve(window.marked);
    if (!_markedPromise) _markedPromise = loadScript(MARKED_URL).then(() => window.marked);
    return _markedPromise;
  }

  function ensureMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    // dynamic import(), not a <script> tag: mermaid's UMD bundle takes the
    // define.amd branch once Monaco's AMD loader has run, so window.mermaid
    // never populates; an ES module import never touches window.define
    if (!_mermaidPromise) _mermaidPromise = import(MERMAID_URL).then((mod) => {
      window.mermaid = mod.default;
      window.mermaid.initialize({ startOnLoad: false, theme: "dark" });
      console.log("mermaid loaded from vendored ESM build:", MERMAID_URL);
      return window.mermaid;
    });
    return _mermaidPromise;
  }

  function ext(path) {
    if (!path) return "";
    return String(path).split(".").pop().toLowerCase();
  }

  function rawUrl(path) {
    return "/api/fs/raw?path=" + encodeURIComponent(path);
  }

  function readText(path) {
    return fetch("/api/fs/read?path=" + encodeURIComponent(path))
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        return d.text;
      });
  }

  // minimal CSV parse: quoted fields, embedded commas and newlines
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0] === ""));
  }

  function csvTable(text) {
    const rows = parseCsv(text);
    const table = document.createElement("table");
    table.className = "mx-viewer-csv";
    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      r.forEach((cell) => {
        const td = document.createElement(i === 0 ? "th" : "td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    return table;
  }

  function kindFor(path) {
    const e = ext(path);
    if (IMAGE_EXT.indexOf(e) >= 0 || VECTOR_EXT.indexOf(e) >= 0) return "image";
    if (e === "pdf") return "pdf";
    if (AUDIO_EXT.indexOf(e) >= 0) return "audio";
    if (VIDEO_EXT.indexOf(e) >= 0) return "video";
    if (e === "html" || e === "htm") return "html";
    if (e === "md" || e === "markdown") return "markdown";
    if (e === "mmd" || e === "mermaid") return "mermaid";
    if (e === "csv") return "csv";
    if (e === "json" || e === "jsonl") return "json";
    return "code";
  }

  function register(frame) {
    const st = frame._viewer = { monaco: null, seq: 0, tabs: [] };

    const wrap = document.createElement("div");
    wrap.className = "mx-viewer";

    const bar = document.createElement("div");
    bar.className = "mx-viewer-bar";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "file path";
    input.value = frame.options.path || "";
    const openBtn = document.createElement("button");
    openBtn.className = "mx-btn";
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => {
      fetch("/api/fs/pick?kind=file").then((r) => r.json()).then((d) => {
        if (d && d.path) { input.value = d.path; openTab(d.path); }
      }).catch(() => {});
    });
    bar.appendChild(input);
    bar.appendChild(openBtn);
    wrap.appendChild(bar);

    const tabBar = document.createElement("div");
    tabBar.className = "mx-viewer-tabs";
    wrap.appendChild(tabBar);

    const body = document.createElement("div");
    body.className = "mx-viewer-body";
    wrap.appendChild(body);

    frame.host.appendChild(wrap);
    st.input = input;
    st.body = body;
    st.tabBar = tabBar;

    // one tab per open file; the active tab is the widget's path option
    function openTab(path) {
      if (!path) return;
      if (st.tabs.indexOf(path) < 0) st.tabs.push(path);
      frame.setOption("path", path);
      renderTabs();
    }

    function closeTab(path) {
      const i = st.tabs.indexOf(path);
      if (i < 0) return;
      st.tabs.splice(i, 1);
      if (frame.options.path === path) {
        frame.setOption("path", st.tabs.length ? st.tabs[Math.max(0, i - 1)] : "");
      }
      renderTabs();
    }

    function renderTabs() {
      tabBar.textContent = "";
      for (const path of st.tabs) {
        const el = document.createElement("div");
        el.className = "mx-viewer-tab"
          + (path === frame.options.path ? " mx-viewer-on" : "");
        const label = document.createElement("span");
        label.textContent = path.split("/").pop() || path;
        label.title = path;
        el.appendChild(label);
        const x = document.createElement("button");
        x.type = "button";
        x.className = "mx-viewer-tab-x";
        x.textContent = "×";
        x.addEventListener("click", (ev) => { ev.stopPropagation(); closeTab(path); });
        el.appendChild(x);
        el.addEventListener("click", () => openTab(path));
        tabBar.appendChild(el);
      }
    }

    st.openTab = openTab;
    st.renderTabs = renderTabs;

    // drop target — file browser rows carry the path as application/x-mx-path
    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    body.addEventListener("drop", (e) => {
      e.preventDefault();
      const path = e.dataTransfer.getData("application/x-mx-path")
        || e.dataTransfer.getData("text/plain");
      if (path) openTab(path);
    });

    function clearBody() {
      if (st.monaco) { try { st.monaco.dispose(); } catch (e) { /* already gone */ } st.monaco = null; }
      body.textContent = "";
    }

    function showError(msg) {
      clearBody();
      const d = document.createElement("div");
      d.className = "mx-dim";
      d.textContent = String(msg);
      body.appendChild(d);
    }

    function render(path) {
      if (!path) { clearBody(); return; }
      const mySeq = ++st.seq;
      const stale = () => mySeq !== st.seq;
      clearBody();
      const kind = kindFor(path);

      if (kind === "image") {
        const img = document.createElement("img");
        img.className = "mx-viewer-image";
        img.src = rawUrl(path);
        body.appendChild(img);
        return;
      }
      if (kind === "pdf") {
        const embed = document.createElement("embed");
        embed.className = "mx-viewer-pdf";
        embed.src = rawUrl(path);
        embed.type = "application/pdf";
        body.appendChild(embed);
        return;
      }
      if (kind === "audio") {
        const a = document.createElement("audio");
        a.controls = true;
        a.src = rawUrl(path);
        body.appendChild(a);
        return;
      }
      if (kind === "video") {
        const v = document.createElement("video");
        v.controls = true;
        v.className = "mx-viewer-video";
        v.src = rawUrl(path);
        body.appendChild(v);
        return;
      }
      if (kind === "html") {
        readText(path).then((text) => {
          if (stale()) return;
          const frameEl = document.createElement("iframe");
          frameEl.className = "mx-viewer-html";
          frameEl.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";
          body.appendChild(frameEl);
          frameEl.srcdoc = text;
        }).catch((e) => !stale() && showError(e));
        return;
      }
      if (kind === "markdown") {
        Promise.all([readText(path), ensureMarked()]).then(([text, marked]) => {
          if (stale()) return;
          const div = document.createElement("div");
          div.className = "mx-viewer-markdown";
          const toHtml = marked.parse || marked;
          const html = toHtml(text);
          div.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
          body.appendChild(div);
        }).catch((e) => !stale() && showError(e));
        return;
      }
      if (kind === "mermaid") {
        Promise.all([readText(path), ensureMermaid()]).then(([text, mermaid]) => {
          if (stale()) return;
          const div = document.createElement("div");
          div.className = "mx-viewer-mermaid";
          body.appendChild(div);
          const id = "mx-mmd-" + Date.now().toString(36);
          mermaid.render(id, text).then((res) => { if (!stale()) div.innerHTML = res.svg; });
        }).catch((e) => !stale() && showError(e));
        return;
      }
      if (kind === "csv") {
        readText(path).then((text) => {
          if (stale()) return;
          body.appendChild(csvTable(text));
        }).catch((e) => !stale() && showError(e));
        return;
      }
      if (kind === "json") {
        readText(path).then((text) => {
          if (stale()) return;
          let pretty = text;
          try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* show raw */ }
          return MX.mountReadonlyMonaco(body, { value: pretty, language: "json" });
        }).then((mon) => { if (mon && !stale()) st.monaco = mon; else if (mon) mon.dispose(); })
          .catch((e) => !stale() && showError(e));
        return;
      }
      // code and plain text
      readText(path).then((text) => {
        if (stale()) return;
        return MX.mountReadonlyMonaco(body, { value: text, path: path });
      }).then((mon) => { if (mon && !stale()) st.monaco = mon; else if (mon) mon.dispose(); })
        .catch((e) => !stale() && showError(e));
    }

    frame._viewerRender = render;
    // tab state rides the grid, so a restored window comes back with its tabs
    for (const path of (frame.options.tabs || [])) {
      if (path && st.tabs.indexOf(path) < 0) st.tabs.push(path);
    }
    if (frame.options.path && st.tabs.indexOf(frame.options.path) < 0) {
      st.tabs.push(frame.options.path);
    }
    renderTabs();
    if (frame.options.path) render(frame.options.path);
  }

  MX.registerWidget("viewer", {
    mount(frame) {
      ensureStyles();
      register(frame);
      // the browser widget's Open in Viewer adds a tab here
      frame.openTab = (path) => {
        if (frame._viewer && frame._viewer.openTab) frame._viewer.openTab(path);
      };
    },

    unmount(frame) {
      if (frame._viewer && frame._viewer.monaco) {
        try { frame._viewer.monaco.dispose(); } catch (e) { /* already gone */ }
      }
      frame._viewer = null;
      frame._viewerRender = null;
      frame.openTab = null;
    },

    onOption(frame, key, value) {
      if (key !== "path") return;
      const st = frame._viewer;
      if (st) {
        if (st.input) st.input.value = value || "";
        if (value && st.tabs.indexOf(value) < 0) st.tabs.push(value);
        if (st.renderTabs) st.renderTabs();
      }
      if (frame._viewerRender) frame._viewerRender(value);
    },

    onFrame() {},

    getOptions(frame) {
      const st = frame._viewer;
      return {
        path: frame.options.path || "",
        tabs: st ? st.tabs.slice() : (frame.options.tabs || []).slice(),
      };
    },
  });
})();
