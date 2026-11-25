// Räumte bis 1.811.x die Temp-Ordner auf (Dateien älter als 24 Stunden).
// Seit 1.814.0 abgeschaltet (Wunsch Patrick 25. November 2026: „soll ab
// jetzt nicht automatisch gelöscht werden“): Temp-Dateien bleiben, bis die
// Person sie selbst löscht. Ältere Fassungen der App rufen die Funktion
// noch auf, darum antwortet sie weiter, löscht aber nichts. Die frühere
// Fassung steht im Git-Verlauf.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return new Response(JSON.stringify({ geloescht: 0, abgeschaltet: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
