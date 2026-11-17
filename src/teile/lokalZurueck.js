import { useEffect, useRef } from "react";
// Strg + Z für Änderungen, die noch nicht gespeichert sind (seit 1.613.0,
// Wunsch Patrick 17. November 2026: „man soll jegliche Sachen mit Strg + Z
// rückgängig machen können, bsp. bei EB bearbeiten Platz gewechselt“).
// Ein Bereich mit einem Entwurf (Einrichtblatt beim Bearbeiten …) meldet
// hier eine Funktion an. Die zuletzt angemeldete kommt zuerst dran; gibt
// sie true zurück, hat sie etwas zurückgenommen, sonst nimmt der
// allgemeine Rückgängig-Knopf den letzten gespeicherten Schritt zurück.
const stapel = [];

export function lokalZurueckAnmelden(fn) {
  const eintrag = { fn };
  stapel.push(eintrag);
  return () => { const i = stapel.indexOf(eintrag); if (i >= 0) stapel.splice(i, 1); };
}

export function lokalZurueck() {
  for (let i = stapel.length - 1; i >= 0; i--) {
    try { if (stapel[i].fn()) return true; } catch (e) { /* weiter */ }
  }
  return false;
}

export function lokalAngemeldet() { return stapel.length > 0; }

// Verlauf eines Entwurfs: merkt den Stand vor jeder Änderung. Änderungen
// kurz nacheinander (Tippen) zählen als ein Schritt.
export function entwurfVerlauf() {
  return { liste: [], letzter: null, zeit: 0, still: false };
}
export function verlaufMerken(v, jetzt, an) {
  if (!an) { v.liste = []; v.letzter = jetzt; v.still = false; return; }
  if (v.still) { v.still = false; v.letzter = jetzt; return; }
  const alt = v.letzter; v.letzter = jetzt;
  if (!alt) return;
  // Ein Feld, das beim Verlassen denselben Wert nochmals meldet, ist kein Schritt.
  try { if (JSON.stringify(alt) === JSON.stringify(jetzt)) return; } catch (e) { /* zählt */ }
  const t = Date.now();
  if (t - v.zeit > 700 || !v.liste.length) v.liste.push(alt);
  v.zeit = t;
  if (v.liste.length > 100) v.liste.shift();
}
export function verlaufZurueck(v) {
  const s = v.liste.pop();
  if (!s) return null;
  v.still = true; v.zeit = 0;
  return s;
}

// Für React: merkt jeden Stand von `stand` und nimmt mit Strg + Z den
// vorigen zurück, solange `an` gilt. `setzen(alterStand)` stellt ihn her.
export function useEntwurfZurueck(stand, setzen, an = true, meldung) {
  const v = useRef(null);
  if (!v.current) v.current = entwurfVerlauf();
  const setzenRef = useRef(setzen);
  setzenRef.current = setzen;
  // Als Kopie gemerkt: manche Module ändern ihren Stand an Ort
  // (Object.assign auf den gemerkten Stand), sonst wäre der alte Stand
  // schon der neue.
  useEffect(() => {
    const kopie = stand && typeof stand === "object" && !Array.isArray(stand) ? { ...stand } : stand;
    verlaufMerken(v.current, kopie, an);
  }, [stand, an]);
  useEffect(() => an ? lokalZurueckAnmelden(() => {
    const s = verlaufZurueck(v.current);
    if (!s) return false;
    setzenRef.current(s);
    if (meldung) meldung("Zurückgenommen.");
    return true;
  }) : undefined, [an]);
  return v.current;
}
