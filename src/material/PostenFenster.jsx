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
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { bestellFotoLesen } from "../daten/bestellFoto.js";
import { materialZerlegen, postenMengeText, orteLaden, orteSpeichern, kgJeStange, kategorieVon } from "../daten/material.js";

// „12,5“ und „1'200“ → Zahl; leer → null; Unsinn → NaN
const zahlLesen = (t) => (String(t).trim() === "" ? null : Number(String(t).trim().replace(",", ".").replace(/'/g, "")));
const zahlZeigen = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const kgFoto = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
const FORM_NAME = { rd: "Rund", "6kt": "Sechskant", "4kt": "Vierkant", rohr: "Rohr" };

// Was aus dem Foto kam, Punkt für Punkt mit ✓ oder ✗, daneben das Foto
// und darunter der gelesene Text mit den benutzten Zeilen markiert
// (Wunsch Patrick 22. Oktober 2026: „Ansicht besser, dass man besser
// sehen kann, was es gelesen hat“). Das Foto bleibt nur im Fenster.
function FotoErgebnis({ r, bild }) {
  const [gross, setGross] = useState(false);
  const w = r.werkstoff;
  const tol = (r.material || "").match(/\b([hgfk]\d{1,2})$/i);
  const zahl = (n) => String(n).replace(".", ",");
  const punkte = [
    ["Werkstoff", w ? [w.name, w.nr].filter(Boolean).join(" · ") : null],
    ["Form", r.form ? FORM_NAME[r.form] || r.form : null],
    ["Durchmesser", r.d ? zahl(r.d) + " mm" : null],
    ["Toleranz", tol ? tol[1].toLowerCase() : null, true],
    ["Gewicht", r.kg ? kgFoto(r.kg) + " kg" : null],
  ];
  const nichts = !r.material && !r.kg && !r.d;
  const zeilen = String(r.text || "").split(/\r?\n/).filter((z) => z.trim());
  const norm = (z) => String(z || "").replace(/\s+/g, " ").trim();
  const markM = norm(r.zeileMaterial), markK = norm(r.zeileKg);
  return (
    <div className="mat-foto__ergebnis" id="mat-foto-ergebnis">
      <div className="mat-foto__kopf">
        {bild && <button type="button" className={"mat-foto__bild" + (gross ? " mat-foto__bild--gross" : "")}
          title={gross ? "Verkleinern" : "Grösser"} onClick={() => setGross(!gross)}>
          <img src={bild} alt="Foto der Bestellung" /></button>}
        <div className="mat-foto__punkte">
          {nichts
            ? <span className="mat-foto__fehler">Auf dem Foto nichts erkannt. Gerade und nah fotografieren, gutes Licht.</span>
            : <>
                {punkte.map(([name, wert, freiwillig]) => (
                  <div key={name} className={"mat-foto__punkt" + (wert ? " mat-foto__punkt--ja" : freiwillig ? "" : " mat-foto__punkt--nein")}>
                    <span className="mat-foto__zeichen">{wert ? "✓" : freiwillig ? "–" : "✗"}</span>
                    <span className="mat-foto__name">{name}</span>
                    <b>{wert || "nicht erkannt"}</b>
                  </div>))}
                {(markM || markK) && <div className="mat-foto__quelle">
                  <span className="klein">Gelesen aus diesen Zeilen:</span>
                  {markM && <div className="mat-foto__zeile mat-foto__zeile--material">{markM}</div>}
                  {markK && markK !== markM && <div className="mat-foto__zeile mat-foto__zeile--kg">{markK}</div>}
                </div>}
                <span className="klein">Ist alles richtig eingetragen? Sonst unten ändern.</span>
              </>}
        </div>
      </div>
      {zeilen.length > 0 && (
        <details open={nichts}><summary className="klein">Gelesener Text (gelb = Material, grün = Gewicht)</summary>
          <div className="mat-foto__text">
            {zeilen.map((z, i) => {
              const n = norm(z);
              const art = n && n === markM ? " mat-foto__zeile--material" : n && n === markK ? " mat-foto__zeile--kg" : "";
              return <div key={i} className={"mat-foto__zeile" + art}>{z}</div>;
            })}
          </div></details>
      )}
    </div>
  );
}

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
  // Menge in zwei Feldern nebeneinander, Stangen und kg (Wunsch Patrick
  // 22. Oktober 2026: „zweite Zeile Menge so gesplittet, Stangen und
  // kg“): Tippen im einen rechnet das andere um, gespeichert wird kg,
  // wenn es rechenbar ist
  const mengeAnfang = p.menge !== undefined && p.menge !== null ? String(p.menge).replace(".", ",") : "";
  const [kgText, setKgText] = useState(p.einheit === "stg" ? "" : mengeAnfang);
  const [stgText, setStgText] = useState(p.einheit === "stg" ? mengeAnfang : "");
  // Welches Feld zuletzt getippt wurde, das andere ist gerechnet
  const [zuletzt, setZuletzt] = useState(p.einheit === "stg" ? "stg" : "kg");
  const [ort, setOrt] = useState(p.ort || (o.rest ? orte[0] : ""));
  const [eigenerOrt, setEigenerOrt] = useState(p.ort && !orte.includes(p.ort) ? p.ort : "");
  const [art, setArt] = useState(p.art || o.art || "lager");
  const [lieferant, setLieferant] = useState(p.lieferant || "");
  const [beNr, setBeNr] = useState(p.be_nr || "");
  const [termin, setTermin] = useState(p.termin || "");
  const [notiz, setNotiz] = useState(p.notiz || "");
  const [leer, setLeer] = useState([]);
  const [speichert, setSpeichert] = useState(false);
  // Foto einer Bestellung lesen (seit 1.107.0): null, { liest, text }
  // oder { ergebnis }
  const [foto, setFoto] = useState(null);
  const fotoFeld = useRef(null);
  // Das Foto nur zum Anschauen im Fenster, als Adresse im Speicher
  const [fotoBild, setFotoBild] = useState(null);

  const treffer = useMemo(() => (suche.trim() ? liste.filter((b) => passt(b, suche)) : liste).slice(0, 8),
    [suche, liste]);
  const ortWert = ort === "__eigen" ? eigenerOrt.trim() : ort;
  // Umrechnen über Dichte und Querschnitt des Materials, Stange 3 m
  const jeStange = kgJeStange(waehlen ? suche : material);
  const kgZahl = zahlLesen(kgText), stgZahl = zahlLesen(stgText);
  // Welcher Werkstoff genau gerechnet wird, damit man es prüfen kann
  const kat = kategorieVon(waehlen ? suche : material);
  const womit = kat ? " (" + kat.name + ", " + String(kat.dichte).replace(".", ",") + " g/cm³)" : "";
  const rechne = (wert, von, jeStg) => {
    const z = zahlLesen(wert);
    const anders = z === null || !(z >= 0) || !jeStg ? "" : zahlZeigen(von === "kg" ? z / jeStg : z * jeStg);
    if (von === "kg") { setKgText(wert); setStgText(anders); } else { setStgText(wert); setKgText(anders); }
    setZuletzt(von);
  };
  // Ändert sich das Material, das gerechnete Feld nachziehen
  useEffect(() => {
    rechne(zuletzt === "kg" ? kgText : stgText, zuletzt, jeStange);
  }, [jeStange]); // eslint-disable-line react-hooks/exhaustive-deps
  const umrechnung = (kgZahl === null && stgZahl === null) ? ""
    : !jeStange ? "Umrechnen geht nicht: Werkstoff oder Durchmesser nicht erkannt."
    : "Stange 3 m" + womit;
  // Foto wählen oder aufnehmen, lesen, Felder füllen. Das Foto selbst
  // wird nicht gespeichert (Wunsch Patrick 19. Oktober 2026: „nur
  // erkennen und gut ist“).
  const fotoGewaehlt = async (e) => {
    const datei = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!datei) return;
    setFotoBild((vorher) => { if (vorher) URL.revokeObjectURL(vorher); return URL.createObjectURL(datei); });
    setFoto({ liest: true, text: "Texterkennung wird geladen …" });
    try {
      const r = await bestellFotoLesen(datei, (status, anteil) => {
        const lesen = /recogniz/.test(status || "");
        setFoto({ liest: true, text: lesen ? "Foto wird gelesen … " + Math.round(anteil * 100) + " %"
          : "Texterkennung wird geladen …" });
      });
      if (r.material) { setMaterial(r.material); setWaehlen(false); }
      else if (r.d) { setSuche((r.form && r.form !== "rd" ? r.form : "rd") + " " + String(r.d).replace(".", ",")); setWaehlen(true); }
      // Auf der Bestellung stehen kg mit vier Stellen (7.2500 kg): zwei behalten
      if (r.kg) rechne(kgFoto(r.kg), "kg", kgJeStange(r.material || ""));
      setFoto({ ergebnis: r });
    } catch (f) {
      setFoto({ fehler: "Das Foto liess sich nicht lesen. Ohne Internet geht es beim ersten Mal nicht. " + (alt.fehlertext ? alt.fehlertext(f) : "") });
    }
  };
  const fotoErgebnis = foto && foto.ergebnis;

  const vorhandene = (o.vorhandene || []).filter((x) => x.art !== "bestellt");

  const speichern = async () => {
    const mat = (waehlen ? suche : material).trim();
    if (!mat) { alt.meldung("Welches Material?", "warn"); return; }
    const ortFertig = ortWert;
    // Kein „Wo liegt es?“ mehr (Wunsch Patrick 22. Oktober 2026: „soll
    // nicht fragen, wohin damit“), ohne Ort steht es unter „Ohne Ort“
    if ((kgZahl !== null && !(kgZahl >= 0)) || (stgZahl !== null && !(stgZahl >= 0))) {
      alt.meldung("Die Menge ist keine Zahl.", "warn"); return;
    }
    // Stangen werden als kg gespeichert, wenn sich das Gewicht rechnen
    // lässt; sonst bleiben es Stangen
    let zahl = null, einheitFertig = "kg";
    const jeStgMat = kgJeStange(mat);
    if (zuletzt === "stg" && stgZahl !== null) {
      if (jeStgMat) zahl = Math.round(stgZahl * jeStgMat * 10) / 10;
      else { zahl = stgZahl; einheitFertig = "stg"; }
    } else if (kgZahl !== null) zahl = kgZahl;
    else if (stgZahl !== null) { zahl = stgZahl; einheitFertig = "stg"; }
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
      {!o.rest && (
        <div className="mat-foto" id="mat-foto">
          <input ref={fotoFeld} type="file" accept="image/*" hidden id="mat-foto-datei" onChange={fotoGewaehlt} />
          <button type="button" className="knopf" id="mat-foto-knopf" disabled={!!(foto && foto.liest)}
            onClick={() => fotoFeld.current && fotoFeld.current.click()}>📷 Foto der Bestellung lesen</button>
          {foto && foto.liest && <span className="klein" id="mat-foto-stand">{foto.text}</span>}
          {foto && foto.fehler && <span className="klein mat-foto__fehler">{foto.fehler}</span>}
          {fotoErgebnis && <FotoErgebnis r={fotoErgebnis} bild={fotoBild} />}
        </div>
      )}
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

      {/* Eine Spalte, kurz: Material, darunter die Menge (Wunsch Patrick
          22. Oktober 2026, ersetzt die zwei Spalten von 1.72.0) */}
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
        <span className="mat-feld__name">Menge, ungefähr</span>
        <div className="mat-menge">
          <label className="mat-menge__feld"><span>Stangen</span>
            <input className="mat-eingabe" id="mat-stangen" inputMode="decimal" value={stgText}
              placeholder="0" onChange={(e) => rechne(e.target.value, "stg", jeStange)} /></label>
          <label className="mat-menge__feld"><span>kg</span>
            <input className="mat-eingabe" id="mat-menge" inputMode="decimal" value={kgText}
              placeholder="0" onChange={(e) => rechne(e.target.value, "kg", jeStange)} /></label>
        </div>
        <span className="klein" id="mat-umrechnung">{umrechnung}</span>
      </div>

      </div>
      {/* Ort und Notiz nur auf Wunsch: das Fenster bleibt kurz */}
      <details className="mat-mehr" id="mat-mehr" open={!!(p.ort || p.notiz || o.rest)}>
      <summary>Ort und Notiz (freiwillig){ortWert ? ": " + ortWert : ""}</summary>
      <div className="mat-spalte">
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

      {!o.rest && (
        <label className="mat-feld"><span className="mat-feld__name">Notiz (frei)</span>
          <input className="mat-eingabe" value={notiz} id="mat-notiz" onChange={(e) => setNotiz(e.target.value)} /></label>
      )}

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
      </details>

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
