// =================================================================
//  KALENDER
//  Wichtige Termine wie Kehrichtabfuhr, Papiersammlung oder Papierkörbe
//  leeren (Wunsch Patrick 28. Oktober 2026). Ein Eintrag hat ein erstes
//  Datum und wiederholt sich auf Wunsch; die einzelnen Tage rechnet die
//  App aus, in der Datenbank steht nur der Eintrag (Tabelle kalender,
//  sql/kalender.sql). Gezeigt auf der Seite Kalender und auf dem
//  Infoboard unter der Solaranlage.
// =================================================================
import { alt } from "../bruecke.jsx";

export const WIEDERHOLUNG = [
  { wert: "nie", text: "Einmalig" },
  { wert: "woche", text: "Jede Woche" },
  { wert: "2wochen", text: "Alle 2 Wochen" },
  { wert: "4wochen", text: "Alle 4 Wochen" },
  { wert: "monat", text: "Jeden Monat am selben Tag" },
  { wert: "jahr", text: "Jedes Jahr" },
];
export const wiederholungText = (w) => (WIEDERHOLUNG.find((x) => x.wert === w) || WIEDERHOLUNG[0]).text;

export async function kalenderLaden() {
  const r = await alt.zeitlimit(alt.db.from("kalender").select("*").order("datum"), 8000, "Kalender");
  if (r.error) throw r.error;
  return r.data || [];
}

// Fehlt die Tabelle noch, soll das Infoboard trotzdem laufen
export function fehltKalender(e) {
  return /PGRST205|42P01|does not exist|schema cache/i.test(String((e && (e.message || e.code)) || ""));
}

// Ein Sinnbild passend zum Text, damit man es am Bildschirm im Gang auf
// einen Blick erkennt
export function kalenderZeichen(titel) {
  const t = String(titel || "").toLowerCase();
  if (/papier|karton|altpapier/.test(t)) return "📰";
  if (/grün|gruen|kompost|garten/.test(t)) return "🌿";
  if (/glas|alu|blech|metall|schrott/.test(t)) return "♻️";
  if (/kehricht|kehrricht|abfall|müll|muell|sack|korb|körbe|eimer/.test(t)) return "🗑️";
  if (/sitzung|besprechung|meeting/.test(t)) return "👥";
  if (/ferien|feiertag|frei/.test(t)) return "🌴";
  if (/fest|apéro|apero|essen|grill/.test(t)) return "🎉";
  if (/service|wartung|kontrolle|prüfung|pruefung/.test(t)) return "🔧";
  return "📅";
}

const iso = (d) => alt.isoDatum(d);
const tagNr = (text) => Math.round(alt.ausIso(text).getTime() / 86400000);

// Alle Tage eines Eintrags von ab bis bis (je als „JJJJ-MM-TT“)
function tageVon(e, ab, bis) {
  const raus = [];
  if (!e || !e.datum) return raus;
  const start = alt.ausIso(e.datum);
  if (isNaN(start.getTime())) return raus;
  const w = e.wiederholung || "nie";
  const schritt = { woche: 7, "2wochen": 14, "4wochen": 28 }[w];
  if (w === "nie") {
    if (e.datum >= ab && e.datum <= bis) raus.push(e.datum);
  } else if (schritt) {
    // Gleich zum ersten Tag ab „ab“ springen, statt Jahre durchzuzählen
    const abstand = tagNr(ab) - tagNr(e.datum);
    let n = abstand > 0 ? Math.ceil(abstand / schritt) : 0;
    for (let i = 0; i < 400; i++, n++) {
      const t = alt.plusTage(e.datum, n * schritt);
      if (t > bis) break;
      if (t >= ab) raus.push(t);
    }
  } else if (w === "monat" || w === "jahr") {
    const tag = start.getDate();
    const a = alt.ausIso(ab);
    let j = a.getFullYear(), m = w === "jahr" ? start.getMonth() : a.getMonth();
    if (w === "jahr" && new Date(j, m, 1) < new Date(a.getFullYear(), a.getMonth(), 1)) j++;
    for (let i = 0; i < 400; i++) {
      // Den 31. gibt es nicht jeden Monat: dann der letzte Tag des Monats
      const letzter = new Date(j, m + 1, 0).getDate();
      const t = iso(new Date(j, m, Math.min(tag, letzter)));
      if (t > bis) break;
      if (t >= ab && t >= e.datum) raus.push(t);
      if (w === "jahr") j++; else { m++; if (m > 11) { m = 0; j++; } }
    }
  }
  return raus;
}

// Die nächsten Termine ab heute: [{ datum, tage, eintrag }], nach Datum
export function naechsteTermine(eintraege, tage = 60, heute = iso(new Date())) {
  const bis = alt.plusTage(heute, tage);
  const raus = [];
  (eintraege || []).forEach((e) => tageVon(e, heute, bis).forEach((t) =>
    raus.push({ datum: t, tage: tagNr(t) - tagNr(heute), eintrag: e })));
  return raus.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1
    : String(a.eintrag.titel).localeCompare(String(b.eintrag.titel))));
}

// „Heute“, „Morgen“, „Do 30.10.“
export function wannText(t) {
  if (t.tage === 0) return "Heute";
  if (t.tage === 1) return "Morgen";
  const wt = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][alt.ausIso(t.datum).getDay()];
  return wt + " " + alt.kurzDatum(t.datum);
}
