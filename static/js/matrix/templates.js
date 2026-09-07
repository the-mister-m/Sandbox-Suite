// matrix templates — one window's grid and widget list, over /api/matrix-templates

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.templates = {
    async list() {
      try {
        const r = await fetch("/api/matrix-templates");
        const d = await r.json();
        return Array.isArray(d.list) ? d.list : [];
      } catch (e) {
        return [];
      }
    },

    async read(name) {
      const r = await fetch(`/api/matrix-templates/${encodeURIComponent(name)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "read failed");
      return d.template;
    },

    async write(name, body) {
      const r = await fetch(`/api/matrix-templates/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "write failed");
      return d;
    },

    async remove(name) {
      const r = await fetch(`/api/matrix-templates/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "delete failed");
      return d;
    },
  };
})();
