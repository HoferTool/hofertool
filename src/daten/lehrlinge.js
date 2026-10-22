// =================================================================
//  LEHRLINGE: NACHSCHLAGEWERK (1.149.0, Wunsch Patrick 22. Oktober 2026)
//  Kapitel, Unterkapitel und häufige Fragen mit Antworten für
//  Polymechaniker und Produktionsmechaniker in Ausbildung. Statt einer
//  KI (1.148.0), weil die pro Frage Geld kostet (Patrick: „Lösch es,
//  wenn es nicht kostenlos möglich ist“). Die Texte stehen in
//  src/daten/lehrlinge/*.md, je Datei ein Kapitel:
//    # Kapitel          (die Zeile danach ist die Kurzbeschreibung)
//    ## Unterkapitel
//    ### Frage          (alles bis zur nächsten Frage ist die Antwort)
//  Neue Fragen kommen einfach dort hinein; Claude schreibt sie.
// =================================================================
import { alt } from "../bruecke.jsx";

const DATEIEN = import.meta.glob("./lehrlinge/*.md", { query: "?raw", import: "default", eager: true });

function kapitelLesen(text, datei) {
  const kap = { id: datei.replace(/^.*\/|\.md$/g, ""), titel: "", text: "", einleitung: "", unter: [] };
  let unter = null, frage = null, imCode = false, nachTitel = false;
  for (const z of String(text).split("\n")) {
    if (/^```/.test(z)) imCode = !imCode;
    const k = !imCode && z.match(/^(#{1,3})\s+(.*)$/);
    if (k && k[1] === "#") { kap.titel = k[2].trim(); nachTitel = true; continue; }
    if (k && k[1] === "##") {
      unter = { titel: k[2].trim(), fragen: [] };
      kap.unter.push(unter); frage = null; nachTitel = false;
      continue;
    }
    if (k && k[1] === "###") {
      if (!unter) { unter = { titel: "Allgemein", fragen: [] }; kap.unter.push(unter); }
      frage = { f: k[2].trim(), a: "" };
      unter.fragen.push(frage); nachTitel = false;
      continue;
    }
    if (frage) frage.a += z + "\n";
    // Erste Zeile nach dem Titel: Kurzbeschreibung für die Karte,
    // weitere Zeilen: Einleitung oben im Kapitel
    else if (nachTitel && z.trim()) {
      if (!kap.text) kap.text = z.trim();
      else kap.einleitung += (kap.einleitung ? " " : "") + z.trim();
    }
  }
  kap.unter.forEach((u) => u.fragen.forEach((f) => { f.a = f.a.trim(); }));
  return kap;
}

export const KAPITEL = Object.keys(DATEIEN).sort().map((d) => kapitelLesen(DATEIEN[d], d));

export const anzahlFragen = (kap) => kap.unter.reduce((s, u) => s + u.fragen.length, 0);

// Für die Suche: klein, ohne Akzente und Zeichen der Darstellung
const flach = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[*`#|]/g, " ");

// Alle Wörter müssen vorkommen; Treffer in der Frage zählen mehr
export function suchen(begriff) {
  const woerter = flach(begriff).split(/\s+/).filter((w) => w.length > 1);
  if (!woerter.length) return [];
  const treffer = [];
  for (const kap of KAPITEL) for (const u of kap.unter) for (const f of u.fragen) {
    const frage = flach(f.f), alles = frage + " " + flach(u.titel) + " " + flach(f.a);
    if (!woerter.every((w) => alles.includes(w))) continue;
    const punkte = woerter.filter((w) => frage.includes(w)).length;
    treffer.push({ kap, unter: u, frage: f, punkte });
  }
  return treffer.sort((a, b) => b.punkte - a.punkte);
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
