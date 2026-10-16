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
//  postenFenster({ posten, material, art, titel, rest, auftrag, gebraucht })
//    → Promise mit dem gespeicherten Posten oder null
//  rest: true ist die Frage beim Beenden eines Auftrags („Rest
//  Material?“), mit „Kein Rest“ statt Abbrechen und den Posten dieses
//  Materials, die man als aufgebraucht abhaken kann.
// =================================================================
import { useMemo, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { materialZerlegen, mengeText, orteLaden, istRahmen } from "../daten/material.js";

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

// Ohne sql/material-zuweisen.sql kennt die Datenbank fuer_hoco und
// platz nicht: dann ohne sie speichern statt gar nicht
async function ohneNeueSpalten(daten, senden) {
  const r = await senden(daten);
  if (r.error && /fuer_hoco|platz/.test(r.error.message || "")) {
    const { fuer_hoco, platz, ...rest } = daten;
    if (fuer_hoco || platz) alt.meldung("Zuweisen geht erst nach sql/material-zuweisen.sql.", "warn");
    return senden(rest);
  }
  return r;
}

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
  // Zuweisen (seit 1.71.0): für welchen Auftrag, bei einem Rahmen für
  // alle Aufträge der HOCO Nr., dazu der genaue Platz
  const [fuer, setFuer] = useState(p.fuer_hoco
    ? ((o.auftraege || []).find((j) => j.job_number === p.fuer_hoco) || {}).id || ""
    : p.job_id && (o.auftraege || []).some((j) => j.id === p.job_id) ? p.job_id : "");
  const [rahmen, setRahmen] = useState(!!p.fuer_hoco);
  const [platz, setPlatz] = useState(p.platz || "");
  const [speichert, setSpeichert] = useState(false);

  const treffer = useMemo(() => (suche.trim() ? liste.filter((b) => passt(b, suche)) : liste).slice(0, 8),
    [suche, liste]);
  const vorschlaege = einheit === "stg" ? MENGEN_STG : MENGEN_KG;
  const ortWert = ort === "__eigen" ? eigenerOrt.trim() : ort;
  const vorhandene = (o.vorhandene || []).filter((x) => x.art !== "bestellt");
  const schluessel = (materialZerlegen(waehlen ? suche : material) || {}).schluessel;
  const zurWahl = (o.auftraege || []).filter((j) => schluessel && (materialZerlegen(j.material_bez) || {}).schluessel === schluessel)
    .sort((a, b) => String(a.planned_from || "9").localeCompare(String(b.planned_from || "9")));
  const fuerJob = zurWahl.find((j) => j.id === fuer) || null;
  const waehleFuer = (j) => { setFuer(j ? j.id : ""); setRahmen(!!j && istRahmen(j)); };

  const speichern = async () => {
    const mat = (waehlen ? suche : material).trim();
    if (!mat) { alt.meldung("Welches Material?", "warn"); return; }
    const anMaschine = fuerJob && ["ruesten", "qs", "laeuft"].includes(fuerJob.plan_status);
    const ortFertig = ortWert || (anMaschine && !o.rest ? "An der Maschine" : "");
    if (art === "lager" && !ortFertig) { alt.meldung("Wo liegt es?", "warn"); return; }
    const zahl = menge.trim() === "" ? null : Number(menge.replace(",", ".").replace(/'/g, ""));
    if (zahl !== null && !(zahl >= 0)) { alt.meldung("Die Menge ist keine Zahl.", "warn"); return; }
    setSpeichert(true);
    const daten = { material: mat, menge: zahl, einheit, ort: ortFertig || null, art,
      lieferant: art === "bestellt" || p.be_nr ? lieferant.trim() || null : null,
      be_nr: beNr.trim() || null, termin: art === "bestellt" && termin ? termin : null,
      notiz: notiz.trim() || null };
    if (!o.rest && fuerJob && !platz.trim()) { setSpeichert(false); alt.meldung("Wo genau liegt es? Den Platz eintragen.", "warn"); return; }
    if (!o.rest && (o.auftraege || []).length) {
      daten.job_id = fuerJob ? fuerJob.id : null;
      daten.fuer_hoco = fuerJob && rahmen ? fuerJob.job_number : null;
      daten.platz = fuerJob ? platz.trim() : null;
    } else if (!p.id && o.auftrag) daten.job_id = o.auftrag.id;
    // Rest eines Rahmenauftrags bleibt beim Rahmen, solange noch ein
    // Auftrag dieser HOCO Nr. offen ist
    if (o.rest && o.auftrag && (o.gebraucht || []).some((x) => x.auftrag.job_number === o.auftrag.job_number)) {
      daten.fuer_hoco = o.auftrag.job_number;
    }
    try {
      let r;
      if (p.id && !p.aus_notiz) {
        const vorher = await alt.rueckSichern("material_posten", { id: p.id });
        r = await ohneNeueSpalten(daten, (x) => alt.db.from("material_posten").update(x).eq("id", p.id).select().single());
        if (r.error) throw r.error;
        if (vorher.length) alt.merkeSchritt("Material ändern", alt.rueckRein("material_posten", vorher));
      } else {
        r = await ohneNeueSpalten(daten, (x) => alt.db.from("material_posten").insert(x).select().single());
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
      {o.rest && o.gebraucht && (
        <div className={"mat-gebraucht" + (o.gebraucht.length ? " mat-gebraucht--ja" : "")} id="mat-gebraucht">
          {o.gebraucht.length
            ? <><b>Dieses Material wird noch gebraucht:</b>
                {o.gebraucht.slice(0, 6).map((x) => (
                  <div key={x.auftrag.id}>{x.auftrag.job_number}
                    {x.maschine ? " auf " + x.maschine : ""}
                    {x.jetzt ? ", läuft gerade" : x.start ? ", ab " + alt.kurzDatum(x.start) : ""}</div>))}
                {o.gebraucht.length > 6 && <div>und {o.gebraucht.length - 6} weitere</div>}
                <span className="klein">Den Rest also erfassen und gut aufbewahren, er wird dort eingerechnet.</span></>
            : <><b>Kein anderer offener Auftrag braucht dieses Material.</b>
                <span className="klein">Einen Rest trotzdem erfassen, wenn er aufbewahrt wird.</span></>}
        </div>
      )}

      {/* Am Computer zwei Spalten (Wunsch Patrick 16. Oktober 2026: „etwas
          grösser und besser dargestellt“), am Handy untereinander wie bisher */}
      <div className="mat-spalten">
      <div className="mat-spalte">
      <div className="mat-feld mat-feld--karte">
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

      <div className="mat-feld mat-feld--karte">
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

      {!o.rest && (
        <label className="mat-feld mat-feld--karte"><span className="mat-feld__name">Notiz (frei)</span>
          <input className="mat-eingabe" value={notiz} id="mat-notiz" onChange={(e) => setNotiz(e.target.value)} /></label>
      )}
      </div>
      <div className="mat-spalte">
      <div className="mat-feld mat-feld--karte">
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

      {!o.rest && zurWahl.length > 0 && (
        <div className="mat-feld mat-feld--karte" id="mat-fuer">
          <span className="mat-feld__name">Für welchen Auftrag</span>
          <div className="mat-knoepfe">
            <button type="button" className={"knopf knopf--klein" + (!fuerJob ? " knopf--haupt" : "")}
              onClick={() => waehleFuer(null)}>Frei</button>
            {zurWahl.map((j) => (
              <button key={j.id} type="button" data-fuer={j.job_number}
                className={"knopf knopf--klein" + (fuer === j.id ? " knopf--haupt" : "")} onClick={() => waehleFuer(j)}>
                {j.job_number}{j.maschine ? " · " + [j.maschine, j.maschine_nr].filter(Boolean).join(" ") : ""}
                {["ruesten", "qs", "laeuft"].includes(j.plan_status) ? " · an der Maschine" : j.planned_from ? " · " + alt.kurzDatum(j.planned_from) : ""}</button>))}
          </div>
          {fuerJob && <>
            <label className="feld-haken"><input type="checkbox" id="mat-rahmen" checked={rahmen}
              onChange={(e) => setRahmen(e.target.checked)} />
              <span>Rahmenauftrag: gehört allen Aufträgen {fuerJob.job_number}, ohne Mengenrechnung; am Schluss nur den Rest angeben</span></label>
            <label className="mat-feld"><span className="mat-feld__name">Wo genau liegt es? (Pflicht)</span>
              <input className="mat-eingabe" value={platz} id="mat-platz" placeholder="z.B. an der Maschine links, Regal 3 unten"
                onChange={(e) => setPlatz(e.target.value)} /></label>
          </>}
        </div>
      )}

      </div>
      </div>

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
