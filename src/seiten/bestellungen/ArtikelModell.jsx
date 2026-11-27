// =================================================================
//  BESTELLUNGEN · Artikel: kleines 3D-Bild des realen Werkzeugs
//  (seit 1.937.0, Wunsch Patrick 27. November 2026: „zeig mir das 3D-Modell
//  auch in der Liste der Artikel im Bereich Bestellungen an“). Dieselbe
//  Bibliothek wie „📚 Reale Werkzeuge“ in HOFERCAM (camArtikel.js, von Hand
//  Ergänztes gilt vor dem Erkannten). Wird nur nachgeladen, wenn die Liste
//  offen ist, damit der Start der App schlank bleibt.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { bibliothekLaden } from "../rechner/camArtikel.js";
import { WzMini3D } from "../rechner/CamWzMini3D.jsx";
import { werkzeugGrossOeffnen } from "../rechner/CamWz3DGross.jsx";

// Ein Abruf für alle Zeilen; bibliothekLaden merkt sich die Liste eine Minute
let laufend = null;
function nachArtikel() {
  if (!laufend) {
    laufend = bibliothekLaden(alt.db)
      .then((liste) => Object.fromEntries(liste.filter((e) => e.article_id).map((e) => [e.article_id, e])))
      .catch(() => ({}));
    setTimeout(() => { laufend = null; }, 60000);
  }
  return laufend;
}

export default function ArtikelModell({ id }) {
  const [e, setE] = useState(null);
  useEffect(() => {
    let weg = false;
    nachArtikel().then((m) => { if (!weg) setE(m[id] || null); });
    return () => { weg = true; };
  }, [id]);
  // Kein Werkzeug oder nicht erkannt: kein Bild, die Zeile bleibt wie bisher
  if (!e || e.kein || !e.wz) return null;
  return <span className="bs-artikel__modell" data-armodell={id}>
    <WzMini3D wz={e.wz} gross={44} oeffnen={() => werkzeugGrossOeffnen(e)} />
  </span>;
}
