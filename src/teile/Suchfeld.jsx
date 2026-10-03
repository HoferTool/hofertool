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
