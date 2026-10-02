// Eine Karte der Startseite, die per Klick in ihren Bereich führt.
// Klicks auf Knöpfe, Verweise und Felder in der Karte zählen nicht.
export function KlickKarte({ zu, className = "karte", children }) {
  const klick = (e) => {
    if (e.target.closest("button, a, input, label, select, textarea")) return;
    location.hash = "#/" + zu;
  };
  return (
    <section className={className + " karte--klickbar"} data-zu={zu} onClick={klick}>
      {children}
    </section>
  );
}
