// =================================================================
//  PAD MODE: WARTUNG
//  Statt der Kachel „Internet“ steht im Pad an jeder Maschine die
//  Kachel „Wartung“ (Wunsch Patrick 2. November 2026: „man soll im
//  Button Bilder oder PDFs reintun, dann auswählen und terminieren
//  können, dass es dann statt EB als Bildschirmschoner anzeigt; man
//  soll es quittieren können, indem man auf den Button unten Mitte
//  drückt: Erledigt“).
//
//  Seit 1.338.0 je Maschinentyp statt je Maschine, mit Wiederholung
//  (Wunsch Patrick 2. November 2026: „nicht spezifisch Nr. sondern Typ,
//  Wiederholungen täglich/Woche/Monat/jährlich, Batterie-Backup soll
//  auch dort angezeigt werden und Schoner dazu geben“):
//   - wartung_plan: Bild oder PDF je Typ, erster Termin, Wiederholung
//   - wartung_erledigt: wer an welcher Maschine wann quittiert hat
//  Fällig an einer Maschine ist ein Plan, wenn sein letzter Termin
//  (aus erstem Termin und Wiederholung gerechnet) da ist und an dieser
//  Maschine seither niemand „Erledigt“ getippt hat. So quittiert jede
//  Maschine des Typs für sich.
//  Dazu die Backup-Batterien der Maschine (maschinen_info, Seite der
//  Maschine): am Termin sind sie hier fällig wie eine Wartung, der
//  Schoner zeigt sie, „Erledigt“ heisst „Batterien gewechselt“.
//
//  Seit 1.339.0 lässt sich eine Wartung statt einem Typ auch einer
//  einzelnen Maschine oder einem ganzen Park zuteilen (Wunsch Patrick
//  2. November 2026: „Wartungen sollen auch einzeln pro Maschine und
//  Park zugeteilt werden können“). Am Plan steht genau eines von
//  type_id, machine_id, park_id (sql/wartung-ziel.sql). Quittiert wird
//  weiter je Maschine.
//
//  Hochladen, terminieren, löschen: alle mit Schreibrecht. Quittieren:
//  alle, die es sehen. Externe haben die Kachel nicht (wie vorher
//  „Internet“).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { betrachter } from "../teile/Betrachter.jsx";
import { infoLaden, batterieHeuteFaellig, batterienGewechselt, batterieText, batterienText,
  ohneBatterien } from "../daten/maschinenInfo.js";

const PLAN = "wartung_plan";
const ERLEDIGT = "wartung_erledigt";
const AENDERUNG = "hofer:wartung";

export const WIEDERHOLUNG = [
  ["nie", "Einmalig"],
  ["tag", "Jeden Tag"],
  ["woche", "Jede Woche"],
  ["2wochen", "Alle 2 Wochen"],
  ["monat", "Jeden Monat"],
  ["3monate", "Alle 3 Monate"],
  ["6monate", "Alle 6 Monate"],
  ["jahr", "Jedes Jahr"],
  ["2jahre", "Alle 2 Jahre"],
];
export const wiederholungText = (w) => (WIEDERHOLUNG.find((x) => x[0] === w) || WIEDERHOLUNG[0])[1];
// Schritt je Wiederholung: Tage oder Monate
const SCHRITT = { tag: [1, 0], woche: [7, 0], "2wochen": [14, 0], monat: [0, 1], "3monate": [0, 3],
  "6monate": [0, 6], jahr: [0, 12], "2jahre": [0, 24] };

const endungVon = (name) => ((String(name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1] || "").toLowerCase();
export const istPdf = (w) => !!w && (w.art === "pdf" || endungVon(w.dateiname || String(w.url || "").split(/[?#]/)[0]) === "pdf");

function ablageName(name) {
  const rein = String(name || "datei").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return Date.now().toString(36) + "-" + rein.slice(-80);
}

// Für <input type="datetime-local">: Ortszeit ohne Zeitzone
const zwei = (n) => String(n).padStart(2, "0");
function feldWert(d) {
  return d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate())
    + "T" + zwei(d.getHours()) + ":" + zwei(d.getMinutes());
}
const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export function zeitText(iso) {
  const d = new Date(iso);
  return TAGE[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear()
    + " " + zwei(d.getHours()) + ":" + zwei(d.getMinutes());
}
const datumText = (d) => TAGE[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear();

// ---------- Termine rechnen ----------

// k-ter Termin ab dem ersten. Monate auf den letzten Tag gekürzt
// (31. Januar + 1 Monat = 28./29. Februar), Uhrzeit bleibt.
function termin(start, w, k) {
  const [tage, monate] = SCHRITT[w] || [0, 0];
  const d = new Date(start);
  if (tage) { d.setDate(d.getDate() + tage * k); return d; }
  const tag = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + monate * k);
  const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(tag, letzter));
  return d;
}

// Nummer des letzten Termins, der schon da ist (0 = der erste)
function letzteNummer(start, w, jetzt) {
  const [tage, monate] = SCHRITT[w];
  const schaetz = tage ? (jetzt - start) / (tage * 86400000) : (jetzt - start) / (monate * 30.44 * 86400000);
  let k = Math.max(0, Math.floor(schaetz) - 1);
  while (termin(start, w, k + 1).getTime() <= jetzt) k++;
  while (k > 0 && termin(start, w, k).getTime() > jetzt) k--;
  return k;
}

// Der letzte Termin, der schon da ist (oder null)
export function letzterTermin(plan, jetzt = Date.now()) {
  if (!plan || !plan.termin) return null;
  const start = new Date(plan.termin);
  if (start.getTime() > jetzt) return null;
  if (!SCHRITT[plan.wiederholung]) return start;
  return termin(start, plan.wiederholung, letzteNummer(start, plan.wiederholung, jetzt));
}

// Der nächste Termin in der Zukunft (oder null)
export function naechsterTermin(plan, jetzt = Date.now()) {
  if (!plan || !plan.termin) return null;
  const start = new Date(plan.termin);
  if (start.getTime() > jetzt) return start;
  if (!SCHRITT[plan.wiederholung]) return null;
  return termin(start, plan.wiederholung, letzteNummer(start, plan.wiederholung, jetzt) + 1);
}

// Wann zuletzt an dieser Maschine erledigt (Date oder null)
function zuletztErledigt(erledigt, planId, maschineId) {
  let max = null;
  (erledigt || []).forEach((e) => {
    if (e.plan_id !== planId || e.machine_id !== maschineId) return;
    const t = new Date(e.erledigt_am);
    if (!max || t > max) max = t;
  });
  return max;
}

// Ist der Plan an dieser Maschine fällig? Gibt den Termin zurück, seit
// dem er fällig ist, sonst null.
export function faelligSeit(plan, erledigt, maschineId, jetzt = Date.now()) {
  const l = letzterTermin(plan, jetzt);
  if (!l) return null;
  const e = zuletztErledigt(erledigt, plan.id, maschineId);
  return e && e >= l ? null : l;
}

// ---------- Laden ----------

// Wem ein Plan gilt: { art: "typ" | "park" | "maschine", id }
export function zielVon(p) {
  if (p.machine_id) return { art: "maschine", id: p.machine_id };
  if (p.park_id) return { art: "park", id: p.park_id };
  return { art: "typ", id: p.type_id };
}
const SPALTE = { typ: "type_id", park: "park_id", maschine: "machine_id" };
// Die drei Spalten für ein Ziel, die anderen leer. Beim Typ nur type_id,
// damit es auch ohne sql/wartung-ziel.sql geht.
function zielSpalten(z, auchLeere) {
  const d = { [SPALTE[z.art]]: z.id };
  if (auchLeere) Object.values(SPALTE).forEach((k) => { if (!(k in d)) d[k] = null; });
  return d;
}

// Gilt der Plan an dieser Maschine?
export function giltFuer(p, m) {
  if (!m) return false;
  if (p.machine_id) return p.machine_id === m.id;
  if (p.park_id) return p.park_id === m.park_id;
  return !!p.type_id && p.type_id === m.type_id;
}

// Alle Pläne (es sind wenige); gefiltert wird hier, damit Typ, Park und
// Maschine in einem Zug kommen
async function alleLaden() {
  const r = await alt.db.from(PLAN).select("*").order("erstellt_am");
  if (r.error) throw r.error;
  return r.data || [];
}
// Pläne, die an der Maschine gelten (Typ, Park und die Maschine selbst)
export async function plaeneLaden(m) {
  if (!m || !m.id) return [];
  return (await alleLaden()).filter((p) => giltFuer(p, m));
}
// Pläne mit genau diesem Ziel (Einstellungen → Wartung)
export async function plaeneZiel(z) {
  if (!z || !z.id) return [];
  return (await alleLaden()).filter((p) => { const x = zielVon(p); return x.art === z.art && x.id === z.id; });
}

export async function erledigtLaden(planIds) {
  if (!planIds.length) return [];
  const r = await alt.db.from(ERLEDIGT).select("*").in("plan_id", planIds);
  if (r.error) throw r.error;
  return r.data || [];
}

const typNamen = new Map();
async function typName(typeId) {
  if (!typeId) return "";
  if (!typNamen.has(typeId)) {
    const p = alt.db.from("machine_types").select("id, name").eq("id", typeId)
      .then((r) => ((r.data || [])[0] || {}).name || "");
    typNamen.set(typeId, p);
  }
  return typNamen.get(typeId);
}

// Namen von Typen, Parks und Maschinen für „gilt für …“
let namenVorrat = null;
export function namenLaden() {
  if (!namenVorrat) {
    namenVorrat = Promise.all([alt.db.from("machine_types").select("id, name"),
      alt.db.from("machine_parks").select("id, name"), alt.db.from("machines").select("id, name, machine_number")])
      .then(([t, p, m]) => {
        const n = { typ: {}, park: {}, maschine: {} };
        (t.data || []).forEach((x) => { n.typ[x.id] = x.name || ""; });
        (p.data || []).forEach((x) => { n.park[x.id] = x.name || ""; });
        (m.data || []).forEach((x) => { n.maschine[x.id] = x.machine_number || x.name || ""; });
        return n;
      });
    namenVorrat.catch(() => { namenVorrat = null; });
  }
  return namenVorrat;
}
export function zielText(z, namen) {
  const name = ((namen || {})[z.art] || {})[z.id] || "";
  if (z.art === "maschine") return "Nur Maschine " + name;
  if (z.art === "park") return "Ganzer Park " + name;
  return "Alle Maschinen " + name;
}

export const geaendert = () => window.dispatchEvent(new Event(AENDERUNG));

// Alles zur Wartung einer Maschine: Pläne ihres Typs, wer wann erledigt
// hat, die Batterien. Frisch nach jeder Änderung und jede Minute (ein
// Termin kann von einem anderen Gerät kommen, und Termine werden auch
// ohne Änderung in der Datenbank fällig).
export function useWartung(m) {
  const [stand, setStand] = useState({ plaene: [], erledigt: [], info: null, typ: "" });
  const [, setTakt] = useState(0);
  const id = m && m.id, typId = m && m.type_id, parkId = m && m.park_id;
  useEffect(() => {
    if (!id || alt.istExtern()) { setStand({ plaene: [], erledigt: [], info: null, typ: "" }); return; }
    let weg = false;
    const laden = async () => {
      const [plaene, info, typ] = await Promise.all([
        plaeneLaden(m).catch(() => []),
        infoLaden(id).catch(() => null),
        typName(typId).catch(() => "")]);
      const erledigt = await erledigtLaden(plaene.map((p) => p.id)).catch(() => []);
      if (!weg) setStand({ plaene, erledigt, info, typ });
    };
    laden();
    const t = setInterval(() => { laden(); setTakt((x) => x + 1); }, 60 * 1000);
    window.addEventListener(AENDERUNG, laden);
    return () => { weg = true; clearInterval(t); window.removeEventListener(AENDERUNG, laden); };
  }, [id, typId, parkId]);
  return { ...stand, faellig: faelligeFuer(m, stand) };
}

// Was an der Maschine jetzt fällig ist, ältestes zuerst: Pläne und
// Batterien
export function faelligeFuer(m, { plaene, erledigt, info, typ }) {
  if (!m) return [];
  const liste = [];
  (plaene || []).forEach((p) => {
    const seit = faelligSeit(p, erledigt, m.id);
    if (seit) liste.push({ art: "plan", id: p.id, titel: p.titel, plan: p, seit });
  });
  if (batterieHeuteFaellig(info, typ)) {
    liste.push({ art: "batterie", id: "batterie", titel: "Backup-Batterien wechseln", info,
      seit: alt.ausIso(info.batterie_faellig) });
  }
  return liste.sort((a, b) => a.seit - b.seit);
}

// Quittieren an dieser Maschine, mit Rückgängig
export async function erledigen(item, m) {
  if (item.art === "batterie") {
    try {
      const naechst = await batterienGewechselt(m.id, null, null, null, m.machine_number || m.name);
      alt.meldung("Batterien gewechselt. Nächster Wechsel am " + alt.kurzDatum(naechst) + naechst.slice(0, 4) + ".", "gut");
      geaendert();
      return true;
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return false; }
  }
  const r = await alt.db.from(ERLEDIGT).insert({ plan_id: item.plan.id, machine_id: m.id,
    // Uhr des Geräts, mit der auch die Termine gerechnet werden
    erledigt_am: new Date().toISOString() }).select("id");
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return false; }
  const neu = ((r.data || [])[0] || {}).id;
  if (neu) alt.merkeSchritt("Wartung erledigt: " + item.titel, alt.rueckWeg(ERLEDIGT, { id: neu }));
  alt.meldung("Erledigt: " + item.titel, "gut");
  geaendert();
  return true;
}

function ansehen(w) {
  if (istPdf(w)) return betrachter(w.url, w.titel, true);
  return betrachter(w.url, w.titel, false, "bild", endungVon(w.dateiname || w.url));
}

// Nächster Termin an der Maschine, für die Kachel
function naechstesAnMaschine(m, { plaene, info, typ }) {
  let best = null;
  (plaene || []).forEach((p) => {
    const n = naechsterTermin(p);
    if (n && (!best || n < best.wann)) best = { wann: n, titel: p.titel };
  });
  if (info && info.batterie_hinweis !== false && info.batterie_faellig && !ohneBatterien(typ)) {
    const b = alt.ausIso(info.batterie_faellig);
    if (!best || b < best.wann) best = { wann: b, titel: "Batterien", tag: true };
  }
  return best;
}

// ---------- Kachel im Dashboard ----------
export function WartungKachel({ m }) {
  const w = useWartung(m);
  const f = w.faellig;
  const n = !f.length && naechstesAnMaschine(m, w);
  return (
    <button type="button" className={"pad-karte2 pad-karte2--wartung" + (f.length ? " pad-karte2--wartung-faellig" : "")}
      data-padfeld="wartung" onClick={() => wartungFensterOeffnen(m)}>
      <span className="pad-name">Wartung · antippen</span>
      <span className="pad-wert pad-wartung">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.3-.6-.6-2.3z" /></svg>
        {f.length ? "Fällig" : "Wartung"}
      </span>
      <span className="pad-wartung__unter">
        {f.length ? f[0].titel + (f.length > 1 ? " (+" + (f.length - 1) + ")" : "")
          : n ? "nächste " + (n.tag ? datumText(n.wann) : zeitText(n.wann)) + " · " + n.titel : "keine geplant"}
      </span>
    </button>
  );
}

// ---------- Fenster mit der Liste ----------
export function wartungFensterOeffnen(m) {
  if (!m || !m.id) return;
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit wartung wartung--fenster" id="wartung">
      <WartungListe m={m} zu={zu} />
    </div>), null, "wartung-huelle");
}

function terminVorschlag(w) {
  if (w && w.termin) return feldWert(new Date(w.termin));
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0);
  return feldWert(d);
}

// Erste Seite eines PDF als Bild, so gross wie die Karte (Wunsch
// Patrick: „immer alles so gross wie möglich anzeigen“)
const vorschauVorrat = new Map();
function pdfVorschau(url) {
  if (!vorschauVorrat.has(url)) {
    const p = (async () => {
      const [{ pdfjs }, daten] = await Promise.all([import("../teile/PdfAnsicht.jsx"),
        fetch(url).then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.arrayBuffer(); })]);
      const lib = await pdfjs();
      const aufgabe = lib.getDocument({ data: new Uint8Array(daten), isEvalSupported: false });
      try {
        const doc = await aufgabe.promise;
        const seite = await doc.getPage(1);
        const v1 = seite.getViewport({ scale: 1 });
        const v = seite.getViewport({ scale: Math.min(3, 1400 / Math.max(v1.width, v1.height)) });
        const c = document.createElement("canvas");
        c.width = Math.floor(v.width); c.height = Math.floor(v.height);
        await seite.render({ canvasContext: c.getContext("2d"), viewport: v, canvas: c, intent: "print" }).promise;
        return { bild: c.toDataURL("image/jpeg", 0.88), seiten: doc.numPages };
      } finally { aufgabe.destroy(); }
    })();
    p.catch(() => vorschauVorrat.delete(url));
    vorschauVorrat.set(url, p);
  }
  return vorschauVorrat.get(url);
}

function Vorschau({ w }) {
  const pdf = istPdf(w);
  const [v, setV] = useState(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    if (!pdf) return;
    let weg = false;
    pdfVorschau(w.url).then((x) => { if (!weg) setV(x); }).catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [w.url]);
  if (!pdf) return <img className="wartung__vorschau-bild" src={w.url} alt={w.titel} loading="lazy" />;
  if (fehler) return <span className="wartung__vorschau-text">PDF lässt sich nicht anzeigen</span>;
  if (!v) return <span className="wartung__vorschau-text">PDF wird geladen …</span>;
  return <>
    <img className="wartung__vorschau-bild" src={v.bild} alt={w.titel} />
    <span className="wartung__pdf-marke">PDF{v.seiten > 1 ? " · " + v.seiten + " Seiten" : ""}</span>
  </>;
}

export const BatterieSymbol = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="wartung__batterie-symbol">
    <rect x="2.5" y="7" width="17" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="20" y="10" width="2" height="4" rx="0.6" fill="currentColor" />
    <path d="M10.5 9 8 12.5h3l-1.5 3 3.5-4.5h-3l1-2z" fill="currentColor" /></svg>);

// Karte der Backup-Batterien einer oder mehrerer Maschinen (je
// Maschine ihr Typ, weil Index keine Batterien hat)
function Batterien({ maschinen, infos, typen, darf }) {
  const mit = maschinen.filter((x) => !ohneBatterien(typen[x.type_id] || ""));
  if (!mit.length) return null;
  return (
    <div className="wartung__batterien" data-wartung-batterien="">
      <h3><BatterieSymbol /> Backup-Batterien</h3>
      <ul>
        {mit.map((x) => {
          const info = infos[x.id];
          const faellig = batterieHeuteFaellig(info, typen[x.type_id] || "");
          const aus = !info || info.batterie_hinweis === false || !info.batterie_faellig;
          return (
            <li key={x.id} className={faellig ? "wartung__batt--faellig" : ""} data-batterie-maschine={x.id}>
              <b>{x.machine_number || x.name}</b>
              <span>{aus ? "kein Termin" : batterieText(info)}
                {batterienText(info) ? " · " + batterienText(info) : ""}
                {info && info.batterie_gewechselt ? " · zuletzt " + alt.kurzDatum(info.batterie_gewechselt)
                  + String(info.batterie_gewechselt).slice(0, 4) : ""}</span>
              {faellig && darf && <button className="knopf knopf--klein knopf--haupt" data-batterie-erledigt={x.id}
                onClick={() => erledigen({ art: "batterie", titel: "Backup-Batterien" }, x)}>Gewechselt</button>}
            </li>);
        })}
      </ul>
      <p className="klein wartung__batterien-hinweis">Termin, Anzahl und Art der Batterien auf der Seite der Maschine
        (Maschinen → Maschine). Am Termin zeigt das Pad den Wechsel als Bildschirmschoner.</p>
    </div>
  );
}

// Wofür eine Wartung an dieser Maschine gelten kann (Auswahl im Dialog)
function zielWahl(m, namen) {
  const w = [];
  if (m.type_id) w.push(["typ:" + m.type_id, "Alle Maschinen des Typs " + (namen.typ[m.type_id] || "")]);
  if (m.park_id) w.push(["park:" + m.park_id, "Ganzer Park " + (namen.park[m.park_id] || "")]);
  w.push(["maschine:" + m.id, "Nur diese Maschine (" + (m.machine_number || m.name || "") + ")"]);
  return w;
}
const zielAus = (wert) => { const [art, id] = String(wert || "").split(":"); return { art, id }; };
const zielWert = (z) => z.art + ":" + z.id;

// Die Liste im Fenster des Pads (mit m: alle Pläne, die an dieser
// Maschine gelten, beim Ablegen wählbar Typ, Park oder nur sie) oder
// unter Einstellungen → Wartung (mit ziel: genau die Pläne dieses Typs,
// Parks oder dieser Maschine, maschinen = alle, an denen sie gelten).
// Ohne zu kein Schliessen.
export function WartungListe({ m, ziel, maschinen: alle, zu }) {
  const [plaene, setPlaene] = useState(null);
  const [erledigt, setErledigt] = useState([]);
  const [infos, setInfos] = useState({});
  const [namen, setNamen] = useState({ typ: {}, park: {}, maschine: {} });
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState("");
  const wahl = useRef(null);
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const maschinen = m ? [m] : (alle || []);
  const kennung = maschinen.map((x) => x.id).join(",") + "|" + (ziel ? zielWert(ziel) : "");

  const sqlFehler = (t) => /wartung_(plan|erledigt)|machine_id|park_id|type_id|ein_ziel/.test(t)
    ? "Die Wartung ist in der Datenbank noch nicht ganz eingerichtet (sql/wartung-ziel.sql)." : t;

  const laden = async () => {
    try {
      const p = m ? await plaeneLaden(m) : await plaeneZiel(ziel);
      const [e, ...i] = await Promise.all([erledigtLaden(p.map((x) => x.id)),
        ...maschinen.map((x) => infoLaden(x.id).catch(() => null))]);
      setPlaene(p); setErledigt(e); setFehler("");
      const z = {}; maschinen.forEach((x, n) => { z[x.id] = i[n]; }); setInfos(z);
    } catch (f) {
      setFehler(sqlFehler(alt.fehlertext(f)));
      setPlaene([]);
    }
  };
  useEffect(() => {
    laden();
    namenLaden().then(setNamen).catch(() => {});
    window.addEventListener(AENDERUNG, laden);
    return () => window.removeEventListener(AENDERUNG, laden);
  }, [kennung]);

  const wiederholungFeld = (wert) => ({ name: "wiederholung", label: "Wiederholen", wert: wert || "nie",
    auswahl: WIEDERHOLUNG });
  // Im Pad wählbar, wem die Wartung gilt; Vorgabe der Typ (wie bisher)
  const zielFeld = (wert) => m ? [{ name: "ziel", label: "Gilt für", wert, auswahl: zielWahl(m, namen) }] : [];
  const vorgabeZiel = () => ziel || (m.type_id ? { art: "typ", id: m.type_id } : { art: "maschine", id: m.id });
  const ueberschrift = ziel ? zielText(ziel, namen).replace(/^Alle Maschinen /, "Typ ") : "";

  const hochladen = async (dateien) => {
    for (const datei of dateien) {
      const pdf = datei.type === "application/pdf" || endungVon(datei.name) === "pdf";
      if (!pdf && !/^image\//.test(datei.type || "")) {
        alt.meldung(datei.name + ": nur Bilder oder PDFs.", "warn"); continue;
      }
      const w = await alt.dialogFelder({
        titel: "Wartung ablegen" + (ueberschrift ? " · " + ueberschrift : ""),
        felder: [
          { name: "titel", label: "Was ist zu tun?", pflicht: true,
            wert: datei.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() },
          ...zielFeld(zielWert(vorgabeZiel())),
          { name: "termin", label: "Erster Termin (leer = nur ablegen)", typ: "datetime-local", wert: "",
            hinweis: "Ab dann zeigt das Pad jeder betroffenen Maschine es als Bildschirmschoner, bis dort jemand „Erledigt“ tippt." },
          wiederholungFeld("nie"),
        ],
        bestaetigen: "Ablegen" });
      if (!w) continue;
      const z = w.ziel ? zielAus(w.ziel) : vorgabeZiel();
      setLaedt(datei.name);
      try {
        const ordner = z.art === "typ" ? "typen/" + z.id + "/wartung/"
          : z.art === "park" ? "parks/" + z.id + "/wartung/" : "maschinen/" + z.id + "/wartung-pad/";
        const pfad = ordner + ablageName(datei.name);
        const up = await alt.db.storage.from("zeichnungen").upload(pfad, datei,
          { contentType: datei.type || (pdf ? "application/pdf" : "application/octet-stream"), upsert: false });
        if (up.error) throw up.error;
        const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
        const ein = await alt.db.from(PLAN).insert({
          ...zielSpalten(z, false), titel: w.titel.trim(), url, pfad, dateiname: datei.name,
          art: pdf ? "pdf" : "bild", termin: w.termin ? new Date(w.termin).toISOString() : null,
          wiederholung: w.wiederholung || "nie" }).select("id");
        if (ein.error) throw ein.error;
        const neuId = ((ein.data || [])[0] || {}).id;
        if (neuId) alt.merkeSchritt("Wartung " + w.titel.trim(), alt.rueckWeg(PLAN, { id: neuId }));
        alt.meldung("Abgelegt: " + w.titel.trim(), "gut");
      } catch (f) {
        const t = alt.fehlertext(f);
        alt.meldung(/exceeded|too large|413|maximum/i.test(t) ? datei.name + " ist zu gross für die Ablage." : sqlFehler(t), "fehler");
      }
      setLaedt("");
    }
    geaendert();
  };

  const aendern = async (w, daten, text) => {
    const vorher = await alt.rueckSichern(PLAN, { id: w.id });
    const { error } = await alt.db.from(PLAN).update(daten).eq("id", w.id);
    if (error) { alt.meldung(sqlFehler(alt.fehlertext(error)), "fehler"); return; }
    alt.merkeSchritt(text, alt.rueckRein(PLAN, vorher));
    geaendert();
  };

  const terminieren = async (w) => {
    const jetzt = zielVon(w);
    const e = await alt.dialogFelder({
      titel: "Termin für „" + w.titel + "“",
      felder: [
        { name: "titel", label: "Was ist zu tun?", wert: w.titel, pflicht: true },
        ...zielFeld(zielWert(jetzt)),
        { name: "termin", label: "Erster Termin", typ: "datetime-local", wert: terminVorschlag(w), pflicht: true,
          hinweis: "Ab dann zeigt das Pad es als Bildschirmschoner statt des Einrichtblatts, an jeder betroffenen Maschine." },
        wiederholungFeld(w.wiederholung),
      ],
      bestaetigen: "Terminieren" });
    if (!e || !e.termin) return;
    const daten = { titel: e.titel.trim(), termin: new Date(e.termin).toISOString(),
      wiederholung: e.wiederholung || "nie" };
    if (e.ziel && e.ziel !== zielWert(jetzt)) Object.assign(daten, zielSpalten(zielAus(e.ziel), true));
    await aendern(w, daten, "Termin " + w.titel);
  };

  const loeschen = async (w) => {
    const ja = await alt.nachfragen({ titel: "Wartung löschen",
      text: "Soll „" + w.titel + "“ gelöscht werden (" + zielText(zielVon(w), namen) + ")?",
      bestaetigen: "Löschen", gefahr: true });
    if (!ja) return;
    // Die Datei bleibt liegen, damit Rückgängig sie zurückholt. Die
    // Quittungen gehen mit dem Plan weg (in der Datenbank), darum vorher
    // sichern.
    const vorher = await alt.rueckSichern(PLAN, { id: w.id });
    const quittungen = await alt.rueckSichern(ERLEDIGT, { plan_id: w.id });
    const { error } = await alt.db.from(PLAN).delete().eq("id", w.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Löschen von " + w.titel, [...[].concat(alt.rueckRein(PLAN, vorher)),
      ...(quittungen.length ? [].concat(alt.rueckRein(ERLEDIGT, quittungen)) : [])]);
    geaendert();
  };

  // Fällige zuerst, dann nach nächstem Termin, dann ohne Termin
  const jetzt = Date.now();
  const rang = (p) => {
    const f = maschinen.some((x) => faelligSeit(p, erledigt, x.id, jetzt));
    if (f) return -Infinity;
    const n = naechsterTermin(p, jetzt);
    return n ? n.getTime() : Infinity;
  };
  const sortiert = [...(plaene || [])].sort((a, b) => rang(a) - rang(b));

  const titel = m ? [namen.typ[m.type_id], m.machine_number || m.name].filter(Boolean).join(" · ") : ueberschrift;
  const erklaerung = m
    ? "Alles, was an dieser Maschine gilt: je Typ, je Park oder nur für sie. Beim Ablegen wählen, wofür es gilt."
    : ziel.art === "maschine" ? "Gilt nur für diese Maschine."
    : ziel.art === "park" ? "Gilt für alle Maschinen des Parks." : "Gilt für alle Maschinen des Typs.";

  return (
    <>
      <div className="blatt__kopf">
        <h2>Wartung{titel ? " · " + titel : ""}</h2>
        {darf && <button className="knopf knopf--haupt" id="wartung-neu" disabled={!!laedt}
          onClick={() => wahl.current && wahl.current.click()}>+ Bild oder PDF</button>}
        {zu && <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>}
      </div>
      {darf && <input ref={wahl} type="file" multiple hidden id="wartung-datei" accept="image/*,application/pdf,.pdf"
        onChange={(e) => { const d = [...e.target.files]; e.target.value = ""; if (d.length) hochladen(d); }} />}
      <p className="klein wartung__erklaerung">{erklaerung} Bild oder PDF ablegen, dann „Terminieren“ mit
        Wiederholung: ab dem Termin zeigt das Pad es als Bildschirmschoner statt des Einrichtblatts, bis an der
        Maschine jemand unten in der Mitte „Erledigt“ tippt.</p>
      {laedt && <p className="unterlagen__laedt">Lädt hoch: {laedt} …</p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      <Batterien maschinen={maschinen} infos={infos} typen={namen.typ} darf={!alt.istExtern()} />
      {plaene === null
        ? <p className="klein">Lädt …</p>
        : !sortiert.length
        ? <p className="unterlagen__leer">Noch nichts abgelegt.{darf ? " Mit „+ Bild oder PDF“ beginnen." : ""}</p>
        : <ul className="wartung__liste">
            {sortiert.map((w) => {
              const seit = m ? faelligSeit(w, erledigt, m.id, jetzt) : null;
              const faelligAn = m ? [] : maschinen.filter((x) => faelligSeit(w, erledigt, x.id, jetzt));
              const f = m ? !!seit : faelligAn.length > 0;
              const n = naechsterTermin(w, jetzt);
              const zuletzt = m ? zuletztErledigt(erledigt, w.id, m.id) : null;
              const z = zielVon(w);
              return (
                <li key={w.id} className={"wartung__zeile" + (f ? " wartung__zeile--faellig" : "")} data-wartung={w.id}>
                  <button className="wartung__vorschau" title="Gross ansehen" onClick={() => ansehen(w)}>
                    <Vorschau w={w} />
                  </button>
                  <div className="wartung__text">
                    <b>{w.titel}</b>
                    {m && <span className={"wartung__ziel wartung__ziel--" + z.art} data-wartung-ziel={z.art}>
                      {zielText(z, namen)}</span>}
                    <span className="klein">
                      {w.termin ? wiederholungText(w.wiederholung) : "Kein Termin"}
                      {seit ? " · fällig seit " + zeitText(seit) : ""}
                      {n ? " · nächster Termin " + zeitText(n) : ""}
                      {zuletzt ? " · zuletzt erledigt " + zeitText(zuletzt) : ""}</span>
                    {faelligAn.length > 0 && <span className="klein wartung__faellig-an" data-faellig-an="">
                      Fällig an: {faelligAn.map((x) => x.machine_number || x.name).join(", ")}</span>}
                  </div>
                  <div className="wartung__knoepfe">
                    {m && seit && <button className="knopf knopf--klein knopf--haupt" data-wartung-erledigt={w.id}
                      onClick={() => erledigen({ art: "plan", plan: w, titel: w.titel }, m)}>Erledigt</button>}
                    {darf && <button className={"knopf knopf--klein" + (f ? "" : " knopf--haupt")} data-wartung-termin={w.id}
                      onClick={() => terminieren(w)}>{w.termin ? "Termin ändern" : "Terminieren"}</button>}
                    {darf && w.termin && <button className="knopf knopf--klein" data-wartung-ohne={w.id}
                      onClick={() => aendern(w, { termin: null }, "Termin weg: " + w.titel)}>Kein Termin</button>}
                    {darf && <button className="knopf knopf--klein knopf--gefahr-leise" data-wartung-weg={w.id}
                      onClick={() => loeschen(w)}>Löschen</button>}
                  </div>
                </li>);
            })}
          </ul>}
    </>
  );
}
