// =================================================================
//  EIERZÄHLER
//  Täglich gelegte Eier, je Tag eine Zeile in eier_tage (Wunsch Patrick
//  30. Oktober 2026, sql/eier-tage.sql). Eingetragen wird im Pausenraum
//  über die Kachel „Eierzähler“ (src/infoboard/Eier.jsx).
// =================================================================
import { alt } from "../bruecke.jsx";

export const tagText = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};

// Alles ab dem 1. Januar des Vorjahrs: genug für Jahr, Monat und die
// letzten Wochen, auch Anfang Januar
export async function eierLaden() {
  const ab = new Date().getFullYear() - 1 + "-01-01";
  const r = await alt.db.from("eier_tage").select("datum, anzahl").gte("datum", ab);
  if (r.error) throw r.error;
  const tage = {};
  for (const z of r.data || []) tage[z.datum] = Number(z.anzahl) || 0;
  return tage;
}

export async function eierSpeichern(datum, anzahl) {
  const r = await alt.db.from("eier_tage").upsert([{ datum, anzahl }], { onConflict: "datum" });
  if (r.error) throw r.error;
}
