// HOFER2DTO3D: Claude legt das aus der Zeichnung gebaute STEP-Modell ab
// (Wunsch Patrick 17. November 2026: „warum muss ich das STEP hochladen,
// du machst es ja“).
//
// Claude hat keine Anmeldung fürs HoferTool, aber die Datenbank-
// Verbindung. Dort legt Claude je Modell einen einmaligen Schlüssel in
// zeichnung_3d_upload ab (eine Stunde gültig, für niemanden lesbar),
// schickt die STEP-Datei mit diesem Schlüssel hierher, und die Funktion
// legt sie mit dem Dienstschlüssel in die Ablage „zeichnungen“ unter
// 2dto3d/<Eintrag>/ und setzt den Eintrag auf „fertig“. Der Schlüssel
// gilt danach nicht mehr.
//
// POST ?schluessel=…&name=<Dateiname>  Körper = STEP-Datei
import { createClient } from "jsr:@supabase/supabase-js@2";

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwort({ fehler: "nur POST" }, 405);
  const u = new URL(req.url);
  const schluessel = u.searchParams.get("schluessel") || "";
  const name = (u.searchParams.get("name") || "modell.step").replace(/[^\w.\- ]+/g, "_").slice(-120);
  if (schluessel.length < 32) return antwort({ fehler: "Schlüssel fehlt" }, 401);
  if (!/\.(step|stp)$/i.test(name)) return antwort({ fehler: "nur .step oder .stp" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t = await db.from("zeichnung_3d_upload").select("eintrag, gueltig_bis").eq("schluessel", schluessel).maybeSingle();
  if (t.error || !t.data || new Date(t.data.gueltig_bis) < new Date()) return antwort({ fehler: "Schlüssel ungültig" }, 401);
  await db.from("zeichnung_3d_upload").delete().eq("schluessel", schluessel);

  const daten = new Uint8Array(await req.arrayBuffer());
  if (!daten.length || daten.length > 50 * 1024 * 1024) return antwort({ fehler: "Datei leer oder zu gross" }, 400);
  if (!new TextDecoder().decode(daten.slice(0, 64)).includes("ISO-10303-21")) return antwort({ fehler: "keine STEP-Datei" }, 400);

  const pfad = "2dto3d/" + t.data.eintrag + "/" + Date.now().toString(36) + "-" + name.replace(/\s+/g, "_");
  const up = await db.storage.from("zeichnungen").upload(pfad, daten, { contentType: "application/step", upsert: false });
  if (up.error) return antwort({ fehler: up.error.message }, 500);
  const url = db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl
    .replace(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_PUBLIC_URL") ?? Deno.env.get("SUPABASE_URL") ?? "");
  const r = await db.from("zeichnung_3d").update({
    step_url: url, step_pfad: pfad, step_name: name, step_groesse: daten.length, status: "fertig",
  }).eq("id", t.data.eintrag);
  if (r.error) return antwort({ fehler: r.error.message }, 500);
  return antwort({ ok: true, url, pfad, groesse: daten.length });
});
