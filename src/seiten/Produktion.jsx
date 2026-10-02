// =================================================================
//  PRODUKTION
//  Hülle mit den Reitern Erfassen, Fortschritt sowie Maschinen und
//  Typen. Erfassen ist in React (src/seiten/produktion/Erfassen.jsx),
//  Fortschritt, Maschinen, Typen und HOCO laufen noch im alten
//  Programm und hängen über AltTeil darin.
//
//  Die Grunddaten (Parks, Maschinen, laufende Aufträge) liegen wie
//  bisher in prod.* im alten Programm, weil viele alte Stellen sie
//  lesen. Ruft das alte Programm seiteProduktion(b) auf, kommt das
//  hier als „auffrischen“ an: alles still neu laden.
// =================================================================
import { useReducer } from "react";
import { alt, AltTeil, useDaten } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import Erfassen from "./produktion/Erfassen.jsx";

const REITER = [["erfassen", "Erfassen"], ["fortschritt", "Fortschritt"],
                ["maschinen", "Maschinen und Typen"]];

let ladeNr = 0;

// Was jede Ansicht braucht. Bei „Maschinen“ auch die ausgeblendeten.
async function grunddatenLaden(auchInaktive) {
  const prod = alt.prod;
  prod.parks = await alt.ladeParks(auchInaktive);
  prod.maschinen = await alt.ladeMaschinen(auchInaktive);
  prod.auftraege = await alt.ladeLaufendeAuftraege();
  try { alt.plan.auftraege = await alt.ladePlanAuftraege(); } catch (f) { alt.plan.auftraege = []; }
  return { nr: ++ladeNr };
}

function vorgabenSetzen(prod) {
  if (alt.istExtern()) prod.ansicht = "erfassen";
  if (!prod.tag) prod.tag = alt.isoDatum(new Date());
  if (!prod.modus) prod.modus = alt.einstellung("wochestart") ? "woche"
    : (window.innerWidth < 780 ? "tag" : "woche");
  if (!prod.vonDatum) {
    const h = new Date();
    prod.bisDatum = alt.isoDatum(h);
    prod.vonDatum = alt.isoDatum(new Date(h.getFullYear(), h.getMonth(), 1));
  }
  // Alte Verweise auf Reiter, die es nicht mehr gibt
  if (prod.ansicht === "typen") prod.ansicht = "maschinen";
  if (prod.ansicht === "uebersicht") prod.ansicht = "erfassen";
}

export default function Produktion({ auffrischen, behaelter }) {
  const prod = alt.prod;
  vorgabenSetzen(prod);
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const waehlen = (wert) => { prod.ansicht = wert; zeichnen(); };
  const maschinenAnsicht = prod.ansicht === "maschinen";

  const { daten: geladen, fehler, neu } = useDaten(
    () => grunddatenLaden(maschinenAnsicht), [maschinenAnsicht, auffrischen]);

  const reiter = REITER.filter(([w]) => !alt.istExtern() || w === "erfassen");

  return (
    <>
      <h1 className="seitentitel">Produktion</h1>
      <Reiter reiter={reiter} aktiv={prod.ansicht} waehlen={waehlen} merkmal="ansicht" />
      {!(alt.darfSchreiben() || alt.istExtern()) &&
        <div className="nurlesen">Du kannst hier alles ansehen, aber nichts ändern.</div>}
      <Uebergang key={prod.ansicht}>
        {fehler && !geladen
          ? <div id="prod-inhalt"><div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></div>
          : !geladen
            ? <div id="prod-inhalt"><div className="laedt">Wird geladen …</div></div>
            : prod.ansicht === "erfassen"
              ? <div id="prod-inhalt">
                  <Erfassen geladen={geladen} neuLaden={neu} behaelter={behaelter}
                    zuMaschinen={() => waehlen("maschinen")} />
                </div>
              : <AltTeil key={prod.ansicht + geladen.nr} id="prod-inhalt"
                  zeichne={(el) => alteAnsicht(el, behaelter)} />}
      </Uebergang>
    </>
  );
}

// Fortschritt, HOCO, Maschinen und Typen: noch das alte Programm.
function alteAnsicht(ziel, b) {
  ziel.innerHTML = '<div class="laedt">Wird geladen …</div>';
  alt.produktionAlteAnsicht(ziel, b);
}
