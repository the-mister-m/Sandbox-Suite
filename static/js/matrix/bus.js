// matrix bus — local pub/sub per channel, mirrored across tabs via widget_bus

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const _channels = Object.create(null);

  function _listenersFor(channel) {
    if (!_channels[channel]) _channels[channel] = [];
    return _channels[channel];
  }

  const bus = {
    on(channel, fn) {
      const list = _listenersFor(channel);
      list.push(fn);
      return function () {
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },

    off(channel, fn) {
      const list = _channels[channel];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },

    emit(channel, payload, opts) {
      const list = _channels[channel];
      if (list) {
        for (const fn of list.slice()) {
          try { fn(payload); } catch (e) { /* one listener does not stop the rest */ }
        }
      }
      if (opts && opts.remote) {
        MX.socket.send({ type: "widget_bus", channel: channel, payload: payload, inst: MX.TAB_ID });
      }
    },
  };

  MX.socket.onFrame((msg) => {
    if (msg.type !== "widget_bus") return;
    if (msg.inst === MX.TAB_ID) return; // own frame, dropped
    const list = _channels[msg.channel];
    if (!list) return;
    for (const fn of list.slice()) {
      try { fn(msg.payload, { remote: true }); } catch (e) { /* one listener does not stop the rest */ }
    }
  });

  MX.bus = bus;
})();
