// shared root browser — filesystem picker modal
//
// MX.openRootBrowser(start, commit, opts). start: path to open the browser
// at. commit(path) fires on Select (folder mode) or on a file click when
// opts.ext is set. opts.ext lists files with that extension and commits on
// click; without it the picker shows folders only and commits via Select.
// opts.ext takes a string or an array of strings.
// Moved from devagent.js as is; CSS id becomes mx-root-browser-css, class
// names stay the same.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const ROOT_CSS_ID = "mx-root-browser-css";
  const ROOT_CSS = `
.dv-rootmodal{ position:fixed; inset:0; z-index:600; display:none;
  align-items:center; justify-content:center; background:rgba(6,6,6,.7); }
.dv-rootmodal.show{ display:flex; }
.dv-rootmodal .dv-rootbox{ width:min(640px, 92vw); max-height:82vh; overflow-y:auto;
  background:var(--surface-1); border:1px solid var(--border-2); border-radius:10px;
  padding:18px 20px; box-shadow:0 24px 70px rgba(0,0,0,.7); }
.dv-rootmodal .dv-roothead{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.dv-rootmodal .dv-roothead h3{ margin:0; font-size:14px; color:var(--text-1); }
.dv-rootmodal .dv-rootx{ flex:0 0 auto; width:24px; height:24px; padding:0; font-size:15px; line-height:1;
  background:var(--surface-2); border:1px solid var(--border); border-radius:5px;
  color:var(--text-3); cursor:pointer; }
.dv-rootmodal .dv-rootsub{ font-size:11px; color:var(--text-4); line-height:1.5; margin:6px 0 14px; }
.dv-rootmodal .dv-rootbtn{ padding:4px 9px; font-size:10.5px; font-weight:500;
  background:var(--surface-2); border:1px solid var(--border); border-radius:5px;
  color:var(--text-2); cursor:pointer; }
.dv-rootmodal .dv-rootbtnrow{ display:flex; align-items:center; gap:8px; margin:4px 0; }
.dv-rootmodal .dv-rootscope{ font-family:var(--mono); font-size:9.5px; color:var(--text-4); flex:0 0 auto; }
.dv-rootmodal .dv-rootpath{ font-size:11px; color:var(--text-2); background:var(--deep);
  border:1px solid var(--gridline); border-radius:5px; padding:6px 8px;
  margin-bottom:8px; overflow-x:auto; white-space:nowrap; font-family:var(--mono); }
.dv-rootmodal .dv-rootlist{ max-height:240px; overflow-y:auto; background:var(--deep);
  border:1px solid var(--gridline); border-radius:6px; padding:4px; margin-bottom:10px; }
.dv-rootmodal .dv-rootitem{ padding:5px 8px; font-size:11.5px; font-family:var(--mono);
  color:var(--text-2); border-radius:4px; cursor:pointer; }
.dv-rootmodal .dv-rootitem:hover{ background:var(--surface-3); color:var(--text-1); }

.dv-rootmodal .dv-rootfile{ border-left:2px solid var(--border-2); }

.mx-dev-rootfield{ display:inline-flex; align-items:center; gap:4px; min-width:0; }
.mx-dev-rootfield input{ min-width:0; flex:1 1 auto; }
.mx-dev-rootfield input:disabled{ color:var(--text-4); font-style:italic; opacity:.75; }
`;

  function ensureRootCss() {
    if (document.getElementById(ROOT_CSS_ID)) return;
    const style = document.createElement("style");
    style.id = ROOT_CSS_ID;
    style.textContent = ROOT_CSS;
    document.head.appendChild(style);
  }
  ensureRootCss();

  // filesystem picker; commit takes the chosen path, opens at start.
  // opts.ext lists files with that extension and commits on click —
  // without it the picker shows folders only and commits via Select.
  MX.openRootBrowser = function (start, commit, opts) {
    opts = opts || {};
    // ext: one extension or a list. extList is the lowercased list, empty
    // in folder mode. extLabel is what the modal text shows.
    const extList = (opts.ext === undefined || opts.ext === null || opts.ext === "")
      ? []
      : (Array.isArray(opts.ext) ? opts.ext : [opts.ext]).map((e) => String(e).toLowerCase());
    const extLabel = extList.join(" or ");
    ensureRootCss();
    const stale = document.querySelector(".dv-rootmodal");
    if (stale) stale.remove();

    const ov = el("div", "dv-rootmodal");
    const box = el("div", "dv-rootbox");
    const head = el("div", "dv-roothead");
    const h3 = el("h3", null, extList.length ? "Pick a " + extLabel + " file" : "Agent root");
    head.appendChild(h3);
    const closeBtn = el("button", "dv-rootx", "×");
    closeBtn.type = "button";
    head.appendChild(closeBtn);
    box.appendChild(head);
    const sub = el("div", "dv-rootsub", extList.length
      ? "Browse the filesystem and click a " + extLabel + " file. The path is "
        + "copied into the field — nothing else changes."
      : "Browse the filesystem and pick a folder. Select copies the path into "
        + "root — nothing else changes; the server still validates it on submit.");
    box.appendChild(sub);
    const body = el("div", "dv-rootbody");
    box.appendChild(body);
    ov.appendChild(box);
    document.body.appendChild(ov);

    const pathLine = el("div", "dv-rootpath");
    const listBox = el("div", "dv-rootlist");
    const selectRow = el("div", "dv-rootbtnrow");
    const selectBtn = el("button", "dv-rootbtn", "Select");
    selectBtn.type = "button";
    // in file mode the click on a file is the commit, so Select has no job
    if (!extList.length) selectRow.appendChild(selectBtn);
    body.appendChild(pathLine);
    body.appendChild(listBox);
    body.appendChild(selectRow);

    let browsePath = start || "/";
    const parentOf = (p) => {
      const trimmed = p.replace(/\/+$/, "");
      const idx = trimmed.lastIndexOf("/");
      return idx > 0 ? trimmed.slice(0, idx) : "/";
    };
    const joinPath = (base, name) => (base === "/" ? "/" + name : base + "/" + name);

    function scopeLine(text) { return el("div", "dv-rootscope", text); }

    function loadDirs(path) {
      pathLine.textContent = path;
      listBox.innerHTML = "";
      listBox.appendChild(scopeLine("loading…"));
      fetch("/api/fs/browse?path=" + encodeURIComponent(path))
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            listBox.innerHTML = "";
            listBox.appendChild(scopeLine(data.error));
            return;
          }
          browsePath = data.path || path;
          pathLine.textContent = browsePath;
          listBox.innerHTML = "";
          if (browsePath !== "/") {
            const up = el("div", "dv-rootitem", ".. (up one level)");
            up.addEventListener("click", () => loadDirs(parentOf(browsePath)));
            listBox.appendChild(up);
          }
          const dirs = Array.isArray(data.dirs) ? data.dirs : [];
          const files = extList.length
            ? (Array.isArray(data.files) ? data.files : [])
              .filter((n) => extList.some((e) => n.toLowerCase().endsWith(e)))
            : [];
          if (!dirs.length && !files.length) {
            listBox.appendChild(scopeLine(extList.length ? "nothing here" : "no subfolders"));
          }
          for (const name of dirs) {
            const item = el("div", "dv-rootitem", name);
            item.addEventListener("click", () => loadDirs(joinPath(browsePath, name)));
            listBox.appendChild(item);
          }
          for (const name of files) {
            const item = el("div", "dv-rootitem dv-rootfile", name);
            item.addEventListener("click", () => { commit(joinPath(browsePath, name)); close(); });
            listBox.appendChild(item);
          }
        })
        .catch(() => {
          listBox.innerHTML = "";
          listBox.appendChild(scopeLine("browse failed"));
        });
    }

    let onKey = null;
    function close() {
      ov.classList.remove("show");
      if (onKey) { document.removeEventListener("keydown", onKey); onKey = null; }
      ov.remove();
    }
    onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    closeBtn.addEventListener("click", close);
    selectBtn.addEventListener("click", () => { commit(browsePath); close(); });

    loadDirs(browsePath);
    ov.classList.add("show");
  };
})();
