// Plan B: holt den Bauplan der Datenbank (public.sicherung_schema()) als
// Textdatei, ohne Anmeldung im HoferTool (25. November 2026).
//
// Gedacht für Claude, um den Bauplan auf einem leeren Server auszuprobieren,
// und für den Notfall, wenn die App nicht mehr läuft. Claude legt per
// Datenbank-Verbindung einen einmaligen Schlüssel in sicherung_schema_abruf
// ab (eine Stunde gültig, für niemanden lesbar), ruft dann
//   GET …/functions/v1/schema-holen?schluessel=…
// auf und bekommt schema.sql. Der Schlüssel gilt danach nicht mehr.
// Der Bauplan enthält keine Daten, keine Passwörter und keine Schlüssel.
import { createClient } from "jsr:@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const fehler = (text: string, status: number) =>
  new Response(JSON.stringify({ fehler: text }), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const schluessel = new URL(req.url).searchParams.get("schluessel") || "";
  if (schluessel.length < 32) return fehler("Schlüssel fehlt", 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t = await db.from("sicherung_schema_abruf").select("gueltig_bis").eq("schluessel", schluessel).maybeSingle();
  if (t.error || !t.data || new Date(t.data.gueltig_bis) < new Date()) return fehler("Schlüssel ungültig", 401);
  await db.from("sicherung_schema_abruf").delete().eq("schluessel", schluessel);

  // Direkt mit der Datenbank verbunden (Benutzer postgres): so darf
  // sicherung_schema() laufen, ohne dass jemand angemeldet ist.
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
  try {
    const [z] = await sql`select public.sicherung_schema() as s`;
    return new Response(z.s, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return fehler(String((e as Error)?.message || e), 500);
  } finally {
    await sql.end();
  }
});
