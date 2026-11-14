// Töne für den 1×1 Rider, ganz ohne Dateien mit WebAudio erzeugt.
// iPad und iPhone geben erst nach einem Tipp Ton frei, darum startet
// entsperren() beim Knopf „Los“.
let ctx = null, an = true, master = null;

export function tonAn(w) { an = !!w; }
export function entsperren() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) { ctx = null; }
}

function ton(freq, dauer, { typ = "sine", laut = 0.3, ab = 0, gleit = 0 } = {}) {
  if (!an || !ctx) return;
  const t = ctx.currentTime + ab;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = typ; o.frequency.setValueAtTime(freq, t);
  if (gleit) o.frequency.exponentialRampToValueAtTime(gleit, t + dauer);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(laut, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dauer + 0.05);
}

function rauschen(dauer, { laut = 0.2, ab = 0, hoch = 800 } = {}) {
  if (!an || !ctx) return;
  const t = ctx.currentTime + ab;
  const n = Math.floor(ctx.sampleRate * dauer);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const q = ctx.createBufferSource(); q.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = hoch;
  const g = ctx.createGain(); g.gain.value = laut;
  q.connect(f); f.connect(g); g.connect(master); q.start(t);
}

export const TON = {
  taste() { ton(880, 0.05, { typ: "square", laut: 0.06 }); },
  richtig(serie) {
    const basis = 520 * Math.pow(1.06, Math.min(serie, 20));
    ton(basis, 0.12, { typ: "triangle", laut: 0.35 });
    ton(basis * 1.25, 0.12, { typ: "triangle", laut: 0.3, ab: 0.07 });
    ton(basis * 1.5, 0.22, { typ: "triangle", laut: 0.3, ab: 0.14 });
    rauschen(0.25, { laut: 0.12, hoch: 3000 });
  },
  falsch() {
    ton(220, 0.35, { typ: "sawtooth", laut: 0.18, gleit: 90 });
    rauschen(0.45, { laut: 0.35, hoch: 400 });
  },
  tick() { ton(1200, 0.04, { typ: "square", laut: 0.05 }); },
  zaehlen(letzter) { ton(letzter ? 1046 : 523, letzter ? 0.4 : 0.15, { typ: "square", laut: 0.15 }); },
  serie() {
    [0, 0.08, 0.16, 0.24].forEach((ab, i) => ton(660 * Math.pow(1.26, i), 0.18, { typ: "square", laut: 0.12, ab }));
    rauschen(0.6, { laut: 0.15, hoch: 1500, ab: 0.05 });
  },
  sieg() {
    const n = [523, 659, 784, 1046, 784, 1046];
    n.forEach((f, i) => ton(f, i === n.length - 1 ? 0.7 : 0.16, { typ: "square", laut: 0.14, ab: i * 0.13 }));
    n.forEach((f, i) => ton(f / 2, i === n.length - 1 ? 0.7 : 0.16, { typ: "triangle", laut: 0.2, ab: i * 0.13 }));
    // Jubel wie im Stadion
    rauschen(1.8, { laut: 0.25, hoch: 1200, ab: 0.3 });
  },
  levelUp() {
    [0, 0.1, 0.2, 0.3, 0.4].forEach((ab, i) => ton(523 * Math.pow(1.19, i), 0.25, { typ: "triangle", laut: 0.25, ab }));
  },
};
