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
//  Seit 1.701.0 (Wunsch Patrick 22. November 2026: „beides kombinieren,
//  was auf dem Start ist soll gleich sein, nicht mehr, nicht weniger,
//  aussehen wie das neue, kein Balken oben, aber trotzdem ein Reiter-
//  menü, Probleme und Kalender nebeneinander, darüber Bestellungen“):
//  dieselben Karten wie die Startseite (Start.jsx), im neuen Look, mit
//  dem Menü links (Klasse db2-nav am body).
// =================================================================

import { useEffect, useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { Probleme, problemeLaden, EinkaufKurz, Bestellstand, Geburtstage,
  geburtstageLaden, geburtstageAufbereiten } from "./start/Karten.jsx";
import Notizen from "./start/Notizen.jsx";
import Materialausgabe from "./start/Materialausgabe.jsx";
import Batterien from "./start/Batterien.jsx";
import Jubilaeen from "./start/Jubilaeen.jsx";
import HeuteOffen from "./start/HeuteOffen.jsx";
import OhneWbg from "./start/OhneWbg.jsx";
import KalenderKarte from "./start/Kalender.jsx";
import Systemzustand from "./start/Systemzustand.jsx";
import NeuesTutorial from "./start/NeuesTutorial.jsx";
import Umfragen from "./start/Umfragen.jsx";
import { Solaranlage } from "./Start.jsx";
import { kombiDarf, planungOeffnen } from "../planwand/kombiTab.js";
import { einkaufOeffnen } from "./Einkauf.jsx";

const intern = () => !alt.istExtern() && alt.meineRolle() !== "dienst";
const mitMaus = () => window.matchMedia && window.matchMedia("(pointer: fine)").matches;
const keineProbleme = async () => [];

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

// ---------- Solar als Karte neben den Bestellungen (seit 1.707.0) ----------
// Wunsch Patrick 22. November 2026: „halb so viel Platz, daneben die
// Ansicht vom Solar mit Diagramm … etwas einfacher, und wenn man
// draufklickt, ein Fenster mit mehr Infos“. Das Fenster bleibt in der App.
function solarPfad(werte, feld, b, h, max) {
  if (werte.length < 2 || !max) return "";
  const t0 = new Date(werte[0].gemessen).getTime(), t1 = new Date(werte[werte.length - 1].gemessen).getTime();
  const dt = Math.max(1, t1 - t0);
  return werte.map((w, i) => {
    const x = ((new Date(w.gemessen).getTime() - t0) / dt) * b;
    const y = h - (Math.max(0, Number(w[feld]) || 0) / max) * (h - 4);
    return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
}
function SolarDiagramm({ werte, b = 300, h = 90, achsen }) {
  const max = Math.max(1, ...werte.map((w) => Math.max(Number(w.produktion_w) || 0, Number(w.verbrauch_w) || 0)));
  const prod = solarPfad(werte, "produktion_w", b, h, max);
  const verb = solarPfad(werte, "verbrauch_w", b, h, max);
  const zeit = (w) => new Date(w.gemessen).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="db3-solar__bild">
      <svg viewBox={"0 0 " + b + " " + h} preserveAspectRatio="none" aria-hidden="true">
        {prod && <path className="db3-solar__flaeche" d={prod + " L" + b + " " + h + " L0 " + h + " Z"} />}
        {prod && <path className="db3-solar__prod" d={prod} vectorEffect="non-scaling-stroke" />}
        {verb && <path className="db3-solar__verb" d={verb} vectorEffect="non-scaling-stroke" />}
      </svg>
      {achsen && werte.length > 1 && <div className="db3-solar__achse"><span>{zeit(werte[0])}</span>
        <span>höchstens {alt.solarKw(max)}</span><span>{zeit(werte[werte.length - 1])}</span></div>}
    </div>
  );
}
// Energie aus den Messpunkten (Trapez), in kWh
function solarKwh(werte, feld) {
  let wh = 0;
  for (let i = 1; i < werte.length; i++) {
    const dt = (new Date(werte[i].gemessen) - new Date(werte[i - 1].gemessen)) / 3600000;
    if (dt <= 0 || dt > 1) continue;
    wh += ((Math.max(0, Number(werte[i][feld]) || 0) + Math.max(0, Number(werte[i - 1][feld]) || 0)) / 2) * dt;
  }
  return (wh / 1000).toFixed(1).replace(".", ",") + " kWh";
}
function SolarFenster({ werte, zu }) {
  const w = werte[werte.length - 1];
  const prod = Number(w.produktion_w) || 0, verb = Number(w.verbrauch_w) || 0, netz = Number(w.netz_w) || 0;
  const spitze = werte.reduce((m, x) => ((Number(x.produktion_w) || 0) > (Number(m.produktion_w) || 0) ? x : m), werte[0]);
  const eigen = verb > 0 ? Math.round(Math.min(prod, verb) / verb * 100) : 0;
  const zahlen = [
    ["Erzeugung jetzt", alt.solarKw(prod)], ["Verbrauch jetzt", alt.solarKw(verb)],
    [netz > 0 ? "Bezug vom Netz" : "Einspeisung ins Netz", alt.solarKw(Math.abs(netz))], ["Eigenanteil jetzt", eigen + " %"],
    ["Erzeugt in 24 h", solarKwh(werte, "produktion_w")], ["Verbraucht in 24 h", solarKwh(werte, "verbrauch_w")],
    ["Spitze in 24 h", alt.solarKw(spitze.produktion_w) + " um " + new Date(spitze.gemessen).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })],
    ["Gemessen", alt.datumZeitKurz(w.gemessen)],
  ];
  return (
    <Fenster titel="Solaranlage" unter="letzte 24 Stunden" farbe="#65a30d" zu={zu}>
      <div className="db3-solarfenster" id="db3-solarfenster">
        <div className="db3-solarfenster__zahlen">
          {zahlen.map(([t, v]) => <div key={t}><span>{t}</span><b>{v}</b></div>)}
        </div>
        <SolarDiagramm werte={werte} b={600} h={180} achsen />
        <div className="db3-solar__legende"><span className="db3-solar__punkt--prod">Erzeugung</span><span className="db3-solar__punkt--verb">Verbrauch</span></div>
        <Solaranlage ohneId />
      </div>
    </Fenster>
  );
}
function SolarKarte({ auffrischen }) {
  const [werte, setWerte] = useState(null);
  useEffect(() => {
    const holen = () => alt.solarLaden().then((r) => setWerte(r), () => setWerte([]));
    holen();
    const t = setInterval(() => { if (!document.querySelector(".dialog-huelle")) holen(); }, 60000);
    return () => clearInterval(t);
  }, [auffrischen]);
  if (!werte || !werte.length) return null;
  const w = werte[werte.length - 1];
  const prod = Number(w.produktion_w) || 0, verb = Number(w.verbrauch_w) || 0, netz = Number(w.netz_w) || 0;
  return (
    <section className="karte db3-solar" id="db3-solar" role="button" tabIndex={0}
      onClick={() => fenster((zu) => <SolarFenster werte={werte} zu={zu} />)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>
      <h2>Solaranlage</h2>
      <div className="db3-solar__werte">
        <div><b>{alt.solarKw(prod)}</b><span>Erzeugung</span></div>
        <div><b>{alt.solarKw(verb)}</b><span>Verbrauch</span></div>
        <div><b>{alt.solarKw(Math.abs(netz))}</b><span>{netz > 0 ? "Bezug" : "Einspeisung"}</span></div>
      </div>
      <SolarDiagramm werte={werte} />
      <div className="db3-solar__legende"><span className="db3-solar__punkt--prod">Erzeugung</span><span className="db3-solar__punkt--verb">Verbrauch</span><span className="db3-solar__mehr">24 h · mehr ›</span></div>
    </section>
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
      {/* Seit 1.706.0 (Wunsch Patrick 22. November 2026): ganz links nur Einstellungen als Zeichen,
          daneben Zeit und Wetter, wo vorher das Kachel-Zeichen stand; kein Planwand-Knopf mehr. */}
      <button type="button" className="db2-kopfknopf db2-kopfknopf--rund" data-db2-einstellungen="" title="Einstellungen"
        aria-label="Einstellungen" onClick={() => alt.einstellungenOeffnen()}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: ZAHNRAD }} /></button>
      <div className="db2-kopf__uhr">{z(jetzt.getHours())}:{z(jetzt.getMinutes())}</div>
      {wetter && <div className="db2-kopf__wetter"><b>{wetter.temperatur}°</b><span>{wetter.text}</span></div>}
      <span className="db2-logo" role="img" aria-label="Hofer + Co.">
        <img className="db2-logo--hell" src="logo-empfang.png" alt="" />
        <img className="db2-logo--dunkel" src="logo-weiss.svg" alt="" />
      </span>
      <span className="db2-kopf__luecke" />
      <button type="button" className="db2-kopfknopf" data-db2-pad="" title="Pad Mode" onClick={() => alt.padOeffnen()}>
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: TABLET }} /><span className="db2-kopfknopf__text">Pad Mode</span></button>
    </header>
  );
}

function Gruss({ kinder }) {
  const p = alt.profil;
  const name = (p && (p.full_name || p.email.split("@")[0]).split(" ")[0]) || "";
  const fei = alt.naechsterFeiertag();
  const feiText = fei ? (fei.tage === 0 ? "Heute ist " + fei.name : fei.tage === 1 ? "Morgen ist " + fei.name
    : fei.name + " in " + fei.tage + " Tagen") : "";
  return (
    <div className="db2-gruss">
      <div>
        <div className="db2-kopf__datum">{new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}
          {feiText && <span className="db3-feiertag"> · {feiText}</span>}</div>
        <h1 className="db2-kopf__gruss">{alt.begruessung()}{name ? ", " + name : ""}</h1>
        {kinder.length > 0 && <div className="db3-geburtstag" id="db3-geburtstag">🎂 Heute hat {kinder.map((k) => k.name).join(" und ")} Geburtstag</div>}
      </div>
    </div>
  );
}

// Eine Zelle im Raster; ohne Karte darin (nichts zu melden, lädt noch)
// fällt sie weg, damit keine Lücke bleibt
// Jede Zelle spannt so viele 4-Punkte-Reihen, wie sie hoch ist: so rücken
// die Felder in ihrer Spalte nach oben, statt auf das Nachbarfeld zu warten
// (Wunsch Patrick 22. November 2026). Wächst eine Karte, rechnet der
// ResizeObserver neu.
const REIHE = 4;
function Z({ voll, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const innen = el.firstElementChild;
    const rechnen = () => {
      const h = el.scrollHeight;
      el.style.gridRowEnd = h > 0 ? "span " + Math.max(1, Math.ceil(h / REIHE)) : "";
    };
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    const mo = new MutationObserver(() => { const n = el.firstElementChild; if (n) ro.observe(n); rechnen(); });
    mo.observe(el, { childList: true });
    if (innen) ro.observe(innen);
    rechnen();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return <div ref={ref} className={"db3-zelle" + (voll ? " db3-zelle--voll" : "")}>{children}</div>;
}

export default function StartModule({ auffrischen }) {
  const [eigen, setEigen] = useState(0);
  const [menue, setMenue] = useState(false);
  const neu = () => setEigen((n) => n + 1);
  const a = (auffrischen || 0) * 1000 + eigen;
  useEffect(() => {
    document.body.classList.add("db2-modus", "db2-nav");
    return () => document.body.classList.remove("db2-modus", "db2-nav");
  }, []);
  const geb = useDaten(geburtstageLaden, [a]);
  const kinder = geburtstageAufbereiten(geb.daten).filter((m) => m.tage === 0);
  const r = alt.meineRolle();
  const probSehen = r !== "extern" && r !== "dienst";
  const prob = useDaten(probSehen ? problemeLaden : keineProbleme, [a, probSehen]);
  return (
    <div className="db2 db3" id="db2">
      <Kopf menueAuf={() => setMenue(true)} />
      {menue && <Menue zu={() => setMenue(false)} neu={neu} />}
      <Gruss kinder={kinder} />
      {/* Dieselben Karten wie die Startseite, nur anders angeordnet */}
      <div className="db3-raster" id="db3-raster">
        {alt.istAdmin() && <Z voll><Systemzustand auffrischen={a} /></Z>}
        <Z voll><NeuesTutorial /></Z>
        <Z voll><HeuteOffen auffrischen={a} /></Z>
        <Z><Bestellstand auffrischen={a} /></Z>
        {intern() && <Z><SolarKarte auffrischen={a} /></Z>}
        {probSehen && <Z><Probleme liste={prob.daten} fehler={prob.fehler} neu={prob.neu} /></Z>}
        <Z><KalenderKarte auffrischen={a} /></Z>
        <Z><OhneWbg auffrischen={a} /></Z>
        <Z><Batterien auffrischen={a} /></Z>
        <Z><Jubilaeen auffrischen={a} /></Z>
        <Z><Umfragen auffrischen={a} /></Z>
        <Z><Materialausgabe auffrischen={a} /></Z>
        <Z><Notizen auffrischen={a} /></Z>
        <Z><EinkaufKurz auffrischen={a} /></Z>
        <Z><Geburtstage leute={geb.daten} fehler={geb.fehler} /></Z>
      </div>
      <div className="db2-vorschau" id="sm-vorschau">
        <span>Testseite</span> · <a href="#/dashboard">jetzige Startseite</a>
      </div>
    </div>
  );
}
