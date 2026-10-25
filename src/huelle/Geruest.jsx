// =================================================================
//  GERÜST
//  Kopfzeile, Navigation links und der Inhaltsbereich (#inhalt), in
//  den die Seiten zeichnen. Nach dem Anmelden einmal aufgebaut.
//
//  Ein paar Stellen im alten Programm ändern Teile der Kopfzeile
//  direkt (Rückgängig-Knopf, angezeigter Name). React setzt diese
//  Werte nur beim ersten Zeichnen und überschreibt sie danach nicht.
//  #inhalt hat keine React-Kinder; die Seiten hängen sich selbst ein.
// =================================================================
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { anmeldungAbbauen } from "./Anmeldung.jsx";
import { GeraetMarke } from "../pad/geraet.jsx";
import { UNTERREITER, reiterAktiv, reiterBeobachten, reiterWaehlen } from "./unterreiter.js";

let wurzel = null;
let aktivSetzen = () => {};

export function geruestZeichnen(ziel) {
  geruestAbbauen();
  anmeldungAbbauen();
  ziel.innerHTML = "";
  const huelle = document.createElement("div");
  huelle.className = "react-seite";
  ziel.appendChild(huelle);
  wurzel = createRoot(huelle);
  // Sofort fertig, damit #inhalt gleich danach bereitsteht
  flushSync(() => wurzel.render(<Geruest />));
}

// Vor der Anmeldeseite, die das Gerüst überschreibt
export function geruestAbbauen() {
  if (!wurzel) return;
  const w = wurzel;
  wurzel = null;
  aktivSetzen = () => {};
  w.unmount();
}

// Welcher Punkt der Navigation hervorgehoben ist (zeichneSeite)
export function navAktiv(pfad) { aktivSetzen(pfad); }

function Logo() {
  // Das Logo wird als Maske gezeichnet und mit der Themenfarbe gefüllt
  // — so trifft es die gewählte Farbe genau, auch im dunklen Modus.
  // Die Breite kommt aus dem Seitenverhältnis des Bildes.
  const [breite, setBreite] = useState(null);
  useEffect(() => {
    const bild = new Image();
    bild.onload = () => {
      if (bild.naturalHeight) setBreite(Math.round(30 * bild.naturalWidth / bild.naturalHeight));
    };
    bild.src = "./logo.png";
  }, []);
  return <span className="kopf__logo kopf__logo--maske" role="img" aria-label="Hofer + Co."
    style={breite ? { width: breite + "px" } : undefined} />;
}

// Die Reiter der offenen Seite unter ihrem Punkt in der Seitenleiste.
// Nur ab Tablet-Breite sichtbar (CSS); unten in der Leiste wäre kein Platz.
// Seit 1.112.0 klappt die Gruppe weich auf: die Höhe wächst, ein Ast
// zieht von der Seite nach unten und die Reiter gleiten nacheinander
// hinein; beim Seitenwechsel klappt die alte Gruppe wieder zu
// (Wunsch Patrick 20. Oktober 2026: „cooler, mit den Reitern“).
function Unterreiter({ seite, zu }) {
  const u = UNTERREITER[seite];
  const [, zeichnen] = useState(0);
  useEffect(() => reiterBeobachten(() => zeichnen((x) => x + 1)), []);
  const aktiv = reiterAktiv(seite);
  return (
    <div className={"nav__unter" + (zu ? " nav__unter--zu" : "")} role="group" aria-hidden={zu || undefined}>
      <div className="nav__unterinnen">
        {u.liste().map(([wert, text], i) => (
          <button key={wert} type="button" style={{ "--i": i }} tabIndex={zu ? -1 : undefined}
            className={"nav__unterpunkt" + (aktiv === wert ? " aktiv" : "")}
            {...(zu ? {} : { "data-unter": seite + "/" + wert })}
            onClick={() => reiterWaehlen(seite, wert, true)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

// Merkt sich die zuletzt offene Seite mit Reitern, damit ihre Gruppe
// noch kurz zuklappen darf, statt schlagartig zu verschwinden
function useZuklappend(aktiv) {
  const [zu, setZu] = useState(null);
  const vorher = useRef(null);
  useEffect(() => {
    const alteSeite = vorher.current;
    vorher.current = aktiv;
    if (!alteSeite || alteSeite === aktiv || !UNTERREITER[alteSeite]) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setZu(alteSeite);
    const t = setTimeout(() => setZu(null), 320);
    return () => { clearTimeout(t); setZu(null); };
  }, [aktiv]);
  return zu;
}

// Ein- und Ausklappen der Seitenleiste mit Auftritt (seit 1.114.0,
// Wunsch Patrick 20. Oktober 2026: „mehr Emotionen, man macht es ja
// selten“). Auf: die Leiste schnellt über ihr Ziel hinaus und federt
// zurück, ein Lichtstreifen fährt durch, die Zeichen drehen sich ein und
// die Namen fliegen nacheinander scharf herein. Zu: die Namen verwehen,
// die Leiste schnurrt zusammen, erst dann wird sie schmal und die Zeichen
// springen an ihren Platz. Der Inhalt rückt nur einmal, nicht bei jedem
// Bild, damit die Planwand nicht laufend neu rechnet.
const KLAPP_AUF_MS = 950, KLAPP_ZU_MS = 720, KLAPP_ZU_SCHMAL_MS = 330;
let klappUhren = [];
function klappenZeigen(schmal) {
  const b = document.body;
  klappUhren.forEach(clearTimeout);
  klappUhren = [];
  b.classList.remove("nav--klappt-auf", "nav--klappt-zu");
  const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches || innerWidth < 780;
  if (ruhig) { b.classList.toggle("nav--schmal", schmal); return; }
  void b.offsetWidth; // Animation neu starten, auch bei schnellem Doppelklick
  if (schmal) {
    b.classList.remove("nav--schmal");
    b.classList.add("nav--klappt-zu");
    klappUhren.push(setTimeout(() => b.classList.add("nav--schmal"), KLAPP_ZU_SCHMAL_MS));
    klappUhren.push(setTimeout(() => b.classList.remove("nav--klappt-zu"), KLAPP_ZU_MS));
  } else {
    b.classList.remove("nav--schmal");
    b.classList.add("nav--klappt-auf");
    klappUhren.push(setTimeout(() => b.classList.remove("nav--klappt-auf"), KLAPP_AUF_MS));
  }
  inhaltMitziehen();
}

// Die Seite gleitet mit dem Rand der Leiste mit, statt beim Klappen auf
// einmal dahinter zu stehen (seit 1.121.0, Wunsch Patrick 20. Oktober
// 2026: „die Seite soll mit der Menüleiste mitgehen, dass es sauber
// ist“). Die Spalte wechselt weiterhin nur einmal, sonst rechnete der
// Browser bei jedem Bild die ganze Planwand neu; verschoben wird nur
// das fertige Bild, jedes Bild genau um den Abstand zum Rand der Leiste.
let mitziehBild = 0;
function inhaltMitziehen() {
  cancelAnimationFrame(mitziehBild);
  const nav = document.querySelector(".nav"), inhalt = document.getElementById("inhalt");
  if (!nav || !inhalt) return;
  const b = document.body;
  const schritt = () => {
    if (!b.classList.contains("nav--klappt-auf") && !b.classList.contains("nav--klappt-zu")) {
      inhalt.style.transform = "";
      return;
    }
    const spalte = b.classList.contains("nav--klappt-zu") || b.classList.contains("nav--schmal") ? 62 : 208;
    const versatz = nav.getBoundingClientRect().width - spalte;
    inhalt.style.transform = Math.abs(versatz) < .5 ? "" : `translateX(${versatz.toFixed(1)}px)`;
    mitziehBild = requestAnimationFrame(schritt);
  };
  schritt();
}

function Geruest() {
  const profil = alt.profil;
  const [aktiv, setAktiv] = useState(null);
  useLayoutEffect(() => { aktivSetzen = setAktiv; }, []);
  const sucheVorgeladen = useRef(false);
  const zuklappend = useZuklappend(aktiv);

  const anzeige = (profil && (profil.full_name || profil.email)) || "";
  const navSeiten = alt.SEITEN.filter((s) => alt.seiteSichtbar(s.pfad));
  const klappen = () => {
    const b = document.body;
    const schmal = !b.classList.contains("nav--schmal") || b.classList.contains("nav--klappt-zu");
    alt.einstellungSetzenWert("navschmal", schmal ? "1" : "0");
    klappenZeigen(schmal);
  };
  // Die Suche schon beim Darüberfahren laden — bis zum Klick ist sie meist da
  const vorladen = () => {
    if (sucheVorgeladen.current) return;
    sucheVorgeladen.current = true;
    alt.sucheVorladen();
  };

  return (
    <>
      <header className="kopf">
        <button className="kopf__klapp" id="nav-klapp" title="Menü ein- oder ausklappen" onClick={klappen}>☰</button>
        {/* Das Logo lädt die Seite neu. Im Vollbild gibt es sonst keinen
            Weg, eine hängende Ansicht aufzufrischen. Der Link auf hoferco.ch
            (111.42.0) ist wieder weg (Wunsch 5. Oktober 2026 abends). */}
        <button className="kopf__logolink" id="kopf-neuladen" title="Seite neu laden"
          onClick={() => location.reload()}><Logo /></button>
        {/* Gesperrt und freigegeben wird er von knopfRueckgaengigZeigen im
            alten Programm. Kein disabled hier: React würde Klicks sonst
            auch nach dem Freigeben verschlucken. */}
        <button className="kopf__rueck" id="rueck-knopf" title="Rückgängig (Strg + Z)"
          onClick={() => alt.schrittZurueck()}>
          {/* Gebogener Pfeil zurück im Strich der Suche statt des Schriftzeichens ↶,
              das je nach Gerät anders aussah (Wunsch 6. Oktober 2026) */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
          <b>Rückgängig</b></button>
        <span className="kopf__luecke" />
        {/* Konto Pad Mode: welche Maschine dieses iPad ist */}
        <GeraetMarke />
        <button className="kopf__suche" id="kopf-suche" title="Suchen (Strg + F)"
          onClick={() => alt.sucheOeffnen()} onMouseEnter={vorladen} onFocus={vorladen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span>Suchen</span><kbd>Strg F</kbd>
        </button>
        {/* Das Bild ganz rechts führt in die Einstellungen */}
        <span className="kopf__benutzer" data-benutzername="">{anzeige}</span>
        <button className="kopf__ich" id="kopf-einstellungen" title="Einstellungen"
          onClick={() => alt.einstellungenOeffnen()}>
          {profil && profil.bild_url
            ? <img className="kopf__bild" src={profil.bild_url} alt="" />
            : <span className="kopf__bild kopf__bild--leer">{(anzeige || "?").charAt(0).toUpperCase()}</span>}
        </button>
      </header>
      <div className="rahmen">
        <nav className="nav" aria-label="Hauptnavigation">
          {navSeiten.map((s, i) => (
            <Fragment key={s.pfad}>
              <a className={"nav__punkt" + (aktiv === s.pfad ? " aktiv" : "")}
                data-nav={s.pfad} href={"#/" + s.pfad} style={{ "--n": i }}>
                {/* Die Zeichen sind fest eingebaute SVG aus dem Programm */}
                <span className="nav__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.zeichen }} />
                <span className="nav__text">{s.titel}</span>
              </a>
              {aktiv === s.pfad && UNTERREITER[s.pfad] && <Unterreiter key="offen" seite={s.pfad} />}
              {zuklappend === s.pfad && aktiv !== s.pfad && <Unterreiter key="zu" seite={s.pfad} zu />}
            </Fragment>
          ))}
        </nav>
        {/* Am Handy statt der Leiste unten ein Knopf mit Fenster (seit 1.57.0).
            Externe behalten die Leiste, sie haben nur zwei Punkte. */}
        {!alt.istExtern() && <HandyMenue aktiv={aktiv} />}
        <main className="inhalt" id="inhalt" />
      </div>
    </>
  );
}

// Die Symbole in möglichst gleich vollen Zeilen, höchstens vier je
// Zeile: 8 → 4 4, 7 → 4 3, 6 → 3 3, 5 → 3 2, 10 → 4 3 3. Eine kürzere
// Zeile steht in der Mitte (Wunsch Patrick 14. Oktober 2026: „gleich
// viele pro Zeile, sonst so symmetrisch wie möglich“).
export function menueZeilen(n) {
  if (n <= 0) return [];
  const zeilen = Math.ceil(n / 4);
  const basis = Math.floor(n / zeilen), mehr = n % zeilen;
  return Array.from({ length: zeilen }, (_, i) => basis + (i < mehr ? 1 : 0));
}

// Im Menü ist ein Feld nur ein Viertel breit: lange Namen bekommen eine
// weiche Trennstelle, nicht jeder Browser trennt Deutsch von selbst
const TRENNSTELLEN = { "Qualitätssicherung": "Qualitäts\u00ADsicherung" };
const trennbar = (t) => TRENNSTELLEN[t] || t;

// Menü am Handy (Wunsch Patrick 14. Oktober 2026): unten ein breiter
// Knopf „Menü“, ein Tipp öffnet ein kleines Fenster mit
// allen Symbolen. Ab Tablet-Breite blendet CSS es aus, dort bleibt die
// Leiste links.
function HandyMenue({ aktiv }) {
  // zu → offen → schliesst (Ausblenden läuft) → zu
  const [zustand, setZustand] = useState("zu");
  const offen = zustand === "offen";

  const schliessen = () => setZustand((z) => (z === "offen" ? "schliesst" : z));
  useEffect(() => {
    if (zustand !== "schliesst") return;
    const t = setTimeout(() => setZustand("zu"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 580);
    return () => clearTimeout(t);
  }, [zustand]);
  // Seitenwechsel von woanders (Suche, Zurück) schliesst es auch
  useEffect(() => { schliessen(); }, [aktiv]);
  useEffect(() => {
    document.body.classList.add("nav--menue");
    return () => document.body.classList.remove("nav--menue");
  }, []);
  useEffect(() => {
    if (!offen) return;
    // Escape schliesst nur dieses Fenster, sonst nichts (wie überall)
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault(); e.stopPropagation(); schliessen();
    };
    document.addEventListener("keydown", taste, true);
    return () => document.removeEventListener("keydown", taste, true);
  }, [offen]);

  const seiten = alt.SEITEN.filter((s) => alt.seiteSichtbar(s.pfad));
  const punkte = [
    ...seiten.map((s) => ({ schluessel: s.pfad, titel: s.titel, href: "#/" + s.pfad,
      zeichen: <span className="handymenue__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.zeichen }} /> })),
  ];

  // Zeilen aus der Verteilung bauen; die laufende Nummer steuert das
  // gestaffelte Einblenden
  const zeilen = [];
  let nr = 0;
  for (const anzahl of menueZeilen(punkte.length)) {
    zeilen.push(punkte.slice(nr, nr + anzahl).map((p, i) => ({ ...p, nr: nr + i })));
    nr += anzahl;
  }

  const waehlen = (e, p) => {
    // Das Symbol hüpft kurz, dann geht das Fenster zu
    const k = e.currentTarget;
    k.classList.remove("handymenue__punkt--tipp"); void k.offsetWidth; k.classList.add("handymenue__punkt--tipp");
    setTimeout(schliessen, 120);
  };

  return (
    <div className={"handymenue handymenue--" + zustand}>
      {zustand !== "zu" && <>
        <div className="handymenue__schleier" onClick={schliessen} />
        {/* Das Fenster wächst aus dem Menüknopf heraus: der Knopf wird zum
            Schliessen-Knopf unten, darüber zieht die Fläche hoch (seit 1.79.0,
            Wunsch Patrick 16. Oktober 2026). Der Schatten liegt aussen, damit
            ihn das Beschneiden innen nicht wegnimmt. */}
        <div className="handymenue__fenster" role="dialog" aria-label="Menü">
          <div className="handymenue__flaeche" style={{ "--anzahl": punkte.length }}>
          {zeilen.map((zeile, z) => (
            <div key={z} className="handymenue__zeile">
              {zeile.map((p) => (
                <a key={p.schluessel} href={p.href} style={{ "--nr": p.nr }}
                  className={"handymenue__punkt" + (p.schluessel === aktiv ? " aktiv" : "")}
                  onClick={(e) => waehlen(e, p)}>
                  {p.zeichen}
                  <span className="handymenue__text">{trennbar(p.titel)}</span>
                </a>
              ))}
            </div>
          ))}
          <button type="button" className="handymenue__schliessen" onClick={schliessen}>
            <span className="handymenue__glanz" aria-hidden="true" />
            <span className="handymenue__schliessentext">Schliessen</span>
          </button>
          </div>
        </div>
      </>}
      <button type="button" className="handymenue__knopf" aria-expanded={offen}
        onClick={() => setZustand(offen ? "schliesst" : "offen")}>
        <span className="handymenue__glanz" aria-hidden="true" />
        {/* Zugeklappt steht nur gross „Menü“, nicht die offene Seite
            (seit 1.89.1, Wunsch Patrick 17. Oktober 2026) */}
        <span className="handymenue__knopftext">Menü</span>
      </button>
    </div>
  );
}
