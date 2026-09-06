// daemonlog.js — daemon window log pane (DAEMON-SPEC §6): a tail of the
// durable, global log.jsonl (§5), newest first, filterable by event kind.
// Distinct from panes/log.js, which is the PER-SESSION activity feed shown
// in the normal shell — this one reads the layer-wide file every session
// (and daemon_queue.py) appends to, across the whole app's lifetime.
//
// Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
//
// Frames it consumes:
//   log_tail  {lines:[...]}        newest-first tail, already filtered server-side
// Frames it sends:
//   log_tail  {limit, kind}        request a fresh tail; kind='' = no filter

let _ctx = null;
let _feed = null;
let _kind = '';

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _time(ts) {
  return ts ? new Date(ts).toTimeString().slice(0, 8) : '';
}

function _renderLine(evt) {
  const row = document.createElement('div');
  row.className = 'dl-row dl-' + _esc(evt.kind || 'misc');
  let body;
  if (evt.kind === 'gate') {
    const locked = evt.hook === 'locked';
    const ok = evt.answer === true;
    row.classList.add(locked ? 'dl-locked' : (ok ? 'dl-approved' : 'dl-denied'));
    body = `<span class="dl-mark">${locked ? '⛔' : (ok ? '✓' : '✗')}</span>` +
           `<span class="dl-verb">${_esc(evt.action || 'gate')}</span>` +
           `<span class="dl-target">${_esc(evt.target || '')}</span>` +
           `<span class="dl-hook">${_esc(evt.hook || '')}</span>`;
  } else if (evt.kind === 'queue') {
    body = `<span class="dl-verb">queue·${_esc(evt.outcome || '')}</span>` +
           `<span class="dl-target">${_esc(evt.action_type || '')}</span>` +
           `<span class="dl-summary">${_esc(evt.driver || '')}</span>`;
  } else if (evt.kind === 'tool') {
    body = `<span class="dl-verb">${_esc(evt.verb || '')}</span>` +
           `<span class="dl-target">${_esc(evt.target || '')}</span>` +
           `<span class="dl-summary">${_esc(evt.summary || '')}</span>`;
  } else if (evt.kind === 'alert') {
    body = `<span class="dl-verb">⟢ ${_esc(evt.trigger || '')}</span>`;
  } else {
    body = `<span class="dl-summary">${_esc(evt.summary || evt.kind || '')}</span>`;
  }
  row.innerHTML = `<span class="dl-time">${_time(evt.ts)}</span>` + body;
  return row;
}

function _request() {
  if (_ctx && _ctx.send) _ctx.send({ type: 'log_tail', limit: 200, kind: _kind });
}

const daemonLogPane = {
  id: 'daemonlog',
  label: 'log',

  mount(el, ctx) {
    _ctx = ctx;
    el.innerHTML = `
      <div class="daemon-cell-head">
        <span>log</span>
        <select id="dl-filter">
          <option value="">all</option>
          <option value="gate">gate</option>
          <option value="queue">queue</option>
          <option value="tool">tool</option>
          <option value="alert">alert</option>
        </select>
        <button class="q-btn" id="dl-refresh">refresh</button>
      </div>
      <div id="dl-feed" class="dl-feed"></div>
    `;
    _feed = el.querySelector('#dl-feed');
    el.querySelector('#dl-filter').onchange = (e) => { _kind = e.target.value; _request(); };
    el.querySelector('#dl-refresh').onclick = () => _request();
  },

  show() {},
  hide() {},

  onFrame(m) {
    if (m.type !== 'log_tail' || !_feed) return;
    _feed.innerHTML = '';
    (m.lines || []).forEach(evt => _feed.appendChild(_renderLine(evt)));
    if (!(m.lines || []).length) {
      const empty = document.createElement('div');
      empty.className = 'q-empty';
      empty.textContent = 'log empty';
      _feed.appendChild(empty);
    }
  },
};

export default daemonLogPane;
