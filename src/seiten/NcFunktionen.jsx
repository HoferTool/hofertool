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
import { useEffect, useState } from "react";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { inEigenesFenster } from "../teile/eigenesFenster.js";
import { alt, useGemerkt } from "../bruecke.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import CAchse from "./rechner/CAchse.jsx";
import Gravur from "./rechner/Gravur.jsx";
import Dxf from "./rechner/Dxf.jsx";
import Kontur, { tutorialOeffnen, TUTORIAL_AUS } from "./rechner/Kontur.jsx";
import BohrenFraesen from "./rechner/BohrenFraesen.jsx";
import Entgraten from "./rechner/Entgraten.jsx";
import HoferCam from "./rechner/HoferCam.jsx";
import Rechner, { REITER as RECHNER_REITER, rechnerAnsicht } from "./Rechner.jsx";

export const REITER = [
  ["kontur", "HOFERCONTUR"], ["cam", "HOFERCAM"], ["bohren", "Bohren / Fräsen"], ["entgraten", "Entgraten"], ["cachse", "C-Achse G12.1"], ["gravur", "Gravur"], ["dxf", "DXF"], ["rechner", "Rechner"],
];

// Hofer Cam sehen seit 1.432.0 alle ausser Externen (camSehen in app.js)
export function ncReiter() {
  return REITER.filter(([w]) => w !== "cam" || (alt.camSehen && alt.camSehen()));
}

const INHALT = { bohren: BohrenFraesen, entgraten: Entgraten, cachse: CAchse, gravur: Gravur, dxf: Dxf, kontur: Kontur, cam: HoferCam, rechner: Rechner };

// Eigenes Fenster für jeden Reiter (seit 1.437.0, Wunsch Patrick
// 6. November 2026: „alle der Module in NC-PRO sollen auch als eigenes
// Fenster geöffnet werden können“). Wie die Kontur (Kontur.jsx, eigener
// Knopf) zieht der ganze Reiter in ein eigenes Browserfenster; die Werte
// liegen in den Reitern ausserhalb der Komponenten und bleiben darum
// gleich. Im Reiter steht so lange nur „Zurückholen“, damit nicht zwei
// Ansichten dasselbe ändern.
const fenster = {};
const fensterHoerer = new Set();
const fensterMelden = () => fensterHoerer.forEach((f) => f());
const mitMaus = () => !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
const reiterName = (art) => (REITER.find(([w]) => w === art) || [, art])[1];

function fensterAuf(art) {
  if (fenster[art]) return;
  const Inhalt = INHALT[art];
  const zu = fensterOeffnen((zu) => (
    <div className="dialog kt-eigen nc-eigen" data-nceigen={art}>
      <div className="karte__kopf kt-eigen__kopf"><b>NC-PRO · {reiterName(art)}</b>
        <button className="knopf knopf--klein" data-nceigen-zu onClick={zu}>Zurück ins HoferTool</button></div>
      <div id="rech-inhalt"><Inhalt /></div>
    </div>
  ), () => { delete fenster[art]; fensterMelden(); }, "kt-eigen-huelle nc-eigen-huelle");
  const huellen = document.querySelectorAll(".nc-eigen-huelle");
  const huelle = huellen[huellen.length - 1];
  fenster[art] = zu;
  fensterMelden();
  if (!huelle || !inEigenesFenster(huelle, zu, { titel: "NC-PRO · " + reiterName(art) + " · Hofer Tool",
    lage: { x: window.screenX + 60, y: window.screenY + 60 } })) zu();
}

const gemerkt = { ansicht: "kontur" };
teilMerken("nc", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

// Für die Seitenleiste: ohne Wert lesen, mit Wert für das nächste Öffnen setzen
export function ncAnsicht(wert) {
  if (wert !== undefined) gemerkt.ansicht = wert;
  return INHALT[gemerkt.ansicht] && ncReiter().some(([w]) => w === gemerkt.ansicht) ? gemerkt.ansicht : "kontur";
}

// Erklärvideo jedes Mal, wenn man NC-PRO anwählt (seit 1.440.0, Wunsch
// Patrick 6. November 2026: „das Video soll jedesmal kommen, wenn man
// NC-PRO anwählt, mit Option nicht mehr anzeigen“; vorher einmal je Laden
// beim Reiter Kontur). Reiterwechsel innerhalb von NC-PRO zählen nicht,
// darum merkt sich die Seite, ob man seither woanders war. Beim Neuladen
// (auch dem stündlichen) kommt es nicht, man hat NC-PRO ja nicht angewählt.
let warAufNc = false;
let ersterAufruf = true;
window.addEventListener("hashchange", () => { if (!/^#\/(nc|rechner)\b/.test(location.hash)) warAufNc = false; });
function tutorialBeimAnwaehlen() {
  const neuGeladen = ersterAufruf && performance.getEntriesByType?.("navigation")?.[0]?.type === "reload";
  ersterAufruf = false;
  if (warAufNc) return;
  warAufNc = true;
  if (neuGeladen || (window.TEST && !window.TEST.tutorial)) return;
  if (alt.einstellungWert && alt.einstellungWert(TUTORIAL_AUS, "") === "1") return;
  if (document.getElementById("kt-tutorial")) return;
  tutorialOeffnen();
}

export default function NcFunktionen() {
  const [ansicht, setAnsicht] = useState(ncAnsicht());
  const [neu, setNeu] = useState(0);
  const [, neuZeichnen] = useState(0);
  useEffect(tutorialBeimAnwaehlen, []);
  useEffect(() => {
    const f = () => neuZeichnen((n) => n + 1);
    fensterHoerer.add(f);
    return () => fensterHoerer.delete(f);
  }, []);
  useGemerkt(gemerkt, { ansicht });
  useSeitenSuche({
    name: "NC-PRO", platzhalter: "HOFERCONTUR, Kontur, Bohren, Fräsen, Entgraten, C-Achse, Gravur, DXF, HOFERCAM, Drehzahl …",
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
        {/* Kontur hängt ihre Knöpfe selbst hier ein, die anderen Reiter bekommen den Knopf hier */}
        {ansicht !== "kontur" && !fenster[ansicht] && mitMaus()
          ? <div className="ncpro-kopf__rechts"><button className="knopf knopf--klein" id="nc-eigen" data-nceigen-auf={ansicht}
              onClick={() => fensterAuf(ansicht)}
              title="Diesen Reiter in einem eigenen Browserfenster öffnen, das man verschieben kann, auch auf einen anderen Bildschirm">
              ⧉ Eigenes Fenster</button></div>
          : <div className="ncpro-kopf__rechts" id="ncpro-kopf-rechts" />}
      </header>
      <Reiter reiter={ncReiter()} aktiv={ansicht} waehlen={setAnsicht} merkmal="rech" seite="nc" />
      <Uebergang key={ansicht + (ansicht === "rechner" ? neu : "")}>
        <div id="rech-inhalt">{fenster[ansicht]
          ? <section className="karte kt-woanders" data-ncwoanders={ansicht}>
              <h2>{reiterName(ansicht)}</h2>
              <p>Dieser Reiter ist in einem eigenen Fenster offen.</p>
              <button className="knopf" onClick={() => fenster[ansicht] && fenster[ansicht]()}>Zurückholen</button>
            </section>
          : <Inhalt />}</div>
      </Uebergang>
    </>
  );
}
