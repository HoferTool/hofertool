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
import { Logo } from "../seiten/bestellungen/teile.jsx";
import { lieferantenLaden, lieferantenSpeichern, lieferantLogoDaten, regelnLaden, regelnSpeichern, WOCHENTAGE } from "../daten/planer.js";

export default function MaterialLieferanten({ nachSpeichern }) {
  const [liste, setListe] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  const [regeln, setRegeln] = useState([]);
  const [offen, setOffen] = useState(-1);
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

  // Übersicht wie eine Liste im HoferTool (seit 1.519.0, Patrick 13. November 2026: „sieht nicht
  // Tool aus, informativ aber nicht übersichtlich“): je Lieferant eine Zeile nur zum Lesen,
  // Antippen klappt die Felder darunter auf, immer nur einer offen.
  const offenWahl = (i) => setOffen(offen === i ? -1 : i);
  return (
    <div className="ml" id="material-lieferanten">
      <div className="ml-liste" role="table">
        <div className="ml-li ml-li--kopf" role="row">
          <span /><span>Lieferant</span><span>Lieferzeit</span><span>Bestellschluss</span><span>Bestellen an</span><span>Liefert an</span><span>Bemerkung</span><span />
        </div>
        {liste.map((l, i) => (
          <div className={"ml-eintrag" + (offen === i ? " ml-eintrag--offen" : "")} key={i} data-mllieferant={l.name}>
            <div className="ml-li" role="row" tabIndex={0} data-mlzeile="" onClick={() => offenWahl(i)}
              onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) offenWahl(i); }}>
              <span className="ml-li__logo"><Logo lief={lieferantLogoDaten(l)} name={l.name} /></span>
              <span className="ml-li__name"><b>{l.name || "Neuer Lieferant"}</b>
                {l.aliasText && <small>auch: {l.aliasText}</small>}</span>
              <span data-lbl="Lieferzeit">{tageText(l.tage)}</span>
              <span data-lbl="Bestellschluss">{l.schluss || <i className="ml-li__leer">–</i>}</span>
              <span data-lbl="Bestellen an"><TageMini an={l.bestelltage} leer="jeden Tag" /></span>
              <span data-lbl="Liefert an"><TageMini an={l.liefertage} leer="unbekannt" gruen /></span>
              <span className="ml-li__notiz">{l.notiz || <i className="ml-li__leer">–</i>}</span>
              <span className="ml-li__pfeil" aria-hidden="true">{offen === i ? "▴" : "✎"}</span>
            </div>
            {offen === i && (
              <div className="ml-form">
                <label><small>Name</small>
                  <input className="feld" value={l.name} placeholder="Name" aria-label="Name" autoFocus={!l.name}
                    onChange={(e) => setzen(i, "name", e.target.value)} /></label>
                <label><small>Weitere Schreibweisen (mit Komma)</small>
                  <input className="feld" value={l.aliasText || ""} placeholder="z.B. Pormetall" aria-label="Weitere Schreibweisen"
                    onChange={(e) => setzen(i, "aliasText", e.target.value)} /></label>
                <label><small>Lieferzeit in Arbeitstagen</small>
                  <input className="feld" inputMode="numeric" value={l.tage === null || l.tage === undefined ? "" : l.tage}
                    placeholder="unbekannt" aria-label="Lieferzeit in Arbeitstagen" data-mltage=""
                    onChange={(e) => setzen(i, "tage", e.target.value.replace(/[^\d]/g, ""))} /></label>
                <label><small>Bestellschluss</small>
                  <input className="feld" value={l.schluss || ""} placeholder="z.B. 11:00" aria-label="Bestellschluss"
                    onChange={(e) => setzen(i, "schluss", e.target.value)} /></label>
                <div className="ml-form__tage"><small>Bestellen an (keiner = jeden Tag)</small>
                  <span className="ml-wochentage">{WOCHENTAGE.map(([n, t]) => (
                    <button key={n} type="button" className={"ml-tag" + ((l.bestelltage || []).includes(n) ? " ml-tag--an" : "")}
                      onClick={() => tagUm(i, n)}>{t}</button>))}</span></div>
                <div className="ml-form__tage" data-mlliefert=""><small>Liefert an (alle = täglich)</small>
                  <span className="ml-wochentage">{WOCHENTAGE.map(([n, t]) => (
                    <button key={n} type="button" className={"ml-tag ml-tag--liefer" + ((l.liefertage || []).includes(n) ? " ml-tag--an" : "")}
                      onClick={() => tagUm(i, n, "liefertage")}>{t}</button>))}</span></div>
                <label><small>Website (fürs Logo)</small>
                  <input className="feld" value={l.website || ""} placeholder="z.B. steeltec.ch" aria-label="Website" data-mlwebsite=""
                    onChange={(e) => setzen(i, "website", e.target.value)} /></label>
                <label><small>Eigenes Logo (Bildadresse, freiwillig)</small>
                  <input className="feld" value={l.logo || ""} placeholder="leer = Symbol der Website" aria-label="Eigenes Logo"
                    onChange={(e) => setzen(i, "logo", e.target.value)} /></label>
                <label className="ml-form__breit"><small>Bemerkung (Kontakt, Sortiment, Shop …)</small>
                  <textarea className="feld ml-notiz" rows={2} value={l.notiz || ""} aria-label="Bemerkung" data-mlnotiz=""
                    onChange={(e) => setzen(i, "notiz", e.target.value)} /></label>
                <div className="ml-form__knoepfe ml-form__breit">
                  <button className="knopf knopf--klein" onClick={() => {
                    setListe(liste.filter((x, k) => k !== i)); setOffen(-1); setGeaendert(true); }}>Lieferant entfernen</button>
                  <button className="knopf knopf--klein" onClick={() => setOffen(-1)}>Zuklappen</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="ml-knoepfe ml-knoepfe--links">
        <button className="knopf" id="ml-neu" onClick={() => {
          setListe([...liste, { name: "", aliasText: "", tage: null, bestelltage: [], liefertage: [], schluss: "", notiz: "", website: "", logo: "" }]);
          setOffen(liste.length); setGeaendert(true); }}>+ Lieferant</button>
      </div>
      <p className="ml-hinweis">Der Name muss so im Feld „Menge vorhanden oder bestellt“ der Aufträge stehen
        (z.B. „300 kg · Schmobi 2026008672“), sonst unter „Weitere Schreibweisen“.</p>
      <h3 className="ml-titel">Regeln je Material</h3>
      <p className="ml-hinweis">„Muss bei“ gilt für den Vorschlag im Planer, „Kann auch bei“ ist nur Info.
        Alle Wörter müssen im Material vorkommen: „Messing Rohr“ gilt für jedes Messing-Rohr, „Automatenstahl rd 24“ nur für Ø24.</p>
      <div className="ml-regeln" id="ml-regeln">
        <div className="ml-regel ml-regel--kopf"><span>Material</span><span>Muss bei</span><span>Kann auch bei (Info)</span><span /></div>
        {regeln.map((r, i) => {
          const rs = (feld, wert) => { setRegeln(regeln.map((x, k) => (k === i ? { ...x, [feld]: wert } : x))); setGeaendert(true); };
          return (
            <div className="ml-regel" key={i} data-mlregel={r.material}>
              <input className="feld" value={r.material} placeholder="z.B. Messing Rohr" aria-label="Material" onChange={(e) => rs("material", e.target.value)} />
              <select className="feld" value={r.muss || ""} aria-label="Muss bei" onChange={(e) => rs("muss", e.target.value)}>
                <option value="">– keiner –</option>
                {liste.filter((l) => l.name).map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
              <input className="feld" value={r.kannText || ""} placeholder="z.B. Notz" aria-label="Kann auch bei" onChange={(e) => rs("kannText", e.target.value)} />
              <button className="knopf knopf--klein" title="Regel löschen" onClick={() => {
                setRegeln(regeln.filter((x, k) => k !== i)); setGeaendert(true); }}>✕</button>
            </div>
          );
        })}
      </div>
      <div className="ml-knoepfe ml-knoepfe--links">
        <button className="knopf" id="ml-regel-neu" onClick={() => { setRegeln([...regeln, { material: "", muss: "", kannText: "" }]); setGeaendert(true); }}>
          + Regel</button>
      </div>
      <div className="ml-fuss">
        <span>{geaendert ? "Nicht gespeichert" : ""}</span>
        <button className="knopf knopf--haupt" id="ml-speichern" disabled={!geaendert} onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}

const tageText = (t) => (t === null || t === undefined || t === "" ? <i className="ml-li__leer">unbekannt</i>
  : `${t} ${Number(t) === 1 ? "Arbeitstag" : "Arbeitstage"}`);

// Fünf kleine Tage nebeneinander, gewählte gefüllt; keiner gewählt = Text
function TageMini({ an, leer, gruen }) {
  const t = an || [];
  if (!t.length) return <i className="ml-li__leer">{leer}</i>;
  return (
    <span className="ml-mini">{WOCHENTAGE.map(([n, x]) => (
      <span key={n} className={"ml-mini__tag" + (t.includes(n) ? (gruen ? " ml-mini__tag--gruen" : " ml-mini__tag--an") : "")}>{x}</span>
    ))}</span>
  );
}
