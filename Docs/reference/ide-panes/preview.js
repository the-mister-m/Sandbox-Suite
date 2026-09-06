// preview.js — HTML preview pane (5th pane).
// "refresh" renders current Monaco editor content as HTML via srcdoc.
// URL field + "go" navigates the iframe to a localhost dev server.
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }

let _iframe = null;
let _urlInput = null;

function refreshFromEditor() {
  if (!_iframe) return;
  try {
    const editor = window._monacoEditorInstance;
    if (!editor) {
      console.warn('preview: Monaco editor not ready');
      return;
    }
    _iframe.srcdoc = editor.getValue();
  } catch (e) {
    console.error('preview refresh failed:', e);
  }
}

function navigateUrl() {
  if (!_iframe || !_urlInput) return;
  let url = _urlInput.value.trim();
  if (!url) return;
  // prepend http:// for bare localhost:PORT patterns
  if (/^localhost(:\d+)?(\/|$)/.test(url)) {
    url = 'http://' + url;
  }
  try {
    _iframe.src = url;
  } catch (e) {
    console.error('preview navigate failed:', e);
  }
}

const previewPane = {
  id: 'preview',
  label: 'preview',

  mount(el /*, ctx — not needed */) {
    el.innerHTML = `
      <div id="preview-pane-bar">
        <button id="preview-pane-refresh" title="render editor content as HTML">refresh</button>
        <input id="preview-pane-url" type="text" placeholder="localhost:PORT or http://…" spellcheck="false">
        <button id="preview-pane-go">go</button>
      </div>
      <iframe id="preview-pane-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
    `;

    _iframe   = el.querySelector('#preview-pane-frame');
    _urlInput = el.querySelector('#preview-pane-url');

    el.querySelector('#preview-pane-refresh').onclick = refreshFromEditor;
    el.querySelector('#preview-pane-go').onclick = navigateUrl;

    _urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigateUrl();
    });
  },

  show() {},
  hide() {},

  loadHtml(content) {
    if (_iframe) _iframe.srcdoc = content;
  },

  // No server frames — required by contract, kept as no-op
  onFrame(/* m */) {},
};

export default previewPane;
