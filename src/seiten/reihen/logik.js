// =================================================================
//  1×1 RIDER: Aufgaben, Punkte, Levels und der gespeicherte Stand
//  (seit 1.546.0, Wunsch Patrick 14. November 2026: „App zum Reihen
//  lernen für meinen Sohn … die Tests sind auf Geschwindigkeit, 3 Sek.
//  für eine Aufgabe … er muss Punkte sammeln und Levels hochsteigen“).
//
//  Jede Aufgabe k × r (r = Reihe 1–9, k = 1–10) hat einen Lernstand:
//  r richtig, f falsch, m Meisterschaft 0–5, t mittlere Zeit in ms.
//  Schwache Aufgaben kommen öfter dran, damit Fehler gezielt geübt
//  werden. Gespeichert wird erst am Ende einer Runde, am Gerät und am
//  Konto (profiles.einstellungen.reihen_stand), damit es auf iPad und
//  Handy derselbe Stand ist und die Datenbank geschont wird.
// =================================================================
import { alt } from "../../bruecke.jsx";

export const REIHEN = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const ZEITEN = [2, 3, 4, 5, 8, 0]; // 0 = ohne Zeit (Üben)
export const ANZAHLEN = [10, 20, 30, 50];

const SCHLUESSEL = "hofer.reihen.stand";
const KONTO = "reihen_stand";

export function leererStand() {
  return {
    v: 1, geaendert: 0, xp: 0, runden: 0, punkteRekord: 0, serieRekord: 0, zeitRekord: 0,
    richtigTotal: 0, tage: { letzter: "", serie: 0 }, a: {}, skin: "gletscher",
    einst: { reihen: [2, 3, 4, 5, 6, 7, 8, 9], zeit: 3, anzahl: 20, ton: true },
  };
}

function lesen(text) {
  try { const s = JSON.parse(text); return s && s.v === 1 ? s : null; } catch (e) { return null; }
}

export function standLaden() {
  let geraet = null, konto = null;
  try { geraet = lesen(localStorage.getItem(SCHLUESSEL)); } catch (e) { /* privat */ }
  try { konto = lesen(alt.einstellungWert ? alt.einstellungWert(KONTO, "") : ""); } catch (e) { /* ohne Konto */ }
  // Der jüngere Stand gilt: so geht nichts verloren, wenn ein Gerät
  // offline gespielt hat oder das Konto auf einem anderen Gerät weiter ist.
  const s = [geraet, konto].filter(Boolean).sort((x, y) => (y.geaendert || 0) - (x.geaendert || 0))[0];
  const leer = leererStand();
  if (!s) return leer;
  return Object.assign(leer, s, { einst: Object.assign(leer.einst, s.einst || {}), tage: Object.assign(leer.tage, s.tage || {}) });
}

export function standSpeichern(s, auchKonto) {
  s.geaendert = Date.now();
  const text = JSON.stringify(s);
  try { localStorage.setItem(SCHLUESSEL, text); } catch (e) { /* privat */ }
  if (auchKonto && alt.einstellungSetzenWert) {
    try { alt.einstellungSetzenWert(KONTO, text); } catch (e) { /* ohne Netz bleibt es am Gerät */ }
  }
}

// ---------- Levels ----------
// Von Level L zu L+1 braucht es 100 + 50·(L−1) XP: am Anfang geht es
// schnell (Erfolg!), später langsamer.
export function xpFuerLevel(L) { return 100 * (L - 1) + 25 * (L - 1) * (L - 2); }
export function levelAus(xp) {
  let L = 1;
  while (xpFuerLevel(L + 1) <= xp) L++;
  const von = xpFuerLevel(L), bis = xpFuerLevel(L + 1);
  return { level: L, von, bis, anteil: (xp - von) / (bis - von) };
}
const RAENGE = [[1, "Rookie"], [3, "Pistenflitzer"], [5, "Shredder"], [8, "Freerider"], [11, "Pro-Rider"],
  [15, "Champion"], [20, "Superstar"], [25, "Legende"], [30, "GOAT"], [40, "Mathe-Monster"]];
export function rang(L) { let r = RAENGE[0][1]; for (const [ab, n] of RAENGE) if (L >= ab) r = n; return r; }

// ---------- Ausrüstung, frei ab Level ----------
// Eigene Farben, keine Figuren oder Marken. „Gelb-Schwarz“ erinnert an
// die Farben aus dem Wankdorf, ohne Logo oder Namen.
export const SKINS = [
  { id: "gletscher", name: "Gletscher", ab: 1, jacke: 0x2f7bff, hose: 0x1b2a4a, helm: 0xffffff, brille: 0xff8a00, brett: 0x00c2ff, brett2: 0xffffff, spur: [0xffffff] },
  { id: "gelbschwarz", name: "Gelb-Schwarz", ab: 2, jacke: 0xffd400, hose: 0x111111, helm: 0x111111, brille: 0xffd400, brett: 0x111111, brett2: 0xffd400, spur: [0xffd400, 0x222222] },
  { id: "lava", name: "Lava", ab: 3, jacke: 0xff3d00, hose: 0x3a0a00, helm: 0xff9100, brille: 0x222222, brett: 0xff6d00, brett2: 0xffea00, spur: [0xff3d00, 0xffc400] },
  { id: "neon", name: "Neon", ab: 5, jacke: 0x39ff14, hose: 0xff2bd6, helm: 0x111111, brille: 0x00e5ff, brett: 0xff2bd6, brett2: 0x39ff14, spur: [0x39ff14, 0xff2bd6] },
  { id: "ninja", name: "Ninja", ab: 6, jacke: 0x1a1a1a, hose: 0x2b2b2b, helm: 0x1a1a1a, brille: 0xff1744, brett: 0x222222, brett2: 0xff1744, spur: [0xff1744] },
  { id: "galaxy", name: "Galaxy", ab: 8, jacke: 0x6a1bff, hose: 0x1a0640, helm: 0x00e5ff, brille: 0xff40ff, brett: 0x2a0a6b, brett2: 0x00e5ff, spur: [0x8c52ff, 0x00e5ff, 0xff40ff] },
  { id: "gold", name: "Gold", ab: 10, jacke: 0xffc107, hose: 0x5d4300, helm: 0xffe082, brille: 0x111111, brett: 0xffb300, brett2: 0xffffff, spur: [0xffd54f, 0xffffff] },
  { id: "diamant", name: "Diamant", ab: 15, jacke: 0x80deea, hose: 0x006064, helm: 0xe0f7fa, brille: 0x18ffff, brett: 0xb2ebf2, brett2: 0x00bcd4, spur: [0x84ffff, 0xffffff] },
  { id: "regenbogen", name: "Regenbogen", ab: 20, jacke: 0xff1744, hose: 0x2979ff, helm: 0xffea00, brille: 0x00e676, brett: 0xd500f9, brett2: 0xffea00, spur: [0xff1744, 0xff9100, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9] },
  { id: "eis", name: "Eiskönig", ab: 30, jacke: 0xe3f2fd, hose: 0x90caf9, helm: 0x42a5f5, brille: 0xffffff, brett: 0x0d47a1, brett2: 0xe3f2fd, spur: [0xe3f2fd, 0x42a5f5] },
];
export function skinVon(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }

// ---------- Aufgaben ----------
export const schluessel = (k, r) => k + "x" + r;
export function eintrag(s, k, r) { return s.a[schluessel(k, r)] || { r: 0, f: 0, m: 0, t: 0 }; }

// Fehler, die noch nicht sitzen: falsch beantwortet und seither nicht
// zweimal schnell richtig.
export function fehlerListe(s) {
  const raus = [];
  for (const [key, e] of Object.entries(s.a)) {
    if (e.f > 0 && e.m < 3) { const [k, r] = key.split("x").map(Number); raus.push({ k, r }); }
  }
  return raus;
}

function gewicht(e) {
  if (!e.r && !e.f) return 3;            // noch nie gesehen
  return 1 + (5 - e.m) * 1.4 + Math.min(e.f, 5) * 0.6;
}

// Stellt die Fragen einer Runde zusammen: gewichtet nach Schwäche, keine
// Aufgabe zweimal direkt hintereinander, und jede Reihe kommt vor.
export function rundeBauen(s, reihen, anzahl, nurFehler) {
  let pool = [];
  if (nurFehler) pool = fehlerListe(s);
  if (!pool.length) for (const r of reihen) for (let k = 1; k <= 10; k++) pool.push({ k, r });
  const raus = [];
  let letzte = "";
  for (let i = 0; i < anzahl; i++) {
    const kand = pool.filter((p) => schluessel(p.k, p.r) !== letzte);
    const liste = kand.length ? kand : pool;
    const w = liste.map((p) => gewicht(eintrag(s, p.k, p.r)) / (1 + raus.filter((x) => x.k === p.k && x.r === p.r).length * 1.5));
    let z = Math.random() * w.reduce((a, b) => a + b, 0), wahl = liste[0];
    for (let j = 0; j < liste.length; j++) { z -= w[j]; if (z <= 0) { wahl = liste[j]; break; } }
    // Wie in der Schule mal so, mal so: 3 × 7 oder 7 × 3
    const umgekehrt = wahl.k !== wahl.r && wahl.k <= 9 && Math.random() < 0.3;
    raus.push({ k: wahl.k, r: wahl.r, a: umgekehrt ? wahl.r : wahl.k, b: umgekehrt ? wahl.k : wahl.r, loesung: wahl.k * wahl.r });
    letzte = schluessel(wahl.k, wahl.r);
  }
  return raus;
}

export function antwortMerken(s, f, richtig, ms) {
  const key = schluessel(f.k, f.r);
  const e = Object.assign({ r: 0, f: 0, m: 0, t: 0 }, s.a[key]);
  if (richtig) {
    e.r++;
    // Schnell richtig zählt mehr: unter 2 s +1, sonst nur halb
    e.m = Math.min(5, e.m + (ms < 2000 ? 1 : 0.5));
    e.t = e.t ? Math.round(e.t * 0.6 + ms * 0.4) : ms;
  } else {
    e.f++;
    e.m = Math.max(0, Math.min(e.m, 1) - 1);
  }
  s.a[key] = e;
}

// ---------- Punkte ----------
// Grundpunkte 100, dazu bis 100 für die übrige Zeit, mal Multiplikator
// aus der Serie (alle 5 richtig in Folge +1, höchstens ×5).
export function multiplikator(serie) { return Math.min(5, 1 + Math.floor(serie / 5)); }
export function punkteFuer(ms, zeitS, serie) {
  const bonus = zeitS ? Math.max(0, Math.round(100 * (1 - ms / (zeitS * 1000)))) : Math.max(0, Math.round(100 * (1 - ms / 6000)));
  return { punkte: (100 + bonus) * multiplikator(serie), bonus };
}
export const SERIEN_TEXT = { 5: "ON FIRE ×2", 10: "UNAUFHALTSAM ×3", 15: "MEGA ×4", 20: "LEGENDÄR ×5" };

export function heute() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// Tage am Stück, an denen mindestens eine Runde gefahren wurde
export function tagZaehlen(s) {
  const h = heute();
  if (s.tage.letzter === h) return;
  const gestern = new Date(); gestern.setDate(gestern.getDate() - 1);
  const g = gestern.getFullYear() + "-" + String(gestern.getMonth() + 1).padStart(2, "0") + "-" + String(gestern.getDate()).padStart(2, "0");
  s.tage.serie = s.tage.letzter === g ? s.tage.serie + 1 : 1;
  s.tage.letzter = h;
}
