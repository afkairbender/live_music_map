// Tiny WebAudio synth blips for UI interactions. Everything is quiet, short,
// and created lazily on first user gesture (so autoplay policies are happy).

let ctx = null;
let muted = localStorage.getItem("lmm.muted") === "1";

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  localStorage.setItem("lmm.muted", muted ? "1" : "0");
  return muted;
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = "sine", gain = 0.04, delay = 0) {
  if (muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch {
    // audio unavailable — stay silent
  }
}

// soft marimba-ish pops rather than anything harsh
export const tick = () => tone(1320, 0.05, "sine", 0.015);
export const blip = () => {
  tone(523.25, 0.09, "sine", 0.05);
  tone(783.99, 0.12, "sine", 0.035, 0.06);
};
export const zap = () => tone(392, 0.1, "sine", 0.04);
export const chime = () =>
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(f, 0.16, "sine", 0.045, i * 0.08)
  );
