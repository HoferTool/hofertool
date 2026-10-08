// =================================================================
//  EINSTELLUNGEN · gemeinsame Bausteine
//  Gruppe = Karte mit Titel und kurzer Erklärung. Zeile = links was
//  es ist (mit Hinweis), rechts das Feld oder der Schalter. So sehen
//  alle Reiter gleich aus, statt jedes Feld über die ganze Breite.
// =================================================================

export function Gruppe({ titel, text, aktionen, id, children }) {
  return (
    <section className="karte es-gruppe" id={id}>
      <div className="es-gruppe__kopf">
        <div className="es-gruppe__titel">
          <h2>{titel}</h2>
          {text && <p className="es-gruppe__text">{text}</p>}
        </div>
        {aktionen && <div className="es-gruppe__aktionen">{aktionen}</div>}
      </div>
      {children}
    </section>
  );
}

// „breit“ legt das Feld unter die Beschriftung, etwa für lange Texte
export function Zeile({ titel, text, breit, children }) {
  return (
    <div className={"es-zeile" + (breit ? " es-zeile--breit" : "")}>
      <div className="es-zeile__text">
        <div className="es-zeile__titel">{titel}</div>
        {text && <div className="es-zeile__hinweis">{text}</div>}
      </div>
      <div className="es-zeile__feld">{children}</div>
    </div>
  );
}

// Ein Ein/Aus als Kippschalter: die ganze Zeile ist anklickbar
export function SchalterZeile({ id, titel, text, checked, defaultChecked, onChange }) {
  return (
    <label className="es-zeile es-zeile--schalter">
      <div className="es-zeile__text">
        <div className="es-zeile__titel">{titel}</div>
        {text && <div className="es-zeile__hinweis">{text}</div>}
      </div>
      <div className="es-zeile__feld">
        <input type="checkbox" role="switch" className="kippschalter" id={id}
          checked={checked} defaultChecked={defaultChecked} onChange={onChange} />
      </div>
    </label>
  );
}

// Kleine Zeichen für die Reiter, im Strich der Navigation
const PFADE = {
  allgemein: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  dokumente: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  backup: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v4h16v-4" /></>,
  fehler: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></>,
  farben: <><circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1.3" /><circle cx="12" cy="7.5" r="1.3" /><circle cx="16" cy="10" r="1.3" /><path d="M12 21a3 3 0 0 1 0-6h2" /></>,
  symbole: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 16V8l4 5 4-5v8" /></>,
  nutzer: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.8c2 .9 3.5 3 3.5 6.2" /></>,
};

export function ReiterZeichen({ name }) {
  return (
    <svg className="es-reiter__zeichen" viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PFADE[name]}
    </svg>
  );
}
