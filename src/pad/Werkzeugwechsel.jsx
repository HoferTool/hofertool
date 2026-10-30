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
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { auswahlDialog } from "../teile/Dialoge.jsx";
import { blattSuchen, platzInGebrauch } from "../einrichtblatt/daten.js";
import { platzGruppe, platzName, vorlageFuer } from "../einrichtblatt/vorlagen.js";
import { indexAufraeumen, indexPdfAufbau, istIndex, protokollLaden, reihenBilden, revolverVon,
  SPALTEN_JE_BLATT } from "./IndexProtokoll.jsx";
import { WechselBlatt } from "./WechselBlatt.jsx";

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

const werkzeugVergleich = (a, b, sw) => (nameRang(a.bezeichnung, sw) - nameRang(b.bezeichnung, sw))
  || nachZahl(a.bezeichnung, b.bezeichnung) || nachZahl(a.tool_nr, b.tool_nr);

export async function werkzeugWechselDialog(maschine, auftrag) {
  // Alle Werkzeugplätze des Typs, nach Path sortiert. Nur bei SW-Typen
  // kommt Path 2 zuletzt (1, 3, 2), so wie die Plätze an der Maschine
  // liegen; alle anderen wie Index bleiben 1, 2, 3 (Wunsch Patrick
  // 16. Oktober 2026).
  let paths = [], typen = [], blatt = null;
  try {
    [paths, typen, blatt] = await Promise.all([alt.ladeTypAufbau(maschine.type_id), alt.ladeTypen(),
      auftrag && auftrag.job_number ? blattSuchen(auftrag.job_number, maschine.type_id) : null]);
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  const typ = typen.find((t) => t.id === maschine.type_id);
  const sw = istSw(typ);
  const rang = (p) => pathRang(p.nummer, sw);
  let reihen = paths
    .sort((x, y) => rang(x) - rang(y))
    .map((p) => ({ id: p.id, name: p.name, nummer: p.nummer, plaetze: (p.type_slots || []).filter((s) => s.tool_nr)
      .sort((a, b) => nachZahl(a.tool_nr, b.tool_nr)) }))
    .filter((p) => p.plaetze.length);

  // Steht das Blatt schon in der App, sind nur die Plätze dran, auf denen
  // dort ein Werkzeug steht (Wunsch Patrick 26. Oktober 2026: „nur die,
  // welche auch wirklich gebraucht werden“). Bei Index heissen die Plätze
  // im Blatt „R2-T7“, sonst wie am Typ „T1100“.
  const imBlatt = blatt && Object.entries(blatt.plaetze || {}).filter(([, p]) => platzInGebrauch(p));
  let alle = null;
  if (imBlatt && imBlatt.length) {
    const genutzt = Object.fromEntries(imBlatt);
    const platzVon = (p, sl) => genutzt["R" + p.nummer + "-" + sl.tool_nr] || genutzt[sl.tool_nr];
    const nurGenutzt = reihen.map((p) => Object.assign({}, p, { plaetze: p.plaetze.filter((sl) => platzVon(p, sl))
      .map((sl) => Object.assign({}, sl, { eb: platzVon(p, sl) })) })).filter((p) => p.plaetze.length);
    if (nurGenutzt.length) { alle = reihen; reihen = nurGenutzt; }
    else if (!reihen.length) {
      // Typ ohne angelegte Plätze (etwa Star): dann die Plätze des Blatts
      const gruppen = {};
      imBlatt.sort(([a], [b]) => nachZahl(a, b)).forEach(([k, p]) => {
        const g = platzGruppe(k) || "Werkzeuge";
        (gruppen[g] = gruppen[g] || []).push({ id: k, tool_nr: platzName(k), eb: p });
      });
      reihen = Object.entries(gruppen).map(([name, plaetze]) => ({ id: name, name, plaetze }));
    }
  }
  if (!reihen.length) {
    alt.meldung("Für diesen Maschinentyp sind noch keine Werkzeugplätze angelegt.", "warn");
    return;
  }
  fensterOeffnen((zu) => <Auswahl reihen={reihen} alle={alle} maschine={maschine} auftrag={auftrag} zu={zu} />);
}

function Auswahl({ reihen: genutzt, alle, maschine, auftrag, zu }) {
  // „Alle Plätze“ holt die übrigen dazu, falls doch einmal eines fehlt
  const [alleZeigen, setAlleZeigen] = useState(false);
  const reihen = alleZeigen && alle ? alle : genutzt;
  // Gewählt wird der einzelne Platz, nicht die Nummer: sonst ginge
  // mit T1 auf einem Revolver auch T1 auf allen anderen an
  const [gewaehlt, setGewaehlt] = useState([]);
  const umschalten = (id) => setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.concat(id)));

  const weiter = async () => {
    if (!gewaehlt.length) return;
    zu();
    // Mehrere Paths: der Name kommt mit, damit die Historie sie trennt
    // (gezählt am ganzen Typ, nicht nur an den Paths aus dem Blatt)
    const mitPath = (alle || genutzt).length > 1;
    const liste = [];
    (alle || genutzt).forEach((p) => p.plaetze.forEach((sl) => {
      if (gewaehlt.includes(sl.id)) liste.push({ tool_nr: sl.tool_nr, path: mitPath ? p.name || null : null });
    }));
    eintragen(maschine, auftrag, liste);
  };

  return (
    <div className="dialog dialog--breit">
      <div className="wz-kopf"><h2>Werkzeugwechsel</h2>
        {alle && <button className="knopf knopf--klein knopf--still" data-wzalle="" style={{ marginLeft: "auto", marginRight: ".5rem" }}
          onClick={() => setAlleZeigen(!alleZeigen)}>{alleZeigen ? "Nur aus dem Einrichtblatt" : "Alle Plätze"}</button>}
        {/* Die Historie sitzt dort, wo man sie braucht: neben dem Wechsel */}
        <button className="knopf knopf--klein" data-wzhistorie=""
          onClick={() => { zu(); wechselHistorie(maschine, auftrag); }}>Historie</button></div>
      <p className="klein">Alle Werkzeuge antippen, die gewechselt wurden.
        {alle ? (alleZeigen ? " Es stehen alle Plätze des Typs da." : " Es stehen nur die Werkzeuge aus dem Einrichtblatt da.") : ""}</p>
      {reihen.map((p) => (
        <div className="wz-path" key={p.id}>
          <div className="wz-path__name">{p.name}</div>
          <div className="wz-gitter">{p.plaetze.map((sl) => (
            <button key={sl.id} type="button" className={"wz-platz" + (gewaehlt.includes(sl.id) ? " wz-platz--an" : "")}
              data-tool={sl.tool_nr} onClick={() => umschalten(sl.id)}>
              <span className="wz-platz__nr">{sl.tool_nr}</span>
              <span className="wz-platz__art">{(sl.eb && (sl.eb.taetigkeit || sl.eb.werkzeug)) || sl.bezeichnung || ""}</span>
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
  if (!w) return false;
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
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return false; }
  alt.meldung(anzahlText(liste.length) + " bei " + alt.zahlText(stand) + " Stück eingetragen.");
  // Beim Index bleiben je HOCO Nr. nur die letzten drei Protokollblätter
  await indexAufraeumen(maschine, auftrag);
  return true;
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
  const runden = rundenBilden(liste, sw);
  // Dieselbe Reihenfolge braucht das PDF für „Je Werkzeug“
  runden.vergleich = (a, b) => werkzeugVergleich(a, b, sw);
  return runden;
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
  runden.forEach((r) => r.zeilen.sort((a, b) => werkzeugVergleich(a, b, sw)));
  return runden;
}

async function wechselHistorie(maschine, auftrag) {
  let runden = [];
  try { runden = await historieLaden(maschine); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  fensterOeffnen((zu) => <Historie maschine={maschine} auftrag={auftrag} anfang={runden} zu={zu} />);
}

const leerOder = (x) => x === null || x === undefined;

// ---------- Spalten des Blatts ----------

// Das PDF ist ein Blatt wie das Excel „Plattenwechsel“ (Wunsch Patrick
// 26. Oktober 2026): je Werkzeug eine schmale Spalte, die Kopfzeile
// farbig je Gruppe. Gezeigt werden die Werkzeuge, die das Teil braucht:
// die belegten Plätze im Einrichtblatt der App und alles, was schon
// gewechselt wurde. Gibt es beides nicht, alle Plätze des Typs.
const GRUPPENFARBEN = [
  ["#ffff00", "#000"], ["#00b050", "#fff"], ["#e46c0a", "#fff"], ["#0070c0", "#fff"],
  ["#7030a0", "#fff"], ["#c00000", "#fff"],
];
const tausender = (nr) => { const m = String(nr || "").match(/\d+/); return m ? Math.floor(Number(m[0]) / 1000) : 0; };

async function blattSpalten(maschine, auftrag, runden) {
  let paths = [], typen = [];
  try { [paths, typen] = await Promise.all([alt.ladeTypAufbau(maschine.type_id), alt.ladeTypen()]); }
  catch (f) { /* dann nur aus der Historie */ }
  const typ = (typen || []).find((t) => t.id === maschine.type_id);
  const sw = istSw(typ);
  const mitPath = paths.filter((p) => (p.type_slots || []).some((s) => s.tool_nr)).length > 1;
  const alle = [];
  paths.slice().sort((x, y) => pathRang(x.nummer, sw) - pathRang(y.nummer, sw)).forEach((p) => {
    (p.type_slots || []).filter((s) => s.tool_nr).sort((a, b) => nachZahl(a.tool_nr, b.tool_nr)).forEach((s) => {
      if (!alle.some((c) => c.tool_nr === s.tool_nr && c.nummer === p.nummer)) {
        alle.push({ tool_nr: s.tool_nr, path: mitPath ? p.name || null : null, nummer: p.nummer || 0 });
      }
    });
  });

  // Belegte Plätze im Einrichtblatt: beim Index heissen sie R1-T1
  const blatt = auftrag && auftrag.job_number ? await blattSuchen(auftrag.job_number, maschine.type_id) : null;
  const plaetze = (blatt && blatt.plaetze) || {};
  const imBlatt = (c) => platzInGebrauch(plaetze[c.tool_nr]) || platzInGebrauch(plaetze["R" + c.nummer + "-" + c.tool_nr]);
  // Typ ohne angelegte Plätze (etwa Star): dann die Plätze des Blatts
  if (!alle.length) {
    Object.keys(plaetze).filter((k) => platzInGebrauch(plaetze[k])).forEach((k) => {
      const g = platzGruppe(k);
      alle.push({ tool_nr: platzName(k), path: g || null, nummer: g ? Number(g.replace(/\D/g, "")) : 0 });
    });
  }
  const gewechselt = runden.flatMap((r) => r.zeilen);
  const inHistorie = (c) => gewechselt.some((z) => z.tool_nr === c.tool_nr && gleicherPath(z, c.path));
  let spalten = alle.filter((c) => imBlatt(c) || inHistorie(c));
  if (!spalten.length) spalten = alle;
  // Gewechselte Werkzeuge, die der Typ nicht (mehr) kennt, kommen hinten dazu
  gewechselt.forEach((z) => {
    if (!spalten.some((c) => c.tool_nr === z.tool_nr && gleicherPath(z, c.path))) {
      spalten.push({ tool_nr: z.tool_nr, path: z.bezeichnung || null, nummer: nameRang(z.bezeichnung, false) });
    }
  });

  spalten.sort((a, b) => (pathRang(a.nummer, sw) - pathRang(b.nummer, sw)) || nachZahl(a.tool_nr, b.tool_nr));

  // Farbe wie im Excel: bei Star nach Tausender (T100 gelb, T1100 grün,
  // T2100 orange, T3100 blau), sonst je Revolver bzw. Path
  const jeTausend = new Set(spalten.map((c) => tausender(c.tool_nr))).size > 1;
  const gruppen = [];
  spalten.forEach((c) => {
    const g = jeTausend ? tausender(c.tool_nr) : (c.path || "");
    let i = jeTausend ? g : gruppen.indexOf(g);
    if (!jeTausend && i < 0) { gruppen.push(g); i = gruppen.length - 1; }
    [c.farbe, c.schrift] = GRUPPENFARBEN[i % GRUPPENFARBEN.length];
    // Dieselbe Nummer auf mehreren Revolvern: R1, R2 … davor
    c.text = spalten.filter((x) => x.tool_nr === c.tool_nr).length > 1 && c.nummer
      ? (/revolver/i.test(c.path || "") ? "R" : "P") + c.nummer + " " + c.tool_nr : c.tool_nr;
  });
  return { spalten, typ: typ ? typ.name : "" };
}

// Löschen: Wer schreiben darf (Admin, Planwand, Lang- und Kurzdreher),
// darf auch einen falsch eingetragenen Wechsel entfernen. Das deckt
// sich mit der Regel "loeschen" auf tool_changes in der Datenbank.
// ganz: aus dem Blatt heraus geht immer der ganze Wechsel weg, mit einer
// Rückfrage (einzelne Werkzeuge nimmt man dort durch Antippen heraus)
async function loeschen(maschine, runde, ganz) {
  let weg = runde.zeilen;
  const wann = alt.datumZeitKurz(runde.wann);
  if (ganz) {
    const ja = await alt.nachfragen({ titel: "Wechsel löschen?",
      text: "Wechsel vom " + wann + " bei " + (leerOder(runde.stk) ? "—" : alt.zahlText(runde.stk)) + " Stück wird entfernt ("
        + runde.zeilen.map(wzText).join(", ") + ").",
      bestaetigen: "Löschen", gefahr: true });
    if (!ja) return false;
  } else if (runde.zeilen.length > 1) {
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

// Die Historie als Blatt wie ihr PDF, für Index und Star (SB, SR), zum
// Bearbeiten (WechselBlatt.jsx; Patrick 29. Oktober 2026: „Historie so,
// dass sie aussieht wie das PDF“). Andere Typen und ohne Auftrag: null,
// dann bleibt die Liste.
async function modellDerHistorie(maschine, auftrag, runden) {
  if (!auftrag || !auftrag.job_number) return null;
  const hoco = auftrag.job_number;
  const typ = (await alt.ladeTypen()).find((t) => t.id === maschine.type_id);
  if (istIndex(typ)) {
    const [eigene, blatt] = await Promise.all([protokollLaden(hoco, typ.id), blattSuchen(hoco, typ.id).catch(() => null)]);
    const gruppen = reihenBilden(blatt, eigene, false).map((r) => ({ name: r.name, farbe: r.farbe,
      werkzeuge: r.plaetze.map((p) => ({ key: p.id, tool_nr: p.tool_nr, path: r.name,
        text: p.eb ? p.eb.taetigkeit || p.eb.werkzeug || "" : "", unter: p.eb && p.eb.hersteller,
        passt: (z) => z.tool_nr === p.tool_nr && (!z.bezeichnung || revolverVon(z.bezeichnung) === r.nr) })) }));
    return { art: "index", gruppen, runden: eigene, spaltenJeBlatt: SPALTEN_JE_BLATT, laden: () => protokollLaden(hoco, typ.id) };
  }
  // SW läuft wie die SB-Maschinen (Wunsch Patrick 30. Oktober 2026)
  if (!typ || (vorlageFuer(typ).art !== "star" && !istSw(typ))) return null;
  // Wie im PDF nur die Wechsel dieser HOCO Nr., älteste zuerst
  const nurDiese = (rs) => rs.filter((r) => r.zeilen.some((z) => (z.hoco_nr || z.auftrag_nr) === hoco))
    .sort((x, y) => String(x.wann || "").localeCompare(String(y.wann || "")));
  const { spalten } = await blattSpalten(maschine, auftrag, runden);
  const werkzeuge = spalten.map((c, i) => ({ key: i + "|" + c.tool_nr + "|" + (c.path || ""), tool_nr: c.tool_nr, path: c.path,
    text: c.text || c.tool_nr, farbe: c.farbe, schrift: c.schrift, passt: (z) => z.tool_nr === c.tool_nr && gleicherPath(z, c.path) }));
  return { art: "star", gruppen: [{ name: "", werkzeuge }], runden: nurDiese(runden.slice()),
    laden: async () => nurDiese(await historieLaden(maschine)) };
}

const AKTIONEN = { eintragen: (...a) => eintragen(...a), rundeLoeschen: (m, r) => loeschen(m, r, true),
  nachrechnen: (...a) => gehaltenNachrechnen(...a) };

function Historie({ maschine, auftrag, anfang, zu }) {
  const [modell, setModell] = useState(null);
  const [runden, setRunden] = useState(anfang);
  const [laeuft, setLaeuft] = useState(null);
  const darf = alt.darfSchreiben();

  // Mit Blatt gibt es keine Liste mehr: Löschen geht direkt im Blatt
  // (Wunsch Patrick 29. Oktober 2026: „ohne auf die Liste zu müssen“)
  useEffect(() => {
    let weg = false;
    modellDerHistorie(maschine, auftrag, runden).then((m) => { if (!weg) setModell(m); }).catch(() => {});
    return () => { weg = true; };
  }, []);
  const blattZeigen = !!modell;

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
    <div className={"dialog dialog--breit" + (modell ? " wz-hist" : "")}>
      <div className="blatt__kopf"><h2>Werkzeugwechsel · {maschine.name}</h2>
        {runden.length > 0 && <button className="knopf knopf--klein" data-wzpdf=""
          onClick={async () => {
            // Im Blatt Geändertes soll auch im PDF stehen
            let aktuell = runden;
            try { aktuell = await historieLaden(maschine); setRunden(aktuell); } catch (f) { /* dann wie vorher */ }
            alt.historieAblegen(maschine, auftrag, aktuell, async () => (await indexPdfAufbau(maschine, auftrag).catch(() => null)) || blattSpalten(maschine, auftrag, aktuell));
          }}>Als PDF ablegen</button>}
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
      {blattZeigen
        ? <WechselBlatt key={modell.art + modell.runden.length} modell={modell} maschine={maschine} auftrag={auftrag} aktionen={AKTIONEN} />
        : runden.length
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
      {!blattZeigen && <p className="klein">Die Zahl hinter einem Werkzeug sagt, wie viele Stück es seit dem letzten Wechsel
        gehalten hat. Die Standzeit im Einrichtblatt bleibt davon unberührt und wird dort von Hand gepflegt.</p>}
    </div>
  );
}
