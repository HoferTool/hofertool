// =================================================================
//  QUALITÄTSSICHERUNG → PRÜFBERICHTE (seit 1.771.0, Wunsch Patrick
//  24. November 2026: „alle Berichte per Pfad hochladen und daraus ein
//  Prüfprotokoll machen, das per Tool läuft und ähnlich aufgebaut ist“,
//  „soll unter QS als weiterer Reiter kommen“).
//  Seit 1.779.0 (Patrick 24. November 2026: „die Excel sollen nie mehr
//  angezeigt werden“, „was wo gemacht werden muss, wird bei Stammdaten
//  definiert“): welche Prüfungen und welche Masse gelten, steht in den
//  Stammdaten der HOCO Nr. (src/hoco/Pruefung.jsx, Tabelle pruef_stamm).
//  Hier oben drei Spalten mit dem, was ansteht (Erstteilprüfung, AQL, LL),
//  darunter die zuletzt bearbeiteten Protokolle als Liste, „+ Protokoll“
//  mit der Wahl der Art. Ein Protokoll sieht aus wie ein A4-Blatt und
//  lässt sich drucken und löschen.
//  Seit 1.799.0 (Patrick 25. November 2026: „die Version aus dem Ordner als
//  letzte Produktion ansehen, sobald eine neuere dazukommt, soll das
//  Original weg … ab dann immer alle speichern“): solange es für eine HOCO
//  Nr. noch kein Protokoll in der App gibt, steht ihr Excel aus dem Ordner
//  unten unter „Letzte Produktion“ zum Ansehen. Mit dem ersten Protokoll
//  fällt es hier weg, und pruefberichte.ps1 nimmt es aus der App und lädt es
//  nie wieder hoch. Die Protokolle der App bleiben alle.
// =================================================================
import { teilMerken } from "../../teile/wiederherstellen.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { passtWoerter } from "../../teile/Suchfeld.jsx";
import { useSeitenSuche } from "../../teile/seitenSuche.js";
import { STIL, briefkopf } from "./achtdBlatt.js";
import { qsSprung } from "./qsSprung.js";
import { istFaellig } from "../../daten/pruefmittel.js";
import Pruefung, { MasseBlatt } from "../../hoco/Pruefung.jsx";
import { createPortal } from "react-dom";
import { gdtTeile, gdtHtml } from "../../teile/zeichenListe.js";
import { dokZeigen } from "../../teile/DokAbruf.jsx";
import {
  ARTEN, artVon, artName, istZwischen, TEILE, AQL_WERTE, aqlPlan, fehltTabelle, protokolleLaden, dateienLaden, vorlageLaden, stammSpeichern,
  stammLaden, stammMitMassen, toleranz, tolVon, kopfInStammdaten, toleranzText, istPruefen, lehrenAus, pruefmittelFuer, pruefmittelAlleLaden, pmOrtText, bildVon, zeilenId,
} from "../../daten/pruefbericht.js";

// Offenes Protokoll und Suche bleiben beim Reiterwechsel
const pbZustand = { suche: "", protokoll: null, frisch: null, vorlage: null, masse: null };
// Nach dem Neuladen wieder im selben Reiter und Unterreiter (Wunsch Patrick 25. November 2026)
teilMerken("qsPruefberichte", () => ({ suche: pbZustand.suche, protokoll: pbZustand.protokoll, vorlage: pbZustand.vorlage, masse: pbZustand.masse }),
  (z) => { Object.assign(pbZustand, z); });

const fehlerText = (f) => fehltTabelle(f)
  ? "Die Datenbank kennt die Prüfberichte noch nicht (sql/pruefberichte.sql oder sql/pruef-stamm.sql fehlt)."
  : alt.fehlertext ? alt.fehlertext(f) : String((f && f.message) || f);
const heute = () => alt.isoDatum(new Date());
const datumText = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "");
const zeitText = (d) => { if (!d) return ""; const x = new Date(d); return datumText(alt.isoDatum(x)) + " " + String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); };
// Ausfüllen, Freigabe und Abschliessen darf jeder ausser Externen und Dienst
// (Wunsch Patrick 25. November 2026: „dafür brauchts keine Rechte, jeder darf das ausfüllen und Freigabe erteilen“)
const darf = () => !alt.istExtern() && alt.meineRolle() !== "dienst";

// Zeichnung zur HOCO Nr. ansehen, jederzeit aus Protokoll, Checkliste und
// Vorlage (Wunsch Patrick 27. November 2026: „zum Ansehen und Nachschauen“).
async function zeichnungZeigen(hoco) {
  try {
    const { data } = await alt.db.from("hoco_parts").select("zeichnung_url").eq("hoco_nr", hoco).maybeSingle();
    dokZeigen({ art: "zeichnung", titel: "Zeichnung " + hoco, adresse: (data && data.zeichnung_url) || null, hoco });
  } catch (f) { alt.meldung("Zeichnung ging nicht: " + fehlerText(f), "fehler"); }
}
function ZeichnungKnopf({ hoco }) {
  if (!hoco || alt.istExtern()) return null;
  return <button type="button" className="knopf knopf--klein" data-pbzeichnung={hoco} onClick={() => zeichnungZeigen(hoco)}>📄 Zeichnung</button>;
}


const ENTSCHEIDE = [["freigabe", "Freigabe"], ["nacharbeit", "Nacharbeit / Sortieren"], ["neu", "Neuanfertigung"]];
const entscheidText = (e) => (ENTSCHEIDE.find((x) => x[0] === e) || [])[1] || "";

// Zeilen, die geprüft werden (ohne Abschnitte)
const masse = (zeilen) => (zeilen || []).filter((z) => !z.abschnitt);

// Ergebnis eines Protokolls: { gut, schlecht, offen }
export function auswerten(p) {
  const k = p.kopf || {}, w = p.werte || {};
  const zeilen = masse(k.zeilen);
  let gut = 0, schlecht = 0, offen = 0;
  const zaehle = (v, t) => { const e = istPruefen(v, t); if (e === "gut") gut++; else if (e === "schlecht") schlecht++; else if (!String(v ?? "").trim()) offen++; };
  if (k.art === "aql") {
    for (const z of zeilen) { const v = (w[z.id] || {}).nio; if (v === undefined || v === "") offen++; else if (Number(v) > 0) schlecht += Number(v); else gut++; }
  } else if (k.art === "ll") {
    const aus = new Set(k.auswahl || []);
    for (const pr of w.proben || []) for (const z of zeilen) if (aus.has(z.id)) zaehle((pr.w || {})[z.id], tolVon(z));
  } else {
    for (const z of zeilen) { const t = tolVon(z); for (let i = 0; i < TEILE; i++) zaehle((w[z.id] || [])[i], t); }
  }
  return { gut, schlecht, offen };
}

// AQL: Merkmale über der Annahmezahl
function aqlStand(k, w) {
  const plan = aqlPlan(k.los, k.aql, k.niveau);
  if (!plan) return { plan: null, ueber: [] };
  const ueber = masse(k.zeilen).filter((z) => Number((w[z.id] || {}).nio) > plan.ac);
  return { plan, ueber };
}

const STAND = { laeuft: "läuft", ruesten: "Rüsten", geplant: "geplant", fertig: "fertig" };

// Stammdaten der HOCO Nr. öffnen, dort stehen die Prüfmasse zum Ändern
// (seit 1.889.0, Wunsch Patrick 27. November 2026: „prüfmasse knopf soll weg,
// und dort stammdaten knopf das man es gleich dort ändert“).
function stammdatenOeffnen(nr) {
  alt.prod.hocoOffen = nr; alt.prod.hocoSuche = nr; alt.hocoFenster();
}

// Gehört ein Protokoll zu diesem Auftrag? Über die Kennung, sonst die FA Nr.
const gehoertZu = (p, j) => (p.job_id && p.job_id === j.id)
  || (p.hoco_nr === j.job_number && j.fa_nr && String(p.fa_nr || "").trim() === String(j.fa_nr).trim());

// Was steht an? Nur, was die Stammdaten der HOCO Nr. verlangen (seit 1.826.0,
// Wunsch Patrick 25. November 2026): Erstteil, sobald der Auftrag eine FA Nr.
// hat und auf Rüsten steht; Endkontrolle, sobald er fertig ist; AQL und LL
// während er läuft.
export function anstehend(jobs, stamm, protokolle) {
  const st = new Map((stamm || []).map((s) => [s.hoco_nr, s]));
  const t = heute();
  const aus = { erstteil: [], endkontrolle: [], aql: [], ll: [] };
  for (const j of jobs || []) {
    // Ohne Stamm gelten Erstteil und Endkontrolle wie bei allen HOCO Nr. (seit 1.869.0)
    const s = st.get(j.job_number);
    const arten = s ? (s.arten || []) : ["erstteil", "endkontrolle"];
    const meine = (protokolle || []).filter((p) => gehoertZu(p, j));
    const von = (art) => meine.filter((p) => (p.kopf || {}).art === art);
    const offenes = (art) => von(art).find((p) => !p.abgeschlossen_am) || null;
    // „Im alten System geprüft“ erledigt die Art für diesen Auftrag (seit 1.836.0)
    const altDa = (art) => von(art).some((p) => p.abgeschlossen_am && (p.kopf || {}).alt);
    // Erstteil gilt erst mit Freigabe als erledigt (seit 1.785.0)
    const fertig = (art) => von(art).some((p) => p.abgeschlossen_am && (art !== "erstteil" || p.entscheid === "freigabe"));
    // Jeder Auftrag auf Rüsten, auch ohne FA Nr. (seit 1.869.0, Wunsch Patrick 26. November 2026)
    if (j.plan_status === "ruesten" && arten.includes("erstteil") && !fertig("erstteil")) aus.erstteil.push({ j, art: "erstteil", p: offenes("erstteil") });
    // Eine Zwischenkontrolle erledigt die Endkontrolle nicht
    const endFertig = von("endkontrolle").some((p) => p.abgeschlossen_am && !istZwischen(p.kopf));
    if (j.plan_status === "fertig" && arten.includes("endkontrolle") && !endFertig) aus.endkontrolle.push({ j, art: "endkontrolle", p: offenes("endkontrolle") });
    // Läuft er, steht er als Zwischenkontrolle an, bis eine abgeschlossen ist (seit 1.869.0)
    const zwDa = von("endkontrolle").some((p) => p.abgeschlossen_am);
    if (j.plan_status === "laeuft" && arten.includes("endkontrolle") && !zwDa) aus.endkontrolle.push({ j, art: "endkontrolle", zwischen: true, p: offenes("endkontrolle") });
    if (j.plan_status !== "laeuft") continue;
    if (arten.includes("aql") && !fertig("aql")) aus.aql.push({ j, art: "aql", p: offenes("aql") });
    if (arten.includes("ll") && !altDa("ll")) {
      const ll = von("ll").find((p) => !p.abgeschlossen_am) || null;
      const heuteDa = ll && ((ll.werte || {}).proben || []).some((pr) => pr.datum === t);
      if (!heuteDa) aus.ll.push({ j, art: "ll", p: ll });
    }
  }
  return aus;
}

// „Im alten System geprüft“ (seit 1.836.0, Wunsch Patrick 25. November 2026:
// „gewisse Aufträge laufen schon mit bisherigem System … Button zum einfach
// weitergeben, es wird geprüft, aber nicht im Tool dokumentiert“): legt ein schon
// abgeschlossenes Protokoll ohne Masse an, damit der Punkt wegfällt; bei der
// Erstteilprüfung geht der Auftrag danach auf „läuft“.
async function altGeprueft(t) {
  const name = artName({ art: t.art }).name;
  if (!(await alt.nachfragen({ titel: "Im alten System geprüft?", text: name + " für " + t.j.job_number + (t.j.fa_nr ? " (FA " + t.j.fa_nr + ")" : "") + " wurde mit dem bisherigen System gemacht. Der Punkt fällt weg, im Tool wird nichts dokumentiert." + (t.art === "erstteil" ? " Der Auftrag geht danach auf „läuft“." : ""), bestaetigen: "Ja, weitergeben" }))) return false;
  const jetzt = new Date().toISOString();
  const { data, error } = await alt.db.from("pruefprotokolle").insert({
    hoco_nr: t.j.job_number, fa_nr: t.j.fa_nr || null, job_id: t.j.id || null,
    kopf: { art: t.art, alt: true, zeilen: [], vorlage: {}, bemerkung: "Im alten System geprüft", ...(t.j.maschine ? { maschine: t.j.maschine } : {}) },
    werte: {}, datum: heute(), entscheid: "freigabe", visum: "altes System", abgeschlossen_am: jetzt,
  }).select().single();
  if (error) { alt.meldung("Konnte nicht speichern: " + error.message, "fehler"); return false; }
  alt.merkeSchritt(name + " im alten System " + t.j.job_number, [alt.rueckWeg("pruefprotokolle", { id: data.id })]);
  if (t.art === "erstteil" && t.j.id) {
    try {
      const { data: j } = await alt.db.from("jobs").select("*").eq("id", t.j.id).maybeSingle();
      if (j && j.plan_status !== "laeuft" && j.plan_status !== "fertig" && !j.ended_at) await alt.zustandSetzen(j, "laeuft");
    } catch (e) { alt.meldung("Weitergegeben, aber „läuft“ ging nicht: " + fehlerText(e), "warn"); return true; }
  }
  alt.meldung(name + " " + t.j.job_number + " weitergegeben.", "gut");
  return true;
}

// Material samt Durchmesser aus dem Auftrag (seit 1.786.0, Wunsch Patrick
// 24. November 2026: „bei Material soll auch Durchmesser stehen, ist wichtig“)
function materialText(j) {
  const bez = String((j && j.material_bez) || "").trim();
  const dm = j && j.material_dm;
  if (!bez) return dm ? "Ø " + dm + " mm" : "";
  if (!dm || /\b(rd|sw|vk|ø|rohr)\b|\d+\s*x\s*\d/i.test(bez)) return bez;
  return bez + " · Ø " + dm + " mm";
}

// ---------- Neues Protokoll ----------
// Masse und Vorgaben kommen aus den Stammdaten der HOCO Nr.
async function protokollAnlegen(hoco, art, j, protokolle, zwischen) {
  const st = await stammMitMassen(hoco);
  if (!st || !(st.zeilen || []).length) {
    const ok = await alt.nachfragen({ titel: "Noch keine Masse", text: "Für " + hoco + " sind noch keine Prüfmasse erfasst. Bitte zuerst im Prüfbericht eintragen.", bestaetigen: "Stammdaten öffnen" });
    if (ok) stammdatenOeffnen(hoco);
    return null;
  }
  // Masse aus dem Excel in die Stammdaten, bevor das Original wegfällt
  if (st.aus === "excel") {
    try { await stammSpeichern(hoco, { arten: st.arten || [], aql: st.aql ?? null, niveau: st.niveau || null, zeilen: st.zeilen, kopf: st.kopf || {} }); }
    catch (f) { if (alt.fehlerMerken) alt.fehlerMerken("Prüfung aus Excel speichern", String((f && f.message) || f)); }
  }
  const kopf = { art, zeilen: st.zeilen, vorlage: st.kopf || {}, menge: j.target_quantity || "" };
  if (zwischen) kopf.kontrolle = "zwischen";
  if (j.maschine) kopf.maschine = j.maschine;
  const mat = materialText(j);
  if (mat) kopf.material = mat;
  if (art === "aql") { kopf.los = j.target_quantity || ""; kopf.aql = st.aql ?? 1.0; kopf.niveau = st.niveau || "II"; }
  if (art === "ll") {
    // Masse mit Häkchen LL in den Stammdaten, sonst die Wahl vom letzten LL
    const ids = new Set(st.zeilen.map((z) => z.id));
    const ll = st.zeilen.filter((z) => !z.abschnitt && z.ll).map((z) => z.id);
    const vor = (protokolle || []).find((p) => p.hoco_nr === hoco && (p.kopf || {}).art === "ll");
    kopf.auswahl = ll.length ? ll : ((vor && vor.kopf.auswahl) || []).filter((x) => ids.has(x));
  }
  const { data, error } = await alt.db.from("pruefprotokolle").insert({
    hoco_nr: hoco, fa_nr: j.fa_nr || null, job_id: j.id || null, kopf, werte: art === "ll" ? { proben: [] } : {}, datum: heute(),
  }).select().single();
  if (error) throw error;
  alt.merkeSchritt("Neues Prüfprotokoll " + hoco, alt.rueckWeg("pruefprotokolle", { id: data.id }));
  return data;
}

async function protokollLoeschen(p) {
  const ok = await alt.nachfragen({ titel: "Protokoll löschen", text: artName(p.kopf).name + " " + p.hoco_nr + (p.fa_nr ? " · FA " + p.fa_nr : "") + " vom " + datumText(p.datum || p.erstellt_am) + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
  if (!ok) return false;
  const vorher = await alt.rueckSichern("pruefprotokolle", { id: p.id });
  const { error } = await alt.db.from("pruefprotokolle").delete().eq("id", p.id);
  if (error) { alt.meldung(fehlerText(error), "fehler"); return false; }
  alt.merkeSchritt("Löschen des Prüfprotokolls", alt.rueckRein("pruefprotokolle", vorher));
  return true;
}

// =================================================================
const JOB_SPALTEN = "id, fa_nr, job_number, plan_status, target_quantity, machine_id, planned_from, ended_at, material_bez, material_dm";
// Maschine als Auswahlliste statt Freitext (Wunsch Patrick 27. November 2026:
// „maschine soll dropdown menu sein“). Die Liste wird einmal je Sitzung geladen;
// ein alter Freitext-Wert bleibt als eigener Eintrag sichtbar, damit nichts verloren geht.
let maschinenVorrat = null;
function MaschineWahl({ wert, schreibt, setzen }) {
  const [liste, setListe] = useState(maschinenVorrat || []);
  useEffect(() => {
    if (maschinenVorrat) return;
    let weg = false;
    // Ohne Maschinen externer Parks (Patrick 27. November 2026: „externe Maschinen müssen
    // nicht mitbedacht werden, sie brauchen von uns nur die Planwand“)
    (async () => {
      await alt.ladeParks(false);
      const m = (await alt.ladeMaschinen(false)).filter((x) => !alt.parkIstExtern(x.park_id));
      const n = [...new Set(m.map((x) => x.name).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
      maschinenVorrat = n;
      if (!weg) setListe(n);
    })().catch(() => {});
    return () => { weg = true; };
  }, []);
  const namen = wert && !liste.includes(wert) ? [wert, ...liste] : liste;
  return <select data-pbmaschinewahl value={wert} disabled={!schreibt} onChange={(x) => setzen(x.target.value)}>
    <option value="">– wählen –</option>
    {namen.map((n) => <option key={n} value={n}>{n}</option>)}
  </select>;
}

export default function Pruefberichte() {
  if (qsSprung.masse) { pbZustand.masse = qsSprung.masse; qsSprung.masse = null; }
  const [, setF] = useState(0);
  const neuZeichnen = () => setF((x) => x + 1);
  const laden = async () => {
    const [protokolle, stamm, jobsR, fertigR, dateien] = await Promise.all([
      protokolleLaden(),
      stammLaden().catch((f) => { if (fehltTabelle(f)) return []; throw f; }),
      alt.db.from("jobs").select(JOB_SPALTEN).in("plan_status", ["ruesten", "laeuft"]),
      // Fertige der letzten 60 Tage für die Endkontrolle
      alt.db.from("jobs").select(JOB_SPALTEN).eq("plan_status", "fertig").gte("ended_at", new Date(Date.now() - 60 * 864e5).toISOString()),
      dateienLaden().catch(() => []),
    ]);
    let jobs = (jobsR.data || []).concat(fertigR.data || []);
    const ids = [...new Set(jobs.map((j) => j.machine_id).filter(Boolean))];
    const m = ids.length ? (await alt.db.from("machines").select("id, name, park_id").in("id", ids)).data || [] : [];
    // Aufträge auf Maschinen externer Parks prüft die QS nicht (Patrick 27. November 2026)
    try { await alt.ladeParks(false); } catch (_) { /* ohne Parks alle zeigen */ }
    const extern = new Set(m.filter((x) => alt.parkIstExtern(x.park_id)).map((x) => x.id));
    if (extern.size) jobs = jobs.filter((j) => !extern.has(j.machine_id));
    const name = new Map(m.map((x) => [x.id, x.name]));
    for (const j of jobs) j.maschine = name.get(j.machine_id) || "";
    // Index der Stammdaten für Berichte, aus denen die Aufgabe keinen lesen konnte
    // (Patrick 25. November 2026: „es braucht immer einen Index“)
    const ohne = [...new Set(dateien.filter((d) => !d.index_nr).map((d) => d.hoco_nr).filter(Boolean))];
    const stammIndex = new Map();
    for (let i = 0; i < ohne.length; i += 200) {
      const r = await alt.db.from("hoco_parts").select("hoco_nr, index_nr").in("hoco_nr", ohne.slice(i, i + 200));
      for (const x of r.data || []) if (x.index_nr) stammIndex.set(x.hoco_nr, String(x.index_nr));
    }
    return { protokolle, stamm, jobs, dateien, stammIndex };
  };
  const { daten, fehler, neu } = useDaten(laden, []);

  useSeitenSuche({
    name: "Prüfberichte", platzhalter: "HOCO Nr., FA Nr. …",
    eintraege: () => ((daten && daten.protokolle) || []).map((p) => ({
      gruppe: "Prüfprotokolle", zeichen: "📏", titel: p.hoco_nr + (p.fa_nr ? " · FA " + p.fa_nr : ""),
      zeile: artName(p.kopf).name + " · " + datumText(p.datum || p.erstellt_am), p })),
    springen: (x) => { pbZustand.protokoll = x.p.id; neuZeichnen(); },
  });

  if (!daten) return <p className="klein">{fehler ? fehlerText(fehler) : "Wird geladen …"}</p>;

  const oeffnen = (p) => { pbZustand.protokoll = p.id; pbZustand.frisch = p; neuZeichnen(); };
  if (pbZustand.masse) return <Pruefung key={pbZustand.masse} hoco={pbZustand.masse} modus="qs"
    darf={alt.darfSchreiben() && !alt.istExtern()}
    zurueck={() => { pbZustand.masse = null; neu(); neuZeichnen(); }} />;
  if (pbZustand.protokoll) {
    // Ein eben angelegtes Protokoll ist erst nach dem Neuladen in der Liste
    const f = pbZustand.frisch;
    const p = daten.protokolle.find((x) => x.id === pbZustand.protokoll) || (f && f.id === pbZustand.protokoll ? f : null);
    if (p) return <Protokoll key={p.id} p={p} zurueck={() => { pbZustand.protokoll = null; pbZustand.frisch = null; neu(); neuZeichnen(); }} />;
    pbZustand.protokoll = null;
  }
  if (pbZustand.vorlage) return <VorlageLeer key={pbZustand.vorlage.hoco + "|" + pbZustand.vorlage.idx} v={pbZustand.vorlage}
    zurueck={() => { pbZustand.vorlage = null; neuZeichnen(); }} />;
  return <Uebersicht daten={daten} neu={neu} oeffnen={oeffnen} zeichnen={neuZeichnen} />;
}

// HOCO Nr. eintippen und ihre Prüfmasse hier bearbeiten
function MasseAuf({ zeichnen }) {
  const [nr, setNr] = useState("");
  const auf = () => { const h = nr.trim(); if (!h) return; pbZustand.masse = h; zeichnen(); };
  return (
    <span className="pb-masse-auf">
      <input className="pb-suche" id="pb-masse-hoco" placeholder="HOCO Nr." value={nr}
        onChange={(e) => setNr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") auf(); }} />
      <button type="button" className="knopf knopf--klein" id="pb-masse-auf" onClick={auf}>Prüfmasse bearbeiten</button>
    </span>
  );
}

// ---------- Übersicht: was ansteht und die zuletzt bearbeiteten ----------
function Uebersicht({ daten, neu, oeffnen, zeichnen }) {
  const [suche, setSuche] = useState(pbZustand.suche);
  const [legt, setLegt] = useState(false);
  // Je Spalte ein eigenes Suchfeld (seit 1.839.0, Patrick: „bei allen separat“)
  // Die Suche bleibt seit 1.843.1 nicht über das Neuladen stehen: ein vergessener
  // Suchtext versteckte sonst still Aufträge (Patrick 25. November 2026).
  const [sp, setSp] = useState({});
  const spSetzen = (id, t) => setSp((v) => ({ ...v, [id]: t }));
  const todo = useMemo(() => anstehend(daten.jobs, daten.stamm, daten.protokolle), [daten]);
  const jobMaschine = useMemo(() => new Map((daten.jobs || []).map((j) => [j.id, j.maschine])), [daten]);

  const anlegen = async (hoco, art, j, zwischen) => {
    if (!darf() || legt) return;
    setLegt(true);
    try {
      const p = await protokollAnlegen(hoco, art, j, daten.protokolle, zwischen);
      if (p) oeffnen(p);
    } catch (f) { alt.meldung(fehlerText(f), "fehler"); }
    finally { setLegt(false); }
  };

  // Seit 1.784.0 kein „+ Protokoll“ mehr: Protokolle entstehen nur aus dem, was
  // die Stammdaten verlangen und hier ansteht (Wunsch Patrick 24. November 2026).
  const todoTippen = (t) => { if (t.p) oeffnen(t.p); else anlegen(t.j.job_number, t.art, t.j, t.zwischen); };

  const liste = [...daten.protokolle]
    .sort((a, b) => String(b.geaendert_am || b.erstellt_am).localeCompare(String(a.geaendert_am || a.erstellt_am)))
    .filter((p) => passtWoerter(suche, [p.hoco_nr, p.fa_nr, artName(p.kopf).name, p.visum, ((p.kopf || {}).vorlage || {}).bezeichnung]));
  const zeigen = suche ? liste.slice(0, 200) : liste.slice(0, 30);

  const loeschen = async (p) => { if (await protokollLoeschen(p)) neu(); };

  // Letzte Produktion: je HOCO Nr. und Index nur der neuste Bericht aus dem Ordner,
  // eine Zeile je Index (Wunsch Patrick 25. November 2026: „nicht so gebündelt“)
  const mitProtokoll = new Set(daten.protokolle.map((p) => p.hoco_nr));
  const jeIndex = new Map();
  // Ohne gelesenen Index: der einzige Index der anderen Berichte dieser HOCO Nr., sonst der
  // Index aus den Stammdaten, sonst rot „fehlt“ (nie mehr „–“)
  const idxJeHoco = new Map();
  for (const d of daten.dateien || []) if (d.index_nr) {
    if (!idxJeHoco.has(d.hoco_nr)) idxJeHoco.set(d.hoco_nr, new Set());
    idxJeHoco.get(d.hoco_nr).add(String(d.index_nr).toUpperCase());
  }
  const indexVon = (d) => {
    if (d.index_nr) return String(d.index_nr);
    const s = idxJeHoco.get(d.hoco_nr);
    if (s && s.size === 1) return [...s][0];
    return (daten.stammIndex && daten.stammIndex.get(d.hoco_nr)) || "";
  };
  for (const d0 of daten.dateien || []) {
    if (mitProtokoll.has(d0.hoco_nr)) continue;
    const d = { ...d0, index_nr: indexVon(d0) };
    const k = d.hoco_nr + "|" + String(d.index_nr || "").toUpperCase();
    const z = d.geaendert || d.erstellt_am || "";
    const v = jeIndex.get(k);
    // Alle Seiten des Berichts gehören zusammen (die Aufgabe behält nur die des neusten)
    if (!v) jeIndex.set(k, { hoco: d.hoco_nr, idx: d.index_nr || "", d, zeit: z, dateien: [d] });
    else { v.dateien.push(d); if (String(z) > String(v.zeit)) { v.zeit = z; v.d = d; } }
  }
  const letzte = [...jeIndex.values()]
    .filter((x) => passtWoerter(suche, [x.hoco, x.idx, x.d.name]))
    .sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)) || String(a.hoco).localeCompare(String(b.hoco)));
  const letzteZeigen = suche ? letzte.slice(0, 200) : letzte.slice(0, 30);
  // Das Excel selbst zeigt die App nie: daraus wird eine leere Vorlage (seit 1.823.0)
  const vorlageAnsehen = (x) => { pbZustand.vorlage = { hoco: x.hoco, idx: x.idx, dateien: x.dateien }; zeichnen(); };

  const gefiltert = (id) => todo[id].filter((t) => passtWoerter(sp[id], [t.j.job_number]));
  const SPALTEN = [
    ["erstteil", "Erstteilprüfung", "Aufträge auf Rüsten ohne freigegebene Erstteilprüfung"],
    ["endkontrolle", "End- / Zwischenkontrolle", "Laufende Aufträge als Zwischenkontrolle, fertige (60 Tage) als Endkontrolle"],
    ["aql", "AQL", "Laufende Aufträge ohne abgeschlossene AQL-Stichprobe"],
    ["ll", "LL Langläufer", "Laufende Aufträge ohne Stichprobe von heute"],
  ];
  return (
    <div className="pb">
      <div className="pb-todo" id="pb-todo">
        {SPALTEN.map(([id, titel, erkl]) => (
          <section key={id} className="pb-todo__spalte" data-pbtodo={id}>
            <h3>{titel} <span className={"marke" + (todo[id].length ? " pb-todo__zahl" : "")}>{todo[id].length}</span></h3>
            <input type="search" className="pb-suche pb-todo__suche" data-pbtodosuche={id} placeholder="HOCO Nr. suchen …"
              value={sp[id] || ""} onChange={(x) => spSetzen(id, x.target.value)}
              onKeyDown={(x) => { if (x.key === "Escape" && sp[id]) { x.preventDefault(); x.stopPropagation(); spSetzen(id, ""); } }} />
            {/* Seit 1.871.0 wieder alle offenen gleich sichtbar, kompakt je eine Zeile
                (Wunsch Patrick 26. November 2026: „soll wieder Einträge anzeigen, sieht so leer aus,
                aber so, dass viele angezeigt werden können“); 1.869.0 bis 1.870.x erst mit Suche */}
            {!todo[id].length ? <p className="klein">Nichts offen.</p> : !gefiltert(id).length ? <p className="klein">Nichts gefunden.</p> : (
              <ul className="pb-todo__kompakt">
                {gefiltert(id).slice(0, 300).map((t) => (
                  <li key={t.j.id}>
                    <button type="button" className="pb-todo__eintrag" data-pbtodoauftrag={t.j.id} disabled={!darf() && !t.p} onClick={() => todoTippen(t)}>
                      <b>{t.j.job_number}</b>
                      <small>{t.j.maschine || "?"} · {t.zwischen ? "Zwischenkontrolle" : (STAND[t.j.plan_status] || "")}{t.p ? " · in Arbeit" : ""}</small>
                    </button>
                    {darf() ? <button type="button" className="pb-todo__alt" data-pbalt={t.j.id} title="Wurde mit dem bisherigen System geprüft, nur weitergeben"
                      onClick={async () => { if (await altGeprueft(t)) neu(); }}>✓ alt</button> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="klein pb-todo__erkl">{erkl}</p>
          </section>
        ))}
      </div>

      <section className="pb-karte">
        <div className="pb-kopfzeile">
          <h3 className="pb-titel">Zuletzt bearbeitet</h3>
          <input type="search" className="pb-suche" id="pb-suche" placeholder="HOCO Nr., FA Nr., Art suchen" value={suche}
            onChange={(e) => { setSuche(e.target.value); pbZustand.suche = e.target.value; }} />
          <MasseAuf zeichnen={zeichnen} />
        </div>
        {!zeigen.length ? <p className="klein">{daten.protokolle.length ? "Nichts gefunden." : "Noch kein Protokoll."}</p> : (
          <table className="tabelle pb-zuletzt" id="pb-liste">
            <thead><tr><th>Art</th><th>HOCO Nr.</th><th>FA Nr.</th><th>Maschine</th><th>Datum</th><th>Ergebnis</th><th>Stand</th><th>Geändert</th><th /></tr></thead>
            <tbody>
              {zeigen.map((p) => {
                const e = auswerten(p), art = (p.kopf || {}).art || "erstteil";
                return (
                  <tr key={p.id} data-pbprotokoll={p.id} onClick={() => oeffnen(p)}>
                    <td><span className={"pb-art pb-art--" + art}>{artName(p.kopf).kurz}</span></td>
                    <td><b>{p.hoco_nr}</b></td>
                    <td>{p.fa_nr || <span className="pb-rot">fehlt</span>}</td>
                    {/* Wo es gelaufen ist (Patrick 25. November 2026) */}
                    <td data-pbmaschine>{(p.kopf || {}).maschine || (jobMaschine.get(p.job_id) || "") || <span className="klein">–</span>}</td>
                    <td>{datumText(p.datum || p.erstellt_am)}</td>
                    <td className="nowrap">{e.schlecht ? <b className="pb-rot">{e.schlecht} n.i.O. </b> : null}<span className="klein">{e.gut} i.O.</span></td>
                    <td>{p.abgeschlossen_am ? ((p.kopf || {}).alt ? "✓ im alten System" : "✓ " + (entscheidText(p.entscheid) || "abgeschlossen")) : "in Arbeit"}</td>
                    <td className="klein nowrap">{zeitText(p.geaendert_am || p.erstellt_am)}</td>
                    <td className="nowrap">{darf() ? <button type="button" className="knopf knopf--klein knopf--gefahr-leise" title="Protokoll löschen" data-pbweg={p.id}
                      onClick={(x) => { x.stopPropagation(); loeschen(p); }}>✕</button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!suche && liste.length > zeigen.length ? <p className="klein">Die letzten {zeigen.length} von {liste.length}. Ältere findest du mit der Suche.</p> : null}
      </section>

      {(daten.dateien || []).length ? (
        <section className="pb-karte" id="pb-letzte">
          <div className="pb-kopfzeile">
            <h3 className="pb-titel">Vorlagen aus der letzten Produktion</h3>
          </div>
          <p className="klein">Aus dem Prüfbericht der letzten Produktion wird eine leere Vorlage (je Index, alle Seiten zusammen), solange es für die HOCO Nr. noch kein Protokoll in der App gibt. Mit dem ersten Protokoll in der App fällt sie weg, danach bleiben alle Protokolle gespeichert.</p>
          {!letzteZeigen.length ? <p className="klein">{letzte.length ? "Nichts gefunden." : "Alle HOCO Nummern haben schon ein Protokoll in der App."}</p> : (
            <table className="tabelle pb-zuletzt" id="pb-letzte-liste">
              <thead><tr><th>HOCO Nr.</th><th>Index</th><th>Bericht</th><th>Stand</th><th /></tr></thead>
              <tbody>
                {letzteZeigen.map((x) => (
                  <tr key={x.d.id} data-pbletzte={x.hoco} onClick={() => vorlageAnsehen(x)}>
                    <td className="nowrap"><b>{x.hoco}</b></td>
                    <td className="nowrap">{x.idx || <b className="pb-idx-fehlt" title="Weder im Bericht noch in den Stammdaten ein Index">fehlt</b>}</td>
                    <td className="klein pb-letzte-name" title={x.dateien.map((d) => d.name).join(", ")}>{x.d.name}{x.dateien.length > 1 ? " · " + x.dateien.length + " Seiten" : ""}</td>
                    <td className="klein nowrap">{zeitText(x.zeit)}</td>
                    <td className="nowrap"><button type="button" className="knopf knopf--klein" data-pbletzteansehen={x.d.id}
                      onClick={(e) => { e.stopPropagation(); vorlageAnsehen(x); }}>Vorlage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!suche && letzte.length > letzteZeigen.length ? <p className="klein">Die neusten {letzteZeigen.length} von {letzte.length}. Ältere findest du mit der Suche.</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function KopfRaster({ kopf, w, hoco }) {
  const felder = [["HOCO Nr.", hoco], ["Artikel", kopf.bezeichnung], ["Zeichnung", kopf.zeichnung], ["Index", kopf.index], ["Material", w.kopf.material],
    ["Bestellte Menge", w.kopf.menge ? alt.zahlText(Number(w.kopf.menge) || 0) : ""], ["Allg. Toleranz", kopf.alltol]];
  return (
    <div className="pb-kopf">
      {felder.filter(([, v]) => v).map(([n, v]) => <div key={n}><small>{n}</small><b>{v}</b></div>)}
    </div>
  );
}

// ---------- Vorlage aus dem Excel der letzten Produktion (seit 1.823.0, seit
// 1.872.0 gleich bearbeitbar, Wunsch Patrick 26. November 2026: „will nicht auf
// prüfmasse drücken müssen, soll alles gleich bearbeitbar sein … soll einfach
// gespeichert werden können … drucken … soll wie beim Excel Prüfbericht heissen“).
// Das Masse-Blatt geht gleich auf, Speichern legt die Masse in die Stammdaten. ----------
function VorlageLeer({ v, zurueck }) {
  const [st, setSt] = useState({ laedt: true });
  const [stamm, setStamm] = useState(undefined);
  const [w, setW0] = useState(null);
  const [geaendert, setGeaendert] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const neuFokus = useRef(null);
  const setW = (f) => { setW0(f); setGeaendert(true); };
  useEffect(() => {
    let weg = false;
    Promise.all([vorlageLaden(v.dateien), stammLaden(v.hoco).catch(() => null)]).then(([x, s]) => {
      if (weg) return;
      const zeilen = [];
      for (const z of (x.zeilen || [])) zeilen.push({ ...z, id: z.id || zeilenId(zeilen, z) });
      const kopf = { ...((s && s.kopf) || {}), ...(x.kopf || {}) };
      kopf.index = (x.kopf || {}).index || v.idx || kopf.index || "";
      setStamm(s); setSt({ v: x }); setW0({ zeilen, kopf }); setGeaendert(true);
    }, (f) => { if (!weg) setSt({ fehler: fehlerText(f) }); });
    return () => { weg = true; };
  }, [v]);
  const vor = st.v;
  const teilweise = (vor && vor.teilweise) || [];
  const hatMasse = !!(stamm && (stamm.zeilen || []).length);
  const idx = (w && w.kopf && w.kopf.index) || v.idx || "";
  const titel = "Prüfbericht" + (idx ? " · Index " + idx : "");

  const zeileSetzen = (id, n, val) => setW((x) => ({ ...x, zeilen: x.zeilen.map((z) => (z.id === id ? { ...z, [n]: val } : z)) }));
  const zeileWeg = (id) => setW((x) => ({ ...x, zeilen: x.zeilen.filter((z) => z.id !== id) }));
  const zeilenLeeren = (ids) => setW((x) => ({ ...x, zeilen: x.zeilen.map((z) => (!ids.has(z.id) ? z : "abschnitt" in z ? { ...z, abschnitt: "" } : { ...z, nr: "", soll: "", pm: "", ll: false })) }));
  const zeilenWeg = (ids) => setW((x) => ({ ...x, zeilen: x.zeilen.filter((z) => !ids.has(z.id)) }));
  const zeileDazu = (abschnitt, bei) => setW((x) => {
    const nrn = x.zeilen.map((z) => parseInt(z.nr, 10)).filter((n) => !isNaN(n));
    const z = abschnitt ? { abschnitt: "Neuer Abschnitt" } : { nr: String((nrn.length ? Math.max(...nrn) : 0) + 1), soll: "", pm: "" };
    const neu = { ...z, id: zeilenId(x.zeilen, z) };
    const l = [...x.zeilen]; l.splice(bei == null ? l.length : bei, 0, neu);
    neuFokus.current = neu.id;
    return { ...x, zeilen: l };
  });
  const schieben = (i, d) => setW((x) => { const z = [...x.zeilen]; const j = i + d; if (j < 0 || j >= z.length) return x; [z[i], z[j]] = [z[j], z[i]]; return { ...x, zeilen: z }; });

  // Speichern: die Masse kommen in die Stammdaten der HOCO Nr.; danach nehmen
  // Erstteilprüfung und Endkontrolle sie von dort.
  const speichern = async () => {
    if (!w || laeuft) return;
    if (hatMasse && !stamm.__bestaetigt) {
      const ok = await alt.nachfragen({ titel: "Masse ersetzen?", text: "Für " + v.hoco + " stehen schon " + stamm.zeilen.length + " Masse in den Stammdaten. Speichern ersetzt sie durch dieses Blatt.", bestaetigen: "Ersetzen" });
      if (!ok) return;
    }
    setLaeuft(true);
    try {
      const arten = stamm && (stamm.arten || []).length ? stamm.arten : ["erstteil", "endkontrolle"];
      const kopf = await kopfInStammdaten(v.hoco, w.kopf);
      await stammSpeichern(v.hoco, { arten, aql: stamm ? stamm.aql ?? null : null, niveau: stamm ? stamm.niveau || null : null,
        zeilen: w.zeilen.map((z) => ({ ...z })), kopf });
      const s = await stammLaden(v.hoco).catch(() => null);
      if (s) s.__bestaetigt = true;
      setStamm(s); setGeaendert(false);
      alt.meldung("Gespeichert: " + w.zeilen.filter((z) => z.soll).length + " Masse in den Stammdaten von " + v.hoco + ".", "gut");
    } catch (f) { alt.meldung(fehlerText(f), "fehler"); }
    setLaeuft(false);
  };

  const drucken = async () => {
    if (!w) return;
    const k = w.kopf || {};
    const kf = [["HOCO Nr.", v.hoco], ["Artikel", k.bezeichnung], ["Zeichnung", k.zeichnung], ["Index", k.index], ["Allg. Toleranz", k.alltol]]
      .filter(([, x]) => x).map(([n, x]) => "<div><small>" + h(n) + "</small><b>" + h(x) + "</b></div>").join("");
    const sp = TEILE + 4;
    const reihen = w.zeilen.map((z) => ("abschnitt" in z)
      ? "<tr class='ab'><td colspan='" + sp + "'>" + h(z.abschnitt) + "</td></tr>"
      : "<tr><td>" + h(z.nr) + "</td><td>" + sollHtml(z) + "</td><td>" + h(toleranzText(tolVon(z))) + "</td>" + "<td></td>".repeat(TEILE) + "<td>" + h(z.pm) + "</td></tr>").join("");
    const html = "<style>" + STIL + "</style><style>.pbp{font-family:Arial,sans-serif;color:#111;font-size:10pt}.pbp h1{font-size:15pt;margin:0 0 6px;color:#003884}.pbp .pbp-kf{display:grid;grid-template-columns:repeat(4,1fr);gap:3px 12px;margin-bottom:8px}.pbp .pbp-kf small{color:#666;display:block;font-size:8pt}.pbp table{width:100%;border-collapse:collapse}.pbp th,.pbp td{border:1px solid #999;padding:2px 4px;text-align:left;font-size:9pt;height:7mm}.pbp th{background:#e8eef6}.pbp tr.ab td{background:#f3f3f3;font-weight:700}</style>"
      + briefkopf() + "<div class='inhalt pbp'><h1>" + h(titel) + "</h1><div class='pbp-kf'>" + kf + "</div><table><thead><tr><th>Nr.</th><th>Soll</th><th>Toleranz</th>"
      + [...Array(TEILE)].map((_, i) => "<th>Teil " + (i + 1) + "</th>").join("") + "<th>Prüfmittel/Hinweis</th></tr></thead><tbody>" + reihen + "</tbody></table></div>";
    try {
      const { blattPdf } = await import("./achtdPdf.js");
      const blob = await blattPdf(html, titel);
      alt.betrachter(URL.createObjectURL(blob), "Prüfbericht " + v.hoco + (idx ? " Index " + idx : "") + ".pdf", true);
    } catch (f) { alt.meldung("Drucken ging nicht: " + fehlerText(f), "fehler"); }
  };

  if (!w) return (
    <div className="pb pb-blattseite" data-pbvorlage={v.hoco}>
      <div className="pb-kopfzeile pb-werkzeug">
        <button type="button" className="knopf knopf--klein" data-esc-zurueck onClick={zurueck}>← Prüfberichte</button>
      </div>
      {st.laedt ? <p className="klein">Vorlage wird gelesen …</p> : null}
      {st.fehler ? <p className="pb-rot" id="pb-vorlage-fehler">⚠ Datei konnte nicht gelesen werden: {st.fehler}</p> : null}
    </div>
  );
  const extra = (
    <>
      <ZeichnungKnopf hoco={v.hoco} />
      <button type="button" className="knopf knopf--klein" id="pb-vorlage-drucken" onClick={drucken}>Drucken</button>
      {teilweise.length ? <span className="pb-rot klein" id="pb-vorlage-teilweise">⚠ Zum Teil nicht lesbar: {teilweise.join("; ")}. Fehlende Masse direkt im Blatt ergänzen.</span> : null}
      <span className="klein" id="pb-vorlage-stand">{hatMasse && !geaendert ? "✓ In den Stammdaten gespeichert" : hatMasse ? "In den Stammdaten stehen " + stamm.zeilen.length + " Zeilen" : "Noch nicht in den Stammdaten"}</span>
    </>
  );
  return (
    <div className="pb" data-pbvorlage={v.hoco}>
      {createPortal(<MasseBlatt w={w} hoco={v.hoco} schreibt={darf()} kopfSetzen={(k, x) => setW((y) => ({ ...y, kopf: { ...y.kopf, [k]: x } }))} zeileSetzen={zeileSetzen} zeileWeg={zeileWeg} zeilenLeeren={zeilenLeeren}
        zeilenWeg={zeilenWeg} zeileDazu={zeileDazu} schieben={schieben} neuFokus={neuFokus} geaendert={geaendert} laeuft={laeuft}
        speichern={speichern} zu={zurueck} titel={titel} label={"Prüfbericht " + v.hoco} weiterText={"Prüfbericht " + v.hoco + " · Fortsetzung"}
        extra={extra} zuText="Die Änderungen an der Vorlage sind noch nicht in den Stammdaten gespeichert." />, document.body)}
    </div>
  );
}

// ---------- Ein Protokoll, als A4-Blatt ----------
function Protokoll({ p, zurueck }) {
  const hoco = p.hoco_nr;
  const [w, setW] = useState(() => ({ ...p, kopf: { ...(p.kopf || {}) }, werte: { ...(p.werte || {}) } }));
  const [stand, setStand] = useState("");
  const zu = !!w.abgeschlossen_am;
  const schreibt = darf() && !zu;
  const art = w.kopf.art || "erstteil";
  const zeilen = w.kopf.zeilen || [];
  const timer = useRef(null);
  const letzt = useRef(w);
  letzt.current = w;
  // Ältere Protokolle ohne Material holen es einmal aus dem Auftrag
  useEffect(() => {
    if (w.kopf.material || !w.job_id) return;
    let weg = false;
    alt.db.from("jobs").select("material_bez, material_dm").eq("id", w.job_id).maybeSingle().then(({ data }) => {
      const mat = materialText(data);
      if (!weg && mat) setW((x) => ({ ...x, kopf: { ...x.kopf, material: mat } }));
    }, () => {});
    return () => { weg = true; };
  }, [w.job_id]);

  const speichern = async (x) => {
    setStand("Speichert …");
    const { error } = await alt.db.from("pruefprotokolle").update({
      fa_nr: x.fa_nr || null, kopf: x.kopf, werte: x.werte, datum: x.datum || null, visum: x.visum || null,
      bemerkung: x.bemerkung || null, entscheid: x.entscheid || null, abgeschlossen_am: x.abgeschlossen_am || null,
    }).eq("id", x.id);
    setStand(error ? "Nicht gespeichert: " + fehlerText(error) : "Gespeichert");
    return !error;
  };
  // Speichert von selbst 0.8 s nach der letzten Eingabe
  const aendern = (f) => {
    setW((x) => { const n = f(x); clearTimeout(timer.current); timer.current = setTimeout(() => speichern(n), 800); return n; });
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); speichern(letzt.current); } }, []);
  const kopfSetzen = (n, v) => aendern((x) => ({ ...x, kopf: { ...x.kopf, [n]: v } }));
  const setzen = (n, v) => aendern((x) => ({ ...x, [n]: v }));

  const abschliessen = async () => {
    const e = auswerten(w);
    if (!w.entscheid) { alt.meldung("Bitte zuerst den Prüf-Entscheid wählen.", "warn"); return; }
    if (!w.visum) { alt.meldung("Bitte das Visum eintragen.", "warn"); return; }
    // Nicht jedes Mass ist bei jeder Prüfung dran (z. B. nach Eloxieren oder
    // Schleifen erst bei Zwischen- oder Endkontrolle): leere Felder sind
    // nur bei AQL und der echten Endkontrolle eine Frage wert, nie bei der
    // Zwischenkontrolle (seit 1.887.2, Wunsch Patrick: „erst bei end“)
    if (e.offen && (art === "aql" || (art === "endkontrolle" && !istZwischen(w.kopf)))) {
      const ok = await alt.nachfragen({ titel: "Noch leere Felder", text: e.offen + " Felder sind noch leer. Trotzdem abschliessen?", bestaetigen: "Abschliessen" });
      if (!ok) return;
    }
    clearTimeout(timer.current); timer.current = null;
    const n = { ...w, abgeschlossen_am: new Date().toISOString() };
    if (!(await speichern(n))) return;
    setW(n);
    // Erstteil mit Freigabe stellt den Auftrag auf „läuft“ (seit 1.785.0,
    // Wunsch Patrick 24. November 2026), nur den Auftrag dieses Protokolls
    if (art === "erstteil" && n.entscheid === "freigabe" && n.job_id) {
      // Erst nach erledigter Erstteilprüfung ist geprüft, dass die richtigen
      // Lehren da sind: dann ausbuchen, vor „läuft“, damit die Tage gleich zählen
      // (seit 1.828.0, Wunsch Patrick 25. November 2026)
      await ausbuchen(n, hoco);
      try {
        const { data: j } = await alt.db.from("jobs").select("*").eq("id", n.job_id).maybeSingle();
        if (j && j.plan_status !== "laeuft" && j.plan_status !== "fertig" && !j.ended_at) {
          const r = await alt.zustandSetzen(j, "laeuft");
          alt.meldung("Erstteil freigegeben, " + j.job_number + " läuft." + (r && r.hinweis ? " " + r.hinweis : ""), "gut");
          return;
        }
      } catch (f) { alt.meldung("Protokoll abgeschlossen, aber „läuft“ ging nicht: " + fehlerText(f), "warn"); return; }
    }
    alt.meldung("Protokoll abgeschlossen", "gut");
  };
  const wiederOeffnen = async () => {
    const n = { ...w, abgeschlossen_am: null };
    if (await speichern(n)) setW(n);
  };
  const loeschen = async () => {
    clearTimeout(timer.current); timer.current = null;
    if (await protokollLoeschen(w)) zurueck();
  };
  const dateiName = () => ("Prüfprotokoll " + hoco + " " + artName(w.kopf).kurz + (w.fa_nr ? " FA " + w.fa_nr : "") + " " + (w.datum || "") + ".pdf").replace(/[\\/:*?"<>|]/g, "");
  const pdfMachen = async () => {
    const { blattPdf } = await import("./achtdPdf.js");
    return blattPdf("<style>" + STIL + "</style>" + protokollHtml(w, hoco), "Prüfprotokoll " + hoco + " · " + artName(w.kopf).name);
  };
  // Drucken: PDF im Betrachter der App, dort mit seinem Knopf Drucken
  const drucken = async () => {
    try {
      setStand("Wird zum Drucken vorbereitet …");
      const blob = await pdfMachen();
      setStand("");
      alt.betrachter(URL.createObjectURL(blob), dateiName(), true);
    } catch (f) { setStand(""); alt.meldung("Drucken ging nicht: " + fehlerText(f), "fehler"); }
  };

  const e = auswerten(w);
  // Erstteil: zuerst die Checkliste quittieren, dann das Protokoll (seit 1.785.0).
  // Ältere Protokolle mit schon eingetragenen Werten brauchen sie nicht.
  const braucheCheck = art === "erstteil" && !zu && !(w.kopf.checkliste || {}).am && !(e.gut + e.schlecht);
  if (braucheCheck) return <Checkliste w={w} hoco={hoco} schreibt={schreibt} zurueck={zurueck}
    quittieren={(c) => { const n = { ...w, kopf: { ...w.kopf, checkliste: c } }; setW(n); speichern(n); }}
    kopfNeu={(k) => { const n = { ...w, kopf: { ...w.kopf, ...k } }; setW(n); speichern(n); }} />;
  return (
    <div className="pb pb-blattseite" data-pbprotokolloffen={w.id}>
      <div className="pb-kopfzeile pb-werkzeug">
        <button type="button" className="knopf knopf--klein" data-esc-zurueck onClick={zurueck}>← Prüfberichte</button>
        <span className="klein" id="pb-stand">{stand}</span>
        <span className="pst-platz" />
        <button type="button" className="knopf knopf--klein" onClick={() => stammdatenOeffnen(hoco)}>Stammdaten</button>
        <ZeichnungKnopf hoco={hoco} />
        <button type="button" className="knopf knopf--klein" id="pb-drucken" onClick={drucken}>🖨 Drucken</button>
        {darf() ? <button type="button" className="knopf knopf--klein knopf--gefahr-leise" id="pb-loeschen" onClick={loeschen}>Löschen</button> : null}
      </div>

      <div className="pb-blatt hell-bleibt" id="pb-blatt">
        <div className="rkpdf pb-briefkopf" dangerouslySetInnerHTML={{ __html: "<style>" + STIL + "</style>" + briefkopf() }} />
        <h2 className="pb-blatt__titel">Prüfprotokoll</h2>
        {art === "endkontrolle" ? (
          <div className="pb-kontrolle" id="pb-kontrolle">
            <b>Art der Kontrolle</b>
            {[["end", "Endkontrolle"], ["zwischen", "Zwischenkontrolle"]].map(([id, n]) => {
              const an = (w.kopf.kontrolle || "end") === id;
              return <label key={id} className={"pb-wahl" + (an ? " pb-wahl--an" : "")} data-pbkontrolle={id}>
                <input type="radio" name="pb-kontrolle" checked={an} disabled={!schreibt} onChange={() => kopfSetzen("kontrolle", id === "end" ? null : id)} /> {n}
              </label>;
            })}
          </div>) : null}
        <KopfRaster kopf={w.kopf.vorlage || {}} w={w} hoco={hoco} />
        <div className="pb-felder">
          <label className={!String(w.fa_nr || "").trim() ? "pb-pflicht" : ""}>FA Nr.<input value={w.fa_nr || ""} disabled={!schreibt} onChange={(x) => setzen("fa_nr", x.target.value)} /></label>
          {art === "aql" ? <AqlKopf k={w.kopf} schreibt={schreibt} setzen={kopfSetzen} werte={w.werte} /> : null}
          <label className="pb-felder__rechts">Maschine<MaschineWahl wert={w.kopf.maschine || ""} schreibt={schreibt} setzen={(v) => kopfSetzen("maschine", v)} /></label>
        </div>

        {art === "aql" ? <AqlTabelle zeilen={zeilen} w={w} schreibt={schreibt} aendern={aendern} />
          : art === "ll" ? <LlTabelle zeilen={zeilen} w={w} schreibt={schreibt} aendern={aendern} />
          : <TeileTabelle zeilen={zeilen} w={w} schreibt={schreibt} aendern={aendern} />}

        <div className="pb-ende">
          <div className="pb-entscheid">
            <b>Prüf-Entscheid</b>
            {ENTSCHEIDE.map(([id, n]) => (
              <label key={id} className={"pb-wahl" + (w.entscheid === id ? " pb-wahl--an" : "")}>
                <input type="radio" name="pb-entscheid" checked={w.entscheid === id} disabled={!schreibt} onChange={() => setzen("entscheid", id)} /> {n}
              </label>
            ))}
          </div>
          <label className="pb-bemerkung">Bemerkung
            <textarea rows={2} value={w.bemerkung || ""} disabled={!schreibt} onChange={(x) => setzen("bemerkung", x.target.value)} />
          </label>
          <div className="pb-unterschrift">
            <label>Datum<input type="date" value={w.datum || ""} disabled={!schreibt} onChange={(x) => setzen("datum", x.target.value)} /></label>
            <label>Visum<input value={w.visum || ""} maxLength={6} disabled={!schreibt} onChange={(x) => setzen("visum", x.target.value.toUpperCase())} /></label>
          </div>
          {darf() ? (zu
            ? <button type="button" className="knopf" onClick={wiederOeffnen}>Wieder bearbeiten</button>
            : <button type="button" className="knopf knopf--haupt" id="pb-abschliessen" onClick={abschliessen}>Abschliessen</button>) : null}
          {zu ? <span className="klein">Abgeschlossen {zeitText(w.abgeschlossen_am)}</span> : null}
        </div>
      </div>
    </div>
  );
}

// Ein Ist-Feld mit Farbe gut/schlecht
// ---------- Checkliste vor der Erstteilprüfung ----------
// Sind die richtigen Sachen hervorgenommen? Punkte aus den Stammdaten
// (Zeichnung mit Index, Lehren und Messmittel der Masse), unten quittieren.
function checkPunkte(kopf) {
  const v = kopf.vorlage || {};
  // Seit 1.839.0 nur echte Prüfmittel (Lehren, Grenzlehrdorne, Gewinde), immer mit der
  // Nr. aus der Prüfmittelverwaltung; Messschieber und Beschriftungen der Masse wie
  // L2 oder Planfläche zählen nicht (Patrick 25. November 2026: „das sind alles keine
  // Prüfmittel … also immer mit Nr.“)
  const { lehren } = lehrenAus({ zeilen: masse(kopf.zeilen) });
  return [["zeichnung", "Zeichnung" + (v.zeichnung ? " " + v.zeichnung : "") + (v.index ? ", Index " + v.index : ""), "richtige Fassung bereit"]]
    .concat(lehren.map((l, i) => ["l" + i, l.name + (l.mass ? " " + l.mass : ""), "", l]))
    .concat([["sauber", "Prüfmittel sauber, Prüfdatum gültig", ""]]);
}

// Schrank seitenweise, die Datenbank gibt höchstens 1'000 auf einmal
async function schrankLaden() {
  const alle = [];
  for (let ab = 0; ab < 50000; ab += 1000) {
    const { data, error } = await alt.db.from("pruefmittel").select("*").eq("ort_art", "schrank").order("id").range(ab, ab + 999);
    if (error) break;
    alle.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: alle };
}

// Nach erledigter Erstteilprüfung (Freigabe) die Lehren aus dem Schrank auf den Auftrag ausbuchen
// (Wunsch Patrick 24. November 2026): sie zählen ab „läuft“ Einsatztage und
// kommen bei „fertig“ in die Rückgabekiste (Auslöser in sql/pruefmittel-rueckgabe.sql).
// Gebucht über die Funktionen aus sql/pruefmittel-ausbuchen-alle.sql, damit es für alle
// geht, die das Protokoll abschliessen dürfen; ohne sie (alter Stand) nur Admins direkt.
async function ausbuchen(w, hoco) {
  try {
    if (!w.job_id) return;
    const { lehren } = lehrenAus({ zeilen: masse(w.kopf.zeilen) });
    if (!lehren.length) return;
    // seit 1.838.0 aus allen Prüfmitteln der Verwaltung, nur was im Schrank und aktiv ist
    const { error: fs } = await alt.db.rpc("pruefmittel_schrank_lesen");
    const ohneRpc = !!fs;
    if (ohneRpc && !alt.istAdmin()) return;
    // Seit 1.891.0 auch gesperrte (Wunsch Patrick 27. November 2026: „wird jetzt ausgebucht,
    // muss aber bald zur Kontrolle“). Zuerst wird ein gutes Mittel gesucht; nur wenn keines
    // passt, ein gesperrtes oder fälliges, und dann kommt die Meldung.
    let pm = (await pruefmittelAlleLaden()).filter((p) => (!p.ort_art || p.ort_art === "schrank") && ["aktiv", "gesperrt"].includes(p.status || "aktiv"));
    if (!pm.length && ohneRpc) pm = (await schrankLaden()).data.filter((p) => (p.status || "aktiv") !== "weg");
    if (!pm || !pm.length) return;
    // Prüfdaten (Intervall, letzte Prüfung) für alle lesbar über sql/pruefmittel-ausbuchen-gesperrt.sql
    const { data: stand } = await alt.db.rpc("pruefmittel_pruefstand_lesen");
    const standVon = new Map((stand || []).map((x) => [x.id, x]));
    pm = pm.map((p) => ({ ...p, ...(standVon.get(p.id) || {}), id: p.id }));
    const schlecht = (p) => (p.status || "aktiv") === "gesperrt" || istFaellig({ ...p, status: "aktiv" });
    const gut = pm.filter((p) => !schlecht(p));
    // für die Suche gelten gesperrte als aktiv, sonst übergeht pruefmittelFuer sie
    const rest = pm.filter(schlecht).map((p) => ({ ...p, status: "aktiv", _vorher: p.status || "aktiv" }));
    const ids = new Set();
    const kritisch = [];
    lehren.forEach((l) => {
      let x = pruefmittelFuer(l, gut.filter((p) => !ids.has(p.id)), hoco)[0];
      if (!x) { x = pruefmittelFuer(l, rest.filter((p) => !ids.has(p.id)), hoco)[0]; if (x) kritisch.push(x); }
      if (x) ids.add(x.id);
    });
    if (!ids.size) return;
    const liste = [...ids];
    const vorher = [];
    if (alt.istAdmin()) for (const id of liste) vorher.push(...await alt.rueckSichern("pruefmittel", { id }));
    let n = 0;
    if (!ohneRpc) {
      const { data, error } = await alt.db.rpc("pruefmittel_ausbuchen", { p_job: w.job_id, p_ids: liste });
      if (error) return;
      n = Number(data) || 0;
    } else {
      const { data: job } = await alt.db.from("jobs").select("id, machine_id, plan_status").eq("id", w.job_id).maybeSingle();
      if (!job || !job.machine_id) return;
      const neu = { ort_art: "maschine", machine_id: job.machine_id, job_id: job.id };
      if (job.plan_status === "laeuft") neu.zaehlt_seit = new Date().toISOString();
      const { error } = await alt.db.from("pruefmittel").update(neu).in("id", liste);
      if (error) return;
      n = liste.length;
    }
    if (!n) return;
    if (vorher.length) alt.merkeSchritt(n + " Prüfmittel ausgebucht", alt.rueckRein("pruefmittel", vorher));
    alt.meldung(n + " Prüfmittel auf den Auftrag ausgebucht.", "gut");
    if (kritisch.length) {
      const namen = kritisch.map((p) => (p.nr ? p.nr + " " : "") + (p.bezeichnung || "") + (p._vorher === "gesperrt" ? " (gesperrt)" : " (fällig)")).join(", ");
      alt.meldung("Wird jetzt ausgebucht, muss aber bald zur Kontrolle: " + namen, "warn");
    }
  } catch (e) { /* still: ohne Prüfmittel geht es weiter */ }
}

function Checkliste({ w, hoco, schreibt, zurueck, quittieren, kopfNeu }) {
  const punkte = useMemo(() => checkPunkte(w.kopf), [w.kopf]);
  const [haken, setHaken] = useState({});
  // Anpassen (Wunsch Patrick 27. November 2026: „wenn die Liste mit Prüfmittel nicht stimmt,
  // soll Anpassen kommen, dann der Bericht, man fügt was hinzu und checkt nochmals die Liste“):
  // öffnet die Masse der Stammdaten; beim Zurückkommen werden Masse und Kopf neu übernommen
  // und alle Haken zurückgesetzt, damit die Liste nochmals geprüft wird.
  const [anpassen, setAnpassen] = useState(false);
  const fertigAngepasst = async () => {
    setAnpassen(false);
    try {
      const st = await stammMitMassen(hoco);
      if (st && (st.zeilen || []).length) kopfNeu({ zeilen: st.zeilen, vorlage: st.kopf || {} });
    } catch (f) { alt.meldung("Masse konnten nicht neu gelesen werden: " + fehlerText(f), "warn"); }
    setHaken({});
  };
  const alle = punkte.every(([id]) => haken[id]);
  // Welches Prüfmittel der Verwaltung passt zu jeder Lehre? (seit 1.838.0, Wunsch Patrick:
  // „das nr vom prüfmittel dort auch steht … es soll das mittel selber suchen“)
  const [pm, setPm] = useState(null);
  useEffect(() => { let weg = false; pruefmittelAlleLaden().then((l) => { if (!weg) setPm(l); }); return () => { weg = true; }; }, []);
  const pmText = (l) => {
    if (!l || !pm) return null;
    if (!pm.length) return null;
    const t = pruefmittelFuer(l, pm, hoco);
    if (!t.length) return <small className="pb-pm-fehlt" data-pbpm="">nicht in der Prüfmittelverwaltung</small>;
    return <small className="pb-pm-ok" data-pbpm={t[0].nr || ""}>
      {t.slice(0, 3).map((p) => "Prüfmittel " + (p.nr || p.bezeichnung) + " · " + pmOrtText(p)).join(" / ")}
      {t.length > 3 ? " … (" + t.length + ")" : ""}</small>;
  };
  if (anpassen) return <Pruefung hoco={hoco} modus="qs" darf={schreibt} zurueck={fertigAngepasst} zurueckText="← Zurück zur Checkliste" />;
  return (
    <div className="pb pb-blattseite" data-pbcheckliste={w.id}>
      <div className="pb-kopfzeile pb-werkzeug">
        <button type="button" className="knopf knopf--klein" data-esc-zurueck onClick={zurueck}>← Prüfberichte</button>
        <span className="pst-platz" />
        <ZeichnungKnopf hoco={hoco} />
        <button type="button" className="knopf knopf--klein" onClick={() => stammdatenOeffnen(hoco)}>Stammdaten</button>
      </div>
      <div className="pb-check karte">
        <h2>Erstteilprüfung {hoco}{w.fa_nr ? " · FA " + w.fa_nr : ""}</h2>
        <p className="klein">Zuerst prüfen, ob alles Richtige hervorgenommen ist. Danach kommt das Protokoll.</p>
        <ul className="pb-check__liste">
          {punkte.map(([id, text, unter, lehre]) => (
            <li key={id}>
              <label className={haken[id] ? "pb-check--an" : ""}>
                <input type="checkbox" data-pbcheck={id} checked={!!haken[id]} disabled={!schreibt}
                  onChange={(x) => setHaken((h) => ({ ...h, [id]: x.target.checked }))} />
                <span><b>{text}</b>{unter ? <small>{unter}</small> : null}{pmText(lehre)}</span>
              </label>
            </li>
          ))}
        </ul>
        {schreibt ? (
          <div className="pb-check__fuss">
            <button type="button" className="knopf" id="pb-check-anpassen" title="Masse und Prüfmittel in den Stammdaten ergänzen, danach die Liste nochmals prüfen" onClick={() => setAnpassen(true)}>Anpassen</button>
            <button type="button" className="knopf" onClick={() => setHaken(Object.fromEntries(punkte.map(([id]) => [id, true])))}>Alle abhaken</button>
            <button type="button" className="knopf knopf--haupt" id="pb-check-quittieren" disabled={!alle}
              onClick={() => quittieren({ am: new Date().toISOString(), punkte: punkte.map(([id, t]) => t) })}>✓ Quittieren, weiter zum Protokoll</button>
          </div>
        ) : <p className="klein">Nur mit Schreibrecht.</p>}
      </div>
    </div>
  );
}

function IstFeld({ wert, t, an, setzen, name }) {
  const e = istPruefen(wert, t);
  return <input className={"pb-ist" + (e ? " pb-ist--" + e : "")} value={wert || ""} disabled={!an} data-pbist={name}
    inputMode="decimal" onChange={(x) => setzen(x.target.value)} />;
}

function SollZelle({ z }) {
  const t = tolVon(z);
  return <><td className="pb-nr">{z.nr}</td><td className="pb-soll" title={t ? "Toleranz " + toleranzText(t) : ""}>{bildVon(z) ? <img className="pb-massbild" src={bildVon(z)} alt="" data-pbbild /> : null}<Gdt t={z.soll} /></td></>;
}

// Form- und Lagetoleranzen in eigener Symbolschrift, damit alle gleich gross und lesbar sind
function Gdt({ t }) {
  const p = gdtTeile(t);
  return typeof p === "string" ? p : p.map((x) => (typeof x === "string" ? x : <span className="gdt" key={x.k}>{x.gdt}</span>));
}

// Erstteilprüfung / Endkontrolle: 5 Teile, alle Masse
function TeileTabelle({ zeilen, w, schreibt, aendern }) {
  const setze = (id, i, v) => aendern((x) => {
    const a = [...(x.werte[id] || [])]; a[i] = v;
    return { ...x, werte: { ...x.werte, [id]: a } };
  });
  return (
    <div className="pb-tabelle-huelle">
      <table className="pb-tabelle pb-tabelle--fest" id="pb-tabelle">
        <colgroup><col className="pb-c-nr" /><col className="pb-c-soll" />{[...Array(TEILE)].map((_, i) => <col key={i} />)}<col className="pb-c-pm" /></colgroup>
        <thead><tr><th>Nr.</th><th>Soll</th>{[...Array(TEILE)].map((_, i) => <th key={i}>Teil {i + 1}</th>)}<th>Prüfmittel</th></tr></thead>
        <tbody>
          {zeilen.map((z) => z.abschnitt
            ? <tr key={z.id} className="pb-abschnitt"><td colSpan={TEILE + 3}>{z.abschnitt}</td></tr>
            : (
              <tr key={z.id}>
                <SollZelle z={z} />
                {[...Array(TEILE)].map((_, i) => <td key={i}><IstFeld wert={(w.werte[z.id] || [])[i]} t={tolVon(z)} an={schreibt} name={z.id + "-" + i} setzen={(v) => setze(z.id, i, v)} /></td>)}
                <td className="pb-pm">{z.pm}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// AQL: Losgrösse, AQL und Prüfniveau ergeben Stichprobe und Annahmezahl
function AqlKopf({ k, schreibt, setzen, werte }) {
  const { plan, ueber } = aqlStand(k, werte);
  return (
    <>
      <label>Losgrösse<input inputMode="numeric" value={k.los || ""} disabled={!schreibt} onChange={(x) => setzen("los", x.target.value.replace(/\D/g, ""))} /></label>
      <label>AQL<select value={String(k.aql ?? 1)} disabled={!schreibt} onChange={(x) => setzen("aql", Number(x.target.value))}>
        {AQL_WERTE.map((a) => <option key={a} value={String(a)}>{a}</option>)}</select></label>
      <label>Prüfniveau<select value={k.niveau || "II"} disabled={!schreibt} onChange={(x) => setzen("niveau", x.target.value)}>
        {["I", "II", "III"].map((a) => <option key={a}>{a}</option>)}</select></label>
      <div className="pb-aql" id="pb-aql">
        {plan ? <>
          <b>Stichprobe {alt.zahlText(plan.n)} Stück</b>{plan.hundert ? " (ganzes Los)" : ""} · Kennbuchstabe {plan.buchstabe} ·
          annehmen bis {plan.ac}, zurückweisen ab {plan.re} n.i.O. je Merkmal
          {ueber.length ? <div className="pb-rot">Zurückweisen: Nr. {ueber.map((z) => z.nr).join(", ")}</div> : null}
        </> : <span className="klein">Losgrösse eintragen</span>}
      </div>
    </>
  );
}

function AqlTabelle({ zeilen, w, schreibt, aendern }) {
  const plan = aqlPlan(w.kopf.los, w.kopf.aql, w.kopf.niveau);
  const setze = (id, n, v) => aendern((x) => ({ ...x, werte: { ...x.werte, [id]: { ...(x.werte[id] || {}), [n]: v } } }));
  return (
    <div className="pb-tabelle-huelle">
      <table className="pb-tabelle pb-tabelle--fest" id="pb-tabelle">
        <colgroup><col className="pb-c-nr" /><col className="pb-c-soll" /><col /><col /><col /><col /><col className="pb-c-pm" /></colgroup>
        <thead><tr><th>Nr.</th><th>Soll</th><th>Geprüft</th><th>davon n.i.O.</th><th>Min. gemessen</th><th>Max. gemessen</th><th>Prüfmittel</th></tr></thead>
        <tbody>
          {zeilen.map((z) => {
            if (z.abschnitt) return <tr key={z.id} className="pb-abschnitt"><td colSpan={7}>{z.abschnitt}</td></tr>;
            const v = w.werte[z.id] || {}, t = tolVon(z);
            const nio = Number(v.nio) || 0;
            return (
              <tr key={z.id} className={plan && nio > plan.ac ? "pb-zeile--rot" : ""}>
                <SollZelle z={z} />
                <td><input className="pb-ist" inputMode="numeric" disabled={!schreibt} value={v.geprueft ?? ""} placeholder={plan ? String(plan.n) : ""} onChange={(x) => setze(z.id, "geprueft", x.target.value.replace(/\D/g, ""))} /></td>
                <td><input className={"pb-ist" + (v.nio === undefined || v.nio === "" ? "" : nio > 0 ? " pb-ist--schlecht" : " pb-ist--gut")} data-pbnio={z.id} inputMode="numeric" disabled={!schreibt} value={v.nio ?? ""} onChange={(x) => setze(z.id, "nio", x.target.value.replace(/\D/g, ""))} /></td>
                <td><IstFeld wert={v.min} t={t} an={schreibt} name={z.id + "-min"} setzen={(x) => setze(z.id, "min", x)} /></td>
                <td><IstFeld wert={v.max} t={t} an={schreibt} name={z.id + "-max"} setzen={(x) => setze(z.id, "max", x)} /></td>
                <td className="pb-pm">{z.pm}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// LL Langläufer: ausgewählte Masse, eine Spalte je Stichprobe
function LlTabelle({ zeilen, w, schreibt, aendern }) {
  const auswahl = new Set(w.kopf.auswahl || []);
  const [waehlt, setWaehlt] = useState(!auswahl.size);
  const proben = w.werte.proben || [];
  const umschalten = (id) => aendern((x) => {
    const s = new Set(x.kopf.auswahl || []);
    if (s.has(id)) s.delete(id); else s.add(id);
    return { ...x, kopf: { ...x.kopf, auswahl: zeilen.filter((z) => s.has(z.id)).map((z) => z.id) } };
  });
  const probeNeu = () => aendern((x) => {
    const jetzt = new Date();
    const pr = { id: Math.random().toString(36).slice(2, 9), datum: alt.isoDatum(jetzt), zeit: String(jetzt.getHours()).padStart(2, "0") + ":" + String(jetzt.getMinutes()).padStart(2, "0"), visum: x.visum || "", w: {} };
    return { ...x, werte: { ...x.werte, proben: [...(x.werte.proben || []), pr] } };
  });
  const probeSetzen = (pid, f) => aendern((x) => ({ ...x, werte: { ...x.werte, proben: (x.werte.proben || []).map((p) => (p.id === pid ? f(p) : p)) } }));
  const probeWeg = async (pid) => {
    const ok = await alt.nachfragen({ titel: "Stichprobe löschen", text: "Diese Stichprobe wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (ok) aendern((x) => ({ ...x, werte: { ...x.werte, proben: (x.werte.proben || []).filter((p) => p.id !== pid) } }));
  };

  if (waehlt) {
    return (
      <section className="pb-karte" id="pb-ll-wahl">
        <h3>Wichtige Masse für die Langläufer-Liste wählen</h3>
        <p className="klein">Nur die angehakten Masse kommen auf die Liste. Das nächste LL-Protokoll dieser HOCO Nr. übernimmt die Wahl.</p>
        <div className="pb-ll-masse">
          {masse(zeilen).map((z) => (
            <label key={z.id} className={"pb-wahl" + (auswahl.has(z.id) ? " pb-wahl--an" : "")} data-pbll={z.id}>
              <input type="checkbox" checked={auswahl.has(z.id)} disabled={!schreibt} onChange={() => umschalten(z.id)} />
              <b>{z.nr}</b> <Gdt t={z.soll} /> <small>{z.pm}</small>
            </label>
          ))}
        </div>
        <button type="button" className="knopf knopf--haupt" id="pb-ll-fertig" disabled={!auswahl.size} onClick={() => setWaehlt(false)}>Fertig ({auswahl.size} Masse)</button>
      </section>
    );
  }
  const liste = zeilen.filter((z) => !z.abschnitt && auswahl.has(z.id));
  return (
    <div className="pb-tabelle-huelle">
      <div className="pb-kopfzeile">
        {schreibt ? <button type="button" className="knopf knopf--haupt" id="pb-ll-probe" onClick={probeNeu}>+ Stichprobe jetzt</button> : null}
        {schreibt ? <button type="button" className="knopf knopf--klein" onClick={() => setWaehlt(true)}>Masse wählen ({liste.length})</button> : null}
        <span className="klein">{proben.length} Stichproben</span>
      </div>
      <table className="pb-tabelle" id="pb-tabelle">
        <thead>
          <tr><th>Nr.</th><th>Soll</th>
            {proben.map((pr) => (
              <th key={pr.id} className="pb-probe">
                <input type="date" value={pr.datum} disabled={!schreibt} onChange={(x) => probeSetzen(pr.id, (p) => ({ ...p, datum: x.target.value }))} />
                <input value={pr.zeit || ""} disabled={!schreibt} placeholder="Zeit" onChange={(x) => probeSetzen(pr.id, (p) => ({ ...p, zeit: x.target.value }))} />
                {schreibt ? <button type="button" className="pb-weg" title="Stichprobe löschen" onClick={() => probeWeg(pr.id)}>✕</button> : null}
              </th>
            ))}
            <th>Prüfmittel</th></tr>
        </thead>
        <tbody>
          {liste.map((z) => (
            <tr key={z.id}>
              <SollZelle z={z} />
              {proben.map((pr) => <td key={pr.id}><IstFeld wert={(pr.w || {})[z.id]} t={tolVon(z)} an={schreibt} name={z.id + "-" + pr.id}
                setzen={(v) => probeSetzen(pr.id, (p) => ({ ...p, w: { ...(p.w || {}), [z.id]: v } }))} /></td>)}
              <td className="pb-pm">{z.pm}</td>
            </tr>
          ))}
          <tr className="pb-visum"><td colSpan={2}>Visum</td>
            {proben.map((pr) => <td key={pr.id}><input className="pb-ist" value={pr.visum || ""} maxLength={6} disabled={!schreibt}
              onChange={(x) => probeSetzen(pr.id, (p) => ({ ...p, visum: x.target.value.toUpperCase() }))} /></td>)}<td /></tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------- PDF mit dem Briefkopf ----------
// Soll im PDF, mit dem Bild des Masses aus dem alten Bericht oder von Hand
const sollHtml = (z) => (bildVon(z) ? '<img class="pb-massbild" style="max-height:12mm;max-width:45mm;display:block" src="' + h(bildVon(z)) + '" alt="">' : "") + gdtHtml(h(z.soll));
const h = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function protokollHtml(w, hoco) {
  const k = w.kopf || {}, art = k.art || "erstteil", v = k.vorlage || {};
  const zeilen = k.zeilen || [];
  const farbe = (wert, t) => { const e = istPruefen(wert, t); return e === "schlecht" ? " style='color:#c00;font-weight:700'" : ""; };
  let kopfZ, koerper;
  if (art === "aql") {
    const plan = aqlPlan(k.los, k.aql, k.niveau);
    kopfZ = "<th>Geprüft</th><th>n.i.O.</th><th>Min.</th><th>Max.</th>";
    koerper = zeilen.map((z) => {
      if (z.abschnitt) return "<tr class='ab'><td colspan='7'>" + h(z.abschnitt) + "</td></tr>";
      const x = w.werte[z.id] || {}, t = tolVon(z);
      return "<tr><td>" + h(z.nr) + "</td><td>" + sollHtml(z) + "</td><td>" + h(x.geprueft || (plan ? plan.n : "")) + "</td><td"
        + (Number(x.nio) > 0 ? " style='color:#c00;font-weight:700'" : "") + ">" + h(x.nio) + "</td><td" + farbe(x.min, t) + ">" + h(x.min) + "</td><td" + farbe(x.max, t) + ">" + h(x.max) + "</td><td>" + h(z.pm) + "</td></tr>";
    }).join("");
  } else if (art === "ll") {
    const aus = new Set(k.auswahl || []), proben = (w.werte || {}).proben || [];
    kopfZ = proben.map((p) => "<th>" + h(datumText(p.datum)) + "<br>" + h(p.zeit) + "</th>").join("");
    koerper = zeilen.filter((z) => !z.abschnitt && aus.has(z.id)).map((z) => {
      const t = tolVon(z);
      return "<tr><td>" + h(z.nr) + "</td><td>" + sollHtml(z) + "</td>"
        + proben.map((p) => "<td" + farbe((p.w || {})[z.id], t) + ">" + h((p.w || {})[z.id]) + "</td>").join("") + "<td>" + h(z.pm) + "</td></tr>";
    }).join("") + "<tr><td colspan='2'>Visum</td>" + proben.map((p) => "<td>" + h(p.visum) + "</td>").join("") + "<td></td></tr>";
  } else {
    kopfZ = [...Array(TEILE)].map((_, i) => "<th>Teil " + (i + 1) + "</th>").join("");
    koerper = zeilen.map((z) => {
      if (z.abschnitt) return "<tr class='ab'><td colspan='" + (TEILE + 3) + "'>" + h(z.abschnitt) + "</td></tr>";
      const t = tolVon(z), a = w.werte[z.id] || [];
      return "<tr><td>" + h(z.nr) + "</td><td>" + sollHtml(z) + "</td>"
        + [...Array(TEILE)].map((_, i) => "<td" + farbe(a[i], t) + ">" + h(a[i]) + "</td>").join("") + "<td>" + h(z.pm) + "</td></tr>";
    }).join("");
  }
  const plan = art === "aql" ? aqlPlan(k.los, k.aql, k.niveau) : null;
  const felder = [["HOCO Nr.", hoco], ["FA Nr.", w.fa_nr], ["Artikel", v.bezeichnung], ["Zeichnung", v.zeichnung], ["Index", v.index], ["Material", k.material],
    ["Allg. Toleranz", v.alltol], ["Automat", v.typ], ["Maschine", k.maschine || v.maschine]]
    .concat(plan ? [["Losgrösse", alt.zahlText(Number(k.los))], ["AQL / Niveau", k.aql + " / " + (k.niveau || "II")], ["Stichprobe", plan.n + " Stk, Ac " + plan.ac + " / Re " + plan.re]] : []);
  return "<style>"
    + ".pbp{font-family:Arial,sans-serif;color:#111;font-size:10pt}"
    + ".pbp h1{font-size:15pt;margin:0 0 6px;color:#003884}.pbp .pbp-kf{display:grid;grid-template-columns:repeat(4,1fr);gap:3px 12px;margin-bottom:8px}.pbp .pbp-kf small{color:#666;display:block;font-size:8pt}"
    + ".pbp table{width:100%;border-collapse:collapse}.pbp th,.pbp td{border:1px solid #999;padding:2px 4px;text-align:left;font-size:9pt}.pbp th{background:#e8eef6}.pbp tr.ab td{background:#f3f3f3;font-weight:700}"
    + ".pbp .pbp-fuss{display:flex;gap:24px;margin-top:10px}.pbp .pbp-fuss div{flex:1}</style>"
    + briefkopf() + "<div class='inhalt pbp'>"
    + "<h1>Prüfprotokoll</h1>"
    + "<div class='pbp-kf'>" + felder.filter(([, x]) => x).map(([n, x]) => "<div><small>" + h(n) + "</small>" + h(x) + "</div>").join("") + "</div>"
    + "<table><thead><tr><th>Nr.</th><th>Soll</th>" + kopfZ + "<th>Prüfmittel</th></tr></thead><tbody>" + koerper + "</tbody></table>"
    + "<div class='pbp-fuss'><div><b>Prüf-Entscheid:</b> " + h(entscheidText(w.entscheid)) + "</div><div><b>Datum:</b> " + h(datumText(w.datum)) + "</div><div><b>Visum:</b> " + h(w.visum) + "</div></div>"
    + (w.bemerkung ? "<p><b>Bemerkung:</b> " + h(w.bemerkung) + "</p>" : "") + "</div>";
}
