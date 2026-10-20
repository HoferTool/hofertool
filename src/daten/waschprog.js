// ============================================================
//  WASCHPROGRAMM AUS DER WBG
// ============================================================
//  Die Zeile „Waschprog-Nr.“ steht auf jeder WBG (Warenbegleitblatt)
//  und gehört zum Auftrag (Wunsch Patrick, 12. Oktober 2026). Statt
//  sie in der Datenbank nachzuführen, liest die App sie direkt aus dem
//  Text der PDF. Die Adresse einer WBG ändert sich bei jedem Hochladen
//  (Zeitstempel im Namen), darum lässt sich das Ergebnis je Adresse
//  auf dem Gerät merken: jede WBG wird höchstens einmal gelesen.

import { useEffect, useState } from "react";
import { pdfjs } from "../teile/PdfAnsicht.jsx";

// Seit 1.110.0 auch die Zeichnungsnummer („Z-Nr.“, Wunsch Patrick
// 20. Oktober 2026: in der Schnellvorschau der Planwand). Gemerkt wird
// darum je Adresse beides, unter neuem Namen; die alte Liste ohne
// Zeichnungsnummer wird nicht mehr gelesen, jede WBG also einmal neu.
const SCHLUESSEL = "hofer.wbgfelder";
const MAX_GEMERKT = 400;
const gemerkt = new Map();
const unterwegs = new Map();

try {
  const alt = JSON.parse(localStorage.getItem(SCHLUESSEL) || "[]");
  if (Array.isArray(alt)) alt.forEach(([a, w]) => { if (w && typeof w === "object") gemerkt.set(a, w); });
} catch (f) { /* ohne Speicher eben jedes Mal lesen */ }

function merken(adresse, wert) {
  gemerkt.delete(adresse);
  gemerkt.set(adresse, wert);
  while (gemerkt.size > MAX_GEMERKT) gemerkt.delete(gemerkt.keys().next().value);
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify([...gemerkt])); } catch (f) { /* voll */ }
}

// Aus den Textstücken einer Seite die Zeilen bauen (gleiche Höhe auf
// dem Blatt, links nach rechts)
function zeilenAusText(stuecke) {
  const zeilen = [];
  for (const s of stuecke) {
    if (!s.str || !s.str.trim()) continue;
    const x = s.transform[4], y = s.transform[5];
    let z = zeilen.find((r) => Math.abs(r.y - y) < 3);
    if (!z) { z = { y, teile: [] }; zeilen.push(z); }
    z.teile.push({ x, text: s.str });
  }
  return zeilen.map((z) => z.teile.sort((a, b) => a.x - b.x).map((t) => t.text.trim()).join(" "));
}

// Der Wert hinter „Waschprog-Nr.:“. Eine leere Zeile auf der WBG gibt "".
export function waschprogAusText(stuecke) {
  for (const text of zeilenAusText(stuecke)) {
    const m = /wasch\s*prog[^:]*:?\s*(.*)$/i.exec(text);
    if (m) return m[1].trim();
  }
  return null;
}

// „Z-Nr.:“, „Zeichn.-Nr.:“, „Zeichnungs-Nr.:“ oder „Zeichnungsnummer:“.
// Steht in derselben Zeile danach ein weiteres Feld („Index: B“), endet
// der Wert davor.
export function zeichnungNrAusText(stuecke) {
  for (const text of zeilenAusText(stuecke)) {
    const m = /(?:^|\s)(?:z|zeichn(?:ungs?)?)\.?\s*-?\s*(?:nr|nummer)\.?\s*:\s*(.*)$/i.exec(text)
      || /(?:^|\s)zeichnungsnummer\s*:?\s*(.*)$/i.exec(text);
    if (m) return m[1].split(/\s+[A-Za-zÄÖÜäöü][\wÄÖÜäöü.\-]*:(?:\s|$)/)[0].trim();
  }
  return null;
}

// Liest beide Felder einer WBG: { wasch, znr }, je "" wenn nicht da
export function wbgFelderLesen(adresse) {
  if (!adresse) return Promise.resolve(null);
  if (gemerkt.has(adresse)) return Promise.resolve(gemerkt.get(adresse));
  if (unterwegs.has(adresse)) return unterwegs.get(adresse);
  const p = (async () => {
    const antwort = await fetch(adresse);
    if (!antwort.ok) throw new Error("WBG nicht erreichbar");
    const daten = new Uint8Array(await antwort.arrayBuffer());
    const lib = await pdfjs();
    const aufgabe = lib.getDocument({ data: daten, isEvalSupported: false });
    try {
      const doc = await aufgabe.promise;
      const seite = await doc.getPage(1);
      const inhalt = await seite.getTextContent();
      // Nicht gefunden (etwa eine eingescannte WBG ohne Text) heisst
      // einfach: nichts anzeigen. Auch das wird gemerkt.
      const wert = { wasch: waschprogAusText(inhalt.items) || "",
        znr: zeichnungNrAusText(inhalt.items) || "" };
      merken(adresse, wert);
      return wert;
    } finally { aufgabe.destroy(); }
  })().catch(() => null).finally(() => unterwegs.delete(adresse));
  unterwegs.set(adresse, p);
  return p;
}

export const waschprogLesen = (adresse) => wbgFelderLesen(adresse).then((w) => (w ? w.wasch : null));
export const zeichnungNrLesen = (adresse) => wbgFelderLesen(adresse).then((w) => (w ? w.znr : null));
// Sofort, ohne zu lesen: was schon gemerkt ist, sonst undefined
export const zeichnungNrGemerkt = (adresse) => (gemerkt.has(adresse) ? gemerkt.get(adresse).znr : undefined);

// Für React: der Wert zur WBG-Adresse, solange er unterwegs ist null
export function useWaschprog(adresse) {
  const sofort = () => (adresse && gemerkt.has(adresse) ? gemerkt.get(adresse).wasch : null);
  const [wert, setWert] = useState(sofort);
  useEffect(() => {
    let weg = false;
    setWert(sofort());
    if (adresse && !gemerkt.has(adresse)) waschprogLesen(adresse).then((w) => { if (!weg) setWert(w); });
    return () => { weg = true; };
  }, [adresse]);
  return wert;
}
