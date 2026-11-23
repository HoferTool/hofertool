// =================================================================
//  HOFERCAM: Fenster Optimierung (seit 1.692.0, Wunsch Patrick
//  22. November 2026). Zuerst das Material, dann die Vorschläge als
//  Liste, je Bearbeitung, das Wichtigste zuerst. Rechnung in
//  camOptimierung.js.
// =================================================================

import { useEffect, useMemo, useState } from "react";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { alt } from "../../bruecke.jsx";
import { WERKSTOFFE, werkstoffAusBez, analysieren } from "./camOptimierung.js";

let offenZu = null;
export function optimierungOeffnen(w) {
  if (offenZu) offenZu();
  offenZu = fensterOeffnen((zu) => <Optimierung w={w} zu={zu} />, () => { offenZu = null; }, "cam-opt-huelle");
}

const MERKEN = "hofer.cam.optWerkstoff";
const merken = (k) => { try { localStorage.setItem(MERKEN, k); } catch (e) { /* egal */ } };
const gemerkt = () => { try { return localStorage.getItem(MERKEN) || ""; } catch (e) { return ""; } };
const STUFE_TEXT = { wichtig: "Wichtig", empfehlung: "Empfehlung", tipp: "Tipp" };
const sek = (t) => (t >= 60 ? Math.floor(t / 60) + " min " + Math.round(t % 60) + " s" : (Math.round(t * 10) / 10) + " s");

function Optimierung({ w, zu }) {
  // Seit 1.729.0 zuerst das Material aus den Kopfdaten
  const kopfM = werkstoffAusBez(w.material, alt.werkstoffErkennen);
  const [wahl, setWahl] = useState(kopfM ? kopfM.key : gemerkt());
  const [text, setText] = useState(kopfM ? String(w.material).trim() : "");
  const [hinweis, setHinweis] = useState("");
  const [fertig, setFertig] = useState(null);
  const erkannt = useMemo(() => werkstoffAusBez(text, alt.werkstoffErkennen), [text]);

  // Material des jüngsten Auftrags dieser HOCO Nr. vorschlagen
  useEffect(() => {
    const hoco = String(w.hoco || "").trim();
    if (kopfM || !/^\d{4,6}-\d{3,4}$/.test(hoco) || !alt.db) return undefined;
    let weg = false;
    (async () => {
      try {
        const r = await alt.db.from("jobs").select("material_bez, planned_from").eq("job_number", hoco)
          .not("material_bez", "is", null).order("planned_from", { ascending: false }).limit(1);
        const bez = r && !r.error && r.data && r.data[0] ? String(r.data[0].material_bez || "").trim() : "";
        if (weg || !bez) return;
        const m = werkstoffAusBez(bez, alt.werkstoffErkennen);
        setText(bez);
        if (m) { setWahl(m.key); setHinweis("Aus dem letzten Auftrag " + hoco + ": " + bez); }
      } catch (e) { /* ohne Verbindung keine Vorgabe */ }
    })();
    return () => { weg = true; };
  }, []);

  const los = (key) => {
    const m = WERKSTOFFE.find((x) => x.key === key);
    if (!m) return;
    merken(key);
    try { setFertig(analysieren(w, m)); }
    catch (e) { alt.fehlerMerken && alt.fehlerMerken("HOFERCAM Optimierung", String(e && e.stack || e)); alt.meldung("Analyse ging nicht: " + (e && e.message || e), "fehler"); }
  };

  return (
    <div className="dialog cam-opt" data-cam-opt="1" role="dialog" aria-label="Optimierung">
      <div className="cam-opt__kopf">
        <h2>Optimierung</h2>
        <button className="knopf knopf--klein" onClick={zu} aria-label="Schliessen">✕</button>
      </div>
      {!fertig ? (<>
        <p className="cam-opt__frage">Aus welchem Material ist das Teil?</p>
        <div className="cam-opt__werkstoffe">
          {WERKSTOFFE.map((m) => (
            <button key={m.key} className={"knopf" + (wahl === m.key ? " knopf--haupt" : "")} data-cam-opt-werkstoff={m.key}
              onClick={() => setWahl(m.key)} onDoubleClick={() => los(m.key)}>{m.name}</button>))}
        </div>
        <label className="cam-opt__feld">oder Bezeichnung eintippen
          <input type="text" data-cam-opt-text value={text} placeholder="z.B. 1.4305 rd 12 oder CuZn39Pb3"
            onChange={(e) => { setText(e.target.value); const m = werkstoffAusBez(e.target.value, alt.werkstoffErkennen); if (m) setWahl(m.key); setHinweis(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && wahl) los(wahl); }} />
        </label>
        <div className="cam-opt__hinweis">{hinweis || (text.trim() ? (erkannt ? "Erkannt: " + erkannt.name : "nicht erkannt, bitte oben wählen") : "")}</div>
        <div className="cam-opt__knoepfe">
          <button className="knopf knopf--haupt" data-cam-opt-los disabled={!wahl} onClick={() => los(wahl)}>Programm analysieren</button>
        </div>
      </>) : (<Ergebnis e={fertig} zurueck={() => setFertig(null)} />)}
    </div>
  );
}

function Punkt({ p }) {
  return (
    <li className={"cam-opt__punkt cam-opt__punkt--" + p.stufe} data-cam-opt-stufe={p.stufe}>
      <span className="cam-opt__stufe">{STUFE_TEXT[p.stufe]}</span>
      <span className="cam-opt__text">{p.text}
        {p.zeile && <code className="cam-opt__zeile">{p.zeile}</code>}</span>
    </li>
  );
}

function Ergebnis({ e, zurueck }) {
  const mit = e.bearbeitungen.filter((b) => b.liste.length);
  const ohne = e.bearbeitungen.filter((b) => !b.liste.length);
  const summe = e.zahlen.wichtig + e.zahlen.empfehlung + e.zahlen.tipp;
  return (<>
    <div className="cam-opt__stand">
      <span>Material: <b>{e.werkstoff.name}</b></span>
      {e.gesamt > 0 && <span>Laufzeit geschätzt: <b>{sek(e.gesamt)}</b> je Teil (ohne Wartezeiten, Eilgang 30 m/min angenommen)</span>}
      <button className="knopf knopf--klein" data-cam-opt-zurueck onClick={zurueck}>Material ändern</button>
    </div>
    <div className="cam-opt__zahlen" data-cam-opt-zahl={summe}>
      {summe ? <>{e.zahlen.wichtig} wichtig · {e.zahlen.empfehlung} Empfehlungen · {e.zahlen.tipp} Tipps</> : "Keine Vorschläge, das Programm sieht gut aus."}
    </div>
    {e.allgemein.length > 0 && <section className="cam-opt__gruppe">
      <h3>Ganzes Programm</h3>
      <ul>{e.allgemein.map((p, i) => <Punkt key={i} p={p} />)}</ul>
    </section>}
    {mit.map((b) => (
      <section className="cam-opt__gruppe" key={b.id} data-cam-opt-block={b.id}>
        <h3>{b.titel} <small>{b.kanal}{b.zeit > 0 ? " · ca. " + sek(b.zeit) : ""}</small></h3>
        <ul>{b.liste.map((p, i) => <Punkt key={i} p={p} />)}</ul>
      </section>))}
    {ohne.length > 0 && <p className="cam-opt__ok">Ohne Vorschlag: {ohne.map((b) => b.titel).join(", ")}</p>}
    <p className="cam-opt__fuss">Richtwerte für Hartmetall-Werkzeuge, nur als Hinweis. Das Programm wird nicht geändert.</p>
  </>);
}
