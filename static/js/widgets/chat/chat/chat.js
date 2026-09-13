// chat widget — one instance is one region's transcript
//
// The instance binds to a region through options.region. Sends `user` to run a
// turn, `follow` to stream that region live, `transcript` to reload it,
// `gate_action` for a gate. Markdown renders through marked, sanitized
// through DOMPurify; both are vendored under /static/vendor.
//
// State: every chat instance follows its own region, so several chats in one
// matrix window stream at once.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const SPEECH_LOCK_KEY = "mx.speech.lock";
  const SPEECH_LOCK_MS = 15000;

  // provider id to kind, from the provider registry
  let _providerKinds = null;

  function loadProviderKinds() {
    if (_providerKinds) return Promise.resolve(_providerKinds);
    return fetch("/api/library/providers")
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d) ? d : (d && d.list) || [];
        _providerKinds = Object.create(null);
        for (const row of rows) {
          if (row && row.id) _providerKinds[row.id] = row.kind || "";
        }
        return _providerKinds;
      })
      .catch(() => (_providerKinds = Object.create(null)));
  }

  function isCloud(provider) {
    return !!(_providerKinds && _providerKinds[provider] === "cloud");
  }

  // markdown

  function renderMarkdown(into, text) {
    into.textContent = "";
    const src = text || "";
    if (window.marked && window.DOMPurify) {
      const html = window.marked.parse(src, { breaks: true, gfm: true });
      into.innerHTML = window.DOMPurify.sanitize(html);
      upgradeCodeBlocks(into);
      return;
    }
    // markdown libraries absent: the text still shows, unstyled
    const pre = document.createElement("pre");
    pre.className = "cq-plain";
    pre.textContent = src;
    into.appendChild(pre);
  }

  // code blocks render through the shared read-only Monaco path
  function upgradeCodeBlocks(into) {
    if (typeof MX.mountReadonlyMonaco !== "function") return;
    const blocks = into.querySelectorAll("pre > code");
    for (const code of blocks) {
      const pre = code.parentNode;
      if (!pre || pre.dataset.mxMonaco === "1") continue;
      pre.dataset.mxMonaco = "1";
      const text = code.textContent || "";
      const lang = (code.className.match(/language-([\w+#-]+)/) || [])[1] || "plaintext";
      const holder = document.createElement("div");
      holder.className = "cq-code";
      const lines = text.split("\n").length;
      holder.style.height = Math.min(24 + lines * 19, 420) + "px";
      pre.parentNode.replaceChild(holder, pre);
      MX.mountReadonlyMonaco(holder, { value: text, language: lang })
        .catch(() => { holder.textContent = text; });
    }
  }

  // speech — one chat speaks at a time, across the windows of one browser

  function readLock() {
    try {
      const raw = window.localStorage.getItem(SPEECH_LOCK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function claimSpeechLock(holder) {
    const now = Date.now();
    const cur = readLock();
    if (cur && cur.holder !== holder && (now - (cur.at || 0)) < SPEECH_LOCK_MS) return false;
    try {
      window.localStorage.setItem(SPEECH_LOCK_KEY, JSON.stringify({ holder: holder, at: now }));
    } catch (e) {
      return true;
    }
    return true;
  }

  function releaseSpeechLock(holder) {
    const cur = readLock();
    if (cur && cur.holder !== holder) return;
    try { window.localStorage.removeItem(SPEECH_LOCK_KEY); } catch (e) { /* nothing held */ }
  }

  function speak(frame, text, voice) {
    const c = frame._chat;
    if (!c || !frame.options.speech_enabled) return;
    if (!window.speechSynthesis) return;
    if (!claimSpeechLock(frame.id)) {
      c.speechNote.textContent = "another chat is speaking";
      return;
    }
    c.speechNote.textContent = "speaking";
    const u = new SpeechSynthesisUtterance(text || "");
    const want = voice || c.voice;
    if (want) {
      const match = window.speechSynthesis.getVoices().find((v) => v.name === want);
      if (match) u.voice = match;
    }
    const renew = setInterval(() => claimSpeechLock(frame.id), SPEECH_LOCK_MS / 3);
    const done = () => {
      clearInterval(renew);
      releaseSpeechLock(frame.id);
      if (frame._chat) frame._chat.speechNote.textContent = "";
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  // a non-browser tts engine sends rendered audio instead of text
  function playAudio(frame, b64, mime) {
    const c = frame._chat;
    if (!c || !frame.options.speech_enabled || !b64) return;
    if (!claimSpeechLock(frame.id)) {
      c.speechNote.textContent = "another chat is speaking";
      return;
    }
    c.speechNote.textContent = "speaking";
    const audio = new Audio("data:" + (mime || "audio/wav") + ";base64," + b64);
    const renew = setInterval(() => claimSpeechLock(frame.id), SPEECH_LOCK_MS / 3);
    const done = () => {
      clearInterval(renew);
      releaseSpeechLock(frame.id);
      if (frame._chat) frame._chat.speechNote.textContent = "";
    };
    audio.onended = done;
    audio.onerror = done;
    c.audio = audio;
    audio.play().catch(done);
  }

  // transcript

  function messageText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((p) => (typeof p === "string" ? p : (p && p.text) || "[media]")).join("");
    }
    return "";
  }

  function bubble(role, text) {
    const row = document.createElement("div");
    row.className = "cq-turn cq-" + role;
    const who = document.createElement("div");
    who.className = "cq-who";
    who.textContent = role;
    const body = document.createElement("div");
    body.className = "cq-body";
    renderMarkdown(body, text);
    row.appendChild(who);
    row.appendChild(body);
    return row;
  }

  function renderTranscript(frame, messages) {
    const c = frame._chat;
    if (!c) return;
    c.script.textContent = "";
    c.live = null;
    c.liveText = "";
    let drawn = 0;
    for (const msg of (messages || [])) {
      if (!msg || msg.role === "system" || msg.role === "tool" || msg._seat_context) continue;
      const text = messageText(msg.content);
      if (!text.trim()) continue;
      c.script.appendChild(bubble(msg.role === "user" ? "user" : "agent", text));
      drawn += 1;
    }
    if (!drawn) {
      const empty = document.createElement("div");
      empty.className = "cq-empty";
      empty.textContent = "no turns on this region";
      c.script.appendChild(empty);
    }
    c.script.scrollTop = c.script.scrollHeight;
  }

  function streamOut(frame, text) {
    const c = frame._chat;
    if (!c || !text) return;
    const empty = c.script.querySelector(".cq-empty");
    if (empty) empty.remove();
    if (!c.live) {
      c.live = bubble("agent", "");
      c.liveText = "";
      c.script.appendChild(c.live);
    }
    c.liveText += text;
    renderMarkdown(c.live.querySelector(".cq-body"), c.liveText);
    c.script.scrollTop = c.script.scrollHeight;
  }

  // region binding

  function regionRow(frame) {
    const c = frame._chat;
    if (!c) return null;
    return c.regions.find((r) => r.id === frame.options.region) || null;
  }

  function setRegion(frame, rid) {
    const c = frame._chat;
    const old = c.following;
    if (old && old !== rid) {
      frame.send({ type: "unfollow", track: old, inst: frame.id });
      c.following = null;
    }
    frame.options.region = rid || "";
    c.bound = !!rid;
    c.live = null;
    c.liveText = "";
    c.script.textContent = "";
    renderHead(frame);
    if (!rid) return;
    follow(frame);
  }

  // every chat instance streams its own region at once
  function follow(frame) {
    const c = frame._chat;
    const rid = frame.options.region;
    if (!rid) return;
    c.following = rid;
    frame.send({ type: "follow", track: rid, inst: frame.id });
    renderHead(frame);
  }

  function isLive(frame) {
    const c = frame._chat;
    return !!(c && c.following && c.following === frame.options.region);
  }

  function renderHead(frame) {
    const c = frame._chat;
    if (!c) return;
    const rid = frame.options.region;
    c.picker.textContent = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "— region —";
    c.picker.appendChild(none);
    for (const r of c.regions) {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name || r.id;
      if (r.id === rid) o.selected = true;
      c.picker.appendChild(o);
    }
    // the pill says whether this instance is speaking for its region
    c.livePill.textContent = isLive(frame) ? "live" : "not live";
    c.livePill.className = "cq-pill" + (isLive(frame) ? " cq-on" : "");
    const row = regionRow(frame);
    c.ctx.textContent = row && isCloud(row.provider) ? c.ctxText : "";
  }

  function setMeters(frame, d) {
    const c = frame._chat;
    if (!c || !d) return;
    const used = d.ctx_used || 0;
    // current context in this window; no total
    c.ctxText = "ctx " + (used >= 1000 ? (used / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(used));
    const row = regionRow(frame);
    c.ctx.textContent = row && isCloud(row.provider) ? c.ctxText : "";
  }

  // file drag from the browser widget

  function insertFileBlock(frame, path) {
    const c = frame._chat;
    if (!c || !path) return;
    fetch("/api/fs/read?path=" + encodeURIComponent(path))
      .then((r) => r.json())
      .then((d) => {
        const block = d && typeof d.text === "string"
          ? "[file: " + path + "]\n```\n" + d.text + "\n```"
          : "[file: " + path + " — " + ((d && d.error) || "unreadable") + "]";
        const existing = c.input.value.trim();
        c.input.value = block + (existing ? "\n\n" + existing : "");
        c.input.focus();
      })
      .catch(() => { /* the drop simply does not land */ });
  }

  function submit(frame) {
    const c = frame._chat;
    const rid = frame.options.region;
    const text = c.input.value.trim();
    if (!rid || !text) return;
    const empty = c.script.querySelector(".cq-empty");
    if (empty) empty.remove();
    c.script.appendChild(bubble("user", text));
    c.live = null;
    c.liveText = "";
    c.script.scrollTop = c.script.scrollHeight;
    frame.send({ type: "user", track: rid, text: text, inst: frame.id });
    c.input.value = "";
  }

  MX.registerWidget("chat", {
    mount(frame) {
      const c = frame._chat = {
        regions: [], names: Object.create(null), live: null, liveText: "",
        ctxText: "", voice: "", following: null,
      };
      if (typeof frame.options.region !== "string") frame.options.region = "";

      const wrap = document.createElement("div");
      wrap.className = "cq-chat";

      const head = document.createElement("div");
      head.className = "cq-head";
      c.picker = document.createElement("select");
      c.picker.className = "cq-pick";
      c.picker.addEventListener("change", () => {
        setRegion(frame, c.picker.value);
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
      });
      c.livePill = document.createElement("button");
      c.livePill.type = "button";
      c.livePill.className = "cq-pill";
      c.livePill.title = "stream this instance's region";
      c.livePill.addEventListener("click", () => follow(frame));
      c.ctx = document.createElement("span");
      c.ctx.className = "cq-ctx";
      c.speechNote = document.createElement("span");
      c.speechNote.className = "cq-speech";
      head.appendChild(c.picker);
      head.appendChild(c.livePill);
      head.appendChild(c.ctx);
      head.appendChild(c.speechNote);
      wrap.appendChild(head);

      c.script = document.createElement("div");
      c.script.className = "cq-script";
      wrap.appendChild(c.script);

      const foot = document.createElement("div");
      foot.className = "cq-foot";
      c.input = document.createElement("textarea");
      c.input.className = "cq-input";
      c.input.rows = 2;
      c.input.placeholder = "message, or drop a file from the browser";
      c.input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); submit(frame); }
      });
      const send = document.createElement("button");
      send.type = "button";
      send.className = "cq-btn";
      send.textContent = "send";
      send.addEventListener("click", () => submit(frame));
      const stop = document.createElement("button");
      stop.type = "button";
      stop.className = "cq-btn";
      stop.textContent = "stop";
      stop.addEventListener("click", () => {
        if (frame.options.region) {
          frame.send({ type: "stop", track: frame.options.region, inst: frame.id });
        }
      });
      const reload = document.createElement("button");
      reload.type = "button";
      reload.className = "cq-btn";
      reload.textContent = "reload";
      reload.addEventListener("click", () => {
        if (frame.options.region) {
          frame.send({ type: "transcript", track: frame.options.region, inst: frame.id });
        }
      });
      foot.appendChild(c.input);
      foot.appendChild(send);
      foot.appendChild(stop);
      foot.appendChild(reload);
      wrap.appendChild(foot);

      for (const el of [c.script, foot]) {
        el.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
          foot.classList.add("cq-drop");
        });
        el.addEventListener("dragleave", () => foot.classList.remove("cq-drop"));
        el.addEventListener("drop", (ev) => {
          ev.preventDefault();
          foot.classList.remove("cq-drop");
          const path = ev.dataTransfer ? ev.dataTransfer.getData("text/plain") : "";
          insertFileBlock(frame, path);
        });
      }

      frame.host.appendChild(wrap);
      frame.subscribe(["ade_init", "track_list", "track_transcript", "transcript",
                       "out", "status", "meters", "speak", "audio", "mirror",
                       "track_removed", "region_replaced"]);
      frame.send({ type: "roster", inst: frame.id });
      renderHead(frame);
      loadProviderKinds().then(() => renderHead(frame));
      fetch("/api/session-settings/" + encodeURIComponent(frame.sid || ""))
        .then((r) => r.json())
        .then((g) => {
          const v = (g && g.effective && g.effective.voices) || {};
          c.voice = v.tts_voice || "";
        })
        .catch(() => { /* no voice named */ });
    },

    unmount(frame) {
      const c = frame._chat;
      if (c && c.following) frame.send({ type: "unfollow", track: c.following, inst: frame.id });
      if (c && c.audio) {
        try { c.audio.pause(); } catch (e) { /* already stopped */ }
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      releaseSpeechLock(frame.id);
      frame._chat = null;
    },

    onFrame(frame, msg) {
      const c = frame._chat;
      if (!c) return;
      const rid = frame.options.region;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        c.regions = MX.gates.regionRows(msg);
        c.names = MX.gates.namesFrom(msg, Object.create(null));
        if (!rid && c.regions.length) {
          setRegion(frame, c.regions[0].id);
          if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
          return;
        }
        // a region carried in from a matrix template still needs its transcript
        if (rid && !c.bound) {
          c.bound = true;
          follow(frame);
        }
        renderHead(frame);
        return;
      }

      if (msg.type === "track_removed" && msg.id === rid) {
        setRegion(frame, "");
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
        return;
      }
      if (msg.type === "region_replaced" && msg.old_id === rid) {
        setRegion(frame, msg.new_id);
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
        return;
      }

      if (msg.type === "track_transcript" || msg.type === "transcript") {
        if (msg.id === rid) renderTranscript(frame, msg.messages);
        return;
      }

      // the live stream for this instance's own region
      if (msg.type === "mirror") {
        if (msg.track !== rid) return;
        if (msg.kind === "transcript") renderTranscript(frame, msg.messages);
        else if (msg.kind === "out") streamOut(frame, msg.text);
        else if (msg.kind === "meters") setMeters(frame, msg.d);
        else if (msg.kind === "status" && msg.phase === "idle") { c.live = null; c.liveText = ""; }
        else if (msg.kind === "speak") speak(frame, msg.text, msg.voice);
        else if (msg.kind === "audio") playAudio(frame, msg.data, msg.mime);
        return;
      }

      // socket-level frames, addressed to this instance
      if (msg.inst && msg.inst !== frame.id) return;
      if (msg.region && msg.region !== rid) return;

      if (msg.type === "speak") speak(frame, msg.text, msg.voice);
      else if (msg.type === "audio") playAudio(frame, msg.data, msg.mime);
    },

    onOption(frame, key) {
      if (key === "region") setRegion(frame, frame.options.region);
      if (key === "speech_enabled" && !frame.options.speech_enabled) {
        releaseSpeechLock(frame.id);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (frame._chat) frame._chat.speechNote.textContent = "";
      }
    },

    getOptions(frame) {
      return JSON.parse(JSON.stringify(frame.options));
    },
  });
})();
