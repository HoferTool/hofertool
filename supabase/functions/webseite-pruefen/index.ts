// Prüft, ob sich eine Webseite auf dem Infoboard einbetten lässt
// (Wunsch Patrick, 29. Oktober 2026: „im Infoboard auch Webseiten anzeigen“).
//
// Viele Seiten verbieten das Einbetten mit X-Frame-Options oder der
// Content-Security-Policy (frame-ancestors). Der Browser verrät das der
// App nicht, er zeigt nur ein leeres Feld. Der Server darf die Antwort
// lesen und sagt der App nur Ja oder Nein mit dem Grund, nie den Inhalt.
//
// Nur mit Anmeldung (prüft Supabase), nur http und https.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// frame-ancestors erlaubt das Einbetten bei uns nur mit * oder unserer Adresse
const UNSERE = ["https://hofertool.github.io", "hofertool.github.io", "https:", "*"];

function sperre(h: Headers): string | null {
  const xfo = (h.get("x-frame-options") || "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return "X-Frame-Options: " + xfo.trim();
  const csp = h.get("content-security-policy") || "";
  const fa = csp.split(";").map((s) => s.trim()).find((s) => s.toLowerCase().startsWith("frame-ancestors"));
  if (fa) {
    const quellen = fa.split(/\s+/).slice(1);
    if (!quellen.some((q) => UNSERE.includes(q.replace(/\/$/, "")))) return "frame-ancestors " + quellen.join(" ");
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let url: URL;
  try {
    const { adresse } = await req.json();
    url = new URL(String(adresse));
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return antwort({ fehler: "Keine gültige Adresse" }, 400);
  }
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    const grund = sperre(r.headers);
    r.body?.cancel();
    return antwort({ erreichbar: r.ok, status: r.status, einbettbar: !grund, grund, https: url.protocol === "https:" });
  } catch (e) {
    return antwort({ erreichbar: false, einbettbar: null, grund: String(e && (e as Error).message || e) });
  }
});
