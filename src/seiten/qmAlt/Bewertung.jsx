// =================================================================
//  QM alternativ: Managementbewertung (ISO 9.3), einmal im Jahr.
//  Die Zahlen aus Abweichungen, Zielen, Audits, Lieferanten, Risiken,
//  Prüfmitteln und Schulungen kommen von selbst (jahresBild). Man
//  schreibt nur noch die Bewertung dazu. „Freigeben“ friert die Zahlen
//  ein (daten.schnapp) und sperrt das Blatt in der App.
//  Eintrag in qma_eintraege mit art "bewertung".
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { jahresBild, eintragSpeichern, eintragLoeschen, ARTEN, statusVon, heute } from "../../daten/qmAlt.js";
import { blattDrucken, absatz } from "./drucken.js";
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
const QUELLEN = { kunde: "Kunde", lieferant: "Lieferant", intern: "intern", audit: "Audit", idee: "Idee", risiko: "Risiko", bewertung: "Bewertung" };

export default function Bewertung({ daten, neu, eintragDialog }) {
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
        : <Blatt key={b.id} b={b} daten={daten} neu={neu} eintragDialog={eintragDialog} />}
    </section>
  );
}

function Blatt({ b, daten, neu, eintragDialog }) {
  const frei = b.status === "freigegeben";
  const d = b.daten;
  const bild = frei && d.schnapp ? d.schnapp : jahresBild(daten.eintraege, d.jahr);
  // Massnahmen aus früheren Bewertungen, die noch nicht abgeschlossen sind
  const frueher = daten.eintraege.filter((e) => e.art === "abweichung" && e.daten.quelle === "bewertung" && e.daten.herkunft !== b.id
    && String(e.daten.datum || e.erstellt_am || "").slice(0, 4) <= String(d.jahr));
  const ausBew = daten.eintraege.filter((e) => e.art === "abweichung" && e.daten.herkunft === b.id);

  async function feld(k, wert) {
    if ((d[k] || "") === wert) return;
    try { await eintragSpeichern("bewertung", b, { ...d, [k]: wert || null }, b.status, daten.eintraege); neu(); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function freigeben() {
    const ok = await alt.nachfragen({ titel: "Bewertung " + d.jahr + " freigeben",
      text: "Die Zahlen werden eingefroren und das Blatt ist danach nur noch zum Lesen.", bestaetigen: "Freigeben" });
    if (!ok) return;
    const p = alt.profil || {};
    try {
      await eintragSpeichern("bewertung", b, { ...d, schnapp: jahresBild(daten.eintraege, d.jahr), freigegeben_am: new Date().toISOString(),
        freigegeben_von: p.full_name || "" }, "freigegeben", daten.eintraege);
      alt.meldung("Freigegeben.", "gut"); neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function oeffnen() {
    const ok = await alt.nachfragen({ titel: "Wieder bearbeiten", text: "Die Freigabe wird aufgehoben, die Zahlen rechnen wieder neu.", bestaetigen: "Wieder bearbeiten" });
    if (!ok) return;
    const { schnapp, freigegeben_am, freigegeben_von, ...rest } = d;
    try { await eintragSpeichern("bewertung", b, rest, "entwurf", daten.eintraege); neu(); }
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
        <Schild ton={frei ? "gruen" : "gelb"} id="qma-bew-status">{frei ? "freigegeben " + alt.kurzDatum(String(d.freigegeben_am || "").slice(0, 10)) + (d.freigegeben_von ? " · " + d.freigegeben_von : "") : "Entwurf"}</Schild>
        <div className="qm-bew-knoepfe">
          <button className="knopf" onClick={() => bewertungDrucken(b, bild, frueher, ausBew)}>Drucken / PDF</button>
          {!frei && <button className="knopf" id="qma-bew-massnahme" onClick={() => eintragDialog("abweichung", null, daten.eintraege, neu,
            { quelle: "bewertung", _extra: { herkunft: b.id } })}>+ Massnahme</button>}
          {frei ? <button className="knopf" onClick={oeffnen}>Wieder bearbeiten</button>
            : <button className="knopf knopf--haupt" id="qma-bew-freigeben" onClick={freigeben}>Freigeben</button>}
          {!frei && <button className="chipweg" title="löschen" onClick={weg}>×</button>}
        </div>
      </div>
      <div className="qm-raster">
        <label className="qma-bew-feld"><span>Datum</span>
          <input type="date" className="qm-eingabe" defaultValue={d.datum || ""} readOnly={frei} onBlur={(e) => !frei && feld("datum", e.currentTarget.value)} /></label>
        <label className="qma-bew-feld"><span>Teilnehmer</span>
          <input className="qm-eingabe" defaultValue={d.teilnehmer || ""} readOnly={frei} onBlur={(e) => !frei && feld("teilnehmer", e.currentTarget.value.trim())} /></label>
      </div>

      <h3>Aus dem QM von selbst {frei ? "(eingefroren)" : ""}</h3>
      <div className="qma-zahlen" id="qma-bew-zahlen">
        <Zahl t="Abweichungen" w={bild.abweichungen} z={Object.entries(bild.jeQuelle || {}).map(([q, n]) => n + " " + (QUELLEN[q] || q)).join(", ")} />
        <Zahl t="davon wirksam erledigt" w={bild.wirksam} z={bild.kosten ? "Fehlerkosten ca. CHF " + alt.zahlText(Math.round(bild.kosten)) : ""} />
        <Zahl t="Verbesserungsideen" w={bild.ideen} />
        <Zahl t="Ziele erreicht" w={bild.zieleErreicht + " / " + bild.ziele} z={bild.zieleVerfehlt ? bild.zieleVerfehlt + " verfehlt" : ""} />
        <Zahl t="Audits durchgeführt" w={bild.audits} z={bild.feststellungen + " Feststellungen"} />
        <Zahl t="Lieferanten bewertet" w={bild.lieferantenBewertet + " / " + bild.lieferanten} z={"A " + bild.noten.A + " · B " + bild.noten.B + " · C " + bild.noten.C} />
        <Zahl t="Risiken hoch" w={bild.risikenHoch} z={bild.risiken + " Einträge, " + bild.chancen + " Chancen"} />
        <Zahl t="Prüfmittel überfällig" w={bild.pruefmittelFaellig} z={"von " + bild.pruefmittel} />
        <Zahl t="Schulungen" w={bild.schulungen} />
      </div>
      {!!(bild.zieleListe || []).length && <ul className="klein">{bild.zieleListe.map((z) =>
        <li key={z.id}>{z.titel}: {statusVon("ziel", z.status).text}{z.daten.ist ? " (Ist " + z.daten.ist + ")" : ""}</li>)}</ul>}

      <h3>Massnahmen aus früheren Bewertungen <span className="klein">ISO 9.3.2 a</span></h3>
      {!frueher.length ? <p className="klein">Keine.</p>
        : <ul className="klein">{frueher.map((e) => <li key={e.id}>{e.titel}: {statusVon("abweichung", e.status).text}</li>)}</ul>}

      <h3>Bewertung</h3>
      <div className="qm-spalten">{EINGABEN.map(([k, t, n]) => <Text key={k} k={k} text={t} norm={n} d={d} frei={frei} feld={feld} />)}</div>
      <h3>Ergebnis</h3>
      <div className="qm-spalten">{ERGEBNISSE.map(([k, t, n]) => <Text key={k} k={k} text={t} norm={n} d={d} frei={frei} feld={feld} />)}</div>
      {!!ausBew.length && <><h3>Beschlossene Massnahmen</h3>
        <ul className="klein">{ausBew.map((e) => <li key={e.id}>{e.titel}{e.daten.wer ? " · " + e.daten.wer : ""}{e.daten.termin ? " · bis " + alt.kurzDatum(e.daten.termin) : ""}: {statusVon("abweichung", e.status).text}</li>)}</ul></>}
      <p className="klein">Massnahmen aus der Bewertung landen in der Liste {ARTEN.abweichung.titel} und werden dort verfolgt.</p>
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

function Zahl({ t, w, z }) {
  return <div className="qma-zahl"><span className="klein">{t}</span><b>{w}</b>{z ? <span className="klein">{z}</span> : null}</div>;
}

function bewertungDrucken(b, bild, frueher, ausBew) {
  const e = alt.esc;
  const d = b.daten;
  let h = `<h1>Managementbewertung ${e(d.jahr)}</h1><div class="kopf">Hofer + Co · ISO 9001 Kapitel 9.3 · Datum ${e(d.datum ? alt.kurzDatum(d.datum) : "–")} · Teilnehmer ${e(d.teilnehmer || "–")}
    · ${b.status === "freigegeben" ? "freigegeben " + e(alt.kurzDatum(String(d.freigegeben_am || "").slice(0, 10))) + " " + e(d.freigegeben_von || "") : "Entwurf"}</div>`;
  h += `<h2>Zahlen aus dem QM</h2><table>
    <tr><td>Abweichungen</td><td>${bild.abweichungen} (${e(Object.entries(bild.jeQuelle || {}).map(([q, n]) => n + " " + (QUELLEN[q] || q)).join(", ") || "–")}), davon ${bild.wirksam} wirksam erledigt</td></tr>
    <tr><td>Verbesserungsideen</td><td>${bild.ideen}</td></tr>
    <tr><td>Ziele</td><td>${bild.zieleErreicht} von ${bild.ziele} erreicht, ${bild.zieleVerfehlt} verfehlt</td></tr>
    <tr><td>Audits</td><td>${bild.audits} durchgeführt, ${bild.feststellungen} Feststellungen</td></tr>
    <tr><td>Lieferanten</td><td>${bild.lieferantenBewertet} von ${bild.lieferanten} bewertet · A ${bild.noten.A} · B ${bild.noten.B} · C ${bild.noten.C}</td></tr>
    <tr><td>Risiken und Chancen</td><td>${bild.risiken} Einträge, ${bild.risikenHoch} hoch, ${bild.chancen} Chancen</td></tr>
    <tr><td>Prüfmittel</td><td>${bild.pruefmittel}, davon ${bild.pruefmittelFaellig} überfällig</td></tr>
    <tr><td>Schulungen</td><td>${bild.schulungen}</td></tr></table>`;
  h += `<h2>Massnahmen aus früheren Bewertungen</h2>${frueher.length ? "<ul>" + frueher.map((x) => `<li>${e(x.titel)}: ${e(statusVon("abweichung", x.status).text)}</li>`).join("") + "</ul>" : absatz("Keine.")}`;
  h += `<h2>Bewertung</h2>`;
  for (const [k, t, n] of EINGABEN) h += `<h3>${e(t)} <span class="norm">${e(n)}</span></h3>${absatz(d[k])}`;
  h += `<h2>Ergebnis</h2>`;
  for (const [k, t, n] of ERGEBNISSE) h += `<h3>${e(t)} <span class="norm">${e(n)}</span></h3>${absatz(d[k])}`;
  if (ausBew.length) h += `<h2>Beschlossene Massnahmen</h2><table><tr><th>Massnahme</th><th>Wer</th><th>Bis</th><th>Status</th></tr>`
    + ausBew.map((x) => `<tr><td>${e(x.titel)}</td><td>${e(x.daten.wer || "")}</td><td>${e(x.daten.termin ? alt.kurzDatum(x.daten.termin) : "")}</td><td>${e(statusVon("abweichung", x.status).text)}</td></tr>`).join("") + `</table>`;
  blattDrucken("Managementbewertung " + d.jahr, h);
}
