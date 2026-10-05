// =================================================================
//  FETTER TEXT
//  Einzelne Wörter fett schreiben, ohne Textverarbeitung: Fettes
//  steht als **Wort** im Text. So bleibt der Text in der Datenbank und
//  überall sonst lesbar, und auf dem Tablet genügt ein Knopf statt
//  einer Tastenkombination (Wunsch Patrick 5. Oktober 2026).
//    <FettText text="..." />          zeigt **…** fett, Zeilen bleiben
//    fettUmschalten(textarea)         macht die Auswahl fett oder wieder normal
// =================================================================

const FETT = /\*\*([^*\n]+?)\*\*/g;

export function FettText({ text }) {
  return (text || "").split("\n").map((zeile, i) => {
    const teile = [];
    let rest = 0;
    for (const t of zeile.matchAll(FETT)) {
      if (t.index > rest) teile.push(zeile.slice(rest, t.index));
      teile.push(<strong key={t.index}>{t[1]}</strong>);
      rest = t.index + t[0].length;
    }
    if (rest < zeile.length) teile.push(zeile.slice(rest));
    return <span key={i}>{i > 0 && <br />}{teile}</span>;
  });
}

// Ohne Auswahl nimmt der Knopf das Wort, in dem der Cursor steht, weil
// auf dem Tablet das genaue Markieren mühsam ist. Ist die Stelle schon
// fett, wird sie wieder normal.
export function fettUmschalten(feld) {
  const w = feld.value;
  let a = feld.selectionStart ?? w.length, b = feld.selectionEnd ?? w.length;
  if (a === b) {
    while (a > 0 && /[^\s*]/.test(w[a - 1])) a--;
    while (b < w.length && /[^\s*]/.test(w[b])) b++;
  }
  // Leerzeichen am Rand der Auswahl bleiben draussen, sonst greift ** nicht
  while (a < b && /\s/.test(w[a])) a++;
  while (b > a && /\s/.test(w[b - 1])) b--;
  if (a === b) return false;

  let neu, von, bis;
  const innen = w.slice(a, b);
  if (w.slice(a - 2, a) === "**" && w.slice(b, b + 2) === "**") {
    neu = w.slice(0, a - 2) + innen + w.slice(b + 2); von = a - 2; bis = b - 2;
  } else if (innen.length > 4 && innen.startsWith("**") && innen.endsWith("**")) {
    neu = w.slice(0, a) + innen.slice(2, -2) + w.slice(b); von = a; bis = b - 4;
  } else {
    // Fett über mehrere Zeilen: jede Zeile einzeln einpacken
    const gepackt = innen.split("\n").map((z) => (z.trim() ? z.replace(/\*\*/g, "").replace(/^(\s*)(.*?)(\s*)$/, "$1**$2**$3") : z)).join("\n");
    neu = w.slice(0, a) + gepackt + w.slice(b); von = a; bis = a + gepackt.length;
  }
  feld.value = neu;
  feld.focus();
  feld.setSelectionRange(von, bis);
  feld.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
