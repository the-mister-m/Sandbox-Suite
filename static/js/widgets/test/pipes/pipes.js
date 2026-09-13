// pipes widget — throwaway, proves target/mirror/module-ready/file pipes
//
// State: two mirrors on frame.options.target — "pipes.ping" (log + Emit
// button), "graph.select" (count only, witness for 2A). Files: open -> file,
// save -> saved, both filtered by inst.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const LOG_CAP = 50;

  function renderInfo(frame) {
    const st = frame._pipes;
    if (!st || !st.infoEl) return;
    st.infoEl.textContent =
      `target=${frame.options.target || "(none)"} tab=${MX.TAB_ID} window=${MX.WINDOW_ID} inst=${frame.id}`;
  }

  function renderLog(frame) {
    const st = frame._pipes;
    if (!st || !st.logEl) return;
    st.logEl.textContent = "";
    for (const line of st.log) {
      const row = document.createElement("div");
      row.textContent = line;
      st.logEl.appendChild(row);
    }
  }

  function pushLog(frame, prefix, payload) {
    const st = frame._pipes;
    st.log.unshift((prefix ? prefix + " " : "") + JSON.stringify(payload));
    if (st.log.length > LOG_CAP) st.log.length = LOG_CAP;
    renderLog(frame);
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
  }

  function makeMirrors(frame) {
    const st = frame._pipes;
    st.pingMirror = MX.mirror(frame, "pipes.ping", (payload, meta) => {
      pushLog(frame, meta && meta.remote ? "remote" : "", payload);
    });
    st.selectMirror = MX.mirror(frame, "graph.select", () => {
      st.selectCount += 1;
      if (st.selectEl) st.selectEl.textContent = `graph.select seen: ${st.selectCount}`;
    });
  }

  function killMirrors(frame) {
    const st = frame._pipes;
    if (st.pingMirror) st.pingMirror.off();
    if (st.selectMirror) st.selectMirror.off();
    st.pingMirror = null;
    st.selectMirror = null;
  }

  MX.registerWidget("pipes", {
    defaults: { target: "", path: "", note: "" },

    optionControls: {
      target: MX.targetControl(MX.graphTargets, MX.graphTargetNew),
    },

    mount(frame) {
      const st = frame._pipes = {
        log: [],
        selectCount: 0,
        shownText: "",
        infoEl: null, logEl: null, selectEl: null,
        loadResultEl: null, fileEl: null, saveResultEl: null,
        pingMirror: null, selectMirror: null,
      };

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "4px";
      wrap.style.padding = "4px";

      const info = document.createElement("div");
      info.style.fontSize = "11px";
      st.infoEl = info;
      wrap.appendChild(info);

      const emitBtn = document.createElement("button");
      emitBtn.type = "button";
      emitBtn.textContent = "Emit";
      emitBtn.addEventListener("click", () => {
        if (st.pingMirror) st.pingMirror.emit({ note: frame.options.note || "", at: Date.now() });
      });
      wrap.appendChild(emitBtn);

      const log = document.createElement("div");
      log.style.maxHeight = "120px";
      log.style.overflow = "auto";
      log.style.fontSize = "11px";
      log.style.border = "1px solid #333";
      st.logEl = log;
      wrap.appendChild(log);

      const selectLine = document.createElement("div");
      selectLine.style.fontSize = "11px";
      selectLine.textContent = "graph.select seen: 0";
      st.selectEl = selectLine;
      wrap.appendChild(selectLine);

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.textContent = "Load target";
      loadBtn.addEventListener("click", () => {
        const target = frame.options.target || "";
        fetch(`/api/library/graphs/${encodeURIComponent(target)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data && data.error) {
              st.loadResultEl.textContent = `error: ${data.error}`;
              return;
            }
            const nodes = Array.isArray(data.nodes) ? data.nodes.length : 0;
            const edges = Array.isArray(data.edges) ? data.edges.length : 0;
            st.loadResultEl.textContent = `${nodes} nodes, ${edges} edges`;
          })
          .catch((e) => { st.loadResultEl.textContent = `error: ${e}`; });
      });
      wrap.appendChild(loadBtn);

      const loadResult = document.createElement("div");
      loadResult.style.fontSize = "11px";
      st.loadResultEl = loadResult;
      wrap.appendChild(loadResult);

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        frame.send({ type: "open", path: frame.options.path || "", inst: frame.id });
      });
      wrap.appendChild(openBtn);

      const fileLine = document.createElement("div");
      fileLine.style.fontSize = "11px";
      fileLine.style.whiteSpace = "pre-wrap";
      st.fileEl = fileLine;
      wrap.appendChild(fileLine);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const content = st.shownText + "\npipes " + Date.now();
        frame.send({ type: "save", path: frame.options.path || "", content: content, inst: frame.id });
      });
      wrap.appendChild(saveBtn);

      const saveResult = document.createElement("div");
      saveResult.style.fontSize = "11px";
      st.saveResultEl = saveResult;
      wrap.appendChild(saveResult);

      frame.host.appendChild(wrap);

      frame.subscribe(["file", "saved"]);
      makeMirrors(frame);
      renderInfo(frame);
      renderLog(frame);
    },

    unmount(frame) {
      if (!frame._pipes) return;
      killMirrors(frame);
      frame._pipes = null;
    },

    onOption(frame, key) {
      if (key === "target") {
        killMirrors(frame);
        makeMirrors(frame);
      }
      renderInfo(frame);
    },

    onFrame(frame, msg) {
      const st = frame._pipes;
      if (!st) return;
      if (msg.inst !== frame.id) return;
      if (msg.type === "file") {
        st.shownText = String(msg.content || "").slice(0, 200);
        st.fileEl.textContent = st.shownText;
        return;
      }
      if (msg.type === "saved") {
        st.saveResultEl.textContent = msg.ok ? "ok" : String(msg.result || "");
      }
    },

    getOptions(frame) {
      return {
        target: frame.options.target || "",
        path: frame.options.path || "",
        note: frame.options.note || "",
      };
    },
  });
})();
