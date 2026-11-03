// =================================================================
//  NC-FUNKTIONEN
//  Eigene Seite seit 1.367.0 (Wunsch Patrick 3. November 2026: „für
//  alle NC-Code-Funktionen einen eigenen Bereich, im Rechner nur
//  Drehzahl und Winkel und Fase“). Reiter: G-Code, C-Achse, Gravur,
//  DXF und Kontur (je eine Datei in src/seiten/rechner/).
//  Der Inhalt steht weiter in #rech-inhalt, damit Gestaltung und
//  Prüfstand der Reiter unverändert gelten.
// =================================================================
import { useState } from "react";
import { useGemerkt } from "../bruecke.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import GCode from "./rechner/GCode.jsx";
import CAchse from "./rechner/CAchse.jsx";
import Gravur from "./rechner/Gravur.jsx";
import Dxf from "./rechner/Dxf.jsx";
import Kontur from "./rechner/Kontur.jsx";

export const REITER = [
  ["gcode", "G-Code"], ["cachse", "C-Achse G12.1"], ["gravur", "Gravur"],
  ["dxf", "DXF"], ["kontur", "Kontur"],
];

const INHALT = { gcode: GCode, cachse: CAchse, gravur: Gravur, dxf: Dxf, kontur: Kontur };

const gemerkt = { ansicht: "gcode" };
teilMerken("nc", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

// Für die Seitenleiste: ohne Wert lesen, mit Wert für das nächste Öffnen setzen
export function ncAnsicht(wert) {
  if (wert !== undefined) gemerkt.ansicht = wert;
  return INHALT[gemerkt.ansicht] ? gemerkt.ansicht : "gcode";
}

export default function NcFunktionen() {
  const [ansicht, setAnsicht] = useState(ncAnsicht());
  useGemerkt(gemerkt, { ansicht });
  useSeitenSuche({
    name: "NC-Funktionen", platzhalter: "G-Code, C-Achse, Gravur, DXF, Kontur …",
    eintraege: REITER.map(([w, t]) => ({ gruppe: "NC-Funktionen", zeichen: "⌨", titel: t, wert: w })),
    springen: (x) => setAnsicht(x.wert),
  });
  const Inhalt = INHALT[ansicht] || GCode;
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
