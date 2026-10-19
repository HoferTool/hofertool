// =================================================================
//  FENSTER „MATERIAL ERFASSEN“
//  Drei Angaben, alles mit grossen Knöpfen, damit es am Handy und an
//  der Maschine schnell geht (Wunsch Patrick 15. Oktober 2026: „soll
//  so einfach wie möglich sein und zugänglich für alle“):
//    Material   tippen und antippen, aus den Bezeichnungen der Aufträge
//    Wie viel   ungefähr, in kg oder Stangen eingetippt, mit Komma;
//               gespeichert und gezeigt in kg (Wunsch Patrick 16. Oktober
//               2026), keine vorgegebenen Zahlen
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
import { materialZerlegen, postenMengeText, orteLaden, orteSpeichern, kgJeStange, kategorieVon } from "../daten/material.js";

// „12,5“ und „1'200“ → Zahl; leer → null; Unsinn → NaN
const zahlLesen = (t) => (String(t).trim() === "" ? null : Number(String(t).trim().replace(",", ".").replace(/'/g, "")));
const zahlZeigen = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

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
  const [menge, setMenge] = useState(p.menge !== undefined && p.menge !== null ? String(p.menge).replace(".", ",") : "");
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
  const ortWert = ort === "__eigen" ? eigenerOrt.trim() : ort;
  // Umrechnen über Dichte und Querschnitt des Materials, Stange 3 m
  const jeStange = kgJeStange(waehlen ? suche : material);
  const n = zahlLesen(menge);
  // Welcher Werkstoff genau gerechnet wird, damit man es prüfen kann
  const kat = kategorieVon(waehlen ? suche : material);
  const womit = kat ? " (" + kat.name + ", " + String(kat.dichte).replace(".", ",") + " g/cm³)" : "";
  const umrechnung = n === null || !(n >= 0) ? ""
    : !jeStange ? "Umrechnen geht nicht: Werkstoff oder Durchmesser nicht erkannt."
    : (einheit === "stg" ? "= ca. " + zahlZeigen(n * jeStange) + " kg"
      : "= ca. " + zahlZeigen(n / jeStange) + " Stangen à 3 m") + womit;
  // Beim Umschalten die Zahl in die andere Einheit umrechnen
  const wechsle = (neu) => {
    if (neu === einheit) return;
    if (n !== null && n >= 0 && jeStange) setMenge(zahlZeigen(neu === "stg" ? n / jeStange : n * jeStange));
    setEinheit(neu);
  };
  const vorhandene = (o.vorhandene || []).filter((x) => x.art !== "bestellt");

  const speichern = async () => {
    const mat = (waehlen ? suche : material).trim();
    if (!mat) { alt.meldung("Welches Material?", "warn"); return; }
    const ortFertig = ortWert;
    if (art === "lager" && !ortFertig) { alt.meldung("Wo liegt es?", "warn"); return; }
    let zahl = zahlLesen(menge);
    if (zahl !== null && !(zahl >= 0)) { alt.meldung("Die Menge ist keine Zahl.", "warn"); return; }
    // Stangen werden als kg gespeichert, wenn sich das Gewicht rechnen
    // lässt; sonst bleiben es Stangen
    let einheitFertig = einheit;
    const jeStgMat = kgJeStange(mat);
    if (zahl !== null && einheit === "stg" && jeStgMat) { zahl = Math.round(zahl * jeStgMat * 10) / 10; einheitFertig = "kg"; }
    setSpeichert(true);
    const daten = { material: mat, menge: zahl, einheit: einheitFertig, ort: ortFertig || null, art,
      lieferant: art === "bestellt" || p.be_nr ? lieferant.trim() || null : null,
      be_nr: beNr.trim() || null, termin: art === "bestellt" && termin ? termin : null,
      notiz: notiz.trim() || null };
    // Restmaterial gehört keinem Auftrag (Wunsch Patrick 19. Oktober
    // 2026: „soll nicht mit einem Auftrag stehen“). Wo es passt, zeigt
    // das rote M beim Posten. Alte Zuweisungen fallen beim Ändern weg.
    daten.job_id = null;
    daten.fuer_hoco = null;
    daten.platz = null;
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
      // Ein neuer Ort kommt gleich in die Liste der Orte
      if (ort === "__eigen" && ortWert && !orte.includes(ortWert)) {
        try { await orteSpeichern(orte.concat([ortWert])); } catch (f) { /* bleibt nur am Posten */ }
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
            onClick={() => wechsle("kg")}>kg</button>
          <button type="button" className={"knopf knopf--klein" + (einheit === "stg" ? " knopf--haupt" : "")}
            onClick={() => wechsle("stg")}>Stangen</button>
        </div>
        <div className="mat-knoepfe">
          <input className="mat-eingabe mat-eingabe--zahl" id="mat-menge" inputMode="decimal" value={menge}
            placeholder={einheit === "stg" ? "Stangen" : "kg"} onChange={(e) => setMenge(e.target.value)} />
        </div>
        {/* Die andere Einheit gleich daneben, damit man beides sieht */}
        <span className="klein" id="mat-umrechnung">{umrechnung}</span>
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

      </div>
      </div>

      {o.rest && vorhandene.length > 0 && (
        <fieldset className="feld feld--mehrfach mat-leer">
          <legend>Diese Posten sind jetzt aufgebraucht</legend>
          {vorhandene.map((x) => (
            <label key={x.id} className="feld-haken">
              <input type="checkbox" checked={leer.includes(x.id)}
                onChange={(e) => setLeer(e.target.checked ? leer.concat([x.id]) : leer.filter((y) => y !== x.id))} />
              <span>{postenMengeText(x)} · {x.ort || "ohne Ort"}</span></label>))}
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
