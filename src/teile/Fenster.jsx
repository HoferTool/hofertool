// =================================================================
//  FENSTER
//  Ein React-Fenster in der gewohnten .dialog-huelle. Der Inhalt wird
//  gezeichnet, bevor die Hülle an den Seitenkörper kommt: Dort passt
//  das alte Programm auf (Einblenden, Zurück und Escape schliessen das
//  oberste Fenster) und findet so gleich den Schliessknopf.
//
//  fensterOeffnen((zu) => <Inhalt zu={zu} />) gibt zu() zurück.
//  klasse hängt weitere Klassen an die Hülle (etwa „suche-huelle“).
//  Ein Element mit data-fokus bekommt nach dem Öffnen den Fokus
//  (autoFocus wirkt nicht, solange die Hülle noch nicht im Dokument ist).
//  merken = { art, daten }: Das Fenster geht nach dem Neuladen wieder
//  auf (src/teile/wiederherstellen.js). daten muss als JSON gehen.
// =================================================================
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { fensterMerken } from "./wiederherstellen.js";

export function fensterOeffnen(zeichne, beimSchliessen, klasse, merken) {
  const huelle = document.createElement("div");
  huelle.className = "dialog-huelle" + (klasse ? " " + klasse : "");
  const wurzel = createRoot(huelle);
  let offen = true;
  const zu = () => {
    if (!offen) return;
    offen = false;
    if (beimSchliessen) beimSchliessen();
    huelle.remove();
    // Später abbauen: zu() kommt meist aus einem Klick im Fenster selbst
    queueMicrotask(() => wurzel.unmount());
  };
  flushSync(() => wurzel.render(zeichne(zu)));
  document.body.appendChild(huelle);
  if (merken) fensterMerken(huelle, merken);
  alt.dialogSchliessen(huelle, zu);
  const fokus = huelle.querySelector("[data-fokus]");
  if (fokus) fokus.focus();
  return zu;
}
