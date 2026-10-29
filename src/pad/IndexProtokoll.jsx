// =================================================================
//  WERKZEUGWECHSEL-PROTOKOLL FÜR INDEX
//  Beim Index läuft der Werkzeugwechsel wie das Excel-Blatt
//  „Werkzeugwechselprotokoll“ (Wunsch Patrick 29. Oktober 2026): je
//  Revolver die Plätze T1 bis T10, aber nur die, auf denen laut
//  Einrichtblatt ein Werkzeug steht; daneben Spalten „Dat. / Stückz.“,
//  eine je Wechsel. Das Protokoll gehört zur HOCO Nr. auf dem Typ: kommt
//  ein neuer FA desselben Teils, geht es im selben Protokoll weiter, eine
//  farbige Spaltenlinie mit „Neuer FA …“ darüber trennt die Aufträge.
//  Ein Blatt hat sechs Spalten wie das Excel; behalten werden nur die
//  letzten drei Blätter, Älteres löscht die App (Patrick: „rest wird
//  nicht mehr gebraucht“).
//
//  Gespeichert wird wie bei allen Typen in tool_changes (Path =
//  „Revolver N“ in bezeichnung), damit Historie, Standzeit und PDF
//  unverändert weiterlaufen.
// =================================================================
import { useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { platzInGebrauch } from "../einrichtblatt/daten.js";
import { REVOLVER } from "../einrichtblatt/vorlagen.js";

export const SPALTEN_JE_BLATT = 6;
export const BLAETTER_BEHALTEN = 3;
const PLAETZE = Array.from({ length: 10 }, (_, i) => "T" + (i + 1));

export const istIndex = (typ) => /^\s*index/i.test((typ && typ.name) || "");

const revolverVon = (bez) => { const m = /revolver\s*(\d)/i.exec(bez || ""); return m ? m[1] : null; };
const datum = (iso) => new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });

// Alle Wechsel dieser HOCO Nr. auf Maschinen dieses Typs, älteste zuerst,
// als Runden (alle Zeilen eines Eintrags teilen Zeitpunkt und Stückzahl)
async function protokollLaden(hoco, typId) {
  const m = await alt.db.from("machines").select("id, name").eq("type_id", typId);
  if (m.error) throw m.error;
  const maschinen = m.data || [];
  if (!maschinen.length) return [];
  const r = await alt.zeitlimit(alt.db.from("werkzeugwechsel").select("*").eq("hoco_nr", hoco)
    .in("machine_id", maschinen.map((x) => x.id)).order("gewechselt_am", { ascending: true }).limit(1000),
    12000, "Werkzeugwechsel");
  if (r.error) throw r.error;
  const liste = r.data || [];

  // Die FA Nr. steht am Auftrag, nicht im Wechsel
  const jobIds = Array.from(new Set(liste.map((z) => z.job_id).filter(Boolean)));
  const fa = {};
  if (jobIds.length) {
    try {
      const j = await alt.db.from("jobs").select("id, fa_nr").in("id", jobIds);
      (j.data || []).forEach((x) => { fa[x.id] = x.fa_nr || ""; });
    } catch (f) { /* dann ohne FA Nr. */ }
  }
  const runden = [];
  liste.forEach((z) => {
    const schluessel = z.gewechselt_am + "|" + (z.stueckzahl === null ? "" : z.stueckzahl) + "|" + (z.job_id || "");
    let rd = runden.find((x) => x.schluessel === schluessel);
    if (!rd) {
      rd = { schluessel, wann: z.gewechselt_am, stk: z.stueckzahl, job: z.job_id || null,
        fa: z.job_id ? fa[z.job_id] || "" : "", maschine: z.maschine, person: z.person, zeilen: [] };
      runden.push(rd);
    }
    rd.zeilen.push(z);
  });
  return runden;
}

// Mehr als drei Blätter: die ältesten ganzen Blätter weg, so bleiben die
// übrigen Blätter genau, wie sie waren
async function altesLoeschen(runden) {
  const blaetter = Math.ceil(runden.length / SPALTEN_JE_BLATT);
  if (blaetter <= BLAETTER_BEHALTEN) return runden;
  const weg = runden.slice(0, (blaetter - BLAETTER_BEHALTEN) * SPALTEN_JE_BLATT);
  const ids = weg.flatMap((r) => r.zeilen.map((z) => z.id)).filter(Boolean);
  try {
    const r = await alt.db.from("tool_changes").delete().in("id", ids).select("id");
    if (r.error) throw r.error;
    // Ohne Recht löscht die Datenbank still nichts, dann bleibt es eben
    if (r.data && r.data.length === 0) return runden;
  } catch (f) { alt.fehlerMerken && alt.fehlerMerken("Werkzeugwechsel aufräumen", alt.fehlertext(f)); return runden; }
  return runden.slice(weg.length);
}

// Die Reihen: je Revolver die Plätze mit Werkzeug im Einrichtblatt, dazu
// alles, was schon gewechselt wurde. Ohne Blatt alle T1 bis T10.
function reihenBilden(blatt, runden, alle) {
  const plaetze = (blatt && blatt.plaetze) || {};
  const mitBlatt = Object.keys(plaetze).some((k) => /^R\d-T\d+$/.test(k) && platzInGebrauch(plaetze[k]));
  const gewechselt = new Set(runden.flatMap((r) => r.zeilen.map((z) => (revolverVon(z.bezeichnung) || "?") + "|" + z.tool_nr)));
  return REVOLVER.map(([nr, farbe]) => {
    const namen = PLAETZE.slice();
    // Ein Platz, den es nur in der Historie gibt (etwa T11), kommt hinten dazu
    gewechselt.forEach((k) => { const [r, t] = k.split("|"); if (r === nr && !namen.includes(t)) namen.push(t); });
    const reihe = namen.filter((t) => alle || !mitBlatt || platzInGebrauch(plaetze["R" + nr + "-" + t]) || gewechselt.has(nr + "|" + t))
      .map((t) => ({ id: "R" + nr + "-" + t, tool_nr: t, eb: plaetze["R" + nr + "-" + t] || null }));
    return { nr, name: "Revolver " + nr, farbe, plaetze: reihe };
  }).filter((r) => r.plaetze.length);
}

export async function indexProtokoll(maschine, auftrag, typ, blatt, eintragen, historie) {
  let runden = [];
  try { runden = await protokollLaden(auftrag.job_number, typ.id); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  const neuLaden = async () => altesLoeschen(await protokollLaden(auftrag.job_number, typ.id));
  fensterOeffnen((zu) => <Protokoll maschine={maschine} auftrag={auftrag} typ={typ} blatt={blatt}
    anfang={runden} neuLaden={neuLaden} eintragen={eintragen} historie={historie} zu={zu} />);
}

function Protokoll({ maschine, auftrag, typ, blatt, anfang, neuLaden, eintragen, historie, zu }) {
  const [runden, setRunden] = useState(anfang);
  const [alle, setAlle] = useState(false);
  const [gewaehlt, setGewaehlt] = useState([]);
  const [laeuft, setLaeuft] = useState(false);
  const darf = alt.darfSchreiben();

  // Die nächste Spalte zum Eintragen hängt hinten an; ist das letzte Blatt
  // voll, beginnt sie ein neues
  const spalten = runden.concat(darf ? [{ neu: true, job: auftrag.id, fa: auftrag.fa_nr || "" }] : []);
  const anzahl = Math.max(1, Math.ceil(spalten.length / SPALTEN_JE_BLATT));
  const [seite, setSeite] = useState(anzahl - 1);
  const s = Math.min(seite, anzahl - 1);
  const aufBlatt = spalten.slice(s * SPALTEN_JE_BLATT, (s + 1) * SPALTEN_JE_BLATT);
  while (aufBlatt.length < SPALTEN_JE_BLATT) aufBlatt.push(null);

  // Neuer FA: anderer Auftrag als die Spalte davor
  const index = (c) => spalten.indexOf(c);
  const neuerFa = (c) => { const i = index(c); return i > 0 && c && (spalten[i - 1].job || "") !== (c.job || ""); };
  const faText = (c) => (c.fa ? "FA " + c.fa : "anderer Auftrag");

  const reihen = reihenBilden(blatt, runden, alle);
  const mitBlatt = !!(blatt && Object.keys(blatt.plaetze || {}).some((k) => platzInGebrauch(blatt.plaetze[k])));
  const umschalten = (id) => setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.concat(id)));
  const gewechselt = (c, r, p) => c && !c.neu && c.zeilen.some((z) => z.tool_nr === p.tool_nr
    && (revolverVon(z.bezeichnung) === r.nr || !z.bezeichnung));

  const speichern = async () => {
    if (!gewaehlt.length || laeuft) return;
    const liste = [];
    reihen.forEach((r) => r.plaetze.forEach((p) => { if (gewaehlt.includes(p.id)) liste.push({ tool_nr: p.tool_nr, path: r.name }); }));
    setLaeuft(true);
    const ok = await eintragen(maschine, auftrag, liste);
    if (ok) {
      try {
        const neu = await neuLaden();
        setRunden(neu);
        setGewaehlt([]);
        setSeite(Math.ceil((neu.length + 1) / SPALTEN_JE_BLATT) - 1);
      } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    }
    setLaeuft(false);
  };

  const klasse = (c) => "ixp-sp" + (c && c.neu ? " ixp-sp--neu" : "") + (c && neuerFa(c) ? " ixp-sp--fa" : "");

  return (
    <div className="dialog dialog--breit ixp">
      <div className="wz-kopf">
        <h2>Werkzeugwechsel­protokoll</h2>
        {mitBlatt && <button className="knopf knopf--klein knopf--still" data-ixpalle="" style={{ marginLeft: "auto", marginRight: ".5rem" }}
          onClick={() => setAlle(!alle)}>{alle ? "Nur aus dem Einrichtblatt" : "Alle Plätze"}</button>}
        <button className="knopf knopf--klein" data-wzhistorie="" style={mitBlatt ? null : { marginLeft: "auto" }}
          onClick={() => { zu(); historie(maschine, auftrag); }}>Historie</button>
        <button className="knopf knopf--still knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="ixp-titel">
        <span>Werkstück: <strong data-ixphoco="">{auftrag.job_number}</strong></span>
        <span>{maschine.name || "Index C100"}{maschine.machine_number ? " · " + maschine.machine_number : ""}</span>
        <span className="ixp-blaettern">
          <button className="knopf knopf--klein knopf--still" data-ixpzurueck="" disabled={s === 0}
            aria-label="Blatt zurück" onClick={() => setSeite(s - 1)}>◀</button>
          <span data-ixpblatt="">Blatt {s + 1} von {anzahl}</span>
          <button className="knopf knopf--klein knopf--still" data-ixpweiter="" disabled={s >= anzahl - 1}
            aria-label="Blatt weiter" onClick={() => setSeite(s + 1)}>▶</button>
        </span>
      </div>
      {!mitBlatt && <p className="klein">Kein Einrichtblatt in der App: es stehen alle Plätze T1 bis T10 da.</p>}
      <div className="ixp-rollen">
        <table className="ixp-tabelle">
          {/* Feste Breiten: die erste Zeile (FA) fasst T-Nr und Werkzeug zusammen */}
          <colgroup><col className="ixp-nr" /><col className="ixp-wz" />
            {aufBlatt.map((c, i) => <col key={i} className="ixp-sp" />)}</colgroup>
          <thead>
            <tr className="ixp-fazeile"><th colSpan="2"></th>{aufBlatt.map((c, i) => (
              <th key={i} className={klasse(c)}>{c && (neuerFa(c) ? <span className="ixp-falabel" data-ixpneufa="">Neuer {faText(c)}</span>
                : (i === 0 ? <span className="ixp-fa-still">{faText(c)}</span> : null))}</th>))}</tr>
            <tr><th className="ixp-nr">T-Nr</th><th className="ixp-wz">Werkzeug</th>
              {aufBlatt.map((c, i) => <th key={i} className={klasse(c)}>{c && c.neu ? "Neu" : "Dat. / Stückz."}</th>)}</tr>
          </thead>
          <tbody>
            {reihen.map((r) => [
              <tr key={r.nr} className="ixp-rev"><th colSpan={2 + SPALTEN_JE_BLATT} style={{ background: r.farbe }}>{r.name}</th></tr>,
              ...r.plaetze.map((p) => (
                <tr key={p.id} data-ixpplatz={p.id} className={gewaehlt.includes(p.id) ? "ixp-an" : ""}
                  onClick={darf && s === anzahl - 1 ? () => umschalten(p.id) : undefined}>
                  <td className="ixp-nr">{p.tool_nr}</td>
                  <td className="ixp-wz">{p.eb ? <><strong>{p.eb.taetigkeit || p.eb.werkzeug || ""}</strong>
                    {p.eb.hersteller && <small> {p.eb.hersteller}</small>}</> : ""}</td>
                  {aufBlatt.map((c, i) => (
                    <td key={i} className={klasse(c)}>
                      {c && c.neu ? (gewaehlt.includes(p.id) ? <span className="ixp-haken">✓</span> : "")
                        : gewechselt(c, r, p) ? <span className="ixp-eintrag" data-ixpeintrag="">{datum(c.wann)}
                          <b>{c.stk === null || c.stk === undefined ? "—" : alt.zahlText(c.stk)}</b></span> : ""}
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <p className="klein">{darf
        ? (s === anzahl - 1 ? "Gewechselte Werkzeuge antippen, dann eintragen. " : "Zum Eintragen aufs letzte Blatt blättern. ")
          + "Behalten werden die letzten " + BLAETTER_BEHALTEN + " Blätter."
        : "Nur zum Ansehen."}</p>
      {darf && <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Schliessen</button>
        <button className="knopf knopf--haupt" data-ixpeintragen="" disabled={!gewaehlt.length || laeuft} onClick={speichern}>
          {gewaehlt.length ? "Wechsel eintragen · " + gewaehlt.length : "Wechsel eintragen"}</button>
      </div>}
    </div>
  );
}
