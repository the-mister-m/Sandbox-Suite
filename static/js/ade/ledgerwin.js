
'use strict';

import { mount, onFrame, refresh } from './ledgerview.js';

let ws = null;
let wsReady = false;
let tracks = [];
let names = {};
let session = null;



function mergeNames(map) {
  if (!map) return false;
  let changed = false;
  for (const k of Object.keys(map)) {
    if (names[k] !== map[k]) { names[k] = map[k]; changed = true; }
  }
  return changed;
}

function nameOf(id) {
  if (id == null || id === '') return '';
  const live = tracks.find(t => t.id === id);
  if (live) return live.name || live.id;
  return names[id] || id;
}

function isGone(id) {
  if (id == null || id === '') return false;
  if (tracks.some(t => t.id === id)) return false;
  return !!names[id];
}

let _feedDirtyTimer = null;
let _feedDirtyFirst = 0;

function send(obj) {
  if (wsReady && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/ade`);
  ws.onopen = () => { wsReady = true; };
  ws.onclose = () => { wsReady = false; setTimeout(connect, 1200); };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m.type === 'ade_init') {
      tracks = m.tracks || [];
      session = m.session || null;
      mergeNames(m.names);
      send({ type: 'feed' });
    } else if (m.type === 'track_list') {
      tracks = m.tracks || tracks;
      if (mergeNames(m.names)) refresh();
    } else if (m.type === 'feed_dirty') {
      if (!(m.stores || []).includes('record')) return;
      const wasIdle = !_feedDirtyTimer && _feedDirtyFirst === 0;
      if (wasIdle) _feedDirtyFirst = Date.now();
      clearTimeout(_feedDirtyTimer);
      if (Date.now() - _feedDirtyFirst >= 1000) {
        send({ type: 'feed' });
        _feedDirtyTimer = null;
        _feedDirtyFirst = 0;
      } else {
        _feedDirtyTimer = setTimeout(() => {
          send({ type: 'feed' });
          _feedDirtyTimer = null;
          _feedDirtyFirst = 0;
        }, 300);
      }
    } else if (m.type === 'feed') {
      onFrame(m);
    } else if (m.type === 'transcript') {
      onFrame(m);
    }
  };
}

function boot() {
  const params = new URLSearchParams(location.search);
  const trackParam = params.get('track');
  const turnRaw = params.get('turn');
  const turnParam = turnRaw !== null && turnRaw !== '' ? Number(turnRaw) : null;
  const initFilter = (trackParam != null || turnParam != null)
    ? { track: trackParam, turn: turnParam }
    : null;

  const ctx = {
    send,
    getTracks: () => tracks,
    getSession: () => session,
    nameOf,
    isGone,
    setFocus: () => {},
    editTrack: () => {},
  };

  const host = document.getElementById('ledgerHost');
  mount(host, ctx, initFilter);

  const btn = document.getElementById('winRefresh');
  if (btn) btn.onclick = () => refresh();

  connect();
}

document.addEventListener('DOMContentLoaded', boot);
