// =================================================================
//  MESSBERICHTE vom Keyence IM (seit 1.443.0, Wunsch Patrick
//  6. November 2026). Das Programm skripte/keyence.ps1 am Pool-Rechner
//  liest jede Minute die Teilberichte (CSV) aus W:\KONTROLLE\Keyence
//  und legt sie in die Tabelle messberichte (sql/messberichte.sql), die
//  HOCO Nr. aus dem Namen der Messeinstellung; nach 30 Tagen löscht es
//  sie dort. Hier nur lesen. Nicht für Externe (Entscheid Patrick).
// =================================================================
import { alt } from "../bruecke.jsx";

export const fehltMessTabelle = (f) => /messberichte/.test(alt.fehlertext(f));

// Alle Berichte, der neueste zuerst (es sind nur die letzten 30 Tage da)
export async function messberichteLaden() {
  const r = await alt.zeitlimit(alt.db.from("messberichte")
    .select("id,datei,hoco_nr,einstellung,gemessen_am,ergebnis,kopf,spalten,zeilen")
    .order("gemessen_am", { ascending: false }).limit(2000), 15000, "Messberichte");
  if (r.error) throw r.error;
  return r.data || [];
}

// Wie viele Berichte es zu einer HOCO Nr. gibt (Kachel im Pad, 1.444.0)
export async function messberichteZahl(hoco) {
  if (!hoco) return 0;
  const r = await alt.zeitlimit(alt.db.from("messberichte").select("id").eq("hoco_nr", hoco).limit(500),
    15000, "Messberichte");
  if (r.error) throw r.error;
  return (r.data || []).length;
}

// Nach HOCO Nr. zusammen, die mit dem neusten Bericht zuerst
export function nachHoco(liste) {
  const gruppen = new Map();
  for (const m of liste) {
    const k = m.hoco_nr || "";
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(m);
  }
  return [...gruppen.entries()].map(([hoco, berichte]) => ({ hoco, berichte }));
}

// Gut, schlecht oder unklar, aus dem Text des Geräts (OK, NG, Fehler …)
export function urteil(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "";
  if (/^(ok|i\.?\s*o\.?|gut|pass)$/.test(t)) return "gut";
  if (/(ng|n\.?\s*i\.?\s*o|fehler|nicht|fail|ausser|außer)/.test(t)) return "schlecht";
  return "";
}
