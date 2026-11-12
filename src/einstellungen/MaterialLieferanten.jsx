// =================================================================
//  EINSTELLUNGEN → FARBEN UND MATERIAL → MATERIAL-LIEFERANTEN
//  (seit 1.506.0, Wunsch Patrick 12. November 2026: „Lieferant
//  Lieferbarkeit in Einstellungen definierbar machen, wenn möglich, ist
//  nicht überall möglich“). Je Lieferant: Name, weitere Schreibweisen
//  (so steht er im Feld „Menge vorhanden oder bestellt“), Lieferzeit in
//  Arbeitstagen, Bestelltage, Bestellschluss. Leer heisst unbekannt, dann
//  zeigt der Planer nichts dazu. Nur Admins. Auch im Planer des Pads.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { lieferantenLaden, lieferantenSpeichern, WOCHENTAGE } from "../daten/planer.js";

export default function MaterialLieferanten({ nachSpeichern }) {
  const [liste, setListe] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  useEffect(() => { lieferantenLaden().then((l) => setListe(l.map((x) => ({ ...x, aliasText: (x.aliase || []).join(", ") })))); }, []);
  if (!liste) return <p className="ml-leer">Wird geladen …</p>;

  const setzen = (i, feld, wert) => {
    setListe(liste.map((l, k) => (k === i ? { ...l, [feld]: wert } : l)));
    setGeaendert(true);
  };
  const tagUm = (i, n) => {
    const t = new Set(liste[i].bestelltage || []);
    if (t.has(n)) t.delete(n); else t.add(n);
    setzen(i, "bestelltage", [...t]);
  };
  const speichern = async () => {
    try {
      const neu = await lieferantenSpeichern(liste.map((l) => ({ ...l, aliase: String(l.aliasText || "").split(",") })));
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
          <span>Lieferant</span><span>Weitere Schreibweisen</span><span>Lieferzeit</span><span>Bestellen an</span><span>Bestellschluss</span><span />
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
            <span className="ml-wochentage">
              {WOCHENTAGE.map(([n, t]) => (
                <button key={n} type="button" className={"ml-tag" + ((l.bestelltage || []).includes(n) ? " ml-tag--an" : "")}
                  onClick={() => tagUm(i, n)}>{t}</button>
              ))}
            </span>
            <input className="feld" value={l.schluss || ""} placeholder="11:00" aria-label="Bestellschluss"
              onChange={(e) => setzen(i, "schluss", e.target.value)} />
            <button className="knopf knopf--klein" title="Lieferant entfernen" onClick={() => {
              setListe(liste.filter((x, k) => k !== i)); setGeaendert(true); }}>✕</button>
          </div>
        ))}
      </div>
      <p className="ml-hinweis">Lieferzeit leer = unbekannt. Keine Bestelltage gewählt = jeden Tag. Der Name muss so im Feld „Menge vorhanden
        oder bestellt“ der Aufträge stehen (z.B. „300 kg · Schmobi 2026008672“), sonst unter „Weitere Schreibweisen“, mit Komma getrennt.</p>
      <div className="ml-knoepfe">
        <button className="knopf" id="ml-neu" onClick={() => { setListe([...liste, { name: "", aliasText: "", tage: null, bestelltage: [], schluss: "" }]); setGeaendert(true); }}>
          + Lieferant</button>
        <button className="knopf knopf--haupt" id="ml-speichern" disabled={!geaendert} onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
