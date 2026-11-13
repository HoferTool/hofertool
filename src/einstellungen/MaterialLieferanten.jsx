// =================================================================
//  EINSTELLUNGEN → FARBEN UND MATERIAL → MATERIAL-LIEFERANTEN
//  (seit 1.507.0, Wunsch Patrick 12. November 2026: „Lieferant
//  Lieferbarkeit in Einstellungen definierbar machen, wenn möglich, ist
//  nicht überall möglich“). Je Lieferant: Name, weitere Schreibweisen
//  (so steht er im Feld „Menge vorhanden oder bestellt“), Lieferzeit in
//  Arbeitstagen, Bestelltage, Bestellschluss. Leer heisst unbekannt, dann
//  zeigt der Planer nichts dazu. Nur Admins. Auch im Planer des Pads.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { lieferantenLaden, lieferantenSpeichern, regelnLaden, regelnSpeichern, WOCHENTAGE } from "../daten/planer.js";

export default function MaterialLieferanten({ nachSpeichern }) {
  const [liste, setListe] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  const [regeln, setRegeln] = useState([]);
  useEffect(() => {
    lieferantenLaden().then((l) => setListe(l.map((x) => ({ ...x, aliasText: (x.aliase || []).join(", ") }))));
    regelnLaden().then((r) => setRegeln(r.map((x) => ({ ...x, kannText: (x.kann || []).join(", ") }))));
  }, []);
  if (!liste) return <p className="ml-leer">Wird geladen …</p>;

  const setzen = (i, feld, wert) => {
    setListe(liste.map((l, k) => (k === i ? { ...l, [feld]: wert } : l)));
    setGeaendert(true);
  };
  const tagUm = (i, n, feld = "bestelltage") => {
    const t = new Set(liste[i][feld] || []);
    if (t.has(n)) t.delete(n); else t.add(n);
    setzen(i, feld, [...t]);
  };
  const speichern = async () => {
    try {
      const neu = await lieferantenSpeichern(liste.map((l) => ({ ...l, aliase: String(l.aliasText || "").split(",") })));
      const rg = await regelnSpeichern(regeln.map((r) => ({ ...r, kann: String(r.kannText || "").split(",") })));
      setRegeln(rg.map((x) => ({ ...x, kannText: (x.kann || []).join(", ") })));
      setListe(neu.map((x) => ({ ...x, aliasText: (x.aliase || []).join(", ") })));
      setGeaendert(false);
      alt.meldung("Lieferanten gespeichert.", "gut");
      if (nachSpeichern) nachSpeichern();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <div className="ml" id="material-lieferanten">
      <div className="ml-tabelle">
        <div className="ml-zeile ml-zeile--kopf">
          <span>Lieferant</span><span>Weitere Schreibweisen</span><span>Lieferzeit</span><span>Bestellschluss</span><span />
        </div>
        {liste.map((l, i) => (
          <div className="ml-zeile" key={i} data-mllieferant={l.name}>
            <input className="feld" value={l.name} placeholder="Name" aria-label="Name" onChange={(e) => setzen(i, "name", e.target.value)} />
            <input className="feld" value={l.aliasText || ""} placeholder="z.B. Pormetall" aria-label="Weitere Schreibweisen"
              onChange={(e) => setzen(i, "aliasText", e.target.value)} />
            <span className="ml-tage">
              <input className="feld" inputMode="numeric" value={l.tage === null || l.tage === undefined ? "" : l.tage}
                placeholder="?" aria-label="Lieferzeit in Arbeitstagen" data-mltage=""
                onChange={(e) => setzen(i, "tage", e.target.value.replace(/[^\d]/g, ""))} />
              <small>Arbeitstage</small>
            </span>
            <span className="ml-wochentage ml-wt-best"><small>Bestellen an</small>
              {WOCHENTAGE.map(([n, t]) => (
                <button key={n} type="button" className={"ml-tag" + ((l.bestelltage || []).includes(n) ? " ml-tag--an" : "")}
                  onClick={() => tagUm(i, n)}>{t}</button>
              ))}
            </span>
            <span className="ml-wochentage ml-wt-lief" data-mlliefert=""><small>Liefert an</small>
              {WOCHENTAGE.map(([n, t]) => (
                <button key={n} type="button" className={"ml-tag ml-tag--liefer" + ((l.liefertage || []).includes(n) ? " ml-tag--an" : "")}
                  onClick={() => tagUm(i, n, "liefertage")}>{t}</button>
              ))}
            </span>
            <input className="feld" value={l.schluss || ""} placeholder="11:00" aria-label="Bestellschluss"
              onChange={(e) => setzen(i, "schluss", e.target.value)} />
            <button className="knopf knopf--klein" title="Lieferant entfernen" onClick={() => {
              setListe(liste.filter((x, k) => k !== i)); setGeaendert(true); }}>✕</button>
            <textarea className="feld ml-notiz" rows={1} value={l.notiz || ""} placeholder="Bemerkung (Kontakt, Sortiment, Shop …)"
              aria-label="Bemerkung" data-mlnotiz="" onChange={(e) => setzen(i, "notiz", e.target.value)} />
          </div>
        ))}
      </div>
      <p className="ml-hinweis">Lieferzeit leer = unbekannt. Keine Bestelltage gewählt = jeden Tag. „Liefert an“: an welchen Tagen das Material bei uns ankommt, alle fünf = täglich, keiner = unbekannt. Der Name muss so im Feld „Menge vorhanden
        oder bestellt“ der Aufträge stehen (z.B. „300 kg · Schmobi 2026008672“), sonst unter „Weitere Schreibweisen“, mit Komma getrennt.</p>
      <h3 className="ml-titel">Regeln je Material</h3>
      <p className="ml-hinweis">„Muss bei“ gilt für den Vorschlag im Planer, „Kann auch bei“ ist nur Info (zum Beispiel Notfall-Lieferant).
        Alle Wörter müssen im Material vorkommen: „Messing Rohr“ gilt für jedes Messing-Rohr, „Automatenstahl rd 24“ nur für Ø24.</p>
      <div className="ml-regeln" id="ml-regeln">
        {regeln.map((r, i) => {
          const rs = (feld, wert) => { setRegeln(regeln.map((x, k) => (k === i ? { ...x, [feld]: wert } : x))); setGeaendert(true); };
          return (
            <div className="ml-regel" key={i} data-mlregel={r.material}>
              <input className="feld" value={r.material} placeholder="z.B. Messing Rohr" aria-label="Material" onChange={(e) => rs("material", e.target.value)} />
              <label><small>Muss bei</small>
                <select className="feld" value={r.muss || ""} onChange={(e) => rs("muss", e.target.value)}>
                  <option value="">– keiner –</option>
                  {liste.filter((l) => l.name).map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                </select></label>
              <label><small>Kann auch bei (Info)</small>
                <input className="feld" value={r.kannText || ""} placeholder="z.B. Notz" onChange={(e) => rs("kannText", e.target.value)} /></label>
              <button className="knopf knopf--klein" title="Regel löschen" onClick={() => {
                setRegeln(regeln.filter((x, k) => k !== i)); setGeaendert(true); }}>✕</button>
            </div>
          );
        })}
      </div>
      <div className="ml-knoepfe">
        <button className="knopf" id="ml-regel-neu" onClick={() => { setRegeln([...regeln, { material: "", muss: "", kannText: "" }]); setGeaendert(true); }}>
          + Regel</button>
      </div>
      <div className="ml-knoepfe">
        <button className="knopf" id="ml-neu" onClick={() => { setListe([...liste, { name: "", aliasText: "", tage: null, bestelltage: [], liefertage: [], schluss: "", notiz: "" }]); setGeaendert(true); }}>
          + Lieferant</button>
        <button className="knopf knopf--haupt" id="ml-speichern" disabled={!geaendert} onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
