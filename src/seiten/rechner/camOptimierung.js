// =================================================================
//  HOFERCAM: Optimierung (seit 1.692.0)
//  Wunsch Patrick 22. November 2026: „einen Button Optimierung. Frag
//  zuerst nach dem Material, wenn der Button gedrückt wird. Dann
//  analysiere das Programm und mach Optimierungsvorschläge in Form einer
//  Auflistung.“
//  Gerechnet wird aus denselben Zeilen wie die 3D-Simulation (simAufbauen,
//  also mit Handänderungen): Schnittgeschwindigkeit aus Drehzahl und Ø,
//  Vorschub gegen Eckradius und Bohrer-Ø, Tiefe der Bohrungen, Wege im
//  Vorschub ausserhalb des Rohmaterials, doppelte Zeilen, Verweilzeiten,
//  Laufzeit je Bearbeitung. Richtwerte für Hartmetall, nur als Hinweis.
//  Das Programm ändert sich dabei nicht.
// =================================================================

import { simAufbauen, schnittJePunkt } from "./camSim.js";
import { wzArt } from "./camWerkzeug.js";

// Richtwerte Hartmetall: Vc [m/min] Drehen, Bohren, Fräsen; fB Vorschub
// Bohren je Umdrehung als Anteil vom Bohrer-Ø
export const WERKSTOFFE = [
  { key: "stahl", name: "Automatenstahl / Stahl", dreh: [150, 260], bohr: [60, 110], fraes: [90, 160], fB: [0.012, 0.025] },
  { key: "v2a", name: "Rostfrei V2A (1.4301, 1.4305)", dreh: [120, 200], bohr: [40, 70], fraes: [60, 110], fB: [0.01, 0.02], rostfrei: true },
  { key: "v4a", name: "Rostfrei V4A (1.4404, 1.4571)", dreh: [100, 180], bohr: [35, 60], fraes: [50, 100], fB: [0.008, 0.018], rostfrei: true },
  { key: "chrom", name: "Chromstahl (1.4104, 1.4542)", dreh: [100, 180], bohr: [35, 65], fraes: [50, 100], fB: [0.008, 0.018], rostfrei: true },
  { key: "messing", name: "Messing", dreh: [200, 400], bohr: [80, 160], fraes: [150, 300], fB: [0.015, 0.035] },
  { key: "neusilber", name: "Neusilber", dreh: [120, 250], bohr: [50, 100], fraes: [80, 180], fB: [0.012, 0.03] },
  { key: "alu", name: "Aluminium", dreh: [250, 600], bohr: [100, 250], fraes: [200, 500], fB: [0.015, 0.04] },
  { key: "titan", name: "Titan", dreh: [40, 90], bohr: [25, 45], fraes: [30, 60], fB: [0.008, 0.015], zaeh: true },
  { key: "kunststoff", name: "Kunststoff", dreh: [150, 400], bohr: [80, 200], fraes: [150, 400], fB: [0.02, 0.05] },
];
const GRUPPE_ZU = { messing_ohne_pb: "messing" };
// Werkstoffgruppe aus einer Bezeichnung (X14CrMoS17 rd 024, 1.4305, Messing …)
export function werkstoffAusBez(bez, erkennen) {
  if (!String(bez || "").trim() || !erkennen) return null;
  const g = erkennen(bez);
  const key = g ? GRUPPE_ZU[g.key] || g.key : null;
  return WERKSTOFFE.find((x) => x.key === key) || null;
}

const SPINDEL_MAX = 10000; // Höchstdrehzahl Haupt- und Gegenspindel, angenommen
const EILGANG = 30000; // mm/min, angenommen für die Laufzeit
const DREH_ARTEN = new Set(["dreh", "k3dr"]);

// Zeile ohne Kommentar, „/“ und Satznummer
const sauber = (roh) => String(roh || "").trim().replace(/^\//, "").replace(/\([^)]*\)?/g, "").replace(/^N\d+\s*/i, "").trim().toUpperCase();
const runden = (x, n = 0) => { const f = 10 ** n; return Math.round(x * f) / f; };
const zahl = (t) => Number(t).toLocaleString("de-CH", { maximumFractionDigits: 3 }).replace(/’/g, "'");
const ganz = (t) => Math.round(t).toLocaleString("de-CH").replace(/’/g, "'");
const sek = (t) => (t >= 60 ? Math.floor(t / 60) + " min " + Math.round(t % 60) + " s" : runden(t, 1).toString().replace(".", ".") + " s");

// Wert eines Worts (S1200, S#529, S[#529]); null wenn nicht lesbar
function wort(s, buchst, v) {
  const m = s.match(new RegExp("(?:^|[^A-Z])" + buchst + "(-?\\d*\\.?\\d+|#\\d+|\\[#\\d+\\])"));
  if (!m) return null;
  const t = m[1].replace(/[[\]]/g, "");
  if (t[0] === "#") { const n = Number(v?.[t.slice(1)]); return isFinite(n) ? n : null; }
  return Number(t);
}

// Zustand je Zeile: S, G96, Drehzahlgrenze, F, G98/G99
function zustaende(zeilen, v) {
  let S = null, g96 = false, smax = null, F = null, g98 = false;
  return zeilen.map((roh) => {
    const s = sauber(roh);
    if (/G96(?!\d)/.test(s)) g96 = true;
    if (/G97(?!\d)/.test(s)) g96 = false;
    if (/G98(?!\d)/.test(s)) g98 = true;
    if (/G99(?!\d)/.test(s)) g98 = false;
    if (/G50(?!\d)/.test(s)) { const x = wort(s.replace(/^.*G50/, " "), "S", v); if (x != null) smax = x; }
    else { const x = wort(s, "S", v); if (x != null) S = x; }
    const f = wort(s, "F", v);
    if (f != null && !/^G266/.test(s)) F = f;
    return { S, g96, smax, F, g98 };
  });
}

// Drehzahl an einem Ø (G96: aus Vc, begrenzt mit G50)
function drehzahlBei(z, d) {
  if (z.S == null) return null;
  if (!z.g96) return z.S;
  const n = z.S * 1000 / (Math.PI * Math.max(d, 0.5));
  return Math.min(n, z.smax || SPINDEL_MAX);
}

// Länge zwischen zwei Punkten der Simulation (mit t: Lage im Teil)
const abstand = (a, b) => (a.t && b.t ? Math.hypot(a.t[0] - b.t[0], a.t[1] - b.t[1], a.t[2] - b.t[2]) : Math.hypot((a.z ?? 0) - (b.z ?? 0), (a.r ?? 0) - (b.r ?? 0)));

const STUFEN = { wichtig: 0, empfehlung: 1, tipp: 2 };

export function analysieren(w, werkstoff) {
  const sim = simAufbauen(w);
  // Seit 1.718.0: je Bahnpunkt, ob er wirklich Material wegnimmt
  let schnitt = [];
  try { schnitt = schnittJePunkt(sim); } catch (e) { schnitt = []; }
  const v = sim.vars || {};
  const A = sim.roh.A, vorne = sim.roh.vorne;
  const allgemein = [];
  const bearbeitungen = [];
  const ohneWz = [];
  let gesamt = 0;

  for (const s of sim.schritte) {
    if (s.art === "abstech") continue;
    const b = (w.bloecke || [])[s.i] || {};
    const zeilen = s.zeilen || [];
    const zu = zustaende(zeilen, v);
    const punkte = s.punkte || [];
    const liste = [];
    const add = (stufe, text, nr) => liste.push({ stufe, text, zeile: nr != null && zeilen[nr] != null ? String(zeilen[nr]).trim() : null });
    const art = wzArt(b);
    const wz = b.wz && b.wz.form ? b.wz : null;
    // Kanal 2 mit G50 X / Z (Nullpunkt verschoben): Ø aus X nicht sicher
    const verschoben = zeilen.some((z) => { const t = sauber(z); return /G50/.test(t) && /[XZ]/.test(t.replace(/G50/, "")); });
    const dreht = !verschoben && (art === "dreh") && (DREH_ARTEN.has(s.art) || s.art === "front" || s.art === "k2" || s.art === "k2b" || s.art === "k3d" || s.art === "k3ff");
    const bohrt = art === "fraes" && wz;
    const kanalText = s.pfad === 3 ? "Kanal 3" : s.kanal === 2 ? "Kanal 2" : "Kanal 1";

    // Laufzeit, Schnittgeschwindigkeit und Vorschub über die Bahn
    let zeit = 0, vcMin = Infinity, vcMax = 0, nrVcMax = null, nrVcMin = null, dMin = Infinity, dMax = 0, fMax = 0, nrF = null;
    let luft = 0, luftZeit = 0, nrLuft = null, fKlein = null;
    const schneidet = (k) => schnitt[(s.von || 0) + k];
    for (let k = 1; k < punkte.length; k++) {
      const p = punkte[k], q = punkte[k - 1];
      const l = abstand(p, q);
      const z = zu[p.nr] || {};
      if (!p.vor) { zeit += l / EILGANG * 60; continue; }
      const d = dreht ? 2 * Math.max(Math.abs(p.r ?? 0), Math.abs(q.r ?? 0)) : wz ? Number(wz.d) || 0 : 0;
      const n = drehzahlBei(z, d || 1);
      let vf = null;
      if (z.F != null) vf = z.g98 ? z.F : n ? z.F * n : null;
      if (vf > 0) zeit += l / vf * 60;
      if (l < 1e-6) continue;
      // Vorschub ohne Material (G1 statt G0, Wegfahren im Vorschub) zählt
      // nicht für Schnittwerte, er schneidet ja nichts. Seit 1.718.0 aus
      // dem Materialstand der Simulation; nur wo der nicht bekannt ist
      // (kein Werkzeug) wie früher geschätzt am Rohmaterial.
      const sch = schneidet(k);
      if (sch === false) { luft += l; if (vf > 0) luftZeit += l / vf * 60 - l / EILGANG * 60; if (nrLuft == null) nrLuft = p.nr; continue; }
      if (sch == null && dreht && s.kanal === 1 && DREH_ARTEN.has(s.art)) {
        const aussen = Math.min(Math.abs(p.r), Math.abs(q.r)) > A / 2 + 0.3;
        const vorn = Math.max(p.z, q.z) < vorne - 1;
        if (aussen || vorn) { luft += l; if (vf > 0) luftZeit += l / vf * 60 - l / EILGANG * 60; if (nrLuft == null) nrLuft = p.nr; continue; }
      }
      if (z.F != null && !z.g98 && z.F > fMax) { fMax = z.F; nrF = p.nr; }
      if (z.F != null && !z.g98 && (fKlein == null || z.F < fKlein)) fKlein = z.F;
      if (d > 0.3 && n) {
        const vc = Math.PI * d * n / 1000;
        if (vc > vcMax) { vcMax = vc; nrVcMax = p.nr; }
        if (vc < vcMin) { vcMin = vc; nrVcMin = p.nr; }
        dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
      }
    }
    gesamt += zeit;

    // Schnittgeschwindigkeit gegen die Richtwerte
    const z0 = zu.find((x) => x.S != null) || {};
    if (dreht && vcMax > 0) {
      const [lo, hi] = werkstoff.dreh;
      const g96 = zu.some((x) => x.g96);
      const vcProg = g96 ? Math.max(...zu.filter((x) => x.g96 && x.S != null).map((x) => x.S), 0) : 0;
      if (g96 && vcProg > hi * 1.15) {
        add("wichtig", "Schnittgeschwindigkeit G96 Vc " + ganz(vcProg) + " m/min programmiert, Richtwert für " + werkstoff.name + " " + lo + "–" + hi + " m/min. Vc kleiner wählen, sonst leidet die Standzeit.", zu.findIndex((x) => x.g96 && x.S === vcProg));
      } else if (g96 && vcProg > 0 && vcProg < lo * 0.8) {
        add("empfehlung", "G96 Vc " + ganz(vcProg) + " m/min ist tief für " + werkstoff.name + " (Richtwert " + lo + "–" + hi + "). Mit Vc um " + Math.round((lo + hi) / 2) + " geht es schneller.", zu.findIndex((x) => x.g96 && x.S === vcProg));
      } else if (!g96 && vcMax > hi * 1.15) {
        const n = g96 ? null : Math.round(hi * 1000 / (Math.PI * dMax) / 10) * 10;
        add("wichtig", "Schnittgeschwindigkeit bis " + ganz(vcMax) + " m/min am Ø " + zahl(runden(dMax, 2)) + ", Richtwert für " + werkstoff.name + " " + lo + "–" + hi + " m/min. "
          + (g96 ? "Vc kleiner wählen, sonst leidet die Standzeit." : "Drehzahl auf etwa S" + ganz(n) + " senken, sonst leidet die Standzeit."), nrVcMax);
      } else if (vcMax < lo * 0.8 && !g96) {
        let n = Math.round(lo * 1000 / (Math.PI * dMax) / 10) * 10;
        const kappe = n > SPINDEL_MAX;
        n = Math.min(n, SPINDEL_MAX);
        const sAlt = z0.S || 0;
        if (n > sAlt * 1.1) add("empfehlung", "Nur " + ganz(vcMax) + " m/min am grössten Ø " + zahl(runden(dMax, 2)) + " (Richtwert " + lo + "–" + hi + "). Drehzahl auf etwa S" + ganz(n)
          + (kappe ? " (Höchstdrehzahl, angenommen " + ganz(SPINDEL_MAX) + ")" : "") + " erhöhen, die Bearbeitung wird bis " + ganz((1 - sAlt / n) * 100) + " % schneller.", nrVcMax);
      }
      if (!g96 && dMin > 0.5 && dMax / dMin > 2.5 && s.kanal !== 2) {
        add("empfehlung", "Ø von " + zahl(runden(dMin, 2)) + " bis " + zahl(runden(dMax, 2)) + " mit fester Drehzahl: am kleinen Ø nur " + ganz(vcMin)
          + " m/min. Mit G96 (Vc " + Math.round((lo + hi) / 2) + ", Drehzahlbegrenzung G50) bleibt die Schnittgeschwindigkeit gleich.", nrVcMin);
      }
      if (g96 && !zu.some((x) => x.smax != null)) add("tipp", "G96 ohne Drehzahlbegrenzung G50: Feld „Max. S“ setzen, beim Plandrehen zur Mitte läuft die Spindel sonst bis zur Höchstdrehzahl.", null);
    }
    if (bohrt && vcMax > 0) {
      const bohrer = wz.form === "bohrer";
      const [lo, hi] = bohrer ? werkstoff.bohr : werkstoff.fraes;
      const d = Number(wz.d);
      const was = bohrer ? "Bohrer" : "Fräser";
      if (vcMax > hi * 1.2) add("wichtig", was + " Ø" + zahl(d) + ": " + ganz(vcMax) + " m/min, Richtwert " + lo + "–" + hi + " m/min (Hartmetall). Drehzahl auf etwa S"
        + ganz(Math.round(hi * 1000 / (Math.PI * d) / 10) * 10) + " senken.", nrVcMax);
      else if (vcMax < lo * 0.7) {
        const n = Math.round(lo * 1000 / (Math.PI * d) / 10) * 10;
        add("empfehlung", was + " Ø" + zahl(d) + ": nur " + ganz(vcMax) + " m/min, Richtwert " + lo + "–" + hi + " m/min (Hartmetall, HSS etwa die Hälfte). Mit S" + ganz(Math.min(n, SPINDEL_MAX))
          + (n > SPINDEL_MAX ? " (Höchstdrehzahl, angenommen)" : "") + " geht es schneller.", nrVcMin);
      }
      // Vorschub je Umdrehung beim Bohren
      if (bohrer && d > 0) {
        let fU = null, nrFu = null;
        for (let k = 0; k < punkte.length; k++) {
          const p = punkte[k];
          if (!p.vor || schneidet(k) === false) continue;
          const z = zu[p.nr] || {};
          const n = drehzahlBei(z, d);
          const f = z.F == null ? null : z.g98 ? (n ? z.F / n : null) : z.F;
          if (f != null && (fU == null || f > fU)) { fU = f; nrFu = p.nr; }
        }
        if (fU != null) {
          const [a, c] = werkstoff.fB;
          if (fU < a * d * 0.6) add("empfehlung", "Bohrvorschub " + zahl(runden(fU, 4)) + " mm/U, für Ø" + zahl(d) + " in " + werkstoff.name + " üblich " + zahl(runden(a * d, 3)) + "–" + zahl(runden(c * d, 3)) + " mm/U. Mehr Vorschub spart Zeit und bricht den Span besser.", nrFu);
          else if (fU > c * d * 1.3) add("wichtig", "Bohrvorschub " + zahl(runden(fU, 4)) + " mm/U ist hoch für Ø" + zahl(d) + " (üblich bis " + zahl(runden(c * d, 3)) + " mm/U), Bruchgefahr.", nrFu);
        }
        // Tiefe der Bohrung ohne Entspänen
        // Tiefe ab der Stirn (Z0 der Bearbeitung = Stirn, davor Luft)
        const zs = punkte.filter((p, k) => p.vor && p.z != null && schneidet(k) !== false).map((p) => (p.t ? p.t[0] : p.z));
        const tief = zs.length ? Math.max(0, ...zs) : 0;
        const text = zeilen.map(sauber).join(" ");
        const entspanen = /G8[3]|G74|G87/.test(text);
        if (tief > 4 * d && !entspanen && (s.art === "front" || s.art.startsWith("k2") || s.art.startsWith("k3"))) add("wichtig", "Bohrung etwa " + zahl(runden(tief, 1)) + " mm tief = " + zahl(runden(tief / d, 1)) + " × Ø ohne Entspänen. Tieflochbohren G83 mit Zustellung Q (Vorlage „Tieflochbohren“) verhindert Spänestau und Bruch.", null);
        if (tief > 3 * d && !b.hd && (werkstoff.rostfrei || werkstoff.zaeh)) add("tipp", "Tiefe Bohrung in " + werkstoff.name + " ohne Hochdruck: mit Hochdruck kommen die Späne besser heraus.", null);
        // Zustellung Q bei G83 (Fanuc: ohne Punkt in µm)
        zeilen.forEach((roh, i) => {
          const zz = sauber(roh);
          if (!/G83/.test(zz)) return;
          const m = zz.match(/Q(\d*\.?\d+)/);
          if (!m) return;
          const q = m[1].includes(".") ? Number(m[1]) : Number(m[1]) / 1000;
          if (q > 0 && q < 0.4 * d && !werkstoff.rostfrei && !werkstoff.zaeh) add("tipp", "Zustellung Q " + zahl(q) + " mm ist klein für Ø" + zahl(d) + " in " + werkstoff.name + ": viele Rückzüge. Q um " + zahl(runden(0.8 * d, 2)) + " mm spart Zeit.", i);
        });
      }
    }
    if (!wz && (art === "fraes" || dreht)) {
      if (art === "fraes" && punkte.some((p) => p.vor)) ohneWz.push("T" + (b.platz || ""));
    }

    // Vorschub gegen den Eckradius beim Drehen (theoretische Rautiefe)
    if (dreht && wz && fMax > 0) {
      const r = Number(wz.r);
      const formArt = { E: "einstech", G: "gewinde" }[wz.form];
      if (r > 0 && !formArt) {
        const rz = fMax * fMax / (8 * r) * 1000;
        if (fMax > 0.8 * r) add("wichtig", "Vorschub F" + zahl(fMax) + " ist mehr als 80 % vom Eckradius R" + zahl(r) + ": Platte kann ausbrechen. Höchstens etwa F" + zahl(runden(0.6 * r, 3)) + ".", nrF);
        else if (rz > 16) add("empfehlung", "Mit F" + zahl(fMax) + " und R" + zahl(r) + " gibt es etwa Rz " + ganz(rz) + " µm. Für eine feine Oberfläche den Schlichtschnitt mit etwa F" + zahl(runden(Math.sqrt(8 * r * 0.006), 3)) + " fahren (Rz um 6 µm).", nrF);
      }
    }
    if (dreht && fKlein != null && fKlein < 0.03 && (werkstoff.rostfrei || werkstoff.zaeh)) add("tipp", "Sehr kleiner Vorschub F" + zahl(fKlein) + " in " + werkstoff.name + ": die Platte reibt mehr als sie schneidet, das Material verfestigt sich. Lieber etwas mehr Vorschub.", null);

    // Wege im Vorschub ohne Material: oft gewollt (Wegfahren, sanft
    // Anfahren), darum nur ein Tipp und nur, wenn es spürbar Zeit kostet
    if (luft > 2 && luftZeit >= 0.5) add("tipp", "Etwa " + zahl(runden(luft, 1)) + " mm im Vorschub, wo kein Material mehr ist (G1 statt G0). Wenn es nicht nötig ist, im Eilgang fahren, spart etwa " + sek(luftZeit) + " je Teil.", nrLuft);

    // Im eigenen NC-Code: doppelte Zeilen und Verweilzeiten
    const code = String(b.code || "").split(/\r?\n/);
    for (let i = 1; i < code.length; i++) {
      const a = sauber(code[i]), c = sauber(code[i - 1]);
      if (a && a === c && !/^M[2-9]\d\d/.test(a) && !/^M[01]$/.test(a)) { liste.push({ stufe: "tipp", text: "Dieselbe Zeile zweimal hintereinander im NC-Code, die zweite kann weg.", zeile: code[i].trim() }); break; }
    }
    const pausen = [];
    zeilen.forEach((roh, i) => {
      const zz = sauber(roh);
      const m = zz.match(/^G0?4\s*[UX](\d*\.?\d+)/) || zz.match(/^G0?4\s*P(\d+)/);
      if (!m) return;
      const t = /P/.test(m[0]) ? Number(m[1]) / 1000 : Number(m[1]);
      if (t >= 0.5) pausen.push([t, i]);
    });
    if (pausen.length) {
      const sum = pausen.reduce((a, x) => a + x[0], 0);
      const nS = z0.S && !zu.some((x) => x.g96) ? z0.S : 3000;
      add("tipp", (pausen.length > 1 ? pausen.length + " Verweilzeiten, zusammen " : "Verweilzeit ") + zahl(runden(sum, 2)) + " s je Teil. Meist reichen ein bis zwei Umdrehungen (bei S" + ganz(nS) + " etwa " + zahl(runden(60 / nS * 2, 2)) + " s).", pausen[0][1]);
    }

    liste.sort((a, b2) => STUFEN[a.stufe] - STUFEN[b2.stufe]);
    bearbeitungen.push({ id: s.id, titel: s.titel, kanal: kanalText, zeit, liste });
  }

  // Ganzes Programm: Laufzeit, Werkzeuge mehrmals, fehlende Werkzeuge
  const nachZeit = [...bearbeitungen].filter((x) => x.zeit > 0).sort((a, b) => b.zeit - a.zeit);
  if (gesamt > 0 && nachZeit.length > 1) {
    const top = nachZeit.slice(0, 3).map((x) => x.titel + " " + sek(x.zeit) + " (" + ganz(x.zeit / gesamt * 100) + " %)");
    allgemein.push({ stufe: "tipp", text: "Am meisten Zeit brauchen: " + top.join(", ") + ". Dort bringt Optimieren am meisten.", zeile: null });
  }
  const k1 = sim.schritte.filter((s) => s.kanal === 1 && s.art !== "abstech" && s.pfad !== 3);
  const gesehen = new Map();
  k1.forEach((s, i) => { const l = gesehen.get(s.platz) || []; l.push(i); gesehen.set(s.platz, l); });
  for (const [platz, l] of gesehen) {
    if (l.length > 1 && l.some((x, j) => j && x !== l[j - 1] + 1)) allgemein.push({ stufe: "tipp", text: "T" + platz + " kommt in Kanal 1 " + l.length + "-mal vor, nicht direkt nacheinander. Wenn die Reihenfolge es erlaubt, zusammenlegen spart Werkzeugwechsel.", zeile: null });
  }
  if (ohneWz.length) allgemein.push({ stufe: "tipp", text: "Ohne Werkzeug hinterlegt: " + [...new Set(ohneWz)].join(", ") + ". Schnittwerte dieser Bohrer und Fräser sind nicht geprüft (🔧 Werkzeug oder „Werkzeugprotokoll einlesen“).", zeile: null });

  const zahlen = { wichtig: 0, empfehlung: 0, tipp: 0 };
  for (const x of [...allgemein, ...bearbeitungen.flatMap((y) => y.liste)]) zahlen[x.stufe]++;
  return { werkstoff, allgemein, bearbeitungen, gesamt, zahlen };
}
