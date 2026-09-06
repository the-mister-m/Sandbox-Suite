
'use strict';

import { _groupTurns, _buildTurnBlock } from './chat.js';

let _sessions = [];
let _openSid  = null;
let _sel      = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return isNaN(d) ? '' : d.toLocaleDateString();
}

function bytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}


function renderList() {
  const host = $('rtList');
  if (!_sessions.length) {
    host.innerHTML = '<div class="rt-empty">no saved sessions</div>';
    return;
  }
  const parts = [];
  for (const s of _sessions) {
    const open = s.id === _openSid;
    parts.push(
      '<div class="rt-sess' + (open ? ' rt-open' : '') + '" data-sid="' + esc(s.id) + '">' +
        '<span class="rt-caret">' + (open ? '▾' : '▸') + '</span>' +
        '<span class="rt-sname">' + esc(s.name) + '</span>' +
        '<span class="rt-count">' + s.agents.length + '</span>' +
        '<span class="rt-date">' + esc(stamp(s.saved)) + '</span>' +
      '</div>'
    );
    if (!open) continue;
    for (const a of s.agents) {
      if (!a.caches.length) {
        parts.push(
          '<div class="rt-agent rt-nocache" title="no transcript on disk">' +
            '<span class="rt-aname">' + esc(a.name) + '</span>' +
            '<span class="rt-note">no cache</span>' +
          '</div>'
        );
        continue;
      }
      for (const c of a.caches) {
        const key = esc(s.id) + '|' + esc(a.id) + '|' + (c.cache == null ? '' : c.cache);
        const on  = _sel && _sel.key === key;
        parts.push(
          '<div class="rt-agent' + (on ? ' rt-on' : '') + '" data-key="' + key + '"' +
               ' data-name="' + esc(a.name) + '">' +
            '<span class="rt-dot' + (a.retired ? ' rt-ret' : '') + '"></span>' +
            '<span class="rt-aname">' + esc(a.name) +
              (c.cache == null ? '' : ' <span class="rt-cache">cache ' + c.cache + '</span>') +
            '</span>' +
            '<span class="rt-vessel">' + esc(a.vessel) + '</span>' +
            '<span class="rt-size">' + bytes(c.bytes) + '</span>' +
          '</div>'
        );
      }
    }
  }
  host.innerHTML = parts.join('');
}


function renderTranscript(name, messages) {
  const host = $('rtScript');
  host.innerHTML = '';
  const turns = _groupTurns(messages);
  if (!turns.length) {
    host.innerHTML = '<div class="rt-empty">this cache holds no turns</div>';
    return;
  }
  turns.forEach((t, idx) => {
    const { blk } = _buildTurnBlock(name, t, idx, false, null);
    host.appendChild(blk);
  });
  host.scrollTop = 0;
}

async function openChat(key, name) {
  const [sid, rid, cache] = key.split('|');
  _sel = { key, sid, rid, name, cache };
  renderList();
  $('rtTitle').textContent = name + (cache ? '  ·  cache ' + cache : '');
  $('rtScript').innerHTML = '<div class="rt-empty">reading…</div>';
  const url = '/api/retired-chats/' + sid + '/' + rid + (cache ? '?cache=' + cache : '');
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.missing) {
      $('rtScript').innerHTML = '<div class="rt-empty">no transcript on disk</div>';
      return;
    }
    renderTranscript(name, j.messages || []);
  } catch (e) {
    $('rtScript').innerHTML = '<div class="rt-empty">could not read this cache</div>';
  }
}

async function load() {
  $('rtList').innerHTML = '<div class="rt-empty">reading archives…</div>';
  try {
    const r = await fetch('/api/retired-chats');
    const j = await r.json();
    _sessions = j.list || [];
  } catch (e) {
    _sessions = [];
  }
  renderList();
}

function onListClick(ev) {
  const agent = ev.target.closest('.rt-agent');
  if (agent && agent.dataset.key) {
    openChat(agent.dataset.key, agent.dataset.name);
    return;
  }
  const sess = ev.target.closest('.rt-sess');
  if (sess) {
    _openSid = (_openSid === sess.dataset.sid) ? null : sess.dataset.sid;
    renderList();
  }
}

$('rtList').addEventListener('click', onListClick);
$('rtRefresh').addEventListener('click', load);
load();
