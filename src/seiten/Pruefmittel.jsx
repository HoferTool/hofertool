// =================================================================
//  SEITE PRÜFMITTEL (provisorisch, seit 1.558.0, Wunsch Patrick
//  15. November 2026: „Prüfmittelverwaltung … bisher über Gewatec …
//  eine bessere Übersicht, wo was ist, dass man sagen kann, dieser
//  Prüfstift oder diese Lehre ist auf der Maschine“).
//  Seit 1.797.0 eine Seite: oben die zwei Zahlen (zur Prüfung raus,
//  Rückgabekiste), Knopf „An Maschinen“ mit Hallenplan
//  (pruefmittel/Halle.jsx), darunter die Liste wie im Gewatec mit
//  Filter und Sortieren. Ein Tipp auf ein Prüfmittel öffnet sein
//  Fenster mit Austragen, Zurück, Heute geprüft, Bearbeiten, Verlauf.
//  Nur Admins, nie Externe (seiteSichtbar in app.js, Regeln in der
//  Datenbank). Daten in src/daten/pruefmittel.js.
// =================================================================
import { useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { useSeitenSuche, hinzeigen } from "../teile/seitenSuche.js";
import Halle, { LAGE } from "./pruefmittel/Halle.jsx";
import { pruefmittelLaden, verlaufLaden, ARTEN, artText, ORTE, STATUS, fehltTabelle,
  maschineText, naechstePruefung, istFaellig, ortText, suchText, zeilenLesen,
  gruppeVon, gruppeText, PRUEFUNG_WO, pruefWoText, baldFaellig, einsatzTage } from "../daten/pruefmittel.js";

const gemerkt = { suche: "", kurz: "", typ: "", zustand: "", ort: "", sort: "nr", ab: false, mehr: false };
const T = "pruefmittel";
const ZEIGEN = 300;

// Seit 1.797.0 eine einzige Seite (Wunsch Patrick 25. November 2026: „ich will
// beides kombiniert … Prüfmittel an Maschine per Knopf … unten alle wie Gewatec:
// Status (Icon), Nr, Bez., Typ, Hersteller, Nennmass, Bereich, Lagerort … alles
// andere sieht man, wenn man draufklickt … oben Filter und Sortieren“).
export default function Pruefmittel({ auffrischen, eingebettet }) {
  const [suche, setSuche] = useState(gemerkt.suche);
  const [kurz, setKurz] = useState(gemerkt.kurz);
  const [typ, setTyp] = useState(gemerkt.typ);
  const [zustand, setZustand] = useState(gemerkt.zustand);
  const [ort, setOrt] = useState(gemerkt.ort);
  const [sort, setSort] = useState(gemerkt.sort);
  const [ab, setAb] = useState(gemerkt.ab);
  const [mehr, setMehr] = useState(gemerkt.mehr);
  useGemerkt(gemerkt, { suche, kurz, typ, zustand, ort, sort, ab, mehr });
  const { daten, fehler, neu } = useDaten(pruefmittelLaden, [auffrischen]);

  useSeitenSuche({
    name: "Prüfmittel", platzhalter: "Nr., Bezeichnung, Typ, Hersteller, Mass, Maschine …",
    eintraege: () => ((daten && daten.liste) || []).map((p) => ({
      gruppe: "Prüfmittel", zeichen: "📏", titel: [p.nr, p.bezeichnung].filter(Boolean).join(" · "),
      zeile: [p.typ, p.nennmass || p.mass, ortText(p, daten.maschinen)].filter(Boolean).join(" · "),
      such: suchText(p, daten.maschinen), p })),
    springen: (x) => pmFenster(x.p, daten, neu),
  });

  if (fehler && !daten) {
    return (<>
      {!eingebettet && <h1 className="seitentitel">Prüfmittel</h1>}
      <div className="karte karte--fehler"><p>{fehltTabelle(fehler)
        ? "Die Prüfmittel brauchen noch sql/pruefmittel.sql in Supabase." : alt.fehlertext(fehler)}</p></div>
    </>);
  }
  if (!daten) return (<>{!eingebettet && <h1 className="seitentitel">Prüfmittel</h1>}<div className="laedt">Wird geladen …</div></>);

  const typen = [...new Set(daten.liste.map((p) => p.typ).filter(Boolean))].sort((x, y) => x.localeCompare(y, "de"));
  const s = suche.trim().toLowerCase();
  const passt = (p) => (!s || s.split(/\s+/).every((w) => suchText(p, daten.maschinen).includes(w)))
    && (!typ || p.typ === typ) && (!ort || p.ort_art === ort)
    && (zustand ? zustandVon(p) === zustand : p.status !== "weg");
  const wert = SPALTEN.find((x) => x[0] === sort) || SPALTEN[1];
  const liste = daten.liste.filter(passt).map((p) => [p, wert[2](p, daten)])
    .sort((x, y) => vergleich(x[1], y[1]) * (ab ? -1 : 1) || vergleich(x[0].nr, y[0].nr)).map((x) => x[0]);
  const anMaschinen = daten.liste.filter((p) => p.ort_art === "maschine" && p.status !== "weg");
  const sortieren = (k) => { if (k === sort) setAb(!ab); else { setSort(k); setAb(false); } };
  const gefiltert = !!(s || typ || ort || zustand);

  return (
    <>
      {!eingebettet && <h1 className="seitentitel">Prüfmittel</h1>}
      <Kurz d={daten} neu={neu} offen={kurz} setOffen={setKurz} />
      <div className="mat-kopf pm-leiste">
        <button className="knopf knopf--haupt" id="pm-maschinen" onClick={() => maschinenFenster(anMaschinen, daten, neu)}>
          ⚙️ An Maschinen ({anMaschinen.length})</button>
        <button className="knopf" id="pm-neu" onClick={() => bearbeiten(null, daten, neu)}>+ Prüfmittel</button>
        <button className="knopf knopf--still" id="pm-einfuegen" onClick={() => einfuegen(neu)}>Aus Gewatec / Excel einfügen</button>
      </div>
      <div className="pm-filter" id="pm-filter">
        <input className="mat-sucheingabe" id="pm-suche" type="search" value={suche}
          placeholder="Suchen: Nr., Bezeichnung, Typ, Hersteller, Mass, Maschine" onChange={(e) => setSuche(e.target.value)} />
        <select id="pm-f-typ" value={typ} onChange={(e) => setTyp(e.target.value)}>
          <option value="">Alle Typen</option>{typen.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select id="pm-f-status" value={zustand} onChange={(e) => setZustand(e.target.value)}>
          <option value="">Alle Status</option>{ZUSTAENDE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select id="pm-f-ort" value={ort} onChange={(e) => setOrt(e.target.value)}>
          <option value="">Alle Lagerorte</option>{ORTE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select id="pm-f-sort" value={sort + (ab ? "-" : "")} onChange={(e) => { const v = e.target.value; setSort(v.replace(/-$/, "")); setAb(v.endsWith("-")); }}>
          {SPALTEN.map(([k, t]) => [<option key={k} value={k}>Sortieren: {t} ↑</option>, <option key={k + "-"} value={k + "-"}>Sortieren: {t} ↓</option>])}</select>
        {gefiltert && <button className="knopf knopf--still" id="pm-f-weg" onClick={() => { setSuche(""); setTyp(""); setZustand(""); setOrt(""); }}>Filter weg</button>}
        <span className="klein pm-filter__zahl">{zahlText(liste.length)} {gefiltert ? "gefunden" : "Prüfmittel"}</span>
      </div>
      {!daten.liste.length
        ? <div className="karte karte--hinweis"><p>Noch keine Prüfmittel erfasst. Mit „+ Prüfmittel“ einzeln oder mit
            „Aus Gewatec / Excel einfügen“ viele auf einmal.</p></div>
        : !liste.length ? <div className="karte karte--hinweis"><p>Nichts gefunden.</p></div>
        : <Liste liste={mehr ? liste : liste.slice(0, ZEIGEN)} d={daten} neu={neu} sort={sort} ab={ab} sortieren={sortieren} />}
      {!mehr && liste.length > ZEIGEN && <div className="pm-mehr"><button className="knopf" id="pm-mehr" onClick={() => setMehr(true)}>
        Alle {zahlText(liste.length)} zeigen</button></div>}
    </>
  );
}

// Status wie in Gewatec als farbiger Punkt
const ZUSTAENDE = [["ok", "In Ordnung"], ["bald", "Bald fällig (30 Tage)"], ["faellig", "Prüfung fällig"],
  ["gesperrt", "Gesperrt"], ["weg", "Ausgeschieden"]];
function zustandVon(p) {
  if (p.status === "weg") return "weg";
  if (p.status === "gesperrt") return "gesperrt";
  if (istFaellig(p)) return "faellig";
  if (baldFaellig(p)) return "bald";
  return "ok";
}
const ZUSTAND_RANG = { faellig: 0, gesperrt: 1, bald: 2, ok: 3, weg: 4 };
const vergleich = (x, y) => {
  if (x == null || x === "") return y == null || y === "" ? 0 : 1;
  if (y == null || y === "") return -1;
  return typeof x === "number" && typeof y === "number" ? x - y
    : String(x).localeCompare(String(y), "de", { numeric: true, sensitivity: "base" });
};
const SPALTEN = [
  ["status", "Status", (p) => ZUSTAND_RANG[zustandVon(p)]],
  ["nr", "Nr.", (p) => p.nr],
  ["bezeichnung", "Bezeichnung", (p) => p.bezeichnung],
  ["typ", "Typ", (p) => p.typ],
  ["hersteller", "Hersteller", (p) => p.hersteller],
  ["nennmass", "Nennmass", (p) => p.nennmass || p.mass],
  ["messbereich", "Messbereich", (p) => p.messbereich],
  ["ort", "Lagerort", (p, d) => ortText(p, d.maschinen)],
];

function StatusPunkt({ p }) {
  const z = zustandVon(p);
  return <span className={"pm-punkt pm-punkt--" + z} title={(ZUSTAENDE.find((x) => x[0] === z) || [0, ""])[1]} data-pmstatus={z} />;
}

// ---------- Übersicht: nur Prüfung fällig und Rückgabekiste ----------

export const fuerPruefung = (p) => p.status === "aktiv" && p.ort_art !== "extern" && istFaellig(p);

function Kurz({ d, neu, offen, setOffen }) {
  const raus = d.liste.filter(fuerPruefung);
  const kiste = d.liste.filter((p) => p.ort_art === "rueckgabe");
  const liste = offen === "raus" ? raus : offen === "kiste" ? kiste : [];
  return (
    <div className="pm-kurz">
      <div className="pm-kurz__zahlen">
        <button className={"pm-kurz__zahl" + (raus.length ? " pm-kurz__zahl--warn" : "") + (offen === "raus" ? " aktiv" : "")}
          id="pm-kurz-raus" onClick={() => setOffen(offen === "raus" ? "" : "raus")}>
          <b>{raus.length}</b><span>Müssen zur Prüfung raus</span></button>
        <button className={"pm-kurz__zahl" + (offen === "kiste" ? " aktiv" : "")}
          id="pm-kurz-kiste" onClick={() => setOffen(offen === "kiste" ? "" : "kiste")}>
          <b>{kiste.length}</b><span>In der Rückgabekiste</span></button>
      </div>
      {offen === "kiste" && kiste.length > 0 && <div className="pm-kurz__knopf">
        <button className="knopf knopf--haupt" id="pm-quittieren" onClick={async () => {
          if (await quittieren(kiste)) neu();
        }}>✓ Alle {kiste.length} quittieren und einbuchen</button>
        <span className="klein">Sie kommen in den Prüfmittelschrank, die Einsatztage zählen nicht mehr weiter.</span>
      </div>}
      {offen && (liste.length
        ? <section className="karte" data-pmkurz={offen}>{liste.map((p) => <Zeile key={p.id} p={p} d={d} neu={neu} />)}</section>
        : <div className="karte karte--hinweis"><p>{offen === "raus" ? "Nichts fällig." : "Die Rückgabekiste ist leer."}</p></div>)}
    </div>);
}

// Rückgabekiste quittieren: alles in den Schrank, Einsatztage bis jetzt festhalten
async function quittieren(liste) {
  const vorher = [];
  for (const p of liste) vorher.push(...await alt.rueckSichern(T, { id: p.id }));
  const fehler = (await Promise.all(liste.map((p) => alt.db.from(T).update({
    ort_art: "schrank", machine_id: null, job_id: null, ort_text: null,
    einsatz_tage: Math.round(einsatzTage(p) * 1000) / 1000, zaehlt_seit: null,
  }).eq("id", p.id)))).find((r) => r.error);
  if (vorher.length) alt.merkeSchritt("Rückgabekiste quittiert", [alt.rueckRein(T, vorher)].flat());
  if (fehler) { alt.meldung(alt.fehlertext(fehler.error), "fehler"); return true; }
  alt.meldung(liste.length + " Prüfmittel eingebucht.", "gut");
  return true;
}

// ---------- An Maschinen (Fenster) ----------

function maschinenFenster(liste, d, neu) {
  fensterOeffnen((zu) => <AnMaschinen liste={liste} d={d} zu={zu} neu={neu} />, null, "pm-huelle");
}

function AnMaschinen({ liste, d, zu, neu }) {
  const [gewaehlt, setGewaehlt] = useState(null);
  const jeMaschine = new Map();
  liste.forEach((p) => {
    if (!jeMaschine.has(p.machine_id)) jeMaschine.set(p.machine_id, []);
    jeMaschine.get(p.machine_id).push(p);
  });
  const zahl = new Map([...jeMaschine].map(([id, l]) => [id, l.length]));
  const faellig = new Set(liste.filter(istFaellig).map((p) => p.machine_id));
  const reihe = (id) => { const i = d.maschinen.findIndex((m) => m.id === id); return i < 0 ? 9999 : i; };
  // Maschinen mit Prüfmitteln, die nicht im Hallenplan stehen (z.B. 303/304)
  const ausserhalb = [...jeMaschine.keys()].map((id) => d.maschinen.find((m) => m.id === id))
    .filter((m) => !m || !LAGE[String(m.machine_number || "")]);
  const jePark = new Map();
  [...jeMaschine.keys()].filter((id) => !gewaehlt || id === gewaehlt).sort((a, b) => reihe(a) - reihe(b)).forEach((id) => {
    const m = d.maschinen.find((x) => x.id === id);
    const park = m && d.parks.find((x) => x.id === m.park_id);
    const k = park ? park.name : "Ohne Park";
    if (!jePark.has(k)) jePark.set(k, []);
    jePark.get(k).push([m, jeMaschine.get(id)]);
  });
  const mGew = gewaehlt && d.maschinen.find((m) => m.id === gewaehlt);
  const oeffnen = (p) => { zu(); pmFenster(p, d, neu); };
  return (
    <div className="dialog dialog--breit pm-fenster pm-anmaschinen" role="dialog" aria-modal="true" id="pm-maschinen-fenster">
      <div className="blatt__kopf">
        <h2>⚙️ Prüfmittel an Maschinen ({liste.length})</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <p className="hinweis">Maschine antippen zeigt ihre Prüfmittel. Die Zahl sagt, wie viele dort sind, rot = Prüfung fällig.</p>
      <Halle maschinen={d.maschinen} zahl={zahl} faellig={faellig} gewaehlt={gewaehlt} waehlen={setGewaehlt} />
      {ausserhalb.length > 0 && (
        <div className="pm-ausserhalb">Nicht im Plan:{" "}
          {ausserhalb.map((m, i) => (
            <button key={m ? m.id : "x" + i} className={"knopf knopf--klein" + (m && gewaehlt === m.id ? " aktiv" : "")}
              onClick={() => m && setGewaehlt(gewaehlt === m.id ? null : m.id)}>
              {maschineText(m)} ({jeMaschine.get(m ? m.id : null)?.length || 0})
            </button>))}
        </div>)}
      {mGew && (
        <div className="pm-halle__wahl">
          <b>{maschineText(mGew)}</b>
          <button className="knopf knopf--klein" id="pm-halle-alle" onClick={() => setGewaehlt(null)}>Alle Maschinen zeigen</button>
        </div>)}
      {!liste.length ? <p className="hinweis">An keiner Maschine ist ein Prüfmittel ausgetragen.</p>
        : gewaehlt && !jeMaschine.has(gewaehlt) ? <p className="hinweis">An dieser Maschine ist kein Prüfmittel ausgetragen.</p>
        : [...jePark.entries()].map(([park, ms]) => (
          <div key={park} className="pm-park">
            <h3 className="pm-park__titel">{park}</h3>
            <div className="pm-maschinen">
              {ms.map(([m, pms]) => (
                <div key={m ? m.id : "?"} className="pm-maschine" data-pmmaschine={m ? m.id : ""}>
                  <div className="pm-maschine__kopf">{maschineText(m)}</div>
                  {pms.map((p) => <Zeile key={p.id} p={p} d={d} neu={neu} ohneOrt klick={oeffnen} />)}
                </div>))}
            </div>
          </div>))}
    </div>);
}

function Zeile({ p, d, neu, ohneOrt, klick }) {
  const faellig = istFaellig(p);
  return (
    <button className={"pm-zeile" + (p.status !== "aktiv" ? " pm-zeile--aus" : "")} data-pm={p.id}
      onClick={() => klick ? klick(p) : pmFenster(p, d, neu)}>
      <span className="pm-zeile__nr">{p.nr || "–"}</span>
      <span className="pm-zeile__was">
        <b>{p.bezeichnung}</b>{(p.nennmass || p.mass) ? " " + (p.nennmass || p.mass) : ""}
        <span className="klein">
          {[p.ort_text && (ohneOrt ? p.ort_art === "maschine" : p.ort_art !== "person") ? p.ort_text : null,
            p.hoco ? "für " + p.hoco : null,
            p.ort_art !== "schrank" && p.seit ? "seit " + alt.kurzDatum(p.seit) : null,
            einsatzTage(p) >= 0.05 ? tageText(p) : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      {faellig && <span className="pm-schild pm-schild--warn">{p.pruefung_wo === "extern" ? "Kalibrierung fällig" : "Prüfung fällig"}</span>}
      {!faellig && baldFaellig(p) && <span className="pm-schild">fällig {alt.kurzDatum(naechstePruefung(p))}</span>}
      {p.status === "gesperrt" && <span className="pm-schild pm-schild--rot">Gesperrt</span>}
      {p.status === "weg" && <span className="pm-schild">Ausgeschieden</span>}
    </button>);
}

const tageText = (p) => {
  const t = einsatzTage(p);
  return (t < 10 ? t.toFixed(1) : Math.round(t)) + (p.intervall_tage ? " / " + p.intervall_tage : "")
    + " Einsatztage" + (p.zaehlt_seit ? " (läuft)" : "");
};

// ---------- Liste wie Gewatec ----------

function Liste({ liste, d, neu, sort, ab, sortieren }) {
  return (
    <div className="karte pm-tabelle-karte">
      <table className="pm-tabelle pm-tabelle--gw" id="pm-tabelle">
        <thead><tr>{SPALTEN.map(([k, t]) => (
          <th key={k} data-pmsort={k} className={sort === k ? "aktiv" : ""} onClick={() => sortieren(k)}
            aria-sort={sort === k ? (ab ? "descending" : "ascending") : "none"}>
            {k === "status" ? "" : t}{sort === k ? (ab ? " ↓" : " ↑") : ""}</th>))}</tr></thead>
        <tbody>
          {liste.map((p) => (
            <tr key={p.id} data-pm={p.id} onClick={() => pmFenster(p, d, neu)}>
              <td className="pm-td-status"><StatusPunkt p={p} /></td>
              <td className="pm-td-nr">{p.nr || "–"}</td>
              <td className="pm-td-bez"><b>{p.bezeichnung}</b></td>
              <td>{p.typ || ""}</td>
              <td>{p.hersteller || ""}</td>
              <td>{p.nennmass || p.mass || ""}</td>
              <td>{p.messbereich || ""}</td>
              <td>{ortText(p, d.maschinen)}</td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}

// ---------- Fenster eines Prüfmittels ----------

function pmFenster(p, d, neu) {
  fensterOeffnen((zu) => <PmFenster p={p} d={d} zu={zu} neu={neu} />, null, "pm-huelle");
}

function PmFenster({ p, d, zu, neu }) {
  const { daten: verlauf } = useDaten(() => verlaufLaden(p.id), []);
  const n = naechstePruefung(p);
  const fertig = () => { zu(); neu(); };
  return (
    <div className="dialog dialog--breit pm-fenster" role="dialog" aria-modal="true" id="pm-fenster">
      <div className="blatt__kopf">
        <h2>{[p.nr, p.bezeichnung].filter(Boolean).join(" · ")}</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="pm-wo-jetzt" id="pm-wo-jetzt">
        <span className="klein">Ist jetzt</span>
        <b>{ortText(p, d.maschinen)}</b>
        {p.ort_art !== "schrank" && p.seit ? <span className="klein">seit {alt.datumZeitKurz(p.seit)}</span> : null}
      </div>
      <div className="pm-knoepfe">
        <button className="knopf knopf--haupt" id="pm-austragen" data-fokus=""
          onClick={() => { zu(); austragen(p, d, neu); }}>Austragen / Ort ändern</button>
        {p.ort_art !== "schrank" && <button className="knopf" id="pm-zurueck"
          onClick={async () => { if (await ortSetzen(p, { ort_art: "schrank", machine_id: null, ort_text: null }, "Zurück in den Schrank")) fertig(); }}>
          Zurück in den Schrank</button>}
        <button className="knopf" id="pm-geprueft" onClick={async () => {
          if (await aendern(p, { letzte_pruefung: alt.isoDatum(new Date()), einsatz_tage: 0,
            zaehlt_seit: p.zaehlt_seit ? new Date().toISOString() : null }, "Prüfung " + p.bezeichnung)) fertig();
        }}>{p.pruefung_wo === "extern" ? "Heute kalibriert zurück" : "Heute geprüft"}</button>
        <button className="knopf" id="pm-bearbeiten" onClick={() => { zu(); bearbeiten(p, d, neu); }}>Bearbeiten</button>
        <button className="knopf knopf--gefahr" id="pm-loeschen" onClick={async () => { if (await loeschen(p)) fertig(); }}>Löschen</button>
      </div>
      <dl className="pm-angaben">
        <dt>Status</dt><dd><StatusPunkt p={p} /> {(ZUSTAENDE.find((x) => x[0] === zustandVon(p)) || [0, ""])[1]}</dd>
        <dt>Typ</dt><dd>{p.typ || "–"}</dd>
        <dt>Hersteller</dt><dd>{p.hersteller || "–"}</dd>
        <dt>Nennmass</dt><dd>{p.nennmass || "–"}</dd>
        <dt>Messbereich</dt><dd>{p.messbereich || "–"}</dd>
        <dt>Art</dt><dd>{[artText(p.art), gruppeText(gruppeVon(p))].filter(Boolean).join(" · ") || "–"}</dd>
        {p.mass && p.mass !== p.nennmass ? <><dt>Mass</dt><dd>{p.mass}</dd></> : null}
        <dt>Für HOCO Nr.</dt><dd>{p.hoco || "–"}</dd>
        <dt>Prüfintervall</dt><dd>{p.intervall_monate ? p.intervall_monate + " Monate" + (p.pruefung_wo ? " · " + pruefWoText(p.pruefung_wo) : "") : "–"}</dd>
        <dt>Einsatztage</dt><dd>{tageText(p)}</dd>
        <dt>Zuletzt geprüft</dt><dd>{p.letzte_pruefung ? alt.langDatum(p.letzte_pruefung) : "–"}</dd>
        <dt>Nächste Prüfung</dt><dd className={istFaellig(p) ? "pm-rot" : ""}>{n ? alt.langDatum(n) : "–"}</dd>
        {p.notiz ? <><dt>Notiz</dt><dd>{p.notiz}</dd></> : null}
      </dl>
      <h3>Verlauf</h3>
      {!verlauf ? <div className="laedt">Wird geladen …</div>
        : !verlauf.length ? <p className="hinweis">Noch nichts.</p>
        : <ul className="pm-verlauf" id="pm-verlauf">
            {verlauf.map((v) => (
              <li key={v.id}><span className="klein">{alt.datumZeitKurz(v.am)}</span>
                <b>{{ erfasst: "Erfasst", "zurück": "Zurück", ausgetragen: "Ausgetragen", "geprüft": "Geprüft", status: "Status" }[v.was] || v.was}</b>
                <span>{v.was === "status" ? (STATUS.find((x) => x[0] === v.nach) || [0, v.nach])[1] : v.nach}</span>
                <span className="klein">{d.personen.get(v.von) || alt.SYSTEM_NAME}</span></li>))}
          </ul>}
    </div>);
}

// ---------- Austragen: wohin? ----------

function austragen(p, d, neu) {
  fensterOeffnen((zu) => <Austragen p={p} d={d} zu={zu} neu={neu} />, null, "pm-huelle");
}

function Austragen({ p, d, zu, neu }) {
  const [art, setArt] = useState(p.ort_art === "schrank" ? "maschine" : p.ort_art);
  const [maschine, setMaschine] = useState(p.ort_art === "maschine" ? p.machine_id : null);
  const [text, setText] = useState(p.ort_text || "");
  const jePark = d.parks.map((park) => [park, d.maschinen.filter((m) => m.park_id === park.id)]).filter(([, ms]) => ms.length);
  const speichern = async () => {
    if (art === "maschine" && !maschine) { alt.meldung("Bitte eine Maschine wählen.", "warn"); return; }
    if (art === "person" && !text.trim()) { alt.meldung("Bitte die Person eintragen.", "warn"); return; }
    const ok = await ortSetzen(p, { ort_art: art, machine_id: art === "maschine" ? maschine : null,
      ort_text: text.trim() || null }, "Austragen " + p.bezeichnung);
    if (ok) { zu(); neu(); }
  };
  return (
    <div className="dialog dialog--breit pm-fenster" role="dialog" aria-modal="true" id="pm-austragen-fenster">
      <div className="blatt__kopf">
        <h2>Wohin kommt {p.nr ? p.nr + " " : ""}{p.bezeichnung}?</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Abbrechen</button>
      </div>
      <div className="pm-ortwahl">
        {ORTE.map(([o, t, z]) => (
          <button key={o} className={"pm-ortknopf" + (art === o ? " aktiv" : "")} data-pmortwahl={o}
            onClick={() => { setArt(o); if (o !== p.ort_art) setText(""); }}>{z}<span>{t}</span></button>))}
      </div>
      {art === "maschine" && <div className="pm-maschinenwahl">
        {jePark.map(([park, ms]) => (
          <div key={park.id}>
            <h3 className="pm-park__titel">{park.name}</h3>
            <div className="typwahl">
              {ms.map((m) => (
                <button key={m.id} className={"typwahl__knopf" + (maschine === m.id ? " aktiv" : "")}
                  data-pmwahlmaschine={m.id} onClick={() => setMaschine(m.id)}>{maschineText(m)}</button>))}
            </div>
          </div>))}
      </div>}
      <label className="feld pm-ortfeld">
        <span>{art === "person" ? "Person" : art === "extern" ? "Firma / Grund (freiwillig)" : art === "schrank" ? "Fach (freiwillig)" : "Notiz (freiwillig)"}</span>
        <input id="pm-orttext" type="text" value={text} list={art === "person" ? "pm-namen" : undefined}
          placeholder={art === "person" ? "Name" : art === "extern" ? "z.B. Kalibrierung bei …" : ""}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") speichern(); }} />
        <datalist id="pm-namen">{d.namen.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <div className="dialog__knoepfe">
        <button className="knopf knopf--haupt" id="pm-austragen-ok" onClick={speichern}>Speichern</button>
      </div>
    </div>);
}

// ---------- Speichern ----------

async function aendern(p, daten, schritt) {
  const vorher = await alt.rueckSichern(T, { id: p.id });
  const { error } = await alt.db.from(T).update(daten).eq("id", p.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt(schritt, alt.rueckRein(T, vorher));
  alt.meldung("Gespeichert.", "gut");
  return true;
}
const ortSetzen = (p, ort, schritt) => aendern(p, ort, schritt);

async function loeschen(p) {
  const ok = await alt.nachfragen({ titel: "Prüfmittel löschen",
    text: "„" + p.bezeichnung + "“ samt Verlauf löschen? Ausgeschiedene besser unter Bearbeiten → Status „Ausgeschieden“.",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return false;
  const vorher = await alt.rueckSichern(T, { id: p.id });
  const { error } = await alt.db.from(T).delete().eq("id", p.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  alt.merkeSchritt("Löschen von " + p.bezeichnung, alt.rueckRein(T, vorher));
  alt.meldung("Gelöscht.", "gut");
  return true;
}

async function bearbeiten(p, d, neu) {
  const w = await alt.dialogFelder({
    titel: p ? "Prüfmittel ändern" : "Neues Prüfmittel",
    felder: [
      { name: "nr", label: "Nr. (wie in Gewatec)", wert: p ? p.nr || "" : "", platzhalter: "PM-0123" },
      { name: "bezeichnung", label: "Bezeichnung", pflicht: true, wert: p ? p.bezeichnung : "", platzhalter: "Grenzlehrdorn, Prüfstift …" },
      { name: "typ", label: "Typ", wert: p ? p.typ || "" : "", platzhalter: "Lehrdorn, Messschieber …" },
      { name: "hersteller", label: "Hersteller", wert: p ? p.hersteller || "" : "" },
      { name: "nennmass", label: "Nennmass", wert: p ? p.nennmass || "" : "", platzhalter: "4.000 H7" },
      { name: "messbereich", label: "Messbereich", wert: p ? p.messbereich || "" : "", platzhalter: "0–150 mm" },
      { name: "art", label: "Art", auswahl: [["", "–"], ...ARTEN], wert: p ? p.art || "" : "" },
      { name: "mass", label: "Mass", wert: p ? p.mass || "" : "", platzhalter: "Ø 4.000 H7, M6 6H …" },
      { name: "hoco", label: "Für HOCO Nr. (freiwillig)", wert: p ? p.hoco || "" : "", platzhalter: "10841-0009" },
      { name: "intervall", label: "Prüfintervall in Monaten (leer = keins)", typ: "number", wert: p && p.intervall_monate ? p.intervall_monate : "" },
      { name: "tage", label: "Prüfen nach Einsatztagen (leer = nur Monate)", typ: "number", wert: p && p.intervall_tage ? p.intervall_tage : "" },
      { name: "wo", label: "Wer prüft", auswahl: [["", "–"], ...PRUEFUNG_WO], wert: p ? p.pruefung_wo || "" : "" },
      { name: "letzte", label: "Zuletzt geprüft", typ: "date", wert: p ? p.letzte_pruefung || "" : "" },
      { name: "status", label: "Status", auswahl: STATUS, wert: p ? p.status : "aktiv" },
      { name: "notiz", label: "Notiz", typ: "textarea", wert: p ? p.notiz || "" : "" },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const daten = {
    nr: (w.nr || "").trim() || null, bezeichnung: w.bezeichnung.trim(), art: w.art || null,
    typ: (w.typ || "").trim() || null, hersteller: (w.hersteller || "").trim() || null,
    nennmass: (w.nennmass || "").trim() || null, messbereich: (w.messbereich || "").trim() || null,
    mass: (w.mass || "").trim() || null, hoco: (w.hoco || "").trim() || null,
    intervall_monate: Number(w.intervall) > 0 ? Math.round(Number(w.intervall)) : null,
    intervall_tage: Number(w.tage) > 0 ? Math.round(Number(w.tage)) : null,
    pruefung_wo: w.wo || null,
    letzte_pruefung: /^\d{4}-\d{2}-\d{2}$/.test(w.letzte || "") ? w.letzte : null,
    status: w.status || "aktiv", notiz: (w.notiz || "").trim() || null,
  };
  if (p) {
    if (await aendern(p, daten, "Ändern von " + daten.bezeichnung)) neu();
    return;
  }
  const { data, error } = await alt.db.from(T).insert({ ...daten, ort_art: "schrank" }).select("id");
  if (error) { alt.meldung(fehltTabelle(error) ? "Die Prüfmittel brauchen noch sql/pruefmittel.sql in Supabase." : alt.fehlertext(error), "fehler"); return; }
  const id = Array.isArray(data) && data[0] && data[0].id;
  if (id) alt.merkeSchritt("Prüfmittel " + daten.bezeichnung, alt.rueckWeg(T, { id }));
  alt.meldung("Erfasst. Es steht im Prüfmittelschrank.", "gut");
  neu();
  if (id) setTimeout(() => hinzeigen('[data-pm="' + id + '"]'), 300);
}

async function einfuegen(neu) {
  const w = await alt.dialogFelder({
    titel: "Prüfmittel einfügen",
    text: "Aus Gewatec oder Excel kopieren und hier einfügen. Eine Zeile je Prüfmittel, Spalten mit Tab oder Semikolon:"
      + " Nr; Bezeichnung; Mass; Art; Intervall in Monaten; intern oder extern. Nur die Bezeichnung ist Pflicht. Alle kommen in den Prüfmittelschrank.",
    felder: [{ name: "text", label: "Zeilen", typ: "textarea", wert: "", platzhalter: "PM-001\tGrenzlehrdorn\tØ 4.000 H7\tGrenzlehrdorn\t12" }],
    bestaetigen: "Einfügen",
  });
  if (!w) return;
  const zeilen = zeilenLesen(w.text);
  if (!zeilen.length) { alt.meldung("Keine Zeilen erkannt.", "warn"); return; }
  const { data, error } = await alt.db.from(T).insert(zeilen).select("id");
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const ids = (data || []).map((x) => x.id);
  if (ids.length) alt.merkeSchritt(ids.length + " Prüfmittel eingefügt", ids.map((id) => alt.rueckWeg(T, { id })).flat());
  alt.meldung(zahlText(ids.length) + " Prüfmittel eingefügt.", "gut");
  neu();
}
const zahlText = (n) => alt.zahlText ? alt.zahlText(n) : String(n);
