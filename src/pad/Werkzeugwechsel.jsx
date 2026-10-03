// =================================================================
//  WERKZEUGWECHSEL
//  Am Pad alle Werkzeuge antippen, die gewechselt wurden, dann die
//  Stückzahl eintragen. Daneben die Historie der Maschine, nach
//  Runden gruppiert, mit der Ablage als PDF beim Auftrag.
//
//  Das Blatt für die Ablage (historieAblegen) ist ein eigenes
//  Druckdokument und bleibt im alten Programm.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

const anzahlText = (n) => n + (n === 1 ? " Werkzeug" : " Werkzeuge");

export async function werkzeugWechselDialog(maschine, auftrag) {
  // Alle Werkzeugplätze des Typs, nach Path sortiert. Path 2 kommt
  // zuletzt, so wie die Plätze an der Maschine liegen.
  let paths = [];
  try { paths = await alt.ladeTypAufbau(maschine.type_id); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  const reihen = paths
    .sort((x, y) => (x.nummer === 2 ? 99 : x.nummer) - (y.nummer === 2 ? 99 : y.nummer))
    .map((p) => ({ id: p.id, name: p.name, plaetze: (p.type_slots || []).filter((s) => s.tool_nr) }))
    .filter((p) => p.plaetze.length);
  if (!reihen.length) {
    alt.meldung("Für diesen Maschinentyp sind noch keine Werkzeugplätze angelegt.", "warn");
    return;
  }
  fensterOeffnen((zu) => <Auswahl reihen={reihen} maschine={maschine} auftrag={auftrag} zu={zu} />);
}

function Auswahl({ reihen, maschine, auftrag, zu }) {
  const [gewaehlt, setGewaehlt] = useState([]);
  const umschalten = (t) => setGewaehlt((g) => (g.includes(t) ? g.filter((x) => x !== t) : g.concat(t)));

  const weiter = async () => {
    if (!gewaehlt.length) return;
    zu();
    eintragen(maschine, auftrag, gewaehlt);
  };

  return (
    <div className="dialog dialog--breit">
      <div className="wz-kopf"><h2>Werkzeugwechsel</h2>
        {/* Die Historie sitzt dort, wo man sie braucht: neben dem Wechsel */}
        <button className="knopf knopf--klein" data-wzhistorie=""
          onClick={() => { zu(); wechselHistorie(maschine, auftrag); }}>Historie</button></div>
      <p className="klein">Alle Werkzeuge antippen, die gewechselt wurden.</p>
      {reihen.map((p) => (
        <div className="wz-path" key={p.id}>
          <div className="wz-path__name">{p.name}</div>
          <div className="wz-gitter">{p.plaetze.map((sl) => (
            <button key={sl.id} type="button" className={"wz-platz" + (gewaehlt.includes(sl.tool_nr) ? " wz-platz--an" : "")}
              data-tool={sl.tool_nr} onClick={() => umschalten(sl.tool_nr)}>
              <span className="wz-platz__nr">{sl.tool_nr}</span>
              <span className="wz-platz__art">{sl.bezeichnung || ""}</span>
            </button>
          ))}</div>
        </div>
      ))}
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-wzweiter="" disabled={!gewaehlt.length} onClick={weiter}>
          {gewaehlt.length ? "Weiter · " + gewaehlt.length : "Weiter"}</button>
      </div>
    </div>
  );
}

async function eintragen(maschine, auftrag, liste) {
  const w = await alt.dialogFelder({ titel: "Stückzahl beim Wechsel",
    felder: [
      { name: "stk", label: "Jetzige Stückzahl", typ: "number", pflicht: true,
        wert: auftrag ? (auftrag.stand || 0) : "", hinweis: anzahlText(liste.length) },
      { name: "notiz", label: "Notiz", wert: "" }],
    bestaetigen: "Wechsel eintragen" });
  if (!w) return;
  const stand = Math.max(0, Math.round(Number(w.stk) || 0));

  // Wie viele Stück das Werkzeug gehalten hat: Abstand zur Stückzahl
  // beim letzten Wechsel desselben Platzes
  const vorher = {};
  try {
    const r = await alt.db.from("tool_changes").select("tool_nr, stueckzahl, gewechselt_am")
      .eq("machine_id", maschine.id).in("tool_nr", liste)
      .order("gewechselt_am", { ascending: false }).limit(200);
    (r.data || []).forEach((z) => { if (vorher[z.tool_nr] === undefined) vorher[z.tool_nr] = z.stueckzahl; });
  } catch (f) { /* dann bleibt die Spalte leer */ }

  // Alle Zeilen einer Runde bekommen denselben Zeitpunkt
  const zeitpunkt = new Date().toISOString();
  const zeilen = liste.map((t) => ({
    machine_id: maschine.id,
    job_id: auftrag ? auftrag.id : null,
    hoco_nr: auftrag ? auftrag.job_number : null,
    tool_nr: t,
    stueckzahl: stand,
    gehalten_stk: (vorher[t] === undefined || vorher[t] === null) ? null : Math.max(0, stand - vorher[t]),
    notiz: w.notiz || null,
    gewechselt_am: zeitpunkt,
  }));
  // Über den Einfüger, der Spalten weglässt, die es in der Tabelle
  // nicht gibt: sonst scheitert der ganze Eintrag an einem Feld
  try { await alt.einfuegenOhneUnbekannte("tool_changes", zeilen); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  alt.meldung(anzahlText(liste.length) + " bei " + alt.zahlText(stand) + " Stück eingetragen.");
}

// ---------- Historie ----------

async function wechselHistorie(maschine, auftrag) {
  let liste = [];
  try {
    const r = await alt.zeitlimit(alt.db.from("werkzeugwechsel").select("*").eq("machine_id", maschine.id)
      .order("gewechselt_am", { ascending: false }).limit(300), 12000, "Werkzeugwechsel");
    if (r.error) throw r.error;
    liste = r.data || [];
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }

  // Nach Runden gruppieren: Alle Zeilen einer Runde teilen sich
  // Zeitpunkt und Stückzahl
  const runden = [];
  liste.forEach((z) => {
    const schluessel = z.gewechselt_am + "|" + (z.stueckzahl === null ? "" : z.stueckzahl);
    let r = runden.find((x) => x.schluessel === schluessel);
    if (!r) {
      r = { schluessel, wann: z.gewechselt_am, stk: z.stueckzahl, person: z.person,
        auftrag: z.auftrag_nr, notiz: z.notiz, zeilen: [] };
      runden.push(r);
    }
    r.zeilen.push(z);
  });
  fensterOeffnen((zu) => <Historie maschine={maschine} auftrag={auftrag} runden={runden} zu={zu} />);
}

const leerOder = (x) => x === null || x === undefined;

function Historie({ maschine, auftrag, runden, zu }) {
  return (
    <div className="dialog dialog--breit">
      <div className="blatt__kopf"><h2>Werkzeugwechsel · {maschine.name}</h2>
        {runden.length > 0 && <button className="knopf knopf--klein" data-wzpdf=""
          onClick={() => alt.historieAblegen(maschine, auftrag, runden)}>Als PDF ablegen</button>}
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      {runden.length
        ? <table className="tabelle">
            <thead><tr><th>Stückzahl</th><th>Gewechselt</th><th>Auftrag</th><th>Wann</th><th>Wer</th></tr></thead>
            <tbody>{runden.map((r) => (
              <tr key={r.schluessel}>
                <td className="nowrap"><strong>{leerOder(r.stk) ? "—" : alt.zahlText(r.stk)}</strong></td>
                <td>
                  {r.zeilen.map((z, i) => (
                    <span key={z.id || i}>{i > 0 && " "}<span className="wz-marke">{z.tool_nr}
                      {!leerOder(z.gehalten_stk) && <> <i>{alt.zahlText(z.gehalten_stk)} Stk</i></>}</span></span>
                  ))}
                  {r.notiz && <div className="klein">{r.notiz}</div>}
                </td>
                <td className="klein">{r.auftrag || ""}</td>
                <td className="klein nowrap">{alt.datumZeitKurz(r.wann)}</td>
                <td className="klein">{r.person || ""}</td>
              </tr>
            ))}</tbody>
          </table>
        : <p className="hinweis">Noch kein Wechsel eingetragen.</p>}
      <p className="klein">Die Zahl hinter einem Werkzeug sagt, wie viele Stück es seit dem letzten Wechsel
        gehalten hat. Die Standzeit im Einrichtblatt bleibt davon unberührt und wird dort von Hand gepflegt.</p>
    </div>
  );
}
