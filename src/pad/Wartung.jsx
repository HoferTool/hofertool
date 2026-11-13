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
//  Seit 1.353.0 Vorlagen (Wunsch Patrick 3. November 2026: „die
//  Wartungsvorlagen sollen bei den Einstellungen abgelegt werden können,
//  unterscheide nur Langdreher, Kurzdreher, Extern … immer noch wie
//  vorher auf jeder Maschine anwählbar: nur diese Maschine, ganzer Park,
//  Typ“): Tabelle wartung_vorlagen (sql/wartung-vorlagen.sql), abgelegt
//  unter Einstellungen → Wartung → Vorlagen. „Vorlage wählen“ an der
//  Maschine zeigt zuerst die Gruppe ihres Parks und legt mit derselben
//  Datei einen Plan mit eigenem Ziel und Termin an.
//
//  Seit 1.518.0 auch Text statt Bild oder PDF (Wunsch Patrick
//  13. November 2026: „nicht nur PDFs oder Bilder, sondern das Feld
//  gleich mit Text beschreiben, mit Farbpalette oben“): art = "text",
//  reiner Text in inhalt, die Formatierung in inhalt_fmt (wie im
//  Einrichtblatt, dieselbe Leiste aus einrichtblatt/markiert.jsx),
//  ohne Datei (sql/wartung-text.sql).
//
//  Hochladen, terminieren, löschen: alle mit Schreibrecht. Quittieren:
//  alle, die es sehen. Externe haben die Kachel nicht (wie vorher
//  „Internet“).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { betrachter } from "../teile/Betrachter.jsx";
import { MarkierLeiste, formatHtml } from "../einrichtblatt/markiert.jsx";
import { BlattAnsicht, BlattEditor, blattAusAlt, blattSchreiben, istBlatt, BLATT_SCHRIFT } from "./WartungBlatt.jsx";
import { infoLaden, batterieHeuteFaellig, batterienGewechselt, batterieText, batterienText,
  ohneBatterien, infoSetzenViele, plusJahre, BATTERIE_JAHRE, BATTERIE_ARTEN, batterieArtTeilen,
  batterieArtZusammen } from "../daten/maschinenInfo.js";

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

export const endungVon = (name) => ((String(name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1] || "").toLowerCase();
export const istText = (w) => !!w && w.art === "text";
export const istPdf = (w) => !!w && !istText(w) && (w.art === "pdf" || endungVon(w.dateiname || String(w.url || "").split(/[?#]/)[0]) === "pdf");

export function ablageName(name) {
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

export function ansehen(w) {
  if (istText(w)) {
    fensterOeffnen((zu) => (
      <div className="dialog dialog--breit wartung wartung-textansicht" id="wartung-textansicht">
        <div className="blatt__kopf"><h2>{w.titel}</h2>
          <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button></div>
        <WartungText w={w} gross />
      </div>), null, "wartung-huelle");
    return;
  }
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

// ---------- Vorlagen (seit 1.353.0) ----------
export const VORLAGEN = "wartung_vorlagen";
export const GRUPPEN = [["langdreher", "Langdreher"], ["kurzdreher", "Kurzdreher"], ["extern", "Extern"]];
export const gruppeText = (g) => (GRUPPEN.find((x) => x[0] === g) || GRUPPEN[0])[1];
// Gruppe nach dem Namen des Parks (Index, Multitasking, SB-20RG, SW-20, SB-16, SB-20, SR-10, SR-32, Hanwha, Extern)
export function gruppeVonPark(name) {
  const n = String(name || "").toLowerCase();
  if (/extern/.test(n)) return "extern";
  // Multitasking (Macodel) war bis 1.477.1 im Kurzdreherpark und nimmt
  // weiter die Vorlagen der Kurzdreher
  if (/kurz|multi|index/.test(n)) return "kurzdreher";
  // Der Langdreherpark heisst seit 1.505.1 Playmobile Abteilung (seit 1.508.3 Alte Maschinen), dazu
  // SB-20RG Park und SW-20 Park; seit 1.509.1 statt Alte Maschinen je Typ
  // SB-16, SB-20, SR-10, SR-32 und Hanwha: alle nehmen die Vorlagen der Langdreher
  if (/lang|playmobil|alte maschinen|sw-?20|sb-?20|sb-?16|sr-?10|sr-?32|hanwha/.test(n)) return "langdreher";
  return null;
}
export async function vorlagenLaden() {
  const r = await alt.db.from(VORLAGEN).select("*").order("sort_order").order("titel");
  if (r.error) throw r.error;
  return r.data || [];
}

// Auswahl als Fenster: Reiter Langdreher, Kurzdreher, Extern und
// „Bisher zugeteilt“ (Dateien, die schon an einer Maschine hängen, aber
// keine Vorlage sind). Gibt { titel, url, pfad, dateiname, art,
// wiederholung? } oder null.
function VorlagenWahl({ vorlagen, bisher, gruppe, namen, fertig }) {
  // Seit 1.533.0 ohne Gruppen, nur „Alle“ und „Bisher zugeteilt“
  // (Wunsch Patrick 13. November 2026: „fass es zusammen“)
  const reiter = [["alle", "Alle"]].concat(bisher.length ? [["bisher", "Bisher zugeteilt"]] : []);
  const [g, setG] = useState(gruppe || "alle");
  const inG = () => true;
  const liste = g === "bisher" ? bisher : vorlagen.filter((v) => inG(v, g));
  return (
    <div className="dialog dialog--breit wartung wartung-wahl" id="wartung-wahl">
      <div className="blatt__kopf">
        <h2>Vorlage wählen</h2>
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
      </div>
      <div className="es-wartung__art" role="tablist">
        {reiter.map(([k, t]) => {
          const n = k === "bisher" ? bisher.length : vorlagen.filter((v) => inG(v, k)).length;
          return <button key={k} role="tab" aria-selected={k === g} data-vorlage-gruppe={k}
            className={"knopf" + (k === g ? " knopf--haupt" : "")} onClick={() => setG(k)}>
            {t} <span className="es-wartung__zahl">{n}</span></button>;
        })}
      </div>
      <p className="klein">Die Datei bleibt dieselbe. Danach wählen, wofür sie gilt, und den Termin setzen.
        Vorlagen ablegen unter Einstellungen → Wartung → Vorlagen.</p>
      {!liste.length ? <p className="unterlagen__leer">Keine Vorlagen.</p>
        : <ul className="wartung-wahl__liste">
            {liste.map((v) => (
              <li key={v.id}>
                <button type="button" className="wartung-wahl__karte" data-vorlage={v.id} onClick={() => fertig(v)}>
                  <span className="wartung-wahl__bild"><Vorschau w={v} /></span>
                  <b>{v.titel}</b>
                  {g === "bisher" && <span className="klein">{zielText(zielVon(v), namen)}</span>}
                </button>
              </li>))}
          </ul>}
    </div>
  );
}
export async function vorlageWaehlen({ gruppe, namen, mitBisher = true }) {
  const [vorlagen, plaene] = await Promise.all([vorlagenLaden().catch(() => []),
    mitBisher ? alleLaden().catch(() => []) : []]);
  // Je Datei nur einmal, nichts, was schon Vorlage ist
  const gesehen = new Set(vorlagen.map((v) => v.url));
  const schluessel = (p) => istText(p) ? "text:" + p.titel + "\n" + (p.inhalt || "") : p.url;
  vorlagen.forEach((v) => gesehen.add(schluessel(v)));
  const bisher = plaene.filter((p) => { const k = schluessel(p); if (!k || gesehen.has(k)) return false; gesehen.add(k); return true; });
  if (!vorlagen.length && !bisher.length) {
    alt.meldung("Es ist noch keine Vorlage abgelegt (Einstellungen → Wartung → Vorlagen).", "warn");
    return null;
  }
  // Immer zuerst alle Vorlagen (seit 1.505.1), ohne Vorlagen „Bisher zugeteilt“
  const g = vorlagen.length ? "alle" : "bisher";
  return new Promise((fertig) => {
    let ende = false;
    const fertigMit = (wert) => { if (!ende) { ende = true; fertig(wert); } };
    const zu = fensterOeffnen(() => <VorlagenWahl vorlagen={vorlagen} bisher={bisher} gruppe={g} namen={namen}
      fertig={(v) => { fertigMit(v); zu(); }} />, () => fertigMit(null), "wartung-huelle");
  });
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

// Text einer Wartung mit seiner Formatierung (Karte, Fenster, Schoner)
export function WartungText({ w, gross, className }) {
  // Seit 1.535.0 ein Querblatt mit frei liegenden Feldern und Bildern
  if (istBlatt(w.inhalt_fmt)) return <BlattAnsicht fmt={w.inhalt_fmt}
    className={(gross ? "wblatt--gross" : "wblatt--klein") + (className ? " " + className.replace(/\bpad-schoner__text\b/, "wblatt--schoner") : "")} />;
  return <div className={"wartung-text hell-bleibt" + (gross ? " wartung-text--gross" : "") + (className ? " " + className : "")}
    data-wartung-text="" dangerouslySetInnerHTML={{ __html: formatHtml(w.inhalt_fmt, w.inhalt || "") }} />;
}

// Fenster zum Schreiben: Titel, Leiste mit Farben, Dünn/Fett und Grösse
// für markierten Text (wie im Einrichtblatt), darunter seit 1.535.0 das
// Querblatt in iPad-Grösse mit frei verschiebbaren Textfeldern und
// Bildern (WartungBlatt.jsx). Gibt { titel, inhalt, inhalt_fmt } oder null.
const TEXT_HINWEIS = "Zuerst den Text markieren, dann Farbe, Dünn/Fett oder Grösse wählen.";
function TextFenster({ titel: t0, inhalt: i0, fmt: f0, knopf, fertig }) {
  const [titel, setTitel] = useState(t0 || "");
  // Neu: gleich ein leeres Textfeld oben, damit man sofort schreiben kann
  const [teile, setTeile] = useState(() => {
    const b = blattAusAlt(i0, f0);
    return b.teile.length || istBlatt(f0) ? b.teile
      : [{ id: "t0", art: "text", x: 0.05, y: 0.12, w: 0.9, t: "", f: null }];
  });
  const gefuellt = teile.some((t) => t.art === "bild" || (t.t || "").trim());
  const leer = !titel.trim() || !gefuellt;
  const [vorschau, setVorschau] = useState(false);
  const ergebnis = () => ({ titel: titel.trim(), ...blattSchreiben(teile) });
  return (
    <div className="dialog dialog--breit wartung wartung-schreiben" id="wartung-schreiben">
      {vorschau && <SchonerVorschau w={{ ...ergebnis() }} zu={() => setVorschau(false)} />}
      <div className="blatt__kopf">
        <h2>Wartung mit Text</h2>
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
      </div>
      <label className="wartung-schreiben__titel">Was ist zu tun?
        <input className="feld" id="wartung-schreiben-titel" value={titel} onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. Filter reinigen" /></label>
      <div className="wartung-schreiben__leiste"><MarkierLeiste hinweis={TEXT_HINWEIS} start={BLATT_SCHRIFT} min={10} max={160} /></div>
      <BlattEditor teile={teile} setTeile={setTeile} titel={titel.trim()} />
      <div className="wartung-schreiben__fuss">
        <button className="knopf" id="wartung-schreiben-vorschau" disabled={!gefuellt}
          onClick={() => setVorschau(true)}>Vorschau</button>
        <button className="knopf knopf--haupt" id="wartung-schreiben-ok" disabled={leer}
          onClick={() => fertig(ergebnis())}>{knopf || "Weiter"}</button>
      </div>
    </div>
  );
}
// Vorschau im Schreibfenster: zeigt den Text genau so, wie ihn der
// Bildschirmschoner an der Maschine zeigt (gleiche Klassen), damit man
// vor dem Speichern sieht, ob Grösse und Farben passen. Ein Tipp,
// „Schliessen“ oder Escape führt zurück ins Schreiben, nur diese Ebene.
function SchonerVorschau({ w, zu }) {
  useEffect(() => {
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault(); e.stopImmediatePropagation(); zu();
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [zu]);
  return createPortal(
    <div className="pad-schoner pad-schoner--wartung wartung-schoner-vorschau" id="wartung-schoner-vorschau"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); zu(); }}>
      <div className="pad-schoner__blatt"><WartungText w={w} gross className="pad-schoner__text" /></div>
      <div className="wartung-schoner-vorschau__schild">Vorschau · so erscheint es an der Maschine</div>
      <button type="button" className="pad-schoner__erledigt" id="wartung-schoner-vorschau-zu">Schliessen</button>
    </div>,
    document.body);
}

export function textSchreiben({ titel, inhalt, fmt, knopf } = {}) {
  return new Promise((fertig) => {
    let ende = false;
    const fertigMit = (wert) => { if (!ende) { ende = true; fertig(wert); } };
    const zu = fensterOeffnen(() => <TextFenster titel={titel} inhalt={inhalt} fmt={fmt} knopf={knopf}
      fertig={(v) => { fertigMit(v); zu(); }} />, () => fertigMit(null), "wartung-huelle");
  });
}

export function Vorschau({ w }) {
  if (istText(w)) return <WartungText w={w} className="wartung__vorschau-inhalt" />;
  return <DateiVorschau w={w} />;
}
function DateiVorschau({ w }) {
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
function Batterien({ maschinen, infos, typen, darf, ziel, zielName }) {
  const mit = maschinen.filter((x) => !ohneBatterien(typen[x.type_id] || ""));
  if (!mit.length) return null;
  // Termin, Anzahl und Art für alle Maschinen des Typs oder Parks auf einmal
  const fuerAlle = async () => {
    const erste = mit.map((x) => infos[x.id]).find((i) => i && (i.batterie_art || i.batterie_anzahl || i.batterie_faellig)) || {};
    const teile = batterieArtTeilen(erste.batterie_art);
    const w = await alt.dialogFelder({ titel: "Backup-Batterien: " + zielName,
      felder: [
        { name: "naechst", label: "Nächster Wechsel", typ: "date", wert: erste.batterie_faellig || "",
          hinweis: "Gilt für alle " + mit.length + " Maschinen. Leer lassen = Termin bleibt je Maschine wie er ist." },
        { name: "zuletzt", label: "Zuletzt gewechselt", typ: "date", wert: "",
          hinweis: "freiwillig; ohne nächsten Wechsel gibt es diesen Datum + " + BATTERIE_JAHRE + " Jahre" },
        { name: "anzahl", label: "Anzahl Batterien je Maschine", ziffern: true, wert: erste.batterie_anzahl || "",
          platzhalter: "z. B. 3", hinweis: "leer = bleibt je Maschine" },
        { name: "art", label: "Art", wert: teile.art,
          auswahl: [["", "— bleibt je Maschine —"]].concat(BATTERIE_ARTEN.map((a) => [a, a]), [["andere", "Andere …"]]) },
        { name: "zusatz", label: "Genaue Bezeichnung", wert: teile.zusatz, platzhalter: "bei „Andere“ oder als Zusatz" },
      ],
      bestaetigen: "Für alle setzen" });
    if (!w) return;
    const naechst = w.naechst || (w.zuletzt ? plusJahre(w.zuletzt, BATTERIE_JAHRE) : null);
    const felder = { batterie_hinweis: true };
    if (naechst) felder.batterie_faellig = naechst;
    if (w.zuletzt) felder.batterie_gewechselt = w.zuletzt;
    const n = parseInt(w.anzahl, 10);
    if (n > 0) felder.batterie_anzahl = n;
    const art = batterieArtZusammen(w.art, w.zusatz);
    if (art) felder.batterie_art = art;
    try {
      await infoSetzenViele(mit.map((x) => x.id), felder, "Backup-Batterien " + zielName);
      alt.meldung("Backup-Batterien für " + mit.length + " Maschinen gesetzt.", "gut");
      geaendert();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <div className="wartung__batterien" data-wartung-batterien="">
      <h3><BatterieSymbol /> Backup-Batterien
        {ziel && darf && alt.darfSchreiben() && mit.length > 0
          && <button type="button" className="knopf knopf--klein wartung__batt-alle" data-batterie-alle=""
            onClick={fuerAlle}>Termin für alle setzen</button>}</h3>
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
export function WartungListe({ m, ziel, maschinen: alle, zu, vorgabe, ohneBatterie }) {
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

  const textSqlFehler = (t) => /inhalt|url/.test(t)
    ? "Wartung mit Text ist in der Datenbank noch nicht eingerichtet (sql/wartung-text.sql)." : sqlFehler(t);
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
  const vorgabeZiel = () => ziel || vorgabe || (m.type_id ? { art: "typ", id: m.type_id } : { art: "maschine", id: m.id });
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

  // Wartung mit Text statt Datei (seit 1.518.0)
  const textNeu = async () => {
    const t = await textSchreiben({});
    if (!t) return;
    const w = await alt.dialogFelder({
      titel: "Wartung ablegen" + (ueberschrift ? " · " + ueberschrift : ""),
      felder: [
        { name: "titel", label: "Was ist zu tun?", pflicht: true, wert: t.titel },
        ...zielFeld(zielWert(vorgabeZiel())),
        { name: "termin", label: "Erster Termin (leer = nur ablegen)", typ: "datetime-local", wert: "",
          hinweis: "Ab dann zeigt das Pad jeder betroffenen Maschine den Text als Bildschirmschoner, bis dort jemand „Erledigt“ tippt." },
        wiederholungFeld("nie"),
      ],
      bestaetigen: "Ablegen" });
    if (!w) return;
    const z = w.ziel ? zielAus(w.ziel) : vorgabeZiel();
    const ein = await alt.db.from(PLAN).insert({
      ...zielSpalten(z, false), titel: w.titel.trim(), url: null, art: "text", inhalt: t.inhalt, inhalt_fmt: t.inhalt_fmt,
      termin: w.termin ? new Date(w.termin).toISOString() : null, wiederholung: w.wiederholung || "nie" }).select("id");
    if (ein.error) { alt.meldung(textSqlFehler(alt.fehlertext(ein.error)), "fehler"); return; }
    const neuId = ((ein.data || [])[0] || {}).id;
    if (neuId) alt.merkeSchritt("Wartung " + w.titel.trim(), alt.rueckWeg(PLAN, { id: neuId }));
    alt.meldung("Abgelegt: " + w.titel.trim(), "gut");
    geaendert();
  };
  const textAendern = async (w) => {
    const t = await textSchreiben({ titel: w.titel, inhalt: w.inhalt, fmt: w.inhalt_fmt, knopf: "Speichern" });
    if (!t) return;
    await aendern(w, { titel: t.titel, inhalt: t.inhalt, inhalt_fmt: t.inhalt_fmt }, "Text " + w.titel);
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

  // Eine Vorlage aus den Einstellungen (seit 1.353.0) oder eine schon
  // abgelegte Datei (etwa vom Typ) zuteilen, ohne neu hochzuladen (Wunsch
  // Patrick 2. und 3. November 2026). Neuer Plan mit eigenem Ziel und
  // Termin, dieselbe Datei in der Ablage.
  const vorhandeneWaehlen = async () => {
    const parkId = (m || maschinen[0] || {}).park_id || (ziel && ziel.art === "park" ? ziel.id : null);
    const q = await vorlageWaehlen({ gruppe: gruppeVonPark(namen.park[parkId]), namen });
    if (!q) return;
    const vorgabe = m ? { art: "maschine", id: m.id } : ziel;
    const w = await alt.dialogFelder({
      titel: "Wartung zuteilen" + (ueberschrift ? " · " + ueberschrift : ""),
      felder: [
        { name: "titel", label: "Was ist zu tun?", pflicht: true, wert: q.titel },
        ...zielFeld(zielWert(vorgabe)),
        { name: "termin", label: "Erster Termin (leer = nur ablegen)", typ: "datetime-local", wert: "",
          hinweis: "Ab dann zeigt das Pad jeder betroffenen Maschine es als Bildschirmschoner, bis dort jemand „Erledigt“ tippt." },
        wiederholungFeld(q.wiederholung || "nie"),
      ],
      bestaetigen: "Zuteilen" });
    if (!w) return;
    const z = w.ziel ? zielAus(w.ziel) : vorgabe;
    const ein = await alt.db.from(PLAN).insert({
      ...zielSpalten(z, false), titel: w.titel.trim(), url: q.url || null, pfad: q.pfad, dateiname: q.dateiname,
      art: q.art || (istPdf(q) ? "pdf" : "bild"),
      ...(istText(q) ? { inhalt: q.inhalt, inhalt_fmt: q.inhalt_fmt } : {}), termin: w.termin ? new Date(w.termin).toISOString() : null,
      wiederholung: w.wiederholung || "nie" }).select("id");
    if (ein.error) { alt.meldung(sqlFehler(alt.fehlertext(ein.error)), "fehler"); return; }
    const neuId = ((ein.data || [])[0] || {}).id;
    if (neuId) alt.merkeSchritt("Wartung " + w.titel.trim(), alt.rueckWeg(PLAN, { id: neuId }));
    alt.meldung("Zugeteilt: " + w.titel.trim() + " (" + zielText(z, namen) + ")", "gut");
    geaendert();
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

  // „Als Nächstes“ oben im Fenster des Pads (Wunsch Patrick 2. November
  // 2026: „wenn man auf Wartung klickt im Pad Mode soll oben aufgelistet
  // werden, was als Nächstes zu tun ist“): zuerst alles Fällige, dann
  // die nächsten Termine, auch die Backup-Batterien, höchstens fünf.
  const naechste = [];
  if (m) {
    const info = infos[m.id], typ = namen.typ[m.type_id] || "";
    (plaene || []).forEach((p) => {
      const seit = faelligSeit(p, erledigt, m.id, jetzt);
      if (seit) naechste.push({ id: p.id, titel: p.titel, wann: seit, faellig: true });
      else { const n = naechsterTermin(p, jetzt); if (n) naechste.push({ id: p.id, titel: p.titel, wann: n }); }
    });
    if (!ohneBatterie && info && info.batterie_hinweis !== false && info.batterie_faellig && !ohneBatterien(typ)) {
      naechste.push({ id: "batterie", titel: "Backup-Batterien wechseln", wann: alt.ausIso(info.batterie_faellig),
        tag: true, faellig: batterieHeuteFaellig(info, typ), zusatz: batterienText(info) });
    }
    naechste.sort((a, b) => (b.faellig ? 1 : 0) - (a.faellig ? 1 : 0) || a.wann - b.wann);
  }
  const hinzeigen = (id) => {
    const el = document.querySelector(id === "batterie" ? "#wartung [data-wartung-batterien]" : "#wartung [data-wartung='" + id + "']");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
        {darf && <button className="knopf knopf--haupt" id="wartung-text-neu" onClick={textNeu}>+ Text</button>}
        {darf && <button className="knopf" id="wartung-vorhanden" onClick={vorhandeneWaehlen}>Vorlage wählen</button>}
        {zu && <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>}
      </div>
      {m && plaene !== null && <div className="wartung__naechstes" data-wartung-naechstes="">
        <h3>Als Nächstes</h3>
        {!naechste.length ? <p className="klein">Nichts geplant.</p>
          : <ol>{naechste.slice(0, 5).map((x) => (
              <li key={x.id} className={x.faellig ? "wartung__naechst--faellig" : ""}>
                <button type="button" onClick={() => x.id !== "batterie" && hinzeigen(x.id)}
                  data-naechst={x.id}>
                  <span className="wartung__naechst-wann">{x.faellig ? "Jetzt fällig"
                    : x.tag ? datumText(x.wann) : zeitText(x.wann)}</span>
                  <b>{x.titel}</b>
                  {x.zusatz && <span className="klein">{x.zusatz}</span>}
                </button>
                {x.id === "batterie" && x.faellig && !alt.istExtern()
                  && <button type="button" className="knopf knopf--haupt wartung__naechst-knopf"
                    data-batterie-erledigt={m.id}
                    onClick={() => erledigen({ art: "batterie", titel: "Backup-Batterien" }, m)}>Gewechselt</button>}
              </li>))}</ol>}
      </div>}
      {darf && <input ref={wahl} type="file" multiple hidden id="wartung-datei" accept="image/*,application/pdf,.pdf"
        onChange={(e) => { const d = [...e.target.files]; e.target.value = ""; if (d.length) hochladen(d); }} />}
      <p className="klein wartung__erklaerung">{erklaerung} Bild, PDF oder Text ablegen (oder eine Vorlage aus den Einstellungen mit „Vorlage wählen“), dann „Terminieren“ mit
        Wiederholung: ab dem Termin zeigt das Pad es als Bildschirmschoner statt des Einrichtblatts, bis an der
        Maschine jemand unten in der Mitte „Erledigt“ tippt.</p>
      {laedt && <p className="unterlagen__laedt">Lädt hoch: {laedt} …</p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {/* Steht die Batterie schon bei „Als Nächstes“, keine eigene Karte (Wunsch Patrick 2. November 2026) */}
      {/* Unter Einstellungen → Wartung keine Batterien: ansehen und ändern nur
          auf der Seite der Maschine (Wunsch Patrick 13. November 2026) */}
      {!ohneBatterie && !(m && naechste.some((x) => x.id === "batterie"))
        && <Batterien maschinen={maschinen} infos={infos} typen={namen.typ} darf={!alt.istExtern()}
          ziel={!m && ziel} zielName={ueberschrift} />}
      {plaene === null
        ? <p className="klein">Lädt …</p>
        : !sortiert.length
        ? <p className="unterlagen__leer">Noch nichts abgelegt.{darf ? " Mit „+ Bild oder PDF“ oder „+ Text“ beginnen." : ""}</p>
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
                    {darf && istText(w) && <button className="knopf knopf--klein" data-wartung-textaendern={w.id}
                      onClick={() => textAendern(w)}>Text ändern</button>}
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
