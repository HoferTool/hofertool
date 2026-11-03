// Stimme für Pablo von ElevenLabs (Wunsch Patrick 3. November 2026:
// „das ist eine Roboterstimme, nimm eine von ElevenLabs“).
//
// Der Schlüssel von ElevenLabs liegt nur hier auf dem Server (Secret
// ELEVENLABS_API_KEY im Supabase-Dashboard unter Edge Functions →
// Secrets), nie in der App oder im Repository. Die App schickt nur den
// Text, der Server holt die Sprache und gibt sie als MP3 zurück.
// Fehlt der Schlüssel, antwortet er { fehler: "kein-schluessel" } und
// die App spricht mit der Stimme des Geräts.
//
// Wahlweise: ELEVENLABS_VOICE_ID (Stimme, Vorgabe „George“) und
// ELEVENLABS_MODEL (Vorgabe eleven_multilingual_v2, spricht gut Deutsch).
// Nur mit Anmeldung (prüft Supabase), höchstens 800 Zeichen.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const schluessel = Deno.env.get("ELEVENLABS_API_KEY");
  if (!schluessel) return json({ fehler: "kein-schluessel" });
  let text = "";
  try {
    text = String((await req.json()).text || "").trim();
  } catch { /* leer */ }
  if (!text) return json({ fehler: "kein-text" }, 400);
  if (text.length > 800) text = text.slice(0, 800);
  const stimme = Deno.env.get("ELEVENLABS_VOICE_ID") || "JBFqnCBsd6RMkjVDRZzb";
  const modell = Deno.env.get("ELEVENLABS_MODEL") || "eleven_multilingual_v2";
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(stimme)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": schluessel, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: modell,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const grund = (await r.text()).slice(0, 300);
      return json({ fehler: "elevenlabs", status: r.status, grund });
    }
    // octet-stream, damit supabase-js die Antwort als Blob liefert
    return new Response(r.body, { headers: { ...CORS, "Content-Type": "application/octet-stream" } });
  } catch (e) {
    return json({ fehler: "netz", grund: String((e as Error)?.message || e) });
  }
});
