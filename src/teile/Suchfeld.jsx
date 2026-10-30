// Suchleiste über einer Liste. Filtert sofort beim Tippen; der Wert
// bleibt im Speicher des alten Programms (etwa best.historieSuche),
// damit er beim Zurückkommen noch dasteht.
export function Suchfeld({ id, wert, setzen, platzhalter = "Suchen" }) {
  return (
    <div className="suchleiste">
      <input type="search" id={id} placeholder={platzhalter} value={wert}
        autoComplete="off" autoFocus={!!wert} onChange={(e) => setzen(e.target.value)} />
    </div>
  );
}

// Ob ein Eintrag zur Suche passt: alle Felder zusammen, ohne Gross-
// und Kleinschreibung
export function passt(sucht, felder) {
  const s = sucht.trim().toLowerCase();
  if (!s) return true;
  return felder.map((x) => String(x || "").toLowerCase()).join(" ").includes(s);
}

// Wie passt, aber jedes Wort für sich, in irgendeinem Feld (Bestellungen,
// Wunsch Patrick 30. Oktober 2026: „nach allem suchen“). Bindestriche
// und Punkte zählen nicht, damit „108410009“ auch „10841-0009“ findet.
export function passtWoerter(sucht, felder) {
  const woerter = String(sucht || "").trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = felder.flat().map((x) => String(x == null ? "" : x).toLowerCase()).join(" \u0001 ");
  const kurz = text.replace(/[-./]/g, "");
  return woerter.every((w) => text.includes(w) || kurz.includes(w.replace(/[-./]/g, "")));
}
