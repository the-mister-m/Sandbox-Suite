
const _defaults = {
  skin: 'og',
  modal_mode: 'fullscreen',
  modal_mode_ade: 'inherit',
  gate_keyboard: true,
  approve_hold: false,
  confirm: {
    editor_save: 'ask', file_delete: 'ask', file_move: 'ask', terminal_run: 'ask',
    setroot: 'ask', session_new: 'ask', session_load: 'ask',
    delete_saved_session: 'ask', delete_voice: 'ask',
    room_remove: 'ask', room_load: 'ask', gate_matrix_save: 'ask',
  },
  killswitch: { scope: 'models', hold_to_fire: true },
};

let _flags = _defaults;

export function refresh() {
  return fetch('/api/global')
    .then(r => r.json())
    .then(d => { _flags = d; return _flags; })
    .catch(() => _flags);
}

export function flags() { return _flags; }

const _MODES = ['fullscreen', 'window', 'corner', 'off'];
export function modalMode() {
  const m = flags().modal_mode;
  return _MODES.includes(m) ? m : 'fullscreen';
}

export function modalModeFor(shell) {
  if (shell === 'ade') {
    const o = flags().modal_mode_ade;
    if (o && o !== 'inherit' && _MODES.includes(o)) return o;
  }
  return modalMode();
}

export function gateKeyboard() {
  return flags().gate_keyboard !== false;
}

export function approveHold() {
  return flags().approve_hold === true;
}

export function shouldConfirm(key) {
  return (flags().confirm || {})[key] !== 'silent';
}

refresh();
