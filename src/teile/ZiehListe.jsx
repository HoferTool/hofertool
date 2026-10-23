// =================================================================
//  LISTE ZUM UMSORTIEREN MIT ZIEHEN (seit 1.134.0, Wunsch Patrick
//  21. Oktober 2026: „nicht so doof mit Pfeilen, sondern Drag and
//  Drop, soll so animiert sein“)
//
//  Am Griff links zieht man sofort, mit Maus und Finger. Mit der Maus
//  geht es auch auf der ganzen Zeile, sobald sie sich ein paar Pixel
//  bewegt; ein einfacher Klick bleibt ein Klick. Die anderen Zeilen
//  gleiten zur Seite, die gezogene legt sich beim Loslassen weich auf
//  ihren Platz. Erst dann kommt ordnen(neueReihenfolge).
//
//  eintraege: [{ key, inhalt }], darf: ob gezogen werden darf.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const SCHWELLE = 6;       // Pixel, ab denen eine Mausbewegung als Ziehen gilt
const GLEITEN = 200;      // ms

export function ZiehListe({ eintraege, darf, ordnen, id, className }) {
  const schluessel = eintraege.map((e) => e.key).join("|");
  const [reihe, setReihe] = useState(() => eintraege.map((e) => e.key));
  const zug = useRef(null);
  const zeilen = useRef({});
  const keinKlick = useRef(false);

  // Neue Daten übernehmen, aber nicht mitten im Ziehen
  useEffect(() => { if (!zug.current) setReihe(eintraege.map((e) => e.key)); }, [schluessel]);
  useEffect(() => () => aufraeumen(), []);

  const nachKey = Object.fromEntries(eintraege.map((e) => [e.key, e]));
  const sichtbar = reihe.filter((k) => nachKey[k]).concat(eintraege.map((e) => e.key).filter((k) => !reihe.includes(k)));

  function aufraeumen() {
    const z = zug.current;
    if (!z) return;
    window.removeEventListener("pointermove", z.bewegen);
    window.removeEventListener("pointerup", z.los);
    window.removeEventListener("pointercancel", z.abbrechen);
    document.body.classList.remove("zieh-laeuft");
    zug.current = null;
  }

  function alleZuruecksetzen(z, mitUebergang) {
    z.keys.forEach((k) => {
      const el = zeilen.current[k];
      if (!el) return;
      el.style.transition = mitUebergang ? "transform " + GLEITEN + "ms cubic-bezier(.2,.8,.2,1)" : "none";
      el.style.transform = "";
      el.classList.remove("zieh--aktiv");
    });
  }

  function aktivieren(z) {
    z.aktiv = true;
    document.body.classList.add("zieh-laeuft");
    z.keys.forEach((k, i) => {
      const el = zeilen.current[k];
      if (!el) return;
      if (i === z.von) { el.classList.add("zieh--aktiv"); el.style.transition = "none"; }
      else el.style.transition = "transform " + GLEITEN + "ms cubic-bezier(.2,.8,.2,1)";
    });
  }

  function zielRechnen(z, dy) {
    const r = z.rects[z.von];
    const mitte = r.top + r.height / 2 + dy;
    let ziel = z.von;
    for (let i = z.von + 1; i < z.rects.length; i++) if (mitte > z.rects[i].top + z.rects[i].height / 2) ziel = i;
    for (let i = z.von - 1; i >= 0; i--) if (mitte < z.rects[i].top + z.rects[i].height / 2) ziel = i;
    return ziel;
  }

  function verschieben(z) {
    const schritt = z.rects[z.von].height + z.abstand;
    z.keys.forEach((k, i) => {
      if (i === z.von) return;
      const el = zeilen.current[k];
      if (!el) return;
      const weg = i > z.von && i <= z.ziel ? -schritt : (i < z.von && i >= z.ziel ? schritt : 0);
      el.style.transform = weg ? "translateY(" + weg + "px)" : "";
    });
  }

  function starten(e, key, amGriff) {
    if (!darf || zug.current || sichtbar.length < 2) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (!amGriff && e.pointerType !== "mouse") return;   // Finger nur am Griff, sonst rollt die Seite
    const keys = sichtbar.slice();
    const rects = keys.map((k) => zeilen.current[k].getBoundingClientRect());
    const abstand = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    const z = { key, keys, rects, abstand, von: keys.indexOf(key), ziel: keys.indexOf(key), y0: e.clientY, aktiv: false };
    z.bewegen = (ev) => {
      const dy = ev.clientY - z.y0;
      if (!z.aktiv) { if (Math.abs(dy) < SCHWELLE) return; aktivieren(z); }
      ev.preventDefault();
      // Nicht über den Anfang oder das Ende der Liste hinaus
      const min = z.rects[0].top - z.rects[z.von].top;
      const max = z.rects[z.rects.length - 1].bottom - z.rects[z.von].bottom;
      const d = Math.max(min - 12, Math.min(max + 12, dy));
      zeilen.current[z.key].style.transform = "translateY(" + d + "px) scale(1.02)";
      const ziel = zielRechnen(z, d);
      if (ziel !== z.ziel) { z.ziel = ziel; verschieben(z); }
    };
    z.los = () => {
      window.removeEventListener("pointermove", z.bewegen);
      window.removeEventListener("pointerup", z.los);
      window.removeEventListener("pointercancel", z.abbrechen);
      if (!z.aktiv) { aufraeumen(); return; }
      keinKlick.current = true;
      setTimeout(() => { keinKlick.current = false; }, 50);
      // Die gezogene Zeile gleitet auf ihren neuen Platz
      const r = z.rects[z.von];
      const zielOben = z.ziel > z.von ? z.rects[z.ziel].bottom - r.height : z.rects[z.ziel].top;
      const el = zeilen.current[z.key];
      el.style.transition = "transform " + GLEITEN + "ms cubic-bezier(.2,.8,.2,1)";
      el.style.transform = "translateY(" + (zielOben - r.top) + "px)";
      setTimeout(() => {
        const neu = z.keys.slice();
        neu.splice(z.ziel, 0, neu.splice(z.von, 1)[0]);
        // Neue Reihenfolge und Zurücksetzen in einem Zug: kein Springen
        flushSync(() => setReihe(neu));
        alleZuruecksetzen(z, false);
        aufraeumen();
        if (z.ziel !== z.von) ordnen(neu);
      }, GLEITEN);
    };
    z.abbrechen = () => { alleZuruecksetzen(z, true); aufraeumen(); };
    zug.current = z;
    if (amGriff) { e.preventDefault(); aktivieren(z); }
    window.addEventListener("pointermove", z.bewegen, { passive: false });
    window.addEventListener("pointerup", z.los);
    window.addEventListener("pointercancel", z.abbrechen);
  }

  return (
    <ul className={"ziehliste" + (className ? " " + className : "")} id={id}>
      {sichtbar.map((k) => (
        <li key={k} data-zieh={k} className={"ziehliste__zeile" + (darf && sichtbar.length > 1 ? " ziehliste__zeile--darf" : "")}
          ref={(el) => { if (el) zeilen.current[k] = el; else delete zeilen.current[k]; }}
          onPointerDown={(e) => starten(e, k, false)}
          onClickCapture={(e) => { if (keinKlick.current) { e.stopPropagation(); e.preventDefault(); } }}>
          {darf && sichtbar.length > 1 &&
            <span className="ziehliste__griff" data-griff={k} title="Ziehen zum Verschieben" aria-hidden="true"
              onPointerDown={(e) => { e.stopPropagation(); starten(e, k, true); }}>⠿</span>}
          {nachKey[k].inhalt}
        </li>))}
    </ul>
  );
}
