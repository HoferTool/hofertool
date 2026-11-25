// Temp-Ordner: Claude legt eine Datei in den Temp-Ordner einer Person
// (Wunsch Patrick 25. November 2026). Einmaliger Schlüssel in temp_upload,
// Ablage „temp“ unter <Konto>/.
// POST ?schluessel=…&name=<Dateiname>  Körper = Datei
import { createClient } from "jsr:@supabase/supabase-js@2";

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });

const TYPEN: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain", csv: "text/csv", zip: "application/zip",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwort({ fehler: "nur POST" }, 405);
  const u = new URL(req.url);
  const schluessel = u.searchParams.get("schluessel") || "";
  const roh = u.searchParams.get("name") || "Datei";
  const sauber = roh.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(-120) || "Datei";
  if (schluessel.length < 32) return antwort({ fehler: "Schlüssel fehlt" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t = await db.from("temp_upload").select("konto, gueltig_bis").eq("schluessel", schluessel).maybeSingle();
  if (t.error || !t.data || new Date(t.data.gueltig_bis) < new Date()) return antwort({ fehler: "Schlüssel ungültig" }, 401);
  await db.from("temp_upload").delete().eq("schluessel", schluessel);

  const daten = new Uint8Array(await req.arrayBuffer());
  if (!daten.length || daten.length > 100 * 1024 * 1024) return antwort({ fehler: "Datei leer oder zu gross" }, 400);
  const endung = (sauber.split(".").pop() || "").toLowerCase();
  const pfad = t.data.konto + "/" + Date.now() + "-" + sauber;
  const up = await db.storage.from("temp").upload(pfad, daten,
    { contentType: TYPEN[endung] || "application/octet-stream", upsert: false });
  if (up.error) return antwort({ fehler: up.error.message }, 500);
  return antwort({ ok: true, pfad, groesse: daten.length });
});
