
import { flags } from './globalflags.js';

const HOLD_MS = 600;

export function wireHoldToFire(btn, fire, { holdMs = HOLD_MS, bypassCheck = null } = {}) {
  let timer = null;
  btn.classList.add('hold-to-fire');
  btn.style.setProperty('--ks-hold-ms', holdMs + 'ms');

  const doFire = () => {
    fire();
    btn.classList.add('ks-fired');
    setTimeout(() => btn.classList.remove('ks-fired'), 900);
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    btn.classList.remove('ks-holding');
  };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.style.setProperty('--htf-fill', getComputedStyle(btn).color);
    if (bypassCheck && bypassCheck()) { doFire(); return; }
    btn.classList.add('ks-holding');
    timer = setTimeout(() => { cancel(); doFire(); }, holdMs);
  });
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
}

export function wireKillswitch(btn, sendText) {
  wireHoldToFire(btn, () => sendText('/killswitch'), {
    bypassCheck: () => !flags().killswitch.hold_to_fire,
  });
}
