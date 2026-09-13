// annotate — draw layer over a canvas widget's iframe, sends a picture to a track
//
// MX.annotate(frame, host) -> {toggle(on), send(), el}. host sizes the
// overlay; el is appended by the caller. Marks: pen, box, text, normalized
// [0,1] coords. Own undo/redo stacks, independent of the canvas's own.
//
// Snapshot methods, chosen by frame.options.snapshot: "raster" (dom-to-image
// on frame._canvas.doc()), "playwright" (POST /api/snapshot), "none" (white).

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function ensureStyles() {
    if (document.getElementById("mxann-style")) return;
    const style = document.createElement("style");
    style.id = "mxann-style";
    style.textContent = `
      .mxann-wrap { position: absolute; inset: 0; pointer-events: none; }
      .mxann-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
      .mxann-wrap.mxann-on .mxann-canvas { pointer-events: auto; cursor: crosshair; }
      .mxann-bar { position: absolute; top: 4px; left: 4px; right: 4px; display: flex;
        align-items: center; gap: 4px; pointer-events: auto; background: var(--surface-2, #1c1c1c);
        border: 1px solid var(--border, #333); padding: 3px 4px; flex-wrap: wrap; }
      .mxann-note { flex: 1 1 80px; min-width: 60px; font-size: 11px; }
      .mxann-status { font-size: 11px; color: var(--text-3, #888); }
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

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function drawMark(ctx, m, w, h) {
    if (m.kind === "pen") {
      if (m.points.length < 1) return;
      ctx.beginPath();
      ctx.moveTo(m.points[0].x * w, m.points[0].y * h);
      for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x * w, m.points[i].y * h);
      ctx.stroke();
    } else if (m.kind === "box") {
      ctx.strokeRect(m.x * w, m.y * h, m.bw * w, m.bh * h);
    } else if (m.kind === "text") {
      ctx.fillText(m.text, m.x * w, m.y * h);
    }
  }

  // function: PNG dataUrl of the iframe document through dom-to-image.
  function rasterBackground(doc, w, h) {
    if (!doc || !window.domtoimage) return Promise.resolve(null);
    return window.domtoimage.toPng(doc.documentElement, { width: w, height: h })
      .then((dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      }))
      .catch(() => null);
  }

  // function: PNG bytes of the instance's iframe through the server route.
  function playwrightBackground(inst) {
    const sid = MX.grid && MX.grid.sid;
    const surface = MX.WINDOW_ID || "";
    if (!sid) return Promise.resolve(null);
    return fetch("/api/snapshot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: sid, surface: surface, inst: inst })
    }).then((r) => (r.ok ? r.blob() : null))
      .then((blob) => (blob ? createImageBitmap(blob) : null))
      .catch(() => null);
  }

  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  MX.annotate = function (frame, host) {
    ensureStyles();

    const st = {
      on: false, tool: "pen", marks: [], undone: [], drawing: null,
      sending: false
    };

    const wrap = document.createElement("div");
    wrap.className = "mxann-wrap";
    wrap.hidden = true;

    const canvas = document.createElement("canvas");
    canvas.className = "mxann-canvas";
    wrap.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const bar = document.createElement("div");
    bar.className = "mxann-bar";

    const toolBtns = {};
    function setTool(t) {
      st.tool = t;
      for (const k of Object.keys(toolBtns)) toolBtns[k].classList.toggle("mxcv-btn-on", k === t);
    }
    for (const t of ["pen", "box", "text"]) {
      const b = mkBtn(t, () => setTool(t));
      toolBtns[t] = b;
      bar.appendChild(b);
    }
    setTool("pen");

    bar.appendChild(mkBtn("Undo", () => undo()));
    bar.appendChild(mkBtn("Redo", () => redo()));

    const note = document.createElement("input");
    note.type = "text";
    note.className = "mxann-note";
    note.placeholder = "note";
    bar.appendChild(note);

    bar.appendChild(mkBtn("Send", () => send()));

    const status = document.createElement("span");
    status.className = "mxann-status";
    bar.appendChild(status);

    wrap.appendChild(bar);

    function setStatus(text) {
      status.textContent = text || "";
      if (text) setTimeout(() => { status.textContent = ""; }, 2500);
    }

    function resize() {
      const r = host.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width));
      canvas.height = Math.max(1, Math.round(r.height));
      redraw();
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ff3b30";
      ctx.fillStyle = "#ff3b30";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.font = "14px sans-serif";
      for (const m of st.marks) drawMark(ctx, m, canvas.width, canvas.height);
      if (st.drawing) drawMark(ctx, st.drawing, canvas.width, canvas.height);
    }

    function toNorm(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return {
        x: clamp01((clientX - r.left) / (r.width || 1)),
        y: clamp01((clientY - r.top) / (r.height || 1))
      };
    }

    function commit(mark) {
      st.marks.push(mark);
      st.undone = [];
      st.drawing = null;
      redraw();
    }

    function undo() {
      const m = st.marks.pop();
      if (!m) return;
      st.undone.push(m);
      redraw();
    }

    function redo() {
      const m = st.undone.pop();
      if (!m) return;
      st.marks.push(m);
      redraw();
    }

    function onDown(e) {
      if (!st.on || st.sending) return;
      const p = toNorm(e.clientX, e.clientY);
      if (st.tool === "pen") {
        st.drawing = { kind: "pen", points: [p] };
        redraw();
      } else if (st.tool === "box") {
        st.drawing = { kind: "box", x: p.x, y: p.y, bw: 0, bh: 0 };
      } else if (st.tool === "text") {
        const text = window.prompt("Text mark:", "");
        if (text) commit({ kind: "text", x: p.x, y: p.y, text: text });
      }
    }

    function onMove(e) {
      if (!st.on || !st.drawing) return;
      const p = toNorm(e.clientX, e.clientY);
      if (st.drawing.kind === "pen") {
        st.drawing.points.push(p);
        redraw();
      } else if (st.drawing.kind === "box") {
        st.drawing.bw = p.x - st.drawing.x;
        st.drawing.bh = p.y - st.drawing.y;
        redraw();
      }
    }

    function onUp() {
      if (!st.on || !st.drawing) return;
      commit(st.drawing);
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    function backgroundFor(method) {
      if (method === "playwright") return playwrightBackground(frame.id);
      if (method === "none") return Promise.resolve(null);
      const doc = frame._canvas && frame._canvas.doc && frame._canvas.doc();
      return rasterBackground(doc, canvas.width, canvas.height);
    }

    function send() {
      if (st.sending) return Promise.resolve(false);
      const track = frame.options.annotateTrack || "";
      if (!track) { setStatus("no track"); return Promise.resolve(false); }
      st.sending = true;
      setStatus("compositing…");
      const method = frame.options.snapshot || "raster";
      const w = canvas.width, h = canvas.height;
      return backgroundFor(method).then((bg) => {
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const octx = out.getContext("2d");
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, w, h);
        if (bg) octx.drawImage(bg, 0, 0, w, h);
        else if (method !== "none") setStatus(method + " missing page");
        octx.strokeStyle = "#ff3b30";
        octx.fillStyle = "#ff3b30";
        octx.lineWidth = 2;
        octx.lineCap = "round";
        octx.lineJoin = "round";
        octx.font = "14px sans-serif";
        for (const m of st.marks) drawMark(octx, m, w, h);
        return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
      }).then((blob) => (blob ? blobToB64(blob) : null))
        .then((b64) => {
          if (!b64) { setStatus("no image"); return false; }
          const path = "docs/scratchpad/annotate-" + Date.now() + ".png";
          return fetch("/api/fs/put", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: path, b64: b64 })
          }).then((r) => r.json()).then((res) => {
            if (!res || res.error) { setStatus("put failed"); return false; }
            frame.send({ type: "user", track: track, text: note.value.trim(), image_paths: [res.path] });
            st.marks = [];
            st.undone = [];
            note.value = "";
            redraw();
            setStatus("sent");
            return true;
          });
        }).catch(() => { setStatus("send failed"); return false; })
        .then((ok) => { st.sending = false; return ok; });
    }

    return {
      toggle(on) {
        st.on = !!on;
        wrap.hidden = !st.on;
        wrap.classList.toggle("mxann-on", st.on);
        if (st.on) resize();
      },
      send: send,
      el: wrap
    };
  };
})();
