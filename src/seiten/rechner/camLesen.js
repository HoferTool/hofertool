// =================================================================
//  HOFERCAM: eingelesenes Programm in Felder und Bearbeitungen zerlegen
//  Seit 1.542.0 (Wunsch Patrick 14. November 2026: „es soll die Kopf-
//  und Enddaten der Bearbeitungen sowie die Werkzeuge auch erkennen“).
//  Gelesen wird rückwärts über dieselben Vorlagen, aus denen die App das
//  Programm schreibt (camTyp.js, je Maschinentyp änderbar): jede Zeile
//  der Vorlage wird ein Suchmuster, {CODE} nimmt alles dazwischen. Was
//  nicht passt, bleibt im eingelesenen Text und ist violett markiert.
// =================================================================

import { typ } from "./camTyp.js";
import { markeVon, plaetzeVon, markenPaare, programme, neuerBlock } from "./hofercam.js";

const BED_RE = /^\s*\[(!?)([a-z0-9]+)\]\s?/i;
const LISTE_RE = /^(\/?)\{(CODE|PAARE|PAARE2|PAARE3)\}$/;
// Wartemarken wie istMarkeNr: M20, M40, M41, M82, M83, M200–M999
const MARKE = "(M(?:[2-9]\\d\\d|20|40|41|82|83))";
// Muster je Platzhalter; zusammenstehende wie {G96}{DREH}S{S}T{T} brauchen
// enge Muster, sonst nimmt der erste zu viel
const MUSTER = {
  G96: "((?:G96)?)", HDN: "(\\d)", G50: "(\\d+)", DREH: "(M\\d+)", T: "(\\d+)", TK: "(\\d+)", SSTART: "(\\d+)", T2: "(\\d+)", T2V: "(\\d+)", PLATZ: "(\\d{3,4})",
  HD: "(\\d*)", VOR: "(G9[89])", WINKEL: "((?:,A[-+\\d.]+)?)", Y: "((?:Y[-+\\d.]+)?)",
  M1: MARKE, M2: MARKE, M3: MARKE, NR: "(\\d{1,4})", NR2: "(\\d{1,4})",
  BEZ_K: "\\s*((?:\\(.*\\))?)", NAME: "((?:\\(.*\\))?)", BEZ_GEGEN: "(.*)",
};
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Vorlage → Liste von Zeilen {re, namen, bed: [[neg, name]], liste}
function vorlageZeilen(text) {
  const aus = [];
  for (const roh of String(text || "").split(/\r?\n/)) {
    let z = roh, m;
    const bed = [];
    while ((m = z.match(BED_RE))) { bed.push([!!m[1], m[2].toLowerCase()]); z = z.slice(m[0].length); }
    const t = z.trim();
    if (t === "") continue;
    const lm = t.match(LISTE_RE);
    if (lm) { aus.push({ liste: lm[2], schraeg: !!lm[1], bed }); continue; }
    const namen = [];
    let re = "";
    let rest = t;
    while (rest) {
      const p = rest.match(/\{([A-Z0-9_]+)\}/);
      if (!p) { re += esc(rest); break; }
      re += esc(rest.slice(0, p.index));
      namen.push(p[1]);
      re += MUSTER[p[1]] || "(.*?)";
      rest = rest.slice(p.index + p[0].length);
    }
    // Ein Platzhalter, der leer sein darf, lässt die ganze Zeile weg
    // (vorlageFuellen schreibt leere Zeilen nicht)
    // Ein Kommentar in Klammern hinten wie „(HD EIN)“ stört das Erkennen
    // nicht; er bleibt als Abweichung im eingelesenen Text
    if (!t.includes("(")) re += "(?:\\s*\\(.*\\))?";
    aus.push({ re: new RegExp("^" + re + "$", "i"), namen, bed, text: t });
  }
  return aus;
}

function passt(v, zeile, werte) {
  const m = zeile.match(v.re);
  if (!m) return false;
  v.namen.forEach((n, i) => { if (!(n in werte)) werte[n] = m[i + 1] ?? ""; });
  return true;
}

// Vorlage gegen Zeilen legen: vorne bis zur Liste vorwärts, hinten
// rückwärts, dazwischen die Liste. Ergebnis mit Fehlerpunkten (je
// fehlende Pflichtzeile und je Zeile zu viel einer)
export function vorlageLesen(text, zeilen) {
  const v = vorlageZeilen(text);
  const L = v.findIndex((x) => x.liste);
  const vorn = L < 0 ? v : v.slice(0, L), hinten = L < 0 ? [] : v.slice(L + 1).reverse();
  const werte = {}, bed = {}, an = new Set(), fehl = { n: 0 };
  const bedMerken = (x, ok) => x.bed.forEach(([neg, n]) => { if (ok) bed[n] = !neg; else if (!(n in bed)) bed[n] = neg; });
  const gehe = (vl, zl) => {
    let i = 0;
    for (const x of vl) {
      if (i < zl.length && passt(x, zl[i], werte)) { bedMerken(x, true); an.add(x); i++; continue; }
      if (x.bed.length) { bedMerken(x, false); continue; }
      // Bis zu drei Zeilen zu viel überspringen
      let k = 1;
      while (k <= 3 && !(i + k < zl.length && passt(x, zl[i + k], werte))) k++;
      if (k <= 3) { fehl.n += k; i += k + 1; an.add(x); continue; }
      fehl.n += 2;
    }
    return i;
  };
  const a = gehe(vorn, zeilen);
  const rest = zeilen.slice(a);
  const b = gehe(hinten, [...rest].reverse());
  const mitte = rest.slice(0, rest.length - b);
  let liste = null;
  if (L >= 0) liste = v[L].schraeg ? mitte.map((z) => z.replace(/^\//, "")) : mitte;
  else fehl.n += mitte.length;
  // Zeilen mit Bedingung, die in der Vorlage stehen: ob sie da waren
  v.forEach((x) => { if (x.bed && x.re && !an.has(x)) bedMerken(x, false); });
  return { werte, bed, liste, fehl: fehl.n, ersteGut: vorn.length ? an.has(vorn[0]) : true };
}

// ---------- Kopf und Ende ----------
const ohneMinus = (t) => String(t ?? "").replace(/^-/, "");
export function kopfLesen(k1, k2) {
  const sauber = (l) => l && l.map((z) => z.trim()).filter(Boolean);
  k1 = sauber(k1); k2 = sauber(k2);
  const t = typ().vorlagen, f = {};
  const teil = (zeilen, start, kanal) => {
    const i = zeilen.findIndex((z) => /^\(Ende Kopf\)$/i.test(z)), j = zeilen.findIndex((z) => /^\(Start Ende\)$/i.test(z));
    // Seit 1.675.2 auch SW-20 ohne „(Ende Kopf)“ / „(Start Ende)“: Kopf
    // und Ende wie bei den Bearbeitungen über die Länge der Vorlage
    if (i < 0 && j < 0) {
      const m = mitte(zeilen, kanal), a = m.length ? zeilen.indexOf(m[0]) : zeilen.length;
      return start ? zeilen.slice(0, a) : zeilen.slice(m.length ? a + m.length : a);
    }
    return start ? zeilen.slice(0, i < 0 ? zeilen.length : i + 1) : zeilen.slice(j < 0 ? zeilen.length : j);
  };
  const nimm = (w) => {
    const map = { A: "A", W: "W", S: "S", X: "X", Z: "Z", F: "F", B: "B", SCHLICHT: "schlicht", PLAN: "plan", UEBER: "ueber", SCHNABEL: "schnabel", DATUM: "datum", KUERZEL: "kuerzel", HOCO: "hoco" };
    for (const [n, feld] of Object.entries(map)) if (w[n] != null && w[n] !== "") f[feld] = w[n];
    if (w.ANNAEHERN) f.annaehern = ohneMinus(w.ANNAEHERN);
    if (w.NAME) f.hoco = w.NAME.replace(/^\(|\)$/g, "");
    if (w.ABZ != null && w.ABZ !== "") f._abz = Number(String(w.ABZ).replace(/\.$/, ""));
  };
  if (k1) { nimm(vorlageLesen(t.k1kopf, teil(k1, true, 1)).werte); nimm(vorlageLesen(t.k1ende, teil(k1, false, 1)).werte); }
  if (k2) { nimm(vorlageLesen(t.k2kopf, teil(k2, true, 2)).werte); nimm(vorlageLesen(t.k2ende, teil(k2, false, 2)).werte); }
  // Abstecher: Z-0. = normal, sonst versetzt mit Versatz = Wert + B
  if (f._abz != null && !Number.isNaN(f._abz)) {
    if (f._abz > 0) { f.abArt = "versetzt"; f.abVersatz = String(Math.round((f._abz + (Number(f.B) || 0)) * 1000) / 1000); }
    else f.abArt = "normal";
  }
  delete f._abz;
  // Zahlen ohne den Punkt, den die App selbst wieder anhängt, bleiben so
  return f;
}

// ---------- Bearbeitungen ----------
const mitte = (zeilen, kanal) => {
  const i = zeilen.findIndex((z) => /^\(Ende Kopf\)$/i.test(z)), j = zeilen.findIndex((z) => /^\(Start Ende\)$/i.test(z));
  if (i >= 0 || j >= 0 || !kanal) return zeilen.slice(i < 0 ? 0 : i + 1, j < 0 ? zeilen.length : j);
  // SW-20 (1.665.0): Kopf und Ende ohne „(Ende Kopf)“ / „(Start Ende)“;
  // der Kopf ist so lang wie seine Vorlage, das Ende beginnt bei der
  // ersten festen Zeile der Ende-Vorlage
  const v = typ().vorlagen, zahl = (t) => String(t || "").split(/\r?\n/).filter((z) => z.trim() && !/^\s*\[/.test(z)).length;
  const n = zahl(v["k" + kanal + "kopf"]);
  const erste = String(v["k" + kanal + "ende"] || "").split(/\r?\n/).map((z) => z.trim()).find(Boolean) || "";
  const fest = erste && !/[{[]/.test(erste) ? erste.toUpperCase() : null;
  let e = fest ? zeilen.findIndex((z, k) => k >= n && z.toUpperCase() === fest) : -1;
  return zeilen.slice(Math.min(n, zeilen.length), e < 0 ? zeilen.length : e);
};
const istM1 = (z) => /^M0?1$/i.test(z);

// Werte der Vorlage → Felder der Bearbeitung
function blockAus(art, x1, x2) {
  const w = { ...(x1?.werte || {}), ...(x2?.werte || {}) };
  const bed = { ...(x1?.bed || {}), ...(x2?.bed || {}) };
  const gegen = art.endsWith("Gegen");
  // Vorgaben des Typs als Grund, damit fehlende Werte nicht leer schreiben
  const b = { ...neuerBlock([], gegen ? art.slice(0, -5) : art), platz: w.PLATZ || "", code: "" };
  delete b.id;
  if (gegen) b.spindel = "gegen"; else if (art === "front" || art === "quer") b.spindel = "haupt";
  const bez = w.BEZ ?? (w.BEZ_K ? w.BEZ_K.replace(/^\(|\)$/g, "") : w.BEZ_GEGEN != null ? w.BEZ_GEGEN.replace(/\s*MIT GEGENSPINDEL$/i, "") : "");
  b.bez = String(bez || "").trim();
  b.hd = bed.hd ? String(w.HD || "") : "";
  if (b.hd && "hdaus" in bed && !bed.hdaus) b.hdAn = true;
  if (w.DREH) b.dreh = w.DREH.replace(/^M/i, "");
  // SW-20 (1.665.0): G96 nur als Bedingung, vorne die Start-Drehzahl
  if (!w.G96 && "SSTART" in w) {
    if (bed.g96) { b.sArt = "vc"; b.g96 = true; b.vc = w.S || ""; b.S = w.SSTART; b.g50 = w.G50 || ""; }
    else { b.sArt = "S"; b.g96 = false; b.S = w.SSTART; }
  } else if (w.G96) { b.sArt = "vc"; b.g96 = true; b.vc = w.S || ""; b.S = ""; if (w.G50) b.g50 = w.G50; } else if (w.S != null) b.S = w.S;
  if (w.VOR) b.vor = w.VOR.replace(/^G/i, "");
  const feld = { ANZ: "anZ", WEGZ: "wegZ", WEGF: "wegF", X: "X", VORX: "vorX", VORZ: "vorZ", NX: "nX", NZ: "nZ", C: "C", ZUZ: "zuZ", HDN: "hdN" };
  for (const [n, f] of Object.entries(feld)) if (w[n] != null) b[f] = w[n];
  if ("WINKEL" in w) b.wegA = w.WINKEL.replace(/^,A/i, "");
  if ("Y" in w) b.Y = String(w.Y || "").replace(/^Y/i, "");
  // Kanal 3 (1.666.0): Zeile mit Bedingung fehlt = Feld leer
  if ("y" in bed && !bed.y) b.Y = "";
  if ("c" in bed && !bed.c) b.C = "";
  if (gegen) for (const n of ["M1", "M2", "M3"]) if (w[n]) b[n.toLowerCase()] = w[n].toUpperCase();
  if ("m38" in bed && !bed.m38) b.spAn = true;
  if ("m5" in bed && !bed.m5) b.ohneM5 = true;
  return b;
}

// Abschnitte: ab einer Werkzeugzeile (Kanal 1) bzw. M75 (Kanal 2) bis zum
// letzten M1 darin; was danach kommt (Marken mit Code für den anderen
// Kanal) steht in `zwischen`, je Zeile mit der Stelle (Abschnitt − ½)
function abschnitteVon(zeilen, istStart, nachM1 = () => false) {
  const ab = [], zwischen = [];
  let akt = null;
  const frei = (l) => l.forEach((z) => zwischen.push({ z, pos: ab.length - 0.5 }));
  const zu = () => {
    if (!akt) return;
    let e = akt.length - 1;
    while (e >= 0 && !istM1(akt[e])) e--;
    if (e >= 1 && e + 1 < akt.length && nachM1(akt[e + 1], akt)) e++;
    // Ohne M1 (etwa „G0T0“ am Schluss) gilt alles bis zum nächsten Werkzeug;
    // nach dem M1 nur Marken mit Code für den anderen Kanal abtrennen
    if (e < 1 || (e + 1 < akt.length && !markeVon(akt[e + 1]))) e = akt.length - 1;
    const rest = akt.slice(e + 1);
    ab.push(akt.slice(0, e + 1));
    frei(rest);
    akt = null;
  };
  for (const z of zeilen) {
    if (istStart(z)) { zu(); akt = [z]; continue; }
    if (akt) akt.push(z); else frei([z]);
  }
  zu();
  return { ab, zwischen };
}

// Marke x, Zeilen, Marke y → { "x-y": {zeilen, pos} }
function paareIn(zeilen) {
  const aus = {};
  const z = zeilen.map((x) => (typeof x === "string" ? { z: x, pos: 0 } : x));
  for (let i = 0; i < z.length; i++) {
    const x = markeVon(z[i].z);
    if (!x) continue;
    for (let j = i + 1; j < z.length; j++) {
      const y = markeVon(z[j].z);
      if (!y) continue;
      if (!((x + "-" + y) in aus)) aus[x + "-" + y] = { zeilen: z.slice(i + 1, j).map((q) => q.z), pos: z[i].pos };
      break;
    }
  }
  return aus;
}

const gruppeVon = (platz) => ["dreh", "front", "seite", "quer", "k2", "k2a", "k2b"].find((g) => plaetzeVon(g).includes(String(platz)));
const K1_ARTEN = { dreh: ["dreh"], front: ["front", "frontGegen"], seite: ["seite"], quer: ["quer", "querGegen"] };

function besteVorlage(arten, zeilen, kanal) {
  let best = null;
  for (const art of arten) {
    // Nur Arten, die der Maschinentyp hat (SW-20: vorerst Drehen und Front)
    if (typ().arten && !typ().arten.includes(art)) continue;
    const r = vorlageLesen(typ().vorlagen[art + ".k" + kanal], zeilen);
    if (!r.ersteGut) continue;
    if (!best || r.fehl < best.r.fehl) best = { art, r };
  }
  return best;
}
const zuSchlecht = (best, s) => !best || best.r.fehl > Math.max(8, s.length / 2);

// Seit 1.561.0 (Patrick 16. November 2026, O0014/O1014 von 2016: „du
// erkennst viele Bearbeitungen nicht, warum?“): ältere Programme sind
// nicht nach der Vorlage gebaut. Ein Werkzeug, das zu keiner Vorlage
// passt, wird trotzdem eine Bearbeitung „wie eingelesen“ (frei: true):
// Platz und Art aus dem Werkzeugaufruf, der NC-Code ist das ganze Stück
// vom Werkzeugaufruf bis M1, das Programm schreibt es unverändert.
const zahlIn = (zeilen, re) => { for (const z of zeilen) { const m = z.replace(/^\//, "").match(re); if (m) return m[1]; } return null; };
function freiBlock(art, s, platz) {
  const b = { ...neuerBlock([], art), platz: String(platz), frei: true, code: s.join("\n") };
  delete b.id;
  const t = s.find((z) => /^\/?T\d{3,4}/i.test(z)) || "";
  b.bez = (t.match(/\(([^)]*)\)/) || [])[1]?.trim().toUpperCase() || "";
  const S = zahlIn(s, /^(?:G9[67])?M(?:0?[34]|3[67])S(\d+)/i);
  if (S) { b.sArt = "S"; b.S = S; b.g96 = false; }
  // Frontwerkzeuge: Anfahren = erstes G0Z, Zurück = letztes G0Z (für die Simulation)
  const zs = s.map((z) => z.replace(/^\//, "").match(/^G0+Z(-?[\d.]+)/i)).filter(Boolean).map((m) => m[1]);
  if (zs.length) { b.anZ = zs[0]; b.wegZ = zs[zs.length - 1]; }
  if (art === "front" || art === "quer") b.spindel = "haupt";
  return b;
}
// Teile von Ende-Abschnitten älterer Programme ohne „(Start Ende)“
const istEnde1 = (s) => s.some((z) => /#524|M99/i.test(z));
const istEnde2 = (s) => s.some((z) => /M99|G131|^\/?T29\d\d/i.test(z));
const istT2000 = (z) => /^\/?T2000\(/i.test(z);

// k1, k2: eingelesene Zeilen je Kanal (oder null). Ergebnis: Bearbeitungen
// in der Reihenfolge des Programms und wie viele Abschnitte nicht passten
export function bloeckeLesen(k1, k2, k3) {
  // Leerzeilen und Leerzeichen am Rand zählen nicht (Patricks Programme haben welche)
  const sauber = (l) => l && l.map((z) => z.trim()).filter(Boolean);
  k1 = sauber(k1); k2 = sauber(k2); k3 = sauber(k3);
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Nicht erkannte Abschnitte mit ihrem Werkzeug, für die Meldung
  const unklar = [];
  const werkzeug = (s) => (s.find((z) => /^\/?T\d{3,4}/i.test(z)) || s[0] || "").replace(/^\//, "").match(/^T\d+/i)?.[0] || s[0];
  // Kanal 1 zuerst; jede Bearbeitung hat ihre Stelle p1 (und p2 in Kanal 2)
  const t1 = k1 ? abschnitteVon(mitte(k1, (typ().kanaele || 2) > 2 ? 1 : 0), (z) => /^T\d{3,4}(\(|$)/i.test(z) && !/^T0+(\(|$)/.test(z)) : { ab: [], zwischen: [] };
  const liste = [];
  t1.ab.forEach((s, i) => {
    const platz = s[0].match(/^T(\d{3,4})/i)[1];
    const gr = gruppeVon(platz);
    const arten = K1_ARTEN[gr];
    const best = arten && besteVorlage(arten, s, 1);
    if (zuSchlecht(best, s)) {
      if (istEnde1(s)) return;
      if (arten && gr !== "k2") { liste.push({ b: freiBlock(gr, s, platz), p1: i, p2: null }); return; }
      unklar.push(werkzeug(s)); return;
    }
    liste.push({ best, p1: i, p2: null });
  });
  // Die Marke Ende der Frontangetriebenen an der Gegenspindel steht in
  // Kanal 2 nach dem M1
  const m3 = new Set(liste.filter((x) => x.best?.art === "querGegen").map((x) => String(x.best.r.werte.M3 || "").toUpperCase()));
  const t2 = k2 ? abschnitteVon(mitte(k2, (typ().kanaele || 2) > 2 ? 2 : 0), (z) => /^M75$/i.test(z),
    (z, s) => /^M0?5$/i.test(z) || (s.some(istT2000) && m3.has(markeVon(z)))) : { ab: [], zwischen: [] };
  const gegen2 = [];
  t2.ab.forEach((s, pos) => {
    if (s.some(istT2000)) { if (!istEnde2(s)) gegen2.push({ s, pos, frei: true }); return; }
    // SW-20 (1.667.0): eigene Plätze je Art, die Vorlage folgt dem Platz
    const pl2 = (werkzeug(s).match(/^T(\d{3,4})/i) || [])[1];
    const gp = pl2 && typ().plaetze.k2b ? gruppeVon(pl2) : null;
    const best = besteVorlage(gp && gp.startsWith("k2") ? [gp] : ["k2", "k2a", "k2b"], s, 2);
    if (zuSchlecht(best, s)) {
      if (istEnde2(s)) return;
      const platz = (werkzeug(s).match(/^T(\d{3,4})/i) || [])[1];
      const gr2 = platz && gruppeVon(platz);
      if (gr2 && gr2.startsWith("k2")) {
        // angetrieben, wenn M36/M37 (SW-20: M56/M57) eingeschaltet wird
        const art = gr2 !== "k2" ? gr2 : s.some((z) => /^\/?M[35][67]S/i.test(z)) ? "k2a" : "k2";
        liste.push({ b: freiBlock(art, s, platz), p1: null, p2: pos }); return;
      }
      unklar.push(werkzeug(s)); return;
    }
    const b = blockAus(best.art, null, best.r);
    b.code = (best.r.liste || []).join("\n");
    liste.push({ b, p1: null, p2: pos });
  });
  for (const x of liste) {
    if (!x.best) continue;
    const { best } = x;
    if (best.art.endsWith("Gegen")) {
      // Passendes Stück in Kanal 2 über die Marke Start
      const m1 = String(best.r.werte.M1 || "").toUpperCase();
      const g = gegen2.find((q) => q.frei && q.s.some((z) => markeVon(z) === m1)) || gegen2.find((q) => q.frei);
      let r2 = null;
      if (g) { g.frei = false; x.p2 = g.pos; r2 = vorlageLesen(typ().vorlagen[best.art + ".k2"], g.s); }
      x.b = blockAus(best.art, best.r, r2);
      x.b.code = (r2?.liste || []).join("\n");
      // Kanal 1 zwischen den Markenpaaren des Codes
      const paare = paareIn(best.r.liste || []);
      for (const [a, c] of markenPaare(x.b)) if (paare[a + "-" + c]) (x.b.k1 ||= {})[a + "-" + c] = paare[a + "-" + c].zeilen.join("\n");
    } else {
      x.b = blockAus(best.art, best.r, null);
      x.b.code = (best.r.liste || []).join("\n");
    }
  }
  gegen2.filter((q) => q.frei).forEach((q) => unklar.push("T2000"));
  // Kanal 3 (SW-20, seit 1.666.0): Frontbohrapparat T1300–T1500 und feste
  // Werkzeuge T1600–T1900; andere Stücke (M131 / M133 …) bleiben im Text
  const arten3 = (typ().arten || []).filter((a) => a.startsWith("k3"));
  let t3 = { ab: [], zwischen: [] };
  if (k3 && arten3.length) {
    t3 = abschnitteVon(mitte(k3, 3), (z) => /^T\d{3,4}(\(|$)/i.test(z) && !/^T0+(\(|$)/.test(z));
    t3.ab.forEach((s, pos) => {
      const platz = s[0].match(/^T(\d{3,4})/i)[1];
      // Seit 1.676.0 teilen sich Frontbohrapparat angetrieben (k3f) und
      // fest (k3ff) die Plätze T1300–T1500: die besser passende Vorlage gilt
      const arten = arten3.filter((a) => plaetzeVon(a).includes(platz));
      if (!arten.length) return;
      const best = besteVorlage(arten, s, 3);
      if (zuSchlecht(best, s)) { liste.push({ b: freiBlock(arten[0], s, platz), p1: Infinity, p3: pos }); return; }
      const b = blockAus(best.art, null, best.r);
      b.code = (best.r.liste || []).join("\n");
      liste.push({ b, p1: Infinity, p3: pos });
    });
  }
  // Code für den anderen Kanal zwischen Markenpaaren, mit dessen Stelle
  // Seit 1.668.0 je Kanal aus dem P der Marke (ohne P der andere Kanal)
  const pk = { 1: paareIn(t1.zwischen), 2: paareIn(t2.zwischen), 3: paareIn(t3.zwischen) };
  for (const x of liste) {
    if (x.b.spindel === "gegen") continue;
    for (const [a, c, ziele] of markenPaare(x.b)) {
      const k = a + "-" + c;
      for (const z of ziele) {
        const q = pk[z][k];
        if (!q) continue;
        (x.b["k" + z] ||= {})[k] = q.zeilen.join("\n");
        if (z === 1 && x.p1 == null) x.p1 = q.pos;
        if (z === 2 && x.p2 == null) x.p2 = q.pos;
      }
    }
  }
  // Reihenfolge: nach der Stelle in Kanal 1; was nur in Kanal 2 steht,
  // vor der ersten Bearbeitung, die dort später kommt
  const mit1 = liste.filter((x) => x.p1 != null).sort((a, b) => a.p1 - b.p1);
  for (const x of liste) if (x.p1 == null) {
    const nach = mit1.find((y) => y.p2 != null && y.p2 > x.p2);
    x.p1 = nach ? nach.p1 - 0.25 : Infinity;
  }
  const aus = liste.map((x, i) => ({ ...x, i })).sort((a, b) => (a.p1 === b.p1 ? 0 : a.p1 - b.p1) || (a.p3 ?? 0) - (b.p3 ?? 0) || (a.p2 ?? 0) - (b.p2 ?? 0) || a.i - b.i).map((x) => x.b);
  aus.forEach((b) => { b.id = id(); });
  return { bloecke: aus, unklar };
}

// Probe für den Prüfstand: lässt sich ein erzeugtes Programm verlustfrei lesen?
export function rundlauf(w) {
  const p = programme(w);
  return bloeckeLesen(p.k1, p.k2, p.k3);
}
