// =================================================================
//  VERSANDPALETTE (Spiel im Pausenraum)
//  Wunsch Patrick 1. November 2026: ein Block-Puzzle „Hofer-Style“.
//  Eigenes Spiel, kein Nachbau: Auf einer Versandpalette 8 × 8 Plätze.
//  Unten auf dem Förderband liegen immer drei Gebinde (Formen aus
//  Kisten in den Werkstofffarben der Planwand). Mit dem Finger auf die
//  Palette ziehen. Ist eine Reihe oder Spalte voll, geht sie in den
//  Versand und macht Platz. Passt keines der Gebinde mehr, ist Schluss.
//  Mehrere Reihen auf einmal und Versand in Serie geben mehr Punkte.
//  Eigene Datei, damit die anderen Spiele in Spiele.jsx ruhig bleiben.
// =================================================================
import { useEffect, useRef, useState } from "react";

const N = 8;
const STOFFE = [["V2A", "#dc2626"], ["V4A", "#94a3b8"], ["MS", "#f59e0b"], ["ST", "#2563eb"], ["AL", "#f1f5f9"], ["NS", "#facc15"], ["TI", "#8b5cf6"]];

// Formen als Liste der belegten Felder [x, y]; gedrehte Lagen stehen
// einzeln drin, damit gedreht nicht werden muss (am Touchscreen einfacher).
const linie = (n, hoch) => Array.from({ length: n }, (_, i) => (hoch ? [0, i] : [i, 0]));
const block = (b, h) => Array.from({ length: b * h }, (_, i) => [i % b, Math.floor(i / b)]);
const FORMEN = [
  [[0, 0]],
  linie(2), linie(2, true), linie(3), linie(3, true), linie(4), linie(4, true), linie(5), linie(5, true),
  block(2, 2), block(2, 2), block(3, 3), block(3, 2), block(2, 3),
  [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 1]], [[1, 0], [1, 1], [1, 2], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]],
];

const neuesGebinde = (id) => {
  const teile = FORMEN[Math.floor(Math.random() * FORMEN.length)];
  const [stoff, farbe] = STOFFE[Math.floor(Math.random() * STOFFE.length)];
  return { id, teile, stoff, farbe, b: Math.max(...teile.map((p) => p[0])) + 1, h: Math.max(...teile.map((p) => p[1])) + 1 };
};

function rekordLesen() {
  try { return Number(localStorage.getItem("hofer.pausenraum.rekord.palette")) || 0; } catch { return 0; }
}
function rekordMerken(punkte) {
  if (punkte <= rekordLesen()) return false;
  try { localStorage.setItem("hofer.pausenraum.rekord.palette", String(punkte)); } catch { /* ohne Speicher */ }
  return true;
}

const passt = (feld, teile, x, y) => teile.every(([a, b]) => {
  const px = x + a, py = y + b;
  return px >= 0 && px < N && py >= 0 && py < N && !feld[py][px];
});
const irgendwoPlatz = (feld, g) => {
  for (let y = 0; y <= N - g.h; y++) for (let x = 0; x <= N - g.b; x++) if (passt(feld, g.teile, x, y)) return true;
  return false;
};
// Welche Reihen und Spalten wären nach dem Ablegen voll?
function volleLinien(feld, teile, x, y) {
  const f = feld.map((r) => r.slice());
  for (const [a, b] of teile) f[y + b][x + a] = 1;
  const reihen = [], spalten = [];
  for (let i = 0; i < N; i++) {
    if (f[i].every(Boolean)) reihen.push(i);
    if (f.every((r) => r[i])) spalten.push(i);
  }
  return { reihen, spalten };
}

const SPRUECHE = ["", "Versandt!", "Doppelt verpackt!", "Dreifach! Ab in den LKW!", "Ganze Ladung!", "Rekordlieferung!"];

export function Versandpalette({ breite, hoehe }) {
  const [z, setZ] = useState(null); // Spielstand
  const [zug, setZug] = useState(null); // gezogenes Gebinde { i, x, y, dx, dy }
  const [blitz, setBlitz] = useState(null); // eben versandte Felder fürs Aufleuchten
  const [spruch, setSpruch] = useState(null);
  const [rekord, setRekord] = useState(rekordLesen);
  const feldRef = useRef(null);
  const wurzelRef = useRef(null);
  const zugRef = useRef(null);
  zugRef.current = zug;
  const zRef = useRef(z);
  zRef.current = z;

  const neuDrei = (n0) => [neuesGebinde(n0), neuesGebinde(n0 + 1), neuesGebinde(n0 + 2)];
  const starten = () => {
    setZ({ feld: Array.from({ length: N }, () => Array(N).fill(null)), band: neuDrei(0), nr: 3,
      punkte: 0, linien: 0, serie: 0, aus: false, neuerRekord: false });
    setBlitz(null); setSpruch(null);
  };

  // Grösse: Palette so gross wie möglich, rechts das Band, links die Zahlen
  const k = Math.max(30, Math.floor(Math.min((hoehe - 40) / N, (breite - 340 - 420 - 120) / N)));
  const kb = Math.round(k * 0.5); // Kisten auf dem Band
  const luft = Math.round(k * 1.4); // gezogenes Gebinde schwebt über dem Finger

  // Wo käme das gezogene Gebinde hin?
  const ziel = (() => {
    if (!zug || !z || !feldRef.current) return null;
    const g = z.band[zug.i];
    if (!g) return null;
    const r = feldRef.current.getBoundingClientRect();
    const sk = r.width / (N * k + 16); // falls die Tafel verkleinert gezeigt wird
    const lx = (zug.x - r.left) / sk - 8, ly = (zug.y - luft * sk - r.top) / sk - 8;
    const x = Math.round(lx / k - g.b / 2), y = Math.round(ly / k - g.h / 2);
    if (!passt(z.feld, g.teile, x, y)) return null;
    return { x, y, ...volleLinien(z.feld, g.teile, x, y) };
  })();
  const zielRef = useRef(null);
  zielRef.current = ziel;

  const ablegen = () => {
    const s = zRef.current, zg = zugRef.current, zl = zielRef.current;
    setZug(null);
    if (!s || !zg || !zl) return;
    const g = s.band[zg.i];
    const feld = s.feld.map((r) => r.slice());
    for (const [a, b] of g.teile) feld[zl.y + b][zl.x + a] = g.farbe + "|" + g.stoff;
    const weg = [];
    for (const y of zl.reihen) for (let x = 0; x < N; x++) weg.push([x, y]);
    for (const x of zl.spalten) for (let y = 0; y < N; y++) weg.push([x, y]);
    const anzahl = zl.reihen.length + zl.spalten.length;
    let punkte = s.punkte + g.teile.length;
    let serie = s.serie;
    if (anzahl) {
      serie += 1;
      punkte += anzahl * anzahl * 10 * N / 2 * serie;
      setBlitz({ felder: weg.map(([x, y]) => [x, y, feld[y][x]]), t: Date.now() });
      setSpruch({ text: SPRUECHE[Math.min(anzahl, 5)] + (serie > 1 ? `  Serie ×${serie}` : ""), t: Date.now() });
      for (const [x, y] of weg) feld[y][x] = null;
    } else serie = 0;
    let band = s.band.map((b, i) => (i === zg.i ? null : b));
    let nr = s.nr;
    if (band.every((b) => !b)) { band = neuDrei(nr); nr += 3; }
    const aus = band.filter(Boolean).every((b) => !irgendwoPlatz(feld, b));
    let neuerRekord = false;
    if (aus && rekordMerken(punkte)) { neuerRekord = true; setRekord(punkte); }
    setZ({ feld, band, nr, punkte, linien: s.linien + anzahl, serie, aus, neuerRekord });
  };

  // Ziehen über den ganzen Bildschirm verfolgen
  const ziehend = !!zug;
  useEffect(() => {
    if (!ziehend) return;
    const mv = (e) => { e.preventDefault(); setZug((q) => (q ? { ...q, x: e.clientX, y: e.clientY } : q)); };
    const up = () => ablegen();
    const ab = () => setZug(null);
    window.addEventListener("pointermove", mv, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", ab);
    return () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", ab);
    };
  }, [ziehend]); // eslint-disable-line

  useEffect(() => {
    if (!blitz) return;
    const t = setTimeout(() => setBlitz(null), 550);
    return () => clearTimeout(t);
  }, [blitz]);
  useEffect(() => {
    if (!spruch) return;
    const t = setTimeout(() => setSpruch(null), 1400);
    return () => clearTimeout(t);
  }, [spruch]);

  const greifen = (i, e) => {
    if (!z || z.aus || !z.band[i]) return;
    e.preventDefault();
    setZug({ i, x: e.clientX, y: e.clientY });
  };

  const markiert = new Set();
  if (ziel) {
    for (const y of ziel.reihen) for (let x = 0; x < N; x++) markiert.add(y * N + x);
    for (const x of ziel.spalten) for (let y = 0; y < N; y++) markiert.add(y * N + x);
  }
  const vorschau = new Set();
  if (ziel) for (const [a, b] of z.band[zug.i].teile) vorschau.add((ziel.y + b) * N + ziel.x + a);
  const gz = zug && z ? z.band[zug.i] : null;

  const kiste = (wert, gr, extra = {}) => {
    const [farbe, stoff] = (wert || "").split("|");
    return { className: "sp-vp__kiste", style: { "--sf": farbe, fontSize: gr * 0.27, ...extra }, inhalt: stoff };
  };

  return (
    <div className="sp-vp" data-sp="palette" ref={wurzelRef}>
      <div className="sp-seite sp-seite--schmal">
        <div className="sp-zahlen">
          <div><span>Punkte</span><b data-sp="vp-punkte">{z ? z.punkte.toLocaleString("de-CH") : 0}</b></div>
          <div><span>Versandt</span><b data-sp="vp-linien">{z ? z.linien : 0}</b></div>
          <div><span>Serie</span><b>{z && z.serie > 1 ? "×" + z.serie : "–"}</b></div>
          <div><span>Rekord</span><b>{rekord.toLocaleString("de-CH")}</b></div>
        </div>
        <div className="sp-vp__hilfe">Gebinde vom Band auf die Palette ziehen. Volle Reihen und Spalten gehen in den Versand.</div>
      </div>

      <div className="sp-vp__palette" ref={feldRef} data-sp="vp-feld"
        style={{ gridTemplateColumns: `repeat(${N}, ${k}px)`, gridAutoRows: k + "px" }}>
        {(z ? z.feld.flat() : Array(N * N).fill(null)).map((c, i) => {
          const ist = markiert.has(i), vor = vorschau.has(i);
          if (c || vor) {
            const kk = kiste(c || gz.farbe + "|" + gz.stoff, k);
            return <div key={i} className={kk.className + (vor ? " sp-vp__kiste--vor" : "") + (ist ? " sp-vp__kiste--weg" : "")}
              style={kk.style}>{kk.inhalt}</div>;
          }
          return <div key={i} className={"sp-vp__platz" + (ist ? " sp-vp__platz--weg" : "")} />;
        })}
        {blitz && blitz.felder.map(([x, y, w]) => {
          const kk = kiste(w, k, { left: 10 + x * k, top: 10 + y * k, width: k - 4, height: k - 4 });
          return <div key={blitz.t + "-" + x + "-" + y} className="sp-vp__kiste sp-vp__kiste--fort" style={kk.style}>{kk.inhalt}</div>;
        })}
        {spruch && <div key={spruch.t} className="sp-vp__spruch" data-sp="vp-spruch">{spruch.text}</div>}
        {(!z || z.aus) &&
          <div className="sp-ueber">
            {z && z.aus && <div className="sp-ueber__titel">Kein Platz mehr! {z.punkte.toLocaleString("de-CH")} Punkte</div>}
            {z && z.neuerRekord && <div className="sp-ueber__rekord">🏆 Neuer Rekord!</div>}
            {!z && <div className="sp-ueber__text">Pack die Versandpalette: Gebinde vom Förderband auf die Palette ziehen. Volle Reihen und Spalten gehen raus zum Kunden.</div>}
            <button type="button" className="sp-gross" data-sp="vp-start" onClick={starten}>{z ? "Nochmal" : "▶ Start"}</button>
          </div>}
      </div>

      <div className="sp-vp__band" style={{ width: Math.max(kb * 5 + 60, 300) }}>
        <div className="sp-vp__bandtitel">Förderband</div>
        {[0, 1, 2].map((i) => {
          const g = z && z.band[i];
          const weg = !g || (zug && zug.i === i);
          const passtNoch = g && irgendwoPlatz(z.feld, g);
          return (
            <div key={i} className={"sp-vp__fach" + (g && !passtNoch ? " sp-vp__fach--zu" : "")} data-sp={"vp-band-" + i}
              onPointerDown={(e) => greifen(i, e)}>
              {g && !weg &&
                <div className="sp-vp__form" style={{ gridTemplateColumns: `repeat(${g.b}, ${kb}px)`, gridAutoRows: kb + "px" }}>
                  {Array.from({ length: g.b * g.h }, (_, j) => {
                    const da = g.teile.some(([a, b]) => a === j % g.b && b === Math.floor(j / g.b));
                    return da ? <div key={j} className="sp-vp__kiste" style={{ "--sf": g.farbe, fontSize: kb * 0.27 }}>{g.stoff}</div>
                      : <div key={j} />;
                  })}
                </div>}
            </div>
          );
        })}
      </div>

      {gz && wurzelRef.current && (() => {
        // Die Tafel kann als Ganzes verkleinert sein (transform), darum
        // in Punkten der Spielfläche statt in Bildschirm-Pixeln legen.
        const r = wurzelRef.current.getBoundingClientRect();
        const sk = r.width / (wurzelRef.current.offsetWidth || r.width) || 1;
        return (
        <div className="sp-vp__schwebt" style={{
          left: (zug.x - r.left) / sk, top: (zug.y - r.top) / sk - luft, gridTemplateColumns: `repeat(${gz.b}, ${k}px)`, gridAutoRows: k + "px",
          transform: "translate(-50%, -50%)",
        }}>
          {Array.from({ length: gz.b * gz.h }, (_, j) => {
            const da = gz.teile.some(([a, b]) => a === j % gz.b && b === Math.floor(j / gz.b));
            return da ? <div key={j} className="sp-vp__kiste" style={{ "--sf": gz.farbe, fontSize: k * 0.27 }}>{gz.stoff}</div>
              : <div key={j} />;
          })}
        </div>);
      })()}
    </div>
  );
}
