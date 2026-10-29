// ============================================================
//  MAHNBILDER IM PAD MODE
// ============================================================
//  Fehlt im Pad die Stückzeit oder heute die Stückzahl, blinkt die
//  Kachel und zeigt ein kleines Bild (Wunsch Patrick, 12. Oktober 2026).
//  Welches, steht nur in der Datenbank (app_config „pad_mahnbilder“),
//  nicht im öffentlichen Repository: je Art { person: Konto-Kennung }
//  für dessen Profilfoto oder { bild: Bildadresse }. Admins setzen die
//  Bilder unter Einstellungen → Symbole.

import { alt } from "../bruecke.jsx";

const SCHLUESSEL = "pad_mahnbilder";

// Darf das Mahnbild („Escobar“) bei diesem Auftrag leuchten? Nur wenn er
// läuft, an der Maschine nicht gerade gerüstet wird und er nicht erst
// heute auf „läuft“ gestellt wurde: am ersten Tag noch nicht, erst ab
// dem Tag danach (Wunsch Patrick 29. Oktober 2026: „beim Rüsten soll
// kein Escobar leuchten, am ersten Tag nicht rot, erst ab Tag zwei“).
// Ladet ladeLaufendeAuftraege vorher, weiss es, wo gerüstet wird.
export function escobarDarf(j) {
  if (!j || j.plan_status !== "laeuft") return false;
  if (j.machine_id && alt.maschineRuestet && alt.maschineRuestet(j.machine_id)) return false;
  if (!j.started_at) return true;
  return alt.isoDatum(new Date(j.started_at)) < alt.isoDatum(new Date());
}
export const MAHN_ARTEN = [
  ["stueckzeit", "Stückzeit fehlt"],
  ["stueckzahl", "Heute noch keine Stückzahl"],
  // GIF über der Zeichnung im Auftragsfenster bei „Material im Haus“
  // (seit 1.91.0, Wunsch Patrick 17. Oktober 2026), liegt in der Ablage
  ["material", "Material im Haus (Auftragsfenster)"],
];

export async function mahnKonfLesen() {
  const r = await alt.db.from("app_config").select("wert").eq("schluessel", SCHLUESSEL).maybeSingle();
  if (r && r.error) throw r.error;
  return r && r.data && r.data.wert ? JSON.parse(r.data.wert) || {} : {};
}

export async function mahnKonfSpeichern(konf) {
  const { error } = await alt.db.from("app_config").upsert([{ schluessel: SCHLUESSEL, wert: JSON.stringify(konf) }],
    { onConflict: "schluessel" });
  if (error) throw error;
  geladen = null;
}

// Aus der Einstellung die Bildadressen je Art; einmal je Sitzung
let geladen = null;
export function mahnBilder() {
  if (!geladen) {
    geladen = (async () => {
      const konf = await mahnKonfLesen();
      const raus = {};
      for (const [art, w] of Object.entries(konf)) {
        if (w && w.bild) raus[art] = w.bild;
        else if (w && w.person) {
          const p = await alt.db.from("profiles").select("bild_url").eq("id", w.person).maybeSingle();
          raus[art] = (p && p.data && p.data.bild_url) || null;
        }
      }
      return raus;
    })().catch(() => { geladen = null; return {}; });
  }
  return geladen;
}
