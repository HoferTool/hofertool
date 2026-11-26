import { QS_NEU, QS_SPERRE } from "../daten/pruefbericht.js";
// =================================================================
//  QS-MASSNAHMEN IN DER FERTIGUNG (seit 1.790.0, Wunsch Patrick
//  24. November 2026: „per QS-Knopf dort wie Vorbereiten, und dort auch
//  gleich die notwendigen Prüfmittel“, „im Pad Mode, sobald man den
//  Auftrag startet, also auf den nächsten umstellt, und auch wenn man
//  auf läuft stellt, eine Meldung zum Quittieren“)
//
//  Woher: In D7 einer Reklamation „In die Fertigung übernehmen“ und ein
//  Satz für die Maschine. Speichern schreibt das je HOCO Nr. nach
//  app_config.qs_massnahmen {"<hoco>": [{rk_id, rk_nr, text, punkte, am}]}
//  (lesen dürfen alle, schreiben nur Admins, und Reklamationen sind nur
//  für Admins).
//
//  Wohin:
//    – Knopf „QS“ im Auftragsfenster neben „Vorbereiten“: Massnahmen und
//      die Lehren und Messmittel aus den Prüf-Stammdaten der HOCO Nr.
//    – Beim Umstellen auf Rüsten und auf läuft (zustandSetzen) ein grosses
//      Fenster mit den Massnahmen, quittiert mit Kürzel; je Massnahme eine
//      Zeile in qs_quittungen (sql/qs-quittungen.sql). Die Reklamation zeigt
//      sie in D8 als Nachweis.
//  Nicht für Externe. Fehlt die Tabelle, hält nichts auf.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { stammMitMassen, lehrenAus, pruefmittelFuer, pruefmittelAlleLaden, pmOrtText } from "../daten/pruefbericht.js";

export const QS_MASSNAHMEN = "qs_massnahmen";
const QUITT = "qs_quittungen";
const fehlt = (f) => !!f && /qs_quittungen|does not exist|schema cache/i.test(String(f.message || f));
const leer = (v) => v === null || v === undefined || String(v).trim() === "";

let vorrat = null, vorratAm = 0;
export async function massnahmenAlle(frisch) {
  if (!frisch && vorrat && Date.now() - vorratAm < 60000) return vorrat;
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert").eq("schluessel", QS_MASSNAHMEN).maybeSingle(), 8000, "QS-Massnahmen");
    if (r && !r.error) {
      const w = r.data && r.data.wert;
      vorrat = (typeof w === "string" ? JSON.parse(w) : w) || {};
      vorratAm = Date.now();
    }
  } catch (f) { /* ohne Massnahmen */ }
  return vorrat || {};
}
export async function massnahmenFuer(hoco, frisch) {
  if (leer(hoco)) return [];
  const a = await massnahmenAlle(frisch);
  return Array.isArray(a[String(hoco).trim()]) ? a[String(hoco).trim()] : [];
}

// Aus der Reklamation (nur Admins speichern sie): Eintrag dieser
// Reklamation ersetzen oder entfernen
export async function massnahmeVeroeffentlichen(rk) {
  const a = { ...(await massnahmenAlle(true)) };
  let geaendert = false;
  for (const h of Object.keys(a)) {
    const l = (a[h] || []).filter((m) => m.rk_id !== rk.id);
    if (l.length !== (a[h] || []).length) { geaendert = true; if (l.length) a[h] = l; else delete a[h]; }
  }
  const k = rk.kopf || {};
  const hoco = String(rk.hoco_nr || "").trim();
  if (k.fertigung === "ja" && hoco && !leer(k.fertigung_text)) {
    const punkte = (rk.achtd && Array.isArray(rk.achtd.d7) ? rk.achtd.d7 : []).slice(0, 12);
    a[hoco] = (a[hoco] || []).concat([{ rk_id: rk.id, rk_nr: rk.nr, text: String(k.fertigung_text).trim(), punkte, am: new Date().toISOString() }]);
    geaendert = true;
  }
  if (!geaendert) return;
  const r = await alt.db.from("app_config").upsert([{ schluessel: QS_MASSNAHMEN, wert: JSON.stringify(a) }], { onConflict: "schluessel" });
  if (r && r.error) throw r.error;
  vorrat = a; vorratAm = Date.now();
}

export async function quittungenFuerRk(rkId) {
  if (!rkId) return [];
  try {
    const r = await alt.db.from(QUITT).select("*").eq("rk_id", rkId).order("am", { ascending: false }).limit(100);
    return r.error ? [] : r.data || [];
  } catch (f) { return []; }
}

const maschineName = (j) => {
  const m = (alt.prod.maschinen || []).find((x) => x.id === j.machine_id);
  return j.maschine || (m && m.name) || "";
};

// ---------- Knopf QS im Auftragsfenster ----------
export function qsOeffnen(auftrag) {
  if (!auftrag) return;
  fensterOeffnen((zu) => <QsFenster auftrag={auftrag} zu={zu} />, null, "vorbereiten-huelle qs-huelle");
}

function QsFenster({ auftrag, zu }) {
  const [m, setM] = useState(null);
  const [pm, setPm] = useState(null);
  const [quitt, setQuitt] = useState([]);
  const hoco = auftrag.job_number;
  useEffect(() => {
    let weg = false;
    massnahmenFuer(hoco, true).then((l) => { if (!weg) setM(l); });
    (async () => {
      try {
        const st = await stammMitMassen(hoco);
        if (!st || !(st.zeilen || []).length) { if (!weg) setPm({ lehren: [], messmittel: [], ohne: true }); return; }
        const l = lehrenAus(st);
        // seit 1.838.0 für alle (ausser Externe) aus der ganzen Prüfmittelverwaltung
        const liste = await pruefmittelAlleLaden();
        l.lehren.forEach((x) => { x.treffer = liste.length ? pruefmittelFuer(x, liste, hoco) : null; });
        if (!weg) setPm(l);
      } catch (f) { if (!weg) setPm({ lehren: [], messmittel: [], fehler: alt.fehlertext(f) }); }
    })();
    if (auftrag.id) alt.db.from(QUITT).select("*").eq("job_id", auftrag.id).order("am", { ascending: false })
      .then((r) => { if (!weg && r && !r.error) setQuitt(r.data || []); }, () => {});
    return () => { weg = true; };
  }, []);

  return (
    <div className="dialog vorbereiten qs-fenster" id="qs-fenster">
      <div className="vb-kopf">
        <div><h2>QS · {hoco}</h2>
          <span className="klein">{maschineName(auftrag)}{auftrag.fa_nr ? " · FA " + auftrag.fa_nr : ""}</span></div>
        <button type="button" className="dialog__schliessen-inline" title="Schliessen" aria-label="Schliessen" data-zu="" onClick={zu}>✕</button>
      </div>
      <div className="vb-rolle">
        <h3>Massnahmen aus Reklamationen {m && m.length ? <span>{m.length}</span> : null}</h3>
        {m === null ? <p className="klein vb-hinweis">Lädt …</p>
          : !m.length ? <p className="klein vb-hinweis" id="qs-keine">Für diese HOCO Nr. gibt es keine Massnahmen.</p>
          : <ul className="qs-liste">{m.map((x) => {
              const q = quitt.filter((y) => y.rk_id === x.rk_id);
              return <li key={x.rk_id} className="qs-massnahme" data-qs-massnahme={x.rk_nr}>
                <b>{x.text}</b>
                {!!(x.punkte || []).length && <span className="vb-klein">{x.punkte.join(" · ")}</span>}
                <span className="vb-klein">aus {x.rk_nr}</span>
                {q.map((y) => <span key={y.id} className="qs-quittiert">✓ {y.anlass === "laeuft" ? "Läuft" : "Rüsten"}: {y.kuerzel} · {alt.datumZeitKurz(y.am)}</span>)}
              </li>;
            })}</ul>}
        <h3>Prüfmittel</h3>
        {pm === null ? <p className="klein vb-hinweis">Lädt …</p>
          : pm.fehler ? <p className="klein vb-hinweis">{pm.fehler}</p>
          : pm.ohne ? <p className="klein vb-hinweis" id="qs-ohne-stamm">In den Stammdaten der HOCO Nr. sind noch keine Masse mit Prüfmitteln.</p>
          : <ul className="qs-liste" id="qs-pruefmittel">
              {pm.lehren.map((x) => <li key={x.name + x.mass} className="qs-pm">
                <b>{x.name}</b> <span>{x.mass}</span>
                {x.treffer && (x.treffer.length
                  ? <span className="qs-pm__ok">{x.treffer.slice(0, 3).map((p) => (p.nr || p.bezeichnung) + " · " + pmOrtText(p)).join(" / ") + (x.treffer.length > 3 ? " … (" + x.treffer.length + ")" : "")}</span>
                  : <span className="qs-pm__fehlt">nicht in der Prüfmittelverwaltung</span>)}
              </li>)}
              {!pm.lehren.length && <li className="klein vb-hinweis">Keine Prüfmittel angegeben.</li>}
            </ul>}
      </div>
    </div>
  );
}

// ---------- Quittieren beim Umstellen ----------
// Gibt true zurück, wenn quittiert (oder nichts zu quittieren). Mit
// pflicht wirft Abbrechen einen Fehler, damit der Zustand bleibt.
export async function qsQuittierenFragen(j, anlass, pflicht) {
  if (!QS_NEU || !QS_SPERRE) return;
  if (!j || !j.id || !j.job_number || alt.istExtern()) return true;
  const liste = await massnahmenFuer(j.job_number, true);
  if (!liste.length) return true;
  let schon = [];
  try {
    const r = await alt.db.from(QUITT).select("rk_id").eq("job_id", j.id).eq("anlass", anlass);
    if (r.error) { if (fehlt(r.error)) return true; } else schon = (r.data || []).map((x) => x.rk_id);
  } catch (f) { return true; }
  const offen = liste.filter((m) => !schon.includes(m.rk_id));
  if (!offen.length) return true;
  const kuerzel = await new Promise((fertig) => {
    let ergebnis = null;
    fensterOeffnen((zu) => <Quittieren j={j} anlass={anlass} liste={offen}
      ok={(k) => { ergebnis = k; zu(); }} zu={zu} />, () => fertig(ergebnis), "qs-quitt-huelle");
  });
  if (!kuerzel) {
    if (pflicht) throw new Error("Zuerst die QS-Massnahmen für " + j.job_number + " quittieren.");
    return false;
  }
  const zeilen = offen.map((m) => ({ job_id: j.id, hoco_nr: j.job_number, rk_id: m.rk_id, rk_nr: m.rk_nr, anlass,
    kuerzel, fa_nr: j.fa_nr || null, maschine: maschineName(j) || null }));
  const r = await alt.db.from(QUITT).insert(zeilen);
  if (r.error && !fehlt(r.error)) alt.meldung("Quittung nicht gespeichert: " + alt.fehlertext(r.error), "fehler");
  else alt.meldung("QS-Massnahmen quittiert (" + kuerzel + ").", "gut");
  return true;
}

function Quittieren({ j, anlass, liste, ok, zu }) {
  const [k, setK] = useState("");
  const [gelesen, setGelesen] = useState({});
  const alleGelesen = liste.every((m) => gelesen[m.rk_id]);
  const gut = /^[A-ZÄÖÜ]{2,3}$/.test(k) && alleGelesen;
  return (
    <div className="dialog qs-quitt" id="qs-quitt">
      <div className="qs-quitt__kopf">
        <span className="qs-quitt__zeichen">⚠</span>
        <div><h2>Achtung QS · {j.job_number}</h2>
          <span>{anlass === "laeuft" ? "Bevor der Auftrag läuft" : "Beim Rüsten"}{j.fa_nr ? " · FA " + j.fa_nr : ""}{maschineName(j) ? " · " + maschineName(j) : ""}</span></div>
      </div>
      <p className="qs-quitt__text">Bei diesem Teil gab es eine Reklamation. Bitte beachten und jeden Punkt abhaken:</p>
      <ul className="qs-quitt__liste">
        {liste.map((m) => <li key={m.rk_id}>
          <button type="button" className={"qs-quitt__punkt" + (gelesen[m.rk_id] ? " an" : "")} data-qs-quitt={m.rk_nr}
            aria-pressed={!!gelesen[m.rk_id]} onClick={() => setGelesen((g) => ({ ...g, [m.rk_id]: !g[m.rk_id] }))}>
            <span className="vb-haken">{gelesen[m.rk_id] ? "✓" : ""}</span>
            <span><b>{m.text}</b>{!!(m.punkte || []).length && <small>{m.punkte.join(" · ")}</small>}</span>
          </button>
        </li>)}
      </ul>
      <label className="feld qs-quitt__kuerzel"><span>Kürzel (wer hat es gelesen?)</span>
        <input id="qs-quitt-kuerzel" data-fokus="" value={k} maxLength={3} placeholder="z. B. JPF" autoComplete="off"
          onChange={(e) => setK(e.target.value.toUpperCase().replace(/[^A-ZÄÖÜ]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" && gut) ok(k); }} /></label>
      <div className="dialog__knoepfe">
        <button type="button" className="knopf" onClick={zu}>Abbrechen</button>
        <button type="button" className="knopf knopf--primaer" id="qs-quitt-ok" disabled={!gut} onClick={() => ok(k)}>Quittieren</button>
      </div>
    </div>
  );
}
