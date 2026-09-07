// suite page — new/open, open-sessions display, global settings, update default

const Suite = (() => {

  // dropdown/toggle option lists — mirror engine/settings.py 148-186
  const MODAL_MODES = ["fullscreen", "window", "corner", "off"];
  const ADE_MODAL_MODES = ["inherit", ...MODAL_MODES];
  const CONFIRM_KEYS = [
    "editor_save", "file_delete", "file_move", "terminal_run", "setroot",
    "session_new", "session_load", "delete_saved_session", "delete_voice",
    "room_remove", "room_load", "gate_matrix_save",
  ];
  const KILLSWITCH_SCOPES = ["models", "hosts", "suite"];
  const KILL_ROW_KEYS = ["end_all_turns", "unload_weights", "kill_hosts",
                         "end_all_sessions", "shutdown_suite"];
  const TTS_ENGINES = ["say", "browser"];
  const STT_ENGINES = ["parakeet_mlx", "whisper", "browser"];
  const LISTEN_MODES = ["ptt", "vad", "off"];

  function getAtPath(obj, path) {
    let node = obj;
    for (const part of path) {
      if (node == null) return undefined;
      node = node[part];
    }
    return node;
  }

  function setAtPath(obj, path, value) {
    let node = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof node[path[i]] !== "object" || node[path[i]] === null) node[path[i]] = {};
      node = node[path[i]];
    }
    node[path[path.length - 1]] = value;
  }

  let loadedGlobal = {};
  let selectedSid = null;
  // leaf controls registered during render; each writes one path on save
  let controls = [];

  function registerControl(path, get) {
    controls.push({ path, get });
  }

  function fieldRow(label) {
    const wrap = document.createElement("div");
    wrap.className = "field-row";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    wrap.appendChild(lbl);
    return wrap;
  }

  function fieldGroup(label) {
    const section = document.createElement("div");
    section.className = "field-group";
    const heading = document.createElement("h3");
    heading.textContent = label;
    section.appendChild(heading);
    return section;
  }

  function makeDropdown(options, current) {
    const select = document.createElement("select");
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }
    if (current != null) select.value = current;
    return select;
  }

  // toggle switch — two-state button, not a bare checkbox
  function makeToggle(initial) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toggle-switch";
    let state = !!initial;
    function render() {
      btn.textContent = state ? "on" : "off";
      btn.dataset.state = state ? "on" : "off";
    }
    render();
    btn.onclick = () => { state = !state; render(); };
    btn.getValue = () => state;
    return btn;
  }

  // two-state button for confirm rows — ask / silent
  function makeTwoState(initial, a, b) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "two-state";
    let state = initial === b ? b : a;
    function render() {
      btn.textContent = state;
      btn.dataset.state = state;
    }
    render();
    btn.onclick = () => { state = state === a ? b : a; render(); };
    btn.getValue = () => state;
    return btn;
  }

  function buildSimpleDropdown(container, label, path, options) {
    const wrap = fieldRow(label);
    const select = makeDropdown(options, getAtPath(loadedGlobal, path));
    wrap.appendChild(select);
    container.appendChild(wrap);
    registerControl(path, () => select.value);
  }

  function buildSimpleToggle(container, label, path) {
    const wrap = fieldRow(label);
    const toggle = makeToggle(getAtPath(loadedGlobal, path));
    wrap.appendChild(toggle);
    container.appendChild(wrap);
    registerControl(path, () => toggle.getValue());
  }

  // skin — dropdown over GET /api/global's skins list if served, else text
  function buildSkin(container) {
    const wrap = fieldRow("skin");
    const current = getAtPath(loadedGlobal, ["skin"]);
    const skinsList = Array.isArray(loadedGlobal.skins) ? loadedGlobal.skins : null;
    let control;
    if (skinsList) {
      const options = skinsList.includes(current) || current == null
        ? skinsList
        : [current, ...skinsList];
      control = makeDropdown(options, current);
      wrap.appendChild(control);
      registerControl(["skin"], () => control.value);
    } else {
      control = document.createElement("input");
      control.type = "text";
      control.value = current == null ? "" : String(current);
      wrap.appendChild(control);
      registerControl(["skin"], () => control.value);
    }
    container.appendChild(wrap);
  }

  // confirm — twelve keys, each a two-state ask/silent button
  function buildConfirm(container) {
    const section = fieldGroup("confirm");
    for (const key of CONFIRM_KEYS) {
      const wrap = fieldRow(key);
      const current = getAtPath(loadedGlobal, ["confirm", key]) || "ask";
      const btn = makeTwoState(current, "ask", "silent");
      wrap.appendChild(btn);
      section.appendChild(wrap);
      registerControl(["confirm", key], () => btn.getValue());
    }
    container.appendChild(section);
  }

  // killswitch — scope dropdown plus hold_to_fire toggle
  function buildKillswitch(container) {
    const section = fieldGroup("killswitch");

    const scopeWrap = fieldRow("scope");
    const scopeSelect = makeDropdown(KILLSWITCH_SCOPES, getAtPath(loadedGlobal, ["killswitch", "scope"]));
    scopeWrap.appendChild(scopeSelect);
    section.appendChild(scopeWrap);
    registerControl(["killswitch", "scope"], () => scopeSelect.value);

    const holdWrap = fieldRow("hold_to_fire");
    const holdToggle = makeToggle(getAtPath(loadedGlobal, ["killswitch", "hold_to_fire"]));
    holdWrap.appendChild(holdToggle);
    section.appendChild(holdWrap);
    registerControl(["killswitch", "hold_to_fire"], () => holdToggle.getValue());

    container.appendChild(section);
  }

  // kill_holds — five toggles, one per key, labeled by key
  // (covers the kill_hosts and shutdown_suite keys named separately in
  // the spec — decision 3 in the receipt)
  function buildKillHolds(container) {
    const section = fieldGroup("kill_holds");
    for (const key of KILL_ROW_KEYS) {
      const wrap = fieldRow(key);
      const toggle = makeToggle(getAtPath(loadedGlobal, ["kill_holds", key]));
      wrap.appendChild(toggle);
      section.appendChild(wrap);
      registerControl(["kill_holds", key], () => toggle.getValue());
    }
    container.appendChild(section);
  }

  // voices — tts/stt engine and voice controls; stt_engine lives here only
  function buildVoices(container) {
    const section = fieldGroup("voices");

    const ttsEngineWrap = fieldRow("tts_engine");
    const ttsEngineSelect = makeDropdown(TTS_ENGINES, getAtPath(loadedGlobal, ["voices", "tts_engine"]));
    ttsEngineWrap.appendChild(ttsEngineSelect);
    section.appendChild(ttsEngineWrap);
    registerControl(["voices", "tts_engine"], () => ttsEngineSelect.value);

    const ttsVoiceWrap = fieldRow("tts_voice");
    const ttsVoiceInput = document.createElement("input");
    ttsVoiceInput.type = "text";
    ttsVoiceInput.value = getAtPath(loadedGlobal, ["voices", "tts_voice"]) ?? "";
    ttsVoiceWrap.appendChild(ttsVoiceInput);
    section.appendChild(ttsVoiceWrap);
    registerControl(["voices", "tts_voice"], () => ttsVoiceInput.value);

    const sttEngineWrap = fieldRow("stt_engine");
    const sttEngineSelect = makeDropdown(STT_ENGINES, getAtPath(loadedGlobal, ["voices", "stt_engine"]));
    sttEngineWrap.appendChild(sttEngineSelect);
    section.appendChild(sttEngineWrap);
    registerControl(["voices", "stt_engine"], () => sttEngineSelect.value);

    const listenModeWrap = fieldRow("listen_mode");
    const listenModeSelect = makeDropdown(LISTEN_MODES, getAtPath(loadedGlobal, ["voices", "listen_mode"]));
    listenModeWrap.appendChild(listenModeSelect);
    section.appendChild(listenModeWrap);
    registerControl(["voices", "listen_mode"], () => listenModeSelect.value);

    container.appendChild(section);
  }

  // one list path (models.order / models.hidden) — rows with remove, add box
  function buildListField(container, label, path) {
    const wrap = fieldRow(label);
    const listWrap = document.createElement("div");
    listWrap.className = "list-field";
    let items = (getAtPath(loadedGlobal, path) || []).slice();

    function renderList() {
      listWrap.innerHTML = "";
      if (items.length === 0) {
        const none = document.createElement("span");
        none.textContent = "none";
        listWrap.appendChild(none);
      }
      for (let i = 0; i < items.length; i++) {
        const row = document.createElement("div");
        row.className = "list-row";
        const span = document.createElement("span");
        span.textContent = items[i];
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "remove";
        rm.onclick = () => { items.splice(i, 1); renderList(); };
        row.appendChild(span);
        row.appendChild(rm);
        listWrap.appendChild(row);
      }
      const addRow = document.createElement("div");
      addRow.className = "list-add-row";
      const addInput = document.createElement("input");
      addInput.type = "text";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "add";
      addBtn.onclick = () => {
        if (addInput.value.trim()) {
          items.push(addInput.value.trim());
          addInput.value = "";
          renderList();
        }
      };
      addRow.appendChild(addInput);
      addRow.appendChild(addBtn);
      listWrap.appendChild(addRow);
    }

    renderList();
    wrap.appendChild(listWrap);
    container.appendChild(wrap);
    registerControl(path, () => items.slice());
  }

  // ---- root browser ----

  const ROOT_CSS_ID = "st-rootmodal-css";
  const ROOT_CSS = `
.st-rootmodal{ position:fixed; inset:0; z-index:600; display:none;
  align-items:center; justify-content:center; background:rgba(6,6,6,.7); }
.st-rootmodal.show{ display:flex; }
.st-rootmodal .st-rootbox{ width:min(640px, 92vw); max-height:82vh; overflow-y:auto;
  background:var(--surface-1,#1b1b1f); border:1px solid var(--border-2,#444); border-radius:10px;
  padding:18px 20px; box-shadow:0 24px 70px rgba(0,0,0,.7); }
.st-rootmodal .st-roothead{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.st-rootmodal .st-roothead h3{ margin:0; font-size:14px; }
.st-rootmodal .st-rootx{ flex:0 0 auto; width:24px; height:24px; padding:0; font-size:15px; line-height:1;
  border-radius:5px; cursor:pointer; }
.st-rootmodal .st-rootsub{ font-size:11px; line-height:1.5; margin:6px 0 14px; opacity:.7; }
.st-rootmodal .st-rootbtnrow{ display:flex; align-items:center; gap:8px; margin:4px 0; }
.st-rootmodal .st-rootscope{ font-size:9.5px; opacity:.6; flex:0 0 auto; }
.st-rootmodal .st-rootpath{ font-size:11px; border-radius:5px; padding:6px 8px;
  margin-bottom:8px; overflow-x:auto; white-space:nowrap; font-family:monospace;
  background:rgba(0,0,0,.3); }
.st-rootmodal .st-rootlist{ max-height:240px; overflow-y:auto; border-radius:6px;
  padding:4px; margin-bottom:10px; background:rgba(0,0,0,.3); }
.st-rootmodal .st-rootitem{ padding:5px 8px; font-size:11.5px; font-family:monospace;
  border-radius:4px; cursor:pointer; }
.st-rootmodal .st-rootitem:hover{ background:rgba(255,255,255,.08); }
`;

  function ensureRootCss() {
    if (document.getElementById(ROOT_CSS_ID)) return;
    const style = document.createElement("style");
    style.id = ROOT_CSS_ID;
    style.textContent = ROOT_CSS;
    document.head.appendChild(style);
  }

  function stEl(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // filesystem folder picker; commit takes the chosen path, opens at start
  function openRootBrowser(start, commit) {
    ensureRootCss();
    const stale = document.querySelector(".st-rootmodal");
    if (stale) stale.remove();

    const ov = stEl("div", "st-rootmodal");
    const box = stEl("div", "st-rootbox");
    const head = stEl("div", "st-roothead");
    head.appendChild(stEl("h3", null, "Workspace root"));
    const closeBtn = stEl("button", "st-rootx", "×");
    closeBtn.type = "button";
    head.appendChild(closeBtn);
    box.appendChild(head);
    box.appendChild(stEl("div", "st-rootsub",
      "Browse the filesystem and pick a folder. Select copies the path into "
      + "root — nothing else changes; update default submits it."));
    const body = stEl("div", "st-rootbody");
    box.appendChild(body);
    ov.appendChild(box);
    document.body.appendChild(ov);

    const pathLine = stEl("div", "st-rootpath");
    const listBox = stEl("div", "st-rootlist");
    const selectRow = stEl("div", "st-rootbtnrow");
    const selectBtn = stEl("button", "st-rootbtn", "Select");
    selectBtn.type = "button";
    selectRow.appendChild(selectBtn);
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

    function scopeLine(text) { return stEl("div", "st-rootscope", text); }

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
            const up = stEl("div", "st-rootitem", ".. (up one level)");
            up.addEventListener("click", () => loadDirs(parentOf(browsePath)));
            listBox.appendChild(up);
          }
          const dirs = Array.isArray(data.dirs) ? data.dirs : [];
          if (!dirs.length) listBox.appendChild(scopeLine("no subfolders"));
          for (const name of dirs) {
            const item = stEl("div", "st-rootitem", name);
            item.addEventListener("click", () => loadDirs(joinPath(browsePath, name)));
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
  }

  // workspace root — its own config file, not global.json, so this section
  // acts on its own button and registers no control for the shared save
  async function buildWorkspaceRoot(container) {
    const section = fieldGroup("workspace root");
    const wrap = fieldRow("root");

    const input = document.createElement("input");
    input.type = "text";
    wrap.appendChild(input);

    const browse = document.createElement("button");
    browse.type = "button";
    browse.textContent = "browse";
    browse.onclick = () => openRootBrowser(input.value.trim(), (p) => { input.value = p; });
    wrap.appendChild(browse);

    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "update default";
    wrap.appendChild(apply);

    const note = document.createElement("span");
    note.className = "field-note";
    wrap.appendChild(note);

    section.appendChild(wrap);
    container.appendChild(section);

    try {
      const r = await fetch("/api/workspace-root");
      const d = await r.json();
      input.value = d.root || "";
      note.textContent = d.default ? "default " + d.default : "";
    } catch (e) { /* leave blank */ }

    apply.onclick = async () => {
      const path = input.value.trim();
      if (!path) return;
      try {
        const r = await fetch("/api/workspace-root", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: path }),
        });
        const d = await r.json();
        note.textContent = d.result || "";
        if (d.root) input.value = d.root;
      } catch (e) {
        note.textContent = "update failed";
      }
    };
  }

  function buildModels(container) {
    const section = fieldGroup("models");
    buildListField(section, "order", ["models", "order"]);
    buildListField(section, "hidden", ["models", "hidden"]);
    container.appendChild(section);
  }

  async function renderOpenSessions() {
    const el = document.getElementById("open-sessions-body");
    const data = await Api.listOpenSessions();
    el.innerHTML = "";
    for (const row of data.list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.name || "(unnamed)"}</td>
        <td>${row.saved ? "saved" : "unsaved"}</td>
        <td>${row.saved_ts ? new Date(row.saved_ts).toLocaleString() : ""}</td>
        <td>${row.tracks}</td>
        <td>${row.windows}</td>
        <td class="actions">
          <button data-act="select">Select</button>
          <button data-act="start">Start Matrix Window</button>
          <button data-act="save">Save</button>
          <button data-act="end">End</button>
        </td>`;
      tr.querySelector('[data-act="select"]').onclick = () => selectSession(row.id);
      tr.querySelector('[data-act="start"]').onclick = () => window.open(`/matrix/${row.id}`, "_blank");
      tr.querySelector('[data-act="save"]').onclick = () => Api.saveSession(row.id, row.name).then(renderOpenSessions);
      tr.querySelector('[data-act="end"]').onclick = () => openEndModal(row.id);
      el.appendChild(tr);
    }
    updateDefaultButtonState();
  }

  function selectSession(sid) {
    selectedSid = sid;
    updateDefaultButtonState();
  }

  function updateDefaultButtonState() {
    const btn = document.getElementById("update-default-btn");
    if (btn) btn.disabled = !selectedSid;
  }

  function openEndModal(sid) {
    const modal = document.getElementById("end-modal");
    modal.hidden = false;
    modal.querySelector('[data-act="save"]').onclick = () =>
      Api.saveSession(sid, null).then(() => Api.endSession(sid)).then(() => {
        modal.hidden = true;
        renderOpenSessions();
        renderSavedSessions();
      });
    modal.querySelector('[data-act="end"]').onclick = () =>
      Api.endSession(sid).then(() => {
        modal.hidden = true;
        renderOpenSessions();
        renderSavedSessions();
      });
    modal.querySelector('[data-act="cancel"]').onclick = () => { modal.hidden = true; };
  }

  async function renderSavedSessions() {
    const el = document.getElementById("open-list-body");
    if (!el) return;
    const data = await Api.listSavedSessions();
    el.innerHTML = "";
    for (const row of data.list) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = row.name || "(unnamed)";
      a.onclick = (e) => {
        e.preventDefault();
        Api.openSavedSession(row.id).then((r) => {
          if (r.sid) window.open(`/matrix/${r.sid}`, "_blank");
        });
      };
      const stamp = document.createElement("span");
      stamp.textContent = row.saved ? " — " + new Date(row.saved).toLocaleString() : "";
      li.appendChild(a);
      li.appendChild(stamp);
      el.appendChild(li);
    }
  }

  async function renderGlobalForm() {
    loadedGlobal = await Api.getGlobal();
    controls = [];
    const form = document.getElementById("global-form");
    form.innerHTML = "";

    buildWorkspaceRoot(form);
    buildSkin(form);
    buildSimpleDropdown(form, "modal_mode", ["modal_mode"], MODAL_MODES);
    buildSimpleDropdown(form, "modal_mode_ade", ["modal_mode_ade"], ADE_MODAL_MODES);
    buildSimpleToggle(form, "gate_keyboard", ["gate_keyboard"]);
    buildSimpleToggle(form, "approve_hold", ["approve_hold"]);
    buildConfirm(form);
    buildKillswitch(form);
    buildKillHolds(form);
    buildVoices(form);
    buildModels(form);
  }

  function currentFormValues() {
    const updated = JSON.parse(JSON.stringify(loadedGlobal));
    for (const c of controls) setAtPath(updated, c.path, c.get());
    return updated;
  }

  async function saveGlobalForm() {
    const updated = currentFormValues();
    await Api.postGlobal(updated);
    await renderGlobalForm();
  }

  function wireUpdateDefaultModal() {
    const modal = document.getElementById("update-default-modal");
    document.getElementById("update-default-btn").onclick = () => {
      if (!selectedSid) return;
      modal.hidden = false;
    };
    // the current session values are the selected session's own tier
    modal.querySelector('[data-act="yes"]').onclick = async () => {
      let values = currentFormValues();
      if (selectedSid) {
        try {
          const r = await fetch("/api/session-settings/" + encodeURIComponent(selectedSid));
          const d = await r.json();
          if (d && d.effective) values = d.effective;
        } catch (e) { /* the form values stand */ }
      }
      await Api.updateDefault(values);
      modal.hidden = true;
      await renderGlobalForm();
    };
    modal.querySelector('[data-act="no"]').onclick = () => { modal.hidden = true; };
  }

  // shutdown suite — one line per live session: name, save checkbox, date/time
  function buildShutdownModal() {
    const overlay = document.createElement("div");
    overlay.id = "shutdown-suite-modal";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;" +
      "align-items:center;justify-content:center;z-index:1000;";
    overlay.hidden = true;

    const box = document.createElement("div");
    box.style.cssText = "background:#fff;color:#000;padding:16px;min-width:420px;" +
      "max-height:80vh;overflow:auto;";
    overlay.appendChild(box);

    const heading = document.createElement("h3");
    heading.textContent = "Shutdown Suite";
    box.appendChild(heading);

    const rowsWrap = document.createElement("div");
    rowsWrap.id = "shutdown-suite-rows";
    box.appendChild(rowsWrap);

    const btnRow = document.createElement("div");
    const archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.textContent = "Archive and shut down";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    btnRow.appendChild(archiveBtn);
    btnRow.appendChild(cancelBtn);
    box.appendChild(btnRow);

    cancelBtn.onclick = () => { overlay.hidden = true; };
    document.body.appendChild(overlay);
    return { overlay, rowsWrap, archiveBtn };
  }

  let shutdownModal = null;

  async function openShutdownModal() {
    if (!shutdownModal) shutdownModal = buildShutdownModal();
    const { overlay, rowsWrap, archiveBtn } = shutdownModal;
    const data = await Api.listOpenSessions();
    rowsWrap.innerHTML = "";
    const entries = [];
    for (const row of data.list) {
      const line = document.createElement("div");
      line.className = "field-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = row.name || "";

      const saveLabel = document.createElement("label");
      const saveCheck = document.createElement("input");
      saveCheck.type = "checkbox";
      saveCheck.checked = true;
      saveLabel.appendChild(saveCheck);
      saveLabel.appendChild(document.createTextNode(" save"));

      const stamp = document.createElement("span");
      stamp.textContent = row.saved_ts ? new Date(row.saved_ts).toLocaleString() : "";

      line.appendChild(nameInput);
      line.appendChild(saveLabel);
      line.appendChild(stamp);
      rowsWrap.appendChild(line);

      entries.push({ id: row.id, nameInput, saveCheck });
    }

    archiveBtn.onclick = async () => {
      const sessions = entries.map((e) => ({
        id: e.id, name: e.nameInput.value.trim(), save: e.saveCheck.checked,
      }));
      await Api.shutdownSuite(sessions);
      overlay.hidden = true;
    };

    overlay.hidden = false;
  }

  function buildShutdownButton() {
    const btn = document.createElement("button");
    btn.id = "shutdown-suite-btn";
    btn.type = "button";
    btn.textContent = "Shutdown Suite";
    btn.onclick = openShutdownModal;
    document.body.insertBefore(btn, document.body.firstChild);
  }

  async function init() {
    document.getElementById("new-session-btn").onclick = () =>
      Api.newSession().then((r) => window.open(`/matrix/${r.sid}`, "_blank"));
    document.getElementById("open-toggle-btn").onclick = () => {
      const el = document.getElementById("open-list");
      el.hidden = !el.hidden;
      if (!el.hidden) renderSavedSessions();
    };
    document.getElementById("global-save-btn").onclick = saveGlobalForm;
    buildShutdownButton();
    wireUpdateDefaultModal();
    await renderOpenSessions();
    await renderGlobalForm();
  }

  return { init };
})();
