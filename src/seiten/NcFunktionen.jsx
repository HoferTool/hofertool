// =================================================================
//  NC-FUNKTIONEN
//  Eigene Seite seit 1.367.0 (Wunsch Patrick 3. November 2026: „für
//  alle NC-Code-Funktionen einen eigenen Bereich, im Rechner nur
//  Drehzahl und Winkel und Fase“). Reiter: Kontur, C-Achse, Gravur und
//  DXF (je eine Datei in src/seiten/rechner/). Den Reiter G-Code (Fase
//  und Radius) gibt es seit 1.370.0 nicht mehr, Kontur deckt das ab
//  (Wunsch Patrick 3. November 2026).
//  Der Inhalt steht weiter in #rech-inhalt, damit Gestaltung und
//  Prüfstand der Reiter unverändert gelten.
// =================================================================
import { useState } from "react";
import { useGemerkt } from "../bruecke.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import CAchse from "./rechner/CAchse.jsx";
import Gravur from "./rechner/Gravur.jsx";
import Dxf from "./rechner/Dxf.jsx";
import Kontur from "./rechner/Kontur.jsx";

export const REITER = [
  ["kontur", "Kontur"], ["cachse", "C-Achse G12.1"], ["gravur", "Gravur"], ["dxf", "DXF"],
];

const INHALT = { cachse: CAchse, gravur: Gravur, dxf: Dxf, kontur: Kontur };

const gemerkt = { ansicht: "kontur" };
teilMerken("nc", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

// Für die Seitenleiste: ohne Wert lesen, mit Wert für das nächste Öffnen setzen
export function ncAnsicht(wert) {
  if (wert !== undefined) gemerkt.ansicht = wert;
  return INHALT[gemerkt.ansicht] ? gemerkt.ansicht : "kontur";
}

export default function NcFunktionen() {
  const [ansicht, setAnsicht] = useState(ncAnsicht());
  useGemerkt(gemerkt, { ansicht });
  useSeitenSuche({
    name: "NC-Funktionen", platzhalter: "Kontur, C-Achse, Gravur, DXF …",
    eintraege: REITER.map(([w, t]) => ({ gruppe: "NC-Funktionen", zeichen: "⌨", titel: t, wert: w })),
    springen: (x) => setAnsicht(x.wert),
  });
  const Inhalt = INHALT[ansicht] || Kontur;
  return (
    <>
      <h1 className="seitentitel">NC-Funktionen</h1>
      <Reiter reiter={REITER} aktiv={ansicht} waehlen={setAnsicht} merkmal="rech" seite="nc" />
      <Uebergang key={ansicht}>
        <div id="rech-inhalt"><Inhalt /></div>
      </Uebergang>
    </>
  );
}
