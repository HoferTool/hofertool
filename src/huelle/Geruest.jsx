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

// Für die Rolle „planwand“: Bearbeiten erst nach einem Pin
function AdminKnopf() {
  const plan = alt.plan;
  const [an, setAn] = useState(!!plan.pinOk);
  const klick = async () => {
    if (plan.pinOk) {
      plan.pinOk = false; setAn(false);
      alt.meldung("Bearbeiten gesperrt.");
      alt.zeichneSeite();
      return;
    }
    const w = await alt.dialogFelder({
      titel: "Bearbeiten freischalten",
      text: "Bitte den Pin eingeben.",
      felder: [{ name: "pin", label: "Pin", typ: "password", pflicht: true }],
      bestaetigen: "Freischalten" });
    if (!w) return;
    let richtig = "0000";
    try {
      const r = await alt.zeitlimit(alt.db.from("app_config").select("wert")
        .eq("schluessel", "planwand_pin").maybeSingle(), 8000, "Pin");
      if (!r.error && r.data && r.data.wert) richtig = r.data.wert;
    } catch (f) { /* dann gilt der Standardpin */ }
    if (String(w.pin).trim() !== String(richtig).trim()) {
      alt.meldung("Falscher Pin.", "fehler");
      return;
    }
    plan.pinOk = true; setAn(true);
    alt.meldung("Bearbeiten freigeschaltet.");
    alt.zeichneSeite();
  };
  return <button className={"kopf__admin" + (an ? " aktiv" : "")} id="kopf-admin"
    title="Bearbeiten freischalten" onClick={klick}>Bearbeiten</button>;
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
        {/* Das Logo führt auf die Firmenwebsite, in einem neuen Tab, damit
            die App offen bleibt (Wunsch 5. Oktober 2026; vorher lud es neu). */}
        <a className="kopf__logolink" id="kopf-website" href="https://www.hoferco.ch"
          target="_blank" rel="noopener" title="hoferco.ch öffnen"><Logo /></a>
        {alt.meineRolle() === "planwand" && <AdminKnopf />}
        {/* Gesperrt und freigegeben wird er von knopfRueckgaengigZeigen im
            alten Programm. Kein disabled hier: React würde Klicks sonst
            auch nach dem Freigeben verschlucken. */}
        <button className="kopf__rueck" id="rueck-knopf" title="Rückgängig (Strg + Z)"
          onClick={() => alt.schrittZurueck()}><span>↶</span><b>Rückgängig</b></button>
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
        </nav>
        <main className="inhalt" id="inhalt" />
      </div>
    </>
  );
}
