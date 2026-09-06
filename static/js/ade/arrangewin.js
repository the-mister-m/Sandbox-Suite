'use strict';

import { mount, refresh, onEsc } from './arrange.js';

function boot() {
  const ctx = {
    send: () => {},
    getTracks: () => [],
    getSession: () => null,
    showConfirm: (message, onYes, onNo) => {
      if (window.confirm(message)) { if (onYes) onYes(); }
      else if (onNo) onNo();
    },
    showPrompt: (message, defaultValue, onOk) => {
      const v = window.prompt(message, defaultValue || '');
      if (v !== null && onOk) onOk(v);
    },
  };

  const host = document.getElementById('view-arrange');
  mount(host, ctx);
  refresh();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onEsc();
  });
}

document.addEventListener('DOMContentLoaded', boot);
