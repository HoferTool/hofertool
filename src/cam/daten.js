// =================================================================
//  CAM: DATEN (seit 1.224.0, Wunsch Patrick 27. Oktober 2026)
//
//  Was die CAM-Seite über eine Maschine wissen muss, damit sie später
//  Programme im Stil von Hofer schreiben kann:
//   - je Maschinentyp (cam_aufbau mit type_id): Steuerung, Aufgabe
//     jedes Paths, Art jedes Werkzeugplatzes und die M-Befehle
//   - je Maschine (cam_aufbau mit machine_id): nur was dort anders ist
//     („Hier ist das anders“, z. B. Hochdruck an der 121)
//   - eure eigenen Programme (cam_programme) als Vorlage für den Stil
//
//  Vorerst nur für die SW-Maschinen (Patrick: „fang mal für SW an,
//  andere Typen so lassen“). Tabellen aus sql/cam.sql.
// =================================================================
import { alt } from "../bruecke.jsx";

// Welche Typen schon CAM haben. Später kommen weitere dazu.
export const istCamTyp = (typ) => /^\s*SW/i.test(String((typ && typ.name) || typ || ""));

export const SQL_FEHLT = "Für CAM fehlt noch eine Ergänzung der Datenbank (sql/cam.sql).";
export const fehltSql = (f) => /cam_aufbau|cam_programme|does not exist|schema cache|PGRST20/i.test(String((f && (f.message || f.code)) || f || ""));

// Aufgabe eines Paths: Vorschläge, eigener Text geht auch
export const PATH_AUFGABEN = [
  "Kammsupport vorne (Hauptspindel)",
  "Zweiter Support (Hauptspindel)",
  "Rückseite (Gegenspindel)",
  "Gegenspindel",
];

// Ausführung eines Werkzeugplatzes, im Aufbau anklickbar (Wunsch Patrick
// 27. Oktober 2026: „Drehstahl, Bohrhalter, angetrieben Front,
// angetrieben Quer“). Dreifach Front gibt es z. B. an der SB-20 auf T33
// und T34 statt des normalen Querantriebs.
export const PLATZ_ARTEN = [
  ["drehstahl", "Drehstahl"],
  ["bohrhalter", "Bohrhalter"],
  ["ang_front", "Angetrieben Front"],
  ["ang_quer", "Angetrieben Quer"],
  ["ang_front3", "Dreifach Front angetrieben"],
  ["leer", "Nicht belegt"],
];
// Wohin das Werkzeug zeigt: quer auf die Stange oder stirnseitig
export const istFront = (art) => art === "bohrhalter" || art === "ang_front" || art === "ang_front3";
export const istAngetrieben = (art) => /^ang_/.test(art || "");

// Rückseite ist bei Star immer Path 2 (Patrick): dort schaut das
// Werkzeug von oben nach unten statt aus dem Antrieb heraus.
export const istRueckseite = (p) => Number(p.nummer) === 2 || /^\s*path\s*2\s*$/i.test(p.name || "");

// Vorschlag für die SW-20, abgeleitet aus über 3'000 Plätzen eurer
// Einrichtblätter (Tätigkeit je T-Nummer). Gilt nur, bis jemand den
// Platz anklickt.
const SW_VORSCHLAG = [
  [100, 400, "drehstahl"], [500, 700, "ang_quer"],
  [1100, 1200, "drehstahl"], [1300, 1500, "ang_quer"], [1600, 1900, "bohrhalter"],
  [2100, 2800, "bohrhalter"],
];
export function platzVorschlag(nr) {
  const n = Number(String(nr || "").replace(/\D/g, ""));
  const x = SW_VORSCHLAG.find(([von, bis]) => n >= von && n <= bis);
  return x ? x[2] : "";
}
export const platzArtText = (w) => (PLATZ_ARTEN.find((a) => a[0] === w) || ["", w || ""])[1];

// Grundliste der M-Befehle. Nur was die Fanuc-Norm sicher festlegt, ist
// vorausgefüllt; den Rest lesen wir aus euren Programmen ab oder ihr
// tragt ihn ein.
export const M_GRUND = [
  { id: "haupt_rechts", funktion: "Hauptspindel rechts", code: "M03" },
  { id: "haupt_links", funktion: "Hauptspindel links", code: "M04" },
  { id: "haupt_stopp", funktion: "Hauptspindel Stopp", code: "M05" },
  { id: "gegen_rechts", funktion: "Gegenspindel rechts", code: "" },
  { id: "gegen_links", funktion: "Gegenspindel links", code: "" },
  { id: "gegen_stopp", funktion: "Gegenspindel Stopp", code: "" },
  { id: "kuehl_ein", funktion: "Kühlung ein", code: "M08" },
  { id: "kuehl_aus", funktion: "Kühlung aus", code: "M09" },
  { id: "hd_ein", funktion: "Hochdruck ein", code: "" },
  { id: "hd_aus", funktion: "Hochdruck aus", code: "" },
  { id: "zange_zu", funktion: "Zange Hauptspindel zu", code: "" },
  { id: "zange_auf", funktion: "Zange Hauptspindel auf", code: "" },
  { id: "gzange_zu", funktion: "Zange Gegenspindel zu", code: "" },
  { id: "gzange_auf", funktion: "Zange Gegenspindel auf", code: "" },
  { id: "ang_ein", funktion: "Angetriebene Werkzeuge ein", code: "" },
  { id: "ang_aus", funktion: "Angetriebene Werkzeuge aus", code: "" },
  { id: "c_ein", funktion: "C-Achse ein", code: "" },
  { id: "c_aus", funktion: "C-Achse aus", code: "" },
  { id: "abfuehren", funktion: "Teil abführen", code: "" },
  { id: "warten", funktion: "Wartecodes zwischen den Paths", code: "" },
  { id: "ende", funktion: "Programmende", code: "" },
];

// Fehlende Teile ergänzen, damit die Ansicht nie an leeren Feldern hängt
export function aufbauVoll(d) {
  const x = d && typeof d === "object" ? d : {};
  return {
    steuerung: x.steuerung || "",
    paths: x.paths || {},
    plaetze: x.plaetze || {},
    mbefehle: Array.isArray(x.mbefehle) ? x.mbefehle : M_GRUND.map((m) => ({ ...m })),
    notiz: x.notiz || "",
  };
}

export function maschineVoll(d) {
  const x = d && typeof d === "object" ? d : {};
  return { anders: x.anders || {}, notiz: x.notiz || "" };
}

async function zeileLaden(feld, id) {
  const r = await alt.db.from("cam_aufbau").select("*").eq(feld, id).limit(1);
  if (r.error) throw r.error;
  return (r.data || [])[0] || null;
}

export async function typAufbauLaden(typId) {
  const z = await zeileLaden("type_id", typId);
  return { id: z ? z.id : null, daten: aufbauVoll(z && z.daten), am: z && z.geaendert_am };
}

export async function maschineLaden(maschineId) {
  const z = await zeileLaden("machine_id", maschineId);
  return { id: z ? z.id : null, daten: maschineVoll(z && z.daten) };
}

// Speichert den ganzen Stand eines Typs oder einer Maschine, mit Rückgängig
export async function aufbauSpeichern(feld, id, daten, text) {
  const vorher = await zeileLaden(feld, id);
  const jetzt = { daten, geaendert_am: new Date().toISOString(), geaendert_von: alt.meineProfilId() };
  if (vorher) {
    const r = await alt.db.from("cam_aufbau").update(jetzt).eq("id", vorher.id);
    if (r.error) throw r.error;
    alt.merkeSchritt(text, [alt.rueckSetz("cam_aufbau", { daten: vorher.daten }, { id: vorher.id })]);
  } else {
    const r = await alt.db.from("cam_aufbau").insert({ ...jetzt, [feld]: id }).select("id");
    if (r.error) throw r.error;
    const neu = (r.data || [])[0];
    if (neu) alt.merkeSchritt(text, alt.rueckWeg("cam_aufbau", { id: neu.id }));
  }
}

// Was an einer Maschine gilt: der Typ, darüber die Abweichungen
export function mbefehleFuerMaschine(typDaten, maschDaten) {
  const anders = (maschDaten && maschDaten.anders) || {};
  return typDaten.mbefehle.map((m) => anders[m.id]
    ? { ...m, code: anders[m.id].code || "", hinweis: anders[m.id].hinweis || "", anders: true, typCode: m.code }
    : m);
}

// ---------- Programme als Vorlage ----------

export async function programmeLaden(typId) {
  const r = await alt.db.from("cam_programme")
    .select("id, type_id, machine_id, name, hoco_nr, notiz, erstellt_am, erstellt_von")
    .eq("type_id", typId).order("erstellt_am", { ascending: false });
  if (r.error) throw r.error;
  return r.data || [];
}

export async function programmInhalt(id) {
  const r = await alt.db.from("cam_programme").select("inhalt").eq("id", id).limit(1);
  if (r.error) throw r.error;
  return ((r.data || [])[0] || {}).inhalt || "";
}

// Grosse Dateien sind kein Programm (Steuerung hat ohnehin nur wenig Platz)
export const PROGRAMM_MAX = 2 * 1024 * 1024;

export async function programmHochladen(datei, ziel) {
  if (datei.size > PROGRAMM_MAX) throw new Error(datei.name + " ist zu gross für ein Programm.");
  const inhalt = await datei.text();
  if (/\u0000/.test(inhalt.slice(0, 4000))) throw new Error(datei.name + " ist keine Textdatei.");
  const r = await alt.db.from("cam_programme").insert({
    type_id: ziel.typId, machine_id: ziel.maschineId || null, name: datei.name,
    hoco_nr: ziel.hocoNr || hocoAusText(datei.name + "\n" + inhalt.slice(0, 2000)),
    notiz: ziel.notiz || null, inhalt, erstellt_von: alt.meineProfilId(),
  }).select("id");
  if (r.error) throw r.error;
  return (r.data || [])[0];
}

// HOCO Nr. wie 10841-0009 im Namen oder in den Kommentaren oben
function hocoAusText(t) {
  const m = /\b(\d{5})[-_ ](\d{4})\b/.exec(t);
  return m ? m[1] + "-" + m[2] : null;
}

// Was im Programm steckt: Paths ($1, $2 …), Werkzeuge, M-Befehle. Erst
// eine Übersicht; daraus lernt die App später den Stil.
export function programmLesen(text) {
  const zeilen = String(text || "").split(/\r?\n/);
  const m = {}, t = {}, paths = new Set();
  let kommentare = 0;
  for (const roh of zeilen) {
    const z = roh.toUpperCase();
    if (/\(.*\)/.test(z)) kommentare++;
    const ohne = z.replace(/\(.*?\)/g, "");
    const p = /^\s*\$(\d)/.exec(ohne);
    if (p) paths.add(p[1]);
    for (const x of ohne.matchAll(/\bM(\d{1,3})\b/g)) {
      const k = "M" + String(Number(x[1])).padStart(2, "0");
      m[k] = (m[k] || 0) + 1;
    }
    for (const x of ohne.matchAll(/\bT(\d{2,5})\b/g)) {
      const k = "T" + x[1];
      t[k] = (t[k] || 0) + 1;
    }
  }
  const nachZahl = (a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1));
  return {
    zeilen: zeilen.length, kommentare,
    paths: [...paths].sort(),
    mbefehle: Object.entries(m).sort(nachZahl),
    werkzeuge: Object.entries(t).sort(nachZahl),
  };
}
