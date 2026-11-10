// =================================================================
//  QM → Managementbewertung (seit 1.460.0, Etappe 2, Wunsch Patrick
//  10. November 2026)
//
//  Liste der Bewertungen je Jahr, darin das Formular im Aufbau der
//  bisherigen Word-Vorlage. Eingaben speichern von selbst kurz nach dem
//  Tippen. Kennzahlen kommen von selbst (Wirtschaftszahlen, Messgrössen,
//  Produktion, Solar, KVP), die Tabellen mit Massnahmen sind der KVP
//  selbst. „Freigeben“ friert alles ein, danach nur noch neue Fassung.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten, useGemerkt } from "../../bruecke.jsx";
import { teilMerken } from "../../teile/wiederherstellen.js";
import { zahlZeigen, statusText } from "../../daten/qm.js";
import {
  LEISTUNG, RUECKMELDUNGEN, NK, AUDITS, AUTO_ZEILEN,
  bewertungenLaden, bewertungSpeichern, bewertungAnlegen, neueFassung, bewertungLoeschen, freigeben,
  inhaltVoll, kennzahlenLaden, ansichtRechnen, erreichtText, datumVoll,
} from "../../daten/qmBewertung.js";

const gemerkt = { id: null };
teilMerken("qmbewertung", () => ({ ...gemerkt }), (x) => { Object.assign(gemerkt, x); });

const DIESES_JAHR = new Date().getFullYear();

export default function Bewertung({ daten, neu, massnahmeDialog }) {
  const [id, setId] = useState(gemerkt.id);
  useGemerkt(gemerkt, { id });
  const [stand, setStand] = useState(0);
  const liste = useDaten(bewertungenLaden, [stand]);
  const neuLaden = () => setStand((x) => x + 1);

  if (liste.fehler && !liste.daten) {
    const fehlt = /qm_bewertungen|does not exist|schema cache/i.test(String(liste.fehler.message || liste.fehler));
    return <div className="karte karte--fehler"><p>{fehlt
      ? "Der Managementbewertung fehlt noch sql/qm-bewertung.sql in Supabase." : alt.fehlertext(liste.fehler)}</p></div>;
  }
  if (!liste.daten) return <div className="laedt">Wird geladen …</div>;
  const alle = liste.daten;
  const b = id && alle.find((x) => x.id === id);
  if (b) {
    return <Formular key={b.id + ":" + b.status} b={b} alle={alle} daten={daten} neu={neu} massnahmeDialog={massnahmeDialog}
      zurueck={() => setId(null)} oeffnen={(x) => { setId(x); neuLaden(); }} neuLaden={neuLaden} />;
  }

  async function anlegen() {
    const vorschlag = alle.length ? Math.max(...alle.map((x) => x.jahr)) + 1 : DIESES_JAHR;
    const w = await alt.dialogFelder({ titel: "Neue Managementbewertung",
      felder: [{ name: "jahr", label: "Für das Jahr", wert: String(vorschlag), pflicht: true }], bestaetigen: "Anlegen" });
    if (!w) return;
    const jahr = Number(String(w.jahr).trim());
    if (!(jahr > 2000 && jahr < 2100)) { alt.meldung("Bitte ein Jahr wie " + DIESES_JAHR + " eintippen.", "warn"); return; }
    try { const nid = await bewertungAnlegen(jahr, alle); setId(nid); neuLaden(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }

  return (
    <section className="karte" id="qm-bewertungen">
      <div className="karte__kopf">
        <h2>Managementbewertung</h2>
        <button className="knopf knopf--haupt" id="qm-neue-bewertung" onClick={anlegen}>+ Neue Bewertung</button>
      </div>
      <p className="hinweis">Einmal im Jahr durch die Geschäftsleitung (ISO 9001, 9.3). Kennzahlen und Massnahmen kommen von selbst aus dem QM. Nach „Freigeben“ ist die Bewertung fest, Änderungen nur als neue Fassung.</p>
      {!alle.length ? <p className="hinweis" id="qm-bewertung-leer">Noch keine Bewertung.</p>
        : <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle">
          <thead><tr><th>Jahr</th><th>Fassung</th><th>Stand</th><th>Zuletzt</th></tr></thead>
          <tbody>
            {alle.map((x) => {
              const ersetzt = alle.some((y) => y.jahr === x.jahr && y.fassung > x.fassung);
              return (
                <tr key={x.id} className="qm-zeile" data-bewertung={x.id} onClick={() => setId(x.id)}>
                  <td><b>{x.jahr}</b></td>
                  <td>{x.fassung}{ersetzt ? <span className="klein"> (ersetzt)</span> : null}</td>
                  <td><BewStatus b={x} /></td>
                  <td>{alt.datumZeitKurz(x.geaendert_am)}</td>
                </tr>);
            })}
          </tbody>
        </table></div>}
    </section>
  );
}

function BewStatus({ b }) {
  if (b.status === "freigegeben") {
    return <span className="qm-status qm-status--wirksam" data-bewstatus="freigegeben">
      Freigegeben {b.freigegeben_am ? datumVoll(b.freigegeben_am) : ""}{b.freigegeben_name ? " · " + b.freigegeben_name : ""}</span>;
  }
  return <span className="qm-status qm-status--laeuft" data-bewstatus="entwurf">Entwurf</span>;
}

// Wert an einem Pfad wie "verlauf.positiv" setzen, ohne das Alte zu ändern
function mitWert(obj, pfad, wert) {
  const teile = pfad.split(".");
  const kopie = { ...obj };
  let z = kopie;
  for (let i = 0; i < teile.length - 1; i++) { z[teile[i]] = { ...(z[teile[i]] || {}) }; z = z[teile[i]]; }
  z[teile[teile.length - 1]] = wert;
  return kopie;
}
const lesen = (obj, pfad) => pfad.split(".").reduce((z, k) => (z == null ? z : z[k]), obj);

function Formular({ b, alle, daten, neu, massnahmeDialog, zurueck, oeffnen, neuLaden }) {
  const gesperrt = b.status === "freigegeben";
  const [inhalt, setInhalt] = useState(() => inhaltVoll(b.inhalt));
  const [auto, setAuto] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const offen = useRef(null);
  const letzter = useRef(inhalt);

  // Speichern 800 ms nach der letzten Eingabe, beim Verlassen sofort
  const sichern = async () => {
    if (!offen.current) return;
    clearTimeout(offen.current); offen.current = null;
    try { await bewertungSpeichern(b, letzter.current); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  useEffect(() => () => { sichern(); }, []);
  const setze = (pfad, wert) => {
    if (gesperrt) return;
    setInhalt((alt0) => {
      const n = mitWert(alt0, pfad, wert);
      letzter.current = n;
      clearTimeout(offen.current);
      offen.current = setTimeout(sichern, 800);
      return n;
    });
  };

  useEffect(() => {
    if (gesperrt) return;
    let weg = false;
    kennzahlenLaden(b.von || b.jahr + "-01-01", b.bis || b.jahr + "-12-31", daten.massnahmen)
      .then((a) => { if (!weg) setAuto(a); })
      .catch((f) => { if (!weg) setAuto({ werte: {}, hinweise: [alt.fehlertext(f)] }); });
    return () => { weg = true; };
  }, [b.id, daten]);

  const ansicht = gesperrt ? (inhalt.schnapp || ansichtRechnen(b.jahr, daten, null)) : ansichtRechnen(b.jahr, daten, auto);
  const J = b.jahr;
  const quelle = "Managementbewertung " + J;
  const ersetzt = alle.find((y) => y.jahr === b.jahr && y.fassung > b.fassung);

  const feld = (pfad, props = {}) => <Feld wert={lesen(inhalt, pfad) || ""} setzen={(w) => setze(pfad, w)}
    gesperrt={gesperrt} name={pfad} {...props} />;
  const janein = (pfad) => <JaNein wert={lesen(inhalt, pfad) || ""} setzen={(w) => setze(pfad, w)} gesperrt={gesperrt} name={pfad} />;

  const neueMassnahme = (abschnitt, vorgabe = {}) => massnahmeDialog(null, daten.messgroessen, neu, daten.massnahmen,
    { quelle, periode: J, abschnitt, termin: J + "-12-31", ...vorgabe });
  const oeffneMassnahme = (m) => {
    if (gesperrt) return;
    const voll = daten.massnahmen.find((x) => x.id === m.id);
    if (voll) massnahmeDialog(voll, daten.messgroessen, neu, daten.massnahmen);
  };

  async function zeitraum(feldName, wert) {
    if (gesperrt || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return;
    const r = await alt.db.from("qm_bewertungen").update({ [feldName]: wert }).eq("id", b.id);
    if (r.error) alt.meldung(alt.fehlertext(r.error), "fehler"); else neuLaden();
  }

  async function freigabe() {
    await sichern();
    const ok = await alt.nachfragen({ titel: "Bewertung " + J + " freigeben",
      text: "Kennzahlen und Massnahmen werden so eingefroren, wie sie jetzt stehen. Danach lässt sich nichts mehr ändern, nur noch eine neue Fassung anlegen.",
      bestaetigen: "Freigeben" });
    if (!ok) return;
    try { await freigeben(b, letzter.current, ansichtRechnen(J, daten, auto)); alt.meldung("Freigegeben.", "gut"); neuLaden(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }

  async function fassung() {
    try { const nid = await neueFassung(b, alle); alt.meldung("Neue Fassung angelegt.", "gut"); oeffnen(nid); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }

  async function loeschen() {
    const ok = await alt.nachfragen({ titel: "Entwurf löschen", text: "Die Bewertung " + J + " (Fassung " + b.fassung
      + ") verschwindet. Die KVP-Massnahmen bleiben.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    clearTimeout(offen.current); offen.current = null;
    try { await bewertungLoeschen(b); zurueck(); neuLaden(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }

  async function pdf() {
    await sichern();
    setLaeuft(true);
    try {
      const { bewertungPdf } = await import("./bewertungPdf.js");
      const blob = await bewertungPdf(b, letzter.current, ansicht);
      alt.betrachter(URL.createObjectURL(blob), J + "_Ho-Co_Managementbewertung", true);
    } catch (f) { alt.fehlerMerken("QM-PDF", alt.fehlertext(f)); alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  }

  return (
    <div id="qm-bewertung" data-jahr={J} data-gesperrt={gesperrt ? "ja" : "nein"} className={gesperrt ? "qm-gesperrt" : ""}>
      <div className="qm-bew-kopf">
        <button className="knopf knopf--klein" id="qm-bew-zurueck" onClick={zurueck}>← Alle Bewertungen</button>
        <h2>Managementbewertung {J} <span className="klein">Fassung {b.fassung}</span></h2>
        <BewStatus b={b} />
        <span className="qm-bew-knoepfe">
          <button className="knopf" id="qm-bew-pdf" disabled={laeuft} onClick={pdf}>{laeuft ? "PDF wird erstellt …" : "PDF"}</button>
          {!gesperrt && <button className="knopf knopf--haupt" id="qm-bew-freigeben" onClick={freigabe}>Freigeben</button>}
          {gesperrt && !ersetzt && <button className="knopf" id="qm-bew-fassung" onClick={fassung}>Neue Fassung</button>}
          {!gesperrt && <button className="knopf" id="qm-bew-loeschen" onClick={loeschen}>Löschen</button>}
        </span>
      </div>
      {gesperrt && <p className="hinweis">Freigegeben und eingefroren{ersetzt ? ", ersetzt durch Fassung " + ersetzt.fassung : ""}. Zum Ändern „Neue Fassung“.</p>}

      <section className="karte">
        <h3>Organisation und Freigabe</h3>
        <div className="qm-raster">
          <label>Organisation{feld("kopf.organisation")}</label>
          <label>Ort{feld("kopf.ort")}</label>
          <label>Geschäftsleitung{feld("kopf.gl", { zeilen: 3, platzhalter: "ein Name je Zeile" })}</label>
          <label>Norm{feld("kopf.norm")}</label>
          <label>Bewertungszeitraum von<input type="date" className="qm-eingabe" defaultValue={b.von || ""} disabled={gesperrt}
            data-qmbew="von" onChange={(e) => zeitraum("von", e.target.value)} /></label>
          <label>bis<input type="date" className="qm-eingabe" defaultValue={b.bis || ""} disabled={gesperrt}
            data-qmbew="bis" onChange={(e) => zeitraum("bis", e.target.value)} /></label>
          <label>CEO{feld("kopf.ceo")}</label>
          <label>Ort / Datum{feld("kopf.ceo_datum", { platzhalter: "Lohn, den …" })}</label>
          <label>Ersteller{feld("kopf.ersteller")}</label>
          <label>Ort / Datum{feld("kopf.ersteller_datum", { platzhalter: "Lohn, den …" })}</label>
        </div>
      </section>

      <section className="karte">
        <h3>Allgemeiner Geschäftsverlauf</h3>
        <p className="hinweis">Ein Punkt je Zeile. Massnahmen daraus gehören in die Jahresziele unten.</p>
        <label>Allgemeine Ereignisse{feld("verlauf.allgemein", { zeilen: 6 })}</label>
        {ansicht.wirtschaft.zeilen.length > 0 && <Wirtschaft w={ansicht.wirtschaft} />}
        <label>Positive Ereignisse / Entwicklungen{feld("verlauf.positiv", { zeilen: 6 })}</label>
        <label>Negative Ereignisse / Entwicklungen{feld("verlauf.negativ", { zeilen: 3 })}</label>
        <label>Fazit / Erkenntnisse{feld("verlauf.fazit", { zeilen: 3 })}</label>
      </section>

      <MassnahmenKarte titel="Status von vorangegangener Bewertungs-Periode" art="status" liste={ansicht.massnahmen.status}
        hinweis={"Alles aus früheren Perioden, das zu Beginn von " + J + " noch nicht abgeschlossen war."}
        gesperrt={gesperrt} neu={() => neueMassnahme("status")} oeffnen={oeffneMassnahme} />
      <MassnahmenKarte titel="Veränderungen, die sich auf das Qualitätsmanagementsystem auswirken" art="veraenderung"
        liste={ansicht.massnahmen.veraenderung} gesperrt={gesperrt} neu={() => neueMassnahme("veraenderung")} oeffnen={oeffneMassnahme} />

      <section className="karte">
        <h3>Rückmeldungen von Kunden und relevanten Parteien</h3>
        <div className="qm-spalten">
          {RUECKMELDUNGEN.map(([k, t]) => (
            <div key={k} className="qm-spalte" data-qmteil={"rm-" + k}>
              <h4>{t}</h4>
              <div className="qm-drei">
                <label>Anzahl{feld("rueckmeldungen." + k + ".anzahl", { kurz: true })}</label>
                <label>positiv{feld("rueckmeldungen." + k + ".positiv", { kurz: true })}</label>
                <label>negativ{feld("rueckmeldungen." + k + ".negativ", { kurz: true })}</label>
              </div>
              <label>Art der Rückmeldung{feld("rueckmeldungen." + k + ".art", { zeilen: 3 })}</label>
              <label>Massnahmen?{janein("rueckmeldungen." + k + ".massnahmen")}</label>
              <label>Bemerkung{feld("rueckmeldungen." + k + ".bemerkung", { zeilen: 2 })}</label>
            </div>))}
        </div>
      </section>

      <section className="karte">
        <h3>Leistung und Wirksamkeit des Qualitätsmanagementsystems</h3>
        <Kennzahlen liste={ansicht.kennzahlen} jahr={J} gesperrt={gesperrt}
          massnahme={(k) => neueMassnahme("jahresziel", { thema: k.name, messgroesse_id: k.id,
            ziel: k.ziel != null ? (k.richtung === "tief" ? "≤ " : "≥ ") + zahlZeigen(k.ziel, k.einheit) + " " + (k.einheit || "") : "",
            ist: zahlZeigen(k.ist, k.einheit) + " " + (k.einheit || "") })} />
        <AutoTabelle auto={ansicht.auto} laedt={!gesperrt && !auto} />
        {LEISTUNG.map(([k, t, h]) => (
          <div key={k} className="qm-thema" data-qmteil={"leistung-" + k}>
            <div className="qm-thema__kopf"><b>{t}</b>{h && <span className="klein"> {h}</span>}
              <span className="qm-thema__jn">Massnahmen? {janein("leistung." + k + ".massnahmen")}</span></div>
            {feld("leistung." + k + ".text", { zeilen: 3 })}
          </div>))}
      </section>

      <MassnahmenKarte titel="Neue Jahresziele / Verbesserung" art="jahresziel" liste={ansicht.massnahmen.jahresziel}
        gesperrt={gesperrt} neu={() => neueMassnahme("jahresziel")} oeffnen={oeffneMassnahme} />

      <section className="karte">
        <h3>Nichtkonformität und Korrekturmassnahmen</h3>
        <div className="qm-spalten">
          {NK.map(([k, t]) => (
            <div key={k} className="qm-spalte" data-qmteil={"nk-" + k}>
              <h4>{t}</h4>
              <div className="qm-drei qm-vier">
                <label>Total{feld("nk." + k + ".total", { kurz: true })}</label>
                <label>In Arbeit{feld("nk." + k + ".arbeit", { kurz: true })}</label>
                <label>Erledigt{feld("nk." + k + ".erledigt", { kurz: true })}</label>
                <label>Offen{feld("nk." + k + ".offen", { kurz: true })}</label>
              </div>
              <label>Kosten{feld("nk." + k + ".kosten", { kurz: true, platzhalter: "N/A" })}</label>
              <label>Massnahmen gefordert?{janein("nk." + k + ".massnahmen")}</label>
              <label>Bemerkung{feld("nk." + k + ".bemerkung", { zeilen: 3 })}</label>
            </div>))}
        </div>
      </section>

      <section className="karte">
        <h3>Ergebnisse aus Audits</h3>
        <div className="qm-spalten qm-spalten--vier">
          {AUDITS.map(([k, t]) => (
            <div key={k} className="qm-spalte" data-qmteil={"audit-" + k}>
              <h4>{t}</h4>
              <div className="qm-drei">
                <label>geplant{feld("audits." + k + ".geplant", { kurz: true })}</label>
                <label>realisiert{feld("audits." + k + ".realisiert", { kurz: true })}</label>
                <label>kritisch{feld("audits." + k + ".kritisch", { kurz: true })}</label>
                <label>Feststellungen{feld("audits." + k + ".feststellungen", { kurz: true })}</label>
                <label>erledigt{feld("audits." + k + ".erledigt", { kurz: true })}</label>
              </div>
              <label>Ziel erreicht?{janein("audits." + k + ".erreicht")}</label>
              <label>Massnahmen?{janein("audits." + k + ".massnahmen")}</label>
              <label>Bemerkung{feld("audits." + k + ".bemerkung", { zeilen: 3 })}</label>
            </div>))}
        </div>
      </section>

      <section className="karte">
        <h3>Ergebnis der Bewertung</h3>
        <p className="hinweis">ISO 9001, 9.3.3. Was daraus zu tun ist, als Massnahme in die Jahresziele.</p>
        <label>Möglichkeiten zur Verbesserung{feld("ergebnis.verbesserung", { zeilen: 3 })}</label>
        <label>Änderungsbedarf am Qualitätsmanagementsystem{feld("ergebnis.aenderung", { zeilen: 3 })}</label>
        <label>Bedarf an Ressourcen{feld("ergebnis.ressourcen", { zeilen: 3 })}</label>
      </section>
    </div>
  );
}

// ---------- Felder ----------
function Feld({ wert, setzen, gesperrt, name, zeilen, kurz, platzhalter }) {
  if (zeilen) {
    return <textarea className="qm-eingabe" data-qmbew={name} rows={Math.max(zeilen, String(wert).split("\n").length)}
      value={wert} placeholder={platzhalter || ""} readOnly={gesperrt} onChange={(e) => setzen(e.target.value)} />;
  }
  return <input className={"qm-eingabe" + (kurz ? " qm-eingabe--kurz" : "")} data-qmbew={name} value={wert}
    placeholder={platzhalter || ""} readOnly={gesperrt} onChange={(e) => setzen(e.target.value)} />;
}

function JaNein({ wert, setzen, gesperrt, name }) {
  return (
    <span className="qm-jn" role="group" data-qmbew={name}>
      {[["nein", "Nein"], ["ja", "Ja"]].map(([w, t]) => (
        <button key={w} type="button" disabled={gesperrt && wert !== w}
          className={"knopf knopf--klein" + (wert === w ? " knopf--haupt" : "")} data-jn={w}
          onClick={() => !gesperrt && setzen(wert === w ? "" : w)}>{t}</button>))}
    </span>
  );
}

// ---------- Tabellen ----------
function Wirtschaft({ w }) {
  return (
    <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle qm-zahlen" id="qm-bew-wirtschaft">
      <thead><tr><th>Wirtschaftszahlen</th>{w.jahre.map((j) => <th key={j} className="qm-zahl">{j}</th>)}</tr></thead>
      <tbody>{w.zeilen.map((z) => (
        <tr key={z.k}><td>{z.text} <span className="klein">{z.einheit}</span></td>
          {z.werte.map((v, i) => <td key={i} className="qm-zahl">{zahlZeigen(v, z.einheit)}</td>)}</tr>))}</tbody>
    </table></div>
  );
}

function MassnahmenKarte({ titel, art, liste, hinweis, gesperrt, neu, oeffnen }) {
  return (
    <section className="karte" data-qmabschnitt={art}>
      <div className="karte__kopf">
        <h3>{titel}</h3>
        {!gesperrt && <button className="knopf knopf--klein" data-qmneu={art} onClick={neu}>+ Massnahme</button>}
      </div>
      <p className="hinweis">{hinweis ? hinweis + " " : ""}Die Zeilen sind KVP-Massnahmen; ändern hier oder im Reiter KVP-Massnahmen.</p>
      {!liste.length ? <p className="hinweis">Keine.</p>
        : <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle">
          <thead><tr><th>Nr.</th><th>Ziel / Massnahme</th><th>Beschreibung</th><th>Wer</th><th>Termin</th><th>Messgrösse</th><th>Ziel</th><th>Ist</th><th>Erreicht?</th></tr></thead>
          <tbody>{liste.map((m) => (
            <tr key={m.id} className={gesperrt ? "" : "qm-zeile"} data-bewmassnahme={m.id} onClick={() => oeffnen(m)}>
              <td>{m.nr}</td>
              <td><b>{m.thema}</b>{m.thema && m.massnahme ? <div>{m.massnahme}</div> : (m.massnahme || "")}</td>
              <td className="qm-umbruch klein">{m.beschreibung}</td>
              <td>{m.wer}</td>
              <td className="qm-nowrap">{m.termin ? datumVoll(m.termin) : ""}</td>
              <td>{m.messgroesse}</td>
              <td>{m.ziel}</td>
              <td>{m.ist}</td>
              <td><span className={"qm-status qm-status--" + m.status} title={statusText(m.status)}>{erreichtText(m.status)}</span></td>
            </tr>))}</tbody>
        </table></div>}
    </section>
  );
}

function Ampel({ farbe }) {
  return <span className={"qm-ampel qm-ampel--" + (farbe || "leer")} data-ampel={farbe || ""} />;
}

function Kennzahlen({ liste, jahr, gesperrt, massnahme }) {
  if (!liste.length) return <p className="hinweis">Keine Messgrössen eingeschaltet (Reiter Messgrössen).</p>;
  return (
    <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle" id="qm-bew-kennzahlen">
      <thead><tr><th>Messgrösse</th><th className="qm-zahl">Ziel</th><th className="qm-zahl">{jahr - 1}</th>
        <th className="qm-zahl">{jahr}</th><th>Trend</th><th /></tr></thead>
      <tbody>{liste.map((k) => (
        <tr key={k.id} data-bewkennzahl={k.id}>
          <td><b>{k.name}</b>{k.norm ? <span className="klein"> ISO {k.norm}</span> : null}</td>
          <td className="qm-zahl qm-nowrap">{k.ziel != null ? (k.richtung === "tief" ? "≤ " : "≥ ") + zahlZeigen(k.ziel, k.einheit) + " " + (k.einheit || "") : ""}</td>
          <td className="qm-zahl">{zahlZeigen(k.vorjahr, k.einheit)}</td>
          <td className="qm-zahl"><span className="qm-wert"><Ampel farbe={k.ampel} />
            <span data-bewist={k.id}>{zahlZeigen(k.ist, k.einheit)}</span></span></td>
          <td>{k.trend}</td>
          <td>{!gesperrt && (k.ampel === "rot" || k.ampel === "gelb") &&
            <button className="knopf knopf--klein" data-bewmgmassnahme={k.id} onClick={() => massnahme(k)}>→ Massnahme</button>}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

function AutoTabelle({ auto, laedt }) {
  if (laedt) return <p className="hinweis" id="qm-bew-auto-laedt">Kennzahlen aus dem HoferTool werden gerechnet …</p>;
  if (!auto) return null;
  const zeilen = AUTO_ZEILEN.filter(([k]) => auto.werte[k] != null);
  return (
    <div className="qm-auto" id="qm-bew-auto">
      <h4>Aus dem HoferTool {auto.statistikVon ? <span className="klein">Produktion {datumVoll(auto.statistikVon)} bis {datumVoll(auto.statistikBis)}</span> : null}</h4>
      {zeilen.length > 0 && <table className="tabelle qm-tabelle"><tbody>{zeilen.map(([k, t, e, h]) => (
        <tr key={k} data-bewauto={k}><td>{t}{h ? <span className="klein"> {h}</span> : null}</td>
          <td className="qm-zahl">{zahlZeigen(auto.werte[k], e)} <span className="klein">{e}</span></td></tr>))}</tbody></table>}
      {(auto.hinweise || []).map((h, i) => <p key={i} className="hinweis">{h}</p>)}
    </div>
  );
}
