// Zeigt eine Uhrzeit oder Zahl so, dass jede Ziffer, die sich ändert,
// neu hereinrollt (Animation in effekte.css). React baut nur die
// Ziffern neu, deren Wert sich geändert hat, weil der Schlüssel aus
// Stelle und Wert besteht.
export function Ziffern({ text }) {
  return String(text).split("").map((z, i) =>
    <span key={i + ":" + z} className="fx-ziffer">{z}</span>);
}
