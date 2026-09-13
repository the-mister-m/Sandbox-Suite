// module loader — memoized promise per key, retries after a rejection
//
// MX.moduleReady(key, loader): returns the memoized promise for key,
// creating it with loader() on first call. A rejection drops the memo
// so the next call retries. Same pattern as MX.monacoReady.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const _pending = Object.create(null);

  MX.moduleReady = function (key, loader) {
    if (_pending[key]) return _pending[key];
    const p = Promise.resolve(loader());
    _pending[key] = p;
    p.catch(() => { delete _pending[key]; });
    return p;
  };
})();
