// =================================================================
//  HOFERTIME → Auswertung (seit 1.627.0, nur Admins; Wunsch Patrick
//  18. November 2026: „Auswertungen machen können“, „im App auswerten
//  mit graphischen Ansichten“, „Export ist gut“). Zeitraum Monat, Jahr
//  oder von–bis, Filter Abteilung und Person, Kennzahlen, Grafiken (Ist
//  je Person, Gleitzeit, Abwesenheiten je Art, Verlauf je Monat, je
//  Abteilung), Tabelle und Knopf Excel. Darunter der tägliche Excel-
//  Export in einen Ordner (src/teile/zeitExport.js). Rechnung in
//  src/daten/zeitAuswertung.js.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { Saeulen, Balken, Kennzahl } from "../../teile/Diagramm.jsx";
import { dauerText } from "../../daten/zeit.js";
import {
  auswertungLaden, auswertungRechnen, abteilungenVon, jeAbteilung, jeMonat, excelMachen, ABW_NAMEN, ABW_FARBEN,
} from "../../daten/zeitAuswertung.js";
import ExportKarte from "./ExportKarte.jsx";

const gemerkt = { art: "monat", bezug: null, von: "", bis: "", abteilung: "", person: "" };
const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const std = (min) => Math.round(min / 60) + " h";

function zeitraum(art, bezug, von, bis) {
  const b = alt.ausIso(bezug);
  if (art === "jahr") return { von: b.getFullYear() + "-01-01", bis: (b.getFullYear() + 1) + "-01-01", text: String(b.getFullYear()) };
  if (art === "frei") {
    const v = von || alt.isoDatum(new Date(b.getFullYear(), b.getMonth(), 1));
    const x = bis && bis >= v ? bis : v;
    return { von: v, bis: alt.plusTage(x, 1), text: alt.kurzDatum(v) + v.slice(0, 4) + " – " + alt.kurzDatum(x) + x.slice(0, 4) };
  }
  const v = new Date(b.getFullYear(), b.getMonth(), 1);
  return {
    von: alt.isoDatum(v), bis: alt.isoDatum(new Date(b.getFullYear(), b.getMonth() + 1, 1)),
    text: v.toLocaleDateString("de-CH", { month: "long", year: "numeric" }),
  };
}

export default function Auswertung({ auffrischen }) {
  const [art, setArt] = useState(gemerkt.art);
  const [bezug, setBezug] = useState(gemerkt.bezug || alt.isoDatum(new Date()));
  const [von, setVon] = useState(gemerkt.von);
  const [bis, setBis] = useState(gemerkt.bis);
  const [abteilung, setAbteilung] = useState(gemerkt.abteilung);
  const [person, setPerson] = useState(gemerkt.person);
  useEffect(() => { Object.assign(gemerkt, { art, bezug, von, bis, abteilung, person }); }, [art, bezug, von, bis, abteilung, person]);
  const z = zeitraum(art, bezug, von, bis);
  const { daten, fehler, laedt } = useDaten(() => auswertungLaden(z.von, z.bis), [z.von, z.bis, auffrischen]);
  const [exportLaeuft, setExportLaeuft] = useState(false);

  const schieben = (n) => {
    const b = alt.ausIso(bezug);
    setBezug(alt.isoDatum(art === "jahr" ? new Date(b.getFullYear() + n, 0, 1) : new Date(b.getFullYear(), b.getMonth() + n, 1)));
  };

  const kopf = (
    <div className="ze-leiste ze-aus-leiste">
      <div className="ze-umschalter">
        {[["monat", "Monat"], ["jahr", "Jahr"], ["frei", "Von–bis"]].map(([k, t]) => (
          <button key={k} className={"knopf knopf--klein" + (art === k ? " knopf--haupt" : "")} id={"ze-aus-" + k}
            onClick={() => setArt(k)}>{t}</button>))}
      </div>
      {art !== "frei"
        ? <div className="ze-blaettern">
          <button className="knopf knopf--klein" id="ze-aus-zurueck" onClick={() => schieben(-1)}>‹</button>
          <b id="ze-aus-zeitraum">{z.text}</b>
          <button className="knopf knopf--klein" id="ze-aus-vor" onClick={() => schieben(1)}>›</button>
        </div>
        : <div className="ze-blaettern">
          <input type="date" value={von || z.von} onChange={(e) => setVon(e.target.value)} id="ze-aus-von" />
          <span>bis</span>
          <input type="date" value={bis || alt.plusTage(z.bis, -1)} onChange={(e) => setBis(e.target.value)} id="ze-aus-bis" />
        </div>}
      <div className="ze-umschalter">
        <select value={abteilung} onChange={(e) => { setAbteilung(e.target.value); setPerson(""); }} id="ze-aus-abteilung">
          <option value="">Alle Abteilungen</option>
          {daten && !daten.fehlt && abteilungenVon(daten).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} id="ze-aus-person">
          <option value="">Alle Personen</option>
          {daten && !daten.fehlt && auswertungRechnen(daten, { abteilung }).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
    </div>);

  if (fehler && !daten) return <>{kopf}<div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></>;
  if (!daten) return <>{kopf}<div className="laedt">Wird geladen …</div></>;
  if (daten.fehlt) return <div className="karte karte--hinweis"><p>Die Zeiterfassung ist in der Datenbank noch nicht eingerichtet.</p></div>;

  const ergebnis = auswertungRechnen(daten, { abteilung, person });
  const mon = ergebnis.filter((r) => r.monatslohn);
  const summe = (l, k) => l.reduce((s, r) => s + (r[k] || 0), 0);
  const ist = summe(ergebnis, "ist"), soll = summe(mon, "soll");
  const istMon = summe(mon, "ist");
  const abwSumme = {};
  ergebnis.forEach((r) => Object.entries(r.abw).forEach(([k, v]) => { abwSumme[k] = (abwSumme[k] || 0) + v; }));
  const abwTage = Object.values(abwSumme).reduce((s, v) => s + v, 0);
  const krank = (abwSumme.krankheit || 0) + (abwSumme.unfall || 0);
  const monate = jeMonat(ergebnis);
  const abt = jeAbteilung(ergebnis);
  const arten = Object.keys(ABW_NAMEN).filter((k) => abwSumme[k]);

  async function excel() {
    setExportLaeuft(true);
    try {
      const blob = await excelMachen(ergebnis, daten.von, daten.bis);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "HOFERTIME Auswertung " + daten.von + " bis " + alt.plusTage(daten.bis, -1) + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (f) { alt.meldung("Excel ging nicht: " + alt.fehlertext(f), "fehler"); }
    setExportLaeuft(false);
  }

  // PDF „Tagessummen“, je Person eine Seite (seit 1.628.0)
  async function pdf() {
    setExportLaeuft(true);
    try {
      const ids = new Set(ergebnis.map((r) => r.id));
      const liste = daten.personen.filter((x) => ids.has(x.p.id)).map((x) => ({
        name: alt.personName(x.p), abteilung: x.einst && String(x.einst.abteilung || "").trim(),
        einst: x.einst, stempel: x.stempel, ferien: x.ferien, buchungen: x.buchungen,
      }));
      if (!liste.length) { alt.meldung("Keine Person im Zeitraum.", "warn"); setExportLaeuft(false); return; }
      const { tagessummenPdf } = await import("./tagessummen.js");
      await tagessummenPdf(liste, daten.von, daten.bis, daten.stufen);
    } catch (f) { alt.meldung("PDF ging nicht: " + alt.fehlertext(f), "fehler"); }
    setExportLaeuft(false);
  }

  return (
    <>
      {kopf}
      <div className="ze-aus-knoepfe">
        <span className="klein">{ergebnis.length} {ergebnis.length === 1 ? "Person" : "Personen"}{laedt ? " · wird aktualisiert …" : ""}</span>
        <button className="knopf knopf--klein knopf--haupt" id="ze-aus-excel" disabled={exportLaeuft} onClick={excel}>⬇ Excel</button>
        <button className="knopf knopf--klein" id="ze-aus-pdf" disabled={exportLaeuft} onClick={pdf}>⬇ PDF Tagessummen</button>
      </div>
      <section className="ze-aus-kennzahlen">
        <Kennzahl titel="Gearbeitet" wert={std(ist)} unter={ergebnis.length + " Personen"} id="ze-aus-ist" />
        <Kennzahl titel="Soll (Monatslohn)" wert={std(soll)} unter={"Ist " + std(istMon)} id="ze-aus-soll" />
        <Kennzahl titel="Differenz" wert={(istMon - soll >= 0 ? "+" : "") + dauerText(istMon - soll)} unter="Ist minus Soll" id="ze-aus-diff" />
        <Kennzahl titel="Abwesend" wert={abwTage + " Tage"} unter={"davon " + krank + " Krankheit/Unfall"} id="ze-aus-abw" />
      </section>

      <div className="ze-aus-raster">
        <section className="karte ze-aus-karte">
          <h3>Gearbeitet je Person</h3>
          <Balken id="ze-aus-g-ist" zeilen={ergebnis.slice().sort((a, b) => b.ist - a.ist).map((r) => ({
            key: r.id, label: r.name, unter: r.abteilung, wert: r.ist,
            text: std(r.ist) + (r.monatslohn ? " von " + std(r.soll) : ""),
          }))} />
        </section>
        <section className="karte ze-aus-karte">
          <h3>Gleitzeit-Saldo heute</h3>
          <Balken id="ze-aus-g-saldo" zeilen={mon.slice().sort((a, b) => (b.saldo || 0) - (a.saldo || 0)).map((r) => ({
            key: r.id, label: r.name, wert: Math.abs(r.saldo || 0),
            text: <span className={(r.saldo || 0) < 0 ? "ze-minus" : "ze-plus"}>{dauerText(r.saldo || 0)}</span>,
          }))} />
          <p className="klein">Länge = Betrag, rot = Minusstunden.</p>
        </section>
        {(art !== "monat" || monate.length > 1) && <section className="karte ze-aus-karte ze-aus-karte--breit">
          <h3>Verlauf je Monat</h3>
          <Saeulen id="ze-aus-g-monate" format={std} werte={monate.map((m) => ({
            key: m.monat, label: MONATE[Number(m.monat.slice(5, 7)) - 1], wert: m.ist / 1,
            tip: <><b>{MONATE[Number(m.monat.slice(5, 7)) - 1]} {m.monat.slice(0, 4)}</b><br />Ist {std(m.ist)} · Soll {std(m.soll)} · {m.abw} Tage abwesend</>,
          }))} />
        </section>}
        <section className="karte ze-aus-karte ze-aus-karte--breit">
          <h3>Abwesenheiten je Person</h3>
          {arten.length ? <>
            <div className="ze-aus-legende">{arten.map((k) => <span key={k}><i style={{ background: ABW_FARBEN[k] }} />{ABW_NAMEN[k]} {abwSumme[k]}</span>)}</div>
            <Saeulen id="ze-aus-g-abw" format={(n) => Math.round(n) + " T"} wertText={(n) => String(Math.round(n))}
              werte={ergebnis.filter((r) => Object.keys(r.abw).length).map((r) => ({
                key: r.id, label: r.name.split(" ")[0], wert: Object.values(r.abw).reduce((s, v) => s + v, 0),
                teile: arten.map((k) => ({ wert: r.abw[k] || 0, farbe: ABW_FARBEN[k], text: r.abw[k] ? String(r.abw[k]) : "" })),
                tip: <><b>{r.name}</b><br />{Object.entries(r.abw).map(([k, v]) => (ABW_NAMEN[k] || k) + " " + v).join(" · ")}</>,
              }))} />
          </> : <p className="klein dg-leer">Keine Abwesenheiten im Zeitraum.</p>}
        </section>
        {abt.length > 1 && <section className="karte ze-aus-karte">
          <h3>Je Abteilung</h3>
          <Balken id="ze-aus-g-abt" zeilen={abt.map((a) => ({
            key: a.abteilung, label: a.abteilung, unter: a.personen + (a.personen === 1 ? " Person" : " Personen"), wert: a.ist,
            text: std(a.ist) + (a.soll ? " · " + (a.ist - a.soll >= 0 ? "+" : "") + dauerText(a.ist - a.soll) : ""),
          }))} waehlen={(k) => setAbteilung(k)} />
        </section>}
      </div>

      <section className="karte ze-aus-tabelle-karte">
        <div className="ze-aus-tabelle-huelle">
          <table className="ze-aus-tabelle" id="ze-aus-tabelle">
            <thead><tr>
              <th>Person</th><th>Abteilung</th><th className="ze-zahl">Ist</th><th className="ze-zahl">Soll</th><th className="ze-zahl">Diff.</th>
              <th className="ze-zahl">Gleitzeit</th><th className="ze-zahl">Ferien Rest {daten && ergebnis[0] ? ergebnis[0].ferienJahr : ""}</th>
              {arten.map((k) => <th key={k} className="ze-zahl">{ABW_NAMEN[k]}</th>)}
            </tr></thead>
            <tbody>{ergebnis.map((r) => (
              <tr key={r.id} data-ze-aus-person={r.id}>
                <td><b>{r.name}</b></td><td className="klein">{r.abteilung}</td>
                <td className="ze-zahl">{dauerText(r.ist)}</td>
                <td className="ze-zahl">{r.monatslohn ? dauerText(r.soll) : "–"}</td>
                <td className={"ze-zahl " + (r.diff < 0 ? "ze-minus" : "ze-plus")}>{r.monatslohn ? dauerText(r.diff) : ""}</td>
                <td className={"ze-zahl " + (r.saldo < 0 ? "ze-minus" : "ze-plus")}>{r.saldo !== null ? dauerText(r.saldo) : ""}</td>
                <td className="ze-zahl">{alt.zahlText(r.ferien.rest)}</td>
                {arten.map((k) => <td key={k} className="ze-zahl">{r.abw[k] || ""}</td>)}
              </tr>))}</tbody>
          </table>
        </div>
        <p className="klein">Soll zählt bis gestern, ab Beginn der Erfassung (Saldo-Start im Profil, sonst erste Stempelung). Abwesenheiten in Arbeitstagen, aus der Planwand. Gleitzeit und Ferien-Rest stehen auf heute.
          Die Abteilung setzt du im Profil der Person.</p>
      </section>
      <ExportKarte />
    </>
  );
}
