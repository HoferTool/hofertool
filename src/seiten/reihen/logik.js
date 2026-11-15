// =================================================================
//  HOFER + CO ZAHLENSPRINT (früher 1×1 Rider, Beser Reihen lernen): Aufgaben, Punkte, Levels und der gespeicherte Stand
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
    richtigTotal: 0, tage: { letzter: "", serie: 0 }, a: {}, skin: "hofer",
    einst: { reihen: [2, 3, 4, 5, 6, 7, 8, 9], zeit: 3, anzahl: 20, ton: true },
  };
}

// ---------- Profile (seit 1.551.0, Wunsch Patrick 14. November 2026:
// „ich habe 2 Söhne, die üben“) ----------
// Gespeichert wie bisher unter hofer.reihen.stand und am Konto unter
// reihen_stand, aber als Behälter {v: 2, profile: [{id, name, erstellt,
// geaendert, stand}]}. Ein alter Stand (v 1) wird Profil „Spieler 1“.
// Wer am Gerät gerade spielt, merkt nur das Gerät (hofer.reihen.aktiv),
// damit jedes iPad sein eigenes Kind kennt. Kein PIN, kein Passwort.
const AKTIV = "hofer.reihen.aktiv";
let behaelter = null;

function behaelterLesen(text) {
  try {
    const s = JSON.parse(text);
    if (!s) return null;
    if (s.v === 2 && Array.isArray(s.profile)) return s;
    if (s.v === 1) return { v: 2, profile: [{ id: "p1", name: "Spieler 1", erstellt: 0, geaendert: s.geaendert || 0, stand: s }] };
  } catch (e) { /* kaputt = keiner */ }
  return null;
}

function standNorm(s) {
  const leer = leererStand();
  if (!s || s.v !== 1) return leer;
  return Object.assign(leer, s, { einst: Object.assign(leer.einst, s.einst || {}), tage: Object.assign(leer.tage, s.tage || {}) });
}

export function profileLaden() {
  let geraet = null, konto = null;
  try { geraet = behaelterLesen(localStorage.getItem(SCHLUESSEL)); } catch (e) { /* privat */ }
  try { konto = behaelterLesen(alt.einstellungWert ? alt.einstellungWert(KONTO, "") : ""); } catch (e) { /* ohne Konto */ }
  // Je Profil gilt der jüngere Stand: so geht nichts verloren, wenn ein
  // Gerät offline gespielt hat oder das Konto auf einem anderen Gerät weiter ist.
  const je = new Map();
  for (const b of [geraet, konto]) {
    if (!b) continue;
    for (const p of b.profile) {
      if (!p || !p.id) continue;
      const da = je.get(p.id);
      if (!da || (p.geaendert || 0) > (da.geaendert || 0)) je.set(p.id, p);
    }
  }
  let profile = [...je.values()].map((p) => ({ id: p.id, name: String(p.name || "Spieler"), erstellt: p.erstellt || 0, geaendert: p.geaendert || 0, stand: standNorm(p.stand) }));
  profile.sort((x, y) => x.erstellt - y.erstellt);
  if (!profile.length) profile = [{ id: "p1", name: "Spieler 1", erstellt: 0, geaendert: 0, stand: leererStand() }];
  behaelter = { v: 2, profile };
  return behaelter;
}

function behaelterSchreiben(auchKonto) {
  const text = JSON.stringify(behaelter);
  try { localStorage.setItem(SCHLUESSEL, text); } catch (e) { /* privat */ }
  if (auchKonto && alt.einstellungSetzenWert) {
    try { alt.einstellungSetzenWert(KONTO, text); } catch (e) { /* ohne Netz bleibt es am Gerät */ }
  }
}

export function profilVon(id) {
  if (!behaelter) profileLaden();
  return behaelter.profile.find((p) => p.id === id) || behaelter.profile[0];
}

export function aktivLesen() { try { return localStorage.getItem(AKTIV) || ""; } catch (e) { return ""; } }
export function aktivSetzen(id) { try { localStorage.setItem(AKTIV, id); } catch (e) { /* privat */ } }

export function profilNeu() {
  if (!behaelter) profileLaden();
  let n = behaelter.profile.length + 1;
  while (behaelter.profile.some((p) => p.name === "Spieler " + n)) n++;
  const jetzt = Date.now();
  const p = { id: "p" + jetzt.toString(36), name: "Spieler " + n, erstellt: jetzt, geaendert: jetzt, stand: leererStand() };
  behaelter.profile.push(p);
  behaelterSchreiben(true);
  return p;
}

export function profilUmbenennen(id, name) {
  const p = profilVon(id), n = String(name || "").trim().slice(0, 20);
  if (!n || n === p.name) return;
  p.name = n; p.geaendert = Date.now();
  behaelterSchreiben(true);
}

// Der Spielstand eines Profils; ans Konto nur am Ende einer Runde.
export function standSpeichern(id, s, auchKonto) {
  const p = profilVon(id);
  s.geaendert = Date.now();
  p.stand = s; p.geaendert = s.geaendert;
  behaelterSchreiben(auchKonto);
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
// Ränge wie der Weg in der Werkstatt (seit 1.552.0 im Hofer-Stil)
const RAENGE = [[1, "Neuling"], [3, "Lehrling"], [5, "Dreher"], [8, "Einrichter"], [11, "Polymech"],
  [15, "CNC-Profi"], [20, "Programmierer"], [25, "Werkmeister"], [30, "Legende"], [40, "Mathe-Monster"]];
export function rang(L) { let r = RAENGE[0][1]; for (const [ab, n] of RAENGE) if (L >= ab) r = n; return r; }

// ---------- Ausrüstung, frei ab Level ----------
// Overall, Helm, Schutzbrille und Stapler in den Farben der Werkstoffe
// wie auf der Planwand. brett = Stapler, brett2 = Gegengewicht, Dach, Streifen.
export const SKINS = [
  { id: "hofer", name: "Hofer-Blau", ab: 1, jacke: 0x003884, hose: 0x002b66, helm: 0xffffff, brille: 0xffcc00, brett: 0xffcc00, brett2: 0x0b55b8, spur: [0x003884, 0xffffff] },
  { id: "gelbschwarz", name: "Sicherheit", ab: 2, jacke: 0xffcc00, hose: 0x1b1b1b, helm: 0xffcc00, brille: 0x1b1b1b, brett: 0x1b1b1b, brett2: 0xffcc00, spur: [0xffcc00, 0x222222] },
  { id: "v2a", name: "V2A Rot", ab: 3, jacke: 0xd8362c, hose: 0x5a1210, helm: 0xffffff, brille: 0x222222, brett: 0xd8362c, brett2: 0xeeeeee, spur: [0xd8362c, 0xffffff] },
  { id: "messing", name: "Messing", ab: 5, jacke: 0xf28c1b, hose: 0x6b3a05, helm: 0xf2b53a, brille: 0x003884, brett: 0xf2b53a, brett2: 0x6b3a05, spur: [0xf2b53a, 0xf28c1b] },
  { id: "stahl", name: "Stahl", ab: 6, jacke: 0x2f6fd0, hose: 0x1b2a4a, helm: 0x9aa3ad, brille: 0x5ad1ff, brett: 0x5d6673, brett2: 0x2f6fd0, spur: [0x9aa3ad, 0x2f6fd0] },
  { id: "titan", name: "Titan", ab: 8, jacke: 0x8e5bd0, hose: 0x2e1658, helm: 0xc9b6f0, brille: 0x00e5ff, brett: 0x5b2fa0, brett2: 0xc9b6f0, spur: [0x8e5bd0, 0x00e5ff] },
  { id: "gold", name: "Gold", ab: 10, jacke: 0xffc107, hose: 0x5d4300, helm: 0xffe082, brille: 0x111111, brett: 0xffb300, brett2: 0xffffff, spur: [0xffd54f, 0xffffff] },
  { id: "neusilber", name: "Neusilber", ab: 15, jacke: 0xf2d33a, hose: 0x7a6a10, helm: 0xdfe4ea, brille: 0x003884, brett: 0xdfe4ea, brett2: 0xf2d33a, spur: [0xf2d33a, 0xdfe4ea] },
  { id: "regenbogen", name: "Werkstoff-Mix", ab: 20, jacke: 0xd8362c, hose: 0x2f6fd0, helm: 0xf2d33a, brille: 0x1fd16b, brett: 0x8e5bd0, brett2: 0xf28c1b, spur: [0xd8362c, 0xf28c1b, 0xf2d33a, 0x1fd16b, 0x2f6fd0, 0x8e5bd0] },
  { id: "diamant", name: "Diamant-Platte", ab: 30, jacke: 0xe3f2fd, hose: 0x90caf9, helm: 0x42a5f5, brille: 0xffffff, brett: 0x0d47a1, brett2: 0xe3f2fd, spur: [0xe3f2fd, 0x84ffff] },
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
export const SERIEN_TEXT = { 5: "VOLLGAS ×2", 10: "TURBO-DREHZAHL ×3", 15: "PRÄZISION ×4", 20: "LEGENDÄR ×5" };

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
