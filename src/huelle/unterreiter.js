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
import { REITER as PROD_REITER } from "../seiten/Produktion.jsx";
import { REITER as BEST_REITER } from "../seiten/Bestellungen.jsx";
import { REITER as RECH_REITER, rechnerAnsicht } from "../seiten/Rechner.jsx";

// liste(): Reiter, die die Person sieht. merken(wert): Reiter für das
// nächste Öffnen der Seite setzen. gemerkt(): der zuletzt gewählte.
export const UNTERREITER = {
  produktion: {
    liste: () => PROD_REITER.filter(([w]) => !alt.istExtern() || w === "erfassen"),
    merken: (w) => { alt.prod.ansicht = w; },
    gemerkt: () => alt.prod.ansicht,
  },
  bestellungen: {
    liste: () => BEST_REITER,
    merken: (w) => { alt.best.ansicht = w; },
    gemerkt: () => alt.best.ansicht,
  },
  rechner: {
    liste: () => RECH_REITER,
    merken: (w) => rechnerAnsicht(w),
    gemerkt: () => rechnerAnsicht(),
  },
};

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
  return offen[seite] ? offen[seite].aktiv : UNTERREITER[seite].gemerkt();
}

// Klick in der Seitenleiste. istOffen: diese Seite ist gerade gezeigt.
export function reiterWaehlen(seite, wert, istOffen) {
  if (istOffen && offen[seite]) { offen[seite].waehlen(wert); return; }
  UNTERREITER[seite].merken(wert);
  if (istOffen) alt.zeichneSeite();
  else location.hash = "#/" + seite;
}
