// =================================================================
//  PRODUKTION
//  Hülle mit den Reitern Erfassen und Fortschritt, in React
//  (src/seiten/produktion/). „Maschinen und Typen“ ist seit 1.134.0
//  die eigene Seite Maschinen (src/seiten/Maschinen.jsx, Wunsch
//  Patrick 21. Oktober 2026). HOCO läuft noch im alten Programm und
//  hängt über AltTeil darin.
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
import Fortschritt from "./produktion/Fortschritt.jsx";
import Richten from "./produktion/Richten.jsx";
import Statistik from "./Statistik.jsx";
import { ms } from "./Maschinen.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";

// „Infos zum Richten“ seit 1.170.0: Einrichtblätter in der App ändern
// „Statistik“ seit 1.318.0 hier statt als eigene Seite im Menü (Wunsch
// Patrick 30. Oktober 2026: „Statistik zu Produktion integrieren“);
// nicht für Externe (Entscheid offen) und das Dienstkonto
export const REITER = [["erfassen", "Erfassen"], ["fortschritt", "Fortschritt"], ["richten", "Infos zum Richten"], ["statistik", "Statistik"]];

// Was die Person davon sieht; auch für die Seitenleiste (unterreiter.js)
export function sichtbareReiter() {
  return REITER.filter(([w]) => (!alt.istExtern() || w === "erfassen")
    && (w !== "statistik" || alt.meineRolle() !== "dienst"));
}

let ladeNr = 0;

// Was jede Ansicht braucht
async function grunddatenLaden() {
  const prod = alt.prod;
  prod.parks = await alt.ladeParks(false);
  prod.maschinen = await alt.ladeMaschinen(false);
  prod.auftraege = await alt.ladeLaufendeAuftraege();
  // Für die Typknöpfe beim Erfassen; ohne Typen geht es auch
  try { prod.typen = await alt.ladeTypen(); } catch (f) { prod.typen = prod.typen || []; }
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
  if (["typen", "maschinen", "uebersicht"].includes(prod.ansicht)) prod.ansicht = "erfassen";
  if (prod.ansicht === "statistik" && alt.meineRolle() === "dienst") prod.ansicht = "erfassen";
}

export default function Produktion({ auffrischen, behaelter }) {
  const prod = alt.prod;
  vorgabenSetzen(prod);
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const waehlen = (wert) => { prod.ansicht = wert; zeichnen(); };
  const { daten: geladen, fehler, neu } = useDaten(() => grunddatenLaden(), [auffrischen]);
  // Maschinen einrichten geht seit 1.134.0 auf der Seite Maschinen
  const zuMaschinen = () => { ms.ansicht = "uebersicht"; location.hash = "#/maschinen"; };

  // Strg + F sucht Maschinen und was gerade auf ihnen läuft (seit 1.169.0);
  // ein Treffer wählt Park und Erfassen und zeigt die Maschine
  useSeitenSuche({
    // Die Statistik meldet ihre eigene Suche an
    aus: prod.ansicht === "statistik",
    name: "Produktion", platzhalter: "Maschine, Nummer, HOCO Nr. oder FA Nr. …",
    eintraege: () => !geladen ? [] : (prod.maschinen || []).map((m) => {
      const j = (prod.auftraege || {})[m.id];
      const park = (prod.parks || []).find((p) => p.id === m.park_id);
      return { gruppe: "Maschinen", zeichen: "⚙", titel: m.name + (m.machine_number ? " " + m.machine_number : ""),
        zeile: [j ? j.job_number : "kein Auftrag", park && park.name].filter(Boolean).join(" · "),
        such: j ? [j.fa_nr, j.material_bez].filter(Boolean).join(" ") : "", m };
    }),
    springen: (x) => {
      Object.assign(prod, { ansicht: "erfassen", parkId: x.m.park_id, typFilter: null });
      zeichnen();
      hinzeigen('[data-msuche="' + x.m.id + '"]');
    },
  });

  const reiter = sichtbareReiter();

  return (
    <>
      <h1 className="seitentitel">Produktion</h1>
      <Reiter reiter={reiter} aktiv={prod.ansicht} waehlen={waehlen} merkmal="ansicht" seite="produktion" />
      {!(alt.darfSchreiben() || alt.istExtern()) &&
        <div className="nurlesen">Du kannst hier alles ansehen, aber nichts ändern.</div>}
      <Uebergang key={prod.ansicht}>
        {prod.ansicht === "statistik"
          // Lädt ihre Daten selbst, braucht die Grunddaten nicht
          ? <div id="prod-inhalt"><Statistik auffrischen={auffrischen} eingebettet /></div>
          : fehler && !geladen
          ? <div id="prod-inhalt"><div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></div>
          : !geladen
            ? <div id="prod-inhalt"><div className="laedt">Wird geladen …</div></div>
            : prod.ansicht === "erfassen"
              ? <div id="prod-inhalt">
                  <Erfassen geladen={geladen} neuLaden={neu} behaelter={behaelter}
                    zuMaschinen={zuMaschinen} />
                </div>
              : prod.ansicht === "fortschritt"
                ? <div id="prod-inhalt"><Fortschritt key={geladen.nr} neuLaden={neu} /></div>
                : prod.ansicht === "richten"
                ? <div id="prod-inhalt"><Richten key={geladen.nr} /></div>
                : <AltTeil key={prod.ansicht + geladen.nr} id="prod-inhalt"
                    zeichne={(el) => alteAnsicht(el, behaelter)} />}
      </Uebergang>
    </>
  );
}

// HOCO: noch das alte Programm.
function alteAnsicht(ziel, b) {
  ziel.innerHTML = '<div class="laedt">Wird geladen …</div>';
  alt.produktionAlteAnsicht(ziel, b);
}
