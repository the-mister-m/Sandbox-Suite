
import { refresh as refreshGlobalFlags, shouldConfirm } from './globalflags.js';

const KILLSWITCH_SCOPES = [
  { value: 'models', title: 'kill model(s)' },
  { value: 'hosts',  title: 'kill host/server(s) + models' },
  { value: 'suite',  title: 'kill sandbox suite' },
];

const SKIN_OPTIONS = ['og', 'default'];

const CONFIRM_ROWS = [
  { key: 'editor_save',          label: 'editor save' },
  { key: 'file_delete',          label: 'file delete' },
  { key: 'file_move',            label: 'file move' },
  { key: 'terminal_run',         label: 'terminal run' },
  { key: 'setroot',              label: 'set workspace root' },
  { key: 'session_new',          label: 'new session (discard unsaved)' },
  { key: 'session_load',         label: 'load session (replace context)' },
  { key: 'delete_saved_session', label: 'delete a saved session' },
  { key: 'delete_voice',         label: 'delete a voice' },
  { key: 'room_remove',          label: 'remove a room participant' },
  { key: 'room_load',            label: 'load a saved room' },
  { key: 'gate_matrix_save',     label: 'save gate matrix as default' },
];

let _instanceCounter = 0;

function edgeLabel(row) {
  return row.scope && row.scope !== 'any' ? `${row.edge} (${row.scope})` : row.edge;
}

function rowKey(edge, driver, scope) {
  return `${edge}|${driver}|${scope}`;
}

function mount(el, ctx = null) {
  const instanceId = 'gm' + (++_instanceCounter);

  let serverRows   = [];
  let serverGlobal = null;
  const staged       = new Map();
  let stagedGlobal    = {};

  el.innerHTML = `
    <div class="gm-root">
      <div class="gm-head">
        <span class="gm-title">permissions</span>
        <div class="seg gm-tab-seg">
          <button type="button" class="gm-tab active" data-tab="gates">gates</button>
          <button type="button" class="gm-tab" data-tab="confirms">confirms</button>
        </div>
        <span class="gm-unsaved">unsaved changes</span>
        <button class="gm-save" disabled>save as default</button>
      </div>
      <div class="gm-tab-panel" data-panel="gates">
        <div class="gm-rows"></div>
      </div>
      <div class="gm-tab-panel" data-panel="confirms" hidden>
        <div class="gm-global">
          <div class="gm-global-head">global</div>
          <div class="gm-field">
            <span class="gm-field-label">skin</span>
            <div class="seg gm-skin-seg"></div>
          </div>
          <div class="gm-field">
            <span class="gm-field-label">killswitch scope</span>
            <div class="seg gm-kb-scope-seg"></div>
          </div>
          <div class="gm-field">
            <label><input type="checkbox" class="gm-kb-hold"> hold-to-fire (~600ms)</label>
          </div>
        </div>
        <div class="gm-confirms-head">confirms — human actions, ask or silent</div>
        <div class="gm-confirms-grid"></div>
      </div>
    </div>
  `;

  const tabBtns    = [...el.querySelectorAll('.gm-tab')];
  const panels      = [...el.querySelectorAll('.gm-tab-panel')];
  const rowsEl      = el.querySelector('.gm-rows');
  const confirmsGrid = el.querySelector('.gm-confirms-grid');
  const saveBtn     = el.querySelector('.gm-save');
  const unsaved     = el.querySelector('.gm-unsaved');
  const skinSeg     = el.querySelector('.gm-skin-seg');
  const scopeSeg    = el.querySelector('.gm-kb-scope-seg');
  const kbHold      = el.querySelector('.gm-kb-hold');

  tabBtns.forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
      panels.forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    };
  });

  function isDirty() {
    return staged.size > 0 || Object.keys(stagedGlobal).length > 0;
  }

  function syncSaveState() {
    const dirty = isDirty();
    saveBtn.disabled = !dirty;
    unsaved.classList.toggle('visible', dirty);
  }

  function renderRows() {
    rowsEl.innerHTML = '';
    serverRows.forEach((row) => {
      const key = rowKey(row.edge, row.driver, row.scope);
      const rowEl = document.createElement('div');
      rowEl.className = 'gm-row';
      rowEl.dataset.key = key;

      const label = document.createElement('span');
      label.className = 'gm-edge-label';
      label.textContent = edgeLabel(row);

      const levels = document.createElement('div');
      levels.className = 'gm-levels';
      ['open', 'ask', 'queue', 'locked'].forEach((level) => {
        const btn = document.createElement('button');
        btn.className = `gm-lvl gm-lvl-${level}`;
        btn.type = 'button';
        btn.textContent = level;
        btn.onclick = () => {
          if (level === row.hook) staged.delete(key);
          else staged.set(key, level);
          rowEl.classList.toggle('gm-dirty', staged.has(key));
          paintLevels(levels, staged.get(key) || row.hook);
          syncSaveState();
        };
        levels.appendChild(btn);
      });
      paintLevels(levels, staged.get(key) || row.hook);

      rowEl.appendChild(label);
      rowEl.appendChild(levels);
      rowsEl.appendChild(rowEl);
    });
  }

  function paintLevels(levelsEl, activeLevel) {
    [...levelsEl.children].forEach((btn) => {
      btn.classList.toggle('active', btn.textContent === activeLevel);
    });
  }

  function stageGlobal(key, value) {
    if (serverGlobal[key] === value) delete stagedGlobal[key];
    else stagedGlobal[key] = value;
  }

  function stageKillswitch(subkey, value) {
    const serverVal = serverGlobal.killswitch[subkey];
    if (serverVal === value) {
      if (stagedGlobal.killswitch) {
        delete stagedGlobal.killswitch[subkey];
        if (!Object.keys(stagedGlobal.killswitch).length) delete stagedGlobal.killswitch;
      }
    } else {
      stagedGlobal.killswitch = stagedGlobal.killswitch || {};
      stagedGlobal.killswitch[subkey] = value;
    }
  }

  function stageConfirm(key, value) {
    const serverVal = serverGlobal.confirm[key];
    if (serverVal === value) {
      if (stagedGlobal.confirm) {
        delete stagedGlobal.confirm[key];
        if (!Object.keys(stagedGlobal.confirm).length) delete stagedGlobal.confirm;
      }
    } else {
      stagedGlobal.confirm = stagedGlobal.confirm || {};
      stagedGlobal.confirm[key] = value;
    }
  }

  function renderGlobal() {
    skinSeg.innerHTML = '';
    SKIN_OPTIONS.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      btn.classList.toggle('active', (stagedGlobal.skin ?? serverGlobal.skin) === name);
      btn.onclick = () => {
        stageGlobal('skin', name);
        renderGlobal();
        syncSaveState();
      };
      skinSeg.appendChild(btn);
    });
    markFieldDirty(skinSeg.closest('.gm-field'), 'skin' in stagedGlobal);

    scopeSeg.innerHTML = '';
    const curScope = stagedGlobal.killswitch?.scope ?? serverGlobal.killswitch.scope;
    KILLSWITCH_SCOPES.forEach(({ value, title }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = value;
      btn.title = title;
      btn.classList.toggle('active', curScope === value);
      btn.onclick = () => {
        stageKillswitch('scope', value);
        renderGlobal();
        syncSaveState();
      };
      scopeSeg.appendChild(btn);
    });
    markFieldDirty(scopeSeg.closest('.gm-field'), !!stagedGlobal.killswitch?.scope);

    kbHold.checked = stagedGlobal.killswitch?.hold_to_fire ?? serverGlobal.killswitch.hold_to_fire;
    kbHold.onchange = () => {
      stageKillswitch('hold_to_fire', kbHold.checked);
      markFieldDirty(kbHold.closest('.gm-field'), 'killswitch' in stagedGlobal && 'hold_to_fire' in stagedGlobal.killswitch);
      syncSaveState();
    };
  }

  function markFieldDirty(fieldEl, dirty) {
    if (fieldEl) fieldEl.classList.toggle('gm-dirty', !!dirty);
  }

  function renderConfirms() {
    confirmsGrid.innerHTML = '';
    CONFIRM_ROWS.forEach(({ key, label }) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'gm-confirm-row';
      const lbl = document.createElement('span');
      lbl.className = 'gm-confirm-label';
      lbl.textContent = label;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      const paintToggle = () => {
        const val = stagedGlobal.confirm?.[key] ?? serverGlobal.confirm[key];
        toggle.className = 'gm-toggle' + (val === 'ask' ? ' on' : '');
        toggle.textContent = val === 'ask' ? 'ask' : 'silent';
      };
      toggle.onclick = () => {
        const cur = stagedGlobal.confirm?.[key] ?? serverGlobal.confirm[key];
        stageConfirm(key, cur === 'ask' ? 'silent' : 'ask');
        rowEl.classList.toggle('gm-dirty', !!stagedGlobal.confirm && key in stagedGlobal.confirm);
        paintToggle();
        syncSaveState();
      };
      paintToggle();
      rowEl.appendChild(lbl);
      rowEl.appendChild(toggle);
      confirmsGrid.appendChild(rowEl);
    });

    const staticRow = document.createElement('div');
    staticRow.className = 'gm-confirm-row gm-confirm-static';
    staticRow.innerHTML =
      '<span class="gm-confirm-label">daemon queue approve</span>' +
      '<span class="gm-confirm-badge">hold-to-fire</span>';
    confirmsGrid.appendChild(staticRow);
  }

  async function refresh() {
    const [policyRes, globalRes] = await Promise.all([
      fetch('/api/policy').then((r) => r.json()),
      fetch('/api/global').then((r) => r.json()),
    ]);
    serverRows   = (policyRes.rows || []).filter((r) => r.driver === 'model');
    serverGlobal = globalRes;
    staged.clear();
    stagedGlobal = {};
    renderRows();
    renderGlobal();
    renderConfirms();
    syncSaveState();
  }

  async function writeOne(label, url, payload) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return null;
      const detail = await res.json().catch(() => ({}));
      return `${label}: ${detail.error || 'HTTP ' + res.status}`;
    } catch (e) {
      return `${label}: ${e.message || e}`;
    }
  }

  function showSaveError(msgs) {
    let box = el.querySelector('.gm-save-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'gm-error gm-save-error';
      el.querySelector('.gm-root').insertBefore(box, el.querySelector('.gm-tab-panel'));
    }
    box.textContent = 'save failed — ' + msgs.join(' · ');
  }

  function clearSaveError() {
    const box = el.querySelector('.gm-save-error');
    if (box) box.remove();
  }

  function applySkinLink(name) {
    const link = document.querySelector('link[href*="/static/css/skins/"]');
    if (link) link.href = `/static/css/skins/${name}.css`;
  }

  async function doSave() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'saving…';
    clearSaveError();

    const newSkin = ('skin' in stagedGlobal) ? stagedGlobal.skin : null;

    const writes = [...staged.entries()].map(([key, level]) => {
      const [edge, driver, scope] = key.split('|');
      return writeOne(edgeLabel({ edge, scope }), '/api/policy',
                      { edge, driver, scope, level });
    });
    if (Object.keys(stagedGlobal).length) {
      writes.push(writeOne('global', '/api/global', stagedGlobal));
    }
    const errors = (await Promise.all(writes)).filter(Boolean);

    saveBtn.textContent = 'save as default';

    if (errors.length) {
      showSaveError(errors);
      syncSaveState();
      return;
    }

    await refresh();
    if (newSkin) applySkinLink(newSkin);
    refreshGlobalFlags();
  }

  function save() {
    if (shouldConfirm('gate_matrix_save') && ctx && ctx.showConfirm) {
      ctx.showConfirm('save these permission changes as default?', doSave);
    } else {
      doSave();
    }
  }

  saveBtn.onclick = save;

  refresh().catch((e) => {
    rowsEl.innerHTML = `<div class="gm-error">failed to load: ${e.message || e}</div>`;
  });

  return { refresh };
}

export default { mount };
