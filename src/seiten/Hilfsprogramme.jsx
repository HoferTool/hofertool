// =================================================================
//  HILFSPROGRAMME (neuer Look, seit 1.731.0)
//  Wunsch Patrick 23. November 2026: „einlagen und Hofer 2d to 3d soll
//  zusammen zu hilfsprogramme mit anzeigen zusammen“, „rechner aus NC pro
//  raus und zu hilfsprogramme“, „werkzeuge 508 soll zu maschinen dann
//  multitasking dann dort“. Gilt nur im neuen Look (html.ohne-kopf); dann
//  setzt neuerLookMenue in app.js die Gruppen der Seiten um. Die Seiten
//  behalten ihre Adressen, im Menü stehen sie als Unterpunkte.
// =================================================================
import { lazy, Suspense } from "react";
import { alt } from "../bruecke.jsx";
import Rechner from "./Rechner.jsx";

const BESCHREIBUNG = {
  einlagen: "Werkzeuge fotografieren, Einlage mit Taschen für den 3D-Drucker",
  hofer2dto3d: "Fertigungszeichnung als PDF, daneben das STEP in 3D",
  modell3d: "SketchUp-Modell (.dae, .glb, .obj …) in 3D ansehen",
  bildschirme: "Infoboard, Empfang und Pausenraum",
  rechner: "Drehzahl, Winkel und Fase",
  reihen: "Reihen üben im Affenwald",
};

// Die Seiten unter „Hilfsprogramme“, die die Person sehen darf
export function hilfsSeiten() {
  return alt.SEITEN.filter((s) => s.gruppe === "hilfsprogramme" && alt.seiteSichtbar(s.pfad));
}

export default function Hilfsprogramme() {
  return (
    <>
      <h1 className="seitentitel">Hilfsprogramme</h1>
      <div className="bs-wahl" id="hp-wahl">
        {hilfsSeiten().map((s) => (
          <a key={s.pfad} className="bs-kachel" href={"#/" + s.pfad} data-hp={s.pfad}>
            {/* Die Zeichen sind fest eingebaute SVG aus dem Programm */}
            <span className="bs-kachel__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.zeichen }} />
            <b className="bs-kachel__titel">{s.titel}</b>
            <span className="bs-kachel__text">{BESCHREIBUNG[s.pfad] || ""}</span>
          </a>
        ))}
      </div>
    </>
  );
}

// Rechner als eigene Seite (im alten Look ein Reiter von NC-PRO)
export function RechnerSeite() {
  return (
    <>
      <h1 className="seitentitel">Rechner</h1>
      <div id="rech-inhalt"><Rechner /></div>
    </>
  );
}

// 508 Werkzeuge als eigene Seite unter Maschinen (im alten Look ein Reiter von NC-PRO)
const Werkzeuge508 = lazy(() => import("./rechner/Werkzeuge508.jsx"));
export function Wz508Seite() {
  return (
    <>
      <h1 className="seitentitel">508 Werkzeuge</h1>
      <div id="rech-inhalt">
        <Suspense fallback={<p className="leer">Wird geladen …</p>}><Werkzeuge508 /></Suspense>
      </div>
    </>
  );
}
