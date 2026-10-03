// =================================================================
//  FENSTER
//  Ein React-Fenster in der gewohnten .dialog-huelle. Der Inhalt wird
//  gezeichnet, bevor die Hülle an den Seitenkörper kommt: Dort passt
//  das alte Programm auf (Einblenden, Zurück und Escape schliessen das
//  oberste Fenster) und findet so gleich den Schliessknopf.
//
//  fensterOeffnen((zu) => <Inhalt zu={zu} />) gibt zu() zurück.
// =================================================================
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";

export function fensterOeffnen(zeichne, beimSchliessen) {
  const huelle = document.createElement("div");
  huelle.className = "dialog-huelle";
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
  alt.dialogSchliessen(huelle, zu);
  return zu;
}
