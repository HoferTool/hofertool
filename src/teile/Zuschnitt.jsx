// =================================================================
//  ZUSCHNITT
//  Gemeinsames Fenster zum Zuschneiden eines Bildes, für Nutzerbilder
//  und Lieferanten-Logos (111.39.0). Ziehen mit Maus oder Finger,
//  Grösse mit Regler, Mausrad oder zwei Fingern. Rundherum bleibt ein
//  abgedunkelter Rand sichtbar, damit man sieht, was wegfällt.
//
//  zuschneiden(datei, {
//    kante:   Seitenlänge des Ergebnisses in Pixeln (Standard 400),
//    rund:    Kreis statt Quadrat anzeigen (Nutzerbilder sind rund),
//    ganz:    auch kleiner als der Rahmen erlauben, damit ein breites
//             Logo ganz hineinpasst; der Rest bleibt durchsichtig,
//    format:  "image/jpeg" (Standard) oder "image/png",
//    alsText: Ergebnis als data:-Adresse statt als Blob,
//  }) → Promise mit dem Ergebnis, null bei Abbrechen.
//
//  Geschnitten wird aus dem Originalbild, nicht aus der Vorschau, damit
//  das Ergebnis scharf bleibt.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { fensterOeffnen } from "./Fenster.jsx";

const RAND = 26;        // abgedunkelter Rand um den Rahmen, in CSS-Pixeln
const MAX_ZOOM = 6;     // so weit über „füllt den Rahmen“ hinaus

function bildLaden(datei) {
  return new Promise((fertig, ablehnen) => {
    const adresse = URL.createObjectURL(datei);
    const bild = new Image();
    bild.onload = () => fertig({ bild, adresse });
    bild.onerror = () => { URL.revokeObjectURL(adresse); ablehnen(new Error("Das Bild lässt sich nicht lesen.")); };
    bild.src = adresse;
  });
}

export async function zuschneiden(datei, optionen = {}) {
  const { bild, adresse } = await bildLaden(datei);
  return new Promise((fertig) => {
    let erledigt = false;
    const ende = (wert) => {
      if (erledigt) return;
      erledigt = true;
      URL.revokeObjectURL(adresse);
      fertig(wert);
    };
    fensterOeffnen((zu) => <ZuschnittFenster bild={bild} optionen={optionen}
      fertig={(wert) => { ende(wert); zu(); }} abbrechen={zu} />,
      () => ende(null), "zuschnitt-huelle");
  });
}

function ZuschnittFenster({ bild, optionen, fertig, abbrechen }) {
  const { kante = 400, rund = false, ganz = false, format = "image/jpeg", alsText = false } = optionen;
  const leinwandRef = useRef(null);
  // Rahmengrösse nach verfügbarer Breite, am Handy kleiner
  const [rahmen] = useState(() => Math.max(180, Math.min(300, window.innerWidth - 2 * RAND - 72)));
  const seite = rahmen + 2 * RAND;

  // Massstab: Bildpixel → Bildschirmpixel. „Füllen“ deckt den Rahmen,
  // „Einpassen“ zeigt das ganze Bild.
  const fuellen = Math.max(rahmen / bild.naturalWidth, rahmen / bild.naturalHeight);
  const einpassen = Math.min(rahmen / bild.naturalWidth, rahmen / bild.naturalHeight);
  const minS = ganz ? Math.min(einpassen, fuellen) : fuellen;
  const maxS = fuellen * MAX_ZOOM;

  // Zustand in einem Ref, damit Ziehen nicht bei jedem Pixel neu rendert
  const z = useRef(null);
  if (!z.current) {
    const s = ganz ? einpassen : fuellen;
    z.current = { s, x: 0, y: 0 };
    z.current.x = RAND + (rahmen - bild.naturalWidth * s) / 2;
    z.current.y = RAND + (rahmen - bild.naturalHeight * s) / 2;
  }
  const [regler, setRegler] = useState(0);

  // Grösser als der Rahmen: keine Lücke zulassen. Kleiner: mittig.
  const begrenzen = () => {
    const t = z.current;
    t.s = Math.min(maxS, Math.max(minS, t.s));
    const bw = bild.naturalWidth * t.s, bh = bild.naturalHeight * t.s;
    t.x = bw >= rahmen ? Math.min(RAND, Math.max(RAND + rahmen - bw, t.x)) : RAND + (rahmen - bw) / 2;
    t.y = bh >= rahmen ? Math.min(RAND, Math.max(RAND + rahmen - bh, t.y)) : RAND + (rahmen - bh) / 2;
  };

  const zeichnen = () => {
    const c = leinwandRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, seite, seite);
    // Schachbrett zeigt, was durchsichtig bleibt (nur bei Logos)
    if (ganz) {
      for (let i = 0; i < seite; i += 10) for (let j = 0; j < seite; j += 10) {
        ctx.fillStyle = ((i + j) / 10) % 2 ? "#e6e9ee" : "#f7f8fa";
        ctx.fillRect(i, j, 10, 10);
      }
    } else {
      ctx.fillStyle = "#1c2229";
      ctx.fillRect(0, 0, seite, seite);
    }
    const t = z.current;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bild, t.x, t.y, bild.naturalWidth * t.s, bild.naturalHeight * t.s);
    // Ausserhalb des Rahmens abdunkeln
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, seite, seite);
    if (rund) ctx.arc(RAND + rahmen / 2, RAND + rahmen / 2, rahmen / 2, 0, Math.PI * 2, true);
    else if (ctx.roundRect) ctx.roundRect(RAND, RAND, rahmen, rahmen, 10);
    else ctx.rect(RAND, RAND, rahmen, rahmen);
    ctx.fillStyle = "rgba(10, 14, 20, .55)";
    ctx.fill("evenodd");
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, .9)";
    ctx.beginPath();
    if (rund) ctx.arc(RAND + rahmen / 2, RAND + rahmen / 2, rahmen / 2, 0, Math.PI * 2);
    else if (ctx.roundRect) ctx.roundRect(RAND, RAND, rahmen, rahmen, 10);
    else ctx.rect(RAND, RAND, rahmen, rahmen);
    ctx.stroke();
  };

  // Regler läuft logarithmisch von 0 (kleinste) bis 100 (grösste Stufe)
  const reglerAus = (s) => Math.round(100 * Math.log(s / minS) / Math.log(maxS / minS));
  const neu = () => { begrenzen(); zeichnen(); setRegler(reglerAus(z.current.s)); };

  // Um einen Punkt (Finger, Maus) herum vergrössern
  const zoomUm = (faktor, px, py) => {
    const t = z.current;
    const s2 = Math.min(maxS, Math.max(minS, t.s * faktor));
    const f = s2 / t.s;
    t.x = px - (px - t.x) * f;
    t.y = py - (py - t.y) * f;
    t.s = s2;
    neu();
  };

  useEffect(() => {
    const c = leinwandRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(seite * dpr);
    c.height = Math.round(seite * dpr);
    neu();
    // Mausrad: nicht passiv, sonst scrollt das Fenster mit
    const rad = (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomUm(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener("wheel", rad, { passive: false });
    return () => c.removeEventListener("wheel", rad);
  }, []);

  // Ein Finger zieht, zwei Finger vergrössern
  const finger = useRef(new Map());
  const punkt = (e) => {
    const r = leinwandRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const runter = (e) => {
    // Ohne Fang ginge das Ziehen verloren, sobald der Finger die
    // Leinwand verlässt; scheitern darf es trotzdem nicht
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    finger.current.set(e.pointerId, punkt(e));
  };
  const bewegen = (e) => {
    const f = finger.current;
    if (!f.has(e.pointerId)) return;
    const vorher = f.get(e.pointerId);
    const jetzt = punkt(e);
    if (f.size === 1) {
      z.current.x += jetzt.x - vorher.x;
      z.current.y += jetzt.y - vorher.y;
      f.set(e.pointerId, jetzt);
      neu();
    } else if (f.size === 2) {
      const andere = [...f.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(vorher.x - andere.x, vorher.y - andere.y);
      const d1 = Math.hypot(jetzt.x - andere.x, jetzt.y - andere.y);
      // Mitte mitziehen, dann um die Mitte vergrössern
      z.current.x += (jetzt.x - vorher.x) / 2;
      z.current.y += (jetzt.y - vorher.y) / 2;
      f.set(e.pointerId, jetzt);
      if (d0 > 0) zoomUm(d1 / d0, (jetzt.x + andere.x) / 2, (jetzt.y + andere.y) / 2);
      else neu();
    }
  };
  const hoch = (e) => { finger.current.delete(e.pointerId); };

  const reglerAendern = (e) => {
    const wert = Number(e.target.value);
    const s2 = minS * Math.pow(maxS / minS, wert / 100);
    const mitte = RAND + rahmen / 2;
    zoomUm(s2 / z.current.s, mitte, mitte);
  };

  const tasten = (e) => {
    const t = z.current, schritt = e.shiftKey ? 30 : 8;
    const mitte = RAND + rahmen / 2;
    if (e.key === "ArrowLeft") t.x -= schritt;
    else if (e.key === "ArrowRight") t.x += schritt;
    else if (e.key === "ArrowUp") t.y -= schritt;
    else if (e.key === "ArrowDown") t.y += schritt;
    else if (e.key === "+" || e.key === "=") return zoomUm(1.1, mitte, mitte);
    else if (e.key === "-") return zoomUm(1 / 1.1, mitte, mitte);
    else return;
    e.preventDefault();
    neu();
  };

  const uebernehmen = () => {
    const t = z.current;
    const k = kante / rahmen;
    const ziel = document.createElement("canvas");
    ziel.width = kante; ziel.height = kante;
    const ctx = ziel.getContext("2d");
    if (format === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, kante, kante); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bild, (t.x - RAND) * k, (t.y - RAND) * k,
      bild.naturalWidth * t.s * k, bild.naturalHeight * t.s * k);
    if (alsText) fertig(ziel.toDataURL(format, 0.9));
    else ziel.toBlob((blob) => fertig(blob), format, 0.9);
  };

  return (
    <div className="dialog zuschnitt-fenster">
      <h2>Bild zuschneiden</h2>
      <p className="klein">Bild mit Maus oder Finger verschieben. Grösse mit dem Regler,
        dem Mausrad oder zwei Fingern einstellen.</p>
      <canvas ref={leinwandRef} className="zuschnitt-leinwand" id="zs-leinwand" tabIndex={0}
        aria-label="Ausschnitt. Pfeiltasten verschieben, Plus und Minus ändern die Grösse."
        style={{ width: seite + "px", height: seite + "px" }}
        onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
        onKeyDown={tasten} />
      <div className="zuschnitt-regler">
        <span aria-hidden="true">−</span>
        <input type="range" id="zs-zoom" min="0" max="100" value={regler} aria-label="Grösse"
          onChange={reglerAendern} />
        <span aria-hidden="true">+</span>
      </div>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="zs-nein" data-nein="" onClick={abbrechen}>Abbrechen</button>
        <button className="knopf knopf--haupt" id="zs-ja" onClick={uebernehmen}>Übernehmen</button>
      </div>
    </div>
  );
}
