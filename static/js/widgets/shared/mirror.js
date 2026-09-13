// mirror — cross-instance sync for widgets sharing one target
//
// MX.mirror(frame, channel, apply, targetKey): emit(fields) broadcasts
// target and inst plus fields on channel; apply(payload, meta) fires for a
// same-target payload from another instance, or any remote arrival (two
// tabs on one surface share instance ids). meta forwarded from bus.on
// (remote true on a cross-tab arrival, undefined on a same-tab local one).
// targetKey names the frame option compared against payload.target,
// default "target", exact match per contract 2.2; a non-default key left
// empty follows every target (editor graphTarget). off() removes the
// listener.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.mirror = function (frame, channel, apply, targetKey) {
    targetKey = targetKey || "target";
    const off = MX.bus.on(channel, (payload, meta) => {
      if (!payload) return;
      if (!(meta && meta.remote) && payload.inst === frame.id) return;
      if (targetKey === "target" ? payload.target !== (frame.options.target || "")
          : frame.options[targetKey] && payload.target !== frame.options[targetKey]) return;
      try { apply(payload, meta); } catch (e) { console.warn("mirror apply:", e); }
    });

    return {
      emit(fields) {
        MX.bus.emit(channel,
          Object.assign({ target: frame.options.target || "", inst: frame.id }, fields),
          { remote: true });
      },
      off,
    };
  };
})();
