// =================================================================
//  NEUES DASHBOARD (Vorschau #/startneu)
//  1.670.0 Module, 1.671.0 Aufgaben ohne Menü, seit 1.672.0 ein
//  Dashboard mit Fenstern (Wunsch Patrick 22. November 2026: „ganz
//  neues Start, so mässig ein Dashboard, nicht mit Reitern und Menü,
//  sondern mit Fenstern: auf dem Dashboard sieht man Infos, wenn man
//  mehr sehen oder etwas machen will, drückt man drauf, das Fenster
//  öffnet sich“, „ein neuer Look, weil es immer so gleich aussieht“).
//  Jede Kachel zeigt das Wichtigste ihres Bereichs; ein Tipp öffnet
//  den ganzen Bereich als grosses Fenster über dem Dashboard. Das Menü
//  links ist auf dieser Seite weg (Klasse db2-modus am body).
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt, useDaten, reactAufraeumen } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { problemeLaden } from "./start/Karten.jsx";
import { heuteOffenLaden } from "./start/HeuteOffen.jsx";
import Notizen from "./start/Notizen.jsx";
import { Solaranlage } from "./Start.jsx";
import Systemzustand from "./start/Systemzustand.jsx";
import { kalenderLaden, kommendeTermine, wannText } from "../daten/kalender.js";
import { kalenderOeffnen, kalenderDarf } from "./Kalender.jsx";
import { einkaufOeffnen } from "./Einkauf.jsx";
import { planwandFensterOeffnen } from "../pad/PlanwandFenster.jsx";

const zahl = (n) => alt.zahlText(n || 0);
const intern = () => !alt.istExtern() && alt.meineRolle() !== "dienst";
async function anzahl(anfrage, name) {
  const r = await alt.zeitlimit(anfrage, 9000, name);
  if (r.error) throw r.error;
  return r.data || [];
}

// ---------- Ganze Seite als Fenster ----------

// Zeigt eine Seite aus SEITEN in einem grossen Fenster. Die Seite läuft
// genau wie im Menü, nur in einem eigenen Behälter.
function SeitenInhalt({ pfad, titel, farbe, zeichen, zu }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const b = ref.current;
    const s = alt.SEITEN.find((x) => x.pfad === pfad);
    if (b && s) s.zeige(b);
    return () => { try { reactAufraeumen(b); } catch { /* schon weg */ } };
  }, [pfad]);
  return (
    <FensterRahmen titel={titel} farbe={farbe} zeichen={zeichen} zu={zu}>
      <div className="db2-fenster__seite" ref={ref} />
    </FensterRahmen>
  );
}

function FensterRahmen({ titel, farbe, zeichen, zu, children }) {
  return (
    <div className="dialog db2-fenster" style={{ "--db2-farbe": farbe }} role="dialog" aria-label={titel}>
      <div className="db2-fenster__kopf">
        <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM[zeichen] || "" }} />
        <h2>{titel}</h2>
        <button type="button" className="db2-fenster__zu" aria-label="Schliessen" data-nein="" onClick={zu}>✕</button>
      </div>
      <div className="db2-fenster__inhalt">{children}</div>
    </div>
  );
}

function seiteFenster(k, fertig) {
  fensterOeffnen((zu) => <SeitenInhalt pfad={k.pfad} titel={k.titel} farbe={k.farbe} zeichen={k.zeichen} zu={zu} />,
    fertig, "db2-huelle");
}
function inhaltFenster(k, inhalt, fertig) {
  fensterOeffnen((zu) => <FensterRahmen titel={k.titel} farbe={k.farbe} zeichen={k.zeichen} zu={zu}>
    {inhalt(zu)}</FensterRahmen>, fertig, "db2-huelle");
}

// ---------- Probleme im Fenster ----------

function ProblemListe({ zu }) {
  const { daten, neu } = useDaten(problemeLaden, []);
  if (!daten) return <p className="hinweis">Wird geladen …</p>;
  if (!daten.length) return <p className="db2-leer">✓ Keine Probleme gemeldet.</p>;
  const darf = alt.darfProblemErledigen();
  return (
    <div className="db2-liste">
      {daten.map((j) => (
        <div className="db2-zeile db2-zeile--warn" key={j.id}>
          <button type="button" className="db2-zeile__haupt" data-db2-problem={j.id}
            onClick={() => { zu(); planwandFensterOeffnen(j); }}>
            <b>{j.job_number}{j.maschine ? " · " + j.maschine : ""}</b>
            <span>{j.problem}</span>
            <span className="klein">{j.problem_von || ""}{j.problem_at ? " · " + alt.datumZeitKurz(j.problem_at) : ""}</span>
          </button>
          {darf && <button type="button" className="knopf knopf--klein"
            onClick={() => alt.problemQuittieren(j, null, neu)}>✓ Erledigt</button>}
        </div>))}
    </div>
  );
}

// ---------- Die Kacheln ----------
// laden: Zahlen für die Kachel. zeige: was auf der Kachel steht.
// tun: was ein Tipp öffnet (Standard: die Seite pfad als Fenster).

const KACHELN = [
  { id: "planwand", titel: "Planwand", zeichen: "planwand", farbe: "#2563eb", pfad: "planwand",
    laden: async () => {
      await alt.ladeParks(false);
      const [m, l] = await Promise.all([alt.ladeMaschinen(false), alt.ladeLaufendeAuftraege()]);
      const js = Object.values(l || {});
      return { laeuft: js.filter((j) => j.plan_status === "laeuft").length,
        ruesten: js.filter((j) => j.plan_status === "ruesten").length, maschinen: m.length };
    },
    zeige: (d) => <>
      <div className="db2-gross">{zahl(d.laeuft)}<small> laufen</small></div>
      <p>{zahl(d.ruesten)} am Rüsten · {zahl(d.maschinen)} Maschinen</p>
    </> },
  { id: "probleme", titel: "Probleme", zeichen: "qs", farbe: "#dc2626", sichtbar: intern,
    laden: problemeLaden,
    warn: (d) => d.length > 0,
    zeige: (d) => d.length
      ? <><div className="db2-gross">{zahl(d.length)}<small> offen</small></div>
          {d.slice(0, 2).map((j) => <p key={j.id} className="db2-eine"><b>{j.job_number}</b> {j.problem}</p>)}</>
      : <><div className="db2-gross db2-gut">✓</div><p>Keine Probleme gemeldet</p></>,
    tun: (k, fertig) => inhaltFenster(k, (zu) => <ProblemListe zu={zu} />, fertig) },
  { id: "produktion", titel: "Produktion", zeichen: "produktion", farbe: "#16a34a", pfad: "produktion",
    laden: heuteOffenLaden,
    warn: (d) => d.stk.length > 0,
    zeige: (d) => d.stk.length
      ? <><div className="db2-gross">{zahl(d.stk.length)}<small> ohne Stückzahl</small></div>
          <p className="db2-eine">{d.stk.map((z) => z.m.machine_number || z.m.name).join(", ")}</p></>
      : <><div className="db2-gross db2-gut">✓</div><p>Alle Stückzahlen von heute da</p></> },
  { id: "bestellungen", titel: "Bestellungen", zeichen: "bestellungen", farbe: "#ea580c", pfad: "bestellungen",
    laden: async () => {
      const d = await anzahl(alt.db.from("order_items").select("status")
        .in("status", ["offen", "bestellt", "teilweise_geliefert"]), "Bestellungen");
      return { offen: d.filter((z) => z.status === "offen").length,
        bestellt: d.filter((z) => z.status !== "offen").length };
    },
    zeige: (d) => <>
      <div className="db2-gross">{zahl(d.offen)}<small> zu bestellen</small></div>
      <p>{zahl(d.bestellt)} bestellt, noch nicht da</p>
    </> },
  { id: "material", titel: "Material", zeichen: "material", farbe: "#64748b", pfad: "material",
    laden: async () => (await anzahl(alt.db.from("material_posten").select("id").is("weg_am", null), "Material")).length,
    zeige: (n) => <><div className="db2-gross">{zahl(n)}<small> Restposten</small></div><p>im Lager</p></> },
  { id: "qs", titel: "Qualität", zeichen: "pruefmittel", farbe: "#ca8a04", pfad: "qs",
    laden: async () => (await anzahl(alt.db.from("qs_meldungen").select("id"), "QS")).length,
    warn: (n) => n > 0,
    zeige: (n) => n
      ? <><div className="db2-gross">{zahl(n)}<small> Ausschuss</small></div><p>Meldungen offen</p></>
      : <><div className="db2-gross db2-gut">✓</div><p>Keine Ausschussmeldung offen</p></> },
  { id: "kalender", titel: "Kalender", zeichen: "kalender", farbe: "#7c3aed", sichtbar: () => kalenderDarf(),
    laden: async () => kommendeTermine(await kalenderLaden(), 14, undefined, 3),
    zeige: (t) => t.length
      ? t.map((x) => <p key={x.eintrag.id} className="db2-eine"><b>{wannText(x)}</b> {x.eintrag.titel}</p>)
      : <p>Keine Termine in den nächsten zwei Wochen</p>,
    tun: (k, fertig) => kalenderOeffnen(fertig) },
  { id: "notizen", titel: "Notizen", zeichen: "dokumente", farbe: "#0891b2",
    laden: () => alt.ladeTodos(),
    zeige: (d) => d.length
      ? <><div className="db2-gross">{zahl(d.length)}<small> Notizen</small></div>
          {d.slice(0, 2).map((n) => <p key={n.id} className="db2-eine">{n.text}</p>)}</>
      : <p>Keine Notizen</p>,
    tun: (k, fertig) => inhaltFenster(k, () => <Notizen auffrischen={0} />, fertig) },
  { id: "einkauf", titel: "Einkaufsliste", zeichen: "einkauf", farbe: "#db2777", sichtbar: intern,
    laden: async () => (await anzahl(alt.db.from("shopping_items").select("id").eq("is_done", false), "Einkauf")).length,
    zeige: (n) => <><div className="db2-gross">{zahl(n)}<small> Sachen</small></div><p>zum Einkaufen</p></>,
    tun: (k, fertig) => einkaufOeffnen(fertig) },
  { id: "maschinen", titel: "Maschinen", zeichen: "maschinen", farbe: "#0f766e", pfad: "maschinen",
    laden: async () => (await alt.ladeMaschinen(false)).length,
    zeige: (n) => <><div className="db2-gross">{zahl(n)}<small> Maschinen</small></div><p>Infos, Wartung, Unterlagen</p></> },
];

// Weitere Bereiche ohne Zahlen, klein unten
const WEITERE = [
  ["nc", "NC-PRO", "nc", "#4f46e5"], ["lager", "Lager", "lager", "#78716c"],
  ["kalkulation", "Kalkulation", "kalkulation", "#0e7490"], ["qmalt", "QMS", "qs", "#a16207"],
  ["hofer2dto3d", "2D → 3D", "hofer2dto3d", "#6d28d9"], ["einlagen", "Einlagen", "einlagen", "#15803d"],
  ["bildschirme", "Anzeigen", "bildschirme", "#be185d"], ["reihen", "Zahlensprint", "reihen", "#65a30d"],
].map(([pfad, titel, zeichen, farbe]) => ({ id: pfad, pfad, titel, zeichen, farbe }));

function hofertimeOeffnen() {
  const basis = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
  if (!window.open(basis + "hofertime/", "hofertime")) location.href = basis + "hofertime/";
}

function darf(k) {
  if (k.sichtbar && !k.sichtbar()) return false;
  return !k.pfad || alt.seiteSichtbar(k.pfad);
}

function Kachel({ k, takt, neu }) {
  const { daten, fehler } = useDaten(() => k.laden(), [takt]);
  const warn = daten != null && k.warn && k.warn(daten);
  const oeffnen = () => (k.tun ? k.tun(k, neu) : seiteFenster(k, neu));
  return (
    <button type="button" className={"db2-kachel" + (warn ? " db2-kachel--warn" : "")} data-db2={k.id}
      style={{ "--db2-farbe": k.farbe }} onClick={oeffnen}>
      <span className="db2-kachel__kopf">
        <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM[k.zeichen] || "" }} />
        <span className="db2-kachel__titel">{k.titel}</span>
        <span className="db2-kachel__pfeil" aria-hidden="true">↗</span>
      </span>
      <span className="db2-kachel__inhalt">
        {daten != null ? k.zeige(daten) : fehler ? <p className="klein">Gerade nicht verfügbar</p>
          : <span className="db2-laedt" />}
      </span>
    </button>
  );
}

function Kopf() {
  const [jetzt, setJetzt] = useState(() => new Date());
  const [wetter, setWetter] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 20000);
    alt.holeWetter().then(setWetter, () => setWetter(false));
    return () => clearInterval(t);
  }, []);
  const p = alt.profil;
  const name = (p && (p.full_name || p.email.split("@")[0]).split(" ")[0]) || "";
  const z = (n) => String(n).padStart(2, "0");
  return (
    <header className="db2-kopf">
      <div>
        <div className="db2-kopf__datum">{jetzt.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="db2-kopf__gruss">{alt.begruessung()}{name ? ", " + name : ""}</h1>
      </div>
      <div className="db2-kopf__rechts">
        {wetter && <div className="db2-kopf__wetter"><b>{wetter.temperatur}°</b><span>{wetter.text}</span></div>}
        <div className="db2-kopf__uhr">{z(jetzt.getHours())}:{z(jetzt.getMinutes())}</div>
      </div>
    </header>
  );
}

export default function StartModule({ auffrischen }) {
  const [eigen, setEigen] = useState(0);
  const takt = (auffrischen || 0) * 1000 + eigen;
  const neu = () => setEigen((n) => n + 1);
  useEffect(() => {
    document.body.classList.add("db2-modus");
    return () => document.body.classList.remove("db2-modus");
  }, []);
  const kacheln = KACHELN.filter(darf);
  const weitere = WEITERE.filter(darf);
  const zeit = intern() && !(alt.profil && alt.profil.andere_nutzer);
  return (
    <div className="db2" id="db2">
      <div className="db2-vorschau" id="sm-vorschau">
        <span><b>Testseite</b> · neues Dashboard mit Fenstern.</span>
        <a href="#/dashboard">Zur jetzigen Startseite</a>
      </div>
      <Kopf />
      {alt.istAdmin() && <Systemzustand auffrischen={auffrischen} />}
      <div className="db2-raster" id="db2-raster">
        {kacheln.map((k) => <Kachel key={k.id} k={k} takt={takt} neu={neu} />)}
      </div>
      <h2 className="db2-titel">Weitere Bereiche</h2>
      <div className="db2-weitere">
        {weitere.map((k) => (
          <button key={k.id} type="button" className="db2-klein" data-db2={k.id} style={{ "--db2-farbe": k.farbe }}
            onClick={() => seiteFenster(k, neu)}>
            <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM[k.zeichen] || "" }} />
            <span>{k.titel}</span>
          </button>))}
        {zeit && <button type="button" className="db2-klein" data-db2="zeit" style={{ "--db2-farbe": "#0a7ea4" }}
          onClick={hofertimeOeffnen}>
          <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM.zeit || "" }} />
          <span>HOFERTIME</span>
        </button>}
      </div>
      <div className="db2-solar"><Solaranlage /></div>
    </div>
  );
}
