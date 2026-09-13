// matrix socket — one socket per bound session at /ws/ade/<sid>

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  let _ws = null;
  let _sid = null;
  let _state = "blank";
  const _listeners = [];
  const _stateListeners = [];
  // frames sent while a bind is still connecting; flushed on open
  let _pending = [];

  function _setState(s, detail) {
    _state = s;
    for (const fn of _stateListeners.slice()) {
      try { fn(s, detail); } catch (e) { /* one listener does not stop the rest */ }
    }
  }

  function _deliver(msg) {
    for (const fn of _listeners.slice()) {
      try { fn(msg); } catch (e) { /* one listener does not stop the rest */ }
    }
  }

  const sock = {
    sid() { return _sid; },
    state() { return _state; },

    onFrame(fn) {
      _listeners.push(fn);
      return function () {
        const i = _listeners.indexOf(fn);
        if (i >= 0) _listeners.splice(i, 1);
      };
    },

    onState(fn) {
      _stateListeners.push(fn);
      return function () {
        const i = _stateListeners.indexOf(fn);
        if (i >= 0) _stateListeners.splice(i, 1);
      };
    },

    send(obj) {
      if (!_ws) return false;
      if (_ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify(obj));
        return true;
      }
      // bind in flight: hold the frame for onopen
      if (_ws.readyState === WebSocket.CONNECTING) {
        _pending.push(obj);
        return true;
      }
      return false;
    },

    close() {
      const old = _ws;
      _ws = null;
      _sid = null;
      _pending = [];
      if (old) {
        old.onmessage = null;
        old.onclose = null;
        old.onerror = null;
        try { old.close(1000); } catch (e) { /* already gone */ }
      }
      _setState("blank");
    },

    // closes any open socket, then binds this window to sid
    bind(sid) {
      if (_ws) {
        const old = _ws;
        _ws = null;
        old.onmessage = null;
        old.onclose = null;
        old.onerror = null;
        try { old.close(1000); } catch (e) { /* already gone */ }
      }
      _pending = [];
      _sid = sid;
      _setState("opening");
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${scheme}://${window.location.host}/ws/ade/${encodeURIComponent(sid)}`);
      _ws = ws;

      ws.onopen = function () {
        if (_ws !== ws) return;
        // flush held frames in order, then drop the queue
        const queued = _pending;
        _pending = [];
        for (const obj of queued) {
          try { ws.send(JSON.stringify(obj)); } catch (e) { /* one frame does not stop the rest */ }
        }
        _setState("live");
      };
      ws.onclose = function () {
        if (_ws === ws) {
          _ws = null;
          _pending = [];
          _setState("closed");
        }
      };
      ws.onerror = function () {
        if (_ws === ws) _setState("closed");
      };
      ws.onmessage = function (ev) {
        if (_ws !== ws) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg && msg.type === "session_refused") {
          _setState("refused", msg.reason || "");
          return;
        }
        _deliver(msg);
      };
      return ws;
    },
  };

  MX.socket = sock;
})();
