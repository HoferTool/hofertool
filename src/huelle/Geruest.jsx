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
import { klappBildchen } from "./klappFx.js";
import { UNTERREITER, reiterAktiv, reiterBeobachten, reiterWaehlen } from "./unterreiter.js";

// Knöpfe zu Webseiten unten im Menü (Wunsch Patrick, 9. Oktober 2026).
// Google ist seit 1.55.3 weg (Wunsch Patrick 14. Oktober 2026).
// Diese Seiten lassen sich nicht innerhalb der App anzeigen (sie
// verbieten das), darum je ein eigenes Browserfenster.
const WEBSEITEN = [
  // Original-Logo von Just Eat (Haus mit Besteck), aus Simple Icons, einfarbig
  { name: "Just Eat", url: "https://www.just-eat.ch/", titel: "Just Eat in eigenem Fenster",
    zeichen: <svg viewBox="0 0 24 24" className="navsym" aria-hidden="true">
      <path fill="currentColor" d="M11.196.232a1.376 1.376 0 0 1 1.528 0 33.157 33.157 0 0 1 3.384 2.438s.293.203.301-.14a5.367 5.367 0 0 1 .079-1.329.606.606 0 0 1 .562-.39s1.329.066 2.173.179c.377.05.671.352.711.73 0 0 .543 3.62.665 4.925 0 0 .105.664 1.067 1.79 0 0 1.953 2.735 2.18 3.259 0 0 .454.946-.523 1.074 0 0-1.783.18-1.955.22a.446.446 0 0 0-.39.484s-.094 6.296-.555 9.32c0 0-.121 1.2-.782 1.173 0 0-1.833-.059-2.259-.047 0 0-.183 0-.156-.246 0 0 .934-9.817.301-14.78 0 0-.028-.64-.516-.782 0 0-.445-.18-.871.391a15.574 15.574 0 0 0-2.9 8.86s-.05 1.563.188 1.953c0 0 .148.274.907.336l.96.13s.176 0 .16.233c0 0-.218 2.88-.28 3.393a1.018 1.018 0 0 1-.071.34s-.035.098-.336.086c0 0-4.236-.03-4.713 0 0 0-.2 0-.242-.105-.043-.106-.294-3.717-.286-4.229a.255.255 0 0 1 .149-.25 2.548 2.548 0 0 0 1.172-1.871c.052-.548.06-1.098.024-1.646 0 0 .156-5.522.195-6.41 0 0 .031-.3-.36-.355a.364.364 0 0 0-.437.27v.03c0 .032-.274 3.643-.223 5.081 0 0 .094.942-.558.961 0 0-.634.095-.665-.69 0 0 .047-3.542.203-5.292a.39.39 0 0 0-.348-.391.39.39 0 0 0-.437.316.065.065 0 0 0 0 .031s-.274 3.39-.223 5.179c0 0 .078.868-.614.836 0 0-.578.066-.61-.704 0 0 .157-4.85.2-5.224A.39.39 0 0 0 6.647 9h-.039a.391.391 0 0 0-.418.325.167.167 0 0 0 0 .035s-.258 5.8-.223 7.503c0 0-.023 1.751 1.27 2.462 0 0 .192.11.196.277 0 0 .145 3.076.277 4.069 0 0 .047.238-.164.238L4.291 24a.67.67 0 0 1-.665-.633 72.876 72.876 0 0 1-.601-9.829.5.5 0 0 0-.391-.535S.969 12.85.566 12.749a.692.692 0 0 1-.422-1.02A33.497 33.497 0 0 1 11.197.232Z" /></svg> },
];

// Am Computer ein eigenes Fenster neben der App, je Seite immer
// dasselbe (ein zweiter Klick holt es nach vorn); auf Tablet und Handy
// gibt es keine Fenster, dort öffnet der Link wie gewohnt einen Tab.
function webseiteOeffnen(e, w) {
  // Zeichen hüpfen lassen wie bei den Seiten; Klasse neu setzen, damit
  // es auch beim zweiten Klick wieder hüpft
  const k = e.currentTarget;
  k.classList.remove("nav__punkt--hupft"); void k.offsetWidth; k.classList.add("nav__punkt--hupft");
  k.addEventListener("animationend", () => k.classList.remove("nav__punkt--hupft"), { once: true });
  if (matchMedia("(pointer: coarse)").matches) return;
  const b = Math.min(1100, screen.availWidth - 40), h = Math.min(850, screen.availHeight - 40);
  const f = window.open(w.url, "hofer-" + w.name.toLowerCase().replace(/\W/g, ""),
    "popup,width=" + b + ",height=" + h + ",left=" + Math.round((screen.availWidth - b) / 2)
    + ",top=" + Math.round((screen.availHeight - h) / 2));
  if (f) { e.preventDefault(); f.focus(); }
}

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

// Ein- und Ausklappen der Seitenleiste (seit 1.114.0, Wunsch Patrick
// 20. Oktober 2026: „mehr Emotionen, man macht es ja selten“; seit
// 1.116.0 „kein Hin und Her, blitzartig, sondern smooth, kein
// Spiegeleffekt“): Die Breite gleitet weich, die Namen blenden
// nacheinander ein und aus, dazu abwechselnd eine weiche Welle am Rand
// oder Maschinenschrift (klappFx.js, seit 1.117.0). Erst am Ende wird die Leiste schmal. Der Inhalt rückt
// nur einmal, nicht bei jedem Bild, damit die Planwand nicht laufend
// neu rechnet.
const KLAPP_AUF_MS = 900, KLAPP_ZU_MS = 620, KLAPP_ZU_SCHMAL_MS = 560;
let klappUhren = [];
function klappenZeigen(schmal) {
  const b = document.body;
  klappUhren.forEach(clearTimeout);
  klappUhren = [];
  b.classList.remove("nav--klappt-auf", "nav--klappt-zu");
  const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches || innerWidth < 780;
  if (ruhig) { b.classList.toggle("nav--schmal", schmal); return; }
  void b.offsetWidth; // Animation neu starten, auch bei schnellem Doppelklick
  klappBildchen(schmal);
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
        <button className="kopf__suche" id="kopf-suche" title="Suchen (Strg + K)"
          onClick={() => alt.sucheOeffnen()} onMouseEnter={vorladen} onFocus={vorladen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span>Suchen</span><kbd>Strg K</kbd>
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
          {/* Externe sehen die Webseiten-Knöpfe nicht */}
          {!alt.istExtern() && WEBSEITEN.map((w, i) => (
            <a key={w.name} style={{ "--n": navSeiten.length + i }} className={"nav__punkt nav__punkt--web nav__punkt--" + w.name.toLowerCase().replace(/\W/g, "")}
              href={w.url} target="_blank" rel="noopener" title={w.titel}
              onClick={(e) => webseiteOeffnen(e, w)}>
              <span className="nav__zeichen" aria-hidden="true">{w.zeichen}</span>
              <span className="nav__text">{w.name}</span>
            </a>
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
    const t = setTimeout(() => setZustand("zu"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300);
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
    ...WEBSEITEN.map((w) => ({ schluessel: "web-" + w.name, titel: w.name, href: w.url, web: w,
      zeichen: <span className="handymenue__zeichen" aria-hidden="true">{w.zeichen}</span> })),
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
    if (p.web) webseiteOeffnen(e, p.web);
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
          <div className="handymenue__flaeche">
          {zeilen.map((zeile, z) => (
            <div key={z} className="handymenue__zeile">
              {zeile.map((p) => (
                <a key={p.schluessel} href={p.href} style={{ "--nr": p.nr }}
                  className={"handymenue__punkt" + (p.schluessel === aktiv ? " aktiv" : "")}
                  {...(p.web ? { target: "_blank", rel: "noopener" } : {})}
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
