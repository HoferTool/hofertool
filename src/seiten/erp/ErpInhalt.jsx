// Test ERP: Hauptseite mit Reitern. Lädt alle ERP-Tabellen auf einmal,
// für die Testversion sind es wenige Zeilen.
import { teilMerken } from "../../teile/wiederherstellen.js";
import { useState } from "react";
import { useDaten, useGemerkt } from "../../bruecke.jsx";
import { allesLaden } from "../../daten/erp.js";
import Stammdaten from "./Stammdaten.jsx";
import KalkTab from "./KalkTab.jsx";
import Kalkulation from "../Kalkulation.jsx";
import { BelegListe, Rechnungen, Fibu, Rueckverfolgung } from "./Belege.jsx";

// Reihenfolge: zuerst Kalkulation, dann Stammdaten, dann der Rest
// (Wunsch Patrick 21. November 2026)
const REITER = [
  ["kalk", "Kalkulation"], ["stamm", "Stammdaten"],
  ["auftrag", "Aufträge"], ["fertigung", "Fertigung"], ["bestellung", "Bestellungen"], ["lieferschein", "Lieferscheine"],
  ["rechnung", "Rechnungen"], ["fibu", "Fibu"], ["rueck", "Rückverfolgung"],
];
const gemerkt = { reiter: "kalk", kalk: "modul" };
// Nach dem Neuladen wieder im selben Reiter und Unterreiter (Wunsch Patrick 25. November 2026)
teilMerken("erp", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

export default function ErpInhalt({ auffrischen }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [kalk, setKalk] = useState(gemerkt.kalk);
  useGemerkt(gemerkt, { reiter, kalk });
  const { daten: d, fehler, neu } = useDaten(allesLaden, [auffrischen]);
  return (
    <div className="erp">
      <h1 className="seitentitel">Test ERP <span className="erp-schild">Testversion</span></h1>
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
        {reiter === "kalk" && <div className="erp-kalk">
          {/* Das bestehende Modul Kalkulation steht seit 1.672.0 hier (Wunsch Patrick) */}
          <div className="reiter erp-unterreiter">
            <button className={"reiter__knopf" + (kalk === "modul" ? " aktiv" : "")} data-erp-kalkreiter="modul" onClick={() => setKalk("modul")}>Kalkulationen</button>
            <button className={"reiter__knopf" + (kalk === "artikel" ? " aktiv" : "")} data-erp-kalkreiter="artikel" onClick={() => setKalk("artikel")}>Artikel und Arbeitsplan anlegen</button>
          </div>
          {kalk === "modul" ? <Kalkulation auffrischen={auffrischen} /> : <KalkTab d={d} neu={neu} />}
        </div>}
        {reiter === "stamm" && <Stammdaten d={d} neu={neu} />}
      </>}
    </div>
  );
}
