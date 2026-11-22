// =================================================================
//  NEUES DASHBOARD (Vorschau #/startneu)
//  1.670.0 Module, 1.671.0 Aufgaben ohne Menü, 1.672.0 Kacheln mit
//  Fenstern. Seit 1.699.0 ganz neu (Wunsch Patrick 22. November 2026:
//  „man soll nicht mehr haben, was aussieht wie vorher, ganz ein neues
//  Dashboard, dass man auch paar Sachen sehen kann, paar Aufträge, paar
//  Bestellungen, die nötig sind, mit Diagramm“): das Dashboard zeigt
//  selbst Daten (Maschinen, Ausstoss, Material, Bestellungen, Nächste
//  Aufträge), ein Tipp öffnet eine eigene neue Ansicht als Fenster, nie
//  mehr die alte Seite darin. Die übrigen Bereiche und die Planwand
//  öffnen extern in einem eigenen Tab, bis sie neu gebaut sind.
//  Das Menü links ist auf dieser Seite weg (Klasse db2-modus am body).
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { Saeulen } from "../teile/Diagramm.jsx";
import { problemeLaden } from "./start/Karten.jsx";
import Notizen from "./start/Notizen.jsx";
import Systemzustand from "./start/Systemzustand.jsx";
import { Solaranlage } from "./Start.jsx";
import { kalenderLaden, kommendeTermine, wannText } from "../daten/kalender.js";
import { kalenderOeffnen, kalenderDarf } from "./Kalender.jsx";
import { einkaufOeffnen } from "./Einkauf.jsx";
import { planerLaden, zuBestellen } from "../daten/planer.js";
import { statistikLaden, statistikRechnen } from "../daten/statistik.js";

const zahl = (n) => alt.zahlText(Math.round(n || 0));
const intern = () => !alt.istExtern() && alt.meineRolle() !== "dienst";
const kurz = (iso) => iso ? alt.ausIso(String(iso).slice(0, 10)).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "numeric" }) : "";
const ZUSTAND = { laeuft: "läuft", ruesten: "Rüsten", geplant: "geplant", fertig: "fertig" };
const mitMaus = () => window.matchMedia && window.matchMedia("(pointer: fine)").matches;

// Ein Bereich, der noch nicht neu gebaut ist, geht extern in einem
// eigenen Tab auf (am Computer); am Handy auf derselben Seite
function tabOeffnen(pfad) {
  const basis = location.href.split("#")[0].split("?")[0];
  if (mitMaus()) {
    const w = window.open(basis + "#/" + pfad, "hofer-" + pfad.replace(/\W/g, "-"));
    if (w) return;
  }
  location.hash = "#/" + pfad;
}
function hofertimeOeffnen() {
  const basis = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
  if (!window.open(basis + "hofertime/", "hofertime")) location.href = basis + "hofertime/";
}

// ---------- Daten ----------

// Alle offenen Aufträge einmal je Auffrischen, mehrere Teile brauchen sie
let auftraegeGemerkt = { takt: null, p: null };
function auftraegeLaden(takt) {
  if (auftraegeGemerkt.takt === takt && auftraegeGemerkt.p) return auftraegeGemerkt.p;
  const p = (async () => {
    await alt.ladeParks(false);
    const r = await alt.zeitlimit(alt.db.from("planwand").select("*").is("ended_at", null), 12000, "Aufträge");
    if (r.error) throw r.error;
    const alle = (r.data || []).filter((j) => !alt.parkIstExtern(j.park_id) || alt.istAdmin());
    const reihe = (a, b) => (Number(a.maschine_reihenfolge) || 0) - (Number(b.maschine_reihenfolge) || 0)
      || String(a.maschine_nr || "").localeCompare(String(b.maschine_nr || ""), "de", { numeric: true });
    const anMaschine = alle.filter((j) => j.plan_status === "laeuft" || j.plan_status === "ruesten").sort(reihe);
    const heute = alt.isoDatum(new Date());
    const bis = alt.plusTage(heute, 14);
    const naechste = alle.filter((j) => (j.plan_status || "geplant") === "geplant" && j.planned_from
      && j.planned_from <= bis).sort((a, b) => String(a.planned_from).localeCompare(String(b.planned_from)) || reihe(a, b));
    let maschinen = 0;
    try { maschinen = (await alt.ladeMaschinen(false)).filter((m) => !alt.parkIstExtern(m.park_id)).length; } catch { /* nur Zahl */ }
    return { alle, anMaschine, naechste, maschinen };
  })();
  auftraegeGemerkt = { takt, p };
  p.catch(() => { auftraegeGemerkt = { takt: null, p: null }; });
  return p;
}

// Ausstoss der letzten 10 Arbeitstage, ohne heute (wie die Statistik)
async function ausstossLaden() {
  const gestern = alt.plusTage(alt.isoDatum(new Date()), -1);
  const von = alt.plusTage(gestern, -15);
  const r = statistikRechnen(await statistikLaden(von, gestern));
  const tage = r.gesamt.jeTag.filter((t) => ![0, 6].includes(alt.ausIso(t.datum).getDay())).slice(-10);
  return { tage, summe: tage.reduce((s, t) => s + t.stk, 0), stunden: tage.reduce((s, t) => s + t.h, 0) };
}

async function materialLaden() {
  const d = await planerLaden(10);
  const q = d.quittiert || {};
  return d.zeilen.filter((z) => zuBestellen(z) && !q["m" + z.j.id] && !q["z" + z.j.id]);
}

async function bestellungenLaden() {
  const liste = await alt.ladeBestellungen(true);
  const offen = liste.filter((z) => z.status === "offen");
  const unterwegs = liste.filter((z) => z.status !== "offen");
  const lieferant = (z) => (z.suppliers && z.suppliers.name) || (z.articles && z.articles.suppliers && z.articles.suppliers.name) || "Ohne Lieferant";
  const je = {};
  offen.forEach((z) => { const n = lieferant(z); (je[n] = je[n] || []).push(z); });
  const gruppen = Object.entries(je).map(([name, l]) => ({ name, l })).sort((a, b) => b.l.length - a.l.length || a.name.localeCompare(b.name));
  return { offen, unterwegs, gruppen, lieferant };
}

// ---------- Bausteine ----------

function Fenster({ titel, unter, farbe, zu, children, extern }) {
  return (
    <div className="dialog db2-fenster" style={{ "--db2-farbe": farbe }} role="dialog" aria-label={titel}>
      <div className="db2-fenster__kopf">
        <div className="db2-fenster__titel"><h2>{titel}</h2>{unter && <span>{unter}</span>}</div>
        {extern && <button type="button" className="db2-knopf" data-db2-extern="" onClick={() => { zu(); tabOeffnen(extern); }}>Bearbeiten ↗</button>}
        <button type="button" className="db2-fenster__zu" aria-label="Schliessen" data-nein="" onClick={zu}>✕</button>
      </div>
      <div className="db2-fenster__inhalt">{children}</div>
    </div>
  );
}
function fenster(inhalt, fertig) {
  fensterOeffnen((zu) => inhalt(zu), fertig, "db2-huelle");
}

function Karte({ id, titel, unter, farbe, breit, mehr, children }) {
  return (
    <section className={"db2-karte" + (breit ? " db2-karte--breit" : "")} data-db2={id} style={{ "--db2-farbe": farbe }}>
      <header className="db2-karte__kopf">
        <i className="db2-punkt" />
        <h2>{titel}</h2>
        {unter && <span className="db2-karte__unter">{unter}</span>}
        {mehr && <button type="button" className="db2-mehr" data-db2-mehr={id} onClick={mehr}>Alle ↗</button>}
      </header>
      {children}
    </section>
  );
}

function Laedt({ d, fehler, children }) {
  if (d != null) return children(d);
  if (fehler) return <p className="db2-leer">Gerade nicht verfügbar</p>;
  return <div className="db2-laedt-block"><span className="db2-laedt" /><span className="db2-laedt" /></div>;
}

function Fortschritt({ j }) {
  const ziel = Number(j.target_quantity) || 0;
  const stand = Number(j.stand) || 0;
  const p = ziel ? Math.min(100, Math.round(stand / ziel * 100)) : 0;
  return (
    <span className="db2-fort" title={ziel ? zahl(stand) + " von " + zahl(ziel) : ""}>
      <span className="db2-fort__bahn"><i style={{ width: p + "%" }} /></span>
      <span className="db2-fort__text">{ziel ? p + " %" : zahl(stand)}</span>
    </span>
  );
}

function Werkstoff({ j }) {
  const f = alt.auftragFarbe(j);
  return <i className="db2-werkstoff" style={{ background: f ? f.hex : "transparent" }} title={j.material_bez || ""} />;
}

// ---------- Fenster: ein Auftrag ----------

function AuftragAnsicht({ j, zu }) {
  const ziel = Number(j.target_quantity) || 0;
  const stand = Number(j.stand) || 0;
  const offen = Math.max(0, ziel - stand);
  return (
    <Fenster titel={j.job_number || "Auftrag"} unter={"Maschine " + (j.maschine_nr || j.maschine || "–")} farbe="#2563eb" zu={zu}>
      <div className="db2-auftrag">
        <div className="db2-auftrag__zahlen">
          <div><span>Zustand</span><b className={"db2-zustand db2-zustand--" + (j.plan_status || "geplant")}>{ZUSTAND[j.plan_status] || "geplant"}</b></div>
          <div><span>Gemacht</span><b>{zahl(stand)}</b></div>
          <div><span>Noch offen</span><b>{ziel ? zahl(offen) : "–"}</b></div>
          <div><span>Menge</span><b>{ziel ? zahl(ziel) : "–"}</b></div>
        </div>
        {ziel > 0 && <div className="db2-auftrag__fort"><Fortschritt j={j} /></div>}
        <dl className="db2-angaben">
          <dt>Material</dt><dd><Werkstoff j={j} /> {j.material_bez || "–"}</dd>
          <dt>Material da?</dt><dd>{j.material_menge || "nichts eingetragen"}</dd>
          <dt>Geplant</dt><dd>{kurz(j.planned_from)}{j.planned_to ? " bis " + kurz(j.planned_to) : ""}</dd>
          {j.fa_nr && <><dt>FA Nr.</dt><dd>{j.fa_nr}</dd></>}
          {j.abruf_info && <><dt>Abruf</dt><dd className="db2-umbruch">{j.abruf_info}</dd></>}
          {j.problem && <><dt>Problem</dt><dd className="db2-umbruch db2-rot">⚠ {j.problem}</dd></>}
        </dl>
        <div className="db2-knoepfe">
          <button type="button" className="db2-knopf db2-knopf--voll" data-db2-auftragsfenster=""
            onClick={() => { zu(); alt.planAuftragDialog(j, {}); }}>Auftrag bearbeiten</button>
          <button type="button" className="db2-knopf" onClick={() => { zu(); tabOeffnen("planwand"); }}>Planwand ↗</button>
        </div>
      </div>
    </Fenster>
  );
}
const auftragOeffnen = (j, fertig) => fenster((zu) => <AuftragAnsicht j={j} zu={zu} />, fertig);

// ---------- Teile des Dashboards ----------

function Zahlen({ takt }) {
  const a = useDaten(() => auftraegeLaden(takt), [takt]).daten;
  const p = useDaten(problemeLaden, [takt]).daten;
  const b = useDaten(bestellungenLaden, [takt]).daten;
  const z = (wert, text, warn, id) => (
    <div className={"db2-zahl" + (warn ? " db2-zahl--warn" : "")} data-db2-zahl={id}>
      <b>{wert == null ? "…" : wert}</b><span>{text}</span>
    </div>);
  return (
    <div className="db2-zahlen">
      {z(a && zahl(a.anMaschine.filter((j) => j.plan_status === "laeuft").length), a ? "laufen von " + zahl(a.maschinen) + " Maschinen" : "laufen", false, "laufen")}
      {z(a && zahl(a.anMaschine.filter((j) => j.plan_status === "ruesten").length), "am Rüsten", false, "ruesten")}
      {z(p && zahl(p.length), "Probleme offen", p && p.length > 0, "probleme")}
      {z(b && zahl(b.offen.length), "Positionen zu bestellen", b && b.offen.length > 0, "bestellen")}
    </div>
  );
}

function AnMaschinen({ takt, neu }) {
  const { daten, fehler } = useDaten(() => auftraegeLaden(takt), [takt]);
  const zeile = (j) => (
    <button key={j.id} type="button" className="db2-zeile" data-db2-auftrag={j.id} onClick={() => auftragOeffnen(j, neu)}>
      <span className="db2-masch">{j.maschine_nr || "–"}</span>
      <span className="db2-zeile__mitte">
        <b>{j.job_number}{j.problem && <span className="db2-warn" title={j.problem}> ⚠</span>}</b>
        <small><Werkstoff j={j} />{j.material_bez || "ohne Material"}</small>
      </span>
      {j.plan_status === "ruesten" ? <span className="db2-zustand db2-zustand--ruesten">Rüsten</span> : <Fortschritt j={j} />}
    </button>);
  const alle = (d) => fenster((zu) => (
    <Fenster titel="An den Maschinen" unter={zahl(d.anMaschine.length) + " Aufträge"} farbe="#2563eb" zu={zu} extern="planwand">
      <div className="db2-liste">{d.anMaschine.map((j) => zeile(j))}</div>
    </Fenster>), neu);
  return (
    <Karte id="maschinen" titel="An den Maschinen" farbe="#2563eb" breit
      unter={daten ? zahl(daten.anMaschine.length) + " Aufträge" : ""} mehr={daten ? () => alle(daten) : null}>
      <Laedt d={daten} fehler={fehler}>{(d) => d.anMaschine.length
        ? <div className="db2-liste db2-liste--spalten">{d.anMaschine.slice(0, 10).map(zeile)}</div>
        : <p className="db2-leer">Gerade läuft nichts.</p>}</Laedt>
    </Karte>
  );
}

function Ausstoss({ takt }) {
  const { daten, fehler } = useDaten(ausstossLaden, [takt]);
  return (
    <Karte id="ausstoss" titel="Ausstoss" farbe="#16a34a" unter="Stück je Arbeitstag, ohne heute">
      <Laedt d={daten} fehler={fehler}>{(d) => <>
        <div className="db2-zeilezahlen">
          <div><b>{zahl(d.summe)}</b><span>Stück in 10 Tagen</span></div>
          <div><b>{zahl(d.tage.length ? d.summe / d.tage.length : 0)}</b><span>Ø je Tag</span></div>
          {d.stunden > 0 && <div><b>{zahl(d.stunden)}</b><span>Stunden Produktion</span></div>}
        </div>
        <Saeulen id="db2-ausstoss" hoehe={150} wertText={() => ""} werte={d.tage.map((t) => ({ key: t.datum, label: alt.ausIso(t.datum).getDate() + ".",
          wert: t.stk, blass: !t.gemeldet, tip: <><b>{zahl(t.stk)} Stück</b> {kurz(t.datum)}<br />{zahl(t.h)} h · {t.gemeldet} Maschinen gemeldet</> }))}
          format={(n) => n >= 10000 ? Math.round(n / 1000) + "k" : zahl(n)} />
      </>}</Laedt>
    </Karte>
  );
}

function Material({ takt, neu }) {
  const { daten, fehler } = useDaten(materialLaden, [takt]);
  const zeile = (z) => (
    <div key={z.j.id} className={"db2-zeile db2-zeile--still" + (z.zuSpaet ? " db2-zeile--rot" : "")} data-db2-material={z.j.id}>
      <span className="db2-datum">{kurz(z.start)}</span>
      <span className="db2-zeile__mitte">
        <b>{z.j.job_number} <small className="db2-grau">· {z.maschine}</small></b>
        <small><Werkstoff j={z.j} />{z.j.material_bez}</small>
      </span>
      <span className="db2-rechts">
        <b>{z.fehltKg ? "noch " + zahl(z.fehltKg) + " kg" : z.bedarf ? zahl(z.bedarf.kg) + " kg" : z.ohneBedarf}</b>
        <small>{z.lieferant || "Lieferant offen"}{z.zuSpaet ? " · zu spät!" : ""}</small>
      </span>
    </div>);
  const alle = (l) => fenster((zu) => (
    <Fenster titel="Material bestellen" unter="Aufträge der nächsten 2 Wochen" farbe="#ea580c" zu={zu} extern="planer">
      <div className="db2-liste">{l.map(zeile)}</div>
    </Fenster>), neu);
  return (
    <Karte id="material" titel="Material bestellen" farbe="#ea580c" unter={daten ? zahl(daten.length) + " Aufträge" : ""}
      mehr={daten && daten.length ? () => alle(daten) : null}>
      <Laedt d={daten} fehler={fehler}>{(l) => l.length
        ? <div className="db2-liste">{l.slice(0, 5).map(zeile)}</div>
        : <p className="db2-leer db2-gut">✓ Für die nächsten 2 Wochen ist alles da oder bestellt.</p>}</Laedt>
    </Karte>
  );
}

function Bestellungen({ takt, neu }) {
  const { daten, fehler } = useDaten(bestellungenLaden, [takt]);
  const max = daten ? Math.max(1, ...daten.gruppen.map((g) => g.l.length)) : 1;
  const alle = (d) => fenster((zu) => (
    <Fenster titel="Zu bestellen" unter={zahl(d.offen.length) + " Positionen"} farbe="#db2777" zu={zu} extern="bestellungen">
      {d.gruppen.map((g) => (
        <div key={g.name} className="db2-gruppe" data-db2-lieferant={g.name}>
          <h3>{g.name} <small>{g.l.length}</small></h3>
          <div className="db2-liste">{g.l.map((z) => (
            <div key={z.id} className="db2-zeile db2-zeile--still">
              <span className="db2-zeile__mitte">
                <b>{(z.articles && z.articles.article_number) || "–"}</b>
                <small>{(z.articles && (z.articles.description || z.articles.name)) || z.note || ""}</small>
              </span>
              <span className="db2-rechts"><b>{zahl(z.quantity)} {(z.articles && z.articles.unit) || ""}</b>
                {z.needed_by && <small>bis {kurz(z.needed_by)}</small>}</span>
            </div>))}</div>
        </div>))}
      {!d.offen.length && <p className="db2-leer">Nichts zu bestellen.</p>}
    </Fenster>), neu);
  return (
    <Karte id="bestellungen" titel="Zu bestellen" farbe="#db2777"
      unter={daten ? zahl(daten.unterwegs.length) + " bestellt, unterwegs" : ""} mehr={daten ? () => alle(daten) : null}>
      <Laedt d={daten} fehler={fehler}>{(d) => d.gruppen.length
        ? <div className="db2-balken">{d.gruppen.slice(0, 6).map((g) => (
            <button key={g.name} type="button" className="db2-balken__zeile" onClick={() => alle(d)}>
              <span className="db2-balken__name">{g.name}</span>
              <span className="db2-balken__bahn"><i style={{ width: g.l.length / max * 100 + "%" }} /></span>
              <b>{g.l.length}</b>
            </button>))}
            {d.gruppen.length > 6 && <p className="db2-klein-text">und {d.gruppen.length - 6} weitere Lieferanten</p>}
          </div>
        : <p className="db2-leer db2-gut">✓ Keine offenen Positionen.</p>}</Laedt>
    </Karte>
  );
}

function Naechste({ takt, neu }) {
  const { daten, fehler } = useDaten(() => auftraegeLaden(takt), [takt]);
  const zeile = (j) => (
    <button key={j.id} type="button" className="db2-zeile" data-db2-naechster={j.id} onClick={() => auftragOeffnen(j, neu)}>
      <span className="db2-datum">{kurz(j.planned_from)}</span>
      <span className="db2-zeile__mitte"><b>{j.job_number}</b><small><Werkstoff j={j} />{j.material_bez || ""}</small></span>
      <span className="db2-masch db2-masch--klein">{j.maschine_nr || "–"}</span>
    </button>);
  const alle = (l) => fenster((zu) => (
    <Fenster titel="Als Nächstes" unter="geplant in den nächsten 2 Wochen" farbe="#7c3aed" zu={zu} extern="planwand">
      <div className="db2-liste">{l.map(zeile)}</div>
    </Fenster>), neu);
  return (
    <Karte id="naechste" titel="Als Nächstes" farbe="#7c3aed" unter="nächste 2 Wochen"
      mehr={daten && daten.naechste.length ? () => alle(daten.naechste) : null}>
      <Laedt d={daten} fehler={fehler}>{(d) => d.naechste.length
        ? <div className="db2-liste">{d.naechste.slice(0, 5).map(zeile)}</div>
        : <p className="db2-leer">Nichts geplant.</p>}</Laedt>
    </Karte>
  );
}

function ProblemZeilen({ liste, zu, neu }) {
  const darf = alt.darfProblemErledigen();
  return <div className="db2-liste">{liste.map((j) => (
    <div className="db2-zeile db2-zeile--still db2-zeile--rot" key={j.id}>
      <button type="button" className="db2-zeile__mitte db2-knopflos" data-db2-problem={j.id}
        onClick={() => { if (zu) zu(); auftragOeffnen(j, neu); }}>
        <b>{j.job_number}{j.maschine ? " · " + j.maschine : ""}</b>
        <small className="db2-umbruch">{j.problem}</small>
      </button>
      {darf && <button type="button" className="db2-knopf" onClick={() => alt.problemQuittieren(j, null, neu)}>✓ Erledigt</button>}
    </div>))}</div>;
}

function Probleme({ takt, neu }) {
  const { daten, fehler } = useDaten(problemeLaden, [takt]);
  const alle = (l) => fenster((zu) => (
    <Fenster titel="Probleme" unter={zahl(l.length) + " offen"} farbe="#dc2626" zu={zu}>
      {l.length ? <ProblemZeilen liste={l} zu={zu} neu={neu} /> : <p className="db2-leer">Keine Probleme.</p>}
    </Fenster>), neu);
  return (
    <Karte id="probleme" titel="Probleme" farbe="#dc2626" unter={daten && daten.length ? zahl(daten.length) + " offen" : ""}
      mehr={daten && daten.length ? () => alle(daten) : null}>
      <Laedt d={daten} fehler={fehler}>{(l) => l.length
        ? <ProblemZeilen liste={l.slice(0, 3)} neu={neu} />
        : <p className="db2-leer db2-gut">✓ Keine Probleme gemeldet.</p>}</Laedt>
    </Karte>
  );
}

function Termine({ takt, neu }) {
  const { daten, fehler } = useDaten(async () => kommendeTermine(await kalenderLaden(), 14, undefined, 5), [takt]);
  return (
    <Karte id="kalender" titel="Termine" farbe="#0891b2" unter="nächste 2 Wochen" mehr={() => kalenderOeffnen(neu)}>
      <Laedt d={daten} fehler={fehler}>{(t) => t.length
        ? <div className="db2-liste">{t.map((x) => (
            <div key={x.eintrag.id} className="db2-zeile db2-zeile--still">
              <span className="db2-datum">{wannText(x)}</span>
              <span className="db2-zeile__mitte"><b>{x.eintrag.titel}</b></span>
            </div>))}</div>
        : <p className="db2-leer">Keine Termine.</p>}</Laedt>
    </Karte>
  );
}

function NotizKarte({ takt, neu }) {
  const { daten, fehler } = useDaten(() => alt.ladeTodos(), [takt]);
  const alle = () => fenster((zu) => <Fenster titel="Notizen" farbe="#64748b" zu={zu}><Notizen auffrischen={0} /></Fenster>, neu);
  return (
    <Karte id="notizen" titel="Notizen" farbe="#64748b" unter={daten ? zahl(daten.length) : ""} mehr={alle}>
      <Laedt d={daten} fehler={fehler}>{(l) => l.length
        ? <div className="db2-liste">{l.slice(0, 4).map((n) => (
            <button key={n.id} type="button" className="db2-zeile" onClick={alle}>
              <span className="db2-zeile__mitte"><small className="db2-umbruch db2-schwarz">{n.text}</small></span>
            </button>))}</div>
        : <p className="db2-leer">Keine Notizen.</p>}</Laedt>
    </Karte>
  );
}

// Bereiche, die noch nicht neu gebaut sind: öffnen extern im eigenen Tab
const BEREICHE = [
  ["planwand", "Planwand", "planwand"], ["produktion", "Produktion", "produktion"],
  ["bestellungen", "Bestellungen", "bestellungen"], ["material", "Material", "material"],
  ["qs", "Qualität", "pruefmittel"], ["maschinen", "Maschinen", "maschinen"],
  ["nc", "NC-PRO", "nc"], ["lager", "Lager", "lager"], ["kalkulation", "Kalkulation", "kalkulation"],
  ["qmalt", "QMS", "qs"], ["hofer2dto3d", "2D → 3D", "hofer2dto3d"], ["einlagen", "Einlagen", "einlagen"],
  ["bildschirme", "Anzeigen", "bildschirme"], ["reihen", "Zahlensprint", "reihen"],
];

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
        {alt.seiteSichtbar("planwand") && <button type="button" className="db2-planwand" data-db2-planwand=""
          onClick={() => tabOeffnen("planwand")}>
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM.planwand || "" }} />Planwand ↗</button>}
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
  const bereiche = BEREICHE.filter(([pfad]) => alt.seiteSichtbar(pfad));
  const zeit = intern() && !(alt.profil && alt.profil.andere_nutzer);
  return (
    <div className="db2" id="db2">
      <Kopf />
      <div className="db2-solar db2-solar--oben" id="db2-solar"><Solaranlage /></div>
      {alt.istAdmin() && <Systemzustand auffrischen={auffrischen} />}
      <Zahlen takt={takt} />
      <div className="db2-raster" id="db2-raster">
        <AnMaschinen takt={takt} neu={neu} />
        <Ausstoss takt={takt} />
        <Probleme takt={takt} neu={neu} />
        <Material takt={takt} neu={neu} />
        <Bestellungen takt={takt} neu={neu} />
        <Naechste takt={takt} neu={neu} />
        {kalenderDarf() && <Termine takt={takt} neu={neu} />}
        <NotizKarte takt={takt} neu={neu} />
      </div>
      <h2 className="db2-titel">Bereiche <small>öffnen im eigenen Tab</small></h2>
      <div className="db2-weitere">
        {bereiche.map(([pfad, titel, zeichen]) => (
          <button key={pfad} type="button" className="db2-klein" data-db2-bereich={pfad} onClick={() => tabOeffnen(pfad)}>
            <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM[zeichen] || "" }} />
            <span>{titel}</span><i aria-hidden="true">↗</i>
          </button>))}
        {intern() && <button type="button" className="db2-klein" data-db2-bereich="einkauf" onClick={() => einkaufOeffnen(neu)}>
          <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM.einkauf || "" }} />
          <span>Einkaufsliste</span></button>}
        {zeit && <button type="button" className="db2-klein" data-db2-bereich="zeit" onClick={hofertimeOeffnen}>
          <span className="db2-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM.zeit || "" }} />
          <span>HOFERTIME</span><i aria-hidden="true">↗</i></button>}
      </div>
      {/* Ganz unten und leise, damit die Seite wie die echte Startseite wirkt (Patrick 22. November 2026) */}
      <div className="db2-vorschau" id="sm-vorschau">
        <span>Testseite</span> · <a href="#/dashboard">jetzige Startseite</a>
      </div>
    </div>
  );
}
