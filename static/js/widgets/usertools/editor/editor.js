// editor widget — one Monaco instance per frame, one model per tab
//
// Frames: "open" (ask for a file, carries this instance id), "file" (the
// content, echoing that id), "save" (path and content to the server), "saved"
// (the server's gate outcome, echoing the id).
//
// State: the server owns every write. There is no local file write and no save
// dialog. A refused save leaves the tab dirty with the reason on the bar.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function ensureEditorStyles() {
    if (document.getElementById("mxed-style")) return;
    const style = document.createElement("style");
    style.id = "mxed-style";
    style.textContent = `
      .mxed-wrap { display: flex; flex-direction: column; height: 100%; }
      .mxed-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; }
      .mxed-path { flex: 1 1 auto; font-size: 11px; color: var(--text-2, #aaa);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mxed-status { font-size: 11px; color: var(--text-3, #888); min-width: 3em; text-align: right; }
      .mxed-tabs { display: flex; gap: 2px; padding: 2px 6px; flex: 0 0 auto;
        overflow-x: auto; border-bottom: 1px solid var(--border, #333); }
      .mxed-tab { display: flex; align-items: center; gap: 4px; padding: 2px 6px;
        font-size: 11px; cursor: pointer; border: 1px solid var(--border, #333);
        border-bottom: none; color: var(--text-2, #aaa); white-space: nowrap; }
      .mxed-tab.mxed-on { background: var(--surface-2, #1c1c1c); color: var(--text-1, #ddd); }
      .mxed-tab.mxed-dirty span:first-child::after { content: " •"; }
      .mxed-tab-x { border: none; background: none; color: inherit; cursor: pointer;
        font-size: 11px; padding: 0 2px; }
      .mxed-body { flex: 1 1 auto; display: flex; min-height: 0; }
      .mxed-monaco { flex: 1 1 100%; min-width: 0; }
      .mxed-split .mxed-monaco { flex: 1 1 50%; }
      .mxed-preview { flex: 1 1 50%; min-width: 0; overflow: auto; padding: 8px 12px;
        border-left: 1px solid var(--border, #333); color: var(--text-1, #ddd); }
      .mxed-preview pre.mxed-code { background: var(--surface-2, #1c1c1c); padding: 8px;
        overflow: auto; }
      .mxed-diff { max-height: 40vh; overflow: auto; font-size: 11px;
        background: var(--surface-2, #1c1c1c); padding: 6px; white-space: pre-wrap; }
    `;
    document.head.appendChild(style);
  }

  function mkBtn(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mx-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function basename(path) {
    if (!path) return "(new file)";
    const parts = String(path).replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || path;
  }

  function renderMarkdown(src) {
    const raw = (window.marked && typeof window.marked.parse === "function")
      ? window.marked.parse(String(src || ""))
      : "<pre class=\"mxed-code\">" + escapeHtml(src) + "</pre>";
    return (window.DOMPurify && typeof window.DOMPurify.sanitize === "function")
      ? window.DOMPurify.sanitize(raw)
      : raw;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // line diff, capped — shown in the unsaved-changes modal
  const DIFF_MAX_LINES = 800;

  function lineDiff(oldText, newText) {
    const A = String(oldText || "").split("\n");
    const B = String(newText || "").split("\n");
    const n = A.length, m = B.length;
    if (n > DIFF_MAX_LINES || m > DIFF_MAX_LINES) {
      return [`(too large to diff: ${n} -> ${m} lines)`];
    }
    const W = m + 1;
    const L = new Uint16Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1
          : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { i++; j++; }
      else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) out.push("- " + A[i++]);
      else out.push("+ " + B[j++]);
    }
    while (i < n) out.push("- " + A[i++]);
    while (j < m) out.push("+ " + B[j++]);
    return out.length ? out : ["(no line changes)"];
  }

  function setStatus(ed, text, sticky) {
    if (!ed.statusEl) return;
    ed.statusEl.textContent = text;
    if (text && !sticky) {
      setTimeout(() => { if (ed.statusEl) ed.statusEl.textContent = ""; }, 2500);
    }
  }

  function activeTab(frame) {
    const ed = frame._editor;
    if (!ed) return null;
    return ed.tabs.find((t) => t.key === ed.active) || null;
  }

  function isDirty(tab) {
    if (!tab || !tab.model) return false;
    return tab.model.getValue() !== tab.saved;
  }

  function togglePreview(frame, forceVal) {
    const ed = frame._editor;
    if (!ed || !ed.editor) return;
    const val = typeof forceVal === "boolean" ? forceVal : !ed.showPreview;
    ed.showPreview = val;
    ed.previewEl.hidden = !val;
    ed.body.classList.toggle("mxed-split", val);
    if (val) ed.previewEl.innerHTML = renderMarkdown(ed.editor.getValue());
    try { ed.editor.layout(); } catch (e) { /* layout best effort */ }
  }

  // one Monaco loader for the page: Job 8's shared module
  function createInstance(frame, tries) {
    tries = tries || 0;
    const ed = frame._editor;
    if (!ed || !ed.live) return;
    if (!document.body.contains(ed.host)) {
      if (tries < 30) requestAnimationFrame(() => createInstance(frame, tries + 1));
      return;
    }
    MX.monacoReady().then((monaco) => {
      if (!ed.live || ed.editor) return;
      ed.monaco = monaco;
      const editor = monaco.editor.create(ed.host, {
        value: "",
        language: "plaintext",
        theme: "vs-dark",
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        wordWrap: "on",
      });
      ed.editor = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => doSave(frame));
      editor.onDidChangeModelContent(() => {
        if (ed.showPreview) ed.previewEl.innerHTML = renderMarkdown(editor.getValue());
        renderTabs(frame);
      });
      for (const tab of ed.tabs) attachModel(frame, tab);
      showTab(frame, ed.active);
    }).catch(() => { ed.host.textContent = "[editor: monaco failed]"; });
  }

  function attachModel(frame, tab) {
    const ed = frame._editor;
    if (!ed || !ed.monaco || tab.model) return;
    const lang = MX.monacoLanguageFromPath(tab.path);
    tab.model = ed.monaco.editor.createModel(tab.text || "", lang);
  }

  function showTab(frame, key) {
    const ed = frame._editor;
    if (!ed) return;
    ed.active = key;
    const tab = activeTab(frame);
    if (tab) {
      attachModel(frame, tab);
      if (ed.editor && tab.model) ed.editor.setModel(tab.model);
      ed.pathEl.textContent = tab.path || "(new file)";
      const md = MX.monacoLanguageFromPath(tab.path) === "markdown";
      ed.previewBtn.disabled = !md;
      if (!md && ed.showPreview) togglePreview(frame, false);
    } else {
      ed.pathEl.textContent = "no file open";
      ed.previewBtn.disabled = true;
    }
    renderTabs(frame);
  }

  function openTab(frame, path, text) {
    const ed = frame._editor;
    if (!ed) return null;
    const existing = ed.tabs.find((t) => t.path && t.path === path);
    if (existing) {
      existing.text = text || "";
      existing.saved = existing.text;
      if (existing.model) existing.model.setValue(existing.text);
      showTab(frame, existing.key);
      return existing;
    }
    ed.seq += 1;
    const tab = {
      key: frame.id + "-t" + ed.seq,
      path: path || "",
      text: text || "",
      saved: text || "",
      model: null,
    };
    ed.tabs.push(tab);
    attachModel(frame, tab);
    showTab(frame, tab.key);
    return tab;
  }

  function closeTab(frame, key) {
    const ed = frame._editor;
    if (!ed) return Promise.resolve(false);
    const i = ed.tabs.findIndex((t) => t.key === key);
    if (i < 0) return Promise.resolve(false);
    const tab = ed.tabs[i];
    const finish = () => {
      if (tab.model) { try { tab.model.dispose(); } catch (e) { /* teardown best effort */ } }
      ed.tabs.splice(i, 1);
      if (ed.active === key) {
        ed.active = ed.tabs.length ? ed.tabs[Math.max(0, i - 1)].key : null;
      }
      showTab(frame, ed.active);
      return true;
    };
    if (!isDirty(tab)) return Promise.resolve(finish());
    return unsavedModal(frame, tab).then((choice) => {
      if (choice === "cancel") return false;
      if (choice === "save") return saveTab(frame, tab).then((ok) => (ok ? finish() : false));
      return finish();
    });
  }

  function renderTabs(frame) {
    const ed = frame._editor;
    if (!ed) return;
    ed.tabBar.textContent = "";
    for (const tab of ed.tabs) {
      const el = document.createElement("div");
      el.className = "mxed-tab" + (tab.key === ed.active ? " mxed-on" : "")
        + (isDirty(tab) ? " mxed-dirty" : "");
      const label = document.createElement("span");
      label.textContent = basename(tab.path);
      label.title = tab.path || "(new file)";
      el.appendChild(label);
      const x = document.createElement("button");
      x.type = "button";
      x.className = "mxed-tab-x";
      x.textContent = "×";
      x.addEventListener("click", (ev) => { ev.stopPropagation(); closeTab(frame, tab.key); });
      el.appendChild(x);
      el.addEventListener("click", () => showTab(frame, tab.key));
      ed.tabBar.appendChild(el);
    }
  }

  // the server checks the gate, writes or refuses, and answers
  function saveTab(frame, tab) {
    const ed = frame._editor;
    if (!ed || !tab) return Promise.resolve(false);
    const content = tab.model ? tab.model.getValue() : tab.text;
    if (!tab.path) {
      return MX.ui.askText("Save as", "path", "").then((path) => {
        if (!path) return false;
        tab.path = path;
        return sendSave(frame, tab, content);
      });
    }
    return sendSave(frame, tab, content);
  }

  function sendSave(frame, tab, content) {
    const ed = frame._editor;
    return new Promise((resolve) => {
      ed.pending[tab.path] = { tab: tab, content: content, resolve: resolve };
      setStatus(ed, "saving…", true);
      frame.send({ type: "save", path: tab.path, content: content, inst: frame.id });
    });
  }

  function doSave(frame) {
    const tab = activeTab(frame);
    if (tab) saveTab(frame, tab);
  }

  function unsavedModal(frame, tab) {
    const content = tab.model ? tab.model.getValue() : tab.text;
    const body = document.createElement("div");
    const pre = document.createElement("pre");
    pre.className = "mxed-diff";
    pre.textContent = lineDiff(tab.saved, content).join("\n");
    body.appendChild(pre);
    return MX.ui.choose("Unsaved changes",
      (tab.path || "This file") + " has unsaved changes.", [
        { label: "Save", value: "save", cls: "mx-go" },
        { label: "Discard", value: "discard" },
        { label: "Cancel", value: "cancel" },
      ], body);
  }

  MX.registerWidget("editor", {
    mount(frame) {
      ensureEditorStyles();

      const ed = frame._editor = {
        editor: null, monaco: null, live: true, seq: 0,
        tabs: [], active: null, pending: Object.create(null),
        showPreview: !!frame.options.showPreview,
        host: null, previewEl: null, statusEl: null, pathEl: null,
        previewBtn: null, body: null, tabBar: null,
      };

      const wrap = document.createElement("div");
      wrap.className = "mxed-wrap";

      const bar = document.createElement("div");
      bar.className = "mxed-bar";
      const pathLbl = document.createElement("span");
      pathLbl.className = "mxed-path";
      pathLbl.textContent = "no file open";
      ed.pathEl = pathLbl;

      const btnNew = mkBtn("New", () => openTab(frame, "", ""));
      const btnOpen = mkBtn("Open", () => {
        MX.ui.askText("Open file", "path", "").then((path) => {
          if (path) frame.send({ type: "open", path: path, inst: frame.id });
        });
      });
      const btnSave = mkBtn("Save", () => doSave(frame));
      const btnPreview = mkBtn("Preview", () => togglePreview(frame));
      btnPreview.disabled = true;
      ed.previewBtn = btnPreview;

      const status = document.createElement("span");
      status.className = "mxed-status";
      ed.statusEl = status;

      bar.appendChild(btnNew);
      bar.appendChild(btnOpen);
      bar.appendChild(pathLbl);
      bar.appendChild(btnSave);
      bar.appendChild(btnPreview);
      bar.appendChild(status);
      wrap.appendChild(bar);

      ed.tabBar = document.createElement("div");
      ed.tabBar.className = "mxed-tabs";
      wrap.appendChild(ed.tabBar);

      const body = document.createElement("div");
      body.className = "mxed-body";
      ed.body = body;
      const editorHost = document.createElement("div");
      editorHost.className = "mxed-monaco";
      const previewHost = document.createElement("div");
      previewHost.className = "mxed-preview";
      previewHost.hidden = true;
      body.appendChild(editorHost);
      body.appendChild(previewHost);
      wrap.appendChild(body);

      frame.host.appendChild(wrap);
      ed.host = editorHost;
      ed.previewEl = previewHost;

      // tab state rides the grid; each restored tab reloads from the server
      for (const saved of (frame.options.tabs || [])) {
        if (!saved || !saved.path) continue;
        ed.seq += 1;
        ed.tabs.push({
          key: saved.key || (frame.id + "-t" + ed.seq),
          path: saved.path, text: "", saved: "", model: null,
        });
      }
      ed.active = frame.options.active || (ed.tabs.length ? ed.tabs[0].key : null);

      frame.subscribe(["file", "saved"]);
      renderTabs(frame);
      requestAnimationFrame(() => createInstance(frame));
      for (const tab of ed.tabs) {
        frame.send({ type: "open", path: tab.path, inst: frame.id });
      }
    },

    // the grid asks before removing: a dirty tab gets Save, Discard, Cancel
    canClose(frame) {
      const ed = frame._editor;
      if (!ed) return true;
      const dirty = ed.tabs.filter(isDirty);
      if (!dirty.length) return true;
      const step = (i) => {
        if (i >= dirty.length) return Promise.resolve(true);
        return unsavedModal(frame, dirty[i]).then((choice) => {
          if (choice === "cancel") return false;
          if (choice === "discard") return step(i + 1);
          return saveTab(frame, dirty[i]).then((ok) => (ok ? step(i + 1) : false));
        });
      };
      return step(0);
    },

    unmount(frame) {
      const ed = frame._editor;
      if (!ed) return;
      ed.live = false;
      for (const tab of ed.tabs) {
        if (tab.model) { try { tab.model.dispose(); } catch (e) { /* teardown best effort */ } }
      }
      if (ed.editor) { try { ed.editor.dispose(); } catch (e) { /* teardown best effort */ } }
      frame._editor = null;
    },

    onFrame(frame, msg) {
      const ed = frame._editor;
      if (!ed) return;
      if (msg.inst && msg.inst !== frame.id) return;

      if (msg.type === "file") {
        if (!msg.inst) return;
        openTab(frame, msg.path || "", msg.content || "");
        setStatus(ed, "");
        return;
      }

      if (msg.type === "saved") {
        const rec = ed.pending[msg.path];
        const denied = msg.ok === false || (typeof msg.result === "string"
          && (msg.result.startsWith("[save denied")
              || msg.result.startsWith("[WRITE refused")
              || msg.result.startsWith("[WRITE failed")));
        if (rec) {
          delete ed.pending[msg.path];
          if (!denied) {
            rec.tab.saved = rec.content;
            rec.tab.text = rec.content;
          }
          rec.resolve(!denied);
        }
        setStatus(ed, denied ? (msg.result || "refused") : "saved", denied);
        renderTabs(frame);
        // a Save-As sets tab.path on a previously-untitled tab; showTab
        // redraws the path label and the Preview button's markdown check
        if (rec && !denied && ed.active === rec.tab.key) showTab(frame, rec.tab.key);
      }
    },

    onOption(frame, key, value) {
      if (key === "showPreview") togglePreview(frame, !!value);
    },

    getOptions(frame) {
      const ed = frame._editor;
      if (!ed) return JSON.parse(JSON.stringify(frame.options));
      return {
        showPreview: !!ed.showPreview,
        tabs: ed.tabs.filter((t) => t.path).map((t) => ({ key: t.key, path: t.path })),
        active: ed.active || "",
      };
    },
  });
})();
