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

import { useEffect, useState } from "react";
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
      <SolarKlein />
    </div>
  );
}

// Eine Zelle im Raster; ohne Karte darin (nichts zu melden, lädt noch)
// fällt sie weg, damit keine Lücke bleibt
const Z = ({ voll, children }) => <div className={"db3-zelle" + (voll ? " db3-zelle--voll" : "")}>{children}</div>;

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
        <Z voll><Bestellstand auffrischen={a} /></Z>
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
