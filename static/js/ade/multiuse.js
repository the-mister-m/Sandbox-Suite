
import filesPane    from '../panes/browser.js';
import terminalPane from '../panes/terminal.js';
import editorPane   from '../panes/editor.js';

function routeMultiUseFrame(m) {
  if (!m || !m.type) return;
  switch (m.type) {
    case 'tree':
      if (m.data && m.data.tag === 'esave') editorPane.onFrame(m);
      else filesPane.onFrame(m);
      break;
    case 'deleted':
    case 'moved':
    case 'renamed':
    case 'made':
      filesPane.onFrame(m);
      break;
    case 'file':
      editorPane.onFrame(m);
      break;
    case 'saved':
      editorPane.onFrame(m);
      filesPane.onFrame(m);
      break;
    case 'term':
      terminalPane.onFrame(m);
      break;
    default:
      break;
  }
}

export function mountMultiUse(els, ctx) {
  const { filesEl, termEl, editorEl } = els || {};

  if (filesEl) {
    try { filesPane.mount(filesEl, ctx); }
    catch (e) { console.error('[multiuse] files pane mount failed:', e); }
  } else {
    console.error('[multiuse] mountMultiUse: missing filesEl');
  }

  if (termEl) {
    try {
      terminalPane.mount(termEl, ctx);
      terminalPane.show();
    } catch (e) { console.error('[multiuse] terminal pane mount failed:', e); }
  } else {
    console.error('[multiuse] mountMultiUse: missing termEl');
  }

  if (editorEl) {
    try {
      editorPane.mount(editorEl, ctx);
      editorPane.show();
    } catch (e) { console.error('[multiuse] editor pane mount failed:', e); }
  } else {
    console.error('[multiuse] mountMultiUse: missing editorEl');
  }

  return { filesPane, terminalPane, editorPane, routeFrame: routeMultiUseFrame };
}

export { routeMultiUseFrame };
