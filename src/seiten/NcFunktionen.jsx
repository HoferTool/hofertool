// =================================================================
//  NC-FUNKTIONEN
//  Eigene Seite seit 1.367.0 (Wunsch Patrick 3. November 2026: „für
//  alle NC-Code-Funktionen einen eigenen Bereich, im Rechner nur
//  Drehzahl und Winkel und Fase“). Reiter: Kontur, C-Achse, Gravur und
//  DXF (je eine Datei in src/seiten/rechner/). Den Reiter G-Code (Fase
//  und Radius) gibt es seit 1.370.0 nicht mehr, Kontur deckt das ab
//  (Wunsch Patrick 3. November 2026). Seit 1.378.0 als letzter Reiter
//  der Rechner (Drehzahl, Winkel und Fase), der vorher eine eigene
//  Seite im Menü war (Wunsch Patrick 3. November 2026). Seit 1.384.0
//  der Reiter Bohren / Fräsen für Front- und Querwerkzeuge.
//  Der Inhalt steht weiter in #rech-inhalt, damit Gestaltung und
//  Prüfstand der Reiter unverändert gelten.
// =================================================================
import { useState } from "react";
import { alt, useGemerkt } from "../bruecke.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import CAchse from "./rechner/CAchse.jsx";
import Gravur from "./rechner/Gravur.jsx";
import Dxf from "./rechner/Dxf.jsx";
import Kontur from "./rechner/Kontur.jsx";
import BohrenFraesen from "./rechner/BohrenFraesen.jsx";
import Entgraten from "./rechner/Entgraten.jsx";
import HoferCam from "./rechner/HoferCam.jsx";
import Rechner, { REITER as RECHNER_REITER, rechnerAnsicht } from "./Rechner.jsx";

export const REITER = [
  ["kontur", "NC-PRO"], ["bohren", "Bohren / Fräsen"], ["entgraten", "Entgraten"], ["cachse", "C-Achse G12.1"], ["gravur", "Gravur"], ["dxf", "DXF"], ["cam", "Hofer Cam"], ["rechner", "Rechner"],
];

// Hofer Cam sieht vorerst nur, wer den Vermerk camSehen am Konto hat
// (Wunsch Patrick 5. November 2026: „zuerst nur für Patrick Ruch“)
export function ncReiter() {
  return REITER.filter(([w]) => w !== "cam" || (alt.camSehen && alt.camSehen()));
}

const INHALT = { bohren: BohrenFraesen, entgraten: Entgraten, cachse: CAchse, gravur: Gravur, dxf: Dxf, kontur: Kontur, cam: HoferCam, rechner: Rechner };

const gemerkt = { ansicht: "kontur" };
teilMerken("nc", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

// Für die Seitenleiste: ohne Wert lesen, mit Wert für das nächste Öffnen setzen
export function ncAnsicht(wert) {
  if (wert !== undefined) gemerkt.ansicht = wert;
  return INHALT[gemerkt.ansicht] && ncReiter().some(([w]) => w === gemerkt.ansicht) ? gemerkt.ansicht : "kontur";
}

export default function NcFunktionen() {
  const [ansicht, setAnsicht] = useState(ncAnsicht());
  const [neu, setNeu] = useState(0);
  useGemerkt(gemerkt, { ansicht });
  useSeitenSuche({
    name: "NC-PRO", platzhalter: "Kontur, Bohren, Fräsen, Entgraten, C-Achse, Gravur, DXF, Hofer Cam, Drehzahl …",
    eintraege: [
      ...ncReiter().map(([w, t]) => ({ gruppe: "NC-PRO", zeichen: "⌨", titel: t, wert: w })),
      ...RECHNER_REITER.map(([w, t]) => ({ gruppe: "Rechner", zeichen: "∑", titel: t, wert: "rechner", unter: w })),
    ],
    // Drehzahl und Winkel liegen im Reiter Rechner; key wechselt, damit er die Wahl neu liest
    springen: (x) => { if (x.unter) rechnerAnsicht(x.unter); setAnsicht(x.wert); setNeu((n) => n + 1); },
  });
  const Inhalt = (ncReiter().some(([w]) => w === ansicht) && INHALT[ansicht]) || Kontur;
  return (
    <>
      {/* Kopf mit grossem Logo in der Mitte und dem Namen in 3D-Schrift
          (seit 1.381.0, Wunsch Patrick 3. November 2026: „das Hofer Logo
          grösser oben in der Mitte“, „HOFER-NC-PRO in einer modernen
          dreidimensionalen Schrift“). Die Tiefe kommt aus geschichteten
          Schatten, der Text bleibt normaler Text (Suche, Vorlesen). */}
      {/* Seit 1.381.1 alles in einer Zeile (Patrick: „HOFER-NC-PRO nach
          links, der Kopf braucht zu viel Platz“): Name links, Logo in der
          Mitte, rechts die Knöpfe der Kontur (Kontur.jsx hängt sie dort ein). */}
      <header className="ncpro-kopf" id="ncpro-kopf">
        <h1 className="seitentitel ncpro-titel" data-text="NC-PRO"><span className="ncpro-text"><b>NC-PRO</b></span></h1>
        <div className="ncpro-kopf__mitte">
          <img className="ncpro-kopf__logo ncpro-kopf__logo--hell" src={import.meta.env.BASE_URL + "logo-empfang.png"} alt="Hofer + Co." />
          <img className="ncpro-kopf__logo ncpro-kopf__logo--dunkel" src={import.meta.env.BASE_URL + "logo-weiss.svg"} alt="Hofer + Co." />
        </div>
        <div className="ncpro-kopf__rechts" id="ncpro-kopf-rechts" />
      </header>
      <Reiter reiter={ncReiter()} aktiv={ansicht} waehlen={setAnsicht} merkmal="rech" seite="nc" />
      <Uebergang key={ansicht + (ansicht === "rechner" ? neu : "")}>
        <div id="rech-inhalt"><Inhalt /></div>
      </Uebergang>
    </>
  );
}
