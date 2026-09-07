// suite api — thin fetch wrappers, one function per route

const Api = (() => {

  async function getJSON(url) {
    const r = await fetch(url);
    return r.json();
  }

  async function sendJSON(url, method, body) {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  }

  return {
    // global
    getGlobal:        () => getJSON("/api/global"),
    postGlobal:        (body) => sendJSON("/api/global", "POST", body),
    updateDefault:     (sessionValues) => sendJSON("/api/global/update-default", "POST", sessionValues),

    // sessions
    newSession:        () => sendJSON("/api/sessions/new", "POST"),
    openSavedSession:  (sid) => sendJSON(`/api/sessions/${sid}/open`, "POST"),
    listOpenSessions:  () => getJSON("/api/sessions/open"),
    saveSession:       (sid, name) => sendJSON(`/api/sessions/${sid}/save`, "POST", { name }),
    endSession:        (sid) => sendJSON(`/api/sessions/${sid}/end`, "POST"),
    shutdownSuite:     (sessions) => sendJSON("/api/shutdown-suite", "POST", { sessions }),
    listSavedSessions: () => getJSON("/api/ade-sessions"),
    deleteSavedSession: (sid) => fetch(`/api/ade-sessions/${sid}`, { method: "DELETE" }).then(r => r.json()),

    // session templates
    listSessionTemplates:  () => getJSON("/api/session-templates"),
    loadSessionTemplate:   (tid) => sendJSON(`/api/session-templates/${tid}/load`, "POST"),
    deleteSessionTemplate: (tid) => fetch(`/api/session-templates/${tid}`, { method: "DELETE" }).then(r => r.json()),

    // matrix templates (route Job 5 adds)
    listMatrixTemplates: () => getJSON("/api/matrix-templates"),

    // presets
    listPresets:   () => getJSON("/api/library/presets"),
    readPreset:    (name) => getJSON(`/api/library/presets/${encodeURIComponent(name)}`),
    writePreset:   (name, fields) => sendJSON(`/api/library/presets/${encodeURIComponent(name)}`, "POST", fields),
    deletePreset:  (name) => fetch(`/api/library/presets/${encodeURIComponent(name)}`, { method: "DELETE" }).then(r => r.json()),
    renamePreset:  (name, newName) => sendJSON(`/api/library/presets/${encodeURIComponent(name)}/rename`, "POST", { new: newName }),

    // providers, models
    listProviders: () => getJSON("/api/library/providers"),
    listModels:    () => getJSON("/api/library/models"),

    // voices (the global.json voices block)
    getVoices:     () => getJSON("/api/global").then(g => g.voices || {}),

    // context files
    listContextFiles: () => getJSON("/api/library/context-files"),
    readFile:         (path) => getJSON(`/api/fs/read?path=${encodeURIComponent(path)}`),
    writeFile:        (path, text) => sendJSON("/api/fs/write", "POST", { path, text }),
  };
})();
