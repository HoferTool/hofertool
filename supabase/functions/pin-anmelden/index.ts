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
//
// Offene Konten (Entscheid 3. Oktober 2026): Wer früher ohne Passwort
// hineinkam (profiles.ohne_passwort = true) und noch keine PIN hat,
// kommt weiter so hinein. Die App schickt dafür { email, offen: true }.
// Hat das Konto inzwischen eine PIN, kommt "pin" zurück, hat es ein
// Passwort, "passwort" — die App fragt dann danach. So steht kein
// gemeinsames Passwort mehr im öffentlichen Code, und sobald jemand
// eine PIN oder ein Passwort bekommt, ist sein Konto zu.
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

  let email = "", pin = "", offen = false;
  try {
    const k = await req.json();
    email = String(k.email ?? "").trim().toLowerCase();
    pin = String(k.pin ?? "").trim();
    offen = k.offen === true;
  } catch { /* leer lassen */ }

  const admin = createClient(url, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const schluesselFuer = async () => {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hash = link.data?.properties?.hashed_token;
    if (link.error || !hash) return antwort({ status: "fehler", text: "anmeldung" }, 500);
    return antwort({ status: "ok", token_hash: hash });
  };

  if (offen) {
    if (!email) return antwort({ status: "passwort" });
    const konto = await admin.from("profiles")
      .select("id, role, is_active, ohne_passwort")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
    const p = konto.data;
    // Externe und das Dienstkonto nie offen, auch wenn das Häkchen sitzt
    if (konto.error || !p || !p.is_active || !p.ohne_passwort
        || p.role === "extern" || p.role === "dienst") {
      return antwort({ status: "passwort" });
    }
    const schutz = await admin.from("pin_schutz").select("user_id").eq("user_id", p.id).maybeSingle();
    if (schutz.error) return antwort({ status: "fehler", text: "datenbank" }, 500);
    if (schutz.data) return antwort({ status: "pin" });
    return await schluesselFuer();
  }

  if (!email || !/^\d{4,8}$/.test(pin)) return antwort({ status: "falsch_eingabe" });

  const pruefung = await admin.rpc("pin_pruefen", { p_email: email, p_pin: pin });
  if (pruefung.error) {
    const fehlt = /pin_pruefen/.test(pruefung.error.message ?? "");
    return antwort({ status: "fehler", text: fehlt ? "sql fehlt" : "datenbank" }, 500);
  }
  const ergebnis = pruefung.data as { status: string };
  if (ergebnis.status !== "ok") return antwort(ergebnis);

  return await schluesselFuer();
});
