// Prüfberichte: Claude legt ein Excel-Prüfbericht als Vorlage ab
// (Wunsch Patrick 24. November 2026: „lade das excel mal so hoch“).
//
// Wie step-ablegen: Claude legt über die Datenbank-Verbindung einen
// einmaligen Schlüssel in pruefbericht_upload ab (HOCO Nr. und Seite,
// eine Stunde gültig, für niemanden lesbar) und schickt die Datei mit
// diesem Schlüssel hierher. Die Funktion legt sie mit dem Dienstschlüssel
// in die Ablage „zeichnungen“ unter pruefberichte/<HOCO Nr>/ und trägt
// sie in pruefbericht_dateien ein. Der Schlüssel gilt danach nicht mehr.
//
// POST ?schluessel=…&name=<Dateiname>  Körper = .xlsx
import { createClient } from "jsr:@supabase/supabase-js@2";

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwort({ fehler: "nur POST" }, 405);
  const u = new URL(req.url);
  const schluessel = u.searchParams.get("schluessel") || "";
  const name = (u.searchParams.get("name") || "Pruefbericht.xlsx").replace(/[^\w.\- äöüÄÖÜ]+/g, "_").slice(-120);
  if (schluessel.length < 32) return antwort({ fehler: "Schlüssel fehlt" }, 401);
  if (!/\.(xlsx|xlsm|xls)$/i.test(name)) return antwort({ fehler: "nur Excel" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t = await db.from("pruefbericht_upload").select("hoco_nr, seite, gueltig_bis").eq("schluessel", schluessel).maybeSingle();
  if (t.error || !t.data || new Date(t.data.gueltig_bis) < new Date()) return antwort({ fehler: "Schlüssel ungültig" }, 401);
  await db.from("pruefbericht_upload").delete().eq("schluessel", schluessel);

  const daten = new Uint8Array(await req.arrayBuffer());
  if (!daten.length || daten.length > 20 * 1024 * 1024) return antwort({ fehler: "Datei leer oder zu gross" }, 400);

  const hoco = String(t.data.hoco_nr).replace(/[^\w\-]+/g, "_");
  const pfad = "pruefberichte/" + hoco + "/" + Date.now().toString(36) + "-" + name.replace(/[^\w.\-]+/g, "_");
  const typ = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const up = await db.storage.from("zeichnungen").upload(pfad, daten, { contentType: typ, upsert: false });
  if (up.error) return antwort({ fehler: up.error.message }, 500);
  const url = db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
  const r = await db.from("pruefbericht_dateien").insert({
    hoco_nr: t.data.hoco_nr, name, url, ablage: pfad, seite: t.data.seite, quelle: "hand",
    kennung: "claude:" + name, geaendert: new Date().toISOString(), erstellt_von: null,
  }).select("id").single();
  if (r.error) return antwort({ fehler: r.error.message }, 500);
  return antwort({ ok: true, id: r.data.id, url, groesse: daten.length });
});
