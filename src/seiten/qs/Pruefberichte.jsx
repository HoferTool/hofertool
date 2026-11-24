// =================================================================
//  QUALITÄTSSICHERUNG → PRÜFBERICHTE (seit 1.771.0, Wunsch Patrick
//  24. November 2026: „alle Berichte per Pfad hochladen und daraus ein
//  Prüfprotokoll machen, das per Tool läuft und ähnlich aufgebaut ist“,
//  „soll unter QS als weiterer Reiter kommen“).
//  Die Excel-Prüfberichte je HOCO Nr. (vom Pool-Rechner aus dem Ordner
//  oder von Hand hochgeladen) sind nur die Vorlage. Ausgefüllt wird in
//  der App, je Protokoll eine Art: Erstteilprüfung und Endkontrolle mit
//  5 Teilen, AQL-Stichprobe, LL Langläufer mit ausgewählten Massen.
//  Daten in src/daten/pruefbericht.js, Tabellen aus sql/pruefberichte.sql.
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { passtWoerter } from "../../teile/Suchfeld.jsx";
import { useSeitenSuche } from "../../teile/seitenSuche.js";
import {
  ARTEN, artVon, TEILE, AQL_WERTE, aqlPlan, fehltTabelle, dateienLaden, protokolleLaden,
  vorlageLaden, dateiHochladen, lehrenAus, toleranz, toleranzText, istPruefen, pruefmittelFuer,
} from "../../daten/pruefbericht.js";

// Gewählte HOCO Nr. und offenes Protokoll bleiben beim Reiterwechsel
const pbZustand = { suche: "", hoco: null, protokoll: null };

const fehlerText = (f) => fehltTabelle(f)
  ? "Die Datenbank kennt die Prüfberichte noch nicht (sql/pruefberichte.sql fehlt)."
  : alt.fehlertext ? alt.fehlertext(f) : String((f && f.message) || f);
const heute = () => alt.isoDatum(new Date());
const datumText = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "");
const zeitText = (d) => { if (!d) return ""; const x = new Date(d); return datumText(alt.isoDatum(x)) + " " + String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); };
const darf = () => alt.darfSchreiben() && !alt.istExtern();

const ENTSCHEIDE = [["freigabe", "Freigabe"], ["nacharbeit", "Nacharbeit / Sortieren"], ["neu", "Neuanfertigung"]];
const entscheidText = (e) => (ENTSCHEIDE.find((x) => x[0] === e) || [])[1] || "";

// Zeilen, die geprüft werden (ohne Abschnitte)
const masse = (zeilen) => (zeilen || []).filter((z) => !z.abschnitt);

// Ergebnis eines Protokolls: { gut, schlecht, offen, fertig }
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

// =================================================================
export default function Pruefberichte() {
  const [, setF] = useState(0);
  const neuZeichnen = () => setF((x) => x + 1);
  const laden = async () => {
    const [dateien, protokolle] = await Promise.all([dateienLaden(), protokolleLaden()]);
    return { dateien, protokolle };
  };
  const { daten, fehler, neu } = useDaten(laden, []);

  const gruppen = useMemo(() => {
    const m = new Map();
    for (const d of (daten && daten.dateien) || []) {
      if (!m.has(d.hoco_nr)) m.set(d.hoco_nr, { hoco: d.hoco_nr, dateien: [], protokolle: [] });
      m.get(d.hoco_nr).dateien.push(d);
    }
    for (const p of (daten && daten.protokolle) || []) {
      if (!m.has(p.hoco_nr)) m.set(p.hoco_nr, { hoco: p.hoco_nr, dateien: [], protokolle: [] });
      m.get(p.hoco_nr).protokolle.push(p);
    }
    return [...m.values()].sort((a, b) => a.hoco.localeCompare(b.hoco));
  }, [daten]);

  useSeitenSuche({
    name: "Prüfberichte", platzhalter: "HOCO Nr., FA Nr. …",
    eintraege: () => gruppen.map((g) => ({
      gruppe: "Prüfberichte", zeichen: "📏", titel: g.hoco,
      zeile: g.dateien.length + " Vorlage(n) · " + g.protokolle.length + " Protokoll(e)",
      such: g.protokolle.map((p) => p.fa_nr).join(" "), g })),
    springen: (x) => { pbZustand.hoco = x.g.hoco; pbZustand.protokoll = null; neuZeichnen(); },
  });

  if (!daten) return <p className="klein">{fehler ? fehlerText(fehler) : "Wird geladen …"}</p>;

  const g = pbZustand.hoco && gruppen.find((x) => x.hoco === pbZustand.hoco);
  const zurueck = () => { pbZustand.hoco = null; pbZustand.protokoll = null; neuZeichnen(); };
  if (g && pbZustand.protokoll) {
    // Ein eben angelegtes Protokoll ist erst nach dem Neuladen in der Liste
    const f = pbZustand.frisch;
    const p = g.protokolle.find((x) => x.id === pbZustand.protokoll) || (f && f.id === pbZustand.protokoll ? f : null);
    if (p) return <Protokoll key={p.id} p={p} g={g} zurueck={() => { pbZustand.protokoll = null; neu(); neuZeichnen(); }} neu={neu} />;
    pbZustand.protokoll = null;
  }
  if (g) return <HocoAnsicht g={g} zurueck={zurueck} neu={neu} oeffnen={(id, frisch) => { pbZustand.protokoll = id; pbZustand.frisch = frisch || null; neu(); neuZeichnen(); }} />;
  return <Liste gruppen={gruppen} neu={neu} waehlen={(h) => { pbZustand.hoco = h; neuZeichnen(); }} />;
}

// ---------- Hochladen von Hand ----------
function HochladenKnopf({ nachher }) {
  const ref = useRef(null);
  const [laeuft, setLaeuft] = useState(false);
  if (!darf()) return null;
  const los = async (liste) => {
    setLaeuft(true);
    let gut = 0; const fehl = [];
    for (const d of liste) {
      try { await dateiHochladen(d); gut++; } catch (f) { fehl.push(d.name + ": " + fehlerText(f)); }
    }
    setLaeuft(false);
    if (gut) alt.meldung(gut + " Prüfbericht(e) hochgeladen", "gut");
    if (fehl.length) alt.meldung(fehl.join(" · "), "fehler");
    if (nachher) nachher();
  };
  return (
    <>
      <button type="button" className="knopf" id="pb-hochladen" disabled={laeuft} onClick={() => ref.current && ref.current.click()}>
        {laeuft ? "Wird hochgeladen …" : "+ Excel-Prüfberichte hochladen"}
      </button>
      <input ref={ref} type="file" multiple accept=".xlsx,.xlsm,.xls" hidden data-ablegen="direkt"
        onChange={(e) => { const l = [...e.target.files]; e.target.value = ""; if (l.length) los(l); }} />
    </>
  );
}

// ---------- Übersicht ----------
function Liste({ gruppen, neu, waehlen }) {
  const [suche, setSuche] = useState(pbZustand.suche);
  const treffer = gruppen.filter((g) => passtWoerter(suche, [g.hoco, ...g.protokolle.map((p) => p.fa_nr), ...g.dateien.map((d) => d.name)]));
  const offen = gruppen.reduce((s, g) => s + g.protokolle.filter((p) => !p.abgeschlossen_am).length, 0);
  return (
    <div className="pb">
      <div className="pb-kopfzeile">
        <input type="search" className="pb-suche" id="pb-suche" placeholder="HOCO Nr. oder FA Nr. suchen" value={suche}
          onChange={(e) => { setSuche(e.target.value); pbZustand.suche = e.target.value; }} />
        <HochladenKnopf nachher={neu} />
      </div>
      <p className="klein">{gruppen.length} HOCO Nummern mit Prüfbericht · {offen} Protokolle in Arbeit.
        Die Vorlagen kommen vom Pool-Rechner aus dem Ordner unter Einstellungen → Dokumente → Prüfberichte oder werden hier hochgeladen.</p>
      {!treffer.length ? <p className="klein">{gruppen.length ? "Nichts gefunden." : "Noch keine Prüfberichte."}</p> : (
        <div className="pb-liste" id="pb-liste">
          {treffer.map((g) => {
            const letzt = g.protokolle[0];
            const inArbeit = g.protokolle.filter((p) => !p.abgeschlossen_am).length;
            return (
              <button type="button" key={g.hoco} className="pb-liste__zeile" data-pbhoco={g.hoco} onClick={() => waehlen(g.hoco)}>
                <b>{g.hoco}</b>
                <span>{g.dateien.length ? g.dateien.length + (g.dateien.length === 1 ? " Seite" : " Seiten") : "keine Vorlage"}</span>
                <span>{g.protokolle.length} Protokoll{g.protokolle.length === 1 ? "" : "e"}{inArbeit ? " · " + inArbeit + " in Arbeit" : ""}</span>
                <span className="klein">{letzt ? artVon((letzt.kopf || {}).art).kurz + " " + datumText(letzt.datum || letzt.erstellt_am) : ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Vorlage laden ----------
function useVorlage(dateien) {
  const schluessel = dateien.map((d) => d.url).join("|");
  const [st, setSt] = useState({ vorlage: null, fehler: null });
  useEffect(() => {
    let gueltig = true;
    if (!dateien.length) { setSt({ vorlage: null, fehler: null }); return undefined; }
    setSt({ vorlage: null, fehler: null });
    vorlageLaden(dateien).then((v) => gueltig && setSt({ vorlage: v, fehler: null }),
      (f) => gueltig && setSt({ vorlage: null, fehler: f }));
    return () => { gueltig = false; };
  }, [schluessel]);
  return st;
}

function KopfRaster({ kopf }) {
  const felder = [["FA Nr. (Vorlage)", kopf.fa_nr], ["Artikel", kopf.bezeichnung], ["HOCO Nr.", kopf.hoco], ["Index", kopf.index],
    ["Zeichnung", kopf.zeichnung], ["Bestellte Menge", kopf.menge], ["Automat", kopf.typ], ["Maschine", kopf.maschine], ["Allg. Toleranz", kopf.alltol]];
  return (
    <div className="pb-kopf">
      {felder.filter(([, v]) => v).map(([n, v]) => <div key={n}><small>{n}</small><b>{v}</b></div>)}
    </div>
  );
}

// Protokolle nach FA Nr., die jüngste FA zuerst (die Liste kommt neuste zuerst)
function faGruppen(liste) {
  const m = new Map();
  for (const p of liste) { const k = String(p.fa_nr || "").trim() || "_"; if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  return [...m.entries()].sort((x, y) => (x[0] === "_") - (y[0] === "_"));
}

// ---------- FA Nr. wählen ----------
const STAND = { laeuft: "läuft", ruesten: "Rüsten", geplant: "geplant", fertig: "fertig" };
async function faWaehlen(hoco) {
  const { data } = await alt.db.from("jobs").select("id, fa_nr, target_quantity, plan_status, planned_from")
    .eq("job_number", hoco).order("planned_from", { ascending: false, nullsFirst: false }).limit(30);
  const rang = (x) => ({ laeuft: 0, ruesten: 1, geplant: 2 }[x.plan_status] ?? 3);
  const auftraege = (data || []).filter((x) => x.fa_nr).sort((a, b) => rang(a) - rang(b)).slice(0, 8);
  const opt = auftraege.map((x) => ({ wert: x.id, text: "FA " + x.fa_nr + " · " + (STAND[x.plan_status] || x.plan_status || "")
    + (x.planned_from ? " · ab " + datumText(x.planned_from) : "") + (x.target_quantity ? " · " + alt.zahlText(x.target_quantity) + " Stk" : "") }));
  opt.push({ wert: "_hand", text: "Andere FA Nr. eintippen …" });
  const w = await alt.auswahlDialog("Für welche FA Nr.?", opt, "Das Protokoll wird mit dieser FA Nr. gespeichert. Jede FA hat ihre eigenen Protokolle.");
  if (!w) return null;
  if (w !== "_hand") return auftraege.find((x) => x.id === w);
  const e = await alt.dialogFelder({ titel: "FA Nr. eintippen", felder: [{ name: "fa", label: "FA Nr.", pflicht: true }], bestaetigen: "Weiter" });
  const fa = e && String(e.fa || "").trim();
  if (!fa) return null;
  const da = (data || []).find((x) => String(x.fa_nr || "").trim() === fa);
  return da || { fa_nr: fa };
}

// ---------- Eine HOCO Nr. ----------
function HocoAnsicht({ g, zurueck, neu, oeffnen }) {
  const { vorlage, fehler } = useVorlage(g.dateien);
  const lehren = useMemo(() => (vorlage ? lehrenAus(vorlage) : null), [vorlage]);
  const [pm, setPm] = useState(null);
  useEffect(() => {
    if (!alt.istAdmin()) return;
    import("../../daten/pruefmittel.js").then((m) => (m.pruefmittelLaden ? m.pruefmittelLaden() : null))
      .then((r) => setPm((r && (r.liste || r)) || null)).catch(() => {});
  }, []);
  const [legt, setLegt] = useState(false);

  const anlegen = async (art) => {
    if (!vorlage) return;
    setLegt(true);
    try {
      // Jedes Protokoll gehört zu einer FA Nr., damit alte Prüfungen nicht
      // überschrieben werden wie das Excel im Ordner (Patrick 24.11.2026)
      const j = await faWaehlen(g.hoco);
      if (!j) return;
      const kopf = { art, zeilen: vorlage.zeilen, vorlage: vorlage.kopf, menge: j.target_quantity || "" };
      if (art === "aql") { kopf.los = j.target_quantity || ""; kopf.aql = 1.0; kopf.niveau = "II"; }
      if (art === "ll") {
        // Auswahl vom letzten LL dieser HOCO Nr., sonst noch keine
        const vor = g.protokolle.find((p) => (p.kopf || {}).art === "ll");
        const ids = new Set(vorlage.zeilen.map((z) => z.id));
        kopf.auswahl = ((vor && vor.kopf.auswahl) || []).filter((x) => ids.has(x));
      }
      const { data, error } = await alt.db.from("pruefprotokolle").insert({
        hoco_nr: g.hoco, fa_nr: j.fa_nr, job_id: j.id || null, kopf, werte: art === "ll" ? { proben: [] } : {}, datum: heute(),
      }).select().single();
      if (error) throw error;
      alt.merkeSchritt("Neues Prüfprotokoll " + g.hoco, alt.rueckWeg("pruefprotokolle", { id: data.id }));
      oeffnen(data.id, data);
    } catch (f) { alt.meldung(fehlerText(f), "fehler"); }
    finally { setLegt(false); }
  };

  return (
    <div className="pb" data-pbansicht={g.hoco}>
      <div className="pb-kopfzeile">
        <button type="button" className="knopf knopf--klein" onClick={zurueck}>← Alle Prüfberichte</button>
        <h2 className="pb-titel">Prüfbericht {g.hoco}</h2>
        <HochladenKnopf nachher={neu} />
      </div>
      <div className="pb-dateien">
        {g.dateien.map((d) => (
          <button type="button" key={d.id} className="knopf knopf--klein" onClick={() => alt.betrachter(d.url, d.name, false, "excel")}>
            📄 {d.seite ? "Seite " + d.seite + " · " : ""}{d.name}
          </button>
        ))}
        {!g.dateien.length ? <span className="klein">Keine Excel-Vorlage mehr da, die Protokolle bleiben.</span> : null}
      </div>
      {fehler ? <p className="rk-fehler">Vorlage nicht lesbar: {fehlerText(fehler)}</p> : null}
      {g.dateien.length && !vorlage && !fehler ? <p className="klein">Vorlage wird gelesen …</p> : null}
      {vorlage ? <KopfRaster kopf={vorlage.kopf} /> : null}

      {lehren && (lehren.lehren.length || lehren.messmittel.length) ? (
        <section className="pb-karte" id="pb-lehren">
          <h3>Benötigte Lehren und Messmittel</h3>
          <div className="pb-lehren">
            {lehren.lehren.map((l, i) => {
              const da = pm ? pruefmittelFuer(l, pm, g.hoco) : null;
              return (
                <div key={i} className={"pb-lehre" + (da && !da.length ? " pb-lehre--fehlt" : "")}>
                  <b>{l.name}</b> <span>{l.mass}</span> <small>Nr. {l.nr.join(", ")}</small>
                  {da ? <small className="pb-lehre__da">{da.length ? "✓ " + da.map((p) => p.nr || p.bezeichnung).join(", ") : "nicht in der Prüfmittelverwaltung"}</small> : null}
                </div>
              );
            })}
          </div>
          {lehren.messmittel.length ? <p className="klein">Messmittel: {lehren.messmittel.map((m) => m.name).join(", ")}</p> : null}
        </section>
      ) : null}

      <section className="pb-karte">
        <h3>Protokolle</h3>
        {darf() && vorlage ? (
          <div className="pb-neu" id="pb-neu">
            {ARTEN.map((a) => (
              <button type="button" key={a.id} className="pb-neu__knopf" data-pbneu={a.id} disabled={legt} onClick={() => anlegen(a.id)}>
                <b>+ {a.name}</b><small>{a.text}</small>
              </button>
            ))}
          </div>
        ) : null}
        {!g.protokolle.length ? <p className="klein">Noch kein Protokoll.</p> : (
          <div className="pb-protokolle">
            {faGruppen(g.protokolle).map(([fa, liste]) => (
              <div key={fa} className="pb-fagruppe" data-pbfa={fa}>
                <h4 className="pb-fagruppe__titel">{fa === "_" ? "Ohne FA Nr." : "FA " + fa}<small>{liste.length} Protokoll{liste.length === 1 ? "" : "e"}</small></h4>
            {liste.map((p) => {
              const e = auswerten(p);
              return (
                <button type="button" key={p.id} className="pb-protokolle__zeile" data-pbprotokoll={p.id} onClick={() => oeffnen(p.id)}>
                  <span className={"pb-art pb-art--" + ((p.kopf || {}).art || "erstteil")}>{artVon((p.kopf || {}).art).kurz}</span>
                  <span>{datumText(p.datum || p.erstellt_am)}{p.fa_nr ? " · FA " + p.fa_nr : ""}</span>
                  <span className="klein">{e.schlecht ? <b className="pb-rot">{e.schlecht} n.i.O.</b> : null} {e.gut} i.O.</span>
                  <span>{p.abgeschlossen_am ? "✓ " + (entscheidText(p.entscheid) || "abgeschlossen") : "in Arbeit"}</span>
                </button>
              );
            })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Ein Protokoll ----------
function Protokoll({ p, g, zurueck, neu }) {
  const [w, setW] = useState(() => ({ ...p, kopf: { ...(p.kopf || {}) }, werte: { ...(p.werte || {}) } }));
  const [stand, setStand] = useState("");
  const zu = !!w.abgeschlossen_am;
  const schreibt = darf() && !zu;
  const art = w.kopf.art || "erstteil";
  const zeilen = w.kopf.zeilen || [];
  const timer = useRef(null);
  const letzt = useRef(w);
  letzt.current = w;

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
    if (await speichern(n)) { setW(n); alt.meldung("Protokoll abgeschlossen", "gut"); }
  };
  const wiederOeffnen = async () => {
    const n = { ...w, abgeschlossen_am: null };
    if (await speichern(n)) setW(n);
  };
  const loeschen = async () => {
    const ok = await alt.nachfragen({ titel: "Protokoll löschen", text: artVon(art).name + " vom " + datumText(w.datum) + " wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    clearTimeout(timer.current); timer.current = null;
    const vorher = await alt.rueckSichern("pruefprotokolle", { id: w.id });
    const { error } = await alt.db.from("pruefprotokolle").delete().eq("id", w.id);
    if (error) { alt.meldung(fehlerText(error), "fehler"); return; }
    alt.merkeSchritt("Löschen des Prüfprotokolls", alt.rueckRein("pruefprotokolle", vorher));
    zurueck();
  };
  const drucken = async () => {
    try {
      setStand("PDF wird erstellt …");
      const { pdfAusHtml } = await import("../qmAlt/checklistePdf.js");
      const blob = await pdfAusHtml(protokollHtml(w, g.hoco), "Prüfprotokoll " + g.hoco + " · " + artVon(art).name);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = ("Prüfprotokoll " + g.hoco + " " + artVon(art).kurz + " " + (w.datum || "") + ".pdf").replace(/[\\/:*?"<>|]/g, "");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setStand("PDF heruntergeladen");
    } catch (f) { setStand(""); alt.meldung("PDF ging nicht: " + fehlerText(f), "fehler"); }
  };

  const e = auswerten(w);
  return (
    <div className="pb" data-pbprotokolloffen={w.id}>
      <div className="pb-kopfzeile">
        <button type="button" className="knopf knopf--klein" onClick={zurueck}>← {g.hoco}</button>
        <h2 className="pb-titel"><span className={"pb-art pb-art--" + art}>{artVon(art).kurz}</span> {artVon(art).name} {g.hoco}{w.fa_nr ? " · FA " + w.fa_nr : ""}</h2>
        <span className="klein" id="pb-stand">{stand}</span>
        <button type="button" className="knopf knopf--klein" onClick={drucken}>⬇ PDF</button>
        {darf() ? <button type="button" className="knopf knopf--klein" onClick={loeschen}>Löschen</button> : null}
      </div>
      <KopfRaster kopf={w.kopf.vorlage || {}} />
      <div className="pb-felder">
        <label className={!String(w.fa_nr || "").trim() ? "pb-pflicht" : ""}>FA Nr.<input value={w.fa_nr || ""} disabled={!schreibt} onChange={(x) => setzen("fa_nr", x.target.value)} /></label>
        <label>Datum<input type="date" value={w.datum || ""} disabled={!schreibt} onChange={(x) => setzen("datum", x.target.value)} /></label>
        <label>Maschine<input value={w.kopf.maschine || ""} placeholder={(w.kopf.vorlage || {}).maschine || ""} disabled={!schreibt} onChange={(x) => kopfSetzen("maschine", x.target.value)} /></label>
        {art === "aql" ? <AqlKopf k={w.kopf} schreibt={schreibt} setzen={kopfSetzen} werte={w.werte} /> : null}
      </div>

      {art === "aql" ? <AqlTabelle zeilen={zeilen} w={w} schreibt={schreibt} aendern={aendern} />
        : art === "ll" ? <LlTabelle zeilen={zeilen} w={w} schreibt={schreibt} aendern={aendern} />
        : <TeileTabelle zeilen={zeilen} w={w} schreibt={schreibt} aendern={aendern} />}

      <div className="pb-ende">
        <div className="pb-ergebnis">
          <span className="pb-gruen">{e.gut} i.O.</span>
          {e.schlecht ? <span className="pb-rot">{e.schlecht} n.i.O.</span> : null}
          {e.offen && art !== "ll" ? <span>{e.offen} leer</span> : null}
        </div>
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
        <label>Visum<input value={w.visum || ""} maxLength={6} disabled={!schreibt} onChange={(x) => setzen("visum", x.target.value.toUpperCase())} /></label>
        {darf() ? (zu
          ? <button type="button" className="knopf" onClick={wiederOeffnen}>Wieder bearbeiten</button>
          : <button type="button" className="knopf knopf--haupt" id="pb-abschliessen" onClick={abschliessen}>Abschliessen</button>) : null}
        {zu ? <span className="klein">Abgeschlossen {zeitText(w.abgeschlossen_am)}</span> : null}
      </div>
    </div>
  );
}

// Ein Ist-Feld mit Farbe gut/schlecht
function IstFeld({ wert, t, an, setzen, name }) {
  const e = istPruefen(wert, t);
  return <input className={"pb-ist" + (e ? " pb-ist--" + e : "")} value={wert || ""} disabled={!an} data-pbist={name}
    inputMode="decimal" onChange={(x) => setzen(x.target.value)} />;
}

function SollZelle({ z }) {
  const t = toleranz(z.soll);
  return <><td className="pb-nr">{z.nr}</td><td className="pb-soll">{z.soll}</td><td className="pb-tol">{t ? toleranzText(t) : ""}</td></>;
}

// Erstteilprüfung / Endkontrolle: 5 Teile, alle Masse
function TeileTabelle({ zeilen, w, schreibt, aendern }) {
  const setze = (id, i, v) => aendern((x) => {
    const a = [...(x.werte[id] || [])]; a[i] = v;
    return { ...x, werte: { ...x.werte, [id]: a } };
  });
  return (
    <div className="pb-tabelle-huelle">
      <table className="pb-tabelle" id="pb-tabelle">
        <thead><tr><th>Nr.</th><th>Soll</th><th>Toleranz</th>{[...Array(TEILE)].map((_, i) => <th key={i}>Teil {i + 1}</th>)}<th>Prüfmittel</th></tr></thead>
        <tbody>
          {zeilen.map((z) => z.abschnitt
            ? <tr key={z.id} className="pb-abschnitt"><td colSpan={TEILE + 4}>{z.abschnitt}</td></tr>
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
      <table className="pb-tabelle" id="pb-tabelle">
        <thead><tr><th>Nr.</th><th>Soll</th><th>Toleranz</th><th>Geprüft</th><th>davon n.i.O.</th><th>Min. gemessen</th><th>Max. gemessen</th><th>Prüfmittel</th></tr></thead>
        <tbody>
          {zeilen.map((z) => {
            if (z.abschnitt) return <tr key={z.id} className="pb-abschnitt"><td colSpan={8}>{z.abschnitt}</td></tr>;
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
          <tr><th>Nr.</th><th>Soll</th><th>Toleranz</th>
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
          <tr className="pb-visum"><td colSpan={3}>Visum</td>
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
      if (z.abschnitt) return "<tr class='ab'><td colspan='8'>" + h(z.abschnitt) + "</td></tr>";
      const x = w.werte[z.id] || {}, t = toleranz(z.soll);
      return "<tr><td>" + h(z.nr) + "</td><td>" + h(z.soll) + "</td><td>" + h(t ? toleranzText(t) : "") + "</td><td>" + h(x.geprueft || (plan ? plan.n : "")) + "</td><td"
        + (Number(x.nio) > 0 ? " style='color:#c00;font-weight:700'" : "") + ">" + h(x.nio) + "</td><td" + farbe(x.min, t) + ">" + h(x.min) + "</td><td" + farbe(x.max, t) + ">" + h(x.max) + "</td><td>" + h(z.pm) + "</td></tr>";
    }).join("");
  } else if (art === "ll") {
    const aus = new Set(k.auswahl || []), proben = (w.werte || {}).proben || [];
    kopfZ = proben.map((p) => "<th>" + h(datumText(p.datum)) + "<br>" + h(p.zeit) + "</th>").join("");
    koerper = zeilen.filter((z) => !z.abschnitt && aus.has(z.id)).map((z) => {
      const t = toleranz(z.soll);
      return "<tr><td>" + h(z.nr) + "</td><td>" + h(z.soll) + "</td><td>" + h(t ? toleranzText(t) : "") + "</td>"
        + proben.map((p) => "<td" + farbe((p.w || {})[z.id], t) + ">" + h((p.w || {})[z.id]) + "</td>").join("") + "<td>" + h(z.pm) + "</td></tr>";
    }).join("") + "<tr><td colspan='3'>Visum</td>" + proben.map((p) => "<td>" + h(p.visum) + "</td>").join("") + "<td></td></tr>";
  } else {
    kopfZ = [...Array(TEILE)].map((_, i) => "<th>Teil " + (i + 1) + "</th>").join("");
    koerper = zeilen.map((z) => {
      if (z.abschnitt) return "<tr class='ab'><td colspan='" + (TEILE + 4) + "'>" + h(z.abschnitt) + "</td></tr>";
      const t = toleranz(z.soll), a = w.werte[z.id] || [];
      return "<tr><td>" + h(z.nr) + "</td><td>" + h(z.soll) + "</td><td>" + h(t ? toleranzText(t) : "") + "</td>"
        + [...Array(TEILE)].map((_, i) => "<td" + farbe(a[i], t) + ">" + h(a[i]) + "</td>").join("") + "<td>" + h(z.pm) + "</td></tr>";
    }).join("");
  }
  const plan = art === "aql" ? aqlPlan(k.los, k.aql, k.niveau) : null;
  const felder = [["HOCO Nr.", hoco], ["FA Nr.", w.fa_nr], ["Artikel", v.bezeichnung], ["Zeichnung", v.zeichnung], ["Index", v.index],
    ["Maschine", k.maschine || v.maschine], ["Automat", v.typ], ["Datum", datumText(w.datum)], ["Allg. Toleranz", v.alltol]]
    .concat(plan ? [["Losgrösse", alt.zahlText(Number(k.los))], ["AQL / Niveau", k.aql + " / " + (k.niveau || "II")], ["Stichprobe", plan.n + " Stk, Ac " + plan.ac + " / Re " + plan.re]] : []);
  const e = auswerten(w);
  return "<style>"
    + ".pbp{font-family:Arial,sans-serif;color:#111;font-size:9pt}.pbp .brief{background:#003884;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;height:30mm;box-sizing:border-box}"
    + ".pbp .brief img{height:16mm}.pbp .brief .sg{height:18mm}.pbp .brief div{font-size:7.5pt;line-height:1.35}.pbp .brief b{font-size:8.5pt}"
    + ".pbp h1{font-size:15pt;margin:10px 0 6px}.pbp .kf{display:grid;grid-template-columns:repeat(4,1fr);gap:3px 12px;margin-bottom:8px}.pbp .kf small{color:#666;display:block;font-size:7pt}"
    + ".pbp table{width:100%;border-collapse:collapse}.pbp th,.pbp td{border:1px solid #999;padding:2px 4px;text-align:left;font-size:8pt}.pbp th{background:#e8eef6}.pbp tr.ab td{background:#f3f3f3;font-weight:700}"
    + ".pbp .fuss{display:flex;gap:24px;margin-top:10px}.pbp .fuss div{flex:1}</style>"
    + "<div class='pbp'><div class='brief'>" + (alt.LOGO_BRIEF ? "<img src='" + alt.LOGO_BRIEF + "'>" : "")
    + "<div><b>Hofer + Co. Präzisionsdrehteile</b><br>Lohn-Ammannsegg</div>" + (alt.SIEGEL_BRIEF ? "<img class='sg' src='" + alt.SIEGEL_BRIEF + "'>" : "") + "</div>"
    + "<h1>Prüfprotokoll · " + h(artVon(art).name) + "</h1>"
    + "<div class='kf'>" + felder.filter(([, x]) => x).map(([n, x]) => "<div><small>" + h(n) + "</small>" + h(x) + "</div>").join("") + "</div>"
    + "<table><thead><tr><th>Nr.</th><th>Soll</th><th>Toleranz</th>" + kopfZ + "<th>Prüfmittel</th></tr></thead><tbody>" + koerper + "</tbody></table>"
    + "<div class='fuss'><div><b>Ergebnis:</b> " + e.gut + " i.O." + (e.schlecht ? ", " + e.schlecht + " n.i.O." : "") + "</div>"
    + "<div><b>Prüf-Entscheid:</b> " + h(entscheidText(w.entscheid)) + "</div><div><b>Visum:</b> " + h(w.visum) + "</div></div>"
    + (w.bemerkung ? "<p><b>Bemerkung:</b> " + h(w.bemerkung) + "</p>" : "") + "</div>";
}
