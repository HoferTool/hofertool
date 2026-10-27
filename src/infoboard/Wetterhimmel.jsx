// =================================================================
//  WETTER AM EMPFANG
//  Je nach Wetter und Jahreszeit fällt über den ganzen Bildschirm
//  Schnee, Regen, Laub oder Blüten, bei Sonne leuchtet es sanft
//  (Wunsch Patrick 27. Oktober 2026: „je nach Wetter und Saison Schnee,
//  Regen, Sonne etc. fallen, über eine Checkbox, unabhängig vom
//  Layout“). Eingeschaltet mit aufbau.effekte, das ein Layout beim
//  Aktivieren nicht ändert. Ein Canvas über allem, ohne Klicks, damit
//  Gestalten und Antippen am Bildschirm gleich bleiben.
// =================================================================

import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";

// Wahl zum Ausprobieren beim Gestalten; "" = das Wetter von jetzt
export const EFFEKTE = [
  ["", "Wetter von jetzt"], ["schnee", "Schnee"], ["regen", "Regen"], ["gewitter", "Gewitter"],
  ["sonne", "Sonne"], ["nebel", "Nebel"], ["wolken", "Wolken"], ["laub", "Herbstlaub"], ["blueten", "Blüten"], ["sterne", "Sterne"],
];

// Aus dem Wettercode (open-meteo, WMO) und der Jahreszeit, was zu sehen ist.
// Ohne Niederschlag zeigt die Jahreszeit sich: im Herbst Laub, im Frühling Blüten.
export function effektFuer(w, datum = new Date()) {
  if (!w || w.code == null) return null;
  const c = w.code, m = datum.getMonth() + 1;
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "schnee";
  if (c >= 95) return "gewitter";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "regen";
  if (c === 45 || c === 48) return "nebel";
  if (m >= 9 && m <= 11) return "laub";
  if (m >= 3 && m <= 5) return "blueten";
  if (w.tag === false) return c <= 1 ? "sterne" : "wolken";
  return c <= 1 ? "sonne" : "wolken";
}

function useWetterCode() {
  const [w, setW] = useState(null);
  useEffect(() => {
    let gueltig = true;
    const holen = () => alt.holeWetter().then((x) => gueltig && setW(x), () => {});
    holen();
    const t = setInterval(holen, 15 * 60 * 1000);
    return () => { gueltig = false; clearInterval(t); };
  }, []);
  return w;
}

const zufall = (a, b) => a + Math.random() * (b - a);
const LAUB = ["#c0532b", "#d9822b", "#e3a72f", "#9b3d22", "#b8692a"];
const BLUETEN = ["#f7c6d5", "#f3b0c6", "#fde3ea", "#eea3bb", "#f9d2df"];

// Teilchen je Art: wie viele, wie sie entstehen und wie sie sich bewegen
const ARTEN = {
  schnee: { n: 170, neu: (b, h, oben) => ({ x: zufall(0, b), y: oben ? zufall(-h, 0) : zufall(0, h), r: zufall(2, 6.5), v: zufall(0.5, 1.6), p: zufall(0, 6.3) }),
    schritt: (t, d) => { t.y += t.v * d; t.p += 0.012 * d; t.x += Math.sin(t.p) * 0.6 * d; },
    zeichne: (g, t) => { // Weiss mit zartem blaugrauem Rand, damit Schnee auch auf hellem Grund zu sehen ist
      g.globalAlpha = 0.9; g.fillStyle = "#ffffff"; g.strokeStyle = "rgba(110,140,175,.6)"; g.lineWidth = 1.2;
      g.beginPath(); g.arc(t.x, t.y, t.r, 0, 6.283); g.fill(); g.stroke(); } },
  regen: { n: 230, neu: (b, h, oben) => ({ x: zufall(-200, b), y: oben ? zufall(-h, 0) : zufall(0, h), l: zufall(18, 34), v: zufall(14, 22) }),
    schritt: (t, d) => { t.y += t.v * d; t.x += t.v * 0.18 * d; },
    zeichne: (g, t) => { g.globalAlpha = 0.45; g.strokeStyle = "#5f86a8"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x + t.l * 0.18, t.y + t.l); g.stroke(); } },
  laub: { n: 34, neu: (b, h, oben) => ({ x: zufall(0, b), y: oben ? zufall(-h * 0.5, -40) : zufall(0, h), r: zufall(12, 22), v: zufall(0.7, 1.5),
      p: zufall(0, 6.3), dr: zufall(-0.03, 0.03), w: zufall(0, 6.3), f: LAUB[(Math.random() * LAUB.length) | 0] }),
    schritt: (t, d) => { t.y += t.v * d; t.p += 0.015 * d; t.x += Math.sin(t.p) * 1.4 * d; t.w += t.dr * d; },
    zeichne: (g, t) => { g.globalAlpha = 0.9; g.save(); g.translate(t.x, t.y); g.rotate(t.w); g.scale(1, Math.abs(Math.cos(t.p)) * 0.6 + 0.4);
      g.fillStyle = t.f; g.beginPath(); g.moveTo(0, -t.r); g.quadraticCurveTo(t.r * 0.9, 0, 0, t.r); g.quadraticCurveTo(-t.r * 0.9, 0, 0, -t.r); g.fill();
      g.strokeStyle = "rgba(80,40,10,.45)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -t.r); g.lineTo(0, t.r * 1.2); g.stroke(); g.restore(); } },
  blueten: { n: 60, neu: (b, h, oben) => ({ x: zufall(0, b), y: oben ? zufall(-h * 0.5, -20) : zufall(0, h), r: zufall(6, 11), v: zufall(0.5, 1.1),
      p: zufall(0, 6.3), w: zufall(0, 6.3), f: BLUETEN[(Math.random() * BLUETEN.length) | 0] }),
    schritt: (t, d) => { t.y += t.v * d; t.p += 0.018 * d; t.x += (Math.sin(t.p) * 1.1 + 0.35) * d; t.w += 0.02 * d; },
    zeichne: (g, t) => { g.globalAlpha = 0.9; g.save(); g.translate(t.x, t.y); g.rotate(t.w); g.fillStyle = t.f;
      g.strokeStyle = "rgba(200,110,140,.45)"; g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, 0, t.r, t.r * 0.6, 0, 0, 6.283); g.fill(); g.stroke(); g.restore(); } },
  nebel: { n: 9, neu: (b, h) => ({ x: zufall(-600, b), y: zufall(h * 0.2, h), r: zufall(260, 520), v: zufall(0.15, 0.45) }),
    schritt: (t, d, b) => { t.x += t.v * d; if (t.x - t.r > b) t.x = -t.r; },
    zeichne: (g, t) => { const v = g.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
      v.addColorStop(0, "rgba(160,175,192,.32)"); v.addColorStop(1, "rgba(160,175,192,0)");
      g.globalAlpha = 1; g.fillStyle = v; g.fillRect(t.x - t.r, t.y - t.r, 2 * t.r, 2 * t.r); } },
  wolken: { n: 5, neu: (b, h) => ({ x: zufall(-500, b), y: zufall(h * 0.32, h * 0.9), r: zufall(140, 240), v: zufall(0.12, 0.3) }),
    schritt: (t, d, b) => { t.x += t.v * d; if (t.x - 3 * t.r > b) t.x = -2 * t.r; },
    zeichne: (g, t) => { g.globalAlpha = 0.13; g.fillStyle = "#8ea4bb";
      for (const [dx, dy, s] of [[0, 0, 1], [t.r * 0.9, t.r * 0.15, 0.75], [-t.r * 0.85, t.r * 0.2, 0.7], [t.r * 0.35, -t.r * 0.35, 0.7]]) {
        g.beginPath(); g.arc(t.x + dx, t.y + dy, t.r * s, 0, 6.283); g.fill(); } } },
  sterne: { n: 70, neu: (b, h) => ({ x: zufall(0, b), y: zufall(0, h), r: zufall(1.5, 3.5), p: zufall(0, 6.3), v: zufall(0.01, 0.03) }),
    schritt: (t, d) => { t.p += t.v * d; },
    zeichne: (g, t) => { g.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t.p)); g.fillStyle = "#d9a93a";
      g.beginPath(); g.arc(t.x, t.y, t.r, 0, 6.283); g.fill(); } },
  sonne: { n: 26, neu: (b, h) => ({ x: zufall(0, b), y: zufall(h * 0.25, h), r: zufall(30, 90), p: zufall(0, 6.3), v: zufall(0.004, 0.012), dx: zufall(0.1, 0.35), dy: zufall(-0.25, -0.08) }),
    schritt: (t, d, b, h) => { t.p += t.v * d; t.x += t.dx * d; t.y += t.dy * d; if (t.y + t.r < 0 || t.x - t.r > b) { t.y = h + t.r; t.x = zufall(-t.r, b); } },
    zeichne: (g, t) => { const v = g.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
      v.addColorStop(0, "rgba(255,226,140,.5)"); v.addColorStop(1, "rgba(255,226,140,0)");
      g.globalAlpha = 0.35 + 0.35 * Math.sin(t.p); g.fillStyle = v; g.fillRect(t.x - t.r, t.y - t.r, 2 * t.r, 2 * t.r); } },
};
ARTEN.gewitter = ARTEN.regen;

export default function Wetterhimmel({ breite, hoehe, probe }) {
  const w = useWetterCode();
  const art = probe || effektFuer(w);
  const flaeche = useRef(null);
  const blitz = useRef(null);

  useEffect(() => {
    const leinwand = flaeche.current;
    const a = ARTEN[art];
    if (!leinwand || !a) return undefined;
    const g = leinwand.getContext("2d");
    const b = breite, h = hoehe;
    const teile = Array.from({ length: a.n }, () => a.neu(b, h, false));
    let zuletzt = performance.now(), bild = 0, naechsterBlitz = performance.now() + zufall(6000, 14000);
    const lauf = (jetzt) => {
      bild = requestAnimationFrame(lauf);
      if (document.hidden) { zuletzt = jetzt; return; }
      // Gleich schnell bei 30 wie bei 60 Bildern je Sekunde
      const d = Math.min(3, (jetzt - zuletzt) / 16.7);
      zuletzt = jetzt;
      g.clearRect(0, 0, b, h);
      if (art === "sonne") {
        // Sanftes Licht aus der Ecke oben rechts, langsam atmend
        const s = g.createRadialGradient(b * 0.92, -h * 0.1, 0, b * 0.92, -h * 0.1, h * 1.1);
        s.addColorStop(0, "rgba(255,214,110,.35)"); s.addColorStop(1, "rgba(255,214,110,0)");
        g.globalAlpha = 0.75 + 0.25 * Math.sin(jetzt / 3000); g.fillStyle = s; g.fillRect(0, 0, b, h);
      }
      for (let i = 0; i < teile.length; i++) {
        const t = teile[i];
        a.schritt(t, d, b, h);
        if (t.y - 60 > h || t.x - 80 > b) teile[i] = a.neu(b, h, true);
        a.zeichne(g, teile[i]);
      }
      g.globalAlpha = 1;
      if (art === "gewitter" && jetzt > naechsterBlitz && blitz.current) {
        naechsterBlitz = jetzt + zufall(7000, 16000);
        blitz.current.classList.remove("ib-wetter__blitz--an");
        void blitz.current.offsetWidth;
        blitz.current.classList.add("ib-wetter__blitz--an");
      }
    };
    bild = requestAnimationFrame(lauf);
    return () => { cancelAnimationFrame(bild); g.clearRect(0, 0, b, h); };
  }, [art, breite, hoehe]);

  if (!art) return null;
  return (
    <div className="ib-wetter" data-ib="wetter" data-effekt={art} aria-hidden="true">
      <canvas ref={flaeche} width={breite} height={hoehe} />
      {art === "gewitter" && <div ref={blitz} className="ib-wetter__blitz" />}
    </div>
  );
}
