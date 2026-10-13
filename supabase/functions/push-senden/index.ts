// Push-Mitteilungen für das Hofer Tool (Wunsch Patrick, 12. Oktober 2026).
//
// GET  liefert den öffentlichen Schlüssel, mit dem sich ein Gerät beim
//      Push-Dienst (Apple, Google, Mozilla) anmeldet. Gibt es noch
//      keinen, wird das Schlüsselpaar hier einmal erzeugt und in
//      push_schluessel abgelegt. Der geheime Teil verlässt den Server nie.
// POST { titel, text, empfaenger } schickt die Nachricht an die Geräte
//      in push_abos, deren Person zur Gruppe passt: "alle" (Vorgabe),
//      "langdreher" oder "kurzdreher" (Rolle in profiles; seit 13. Oktober
//      2026, Wunsch Patrick). Nur für Admins. Geräte, die der Push-Dienst nicht
//      mehr kennt (404, 410), werden dabei weggeräumt.
// POST { loeschen: [id, …] } oder { loeschen: "alle" } löscht Einträge
//      der Historie (push_nachrichten), nur für Admins. Über den Server,
//      weil die Tabelle für die App nur lesbar ist.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

// deno-lint-ignore no-explicit-any
async function schluesselpaar(db: any) {
  const lesen = async () => {
    const { data, error } = await db.from("push_schluessel").select("oeffentlich, geheim").eq("id", 1).maybeSingle();
    if (error) throw new Error("lesen: " + error.message);
    return data as { oeffentlich: string; geheim: string } | null;
  };
  const da = await lesen();
  if (da) return da;
  const neu = webpush.generateVAPIDKeys();
  // Rufen zwei Geräte gleichzeitig zum ersten Mal, gewinnt das erste
  const { error } = await db.from("push_schluessel").insert(
    { id: 1, oeffentlich: neu.publicKey, geheim: neu.privateKey });
  if (error && error.code !== "23505") throw new Error("ablegen: " + error.message);
  const gespeichert = await lesen();
  if (!gespeichert) throw new Error("nach dem Ablegen nicht da");
  return gespeichert;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const schluessel = geheimSchluessel();
  const url = Deno.env.get("SUPABASE_URL");
  if (!schluessel || !url) return antwort({ fehler: "nicht eingerichtet" }, 500);
  const db = createClient(url, schluessel, { auth: { persistSession: false } });

  let paar;
  try {
    paar = await schluesselpaar(db);
  } catch (f) {
    console.error("Schlüssel:", (f as Error).message);
    return antwort({ fehler: "Schlüssel fehlt: " + (f as Error).message }, 500);
  }
  if (req.method === "GET") return antwort({ schluessel: paar.oeffentlich });

  // Wer schickt? Nur angemeldete Admins
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: wer } = await db.auth.getUser(token);
  if (!wer?.user) return antwort({ fehler: "nicht angemeldet" }, 401);
  const { data: profil } = await db.from("profiles").select("role").eq("id", wer.user.id).single();
  if (profil?.role !== "admin") return antwort({ fehler: "nur für Admins" }, 403);

  let titel = "", text = "";
  // deno-lint-ignore no-explicit-any
  let k: any = {};
  try { k = await req.json(); } catch { /* leer */ }
  if (k.loeschen !== undefined) {
    let abfrage = db.from("push_nachrichten").delete({ count: "exact" });
    if (k.loeschen === "alle") abfrage = abfrage.gt("id", 0);
    else if (Array.isArray(k.loeschen) && k.loeschen.length) abfrage = abfrage.in("id", k.loeschen.map(Number));
    else return antwort({ fehler: "nichts zum Löschen" }, 400);
    const { error, count } = await abfrage;
    if (error) return antwort({ fehler: error.message }, 500);
    return antwort({ geloescht: count ?? 0 });
  }
  titel = String(k.titel ?? "").trim().slice(0, 100);
  text = String(k.text ?? "").trim().slice(0, 1000);
  if (!text) return antwort({ fehler: "Text fehlt" }, 400);

  const GRUPPEN = ["alle", "langdreher", "kurzdreher"];
  const empfaenger = GRUPPEN.includes(k.empfaenger) ? k.empfaenger : "alle";

  webpush.setVapidDetails("mailto:info@hoferco.ch", paar.oeffentlich, paar.geheim);
  const { data: alleAbos } = await db.from("push_abos").select("endpoint, p256dh, auth, user_id");
  let abos = alleAbos ?? [];
  if (empfaenger !== "alle") {
    const { data: leute } = await db.from("profiles").select("id").eq("role", empfaenger);
    const ids = new Set((leute ?? []).map((p) => p.id));
    abos = abos.filter((a) => ids.has(a.user_id));
  }
  const nutzlast = JSON.stringify({ titel: titel || "Hofer Tool", text });

  let erreicht = 0;
  const weg: string[] = [];
  await Promise.all(abos.map(async (a) => {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        nutzlast, { TTL: 60 * 60 * 24, urgency: "high" });
      erreicht++;
    } catch (f) {
      const status = (f as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) weg.push(a.endpoint);
      else console.warn("Push fehlgeschlagen", status, (f as Error).message);
    }
  }));
  if (weg.length) await db.from("push_abos").delete().in("endpoint", weg);

  const geraete = abos.length;
  const eintrag = { titel: titel || null, text, von: wer.user.id, geraete, erreicht, empfaenger };
  const { error: fehlerHistorie } = await db.from("push_nachrichten").insert(eintrag);
  // Ohne sql/push-empfaenger.sql kennt die Tabelle die Spalte nicht
  if (fehlerHistorie) {
    const { empfaenger: _weg, ...ohne } = eintrag;
    await db.from("push_nachrichten").insert(ohne);
  }
  return antwort({ geraete, erreicht, weggeraeumt: weg.length });
});
