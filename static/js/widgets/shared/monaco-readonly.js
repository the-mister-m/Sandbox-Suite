// read-only Monaco path — shared mount, exported for Job 6 and Job 7
//
// One AMD load of the vendored Monaco build, memoized. Every mount after
// the first reuses the same monaco global. Instances are read-only, dark
// theme, syntax colored from the file extension.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const VS_BASE = "/static/vendor/monaco/vs";
  let _readyPromise = null;

  function loadLoaderScript() {
    return new Promise((resolve, reject) => {
      if (window.require && window.require.config) { resolve(); return; }
      const s = document.createElement("script");
      s.src = VS_BASE + "/loader.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("monaco loader.js failed to load"));
      document.head.appendChild(s);
    });
  }

  function loadEditorCss() {
    if (document.getElementById("mx-monaco-css")) return;
    const link = document.createElement("link");
    link.id = "mx-monaco-css";
    link.rel = "stylesheet";
    link.href = VS_BASE + "/editor/editor.main.css";
    document.head.appendChild(link);
  }

  function ready() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = loadLoaderScript().then(() => new Promise((resolve, reject) => {
      loadEditorCss();
      if (window.monaco) { resolve(window.monaco); return; }
      try {
        self.MonacoEnvironment = {
          getWorkerUrl: function () {
            const base = location.origin + "/static/vendor/monaco/";
            return "data:text/javascript;charset=utf-8," + encodeURIComponent(
              "self.MonacoEnvironment = { baseUrl: '" + base + "' };\n" +
              "importScripts('" + base + "vs/base/worker/workerMain.js');"
            );
          },
        };
        window.require.config({ paths: { vs: VS_BASE } });
        window.require(["vs/editor/editor.main"], () => resolve(window.monaco), reject);
      } catch (e) { reject(e); }
    }));
    return _readyPromise;
  }

  // extension -> Monaco language id
  const EXT_LANG = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", py: "python", html: "html", htm: "html",
    css: "css", scss: "scss", less: "less", json: "json", jsonl: "json",
    md: "markdown", markdown: "markdown", sh: "shell", bash: "shell", zsh: "shell",
    yml: "yaml", yaml: "yaml", txt: "plaintext", rs: "rust", go: "go",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", java: "java", rb: "ruby",
    php: "php", sql: "sql", xml: "xml", toml: "ini", ini: "ini",
    swift: "swift", kt: "kotlin", cs: "csharp", lua: "lua", pl: "perl", r: "r",
  };

  // the page's one Monaco loader; the editor widget mounts writable from it
  MX.monacoReady = ready;

  MX.monacoLanguageFromPath = function (path) {
    if (!path) return "plaintext";
    const ext = String(path).split(".").pop().toLowerCase();
    return EXT_LANG[ext] || "plaintext";
  };

  // host: element to mount into. opts: { value, language, path }.
  // resolves { editor, setValue(text), setLanguage(lang), layout(), dispose() }
  MX.mountReadonlyMonaco = function (host, opts) {
    opts = opts || {};
    return ready().then((monaco) => {
      const editor = monaco.editor.create(host, {
        value: opts.value || "",
        language: opts.language || MX.monacoLanguageFromPath(opts.path),
        readOnly: true,
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
      });
      return {
        editor: editor,
        setValue(text) { editor.setValue(text || ""); },
        setLanguage(lang) {
          const model = editor.getModel();
          if (model) monaco.editor.setModelLanguage(model, lang);
        },
        layout() { editor.layout(); },
        dispose() { editor.dispose(); },
      };
    });
  };
})();
