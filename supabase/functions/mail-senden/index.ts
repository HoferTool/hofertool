// Sendet Mails und Kalendertermine über das gemeinsame Konto in
// Microsoft 365 (Wunsch Patrick 31. Oktober 2026: Ferien sollen von selbst
// in Outlook stehen, Bestell-PDFs direkt rausgehen; Konto
// programmierung@hoferco.ch).
//
// Warum über Microsoft Graph und nicht SMTP: Supabase lässt aus Server-
// Funktionen keine Verbindungen auf Port 25 und 587 zu, und Microsoft 365
// nimmt SMTP nur dort an. Graph geht über https.
//
// Die Zugangsdaten (Mandant, Anwendungs-ID, geheimer Schlüssel der App-
// Anmeldung bei Microsoft) stehen in der Tabelle mail_konto, die über
// die App niemand lesen kann (sql/mailkonto.sql). Nur diese Funktion
// liest sie mit dem geheimen Supabase-Schlüssel.
//
// Aufrufe (POST, JSON, mit Anmeldung):
//   { art: "pruefen" }    nur Admins: Probe-Mail an den Absender
//   { art: "bestellung", an, kopie, betreff, text, html, logos, pdf: {name, base64}, positionen }
//   { art: "ferien", id, person, von, bis, notiz }      neu oder ändern
//   { art: "ferien_absagen", outlook_id, person }
// Externe und das Dienstkonto dürfen nichts davon.
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

const ADRESSE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]+$/;
const adressen = (t: unknown) => String(t || "").split(/[\s,;]+/).map((a) => a.trim()).filter((a) => ADRESSE.test(a));

type Konto = { mandant: string; client_id: string; geheimnis: string; absender: string; name: string | null };

// Graph liefert Fehler als JSON; für die Meldung in der App auf Deutsch übersetzen,
// was man selbst beheben kann
function graphFehler(status: number, text: string): string {
  let code = "", msg = text;
  try { const j = JSON.parse(text); code = j.error?.code || j.error || ""; msg = j.error?.message || j.error_description || text; } catch { /* Text */ }
  if (/AADSTS7000215|invalid_client/i.test(code + msg)) return "Der geheime Schlüssel stimmt nicht oder ist abgelaufen.";
  if (/AADSTS700016|unauthorized_client/i.test(code + msg)) return "Die Anwendungs-ID ist bei Microsoft nicht bekannt.";
  if (/AADSTS90002|AADSTS900023|tenant/i.test(code + msg) && status === 400) return "Die Verzeichnis-ID (Mandant) stimmt nicht.";
  if (/ErrorAccessDenied|Authorization_RequestDenied|AccessDenied/i.test(code + msg) || status === 403)
    return "Microsoft verweigert den Zugriff. Bei der App-Anmeldung fehlen die Berechtigungen Mail.Send und Calendars.ReadWrite oder die Administratorzustimmung.";
  if (/MailboxNotEnabledForRESTAPI|ResourceNotFound|ErrorInvalidUser/i.test(code + msg)) return "Das Postfach des Absenders gibt es bei Microsoft so nicht.";
  if (status === 413 || /RequestBodyTooLarge|MaxRequestLength/i.test(code + msg)) return "Die Mail ist zu gross (höchstens etwa 3 MB mit Anhang).";
  return "Microsoft meldet " + status + ": " + String(msg).slice(0, 300);
}

async function token(k: Konto): Promise<string> {
  const r = await fetch("https://login.microsoftonline.com/" + encodeURIComponent(k.mandant) + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: k.client_id, client_secret: k.geheimnis,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(graphFehler(r.status, t));
  return JSON.parse(t).access_token;
}

async function graph(tok: string, methode: string, pfad: string, body?: unknown) {
  const r = await fetch("https://graph.microsoft.com/v1.0" + pfad, {
    method: methode,
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", Prefer: 'outlook.timezone="W. Europe Standard Time"' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const t = await r.text();
  if (!r.ok) { const f = new Error(graphFehler(r.status, t)) as Error & { status?: number }; f.status = r.status; throw f; }
  return t ? JSON.parse(t) : null;
}

const plusTag = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const chDatum = (iso: string) => { const [j, m, t] = iso.split("-"); return t + "." + m + "." + j; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = Deno.env.get("SUPABASE_URL"), schluessel = geheimSchluessel();
  if (!url || !schluessel) return antwort({ fehler: "Server nicht eingerichtet" }, 500);
  const db = createClient(url, schluessel, { auth: { persistSession: false } });

  // Wer ruft? Nur Angemeldete, keine Externen, kein Dienstkonto
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return antwort({ fehler: "Bitte anmelden." }, 401);
  const { data: profil } = await db.from("profiles").select("id, role, full_name").eq("id", u.user.id).maybeSingle();
  const rolle = profil?.role || "";
  if (!rolle || rolle === "extern" || rolle === "dienst") return antwort({ fehler: "Dafür fehlt die Berechtigung." }, 403);

  let e: Record<string, any>;
  try { e = await req.json(); } catch { return antwort({ fehler: "Ungültige Anfrage" }, 400); }

  const { data: k } = await db.from("mail_konto").select("*").eq("id", 1).maybeSingle();
  if (!k || !k.mandant || !k.client_id || !k.geheimnis || !k.absender)
    return antwort({ fehler: "Das Mailkonto ist noch nicht eingerichtet (Einstellungen → Allgemein → Mailkonto).", nichtEingerichtet: true });
  const konto = k as Konto;
  const absPfad = "/users/" + encodeURIComponent(konto.absender);
  const von = { emailAddress: { address: konto.absender, name: konto.name || undefined } };

  const protokoll = (art: string, an: string, betreff: string, ok: boolean, fehler?: string) =>
    db.from("mail_protokoll").insert({ von: u.user.id, art, an: an.slice(0, 1000), betreff: betreff.slice(0, 300), ok, fehler: fehler || null });

  try {
    const tok = await token(konto);

    if (e.art === "pruefen") {
      if (rolle !== "admin") return antwort({ fehler: "Nur Admins." }, 403);
      try {
        await graph(tok, "POST", absPfad + "/sendMail", {
          message: {
            subject: "HoferTool: Probe-Mail", from: von,
            body: { contentType: "Text", content: "Diese Mail hat das HoferTool über Microsoft 365 verschickt. Das Mailkonto funktioniert.\n\nAusgelöst von " + (profil?.full_name || u.user.email) },
            toRecipients: [{ emailAddress: { address: konto.absender } }],
          },
          saveToSentItems: true,
        });
        // Kalender mitprüfen: nur lesen, damit nichts liegen bleibt
        await graph(tok, "GET", absPfad + "/events?$top=1&$select=id");
        await db.from("mail_konto").update({ geprueft_am: new Date().toISOString(), fehler: null }).eq("id", 1);
        await protokoll("probe", konto.absender, "HoferTool: Probe-Mail", true);
        return antwort({ ok: true, an: konto.absender });
      } catch (f) {
        const text = (f as Error).message;
        await db.from("mail_konto").update({ geprueft_am: new Date().toISOString(), fehler: text }).eq("id", 1);
        return antwort({ fehler: text });
      }
    }

    if (e.art === "bestellung") {
      const an = adressen(e.an), kopie = adressen(e.kopie);
      if (!an.length) return antwort({ fehler: "Bitte eine Empfängeradresse eintragen." });
      const betreff = String(e.betreff || "Bestellung").slice(0, 250);
      const anhaenge: unknown[] = [];
      for (const l of (Array.isArray(e.logos) ? e.logos : [])) {
        if (!l?.bild || !l?.id) continue;
        anhaenge.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: String(l.datei || l.id + ".png"),
          contentType: "image/png", contentBytes: String(l.bild), contentId: String(l.id), isInline: true });
      }
      if (e.pdf?.base64) {
        anhaenge.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: String(e.pdf.name || "Bestellung.pdf"),
          contentType: "application/pdf", contentBytes: String(e.pdf.base64) });
      }
      try {
        await graph(tok, "POST", absPfad + "/sendMail", {
          message: {
            subject: betreff, from: von,
            body: e.html ? { contentType: "HTML", content: String(e.html) } : { contentType: "Text", content: String(e.text || "") },
            toRecipients: an.map((a) => ({ emailAddress: { address: a } })),
            ccRecipients: kopie.map((a) => ({ emailAddress: { address: a } })),
            attachments: anhaenge,
          },
          saveToSentItems: true,
        });
      } catch (f) {
        await protokoll("bestellung", an.join("; "), betreff, false, (f as Error).message);
        throw f;
      }
      const ids = (Array.isArray(e.positionen) ? e.positionen : []).map(String).filter(Boolean);
      const am = new Date().toISOString();
      if (ids.length) await db.from("order_items").update({ gesendet_am: am, gesendet_von: u.user.id }).in("id", ids);
      await protokoll("bestellung", an.concat(kopie).join("; "), betreff, true);
      return antwort({ ok: true, an, gesendet_am: am });
    }

    if (e.art === "ferien" || e.art === "ferien_absagen") {
      const { data: cfg } = await db.from("app_config").select("wert").eq("schluessel", "ferien_verteiler").maybeSingle();
      const verteiler = adressen(typeof cfg?.wert === "string" ? cfg.wert : "");
      const person = String(e.person || "").slice(0, 120);

      if (e.art === "ferien_absagen") {
        if (!e.outlook_id) return antwort({ ok: true, nichts: true });
        try {
          await graph(tok, "POST", absPfad + "/events/" + encodeURIComponent(e.outlook_id) + "/cancel",
            { comment: "Die Ferien von " + person + " wurden im HoferTool gelöscht." });
        } catch (f) {
          if ((f as { status?: number }).status !== 404) throw f;
        }
        await protokoll("ferien", verteiler.join("; "), "Abgesagt: Ferien " + person, true);
        return antwort({ ok: true });
      }

      if (!verteiler.length) return antwort({ ok: true, nichts: true });
      const vonIso = String(e.von || ""), bisIso = String(e.bis || "");
      if (!ISO.test(vonIso) || !ISO.test(bisIso) || bisIso < vonIso || !person) return antwort({ fehler: "Ferien unvollständig." }, 400);
      const { data: ferien } = await db.from("vacations").select("id, outlook_id").eq("id", e.id).maybeSingle();
      if (!ferien) return antwort({ fehler: "Ferieneintrag nicht gefunden." }, 404);
      const notiz = String(e.notiz || "").trim();
      const termin = {
        subject: "Ferien: " + person,
        body: { contentType: "Text", content: person + " hat Ferien vom " + chDatum(vonIso) + " bis " + chDatum(bisIso) + "."
          + (notiz ? "\n\n" + notiz : "") + "\n\nEingetragen im HoferTool." },
        start: { dateTime: vonIso + "T00:00:00", timeZone: "W. Europe Standard Time" },
        end: { dateTime: plusTag(bisIso) + "T00:00:00", timeZone: "W. Europe Standard Time" },
        isAllDay: true, showAs: "free", isReminderOn: false, responseRequested: false,
        categories: ["Ferien"],
        attendees: verteiler.map((a) => ({ emailAddress: { address: a }, type: "required" })),
      };
      let id = ferien.outlook_id as string | null;
      let neu = !id;
      if (id) {
        try { await graph(tok, "PATCH", absPfad + "/events/" + encodeURIComponent(id), termin); }
        catch (f) { if ((f as { status?: number }).status === 404) neu = true; else throw f; }
      }
      if (neu) {
        const r = await graph(tok, "POST", absPfad + "/events", termin);
        id = r?.id || null;
        await db.from("vacations").update({ outlook_id: id }).eq("id", ferien.id);
      }
      await protokoll("ferien", verteiler.join("; "), (neu ? "" : "Geändert: ") + "Ferien " + person, true);
      return antwort({ ok: true, empfaenger: verteiler.length, neu });
    }

    return antwort({ fehler: "Unbekannte Art" }, 400);
  } catch (f) {
    return antwort({ fehler: (f as Error).message || String(f) });
  }
});
