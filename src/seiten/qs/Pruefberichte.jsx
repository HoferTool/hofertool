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
import { useEffect, useMemo, useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { passtWoerter } from "../../teile/Suchfeld.jsx";
import { useSeitenSuche } from "../../teile/seitenSuche.js";
import { STIL, briefkopf } from "./achtdBlatt.js";
import {
  ARTEN, artVon, TEILE, AQL_WERTE, aqlPlan, fehltTabelle, protokolleLaden, dateienLaden, stammSpeichern,
  stammLaden, stammMitMassen, toleranz, toleranzText, istPruefen, lehrenAus, pruefmittelFuer,
} from "../../daten/pruefbericht.js";

// Offenes Protokoll und Suche bleiben beim Reiterwechsel
const pbZustand = { suche: "", protokoll: null, frisch: null };

const fehlerText = (f) => fehltTabelle(f)
  ? "Die Datenbank kennt die Prüfberichte noch nicht (sql/pruefberichte.sql oder sql/pruef-stamm.sql fehlt)."
  : alt.fehlertext ? alt.fehlertext(f) : String((f && f.message) || f);
const heute = () => alt.isoDatum(new Date());
const datumText = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "");
const zeitText = (d) => { if (!d) return ""; const x = new Date(d); return datumText(alt.isoDatum(x)) + " " + String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); };
const darf = () => alt.darfSchreiben() && !alt.istExtern();

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
    for (const pr of w.proben || []) for (const z of zeilen) if (aus.has(z.id)) zaehle((pr.w || {})[z.id], toleranz(z.soll));
  } else {
    for (const z of zeilen) { const t = toleranz(z.soll); for (let i = 0; i < TEILE; i++) zaehle((w[z.id] || [])[i], t); }
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

// Stammdaten der HOCO Nr. öffnen (Fenster HOCO Nr. beim Teil)
function stammdatenOeffnen(nr) {
  alt.prod.hocoOffen = nr;
  alt.prod.hocoSuche = nr;
  alt.hocoFenster();
}

// Gehört ein Protokoll zu diesem Auftrag? Über die Kennung, sonst die FA Nr.
const gehoertZu = (p, j) => (p.job_id && p.job_id === j.id)
  || (p.hoco_nr === j.job_number && j.fa_nr && String(p.fa_nr || "").trim() === String(j.fa_nr).trim());

// Was steht an? Nur Aufträge an der Maschine (Rüsten, läuft) und nur, was
// die Stammdaten der HOCO Nr. verlangen.
export function anstehend(jobs, stamm, protokolle) {
  const st = new Map((stamm || []).map((s) => [s.hoco_nr, s]));
  const t = heute();
  const aus = { erstteil: [], endkontrolle: [], aql: [], ll: [] };
  for (const j of jobs || []) {
    const s = st.get(j.job_number);
    if (!s) continue;
    const arten = s.arten || [];
    const meine = (protokolle || []).filter((p) => gehoertZu(p, j));
    const von = (art) => meine.filter((p) => (p.kopf || {}).art === art);
    const offenes = (art) => von(art).find((p) => !p.abgeschlossen_am) || null;
    // Erstteil gilt erst mit Freigabe als erledigt (seit 1.785.0)
    const fertig = (art) => von(art).some((p) => p.abgeschlossen_am && (art !== "erstteil" || p.entscheid === "freigabe"));
    if (arten.includes("erstteil") && !fertig("erstteil")) aus.erstteil.push({ j, art: "erstteil", p: offenes("erstteil") });
    if (j.plan_status !== "laeuft") continue;
    if (arten.includes("endkontrolle") && !fertig("endkontrolle")) aus.endkontrolle.push({ j, art: "endkontrolle", p: offenes("endkontrolle") });
    if (arten.includes("aql") && !fertig("aql")) aus.aql.push({ j, art: "aql", p: offenes("aql") });
    if (arten.includes("ll")) {
      const ll = von("ll").find((p) => !p.abgeschlossen_am) || null;
      const heuteDa = ll && ((ll.werte || {}).proben || []).some((pr) => pr.datum === t);
      if (!heuteDa) aus.ll.push({ j, art: "ll", p: ll });
    }
  }
  return aus;
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
async function protokollAnlegen(hoco, art, j, protokolle) {
  const st = await stammMitMassen(hoco);
  if (!st || !(st.zeilen || []).length) {
    const ok = await alt.nachfragen({ titel: "Noch keine Masse", text: "Für " + hoco + " sind in den Stammdaten noch keine Masse erfasst. Dort unter „Prüfung“ eintragen oder einen Excel-Prüfbericht einlesen.", bestaetigen: "Stammdaten öffnen" });
    if (ok) stammdatenOeffnen(hoco);
    return null;
  }
  // Masse aus dem Excel in die Stammdaten, bevor das Original wegfällt
  if (st.aus === "excel") {
    try { await stammSpeichern(hoco, { arten: st.arten || [], aql: st.aql ?? null, niveau: st.niveau || null, zeilen: st.zeilen, kopf: st.kopf || {} }); }
    catch (f) { if (alt.fehlerMerken) alt.fehlerMerken("Prüfung aus Excel speichern", String((f && f.message) || f)); }
  }
  const kopf = { art, zeilen: st.zeilen, vorlage: st.kopf || {}, menge: j.target_quantity || "" };
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
  const ok = await alt.nachfragen({ titel: "Protokoll löschen", text: artVon((p.kopf || {}).art).name + " " + p.hoco_nr + (p.fa_nr ? " · FA " + p.fa_nr : "") + " vom " + datumText(p.datum || p.erstellt_am) + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
  if (!ok) return false;
  const vorher = await alt.rueckSichern("pruefprotokolle", { id: p.id });
  const { error } = await alt.db.from("pruefprotokolle").delete().eq("id", p.id);
  if (error) { alt.meldung(fehlerText(error), "fehler"); return false; }
  alt.merkeSchritt("Löschen des Prüfprotokolls", alt.rueckRein("pruefprotokolle", vorher));
  return true;
}

// =================================================================
export default function Pruefberichte() {
  const [, setF] = useState(0);
  const neuZeichnen = () => setF((x) => x + 1);
  const laden = async () => {
    const [protokolle, stamm, jobsR, dateien] = await Promise.all([
      protokolleLaden(),
      stammLaden().catch((f) => { if (fehltTabelle(f)) return []; throw f; }),
      alt.db.from("jobs").select("id, fa_nr, job_number, plan_status, target_quantity, machine_id, planned_from, material_bez, material_dm").in("plan_status", ["ruesten", "laeuft"]),
      dateienLaden().catch(() => []),
    ]);
    const jobs = jobsR.data || [];
    const ids = [...new Set(jobs.map((j) => j.machine_id).filter(Boolean))];
    const m = ids.length ? (await alt.db.from("machines").select("id, name").in("id", ids)).data || [] : [];
    const name = new Map(m.map((x) => [x.id, x.name]));
    for (const j of jobs) j.maschine = name.get(j.machine_id) || "";
    return { protokolle, stamm, jobs, dateien };
  };
  const { daten, fehler, neu } = useDaten(laden, []);

  useSeitenSuche({
    name: "Prüfberichte", platzhalter: "HOCO Nr., FA Nr. …",
    eintraege: () => ((daten && daten.protokolle) || []).map((p) => ({
      gruppe: "Prüfprotokolle", zeichen: "📏", titel: p.hoco_nr + (p.fa_nr ? " · FA " + p.fa_nr : ""),
      zeile: artVon((p.kopf || {}).art).name + " · " + datumText(p.datum || p.erstellt_am), p })),
    springen: (x) => { pbZustand.protokoll = x.p.id; neuZeichnen(); },
  });

  if (!daten) return <p className="klein">{fehler ? fehlerText(fehler) : "Wird geladen …"}</p>;

  const oeffnen = (p) => { pbZustand.protokoll = p.id; pbZustand.frisch = p; neuZeichnen(); };
  if (pbZustand.protokoll) {
    // Ein eben angelegtes Protokoll ist erst nach dem Neuladen in der Liste
    const f = pbZustand.frisch;
    const p = daten.protokolle.find((x) => x.id === pbZustand.protokoll) || (f && f.id === pbZustand.protokoll ? f : null);
    if (p) return <Protokoll key={p.id} p={p} zurueck={() => { pbZustand.protokoll = null; pbZustand.frisch = null; neu(); neuZeichnen(); }} />;
    pbZustand.protokoll = null;
  }
  return <Uebersicht daten={daten} neu={neu} oeffnen={oeffnen} />;
}

// ---------- Übersicht: was ansteht und die zuletzt bearbeiteten ----------
function Uebersicht({ daten, neu, oeffnen }) {
  const [suche, setSuche] = useState(pbZustand.suche);
  const [legt, setLegt] = useState(false);
  const todo = useMemo(() => anstehend(daten.jobs, daten.stamm, daten.protokolle), [daten]);

  const anlegen = async (hoco, art, j) => {
    if (!darf() || legt) return;
    setLegt(true);
    try {
      const p = await protokollAnlegen(hoco, art, j, daten.protokolle);
      if (p) oeffnen(p);
    } catch (f) { alt.meldung(fehlerText(f), "fehler"); }
    finally { setLegt(false); }
  };

  // Seit 1.784.0 kein „+ Protokoll“ mehr: Protokolle entstehen nur aus dem, was
  // die Stammdaten verlangen und hier ansteht (Wunsch Patrick 24. November 2026).
  const todoTippen = (t) => { if (t.p) oeffnen(t.p); else anlegen(t.j.job_number, t.art, t.j); };

  const liste = [...daten.protokolle]
    .sort((a, b) => String(b.geaendert_am || b.erstellt_am).localeCompare(String(a.geaendert_am || a.erstellt_am)))
    .filter((p) => passtWoerter(suche, [p.hoco_nr, p.fa_nr, artVon((p.kopf || {}).art).name, p.visum, ((p.kopf || {}).vorlage || {}).bezeichnung]));
  const zeigen = suche ? liste.slice(0, 200) : liste.slice(0, 30);

  const loeschen = async (p) => { if (await protokollLoeschen(p)) neu(); };

  // Letzte Produktion: je HOCO Nr. und Index nur der neuste Bericht aus dem Ordner,
  // eine Zeile je Index (Wunsch Patrick 25. November 2026: „nicht so gebündelt“)
  const mitProtokoll = new Set(daten.protokolle.map((p) => p.hoco_nr));
  const jeIndex = new Map();
  for (const d of daten.dateien || []) {
    if (mitProtokoll.has(d.hoco_nr)) continue;
    const k = d.hoco_nr + "|" + String(d.index_nr || "").toUpperCase();
    const z = d.geaendert || d.erstellt_am || "";
    const v = jeIndex.get(k);
    if (!v || String(z) > String(v.zeit)) jeIndex.set(k, { hoco: d.hoco_nr, idx: d.index_nr || "", d, zeit: z });
  }
  const letzte = [...jeIndex.values()]
    .filter((x) => passtWoerter(suche, [x.hoco, x.idx, x.d.name]))
    .sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)) || String(a.hoco).localeCompare(String(b.hoco)));
  const letzteZeigen = suche ? letzte.slice(0, 200) : letzte.slice(0, 30);
  const excelAnsehen = (d) => alt.betrachter(d.url, "Prüfbericht " + d.hoco_nr + (d.seite ? " · Seite " + d.seite : ""), false, "excel",
    (String(d.name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1]);

  const SPALTEN = [
    ["erstteil", "Erstteilprüfung", "Aufträge in Rüsten oder läuft ohne abgeschlossene Erstteilprüfung"],
    ["endkontrolle", "Endkontrolle", "Laufende Aufträge ohne abgeschlossene Endkontrolle"],
    ["aql", "AQL", "Laufende Aufträge ohne abgeschlossene AQL-Stichprobe"],
    ["ll", "LL Langläufer", "Laufende Aufträge ohne Stichprobe von heute"],
  ];
  return (
    <div className="pb">
      <div className="pb-todo" id="pb-todo">
        {SPALTEN.map(([id, titel, erkl]) => (
          <section key={id} className="pb-todo__spalte" data-pbtodo={id}>
            <h3>{titel} <span className={"marke" + (todo[id].length ? " pb-todo__zahl" : "")}>{todo[id].length}</span></h3>
            {!todo[id].length ? <p className="klein">Nichts offen.</p> : (
              <ul>
                {todo[id].map((t) => (
                  <li key={t.j.id}>
                    <button type="button" className="pb-todo__eintrag" data-pbtodoauftrag={t.j.id} disabled={!darf() && !t.p} onClick={() => todoTippen(t)}>
                      <b>{t.j.job_number}</b>
                      <span>{t.j.fa_nr ? "FA " + t.j.fa_nr : "ohne FA"} · {t.j.maschine || "?"} · {STAND[t.j.plan_status] || ""}</span>
                      <small>{t.p ? (t.art === "ll" ? "heute noch keine Stichprobe" : "in Arbeit, weiterführen") : "noch nicht angefangen"}</small>
                    </button>
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
        </div>
        {!zeigen.length ? <p className="klein">{daten.protokolle.length ? "Nichts gefunden." : "Noch kein Protokoll."}</p> : (
          <table className="tabelle pb-zuletzt" id="pb-liste">
            <thead><tr><th>Art</th><th>HOCO Nr.</th><th>FA Nr.</th><th>Datum</th><th>Ergebnis</th><th>Stand</th><th>Geändert</th><th /></tr></thead>
            <tbody>
              {zeigen.map((p) => {
                const e = auswerten(p), art = (p.kopf || {}).art || "erstteil";
                return (
                  <tr key={p.id} data-pbprotokoll={p.id} onClick={() => oeffnen(p)}>
                    <td><span className={"pb-art pb-art--" + art}>{artVon(art).kurz}</span></td>
                    <td><b>{p.hoco_nr}</b></td>
                    <td>{p.fa_nr || <span className="pb-rot">fehlt</span>}</td>
                    <td>{datumText(p.datum || p.erstellt_am)}</td>
                    <td className="nowrap">{e.schlecht ? <b className="pb-rot">{e.schlecht} n.i.O. </b> : null}<span className="klein">{e.gut} i.O.</span></td>
                    <td>{p.abgeschlossen_am ? "✓ " + (entscheidText(p.entscheid) || "abgeschlossen") : "in Arbeit"}</td>
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
            <h3 className="pb-titel">Letzte Produktion (Original aus dem Ordner)</h3>
          </div>
          <p className="klein">Der Prüfbericht der letzten Produktion, solange es für die HOCO Nr. noch kein Protokoll in der App gibt. Mit dem ersten Protokoll in der App fällt das Original weg, danach bleiben alle Protokolle gespeichert.</p>
          {!letzteZeigen.length ? <p className="klein">{letzte.length ? "Nichts gefunden." : "Alle HOCO Nummern haben schon ein Protokoll in der App."}</p> : (
            <table className="tabelle pb-zuletzt" id="pb-letzte-liste">
              <thead><tr><th>HOCO Nr.</th><th>Index</th><th>Datei</th><th>Stand</th><th /></tr></thead>
              <tbody>
                {letzteZeigen.map((x) => (
                  <tr key={x.d.id} data-pbletzte={x.hoco} onClick={() => excelAnsehen(x.d)}>
                    <td className="nowrap"><b>{x.hoco}</b></td>
                    <td className="nowrap">{x.idx || "–"}</td>
                    <td className="klein pb-letzte-name" title={x.d.name}>{x.d.name}</td>
                    <td className="klein nowrap">{zeitText(x.zeit)}</td>
                    <td className="nowrap"><button type="button" className="knopf knopf--klein" data-pbletzteansehen={x.d.id}
                      onClick={(e) => { e.stopPropagation(); excelAnsehen(x.d); }}>Ansehen</button></td>
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
    if (e.offen && art !== "ll") {
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
  const dateiName = () => ("Prüfprotokoll " + hoco + " " + artVon(art).kurz + (w.fa_nr ? " FA " + w.fa_nr : "") + " " + (w.datum || "") + ".pdf").replace(/[\\/:*?"<>|]/g, "");
  const pdfMachen = async () => {
    const { blattPdf } = await import("./achtdPdf.js");
    return blattPdf("<style>" + STIL + "</style>" + protokollHtml(w, hoco), "Prüfprotokoll " + hoco + " · " + artVon(art).name);
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
    quittieren={(c) => { const n = { ...w, kopf: { ...w.kopf, checkliste: c } }; setW(n); speichern(n); ausbuchen(w, hoco); }} />;
  return (
    <div className="pb pb-blattseite" data-pbprotokolloffen={w.id}>
      <div className="pb-kopfzeile pb-werkzeug">
        <button type="button" className="knopf knopf--klein" onClick={zurueck}>← Prüfberichte</button>
        <span className="klein" id="pb-stand">{stand}</span>
        <span className="pst-platz" />
        <button type="button" className="knopf knopf--klein" onClick={() => stammdatenOeffnen(hoco)}>Stammdaten {hoco}</button>
        <button type="button" className="knopf knopf--klein" id="pb-drucken" onClick={drucken}>🖨 Drucken</button>
        {darf() ? <button type="button" className="knopf knopf--klein knopf--gefahr-leise" id="pb-loeschen" onClick={loeschen}>Löschen</button> : null}
      </div>

      <div className="pb-blatt hell-bleibt" id="pb-blatt">
        <div className="rkpdf pb-briefkopf" dangerouslySetInnerHTML={{ __html: "<style>" + STIL + "</style>" + briefkopf() }} />
        <h2 className="pb-blatt__titel">Prüfprotokoll · {artVon(art).name}</h2>
        <KopfRaster kopf={w.kopf.vorlage || {}} w={w} hoco={hoco} />
        <div className="pb-felder">
          <label className={!String(w.fa_nr || "").trim() ? "pb-pflicht" : ""}>FA Nr.<input value={w.fa_nr || ""} disabled={!schreibt} onChange={(x) => setzen("fa_nr", x.target.value)} /></label>
          {art === "aql" ? <AqlKopf k={w.kopf} schreibt={schreibt} setzen={kopfSetzen} werte={w.werte} /> : null}
          <label className="pb-felder__rechts">Maschine<input value={w.kopf.maschine || ""} disabled={!schreibt} onChange={(x) => kopfSetzen("maschine", x.target.value)} /></label>
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
  const { lehren, messmittel } = lehrenAus({ zeilen: masse(kopf.zeilen) });
  const nr = (x) => "Nr. " + x.nr.join(", ");
  return [["zeichnung", "Zeichnung" + (v.zeichnung ? " " + v.zeichnung : "") + (v.index ? ", Index " + v.index : ""), "richtige Fassung bereit"]]
    .concat(lehren.map((l, i) => ["l" + i, l.name + (l.mass ? " " + l.mass : ""), nr(l)]))
    .concat(messmittel.map((m, i) => ["m" + i, m.name, nr(m)]))
    .concat([["sauber", "Prüfmittel sauber, Prüfdatum gültig", ""]]);
}

// Nach der Checkliste die Lehren aus dem Schrank auf den Auftrag ausbuchen
// (Wunsch Patrick 24. November 2026): sie zählen ab „läuft“ Einsatztage und
// kommen bei „fertig“ in die Rückgabekiste (Auslöser in sql/pruefmittel-rueckgabe.sql).
// Nur Admins dürfen Prüfmittel ändern; sonst bleibt es still.
async function ausbuchen(w, hoco) {
  try {
    if (!w.job_id || !alt.istAdmin()) return;
    const { lehren } = lehrenAus({ zeilen: masse(w.kopf.zeilen) });
    if (!lehren.length) return;
    const [{ data: pm }, { data: job }] = await Promise.all([
      alt.db.from("pruefmittel").select("*").eq("ort_art", "schrank"),
      alt.db.from("jobs").select("id, machine_id").eq("id", w.job_id).maybeSingle(),
    ]);
    if (!pm || !job || !job.machine_id) return;
    const ids = new Set();
    lehren.forEach((l) => { const x = pruefmittelFuer(l, pm.filter((p) => !ids.has(p.id)), hoco)[0]; if (x) ids.add(x.id); });
    if (!ids.size) return;
    const liste = [...ids];
    const vorher = [];
    for (const id of liste) vorher.push(...await alt.rueckSichern("pruefmittel", { id }));
    const { error } = await alt.db.from("pruefmittel").update({ ort_art: "maschine", machine_id: job.machine_id, job_id: job.id })
      .in("id", liste);
    if (error) return;
    alt.merkeSchritt(liste.length + " Prüfmittel ausgebucht", alt.rueckRein("pruefmittel", vorher));
    alt.meldung(liste.length + " Prüfmittel auf den Auftrag ausgebucht.", "gut");
  } catch (e) { /* still: ohne Prüfmittel geht es weiter */ }
}

function Checkliste({ w, hoco, schreibt, zurueck, quittieren }) {
  const punkte = useMemo(() => checkPunkte(w.kopf), [w.kopf]);
  const [haken, setHaken] = useState({});
  const alle = punkte.every(([id]) => haken[id]);
  return (
    <div className="pb pb-blattseite" data-pbcheckliste={w.id}>
      <div className="pb-kopfzeile pb-werkzeug">
        <button type="button" className="knopf knopf--klein" onClick={zurueck}>← Prüfberichte</button>
        <span className="pst-platz" />
        <button type="button" className="knopf knopf--klein" onClick={() => stammdatenOeffnen(hoco)}>Stammdaten {hoco}</button>
      </div>
      <div className="pb-check karte">
        <h2>Erstteilprüfung {hoco}{w.fa_nr ? " · FA " + w.fa_nr : ""}</h2>
        <p className="klein">Zuerst prüfen, ob alles Richtige hervorgenommen ist. Danach kommt das Protokoll.</p>
        <ul className="pb-check__liste">
          {punkte.map(([id, text, unter]) => (
            <li key={id}>
              <label className={haken[id] ? "pb-check--an" : ""}>
                <input type="checkbox" data-pbcheck={id} checked={!!haken[id]} disabled={!schreibt}
                  onChange={(x) => setHaken((h) => ({ ...h, [id]: x.target.checked }))} />
                <span><b>{text}</b>{unter ? <small>{unter}</small> : null}</span>
              </label>
            </li>
          ))}
        </ul>
        {schreibt ? (
          <div className="pb-check__fuss">
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
  const t = toleranz(z.soll);
  return <><td className="pb-nr">{z.nr}</td><td className="pb-soll" title={t ? "Toleranz " + toleranzText(t) : ""}>{z.soll}</td></>;
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
                {[...Array(TEILE)].map((_, i) => <td key={i}><IstFeld wert={(w.werte[z.id] || [])[i]} t={toleranz(z.soll)} an={schreibt} name={z.id + "-" + i} setzen={(v) => setze(z.id, i, v)} /></td>)}
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
            const v = w.werte[z.id] || {}, t = toleranz(z.soll);
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
              <b>{z.nr}</b> {z.soll} <small>{z.pm}</small>
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
              {proben.map((pr) => <td key={pr.id}><IstFeld wert={(pr.w || {})[z.id]} t={toleranz(z.soll)} an={schreibt} name={z.id + "-" + pr.id}
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
      const x = w.werte[z.id] || {}, t = toleranz(z.soll);
      return "<tr><td>" + h(z.nr) + "</td><td>" + h(z.soll) + "</td><td>" + h(x.geprueft || (plan ? plan.n : "")) + "</td><td"
        + (Number(x.nio) > 0 ? " style='color:#c00;font-weight:700'" : "") + ">" + h(x.nio) + "</td><td" + farbe(x.min, t) + ">" + h(x.min) + "</td><td" + farbe(x.max, t) + ">" + h(x.max) + "</td><td>" + h(z.pm) + "</td></tr>";
    }).join("");
  } else if (art === "ll") {
    const aus = new Set(k.auswahl || []), proben = (w.werte || {}).proben || [];
    kopfZ = proben.map((p) => "<th>" + h(datumText(p.datum)) + "<br>" + h(p.zeit) + "</th>").join("");
    koerper = zeilen.filter((z) => !z.abschnitt && aus.has(z.id)).map((z) => {
      const t = toleranz(z.soll);
      return "<tr><td>" + h(z.nr) + "</td><td>" + h(z.soll) + "</td>"
        + proben.map((p) => "<td" + farbe((p.w || {})[z.id], t) + ">" + h((p.w || {})[z.id]) + "</td>").join("") + "<td>" + h(z.pm) + "</td></tr>";
    }).join("") + "<tr><td colspan='2'>Visum</td>" + proben.map((p) => "<td>" + h(p.visum) + "</td>").join("") + "<td></td></tr>";
  } else {
    kopfZ = [...Array(TEILE)].map((_, i) => "<th>Teil " + (i + 1) + "</th>").join("");
    koerper = zeilen.map((z) => {
      if (z.abschnitt) return "<tr class='ab'><td colspan='" + (TEILE + 3) + "'>" + h(z.abschnitt) + "</td></tr>";
      const t = toleranz(z.soll), a = w.werte[z.id] || [];
      return "<tr><td>" + h(z.nr) + "</td><td>" + h(z.soll) + "</td>"
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
    + "<h1>Prüfprotokoll · " + h(artVon(art).name) + "</h1>"
    + "<div class='pbp-kf'>" + felder.filter(([, x]) => x).map(([n, x]) => "<div><small>" + h(n) + "</small>" + h(x) + "</div>").join("") + "</div>"
    + "<table><thead><tr><th>Nr.</th><th>Soll</th>" + kopfZ + "<th>Prüfmittel</th></tr></thead><tbody>" + koerper + "</tbody></table>"
    + "<div class='pbp-fuss'><div><b>Prüf-Entscheid:</b> " + h(entscheidText(w.entscheid)) + "</div><div><b>Datum:</b> " + h(datumText(w.datum)) + "</div><div><b>Visum:</b> " + h(w.visum) + "</div></div>"
    + (w.bemerkung ? "<p><b>Bemerkung:</b> " + h(w.bemerkung) + "</p>" : "") + "</div>";
}
