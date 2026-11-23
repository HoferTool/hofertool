// =================================================================
//  UNTERREITER IN DER SEITENLEISTE
//  Ab Tablet-Breite steht die Navigation links. Dort zeigt sie unter
//  jeder Seite auch deren Reiter (Erfassen, Offen, Drehzahl …), damit
//  man direkt hinspringen kann (Wunsch 4. Oktober 2026).
//
//  Welche Reiter eine Seite hat, steht hier fest, damit sie auch zu
//  sehen sind, solange die Seite nicht offen ist. Ist sie offen,
//  meldet ihre Reiterleiste den gewählten Reiter und wie man wechselt:
//  Dann wechselt ein Klick in der Leiste wie ein Klick auf den Reiter,
//  ohne die Seite neu aufzubauen.
// =================================================================
import { alt } from "../bruecke.jsx";
import { sichtbareReiter as prodReiter } from "../seiten/Produktion.jsx";
import { REITER as BEST_REITER } from "../seiten/Bestellungen.jsx";
import { ncReiter, ncAnsicht } from "../seiten/NcFunktionen.jsx";
import { qsReiter, qsZustand } from "../seiten/Qs.jsx";

// liste(): Reiter, die die Person sieht. merken(wert): Reiter für das
// nächste Öffnen der Seite setzen. gemerkt(): der zuletzt gewählte.
export const UNTERREITER = {
  produktion: {
    liste: () => [...prodReiter(), ...seitenDarunter("produktion")],
    merken: (w) => { alt.prod.ansicht = w; },
    gemerkt: () => alt.prod.ansicht,
  },
  bestellungen: {
    liste: () => BEST_REITER,
    merken: (w) => { alt.best.ansicht = w; },
    gemerkt: () => alt.best.ansicht,
  },
  qs: {
    liste: () => qsReiter(),
    merken: (w) => { qsZustand.ansicht = w; },
    gemerkt: () => qsZustand.ansicht,
  },
  nc: {
    liste: () => ncReiter(),
    merken: (w) => ncAnsicht(w),
    gemerkt: () => ncAnsicht(),
  },
  // Neuer Look (seit 1.731.0): Material als Unterpunkt der Planwand und die
  // Hilfsprogramme; die Unterpunkte wechseln die Seite
  planwand: {
    liste: () => seitenDarunter("planwand").length ? [["planwand", "Planwand"], ...seitenDarunter("planwand")] : [],
    gehe: (w) => { location.hash = "#/" + w; },
    gemerkt: () => "planwand",
  },
  hilfsprogramme: {
    liste: () => seitenDarunter("hilfsprogramme"),
    gehe: (w) => { location.hash = "#/" + w; },
    gemerkt: () => direktUnter("hilfsprogramme", jetzigeSeite()) || "",
  },
  // Die Bildschirme sind eigene Seiten mit eigener Adresse; der Unterpunkt
  // wechselt darum die Seite statt eines Reiters (seit 1.315.0)
  bildschirme: {
    liste: () => bildschirmSeiten().map((s) => [s.pfad, s.titel]),
    gehe: (w) => { location.hash = "#/" + w; },
    gemerkt: () => location.hash.replace(/^#\/?/, "").split("/")[0],
  },
};

// Die Bildschirm-Seiten, die die Person sehen darf (Infoboard, Empfang, Pausenraum)
export function bildschirmSeiten() {
  return alt.SEITEN.filter((s) => s.gruppe === "bildschirme" && alt.seiteSichtbar(s.pfad));
}

// Seiten, die als Unterpunkt unter einer anderen stehen (neuer Look), als [pfad, titel]
function seitenDarunter(seite) {
  if (seite === "bildschirme") return [];
  return alt.SEITEN.filter((s) => s.gruppe === seite && alt.seiteSichtbar(s.pfad)).map((s) => [s.pfad, s.titel]);
}

// Die Seite in der Adresse (#/bestellungen → bestellungen)
function jetzigeSeite() {
  return location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "dashboard";
}

// Welche Seite direkt unter „gruppe“ zu pfad gehört (Infoboard → Anzeigen)
function direktUnter(gruppe, pfad) {
  for (let n = 0; n < 4 && pfad; n++) {
    const s = alt.SEITEN.find((x) => x.pfad === pfad);
    if (!s || !s.gruppe) return null;
    if (s.gruppe === gruppe) return pfad;
    pfad = s.gruppe;
  }
  return null;
}

// Hat diese Seite Unterpunkte in der Leiste?
export function hatUnter(seite) {
  return !!UNTERREITER[seite] && UNTERREITER[seite].liste().length > 0;
}

// Unter welchem Punkt im Menü eine Seite steht; seit 1.731.0 auch über
// zwei Stufen (Infoboard → Anzeigen → Hilfsprogramme)
export function menuePunkt(pfad) {
  for (let n = 0; n < 4; n++) {
    const s = pfad && alt.SEITEN.find((x) => x.pfad === pfad);
    if (!s || !s.gruppe) return pfad;
    pfad = s.gruppe;
  }
  return pfad;
}

// Was die offenen Reiterleisten gemeldet haben: { seite: {aktiv, waehlen} }
const offen = {};
const zuhoerer = new Set();

export function reiterMelden(seite, aktiv, waehlen) {
  const vorher = offen[seite];
  offen[seite] = { aktiv, waehlen };
  if (!vorher || vorher.aktiv !== aktiv) zuhoerer.forEach((f) => f());
}

export function reiterAbmelden(seite, waehlen) {
  if (offen[seite] && offen[seite].waehlen === waehlen) delete offen[seite];
}

export function reiterBeobachten(f) {
  zuhoerer.add(f);
  return () => zuhoerer.delete(f);
}

export function reiterAktiv(seite) {
  // Steht gerade eine Seite offen, die als Unterpunkt dazugehört (Bestellungen
  // unter Produktion), leuchtet sie
  const hier = direktUnter(seite, jetzigeSeite());
  if (hier) return hier;
  return offen[seite] ? offen[seite].aktiv : UNTERREITER[seite].gemerkt();
}

// Klick in der Seitenleiste. istOffen: diese Seite ist gerade gezeigt.
export function reiterWaehlen(seite, wert, istOffen) {
  if (UNTERREITER[seite].gehe) { UNTERREITER[seite].gehe(wert); return; }
  // Unterpunkt, der eine eigene Seite ist (Bestellungen unter Produktion)
  if (seitenDarunter(seite).some(([p]) => p === wert)) { location.hash = "#/" + wert; return; }
  if (jetzigeSeite() !== seite) istOffen = false;
  if (istOffen && offen[seite]) { offen[seite].waehlen(wert); return; }
  UNTERREITER[seite].merken(wert);
  if (istOffen) alt.zeichneSeite();
  else location.hash = "#/" + seite;
}
