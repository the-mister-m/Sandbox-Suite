// canvas patch — file-mode patcher, the Open Design source-patches slice
//
// MX.canvasPatch(): {parse, serialize, assignIds, find, apply,
// domPath, stableId, HOST_NODE_SELECTOR, KINDS}.
// parse(text) returns a Document, serialize(doc) the text back. A body
// fragment round-trips as a fragment, a full document as a full
// document; parse marks which on the doc, serialize(doc, original)
// overrides.
// assignIds(doc) stamps data-od-id from the dom path on every body
// element that lacks one. find(doc, id) walks data-od-id,
// data-od-runtime-id, data-od-source-path, then path-N-N.
// apply(text, patch) returns the new text: set-style,
// replace-outer-html, set-css-token, set-text, set-full-source. The
// Open Design kind names set-outer-html and set-token are accepted as
// aliases. A patch that cannot land returns the text unchanged.

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
    "set-text", "set-full-source"
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
    return { ok: true };
  }

  // function: rewrite one declaration inside the first style block holding it.
  function setCssToken(doc, token, value) {
    var styles = Array.prototype.slice.call(doc.querySelectorAll("style"));
    var pattern = new RegExp("(" + escapeRegExp(token) + "\\s*:\\s*)([^;]+)(;)");
    for (var i = 0; i < styles.length; i++) {
      var text = styles[i].textContent || "";
      if (!pattern.test(text)) continue;
      styles[i].textContent = text.replace(pattern, "$1" + value + "$3");
      return true;
    }
    return false;
  }

  function apply(text, patch) {
    if (!patch) return text;
    var kind = ALIAS[patch.kind] || patch.kind;
    if (kind === "set-full-source") return patch.source;

    var doc = parse(text);
    if (!doc) {
      console.warn("canvasPatch: could not parse source");
      return text;
    }

    if (kind === "set-css-token") {
      if (!setCssToken(doc, patch.token, patch.value)) {
        console.warn("canvasPatch: token not found:", patch.token);
        return text;
      }
      return serialize(doc, text);
    }

    var el = find(doc, patch.id);
    if (!el) {
      console.warn("canvasPatch: target not found:", patch.id);
      return text;
    }

    if (kind === "set-text") {
      if (hasElementChildren(el)) {
        var soleText = soleMeaningfulTextNode(el);
        if (!soleText) {
          console.warn("canvasPatch: nested markup, set-text refused:", patch.id);
          return text;
        }
        soleText.nodeValue = patch.value;
      } else {
        el.textContent = patch.value;
      }
    } else if (kind === "set-style") {
      setInlineStyles(el, patch.styles);
    } else if (kind === "replace-outer-html") {
      var replaced = replaceOuterHtml(doc, el, patch.html);
      if (!replaced.ok) {
        console.warn("canvasPatch:", replaced.error);
        return text;
      }
    } else {
      console.warn("canvasPatch: unknown patch kind:", patch.kind);
      return text;
    }

    return serialize(doc, text);
  }

  MX.canvasPatch = function () {
    return {
      parse: parse,
      serialize: serialize,
      assignIds: assignIds,
      find: find,
      apply: apply,
      domPath: domPath,
      stableId: stableId,
      isFullHtmlDocument: isFullHtmlDocument,
      HOST_NODE_SELECTOR: HOST_NODE_SELECTOR,
      KINDS: KINDS
    };
  };
})();
