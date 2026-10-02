// =================================================================
//  BRÜCKE zwischen dem bisherigen Programm (src/alt/app.js) und den
//  Bereichen, die schon in React neu gebaut sind (src/seiten/).
//
//  Der Umbau geht Bereich für Bereich. Solange das alte Programm die
//  Hülle (Kopfzeile, Navigation, Fenster, Pad Mode) zeichnet, hängt
//  es React-Seiten über reactSeite() ein. Umgekehrt können React-
//  Seiten Teile, die noch alt sind, mit <AltTeil> einbetten.
//
//  „alt" ist der Werkzeugkasten des alten Programms: Es legt dort
//  beim Start ab, was React-Seiten brauchen (Datenbank, Meldungen,
//  Rechte …). Ist ein Bereich fertig umgebaut, wandern seine Helfer
//  nach und nach in eigene Module.
// =================================================================
import { useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

export const alt = {};

// Welche React-Wurzel gerade wo hängt. Pro Behälter höchstens eine.
const wurzeln = new Map();

// Räumt die React-Wurzel in einem Behälter weg, bevor das alte
// Programm ihn mit eigenem Inhalt überschreibt. Ohne Behälter: alle,
// deren Behälter nicht mehr in der Seite hängt, plus die genannten.
export function reactAufraeumen(behaelter) {
  for (const [el, w] of wurzeln) {
    if (el === behaelter || !document.body.contains(el)) {
      w.unmount();
      wurzeln.delete(el);
    }
  }
}

// Macht aus einer React-Komponente eine Seite, wie SEITEN sie
// erwartet: eine Funktion, die in einen Behälter zeichnet.
// flushSync sorgt dafür, dass der Inhalt sofort steht. Das alte
// Programm misst und blendet direkt nach dem Zeichnen ein.
export function reactSeite(Komponente) {
  return (behaelter) => {
    reactAufraeumen(behaelter);
    behaelter.innerHTML = "";
    const wurzel = createRoot(behaelter);
    wurzeln.set(behaelter, wurzel);
    flushSync(() => wurzel.render(<Komponente />));
  };
}

// Bettet einen noch alten Teil in eine React-Seite ein. zeichne(el)
// ist die alte Funktion, die in el zeichnet. React fasst den Inhalt
// danach nicht mehr an.
export function AltTeil({ zeichne, id, className }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    zeichne(ref.current);
  }, [zeichne]);
  return <div ref={ref} id={id} className={className} />;
}

// Merkt sich Werte über das Verlassen der Seite hinaus, so wie die
// alten Seiten ihren Zustand in einem Objekt behalten haben.
export function useGemerkt(speicher, werte) {
  useEffect(() => { Object.assign(speicher, werte); });
}
