// =================================================================
//  HOFERCAM: Bibliothek reale Werkzeuge (seit 1.695.0)
//  Liste aller Werkzeuge aus den Werkzeug-Artikeln (Bestellungen →
//  Artikel) und den Einrichtblättern, je mit Art.-Nr., Lieferant, kleinem
//  3D-Bild und ob die App es ganz erkannt, nur geschätzt oder gar nicht
//  erkannt hat. „Ergänzen“ öffnet das Fenster Werkzeug, gespeichert in
//  cam_werkzeuge, das gilt dann vor dem Erkannten (Wunsch Patrick 22.
//  November 2026: „wenn etwas noch nicht erkannt ist, soll es ergänzt
//  werden können“). Im Fenster 🔧 Werkzeug einer Bearbeitung dieselbe
//  Liste zum Wählen.
// =================================================================

import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { STATUS_TEXT, bibliothekLaden, bibliothekSpeichern } from "./camArtikel.js";
import { wzFehler, wzText } from "./camWerkzeug.js";
import { WzMini3D } from "./CamWzMini3D.jsx";
import { WerkzeugFeld } from "./CamWerkzeugBild.jsx";
import { werkzeugGrossOeffnen } from "./CamWz3DGross.jsx";

let offenZu = null;
export function bibliothekOeffnen() {
  if (offenZu) offenZu();
  offenZu = fensterOeffnen((zu) => (
    <div className="dialog cam-opt cam-bib" data-cam-bib="fenster" role="dialog" aria-label="Reale Werkzeuge">
      <div className="cam-opt__kopf"><h2>📚 Reale Werkzeuge</h2>
        <button className="knopf knopf--klein" data-cam-bib-zu onClick={zu}>✕</button></div>
      <p className="klein">Aus den Werkzeug-Artikeln (Bestellungen → Artikel) und den Einrichtblättern. Kantenlänge und Dicke kommen aus dem ISO-Code der Platte.
        Gelb = teilweise geschätzt, rot = nicht erkannt: mit „Ergänzen“ von Hand festlegen. Maus über das Bild dreht das Werkzeug, Antippen zeigt es gross zum Drehen und Messen.</p>
      <BibliothekListe />
    </div>), () => { offenZu = null; }, "cam-opt-huelle");
}

const FILTER = [["alle", "Alle"], ["erkannt", "Erkannt"], ["teilweise", "Teilweise"], ["nein", "Nicht erkannt"], ["hand", "Ergänzt"], ["kein", "Kein Werkzeug"]];
const SEITE = 60;

// arten: welche Werkzeugarten passen (["dreh"], ["fraes"] …), leer = alle;
// waehlen(e): Eintrag übernehmen (nur im Fenster Werkzeug)
export function BibliothekListe({ arten, waehlen }) {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [such, setSuch] = useState("");
  const [filter, setFilter] = useState("alle");
  const [mehr, setMehr] = useState(1);
  const [offen, setOffen] = useState(null);
  const laden = (frisch) => bibliothekLaden(alt.db, frisch).then((l) => { setListe(l); setFehler(""); })
    .catch((x) => setFehler(x && x.message ? x.message : String(x)));
  useEffect(() => { laden(false); }, []);
  if (fehler) return <p className="klein cam-bib__fehler" data-cam-bib-fehler>Werkzeuge laden ging nicht: {fehler}</p>;
  if (!liste) return <p className="klein">Werkzeuge werden geladen …</p>;
  const woerter = such.toLowerCase().split(/\s+/).filter(Boolean);
  const passend = liste.filter((e) => (!arten || !arten.length || arten.includes(e.art))
    && (!waehlen || (e.wz && !e.kein))
    && (filter === "alle" || e.status === filter)
    && woerter.every((w) => e.such.includes(w)));
  const zahl = (s) => liste.filter((e) => (!arten || !arten.length || arten.includes(e.art)) && (s === "alle" || e.status === s)).length;
  const gezeigt = passend.slice(0, SEITE * mehr);
  return (<div className="cam-bib__liste" data-cam-bib-liste>
    <div className="cam-bib__leiste">
      <input type="search" className="cam-bib__such" data-cam-bib-such placeholder="Suchen: Art.-Nr., Lieferant, DCGT, Ø6 …" value={such}
        onChange={(e) => { setSuch(e.target.value); setMehr(1); }} />
      {!waehlen && <div className="cam-bib__filter" role="group" aria-label="Filter">
        {FILTER.map(([id, text]) => <button key={id} data-cam-bib-filter={id} className={"knopf knopf--klein" + (filter === id ? " aktiv" : "")}
          onClick={() => { setFilter(id); setMehr(1); }}>{text} ({zahl(id)})</button>)}
      </div>}
    </div>
    {!passend.length && <p className="klein">Nichts gefunden.</p>}
    {gezeigt.map((e) => (<div key={e.schluessel} className={"cam-bib__zeile cam-bib--" + e.status} data-cam-bib-eintrag={e.schluessel}>
      <WzMini3D wz={e.kein ? null : e.wz} gross={64} oeffnen={e.wz && !e.kein ? () => werkzeugGrossOeffnen(e) : undefined} />
      <div className="cam-bib__text">
        <div><b data-cam-bib-nr>{e.nr || "Im Einrichtblatt"}</b>{e.lief && <span> · {e.lief}</span>}{e.kat && <span className="klein"> · {e.kat}</span>}</div>
        <div className="klein cam-bib__beschr">{e.text}</div>
        <div className="klein" data-cam-bib-wz>{e.kein ? "kein Werkzeug für die Simulation" : e.wz ? wzText({ art: "k2", wz: e.wz }) : "–"}</div>
        {e.geschaetzt.length > 0 && <div className="klein cam-bib__gesch">geschätzt: {e.geschaetzt.join(", ")}{e.erkannt && e.erkannt.info ? " · " + e.erkannt.info : ""}</div>}
      </div>
      <div className="cam-bib__rechts">
        <span className={"cam-bib__status cam-bib__status--" + e.status} data-cam-bib-status={e.status}>{STATUS_TEXT[e.status]}</span>
        {e.anzahl > 0 && <span className="klein">{e.anzahl === 1 ? "in 1 Einrichtblatt" : "in " + e.anzahl + " Einrichtblättern"}</span>}
        <div className="cam-bib__knoepfe">
          {waehlen && e.wz && <button className="knopf knopf--klein" data-cam-bib-waehlen={e.schluessel} onClick={() => waehlen(e)}>Übernehmen</button>}
          {!waehlen && alt.darfSchreiben() && <button className="knopf knopf--klein" data-cam-bib-ergaenzen={e.schluessel}
            onClick={() => setOffen(offen === e.schluessel ? null : e.schluessel)}>{offen === e.schluessel ? "Schliessen" : "Ergänzen"}</button>}
        </div>
      </div>
      {offen === e.schluessel && <Ergaenzen e={e} fertig={() => { setOffen(null); laden(true); }} />}
    </div>))}
    {passend.length > gezeigt.length && <button className="knopf knopf--klein" data-cam-bib-mehr onClick={() => setMehr(mehr + 1)}>
      Mehr zeigen ({passend.length - gezeigt.length} weitere)</button>}
  </div>);
}

// Von Hand festlegen; „k2“ lässt Dreh- und Bohr-/Fräswerkzeug zu
function Ergaenzen({ e, fertig }) {
  const [wz, setWz] = useState(e.wz ? { ...e.wz } : null);
  const [laeuft, setLaeuft] = useState(false);
  const fehlt = wz && wz.form ? Object.keys(wzFehler({ art: "k2", wz })).length : 1;
  const speichern = async (neuWz, kein) => {
    setLaeuft(true);
    try {
      const vorher = await alt.rueckSichern("cam_werkzeuge", { schluessel: e.schluessel });
      const sauber = neuWz ? { ...neuWz } : null;
      if (sauber) delete sauber.artikel;
      await bibliothekSpeichern(alt.db, e, sauber, kein);
      const weg = !sauber && !kein;
      alt.merkeSchritt("Werkzeug " + (e.nr || e.text).slice(0, 40), vorher.length
        ? (weg ? alt.rueckRein("cam_werkzeuge", vorher, "schluessel") : alt.rueckSetz("cam_werkzeuge", vorher[0], { schluessel: e.schluessel }))
        : alt.rueckWeg("cam_werkzeuge", { schluessel: e.schluessel }));
      alt.meldung(weg ? "Wieder wie erkannt." : kein ? "Als „kein Werkzeug“ gemerkt." : "Werkzeug gespeichert.", "gut");
      fertig();
    } catch (x) { alt.meldung("Nicht gespeichert: " + (x && x.message ? x.message : x), "fehler"); }
    setLaeuft(false);
  };
  return (<div className="cam-bib__ergaenzen" data-cam-bib-edit>
    <WerkzeugFeld b={{ art: "k2", wz }} setze={setWz} zu={fertig} ohneBibliothek />
    <div className="cam-bib__knoepfe">
      <button className="knopf" data-cam-bib-speichern disabled={laeuft || fehlt > 0} title={fehlt ? "Erst alle roten Felder ausfüllen" : ""}
        onClick={() => speichern(wz, false)}>Speichern</button>
      <button className="knopf knopf--klein" data-cam-bib-kein disabled={laeuft} onClick={() => speichern(null, true)}>Kein Werkzeug für die Simulation</button>
      {e.hand && <button className="knopf knopf--klein" data-cam-bib-erkannt disabled={laeuft} onClick={() => speichern(null, false)}>Wie erkannt</button>}
      <button className="knopf knopf--klein" onClick={fertig}>Abbrechen</button>
    </div>
  </div>);
}
