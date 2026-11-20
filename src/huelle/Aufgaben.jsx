// =================================================================
//  AUFGABEN STATT MENÜ (Vorschau #/startneu, seit 1.671.0)
//  Wunsch Patrick 20. November 2026: „man soll nicht Menüs haben von
//  Anfang an, es soll je nachdem, was man machen will, nur das bieten,
//  was man braucht … ganz neue Struktur“, „Ziel eine App auf dem Handy
//  und darüber alles, oder PC oder wo auch immer“.
//  Die Startseite fragt „Was willst du machen?“. Eine Aufgabe zeigt
//  danach nur ihre Seiten in einer Leiste (Handy unten wie eine App,
//  PC oben), das Menü links ist weg. „Start“ in der Leiste führt zurück.
//  Gilt nur, solange die Aufgabe aus der Vorschau gewählt wurde
//  (sessionStorage), sonst bleibt alles wie bisher.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { reiterWaehlen, reiterAktiv, reiterBeobachten, UNTERREITER } from "./unterreiter.js";
import { einkaufOeffnen } from "../seiten/Einkauf.jsx";
import { planerSichtbar, planerTabOeffnen } from "../pad/planerTab.js";

const SPEICHER = "hofer.aufgabe";
const seite = (pfad, kurz) => ({ pfad, kurz });
const reiter = (pfad, wert, kurz) => ({ pfad, wert, kurz });
const keinDienst = () => alt.meineRolle() !== "dienst";
const intern = () => !alt.istExtern() && keinDienst();

function hofertimeOeffnen() {
  const basis = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
  const w = window.open(basis + "hofertime/", "hofertime");
  if (!w) location.href = basis + "hofertime/";
}

// Was man machen will. frage: Untertitel auf der Kachel.
export const AUFGABEN = [
  { id: "planen", titel: "Aufträge planen", frage: "Planwand, Planer, Material", zeichen: "planwand", farbe: "#003884",
    punkte: [seite("planwand", "Planwand"),
      { kurz: "Planer", zeichen: "kalender", sichtbar: planerSichtbar, tun: planerTabOeffnen },
      seite("material", "Material")] },
  { id: "maschine", titel: "An der Maschine", frage: "Stückzahlen, Einrichtblätter, Maschinen", zeichen: "produktion", farbe: "#1f7a4d",
    punkte: [reiter("produktion", "erfassen", "Stückzahlen"), reiter("produktion", "richten", "Einrichten"),
      seite("maschinen", "Maschinen")] },
  { id: "bestellen", titel: "Bestellen", frage: "Werkzeug, Einkaufsliste, Lager", zeichen: "bestellungen", farbe: "#c0611b",
    punkte: [reiter("bestellungen", "offen", "Offen"), reiter("bestellungen", "bestellt", "Bestellt"),
      reiter("bestellungen", "historie", "Historie"), reiter("bestellungen", "artikel", "Artikel"),
      { kurz: "Einkauf", zeichen: "einkauf", sichtbar: intern, tun: einkaufOeffnen },
      seite("lager", "Lager")] },
  { id: "programmieren", titel: "Programmieren", frage: "HOFERCAM, Kontur, 3D", zeichen: "nc", farbe: "#5b3fa0",
    punkte: [seite("nc", "NC-PRO"), seite("hofer2dto3d", "2D → 3D"), seite("einlagen", "Einlagen")] },
  { id: "qualitaet", titel: "Qualität", frage: "Ausschuss, Prüfmittel, Messberichte, QMS", zeichen: "pruefmittel", farbe: "#b5761a",
    punkte: [reiter("qs", "ausschuss", "Ausschuss"), reiter("qs", "pruefmittel", "Prüfmittel"),
      reiter("produktion", "keyence", "Keyence"), seite("qmalt", "QMS")] },
  { id: "auswerten", titel: "Auswerten", frage: "Statistik und Kalkulation", zeichen: "statistik", farbe: "#0a6d7a",
    punkte: [reiter("produktion", "statistik", "Statistik"), seite("kalkulation", "Kalkulation")] },
  { id: "zeit", titel: "Zeit stempeln", frage: "HOFERTIME", zeichen: "zeit", farbe: "#0a7ea4",
    punkte: [{ kurz: "HOFERTIME", zeichen: "zeit", sichtbar: () => intern() && !(alt.profil && alt.profil.andere_nutzer),
      tun: hofertimeOeffnen }] },
  { id: "anzeigen", titel: "Bildschirme", frage: "Infoboard, Empfang, Pausenraum", zeichen: "bildschirme", farbe: "#a23b5e",
    punkte: [seite("infoboard", "Infoboard"), seite("empfang", "Empfang"), seite("pausenraum", "Pausenraum")] },
  { id: "freizeit", titel: "Zahlensprint", frage: "Reihen üben", zeichen: "reihen", farbe: "#3d8a2a",
    punkte: [seite("reihen", "Zahlensprint")] },
];

function punktFertig(p) {
  if (!p.pfad) return { ...p, svg: alt.SYM[p.zeichen] || "", darf: p.sichtbar ? p.sichtbar() : true };
  const s = alt.SEITEN.find((x) => x.pfad === p.pfad);
  if (!s) return { darf: false };
  let darf = alt.seiteSichtbar(p.pfad);
  if (darf && p.wert) darf = !!UNTERREITER[p.pfad] && UNTERREITER[p.pfad].liste().some(([w]) => w === p.wert);
  return { ...p, svg: s.zeichen, darf,
    tun: () => {
      const jetzt = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
      if (p.wert) reiterWaehlen(p.pfad, p.wert, jetzt === p.pfad);
      else location.hash = "#/" + p.pfad;
    } };
}

export function sichtbareAufgaben() {
  return AUFGABEN.map((a) => ({ ...a, punkte: a.punkte.map(punktFertig).filter((p) => p.darf) }))
    .filter((a) => a.punkte.length);
}

export function aufgabeJetzt() {
  try { return sessionStorage.getItem(SPEICHER) || ""; } catch (f) { return ""; }
}
let melden = () => {};
export function aufgabeSetzen(id) {
  try { if (id) sessionStorage.setItem(SPEICHER, id); else sessionStorage.removeItem(SPEICHER); } catch (f) { /* egal */ }
  melden();
}

// Aufgabe wählen: nur eine Sache (HOFERTIME, Pad …) geht gleich auf,
// sonst merkt sich der Tab die Aufgabe und öffnet ihre erste Seite
export function aufgabeStarten(a) {
  const mitSeite = a.punkte.filter((p) => p.pfad);
  if (!mitSeite.length) { a.punkte[0].tun(); return; }
  aufgabeSetzen(a.id);
  mitSeite[0].tun();
}

// Leiste der gewählten Aufgabe; steht im Gerüst, zeigt sich nur mit Aufgabe
export function AufgabeLeiste({ seite: offen }) {
  const [id, setId] = useState(aufgabeJetzt);
  const [, neu] = useState(0);
  useEffect(() => { melden = () => setId(aufgabeJetzt()); return () => { melden = () => {}; }; }, []);
  useEffect(() => reiterBeobachten(() => neu((n) => n + 1)), []);
  // Zur alten Startseite = Vorschau verlassen
  useEffect(() => { if (offen === "dashboard" && id) aufgabeSetzen(""); }, [offen, id]);
  const vorschau = offen === "startneu";
  const a = id && !vorschau && sichtbareAufgaben().find((x) => x.id === id);
  useEffect(() => {
    document.body.classList.toggle("aufgabe-modus", !!a || vorschau);
    document.body.classList.toggle("mit-aufgabenleiste", !!a);
  }, [!!a, vorschau]);
  // Stehen Reiter der offenen Seite schon in der Leiste, ist die
  // Reiterreihe der Seite doppelt und fällt weg (Patrick: „ineinander“)
  const reiterInLeiste = !!a && a.punkte.some((p) => p.pfad === offen && p.wert);
  useEffect(() => {
    document.body.classList.toggle("aufgabe-ohne-seitenreiter", reiterInLeiste);
    return () => document.body.classList.remove("aufgabe-ohne-seitenreiter");
  }, [reiterInLeiste]);
  if (!a) return null;
  const aktiv = (p) => p.pfad === offen && (!p.wert || reiterAktiv(p.pfad) === p.wert);
  return (
    <nav className="aufgabe-leiste" id="aufgabe-leiste" style={{ "--auf-farbe": a.farbe }} aria-label={a.titel}>
      <a className="aufgabe-leiste__start" href="#/startneu" onClick={() => aufgabeSetzen("")} title="Was willst du machen?">
        <span className="aufgabe-leiste__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: alt.SYM.start }} />
        <span>Start</span>
      </a>
      <span className="aufgabe-leiste__titel">{a.titel}</span>
      <div className="aufgabe-leiste__punkte">
        {a.punkte.map((p, i) => (
          <button key={i} type="button" className={"aufgabe-leiste__punkt" + (aktiv(p) ? " aktiv" : "")}
            onClick={p.tun} data-aufgabe-punkt={p.kurz}>
            <span className="aufgabe-leiste__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.svg }} />
            <span>{p.kurz}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
