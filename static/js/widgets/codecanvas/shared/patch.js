// canvas patch — file-mode patcher, the Open Design source-patches slice
//
// MX.canvasPatch(): {parse, serialize, assignIds, find, apply,
// applyToDoc, normalize, newId, history, domPath, stableId,
// HOST_NODE_SELECTOR, KINDS}.
// parse(text) returns a Document, serialize(doc) the text back. A body
// fragment round-trips as a fragment, a full document as a full
// document; parse marks which on the doc, serialize(doc, original)
// overrides.
// assignIds(doc) stamps data-od-id from the dom path on every body
// element that lacks one. find(doc, id) walks data-od-id,
// data-od-runtime-id, data-od-source-path, then path-N-N, or resolves
// "__body__" to the body.
// applyToDoc(doc, patch) mutates doc for one patch, returns
// {ok, inverse}. Kinds: set-style, replace-outer-html, set-css-token,
// set-text, wrap, unwrap, move, remove, insert. set-full-source is
// refused here; it only applies through apply. The Open Design kind
// names set-outer-html and set-token are accepted as aliases.
// apply(text, patch) parses, calls applyToDoc, serializes, returns
// {text, inverse}. A refused patch returns {text: text, inverse: null}
// and the input text is unchanged.
// normalize(text) parses, assignIds, serializes, returns {text, n}.
// newId(prefix) returns "prefix_" plus six lowercase alphanumerics.
// history() holds an undo/redo stack of {patches, inverses} entries.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  var HOST_NODE_SELECTOR = [
    '[data-od-sandbox-shim]',
    '[data-od-deck-bridge]',
    '[data-od-comment-bridge]',
    '[data-od-edit-bridge]',
    '[data-od-comment-bridge-style]',
    '[data-od-edit-bridge-style]',
    '[data-od-deck-fix]'
  ].join(',');

  var KINDS = [
    "set-style", "replace-outer-html", "set-css-token",
    "set-text", "set-full-source",
    "wrap", "unwrap", "move", "remove", "insert",
    "set-attr", "set-css-rule", "remove-css-rule"
  ];

  var ALIAS = {
    "set-outer-html": "replace-outer-html",
    "set-token": "set-css-token"
  };

  var FULL_DOC_FLAG = "__ccFullDocument";

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function camelToKebab(value) {
    return String(value).replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
  }

  // function: leading comments and processing instructions skipped.
  function firstSourceToken(source) {
    var rest = String(source).trimStart();
    while (rest.startsWith("<!--") || rest.startsWith("<?")) {
      var close = rest.startsWith("<!--") ? "-->" : "?>";
      var end = rest.indexOf(close);
      if (end === -1) return rest;
      rest = rest.slice(end + close.length).trimStart();
    }
    return rest;
  }

  // function: true when the text is a whole html document, not a fragment.
  function isFullHtmlDocument(source) {
    var normalized = firstSourceToken(source).slice(0, 32).toLowerCase();
    return normalized.startsWith("<!doctype") || normalized.startsWith("<html");
  }

  function isHostNode(el) {
    return !!(el.matches && el.matches(HOST_NODE_SELECTOR));
  }

  // function: an element's index path from body, host nodes skipped.
  function domPath(el) {
    var parts = [];
    var node = el;
    while (node && node !== (node.ownerDocument && node.ownerDocument.body)) {
      var parentEl = node.parentElement;
      if (!parentEl) break;
      var children = Array.prototype.slice.call(parentEl.children)
        .filter(function (child) { return !isHostNode(child); });
      parts.unshift(children.indexOf(node));
      node = parentEl;
    }
    return parts.length ? "path-" + parts.join("-") : "";
  }

  // function: the element's stable id, stamped when it had none.
  function stableId(el) {
    var explicit = el.getAttribute("data-od-id");
    if (explicit) return explicit;
    var generated = el.getAttribute("data-od-source-path")
      || el.getAttribute("data-od-runtime-id")
      || domPath(el);
    if (generated) el.setAttribute("data-od-runtime-id", generated);
    return generated || "unknown";
  }

  function parse(text) {
    var doc = null;
    if (typeof DOMParser !== "undefined") {
      doc = new DOMParser().parseFromString(String(text), "text/html");
    } else if (typeof document !== "undefined") {
      doc = document.implementation.createHTMLDocument("");
      doc.documentElement.innerHTML = String(text);
    }
    if (doc) doc[FULL_DOC_FLAG] = isFullHtmlDocument(text);
    return doc;
  }

  function serialize(doc, originalSource) {
    var full = (originalSource !== undefined && originalSource !== null)
      ? isFullHtmlDocument(originalSource)
      : !!doc[FULL_DOC_FLAG];
    if (!full) return doc.body.innerHTML;
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  // function: stamp data-od-id on every body element that lacks one.
  function assignIds(doc) {
    var all = doc.body ? doc.body.querySelectorAll("*") : [];
    var n = 0;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.getAttribute("data-od-id")) continue;
      if (isHostNode(el)) continue;
      var path = domPath(el);
      if (!path) continue;
      el.setAttribute("data-od-id", path);
      n++;
    }
    return n;
  }

  // function: an element from a path-N-N id, walking children by index.
  function findElementByPath(doc, id) {
    if (String(id).indexOf("path-") !== 0) return null;
    var indexes = String(id).slice(5).split("-").map(Number);
    for (var i = 0; i < indexes.length; i++) {
      if (!Number.isInteger(indexes[i]) || indexes[i] < 0) return null;
    }
    var current = doc.body;
    for (var j = 0; j < indexes.length; j++) {
      current = (current && current.children.item(indexes[j])) || null;
      if (!current) return null;
    }
    return current;
  }

  function find(doc, id) {
    if (id === "__body__") return doc.body;
    return doc.querySelector('[data-od-id="' + cssEscape(id) + '"]')
      || doc.querySelector('[data-od-runtime-id="' + cssEscape(id) + '"]')
      || doc.querySelector('[data-od-source-path="' + cssEscape(id) + '"]')
      || findElementByPath(doc, id);
  }

  // function: a parent's element children, host nodes skipped.
  function childrenOf(parent) {
    if (!parent) return [];
    return Array.prototype.slice.call(parent.children)
      .filter(function (child) { return !isHostNode(child); });
  }

  // function: an element's siblings, host nodes skipped.
  function siblingsOf(el) {
    return el ? childrenOf(el.parentElement) : [];
  }

  // function: the child at a non-host-node index, or null past the end.
  function childAt(parent, index) {
    var kids = childrenOf(parent);
    return (index >= 0 && index < kids.length) ? kids[index] : null;
  }

  function hasElementChildren(el) {
    return Array.prototype.slice.call(el.children)
      .some(function (child) { return child.nodeType === 1; });
  }

  // function: the one text node in the subtree carrying visible text,
  // or null the moment a second one shows up.
  function soleMeaningfulTextNode(el) {
    var found = null;
    var ambiguous = false;
    function visit(node) {
      if (ambiguous) return;
      var children = node.childNodes;
      for (var i = 0; i < children.length && !ambiguous; i++) {
        var child = children[i];
        if (child.nodeType === 3) {
          var parentTag = (child.parentElement && child.parentElement.tagName || "").toLowerCase();
          var inert = parentTag === "script" || parentTag === "style" || parentTag === "template";
          if (!inert && String(child.nodeValue || "").trim() !== "") {
            if (found) { ambiguous = true; return; }
            found = child;
          }
        } else if (child.nodeType === 1) {
          visit(child);
        }
      }
    }
    visit(el);
    return ambiguous ? null : found;
  }

  // function: write inline styles. An empty value removes the property.
  function setInlineStyles(el, styles) {
    var keys = Object.keys(styles || {});
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var value = styles[name];
      var cssName = camelToKebab(name);
      if (typeof value !== "string" || value.trim() === "") el.style.removeProperty(cssName);
      else el.style.setProperty(cssName, value.trim());
    }
  }

  // function: swap an element for one parsed root, ids carried over.
  function replaceOuterHtml(doc, el, html) {
    var template = doc.createElement("template");
    template.innerHTML = String(html).trim();
    var elements = Array.prototype.slice.call(template.content.children);
    if (elements.length !== 1) {
      return { ok: false, error: "Replacement HTML must contain exactly one root element." };
    }
    var next = elements[0];
    if (el.getAttribute("data-od-id") && !next.getAttribute("data-od-id")) {
      next.setAttribute("data-od-id", el.getAttribute("data-od-id") || "");
    }
    if (el.getAttribute("data-od-edit") && !next.getAttribute("data-od-edit")) {
      next.setAttribute("data-od-edit", el.getAttribute("data-od-edit") || "");
    }
    el.replaceWith(next);
    return { ok: true, next: next };
  }

  // function: rewrite one declaration inside the first style block holding it,
  // returns the prior value for the inverse.
  function setCssToken(doc, token, value) {
    var styles = Array.prototype.slice.call(doc.querySelectorAll("style"));
    var pattern = new RegExp("(" + escapeRegExp(token) + "\\s*:\\s*)([^;]+)(;)");
    for (var i = 0; i < styles.length; i++) {
      var text = styles[i].textContent || "";
      var match = text.match(pattern);
      if (!match) continue;
      styles[i].textContent = text.replace(pattern, "$1" + value + "$3");
      return { ok: true, prev: match[2] };
    }
    return { ok: false, prev: null };
  }

  // function: the id a parent resolves to for an inverse patch: __body__
  // for the body, its own data-od-id else a stamped stable id.
  function parentKeyFor(doc, parent) {
    if (!parent) return null;
    if (parent === doc.body) return "__body__";
    return parent.getAttribute("data-od-id") || stableId(parent);
  }

  // function: set-style. inverse: set-style with the prior values.
  function doSetStyle(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: target not found:", patch.id);
      return null;
    }
    var styles = patch.styles || {};
    var keys = Object.keys(styles);
    var prior = {};
    for (var i = 0; i < keys.length; i++) {
      var cssName = camelToKebab(keys[i]);
      prior[keys[i]] = el.style.getPropertyValue(cssName) || "";
    }
    setInlineStyles(el, styles);
    if (el.style.length === 0) el.removeAttribute("style");
    return { ok: true, inverse: { kind: "set-style", id: patch.id, styles: prior } };
  }

  // function: set-text. inverse: set-text with the prior text.
  function doSetText(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: target not found:", patch.id);
      return null;
    }
    var prior;
    if (hasElementChildren(el)) {
      var soleText = soleMeaningfulTextNode(el);
      if (!soleText) {
        console.warn("canvasPatch: nested markup, set-text refused:", patch.id);
        return null;
      }
      prior = soleText.nodeValue;
      soleText.nodeValue = patch.value;
    } else {
      prior = el.textContent;
      el.textContent = patch.value;
    }
    return { ok: true, inverse: { kind: "set-text", id: patch.id, value: prior } };
  }

  // function: replace-outer-html. inverse: replace-outer-html with the
  // prior outerHTML, targeting the id the replacement now carries.
  function doReplaceOuterHtml(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: target not found:", patch.id);
      return null;
    }
    var priorHtml = el.outerHTML;
    var replaced = replaceOuterHtml(doc, el, patch.html);
    if (!replaced.ok) {
      console.warn("canvasPatch:", replaced.error);
      return null;
    }
    var targetId = replaced.next.getAttribute("data-od-id") || patch.id;
    return { ok: true, inverse: { kind: "replace-outer-html", id: targetId, html: priorHtml } };
  }

  // function: set-css-token. inverse: set-css-token with the prior value.
  function doSetCssToken(doc, patch) {
    var result = setCssToken(doc, patch.token, patch.value);
    if (!result.ok) {
      console.warn("canvasPatch: token not found:", patch.token);
      return null;
    }
    return { ok: true, inverse: { kind: "set-css-token", token: patch.token, value: result.prev } };
  }

  // function: wrap. tag: element name for the wrapper, "div" when absent.
  // A given tag skips the data-od-group stamp — a plain-tag wrapper is
  // structural (e.g. contract 3.1's section layer), not an undo group.
  // inverse: unwrap the same id.
  function doWrap(doc, patch) {
    var ids = patch.ids || [];
    if (!ids.length) {
      console.warn("canvasPatch: wrap refused, no ids:", patch.id);
      return null;
    }
    var elements = ids.map(function (id) { return find(doc, id); });
    for (var i = 0; i < elements.length; i++) {
      if (!elements[i]) {
        console.warn("canvasPatch: wrap target not found:", ids[i]);
        return null;
      }
    }
    var parent = elements[0].parentElement;
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].parentElement !== parent) {
        console.warn("canvasPatch: wrap refused, not siblings:", patch.id);
        return null;
      }
    }
    var kids = childrenOf(parent);
    var selected = kids.filter(function (kid) { return elements.indexOf(kid) !== -1; });
    var slots = selected.map(function (kid) { return kids.indexOf(kid); });
    var wrapper = doc.createElement(patch.tag || "div");
    wrapper.setAttribute("data-od-id", patch.id);
    if (!patch.tag) wrapper.setAttribute("data-od-group", "1");
    parent.insertBefore(wrapper, selected[0]);
    for (var k = 0; k < selected.length; k++) wrapper.appendChild(selected[k]);
    return { ok: true, inverse: { kind: "unwrap", id: patch.id, slots: slots } };
  }

  // function: unwrap. slots: original index per child, restored when present.
  // Targets a data-od-group wrapper or a wrap.tag structural wrapper (no
  // group stamp to check). inverse: wrap the same children back into the
  // same id (data-od-group only; a tag wrapper's tag is not recoverable
  // from the inverse alone).
  function doUnwrap(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: unwrap target not found:", patch.id);
      return null;
    }
    var parent = el.parentElement;
    if (!parent) {
      console.warn("canvasPatch: unwrap refused, detached:", patch.id);
      return null;
    }
    var kids = childrenOf(el);
    var childIds = kids.map(function (kid) { return kid.getAttribute("data-od-id") || stableId(kid); });
    var slots = Array.isArray(patch.slots) && patch.slots.length === kids.length ? patch.slots : null;
    if (slots) {
      el.remove();
      for (var s = 0; s < kids.length; s++) {
        var siblings = childrenOf(parent);
        parent.insertBefore(kids[s], siblings[slots[s]] || null);
      }
    } else {
      for (var i = 0; i < kids.length; i++) parent.insertBefore(kids[i], el);
      el.remove();
    }
    return { ok: true, inverse: { kind: "wrap", ids: childIds, id: patch.id } };
  }

  // function: move. inverse: move back to the prior parent and index.
  function doMove(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: move target not found:", patch.id);
      return null;
    }
    var newParent = find(doc, patch.parent);
    if (!newParent) {
      console.warn("canvasPatch: move parent not found:", patch.parent);
      return null;
    }
    var oldParent = el.parentElement;
    if (!oldParent) {
      console.warn("canvasPatch: move refused, detached:", patch.id);
      return null;
    }
    var oldParentKey = parentKeyFor(doc, oldParent);
    var oldIndex = siblingsOf(el).indexOf(el);
    el.remove();
    var ref = childAt(newParent, patch.index);
    if (ref) newParent.insertBefore(el, ref);
    else newParent.appendChild(el);
    return { ok: true, inverse: { kind: "move", id: patch.id, parent: oldParentKey, index: oldIndex } };
  }

  // function: remove. inverse: insert the same html back at the same slot.
  function doRemove(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: remove target not found:", patch.id);
      return null;
    }
    var parent = el.parentElement;
    if (!parent) {
      console.warn("canvasPatch: remove refused, detached:", patch.id);
      return null;
    }
    var parentKey = parentKeyFor(doc, parent);
    var index = siblingsOf(el).indexOf(el);
    var html = el.outerHTML;
    el.remove();
    return { ok: true, inverse: { kind: "insert", parent: parentKey, index: index, html: html } };
  }

  // function: insert. ns "svg" parses html inside an <svg> template so
  // the root and its children land in the SVG namespace.
  // inverse: remove the inserted root by its id.
  function doInsert(doc, patch) {
    var parent = find(doc, patch.parent);
    if (!parent) {
      console.warn("canvasPatch: insert parent not found:", patch.parent);
      return null;
    }
    var template = doc.createElement("template");
    var root;
    if (patch.ns === "svg") {
      template.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">'
        + String(patch.html || "").trim() + "</svg>";
      var svg = template.content.firstElementChild;
      var svgKids = svg ? Array.prototype.slice.call(svg.children) : [];
      if (svgKids.length !== 1) {
        console.warn("canvasPatch: insert svg html must contain exactly one root element.");
        return null;
      }
      root = svgKids[0];
    } else {
      template.innerHTML = String(patch.html || "").trim();
      var elements = Array.prototype.slice.call(template.content.children);
      if (elements.length !== 1) {
        console.warn("canvasPatch: insert html must contain exactly one root element.");
        return null;
      }
      root = elements[0];
    }
    if (!root.getAttribute("data-od-id")) root.setAttribute("data-od-id", newId("el"));
    var descendants = root.querySelectorAll("*");
    for (var i = 0; i < descendants.length; i++) {
      if (!descendants[i].getAttribute("data-od-id")) descendants[i].setAttribute("data-od-id", newId("el"));
    }
    var ref = childAt(parent, patch.index);
    if (ref) parent.insertBefore(root, ref);
    else parent.appendChild(root);
    return { ok: true, inverse: { kind: "remove", id: root.getAttribute("data-od-id") } };
  }

  // function: the <style data-cc="block"> element in head, created and
  // appended when create is true and none exists.
  function styleBlock(doc, block, create) {
    var head = doc.head || doc.querySelector("head");
    if (!head) return null;
    var el = head.querySelector('style[data-cc="' + cssEscape(block) + '"]');
    if (!el && create) {
      el = doc.createElement("style");
      el.setAttribute("data-cc", block);
      head.appendChild(el);
    }
    return el;
  }

  // function: a rule pattern matching "selector { declarations }" text
  // for one exact selector, whitespace before the brace only.
  function cssRulePattern(selector) {
    return new RegExp("(" + escapeRegExp(selector) + ")\\s*\\{([^}]*)\\}");
  }

  // function: set-attr. null value removes the attribute.
  // inverse: set-attr with the prior value or null.
  function doSetAttr(doc, patch) {
    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: target not found:", patch.id);
      return null;
    }
    var name = patch.name;
    if (String(name).indexOf("data-od-") === 0) {
      console.warn("canvasPatch: set-attr refused, data-od- name:", name);
      return null;
    }
    var prior = el.hasAttribute(name) ? el.getAttribute(name) : null;
    if (patch.value === null) el.removeAttribute(name);
    else el.setAttribute(name, patch.value);
    return { ok: true, inverse: { kind: "set-attr", id: patch.id, name: name, value: prior } };
  }

  // function: set-css-rule. Replaces the rule's declarations, or
  // appends it when absent. inverse: set-css-rule with the prior
  // declarations, or remove-css-rule when the rule was new.
  function doSetCssRule(doc, patch) {
    var el = styleBlock(doc, patch.block, true);
    var text = el.textContent || "";
    var pattern = cssRulePattern(patch.selector);
    var match = text.match(pattern);
    var prior;
    if (match) {
      prior = match[2].trim();
      text = text.replace(pattern, "$1 { " + patch.declarations + " }");
    } else {
      prior = null;
      text = (text.trim() ? text.replace(/\s*$/, "") + "\n" : "")
        + patch.selector + " { " + patch.declarations + " }";
    }
    el.textContent = text;
    var inverse = (prior === null)
      ? { kind: "remove-css-rule", block: patch.block, selector: patch.selector }
      : { kind: "set-css-rule", block: patch.block, selector: patch.selector, declarations: prior };
    return { ok: true, inverse: inverse };
  }

  // function: remove-css-rule. inverse: set-css-rule with the removed
  // declarations. Refused when the rule is absent.
  function doRemoveCssRule(doc, patch) {
    var el = styleBlock(doc, patch.block, false);
    var text = el ? (el.textContent || "") : "";
    var pattern = cssRulePattern(patch.selector);
    var match = text.match(pattern);
    if (!el || !match) {
      console.warn("canvasPatch: css rule not found:", patch.selector);
      return null;
    }
    var declarations = match[2].trim();
    var remaining = text.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trim();
    if (remaining) el.textContent = remaining;
    else el.remove();
    return { ok: true, inverse: { kind: "set-css-rule", block: patch.block, selector: patch.selector, declarations: declarations } };
  }

  // function: mutate one patch into a live document. {ok, inverse}.
  // set-full-source is refused here; it only applies through apply().
  function applyToDoc(doc, patch) {
    if (!patch) return { ok: false, inverse: null };
    var kind = ALIAS[patch.kind] || patch.kind;
    var result;
    if (kind === "set-full-source") {
      console.warn("canvasPatch: set-full-source refused on a live document");
      result = null;
    } else if (kind === "set-style") result = doSetStyle(doc, patch);
    else if (kind === "set-text") result = doSetText(doc, patch);
    else if (kind === "replace-outer-html") result = doReplaceOuterHtml(doc, patch);
    else if (kind === "set-css-token") result = doSetCssToken(doc, patch);
    else if (kind === "wrap") result = doWrap(doc, patch);
    else if (kind === "unwrap") result = doUnwrap(doc, patch);
    else if (kind === "move") result = doMove(doc, patch);
    else if (kind === "remove") result = doRemove(doc, patch);
    else if (kind === "insert") result = doInsert(doc, patch);
    else if (kind === "set-attr") result = doSetAttr(doc, patch);
    else if (kind === "set-css-rule") result = doSetCssRule(doc, patch);
    else if (kind === "remove-css-rule") result = doRemoveCssRule(doc, patch);
    else {
      console.warn("canvasPatch: unknown patch kind:", patch.kind);
      result = null;
    }
    return result || { ok: false, inverse: null };
  }

  // function: parse, applyToDoc, serialize. {text, inverse}. A refused
  // patch returns the input text and inverse: null.
  function apply(text, patch) {
    if (!patch) return { text: text, inverse: null };
    var kind = ALIAS[patch.kind] || patch.kind;
    if (kind === "set-full-source") {
      if (typeof patch.source !== "string") {
        console.warn("canvasPatch: set-full-source refused, source is not a string");
        return { text: text, inverse: null };
      }
      return { text: patch.source, inverse: { kind: "set-full-source", source: text } };
    }
    var doc = parse(text);
    if (!doc) {
      console.warn("canvasPatch: could not parse source");
      return { text: text, inverse: null };
    }
    var result = applyToDoc(doc, patch);
    if (!result.ok) return { text: text, inverse: null };
    return { text: serialize(doc, text), inverse: result.inverse };
  }

  // function: parse, assignIds, serialize. {text, n}.
  function normalize(text) {
    var doc = parse(text);
    if (!doc) return { text: text, n: 0 };
    var n = assignIds(doc);
    return { text: serialize(doc, text), n: n };
  }

  // function: a new id, prefix plus six lowercase alphanumerics.
  function newId(prefix) {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var suffix = "";
    for (var i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    return prefix + "_" + suffix;
  }

  // function: an undo/redo stack of {patches, inverses} entries.
  function history() {
    var stack = [];
    var pointer = -1;
    return {
      push: function (entry) {
        stack = stack.slice(0, pointer + 1);
        stack.push(entry);
        pointer = stack.length - 1;
      },
      undo: function () {
        if (pointer < 0) return null;
        var entry = stack[pointer];
        pointer--;
        return entry;
      },
      redo: function () {
        if (pointer + 1 >= stack.length) return null;
        pointer++;
        return stack[pointer];
      },
      canUndo: function () { return pointer >= 0; },
      canRedo: function () { return pointer + 1 < stack.length; },
      clear: function () { stack = []; pointer = -1; }
    };
  }

  MX.canvasPatch = function () {
    return {
      parse: parse,
      serialize: serialize,
      assignIds: assignIds,
      find: find,
      apply: apply,
      applyToDoc: applyToDoc,
      normalize: normalize,
      newId: newId,
      history: history,
      domPath: domPath,
      stableId: stableId,
      isFullHtmlDocument: isFullHtmlDocument,
      HOST_NODE_SELECTOR: HOST_NODE_SELECTOR,
      KINDS: KINDS
    };
  };
})();
