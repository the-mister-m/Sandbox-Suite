
import gateMatrix from './gatematrix.js';
import { wireHoldToFire } from './killswitch.js';

function wireTabs() {
  const tabs   = [...document.querySelectorAll('.cc-tab')];
  const panels = {
    launch:   document.getElementById('cc-panel-launch'),
    settings: document.getElementById('cc-panel-settings'),
    status:   document.getElementById('cc-panel-status'),
  };
  tabs.forEach((btn) => {
    btn.onclick = () => {
      tabs.forEach((b) => b.classList.toggle('active', b === btn));
      Object.entries(panels).forEach(([name, el]) => {
        el.classList.toggle('cc-panel-active', name === btn.dataset.tab);
      });
    };
  });
}

function wireRoomCreate() {
  const input = document.getElementById('cc-room-name');
  const go    = document.getElementById('cc-room-go');
  const fire  = () => {
    const name = input.value.trim()
      || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).slice(0, 8);
    window.open('/?room=' + encodeURIComponent(name), '_blank');
  };
  go.onclick = fire;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
}

function loadSessions() {
  const el = document.getElementById('cc-sessions-list');
  fetch('/api/saves')
    .then((r) => r.json())
    .then((d) => {
      const list = d.list || [];
      if (!list.length) { el.innerHTML = '<div class="cc-list-empty">no saved sessions</div>'; return; }
      el.innerHTML = '';
      list.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'cc-list-row';
        const when = s.created ? new Date(s.created).toLocaleString() : '';
        row.innerHTML = `
          <span class="cc-list-name">${escapeHtml(s.id)}</span>
          <span class="cc-list-meta">${escapeHtml(when)}</span>
          <span class="cc-list-preview">${escapeHtml(s.preview || '')}</span>
        `;
        const btn = document.createElement('button');
        btn.className = 'cc-list-open';
        btn.textContent = 'open';
        btn.onclick = () => window.open('/ide?load=' + encodeURIComponent(s.id), '_blank');
        row.appendChild(btn);
        el.appendChild(row);
      });
    })
    .catch(() => { el.innerHTML = '<div class="cc-list-empty">failed to load</div>'; });
}

function loadRooms() {
  const el = document.getElementById('cc-rooms-list');
  fetch('/api/rooms')
    .then((r) => r.json())
    .then((d) => {
      const list = d.list || [];
      if (!list.length) { el.innerHTML = '<div class="cc-list-empty">no saved rooms</div>'; return; }
      el.innerHTML = '';
      list.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'cc-list-row';
        const when = r.created ? new Date(r.created).toLocaleString() : '';
        const who  = (r.participants || []).filter(Boolean).join(', ');
        row.innerHTML = `
          <span class="cc-list-name">${escapeHtml(r.id)}</span>
          <span class="cc-list-meta">${escapeHtml(when)}</span>
          <span class="cc-list-preview">${escapeHtml(who)}</span>
        `;
        const btn = document.createElement('button');
        btn.className = 'cc-list-open';
        btn.textContent = 'open';
        btn.onclick = () => window.open('/?room=' + encodeURIComponent(r.id), '_blank');
        row.appendChild(btn);
        el.appendChild(row);
      });
    })
    .catch(() => { el.innerHTML = '<div class="cc-list-empty">failed to load</div>'; });
}

let selectedAdeId = null;

function paintAdeLoadBtn() {
  const btn = document.getElementById('cc-ade-load');
  if (!btn) return;
  btn.disabled = !selectedAdeId;
  btn.style.opacity = selectedAdeId ? '' : '.4';
  btn.style.cursor = selectedAdeId ? 'pointer' : 'default';
}

function loadAdeSessions() {
  const el = document.getElementById('cc-ade-sessions-list');
  selectedAdeId = null;
  paintAdeLoadBtn();
  fetch('/api/ade-sessions')
    .then((r) => r.json())
    .then((d) => {
      const list = d.list || [];
      if (!list.length) { el.innerHTML = '<div class="cc-list-empty">no saved ADE sessions</div>'; return; }
      el.innerHTML = '';
      list.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'cc-list-row';
        const when = s.saved ? new Date(s.saved).toLocaleString() : '';
        const tracks = Number.isFinite(s.tracks) ? s.tracks : 0;
        row.innerHTML = `
          <span class="cc-list-name">${escapeHtml(s.name || s.id)}</span>
          <span class="cc-list-meta">${escapeHtml(when)}</span>
          <span class="cc-list-preview">${tracks} track${tracks === 1 ? '' : 's'}</span>
        `;
        row.onclick = () => {
          selectedAdeId = s.id;
          [...el.children].forEach((r) => { r.style.background = ''; r.style.outline = ''; });
          row.style.background = 'var(--well)';
          row.style.outline = '1px solid var(--accent-bdr)';
          paintAdeLoadBtn();
        };
        const del = document.createElement('button');
        del.className = 'cc-list-open';
        del.textContent = 'delete';
        del.onclick = (e) => {
          e.stopPropagation();
          fetch('/api/ade-sessions/' + encodeURIComponent(s.id), { method: 'DELETE' })
            .then(() => loadAdeSessions())
            .catch(() => {});
        };
        row.appendChild(del);
        el.appendChild(row);
      });
    })
    .catch(() => { el.innerHTML = '<div class="cc-list-empty">failed to load</div>'; });
}

function wireAdeCluster() {
  const newBtn = document.getElementById('cc-ade-new');
  const loadBtn = document.getElementById('cc-ade-load');
  const saveBtn = document.getElementById('cc-ade-save');
  if (newBtn) newBtn.onclick = () => window.open('/ade', '_blank');
  if (loadBtn) loadBtn.onclick = () => {
    if (!selectedAdeId) return;
    window.open('/ade?load=' + encodeURIComponent(selectedAdeId), '_blank');
  };
  if (saveBtn) saveBtn.onclick = () => {
    const name = (window.prompt('Save ADE session as:', '') || '').trim();
    if (!name) return;
    fetch('/api/ade-sessions/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.error) { window.alert(d.error); return; }
        loadAdeSessions();
      })
      .catch(() => window.alert('save failed'));
  };

}

function wireModalMode() {
  const seg = document.querySelector('.cc-modal-seg');
  if (!seg) return;
  const btns = [...seg.querySelectorAll('button[data-mode]')];
  const paint = (mode) => {
    const m = ['window', 'corner', 'off'].includes(mode) ? mode : 'fullscreen';
    btns.forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  };
  const load = () => fetch('/api/global')
    .then((r) => r.json())
    .then((d) => paint(d.modal_mode))
    .catch(() => paint('fullscreen'));
  btns.forEach((btn) => {
    btn.onclick = () => {
      fetch('/api/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modal_mode: btn.dataset.mode }),
      })
        .then((r) => r.json())
        .then((d) => paint(d.modal_mode))
        .catch(() => {});
    };
  });
  load();
}

function wireApproveHold() {
  const seg = document.querySelector('.cc-hold-seg');
  if (!seg) return;
  const btns = [...seg.querySelectorAll('button[data-hold]')];
  const paint = (on) => btns.forEach((b) =>
    b.classList.toggle('active', (b.dataset.hold === 'on') === on));
  const load = () => fetch('/api/global')
    .then((r) => r.json())
    .then((d) => paint(d.approve_hold === true))
    .catch(() => paint(false));
  btns.forEach((btn) => {
    btn.onclick = () => {
      fetch('/api/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve_hold: btn.dataset.hold === 'on' }),
      })
        .then((r) => r.json())
        .then((d) => paint(d.approve_hold === true))
        .catch(() => {});
    };
  });
  load();
}

function wireGateKeyboard() {
  const seg = document.querySelector('.cc-kbd-seg');
  if (!seg) return;
  const btns = [...seg.querySelectorAll('button[data-kbd]')];
  const paint = (on) => btns.forEach((b) =>
    b.classList.toggle('active', (b.dataset.kbd === 'on') === on));
  const load = () => fetch('/api/global')
    .then((r) => r.json())
    .then((d) => paint(d.gate_keyboard !== false))
    .catch(() => paint(true));
  btns.forEach((btn) => {
    btn.onclick = () => {
      fetch('/api/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate_keyboard: btn.dataset.kbd === 'on' }),
      })
        .then((r) => r.json())
        .then((d) => paint(d.gate_keyboard !== false))
        .catch(() => {});
    };
  });
  load();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const KILL_ROWS = [
  { key: 'end_all_turns', label: 'End All Turns', route: '/api/end-all-turns',
    kills: 'nothing — every agent stops mid-turn',
    keeps: 'seats · transcripts · warm sessions · weights' },
  { key: 'unload_weights', label: 'Unload Weights', route: '/api/unload-weights',
    kills: 'the loaded model, llama-server, cached LiteRT engines',
    keeps: 'every region and every Claude session' },
  { key: 'kill_hosts', label: 'Kill Local Hosts', route: '/api/kill-hosts',
    kills: 'the Ollama daemon itself',
    keeps: 'regions · Claude sessions — needs a manual restart' },
  { key: 'end_all_sessions', label: 'End All Sessions', route: '/api/end-all',
    kills: 'every region, its Claude process, and the weights',
    keeps: 'saved transcripts — open ADE tabs reload' },
  { key: 'shutdown_suite', label: 'Shut Down Suite', route: '/api/shutdown-suite',
    kills: 'everything, then the harness itself',
    keeps: 'nothing running — reaps first, so no orphans' },
];

function summarizeKill(d) {
  if (!d || typeof d !== 'object') return 'done';
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' · ');
}

let killHolds = {};

function wireKillControls() {
  const mount = document.getElementById('cc-kill-rows');
  if (!mount) return;

  const render = (holds) => {
    killHolds = holds;
    mount.textContent = '';
    KILL_ROWS.forEach((row) => {
      const held = killHolds[row.key] === true;

      const el = document.createElement('div');
      el.className = 'cc-kill-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cc-launch-btn cc-danger cc-kill-btn';
      btn.textContent = row.label;
      wireHoldToFire(btn, () => {
        note.textContent = 'working…';
        fetch(row.route, { method: 'POST' })
          .then((r) => r.json())
          .then((d) => {
            note.textContent = summarizeKill(d);
            if (row.key === 'end_all_sessions') loadAdeSessions();
          })
          .catch(() => { note.textContent = `${row.label} failed`; });
      }, { bypassCheck: () => killHolds[row.key] !== true });

      const text = document.createElement('div');
      text.className = 'cc-kill-text';
      const kills = document.createElement('div');
      kills.className = 'cc-kill-kills';
      kills.textContent = `kills ${row.kills}`;
      const keeps = document.createElement('div');
      keeps.className = 'cc-kill-keeps';
      keeps.textContent = `keeps ${row.keeps}`;
      text.append(kills, keeps);

      const holdLabel = document.createElement('label');
      holdLabel.className = 'cc-kill-hold';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = held;
      cb.onchange = () => {
        fetch('/api/global', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kill_holds: { [row.key]: cb.checked } }),
        })
          .then((r) => r.json())
          .then((d) => render(d.kill_holds || {}))
          .catch(() => { cb.checked = held; });
      };
      holdLabel.append(cb, document.createTextNode(' hold'));

      const note = document.createElement('div');
      note.className = 'cc-note cc-kill-note';

      el.append(btn, text, holdLabel, note);
      mount.appendChild(el);
    });
  };

  fetch('/api/global')
    .then((r) => r.json())
    .then((d) => {
      render(d.kill_holds || {});
      wireLaunchEndAll();
    })
    .catch(() => { render({}); wireLaunchEndAll(); });
}

function wireLaunchEndAll() {
  const btn = document.getElementById('cc-end-all');
  const note = document.getElementById('cc-end-all-note');
  if (!btn) return;
  const row = KILL_ROWS.find((r) => r.key === 'end_all_sessions');
  wireHoldToFire(btn, () => {
    if (note) note.textContent = 'working…';
    fetch(row.route, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (note) note.textContent = summarizeKill(d);
        loadAdeSessions();
      })
      .catch(() => { if (note) note.textContent = 'End All Sessions failed'; });
  }, { bypassCheck: () => killHolds[row.key] !== true });
}

wireTabs();
wireRoomCreate();
wireModalMode();
wireGateKeyboard();
wireApproveHold();
loadSessions();
loadRooms();
wireAdeCluster();
loadAdeSessions();
gateMatrix.mount(document.getElementById('cc-gatematrix'));
wireKillControls();
