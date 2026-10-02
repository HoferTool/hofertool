// Anmeldung mit PIN für das Hofer Tool.
//
// Die App schickt E-Mail und PIN. Hier wird die PIN in der Datenbank
// geprüft (pin_pruefen zählt Fehlversuche und sperrt nach 5 falschen
// für 5 Minuten). Stimmt sie, erzeugen wir einen einmaligen
// Anmelde-Schlüssel, den die App mit verifyOtp gegen eine Sitzung
// eintauscht. Ein Passwort verlässt dabei nie den Server.
//
// Absichtlich ohne JWT-Prüfung: Wer sich anmelden will, hat noch keine
// Sitzung. Der Schutz ist die PIN-Prüfung mit Sperre.
import { createClient } from "jsr:@supabase/supabase-js@2";

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

  const schluessel = geheimSchluessel();
  const url = Deno.env.get("SUPABASE_URL");
  // Zum Nachsehen, ob alles eingerichtet ist — verrät nichts
  if (req.method === "GET") return antwort({ bereit: !!(schluessel && url) });
  if (!schluessel || !url) return antwort({ status: "fehler", text: "nicht eingerichtet" }, 500);

  let email = "", pin = "";
  try {
    const k = await req.json();
    email = String(k.email ?? "").trim().toLowerCase();
    pin = String(k.pin ?? "").trim();
  } catch { /* leer lassen */ }
  if (!email || !/^\d{4,8}$/.test(pin)) return antwort({ status: "falsch_eingabe" });

  const admin = createClient(url, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pruefung = await admin.rpc("pin_pruefen", { p_email: email, p_pin: pin });
  if (pruefung.error) {
    const fehlt = /pin_pruefen/.test(pruefung.error.message ?? "");
    return antwort({ status: "fehler", text: fehlt ? "sql fehlt" : "datenbank" }, 500);
  }
  const ergebnis = pruefung.data as { status: string };
  if (ergebnis.status !== "ok") return antwort(ergebnis);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) return antwort({ status: "fehler", text: "anmeldung" }, 500);
  return antwort({ status: "ok", token_hash: hash });
});
