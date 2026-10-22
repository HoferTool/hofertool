// =================================================================
//  KI FÜR DIE LEHRLINGE (1.148.0, Wunsch Patrick 22. Oktober 2026)
//  Fragen gehen an die Server-Funktion „lehrlinge-ki“
//  (supabase/functions/lehrlinge-ki), die den geheimen Schlüssel der KI
//  kennt. Die Antwort kommt Stück für Stück als Text zurück.
//  Das Gespräch bleibt nur auf diesem Gerät, je Person (localStorage),
//  ohne Bilder, damit der Speicher nicht vollläuft.
// =================================================================
import { alt } from "../bruecke.jsx";

const MAX_GEMERKT = 60;
const schluessel = () => "hofer.lehrlinge." + (alt.meineProfilId() || "x");

export function gespraechLaden() {
  try { return JSON.parse(localStorage.getItem(schluessel()) || "[]"); } catch { return []; }
}

export function gespraechMerken(liste) {
  // Bilder nicht ablegen, nur vermerken, dass eins dabei war
  const ohne = liste.slice(-MAX_GEMERKT).map((n) => n.bild ? { ...n, bild: undefined, hatteBild: true } : n);
  try { localStorage.setItem(schluessel(), JSON.stringify(ohne)); } catch { /* voll oder gesperrt */ }
}

// Foto verkleinern und als Base64 für die KI
export async function bildVorbereiten(datei) {
  const blob = await alt.bildVerkleinern(datei, 1568);
  const daten = await new Promise((fertig, fehl) => {
    const l = new FileReader();
    l.onload = () => fertig(String(l.result).split(",")[1]);
    l.onerror = fehl;
    l.readAsDataURL(blob);
  });
  return { typ: "image/jpeg", daten, vorschau: URL.createObjectURL(blob) };
}

// Fragt die KI. stueck(text) bekommt jeden neuen Teil der Antwort.
export async function kiFragen(nachrichten, stueck, abbruch) {
  const { data } = await alt.db.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new Error("Nicht angemeldet");
  const senden = nachrichten.map((n) => ({ rolle: n.rolle, text: n.text,
    bild: n.bild ? { typ: n.bild.typ, daten: n.bild.daten } : undefined }));
  const r = await fetch(alt.SUPABASE_URL + "/functions/v1/lehrlinge-ki", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, apikey: alt.SUPABASE_KEY },
    body: JSON.stringify({ nachrichten: senden }),
    signal: abbruch,
  });
  if (!r.ok) {
    let f = "";
    try { f = (await r.json()).fehler || ""; } catch { /* kein JSON */ }
    if (f === "schluessel_fehlt") throw new Error("Die KI ist noch nicht eingerichtet: Der Schlüssel fehlt auf dem Server.");
    if (r.status === 404) throw new Error("Die KI ist noch nicht eingerichtet (Server-Funktion fehlt).");
    if (r.status === 403) throw new Error("Kein Zugriff auf die KI.");
    throw new Error(f || "Die KI ist gerade nicht erreichbar (" + r.status + ").");
  }
  const leser = r.body.getReader();
  const dekoder = new TextDecoder();
  for (;;) {
    const { value, done } = await leser.read();
    if (done) break;
    stueck(dekoder.decode(value, { stream: true }));
  }
}

// Einfache Darstellung der Antwort: Überschriften, fett, kursiv, Code,
// Listen und Tabellen. Alles wird zuerst maskiert (esc).
export function antwortHtml(text) {
  const esc = alt.esc;
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  const zeilen = String(text || "").split("\n");
  let html = "", liste = null, i = 0;
  const listeZu = () => { if (liste) { html += "</" + liste + ">"; liste = null; } };
  while (i < zeilen.length) {
    const z = zeilen[i];
    if (/^```/.test(z)) {
      listeZu();
      const code = [];
      i++;
      while (i < zeilen.length && !/^```/.test(zeilen[i])) code.push(zeilen[i++]);
      i++;
      html += "<pre><code>" + esc(code.join("\n")) + "</code></pre>";
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(z)) {
      listeZu();
      const reihen = [];
      while (i < zeilen.length && /^\s*\|.*\|\s*$/.test(zeilen[i])) reihen.push(zeilen[i++]);
      const zellen = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const ohneTrenner = reihen.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      html += "<div class=\"lehr-tabelle\"><table>" + ohneTrenner.map((r, n) =>
        "<tr>" + zellen(r).map((c) => (n ? "<td>" : "<th>") + inline(c) + (n ? "</td>" : "</th>")).join("") + "</tr>").join("")
        + "</table></div>";
      continue;
    }
    const h = z.match(/^(#{1,4})\s+(.*)$/);
    const ul = z.match(/^\s*[-*•]\s+(.*)$/);
    const ol = z.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { listeZu(); html += "<h4>" + inline(h[2]) + "</h4>"; }
    else if (ul || ol) {
      const art = ul ? "ul" : "ol";
      if (liste !== art) { listeZu(); html += "<" + art + ">"; liste = art; }
      html += "<li>" + inline((ul || ol)[1]) + "</li>";
    } else if (!z.trim()) { listeZu(); }
    else { listeZu(); html += "<p>" + inline(z) + "</p>"; }
    i++;
  }
  listeZu();
  return html;
}
