// Test ERP: Hauptseite mit Reitern. Lädt alle ERP-Tabellen auf einmal,
// für die Testversion sind es wenige Zeilen.
import { teilMerken } from "../../teile/wiederherstellen.js";
import { useState, useEffect } from "react";
import { useDaten, useGemerkt } from "../../bruecke.jsx";
import { allesLaden } from "../../daten/erp.js";
import Stammdaten from "./Stammdaten.jsx";
import { BewegungListe } from "./Bewegungen.jsx";
import Kalkulation from "../Kalkulation.jsx";
import { BelegListe, Rechnungen, Fibu, Rueckverfolgung } from "./Belege.jsx";

// Reihenfolge: zuerst Kalkulation, dann Stammdaten, dann der Rest
// (Wunsch Patrick 21. November 2026)
const REITER = [
  ["kalk", "Kalkulation"], ["stamm", "Stammdaten"],
  ["auftrag", "Aufträge"], ["fertigung", "Fertigung"], ["bestellung", "Bestellungen"], ["lieferschein", "Lieferscheine"],
  ["rechnung", "Rechnungen"], ["fibu", "Fibu"], ["rueck", "Rückverfolgung"], ["journal", "Lagerjournal"],
];
const gemerkt = { reiter: "kalk", kalk: "modul" };
// Nach dem Neuladen wieder im selben Reiter und Unterreiter (Wunsch Patrick 25. November 2026)
teilMerken("erp", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

export default function ErpInhalt({ auffrischen }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const kalk = "modul";
  useGemerkt(gemerkt, { reiter, kalk });
  const { daten: d, fehler, neu } = useDaten(allesLaden, [auffrischen]);
  // Übernimmt die offene Kalkulation Artikel und Arbeitsplan, laden die Stammdaten frisch
  useEffect(() => { const f = () => neu(); window.addEventListener("hofer-erp-neu", f); return () => window.removeEventListener("hofer-erp-neu", f); }, [neu]);
  return (
    <div className="erp">
      <ErpHeld />
      <div className="reiter">
        {REITER.map(([w, t]) => <button key={w} className={"reiter__knopf" + (reiter === w ? " aktiv" : "")} data-erp-reiter={w}
          onClick={() => setReiter(w)}>{t}</button>)}
      </div>
      {fehler && <div className="karte karte--fehler"><p>{String(fehler.message || fehler)}</p></div>}
      {!d && !fehler && <div className="laedt">Test ERP lädt …</div>}
      {d && <>
        {reiter === "auftrag" && <BelegListe d={d} neu={neu} typ="auftrag"
          hinweis="Einzelauftrag mit Termin je Position, Rahmenauftrag mit Lieferplan (Abrufe). Daraus Fertigungsauftrag, Lieferschein und Proforma." />}
        {reiter === "fertigung" && <BelegListe d={d} neu={neu} typ="fertigung" ohneNeu
          hinweis="Fertigungsaufträge entstehen im Auftrag und übernehmen den Arbeitsplan des Artikels." />}
        {reiter === "bestellung" && <BelegListe d={d} neu={neu} typ="bestellung"
          hinweis="Wie Aufträge, Einzel- oder Rahmenbestellung. Der Wareneingang bucht die Charge ins Lager." />}
        {reiter === "lieferschein" && <BelegListe d={d} neu={neu} typ="lieferschein" ohneNeu
          hinweis="Lieferscheine entstehen im Auftrag und liefern nur Bestand mit demselben Index." />}
        {reiter === "rechnung" && <Rechnungen d={d} neu={neu} />}
        {reiter === "fibu" && <Fibu d={d} neu={neu} />}
        {reiter === "rueck" && <Rueckverfolgung d={d} neu={neu} />}
        {reiter === "journal" && <div className="erp-journal"><p className="hinweis">Alle Lagerbewegungen über alle Artikel. Zeile antippen öffnet den Beleg.</p>
          <BewegungListe d={d} journal /></div>}
        {reiter === "kalk" && <div className="erp-kalk">
          {/* Das bestehende Modul Kalkulation steht seit 1.672.0 hier (Wunsch Patrick) */}
          {/* Artikel und Arbeitsplan übernimmt seit 1.848.0 der Knopf in der offenen Kalkulation */}
          <Kalkulation auffrischen={auffrischen} />
        </div>}
        {reiter === "stamm" && <Stammdaten d={d} neu={neu} />}
      </>}
    </div>
  );
}

// Kopf der Seite: dunkles Hofer-Blau mit Raster, Lichtlinie und leuchtendem
// Logo (Wunsch Patrick 27. November 2026: „cooler, mit Hofer-Logo und etwas
// futuristisch“). Die Kacheln darunter sind seit 1.887.0 weg (Patrick:
// „vergiss die Startkacheln, brauchen wir nicht“).
function ErpHeld() {
  const heute = new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="erp-held" data-erp-held="">
      <div className="erp-held__raster" aria-hidden="true" />
      <div className="erp-held__scan" aria-hidden="true" />
      <div className="erp-held__kopf">
        <img className="erp-held__logo" src={import.meta.env.BASE_URL + "logo-weiss.svg"} alt="Hofer + Co" />
        <div className="erp-held__titel">
          <h1 className="seitentitel">Test ERP <span className="erp-schild">Testversion</span></h1>
          <div className="erp-held__unter">Hofer + Co Präzisionsdrehteile · {heute}</div>
        </div>
        <div className="erp-held__status"><span className="erp-held__punkt" />System online</div>
      </div>
    </div>
  );
}
