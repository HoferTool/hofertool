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
//  Seit 1.700.0 nochmals neu (Wunsch Patrick 22. November 2026: „was
//  auf der Maschine läuft muss man gerade nicht wissen, eher
//  Bestellungen, Mat. Bestellungen, Kalender besser, Probleme und
//  Notizen“, „Zeit ganz rechts, dann Planwand“, „vier Vierecke statt
//  drei Zeilen“, „oben kein Balken mehr, Logo gross“, „Solar soll
//  nicht so herausstechen“): keine Kopfzeile der App, eigener Kopf mit
//  Menüfeld, Logo, Pad Mode, Einstellungen, Wetter, Planwand und Uhr;
//  Admins öffnen Planwand und Planer zusammen in einem Tab (kombiTab.js).
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { problemeLaden } from "./start/Karten.jsx";
import Notizen, { neueNotiz, notizBearbeiten } from "./start/Notizen.jsx";
import Systemzustand from "./start/Systemzustand.jsx";
import { Solaranlage } from "./Start.jsx";
import { kalenderLaden, kommendeTermine, naechsteTermine, countdownText } from "../daten/kalender.js";
import { kombiDarf, planungOeffnen } from "../planwand/kombiTab.js";
import { kalenderOeffnen, kalenderDarf } from "./Kalender.jsx";
import { einkaufOeffnen } from "./Einkauf.jsx";
import { planerLaden, zuBestellen } from "../daten/planer.js";

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

function Karte({ id, titel, unter, farbe, breit, voll, mehr, plus, children }) {
  return (
    <section className={"db2-karte" + (breit ? " db2-karte--breit" : "") + (voll ? " db2-karte--voll" : "")} data-db2={id} style={{ "--db2-farbe": farbe }}>
      <header className="db2-karte__kopf">
        <i className="db2-punkt" />
        <h2>{titel}</h2>
        {unter && <span className="db2-karte__unter">{unter}</span>}
        {plus && <button type="button" className="db2-mehr db2-mehr--plus" data-db2-plus={id} aria-label="Neu" onClick={plus}>+</button>}
        {mehr && <button type="button" className="db2-mehr" data-db2-mehr={id} onClick={mehr}>Alle</button>}
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
// Seit 1.700.0 (Wunsch Patrick 22. November 2026: „was auf der Maschine
// läuft, muss man gerade nicht wissen, eher Bestellungen, Material-
// bestellungen, Kalender etwas besser, Probleme und Notizen“)

async function termineLaden() {
  const eintraege = await kalenderLaden();
  const heute = alt.isoDatum(new Date());
  const tag = (alt.ausIso(heute).getDay() + 6) % 7;            // Mo = 0
  const montag = alt.plusTage(heute, -tag);
  const tage = Array.from({ length: 14 }, (_, i) => alt.plusTage(montag, i));
  const liste = naechsteTermine(eintraege, 14 - tag, heute);
  const jeTag = {};
  liste.forEach((t) => { (jeTag[t.datum] = jeTag[t.datum] || []).push(t); });
  const countdown = kommendeTermine(eintraege.filter((e) => e.countdown), 0)
    .filter((t) => t.tage > 14 - tag);
  return { heute, tage, jeTag, anzahl: liste.length, countdown };
}

function Zahlen({ takt }) {
  const p = useDaten(problemeLaden, [takt]).daten;
  const b = useDaten(bestellungenLaden, [takt]).daten;
  const m = useDaten(materialLaden, [takt]).daten;
  const t = useDaten(termineLaden, [takt]).daten;
  const z = (wert, text, warn, id, ziel) => (
    <button type="button" className={"db2-zahl" + (warn ? " db2-zahl--warn" : "")} data-db2-zahl={id}
      onClick={() => { const k = document.querySelector('[data-db2="' + ziel + '"]'); if (k) k.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
      <b>{wert == null ? "…" : wert}</b><span>{text}</span>
    </button>);
  return (
    <div className="db2-zahlen">
      {z(b && zahl(b.offen.length), "Positionen zu bestellen", b && b.offen.length > 0, "bestellen", "bestellungen")}
      {z(m && zahl(m.length), "Aufträge ohne Material", m && m.length > 0, "material", "material")}
      {z(p && zahl(p.length), "Probleme offen", p && p.length > 0, "probleme", "probleme")}
      {z(t && zahl(t.anzahl), "Termine in 14 Tagen", false, "termine", "kalender")}
    </div>
  );
}

function PositionZeile({ z }) {
  return (
    <div className="db2-zeile db2-zeile--still">
      <span className="db2-zeile__mitte">
        <b>{(z.articles && z.articles.article_number) || "–"}</b>
        <small>{(z.articles && (z.articles.description || z.articles.name)) || z.note || ""}</small>
      </span>
      <span className="db2-rechts"><b>{zahl(z.quantity)} {(z.articles && z.articles.unit) || ""}</b>
        {z.needed_by && <small>bis {kurz(z.needed_by)}</small>}</span>
    </div>);
}

function Bestellungen({ takt, neu }) {
  const { daten, fehler } = useDaten(bestellungenLaden, [takt]);
  const max = daten ? Math.max(1, ...daten.gruppen.map((g) => g.l.length)) : 1;
  const gruppeZeigen = (gruppen, titel, unter) => fenster((zu) => (
    <Fenster titel={titel} unter={unter} farbe="#db2777" zu={zu} extern="bestellungen">
      {gruppen.map((g) => (
        <div key={g.name} className="db2-gruppe" data-db2-lieferant={g.name}>
          <h3>{g.name} <small>{g.l.length}</small></h3>
          <div className="db2-liste">{g.l.map((z) => <PositionZeile key={z.id} z={z} />)}</div>
        </div>))}
      {!gruppen.length && <p className="db2-leer">Nichts.</p>}
    </Fenster>), neu);
  const unterwegsZeigen = (d) => {
    const je = {};
    d.unterwegs.forEach((z) => { const n = d.lieferant(z); (je[n] = je[n] || []).push(z); });
    gruppeZeigen(Object.entries(je).map(([name, l]) => ({ name, l })).sort((a, b) => a.name.localeCompare(b.name)),
      "Bestellt, unterwegs", zahl(d.unterwegs.length) + " Positionen");
  };
  return (
    <Karte id="bestellungen" titel="Bestellungen" farbe="#db2777" breit
      unter={daten ? zahl(daten.offen.length) + " zu bestellen bei " + zahl(daten.gruppen.length) + " Lieferanten" : ""}
      mehr={daten ? () => gruppeZeigen(daten.gruppen, "Zu bestellen", zahl(daten.offen.length) + " Positionen") : null}>
      <Laedt d={daten} fehler={fehler}>{(d) => <>
        {d.gruppen.length
          ? <div className="db2-lief">{d.gruppen.slice(0, 6).map((g) => (
              <button key={g.name} type="button" className="db2-lief__zeile" data-db2-lieferant={g.name}
                onClick={() => gruppeZeigen([g], g.name, zahl(g.l.length) + " Positionen zu bestellen")}>
                <span className="db2-lief__kopf">
                  <b>{g.name}</b>
                  <span className="db2-lief__bahn"><i style={{ width: g.l.length / max * 100 + "%" }} /></span>
                  <span className="db2-lief__zahl">{g.l.length}</span>
                </span>
                <small className="db2-lief__artikel">{g.l.slice(0, 3).map((z) => (z.articles && z.articles.article_number) || "–").join(" · ")}{g.l.length > 3 ? " …" : ""}</small>
              </button>))}
              {d.gruppen.length > 6 && <p className="db2-klein-text">und {d.gruppen.length - 6} weitere Lieferanten</p>}
            </div>
          : <p className="db2-leer db2-gut">✓ Keine offenen Positionen.</p>}
        <div className="db2-fuss">
          <button type="button" className="db2-knopf" data-db2-unterwegs="" onClick={() => unterwegsZeigen(d)}>
            {zahl(d.unterwegs.length)} bestellt, unterwegs</button>
          <button type="button" className="db2-knopf" onClick={() => tabOeffnen("bestellungen")}>Neue Bestellung ↗</button>
        </div>
      </>}</Laedt>
    </Karte>
  );
}

function Material({ takt, neu }) {
  const { daten, fehler } = useDaten(materialLaden, [takt]);
  const zeile = (z) => (
    <button key={z.j.id} type="button" className={"db2-zeile db2-mat" + (z.zuSpaet ? " db2-zeile--rot" : "")}
      data-db2-material={z.j.id} onClick={() => auftragOeffnen(z.j, neu)}>
      <span className="db2-datum">{kurz(z.start)}</span>
      <span className="db2-zeile__mitte">
        <b>{z.j.job_number} <small className="db2-grau">· {z.maschine}</small></b>
        <small><Werkstoff j={z.j} />{z.j.material_bez}</small>
      </span>
      <span className="db2-rechts">
        <b>{z.fehltKg ? "noch " + zahl(z.fehltKg) + " kg" : z.bedarf ? zahl(z.bedarf.kg) + " kg" : z.ohneBedarf}</b>
        <small>{z.zuSpaet ? <span className="db2-rot">zu spät!</span> : null}{z.zuSpaet ? " · " : ""}{z.lieferant || "Lieferant offen"}</small>
      </span>
    </button>);
  const alle = (l) => fenster((zu) => (
    <Fenster titel="Material bestellen" unter="Aufträge der nächsten 2 Wochen" farbe="#ea580c" zu={zu} extern="planer">
      <div className="db2-liste">{l.map(zeile)}</div>
    </Fenster>), neu);
  return (
    <Karte id="material" titel="Material bestellen" farbe="#ea580c" breit
      unter={daten ? zahl(daten.length) + " Aufträge in den nächsten 2 Wochen" : ""}
      mehr={daten && daten.length ? () => alle(daten) : null}>
      <Laedt d={daten} fehler={fehler}>{(l) => l.length
        ? <div className="db2-liste db2-liste--spalten">{l.slice(0, 6).map(zeile)}</div>
        : <p className="db2-leer db2-gut">✓ Für die nächsten 2 Wochen ist alles da oder bestellt.</p>}</Laedt>
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
        ? <ProblemZeilen liste={l.slice(0, 4)} neu={neu} />
        : <p className="db2-leer db2-gut">✓ Keine Probleme gemeldet.</p>}</Laedt>
    </Karte>
  );
}

// Kalender: zwei Wochen ab Montag als Raster, heute hervorgehoben
function Termine({ takt, neu }) {
  const { daten, fehler } = useDaten(termineLaden, [takt]);
  const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <Karte id="kalender" titel="Kalender" farbe="#0891b2" breit voll unter="diese und nächste Woche"
      mehr={kalenderDarf() ? () => kalenderOeffnen(neu) : null}>
      <Laedt d={daten} fehler={fehler}>{(d) => <>
        <div className="db2-kal" data-db2-kalender="">
          {d.tage.map((t, i) => {
            const liste = d.jeTag[t] || [];
            const vorbei = t < d.heute;
            return (
              <div key={t} className={"db2-kal__tag" + (t === d.heute ? " db2-kal__tag--heute" : "")
                + (vorbei ? " db2-kal__tag--vorbei" : "") + (i % 7 > 4 ? " db2-kal__tag--we" : "")}>
                <div className="db2-kal__kopf"><span>{WT[i % 7]}</span><b>{alt.ausIso(t).getDate()}</b></div>
                {liste.slice(0, 3).map((x) => <span key={x.eintrag.id} className="db2-kal__eintrag" title={x.eintrag.titel}>{x.eintrag.titel}</span>)}
                {liste.length > 3 && <span className="db2-kal__mehr">+{liste.length - 3}</span>}
              </div>);
          })}
        </div>
        {d.countdown.length > 0 && <div className="db2-kal__countdown">
          {d.countdown.map((x) => <span key={x.eintrag.id}><b>{x.eintrag.titel}</b> {kurz(x.datum)} · {countdownText(x)}</span>)}
        </div>}
      </>}</Laedt>
    </Karte>
  );
}

function NotizKarte({ takt, neu }) {
  const { daten, fehler } = useDaten(() => alt.ladeTodos(), [takt]);
  const alle = () => fenster((zu) => <Fenster titel="Notizen" farbe="#ca8a04" zu={zu}><Notizen auffrischen={0} /></Fenster>, neu);
  return (
    <Karte id="notizen" titel="Notizen" farbe="#ca8a04" unter={daten ? zahl(daten.length) + " offen" : ""} mehr={alle}
      plus={intern() ? () => neueNotiz(neu) : null}>
      <Laedt d={daten} fehler={fehler}>{(l) => l.length
        ? <div className="db2-notizen">{l.slice(0, 4).map((n) => (
            <button key={n.id} type="button" className="db2-notiz" data-db2-notiz={n.id} onClick={() => notizBearbeiten(n, neu)}>
              <span className="db2-umbruch">{n.text}</span>
              {n.due_date && <small className={n.due_date < alt.isoDatum(new Date()) ? "db2-rot" : ""}>bis {kurz(n.due_date)}</small>}
            </button>))}</div>
        : <p className="db2-leer">Keine Notizen.</p>}</Laedt>
    </Karte>
  );
}

// ---------- Solar: klein und ruhig (Patrick: „soll nicht so herausstechen“) ----------
function SolarKlein() {
  const [w, setW] = useState(null);
  useEffect(() => {
    const holen = () => alt.solarLaden().then((r) => setW(r.length ? r[r.length - 1] : false), () => setW(false));
    holen();
    const t = setInterval(holen, 60000);
    return () => clearInterval(t);
  }, []);
  if (!w) return null;
  const prod = Number(w.produktion_w) || 0, verb = Number(w.verbrauch_w) || 0, netz = Number(w.netz_w) || 0;
  const eigen = verb > 0 ? Math.round(Math.min(prod, verb) / verb * 100) : 0;
  const gross = () => fenster((zu) => <Fenster titel="Solaranlage" farbe="#65a30d" zu={zu}><Solaranlage ohneId /></Fenster>);
  return (
    <button type="button" className="db2-solar-klein" id="db2-solar" onClick={gross} title="Solaranlage">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M16.9 7.1l1.8-1.8M5.3 18.7l1.8-1.8" /></svg>
      <span><b>{alt.solarKw(prod)}</b> Erzeugung</span>
      <span><b>{alt.solarKw(verb)}</b> Verbrauch</span>
      <span><b>{alt.solarKw(Math.abs(netz))}</b> {netz > 0 ? "Bezug" : "Einspeisung"}</span>
      <span><b>{eigen} %</b> eigen</span>
    </button>
  );
}

// ---------- Menü: vier Vierecke oben links ----------
// Alles, was nicht als Feld auf dem Dashboard steht, und auch diese,
// öffnet man direkt aus diesem Feld (wie das Menü am Handy)
const VIER = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></svg>;
const ZAHNRAD = '<svg viewBox="0 0 24 24" class="navsym" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const TABLET = '<svg viewBox="0 0 24 24" class="navsym" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';
const LUPE = '<svg viewBox="0 0 24 24" class="navsym" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const TUER = '<svg viewBox="0 0 24 24" class="navsym" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';

function menuePunkte(neu) {
  const seiten = alt.SEITEN.filter((s) => !s.gruppe && s.pfad !== "dashboard" && alt.seiteSichtbar(s.pfad))
    .map((s) => ({ id: s.pfad, titel: s.titel, zeichen: s.zeichen, tun: () => tabOeffnen(s.pfad), tab: true }));
  const extra = [];
  if (intern()) extra.push({ id: "einkauf", titel: "Einkaufsliste", zeichen: alt.SYM.einkauf, tun: () => einkaufOeffnen(neu) });
  if (intern() && !(alt.profil && alt.profil.andere_nutzer)) extra.push({ id: "zeit", titel: "HOFERTIME", zeichen: alt.SYM.zeit, tun: hofertimeOeffnen, tab: true });
  extra.push({ id: "pad", titel: "Pad Mode", zeichen: TABLET, tun: () => alt.padOeffnen() });
  extra.push({ id: "einstellungen", titel: "Einstellungen", zeichen: ZAHNRAD, tun: () => alt.einstellungenOeffnen() });
  extra.push({ id: "suche", titel: "Suchen", zeichen: LUPE, tun: () => alt.sucheOeffnen() });
  extra.push({ id: "dashboard", titel: "Bisherige Startseite", zeichen: alt.SYM.start, tun: () => { location.hash = "#/dashboard"; } });
  extra.push({ id: "abmelden", titel: "Abmelden", zeichen: TUER, tun: () => alt.abmelden() });
  return seiten.concat(extra);
}

function Menue({ zu, neu }) {
  const [weg, setWeg] = useState(false);
  const schliessen = () => { setWeg(true); setTimeout(zu, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160); };
  useEffect(() => {
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault(); e.stopPropagation(); schliessen();
    };
    document.addEventListener("keydown", taste, true);
    return () => document.removeEventListener("keydown", taste, true);
  }, []);
  const punkte = menuePunkte(neu);
  return (
    <div className={"db2-menue" + (weg ? " db2-menue--weg" : "")} id="db2-menue">
      <div className="db2-menue__schleier" onClick={schliessen} />
      <div className="db2-menue__feld" role="dialog" aria-label="Menü">
        <div className="db2-menue__kopf">
          <b>Alles öffnen</b>
          <button type="button" className="db2-fenster__zu" aria-label="Schliessen" onClick={schliessen}>✕</button>
        </div>
        <div className="db2-menue__raster">
          {punkte.map((p, i) => (
            <button key={p.id} type="button" className="db2-menue__punkt" data-db2-menuepunkt={p.id} style={{ "--nr": i }}
              onClick={() => { zu(); p.tun(); }}>
              <span className="db2-menue__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.zeichen || "" }} />
              <span className="db2-menue__text">{p.titel}</span>
              {p.tab && mitMaus() && <i className="db2-menue__tab" aria-hidden="true">↗</i>}
            </button>))}
        </div>
      </div>
    </div>
  );
}

function Kopf({ menueAuf }) {
  const [jetzt, setJetzt] = useState(() => new Date());
  const [wetter, setWetter] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 15000);
    alt.holeWetter().then(setWetter, () => setWetter(false));
    return () => clearInterval(t);
  }, []);
  const z = (n) => String(n).padStart(2, "0");
  return (
    <header className="db2-kopf">
      <button type="button" className="db2-menueknopf" id="db2-menueknopf" aria-label="Menü öffnen" title="Menü" onClick={menueAuf}>{VIER}</button>
      <span className="db2-logo" role="img" aria-label="Hofer + Co.">
        <img className="db2-logo--hell" src="logo-empfang.png" alt="" />
        <img className="db2-logo--dunkel" src="logo-weiss.svg" alt="" />
      </span>
      <span className="db2-kopf__luecke" />
      <button type="button" className="db2-kopfknopf" data-db2-pad="" title="Pad Mode" onClick={() => alt.padOeffnen()}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: TABLET }} /><span className="db2-kopfknopf__text">Pad Mode</span></button>
      <button type="button" className="db2-kopfknopf" data-db2-einstellungen="" title="Einstellungen" onClick={() => alt.einstellungenOeffnen()}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: ZAHNRAD }} /><span className="db2-kopfknopf__text">Einstellungen</span></button>
      {wetter && <div className="db2-kopf__wetter"><b>{wetter.temperatur}°</b><span>{wetter.text}</span></div>}
      {alt.seiteSichtbar("planwand") && <button type="button" className="db2-planwand" data-db2-planwand=""
        title={kombiDarf() ? "Planwand und Planer in einem Tab" : "Planwand"} onClick={planungOeffnen}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM.planwand || "" }} />Planwand</button>}
      <div className="db2-kopf__uhr">{z(jetzt.getHours())}:{z(jetzt.getMinutes())}</div>
    </header>
  );
}

function Gruss() {
  const p = alt.profil;
  const name = (p && (p.full_name || p.email.split("@")[0]).split(" ")[0]) || "";
  return (
    <div className="db2-gruss">
      <div>
        <div className="db2-kopf__datum">{new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="db2-kopf__gruss">{alt.begruessung()}{name ? ", " + name : ""}</h1>
      </div>
      <SolarKlein />
    </div>
  );
}

export default function StartModule({ auffrischen }) {
  const [eigen, setEigen] = useState(0);
  const [menue, setMenue] = useState(false);
  const takt = (auffrischen || 0) * 1000 + eigen;
  const neu = () => setEigen((n) => n + 1);
  useEffect(() => {
    document.body.classList.add("db2-modus");
    return () => document.body.classList.remove("db2-modus");
  }, []);
  return (
    <div className="db2" id="db2">
      <Kopf menueAuf={() => setMenue(true)} />
      {menue && <Menue zu={() => setMenue(false)} neu={neu} />}
      <Gruss />
      {alt.istAdmin() && <Systemzustand auffrischen={auffrischen} />}
      <Zahlen takt={takt} />
      <div className="db2-raster" id="db2-raster">
        <Bestellungen takt={takt} neu={neu} />
        <Probleme takt={takt} neu={neu} />
        <Material takt={takt} neu={neu} />
        <NotizKarte takt={takt} neu={neu} />
        <Termine takt={takt} neu={neu} />
      </div>
      {/* Ganz unten und leise, damit die Seite wie die echte Startseite wirkt (Patrick 22. November 2026) */}
      <div className="db2-vorschau" id="sm-vorschau">
        <span>Testseite</span> · <a href="#/dashboard">jetzige Startseite</a>
      </div>
    </div>
  );
}
