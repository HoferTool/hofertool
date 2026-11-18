// =================================================================
//  PERSONENPROFIL HOFERTIME (seit 1.626.0, Wunsch Patrick 18. November
//  2026: „es soll ein Personenprofil geben, wo Einstellungen gemacht
//  werden können, z.B. Tage mit Sollzeit bei Teilpensen oder
//  Ferienguthaben“). Nur Admins. Ein Fenster mit Abschnitten Lohn und
//  Sollzeit, Sollzeit je Wochentag, Gleitzeit-Saldo, Ferien, Planwand.
//  Sollzeit je Wochentag: leer = gleichmässig Mo–Fr (Woche × Pensum / 5);
//  trägt man Tage ein, gilt genau das (zeit_personen.soll_tage
//  {"1": 8.5, …}, 1 = Montag), ein Tag mit 0 ist frei, dort zählt auch
//  kein Ferientag.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { dauerText, ferienStufenLaden, ferienAnspruchJahr } from "../../daten/zeit.js";

const TAGE = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]];
const zahl = (x) => Number(String(x ?? "").replace(",", ".").replace(/['’\s]/g, ""));
const gut = (x) => String(x ?? "").trim() !== "" && Number.isFinite(zahl(x));
const text = (x) => (x === null || x === undefined ? "" : String(x));

function Fenster({ zu, personId, name, einst, neu }) {
  const e = einst || {};
  const jahr = new Date().getFullYear();
  const [w, setW] = useState({
    lohnart: e.lohnart || "monat",
    soll: text(e.soll_woche_h ?? 42.5),
    pensum: text(e.pensum ?? 100),
    tage: Object.fromEntries(TAGE.map(([n]) => [n, text(e.soll_tage && e.soll_tage[n])])),
    start: e.saldo_start_tag || "",
    uebertrag: e.saldo_start_min ? text(Math.round(e.saldo_start_min / 6) / 10) : "",
    ferien: text(e.ferien_tage_jahr ?? 25),
    fuebertrag: Number(e.ferien_jahr) === jahr && e.ferien_uebertrag ? text(e.ferien_uebertrag) : "",
    namen: (e.ferien_namen || []).join(", "),
    geburtstag: e.geburtstag || "",
    eintritt: e.eintritt || "",
    auto: e.ferien_auto !== false,
  });
  const [stufen, setStufen] = useState([]);
  useEffect(() => { ferienStufenLaden().then(setStufen); }, []);
  const [laeuft, setLaeuft] = useState(false);
  const setz = (k) => (ev) => setW({ ...w, [k]: ev.target.value });
  const monat = w.lohnart !== "stunde";
  const eigeneTage = TAGE.some(([n]) => gut(w.tage[n]));
  const gleich = (gut(w.soll) ? zahl(w.soll) : 42.5) * (gut(w.pensum) ? zahl(w.pensum) : 100) / 100 / 5;
  const summe = eigeneTage ? TAGE.reduce((s, [n]) => s + (gut(w.tage[n]) ? zahl(w.tage[n]) : 0), 0) : gleich * 5;

  async function speichern(ev) {
    if (ev) ev.preventDefault();
    const tage = {};
    TAGE.forEach(([n]) => { if (gut(w.tage[n]) && zahl(w.tage[n]) >= 0) tage[n] = zahl(w.tage[n]); });
    const daten = {
      person_id: personId, lohnart: w.lohnart,
      soll_woche_h: gut(w.soll) && zahl(w.soll) >= 0 ? zahl(w.soll) : 42.5,
      pensum: gut(w.pensum) && zahl(w.pensum) > 0 ? zahl(w.pensum) : 100,
      soll_tage: Object.keys(tage).length ? tage : null,
      saldo_start_tag: w.start || null,
      saldo_start_min: gut(w.uebertrag) ? Math.round(zahl(w.uebertrag) * 60) : 0,
      ferien_tage_jahr: gut(w.ferien) && zahl(w.ferien) >= 0 ? zahl(w.ferien) : 25,
      ferien_uebertrag: gut(w.fuebertrag) ? zahl(w.fuebertrag) : 0,
      ferien_jahr: Number(e.ferien_jahr) && Number(e.ferien_jahr) < jahr && !gut(w.fuebertrag) ? Number(e.ferien_jahr) : jahr,
      geburtstag: w.geburtstag || null,
      eintritt: w.eintritt || null,
      ferien_auto: !!w.auto,
      ferien_namen: String(w.namen || "").split(",").map((x) => x.trim()).filter(Boolean),
      geaendert_am: new Date().toISOString(),
    };
    setLaeuft(true);
    const vorher = await alt.rueckSichern("zeit_personen", { person_id: personId });
    const r = await alt.db.from("zeit_personen").upsert(daten, { onConflict: "person_id" });
    setLaeuft(false);
    if (r.error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Profil " + name, vorher.length
      ? alt.rueckSetz("zeit_personen", vorher[0], { person_id: personId })
      : alt.rueckWeg("zeit_personen", { person_id: personId }));
    alt.meldung("Gespeichert.", "gut");
    zu();
    neu();
  }

  return (
    <div className="dialog ze-profil" role="dialog" aria-modal="true" id="ze-profil">
      <button className="dialog__x" aria-label="Schliessen" onClick={zu}>✕</button>
      <h2>Profil {name}</h2>
      <form onSubmit={speichern}>
        <fieldset className="ze-profil__teil">
          <legend>Lohn und Sollzeit</legend>
          <label className="feld"><span>Lohnart</span>
            <select value={w.lohnart} onChange={setz("lohnart")} id="ze-p-lohnart">
              <option value="monat">Monatslohn (mit Soll und Gleitzeit)</option>
              <option value="stunde">Stundenlohn (nur Stunden)</option>
            </select></label>
          {monat && <div className="ze-profil__zwei">
            <label className="feld"><span>Sollzeit je Woche bei 100 % (Std.)</span>
              <input inputMode="decimal" value={w.soll} onChange={setz("soll")} id="ze-p-soll" /></label>
            <label className="feld"><span>Pensum %</span>
              <input inputMode="decimal" value={w.pensum} onChange={setz("pensum")} id="ze-p-pensum" /></label>
          </div>}
        </fieldset>
        {monat && <fieldset className="ze-profil__teil">
          <legend>Tage mit Sollzeit (Stunden)</legend>
          <p className="klein">Leer lassen = gleichmässig Mo–Fr, je {dauerText(Math.round(gleich * 60))}. Bei Teilpensen
            die Stunden je Tag eintragen, 0 = freier Tag.</p>
          <div className="ze-profil__tage">
            {TAGE.map(([n, t]) => (
              <label key={n} className="ze-profil__tag"><span>{t}</span>
                <input inputMode="decimal" value={w.tage[n]} data-ze-p-tag={n}
                  placeholder={eigeneTage ? "0" : (n >= 1 && n <= 5 ? String(Math.round(gleich * 100) / 100) : "0")}
                  onChange={(ev) => setW({ ...w, tage: { ...w.tage, [n]: ev.target.value } })} /></label>))}
          </div>
          <p className="klein" id="ze-p-summe">Woche: {dauerText(Math.round(summe * 60))}
            {eigeneTage ? " (je Tag eingetragen, Pensum zählt dann nicht)" : ""}</p>
        </fieldset>}
        {monat && <fieldset className="ze-profil__teil">
          <legend>Gleitzeit</legend>
          <div className="ze-profil__zwei">
            <label className="feld"><span>Saldo zählen ab (leer = 1. Januar)</span>
              <input type="date" value={w.start} onChange={setz("start")} id="ze-p-start" /></label>
            <label className="feld"><span>Übertrag an diesem Tag (Std., z.B. 12.5 oder -3)</span>
              <input inputMode="decimal" value={w.uebertrag} onChange={setz("uebertrag")} id="ze-p-uebertrag" /></label>
          </div>
        </fieldset>}
        <fieldset className="ze-profil__teil">
          <legend>Ferienguthaben</legend>
          <div className="ze-profil__zwei">
            <label className="feld"><span>Geburtstag</span>
              <input type="date" value={w.geburtstag} onChange={setz("geburtstag")} id="ze-p-geburtstag" /></label>
            <label className="feld"><span>Eintritt (für Dienstjubiläen)</span>
              <input type="date" value={w.eintritt} onChange={setz("eintritt")} id="ze-p-eintritt" /></label>
          </div>
          <label className="schalter"><input type="checkbox" checked={w.auto} id="ze-p-auto"
            onChange={(ev) => setW({ ...w, auto: ev.target.checked })} /> Ferientage automatisch nach Alter und Pensum</label>
          {w.auto && <p className="klein" id="ze-p-auto-text">{!w.geburtstag ? "Ohne Geburtstag gelten die Ferientage unten."
            : !stufen.length ? "Noch keine Ferienstufen nach Alter eingetragen (HOFERTIME → Alle Mitarbeiter → Ferien nach Alter). Bis dahin gelten die Ferientage unten."
            : jahr + ": " + alt.zahlText(ferienAnspruchJahr({ geburtstag: w.geburtstag, pensum: gut(w.pensum) ? zahl(w.pensum) : 100 }, jahr, stufen))
              + " Tage (Alter " + (jahr - Number(w.geburtstag.slice(0, 4))) + ", Pensum " + (gut(w.pensum) ? zahl(w.pensum) : 100) + " %). Am 1. Januar kommt das neue Guthaben von selbst, der Rest wird übertragen."}</p>}
          <div className="ze-profil__zwei">
            <label className="feld"><span>{w.auto && w.geburtstag && stufen.length ? "Ferientage im Jahr (nur ohne automatisch)" : "Ferientage im Jahr"}</span>
              <input inputMode="decimal" value={w.ferien} onChange={setz("ferien")} id="ze-p-ferien" /></label>
            <label className="feld"><span>Übertrag aus dem Vorjahr (Tage, für {jahr})</span>
              <input inputMode="decimal" value={w.fuebertrag} onChange={setz("fuebertrag")} id="ze-p-fuebertrag" /></label>
          </div>
          <label className="feld"><span>Name bei den Ferien auf der Planwand (mit Komma, wenn mehrere)</span>
            <input value={w.namen} onChange={setz("namen")} id="ze-p-namen" /></label>
        </fieldset>
        <div className="dialog__knoepfe">
          <button type="button" className="knopf knopf--still" onClick={zu}>Abbrechen</button>
          <button className="knopf knopf--haupt" disabled={laeuft} id="ze-p-speichern">Speichern</button>
        </div>
      </form>
    </div>);
}

export function profilOeffnen(personId, name, einst, neu) {
  fensterOeffnen((zu) => <Fenster zu={zu} personId={personId} name={name} einst={einst} neu={neu} />);
}
