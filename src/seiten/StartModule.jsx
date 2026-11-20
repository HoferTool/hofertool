// =================================================================
//  STARTSEITE MIT MODULEN (Vorschau, seit 1.670.0)
//  Wunsch Patrick 20. November 2026: „will nicht, dass alle Reiter
//  einfach aufgelistet werden … nach Anmelden Startseite … eine
//  Oberfläche mit Modulen, z.B. HOFERTIME, Planung (Planwand, Material,
//  QS), Produktion … zuerst eine Vorschauseite bauen, dann übernehmen“.
//  #/startneu zeigt die bisherige Startseite, dazu nach dem Gruss die
//  Module. Jedes Modul fasst Seiten und Reiter zusammen; was die Person
//  nicht sehen darf, fehlt (seiteSichtbar), ein leeres Modul ganz.
//  Das Menü links bleibt bis zum Entscheid wie es ist; der Schalter
//  „Ohne Menü ansehen“ blendet es nur für diese Seite aus.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import Start from "./Start.jsx";
import { reiterWaehlen, UNTERREITER } from "../huelle/unterreiter.js";
import { einkaufOeffnen } from "./Einkauf.jsx";
import { planerSichtbar, planerTabOeffnen } from "../pad/planerTab.js";

const seite = (pfad, text) => ({ pfad, text });
const reiter = (pfad, wert, titel, text) => ({ pfad, wert, titel, text });

function hofertimeOeffnen() {
  const basis = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
  const w = window.open(basis + "hofertime/", "hofertime");
  if (!w) location.href = basis + "hofertime/";
}

const keinDienst = () => alt.meineRolle() !== "dienst";
const intern = () => !alt.istExtern() && keinDienst();

// Die Module der Reihe nach. farbe: Akzent der Kachel.
export const MODULE = [
  { id: "planung", titel: "Planung", zeichen: "planwand", farbe: "#003884",
    text: "Aufträge einplanen, Material und Bestellungen",
    punkte: [
      seite("planwand", "Aufträge auf den Maschinen"),
      { titel: "Planer", zeichen: "kalender", text: "Todos und Material der nächsten Wochen",
        sichtbar: planerSichtbar, tun: planerTabOeffnen },
      seite("material", "Restmaterial im Haus"),
      seite("bestellungen", "Werkzeug und Zubehör bestellen"),
      seite("lager", "Eigene Teile an Lager"),
      { titel: "Einkaufsliste", zeichen: "einkauf", text: "Was im Laden fehlt", sichtbar: intern, tun: einkaufOeffnen },
    ] },
  { id: "produktion", titel: "Produktion", zeichen: "produktion", farbe: "#1f7a4d",
    text: "Stückzahlen, Maschinen und Pad Mode",
    punkte: [
      reiter("produktion", "erfassen", "Stückzahlen erfassen", "Woche und Tag je Maschine"),
      reiter("produktion", "richten", "Infos zum Richten", "Einrichtblätter suchen"),
      reiter("produktion", "keyence", "Keyence Berichte", "Messberichte vom Bildmessgerät"),
      reiter("produktion", "statistik", "Statistik", "Ausstoss, Auslastung, Fortschritt"),
      seite("maschinen", "Parks, Typen, Wartung, Batterien"),
      { titel: "Pad Mode", zeichen: "start", text: "Ansicht für die Tablets an der Maschine",
        sichtbar: keinDienst, tun: () => alt.padOeffnen() },
    ] },
  { id: "qualitaet", titel: "Qualität", zeichen: "pruefmittel", farbe: "#b5761a",
    text: "Ausschuss, Prüfmittel und QM-System",
    punkte: [
      reiter("qs", "ausschuss", "Ausschussmeldungen", "Offene Meldungen quittieren"),
      reiter("qs", "pruefmittel", "Prüfmittel", "Wo ist welches Prüfmittel"),
      seite("qmalt", "Handbuch, Audits, Abweichungen"),
    ] },
  { id: "technik", titel: "Technik / NC", zeichen: "nc", farbe: "#5b3fa0",
    text: "Programmieren, 3D und Einlagen",
    punkte: [
      reiter("nc", "cam", "HOFERCAM", "Programme für die Star"),
      reiter("nc", "kontur", "HOFERCONTUR", "Drehkontur zeichnen"),
      seite("nc", "Alle NC-Module und Rechner"),
      seite("hofer2dto3d", "Zeichnung zu STEP"),
      seite("einlagen", "Einlagen für Werkzeuge"),
    ] },
  { id: "hofertime", titel: "HOFERTIME", zeichen: "zeit", farbe: "#0a7ea4",
    text: "Kommen / Gehen, Gleitzeit und Ferien",
    punkte: [
      { titel: "HOFERTIME öffnen", zeichen: "zeit", text: "Eigene App im neuen Tab",
        sichtbar: () => intern() && !(alt.profil && alt.profil.andere_nutzer), tun: hofertimeOeffnen },
    ] },
  { id: "buero", titel: "Büro", zeichen: "kalkulation", farbe: "#6b7686",
    text: "Kalkulation und Verwaltung",
    punkte: [
      seite("kalkulation", "Preise wie im Gewatec"),
      { titel: "Einstellungen", zeichen: "einstellungen", text: "Nutzer, Dokumente, Backup",
        tun: () => alt.einstellungenOeffnen() },
    ] },
  { id: "anzeigen", titel: "Anzeigen", zeichen: "bildschirme", farbe: "#a23b5e",
    text: "Bildschirme in der Firma",
    punkte: [
      seite("infoboard", "Grosser Bildschirm hochkant"),
      seite("empfang", "Bildschirm am Empfang"),
      seite("pausenraum", "Bildschirm im Pausenraum"),
    ] },
  { id: "freizeit", titel: "Freizeit", zeichen: "reihen", farbe: "#3d8a2a",
    text: "Für zwischendurch",
    punkte: [seite("reihen", "Reihen üben")] },
];

// Ein Punkt mit Titel, Zeichen, sichtbar und tun, aus der Seite ergänzt
function punktFertig(p) {
  if (!p.pfad) return { ...p, zeichenSvg: alt.SYM[p.zeichen] || "",
    darf: p.sichtbar ? p.sichtbar() : true };
  const s = alt.SEITEN.find((x) => x.pfad === p.pfad);
  if (!s) return { darf: false };
  let darf = alt.seiteSichtbar(p.pfad);
  // Reiter, die die Person dort nicht hat (Prüfmittel nur Admins …), fehlen
  if (darf && p.wert) darf = !!UNTERREITER[p.pfad] && UNTERREITER[p.pfad].liste().some(([w]) => w === p.wert);
  return {
    titel: p.titel || s.titel, text: p.text, zeichenSvg: s.zeichen, darf,
    tun: () => { if (p.wert) reiterWaehlen(p.pfad, p.wert, false); else location.hash = "#/" + p.pfad; },
  };
}

export function sichtbareModule() {
  return MODULE.map((m) => ({ ...m, punkte: m.punkte.map(punktFertig).filter((p) => p.darf) }))
    .filter((m) => m.punkte.length);
}

function ModulKachel({ m, offen, umschalten }) {
  const zeichen = alt.SYM[m.zeichen] || "";
  return (
    <section className={"sm-modul" + (offen ? " sm-modul--offen" : "")} style={{ "--sm-farbe": m.farbe }}
      data-modul={m.id}>
      <button type="button" className="sm-modul__kopf" onClick={umschalten} aria-expanded={offen}>
        <span className="sm-modul__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: zeichen }} />
        <span className="sm-modul__name">
          <strong>{m.titel}</strong>
          <small>{m.text}</small>
        </span>
        <span className="sm-modul__zahl">{m.punkte.length}</span>
      </button>
      <ul className="sm-modul__liste">
        {m.punkte.map((p, i) => (
          <li key={i}>
            <button type="button" className="sm-punkt" onClick={p.tun} data-punkt={p.titel}>
              <span className="sm-punkt__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.zeichenSvg }} />
              <span className="sm-punkt__text"><b>{p.titel}</b>{p.text && <small>{p.text}</small>}</span>
              <span className="sm-punkt__pfeil" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Module() {
  const module = sichtbareModule();
  // Am Handy sind die Module zugeklappt, ein Tipp öffnet eines
  const [offen, setOffen] = useState(null);
  return (
    <div className="sm-module" id="sm-module">
      {module.map((m) => (
        <ModulKachel key={m.id} m={m} offen={offen === m.id}
          umschalten={() => setOffen(offen === m.id ? null : m.id)} />
      ))}
    </div>
  );
}

const OHNE_NAV = "hofer.startneu.ohneNav";

export default function StartModule({ auffrischen }) {
  const [ohneNav, setOhneNav] = useState(() => {
    try { return localStorage.getItem(OHNE_NAV) === "1"; } catch (f) { return false; }
  });
  useEffect(() => {
    document.body.classList.toggle("startneu-ohne-nav", ohneNav);
    try { localStorage.setItem(OHNE_NAV, ohneNav ? "1" : "0"); } catch (f) { /* egal */ }
    return () => document.body.classList.remove("startneu-ohne-nav");
  }, [ohneNav]);
  return (
    <>
      <div className="sm-vorschau" id="sm-vorschau">
        <span><b>Vorschau</b> · neue Startseite mit Modulen. Das Menü bleibt, bis du sie übernimmst.</span>
        <label className="sm-vorschau__haken">
          <input type="checkbox" checked={ohneNav} onChange={(e) => setOhneNav(e.target.checked)} />
          Ohne Menü ansehen
        </label>
        <a className="knopf knopf--klein" href="#/dashboard">Zur jetzigen Startseite</a>
      </div>
      <Start auffrischen={auffrischen} module={<Module />} />
    </>
  );
}
