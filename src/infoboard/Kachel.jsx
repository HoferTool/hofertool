// =================================================================
//  ANTIPPBARE KACHELN (PAUSENRAUM)
//  Der Bildschirm im Pausenraum hat Touch (Wunsch Patrick 30. Oktober
//  2026: „ein interaktives Display, ähnlich wie Infoboard“). Neben den
//  Teilen wie im Infoboard gibt es dort Kacheln: farbige Felder mit
//  Zeichen und Titel, etwa „Menüplan“, „Sicherheit“ oder „Wetter“. Wer
//  eine antippt, sieht ihren Inhalt gross über den ganzen Bildschirm
//  (PDF, Bild, Video, Excel, Webseite oder Text), mit grossem Knopf
//  „Schliessen“. Nach zwei Minuten ohne Berührung geht er von selbst zu,
//  damit der Bildschirm nicht stundenlang auf einer Seite stehen bleibt.
//
//  teil = { art: "kachel", titel, zeichen (Emoji, frei), farbe,
//           inhalt: { art: "datei", datei } | { art: "web", adresse, zoom, gesperrt }
//                 | { art: "text", html } }
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { textBearbeiten } from "./TextFeld.jsx";
import { webBearbeiten } from "./WebFeld.jsx";
import { dateiHochladen, dateiTyp } from "./daten.js";

export const KACHEL_FARBEN = [["#1f6feb", "Blau"], ["#2ea043", "Grün"], ["#d97706", "Orange"], ["#dc2626", "Rot"],
  ["#7c3aed", "Violett"], ["#0891b2", "Türkis"], ["#db2777", "Pink"], ["#475569", "Grau"]];
const INHALTE = [["datei", "Datei (PDF, Bild, Video, Excel)"], ["web", "Webseite"], ["text", "Text wie in Word"]];
export const ZU_MS = 2 * 60 * 1000;

// Eine Datei wählen, ohne festes Feld im Fenster. Bricht man ab, kommt null
// (Chrome meldet das mit „cancel“; ältere Browser melden gar nichts).
function dateiWaehlen() {
  return new Promise((fertig) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "application/pdf,image/*,video/*,.xlsx,.xlsm,.xls,.ods";
    i.onchange = () => fertig((i.files && i.files[0]) || null);
    i.oncancel = () => fertig(null);
    i.click();
  });
}

export const inhaltName = (inh) => !inh ? "kein Inhalt"
  : inh.art === "web" ? "Webseite: " + (inh.adresse || "")
  : inh.art === "text" ? "Text"
  : inh.datei ? ({ pdf: "PDF", bild: "Bild", video: "Video", excel: "Excel" }[inh.datei.typ] || "Datei") + ": " + (inh.datei.name || "")
  : "kein Inhalt";

// Inhalt wählen oder ändern. Ergibt den neuen Inhalt oder null.
export async function inhaltBearbeiten(art, alt0) {
  if (art === "web") {
    const f = await webBearbeiten(alt0 && alt0.art === "web" ? alt0 : null);
    return f ? { art: "web", ...f } : null;
  }
  if (art === "text") {
    const html = await textBearbeiten({ html: alt0 && alt0.art === "text" ? alt0.html : "", format: "a3",
      seitenVerhaeltnis: 9 / 16, titel: "Text der Kachel" });
    return html == null ? null : { art: "text", html };
  }
  const d = await dateiWaehlen();
  if (!d) return null;
  const typ = dateiTyp(d.name, d.type);
  if (!typ || typ === "word") { alt.meldung("Nur PDF, Bilder, Videos oder Excel.", "warn"); return null; }
  try { return { art: "datei", datei: await dateiHochladen(d) }; }
  catch (e) { alt.meldung("Hochladen ging nicht: " + alt.fehlertext(e), "fehler"); return null; }
}

// Fenster für Titel, Zeichen und Farbe; bei einer neuen Kachel dazu, was
// beim Antippen aufgeht. Ergibt die Felder der Kachel oder null.
export async function kachelBearbeiten(t) {
  const w = await alt.dialogFelder({
    titel: t ? "Kachel ändern" : "Neue Kachel",
    text: "Eine Kachel steht auf dem Bildschirm im Pausenraum. Wer sie antippt, sieht ihren Inhalt gross.",
    felder: [
      { name: "titel", label: "Titel", wert: t ? t.titel : "", pflicht: true, platzhalter: "z. B. Menüplan" },
      { name: "zeichen", label: "Zeichen (freiwillig)", wert: t ? t.zeichen || "" : "", platzhalter: "z. B. 🍽️",
        hinweis: "Ein Emoji. Am PC mit Windows-Taste + Punkt." },
      { name: "farbe", label: "Farbe", wert: t ? t.farbe : KACHEL_FARBEN[0][0], auswahl: KACHEL_FARBEN },
      ...(t ? [] : [{ name: "art", label: "Was geht beim Antippen auf?", wert: "datei", auswahl: INHALTE }]),
    ],
    bestaetigen: t ? "Speichern" : "Weiter",
  });
  if (!w) return null;
  const titel = String(w.titel || "").trim();
  if (!titel) return null;
  const felder = { titel, zeichen: String(w.zeichen || "").trim().slice(0, 8), farbe: w.farbe || KACHEL_FARBEN[0][0] };
  if (t) return felder;
  const inhalt = await inhaltBearbeiten(w.art);
  return inhalt ? { ...felder, inhalt } : null;
}

// Die Kachel auf der Tafel. Schrift aus der Grösse der Kachel, damit sie
// auch klein oder gross gezogen immer passt.
export function KachelFlaeche({ feld, breite, hoehe, antippen }) {
  const m = Math.min(breite, hoehe);
  return (
    <button type="button" className="ib-kachel" data-ibkachel={feld.titel} tabIndex={antippen ? 0 : -1}
      style={{ "--kf": feld.farbe || KACHEL_FARBEN[0][0], fontSize: Math.max(14, m * 0.16) }}
      onClick={antippen ? (e) => { e.stopPropagation(); antippen(feld); } : undefined}>
      {feld.zeichen && <span className="ib-kachel__zeichen">{feld.zeichen}</span>}
      <span className="ib-kachel__titel">{feld.titel}</span>
      <span className="ib-kachel__tipp" aria-hidden="true">Antippen</span>
    </button>
  );
}

// Der Inhalt gross über der Tafel, in Punkten der Tafel (liegt im Blatt).
// inhaltZeigen kommt aus Tafel.jsx, damit PDF, Excel und Text genau so
// gezeichnet werden wie auf den Teilen.
export function KachelGross({ feld, breite, hoehe, zu, inhaltZeigen }) {
  const flaeche = useRef(null);
  const [box, setBox] = useState(null);
  // Nach zwei Minuten ohne Berührung von selbst zu
  const [zuletzt, setZuletzt] = useState(Date.now);
  useEffect(() => {
    const t = setTimeout(zu, ZU_MS - (Date.now() - zuletzt));
    return () => clearTimeout(t);
  }, [zuletzt, zu]);
  useLayoutEffect(() => {
    const el = flaeche.current;
    if (el) setBox({ b: el.clientWidth, h: el.clientHeight });
  }, [breite, hoehe]);
  const inh = feld.inhalt || {};
  // Text als Blatt quer, so gross wie Platz ist
  let tb = null;
  if (box && inh.art === "text") {
    const v = 9 / 16;
    const b = Math.min(box.b, box.h / v);
    tb = { b, h: b * v };
  }
  return (
    <div className="ib-gross" data-ib="gross" style={{ width: breite, height: hoehe, "--kf": feld.farbe || KACHEL_FARBEN[0][0] }}
      onPointerDown={(e) => { e.stopPropagation(); setZuletzt(Date.now()); }}>
      <div className="ib-gross__kopf">
        <span className="ib-gross__titel">{feld.zeichen ? feld.zeichen + " " : ""}{feld.titel}</span>
        {inh.art === "datei" && inh.datei && (inh.datei.typ === "pdf" || inh.datei.typ === "excel") &&
          <span className="ib-gross__hinweis">Antippen zeigt die nächste Seite</span>}
        <button type="button" className="ib-gross__zu" data-ib="gross-zu" onClick={zu}>✕ Schliessen</button>
      </div>
      <div className="ib-gross__flaeche" ref={flaeche}>
        {box && inh.art === "text" && tb &&
          <div className="ib-gross__text" style={{ width: tb.b, height: tb.h }}>
            {inhaltZeigen({ id: feld.id + "-gross", art: "text", html: inh.html }, tb.b, tb.h)}</div>}
        {box && inh.art === "web" && inhaltZeigen({ id: feld.id + "-gross", art: "web", adresse: inh.adresse, zoom: inh.zoom, gesperrt: inh.gesperrt }, box.b, box.h)}
        {box && inh.art === "datei" && inh.datei && inh.datei.typ === "video" &&
          <video className="ib-bild" src={inh.datei.url} autoPlay controls playsInline />}
        {box && inh.art === "datei" && inh.datei && inh.datei.typ !== "video" &&
          inhaltZeigen({ id: feld.id + "-gross", art: "datei", datei: inh.datei, sekunden: 0 }, box.b, box.h)}
        {!inh.art && <div className="ib-leer">Diese Kachel hat noch keinen Inhalt.</div>}
      </div>
    </div>
  );
}
