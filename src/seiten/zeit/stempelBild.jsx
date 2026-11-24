// Animation nach dem Stempeln für bestimmte Personen (Wunsch Patrick 20. November 2026).
// Wer welche bekommt, steht nur in der Datenbank (app_config „zeit_stempel_bild“),
// die Bilder liegen unter hofertime/stempel/<name>-kommen.webp bzw. -gehen.webp.
// Seit 1.752.0: Animationen mit dem Foto einer Person stehen nur in der Datenbank
// (app_config „zeit_stempel_foto“, Funktion zeit_stempel_foto), nie im Repository;
// gibt es dort eine, gilt sie vor der Datei.
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";

// Ton zur Animation (Wunsch Patrick 24. November 2026: „bei Renz Shotgun soll auch Sound sein“).
// Gerechnet mit WebAudio, ohne Dateien; abgestimmt auf die Bilder (50 ms je Bild):
// Pumpe zurück ab 0.8 s, vor bis 1.5 s, Hülse fällt um 1.7 s.
let ctx = null;
function audio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}
// Safari am iPad spielt nur, wenn der Ton bei einem Tipp freigegeben wurde. Die
// Animation kommt erst nach der Antwort des Servers, darum schon beim Tipp freigeben.
if (typeof document !== "undefined") {
  const frei = () => { audio(); };
  document.addEventListener("pointerdown", frei, { capture: true, passive: true });
  document.addEventListener("keydown", frei, { capture: true });
}
function knall(c, t, { dauer = 0.06, frei = 2500, q = 1.5, laut = 0.8, art = "bandpass" } = {}) {
  // Kurzes Rauschen durch einen Filter: klingt nach Metall auf Metall.
  const n = Math.ceil(c.sampleRate * dauer);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const q1 = c.createBufferSource(); q1.buffer = b;
  const f = c.createBiquadFilter(); f.type = art; f.frequency.value = frei; f.Q.value = q;
  const g = c.createGain(); g.gain.value = laut;
  q1.connect(f); f.connect(g); g.connect(c.destination);
  q1.start(t);
}
function klang(c, t, frei, dauer, laut) {
  const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = frei;
  const g = c.createGain();
  g.gain.setValueAtTime(laut, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dauer);
}
function flinte() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  // KLICK: Pumpe nach hinten
  knall(c, t + 0.80, { frei: 1800, laut: 0.9, dauer: 0.05 });
  knall(c, t + 0.86, { frei: 600, art: "lowpass", laut: 0.7, dauer: 0.12 });
  knall(c, t + 1.12, { frei: 3200, laut: 0.6, dauer: 0.04 });
  // KLACK: Pumpe nach vorne, Verschluss zu
  knall(c, t + 1.42, { frei: 1400, laut: 1, dauer: 0.06 });
  knall(c, t + 1.46, { frei: 400, art: "lowpass", laut: 0.9, dauer: 0.15 });
  // Hülse fällt und springt auf dem Boden
  [[1.70, 0.35], [1.84, 0.22], [1.93, 0.12]].forEach(([z, l]) => {
    klang(c, t + z, 2900, 0.25, l * 0.5); klang(c, t + z, 4300, 0.18, l * 0.3);
  });
}
// Schreck für Flavia (Wunsch Patrick 24. November 2026): Schrei mit Knall, einmal,
// 0.3 s nach dem Start, wenn die Fratze ins Bild springt.
function schrei(c, t0, ziel) {
  ziel = ziel || c.destination;
  const komp = c.createDynamicsCompressor(); komp.threshold.value = -14; komp.ratio.value = 6;
  const haupt = c.createGain(); haupt.gain.value = 0.9; komp.connect(haupt); haupt.connect(ziel);
  // Hall aus abklingendem Rauschen
  const hall = c.createConvolver(), hl = Math.floor(c.sampleRate * 1.8), ib = c.createBuffer(2, hl, c.sampleRate);
  for (let k = 0; k < 2; k++) { const d = ib.getChannelData(k); for (let i = 0; i < hl; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / hl, 3); }
  hall.buffer = ib; const hg = c.createGain(); hg.gain.value = 0.35; hall.connect(hg); hg.connect(komp);
  const mix = c.createGain(); mix.connect(komp); mix.connect(hall);
  const rauschBuf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), rd = rauschBuf.getChannelData(0);
  for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1;
  // Schlag: tiefer Knall und greller Riss
  const bo = c.createOscillator(), bg = c.createGain(); bo.type = "sine";
  bo.frequency.setValueAtTime(120, t0); bo.frequency.exponentialRampToValueAtTime(30, t0 + 0.6);
  bg.gain.setValueAtTime(1.4, t0); bg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
  bo.connect(bg); bg.connect(mix); bo.start(t0); bo.stop(t0 + 1);
  const ri = c.createBufferSource(); ri.buffer = rauschBuf; const rf = c.createBiquadFilter(); rf.type = "highpass"; rf.frequency.value = 2500;
  const rg = c.createGain(); rg.gain.setValueAtTime(0.9, t0); rg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
  ri.connect(rf); rf.connect(rg); rg.connect(mix); ri.start(t0); ri.stop(t0 + 0.4);
  // Schrei: verzerrte Stimmen mit Vibrato und Formanten
  const T = 2.6, s0 = t0 + 0.02;
  const verz = c.createWaveShaper(), kurve = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; kurve[i] = Math.tanh(x * 4); } verz.curve = kurve;
  const stimme = c.createGain();
  stimme.gain.setValueAtTime(0.0001, s0); stimme.gain.exponentialRampToValueAtTime(0.5, s0 + 0.06);
  stimme.gain.setValueAtTime(0.5, s0 + T - 0.7); stimme.gain.exponentialRampToValueAtTime(0.0001, s0 + T);
  stimme.connect(verz);
  const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 7.5; vg.gain.value = 45; vib.connect(vg);
  const vib2 = c.createOscillator(), vg2 = c.createGain(); vib2.frequency.value = 23; vg2.gain.value = 18; vib2.connect(vg2);
  for (const [vers, art, laut] of [[1, "sawtooth", .45], [1.013, "sawtooth", .35], [0.497, "square", .25], [1.51, "sawtooth", .15]]) {
    const o = c.createOscillator(), g = c.createGain(); o.type = art; g.gain.value = laut;
    o.frequency.setValueAtTime(380 * vers, s0);
    o.frequency.exponentialRampToValueAtTime(980 * vers, s0 + 0.18);
    o.frequency.linearRampToValueAtTime(1080 * vers, s0 + 1.2);
    o.frequency.linearRampToValueAtTime(900 * vers, s0 + T - 0.5);
    o.frequency.exponentialRampToValueAtTime(420 * vers, s0 + T);
    vg.connect(o.frequency); vg2.connect(o.frequency);
    o.connect(g); g.connect(stimme); o.start(s0); o.stop(s0 + T + 0.05);
  }
  vib.start(s0); vib.stop(s0 + T); vib2.start(s0); vib2.stop(s0 + T);
  for (const [f, q, l] of [[1100, 4, 1.0], [2600, 6, 0.8], [3600, 8, 0.4], [700, 3, 0.4]]) {
    const b = c.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = f; b.Q.value = q;
    const g = c.createGain(); g.gain.value = l * 0.55; verz.connect(b); b.connect(g); g.connect(mix);
  }
  // Atem / Kratzen im Schrei
  const at = c.createBufferSource(); at.buffer = rauschBuf; const af = c.createBiquadFilter(); af.type = "bandpass"; af.frequency.value = 3200; af.Q.value = 1.5;
  const ag = c.createGain(); ag.gain.setValueAtTime(0.0001, s0); ag.gain.exponentialRampToValueAtTime(0.35, s0 + 0.08);
  ag.gain.setValueAtTime(0.35, s0 + T - 0.6); ag.gain.exponentialRampToValueAtTime(0.0001, s0 + T);
  at.connect(af); af.connect(ag); ag.connect(mix); at.start(s0); at.stop(s0 + T);
  return T + 1.2;
}
function schreck() {
  const c = audio(); if (!c) return;
  schrei(c, c.currentTime + 0.3);
}
schreck.einmal = true;
const TOENE = { "renz-kommen": flinte, "schreck-kommen": schreck };

const fotos = new Map(); // "name-art" -> Promise<string|null>

function fotoHolen(name, art) {
  const k = name + "-" + art;
  if (!fotos.has(k)) {
    fotos.set(k, (async () => {
      try {
        const r = await alt.zeitlimit(alt.db.rpc("zeit_stempel_foto", { p_name: name, p_art: art }), 4000, "Stempelfoto");
        const d = r && !r.error && typeof r.data === "string" ? r.data : "";
        return d.startsWith("data:image/") ? d : null;
      } catch { fotos.delete(k); return null; }
    })());
  }
  return fotos.get(k);
}

// Wie lange die Einblendung nach dem Stempeln steht. Der Schreck für Flavia braucht
// rund 3.6 s bis zum Schlussbild, das soll danach länger stehen (Wunsch Patrick
// 24. November 2026: „lass den Schluss ein paar Sekunden länger eingeblendet“).
export function stempelBildDauer(name, art) {
  return name === "schreck" && art !== "gehen" ? 14000 : 9000;
}

export async function stempelBildHolen(personId) {
  if (!personId) return null;
  try {
    const r = await alt.zeitlimit(alt.db.rpc("zeit_stempel_bild", { p_person: personId }), 2500, "Stempelbild");
    const n = r && !r.error && typeof r.data === "string" ? r.data : "";
    if (!/^[a-z0-9-]+$/.test(n)) return null;
    // Gleich beide vorladen, damit die Animation ohne Warten kommt.
    fotoHolen(n, "kommen"); fotoHolen(n, "gehen");
    return n;
  } catch { return null; }
}

export function StempelBild({ name, art }) {
  const a = art === "gehen" ? "gehen" : "kommen";
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!name) return;
    let weg = false;
    const datei = "./hofertime/stempel/" + name + "-" + a + ".webp?2";
    // Höchstens kurz auf das Foto aus der Datenbank warten, sonst die Datei.
    const t = setTimeout(() => { if (!weg) setSrc((s) => s || datei); }, 1500);
    fotoHolen(name, a).then((d) => { if (!weg) setSrc(d || datei); });
    return () => { weg = true; clearTimeout(t); };
  }, [name, a]);
  const ton = TOENE[name + "-" + a];
  // Die Animation läuft alle 3 s im Kreis: der Ton läuft im selben Takt mit, solange sie zu sehen ist
  useEffect(() => {
    if (!src || !ton) return undefined;
    ton();
    if (ton.einmal) return undefined;
    const t = setInterval(ton, 3000);
    return () => clearInterval(t);
  }, [!!src, ton]);
  if (!name || !src) return null;
  // Gibt es für diese Art kein Bild (z. B. crossfit nur beim Gehen), steht der normale Haken.
  if (src === "haken") return <div className="ze-bestaetigt__haken">✓</div>;
  return <img className="ze-bestaetigt__bild" src={src} alt="" data-ze-stempelbild={name} onError={() => setSrc("haken")} />;
}
