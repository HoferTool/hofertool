// =================================================================
//  MESSBERICHTE vom Keyence IM (seit 1.443.0, Wunsch Patrick
//  6. November 2026). Das Programm skripte/keyence.ps1 am Pool-Rechner
//  liest die Teilberichte (CSV) aus W:\KONTROLLE\Keyence und legt sie
//  in die Tabelle messberichte (sql/messberichte.sql), die HOCO Nr. aus
//  dem Namen der Messeinstellung. Hier nur lesen. Nicht für Externe.
// =================================================================
import { alt } from "../bruecke.jsx";
import { hocoNormal } from "./spezialwerkzeuge.js";

export const fehltMessTabelle = (f) => /messberichte/.test(alt.fehlertext(f));

export async function messberichteLaden(hoco) {
  const r = await alt.zeitlimit(alt.db.from("messberichte")
    .select("id,datei,hoco_nr,einstellung,gemessen_am,ergebnis,kopf,spalten,zeilen")
    .eq("hoco_nr", hocoNormal(hoco)).order("gemessen_am", { ascending: false }).limit(200), 10000, "Messberichte");
  if (r.error) throw r.error;
  return r.data || [];
}

export async function messberichteAnzahl(hoco) {
  if (!hoco) return 0;
  try {
    const r = await alt.db.from("messberichte").select("id").eq("hoco_nr", hocoNormal(hoco));
    return r.error ? 0 : (r.data || []).length;
  } catch (f) { return 0; }
}

// Gut, schlecht oder unklar, aus dem Text des Geräts (OK, NG, Fehler …)
export function urteil(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "";
  if (/^(ok|i\.?\s*o\.?|gut|pass)$/.test(t)) return "gut";
  if (/(ng|n\.?\s*i\.?\s*o|fehler|nicht|fail|ausser|außer)/.test(t)) return "schlecht";
  return "";
}
