// =================================================================
//  BESTELLUNGEN · gemeinsame Bausteine (111.27.0)
//  Leiste mit Suche und Hauptknopf, Zeichen, Statuspille und Chips.
//  Alle Reiter sehen damit gleich aus, im Stil der Einstellungen:
//  weisse Karten mit Titel, ruhige Zeilen, Farben aus dem Thema.
// =================================================================
import { alt } from "../../bruecke.jsx";

const PFADE = {
  suche: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  stift: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  muell: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  pdf: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>,
  liste: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  lager: <><path d="M3 9 12 4l9 5v11H3z" /><path d="M7 20v-7h10v7M7 16h10" /></>,
  maschine: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  pfeil: <path d="M5 12h14M13 6l6 6-6 6" />,
  kalender: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  notiz: <><path d="M4 4h16v12l-4 4H4z" /><path d="M16 20v-4h4" /></>,
  aussen: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  telefon: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  pfeilrunter: <path d="m6 9 6 6 6-6" />,
  haken: <path d="m5 12 5 5L20 7" />,
  kopie: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
};

export function Zeichen({ name, groesse = 16, className }) {
  return (
    <svg className={"bs-zeichen" + (className ? " " + className : "")} viewBox="0 0 24 24"
      width={groesse} height={groesse} fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PFADE[name]}</svg>
  );
}

// Suchfeld mit Lupe, daneben Filter und rechts der Hauptknopf. Auf dem
// Handy rutscht der Knopf in eine eigene Zeile über die ganze Breite.
export function Leiste({ suchId, suche, setSuche, platzhalter = "Suchen", filter, knopf }) {
  return (
    <div className="bs-leiste">
      <label className="bs-suche">
        <Zeichen name="suche" groesse={18} />
        <input type="search" id={suchId} placeholder={platzhalter} value={suche}
          autoComplete="off" autoFocus={!!suche} aria-label={platzhalter}
          onChange={(e) => setSuche(e.target.value)} />
      </label>
      {filter}
      {knopf && <div className="bs-leiste__knopf">{knopf}</div>}
    </div>
  );
}

export function NeuKnopf({ id, text, onClick }) {
  return (
    <button className="knopf knopf--haupt bs-neu" id={id} onClick={onClick}>
      <Zeichen name="plus" groesse={18} />{text}
    </button>
  );
}

// Kleine runde Knöpfe für Bearbeiten und Löschen. Der Text steht im
// title und aria-label, damit klar bleibt, was der Knopf tut.
export function Symbolknopf({ zeichen, text, gefahr, ...weiter }) {
  return (
    <button type="button" className={"bs-symbolknopf" + (gefahr ? " bs-symbolknopf--gefahr" : "")}
      title={text} aria-label={text} {...weiter}>
      <Zeichen name={zeichen} groesse={17} />
    </button>
  );
}

// Karte mit Kopf: Titel, Zahl, kurze Zeile darunter, rechts Knöpfe
export function Karte({ titel, zahl, unter, vorne, aktionen, className, children }) {
  return (
    <section className={"karte bs-karte" + (className ? " " + className : "")}>
      <div className="bs-karte__kopf">
        {vorne}
        <div className="bs-karte__titel">
          <h2>{titel}{zahl !== undefined && <span className="bs-zahl">{zahl}</span>}</h2>
          {unter && <div className="bs-karte__unter">{unter}</div>}
        </div>
        {aktionen && <div className="bs-karte__aktionen">{aktionen}</div>}
      </div>
      {children}
    </section>
  );
}

// Anfangsbuchstaben eines Lieferanten als ruhiges Erkennungszeichen
export function Kuerzel({ name }) {
  const teile = String(name || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  const k = ((teile[0] || "?")[0] + ((teile[1] || "")[0] || "")).toUpperCase();
  return <span className="bs-kuerzel" aria-hidden="true">{k}</span>;
}

export function Leer({ text }) {
  return <div className="bs-leer"><Zeichen name="liste" groesse={20} /><span>{text}</span></div>;
}

export function Laedt() {
  return <div className="laedt">Wird geladen …</div>;
}

export function Fehler({ fehler }) {
  return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
}

// Statuspille. Wer schreiben darf, öffnet damit das Statusfenster.
export function Status({ z, onClick, ...weiter }) {
  const text = alt.BESTELLSTATUS[z.status] || z.status;
  const klasse = "bs-status bs-status--" + z.status;
  if (!onClick) return <span className={klasse}>{text}</span>;
  return (
    <button type="button" className={klasse + " bs-status--knopf"} title="Status ändern"
      onClick={onClick} {...weiter}>
      {text}<Zeichen name="pfeilrunter" groesse={14} />
    </button>
  );
}

// Wohin die Lieferung nach dem Eintreffen soll
const ZIEL_ZEICHEN = { lager: "lager", maschine: "maschine", person: "person", andere: "pfeil" };
export function Ziel({ art, text }) {
  if (!text) return null;
  return (
    <span className="bs-chip bs-chip--ziel" title="Wohin nach dem Eintreffen">
      <Zeichen name={ZIEL_ZEICHEN[art] || "pfeil"} groesse={14} />{text}
    </span>
  );
}

export function mehrzahl(n, eins, viele) { return n + " " + (n === 1 ? eins : viele); }
