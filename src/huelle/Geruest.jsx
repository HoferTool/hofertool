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
import { UNTERREITER, reiterAktiv, reiterBeobachten, reiterWaehlen } from "./unterreiter.js";

// Knöpfe zu Webseiten unten im Menü (Wunsch Patrick, 9. Oktober 2026).
// Diese Seiten lassen sich nicht innerhalb der App anzeigen (sie
// verbieten das), darum je ein eigenes Browserfenster.
const WEBSEITEN = [
  { name: "Google", url: "https://www.google.ch/", titel: "Google-Suche in eigenem Fenster",
    // Original-G von Google in den vier Farben (Wunsch Patrick, 9. Oktober 2026)
    zeichen: <svg viewBox="0 0 48 48" className="navsym" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg> },
  // Original-Logo von Just Eat (Haus mit Besteck, Orange F36D00), aus Simple Icons
  { name: "Just Eat", url: "https://www.just-eat.ch/", titel: "Just Eat in eigenem Fenster",
    zeichen: <svg viewBox="0 0 24 24" className="navsym" aria-hidden="true">
      <path fill="#F36D00" d="M11.196.232a1.376 1.376 0 0 1 1.528 0 33.157 33.157 0 0 1 3.384 2.438s.293.203.301-.14a5.367 5.367 0 0 1 .079-1.329.606.606 0 0 1 .562-.39s1.329.066 2.173.179c.377.05.671.352.711.73 0 0 .543 3.62.665 4.925 0 0 .105.664 1.067 1.79 0 0 1.953 2.735 2.18 3.259 0 0 .454.946-.523 1.074 0 0-1.783.18-1.955.22a.446.446 0 0 0-.39.484s-.094 6.296-.555 9.32c0 0-.121 1.2-.782 1.173 0 0-1.833-.059-2.259-.047 0 0-.183 0-.156-.246 0 0 .934-9.817.301-14.78 0 0-.028-.64-.516-.782 0 0-.445-.18-.871.391a15.574 15.574 0 0 0-2.9 8.86s-.05 1.563.188 1.953c0 0 .148.274.907.336l.96.13s.176 0 .16.233c0 0-.218 2.88-.28 3.393a1.018 1.018 0 0 1-.071.34s-.035.098-.336.086c0 0-4.236-.03-4.713 0 0 0-.2 0-.242-.105-.043-.106-.294-3.717-.286-4.229a.255.255 0 0 1 .149-.25 2.548 2.548 0 0 0 1.172-1.871c.052-.548.06-1.098.024-1.646 0 0 .156-5.522.195-6.41 0 0 .031-.3-.36-.355a.364.364 0 0 0-.437.27v.03c0 .032-.274 3.643-.223 5.081 0 0 .094.942-.558.961 0 0-.634.095-.665-.69 0 0 .047-3.542.203-5.292a.39.39 0 0 0-.348-.391.39.39 0 0 0-.437.316.065.065 0 0 0 0 .031s-.274 3.39-.223 5.179c0 0 .078.868-.614.836 0 0-.578.066-.61-.704 0 0 .157-4.85.2-5.224A.39.39 0 0 0 6.647 9h-.039a.391.391 0 0 0-.418.325.167.167 0 0 0 0 .035s-.258 5.8-.223 7.503c0 0-.023 1.751 1.27 2.462 0 0 .192.11.196.277 0 0 .145 3.076.277 4.069 0 0 .047.238-.164.238L4.291 24a.67.67 0 0 1-.665-.633 72.876 72.876 0 0 1-.601-9.829.5.5 0 0 0-.391-.535S.969 12.85.566 12.749a.692.692 0 0 1-.422-1.02A33.497 33.497 0 0 1 11.197.232Z" /></svg> },
];

// Am Computer ein eigenes Fenster neben der App, je Seite immer
// dasselbe (ein zweiter Klick holt es nach vorn); auf Tablet und Handy
// gibt es keine Fenster, dort öffnet der Link wie gewohnt einen Tab.
function webseiteOeffnen(e, w) {
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
function Unterreiter({ seite }) {
  const u = UNTERREITER[seite];
  const [, zeichnen] = useState(0);
  useEffect(() => reiterBeobachten(() => zeichnen((x) => x + 1)), []);
  const aktiv = reiterAktiv(seite);
  return (
    <div className="nav__unter" role="group">
      {u.liste().map(([wert, text]) => (
        <button key={wert} type="button"
          className={"nav__unterpunkt" + (aktiv === wert ? " aktiv" : "")}
          data-unter={seite + "/" + wert}
          onClick={() => reiterWaehlen(seite, wert, true)}>{text}</button>
      ))}
    </div>
  );
}

function Geruest() {
  const profil = alt.profil;
  const [aktiv, setAktiv] = useState(null);
  useLayoutEffect(() => { aktivSetzen = setAktiv; }, []);
  const sucheVorgeladen = useRef(false);

  const anzeige = (profil && (profil.full_name || profil.email)) || "";
  const klappen = () => {
    const schmal = !document.body.classList.contains("nav--schmal");
    document.body.classList.toggle("nav--schmal", schmal);
    alt.einstellungSetzenWert("navschmal", schmal ? "1" : "0");
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
          {alt.SEITEN.filter((s) => alt.seiteSichtbar(s.pfad)).map((s) => (
            <Fragment key={s.pfad}>
              <a className={"nav__punkt" + (aktiv === s.pfad ? " aktiv" : "")}
                data-nav={s.pfad} href={"#/" + s.pfad}>
                {/* Die Zeichen sind fest eingebaute SVG aus dem Programm */}
                <span className="nav__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.zeichen }} />
                <span className="nav__text">{s.titel}</span>
              </a>
              {aktiv === s.pfad && UNTERREITER[s.pfad] && <Unterreiter seite={s.pfad} />}
            </Fragment>
          ))}
          {/* Externe sehen die Webseiten-Knöpfe nicht */}
          {!alt.istExtern() && WEBSEITEN.map((w) => (
            <a key={w.name} className={"nav__punkt nav__punkt--web nav__punkt--" + w.name.toLowerCase().replace(/\W/g, "")}
              href={w.url} target="_blank" rel="noopener" title={w.titel}
              onClick={(e) => webseiteOeffnen(e, w)}>
              <span className="nav__zeichen" aria-hidden="true">{w.zeichen}</span>
              <span className="nav__text">{w.name}</span>
            </a>
          ))}
        </nav>
        <main className="inhalt" id="inhalt" />
      </div>
    </>
  );
}
