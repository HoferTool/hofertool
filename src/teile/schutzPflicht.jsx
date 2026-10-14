// =================================================================
//  PASSWORT ODER PIN IST PFLICHT (seit 1.56.0, Wunsch Patrick
//  14. Oktober 2026: „Alle, die kein Passwort oder PIN haben, sollen
//  nichts im Tool machen können, bevor sie eins gesetzt haben; als
//  Fenster gleich abfragen und zu den Einstellungen bringen“)
//
//  Wer mit einem Tipp auf die Kachel hereinkommt (ohne_passwort und
//  keine PIN in pin_schutz), sieht nach dem Anmelden ein Fenster über
//  allem. Es führt nur zu Einstellungen → Allgemein → Anmeldung oder
//  zum Abmelden. Wird das Einstellungsfenster geschlossen, ohne dass ein
//  Passwort oder eine PIN gesetzt ist, kommt das Fenster wieder.
//
//  Nicht für Gerätekonten („Andere Nutzer“), das Dienstkonto und
//  Externe: Geräte sollen mit einem Tipp hinein, Externe haben keine
//  Einstellungen (Rückfrage an Patrick offen).
//
//  An der Anmeldung selbst und in der Datenbank ändert sich nichts.
//  Fehlt pin_vorhanden oder schlägt die Abfrage fehl, sperrt die App
//  nicht, damit niemand wegen eines Netzfehlers draussen steht.
// =================================================================
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";

// Für wen die Pflicht gilt: eine echte Person im Betrieb
export function schutzNoetig(p) {
  return !!p && p.role !== "extern" && p.role !== "dienst" && !p.andere_nutzer && p.is_active !== false;
}

// Nach Passwort oder PIN aus Einstellungen → Allgemein melden
export function schutzGesetzt() {
  if (offen) offen.frei();
}

let offen = null;   // { frei, weg } solange die Sperre gilt

async function hatSchutz(p) {
  if (!p.ohne_passwort) return true;
  const r = await alt.zeitlimit(alt.db.rpc("pin_vorhanden"), 10000, "PIN");
  if (r.error) return true;
  return (r.data || []).some((z) => z.user_id === p.id);
}

// Wartet, bis die Person geschützt ist. true = weiter, false = abgemeldet
export async function schutzPflicht() {
  try {
    const p = alt.profil;
    if (!schutzNoetig(p) || alt.istArchiv() || alt.istAndererNutzer()) return true;
    if (offen) return false;
    if (await hatSchutz(p)) return true;
    if (alt.profil !== p) return false;
    return await new Promise((fertig) => sperren(p, fertig));
  } catch (f) {
    console.warn("Schutz:", f && f.message);
    return true;
  }
}

export function schutzWeg() {
  if (offen) offen.weg();
}

function sperren(p, fertig) {
  const huelle = document.createElement("div");
  huelle.className = "anmeldemeldung-huelle schutzpflicht-huelle";
  const wurzel = createRoot(huelle);
  let takt = null;
  // Escape gehört hier niemandem, solange das Fenster da ist
  const taste = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const zeigen = () => {
    if (!huelle.isConnected) document.body.appendChild(huelle);
    window.addEventListener("keydown", taste, true);
    const k = huelle.querySelector("#sp-einstellungen");
    if (k) k.focus();
  };
  const verstecken = () => {
    window.removeEventListener("keydown", taste, true);
    huelle.remove();
  };
  const ende = (ok) => {
    clearInterval(takt);
    verstecken();
    queueMicrotask(() => wurzel.unmount());
    offen = null;
    fertig(ok);
  };
  offen = {
    frei: () => ende(true),
    weg: () => ende(false),
  };

  const zuDenEinstellungen = () => {
    verstecken();
    alt.einst.reiter = "allgemein";
    alt.einstellungenOeffnen();
    // Gleich zur Gruppe „Anmeldung“ rollen
    setTimeout(() => {
      const g = document.getElementById("es-anmeldung");
      if (g) g.scrollIntoView({ block: "start", behavior: "smooth" });
      const f = document.getElementById("np");
      if (f) f.focus({ preventScroll: true });
    }, 120);
    // Geht das Fenster zu, ohne dass etwas gesetzt ist: Sperre wieder da
    clearInterval(takt);
    takt = setInterval(async () => {
      if (!offen || document.querySelector(".dialog--einstellungen")) return;
      clearInterval(takt);
      if (alt.profil !== p) return ende(false);
      let ok = false;
      try { ok = await hatSchutz(p); } catch (f) { ok = false; }
      if (!offen) return;
      if (ok) ende(true); else zeigen();
    }, 400);
  };

  // „Abmelden?“ ist ein gewöhnliches Fenster: solange es offen ist,
  // liegt die Sperre darunter
  const abmelden = async () => {
    if (!window.abmeldenFragen) return;
    huelle.classList.add("anmeldemeldung-huelle--unten");
    try { await window.abmeldenFragen(); } finally {
      huelle.classList.remove("anmeldemeldung-huelle--unten");
    }
  };

  wurzel.render(
    <div className="dialog schutzpflicht" role="alertdialog" aria-modal="true" aria-labelledby="sp-titel">
      <div className="schutzpflicht__zeichen" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <h2 id="sp-titel">Bitte zuerst ein Passwort oder eine PIN setzen</h2>
      <p>Dein Konto hat zurzeit weder Passwort noch PIN. Jeder könnte mit einem Tipp auf deine Kachel hinein.</p>
      <p>Bevor du im Hofer Tool weiterarbeitest, setze unter <b>Einstellungen → Allgemein → Anmeldung</b> ein
        Passwort oder eine PIN.</p>
      <div className="dialog__knoepfe schutzpflicht__knoepfe">
        <button className="knopf knopf--still" id="sp-abmelden" onClick={abmelden}>Abmelden</button>
        <button className="knopf knopf--haupt" id="sp-einstellungen" autoFocus
          onClick={zuDenEinstellungen}>Zu den Einstellungen</button>
      </div>
    </div>
  );
  zeigen();
}
