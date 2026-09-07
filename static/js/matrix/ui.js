// matrix ui helpers — overlay panels and the three-button modal

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function button(label, cls, onClick) {
    const b = el("button", "mx-btn" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // an overlay closes on backdrop click; the panel it holds does not
  function overlay(title) {
    const wrap = el("div", "mx-overlay");
    const panel = el("div", "mx-panel");
    if (title) panel.appendChild(el("h3", null, title));
    wrap.appendChild(panel);
    wrap.addEventListener("click", (ev) => {
      if (ev.target === wrap) close();
    });
    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
    document.body.appendChild(wrap);
    return { wrap, panel, close };
  }

  function modal(title, question, choices) {
    const o = overlay(title);
    o.panel.appendChild(el("div", "mx-dim", question));
    const actions = el("div", "mx-actions");
    for (const c of choices) {
      actions.appendChild(button(c.label, c.cls, () => {
        o.close();
        c.run();
      }));
    }
    o.panel.appendChild(actions);
    return o;
  }

  function prompt(title, label, placeholder, onName) {
    const o = overlay(title);
    const row = el("div", "mx-row");
    row.appendChild(el("span", "mx-dim", label));
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder || "";
    row.appendChild(input);
    o.panel.appendChild(row);
    const actions = el("div", "mx-actions");
    actions.appendChild(button("Save", "mx-go", () => {
      const name = input.value.trim();
      if (!name) return;
      o.close();
      onName(name);
    }));
    actions.appendChild(button("Cancel", null, () => o.close()));
    o.panel.appendChild(actions);
    input.focus();
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        const name = input.value.trim();
        if (!name) return;
        o.close();
        onName(name);
      }
    });
    return o;
  }

  // a modal that answers: resolves the chosen button's value, "cancel" on backdrop
  function choose(title, message, buttons, extra) {
    return new Promise((resolve) => {
      const o = overlay(title);
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        o.close();
        resolve(value);
      };
      if (message) o.panel.appendChild(el("div", "mx-dim", message));
      if (extra) o.panel.appendChild(extra);
      const actions = el("div", "mx-actions");
      for (const b of buttons) {
        actions.appendChild(button(b.label, b.cls, () => done(b.value)));
      }
      o.panel.appendChild(actions);
      o.wrap.addEventListener("click", (ev) => {
        if (ev.target === o.wrap) done("cancel");
      });
    });
  }

  // a text prompt that answers: resolves the typed value, empty string on cancel
  function askText(title, label, placeholder) {
    return new Promise((resolve) => {
      const o = overlay(title);
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        o.close();
        resolve(value);
      };
      const row = el("div", "mx-row");
      row.appendChild(el("span", "mx-dim", label));
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = placeholder || "";
      row.appendChild(input);
      o.panel.appendChild(row);
      const actions = el("div", "mx-actions");
      actions.appendChild(button("OK", "mx-go", () => done(input.value.trim())));
      actions.appendChild(button("Cancel", null, () => done("")));
      o.panel.appendChild(actions);
      input.focus();
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") done(input.value.trim());
      });
      o.wrap.addEventListener("click", (ev) => {
        if (ev.target === o.wrap) done("");
      });
    });
  }

  MX.ui = { el, button, overlay, modal, prompt, choose, askText };
})();
