// HOFERTIME: Stempeln über einen persönlichen Link, aufgerufen von den
// Kurzbefehlen am iPhone beim Verbinden mit dem WLAN bzw. beim Trennen
// (Wunsch Patrick 19. November 2026). Ohne Anmeldung: der lange
// Zufallsschlüssel im Link ist die Berechtigung, geprüft in der Datenbank
// (zeit_wlan_stempeln, sql/hofertime-13-wlan.sql, nur für den Server).
//
// GET oder POST ?s=<Schlüssel>&art=kommen|gehen
// Antwort: kurzer Text, den die Kurzbefehle anzeigen können.
import { createClient } from "jsr:@supabase/supabase-js@2";

const TEXTE: Record<string, string> = {
  kommen: "Kommen gestempelt",
  gehen: "Gehen gestempelt",
  "schon da": "Schon eingestempelt",
  "weiter da": "Weiter eingestempelt (nur kurz kein WLAN)",
  "schon weg": "Schon ausgestempelt",
  unbekannt: "Link ungültig, in HOFERTIME neu erstellen",
  art: "art=kommen oder art=gehen fehlt",
};

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const s = u.searchParams.get("s") || "";
  const art = (u.searchParams.get("art") || "").toLowerCase();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const r = await db.rpc("zeit_wlan_stempeln", { p_schluessel: s, p_art: art });
  const code = r.error ? "fehler" : String(r.data);
  const text = r.error ? "Fehler: " + r.error.message : (TEXTE[code] || code);
  const status = code === "unbekannt" ? 401 : (r.error ? 500 : 200);
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
