/** Prompt 10 — Son d'ambiance optionnel : sons doux synthétiques (Web Audio), désactivé par défaut.
 *  Respecte le silence système : si l'onglet/OS est muet, la sortie audio est muette. */
const KEY = "vdc_sound";
export const isSoundOn = () => localStorage.getItem(KEY) === "on";
export const setSoundOn = (on) => {
  localStorage.setItem(KEY, on ? "on" : "off");
  window.dispatchEvent(new Event("vdc-sound-changed"));
};

let ctx = null;
const TONES = {
  success: [523.25, 783.99], complete: [587.33, 880.0], create: [659.25, 987.77],
  badge: [783.99, 1174.66], step: [493.88, 739.99],
};

export const chime = (type = "success", force = false) => {
  if (!force && !isSoundOn()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") ctx.resume();
    const [f1, f2] = TONES[type] || TONES.success;
    const now = ctx.currentTime;
    [f1, f2].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.34);
    });
  } catch {
    /* silencieux */
  }
};
