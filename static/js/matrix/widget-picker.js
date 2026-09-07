// widget selection page — one entry per registry type, picking mounts an instance

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.widgetPicker = {
    open() {
      const ui = MX.ui;
      const o = ui.overlay("New Widget");
      const rows = MX.registryRows();

      if (!rows.length) o.panel.appendChild(ui.el("div", "mx-dim", "widget registry is empty"));

      // one column per registry row: label at top, Add button beneath
      const cols = ui.el("div", "mx-picker-cols");
      cols.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;";

      for (const row of rows) {
        const col = ui.el("div", "mx-picker-col");
        col.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:110px;";
        col.appendChild(ui.el("div", "mx-grow", row.label || row.type));
        col.appendChild(ui.el("span", "mx-dim", row.type));
        const has = !!MX.widgetModule(row.type);
        const add = ui.button(has ? "Add" : "not built", has ? "mx-go" : null, () => {
          if (!has) return;
          MX.grid.addWidget(row.type);
          o.close();
        });
        add.disabled = !has;
        col.appendChild(add);
        cols.appendChild(col);
      }
      o.panel.appendChild(cols);

      const actions = ui.el("div", "mx-actions");
      actions.appendChild(ui.button("Close", null, () => o.close()));
      o.panel.appendChild(actions);
      return o;
    },
  };
})();
