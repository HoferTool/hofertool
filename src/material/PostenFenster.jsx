// =================================================================
//  FENSTER „MATERIAL ERFASSEN“
//  Drei Angaben, alles mit grossen Knöpfen, damit es am Handy und an
//  der Maschine schnell geht (Wunsch Patrick 15. Oktober 2026: „soll
//  so einfach wie möglich sein und zugänglich für alle“):
//    Material   tippen und antippen, aus den Bezeichnungen der Aufträge
//    Wie viel   ungefähr, kg oder Stangen
//    Wo         Knöpfe mit den Orten, oder ein eigener Ort
//  Bei „Bestellt“ kommen Lieferant, Bestellnummer und Termin dazu.
//
//  postenFenster({ posten, material, art, titel, rest, auftrag })
//    → Promise mit dem gespeicherten Posten oder null
//  rest: true ist die Frage beim Beenden eines Auftrags („Rest
//  Material?“), mit „Kein Rest“ statt Abbrechen und den Posten dieses
//  Materials, die man als aufgebraucht abhaken kann.
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { materialZerlegen, mengeText, orteLaden } from "../daten/material.js";

const MENGEN_KG = [20, 50, 100, 200, 500];
const MENGEN_STG = [1, 2, 5, 10, 20];

// Alle bekannten Bezeichnungen: aus offenen Aufträgen und Posten,
// gleiche nur einmal (häufigste Schreibweise zuerst)
async function bezeichnungenLaden() {
  const [j, p] = await Promise.all([
    alt.db.from("jobs").select("material_bez").not("material_bez", "is", null)
      .order("planned_from", { ascending: false }).limit(3000),
    alt.db.from("material_posten").select("material").limit(3000),
  ]);
  const zaehler = new Map();
  const dazu = (bez) => {
    const z = materialZerlegen(bez);
    if (!z) return;
    const e = zaehler.get(z.schluessel) || { bez: z.roh, n: 0 };
    e.n++;
    zaehler.set(z.schluessel, e);
  };
  ((j && j.data) || []).forEach((x) => dazu(x.material_bez));
  ((p && p.data) || []).forEach((x) => dazu(x.material));
  return [...zaehler.values()].sort((a, b) => b.n - a.n).map((e) => e.bez);
}

// „14cr 24“ findet „X14CrMoS17 rd 024 mm h9“: jedes Wort muss vorkommen,
// Zahlen auch mit führenden Nullen
function passt(bez, suche) {
  const t = bez.toLowerCase().replace(/\b0+(\d)/g, "$1");
  return suche.toLowerCase().split(/\s+/).filter(Boolean)
    .every((w) => t.includes(w.replace(/^0+(\d)/, "$1")));
}

let bezeichnungen = null;

export async function postenFenster(o = {}) {
  const [orte, liste] = await Promise.all([
    orteLaden(),
    bezeichnungen || (bezeichnungen = bezeichnungenLaden().catch(() => { bezeichnungen = null; return []; })),
  ]);
  return new Promise((fertig) => {
    let erledigt = false;
    const ende = (wert) => { if (!erledigt) { erledigt = true; fertig(wert); } };
    let zu = null;
    zu = fensterOeffnen(() => <PostenDialog o={o} orte={orte} liste={liste}
      fertig={(w) => { ende(w); zu(); }} />, () => ende(null));
  });
}

function PostenDialog({ o, orte, liste, fertig }) {
  const p = o.posten || {};
  const [material, setMaterial] = useState(p.material || o.material || "");
  const [suche, setSuche] = useState("");
  const [waehlen, setWaehlen] = useState(!(p.material || o.material));
  const [einheit, setEinheit] = useState(p.einheit || "kg");
  const [menge, setMenge] = useState(p.menge !== undefined && p.menge !== null ? String(p.menge) : "");
  const [ort, setOrt] = useState(p.ort || (o.rest ? orte[0] : ""));
  const [eigenerOrt, setEigenerOrt] = useState(p.ort && !orte.includes(p.ort) ? p.ort : "");
  const [art, setArt] = useState(p.art || o.art || "lager");
  const [lieferant, setLieferant] = useState(p.lieferant || "");
  const [beNr, setBeNr] = useState(p.be_nr || "");
  const [termin, setTermin] = useState(p.termin || "");
  const [notiz, setNotiz] = useState(p.notiz || "");
  const [leer, setLeer] = useState([]);
  const [speichert, setSpeichert] = useState(false);

  const treffer = useMemo(() => (suche.trim() ? liste.filter((b) => passt(b, suche)) : liste).slice(0, 8),
    [suche, liste]);
  const vorschlaege = einheit === "stg" ? MENGEN_STG : MENGEN_KG;
  const ortWert = ort === "__eigen" ? eigenerOrt.trim() : ort;
  const vorhandene = (o.vorhandene || []).filter((x) => x.art !== "bestellt");

  const speichern = async () => {
    const mat = (waehlen ? suche : material).trim();
    if (!mat) { alt.meldung("Welches Material?", "warn"); return; }
    if (art === "lager" && !ortWert) { alt.meldung("Wo liegt es?", "warn"); return; }
    const zahl = menge.trim() === "" ? null : Number(menge.replace(",", ".").replace(/'/g, ""));
    if (zahl !== null && !(zahl >= 0)) { alt.meldung("Die Menge ist keine Zahl.", "warn"); return; }
    setSpeichert(true);
    const daten = { material: mat, menge: zahl, einheit, ort: ortWert || null, art,
      lieferant: art === "bestellt" || p.be_nr ? lieferant.trim() || null : null,
      be_nr: beNr.trim() || null, termin: art === "bestellt" && termin ? termin : null,
      notiz: notiz.trim() || null };
    if (!p.id && o.auftrag) daten.job_id = o.auftrag.id;
    try {
      let r;
      if (p.id && !p.aus_notiz) {
        const vorher = await alt.rueckSichern("material_posten", { id: p.id });
        r = await alt.db.from("material_posten").update(daten).eq("id", p.id).select().single();
        if (r.error) throw r.error;
        if (vorher.length) alt.merkeSchritt("Material ändern", alt.rueckRein("material_posten", vorher));
      } else {
        r = await alt.db.from("material_posten").insert(daten).select().single();
        if (r.error) throw r.error;
        alt.merkeSchritt("Material erfassen", alt.rueckWeg("material_posten", { id: r.data.id }));
      }
      // Beim Beenden: Posten, die jetzt leer sind
      if (leer.length) {
        const jetzt = new Date().toISOString();
        const r2 = await alt.db.from("material_posten").update({ weg_am: jetzt }).in("id", leer);
        if (r2.error) throw r2.error;
        alt.merkeSchritt("Material aufgebraucht",
          leer.map((id) => alt.rueckSetz("material_posten", { weg_am: null }, { id })));
      }
      alt.meldung("Gespeichert.", "gut");
      fertig(r.data);
    } catch (f) {
      setSpeichert(false);
      const text = alt.fehlertext(f);
      alt.meldung(/material_posten/.test(text)
        ? "Die Material-Übersicht ist in der Datenbank noch nicht eingerichtet (sql/material-uebersicht.sql)."
        : text, "fehler");
    }
  };

  // Beim Beenden ohne Rest trotzdem die leeren Posten abhaken
  const keinRest = async () => {
    if (leer.length) {
      const r = await alt.db.from("material_posten").update({ weg_am: new Date().toISOString() }).in("id", leer);
      if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
      alt.merkeSchritt("Material aufgebraucht",
        leer.map((id) => alt.rueckSetz("material_posten", { weg_am: null }, { id })));
    }
    fertig(null);
  };

  return (
    <div className="dialog mat-dialog" role="dialog" aria-modal="true">
      <h2>{o.titel || (o.rest ? "Rest Material?" : p.id ? "Material ändern" : "Material erfassen")}</h2>
      {o.text && <p className="dialog__text">{o.text}</p>}

      <div className="mat-feld">
        <span className="mat-feld__name">Material</span>
        {waehlen
          ? <>
              <input className="mat-eingabe" id="mat-suche" value={suche} autoFocus
                placeholder="z.B. 14cr 24" onChange={(e) => setSuche(e.target.value)} />
              <div className="mat-vorschlaege">
                {treffer.map((b) => (
                  <button key={b} className="mat-vorschlag" type="button"
                    onClick={() => { setMaterial(b); setWaehlen(false); }}>{b}</button>))}
                {!treffer.length && <span className="klein">Nichts gefunden. So wie getippt übernehmen mit Speichern.</span>}
              </div>
            </>
          : <button type="button" className="mat-gewaehlt" onClick={() => { setSuche(""); setWaehlen(true); }}>
              <b>{material}</b><span className="klein">ändern</span></button>}
      </div>

      {!o.rest && (
        <div className="mat-feld">
          <span className="mat-feld__name">Ist es da?</span>
          <div className="mat-knoepfe">
            <button type="button" className={"knopf" + (art === "lager" ? " knopf--haupt" : "")}
              onClick={() => setArt("lager")}>Ist da</button>
            <button type="button" className={"knopf" + (art === "bestellt" ? " knopf--haupt" : "")}
              onClick={() => setArt("bestellt")}>Bestellt</button>
          </div>
        </div>
      )}

      <div className="mat-feld">
        <span className="mat-feld__name">Wie viel, ungefähr</span>
        <div className="mat-knoepfe">
          <button type="button" className={"knopf knopf--klein" + (einheit === "kg" ? " knopf--haupt" : "")}
            onClick={() => setEinheit("kg")}>kg</button>
          <button type="button" className={"knopf knopf--klein" + (einheit === "stg" ? " knopf--haupt" : "")}
            onClick={() => setEinheit("stg")}>Stangen</button>
        </div>
        <div className="mat-knoepfe">
          {vorschlaege.map((n) => (
            <button key={n} type="button" className={"knopf" + (menge === String(n) ? " knopf--haupt" : "")}
              onClick={() => setMenge(String(n))}>{mengeText(n, einheit)}</button>))}
          <input className="mat-eingabe mat-eingabe--zahl" id="mat-menge" inputMode="decimal" value={menge}
            placeholder="Zahl" onChange={(e) => setMenge(e.target.value)} />
        </div>
      </div>

      <div className="mat-feld">
        <span className="mat-feld__name">{art === "bestellt" ? "Wohin kommt es (wenn bekannt)" : "Wo"}</span>
        <div className="mat-knoepfe">
          {orte.map((x) => (
            <button key={x} type="button" className={"knopf" + (ort === x ? " knopf--haupt" : "")}
              onClick={() => setOrt(x)}>{x}</button>))}
          <button type="button" className={"knopf" + (ort === "__eigen" ? " knopf--haupt" : "")}
            onClick={() => setOrt("__eigen")}>Anderer Ort</button>
        </div>
        {ort === "__eigen" && <input className="mat-eingabe" id="mat-ort" value={eigenerOrt} autoFocus
          placeholder="Ort" onChange={(e) => setEigenerOrt(e.target.value)} />}
      </div>

      {art === "bestellt" && (
        <div className="mat-feld mat-feld--reihe">
          <label className="feld"><span>Lieferant</span>
            <input value={lieferant} onChange={(e) => setLieferant(e.target.value)} /></label>
          <label className="feld"><span>Bestellnummer</span>
            <input value={beNr} inputMode="numeric" onChange={(e) => setBeNr(e.target.value)} /></label>
          <label className="feld"><span>Termin</span>
            <input type="date" value={termin || ""} onChange={(e) => setTermin(e.target.value)} /></label>
        </div>
      )}

      {!o.rest && (
        <label className="feld"><span>Notiz (frei)</span>
          <input value={notiz} id="mat-notiz" onChange={(e) => setNotiz(e.target.value)} /></label>
      )}

      {o.rest && vorhandene.length > 0 && (
        <fieldset className="feld feld--mehrfach mat-leer">
          <legend>Diese Posten sind jetzt aufgebraucht</legend>
          {vorhandene.map((x) => (
            <label key={x.id} className="feld-haken">
              <input type="checkbox" checked={leer.includes(x.id)}
                onChange={(e) => setLeer(e.target.checked ? leer.concat([x.id]) : leer.filter((y) => y !== x.id))} />
              <span>{mengeText(x.menge, x.einheit)} · {x.ort || "ohne Ort"}</span></label>))}
        </fieldset>
      )}

      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={() => (o.rest ? keinRest() : fertig(null))}>
          {o.rest ? "Kein Rest" : "Abbrechen"}</button>
        <button className="knopf knopf--haupt" data-ja="" disabled={speichert} onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
