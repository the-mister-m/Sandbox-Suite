// widget picker dropdown — groups on the left, that group's widgets on the right

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const GROUP_ORDER = ["chat", "queue", "usertools", "agent", "adetools"];

  MX.widgetPicker = {
    open() {
      const ui = MX.ui;
      const anchor = document.getElementById("mxNewWidget");
      const rows = MX.registryRows();

      const groups = GROUP_ORDER.filter((g) => rows.some((r) => r.group === g));
      let activeGroup = groups[0] || null;

      const dd = ui.el("div", "mx-picker");
      const left = ui.el("div", "mx-picker-groups");
      const right = ui.el("div", "mx-picker-widgets");
      dd.appendChild(left);
      dd.appendChild(right);

      function renderGroups() {
        left.textContent = "";
        for (const g of groups) {
          const item = ui.el("div", "mx-picker-group" + (g === activeGroup ? " mx-picker-active" : ""), g);
          item.addEventListener("click", () => {
            activeGroup = g;
            renderGroups();
            renderWidgets();
          });
          left.appendChild(item);
        }
      }

      function renderWidgets() {
        right.textContent = "";
        const groupRows = rows.filter((r) => r.group === activeGroup);
        if (!groupRows.length) right.appendChild(ui.el("div", "mx-dim", "no widgets in this group"));
        for (const row of groupRows) {
          const has = !!MX.widgetModule(row.type);
          const item = ui.el("div", "mx-picker-widget" + (has ? "" : " mx-picker-disabled"));
          item.appendChild(ui.el("div", "mx-grow", row.label || row.type));
          item.appendChild(ui.el("span", "mx-dim", has ? row.type : "not built"));
          if (has) {
            item.addEventListener("click", () => {
              MX.grid.addWidget(row.type);
            });
          }
          right.appendChild(item);
        }
      }

      renderGroups();
      renderWidgets();
      document.body.appendChild(dd);

      // flip left/up when the dropdown would run off the viewport at the
      // anchor's corner
      const ar = anchor.getBoundingClientRect();
      const ddw = dd.offsetWidth;
      const ddh = dd.offsetHeight;
      const ddLeft = (ar.left + ddw > window.innerWidth) ? Math.max(0, ar.right - ddw) : ar.left;
      const ddTop = (ar.bottom + ddh > window.innerHeight) ? Math.max(0, ar.top - ddh) : ar.bottom;
      dd.style.top = ddTop + "px";
      dd.style.left = ddLeft + "px";

      function onOutside(ev) {
        if (!dd.contains(ev.target) && ev.target !== anchor) close();
      }
      function onKey(ev) {
        if (ev.key === "Escape") close();
      }
      function close() {
        if (dd.parentNode) dd.parentNode.removeChild(dd);
        document.removeEventListener("mousedown", onOutside, true);
        document.removeEventListener("keydown", onKey, true);
      }
      document.addEventListener("mousedown", onOutside, true);
      document.addEventListener("keydown", onKey, true);

      return { close };
    },
  };
})();
