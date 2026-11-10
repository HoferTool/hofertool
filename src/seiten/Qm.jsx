// =================================================================
//  QM
//  Qualitätsmanagement (seit 1.458.0, Wunsch Patrick 10. November 2026:
//  „neuer Reiter QM, aktuell nur für Patrick Ruch“). Vorerst leer; was
//  hineinkommt, sagt Patrick. Sichtbar nur mit dem Vermerk qmSehen am
//  Konto (profiles.einstellungen), nie für Externe (seiteSichtbar in app.js).
// =================================================================
export default function Qm() {
  return (
    <>
      <h1 className="seitentitel">QM</h1>
      <section className="karte karte--hinweis" id="qm-leer">
        <h2>Qualitätsmanagement</h2>
        <p className="hinweis">Hier entsteht der Bereich QM. Noch ist er leer.</p>
      </section>
    </>
  );
}
