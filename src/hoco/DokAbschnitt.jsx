import { alt, AltTeil } from "../bruecke.jsx";

// Der Abschnitt „Allgemeine Dokumente“ ist noch alt (auch bei den
// Maschinentypen in Gebrauch) und hängt über AltTeil hier.
export default function DokAbschnitt({ dokumente, darf, was, zuordnung, nachher }) {
  return <AltTeil className="react-seite" zeichne={(el) => {
    el.innerHTML = alt.dokAbschnittMarkup(dokumente, darf, was);
    alt.dokAbschnittBinden(el, zuordnung, nachher);
  }} />;
}
