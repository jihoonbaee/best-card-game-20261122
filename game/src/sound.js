// Ember Court — sounds, synthesized with WebAudio. No audio files are
// shipped: every sound is a few oscillators shaped in code. Everything
// is guarded, so a browser with no audio (or a headless one) just plays
// silent instead of throwing.
let ctx = null;

function audio() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

function tone(freq, dur, type, gain, when = 0) {
  const ac = audio();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') void ac.resume();
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ac.currentTime + when;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch {
    // Silence is fine.
  }
}

const SOUNDS = {
  pick: () => tone(520, 0.09, 'sine', 0.08),
  play: () => {
    tone(392, 0.12, 'triangle', 0.12);
    tone(523, 0.14, 'triangle', 0.1, 0.07);
  },
  turn: () => tone(330, 0.15, 'sine', 0.09),
  hit: () => tone(180, 0.12, 'square', 0.07),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.11));
  },
  lose: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, i * 0.13));
  },
};

export function playSound(name) {
  const fn = SOUNDS[name];
  if (fn) fn();
}
