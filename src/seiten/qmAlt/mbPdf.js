// =================================================================
//  Bericht der Managementbewertung als PDF A4 (seit 1.483.0), gleich
//  gezeichnet wie der Auditbericht (pdfAusHtml). Gliederung wie die
//  bisherige Bewertung von Hofer + Co, Kapitel nach ISO 9001 9.3.
// =================================================================
import { alt } from "../../bruecke.jsx";
import { MB_KAPITEL, mbBewertung, wertText, vergleich } from "../../daten/mbKatalog.js";
import { pdfAusHtml } from "./checklistePdf.js";

const e = (t) => alt.esc(t == null ? "" : String(t));
const zeilen = (t) => e(t).replace(/\n/g, "<br>");
const datum = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "");

export function mbHtml(b, mb, fragen, vorjahr) {
  const d = b.daten || {};
  const k = mb.kopf || {};
  const j = d.jahr;
  let h = "<div class='ck-titel'><div><h1>Managementbewertung " + e(j) + "</h1><div class='ck-unter'>ISO 9001:2026 Kapitel 9.3</div></div>"
    + "<div class='ck-firma'>Hofer + Co<br>Präzisionsdrehteile</div></div>";
  h += "<table class='ck-kopf'><tbody>"
    + "<tr><th>Bewertungszeitraum</th><td>01.01." + e(j) + " bis 31.12." + e(j) + "</td><th>Datum</th><td>" + e(datum(k.datum)) + "</td></tr>"
    + "<tr><th>Geschäftsleitung / Teilnehmer</th><td colspan='3'>" + e(k.teilnehmer) + "</td></tr>"
    + "<tr><th>Erstellt von</th><td colspan='3'>" + e(k.ersteller) + "</td></tr>"
    + "</tbody></table>";
  h += "<p class='ck-klein'>Die jährliche Managementbewertung wird durch die oberste Leitung analysiert, beurteilt und bewertet. Abgeleitete Massnahmen werden in der Liste Abweichungen und Verbesserungen festgehalten, verfolgt und auf Wirksamkeit geprüft; neue Ziele stehen in der Liste Qualitätsziele.</p>";
  // Übersicht
  h += "<h2>Übersicht</h2><table><thead><tr><th>Kapitel</th><th>Norm</th><th>Bewertung</th><th>Massnahmen?</th></tr></thead><tbody>"
    + MB_KAPITEL.map((x) => {
      const a = (mb.kapitel || {})[x.id] || {};
      const bw = mbBewertung(a.b);
      return "<tr><td>" + e(x.titel) + "</td><td class='ck-nw'>" + e(x.norm) + "</td><td class='ck-nw ck-" + (bw ? bw[2] : "grau") + "'>"
        + e(bw ? bw[1] : "nicht bewertet") + "</td><td class='ck-nw'>" + (a.m === "ja" ? "Ja" : a.m === "nein" ? "Nein" : "–") + "</td></tr>";
    }).join("") + "</tbody></table>";

  MB_KAPITEL.forEach((x, i) => {
    const a = (mb.kapitel || {})[x.id] || {};
    const bw = mbBewertung(a.b);
    h += "<h2>" + (i + 1) + ". " + e(x.titel) + " <span class='ck-klein'>ISO " + e(x.norm) + "</span></h2>";
    const auto = (mb.auto || {})[x.id] || [];
    if (auto.length) h += "<h3>Aus dem HoferTool</h3><table><tbody>" + auto.map(([t, w, z]) =>
      "<tr><td>" + e(t) + "</td><td class='ck-nw'><b>" + e(w) + "</b></td><td class='ck-klein'>" + e(z) + "</td></tr>").join("") + "</tbody></table>";
    const fr = fragen.filter((f) => f.kapitel === x.id);
    const zahlen = fr.filter((f) => f.art !== "text");
    const texte = fr.filter((f) => f.art === "text");
    if (zahlen.length) h += "<table><thead><tr><th>Kennzahl</th><th>" + e(j) + "</th><th>" + e(j - 1) + "</th><th>Veränderung</th></tr></thead><tbody>"
      + zahlen.map((f) => {
        const w = ((mb.antworten || {})[f.id] || {}).wert;
        const v = vorjahr(f);
        return "<tr><td>" + e(f.text) + "</td><td class='ck-nw'><b>" + e(wertText(f, w) || "–") + "</b></td><td class='ck-nw'>" + e(wertText(f, v) || "–")
          + "</td><td class='ck-nw'>" + e(vergleich(f, w, v)) + "</td></tr>";
      }).join("") + "</tbody></table>";
    for (const f of texte) {
      const w = ((mb.antworten || {})[f.id] || {}).wert;
      if (String(w || "").trim()) h += "<h3>" + e(f.text) + "</h3><p>" + zeilen(w) + "</p>";
    }
    h += "<table><tbody><tr><th style='width:20%'>Bewertung</th><td class='ck-" + (bw ? bw[2] : "grau") + "'>" + e(bw ? bw[1] : "nicht bewertet")
      + "</td><th style='width:20%'>Massnahmen nötig?</th><td>" + (a.m === "ja" ? "Ja" : a.m === "nein" ? "Nein" : "–") + "</td></tr>"
      + (String(a.text || "").trim() ? "<tr><th>Bemerkung</th><td colspan='3'>" + zeilen(a.text) + "</td></tr>" : "") + "</tbody></table>";
  });

  h += "<h2>Ergebnis der Bewertung <span class='ck-klein'>ISO 9.3.3</span></h2>";
  const ziele = (mb.ziele || []).filter((z) => String(z.titel || "").trim());
  h += "<h3>Neue Ziele " + e(j + 1) + "</h3>" + (ziele.length
    ? "<table><thead><tr><th>Ziel</th><th>Messgrösse</th><th>Zielwert</th><th>Wer</th><th>Bis</th></tr></thead><tbody>"
      + ziele.map((z) => "<tr><td>" + e(z.titel) + "</td><td>" + e(z.messung) + "</td><td>" + e(z.zielwert) + "</td><td>" + e(z.wer) + "</td><td class='ck-nw'>" + e(datum(z.termin)) + "</td></tr>").join("")
      + "</tbody></table>" : "<p>Keine neuen Ziele beschlossen.</p>");
  const ms = (mb.massnahmen || []).filter((z) => String(z.titel || "").trim());
  h += "<h3>Beschlossene Verbesserungen und Massnahmen</h3>" + (ms.length
    ? "<table><thead><tr><th>Massnahme</th><th>Wer</th><th>Bis</th></tr></thead><tbody>"
      + ms.map((z) => "<tr><td>" + e(z.titel) + "</td><td>" + e(z.wer) + "</td><td class='ck-nw'>" + e(datum(z.termin)) + "</td></tr>").join("")
      + "</tbody></table>" : "<p>Keine.</p>");
  h += "<h3>Änderungsbedarf am QM-System</h3><p>" + (zeilen(mb.aenderung) || "Keiner.") + "</p>";
  h += "<h3>Bedarf an Ressourcen</h3><p>" + (zeilen(mb.ressourcen) || "Keiner.") + "</p>";
  h += "<h2>Kontrolle und Freigabe</h2><table class='ck-unterschrift'><tbody>"
    + "<tr><th>Geschäftsleitung</th><td></td><th>Ersteller</th><td>" + e(k.ersteller) + "</td></tr>"
    + "<tr><th>Ort / Datum</th><td>Lohn-Ammannsegg, " + e(datum(k.datum)) + "</td><th>Ort / Datum</th><td>Lohn-Ammannsegg, " + e(datum(k.datum)) + "</td></tr>"
    + "<tr><th>Unterschrift</th><td></td><th>Unterschrift</th><td></td></tr></tbody></table>";
  return h;
}

export const mbPdf = (b, mb, fragen, vorjahr) =>
  pdfAusHtml(mbHtml(b, mb, fragen, vorjahr), "Managementbewertung " + (b.daten || {}).jahr + " · " + datum((mb.kopf || {}).datum));
