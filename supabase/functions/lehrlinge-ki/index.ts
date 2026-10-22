// KI für die Lehrlinge (Wunsch Patrick, 22. Oktober 2026).
//
// Polymechaniker und Produktionsmechaniker in Ausbildung stellen auf der
// Seite „Lehrlinge“ Fragen zur Ausbildung: Grundausbildung (Feilen,
// Sägen, Bohren, Reiben, Gewinden, Drehen, Fräsen, Schleifen), CNC mit
// G- und M-Code (Star Langdreher mit Fanuc, aber auch andere), Werkstoff-
// technik, Mathematik, Zeichnungstechnik, Maschinentechnik und Schule.
// Die KI ersetzt keinen Ausbildner, sie hilft, wenn gerade niemand da ist.
//
// Warum über den Server: Der Schlüssel für die KI (ANTHROPIC_API_KEY,
// unter Supabase → Edge Functions → Secrets) darf nie in die App, weil
// das Repository öffentlich ist. Die Funktion prüft die Anmeldung,
// Externe und das Dienstkonto bekommen nichts. Die Antwort kommt Stück
// für Stück als Text, damit man sie schon beim Schreiben lesen kann.
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODELL = "claude-opus-5-5";
const MAX_NACHRICHTEN = 30;     // nur die letzten, damit es nicht teuer wird
const MAX_ZEICHEN = 8000;       // je Nachricht
const MAX_BILD = 2_500_000;     // Base64-Zeichen je Bild (die App verkleinert vorher)

const ANWEISUNG = `Du bist der Lernbegleiter für Lernende bei Hofer + Co. Präzisionsdrehteile in Lohn-Ammannsegg (Schweiz). Die Lernenden machen die Lehre als Polymechaniker/in EFZ oder Produktionsmechaniker/in EFZ.

Du hilfst bei allen Fragen rund um die Ausbildung:
- Grundausbildung: Feilen, Sägen, Anreissen, Messen und Prüfen (Messschieber, Mikrometer, Messuhr, Lehren), Bohren, Senken, Reiben, Gewinde schneiden und formen, konventionelles Drehen und Fräsen, Schleifen, Schnittwerte, Werkzeuge und Schneidstoffe, Spannmittel, Arbeitssicherheit.
- CNC: Programmieren mit G- und M-Code nach DIN 66025 / ISO, besonders Fanuc-Steuerungen wie auf den Star-Langdrehern (Swiss-Type, Haupt- und Gegenspindel, Führungsbuchse, Stangenlader, angetriebene Werkzeuge, C-Achse, Abstechen und Übergabe), aber auch andere Steuerungen (Siemens, Heidenhain, Mazak usw.). Zyklen, Werkzeugkorrekturen, Nullpunkte, Fehlersuche in Programmen.
- Werkstofftechnik: Stahl, rostfreie Stähle (V2A, V4A, Chromstahl), Messing, Aluminium, Titan, Kunststoffe; Werkstoffnummern und Kurznamen, Eigenschaften, Zerspanbarkeit, Wärmebehandlung.
- Mathematik und Physik für die Werkstatt und die Berufsfachschule: Dreisatz, Prozent, Trigonometrie, Flächen und Volumen, Masse und Dichte, Schnittgeschwindigkeit und Drehzahl, Vorschub, Hebel, Kräfte, Toleranzen und Passungen.
- Zeichnungstechnik: Ansichten, Schnitte, Bemassung, Toleranzen, ISO-Passungen, Form- und Lagetoleranzen, Oberflächenangaben, Gewindedarstellung.
- Maschinentechnik, Elektro-, Steuerungs-, Pneumatik- und Hydraulik-Grundlagen, Instandhaltung.
- Schule und Lehre: Berufsfachschule, überbetriebliche Kurse, Lerndokumentation, Prüfungsvorbereitung (QV), Lernen allgemein.

So antwortest du:
- Auf Deutsch in Schweizer Schreibweise: „ss“ statt „ß“, Zahlen mit Apostroph (1'200), Dezimalkomma.
- Verständlich wie ein geduldiger, erfahrener Berufsbildner: zuerst die Antwort, dann kurz das Warum. Fachbegriffe erklären. Rechnungen Schritt für Schritt mit Formel, Einsetzen und Einheit.
- Bei Hausaufgaben und Prüfungsfragen nicht einfach nur das Resultat hinschreiben: führe zum Lösungsweg, damit die Person es selbst versteht. Wenn sie ausdrücklich die Lösung zum Kontrollieren will, gib sie mit Weg.
- G-Code in Codeblöcken, jede Zeile kurz kommentiert. Sag klar, dass Programme vor dem ersten Lauf an der Maschine im Einzelsatz, mit reduziertem Eilgang und vom Einrichter geprüft werden müssen, weil jede Maschine und Steuerung etwas anders ist (Parameter, Zyklen, Maschinenhersteller-M-Codes).
- Sicherheit geht vor: Bei allem, was gefährlich sein kann (drehende Teile, Spannen, Schleifen, Chemikalien, Elektrisches, Maschine verfahren), auf Schutz und Vorgaben hinweisen und lieber einmal mehr sagen „frag zuerst deinen Ausbildner“.
- Wenn du dir nicht sicher bist oder es von der Maschine, dem Betrieb oder der Schule abhängt, sag das ehrlich. Erfinde keine Werte. Firmeninterne Vorgaben, Zeichnungen und Abläufe kennst du nicht.
- Du ersetzt den Ausbildner nicht. Bei Fragen zu Bewertung, Lehrvertrag, Konflikten, Gesundheit oder persönlichen Sorgen freundlich an Ausbildner, Berufsbildner oder Vertrauensperson verweisen.
- Bleib bei Ausbildung, Beruf und Schule. Bei ganz anderen Themen kurz und freundlich zurück zur Ausbildung lenken.
- Formatierung: kurze Absätze, Aufzählungen und **fett** sparsam, Tabellen nur wenn sie wirklich helfen.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const fehler = (text: string, status: number) =>
  new Response(JSON.stringify({ fehler: text }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

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

type Nachricht = { rolle: "ich" | "ki"; text: string; bild?: { typ: string; daten: string } };

// Verlauf aus der App in die Form der KI bringen, alles begrenzen
function nachrichtenBauen(liste: Nachricht[]): Anthropic.MessageParam[] {
  const aus: Anthropic.MessageParam[] = [];
  for (const n of liste.slice(-MAX_NACHRICHTEN)) {
    const text = String(n.text ?? "").slice(0, MAX_ZEICHEN);
    if (n.rolle === "ki") {
      if (text.trim()) aus.push({ role: "assistant", content: text });
      continue;
    }
    const inhalt: Anthropic.ContentBlockParam[] = [];
    const b = n.bild;
    if (b && /^image\/(jpeg|png|webp|gif)$/.test(b.typ) && typeof b.daten === "string" && b.daten.length < MAX_BILD) {
      inhalt.push({ type: "image", source: { type: "base64", media_type: b.typ as "image/jpeg", data: b.daten } });
    }
    inhalt.push({ type: "text", text: text.trim() || "Was siehst du auf dem Bild?" });
    aus.push({ role: "user", content: inhalt });
  }
  // Die erste Nachricht muss von der Person sein
  while (aus.length && aus[0].role !== "user") aus.shift();
  return aus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fehler("Nur POST", 405);

  const kiSchluessel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!kiSchluessel) return fehler("schluessel_fehlt", 503);

  // Angemeldet und weder extern noch Dienst?
  const url = Deno.env.get("SUPABASE_URL");
  const geheim = geheimSchluessel();
  if (!url || !geheim) return fehler("Server nicht eingerichtet", 500);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = createClient(url, geheim, { auth: { persistSession: false } });
  const { data: wer } = await db.auth.getUser(token);
  if (!wer?.user) return fehler("Nicht angemeldet", 401);
  const { data: profil } = await db.from("profiles").select("role, is_active").eq("id", wer.user.id).maybeSingle();
  if (!profil || profil.is_active === false || profil.role === "extern" || profil.role === "dienst") {
    return fehler("Kein Zugriff", 403);
  }

  let eingabe: { nachrichten?: Nachricht[] };
  try { eingabe = await req.json(); } catch { return fehler("Ungültige Anfrage", 400); }
  const nachrichten = nachrichtenBauen(Array.isArray(eingabe.nachrichten) ? eingabe.nachrichten : []);
  if (!nachrichten.length) return fehler("Keine Frage", 400);

  const ki = new Anthropic({ apiKey: kiSchluessel });
  const kodierer = new TextEncoder();
  const strom = new ReadableStream({
    async start(ctrl) {
      try {
        const lauf = ki.messages.stream({
          model: MODELL,
          max_tokens: 16000,
          output_config: { effort: "medium" },
          system: [{ type: "text", text: ANWEISUNG, cache_control: { type: "ephemeral" } }],
          messages: nachrichten,
        });
        lauf.on("text", (t) => ctrl.enqueue(kodierer.encode(t)));
        const fertig = await lauf.finalMessage();
        if (fertig.stop_reason === "refusal") {
          ctrl.enqueue(kodierer.encode("\n\nDazu kann ich leider nichts sagen. Frag bitte deinen Ausbildner."));
        } else if (fertig.stop_reason === "max_tokens") {
          ctrl.enqueue(kodierer.encode("\n\n… (Antwort zu lang, abgeschnitten)"));
        }
      } catch (e) {
        const status = e instanceof Anthropic.APIError ? e.status : 0;
        const text = status === 429 ? "Gerade zu viele Fragen, bitte in einer Minute nochmal."
          : status === 401 ? "Der Schlüssel für die KI stimmt nicht."
          : "Die KI ist gerade nicht erreichbar.";
        ctrl.enqueue(kodierer.encode("\n\n⚠️ " + text));
        console.error("lehrlinge-ki", status, String(e));
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(strom, {
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
});
