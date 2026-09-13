// matrix window — boot, binding, and the two corner buttons

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const gridEl = document.getElementById("mxGrid");
  const blankEl = document.getElementById("mxBlank");
  const stateEl = document.getElementById("mxState");
  const cornersEl = document.getElementById("mxCorners");

  function sidFromPath() {
    const m = window.location.pathname.match(/^\/matrix\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function surfaceFromQuery() {
    return new URLSearchParams(window.location.search).get("s");
  }

  function replaceUrl(sid, surfaceId) {
    if (!(window.history && window.history.replaceState)) return;
    window.history.replaceState(null, "",
      `/matrix/${encodeURIComponent(sid)}?s=${encodeURIComponent(surfaceId)}`);
  }
  // shared with session-panel.js, which also adopts and opens surfaces
  MX.replaceMatrixUrl = replaceUrl;

  function showBlank(show) {
    blankEl.style.display = show ? "flex" : "none";
    gridEl.style.display = show ? "none" : "grid";
    cornersEl.style.display = show ? "none" : "flex";
  }

  // corner line — state, session id, surface name, and unsaved if the last save failed
  MX.setSurfaceState = function () {
    const state = MX.socket.state();
    stateEl.className = state === "live" ? "mx-live"
      : (state === "closed" || state === "refused") ? "mx-gone" : "";
    const sid = MX.socket.sid();
    const name = (MX.grid && MX.grid.surfaceName) || MX.WINDOW_ID || "";
    const unsaved = MX.grid && MX.grid.saveFailed ? " · unsaved" : "";
    stateEl.textContent = `${state}${sid ? " · " + sid : ""} · ${name}${unsaved}`;
  };

  function setState(state, detail) {
    if (state === "refused") {
      stateEl.className = "mx-gone";
      stateEl.textContent = `refused — ${detail || ""}`;
      bindBlank();
      return;
    }
    MX.setSurfaceState();
  }

  function bindBlank() {
    MX.socket.close();
    showBlank(true);
    MX.sessionPanel.openPicker(blankEl, bind);
  }

  // binding replaces the socket; a session switch leaves surface choice to the user
  function bind(sid) {
    if (sid === MX.grid.sid) return; // already here
    if (MX.grid.sid === null) {
      showBlank(false);
      MX.socket.bind(sid);
      MX.grid.bindSession(sid);
      // the grid restores itself from the server for this surface
      replaceUrl(sid, MX.WINDOW_ID);
      return;
    }
    MX.socket.bind(sid);
    MX.grid.unbindSurface();
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", `/matrix/${encodeURIComponent(sid)}`);
    }
    MX.sessionPanel.open(bind);
  }

  async function boot() {
    await MX.loadRegistry();
    MX.grid.init(gridEl);
    MX.socket.onState(setState);

    document.getElementById("mxSession").addEventListener("click", () => {
      MX.sessionPanel.open(bind);
    });
    document.getElementById("mxNewWidget").addEventListener("click", () => {
      MX.widgetPicker.open();
    });
    gridEl.addEventListener("contextmenu", (ev) => {
      if (ev.target !== gridEl) return; // only empty grid space, not a widget
      ev.preventDefault();
      MX.widgetPicker.open({ x: ev.clientX, y: ev.clientY });
    });
    document.getElementById("mxDrawerHandle").addEventListener("click", () => {
      cornersEl.classList.toggle("open");
    });

    const sid = sidFromPath();
    if (!sid) { bindBlank(); return; }
    const s = surfaceFromQuery();
    if (s) {
      MX.grid.adoptSurface(s);
      bind(sid);
    } else {
      // socket only — the grid stays unbound until a surface is picked
      MX.socket.bind(sid);
      showBlank(false);
      MX.sessionPanel.open(bind);
    }
  }

  boot();
})();
