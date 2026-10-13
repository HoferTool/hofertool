// Räumt die Temp-Ordner auf (Wunsch Patrick, 12. Oktober 2026).
//
// Jede Person hat in der Ablage „temp“ einen eigenen Ordner
// (<Konto-Kennung>/…), den nur sie selbst lesen und löschen darf
// (sql/temp-ordner.sql). Dateien älter als FRIST_STUNDEN sollen trotzdem
// verschwinden, auch bei Leuten, die die App nicht mehr öffnen. Das
// kann nur der Server mit dem geheimen Schlüssel.
//
// Die App ruft die Funktion höchstens stündlich je Gerät auf (mit Anmeldung,
// die Supabase prüft). Sie löscht nur Abgelaufenes und gibt nur die
// Anzahl zurück, nie Namen: so erfährt niemand etwas über fremde Ordner.
import { createClient } from "jsr:@supabase/supabase-js@2";

const FRIST_STUNDEN = 24; // Wunsch Patrick, 13. Oktober 2026 (vorher 7 Tage)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Neue Projekte geben den geheimen Schlüssel als SUPABASE_SECRET_KEYS,
// ältere als SUPABASE_SERVICE_ROLE_KEY
function geheimSchluessel(): string | undefined {
  const alt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (alt) return alt;
  try {
    const neu = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return neu.default ?? Object.values(neu)[0] as string | undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = Deno.env.get("SUPABASE_URL");
  const schluessel = geheimSchluessel();
  if (!url || !schluessel) return antwort({ fehler: "Server nicht eingerichtet" }, 500);
  const db = createClient(url, schluessel, { auth: { persistSession: false } });
  const ablage = db.storage.from("temp");
  const grenze = Date.now() - FRIST_STUNDEN * 3600000;

  // Oberste Ebene: ein Ordner je Person
  const { data: ordner, error } = await ablage.list("", { limit: 1000 });
  if (error) return antwort({ fehler: error.message }, 500);
  let geloescht = 0;
  for (const o of ordner ?? []) {
    if (o.id) continue; // eine Datei ohne Ordner gibt es nicht, sicherheitshalber übergehen
    for (let ab = 0; ; ab += 1000) {
      const { data: dateien } = await ablage.list(o.name, { limit: 1000, offset: ab });
      if (!dateien || !dateien.length) break;
      const alt = dateien
        .filter((d) => d.id && d.created_at && Date.parse(d.created_at) < grenze)
        .map((d) => o.name + "/" + d.name);
      if (alt.length) {
        const r = await ablage.remove(alt);
        if (!r.error) { geloescht += alt.length; ab -= alt.length; }
      }
      if (dateien.length < 1000) break;
    }
  }
  return antwort({ geloescht, frist_stunden: FRIST_STUNDEN });
});
