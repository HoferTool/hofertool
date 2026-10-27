// =================================================================
//  FERIEN ALS OUTLOOK-TERMIN
//  Wunsch Patrick 27. Oktober 2026: „wenn man Ferien einträgt, soll
//  ein Outlook-Kalendereintrag generiert werden, der an eine bestimmte
//  Empfängerliste versendet wird“.
//
//  Gleich gebaut wie die Bestellmail: die App macht eine .eml-Datei mit
//  Empfängern, Betreff, Text und dem Termin als .ics im Anhang. Outlook
//  öffnet sie als Entwurf, man drückt nur noch Senden. Selbst versenden
//  kann die App nicht, dafür bräuchte sie ein Mailkonto auf dem Server.
//
//  Der Termin ist ganztägig und „frei“, damit er bei den Empfängern
//  keine Zeit blockiert. Die UID hängt am Ferieneintrag: eine geänderte
//  Fassung ersetzt beim Öffnen die alte im Kalender.
//
//  Die Empfänger stehen in app_config.ferien_verteiler (ein Text mit
//  Adressen, getrennt durch Komma, Strichpunkt oder Zeilenumbruch);
//  ändern dürfen ihn nur Admins (Einstellungen → Allgemein).
// =================================================================
import { alt } from "../bruecke.jsx";

const SCHLUESSEL = "ferien_verteiler";

export function adressenAus(text) {
  return String(text || "").split(/[\s,;]+/).map((a) => a.trim()).filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
}

export async function verteilerLaden() {
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert")
      .eq("schluessel", SCHLUESSEL).maybeSingle(), 6000, "Ferien-Verteiler");
    return (!r.error && r.data && typeof r.data.wert === "string") ? r.data.wert : "";
  } catch (f) { return ""; }
}

export async function verteilerSpeichern(text) {
  const wert = adressenAus(text).join("; ");
  const { error } = await alt.db.from("app_config").upsert({ schluessel: SCHLUESSEL, wert });
  if (error) throw error;
  return wert;
}

const zwei = (n) => String(n).padStart(2, "0");
const icsDatum = (iso) => iso.replace(/-/g, "");
const ch = (iso) => { const [j, m, t] = iso.split("-"); return t + "." + m + "." + j; };
// Text im Kalender: Komma, Strichpunkt und Backslash maskieren
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Zeilen im Kalender höchstens 75 Bytes; ein Leerzeichen am Anfang setzt fort
function falten(zeile) {
  const teile = []; let rest = zeile, erst = true;
  const enc = new TextEncoder();
  while (enc.encode(rest).length > (erst ? 75 : 74)) {
    let n = erst ? 75 : 74;
    while (enc.encode(rest.slice(0, n)).length > (erst ? 75 : 74)) n--;
    teile.push((erst ? "" : " ") + rest.slice(0, n)); rest = rest.slice(n); erst = false;
  }
  teile.push((erst ? "" : " ") + rest);
  return teile.join("\r\n");
}

// { id, person, von, bis, tage, notiz } → Text der .ics-Datei
export function icsBauen(f) {
  const jetzt = new Date();
  const stempel = jetzt.getUTCFullYear() + zwei(jetzt.getUTCMonth() + 1) + zwei(jetzt.getUTCDate())
    + "T" + zwei(jetzt.getUTCHours()) + zwei(jetzt.getUTCMinutes()) + zwei(jetzt.getUTCSeconds()) + "Z";
  // Ende eines ganztägigen Termins ist der Tag nach dem letzten Ferientag
  const ende = alt.plusTage(f.bis, 1);
  const zeilen = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hofer + Co.//HoferTool//DE",
    "METHOD:PUBLISH", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:ferien-" + (f.id || stempel) + "@hoferco.ch",
    "DTSTAMP:" + stempel,
    // Jede neue Fassung zählt höher, damit Outlook die alte ersetzt
    "SEQUENCE:" + Math.floor(jetzt.getTime() / 60000) % 2000000000,
    "DTSTART;VALUE=DATE:" + icsDatum(f.von),
    "DTEND;VALUE=DATE:" + icsDatum(ende),
    "SUMMARY:" + icsText("Ferien " + f.person),
    "DESCRIPTION:" + icsText(f.person + " ist vom " + ch(f.von) + " bis " + ch(f.bis) + " in den Ferien"
      + tageText(f.tage) + (f.notiz ? "\n" + f.notiz : "")),
    "TRANSP:TRANSPARENT",
    "X-MICROSOFT-CDO-BUSYSTATUS:FREE",
    "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
    "CLASS:PUBLIC",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return zeilen.map(falten).join("\r\n") + "\r\n";
}

const tageText = (n) => n ? " (" + n + (n === 1 ? " Arbeitstag)." : " Arbeitstage).") : ".";
const b64 = (txt) => btoa(unescape(encodeURIComponent(txt)));
// Dateiname ohne Umlaute für Programme, die filename* nicht kennen
const ascii = (s) => s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe")
  .replace(/Ü/g, "Ue").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
const zeilen76 = (s) => s.replace(/(.{76})/g, "$1\r\n");

export function mailText(f, absender) {
  return "Guten Tag\n\n"
    + f.person + " ist vom " + ch(f.von) + " bis " + ch(f.bis) + " in den Ferien"
    + tageText(f.tage) + "\n"
    + (f.notiz ? "Notiz: " + f.notiz + "\n" : "")
    + "\nDer Termin liegt im Anhang. Öffnen und „Speichern und schliessen“ trägt ihn in Ihren Kalender ein.\n\n"
    + "Freundliche Grüsse\n\n" + (absender || "") + "\nHofer + Co. Präzisionsdrehteile";
}

export function emlBauen(f, an, absender) {
  const g = "----=_Hofer_F" + Date.now();
  const name = "Ferien " + f.person.replace(/[\\/:*?"<>|]/g, "") + ".ics";
  const betreff = "Ferien " + f.person + ": " + ch(f.von) + " – " + ch(f.bis);
  return [
    "To: " + an.join(", "),
    "Subject: =?UTF-8?B?" + b64(betreff) + "?=",
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="' + g + '"',
    "",
    "--" + g,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    zeilen76(b64(mailText(f, absender).replace(/\r?\n/g, "\r\n"))),
    "",
    "--" + g,
    'Content-Type: text/calendar; charset="utf-8"; method=PUBLISH; name="' + ascii(name) + '"',
    'Content-Disposition: attachment; filename="' + ascii(name) + '"; filename*=UTF-8\'\'' + encodeURIComponent(name),
    "Content-Transfer-Encoding: base64",
    "",
    zeilen76(b64(icsBauen(f))),
    "",
    "--" + g + "--",
    "",
  ].join("\r\n");
}

function herunterladen(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Am Computer die .eml zum Öffnen in Outlook, auf Tablet und Handy das
// Teilen-Fenster mit der .ics (Adressen in der Zwischenablage).
export async function ferienTerminSenden(f, verteiler) {
  const an = adressenAus(verteiler);
  const absender = (alt.profil && alt.profil.full_name) || "";
  const mobil = /iPad|iPhone|Android/.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const dateiName = "Ferien " + f.person.replace(/[\\/:*?"<>|]/g, "");
  if (mobil && navigator.canShare) {
    const datei = new File([icsBauen(f)], dateiName + ".ics", { type: "text/calendar" });
    if (navigator.canShare({ files: [datei] })) {
      try { if (navigator.clipboard) await navigator.clipboard.writeText(an.join(", ")); } catch (e) { /* ohne Zwischenablage */ }
      try {
        await navigator.share({ files: [datei], title: "Ferien " + f.person, text: mailText(f, absender) });
        alt.meldung("Termin geteilt. Die Empfänger liegen in der Zwischenablage, im Mail bei An einfügen.", "gut");
      } catch (e) { if (!e || e.name !== "AbortError") alt.meldung("Teilen ging nicht: " + (e && e.message), "fehler"); }
      return;
    }
  }
  herunterladen(new Blob([emlBauen(f, an, absender)], { type: "message/rfc822" }), dateiName + ".eml");
  alt.meldung("Die Mail mit dem Termin liegt bei den Downloads. Öffnen, Outlook zeigt sie als Entwurf, nur noch Senden drücken.", "gut");
}
