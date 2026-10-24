// =================================================================
//  SUCHE JE SEITE (seit 1.169.0, Wunsch Patrick 24. Oktober 2026:
//  „Strg K soll pro Seite funktionieren, heisst bei Planwand wie
//  bisher, bei Material kann nach Material gesucht werden und so weiter“)
//
//  Eine Seite meldet mit useSeitenSuche an, was man auf ihr suchen
//  kann. Strg + K und die Lupe oben öffnen dann dieses Suchfenster
//  (src/huelle/SucheAlles.jsx) statt der HOCO Nummern. Seiten ohne
//  Anmeldung (Start, Planwand, Infoboard) suchen wie bisher HOCO Nummern.
//
//  def = {
//    name:       „Material“, steht oben im Fenster
//    platzhalter: Text im leeren Feld
//    eintraege:  Liste oder async () => Liste, je Eintrag
//                { gruppe, zeichen, titel, zeile, such, … }
//                (such: weiterer Text, der gefunden werden soll)
//    springen(x): was ein Treffer tut
//  }
// =================================================================
import { useEffect, useRef } from "react";

let aktiv = null;

export function useSeitenSuche(def) {
  // Immer die neueste Fassung, damit springen die frischen Daten sieht
  const halter = useRef(def);
  halter.current = def;
  useEffect(() => {
    const eintrag = { def: () => halter.current };
    aktiv = eintrag;
    return () => { if (aktiv === eintrag) aktiv = null; };
  }, []);
}

export function seitenSuche() {
  return aktiv ? aktiv.def() : null;
}

// Alle Wörter müssen irgendwo vorkommen; Gruppen bleiben beisammen
export function seitenTreffer(liste, text) {
  const woerter = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length || text.trim().length < 2) return [];
  const passend = liste.filter((x) => {
    const t = [x.titel, x.zeile, x.such].map((f) => String(f || "")).join(" ").toLowerCase();
    return woerter.every((w) => t.includes(w));
  });
  const reihe = [];
  passend.forEach((x) => { if (!reihe.includes(x.gruppe)) reihe.push(x.gruppe); });
  return reihe.flatMap((g) => passend.filter((x) => x.gruppe === g)).slice(0, 60);
}

// Den Treffer auf der Seite zeigen: in die Mitte rollen und kurz
// aufleuchten lassen. Wartet, bis die Seite ihn gezeichnet hat.
export function hinzeigen(selektor) {
  let n = 0;
  const versuch = () => {
    const el = document.querySelector(selektor);
    if (!el) { if (++n < 50) setTimeout(versuch, 100); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("such-blitz");
    void el.offsetWidth;
    el.classList.add("such-blitz");
    setTimeout(() => el.classList.remove("such-blitz"), 3000);
  };
  setTimeout(versuch, 50);
}
