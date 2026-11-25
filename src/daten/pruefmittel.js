// =================================================================
//  PRÜFMITTEL (provisorisch, seit 1.558.0, Wunsch Patrick 15. November 2026)
//  Bisher in Gewatec. Jedes Prüfmittel mit Nr., Bezeichnung, Mass und
//  vor allem dem Ort, wo es gerade ist: Prüfmittelschrank, an einer
//  Maschine, bei einer Person oder extern (Kalibrierung). Tabellen
//  pruefmittel und pruefmittel_verlauf aus sql/pruefmittel.sql; den
//  Verlauf schreibt die Datenbank bei jeder Ortsänderung selbst.
//  Vorerst nur Admins.
// =================================================================
import { alt } from "../bruecke.jsx";

export const ARTEN = [
  ["lehrdorn", "Grenzlehrdorn"], ["pruefstift", "Prüfstift"], ["gewindedorn", "Gewindelehrdorn"],
  ["gewindering", "Gewindelehrring"], ["lehrring", "Lehrring"], ["kontrollring", "Kontrollring"], ["radius", "Radius- / Formlehre"],
  ["messschieber", "Messschieber"], ["mikrometer", "Bügelmessschraube"], ["messuhr", "Messuhr / Fühlhebel"],
  ["anderes", "Anderes"],
];
// Gruppe aus der Art (Wunsch Patrick 24. November 2026): Lehren sind wichtig,
// Prüfstifte sind einfache Stifte in vielen Massen, der Rest Messmittel.
export const GRUPPEN = [["lehre", "Lehre"], ["stift", "Prüfstift"], ["messmittel", "Messmittel"]];
const LEHREN = ["lehrdorn", "gewindedorn", "gewindering", "lehrring", "kontrollring", "radius"];
// Ohne Art aus der Bezeichnung geschätzt (Einfügen aus Listen hat oft keine Art)
const gruppeAusName = (b) => /lehr|gewindering|kontrollring|radius/i.test(b || "") ? "lehre"
  : /stift/i.test(b || "") ? "stift" : "";
export const gruppeVon = (p) => !p ? "" : !p.art || p.art === "anderes" ? gruppeAusName(p.bezeichnung)
  : LEHREN.includes(p.art) ? "lehre" : p.art === "pruefstift" ? "stift" : "messmittel";
export const gruppeText = (g) => (GRUPPEN.find((x) => x[0] === g) || [0, ""])[1];

// Wer prüft: selber (intern) oder auswärts kalibrieren (extern)
export const PRUEFUNG_WO = [["intern", "Selber prüfen"], ["extern", "Extern kalibrieren"]];
export const pruefWoText = (w) => (PRUEFUNG_WO.find((x) => x[0] === w) || [0, ""])[1];

// Bald fällig: in den nächsten 30 Tagen
export const baldFaellig = (p) => {
  const n = naechstePruefung(p);
  if (!n || p.status !== "aktiv") return false;
  const heute = alt.isoDatum(new Date());
  return n > heute && n <= alt.plusTage(heute, 30);
};

export const artText = (a) => (ARTEN.find((x) => x[0] === a) || [null, a || ""])[1];

export const ORTE = [
  ["schrank", "Prüfmittelschrank", "🗄️"],
  ["maschine", "An Maschine", "⚙️"],
  ["person", "Bei Person", "👤"],
  ["extern", "Extern / Kalibrierung", "🚚"],
  ["rueckgabe", "Rückgabekiste", "📥"],
];

// Einsatztage seit der letzten Prüfung (Wunsch Patrick 24. November 2026):
// gezählt, solange der Auftrag läuft (zaehlt_seit setzt die Datenbank), bis
// zum Quittieren der Rückgabekiste.
export function einsatzTage(p) {
  let t = Number(p && p.einsatz_tage) || 0;
  if (p && p.zaehlt_seit) t += Math.max(0, Date.now() - new Date(p.zaehlt_seit).getTime()) / 86400000;
  return t;
}
const tageFaellig = (p) => !!Number(p.intervall_tage) && einsatzTage(p) >= Number(p.intervall_tage);

export const STATUS = [["aktiv", "In Gebrauch"], ["gesperrt", "Gesperrt"], ["weg", "Ausgeschieden"]];

export const fehltTabelle = (e) =>
  /PGRST205|42P01|does not exist|schema cache/i.test(String((e && (e.message || e.code)) || ""));

export const maschineText = (m) => m ? [m.machine_number, m.name].filter(Boolean).join(" · ") : "?";

// Seitenweise je 1'000: seit dem Gewatec-Import (25. November 2026) sind es
// über 1'000, Supabase liefert ohne range höchstens 1'000 Zeilen.
async function allePruefmittel() {
  const alle = [];
  for (let von = 0; von < 20000; von += 1000) {
    const r = await alt.db.from("pruefmittel").select("*").order("nr").order("id").range(von, von + 999);
    if (r.error) return r;
    alle.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return { data: alle, error: null };
}

export async function pruefmittelLaden() {
  const [r, maschinen, parks, leute] = await Promise.all([
    alt.zeitlimit(allePruefmittel(), 15000, "Prüfmittel"),
    alt.ladeMaschinen(false, true),
    alt.ladeParks(false, true),
    alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email, is_active"), 8000, "Personen")
      .then((x) => x.data || [], () => []),
  ]);
  if (r.error) throw r.error;
  const personen = new Map(leute.map((u) => [u.id, alt.personName(u)]));
  const namen = leute.filter((u) => u.is_active !== false && u.full_name).map((u) => u.full_name).sort();
  // Ohne Ort oder Status (alte Zeilen) gilt Schrank und „In Gebrauch“
  const liste = (r.data || []).map((p) => ({ ...p, ort_art: p.ort_art || "schrank", status: p.status || "aktiv" }));
  return { liste, maschinen, parks, personen, namen };
}

export async function verlaufLaden(id) {
  const r = await alt.zeitlimit(alt.db.from("pruefmittel_verlauf").select("*")
    .eq("pruefmittel_id", id).order("am", { ascending: false }).limit(50), 8000, "Verlauf");
  if (r.error) throw r.error;
  return r.data || [];
}

// Nächste Prüfung: letzte + Intervall; mit Intervall, aber nie geprüft = jetzt fällig
export function naechstePruefung(p) {
  const n = Number(p.intervall_monate);
  if (!n) return null;
  if (!p.letzte_pruefung) return alt.isoDatum(new Date());
  const d = alt.ausIso(p.letzte_pruefung);
  const t = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(t, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return alt.isoDatum(d);
}
export const istFaellig = (p) => {
  if (p.status !== "aktiv") return false;
  if (tageFaellig(p)) return true;
  const n = naechstePruefung(p);
  return !!n && n <= alt.isoDatum(new Date());
};

// Wo es steht, als kurzer Text
export function ortText(p, maschinen) {
  const zus = p.ort_text ? " · " + p.ort_text : "";
  if (p.ort_art === "maschine") {
    const m = (maschinen || []).find((x) => x.id === p.machine_id);
    return "Maschine " + maschineText(m) + zus;
  }
  if (p.ort_art === "person") return "Bei " + (p.ort_text || "?");
  if (p.ort_art === "extern") return "Extern" + zus;
  if (p.ort_art === "rueckgabe") return "Rückgabekiste";
  return "Prüfmittelschrank" + zus;
}

export function suchText(p, maschinen) {
  return [p.nr, p.bezeichnung, artText(p.art), gruppeText(gruppeVon(p)), pruefWoText(p.pruefung_wo),
    p.mass, p.typ, p.hersteller, p.nennmass, p.messbereich, p.hoco, p.notiz, ortText(p, maschinen)]
    .filter(Boolean).join(" ").toLowerCase();
}

// Einfügen aus Gewatec oder Excel: eine Zeile je Prüfmittel,
// Spalten mit Tab oder Semikolon: Nr; Bezeichnung; Mass; Art; Intervall Monate; intern/extern
export function zeilenLesen(text) {
  return String(text || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean).map((z) => {
    const t = z.split(/\t|;/).map((x) => x.trim());
    if (t.length === 1) return { ort_art: "schrank", status: "aktiv", nr: null, bezeichnung: t[0] };
    const art = t[3] ? (ARTEN.find((a) => a[1].toLowerCase() === t[3].toLowerCase() || a[0] === t[3].toLowerCase()) || [null])[0] : null;
    return { ort_art: "schrank", status: "aktiv", nr: t[0] || null, bezeichnung: t[1] || t[0], mass: t[2] || null,
      art: art || (t[3] ? "anderes" : null), intervall_monate: Number(t[4]) || null,
      pruefung_wo: /^ext/i.test(t[5] || "") ? "extern" : /^(int|selb)/i.test(t[5] || "") ? "intern" : null,
      notiz: !art && t[3] ? t[3] : null };
  }).filter((x) => x.bezeichnung);
}
