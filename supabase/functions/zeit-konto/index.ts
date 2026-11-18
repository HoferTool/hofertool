// Konto nur für HOFERTIME anlegen (seit 1.626.0, Wunsch Patrick
// 18. November 2026: eigene Konten mit PIN für Leute, die sonst nichts
// im HoferTool sehen). Nur ein Admin darf das; die App schickt ihre
// Sitzung mit. Das Konto bekommt eine Adresse, die nie Mail empfängt,
// ein zufälliges Passwort und den Vermerk nur_zeit. Die PIN setzt die
// App danach selbst mit pin_setzen, wie bei allen anderen Konten.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function geheimSchluessel(): string | undefined {
  const alt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (alt) return alt;
  try {
    const neu = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return neu.default ?? Object.values(neu)[0] as string | undefined;
  } catch { return undefined; }
}

function zufall(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const schluessel = geheimSchluessel();
  const url = Deno.env.get("SUPABASE_URL");
  if (!schluessel || !url) return antwort({ fehler: "nicht eingerichtet" }, 500);
  const admin = createClient(url, schluessel, { auth: { persistSession: false } });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: wer } = await admin.auth.getUser(token);
  if (!wer?.user) return antwort({ fehler: "nicht angemeldet" }, 401);
  const { data: ich } = await admin.from("profiles").select("role, is_active").eq("id", wer.user.id).maybeSingle();
  if (!ich || ich.role !== "admin" || ich.is_active === false) return antwort({ fehler: "Nur Administratoren" }, 403);

  // panel: true legt ein Konto für ein Stempel-Panel an (iPad in der
  // Firma, Gerätekonto unter „Andere Nutzer“, bleibt angemeldet)
  let name = "", panel = false;
  try {
    const k = await req.json();
    name = String(k.name ?? "").trim().replace(/\s+/g, " ");
    panel = k.panel === true;
  } catch { /* leer */ }
  if (name.length < 2 || name.length > 80) return antwort({ fehler: "Name fehlt" }, 400);

  const teil = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 40) || "person";
  const email = `${teil}.${zufall(3)}@hofertime.hoferco.ch`;
  const { data: neu, error } = await admin.auth.admin.createUser({
    email, password: zufall(24), email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !neu?.user) return antwort({ fehler: error?.message ?? "Konto nicht angelegt" }, 500);

  const id = neu.user.id;
  const { error: f2 } = await admin.from("profiles").upsert(
    { id, email, full_name: name, role: "mitarbeiter", nur_zeit: true, is_active: true,
      ...(panel ? { zeit_terminal: true, andere_nutzer: true } : {}) },
    { onConflict: "id" });
  if (f2) return antwort({ fehler: f2.message }, 500);
  return antwort({ id, email });
});
