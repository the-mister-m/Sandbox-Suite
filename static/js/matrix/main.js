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

  function showBlank(show) {
    blankEl.style.display = show ? "flex" : "none";
    gridEl.style.display = show ? "none" : "grid";
    cornersEl.style.display = show ? "none" : "flex";
  }

  function setState(state, detail) {
    stateEl.className = state === "live" ? "mx-live"
      : (state === "closed" || state === "refused") ? "mx-gone" : "";
    const sid = MX.socket.sid();
    stateEl.textContent = state === "refused"
      ? `refused — ${detail || ""}`
      : `${state}${sid ? " · " + sid : ""} · window ${MX.WINDOW_ID}`;
    if (state === "refused") bindBlank();
  }

  function bindBlank() {
    MX.socket.close();
    showBlank(true);
    MX.sessionPanel.openPicker(blankEl, bind);
  }

  // binding replaces the socket; the grid stays and every widget rebinds
  function bind(sid) {
    showBlank(false);
    MX.socket.bind(sid);
    if (MX.grid.sid === null) MX.grid.bindSession(sid);
    else MX.grid.rebind(sid);
    // the grid restores itself from the server for this window
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", `/matrix/${encodeURIComponent(sid)}`);
    }
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

    const sid = sidFromPath();
    if (sid) bind(sid);
    else bindBlank();
  }

  boot();
})();
