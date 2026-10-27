// =================================================================
//  KALKULATION (seit 1.214.0, Wunsch Patrick 27. Oktober 2026: „ein
//  Testprogramm … im HoferTool einbauen, nur für Patrick Ruch“)
//
//  Wie das Kalkulationsmodul im Gewatec: Kopfdaten, Material,
//  Arbeitsgänge an Maschinen mit Stundensatz, Preis, Ergebnis als
//  Protokoll und das Angebot als PDF. Anders als im Gewatec beliebig
//  viele Staffelmengen (Wunsch Patrick), jede rechnet für sich.
//  Gerechnet wird in src/daten/kalkulation.js. Sichtbar nur mit dem
//  Vermerk kalkulationSehen am Konto, auch in der Datenbank.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import { ZiehListe } from "../teile/ZiehListe.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { teilMerken } from "../teile/wiederherstellen.js";
import { materialZerlegen, werkstoffGenau } from "../daten/material.js";
import {
  z, chf, stundensatz, staffelRechnen, leereKalkulation, kalkulationenLaden, maschinenLaden,
  kalkulationSpeichern, maschineSpeichern, naechsteNr, BEISPIEL_MASCHINEN, beispielKalkulation, START_MASCHINEN, startArbeitsplan, WAEHRUNGEN, kursHolen, EXTERN_NEBEN, FGK_DREHEN, SPEZ_GEWICHT, PREIS_JE_STAFFEL, preisInStaffeln,
} from "../daten/kalkulation.js";

const REITER = [
  ["kopf", "Kopfdaten"], ["material", "Staffeln und Material"], ["ags", "Arbeitsgänge"],
  ["preis", "Preis"], ["ergebnis", "Ergebnis"], ["angebot", "Angebot"],
];

// Offene Kalkulation und Reiter bleiben beim Seitenwechsel und Neuladen
const gemerkt = { offen: null, reiter: "kopf", saetze: false, suche: "" };
teilMerken("kalkulation", () => ({ ...gemerkt }), (x) => { Object.assign(gemerkt, x); });

// Escape: aus der Kalkulation oder den Stundensätzen zurück zur Liste
let zurueckFn = null;
export function kalkulationZurueck() { return zurueckFn ? zurueckFn() : false; }

export default function Kalkulation({ auffrischen }) {
  const [offen, setOffen] = useState(gemerkt.offen);
  const [saetze, setSaetze] = useState(gemerkt.saetze);
  useGemerkt(gemerkt, { offen, saetze });
  const liste = useDaten(kalkulationenLaden, [auffrischen]);
  const masch = useDaten(maschinenLaden, [auffrischen]);

  zurueckFn = () => {
    if (offen || saetze) { setOffen(null); setSaetze(false); return true; }
    return false;
  };
  useEffect(() => () => { zurueckFn = null; }, []);

  useSeitenSuche({
    name: "Kalkulation", platzhalter: "Nummer, Kunde oder Artikel …",
    eintraege: () => (liste.daten || []).map((k) => ({
      gruppe: "Kalkulationen", zeichen: "∑", titel: (k.nr || "ohne Nr.") + " · " + (k.kunde || "ohne Kunde"),
      zeile: [k.artikel, k.daten && k.daten.kopf && k.daten.kopf.bezeichnung].filter(Boolean).join(" · "), id: k.id })),
    springen: (x) => { setSaetze(false); setOffen(x.id); },
  });

  const fehler = liste.fehler || masch.fehler;
  if (fehler && (!liste.daten || !masch.daten)) {
    return <><h1 className="seitentitel">Kalkulation</h1>
      <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></>;
  }
  if (!liste.daten || !masch.daten) {
    return <><h1 className="seitentitel">Kalkulation</h1><div className="laedt">Wird geladen …</div></>;
  }

  if (saetze) {
    return <Stundensaetze maschinen={masch.daten} neu={masch.neu} zurueck={() => setSaetze(false)} />;
  }
  const eintrag = offen && liste.daten.find((k) => k.id === offen);
  if (eintrag) {
    return <Bearbeiten key={eintrag.id} eintrag={eintrag} maschinen={masch.daten}
      zurueck={() => { setOffen(null); liste.neu(); }} neu={liste.neu} oeffnen={setOffen} liste={liste.daten} />;
  }
  return <Liste liste={liste.daten} maschinen={masch.daten} oeffnen={setOffen}
    neu={() => { liste.neu(); masch.neu(); }} saetze={() => setSaetze(true)} />;
}

// ---------- Liste aller Kalkulationen ----------
function Liste({ liste, maschinen, oeffnen, neu, saetze }) {
  const [laeuft, setLaeuft] = useState(false);
  // Suche in der Liste (Wunsch Patrick 27. Oktober 2026): alle Wörter müssen irgendwo im Kopf der Kalkulation stehen
  const [suche, setSuche] = useState(gemerkt.suche || "");
  useGemerkt(gemerkt, { suche });
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  const gefunden = !woerter.length ? liste : liste.filter((k) => {
    const kopf = (k.daten && k.daten.kopf) || {};
    const text = [k.nr, k.kunde, k.artikel, ...Object.values(kopf)].filter((x) => typeof x === "string").join(" ").toLowerCase();
    return woerter.every((w) => text.includes(w));
  });

  async function anlegen(beispiel) {
    setLaeuft(true);
    try {
      let daten = leereKalkulation();
      let masch = maschinen;
      // Die Stundensätze, die der Start-Arbeitsplan braucht, anlegen, soweit sie fehlen
      const fehlt = BEISPIEL_MASCHINEN.filter((m) => (beispiel || START_MASCHINEN.includes(m.name))
        && !masch.some((x) => x.name === m.name));
      for (const m of fehlt) await maschineSpeichern(m);
      if (fehlt.length) masch = await maschinenLaden();
      if (beispiel) daten = beispielKalkulation(masch);
      else daten.ags = startArbeitsplan(masch);
      const id = await kalkulationSpeichern({ nr: beispiel ? "20225174" : naechsteNr(liste), daten });
      neu();
      oeffnen(id);
      gemerkt.reiter = beispiel ? "ergebnis" : "kopf";
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  }

  return (
    <>
      <h1 className="seitentitel">Kalkulation</h1>
      <div className="kalk-knoepfe">
        <button className="knopf knopf--haupt" id="kalk-neu" disabled={laeuft} onClick={() => anlegen(false)}>+ Neue Kalkulation</button>
        <button className="knopf" id="kalk-saetze" onClick={saetze}>Stundensätze der Maschinen ({maschinen.length})</button>
        {!liste.some((k) => k.nr === "20225174") &&
          <button className="knopf" id="kalk-beispiel" disabled={laeuft} onClick={() => anlegen(true)}>Beispiel aus Gewatec anlegen</button>}
      </div>
      {!liste.length
        ? <div className="karte karte--hinweis"><p>Noch keine Kalkulation. Mit „Beispiel aus Gewatec anlegen“ kommt die
            Kalkulation 20225174 mit allen Zahlen herein, zum Vergleichen mit dem Gewatec.</p></div>
        : <section className="karte kalk-rolle">
            <input type="text" id="kalk-suche" className="kalk-suche" value={suche} placeholder="Suchen: Nummer, Kunde, Artikel, Zeichnung, Bezeichnung …"
              onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && suche) { e.preventDefault(); setSuche(""); } }} />
            {!gefunden.length ? <p className="hinweis" id="kalk-nichts">Keine Kalkulation gefunden.</p> :
            <table className="tabelle kalk-liste">
              <thead><tr><th>Nr.</th><th>Kunde</th><th>Artikel</th><th>Staffeln</th><th className="rechts">Preis</th><th>Geändert</th></tr></thead>
              <tbody>
                {gefunden.map((k) => {
                  const d = k.daten || {};
                  const staffeln = (d.staffeln || []).filter((s) => z(s.menge) > 0);
                  const erste = staffeln.length ? staffelRechnen(d, staffeln[0], maschinen) : null;
                  return (
                    // Die Klassen je Zelle braucht das Handy: dort wird jede Zeile ein Kärtchen (seit 1.237.1)
                    <tr key={k.id} data-kalk={k.id} className="kalk-liste__zeile" onClick={() => oeffnen(k.id)}>
                      <td className="kalk-liste__nr"><b>{k.nr || "–"}</b></td>
                      <td className="kalk-liste__kunde">{k.kunde || "–"}</td>
                      <td className="kalk-liste__artikel">{k.artikel || ""}{d.kopf && d.kopf.bezeichnung ? <span className="kalk-klein">{d.kopf.bezeichnung}</span> : null}</td>
                      <td className="kalk-liste__staffeln">{staffeln.map((s) => chf(z(s.menge), 0)).join(" / ")}</td>
                      <td className="rechts kalk-liste__preis">{erste ? chf(erste.angebotAus) + (erste.waehrung !== "CHF" ? " " + erste.waehrung : "") : "–"}</td>
                      <td className="kalk-liste__datum">{alt.datumZeitKurz ? alt.datumZeitKurz(k.geaendert_am) : ""}</td>
                    </tr>);
                })}
              </tbody>
            </table>}
          </section>}
      <p className="hinweis">Testprogramm, nur für freigegebene Personen sichtbar. Gerechnet wird genau wie im Gewatec,
        aber mit beliebig vielen Staffelmengen.</p>
    </>
  );
}

// ---------- Eine Kalkulation bearbeiten ----------
function Bearbeiten({ eintrag, maschinen, zurueck, neu, oeffnen, liste }) {
  const [nr, setNr] = useState(eintrag.nr || "");
  const [k, setK] = useState(() => mitVorgaben(eintrag.daten));
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [stand, setStand] = useState("gespeichert");
  useGemerkt(gemerkt, { reiter });

  // Von selbst speichern, eine Sekunde nach der letzten Eingabe
  const erstes = useRef(true);
  useEffect(() => {
    if (erstes.current) { erstes.current = false; return; }
    setStand("ungespeichert");
    const t = setTimeout(async () => {
      setStand("speichert");
      try { await kalkulationSpeichern({ id: eintrag.id, nr, daten: k }); setStand("gespeichert"); neu(); }
      catch (f) { setStand("fehler"); alt.meldung(alt.fehlertext(f), "fehler"); }
    }, 1000);
    return () => clearTimeout(t);
  }, [k, nr]);

  // Ein Feld irgendwo in der Kalkulation ändern: setze("kopf.kunde", wert)
  const setze = (pfad, wert) => setK((alt0) => {
    const neu0 = structuredClone(alt0);
    const teile = pfad.split(".");
    let o = neu0;
    teile.slice(0, -1).forEach((t) => { if (o[t] == null) o[t] = {}; o = o[t]; });
    o[teile[teile.length - 1]] = wert;
    return neu0;
  });

  const staffeln = k.staffeln.filter((s) => z(s.menge) > 0);
  const rechnung = staffeln.map((s) => staffelRechnen(k, s, maschinen));

  async function kopieren() {
    try {
      const id = await kalkulationSpeichern({ nr: naechsteNr(liste), daten: structuredClone(k) });
      alt.meldung("Kopie angelegt.", "gut");
      neu(); oeffnen(id);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  async function loeschen() {
    const weg = await alt.loeschen({ titel: "Kalkulation löschen?", text: "Kalkulation " + (nr || "") + " wird gelöscht.",
      tabelle: "kalkulationen", id: eintrag.id, rueckText: "Kalkulation löschen" });
    if (weg) zurueck();
  }

  const Inhalt = { kopf: Kopf, material: Material, ags: Arbeitsgaenge, preis: Preis, ergebnis: Ergebnis, angebot: Angebot }[reiter] || Kopf;
  return (
    <div className="kalk-kompakt" onKeyDown={enterWeiter}>
      <div className="kalk-kopf">
        <div className="kalk-kopf__links">
          <button className="knopf knopf--klein kalk-zurueck" id="kalk-zurueck" onClick={zurueck}>← Alle</button>
          <h1 className="seitentitel">Kalkulation {nr}</h1>
          <div className="kalk-kopf__unter">{[k.kopf.kunde, k.kopf.artikel, k.kopf.bezeichnung].filter(Boolean).join(" · ") || "Noch ohne Kunde und Artikel"}</div>
        </div>
        <div className="kalk-kopf__rechts">
          <span className={"kalk-stand kalk-stand--" + stand} id="kalk-stand">
            {{ gespeichert: "Gespeichert", ungespeichert: "Wird gleich gespeichert …", speichert: "Speichert …", fehler: "Nicht gespeichert" }[stand]}
          </span>
          <button className="knopf knopf--klein" id="kalk-kopieren" onClick={kopieren}>Kopieren</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" id="kalk-loeschen" onClick={loeschen}>Löschen</button>
        </div>
      </div>

      {/* Immer sichtbar: was jede Staffel kostet */}
      <div className="kalk-band" id="kalk-band">
        {rechnung.length ? rechnung.map((r, i) => (
          <div className="kalk-band__staffel" key={i} data-staffel={i}>
            <span>{chf(r.menge, 0)} Stk</span>
            <b>{chf(r.angebotAus)}{r.waehrung !== "CHF" ? " " + r.waehrung : ""}</b>
            <small>Selbstkosten {chf(r.selbstVerz, 4)} · DB {chf(r.dbPct, 1)} %</small>
          </div>)) : <div className="kalk-band__leer">Noch keine Staffelmenge</div>}
      </div>

      <Reiter reiter={REITER} aktiv={reiter} waehlen={setReiter} merkmal="kalk-reiter" />
      <Uebergang key={reiter}>
        <div id="kalk-inhalt">
          <Inhalt k={k} setze={setze} setK={setK} nr={nr} setNr={setNr} maschinen={maschinen} rechnung={rechnung} />
        </div>
      </Uebergang>
     </div>
  );
}

// Ältere oder unvollständige Daten mit den Feldern einer neuen ergänzen
// Enter springt wie Tab ins nächste Feld, Shift + Enter zurück; in den
// Tabellen je Staffel stehen die Felder Zeile für Zeile, also nach rechts
// (Wunsch Patrick 27. Oktober 2026). Mehrzeilige Felder behalten Enter.
function enterWeiter(e) {
  if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (!t.matches || !t.matches("input:not([type=checkbox]):not([type=radio]), select")) return;
  const felder = [...e.currentTarget.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")]
    .filter((x) => !x.disabled && !x.readOnly && x.offsetParent !== null);
  const i = felder.indexOf(t);
  const ziel = felder[i + (e.shiftKey ? -1 : 1)];
  if (i < 0 || !ziel) return;
  e.preventDefault();
  ziel.focus();
  if (ziel.select && ziel.tagName === "INPUT") ziel.select();
}

// Eine Tabelle, die genau den Bildschirm füllt: die Zeilen teilen sich die
// Höhe unter der Tabelle bis zum unteren Rand, so ist auf kleinen
// Bildschirmen nichts zu rollen und auf grossen wird es grösser
// (Patrick 27. Oktober 2026: „ich will nicht scrollen“, „kann grösser werden nach unten“)
function useBildschirmHoch() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return undefined;
    const passen = () => {
      const zeilen = t.querySelectorAll("tr").length || 1;
      const seite = document.scrollingElement;
      const setzen = (kz) => t.style.setProperty("--kz", kz + "px");
      // Zuerst gross schätzen, dann messen und verkleinern, bis die Seite
      // nicht mehr rollt: Schrift und Felder machen Zeilen oft höher als --kz
      const oben = t.getBoundingClientRect().top + window.scrollY;
      let kz = Math.max(12, Math.min(34, Math.floor((window.innerHeight - oben - 40) / zeilen)));
      setzen(kz);
      for (let i = 0; i < 25 && kz > 12; i++) {
        const zuViel = seite.scrollHeight - window.innerHeight;
        if (zuViel <= 0) break;
        kz = Math.max(12, kz - Math.max(1, Math.floor(zuViel / zeilen)));
        setzen(kz);
      }
    };
    passen();
    window.addEventListener("resize", passen);
    return () => window.removeEventListener("resize", passen);
  });
  return ref;
}

function mitVorgaben(d) {
  const leer = leereKalkulation();
  const x = structuredClone(d || {});
  for (const t of ["kopf", "material", "preis", "angebot"]) x[t] = { ...leer[t], ...(x[t] || {}) };
  if (!Array.isArray(x.staffeln)) x.staffeln = leer.staffeln;
  if (!Array.isArray(x.ags)) x.ags = [];
  // Feste Schlüssel, weil die Werte je Staffel daran hängen
  x.ags = x.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));
  return preisInStaffeln(x);
}

// Ein Eingabefeld; Zahlen als Text, damit Komma und Apostroph gehen
function F({ label, wert, setzen, einheit, id, text, mehrzeilig, hinweis, typ, platz, liste, breit }) {
  return (
    <label className={"feld kalk-feld" + (breit ? " kalk-feld--breit" : "")}>
      <span>{label}{einheit ? <em> {einheit}</em> : null}</span>
      {mehrzeilig
        ? <textarea id={id} rows={3} value={wert || ""} onChange={(e) => setzen(e.target.value)} />
        : <input id={id} type={typ || "text"} inputMode={text || typ ? undefined : "decimal"} value={wert == null ? "" : wert}
            placeholder={platz} list={liste} onChange={(e) => setzen(e.target.value)} />}
      {hinweis ? <span className="feldhinweis">{hinweis}</span> : null}
    </label>
  );
}

function Kopf({ k, setze, nr, setNr }) {
  const f = (name) => ({ wert: k.kopf[name], setzen: (w) => setze("kopf." + name, w) });
  // Ist der Artikel-Code eine bekannte HOCO Nr., kommt das Material des
  // jüngsten Auftrags von selbst, solange noch keins eingetragen ist
  // (Wunsch Patrick 27. Oktober 2026)
  const [matHinweis, setMatHinweis] = useState("");
  const artikel = (k.kopf.artikel || "").trim();
  const matLeer = !String(k.material.bez || "").trim();
  useEffect(() => {
    if (!/^\d{4,6}-\d{3,4}$/.test(artikel) || !matLeer) return undefined;
    let weg = false;
    const zeit = setTimeout(async () => {
      try {
        const r = await alt.db.from("jobs").select("material_bez, planned_from").eq("job_number", artikel)
          .not("material_bez", "is", null).order("planned_from", { ascending: false }).limit(1);
        const bez = r && !r.error && r.data && r.data[0] ? String(r.data[0].material_bez || "").trim() : "";
        if (weg || !bez) return;
        setze("material.bez", bez);
        const w = werkstoffGenau(bez);
        if (w && w.nr) setze("material.nr", w.nr);
        const t = materialZerlegen(bez);
        if (t && t.d) setze("material.d", String(t.d));
        setMatHinweis("Material aus HOCO Nr. " + artikel + " übernommen: " + bez);
      } catch (e) { /* ohne Verbindung bleibt das Feld leer */ }
    }, 500);
    return () => { weg = true; clearTimeout(zeit); };
  }, [artikel, matLeer]);
  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Kunde und Artikel</h2>
        <F label="Kalkulation Nr." id="kalk-nr" text wert={nr} setzen={setNr} />
        <F label="Kunde" id="kalk-kunde" text {...f("kunde")} />
        <F label="Adresse" id="kalk-adresse" mehrzeilig {...f("adresse")} />
        <F label="Artikel-Code" id="kalk-artikel" text {...f("artikel")} />
        {matHinweis && <p className="hinweis" id="kalk-mat-hinweis">{matHinweis}</p>}
        <F label="Zeichnung" id="kalk-zeichnung" text {...f("zeichnung")} />
        <F label="Kunden Ident-Nr." id="kalk-ident" text {...f("ident")} />
        <F label="Index" id="kalk-index" text {...f("index")} />
        <F label="Teilebezeichnung" id="kalk-bez" text {...f("bezeichnung")} />
      </section>
      <section className="karte">
        <h2>Anfrage und Bearbeitung</h2>
        <F label="Anfrage vom" id="kalk-anfrage" typ="date" {...f("anfrage")} />
        <F label="Ihr Zeichen" id="kalk-zeichen" text {...f("zeichen")} />
      </section>
    </div>
  );
}

function Material({ k, setze, setK, rechnung }) {
  const m = k.material;
  const f = (name) => ({ wert: m[name], setzen: (w) => setze("material." + name, w) });
  const r0 = rechnung[0];
  return (
    <>
      {/* Staffeln nebeneinander, Lose darunter, damit nichts rollt
          (Wunsch Patrick 27. Oktober 2026) */}
      <section className="karte kalk-rolle">
        <h2>Staffelmengen <small className="kalk-einheit">Lose: wie oft gerüstet wird, jedes weitere Los mit „Folgerüsten“</small></h2>
        <table className="kalk-tab kalk-eng kalk-staffeltab" id="kalk-staffeln">
          <tbody>
            <tr><td></td>{k.staffeln.map((s, i) => <th key={i} className="rechts" data-staffel-zeile={i}>Staffel {i + 1}
              {k.staffeln.length > 1 && <button className="linkknopf linkknopf--gefahr kalk-staffel-weg" data-staffel-weg={i} title="Staffel entfernen"
                onClick={() => setK((x) => ({ ...x, staffeln: x.staffeln.filter((_, j) => j !== i) }))}>✕</button>}</th>)}
              <td rowSpan={3}><button className="knopf knopf--klein" id="kalk-staffel-neu"
                onClick={() => setK((x) => ({ ...x, staffeln: [...x.staffeln, { menge: "", lose: "1", preis: { ...((x.staffeln[0] || {}).preis || {}) } }] }))}>+ Staffel</button></td></tr>
            <tr><td>Menge <span className="kalk-einheit">Stk</span></td>{k.staffeln.map((s, i) => (
              <td key={i} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-menge-" + i}
                value={s.menge || ""} onChange={(e) => setze("staffeln." + i + ".menge", e.target.value)} /></td>))}</tr>
            <tr><td>Lose</td>{k.staffeln.map((s, i) => (
              <td key={i} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-lose-" + i}
                value={s.lose || ""} onChange={(e) => setze("staffeln." + i + ".lose", e.target.value)} /></td>))}</tr>
          </tbody>
        </table>
      </section>

      <section className="karte">
        <h2>Material</h2>
        <div className="kalk-reihe">
          <F label="Materialbezeichnung" id="kalk-mat" text breit {...f("bez")} />
          <F label="Werkstoff-Nr." id="kalk-matnr" text {...f("nr")} />
        </div>
        <div className="kalk-reihe">
          <F label="Materialpreis" einheit="CHF/kg" id="kalk-matpreis" {...f("preis")} />
          <F label="Material-Gemeinkosten" einheit="%" id="kalk-matgk" {...f("gk")} />
          <F label="Material-Gemeinkosten pauschal" einheit="CHF" id="kalk-matgkp" {...f("gkPausch")} />
        </div>
        <div className="kalk-reihe">
          <F label="Abmessung" id="kalk-abmessung" text platz="Stange Ø 12.7 x 73.5 geschliffen" {...f("abmessung")} />
          <label className="feld kalk-feld"><span>Spezifisches Gewicht von</span>
            <select id="kalk-spez" value={(SPEZ_GEWICHT.find(([, w]) => z(w) === z(m.dichte)) || [""])[0]}
              onChange={(e) => { const x = SPEZ_GEWICHT.find(([n]) => n === e.target.value); if (x) setze("material.dichte", x[1]); }}>
              <option value="">– eigener Wert –</option>
              {SPEZ_GEWICHT.map(([n, w]) => <option key={n} value={n}>{n} ({w})</option>)}
            </select>
          </label>
        </div>
        <div className="moduswahl kalk-modus">
          {[["hand", "Einsatzgewicht je Stück eintragen"], ["rechnen", "Aus Länge und Stangen rechnen"]].map(([w, t]) => (
            <button key={w} className={"moduswahl__knopf" + (m.modus === w ? " aktiv" : "")} data-matmodus={w}
              onClick={() => setze("material.modus", w)}>{t}</button>))}
        </div>
        {m.modus === "rechnen"
          ? <div className="kalk-reihe">
              <F label="Ø" einheit="mm" id="kalk-d" {...f("d")} />
              <F label="Länge je Teil mit Abstich" einheit="mm" id="kalk-laenge" {...f("laenge")} />
              <F label="Stange" einheit="mm" id="kalk-stange" {...f("stange")} />
              <F label="Reststück" einheit="mm" id="kalk-rest" {...f("rest")} />
              <F label="Dichte" einheit="kg/dm³" id="kalk-dichte" {...f("dichte")} />
            </div>
          : <div className="kalk-reihe">
              <F label="Materialeinsatz" einheit="kg/Stk" id="kalk-einsatz" {...f("einsatz")} />
              <F label="Ø für Meter und Stangen" einheit="mm" id="kalk-d" {...f("d")} />
              <F label="Stange" einheit="mm" id="kalk-stange" {...f("stange")} />
              <F label="Dichte" einheit="kg/dm³" id="kalk-dichte" {...f("dichte")} />
            </div>}
      </section>

      {rechnung.length > 0 &&
        <section className="karte kalk-rolle">
          <table className="tabelle kalk-tab kalk-eng" id="kalk-mat-tab">
            <thead><tr><th>Menge</th>{rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)}</th>)}</tr></thead>
            <tbody>
              <Zeile titel="kg gesamt" werte={rechnung.map((r) => chf(r.mat.kg, 1))} />
              <Zeile titel="Meter gesamt" werte={rechnung.map((r) => chf(r.mat.meter, 1))} />
              <Zeile titel="Stangen" werte={rechnung.map((r) => chf(r.mat.stangen, m.modus === "rechnen" ? 0 : 1))} />
              <Zeile titel="kg je Stück" werte={rechnung.map((r) => chf(r.mat.kgJeStk, 4))} />
              <Zeile titel="Mat-Kosten = kg gesamt × Preis" einheit="CHF" werte={rechnung.map((r) => chf(r.mat.roh))} klein />
              <Zeile titel="Materialkosten mit Gemeinkosten" einheit="CHF" werte={rechnung.map((r) => chf(r.mat.kosten))} />
              <Zeile titel="Material je Stück" einheit="CHF" fett werte={rechnung.map((r) => chf(r.matStk, 4))} />
            </tbody>
          </table>
          {r0 && r0.mat.kgJeM > 0 && <p className="hinweis">{chf(r0.mat.kgJeM, 3)} kg je Meter Stange.</p>}
        </section>}
    </>
  );
}

function Zeile({ titel, einheit, werte, fett, klein }) {
  return (
    <tr className={(fett ? "kalk-fett" : "") + (klein ? " kalk-blass" : "")}>
      <td>{titel}{einheit ? <span className="kalk-einheit"> {einheit}</span> : null}</td>
      {werte.map((w, i) => <td key={i} className="rechts">{w}</td>)}
    </tr>
  );
}

function Arbeitsgaenge({ k, setze, setK, maschinen, rechnung }) {
  const r0 = rechnung[0];
  // Aufgeklappte Arbeitsgänge; zugeklappt steht jeder als eine Zeile wie im Gewatec (Wunsch Patrick 27. Oktober 2026)
  const [auf, setAuf] = useState(() => new Set());
  const umschalten = (key) => setAuf((x) => { const n = new Set(x); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const neu = (art) => {
    const key = schluessel();
    setAuf((x) => new Set(x).add(key));
    setK((x) => ({ ...x, ags: [...x.ags, art === "extern"
      ? { key, bez: "", art: "extern", je: "stk", extern: "", ruestPausch: "" }
      : { key, bez: "", art: "intern", masch: (maschinen[0] || {}).id || "", te: "", erst: "", folge: "", fgk: "" }] }));
  };
  // Jeder Arbeitsgang braucht einen festen Schlüssel fürs Ziehen
  const ags = k.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));

  return (
    <>
      {!maschinen.length && <div className="karte karte--hinweis"><p>Noch keine Stundensätze. Zuerst unter
        „Alle Kalkulationen“ → „Stundensätze der Maschinen“ eine Maschine anlegen.</p></div>}
      {rechnung.length > 0 && <div className="kalk-lose" id="kalk-lose">
        <span className="kalk-einheit">Fertigungslose je Staffel:</span>
        {rechnung.map((r, n) => <span key={n} className="kalk-lose__teil" data-lose={n}>
          {chf(r.menge, 0)} Stk: <b>{r.lose} {r.lose === 1 ? "Los" : "Lose"}</b>{" "}
          <span className="kalk-einheit">({chf(r.menge / r.lose, 0)} Stk je Los)</span></span>)}
      </div>}
      <div className="kalk-ag-titel" aria-hidden="true">
        <span></span><span>AG</span><span>Bezeichnung</span><span>Maschine / Lieferant</span><span className="rechts">te Sek.</span>
        <span className="rechts">tr Std</span><span className="rechts">FGK</span><span className="rechts">CHF/Stk</span><span></span>
      </div>
      <ZiehListe id="kalk-ags" className="kalk-ags" darf={true}
        ordnen={(reihe) => setK((x) => {
          const mit = x.ags.map((a, i) => (a.key ? a : { ...a, key: "ag" + i }));
          return { ...x, ags: reihe.map((key) => mit.find((a) => a.key === key)).filter(Boolean) };
        })}
        eintraege={ags.map((a, i) => {
          const r = r0 && r0.ags[i];
          const f = (name) => ({ wert: a[name], setzen: (w) => setze("ags." + i + "." + name, w) });
          const offen = auf.has(a.key);
          const ext = a.art === "extern";
          const mm = !ext && maschinen.find((q) => q.id === a.masch);
          const ruest = [a.erst, a.folge].filter((x) => String(x || "").trim()).join(" / ");
          return { key: a.key, inhalt:
            <div className={"kalk-ag" + (ext ? " kalk-ag--extern" : "") + (offen ? " kalk-ag--auf" : "")} data-ag={i}
              onPointerDown={(e) => { if (e.target.closest("input, select, textarea, button")) e.stopPropagation(); }}>
              <div className="kalk-ag__kopf" onClick={(e) => { if (!e.target.closest("input, select, button")) umschalten(a.key); }}>
                <button className="kalk-ag__auf" data-ag-auf={i} aria-expanded={offen} title={offen ? "Zuklappen" : "Aufklappen"}
                  onClick={() => umschalten(a.key)}>{offen ? "▴" : "▾"}</button>
                <span className="kalk-ag__pos">{(i + 1) * 10}</span>
                <input className="kalk-ag__bez" id={"kalk-ag-bez-" + i} value={a.bez} placeholder="Arbeitsgang wählen oder schreiben"
                  list={a.art === "extern" ? "kalk-ag-vorlagen-extern" : "kalk-ag-vorlagen"}
                  onChange={(e) => {
                    const t = e.target.value;
                    setze("ags." + i + ".bez", t);
                    // Drehen hat im Gewatec 56 % FGK, vorbelegt solange das Feld leer ist (Wunsch Patrick 27. Oktober 2026)
                    if (a.art !== "extern" && /^drehen/i.test(t) && !String(a.fgk || "").trim()) setze("ags." + i + ".fgk", FGK_DREHEN);
                  }} />
                <span className="kalk-ag__ort">{ext ? <><i>Extern</i> {a.lieferant || ""}</> : (mm ? mm.name : <i>keine Maschine</i>)}</span>
                <span className="kalk-ag__zahl">{ext ? (a.extern ? chf(z(a.extern), 2) + " /" + ({ stk: "Stk", "100stk": "100", "1000stk": "1000", kg: "kg" }[a.je || "stk"]) : "") : (a.te || "")}</span>
                <span className="kalk-ag__zahl">{ext ? "" : ruest}</span>
                <span className="kalk-ag__zahl">{ext || !String(a.fgk || "").trim() ? "" : a.fgk + " %"}</span>
                <b className="kalk-ag__summe" title="Kosten je Stück bei der ersten Staffel">{r ? chf(r.kosten / r0.menge, 4) : "–"}</b>
                <button className="kalk-ag__weg" data-ag-weg={i} title="Arbeitsgang entfernen"
                  onClick={() => setK((x) => ({ ...x, ags: x.ags.filter((_, j) => j !== i) }))}>✕</button>
              </div>
              {offen && (ext
                ? <div className="kalk-extern">
                    <div className="kalk-reihe">
                      <F label="Lieferant" id={"kalk-ag-lief-" + i} text {...f("lieferant")} />
                      <label className="feld kalk-feld"><span>Kostensatz je</span>
                        <select id={"kalk-ag-je-" + i} value={a.je || "stk"} onChange={(e) => setze("ags." + i + ".je", e.target.value)}>
                          <option value="stk">1 Stk</option><option value="100stk">100 Stk</option>
                          <option value="1000stk">1000 Stk</option><option value="kg">kg</option>
                        </select>
                      </label>
                      <F label="Kostensatz" einheit="CHF" id={"kalk-ag-ext-" + i} {...f("extern")} />
                      <F label="Gewicht je Stück" einheit="kg" id={"kalk-ag-kg-" + i} {...f("kgStk")}
                        platz={r ? chf(r.kgStk, 4) : ""} hinweis="Leer = Materialeinsatz je Stück" />
                    </div>
                    <div className="kalk-reihe">
                      <F label="Postensatz pauschal" einheit="CHF" id={"kalk-ag-posten-" + i} {...f("posten")} />
                      <F label="bis" einheit="kg" id={"kalk-ag-postenbis-" + i} {...f("postenBis")}
                        hinweis="Postensatz statt Kostensatz bis zu diesem Gewicht, leer = immer" />
                    </div>
                    <table className="kalk-extern__neben">
                      <thead><tr><th></th><th>CHF je Stk</th><th>CHF pauschal</th><th></th></tr></thead>
                      <tbody>{EXTERN_NEBEN.map(([n, titel, verr]) => (
                        <tr key={n}><td>{titel}</td>
                          <td><input type="text" inputMode="decimal" id={"kalk-ag-" + n + "stk-" + i} value={a[n + "Stk"] || ""}
                            onChange={(e) => setze("ags." + i + "." + n + "Stk", e.target.value)} /></td>
                          <td><input type="text" inputMode="decimal" id={"kalk-ag-" + n + "p-" + i}
                            value={(n === "ruest" && a.ruestPausch == null ? a.externRuest : a[n + "Pausch"]) || ""}
                            onChange={(e) => setze("ags." + i + "." + n + "Pausch", e.target.value)} /></td>
                          <td>{verr && <label className="kalk-haken"><input type="checkbox" id={"kalk-ag-" + n + "v-" + i}
                            checked={a[n + "Verr"] !== false} onChange={(e) => setze("ags." + i + "." + n + "Verr", e.target.checked)} /> Verrechnen</label>}</td>
                        </tr>))}</tbody>
                    </table>
                    <ExternJeStaffel a={a} i={i} k={k} setK={setK} rechnung={rechnung} />
                  </div>
                : <div className="kalk-reihe">
                    <label className="feld kalk-feld"><span>Maschine</span>
                      <select id={"kalk-ag-m-" + i} value={a.masch || ""} onChange={(e) => setze("ags." + i + ".masch", e.target.value)}>
                        <option value="">– wählen –</option>
                        {maschinen.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      {r && r.satz && <span className="feldhinweis">{chf(r.satz.eff)} CHF/h{r.satz.lauf ? " bei " + chf(r.satz.lauf, 1) + " Std/Tag" : ""}, Rüsten {chf(r.satz.ruest)} CHF/h</span>}
                    </label>
                    <F label="Laufzeit" einheit="Std/Tag" id={"kalk-ag-lt-" + i} {...f("laufTag")}
                      platz={(() => { const mm = maschinen.find((q) => q.id === a.masch); return mm && mm.daten && mm.daten.laufTag ? String(mm.daten.laufTag) : ""; })()} />
                    <F label="Stückzeit" einheit="Sek." id={"kalk-ag-te-" + i} {...f("te")} />
                    <F label="Erstrüsten" einheit="Std" id={"kalk-ag-er-" + i} {...f("erst")} />
                    <F label="Folgerüsten" einheit="Std" id={"kalk-ag-fr-" + i} {...f("folge")} />
                    <F label="FGK" einheit="%" id={"kalk-ag-fgk-" + i} {...f("fgk")} />
                    <label className="kalk-haken kalk-multi"><input type="checkbox" id={"kalk-ag-multi-" + i} checked={!!a.multi}
                      onChange={(e) => setze("ags." + i + ".multi", e.target.checked)} /> Multimaschinell: je Staffel eigene Werte</label>
                    {a.multi && <JeStaffel a={a} i={i} k={k} setK={setK} maschinen={maschinen} rechnung={rechnung} />}
                  </div>)}
              {offen && r && !r.extern && (r.laufH > 0 || r.ruestChf > 0) &&
                <div className="kalk-ag__fuss">Fix {chf(r.fix / r0.menge, 4)} · Variabel {chf(r.var / r0.menge, 4)}
                  {" "}· Laufzeit {chf(r.laufH, 1)} h · Rüsten {chf(r.ruestChf)} CHF bei {chf(r0.menge, 0)} Stk</div>}
            </div> };
        })} />
      <datalist id="kalk-ag-vorlagen">{AG_VORLAGEN.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="kalk-ag-vorlagen-extern">{AG_VORLAGEN_EXTERN.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="kalk-knoepfe">
        <button className="knopf" id="kalk-ag-intern" onClick={() => neu("intern")}>+ Interner Arbeitsgang</button>
        <button className="knopf" id="kalk-ag-extern" onClick={() => neu("extern")}>+ Externer Arbeitsgang</button>
      </div>
      <p className="hinweis">Kosten = (Laufzeit × Stundensatz + Rüstzeit × Rüstsatz) × (1 + FGK). Zeile antippen klappt den Arbeitsgang auf, am Griff links ziehen ändert die Reihenfolge.</p>
    </>
  );
}

const LAUFZEITEN = [8, 10, 12, 14, 16, 18, 20, 22, 24];

// Arbeitsgänge zur Auswahl, wie „Arbeitsgänge-Auswahl“ im Gewatec
// (Bildschirmfoto Patrick 27. Oktober 2026); freier Text geht auch
// Lieferbedingungen wie im Gewatec (Kürzel, Text), Bild Patrick 27. Oktober 2026
const LIEFERBEDINGUNGEN = [
  ["ABH", "abgeholt"], ["DDP", "DDP Schwanden"], ["EXW D", "ab Werk"], ["EXW E", "ex works"],
  ["EXWEXV", "ab Werk, exkl. Verpackung"], ["EXWEXVT", "ab Werk, exkl. Verpackung/Transport"],
  ["EXWIV", "ab Werk, inkl. Verpackung"], ["EXWSPEZ", "Packing and Delivery not included"], ["F", "franko"],
  ["FCAL", "FCA Lohn-Ammannsegg, packing included"], ["FD", "franko Domizil"], ["FDIV", "franko Domizil, inkl. Verpackung"],
  ["FDIVT", "franko Domizil inkl. Verpackung/Transport"], ["FDZ", "franko Domizil verzollt"],
  ["FGW", "franko Galvano Wullimann, inkl. Verpackung"], ["fHIV", "frei Haus, incl. Verpackung"],
  ["FRH", "Frei Haus, inkl. Verpackung"], ["FRHIVTZ", "Frei Haus, inkl. Verpackung, Transpotkosten und Verzollung"],
  ["LIECHTI", "an Liechti AG - Niederwangen"], ["SCHM", "an Härterei Schmid AG - 4657 Dulliken"],
  ["SPFUX", "Abgh: SpediFux"], ["WBC", "an WBC Härterei AG - Bubikon"],
];

// Versandbedingungen wie im Gewatec, Bild Patrick 27. Oktober 2026
const VERSANDBEDINGUNGEN = [
  ["ABG", "abgeholt"], ["ABGKU", "abgeholt im Auftrag Kunde"], ["CDOM", "per Cargo Domicile"],
  ["COBI", "an Cobianchi AG-3672 Oberdiessbach"], ["DHL", "per DHL"], ["DHL EXP", "per DHL Express"],
  ["EGGER", "via E. Egger, St. Gallen"], ["EMBRU", "an: Embru Werke AG - 8630 Rüti ZH"], ["FEDEX", "per FedEX"],
  ["Ferag", "abgeholt per Camion Ferag"], ["GONDR", "per Gondrand AG, Basel"], ["LGI", "via LGI Logistics"],
  ["LIECHT", "an Liechti AG, 3172 Niederwangen"], ["LÜ", "Lieferung überbracht"],
  ["MICHEL", "an Adrian Michel AG - 5046 Schmiedrued-Walde"], ["PLANZER", "via Planzer Trasporti SA, 6934 Bioggio"],
  ["PODHDP", "per Post/DHL/DPD"], ["POST", "per Post"], ["POSTEXP", "per Post-Express"], ["POSTPRIO", "per Post-Priority"],
  ["POSTURG", "Post Urgent"], ["RERO", "an RERO Waldenburg"], ["Schenker", "via Schenker Storen, Schönenwerd"],
  ["SCHM", "an:Härterei Schmid AG-4657 Dulliken"], ["SPFUX", "per SpediFux"],
  ["TECHNOLAC", "an Technolac, Riedmatt 6, 6373 Ennetbürgen"], ["TNT", "per TNT economy express"],
  ["Tribo", "per Cargo Domizile an Tribo Tech AG"], ["UPS", "per UPS"], ["UPS EXP", "per UPS Express"],
  ["UPS EXPS", "per UPS Express Saver"], ["UPS STAND", "per UPS Standard"], ["USM", "Lieferung an USM Münsingen"],
  ["WBC", "an WBC Härterei, 8608 Bubikon"], ["WULL", "an Galvano Wullimann, 2545 Selzach"],
];

// Zahlungsbedingungen wie im Gewatec, Bild Patrick 27. Oktober 2026
const ZAHLUNGSBEDINGUNGEN = [
  ["10", "10 Tage netto"], ["10230", "10 Tage 2.00% Skonto, 30 Tage netto"], ["10245", "10 Tage 2.00% Skonto, 45 Tage netto"],
  ["10260", "10 Tage 2.00% Skonto, 60 Tage netto"], ["10330", "10 Tage 3.00% Skonto, 30 Tage netto"],
  ["10530", "10 Tage 5.00% Skonto, 30 Tage netto"], ["14230", "14 Tage 2.00% Skonto, 30 Tage netto"],
  ["14330", "14 Tage 3.00% Skonto, 30 Tage netto"], ["14330260", "14 Tage 3% Skonto, 30 Tage 2% Skonto, 60 Tage netto"],
  ["14360", "14 Tage 3.00% Skonto, 60 Tage netto"], ["15", "15 Tage netto"], ["15230", "15 Tage 2.00% Skonto, 30 Tage netto"],
  ["15245", "15 Tage 2.00% Skonto, 45 Tage netto"], ["20445", "20 Tage 4.00% Skonto 45 Tage netto"],
  ["3 x 1/3", "1/3 bei Auftragserteilung, 1/3 bei Lieferung, 1/3 30 Tage netto"], ["30", "30 Tage netto"],
  ["30245", "30 Tage 2.00% Skonto, 45 Tage netto"], ["30260", "30 Tage 2.00% Skonto, 60 Tage netto"],
  ["30360", "30 Tage 3.00% Skonto, 60 Tage netto"], ["30day", "Payment within 30 days"], ["60", "60 Tage netto"],
  ["60290", "60 Tage 2.00% Skonto, 90 Tage netto"], ["6M", "Innert 6 Monaten ab Rechnungsdatum"], ["BAR", "Barzahlung"],
  ["NACH", "per Nachnahme"], ["SOFORT", "Sofort nach Erhalt der Rechnung"], ["VOR", "Lieferung gegen Vorauszahlung"],
];

const AG_VORLAGEN = [
  "Material bereitstellen", "Maschine einrichten", "Erstteilprüfung", "Drehen komplett", "Waschen fettfrei",
  "Zwischenkontrolle", "Endkontrolle", "Versand/Einlagern", "100% auf Butzen kontrollieren", "Bohrung entgraten",
  "Bürsten", "Entgraten", "Fräskante entgraten", "Fremdteile und Späne entfernen", "Gewindesicherung auftragen",
  "Montieren", "Polieren", "Teile abpacken", "Querbohrung von Hand entgraten", "Sichtprüfung auf Blasenbildung (Nickel)",
  "Teile beschriften nach Zeichnung",
];
const AG_VORLAGEN_EXTERN = [
  "Einkauf Handelsteil", "ALTEF40 my", "Brünieren", "Chemisch-Vernickeln", "Elektropolieren", "Eloxieren", "Endurisieren",
  "Geomet 500", "Gleitlackbeschichten", "Harteloxieren", "Nickel-Achrolyte", "Verchromen", "Vergolden", "Vernickeln",
  "Verzinken", "Zink-Phosphatieren", "Bearbeiten nach Zeichnung", "Schleifen nach Zeichnung",
  "Centerless-Durchgangsschleifen nach Zeichnung", "Centerless-Einstechschleifen nach Zeichnung",
  "Richten und Schleifen nach Zeichnung", "Verzahnen nach Zeichnung", "Glasperlen", "Keramikperlenstrahlen",
  "Kugelstrahlen", "Polieren", "Honen", "Trowalisieren", "Sandstrahlen", "Chemisch entgraten", "Montieren nach Zeichnung",
  "Laserbeschriften", "Prägen nach Zeichnung", "Drehen nach Zeichnung", "Reinigen", "Beschichten gemäss Zeichnung",
  "Carbonitrieren < 0.4mm", "Einsatzhärten", "Einsatzhärten und Anlassen", "Einsatzhärten und Brünieren",
  "Glühen gemäss Zeichnung", "Härten und einölen", "Härten und Anlassen", "Härten und Entspannen", "Härten und Richten",
  "Induktiv Härten", "Karbonitrieren und Kugelstrahlen", "Nitrieren gemäss Zeichnung", "Nitrokarburieren",
  "Partiell Hf-Härten + Brünieren", "Plasma-Nitrieren gemäss Zeichnung", "Spannungsfrei glühen", "Tenifer Ma-Nikox",
  "Teniferieren gemäss Zeichnung", "Vakuumglühen", "Vergüten + Anlassen", "Vergüten und Brünieren",
];

let zaehler = 0;
// Multimaschinell: je Staffel eine Zeile mit Laufzeit, Stückzeit,
// Rüsten und FGK; leer gelassen gilt der Wert des Arbeitsgangs darüber
function JeStaffel({ a, i, k, setK, maschinen, rechnung }) {
  const idx = k.staffeln.map((s, j) => (z(s.menge) > 0 ? j : -1)).filter((j) => j >= 0);
  if (!idx.length) return <p className="hinweis">Zuerst unter „Staffeln und Material“ eine Menge eintragen.</p>;
  const setzen = (j, name, wert) => setK((x) => {
    const staffeln = x.staffeln.map((s, n) => (n !== j ? s
      : { ...s, ag: { ...(s.ag || {}), [a.key]: { ...((s.ag || {})[a.key] || {}), [name]: wert } } }));
    return { ...x, staffeln };
  });
  // Aufbau wie die Maske im Gewatec: je Staffel eine Spalte, Werte untereinander
  const spalten = idx.map((j, n) => ({ j, menge: rechnung[n] ? rechnung[n].menge : z(k.staffeln[j].menge),
    eigen: ((k.staffeln[j].ag || {})[a.key]) || {}, r: rechnung[n] && rechnung[n].ags[i] }));
  const feld = (name) => spalten.map(({ j, eigen }) => (
    <td key={j} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-ag-s" + j + "-" + name + "-" + i}
      placeholder={a[name] || ""} value={eigen[name] || ""} onChange={(e) => setzen(j, name, e.target.value)} /></td>));
  const wert = (fn, st) => spalten.map(({ j, r, menge }) => <td key={j} className="rechts">{r && menge ? chf(fn(r, menge), st) : "–"}</td>);
  return (
    <div className="kalk-jestaffel kalk-rolle">
      <table className="kalk-tab">
        <tbody>
          <tr className="kalk-fett"><td>Menge</td>{spalten.map(({ j, menge }) => <td key={j} className="rechts">{chf(menge, 0)} Stk</td>)}</tr>
          <tr><td>Fertigungslose</td>{spalten.map(({ j, r }, n) => <td key={j} className="rechts">{rechnung[n] ? rechnung[n].lose : "–"}</td>)}</tr>
          <tr><td>Auslastung <span className="kalk-einheit">Std/Tag</span></td>{feld("laufTag")}</tr>
          <tr className="kalk-blass"><td>Stundensatz fix</td>{wert((r) => r.satz.fix)}</tr>
          <tr className="kalk-blass"><td>Stundensatz var</td>{wert((r) => r.satz.var)}</tr>
          <tr className="kalk-blass"><td>Stundensatz eff</td>{wert((r) => r.satz.eff)}</tr>
          <tr><td>Zeit je Stück <span className="kalk-einheit">Sek.</span></td>{feld("te")}</tr>
          <tr className="kalk-blass"><td>Rüstsatz</td>{wert((r) => r.satz.ruest)}</tr>
          <tr><td>Rüstzeit Erstrüsten <span className="kalk-einheit">Std</span></td>{feld("erst")}</tr>
          <tr><td>Rüstzeit Folgerüsten <span className="kalk-einheit">Std</span></td>{feld("folge")}</tr>
          <tr><td>FGK <span className="kalk-einheit">%</span></td>{feld("fgk")}</tr>
          <tr><td>Fixkosten <span className="kalk-einheit">CHF/Stk</span></td>{wert((r, m) => r.fix / m, 4)}</tr>
          <tr><td>Varkosten <span className="kalk-einheit">CHF/Stk</span></td>{wert((r, m) => r.var / m, 4)}</tr>
          <tr className="kalk-fett kalk-hervor"><td>Vollkosten <span className="kalk-einheit">CHF/Stk</span></td>{wert((r, m) => r.kosten / m, 4)}</tr>
        </tbody>
      </table>
    </div>
  );
}

// Externer Arbeitsgang wie im Gewatec: Kostensatz je Staffel (leer = Satz
// oben), darunter Gewicht und Einzelkosten je Staffel
function ExternJeStaffel({ a, i, k, setK, rechnung }) {
  const idx = k.staffeln.map((s, j) => (z(s.menge) > 0 ? j : -1)).filter((j) => j >= 0);
  if (!idx.length) return null;
  const setzen = (j, wert) => setK((x) => ({ ...x, staffeln: x.staffeln.map((s, n) => (n !== j ? s
    : { ...s, ag: { ...(s.ag || {}), [a.key]: { ...((s.ag || {})[a.key] || {}), extern: wert } } })) }));
  const sp = idx.map((j, n) => ({ j, r: rechnung[n] && rechnung[n].ags[i], menge: rechnung[n] ? rechnung[n].menge : 0,
    eigen: ((k.staffeln[j].ag || {})[a.key]) || {} }));
  return (
    <div className="kalk-jestaffel kalk-rolle">
      <table className="kalk-tab">
        <tbody>
          <tr className="kalk-fett"><td>Stückzahl</td>{sp.map(({ j, menge }) => <td key={j} className="rechts">{chf(menge, 0)}</td>)}</tr>
          <tr><td>Fertigungslose</td>{sp.map(({ j }, n) => <td key={j} className="rechts">{rechnung[n] ? rechnung[n].lose : "–"}</td>)}</tr>
          <tr className="kalk-blass"><td>Gewicht <span className="kalk-einheit">kg</span></td>{sp.map(({ j, r }) => <td key={j} className="rechts">{r ? chf(r.gewicht, 2) : "–"}</td>)}</tr>
          <tr><td>Kostensatz <span className="kalk-einheit">CHF</span></td>{sp.map(({ j, eigen }) => (
            <td key={j} className="rechts"><input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-ag-s" + j + "-extern-" + i}
              placeholder={a.extern || ""} value={eigen.extern || ""} onChange={(e) => setzen(j, e.target.value)} /></td>))}</tr>
          <tr className="kalk-fett kalk-hervor"><td>Einzelkosten <span className="kalk-einheit">CHF/Stk</span></td>{sp.map(({ j, r }) => (
            <td key={j} className="rechts">{r ? chf(r.einzel, 4) + (r.posten ? " (Posten)" : "") : "–"}</td>))}</tr>
        </tbody>
      </table>
    </div>
  );
}

function schluessel() { return "ag" + Date.now().toString(36) + (zaehler++); }

function Preis({ k, setze, setK, rechnung }) {
  const f = (name) => ({ wert: k.preis[name], setzen: (w) => setze("preis." + name, w) });
  // Lieferlose, Angebots- und Zielpreis gehören zur Staffel, wie im Gewatec
  // je Stückzahl; die Staffeln mit Menge in derselben Reihenfolge wie rechnung
  const staffelIdx = k.staffeln.map((s, i) => (z(s.menge) > 0 ? i : -1)).filter((i) => i >= 0);
  const R = (fn, st) => rechnung.map((r) => chf(fn(r), st));
  const w = WAEHRUNGEN.includes(k.preis.waehrung) ? k.preis.waehrung : "CHF";
  const [holt, setHolt] = useState(false);
  async function kurs(waehrung) {
    setHolt(true);
    try {
      const x = await kursHolen(waehrung);
      setze("preis.kurs", String(x.kurs)); setze("preis.kursDatum", x.datum || ""); setze("preis.kursQuelle", x.quelle || "");
    } catch (e) { alt.meldung("Wechselkurs nicht erhalten. Den Faktor von Hand eintragen.", "warn"); }
    setHolt(false);
  }
  // Die erste Staffel gibt die weiteren vor: wer dort noch gleich war wie
  // die erste, bekommt den neuen Wert mit, eigene Werte bleiben
  const preisStaffel = (i, name, wert) => setK((x) => {
    const st = x.staffeln.map((s) => ({ ...s, preis: { ...(s.preis || {}) } }));
    const vorher = st[staffelIdx[i]].preis[name] || "";
    st[staffelIdx[i]].preis[name] = wert;
    if (i === 0) staffelIdx.slice(1).forEach((j) => { if ((st[j].preis[name] || "") === vorher) st[j].preis[name] = wert; });
    return { ...x, staffeln: st };
  });
  const E = (name) => {
    const [, titel, einheit] = PREIS_JE_STAFFEL.find(([n]) => n === name);
    return (
      <tr key={name} className="kalk-eingabe"><td>{titel} <span className="kalk-einheit">{name === "eil" ? (k.preis.eilArt === "prozent" ? "%" : "CHF/Stk") : einheit}</span></td>
        {rechnung.map((r, i) => {
          const eigen = (k.staffeln[staffelIdx[i]].preis || {})[name] || "";
          const erst = (k.staffeln[staffelIdx[0]].preis || {})[name] || "";
          return <td key={i} className={"rechts" + (i > 0 && eigen !== erst ? " kalk-eigen" : "")}>
            <input className="kalk-zelle" type="text" inputMode="decimal" id={"kalk-ps" + i + "-" + name}
              value={eigen} onChange={(e) => preisStaffel(i, name, e.target.value)} /></td>;
        })}</tr>);
  };
  const hochRef = useBildschirmHoch();
  const SF = (name, i, id, platz) => (
    <td key={id} className="rechts"><input className="kalk-zelle" type="text" id={id} inputMode="decimal" placeholder={platz} value={k.staffeln[staffelIdx[i]][name] || ""}
      onChange={(e) => setze("staffeln." + staffelIdx[i] + "." + name, e.target.value)} /></td>);
  return (
    <>
      {/* Alles Gemeinsame in einer Zeile, damit der Reiter ohne Rollen
          Platz hat (Wunsch Patrick 27. Oktober 2026) */}
      <div className="kalk-preis-leiste">
        <label className="kalk-mini"><span>Eilzuschlag</span>
          <select id="kalk-eilart" value={k.preis.eilArt || "pauschal"} onChange={(e) => setze("preis.eilArt", e.target.value)}>
            <option value="pauschal">Pauschal CHF/Stk</option><option value="prozent">Prozent</option>
          </select>
        </label>
        <label className="kalk-mini"><span>Runden auf</span>
          <select id="kalk-rundung" value={k.preis.rundung || "0.01"} onChange={(e) => setze("preis.rundung", e.target.value)}>
            <option value="0.01">1 Rappen</option><option value="0.05">5 Rappen</option>
            <option value="0.1">10 Rappen</option><option value="1">1 Franken</option>
          </select>
        </label>
        <label className="kalk-mini"><span>Währung</span>
          <select id="kalk-waehrung" value={w} onChange={(e) => { setze("preis.waehrung", e.target.value); if (e.target.value !== "CHF") kurs(e.target.value); }}>
            {WAEHRUNGEN.map((x) => <option key={x} value={x}>{x === "USD" ? "USD (Dollar)" : x}</option>)}
          </select>
        </label>
        {w !== "CHF" && <>
          <label className="kalk-mini"><span>1 CHF = {w}</span>
            <input type="text" inputMode="decimal" id="kalk-kurs" value={k.preis.kurs || ""} onChange={(e) => setze("preis.kurs", e.target.value)} />
          </label>
          <button className="knopf knopf--klein" id="kalk-kurs-holen" disabled={holt} onClick={() => kurs(w)}>Aktuellen Kurs holen</button>
          <span className="kalk-einheit">{holt ? "Kurs wird geholt …" : k.preis.kursDatum
            ? "Kurs vom " + datumText(k.preis.kursDatum) + (k.preis.kursQuelle ? " (" + k.preis.kursQuelle + ")" : "")
            : "Von Hand eingetragen."}</span>
        </>}
      </div>
      {!rechnung.length && <div className="karte karte--hinweis"><p>Zuerst eine Staffelmenge eintragen.</p></div>}
      {/* Eine Tabelle untereinander in der Reihenfolge der Rechnung:
          Eingaben je Staffel direkt bei dem, was sie ergeben (Wunsch
          Patrick 27. Oktober 2026: „alles untereinander, ohne Scrollen“) */}
      {rechnung.length > 0 &&
        <section className="karte kalk-rolle kalk-preis-karte" id="kalk-preis-jestaffel">
          <table ref={hochRef} className="tabelle kalk-tab kalk-protokoll kalk-eng kalk-enger" id="kalk-preistab">
            <thead><tr><th>Stückzahl <small className="kalk-einheit">die erste Staffel füllt die weiteren gleich aus</small></th>
              {rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)} Stk</th>)}</tr></thead>
            <tbody>
              <Zeile titel="Herstellkosten" einheit="CHF/Stk" werte={R((r) => r.herstell, 4)} />
              {E("sek")}{E("vwgk")}
              <Zeile titel="Selbstkosten" einheit="CHF/Stk" werte={R((r) => r.selbst, 4)} />
              {E("zinsPct")}{E("zinsMonate")}
              <Zeile titel="Selbstkosten verzinst" einheit="CHF/Stk" werte={R((r) => r.selbstVerz, 4)} fett />
              <tr><td>Anzahl Lieferlose</td>{rechnung.map((r, i) => SF("lieferlose", i, "kalk-lieferlose-" + i, "1"))}</tr>
              {E("transport")}{E("transPct")}{E("transPausch")}
              <Zeile titel="Transportkosten gesamt" einheit="CHF/Stk" werte={R((r) => r.transport, 4)} />
              {E("verpackung")}{E("verpPct")}{E("verpPausch")}
              <Zeile titel="Verpackungskosten gesamt" einheit="CHF/Stk" werte={R((r) => r.verpackung, 4)} />
              {E("gewinn")}{E("prov")}{E("skonto")}{E("rabatt")}{E("eil")}
              <Zeile titel="Grenzkosten GK" einheit="CHF/Stk" werte={R((r) => r.grenz, 4)} klein />
              <Zeile titel="Marge VK" einheit="CHF" werte={R((r) => r.margeVk, 4)} />
              <Zeile titel="Verkaufspreis VK" einheit="CHF/Stk" werte={R((r) => r.vk, 4)} fett />
              <tr><td>Angebotspreis <span className="kalk-einheit">{w}/Stk</span> <small>leer = VK gerundet</small></td>{rechnung.map((r, i) => SF("angebot", i, "kalk-angebot-" + i, chf(Math.round(r.vk * r.faktor / (z(k.preis.rundung) || 0.01)) * (z(k.preis.rundung) || 0.01))))}</tr>
              <tr><td>Zielpreis <span className="kalk-einheit">{w}/Stk</span></td>{rechnung.map((r, i) => SF("ziel", i, "kalk-ziel-" + i))}</tr>
              <tr className="kalk-fett kalk-hervor"><td>Angebotspreis gilt <span className="kalk-einheit">{w}/Stk</span></td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.angebotAus)}</td>)}</tr>
              {/* nur mit Zielpreis, spart sonst eine Zeile */}
              {rechnung.some((r) => r.ziel > 0) &&
                <Zeile titel="Abstand zum Zielpreis" einheit={w + "/Stk"} werte={rechnung.map((r) => (r.ziel > 0 ? chf(r.angebotAus - r.ziel, 4) : "–"))} klein />}
            </tbody>
          </table>
        </section>}
    </>
  );
}

// Wie der Knopf „Protokoll“ im Gewatec, mit einer Spalte je Staffel
function Ergebnis({ k, rechnung }) {
  const hochRef = useBildschirmHoch();
  if (!rechnung.length) return <div className="karte karte--hinweis"><p>Zuerst eine Staffelmenge eintragen.</p></div>;
  const R = (f, st) => rechnung.map((r) => chf(f(r), st));
  return (
    <section className="karte kalk-rolle kalk-preis-karte">
      <table ref={hochRef} className="tabelle kalk-tab kalk-protokoll kalk-eng kalk-enger" id="kalk-protokoll">
        <thead><tr><th>Menge</th>{rechnung.map((r, i) => <th key={i} className="rechts">{chf(r.menge, 0)} Stk <small>· {r.lose} {r.lose === 1 ? "Los" : "Lose"}</small></th>)}</tr></thead>
        <tbody>
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Material</td></tr>
          <Zeile titel="kg gesamt" werte={R((r) => r.mat.kg, 1)} klein />
          <Zeile titel="Materialkosten" einheit="CHF" werte={R((r) => r.mat.kosten)} />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Fertigung, ganze Menge in CHF</td></tr>
          {(k.ags || []).map((ag, i) => (
            <Zeile key={i} titel={ag.bez || (ag.art === "extern" ? "Extern" : "Arbeitsgang " + (i + 1))}
              werte={R((r) => r.ags[i].kosten)} />))}
          <Zeile titel="Laufzeit" einheit="h" werte={R((r) => r.laufH, 1)} klein />
          <Zeile titel="Rüsten ohne FGK" einheit="CHF" werte={R((r) => r.ruestStk * r.menge)} klein />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Je Stück in CHF</td></tr>
          <Zeile titel="Material" werte={R((r) => r.matStk, 4)} />
          <Zeile titel="Fertigung intern" werte={R((r) => r.internStk, 4)} />
          <Zeile titel="Fertigung extern" werte={R((r) => r.externStk, 4)} />
          <Zeile titel="Herstellkosten" werte={R((r) => r.herstell, 4)} fett />
          <Zeile titel="Selbstkosten" werte={R((r) => r.selbst, 4)} />
          {rechnung.some((r) => r.zins) && <Zeile titel="Selbstkosten verzinst" werte={R((r) => r.selbstVerz, 4)} />}
          <Zeile titel="Transport und Verpackung" werte={R((r) => r.fracht, 4)} klein />
          <Zeile titel="Verkaufspreis" werte={R((r) => r.vk, 4)} />
          <tr className="kalk-fett kalk-hervor"><td>Angebotspreis CHF</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.angebot, r.waehrung !== "CHF" ? 4 : 2)}</td>)}</tr>
          {rechnung[0].waehrung !== "CHF" && <tr className="kalk-fett"><td>Angebotspreis {rechnung[0].waehrung}</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.angebotAus)}</td>)}</tr>}
          <Zeile titel="Grenzkosten" werte={R((r) => r.grenz, 4)} klein />
          <Zeile titel="Deckungsbeitrag" werte={R((r) => r.db, 4)} />
          <Zeile titel="Deckungsbeitrag" einheit="%" werte={R((r) => r.dbPct, 1)} />
          <Zeile titel="Materialanteil" einheit="%" werte={R((r) => (r.angebot > 0 ? r.matStk / r.angebot * 100 : 0), 1)} klein />
          <tr className="kalk-abschnitt"><td colSpan={rechnung.length + 1}>Auftrag</td></tr>
          <Zeile titel="Gewinn" einheit="CHF" werte={R((r) => r.gewinnAuftrag)} />
          <tr className="kalk-fett kalk-hervor"><td>Umsatz CHF</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.umsatz)}</td>)}</tr>
          {rechnung[0].waehrung !== "CHF" && <tr className="kalk-fett"><td>Umsatz {rechnung[0].waehrung}</td>{rechnung.map((r, i) => <td key={i} className="rechts">{chf(r.umsatzAus)}</td>)}</tr>}
        </tbody>
      </table>
    </section>
  );
}

function Angebot({ k, setze, nr, rechnung }) {
  const f = (name) => ({ wert: k.angebot[name], setzen: (w) => setze("angebot." + name, w) });
  const [laeuft, setLaeuft] = useState(false);
  async function pdf() {
    setLaeuft(true);
    try { const { angebotPdf } = await import("../daten/kalkulationPdf.js"); await angebotPdf(k, nr, rechnung); }
    catch (e) { alt.meldung(alt.fehlertext(e), "fehler"); }
    setLaeuft(false);
  }
  return (
    <div className="kalk-zwei">
      <section className="karte">
        <h2>Bedingungen</h2>
        <F label="Lieferzeit" id="kalk-lieferzeit" text {...f("lieferzeit")} />
        <F label="Lieferbedingung" id="kalk-lieferbed" text liste="kalk-lieferbed-liste" hinweis="Aus der Liste wählen oder frei schreiben" {...f("lieferbed")} />
        <datalist id="kalk-lieferbed-liste">{LIEFERBEDINGUNGEN.map(([kurz, t]) => <option key={kurz} value={t}>{kurz}</option>)}</datalist>
        <F label="Versandbedingung" id="kalk-versand" text liste="kalk-versand-liste" hinweis="Aus der Liste wählen oder frei schreiben" {...f("versand")} />
        <datalist id="kalk-versand-liste">{VERSANDBEDINGUNGEN.map(([kurz, t]) => <option key={kurz} value={t}>{kurz}</option>)}</datalist>
        <F label="Zahlungsbedingung" id="kalk-zahlung" text liste="kalk-zahlung-liste" hinweis="Aus der Liste wählen oder frei schreiben" {...f("zahlung")} />
        <datalist id="kalk-zahlung-liste">{ZAHLUNGSBEDINGUNGEN.map(([kurz, t]) => <option key={kurz} value={t}>{kurz}</option>)}</datalist>
        <F label="Schlusstext" id="kalk-gueltig" mehrzeilig {...f("gueltig")} />
        <button className="knopf knopf--haupt knopf--breit" id="kalk-pdf" disabled={laeuft || !rechnung.length} onClick={pdf}>
          {laeuft ? "PDF wird erstellt …" : "Angebot als PDF"}</button>
      </section>
      <section className="karte kalk-blatt" id="kalk-vorschau" aria-label="Vorschau des Angebots">
        <div className="kalk-blatt__band"><b>HOFER + CO</b><span>Hofer+Co Präzisionsdrehteile AG · Alte Bernstrasse 24 · CH-4573 Lohn-Ammannsegg</span></div>
        <div className="kalk-blatt__oben">
          <div><h3>Angebot</h3><div>Angebots-Nr. {nr}</div><div>Datum {heuteText()}</div>
            </div>
          <div className="kalk-blatt__an">{k.kopf.kunde}{k.kopf.adresse ? "\n" + k.kopf.adresse : ""}</div>
        </div>
        {k.kopf.anfrage && <p><b>Ihre Anfrage vom {datumText(k.kopf.anfrage)}</b></p>}
        <dl className="kalk-blatt__teil">
          <dt>Bezeichnung</dt><dd>{k.kopf.bezeichnung}</dd>
          <dt>Werkstoff</dt><dd>{k.material.bez}</dd>
          {k.material.nr && <><dt>Werkst. Nr.</dt><dd>{k.material.nr}</dd></>}
          <dt>Artikel-Code</dt><dd>{k.kopf.artikel}</dd>
          <dt>Zeichnung</dt><dd>{k.kopf.zeichnung}{k.kopf.index ? " / Index: " + k.kopf.index : ""}</dd>
          {k.kopf.ident && <><dt>Kunden Ident-Nr.</dt><dd>{k.kopf.ident}</dd></>}
        </dl>
        <table className="kalk-blatt__preise">
          <thead><tr><th>Pos</th><th className="rechts">Menge</th><th>ME</th><th className="rechts">Preis (exkl. MwSt.)</th><th className="rechts">Pro</th></tr></thead>
          <tbody>{rechnung.map((r, i) => <tr key={i}><td>{i + 1}</td><td className="rechts">{chf(r.menge, 0)}</td><td>Stk</td>
            <td className="rechts">{chf(r.angebotAus)} {r.waehrung}</td><td className="rechts">1</td></tr>)}</tbody>
        </table>
        <dl className="kalk-blatt__teil">
          <dt>Lieferzeit</dt><dd>{k.angebot.lieferzeit}</dd>
          <dt>Lieferbedingung</dt><dd>{k.angebot.lieferbed}</dd>
          {k.angebot.versand && <><dt>Versandbedingung</dt><dd>{k.angebot.versand}</dd></>}
          <dt>Zahlungsbedingung</dt><dd>{k.angebot.zahlung}</dd>
        </dl>
        <p className="kalk-blatt__text">{k.angebot.gueltig}</p>
      </section>
    </div>
  );
}

export function heuteText() { return datumText(new Date().toISOString().slice(0, 10)); }
export function datumText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? m[3] + "." + m[2] + "." + m[1] : iso || "";
}

// ---------- Stundensätze der Maschinen ----------
function Stundensaetze({ maschinen, neu, zurueck }) {
  const [offen, setOffen] = useState(null);
  async function anlegen() {
    try {
      const id = await maschineSpeichern({ name: "Neue Maschine", sort: maschinen.length + 1,
        daten: { ...BEISPIEL_MASCHINEN[0].daten, anschaffung: "", ruest: "" } });
      neu(); setOffen(id);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  }
  return (
    <>
      <button className="knopf knopf--klein kalk-zurueck" id="kalk-zurueck" onClick={zurueck}>← Alle Kalkulationen</button>
      <h1 className="seitentitel">Stundensätze der Maschinen</h1>
      <p className="hinweis kalk-hinweis-oben">Wie im Gewatec unter Produktionsmittel → Stundensatz, aber jede Maschine
        nur einmal: Die Laufzeit am Tag trägst du beim Arbeitsgang ein, der Stundensatz passt sich an.</p>
      {maschinen.map((m) => (
        <MaschineKarte key={m.id} m={m} offen={offen === m.id} umschalten={() => setOffen(offen === m.id ? null : m.id)} neu={neu} />
      ))}
      <button className="knopf knopf--haupt" id="kalk-masch-neu" onClick={anlegen}>+ Maschine</button>
    </>
  );
}

function MaschineKarte({ m, offen, umschalten, neu }) {
  const [x, setX] = useState(() => ({ name: m.name, daten: { ...m.daten } }));
  const s = stundensatz(x);
  const erstes = useRef(true);
  useEffect(() => {
    if (erstes.current) { erstes.current = false; return; }
    const t = setTimeout(() => {
      maschineSpeichern({ id: m.id, name: x.name, sort: m.sort, daten: x.daten }).then(neu,
        (f) => alt.meldung(alt.fehlertext(f), "fehler"));
    }, 1000);
    return () => clearTimeout(t);
  }, [x]);
  const f = (name) => ({ wert: x.daten[name], setzen: (w) => setX((v) => ({ ...v, daten: { ...v.daten, [name]: w } })) });
  async function loeschen() {
    const weg = await alt.loeschen({ titel: "Stundensatz löschen?", text: m.name + " wird gelöscht. Kalkulationen, die ihn brauchen, rechnen dort mit 0.",
      tabelle: "kalk_maschinen", id: m.id, rueckText: "Stundensatz löschen" });
    if (weg) neu();
  }
  return (
    <section className="karte kalk-masch" data-kmasch={m.id}>
      <button className="kalk-masch__kopf" onClick={umschalten} aria-expanded={offen}>
        <b>{x.name}</b>
        <span>{chf(s.eff)} CHF/h <small>fix {chf(s.fix)} · var {chf(s.var)} · Rüsten {chf(s.ruest)}</small></span>
      </button>
      {offen && <div className="kalk-masch__inhalt">
        <div className="kalk-reihe">
          <F label="Name" id={"kalk-mn-" + m.id} text wert={x.name} setzen={(w) => setX((v) => ({ ...v, name: w }))} />
          <div className="moduswahl kalk-modus">
            {[["rechnen", "Aus Grundlagen rechnen"], ["hand", "Satz von Hand"]].map(([w, t]) => (
              <button key={w} className={"moduswahl__knopf" + (x.daten.modus === w ? " aktiv" : "")} data-kmodus={w}
                onClick={() => setX((v) => ({ ...v, daten: { ...v.daten, modus: w } }))}>{t}</button>))}
          </div>
        </div>
        {x.daten.modus === "hand"
          ? <div className="kalk-reihe">
              <F label="Stundensatz fix" einheit="CHF/h" id={"kalk-mf-" + m.id} {...f("fix")} />
              <F label="Stundensatz variabel" einheit="CHF/h" id={"kalk-mv-" + m.id} {...f("var")} />
              <F label="Rüstsatz" einheit="CHF/h" id={"kalk-mr-" + m.id} {...f("ruest")} />
            </div>
          : <>
              <h3 className="kalk-unter">Maschine</h3>
              <div className="kalk-reihe">
                <F label="Anschaffung" einheit="CHF" id={"kalk-ma-" + m.id} {...f("anschaffung")} />
                <F label="Wiederbeschaffungsfaktor" id={"kalk-mw-" + m.id} {...f("wbf")} />
                <F label="Nutzungsdauer" einheit="Jahre" id={"kalk-mnd-" + m.id} {...f("nd")} />
                <F label="Zinssatz" einheit="%" id={"kalk-mz-" + m.id} {...f("zins")} />
                <F label="Raumanteil" einheit="m²" id={"kalk-mm2-" + m.id} {...f("m2")} />
                <F label="Miete" einheit="CHF/m²/Jahr" id={"kalk-mmi-" + m.id} {...f("miete")} />
              </div>
              <h3 className="kalk-unter">Zeit und Lohn</h3>
              <div className="kalk-reihe">
                <F label="Arbeitstage" einheit="je Jahr" id={"kalk-mt-" + m.id} {...f("tage")} />
                <F label="Arbeitszeit" einheit="Std/Tag" id={"kalk-maz-" + m.id} {...f("az")} />
                <F label="Laufzeit (Vorgabe)" einheit="Std/Tag" id={"kalk-mlt-" + m.id} {...f("laufTag")}
                  hinweis="Gilt, wenn beim Arbeitsgang keine Laufzeit steht" />
                <F label="Stundenlohn Bediener" einheit="CHF/h" id={"kalk-ml-" + m.id} {...f("lohn")} />
                <F label="Lohnanteil" einheit="%" id={"kalk-mla-" + m.id} {...f("lohnAnteil")} />
              </div>
              <h3 className="kalk-unter">Variable Kosten</h3>
              <div className="kalk-reihe">
                <F label="Strombedarf" einheit="kW" id={"kalk-mkw-" + m.id} {...f("kw")} />
                <F label="Strompreis" einheit="CHF/kWh" id={"kalk-msp-" + m.id} {...f("strompreis")} />
                <F label="Hilfsstoffe" einheit="CHF je Laufstunde" id={"kalk-mh-" + m.id} {...f("hilfsH")} />
                <F label="Werkzeugkosten" einheit="CHF je Laufstunde" id={"kalk-mwz-" + m.id} {...f("werkzeugH")} />
                <F label="Instandhaltung" einheit="% je Jahr" id={"kalk-mi-" + m.id} {...f("instand")} />
              </div>
              <F label="Rüstsatz von Hand" einheit="CHF/h" id={"kalk-mr-" + m.id} {...f("ruest")}
                hinweis={"Leer = Stundensatz (" + chf(s.eff) + " CHF/h). Im Gewatec „Realer Rüstsatz“."} />
              {s.teile && <table className="tabelle kalk-tab kalk-satz" id={"kalk-ms-" + m.id}>
                <tbody>
                  <Zeile titel="Maschinenstunden im Jahr" werte={[chf(s.stunden, 0)]} klein />
                  <Zeile titel="Abschreibung" einheit="CHF/Jahr" werte={[chf(s.teile.abschreibung)]} />
                  <Zeile titel="Zins auf halbe Anschaffung" einheit="CHF/Jahr" werte={[chf(s.teile.zins)]} />
                  <Zeile titel="Raum" einheit="CHF/Jahr" werte={[chf(s.teile.raum)]} />
                  <Zeile titel="Lohn" einheit="CHF/Jahr" werte={[chf(s.teile.lohn)]} />
                  <Zeile titel="Fix je Stunde" einheit="CHF/h" werte={[chf(s.fix)]} fett />
                  <Zeile titel="Strom" einheit="CHF/h" werte={[chf(s.teile.strom, 3)]} />
                  <Zeile titel="Hilfsstoffe" einheit="CHF/h" werte={[chf(s.teile.hilfs, 3)]} />
                  <Zeile titel="Werkzeug" einheit="CHF/h" werte={[chf(s.teile.werkzeug, 3)]} />
                  <Zeile titel="Instandhaltung" einheit="CHF/h" werte={[chf(s.teile.instand, 3)]} />
                  <Zeile titel="Variabel je Stunde" einheit="CHF/h" werte={[chf(s.var)]} fett />
                  <tr className="kalk-fett kalk-hervor"><td>Stundensatz bei {chf(s.lauf, 1)} Std/Tag</td><td className="rechts">{chf(s.eff)} CHF/h</td></tr>
                </tbody>
              </table>}
              {s.teile && <div className="kalk-rolle">
                <table className="tabelle kalk-tab kalk-satz" id={"kalk-mlauf-" + m.id}>
                  <thead><tr><th>Laufzeit Std/Tag</th>{LAUFZEITEN.map((h) => <th key={h} className="rechts">{h}</th>)}</tr></thead>
                  <tbody>
                    <Zeile titel="Fix" werte={LAUFZEITEN.map((h) => chf(stundensatz(x, h).fix))} />
                    <Zeile titel="Stundensatz" fett werte={LAUFZEITEN.map((h) => chf(stundensatz(x, h).eff))} />
                  </tbody>
                </table>
              </div>}
            </>}
        <button className="linkknopf linkknopf--gefahr" data-kmasch-weg={m.id} onClick={loeschen}>Diese Maschine löschen</button>
      </div>}
    </section>
  );
}
