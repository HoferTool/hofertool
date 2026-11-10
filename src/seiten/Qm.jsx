// =================================================================
//  QM (seit 1.458.0, Wunsch Patrick 10. November 2026: „neuer Reiter
//  QM, aktuell nur für Patrick Ruch“)
//
//  Sichtbar nur mit dem Vermerk qmSehen in profiles.einstellungen
//  (gesetzt bei Patrick, sql/qm-sehen.sql), nie für Externe. Auch die
//  Datenbank lässt nur diese Personen an die Tabellen (qm_darf()).
//
//  Seit 1.459.0 Etappe 1 (Patrick: QM nach ISO 9001 mit dem KVP im
//  Zentrum, alle dokumentierten Informationen fliessen in den KVP):
//    KVP-Massnahmen – die eine Massnahmenliste für das ganze QM-Tool
//    Messgrössen    – Katalog mit Ziel, Richtung und Ampel; was das Ziel
//                     verfehlt, wird mit einem Tipp eine Massnahme
//    Wirtschaftszahlen – Eingabe einmal im Jahr, gerechnet wird selbst
//  Die Managementbewertung (Etappe 2) baut darauf auf.
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { Reiter } from "../teile/Reiter.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import {
  EINGABEN, GERECHNET, SCHLUESSEL, QUELLEN, STATUS, VORSCHLAG_MESSGROESSEN,
  qmLaden, fehltQm, jahreRechnen, messwert, ampel, zahlLesen, zahlZeigen,
  jahreswertSetzen, statusText, quelleText, schluesselText, istOffen,
} from "../daten/qm.js";
import { ABSCHNITTE } from "../daten/qmBewertung.js";
import Bewertung from "./qm/Bewertung.jsx";

const REITER = [["kvp", "KVP-Massnahmen"], ["messgroessen", "Messgrössen"], ["zahlen", "Wirtschaftszahlen"],
  ["bewertung", "Managementbewertung"]];

const gemerkt = { reiter: "kvp", filter: "offen" };
teilMerken("qm", () => ({ ...gemerkt }), (x) => { Object.assign(gemerkt, x); });

const DIESES_JAHR = new Date().getFullYear();

export default function Qm({ auffrischen }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  useGemerkt(gemerkt, { reiter });
  const d = useDaten(qmLaden, [auffrischen]);

  useSeitenSuche({
    name: "QM", platzhalter: "Massnahme oder Messgrösse …",
    eintraege: () => [
      ...((d.daten && d.daten.massnahmen) || []).map((m) => ({
        gruppe: "KVP-Massnahmen", zeichen: "↻", titel: (m.nr ? m.nr + " · " : "") + (m.massnahme || "ohne Text"),
        zeile: [m.thema, m.wer, statusText(m.status)].filter(Boolean).join(" · "), id: m.id, art: "kvp" })),
      ...((d.daten && d.daten.messgroessen) || []).map((m) => ({
        gruppe: "Messgrössen", zeichen: "◎", titel: m.name, zeile: [m.einheit, quelleText(m.quelle)].filter(Boolean).join(" · "),
        id: m.id, art: "messgroessen" })),
    ],
    springen: (x) => {
      const m = x.art === "kvp" && d.daten.massnahmen.find((y) => y.id === x.id);
      setReiter(x.art);
      if (m) { gemerkt.filter = "alle"; massnahmeDialog(m, d.daten.messgroessen, d.neu); }
    },
  });

  let inhalt;
  if (d.fehler && !d.daten) {
    inhalt = <div className="karte karte--fehler"><p>{fehltQm(d.fehler)
      ? "Dem QM fehlen noch die Tabellen aus sql/qm-grundlage.sql in Supabase." : alt.fehlertext(d.fehler)}</p></div>;
  } else if (!d.daten) {
    inhalt = <div className="laedt">Wird geladen …</div>;
  } else {
    const gerechnet = jahreRechnen(d.daten.werte);
    if (reiter === "messgroessen") inhalt = <Messgroessen daten={d.daten} gerechnet={gerechnet} neu={d.neu} zuKvp={() => setReiter("kvp")} />;
    else if (reiter === "bewertung") inhalt = <Bewertung daten={d.daten} neu={d.neu} massnahmeDialog={massnahmeDialog} />;
    else if (reiter === "zahlen") inhalt = <Wirtschaftszahlen werte={d.daten.werte} gerechnet={gerechnet} neu={d.neu} />;
    else inhalt = <Massnahmen daten={d.daten} neu={d.neu} />;
  }

  return (<>
    <h1 className="seitentitel">QM</h1>
    <Reiter reiter={REITER} aktiv={reiter} waehlen={setReiter} merkmal="qmreiter" />
    <div id="qm-inhalt" data-qm={reiter}>{inhalt}</div>
  </>);
}

// ---------- Kleinteile ----------
function Ampel({ farbe, titel }) {
  if (!farbe) return <span className="qm-ampel qm-ampel--leer" title="kein Ziel oder kein Wert" />;
  return <span className={"qm-ampel qm-ampel--" + farbe} data-ampel={farbe}
    title={titel || { gruen: "Ziel erreicht", gelb: "Ziel knapp verfehlt", rot: "Ziel verfehlt" }[farbe]} />;
}

function StatusSchild({ s }) {
  return <span className={"qm-status qm-status--" + s} data-status={s}>{statusText(s)}</span>;
}

// ---------- KVP-Massnahmen ----------
const FILTER = [["offen", "Offen"], ["erledigt", "Wirksamkeit prüfen"], ["wirksam", "Wirksam"], ["alle", "Alle"]];

function Massnahmen({ daten, neu }) {
  const [filter, setFilter] = useState(gemerkt.filter);
  useGemerkt(gemerkt, { filter });
  const alle = daten.massnahmen;
  const zeigen = alle.filter((m) => filter === "alle" ? true
    : filter === "offen" ? istOffen(m) && m.status !== "erledigt"
    : m.status === filter);
  const heute = alt.isoDatum(new Date());
  const anzahl = (f) => alle.filter((m) => f === "alle" ? true
    : f === "offen" ? istOffen(m) && m.status !== "erledigt" : m.status === f).length;

  return (
    <section className="karte" id="qm-kvp">
      <div className="karte__kopf">
        <h2>KVP-Massnahmen</h2>
        <button className="knopf knopf--haupt" id="qm-neu-massnahme"
          onClick={() => massnahmeDialog(null, daten.messgroessen, neu, alle)}>+ Massnahme</button>
      </div>
      <p className="hinweis">Eine Liste für das ganze QM. Eine Massnahme ist erst fertig, wenn ihre Wirksamkeit geprüft ist.</p>
      <div className="qm-filter" role="group">
        {FILTER.map(([w, t]) => (
          <button key={w} className={"knopf knopf--klein" + (filter === w ? " knopf--haupt" : "")} data-qmfilter={w}
            onClick={() => setFilter(w)}>{t} <span className="klein">({anzahl(w)})</span></button>))}
      </div>
      {!zeigen.length
        ? <p className="hinweis" id="qm-kvp-leer">{alle.length ? "Hier steht gerade nichts." : "Noch keine Massnahme. Mit „+ Massnahme“ die erste erfassen."}</p>
        : <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle">
            <thead><tr><th>Nr.</th><th>Thema</th><th>Massnahme</th><th>Wer</th><th>Bis</th><th>Messgrösse</th><th>Status</th><th /></tr></thead>
            <tbody>
              {zeigen.map((m) => {
                const mg = daten.messgroessen.find((x) => x.id === m.messgroesse_id);
                const spaet = m.termin && m.termin < heute && istOffen(m) && m.status !== "erledigt";
                return (
                  <tr key={m.id} data-massnahme={m.id} className="qm-zeile"
                    onClick={() => massnahmeDialog(m, daten.messgroessen, neu, alle)}>
                    <td>{m.nr}</td>
                    <td>{m.thema}</td>
                    <td><b>{m.massnahme}</b>{m.beschreibung ? <div className="klein qm-umbruch">{m.beschreibung}</div> : null}
                      {m.quelle ? <div className="klein">Quelle: {m.quelle}</div> : null}</td>
                    <td>{m.wer}</td>
                    <td className={spaet ? "qm-spaet" : ""}>{m.termin ? alt.kurzDatum(m.termin) : ""}</td>
                    <td>{mg ? mg.name : ""}{m.ziel ? <div className="klein">Ziel {m.ziel}{m.ist ? " · Ist " + m.ist : ""}</div> : null}</td>
                    <td><StatusSchild s={m.status} /></td>
                    <td><button className="chipweg" title="löschen" data-massnahmeweg={m.id}
                      onClick={(e) => { e.stopPropagation(); massnahmeLoeschen(m, neu); }}>×</button></td>
                  </tr>);
              })}
            </tbody>
          </table></div>}
    </section>
  );
}

// vorgabe: Felder für eine neue Massnahme, etwa aus einer Messgrösse
export async function massnahmeDialog(m, messgroessen, neu, alle, vorgabe) {
  const v = m || vorgabe || {};
  const w = await alt.dialogFelder({
    titel: m ? "Massnahme " + (m.nr || "") : "Neue KVP-Massnahme",
    felder: [
      { name: "thema", label: "Thema", wert: v.thema || "", platzhalter: "Kundenzufriedenheit, Ausschuss, Lieferanten …" },
      { name: "massnahme", label: "Massnahme", pflicht: true, wert: v.massnahme || "" },
      { name: "beschreibung", label: "Beschreibung", typ: "textarea", zeilen: 3, wert: v.beschreibung || "" },
      { name: "wer", label: "Wer", wert: v.wer || "", platzhalter: "GL, PR, MB …" },
      { name: "termin", label: "Bis wann", typ: "date", wert: v.termin || "" },
      { name: "messgroesse_id", label: "Messgrösse", wert: v.messgroesse_id || "",
        auswahl: [["", "keine"], ...messgroessen.map((x) => [x.id, x.name + (x.einheit ? " (" + x.einheit + ")" : "")])] },
      { name: "ziel", label: "Ziel", wert: v.ziel || "", platzhalter: "etwa 75 % oder unter 3 Reklamationen" },
      { name: "ist", label: "Ist / erreicht", wert: v.ist || "" },
      { name: "status", label: "Status", auswahl: STATUS, wert: v.status || "offen" },
      { name: "wirksamkeit", label: "Wirksamkeit geprüft (wie, wann, Ergebnis)", typ: "textarea", zeilen: 2, wert: v.wirksamkeit || "" },
      { name: "quelle", label: "Quelle", wert: v.quelle || "",
        platzhalter: "Managementbewertung " + DIESES_JAHR + ", Audit, Reklamation …" },
      { name: "periode", label: "Periode (Jahr)", wert: v.periode != null ? String(v.periode) : String(DIESES_JAHR) },
      { name: "abschnitt", label: "Teil der Managementbewertung", auswahl: ABSCHNITTE, wert: v.abschnitt || "" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const daten = {
    thema: w.thema.trim() || null, massnahme: w.massnahme.trim(), beschreibung: w.beschreibung.trim() || null,
    wer: w.wer.trim() || null, termin: /^\d{4}-\d{2}-\d{2}$/.test(w.termin || "") ? w.termin : null,
    messgroesse_id: w.messgroesse_id || null, ziel: w.ziel.trim() || null, ist: w.ist.trim() || null,
    status: STATUS.some((s) => s[0] === w.status) ? w.status : "offen",
    wirksamkeit: w.wirksamkeit.trim() || null, quelle: w.quelle.trim() || null,
    periode: /^\d{4}$/.test(String(w.periode || "").trim()) ? Number(w.periode) : (v.periode ?? DIESES_JAHR),
    abschnitt: ABSCHNITTE.some((a) => a[0] === w.abschnitt) && w.abschnitt ? w.abschnitt : null,
    geaendert_am: new Date().toISOString(),
  };
  // Wann abgeschlossen: zählt in der Managementbewertung, ob eine Massnahme
  // zu Beginn eines Jahres noch offen war (Status vorangegangene Periode)
  const fertig = ["erledigt", "wirksam", "unwirksam"].includes(daten.status);
  daten.abgeschlossen_am = !fertig ? null : (m && m.abgeschlossen_am) || alt.isoDatum(new Date());
  if (m) {
    const vorher = await alt.rueckSichern("qm_massnahmen", { id: m.id });
    const { error } = await alt.db.from("qm_massnahmen").update(daten).eq("id", m.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Ändern von Massnahme " + (m.nr || ""), alt.rueckRein("qm_massnahmen", vorher));
  } else {
    daten.nr = Math.max(0, ...(alle || []).map((x) => x.nr || 0)) + 1;
    const { data, error } = await alt.db.from("qm_massnahmen").insert(daten).select("id");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = Array.isArray(data) && data[0] && data[0].id;
    if (id) alt.merkeSchritt("Massnahme " + daten.nr, alt.rueckWeg("qm_massnahmen", { id }));
  }
  alt.meldung(m ? "Gespeichert." : "Massnahme erfasst.", "gut");
  neu();
}

async function massnahmeLoeschen(m, neu) {
  const ok = await alt.nachfragen({ titel: "Massnahme löschen",
    text: "„" + (m.massnahme || "") + "“ verschwindet aus der KVP-Liste.", bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("qm_massnahmen", { id: m.id });
  const { error } = await alt.db.from("qm_massnahmen").delete().eq("id", m.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.merkeSchritt("Löschen von Massnahme " + (m.nr || ""), alt.rueckRein("qm_massnahmen", vorher));
  alt.meldung("Gelöscht."); neu();
}

// ---------- Messgrössen ----------
function Messgroessen({ daten, gerechnet, neu, zuKvp }) {
  const [laeuft, setLaeuft] = useState(false);
  const jahre = [DIESES_JAHR - 3, DIESES_JAHR - 2, DIESES_JAHR - 1, DIESES_JAHR];
  const liste = daten.messgroessen;

  async function vorschlag() {
    setLaeuft(true);
    const zeilen = VORSCHLAG_MESSGROESSEN.map((x, i) => ({ ...x, sort: (i + 1) * 10 }));
    const { error } = await alt.db.from("qm_messgroessen").insert(zeilen);
    setLaeuft(false);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.meldung("Vorschlag übernommen. Die Ziele trägst du noch ein.", "gut");
    neu();
  }

  return (
    <section className="karte" id="qm-messgroessen">
      <div className="karte__kopf">
        <h2>Messgrössen</h2>
        <button className="knopf knopf--haupt" id="qm-neu-messgroesse"
          onClick={() => messgroesseDialog(null, liste, neu)}>+ Messgrösse</button>
      </div>
      <p className="hinweis">Eine Messgrösse gilt jedes Jahr, bis du sie ausschaltest. Grün = Ziel erreicht, gelb = knapp verfehlt, rot = verfehlt. Werte „von Hand“ direkt im Jahr eintippen.</p>
      {!liste.length && <p><button className="knopf" id="qm-vorschlag" disabled={laeuft} onClick={vorschlag}>
        Vorschlag übernehmen ({VORSCHLAG_MESSGROESSEN.length} Messgrössen)</button></p>}
      {!!liste.length && <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle">
        <thead><tr><th>Messgrösse</th><th>Ziel</th>{jahre.map((j) => <th key={j} className="qm-zahl">{j}</th>)}<th /></tr></thead>
        <tbody>
          {liste.map((m) => {
            const werte = jahre.map((j) => messwert(m, j, gerechnet));
            // Letztes Jahr mit Wert zählt für Trend und Massnahme
            const letzt = [...werte].reverse().findIndex((x) => x != null);
            const iLetzt = letzt < 0 ? -1 : werte.length - 1 - letzt;
            const farbeLetzt = iLetzt >= 0 ? ampel(m, werte[iLetzt]) : null;
            const vor = iLetzt > 0 ? werte.slice(0, iLetzt).reverse().find((x) => x != null) : null;
            const trend = iLetzt >= 0 && vor != null ? (werte[iLetzt] > vor ? "↗" : werte[iLetzt] < vor ? "↘" : "→") : "";
            const eingabe = m.quelle !== "jahr";
            return (
              <tr key={m.id} data-messgroesse={m.id} className={m.aktiv === false ? "zeile--inaktiv" : ""}>
                <td><b>{m.name}</b> {trend && <span className="qm-trend" title="Trend zum Jahr davor">{trend}</span>}
                  <div className="klein">{[m.einheit, (m.quelle === "auto" ? "HoferTool, vorerst von Hand" : quelleText(m.quelle)) + (m.quelle === "jahr" && m.schluessel ? ": " + schluesselText(m.schluessel) : ""),
                    m.norm ? "ISO " + m.norm : "", m.verantwortlich, m.aktiv === false ? "ausgeschaltet" : ""].filter(Boolean).join(" · ")}</div></td>
                <td className="qm-nowrap">{m.ziel != null ? (m.richtung === "tief" ? "≤ " : "≥ ") + zahlZeigen(Number(m.ziel), m.einheit) : <span className="klein">kein Ziel</span>}
                  {m.gelb != null && <div className="klein">rot ab {m.richtung === "tief" ? "über " : "unter "}{zahlZeigen(Number(m.gelb), m.einheit)}</div>}</td>
                {jahre.map((j, i) => (
                  <td key={j} className="qm-zahl">
                    <span className="qm-wert">
                      <Ampel farbe={ampel(m, werte[i])} />
                      {eingabe
                        ? <ZahlFeld wert={werte[i]} einheit={m.einheit} name={"mg-" + m.id + "-" + j}
                            speichern={(n) => jahreswertSetzen(j, "mg:" + m.id, n).then(neu)} />
                        : <span>{zahlZeigen(werte[i], m.einheit)}</span>}
                    </span>
                  </td>))}
                <td className="qm-nowrap">
                  {(farbeLetzt === "rot" || farbeLetzt === "gelb") &&
                    <button className="knopf knopf--klein" data-mgmassnahme={m.id} title="Ziel verfehlt: Massnahme anlegen"
                      onClick={() => massnahmeDialog(null, liste, () => { neu(); zuKvp(); }, daten.massnahmen, {
                        thema: m.name, messgroesse_id: m.id, quelle: "Messgrösse " + jahre[iLetzt],
                        ziel: m.ziel != null ? (m.richtung === "tief" ? "≤ " : "≥ ") + zahlZeigen(Number(m.ziel), m.einheit) + " " + (m.einheit || "") : "",
                        ist: zahlZeigen(werte[iLetzt], m.einheit) + " " + (m.einheit || "") })}>→ Massnahme</button>}
                  <button className="chipweg chipweg--bearb" title="bearbeiten" data-mgbearb={m.id}
                    onClick={() => messgroesseDialog(m, liste, neu)}>✎</button>
                  <button className="chipweg" title="löschen" data-mgweg={m.id}
                    onClick={() => messgroesseLoeschen(m, neu)}>×</button>
                </td>
              </tr>);
          })}
        </tbody>
      </table></div>}
    </section>
  );
}

async function messgroesseDialog(m, liste, neu) {
  const v = m || { quelle: "hand", richtung: "hoch", aktiv: true };
  const w = await alt.dialogFelder({
    titel: m ? "Messgrösse ändern" : "Neue Messgrösse",
    felder: [
      { name: "name", label: "Name", pflicht: true, wert: v.name || "", platzhalter: "Auslastung der Anlagen" },
      { name: "einheit", label: "Einheit", wert: v.einheit || "", platzhalter: "%, CHF, h, Anzahl …" },
      { name: "quelle", label: "Woher kommt der Wert", auswahl: QUELLEN, wert: v.quelle || "hand" },
      { name: "schluessel", label: "Welche Wirtschaftszahl (nur bei Quelle Wirtschaftszahl)",
        auswahl: [["", "–"], ...SCHLUESSEL.map((x) => [x.k, x.text + " (" + x.einheit + ")"])], wert: v.quelle === "jahr" ? v.schluessel || "" : "" },
      { name: "richtung", label: "Richtung", auswahl: [["hoch", "Höher ist besser"], ["tief", "Tiefer ist besser"]], wert: v.richtung || "hoch" },
      { name: "ziel", label: "Zielwert", wert: v.ziel != null ? zahlZeigen(Number(v.ziel)) : "", platzhalter: "leer = ohne Ampel" },
      { name: "gelb", label: "Rot ab (bis dahin gelb)", wert: v.gelb != null ? zahlZeigen(Number(v.gelb)) : "",
        platzhalter: "leer = alles unter dem Ziel ist rot" },
      { name: "verantwortlich", label: "Verantwortlich", wert: v.verantwortlich || "", platzhalter: "GL" },
      { name: "norm", label: "Normbezug ISO 9001", wert: v.norm || "", platzhalter: "9.1.3" },
      { name: "notiz", label: "Notiz, Formel", wert: v.notiz || "" },
      { name: "aktiv", label: "Eingeschaltet", typ: "haken", wert: v.aktiv !== false },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const quelle = QUELLEN.some((q) => q[0] === w.quelle) ? w.quelle : "hand";
  if (quelle === "jahr" && !w.schluessel) { alt.meldung("Bitte wählen, welche Wirtschaftszahl.", "warn"); return; }
  const daten = {
    name: w.name.trim(), einheit: w.einheit.trim() || null, quelle,
    schluessel: quelle === "jahr" ? w.schluessel : (m && m.quelle !== "jahr" ? m.schluessel : null),
    richtung: w.richtung === "tief" ? "tief" : "hoch", ziel: zahlLesen(w.ziel), gelb: zahlLesen(w.gelb),
    verantwortlich: w.verantwortlich.trim() || null, norm: w.norm.trim() || null, notiz: w.notiz.trim() || null,
    aktiv: !!w.aktiv, geaendert_am: new Date().toISOString(),
  };
  if (m) {
    const vorher = await alt.rueckSichern("qm_messgroessen", { id: m.id });
    const { error } = await alt.db.from("qm_messgroessen").update(daten).eq("id", m.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Ändern von " + m.name, alt.rueckRein("qm_messgroessen", vorher));
  } else {
    daten.sort = Math.max(0, ...liste.map((x) => x.sort || 0)) + 10;
    const { data, error } = await alt.db.from("qm_messgroessen").insert(daten).select("id");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = Array.isArray(data) && data[0] && data[0].id;
    if (id) alt.merkeSchritt("Messgrösse " + daten.name, alt.rueckWeg("qm_messgroessen", { id }));
  }
  alt.meldung("Gespeichert.", "gut");
  neu();
}

async function messgroesseLoeschen(m, neu) {
  const ok = await alt.nachfragen({ titel: "Messgrösse löschen",
    text: "„" + m.name + "“ verschwindet aus dem Katalog. Massnahmen dazu bleiben, nur ohne Messgrösse. Zum Pausieren lieber ausschalten (✎).",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("qm_messgroessen", { id: m.id });
  const { error } = await alt.db.from("qm_messgroessen").delete().eq("id", m.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.merkeSchritt("Löschen von " + m.name, alt.rueckRein("qm_messgroessen", vorher));
  alt.meldung("Gelöscht."); neu();
}

// ---------- Eingabefeld für eine Zahl: speichert beim Verlassen ----------
function ZahlFeld({ wert, einheit, name, speichern, platzhalter }) {
  const anzeige = zahlZeigen(wert, einheit);
  return (
    <input className="qm-feld" inputMode="decimal" data-qmfeld={name} key={name + ":" + anzeige}
      defaultValue={anzeige} placeholder={platzhalter || ""}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={async (e) => {
        const t = e.currentTarget.value.trim();
        const n = zahlLesen(t);
        if (t && n == null) { alt.meldung("Bitte nur eine Zahl eintippen.", "warn"); e.currentTarget.value = anzeige; return; }
        if ((n ?? null) === (wert ?? null) || (n != null && wert != null && zahlZeigen(n, einheit) === anzeige)) return;
        try { await speichern(n); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
      }} />
  );
}

// ---------- Wirtschaftszahlen ----------
function Wirtschaftszahlen({ werte, gerechnet, neu }) {
  const daJahre = Object.keys(werte).map(Number);
  const [ab, setAb] = useState(null);
  const von = ab ?? Math.min(DIESES_JAHR - 1, ...daJahre);
  const bis = Math.max(DIESES_JAHR, ...daJahre);
  const jahre = [];
  for (let j = von; j <= bis; j++) jahre.push(j);
  const setzen = (j, k) => (n) => jahreswertSetzen(j, k, n).then(neu);

  return (
    <section className="karte" id="qm-zahlen">
      <div className="karte__kopf">
        <h2>Wirtschaftszahlen</h2>
        <button className="knopf knopf--klein" id="qm-frueher" onClick={() => setAb(von - 1)}>+ Jahr {von - 1}</button>
      </div>
      <p className="hinweis">Einmal im Jahr nach dem Abschluss eintippen, Enter oder ein Tipp daneben speichert. Was sich rechnen lässt, rechnet das Tool. Die Zahlen sind vertraulich und nur hier sichtbar.</p>
      <div className="qm-tabelle-huelle"><table className="tabelle qm-tabelle qm-zahlen">
        <thead><tr><th>Eingabe</th>{jahre.map((j) => <th key={j} className="qm-zahl">{j}</th>)}</tr></thead>
        <tbody>
          {EINGABEN.map((e) => (
            <tr key={e.k} data-qmzeile={e.k}>
              <td>{e.text} <span className="klein">{e.einheit}</span>{e.hinweis && <div className="klein">{e.hinweis}</div>}</td>
              {jahre.map((j) => <td key={j} className="qm-zahl">
                <ZahlFeld wert={werte[j] && werte[j][e.k]} einheit={e.einheit} name={e.k + "-" + j} speichern={setzen(j, e.k)} />
              </td>)}
            </tr>))}
          <tr className="qm-zwischen"><th colSpan={jahre.length + 1}>Daraus gerechnet</th></tr>
          {GERECHNET.map((e) => (
            <tr key={e.k} data-qmzeile={e.k}>
              <td>{e.text} <span className="klein">{e.einheit}</span>
                {e.auchEingabe && <div className="klein">ohne Franken direkt eintippen</div>}</td>
              {jahre.map((j) => {
                const g = gerechnet[j] && gerechnet[j][e.k];
                const eigen = werte[j] && werte[j][e.k];
                return <td key={j} className="qm-zahl">
                  {e.auchEingabe
                    ? <ZahlFeld wert={eigen} einheit={e.einheit} name={e.k + "-" + j} speichern={setzen(j, e.k)}
                        platzhalter={eigen == null ? zahlZeigen(g, e.einheit) : ""} />
                    : <span data-qmwert={e.k + "-" + j}>{zahlZeigen(g, e.einheit)}</span>}
                </td>;
              })}
            </tr>))}
        </tbody>
      </table></div>
    </section>
  );
}
