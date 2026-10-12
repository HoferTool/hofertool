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

const SCHLUESSEL = "hofer.waschprog";
const MAX_GEMERKT = 400;
const gemerkt = new Map();
const unterwegs = new Map();

try {
  const alt = JSON.parse(localStorage.getItem(SCHLUESSEL) || "[]");
  if (Array.isArray(alt)) alt.forEach(([a, w]) => gemerkt.set(a, w));
} catch (f) { /* ohne Speicher eben jedes Mal lesen */ }

function merken(adresse, wert) {
  gemerkt.delete(adresse);
  gemerkt.set(adresse, wert);
  while (gemerkt.size > MAX_GEMERKT) gemerkt.delete(gemerkt.keys().next().value);
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify([...gemerkt])); } catch (f) { /* voll */ }
}

// Aus den Textstücken einer Seite die Zeilen bauen (gleiche Höhe auf
// dem Blatt, links nach rechts) und den Wert hinter „Waschprog-Nr.:“
// nehmen. Eine leere Zeile auf der WBG gibt "".
export function waschprogAusText(stuecke) {
  const zeilen = [];
  for (const s of stuecke) {
    if (!s.str || !s.str.trim()) continue;
    const x = s.transform[4], y = s.transform[5];
    let z = zeilen.find((r) => Math.abs(r.y - y) < 3);
    if (!z) { z = { y, teile: [] }; zeilen.push(z); }
    z.teile.push({ x, text: s.str });
  }
  for (const z of zeilen) {
    const text = z.teile.sort((a, b) => a.x - b.x).map((t) => t.text.trim()).join(" ");
    const m = /wasch\s*prog[^:]*:?\s*(.*)$/i.exec(text);
    if (m) return m[1].trim();
  }
  return null;
}

export function waschprogLesen(adresse) {
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
      const wert = waschprogAusText(inhalt.items) || "";
      merken(adresse, wert);
      return wert;
    } finally { aufgabe.destroy(); }
  })().catch(() => null).finally(() => unterwegs.delete(adresse));
  unterwegs.set(adresse, p);
  return p;
}

// Für React: der Wert zur WBG-Adresse, solange er unterwegs ist null
export function useWaschprog(adresse) {
  const [wert, setWert] = useState(() => (adresse && gemerkt.has(adresse) ? gemerkt.get(adresse) : null));
  useEffect(() => {
    let weg = false;
    setWert(adresse && gemerkt.has(adresse) ? gemerkt.get(adresse) : null);
    if (adresse && !gemerkt.has(adresse)) waschprogLesen(adresse).then((w) => { if (!weg) setWert(w); });
    return () => { weg = true; };
  }, [adresse]);
  return wert;
}
