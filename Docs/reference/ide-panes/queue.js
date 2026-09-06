// queue.js — daemon window queue pane (DAEMON-SPEC §6).
// The pending list from daemon_queue.py: action type, payload summary,
// driver, stamped conditions (pass/fail), hook level, timestamps. Actions
// per entry: approve (hold-to-fire, POLISH.md LANE G — a parked MODEL write/
// run/delete is the highest-consequence click in the suite) / deny / edit
// (modify-then-approve) / delete action(s). A review filter shows only
// entries awaiting the human. Supersession-
// flagged entries render the run / change-sequence / delete dialog instead
// of the normal button row — via ctx.showTriple, the SAME gate-modal DOM
// every other local confirm reuses (house rule: never a new modal).
//
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
//
// Frames it consumes:
//   queue_state  {pending:[entry,...]}   full snapshot, replaces the list —
//                each entry carries server-stamped _condition_status
//                ({name: bool}) and _awaiting_human (the review filter)
// Frames it sends:
//   queue_list                          request a fresh snapshot
//   queue_action {action, id, payload?} approve | deny | edit | delete |
//                                        unsupersede

import { wireHoldToFire } from '../killswitch.js';
import { approveHold } from '../globalflags.js';

let _ctx = null;
let _list = null;
let _entries = [];
let _reviewOnly = false;

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _time(ms) {
  return ms ? new Date(ms).toTimeString().slice(0, 8) : '—';
}

function _payloadSummary(entry) {
  const p = entry.payload || {};
  if (p.path)    return p.path;
  if (p.command) return p.command;
  if (p.url)     return p.url;
  if (p.model)   return `${p.model}: ${(p.task || '').slice(0, 60)}`;
  const s = JSON.stringify(p);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

function _conditionBadges(entry) {
  const status = entry._condition_status || {};
  return Object.keys(status).map(name =>
    `<span class="q-cond ${status[name] ? 'q-pass' : 'q-fail'}">${_esc(name)}</span>`
  ).join('');
}

function _send(action, id, extra) {
  if (_ctx && _ctx.send) _ctx.send({ type: 'queue_action', action, id, ...(extra || {}) });
}

function _renderEntry(entry) {
  const row = document.createElement('div');
  row.className = 'q-entry' + (entry.superseded ? ' q-superseded' : '');
  row.dataset.id = entry.id;

  const head = document.createElement('div');
  head.className = 'q-head';
  head.innerHTML =
    `<span class="q-type">${_esc(entry.action_type)}</span>` +
    `<span class="q-hook q-hook-${_esc(entry.hook)}">${_esc(entry.hook)}</span>` +
    `<span class="q-driver">${_esc(entry.driver)}</span>` +
    `<span class="q-time" title="parked">${_time(entry.parked)}</span>`;
  row.appendChild(head);

  const body = document.createElement('div');
  body.className = 'q-body';
  body.textContent = _payloadSummary(entry);
  row.appendChild(body);

  const conds = document.createElement('div');
  conds.className = 'q-conds';
  conds.innerHTML = _conditionBadges(entry);
  row.appendChild(conds);

  const actions = document.createElement('div');
  actions.className = 'q-actions';

  if (entry.superseded) {
    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'q-btn q-btn-super';
    resolveBtn.textContent = 'superseded — resolve';
    resolveBtn.onclick = () => {
      if (_ctx && _ctx.showTriple) {
        _ctx.showTriple(
          `'${_payloadSummary(entry)}' was superseded by a later action on the same target.`,
          'run', 'reseq', 'delete',
          () => _send('approve', entry.id),        // run — fire this one anyway
          () => _send('unsupersede', entry.id),     // change sequence — drop the flag, keep it queued
          () => _send('delete', entry.id),          // delete action(s)
        );
      }
    };
    actions.appendChild(resolveBtn);
  } else {
    const mk = (label, cls, onClick) => {
      const b = document.createElement('button');
      b.className = 'q-btn ' + cls;
      b.textContent = label;
      b.onclick = onClick;
      return b;
    };
    // approve fires a parked MODEL write/run/delete — the highest-consequence
    // click in the suite (POLISH.md LANE G). Hold-to-fire is now a global
    // toggle (approve_hold, default OFF — decided-by: Brandon 2026-07-15);
    // the killswitch keeps its own separate toggle.
    const approveBtn = document.createElement('button');
    approveBtn.className = 'q-btn q-btn-approve';
    approveBtn.textContent = 'approve';
    if (approveHold()) wireHoldToFire(approveBtn, () => _send('approve', entry.id));
    else approveBtn.onclick = () => _send('approve', entry.id);
    actions.appendChild(approveBtn);
    actions.appendChild(mk('deny', 'q-btn-deny', () => _send('deny', entry.id)));
    actions.appendChild(mk('edit', 'q-btn-edit', () => {
      if (!_ctx || !_ctx.showPrompt) return;
      _ctx.showPrompt(
        `edit payload (JSON) — ${entry.action_type}`,
        JSON.stringify(entry.payload || {}),
        (text) => {
          let patch;
          try { patch = JSON.parse(text); } catch (e) { return; }
          _send('edit', entry.id, { payload: patch });
        },
        () => {},
      );
    }));
    actions.appendChild(mk('delete', 'q-btn-delete', () => _send('delete', entry.id)));
  }
  row.appendChild(actions);
  return row;
}

function _render() {
  if (!_list) return;
  _list.innerHTML = '';
  const shown = _reviewOnly ? _entries.filter(e => e._awaiting_human) : _entries;
  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'q-empty';
    empty.textContent = _reviewOnly ? 'nothing awaiting review' : 'queue empty';
    _list.appendChild(empty);
    return;
  }
  shown.forEach(e => _list.appendChild(_renderEntry(e)));
}

const queuePane = {
  id: 'queue',
  label: 'queue',

  mount(el, ctx) {
    _ctx = ctx;
    el.innerHTML = `
      <div class="daemon-cell-head">
        <span>queue</span>
        <label class="q-filter"><input type="checkbox" id="q-review-toggle"> awaiting me</label>
        <button class="q-btn q-refresh" id="q-refresh">refresh</button>
      </div>
      <div id="q-list" class="q-list"></div>
    `;
    _list = el.querySelector('#q-list');
    el.querySelector('#q-review-toggle').onchange = (e) => {
      _reviewOnly = e.target.checked;
      _render();
    };
    el.querySelector('#q-refresh').onclick = () => {
      if (_ctx && _ctx.send) _ctx.send({ type: 'queue_list' });
    };
  },

  show() {},
  hide() {},

  onFrame(m) {
    if (m.type === 'queue_state') {
      _entries = m.pending || [];
      _render();
    }
  },
};

export default queuePane;
