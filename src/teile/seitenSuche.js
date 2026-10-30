// =================================================================
//  SUCHE JE SEITE (seit 1.169.0, Wunsch Patrick 24. Oktober 2026:
//  „Strg K soll pro Seite funktionieren, heisst bei Planwand wie
//  bisher, bei Material kann nach Material gesucht werden und so weiter“)
//
//  Eine Seite meldet mit useSeitenSuche an, was man auf ihr suchen
//  kann. Strg + F und die Lupe oben öffnen dann dieses Suchfenster
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
//    aus:        true = gerade nicht zuständig (etwa Produktion, solange
//                darin der Reiter Statistik mit eigener Suche offen ist)
//  }
// =================================================================
import { useEffect, useRef } from "react";

// Alle angemeldeten Suchen, die jüngste zuletzt. Eine Seite kann eine
// andere einbetten (Statistik in der Produktion, seit 1.318.0), darum
// eine Liste statt einer einzigen
let angemeldet = [];

export function useSeitenSuche(def) {
  // Immer die neueste Fassung, damit springen die frischen Daten sieht
  const halter = useRef(def);
  halter.current = def;
  useEffect(() => {
    const eintrag = { def: () => halter.current };
    angemeldet.push(eintrag);
    return () => { angemeldet = angemeldet.filter((x) => x !== eintrag); };
  }, []);
}

export function seitenSuche() {
  for (let i = angemeldet.length - 1; i >= 0; i--) {
    const d = angemeldet[i].def();
    if (d && !d.aus) return d;
  }
  return null;
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
