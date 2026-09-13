// mermaid frame — chain-text pane under a drawn graph
//
// MX.mermaidFrame(host, opts) -> {set(index, ids, deep), clear(), el}.
// set() walks reachFrom per id, prints one deduped line per chain as
// "a --> b --> c", names in spans carrying MX.graphKindClass. Copy button
// puts the plain-text lines on the clipboard. Collapse toggle hides the
// pre and keeps state on el.dataset.collapsed.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function ensureStyles() {
    if (document.getElementById("mx-mermaid-style")) return;
    const style = document.createElement("style");
    style.id = "mx-mermaid-style";
    style.textContent = `
      :root {
        --mx-kind-file: #8895a8;
        --mx-kind-function: #58a6ff;
        --mx-kind-class: #3fb950;
        --mx-kind-css-rule: #a371f7;
        --mx-kind-element: #f0883e;
        --mx-kind-asset: #8b949e;
      }
      .mx-mermaid-bar { display: flex; align-items: center; gap: 6px;
        padding: 2px 6px; font-size: 11px; opacity: .8;
        border-bottom: 1px solid var(--border, #333); }
      .mx-mermaid-label { flex: 1 1 auto; }
      .mx-mermaid-btn { border: none; background: none; cursor: pointer;
        color: inherit; padding: 2px; display: flex; align-items: center; }
      .mx-mermaid-btn svg { width: 14px; height: 14px; }
      .mx-mermaid-btn.mx-mermaid-flash { color: #4caf50; }
      pre.mx-mermaid-pre { margin: 0; padding: 4px 6px; font-size: 11px;
        white-space: pre; overflow: auto; }
      pre.mx-mermaid-pre[hidden] { display: none; }
      pre.mx-mermaid-pre .kind-file { color: var(--mx-kind-file); }
      pre.mx-mermaid-pre .kind-function { color: var(--mx-kind-function); }
      pre.mx-mermaid-pre .kind-class { color: var(--mx-kind-class); }
      pre.mx-mermaid-pre .kind-css-rule { color: var(--mx-kind-css-rule); }
      pre.mx-mermaid-pre .kind-element { color: var(--mx-kind-element); }
      pre.mx-mermaid-pre .kind-asset { color: var(--mx-kind-asset); }
    `;
    document.head.appendChild(style);
  }

  // two overlapping rounded rects, 14px, no text
  const CLIP_SVG = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2">
    <rect x="1.5" y="3.5" width="8" height="9" rx="1"></rect>
    <rect x="4.5" y="0.5" width="8" height="9" rx="1"></rect>
  </svg>`;

  MX.mermaidFrame = function (host, opts) {
    opts = opts || {};
    ensureStyles();

    const el = document.createElement("div");
    el.className = "mx-mermaid";
    el.dataset.collapsed = opts.collapsed ? "true" : "false";

    const bar = document.createElement("div");
    bar.className = "mx-mermaid-bar";
    const label = document.createElement("span");
    label.className = "mx-mermaid-label";
    label.textContent = "mermaid";
    bar.appendChild(label);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "mx-mermaid-btn";
    copyBtn.title = "copy";
    copyBtn.innerHTML = CLIP_SVG;
    bar.appendChild(copyBtn);

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "mx-mermaid-btn";
    collapseBtn.title = "collapse";
    collapseBtn.textContent = "–";
    bar.appendChild(collapseBtn);

    el.appendChild(bar);

    const pre = document.createElement("pre");
    pre.className = "mx-mermaid-pre";
    pre.contentEditable = "false";
    el.appendChild(pre);

    let lastLines = [];

    function applyCollapsed() {
      pre.hidden = el.dataset.collapsed === "true";
    }
    applyCollapsed();

    collapseBtn.addEventListener("click", () => {
      el.dataset.collapsed = el.dataset.collapsed === "true" ? "false" : "true";
      applyCollapsed();
    });

    copyBtn.addEventListener("click", () => {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(lastLines.join("\n")).then(() => {
        copyBtn.classList.add("mx-mermaid-flash");
        setTimeout(() => copyBtn.classList.remove("mx-mermaid-flash"), 300);
      }).catch(() => {});
    });

    function clear() {
      pre.textContent = "";
      lastLines = [];
    }

    function set(index, ids, deep) {
      clear();
      if (!ids || !ids.length) return Promise.resolve();
      return MX.graphCore().then((core) => {
        const seen = new Set();
        for (const id of ids) {
          const { chains } = core.reachFrom(index, id, deep);
          for (const chain of chains) {
            const capped = chain.slice(0, core.CHAIN_CAP);
            const overflow = chain.length > core.CHAIN_CAP;
            const names = capped.map((nid) => {
              const node = index.byId.get(nid);
              return node ? node.name : nid;
            });
            const plain = names.join(" --> ") + (overflow ? " --> ..." : "");
            if (seen.has(plain)) continue;
            seen.add(plain);
            lastLines.push(plain);

            const line = document.createElement("div");
            capped.forEach((nid, i) => {
              if (i > 0) line.appendChild(document.createTextNode(" --> "));
              const node = index.byId.get(nid);
              const span = document.createElement("span");
              span.className = MX.graphKindClass(node || {});
              span.textContent = node ? node.name : nid;
              line.appendChild(span);
            });
            if (overflow) line.appendChild(document.createTextNode(" --> ..."));
            pre.appendChild(line);
          }
        }
      });
    }

    host.appendChild(el);

    return { set, clear, el };
  };
})();
