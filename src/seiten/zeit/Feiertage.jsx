// =================================================================
//  BEZAHLTE FEIERTAGE (seit 1.626.0, Wunsch Patrick 18. November 2026:
//  „zum Voraus bezahlte Feiertage angeben können. Wenn sie dann nicht
//  stempeln, wird es als abwesend bezahlt gerechnet“, „oder auch im
//  Nachhinein“). Nur Admins. Fenster mit der Liste je Jahr, Datum und
//  Name eintragen, löschen, und „Vorschlag übernehmen“ setzt die
//  Feiertage der Planwand für das Jahr ein. Gerechnet wird in zeit.js
//  (feiertageEintragen), darum gilt ein Eintrag auch rückwirkend.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { feiertageSetzen } from "../../daten/zeit.js";

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

async function alleLaden() {
  const r = await alt.zeitlimit(alt.db.from("zeit_feiertage").select("datum, name").order("datum"), 8000, "Feiertage");
  if (r.error) throw r.error;
  feiertageSetzen(r.data || []);
  return r.data || [];
}

function Fenster({ zu, nachher }) {
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [datum, setDatum] = useState("");
  const [name, setName] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const neu = () => alleLaden().then((d) => { setListe(d); setFehler(""); }, (f) => setFehler(alt.fehlertext(f)));
  useEffect(() => { neu(); }, []);

  const imJahr = (liste || []).filter((f) => f.datum.startsWith(String(jahr)));
  const fertig = async () => { await neu(); if (nachher) nachher(); };

  async function dazu(eintraege, text) {
    const da = new Set((liste || []).map((f) => f.datum));
    const neue = eintraege.filter((e) => e.datum && !da.has(e.datum));
    if (!neue.length) { alt.meldung("Schon eingetragen.", "warn"); return; }
    setLaeuft(true);
    const r = await alt.db.from("zeit_feiertage").insert(neue.map((e) => ({ datum: e.datum, name: e.name || "Feiertag" })));
    setLaeuft(false);
    if (r.error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt(text, neue.map((e) => alt.rueckWeg("zeit_feiertage", { datum: e.datum })));
    setDatum(""); setName("");
    fertig();
  }

  async function weg(f) {
    const r = await alt.db.from("zeit_feiertage").delete().eq("datum", f.datum);
    if (r.error) { alt.meldung("Nicht gelöscht: " + alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Feiertag löschen", alt.rueckRein("zeit_feiertage", [{ datum: f.datum, name: f.name }], "datum"));
    fertig();
  }

  const vorschlag = (alt.feiertage ? alt.feiertage(jahr) : []).filter((f) => !alt.istWochenende || !alt.istWochenende(f.datum));
  return (
    <div className="dialog ze-feiertage" role="dialog" aria-modal="true" id="ze-feiertage">
      <button className="dialog__x" aria-label="Schliessen" onClick={zu}>✕</button>
      <h2>Bezahlte Feiertage</h2>
      <p className="klein">Wer an einem dieser Tage nicht stempelt, gilt als bezahlt abwesend (kein Soll). Wer stempelt,
        hat einen normalen Arbeitstag. Gilt auch, wenn der Tag erst nachträglich eingetragen wird.</p>
      <div className="ze-feiertage__jahr">
        <button className="knopf knopf--klein" onClick={() => setJahr(jahr - 1)} aria-label="Jahr zurück">‹</button>
        <b>{jahr}</b>
        <button className="knopf knopf--klein" onClick={() => setJahr(jahr + 1)} aria-label="Jahr vor">›</button>
        <button className="knopf knopf--klein" id="ze-feiertage-vorschlag" disabled={laeuft || !liste}
          onClick={() => dazu(vorschlag, "Feiertage " + jahr + " übernehmen")}>Feiertage {jahr} vorschlagen</button>
      </div>
      {fehler && <div className="karte karte--fehler"><p>{fehler}</p></div>}
      {!liste && !fehler && <div className="laedt">Wird geladen …</div>}
      {liste && <div className="ze-feiertage__liste">
        {imJahr.length ? imJahr.map((f) => (
          <div key={f.datum} className="ze-feiertage__zeile" data-ze-feiertag={f.datum}>
            <span><b>{WT[alt.ausIso(f.datum).getDay()]}</b> {alt.kurzDatum(f.datum)}</span>
            <span>{f.name}</span>
            <button className="knopf knopf--klein knopf--still" aria-label={"Löschen " + f.name} onClick={() => weg(f)}>✕</button>
          </div>)) : <p className="klein">Für {jahr} ist noch nichts eingetragen.
            {(liste || []).length ? "" : " Solange gar nichts eingetragen ist, gelten die Feiertage der Planwand als frei."}</p>}
      </div>}
      <form className="ze-feiertage__neu" onSubmit={(e) => { e.preventDefault(); dazu([{ datum, name }], "Feiertag eintragen"); }}>
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required id="ze-feiertag-datum" />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, z.B. Weihnachten" id="ze-feiertag-name" />
        <button className="knopf knopf--haupt" disabled={laeuft || !datum} id="ze-feiertag-dazu">Eintragen</button>
      </form>
    </div>);
}

export function feiertageOeffnen(nachher) {
  fensterOeffnen((zu) => <Fenster zu={zu} nachher={nachher} />);
}

// ---------- Ferien nach Alter ----------
// Wunsch Patrick 18. November 2026: „verschiedene Ferienguthaben anhand
// des Alters“. Je Stufe „ab Alter“ und Ferientage bei 100 %. Gilt das
// Alter, das die Person im Jahr erreicht (zeit.js, ferienAnspruchJahr).
function StufenFenster({ zu, nachher }) {
  const [zeilen, setZeilen] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => {
    alt.db.from("zeit_ferienstufen").select("ab_alter, tage").order("ab_alter").then((r) => {
      if (r.error) { setFehler(alt.fehlertext(r.error)); return; }
      setZeilen((r.data || []).map((x) => ({ ab: String(x.ab_alter), tage: String(x.tage) })));
    });
  }, []);
  const z = (x) => Number(String(x || "").replace(",", "."));
  async function speichern(ev) {
    ev.preventDefault();
    const neu = (zeilen || []).filter((x) => String(x.ab).trim() !== "" && String(x.tage).trim() !== "")
      .map((x) => ({ ab_alter: Math.round(z(x.ab)), tage: z(x.tage) }));
    if (neu.some((x) => !Number.isFinite(x.ab_alter) || !Number.isFinite(x.tage) || x.ab_alter < 0 || x.tage < 0)) {
      alt.meldung("Bitte nur Zahlen eintragen.", "warn"); return;
    }
    if (new Set(neu.map((x) => x.ab_alter)).size !== neu.length) { alt.meldung("Jedes Alter nur einmal.", "warn"); return; }
    setLaeuft(true);
    const alt0 = await alt.db.from("zeit_ferienstufen").select("ab_alter, tage");
    const vorher = alt0.data || [];
    const weg = await alt.db.from("zeit_ferienstufen").delete().gte("ab_alter", 0);
    const r = weg.error ? weg : (neu.length ? await alt.db.from("zeit_ferienstufen").insert(neu) : { error: null });
    setLaeuft(false);
    if (r.error) { alt.meldung("Nicht gespeichert: " + alt.fehlertext(r.error), "fehler"); return; }
    alt.merkeSchritt("Ferien nach Alter", neu.map((x) => alt.rueckWeg("zeit_ferienstufen", { ab_alter: x.ab_alter }))
      .concat(vorher.length ? [alt.rueckRein("zeit_ferienstufen", vorher, "ab_alter")] : []));
    alt.meldung("Gespeichert.", "gut");
    zu();
    if (nachher) nachher();
  }
  return (
    <div className="dialog ze-feiertage" role="dialog" aria-modal="true" id="ze-stufen">
      <button className="dialog__x" aria-label="Schliessen" onClick={zu}>✕</button>
      <h2>Ferien nach Alter</h2>
      <p className="klein">Ferientage bei 100 % Pensum. Gilt das Alter, das die Person im Jahr erreicht. Im Profil der Person
        braucht es dafür den Geburtstag. Das Guthaben wird mit dem Pensum gerechnet.</p>
      {fehler && <div className="karte karte--fehler"><p>{fehler}</p></div>}
      {!zeilen && !fehler && <div className="laedt">Wird geladen …</div>}
      {zeilen && <form onSubmit={speichern}>
        <div className="ze-feiertage__liste">
          {zeilen.map((x, i) => (
            <div key={i} className="ze-feiertage__zeile ze-stufe" data-ze-stufe={i}>
              <label>ab Alter <input inputMode="numeric" value={x.ab}
                onChange={(e) => setZeilen(zeilen.map((y, j) => (j === i ? { ...y, ab: e.target.value } : y)))} /></label>
              <label><input inputMode="decimal" value={x.tage}
                onChange={(e) => setZeilen(zeilen.map((y, j) => (j === i ? { ...y, tage: e.target.value } : y)))} /> Tage</label>
              <button type="button" className="knopf knopf--klein knopf--still" aria-label="Stufe löschen"
                onClick={() => setZeilen(zeilen.filter((_, j) => j !== i))}>✕</button>
            </div>))}
          {!zeilen.length && <p className="klein">Noch keine Stufen. Ohne Stufen gelten die Ferientage im Profil.</p>}
        </div>
        <button type="button" className="knopf knopf--klein" id="ze-stufe-dazu"
          onClick={() => setZeilen([...zeilen, { ab: "", tage: "" }])}>+ Stufe</button>
        <div className="dialog__knoepfe">
          <button type="button" className="knopf knopf--still" onClick={zu}>Abbrechen</button>
          <button className="knopf knopf--haupt" disabled={laeuft} id="ze-stufen-speichern">Speichern</button>
        </div>
      </form>}
    </div>);
}

export function stufenOeffnen(nachher) {
  fensterOeffnen((zu) => <StufenFenster zu={zu} nachher={nachher} />);
}
