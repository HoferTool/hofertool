// =================================================================
//  QM alternativ: Managementbewertung (ISO 9.3), einmal im Jahr.
//  Seit 1.483.0 wird sie wie ein Audit durchgeführt (MbFenster.jsx):
//  Kapitel nach 9.3, Zahlen aus dem HoferTool, Fragekatalog, Bewertung,
//  „Abschliessen“ macht den Bericht und gibt frei. Hier nur die Übersicht.
//  Eintrag in qma_eintraege mit art "bewertung".
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { qmDatum, eintragSpeichern, eintragLoeschen, statusVon, heute } from "../../daten/qmAlt.js";
import { MB_KAPITEL, mbBewertung, mbFragenVon, mbStand } from "../../daten/mbKatalog.js";
import { mbOeffnen } from "./MbFenster.jsx";
import { Schild } from "./Schild.jsx";

// Eingaben nach 9.3.2 und Ergebnisse nach 9.3.3
const EINGABEN = [
  ["veraenderungen", "Veränderungen bei Kontext, Kunden, Markt, interessierten Parteien", "9.3.2 b"],
  ["kunden", "Kundenzufriedenheit und Rückmeldungen", "9.3.2 c1"],
  ["ziele", "Qualitätsziele: wie erreicht", "9.3.2 c2"],
  ["prozesse", "Prozessleistung und Qualität der Teile (Ausschuss, Liefertreue, Auslastung)", "9.3.2 c3"],
  ["abweichungen", "Abweichungen und Korrekturmassnahmen", "9.3.2 c4"],
  ["audits", "Ergebnisse der Audits", "9.3.2 c6"],
  ["lieferanten", "Leistung der Lieferanten", "9.3.2 c7"],
  ["ressourcen", "Reichen die Ressourcen (Personal, Maschinen, Infrastruktur)?", "9.3.2 d"],
  ["risiken", "Wirksamkeit der Massnahmen zu Risiken und Chancen", "9.3.2 e"],
  ["potenzial", "Möglichkeiten zur Verbesserung", "9.3.2 f"],
];
const ERGEBNISSE = [
  ["erg_verbesserung", "Entscheide: Verbesserungen", "9.3.3 a"],
  ["erg_aenderung", "Änderungsbedarf am QM-System", "9.3.3 b"],
  ["erg_ressourcen", "Ressourcenbedarf", "9.3.3 c"],
  ["fazit", "Fazit: Ist das QM-System geeignet, angemessen und wirksam?", "9.3.1"],
];

export default function Bewertung({ daten, neu }) {
  const liste = daten.eintraege.filter((e) => e.art === "bewertung").sort((a, b) => (b.daten.jahr || 0) - (a.daten.jahr || 0));
  const [wahl, setWahl] = useState(null);
  const b = liste.find((x) => x.id === wahl) || liste[0];
  const jahr = new Date().getFullYear();

  async function anlegen() {
    const w = await alt.dialogFelder({ titel: "Neue Managementbewertung", felder: [
      { name: "jahr", label: "Bewertet wird das Jahr", typ: "number", wert: liste.some((x) => x.daten.jahr === jahr) ? jahr + 1 : jahr }],
      bestaetigen: "Anlegen" });
    if (!w || !w.jahr) return;
    try {
      const id = await eintragSpeichern("bewertung", null, { jahr: Number(w.jahr), titel: "Managementbewertung " + w.jahr, datum: heute() }, "entwurf", daten.eintraege);
      setWahl(id); neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }

  return (
    <section className="karte" id="qma-bewertung">
      <div className="karte__kopf">
        <h2>Managementbewertung <span className="klein">ISO 9.3</span></h2>
        <div className="qm-bew-knoepfe">
          {liste.map((x) => <button key={x.id} className={"knopf knopf--klein" + (b && x.id === b.id ? " knopf--haupt" : "")}
            data-qmabew={x.daten.jahr} onClick={() => setWahl(x.id)}>{x.daten.jahr}{x.status === "freigegeben" ? " ✓" : ""}</button>)}
          <button className="knopf" id="qma-neu-bewertung" onClick={anlegen}>+ Bewertung</button>
        </div>
      </div>
      {!b ? <p className="hinweis" id="qma-bew-leer">Noch keine Bewertung. Einmal im Jahr, etwa im Januar für das Jahr davor. Die Zahlen kommen von selbst aus den Listen.</p>
        : <Blatt key={b.id} b={b} daten={daten} neu={neu} />}
    </section>
  );
}

function Blatt({ b, daten, neu }) {
  const frei = b.status === "freigegeben";
  const d = b.daten;
  const mb = d.mb || {};
  const fragen = mb.abgeschlossen_am && mb.fragen ? mb.fragen : mbFragenVon(daten.texte);
  const st = mbStand(mb, fragen);
  const ausBew = daten.eintraege.filter((e) => ["abweichung", "ziel"].includes(e.art) && e.daten.herkunft === b.id);
  const alt_ = !mb.kapitel && EINGABEN.concat(ERGEBNISSE).some(([k]) => String(d[k] || "").trim());

  async function oeffnen() {
    const ok = await alt.nachfragen({ titel: "Wieder bearbeiten", text: "Die Freigabe wird aufgehoben, die Zahlen aus dem HoferTool rechnen wieder neu. Nach dem Bearbeiten nochmals abschliessen, dann kommt ein neuer Bericht.", bestaetigen: "Wieder bearbeiten" });
    if (!ok) return;
    const { schnapp, freigegeben_am, freigegeben_von, ...rest } = d;
    try { await eintragSpeichern("bewertung", b, { ...rest, mb: { ...mb, abgeschlossen_am: null, auto: null } }, "entwurf", daten.eintraege); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function weg() {
    const ok = await alt.nachfragen({ titel: "Bewertung löschen", text: "Die Bewertung " + d.jahr + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    try { await eintragLoeschen(b); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }

  return (
    <div className={"qma-bew" + (frei ? " qm-gesperrt" : "")} data-qmabewblatt={d.jahr}>
      <div className="qm-bew-kopf">
        <h2>Managementbewertung {d.jahr}</h2>
        <Schild ton={frei ? "gruen" : "gelb"} id="qma-bew-status">{frei ? "freigegeben " + qmDatum(String(d.freigegeben_am || "").slice(0, 10)) + (d.freigegeben_von ? " · " + d.freigegeben_von : "") : "Entwurf"}</Schild>
        <div className="qm-bew-knoepfe">
          {!frei && <button className="knopf knopf--haupt" id="qma-bew-durchfuehren" onClick={() => mbOeffnen(b, daten.texte, daten.eintraege, neu)}>
            {mb.kapitel ? "Bewertung weiterführen" : "Bewertung durchführen"}</button>}
          {frei && <button className="knopf" id="qma-bew-ansehen" onClick={() => mbOeffnen(b, daten.texte, daten.eintraege, neu)}>Ansehen</button>}
          {d.bericht_url && <button className="knopf" id="qma-bew-bericht" onClick={() => alt.betrachter(d.bericht_url, "Managementbewertung " + d.jahr, true)}>📄 Bericht</button>}
          {frei && <button className="knopf" onClick={oeffnen}>Wieder bearbeiten</button>}
          {!frei && <button className="chipweg" title="löschen" onClick={weg}>×</button>}
        </div>
      </div>
      <p className="klein">Aufgebaut wie ein Audit: je Kapitel nach ISO 9.3 die Zahlen aus dem HoferTool (Listen und Produktionsstatistik), die Fragen aus dem Katalog mit dem Vorjahr, dann bewerten. Am Schluss neue Ziele und Massnahmen, „Abschliessen“ erstellt den Bericht.</p>
      <div className="qma-mb__uebersicht" id="qma-bew-uebersicht">
        {MB_KAPITEL.map((k, i) => {
          const a = (mb.kapitel || {})[k.id] || {};
          const bw = mbBewertung(a.b);
          return <div key={k.id} className={"qma-mb__ue" + (bw ? " qma-mb__ue--" + bw[2] : "")}>
            <span className="qma-ck__nr">{i + 1}</span><span>{k.titel}</span>
            <span className="klein">{bw ? bw[1] : "offen"}{a.m === "ja" ? " · Massnahmen" : ""}</span></div>;
        })}
      </div>
      <p className="klein">{st.kapitel} von {MB_KAPITEL.length} Kapiteln bewertet · {st.fragen} von {fragen.length} Fragen beantwortet</p>
      {!!ausBew.length && <><h3>Aus dieser Bewertung</h3>
        <ul className="klein">{ausBew.map((e) => <li key={e.id}>{e.art === "ziel" ? "Ziel " + (e.daten.jahr || "") + ": " : "Massnahme: "}{e.titel}{e.daten.wer ? " · " + e.daten.wer : ""}{e.daten.termin ? " · bis " + qmDatum(e.daten.termin) : ""}: {statusVon(e.art, e.status).text}</li>)}</ul></>}
      {alt_ && <><h3>Frühere Eingaben</h3><div className="qm-spalten">{EINGABEN.concat(ERGEBNISSE).filter(([k]) => String(d[k] || "").trim()).map(([k, t, n]) =>
        <Text key={k} k={k} text={t} norm={n} d={d} frei={true} feld={() => {}} />)}</div></>}
    </div>
  );
}

function Text({ k, text, norm, d, frei, feld }) {
  return (
    <label className="qma-bew-feld" data-qmabewfeld={k}>
      <span>{text} <span className="klein">ISO {norm}</span></span>
      <textarea className="qm-eingabe" rows={3} defaultValue={d[k] || ""} readOnly={frei}
        onBlur={(e) => !frei && feld(k, e.currentTarget.value.trim())} />
    </label>);
}


