// =================================================================
//  QMS: Lieferantenbewertung (seit 1.483.0, Wunsch Patrick 11. November
//  2026: „ich schicke jährlich nur Seite 1 mit der Lieferantenliste,
//  welche bewertet werden, und wir machen die Bewertung hier“).
//
//  Liest Seite 1 aus dem Gewatec „Auswahl Lieferanten zur periodischen
//  Bewertung nach Anzahl Bestellungen“ (eingescannt mit Texterkennung,
//  darum mit I statt 1, „'/o“ statt %, Strichen als „mmm“ dazwischen) und
//  rechnet die Bewertung wie auf dem Gewatec-Blatt: fünf Kriterien mit
//  je fünf Smileys, Punktzahl 20–100, 20–60 sperren, 60–80 Massnahme,
//  80–100 keine Massnahme. Ohne Abhängigkeiten, damit der Prüfstand es
//  in Node prüfen kann.
// =================================================================

export const LB_KRITERIEN = [
  ["t", "Termintreue"], ["p", "Preis"], ["b", "Beratungskompetenz"], ["q", "Qualität"], ["r", "Reklamationsmanagement"],
];
// Smileys von links (rot) nach rechts (dunkelgrün) wie auf dem Blatt
export const LB_STUFEN = [[1, "😠", "sehr schlecht"], [2, "🙁", "schlecht"], [3, "😐", "genügend"], [4, "🙂", "gut"], [5, "😄", "sehr gut"]];

// Ampel wie auf dem Gewatec-Blatt
export function lbAmpel(p) {
  const n = Number(p);
  if (!(n > 0)) return null;
  if (n < 60) return ["rot", "Lieferant sperren"];
  if (n < 80) return ["gelb", "Massnahme erforderlich"];
  return ["gruen", "keine Massnahme erforderlich"];
}

// Vorschlag aus den Smileys: jedes Kriterium 1–5, alle fünf auf 5 = 100
export function lbVorschlag(k) {
  const w = LB_KRITERIEN.map(([x]) => Number((k || {})[x])).filter((x) => x > 0);
  if (!w.length) return null;
  return Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 20);
}
export const lbPunkte = (v) => (Number(v && v.punkte) > 0 ? Number(v.punkte) : lbVorschlag(v && v.k));

// Texterkennung: I, l, O, t, ' in Zahlen
function zahl(s) {
  const t = String(s || "").replace(/'\/o/g, "%").replace(/[Il|]/g, "1").replace(/[Oo]/g, "0").replace(/^t/, "1")
    .replace(/(\d)\s+\./g, "$1.").replace(/\.\s+(\d)/g, ".$1").replace(/['’`"]/g, "").replace(",", ".");
  const n = parseFloat(t.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
const DAT = /([\dOoIlt]{1,2})\.\s?([\dOoIlt]{1,2})[.,]?\s?(\d{4})/;
const ziffern = (x) => x.replace(/[Oo]/g, "0").replace(/[Ilt]/g, "1");
const iso = (s) => {
  const m = DAT.exec(s || "");
  if (!m) return null;
  const t = ziffern(m[1]), mo = ziffern(m[2]);
  if (!/^\d+$/.test(t + mo) || +mo < 1 || +mo > 12 || +t < 1 || +t > 31) return null;
  return m[3] + "-" + mo.padStart(2, "0") + "-" + t.padStart(2, "0");
};
const PROZ = /([\dIlOt'’. ]{1,7}(?:%|['!]?\/[o0]))(.*)$/;

// Zeilen von Seite 1 → { von, bis, jahr, druck, total, liste: [{nr, name, anteil, best}] }
export function lbListeLesen(zeilen) {
  const aus = { von: null, bis: null, jahr: null, druck: null, total: null, liste: [] };
  // Der Prozentwert steht beim Scan manchmal eine Zeile über dem Namen
  let offen = null;
  for (const z0 of zeilen) {
    const z = String(z0 || "").replace(/\s+/g, " ").trim();
    if (!aus.von && /zeitraum/i.test(z)) {
      const d = z.split(/\bbis\b/i);
      aus.von = iso(d[0]); aus.bis = iso(d[1]);
    }
    if (!aus.druck && /druck/i.test(z)) aus.druck = iso(z.split(/druck/i)[1]);
    const t = /^total\b\D*([\d'’.,Il ]+)$/i.exec(z);
    if (t) { aus.total = zahl(t[1].replace(/\s/g, "")); continue; }
    // „20384 Steeltec  I2.79%  93“, Nummer manchmal mit Leerzeichen „201 06“
    const allein = new RegExp("^" + PROZ.source).exec(z);
    if (allein && !allein[2].trim()) { offen = zahl(allein[1].replace(/\s/g, "")); continue; }
    const m = /^([\dIil]{5}|\d{2,3}\s?['’]?\s?\d{1,3})\s+(.+?)\s*$/.exec(z);
    if (!m) continue;
    const nr = ziffern(m[1].replace(/[i]/g, "1")).replace(/\D/g, "");
    if (nr.length !== 5) continue;
    let rest = m[2];
    const pz = PROZ.exec(rest);
    let anteil = null, best = null;
    if (pz) {
      anteil = zahl(pz[1].replace(/\s/g, ""));
      const b = /(\d[\dIl]*)\s*$/.exec(pz[2].trim());
      if (b) best = zahl(b[1]);
      rest = rest.slice(0, pz.index);
    }
    if (anteil == null && offen != null) anteil = offen;
    offen = null;
    // Striche des Balkens kommen als „mmm“, „aamam“, „W“ dazwischen
    const name = rest.split(/\s{2,}/)[0].split(" ").filter((w, i, a) => !(i === a.length - 1 && i > 0 && (/^(?=[maiwtg«ö]*m)[maiwtg«ö]{2,}$/i.test(w) || w === "W"))).join(" ").replace(/\s+[a-zäöü«]$/, "").replace(/[\s"'’*]+$/, "").trim();
    if (!name || /^seite/i.test(name)) continue;
    if (aus.liste.some((x) => x.nr === nr)) continue;
    aus.liste.push({ nr, name, anteil: anteil != null && anteil < 100 ? anteil : null, best });
  }
  if (aus.bis) aus.jahr = Number(aus.bis.slice(0, 4));
  else if (aus.von) aus.jahr = Number(aus.von.slice(0, 4));
  return aus;
}

// Vorschlag, wer bewertet wird: die grössten bis zusammen knapp 80 % der
// Bestellungen (so hat Hofer + Co bisher ausgewählt), höchstens 12
export function lbAuswahlVorschlag(liste) {
  const aus = [];
  let summe = 0;
  for (const x of liste) {
    if (aus.length >= 12 || summe >= 78) break;
    aus.push(x.nr);
    summe += Number(x.anteil) || 0;
  }
  return aus;
}
