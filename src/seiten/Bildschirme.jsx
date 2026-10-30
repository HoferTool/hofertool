// =================================================================
//  BILDSCHIRME
//  Ein Punkt im Menü für alle Bildschirme (seit 1.310.0, Wunsch Patrick
//  30. Oktober 2026: „Alle Bildschirme zu einem Reiter machen“). Die
//  Seite zeigt nur die Wahl; Infoboard, Empfang und Pausenraum bleiben
//  eigene Seiten mit ihrer Adresse, weil die Geräte an der Wand sie so
//  öffnen. Am Computer stehen sie dazu als Unterpunkte in der Leiste.
// =================================================================
import { bildschirmSeiten } from "../huelle/unterreiter.js";

const BESCHREIBUNG = {
  infoboard: "Grosser Bildschirm hochkant in der Halle",
  empfang: "Bildschirm quer am Empfang",
  pausenraum: "Touch-Bildschirm quer im Pausenraum",
};

export default function Bildschirme() {
  const seiten = bildschirmSeiten();
  return (
    <>
      <h1 className="seitentitel">Bildschirme</h1>
      <div className="bs-wahl" id="bs-wahl">
        {seiten.map((s) => (
          <a key={s.pfad} className="bs-kachel" href={"#/" + s.pfad} data-bs={s.pfad}>
            {/* Die Zeichen sind fest eingebaute SVG aus dem Programm */}
            <span className="bs-kachel__zeichen" aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.zeichen }} />
            <b className="bs-kachel__titel">{s.titel}</b>
            <span className="bs-kachel__text">{BESCHREIBUNG[s.pfad] || ""}</span>
          </a>
        ))}
      </div>
    </>
  );
}
