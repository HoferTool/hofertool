// =================================================================
//  WERKZEUGWECHSEL
//  Am Pad alle Werkzeuge antippen, die gewechselt wurden, dann die
//  Stückzahl eintragen. Daneben die Historie der Maschine, nach
//  Runden gruppiert, mit der Ablage als PDF beim Auftrag. Wer schreiben
//  darf, kann dort falsche Einträge löschen.
//
//  Das Blatt für die Ablage (historieAblegen) ist ein eigenes
//  Druckdokument und bleibt im alten Programm.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { auswahlDialog } from "../teile/Dialoge.jsx";

const anzahlText = (n) => n + (n === 1 ? " Werkzeug" : " Werkzeuge");

// Ein Werkzeug ist ein Platz auf einem Path: T1 auf Revolver 1 ist ein
// anderes Werkzeug als T1 auf Revolver 2 (Wunsch Patrick 21. Oktober
// 2026, etwa bei Index). Der Path steht in tool_changes.bezeichnung;
// ältere Einträge haben dort nichts und zählen für jeden Path.
const gleicherPath = (z, path) => !z.bezeichnung || !path || z.bezeichnung === path;
const wzText = (z) => z.tool_nr + (z.bezeichnung ? " · " + z.bezeichnung : "");

// Werkzeuge immer nach Revolver bzw. Path, darin nach Nummer klein zu
// gross, als Zahl gelesen: T2 vor T10 (Wunsch Patrick 22. Oktober 2026).
// Bei SW-Typen kommt Path 2 zuletzt (1, 3, 2), wie an der Maschine.
const nachZahl = (a, b) => String(a || "").localeCompare(String(b || ""), "de", { numeric: true });
const istSw = (typ) => /^\s*sw/i.test((typ && typ.name) || "");
const pathRang = (nummer, sw) => (sw && nummer === 2 ? 99 : nummer);
// In der Historie steht nur der Name des Path, die Nummer steckt darin
const nameRang = (name, sw) => {
  const m = String(name || "").match(/\d+/);
  return m ? pathRang(Number(m[0]), sw) : 0;
};

export async function werkzeugWechselDialog(maschine, auftrag) {
  // Alle Werkzeugplätze des Typs, nach Path sortiert. Nur bei SW-Typen
  // kommt Path 2 zuletzt (1, 3, 2), so wie die Plätze an der Maschine
  // liegen; alle anderen wie Index bleiben 1, 2, 3 (Wunsch Patrick
  // 16. Oktober 2026).
  let paths = [], typen = [];
  try { [paths, typen] = await Promise.all([alt.ladeTypAufbau(maschine.type_id), alt.ladeTypen()]); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  const typ = typen.find((t) => t.id === maschine.type_id);
  const sw = istSw(typ);
  const rang = (p) => pathRang(p.nummer, sw);
  const reihen = paths
    .sort((x, y) => rang(x) - rang(y))
    .map((p) => ({ id: p.id, name: p.name, plaetze: (p.type_slots || []).filter((s) => s.tool_nr)
      .sort((a, b) => nachZahl(a.tool_nr, b.tool_nr)) }))
    .filter((p) => p.plaetze.length);
  if (!reihen.length) {
    alt.meldung("Für diesen Maschinentyp sind noch keine Werkzeugplätze angelegt.", "warn");
    return;
  }
  fensterOeffnen((zu) => <Auswahl reihen={reihen} maschine={maschine} auftrag={auftrag} zu={zu} />);
}

function Auswahl({ reihen, maschine, auftrag, zu }) {
  // Gewählt wird der einzelne Platz, nicht die Nummer: sonst ginge
  // mit T1 auf einem Revolver auch T1 auf allen anderen an
  const [gewaehlt, setGewaehlt] = useState([]);
  const umschalten = (id) => setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.concat(id)));

  const weiter = async () => {
    if (!gewaehlt.length) return;
    zu();
    // Mehrere Paths: der Name kommt mit, damit die Historie sie trennt
    const mitPath = reihen.length > 1;
    const liste = [];
    reihen.forEach((p) => p.plaetze.forEach((sl) => {
      if (gewaehlt.includes(sl.id)) liste.push({ tool_nr: sl.tool_nr, path: mitPath ? p.name || null : null });
    }));
    eintragen(maschine, auftrag, liste);
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
            <button key={sl.id} type="button" className={"wz-platz" + (gewaehlt.includes(sl.id) ? " wz-platz--an" : "")}
              data-tool={sl.tool_nr} onClick={() => umschalten(sl.id)}>
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
  // beim letzten Wechsel desselben Platzes (gleicher Path)
  let frueher = [];
  try {
    const r = await alt.db.from("tool_changes").select("tool_nr, bezeichnung, stueckzahl, gewechselt_am")
      .eq("machine_id", maschine.id).in("tool_nr", Array.from(new Set(liste.map((w) => w.tool_nr))))
      .order("gewechselt_am", { ascending: false }).limit(300);
    frueher = r.data || [];
  } catch (f) { /* dann bleibt die Spalte leer */ }
  const letzter = (w) => frueher.find((z) => z.tool_nr === w.tool_nr && gleicherPath(z, w.path));

  // Alle Zeilen einer Runde bekommen denselben Zeitpunkt
  const zeitpunkt = new Date().toISOString();
  const zeilen = liste.map((wz) => {
    const v = letzter(wz);
    return {
      machine_id: maschine.id,
      job_id: auftrag ? auftrag.id : null,
      hoco_nr: auftrag ? auftrag.job_number : null,
      tool_nr: wz.tool_nr,
      bezeichnung: wz.path,
      stueckzahl: stand,
      gehalten_stk: (!v || v.stueckzahl === null) ? null : Math.max(0, stand - v.stueckzahl),
      notiz: w.notiz || null,
      gewechselt_am: zeitpunkt,
    };
  });
  // Über den Einfüger, der Spalten weglässt, die es in der Tabelle
  // nicht gibt: sonst scheitert der ganze Eintrag an einem Feld
  try { await alt.einfuegenOhneUnbekannte("tool_changes", zeilen); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  alt.meldung(anzahlText(liste.length) + " bei " + alt.zahlText(stand) + " Stück eingetragen.");
}

// ---------- Historie ----------

async function historieLaden(maschine) {
  const r = await alt.zeitlimit(alt.db.from("werkzeugwechsel").select("*").eq("machine_id", maschine.id)
    .order("gewechselt_am", { ascending: false }).limit(300), 12000, "Werkzeugwechsel");
  if (r.error) throw r.error;
  const liste = r.data || [];

  // Die Sicht werkzeugwechsel liefert gehalten_stk nicht mit. Darum
  // die Zahl direkt aus tool_changes dazuholen, sonst fehlt sie in
  // Historie und PDF.
  const ohne = liste.filter((z) => z.gehalten_stk === undefined).map((z) => z.id);
  if (ohne.length) {
    try {
      const g = await alt.db.from("tool_changes").select("id, gehalten_stk").in("id", ohne);
      const nachId = {};
      (g.data || []).forEach((z) => { nachId[z.id] = z.gehalten_stk; });
      liste.forEach((z) => { if (z.gehalten_stk === undefined) z.gehalten_stk = nachId[z.id]; });
    } catch (f) { /* dann bleibt die Zahl leer */ }
  }
  let sw = false;
  try { sw = istSw((await alt.ladeTypen()).find((t) => t.id === maschine.type_id)); }
  catch (f) { /* dann einfach 1, 2, 3 */ }
  return rundenBilden(liste, sw);
}

// Nach Runden gruppieren: Alle Zeilen einer Runde teilen sich
// Zeitpunkt und Stückzahl
function rundenBilden(liste, sw) {
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
  runden.forEach((r) => r.zeilen.sort((a, b) => (nameRang(a.bezeichnung, sw) - nameRang(b.bezeichnung, sw))
    || nachZahl(a.bezeichnung, b.bezeichnung) || nachZahl(a.tool_nr, b.tool_nr)));
  return runden;
}

async function wechselHistorie(maschine, auftrag) {
  let runden = [];
  try { runden = await historieLaden(maschine); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  fensterOeffnen((zu) => <Historie maschine={maschine} auftrag={auftrag} anfang={runden} zu={zu} />);
}

const leerOder = (x) => x === null || x === undefined;

// Löschen: Wer schreiben darf (Admin, Planwand, Lang- und Kurzdreher),
// darf auch einen falsch eingetragenen Wechsel entfernen. Das deckt
// sich mit der Regel "loeschen" auf tool_changes in der Datenbank.
async function loeschen(maschine, runde) {
  let weg = runde.zeilen;
  const wann = alt.datumZeitKurz(runde.wann);
  if (runde.zeilen.length > 1) {
    const wahl = await auswahlDialog("Welchen Eintrag löschen?", [
      { wert: "alle", text: "Ganze Runde · " + runde.zeilen.map(wzText).join(", ") },
      ...runde.zeilen.map((z, i) => ({ wert: String(i), text: "Nur " + wzText(z) })),
    ]);
    if (wahl === null) return false;
    if (wahl !== "alle") weg = [runde.zeilen[Number(wahl)]];
  } else {
    const ja = await alt.nachfragen({ titel: "Eintrag löschen?",
      text: "Wechsel von " + wzText(weg[0]) + " vom " + wann + " bei "
        + (leerOder(runde.stk) ? "—" : alt.zahlText(runde.stk)) + " Stück wird entfernt.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ja) return false;
  }

  const ids = weg.map((z) => z.id).filter(Boolean);
  // Für Rückgängig: die gelöschten Einträge und alle desselben Werkzeugs,
  // deren Standzeit gleich neu gerechnet wird
  const werkzeuge = Array.from(new Set(weg.map((z) => z.tool_nr)));
  const vorher = await alt.rueckSichern("tool_changes", { machine_id: maschine.id, tool_nr: werkzeuge });
  try {
    const r = await alt.db.from("tool_changes").delete().in("id", ids).select("id");
    if (r.error) throw r.error;
    // Ohne Recht löscht die Datenbank still nichts: dann ehrlich sagen
    if (r.data && r.data.length === 0) {
      alt.meldung("Nicht gelöscht: Dafür fehlt dir das Recht.", "warn");
      return false;
    }
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return false; }

  await gehaltenNachrechnen(maschine, weg);
  alt.merkeSchritt("Werkzeugwechsel löschen", alt.rueckRein("tool_changes", vorher));
  alt.meldung(weg.length === 1 ? "Eintrag " + wzText(weg[0]) + " gelöscht." : anzahlText(weg.length) + " gelöscht.", "gut");
  return true;
}

// Der nächste Wechsel desselben Werkzeugs hatte seine Standzeit vom
// gelöschten Eintrag aus gerechnet. Jetzt gilt der Wechsel davor.
async function gehaltenNachrechnen(maschine, weg) {
  for (const z of weg) {
    try {
      const r = await alt.db.from("tool_changes").select("id, bezeichnung, stueckzahl, gehalten_stk, gewechselt_am")
        .eq("machine_id", maschine.id).eq("tool_nr", z.tool_nr)
        .order("gewechselt_am", { ascending: true }).limit(500);
      const reihe = (r.data || []).filter((x) => gleicherPath(x, z.bezeichnung));
      const naechster = reihe.find((x) => x.gewechselt_am > z.gewechselt_am);
      if (!naechster) continue;
      const davor = reihe.filter((x) => x.gewechselt_am < z.gewechselt_am).pop();
      const neu = (!davor || leerOder(davor.stueckzahl) || leerOder(naechster.stueckzahl))
        ? null : Math.max(0, naechster.stueckzahl - davor.stueckzahl);
      if (neu !== naechster.gehalten_stk) {
        await alt.db.from("tool_changes").update({ gehalten_stk: neu }).eq("id", naechster.id);
      }
    } catch (f) { /* Standzeit bleibt dann wie sie war */ }
  }
}

function Historie({ maschine, auftrag, anfang, zu }) {
  const [runden, setRunden] = useState(anfang);
  const [laeuft, setLaeuft] = useState(null);
  const darf = alt.darfSchreiben();

  const entfernen = async (r) => {
    setLaeuft(r.schluessel);
    const ok = await loeschen(maschine, r);
    if (ok) {
      try { setRunden(await historieLaden(maschine)); }
      catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    }
    setLaeuft(null);
  };

  return (
    <div className="dialog dialog--breit">
      <div className="blatt__kopf"><h2>Werkzeugwechsel · {maschine.name}</h2>
        {runden.length > 0 && <button className="knopf knopf--klein" data-wzpdf=""
          onClick={() => alt.historieAblegen(maschine, auftrag, runden)}>Als PDF ablegen</button>}
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      {runden.length
        ? <table className="tabelle">
            <thead><tr><th>Stückzahl</th><th>Gewechselt</th><th>Auftrag</th><th>Wann</th><th>Wer</th>
              {darf && <th aria-label="Löschen"></th>}</tr></thead>
            <tbody>{runden.map((r) => (
              <tr key={r.schluessel}>
                <td className="nowrap"><strong>{leerOder(r.stk) ? "—" : alt.zahlText(r.stk)}</strong></td>
                <td>
                  {r.zeilen.map((z, i) => (
                    <span key={z.id || i}>{i > 0 && " "}<span className="wz-marke">{z.tool_nr}
                      {z.bezeichnung && <small> {z.bezeichnung}</small>}
                      {!leerOder(z.gehalten_stk) && <> <i>{alt.zahlText(z.gehalten_stk)} Stk</i></>}</span></span>
                  ))}
                  {r.notiz && <div className="klein">{r.notiz}</div>}
                </td>
                <td className="klein">{r.auftrag || ""}</td>
                <td className="klein nowrap">{alt.datumZeitKurz(r.wann)}</td>
                <td className="klein">{r.person || ""}</td>
                {darf && <td className="wz-weg-zelle">
                  <button type="button" className="wz-weg" data-wzweg="" title="Eintrag löschen"
                    aria-label={"Wechsel vom " + alt.datumZeitKurz(r.wann) + " löschen"}
                    disabled={laeuft !== null} onClick={() => entfernen(r)}>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                    </svg>
                  </button></td>}
              </tr>
            ))}</tbody>
          </table>
        : <p className="hinweis">Noch kein Wechsel eingetragen.</p>}
      <p className="klein">Die Zahl hinter einem Werkzeug sagt, wie viele Stück es seit dem letzten Wechsel
        gehalten hat. Die Standzeit im Einrichtblatt bleibt davon unberührt und wird dort von Hand gepflegt.</p>
    </div>
  );
}
