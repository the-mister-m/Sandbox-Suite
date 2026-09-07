// library — presets, providers, saved sessions, templates, models, voices, context files

const Library = (() => {

  const TABS = [
    { id: "presets",           label: "Presets",           render: renderPresets },
    { id: "providers",         label: "Providers",         render: renderProviders },
    { id: "saved-sessions",    label: "Saved Sessions",    render: renderSavedSessions },
    { id: "session-templates", label: "Session Templates", render: renderSessionTemplates },
    { id: "matrix-templates",  label: "Matrix Templates",  render: renderMatrixTemplates },
    { id: "models",            label: "Model Manager",     render: renderModels },
    { id: "voices",            label: "Voices",            render: renderVoices },
    { id: "context-files",     label: "Context Files",     render: renderContextFiles },
  ];

  function panelEl(id) {
    return document.getElementById(`lib-panel-${id}`);
  }

  async function renderPresets() {
    const el = panelEl("presets");
    const data = await Api.listPresets();
    el.innerHTML = `
      <ul id="preset-list"></ul>
      <div id="preset-editor" hidden>
        <div class="field-row"><label>name</label><input type="text" id="preset-name-input"></div>
        <textarea id="preset-fields" style="width:100%;min-height:200px;"></textarea>
        <div class="modal-actions">
          <button id="preset-save-btn">Save</button>
          <button id="preset-rename-btn">Rename</button>
          <button id="preset-delete-btn">Delete</button>
        </div>
      </div>`;
    const list = el.querySelector("#preset-list");
    for (const name of data.list) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#"; a.textContent = name;
      a.onclick = (e) => { e.preventDefault(); openPresetEditor(name); };
      li.appendChild(a);
      list.appendChild(li);
    }
    const newLi = document.createElement("li");
    const newA = document.createElement("a");
    newA.href = "#"; newA.textContent = "+ new preset";
    newA.onclick = (e) => { e.preventDefault(); openPresetEditor(""); };
    newLi.appendChild(newA);
    list.appendChild(newLi);
  }

  async function openPresetEditor(name) {
    const editor = panelEl("presets").querySelector("#preset-editor");
    editor.hidden = false;
    const nameInput = editor.querySelector("#preset-name-input");
    const fieldsArea = editor.querySelector("#preset-fields");
    nameInput.value = name;
    if (name) {
      const data = await Api.readPreset(name);
      fieldsArea.value = JSON.stringify(data.fields, null, 2);
    } else {
      fieldsArea.value = "{}";
    }
    editor.querySelector("#preset-save-btn").onclick = async () => {
      let fields;
      try { fields = JSON.parse(fieldsArea.value); } catch (e) { return; }
      await Api.writePreset(nameInput.value, fields);
      renderPresets();
    };
    editor.querySelector("#preset-rename-btn").onclick = async () => {
      const next = prompt("new preset name", nameInput.value);
      if (!next) return;
      await Api.renamePreset(nameInput.value, next);
      renderPresets();
    };
    editor.querySelector("#preset-delete-btn").onclick = async () => {
      await Api.deletePreset(nameInput.value);
      editor.hidden = true;
      renderPresets();
    };
  }

  async function renderProviders() {
    const el = panelEl("providers");
    const data = await Api.listProviders();
    const rows = data.list.map(p => `
      <tr><td>${p.label}</td><td>${p.id}</td><td>${p.kind}</td></tr>`).join("");
    el.innerHTML = `<table class="rows"><thead>
      <tr><th>label</th><th>id</th><th>kind</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  // transcripts inline for one saved session, same route the transcript widget uses
  async function loadTranscripts(sid, holder) {
    holder.innerHTML = "reading…";
    try {
      const r = await fetch("/api/transcripts?sid=" + encodeURIComponent(sid));
      const j = await r.json();
      const session = (j.sessions || [])[0];
      const regions = session ? session.regions.slice() : [];
      regions.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
      if (!regions.length) { holder.innerHTML = "<div class=\"lib-tr-empty\">no regions</div>"; return; }
      holder.innerHTML = "";
      for (const reg of regions) {
        const regRow = document.createElement("div");
        regRow.className = "lib-tr-region";
        regRow.textContent = (reg.live ? "● " : "○ ") + reg.name;
        holder.appendChild(regRow);
        for (const c of (reg.caches || [])) {
          const cacheRow = document.createElement("div");
          cacheRow.className = "lib-tr-cache";
          cacheRow.textContent = c.cache == null ? "cache" : ("cache " + c.cache);
          cacheRow.style.cursor = "pointer";
          const preview = document.createElement("pre");
          preview.className = "lib-tr-preview";
          preview.hidden = true;
          cacheRow.onclick = async () => {
            if (!preview.hidden) { preview.hidden = true; return; }
            preview.hidden = false;
            preview.textContent = "reading…";
            const url = "/api/retired-chats/" + encodeURIComponent(sid) + "/" + encodeURIComponent(reg.id) +
              (c.cache == null ? "" : "?cache=" + encodeURIComponent(c.cache));
            try {
              const rr = await fetch(url);
              const jj = await rr.json();
              const msgs = jj.messages || [];
              preview.textContent = msgs.map(m => (m.role || "?") + ": " +
                (typeof m.content === "string" ? m.content : "")).join("\n\n") || "(no turns)";
            } catch (e) {
              preview.textContent = "could not read this cache";
            }
          };
          holder.appendChild(cacheRow);
          holder.appendChild(preview);
        }
      }
    } catch (e) {
      holder.innerHTML = "<div class=\"lib-tr-empty\">could not read transcripts</div>";
    }
  }

  async function renderSavedSessions() {
    const el = panelEl("saved-sessions");
    const data = await Api.listSavedSessions();
    const g = await Api.getGlobal();
    const archivesOn = !!(g && g.library_archives);
    el.innerHTML = "";
    const table = document.createElement("table");
    table.className = "rows";
    table.innerHTML = "<thead><tr><th>name</th><th>created</th><th>tracks</th><th></th></tr></thead>";
    const tbody = document.createElement("tbody");
    for (const row of data.list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.name || "(unnamed)"}</td><td>${row.created}</td><td>${row.tracks}</td>
        <td class="actions"><button data-act="open">Open</button><button data-act="delete">Delete</button>${
          archivesOn ? '<button data-act="transcripts">Transcripts</button>' : ""}</td>`;
      tr.querySelector('[data-act="open"]').onclick = () =>
        Api.openSavedSession(row.id).then(r => { if (r.sid) window.open(`/matrix/${r.sid}`, "_blank"); });
      tr.querySelector('[data-act="delete"]').onclick = () =>
        Api.deleteSavedSession(row.id).then(renderSavedSessions);
      tbody.appendChild(tr);
      if (archivesOn) {
        const transRow = document.createElement("tr");
        transRow.className = "lib-transcripts-row";
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "lib-tr-holder";
        transRow.appendChild(td);
        transRow.hidden = true;
        tbody.appendChild(transRow);
        tr.querySelector('[data-act="transcripts"]').onclick = () => {
          transRow.hidden = !transRow.hidden;
          if (!transRow.hidden) loadTranscripts(row.id, td);
        };
      }
    }
    table.appendChild(tbody);
    el.appendChild(table);
  }

  async function renderSessionTemplates() {
    const el = panelEl("session-templates");
    const data = await Api.listSessionTemplates();
    el.innerHTML = "";
    const table = document.createElement("table");
    table.className = "rows";
    table.innerHTML = "<thead><tr><th>name</th><th></th></tr></thead>";
    const tbody = document.createElement("tbody");
    for (const row of data.list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.name || "(unnamed)"}</td>
        <td class="actions"><button data-act="load">Load into new session</button><button data-act="delete">Delete</button></td>`;
      tr.querySelector('[data-act="load"]').onclick = () =>
        Api.loadSessionTemplate(row.id).then(r => { if (r.sid) window.open(`/matrix/${r.sid}`, "_blank"); });
      tr.querySelector('[data-act="delete"]').onclick = () =>
        Api.deleteSessionTemplate(row.id).then(renderSessionTemplates);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    el.appendChild(table);
  }

  async function renderMatrixTemplates() {
    const el = panelEl("matrix-templates");
    if (typeof Api.listMatrixTemplates !== "function") {
      el.innerHTML = `<p class="empty-note">matrix templates route pending</p>`;
      return;
    }
    try {
      const data = await Api.listMatrixTemplates();
      el.innerHTML = "<ul>" + data.list.map(n => `<li>${n}</li>`).join("") + "</ul>";
    } catch (e) {
      el.innerHTML = `<p class="empty-note">matrix templates route pending</p>`;
    }
  }

  async function renderModels() {
    const el = panelEl("models");
    const data = await Api.listModels();
    const hidden = new Set(data.hidden || []);
    el.innerHTML = "";
    const table = document.createElement("table");
    table.className = "rows";
    table.innerHTML = "<thead><tr><th>provider</th><th>model</th><th>version</th><th>hidden</th></tr></thead>";
    const tbody = document.createElement("tbody");
    for (const row of data.list) {
      const tr = document.createElement("tr");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = hidden.has(row.id);
      cb.onchange = async () => {
        if (cb.checked) hidden.add(row.id); else hidden.delete(row.id);
        await Api.postGlobal({ models: { hidden: Array.from(hidden) } });
      };
      tr.innerHTML = `<td>${row.provider}</td><td>${row.model}</td><td>${row.version || ""}</td>`;
      const td = document.createElement("td");
      td.appendChild(cb);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    el.appendChild(table);
  }

  async function renderVoices() {
    const el = panelEl("voices");
    const voices = await Api.getVoices();
    el.innerHTML = "";
    const keys = Object.keys(voices);
    const form = document.createElement("div");
    for (const k of keys) {
      const wrap = document.createElement("div");
      wrap.className = "field-row";
      wrap.innerHTML = `<label>${k}</label><input type="text" data-key="${k}" value="${voices[k]}">`;
      form.appendChild(wrap);
    }
    const save = document.createElement("button");
    save.textContent = "Save";
    save.onclick = async () => {
      const out = {};
      for (const k of keys) out[k] = form.querySelector(`[data-key="${k}"]`).value;
      await Api.postGlobal({ voices: out });
      renderVoices();
    };
    el.appendChild(form);
    el.appendChild(save);
  }

  async function renderContextFiles() {
    const el = panelEl("context-files");
    const data = await Api.listContextFiles();
    el.innerHTML = `<ul id="context-file-list"></ul>
      <div id="context-file-editor" hidden>
        <textarea id="context-file-text" style="width:100%;min-height:240px;"></textarea>
        <div class="modal-actions"><button id="context-file-save">Save</button></div>
      </div>`;
    const list = el.querySelector("#context-file-list");
    for (const f of data.list) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#"; a.textContent = `${f.kind}/${f.name}`;
      a.onclick = async (e) => {
        e.preventDefault();
        const editor = el.querySelector("#context-file-editor");
        const text = el.querySelector("#context-file-text");
        editor.hidden = false;
        const r = await Api.readFile(f.path);
        text.value = r.text || "";
        el.querySelector("#context-file-save").onclick = () => Api.writeFile(f.path, text.value);
      };
      li.appendChild(a);
      list.appendChild(li);
    }
  }

  function activateTab(id) {
    for (const t of TABS) {
      document.getElementById(`lib-tab-${t.id}`).classList.toggle("active", t.id === id);
      panelEl(t.id).hidden = t.id !== id;
    }
    const tab = TABS.find(t => t.id === id);
    tab.render();
  }

  function init() {
    const tabsEl = document.getElementById("library-tabs");
    const panelsEl = document.getElementById("library-panels");
    for (const t of TABS) {
      const btn = document.createElement("button");
      btn.id = `lib-tab-${t.id}`;
      btn.textContent = t.label;
      btn.onclick = () => activateTab(t.id);
      tabsEl.appendChild(btn);

      const panel = document.createElement("div");
      panel.id = `lib-panel-${t.id}`;
      panel.className = "library-panel";
      panel.hidden = true;
      panelsEl.appendChild(panel);
    }
    activateTab(TABS[0].id);
  }

  return { init };
})();
