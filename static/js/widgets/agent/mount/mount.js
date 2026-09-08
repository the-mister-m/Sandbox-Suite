// mount widget — dev tool, puts a worker on the bound session
//
// One button sends create_track then insert_region, in order, so the
// other widgets in the session have a region to talk to. No transcript,
// no follow — mount and forget. The form and the create_track ->
// insert_region chaining live in MX.mountAddControls, mode "both"; this
// widget is just its caller.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.registerWidget("mount", {
    mount(frame) {
      const m = frame._mount = {};
      m.ctrl = MX.mountAddControls(frame.host, frame, { mode: "both" });
      frame.subscribe(["track_created"]);

      // inherited root shown on the add controls: session rung, global behind it
      const state = { sessionRoot: "", workspaceRoot: "" };
      fetch("/api/workspace-root").then((r) => r.json()).then((d) => {
        state.workspaceRoot = (d && d.root) || "";
        m.ctrl.refresh(state);
      }).catch(() => {});

      const sid = MX.socket && MX.socket.sid ? MX.socket.sid() : null;
      if (sid) {
        fetch("/api/session-settings/" + encodeURIComponent(sid))
          .then((r) => r.json()).then((d) => {
            state.sessionRoot = (d && d.effective && d.effective.root) || "";
            m.ctrl.refresh(state);
          }).catch(() => {});
      }
    },

    unmount(frame) {
      frame._mount = null;
    },

    onFrame(frame, msg) {
      const m = frame._mount;
      if (!m || !m.ctrl) return;
      m.ctrl.onFrame(msg);
    },
  });
})();
