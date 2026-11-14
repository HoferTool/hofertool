// HOFERCAM: Bearbeitungssimulation Kanal 1 als Fenster (seit 1.543.0,
// Wunsch Patrick 14. November 2026). Langdreher: das Werkzeug steht, das
// Material fährt in Z aus der Führungsbüchse (2 mm vor den Drehwerk-
// zeugen). Rohteil aus G266 (A = Ø, W = Länge, B = Abstechbreite).
// Am Schluss steht das Fertigteil (Wunsch Patrick: „ich sehe dann also
// das Fertigteil?“).
import { useEffect, useMemo, useRef, useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { BUECHSE_MM, RASTER, k2Innen, materialStand, simulieren, werkzeugArt } from "./camSim.js";

const BREIT = 1100, HOCH = 460;
const TEMPI = [["0.5", "½×"], ["1", "1×"], ["3", "3×"], ["10", "10×"], ["40", "40×"]];

let offenZu = null;
export function simulationOeffnen(k1, k2) {
  if (offenZu) offenZu();
  offenZu = fensterOeffnen((zu) => <Simulation k1={k1} k2={k2} zu={zu} />, () => { offenZu = null; }, "cam-sim-huelle");
}

function zeichnen(cv, bahn, n, mass) {
  const c = cv.getContext("2d");
  const { s, linie, cy } = mass;
  c.clearRect(0, 0, BREIT, HOCH);
  c.fillStyle = "#f4f7fa"; c.fillRect(0, 0, BREIT, HOCH);
  const st = materialStand(bahn, n);
  const p = bahn.punkte[Math.max(0, Math.min(n, bahn.punkte.length) - 1)] || { x: st.A + 2, z: 0, t: 0, nr: 0 };
  const zc = p.z;
  // Kanal 2: das abgestochene Teil steckt in der Gegenspindel, die Rückseite
  // zeigt zum Werkzeug (gespiegelt)
  const k2 = p.kanal === 2;
  const X = k2 ? (z) => linie + (z - zc) * s : (z) => linie + (zc - z) * s;
  const zFern = k2 ? Math.min(st.laengeFertig ?? st.ab ?? st.W, zc + (BREIT - linie) / s + 1) : zc + linie / s + 1;
  const weg = k2 ? RASTER : st.ab != null ? st.ab + (st.B || 0) : RASTER; // nach dem Abstechen ist vorne nichts mehr
  // Mittellinie
  c.strokeStyle = "#9aa7b4"; c.setLineDash([10, 4, 2, 4]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, cy); c.lineTo(BREIT, cy); c.stroke(); c.setLineDash([]);
  // Material als Schnitt: oben und unten der Aussenradius, innen die Bohrung
  const r = (z, feld, roh) => { const k = Math.round(z / RASTER); return k >= 0 && k < st.zellen ? feld[k] : roh; };
  const zVon = k2 ? Math.max(RASTER, zc - linie / s - 1) : Math.max(weg, zc - (BREIT - linie) / s - 1);
  const schritt = Math.max(RASTER, 1 / s);
  const umriss = (vz) => {
    c.beginPath();
    for (let z = zVon; z <= zFern; z += schritt) c.lineTo(X(z), cy - vz * r(z, st.aussen, st.A / 2) * s);
    for (let z = zFern; z >= zVon; z -= schritt) c.lineTo(X(z), cy - vz * r(z, st.innen, 0) * s);
    c.closePath();
  };
  if (zVon < zFern) {
    c.fillStyle = "#a9b4c0"; c.strokeStyle = "#4b5865"; c.lineWidth = 1.2;
    umriss(1); c.fill(); c.stroke();
    umriss(-1); c.fill(); c.stroke();
  }
  // Führungsbüchse: 2 mm hinter dem Werkzeug, das Material läuft darin;
  // in Kanal 2 die Gegenspindel, die das Teil vorne hält
  const hb = (st.A / 2) * s;
  const xb = k2 ? Math.max(0, X(Math.min(3, (st.ab || 6) / 3))) : linie - BUECHSE_MM * s;
  c.fillStyle = "#33414f";
  c.fillRect(0, cy - hb - 46, xb, 46); c.fillRect(0, cy + hb, xb, 46);
  c.fillStyle = "rgba(51,65,79,.55)"; c.fillRect(0, cy - hb, xb, 2 * hb);
  c.fillStyle = "#fff"; c.font = "600 13px system-ui, sans-serif"; c.textAlign = "center";
  c.fillText(k2 ? "Gegenspindel" : "Führungsbüchse", Math.max(60, xb / 2), cy - hb - 20);
  // Bahn des laufenden Werkzeugs im Teil (mitfahrend)
  const art = !p.t ? "" : k2 ? (p.t >= 2100 && p.t <= 2499 ? (k2Innen(bahn, p.t) ? "front" : "dreh") : "anderes") : werkzeugArt(p.t);
  if (p.t) {
    c.strokeStyle = "rgba(230,120,20,.75)"; c.lineWidth = 1.2; c.beginPath();
    let an = false;
    for (let i = Math.max(0, n - 4000); i < n; i++) {
      const q = bahn.punkte[i];
      if (q.t !== p.t) { an = false; continue; }
      const y = cy - (art === "dreh" ? q.x / 2 : art === "front" ? (q.x > 0.01 ? q.x / 2 : 0) : q.x / 2) * s;
      if (!an) { c.moveTo(X(q.z), y); an = true; } else c.lineTo(X(q.z), y);
    }
    c.stroke();
  }
  // Werkzeug: steht fest auf der Linie, nur X ändert sich
  const name = p.t ? "T" + p.t + (p.w ? " " + p.w : "") : "kein Werkzeug";
  if (art === "dreh") {
    const y = cy - (p.x / 2) * s;
    const abst = /ABSTECH/i.test(p.w || "");
    const b = abst ? Math.max(4, (st.B || 1) * s) : 0;
    c.fillStyle = "#e0a12a"; c.strokeStyle = "#7a5410"; c.lineWidth = 1.5;
    c.beginPath();
    if (abst) { c.moveTo(linie, y); c.lineTo(linie + b, y); c.lineTo(linie + b, y - 90); c.lineTo(linie, y - 90); }
    else { c.moveTo(linie, y); c.lineTo(linie - 10, y - 26); c.lineTo(linie - 10, y - 90); c.lineTo(linie + 22, y - 90); c.lineTo(linie + 22, y - 18); }
    c.closePath(); c.fill(); c.stroke();
  } else if (art === "front") {
    const d = (p.w || "").match(/D\s*(\d+(?:\.\d+)?)/i);
    const rw = p.x > 0.01 ? 1.2 : d ? Number(d[1]) / 2 : 0.5;
    const y = cy - (p.x > 0.01 ? p.x / 2 : 0) * s;
    c.fillStyle = "#e0a12a"; c.strokeStyle = "#7a5410"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(linie, y); c.lineTo(linie + rw * s, y - rw * s); c.lineTo(BREIT - 20, y - rw * s);
    c.lineTo(BREIT - 20, y + rw * s); c.lineTo(linie + rw * s, y + rw * s); c.closePath(); c.fill(); c.stroke();
  } else if (p.t) {
    // Angetriebene Querwerkzeuge: nur die Lage, kein Abtrag im Schnitt
    const y = cy - (p.x / 2) * s;
    c.fillStyle = "#7a63c8"; c.beginPath(); c.arc(linie, y, 6, 0, 2 * Math.PI); c.fill();
  }
  // Schrift oben
  c.textAlign = "left"; c.fillStyle = "#1d2a36"; c.font = "600 15px system-ui, sans-serif";
  c.fillText((k2 ? "Kanal 2 · Rückseite · " : "Kanal 1 · Vorderseite · ") + name, 14, 24);
  c.font = "13px ui-monospace, monospace"; c.fillStyle = "#425466";
  c.fillText(k2 ? "Teil Z " + zc.toFixed(3) + " (von vorne)   Ø " + p.x.toFixed(3) : "Material Z " + zc.toFixed(3) + "   X " + p.x.toFixed(3), 14, 44);
  c.fillText("Rohteil Ø " + st.A + " · Länge " + (st.W ?? "–") + " · Abstecher " + (st.B ?? "–"), 14, HOCH - 14);
  // Pfeil: das Material fährt in Z
  c.strokeStyle = "#425466"; c.fillStyle = "#425466"; c.lineWidth = 1.5;
  const ay = cy + hb + 64;
  c.beginPath(); c.moveTo(xb + 8, ay); c.lineTo(xb + 90, ay); c.stroke();
  c.beginPath(); c.moveTo(xb + 90, ay); c.lineTo(xb + 82, ay - 5); c.lineTo(xb + 82, ay + 5); c.fill();
  c.textAlign = "left"; c.font = "12px system-ui, sans-serif"; c.fillText(k2 ? "Gegenspindel fährt in Z" : "Material fährt in Z", xb + 96, ay + 4);
  // Fertigteil nach dem Abstechen: unten rechts, ganze Kontur
  if (st.ab != null) fertigteil(c, st, n >= bahn.punkte.length);
}

function fertigteil(c, st, fertig) {
  const L = st.laengeFertig ?? st.ab, R = st.A / 2;
  const bw = 300, bh = 150, bx = BREIT - bw - 14, by = HOCH - bh - 14;
  c.fillStyle = "#fff"; c.strokeStyle = "#2f8f4e"; c.lineWidth = 2;
  c.fillRect(bx, by, bw, bh); c.strokeRect(bx, by, bw, bh);
  const k = Math.min((bw - 40) / Math.max(L, 0.1), (bh - 44) / (2 * R));
  const cx = bx + bw / 2 + (L * k) / 2, cy = by + 26 + (bh - 30) / 2;
  const X = (z) => cx - z * k;
  const r = (feld, z) => feld[Math.max(0, Math.min(st.zellen - 1, Math.round(z / RASTER)))];
  for (const vz of [1, -1]) {
    c.beginPath();
    for (let z = RASTER; z <= L; z += RASTER * 2) c.lineTo(X(z), cy - vz * r(st.aussen, z) * k);
    for (let z = L; z >= RASTER; z -= RASTER * 2) c.lineTo(X(z), cy - vz * r(st.innen, z) * k);
    c.closePath(); c.fillStyle = "#7fbf8f"; c.fill(); c.strokeStyle = "#1f6b37"; c.lineWidth = 1; c.stroke();
  }
  c.fillStyle = "#1f6b37"; c.font = "600 13px system-ui, sans-serif"; c.textAlign = "left";
  c.fillText((st.rueck ? (fertig ? "Fertigteil" : "Teil, Rückseite in Arbeit") : "Nach Kanal 1") + " · Länge " + L.toFixed(3), bx + 10, by + 18);
}

function Simulation({ k1, k2, zu }) {
  const bahn = useMemo(() => simulieren(k1, k2), [k1, k2]);
  const gesamt = bahn.punkte.length;
  const [n, setN] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [tempo, setTempo] = useState("3");
  const cv = useRef(null);
  const mass = useMemo(() => {
    const A = bahn.roh.A || 10;
    const zMax = bahn.punkte.reduce((m, p) => (p.vor && p.t && !p.kanal ? Math.max(m, p.z) : m), Math.max(10, bahn.roh.W || 0));
    const linie = BREIT * 0.4;
    const s = Math.max(4, Math.min((BREIT - linie - 30) / (zMax + 2), (HOCH / 2 - 80) / (A / 2 + 2)));
    return { s, linie, cy: HOCH / 2 - 10 };
  }, [bahn]);
  useEffect(() => { if (cv.current) zeichnen(cv.current, bahn, n, mass); }, [bahn, n, mass]);
  useEffect(() => {
    if (!laeuft) return undefined;
    let id;
    const weiter = () => {
      setN((x) => {
        const neu = Math.min(gesamt, x + Math.max(1, Math.round(Number(tempo) * 4)));
        if (neu >= gesamt) setLaeuft(false);
        return neu;
      });
      id = requestAnimationFrame(weiter);
    };
    id = requestAnimationFrame(weiter);
    return () => cancelAnimationFrame(id);
  }, [laeuft, tempo, gesamt]);
  const p = bahn.punkte[Math.max(0, n - 1)];
  const naechstes = () => {
    const t = p ? p.t : 0;
    let i = n;
    while (i < gesamt && bahn.punkte[i].t === t) i++;
    while (i < gesamt && !bahn.punkte[i].t) i++;
    setN(Math.min(gesamt, i + 1));
  };
  return (
    <div className="dialog cam-sim" id="cam-sim">
      <div className="cam-sim__kopf">
        <b>Simulation</b>
        <span className="cam-sim__hinweis">Kanal 1 vorne, nach dem Abstechen Kanal 2 hinten an der Gegenspindel. Das Werkzeug steht, das Material fährt in Z.</span>
        <button className="knopf knopf--klein" title="Schliessen" onClick={zu}>✕</button>
      </div>
      {!gesamt ? <p>Im Programm gibt es keine Wege zum Simulieren.</p> : <>
        <canvas ref={cv} width={BREIT} height={HOCH} className="cam-sim__bild" data-cam-sim-n={n} />
        <div className="cam-sim__knoepfe">
          <button className="knopf knopf--klein" id="cam-sim-start" onClick={() => { if (n >= gesamt) setN(0); setLaeuft(!laeuft); }}>
            {laeuft ? "⏸ Pause" : "▶ Abspielen"}</button>
          <button className="knopf knopf--klein" onClick={() => { setLaeuft(false); setN(0); }}>⏮ Anfang</button>
          <button className="knopf knopf--klein" id="cam-sim-wz" onClick={naechstes}>⏭ Nächstes Werkzeug</button>
          {bahn.wechsel < gesamt && <button className="knopf knopf--klein" id="cam-sim-k2" onClick={() => { setLaeuft(false); setN(bahn.wechsel + 1); }}>Zu Kanal 2</button>}
          <button className="knopf knopf--klein" id="cam-sim-ende" onClick={() => { setLaeuft(false); setN(gesamt); }}>Fertigteil zeigen</button>
          <label className="cam-feld">Tempo
            <select value={tempo} onChange={(e) => setTempo(e.target.value)}>
              {TEMPI.map(([w, t]) => <option key={w} value={w}>{t}</option>)}
            </select></label>
          <input type="range" min={0} max={gesamt} value={n} className="cam-sim__regler" id="cam-sim-regler"
            onChange={(e) => { setLaeuft(false); setN(Number(e.target.value)); }} />
        </div>
        <div className="cam-sim__zeile" id="cam-sim-zeile">{p ? "Kanal " + (p.kanal || 1) + ", Zeile " + (p.nr + 1) + ": " + String(bahn.zeilen[p.kanal || 1][p.nr] || "").trim() : "Start"}</div>
      </>}
    </div>
  );
}
