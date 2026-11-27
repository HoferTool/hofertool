// Listen nach Spalte sortieren (Wunsch Patrick 27. November 2026: „in allen
// Suchfenstern, sobald die Liste angezeigt wird, nach Spalte sortieren“).
// Ein Tipp auf den Spaltenkopf sortiert aufsteigend, ein zweiter absteigend,
// ein dritter zurück zur gewohnten Reihenfolge. Sortiert wird nach dem Text,
// der in der Zelle steht: Zahlen (1'200, 12.5, CHF …) als Zahl, Daten
// (27.11.2026, 27.11.26 12:30) als Datum, sonst Text mit Ziffern in Reihe
// (10789-0107 vor 10789-0110). Leere Zellen stehen immer hinten.
import { useState, isValidElement } from "react";

// Sichtbarer Text eines React-Knotens (auch verschachtelt)
export function zellText(k) {
  if (k == null || k === false || k === true) return "";
  if (typeof k === "string" || typeof k === "number") return String(k);
  if (Array.isArray(k)) return k.map(zellText).join(" ");
  if (isValidElement(k)) {
    const p = k.props || {};
    if (p["data-sort"] != null) return String(p["data-sort"]);
    if (p.value != null && typeof p.value !== "object") return String(p.value);
    return zellText(p.children);
  }
  return "";
}

const LEER = /^[\s–—-]*$/;

// Vergleichswert: [Art, Wert], Art 0 = Datum/Zahl, 1 = Text
function wert(text) {
  const t = String(text).trim();
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m && (m[3] || m[4])) {
    const j = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
    return [0, j * 1e8 + +m[2] * 1e6 + +m[1] * 1e4 + (m[4] ? +m[4] * 100 + +m[5] : 0)];
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return [0, +m[1] * 1e8 + +m[2] * 1e6 + +m[3] * 1e4];
  // Zahl, auch mit Tausender-Apostroph, Vorzeichen und Einheit dahinter („1'200 CHF“, „−3 Stk“)
  const z = t.match(/^([+−-]?)\s*(\d[\d'’ ]*(?:[.,]\d+)?)((?:\s*[A-Za-zµ%/.]+){0,2})$/);
  if (z) {
    const n = parseFloat(z[2].replace(/['’ ]/g, "").replace(",", "."));
    return [0, z[1] === "-" || z[1] === "−" ? -n : n];
  }
  return [1, t.toLowerCase()];
}

export function vergleiche(a, b) {
  const la = LEER.test(a), lb = LEER.test(b);
  if (la || lb) return la === lb ? 0 : la ? 1 : -1;
  const wa = wert(a), wb = wert(b);
  if (wa[0] !== wb[0]) return wa[0] - wb[0];
  if (wa[0] === 0) return wa[1] - wb[1];
  return wa[1].localeCompare(wb[1], "de-CH", { numeric: true });
}

// Zustand für eine Tabelle: { spalte, ab } oder null
export function useSortierung() {
  const [s, setS] = useState(null);
  const klick = (i) => setS((v) => (!v || v.spalte !== i ? { spalte: i, ab: false } : !v.ab ? { spalte: i, ab: true } : null));
  return [s, klick];
}

// Zeilen sortieren; textVon(zeile, spalte) liefert den Text der Zelle.
// Bei gleichem Wert bleibt die alte Reihenfolge (stabil).
export function sortiert(zeilen, s, textVon) {
  if (!s) return zeilen;
  return zeilen.map((z, i) => [z, i, textVon(z, s.spalte)])
    .sort((a, b) => {
      // Leere immer hinten, auch absteigend
      const la = LEER.test(a[2]), lb = LEER.test(b[2]);
      if (la || lb) return la === lb ? a[1] - b[1] : la ? 1 : -1;
      return (s.ab ? -1 : 1) * vergleiche(a[2], b[2]) || a[1] - b[1];
    })
    .map((x) => x[0]);
}

// Pfeil im Spaltenkopf
export const sortPfeil = (s, i) => (s && s.spalte === i ? (s.ab ? " ▼" : " ▲") : "");
