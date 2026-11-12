// =================================================================
//  KUGELLAGER (Spiel im Pausenraum)
//  Wunsch Patrick 1. November 2026: „einen Abklatsch von … Bubble
//  Shooter … auch wieder Hoferstyle“. Eigenes Spiel in dieser Art, kein
//  Nachbau: Werkstoffkugeln in den Farben der Planwand (V2A rot, MS
//  orange, ST blau …) hängen an der Pressplatte. Unten schiesst der
//  Revolver der Drehmaschine eine Kugel; drei oder mehr gleiche, die sich
//  berühren, fallen in die Kiste, und was danach nirgends mehr hängt,
//  fällt mit. Wer zu oft daneben schiesst, dem drücken die Spänemonster
//  die Platte eine Reihe tiefer. Späneknäuel lassen sich nicht abschiessen,
//  nur abschneiden. Erreichen die Kugeln die gelbe Linie, ist Schluss.
//  Bedienung für den Finger: irgendwo hintippen und ziehen zum Zielen,
//  loslassen schiesst; Tipp auf die nächste Kugel tauscht sie. Am PC
//  Pfeile links/rechts, Leertaste schiesst, Pfeil runter tauscht.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { usePause } from "./spielPause.js";

const SPALTEN = 12;
const WURZEL3 = Math.sqrt(3);
// Werkstoffe wie auf der Planwand (Farbe, Kürzel, Schrift)
const STOFFE = [
  ["#dc2626", "V2A", "#fff", "Chromnickelstahl"], ["#2563eb", "ST", "#fff", "Automatenstahl"],
  ["#f59e0b", "MS", "#1e293b", "Messing"], ["#8b5cf6", "TI", "#fff", "Titan"],
  ["#94a3b8", "V4A", "#1e293b", "säurebeständig"], ["#facc15", "NS", "#1e293b", "Neusilber"],
];
const SPAENE = -1;

function rekordLesen() {
  try { return Number(localStorage.getItem("hofer.pausenraum.rekord.kugellager")) || 0; } catch { return 0; }
}
function rekordMerken(punkte) {
  if (punkte <= rekordLesen()) return false;
  try { localStorage.setItem("hofer.pausenraum.rekord.kugellager", String(punkte)); } catch { /* ohne Speicher */ }
  return true;
}
// Die Tafel ist als Ganzes verkleinert, darum Bildschirm- in Canvas-Punkte umrechnen
function canvasPunkt(c, e) {
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
}

function zeichneKugel(g, x, y, r, art) {
  if (art === SPAENE) {
    // Späneknäuel mit bösem Blick
    g.fillStyle = "#475569"; g.beginPath(); g.arc(x, y, r * 0.96, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#cbd5e1"; g.lineWidth = r * 0.16; g.lineCap = "round";
    g.beginPath(); g.arc(x, y, r * 0.72, -1.2, 4.4); g.stroke();
    g.beginPath(); g.arc(x + r * 0.08, y + r * 0.05, r * 0.42, 1.4, 6.8); g.stroke();
    for (const ax of [-0.3, 0.3]) {
      g.fillStyle = "#fff"; g.beginPath(); g.arc(x + ax * r, y - r * 0.1, r * 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0f172a"; g.beginPath(); g.arc(x + ax * r * 0.9, y - r * 0.05, r * 0.1, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = "#0f172a"; g.lineWidth = r * 0.09;
    g.beginPath(); g.moveTo(x - r * 0.48, y - r * 0.42); g.lineTo(x - r * 0.14, y - r * 0.28);
    g.moveTo(x + r * 0.48, y - r * 0.42); g.lineTo(x + r * 0.14, y - r * 0.28); g.stroke();
    return;
  }
  const [farbe, text, schrift] = STOFFE[art];
  const v = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
  v.addColorStop(0, "#ffffff"); v.addColorStop(0.28, farbe); v.addColorStop(1, "rgba(15,23,42,.85)");
  g.fillStyle = farbe; g.beginPath(); g.arc(x, y, r * 0.96, 0, Math.PI * 2); g.fill();
  g.fillStyle = v; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
  g.strokeStyle = "rgba(15,23,42,.55)"; g.lineWidth = 2; g.stroke();
  g.fillStyle = schrift; g.font = `800 ${Math.round(r * 0.56)}px system-ui`;
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, y + r * 0.04);
  g.textAlign = "left"; g.textBaseline = "alphabetic";
}

export default function Kugellager({ breite, hoehe }) {
  const pause = usePause();
  const cv = useRef(null);
  const s = useRef(null);
  const [, neu] = useState(0);
  const [rekord, setRekord] = useState(rekordLesen);
  const b = Math.floor(breite), h = Math.floor(hoehe - 4);
  // Masse: zwölf Kugeln breit, Platz für etwa 13 Reihen und den Revolver
  const R = Math.max(14, Math.floor(Math.min((b - 40) / (2 * SPALTEN + 1), (h - 40) / (13 * WURZEL3 + 6))));
  const feldB = R * 2 * SPALTEN, links = Math.round((b - feldB) / 2), rechts = links + feldB;
  const oben = 26;
  const sx = links + feldB / 2, sy = h - R * 2.2;
  const linie = sy - R * 2.4;
  const REIHE = R * WURZEL3;

  const ungerade = (z, r) => (r + z.versatz) % 2 === 1;
  const spaltenIn = (z, r) => (ungerade(z, r) ? SPALTEN - 1 : SPALTEN);
  const ort = (z, r, c) => ({ x: links + R + c * 2 * R + (ungerade(z, r) ? R : 0), y: oben + z.platte + R + r * REIHE });
  const nachbarn = (z, r, c) => {
    const d = ungerade(z, r) ? [0, 1] : [-1, 0];
    return [[r, c - 1], [r, c + 1], [r - 1, c + d[0]], [r - 1, c + d[1]], [r + 1, c + d[0]], [r + 1, c + d[1]]]
      .filter(([rr, cc]) => rr >= 0 && rr < z.reihen.length && cc >= 0 && cc < spaltenIn(z, rr));
  };
  const zufallStoff = (z) => Math.floor(Math.random() * z.farben);
  const neueReihe = (z, r) => Array.from({ length: spaltenIn(z, r) }, () =>
    (Math.random() < z.spaene ? SPAENE : zufallStoff(z)));
  // Nur Farben, die noch hängen, damit jeder Schuss etwas bringen kann
  const naechsteKugel = (z) => {
    const da = [...new Set(z.reihen.flat().filter((k) => k !== null && k !== SPAENE))];
    return da.length ? da[Math.floor(Math.random() * da.length)] : zufallStoff(z);
  };

  const stufeBauen = (z) => {
    z.farben = Math.min(STOFFE.length, 3 + z.stufe);
    z.spaene = Math.min(0.12, 0.035 * (z.stufe - 1));
    z.versatz = 0; z.platte = 0; z.reihen = [];
    for (let r = 0; r < Math.min(9, 4 + z.stufe); r++) z.reihen.push(neueReihe(z, r));
    z.fehlschuesse = 0; z.geduld = Math.max(3, 7 - Math.floor(z.stufe / 2));
    z.kugel = naechsteKugel(z); z.danach = naechsteKugel(z); z.flug = null;
  };
  const starten = () => {
    const z = { stufe: 1, punkte: 0, laeuft: true, winkel: -Math.PI / 2, effekte: [], texte: [] };
    stufeBauen(z); s.current = z; neu((n) => n + 1);
  };

  // Kugel einrasten, Gleiche und Lose abräumen
  const einrasten = (z, x, y) => {
    let best = null;
    const r0 = Math.max(0, Math.round((y - oben - z.platte - R) / REIHE));
    const suchen = (von, bis) => { for (let r = von; r <= bis; r++) {
      for (let c = 0; c < spaltenIn(z, r); c++) {
        if (z.reihen[r] && z.reihen[r][c] != null) continue;
        // eine Zelle ohne Halt (nicht oben, kein Nachbar) zählt nicht
        if (r > 0 && !nachbarn({ ...z, reihen: z.reihen.concat([[]]) }, r, c).some(([rr, cc]) => z.reihen[rr] && z.reihen[rr][cc] != null)) continue;
        const p = ort(z, r, c), d = Math.hypot(p.x - x, p.y - y);
        if (!best || d < best.d) best = { r, c, d };
      }
    } };
    suchen(Math.max(0, r0 - 1), r0 + 1);
    if (!best) suchen(0, z.reihen.length);
    if (!best) return;
    while (z.reihen.length <= best.r) z.reihen.push(Array(spaltenIn(z, z.reihen.length)).fill(null));
    z.reihen[best.r][best.c] = z.flug.art;
    // gleiche Farbe suchen
    const art = z.flug.art, gleich = [[best.r, best.c]], gesehen = new Set([best.r + ":" + best.c]);
    for (let i = 0; i < gleich.length; i++) {
      for (const [rr, cc] of nachbarn(z, ...gleich[i])) {
        const k = rr + ":" + cc;
        if (!gesehen.has(k) && z.reihen[rr][cc] === art) { gesehen.add(k); gleich.push([rr, cc]); }
      }
    }
    let weg = 0, gefallen = 0;
    if (gleich.length >= 3) {
      for (const [rr, cc] of gleich) {
        const p = ort(z, rr, cc);
        z.effekte.push({ art: "platzen", x: p.x, y: p.y, farbe: STOFFE[art][0], zeit: 0.5 });
        z.reihen[rr][cc] = null; weg++;
      }
      // was nicht mehr an der Platte hängt, fällt
      const halt = new Set(), q = [];
      (z.reihen[0] || []).forEach((k, c) => { if (k != null) { halt.add("0:" + c); q.push([0, c]); } });
      for (let i = 0; i < q.length; i++) {
        for (const [rr, cc] of nachbarn(z, ...q[i])) {
          const k = rr + ":" + cc;
          if (!halt.has(k) && z.reihen[rr][cc] != null) { halt.add(k); q.push([rr, cc]); }
        }
      }
      z.reihen.forEach((reihe, rr) => reihe.forEach((k, cc) => {
        if (k != null && !halt.has(rr + ":" + cc)) {
          const p = ort(z, rr, cc);
          z.effekte.push({ art: "fallen", x: p.x, y: p.y, vx: (Math.random() - 0.5) * 240, vy: -120 - Math.random() * 200, kugel: k, zeit: 2.5 });
          z.reihen[rr][cc] = null; gefallen++;
        }
      }));
      const plus = weg * 10 + gefallen * 25 + (gefallen > 4 ? 100 : 0);
      z.punkte += plus;
      const p = ort(z, best.r, best.c);
      z.texte.push({ x: p.x, y: p.y, text: "+" + plus, zeit: 1.2 });
    } else {
      z.fehlschuesse++;
      if (z.fehlschuesse >= z.geduld) {
        // Die Spänemonster drücken die Platte nach: oben kommt eine neue Reihe
        z.fehlschuesse = 0; z.versatz ^= 1;
        z.reihen.unshift(neueReihe(z, 0));
        z.ruetteln = 0.4;
      }
    }
    while (z.reihen.length && z.reihen[z.reihen.length - 1].every((k) => k == null)) z.reihen.pop();
    z.flug = null;
    if (!z.reihen.length) {
      z.punkte += 1000 + z.stufe * 250;
      z.texte.push({ x: sx, y: h / 2, text: "Lager leer! +" + (1000 + z.stufe * 250), zeit: 2 });
      z.stufe++; stufeBauen(z);
    } else if (z.reihen.some((reihe, rr) => reihe.some((k) => k != null) && ort(z, rr, 0).y + R > linie)) {
      z.laeuft = false;
      if (rekordMerken(z.punkte)) { z.neuerRekord = true; setRekord(z.punkte); }
    } else if (!z.reihen.flat().some((k) => k === z.kugel)) z.kugel = naechsteKugel(z);
    if (z.danach !== null && !z.reihen.flat().some((k) => k === z.danach)) z.danach = naechsteKugel(z);
    neu((n) => n + 1);
  };

  const schiessen = () => {
    const z = s.current;
    if (!z || !z.laeuft || z.flug) return;
    const v = R * 48;
    z.flug = { x: sx, y: sy, vx: Math.cos(z.winkel) * v, vy: Math.sin(z.winkel) * v, art: z.kugel };
    z.kugel = z.danach; z.danach = naechsteKugel(z);
  };
  const tauschen = () => {
    const z = s.current;
    if (!z || !z.laeuft) return;
    [z.kugel, z.danach] = [z.danach, z.kugel];
  };
  const zielen = (p) => {
    const z = s.current;
    if (!z) return;
    let w = Math.atan2(p.y - sy, p.x - sx);
    if (w > 0) w = p.x < sx ? -Math.PI + 0.12 : -0.12;
    z.winkel = Math.max(-Math.PI + 0.12, Math.min(-0.12, w));
  };

  useEffect(() => {
    let rahmen, zuletzt = performance.now(), zeit = 0;
    const schritt = (jetzt) => {
      const dt = Math.min(0.033, (jetzt - zuletzt) / 1000); zuletzt = jetzt;
      const c = cv.current, z = s.current;
      if (!c) return;
      if (pause.current) { rahmen = requestAnimationFrame(schritt); return; }
      zeit += dt;
      const g = c.getContext("2d");
      // Halle aussen, Lager innen
      const aussen = g.createLinearGradient(0, 0, 0, h);
      aussen.addColorStop(0, "#e2e8f0"); aussen.addColorStop(1, "#cbd5e1");
      g.fillStyle = aussen; g.fillRect(0, 0, b, h);
      g.fillStyle = "#1e3a8a"; g.font = `800 ${Math.round(R * 1.1)}px system-ui`; g.textAlign = "center";
      if (links > R * 7) {
        g.fillText("HOFER + CO", links / 2, h * 0.42);
        g.font = `${Math.round(R * 0.55)}px system-ui`; g.fillStyle = "#475569";
        g.fillText("Präzisionsdrehteile", links / 2, h * 0.42 + R * 1.1);
        g.fillText("Lohn-Ammannsegg", links / 2, h * 0.42 + R * 1.8);
      }
      // rechts: welche Farbe welcher Werkstoff ist, wie auf der Planwand
      if (z && b - rechts > R * 9) {
        const lx = rechts + (b - rechts) / 2 - R * 3.5;
        g.textAlign = "left"; g.fillStyle = "#1e3a8a"; g.font = `800 ${Math.round(R * 0.7)}px system-ui`;
        g.fillText("Im Lager", lx, h * 0.3);
        for (let k = 0; k < z.farben; k++) {
          const ly = h * 0.3 + R * 1.4 + k * R * 2.2;
          zeichneKugel(g, lx + R * 0.8, ly, R * 0.8, k);
          g.fillStyle = "#334155"; g.font = `600 ${Math.round(R * 0.55)}px system-ui`;
          g.fillText(STOFFE[k][3], lx + R * 2.2, ly + R * 0.2);
        }
        if (z.spaene > 0) {
          const ly = h * 0.3 + R * 1.4 + z.farben * R * 2.2;
          zeichneKugel(g, lx + R * 0.8, ly, R * 0.8, SPAENE);
          g.fillStyle = "#334155"; g.fillText("Späneknäuel", lx + R * 2.2, ly + R * 0.2);
        }
      }
      g.textAlign = "left";
      const ruetteln = z && z.ruetteln > 0 ? Math.sin(zeit * 80) * z.ruetteln * 12 : 0;
      if (z && z.ruetteln > 0) z.ruetteln -= dt;
      g.save(); g.translate(ruetteln, 0);
      const innen = g.createLinearGradient(0, 0, 0, h);
      innen.addColorStop(0, "#0f172a"); innen.addColorStop(1, "#1e3a8a");
      g.fillStyle = innen; g.fillRect(links, 0, feldB, h);
      g.fillStyle = "rgba(255,255,255,.05)"; g.font = `900 ${Math.round(R * 2.4)}px system-ui`; g.textAlign = "center";
      g.fillText("HOFER", sx, h * 0.55); g.textAlign = "left";
      // Pressplatte oben mit Spänemonstern, die drücken
      const platteY = oben + (z ? z.platte : 0);
      g.fillStyle = "#64748b"; g.fillRect(links, 0, feldB, platteY);
      g.fillStyle = "#94a3b8"; g.fillRect(links, platteY - 6, feldB, 6);
      if (z) {
        for (let k = 0; k < z.geduld; k++) {
          g.fillStyle = k < z.geduld - z.fehlschuesse ? "#22c55e" : "#ef4444";
          g.beginPath(); g.arc(links + 18 + k * 22, platteY / 2 - 1, 7, 0, Math.PI * 2); g.fill();
        }
      }
      g.fillStyle = "#e2e8f0"; g.font = "bold 15px system-ui"; g.textAlign = "right";
      g.fillText("SPÄNE DRÜCKEN NACH", rechts - 14, platteY / 2 + 5); g.textAlign = "left";
      // Seitenwände
      g.fillStyle = "#334155"; g.fillRect(links - 8, 0, 8, h); g.fillRect(rechts, 0, 8, h);
      // gelbe Linie
      for (let x = links; x < rechts; x += 40) { g.fillStyle = (x - links) % 80 ? "#1f2937" : "#facc15"; g.fillRect(x, linie, Math.min(40, rechts - x), 6); }
      if (z) {
        z.reihen.forEach((reihe, r) => reihe.forEach((k, cc) => { if (k != null) { const p = ort(z, r, cc); zeichneKugel(g, p.x, p.y, R, k); } }));
        // Zielhilfe mit einem Abpraller
        if (z.laeuft && !z.flug) {
          let x = sx, y = sy, vx = Math.cos(z.winkel), vy = Math.sin(z.winkel), lang = 0;
          g.fillStyle = "rgba(255,255,255,.7)";
          for (let k = 0; k < 60 && y > oben + z.platte && lang < h * 1.3; k++) {
            x += vx * R * 0.7; y += vy * R * 0.7; lang += R * 0.7;
            if (x < links + R) { x = 2 * (links + R) - x; vx = -vx; }
            if (x > rechts - R) { x = 2 * (rechts - R) - x; vx = -vx; }
            if (z.reihen.some((reihe, r) => reihe.some((kk, cc) => kk != null && Math.hypot(ort(z, r, cc).x - x, ort(z, r, cc).y - y) < R * 1.7))) break;
            if (k % 2) { g.beginPath(); g.arc(x, y, R * 0.13, 0, Math.PI * 2); g.fill(); }
          }
        }
        // fliegende Kugel in kleinen Schritten, damit sie nichts überspringt
        if (z.flug) {
          const f = z.flug, n = Math.ceil(Math.hypot(f.vx, f.vy) * dt / (R * 0.4));
          for (let i = 0; i < n && z.flug; i++) {
            f.x += f.vx * dt / n; f.y += f.vy * dt / n;
            if (f.x < links + R) { f.x = 2 * (links + R) - f.x; f.vx = -f.vx; }
            if (f.x > rechts - R) { f.x = 2 * (rechts - R) - f.x; f.vx = -f.vx; }
            let trifft = f.y <= oben + z.platte + R;
            for (let r = 0; r < z.reihen.length && !trifft; r++) {
              for (let cc = 0; cc < z.reihen[r].length; cc++) {
                if (z.reihen[r][cc] == null) continue;
                const p = ort(z, r, cc);
                if (Math.hypot(p.x - f.x, p.y - f.y) < R * 1.7) { trifft = true; break; }
              }
            }
            if (trifft) einrasten(z, f.x, f.y);
          }
          if (z.flug) zeichneKugel(g, z.flug.x, z.flug.y, R, z.flug.art);
        }
        // Effekte
        z.effekte = z.effekte.filter((e) => (e.zeit -= dt) > 0);
        for (const e of z.effekte) {
          if (e.art === "platzen") {
            const t = 1 - e.zeit / 0.5;
            g.globalAlpha = 1 - t; g.strokeStyle = e.farbe; g.lineWidth = 5;
            g.beginPath(); g.arc(e.x, e.y, R * (0.8 + t * 1.2), 0, Math.PI * 2); g.stroke();
            g.fillStyle = "#fde68a";
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.fillRect(e.x + Math.cos(a) * R * (1 + t * 2), e.y + Math.sin(a) * R * (1 + t * 2), 5, 5); }
            g.globalAlpha = 1;
          } else {
            e.vy += 1800 * dt; e.x += e.vx * dt; e.y += e.vy * dt;
            if (e.y < h + R) zeichneKugel(g, e.x, e.y, R, e.kugel);
          }
        }
      }
      // Revolver der Drehmaschine
      const w = z ? z.winkel : -Math.PI / 2;
      g.save(); g.translate(sx, sy); g.rotate(w + Math.PI / 2);
      g.fillStyle = "#94a3b8"; g.strokeStyle = "#0f172a"; g.lineWidth = 3;
      g.fillRect(-R * 0.55, -R * 2.6, R * 1.1, R * 2); g.strokeRect(-R * 0.55, -R * 2.6, R * 1.1, R * 2);
      g.fillStyle = "#1d4ed8"; g.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; g.lineTo(Math.cos(a) * R * 1.6, Math.sin(a) * R * 1.6); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#cbd5e1";
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.arc(Math.cos(a) * R * 1.15, Math.sin(a) * R * 1.15, R * 0.16, 0, Math.PI * 2); g.fill(); }
      g.restore();
      if (z && z.laeuft) {
        zeichneKugel(g, sx, sy, R * 0.92, z.kugel);
        // nächste Kugel rechts unten, antippen tauscht
        const nx = sx + R * 4, ny = sy;
        g.fillStyle = "rgba(255,255,255,.15)"; g.beginPath(); g.arc(nx, ny, R * 1.1, 0, Math.PI * 2); g.fill();
        zeichneKugel(g, nx, ny, R * 0.8, z.danach);
        g.fillStyle = "#cbd5e1"; g.font = `600 ${Math.round(R * 0.42)}px system-ui`; g.textAlign = "center";
        g.fillText("⇄ tauschen", nx, ny + R * 1.65); g.textAlign = "left";
      }
      g.restore();
      if (z) {
        z.texte = z.texte.filter((t) => (t.zeit -= dt) > 0);
        for (const t of z.texte) {
          g.globalAlpha = Math.min(1, t.zeit); g.fillStyle = "#fde047"; g.strokeStyle = "#0f172a"; g.lineWidth = 6;
          g.font = `900 ${Math.round(R * 1.2)}px system-ui`; g.textAlign = "center";
          const ty = t.y - (1.2 - t.zeit) * 60;
          g.strokeText(t.text, t.x, ty); g.fillText(t.text, t.x, ty);
          g.textAlign = "left"; g.globalAlpha = 1;
        }
      }
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [b, h]); // eslint-disable-line

  // Pfeiltasten am PC, zum Ausprobieren
  useEffect(() => {
    const t = (e) => {
      const z = s.current;
      if (!z || !z.laeuft || pause.current) return;
      if (e.key === "ArrowLeft") z.winkel = Math.max(-Math.PI + 0.12, z.winkel - 0.06);
      else if (e.key === "ArrowRight") z.winkel = Math.min(-0.12, z.winkel + 0.06);
      else if (e.key === " " || e.key === "ArrowUp") schiessen();
      else if (e.key === "ArrowDown") tauschen();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }); // eslint-disable-line

  const zug = useRef(false);
  const runter = (e) => {
    const z = s.current;
    if (!z || !z.laeuft) return;
    const p = canvasPunkt(cv.current, e);
    if (Math.hypot(p.x - (sx + R * 4), p.y - sy) < R * 1.6) { tauschen(); return; }
    try { cv.current.setPointerCapture(e.pointerId); } catch { /* ohne Festhalten geht es auch */ }
    zug.current = true; zielen(p);
  };
  const ziehen = (e) => { if (zug.current) zielen(canvasPunkt(cv.current, e)); };
  const los = (e) => {
    if (!zug.current) return;
    zug.current = false;
    if (e.type === "pointerup") schiessen();
  };

  const z = s.current;
  return (
    <div className="sp-leinwand" data-sp="kugellager" style={{ width: b, height: h }}>
      <canvas ref={cv} width={b} height={h} onPointerDown={runter} onPointerMove={ziehen} onPointerUp={los} onPointerCancel={los} />
      <div className="sp-leinwand__zahlen">
        <span>Punkte <b data-sp="kg-punkte">{z ? z.punkte.toLocaleString("de-CH") : 0}</b></span>
        <span>Lager <b data-sp="kg-stufe">{z ? z.stufe : 1}</b></span>
        <span>Rekord <b>{rekord.toLocaleString("de-CH")}</b></span>
      </div>
      {(!z || !z.laeuft) &&
        <div className="sp-ueber">
          {!z && <div className="sp-ueber__text">Die Werkstoffkugeln hängen an der Pressplatte. Finger hinlegen und ziehen zum
            Zielen, loslassen schiesst. Drei gleiche fallen in die Kiste. Daneben geschossen? Dann drücken die Spänemonster
            die Platte tiefer. Späneknäuel fallen nur, wenn man sie abschneidet.</div>}
          {z && <div className="sp-ueber__titel">Lager voll! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
          {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
          <button type="button" className="sp-gross" data-sp="kg-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
        </div>}
    </div>
  );
}
