// Steckdosen von Hombli in der App anzeigen und schalten
// (Wunsch Patrick 29. Oktober 2026: „können wir die ins hofer app anzeigen?“,
// „auch schalten“).
//
// Hombli-Steckdosen laufen über die Cloud von Tuya. Die Steckdosen sind in
// der App Smart Life, diese ist mit einem Cloud-Projekt auf iot.tuya.com
// verbunden. Dessen Zugangscodes stehen nur hier als Secrets in Supabase
// (TUYA_ACCESS_ID, TUYA_ACCESS_SECRET, wahlweise TUYA_REGION, Vorgabe eu),
// nie in der App, weil das Repository öffentlich ist.
//
// Lesen dürfen alle Angemeldeten ausser Externen und Dienst, schalten nur
// Rollen mit Schreibrecht (wie darfSchreiben() in der App).

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SCHREIBEN = ["admin", "planwand", "langdreher", "kurzdreher"];
const REGIONEN: Record<string, string> = {
  eu: "https://openapi.tuyaeu.com",
  weu: "https://openapi-weaz.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

const ID = Deno.env.get("TUYA_ACCESS_ID") || "";
const GEHEIM = Deno.env.get("TUYA_ACCESS_SECRET") || "";
const BASIS = REGIONEN[(Deno.env.get("TUYA_REGION") || "eu").toLowerCase()] || REGIONEN.eu;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
async function hmac(t: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(GEHEIM), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(t))).toUpperCase();
}

// Der Schlüssel von Tuya gilt zwei Stunden; die Funktion bleibt oft warm,
// darum hier gemerkt statt bei jeder Anfrage neu geholt.
let token = { wert: "", bis: 0 };

// Signatur nach Tuya: client_id + Schlüssel + Zeit + Zufall + Anfrage,
// Anfrage = Methode, Hash des Inhalts, leere Kopfzeilen, Pfad mit Abfrage
async function tuya(methode: string, pfad: string, inhalt?: unknown, ohneToken = false, nochmal = true): Promise<any> {
  const body = inhalt === undefined ? "" : JSON.stringify(inhalt);
  const t = String(Date.now());
  const nonce = crypto.randomUUID();
  const zuSignieren = [methode, await sha256(body), "", pfad].join("\n");
  const tok = ohneToken ? "" : await schluessel();
  const sign = await hmac(ID + tok + t + nonce + zuSignieren);
  const kopf: Record<string, string> = { client_id: ID, sign, t, nonce, sign_method: "HMAC-SHA256", "Content-Type": "application/json" };
  if (tok) kopf.access_token = tok;
  const r = await fetch(BASIS + pfad, { method: methode, headers: kopf, body: body || undefined, signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  if (!j.success) {
    // abgelaufener Schlüssel: einmal neu holen
    if (!ohneToken && (j.code === 1010 || j.code === 1011) && nochmal) { token = { wert: "", bis: 0 }; return tuya(methode, pfad, inhalt, false, false); }
    throw new Error("Tuya " + (j.code ?? r.status) + ": " + (j.msg || "Fehler"));
  }
  return j.result;
}

async function schluessel() {
  if (token.wert && Date.now() < token.bis) return token.wert;
  const r = await tuya("GET", "/v1.0/token?grant_type=1", undefined, true);
  token = { wert: r.access_token, bis: Date.now() + (Number(r.expire_time) - 120) * 1000 };
  return token.wert;
}

// Alle Geräte der verbundenen Smart-Life-Konten, mit Zustand
async function geraete() {
  const alle: any[] = [];
  let weiter = "";
  for (let i = 0; i < 20; i++) {
    // Tuya signiert die Abfrage alphabetisch geordnet: last_row_key vor size
    const r = await tuya("GET", "/v1.0/iot-01/associated-users/devices?" + (weiter ? "last_row_key=" + encodeURIComponent(weiter) + "&" : "") + "size=100");
    alle.push(...(r.devices || []));
    if (!r.has_more || !r.last_row_key) break;
    weiter = r.last_row_key;
  }
  return alle.map((d) => {
    const st: { code: string; value: unknown }[] = d.status || [];
    const wert = (c: string) => st.find((s) => s.code === c)?.value;
    // Mehrfachsteckdosen haben switch_1, switch_2 …; die USB-Anschlüsse
    // (switch_usb1) zählen als eigener Schalter
    const schalter = st.filter((s) => /^switch(_\d+|_usb\d+)?$/.test(s.code) && typeof s.value === "boolean")
      .map((s) => ({ code: s.code, an: s.value as boolean }));
    const w = wert("cur_power");
    return {
      id: d.id, name: d.name || d.product_name || d.id, online: !!d.online,
      kategorie: d.category,
      schalter,
      // Tuya liefert die Leistung meist in Zehntel Watt
      watt: typeof w === "number" ? w / 10 : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

// Neue Projekte geben den geheimen Schlüssel als SUPABASE_SECRET_KEYS,
// ältere als SUPABASE_SERVICE_ROLE_KEY (wie in pin-anmelden)
function geheimSchluessel(): string {
  const alt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (alt) return alt;
  try {
    const neu = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return (neu.default ?? Object.values(neu)[0] ?? "") as string;
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // Wer fragt? Anmeldung prüfen und Rolle aus der Datenbank lesen
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, geheimSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
  if (!u?.user) return antwort({ fehler: "Nicht angemeldet" }, 401);
  const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  const rolle = p?.role || "";
  if (!rolle || rolle === "extern" || rolle === "dienst") return antwort({ fehler: "Keine Berechtigung" }, 403);

  if (!ID || !GEHEIM) return antwort({ fehler: "einrichten", text: "Die Zugangscodes von Tuya fehlen noch in Supabase." });

  let auftrag: any = {};
  try { auftrag = await req.json(); } catch { /* leer = Liste */ }
  try {
    if (auftrag.aktion === "schalten") {
      if (!SCHREIBEN.includes(rolle)) return antwort({ fehler: "Schalten dürfen nur Personen mit Schreibrecht." }, 403);
      const id = String(auftrag.id || ""), code = String(auftrag.code || "switch_1");
      if (!/^[A-Za-z0-9]+$/.test(id) || !/^switch(_\d+|_usb\d+)?$/.test(code)) return antwort({ fehler: "Ungültige Steckdose" }, 400);
      await tuya("POST", "/v1.0/iot-03/devices/" + id + "/commands", { commands: [{ code, value: !!auftrag.an }] });
    }
    return antwort({ geraete: await geraete(), darfSchalten: SCHREIBEN.includes(rolle) });
  } catch (e) {
    return antwort({ fehler: String((e as Error)?.message || e) }, 502);
  }
});
