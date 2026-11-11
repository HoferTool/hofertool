// =================================================================
//  Auditbericht aus der Checkliste als PDF (seit 1.469.0), A4 hoch.
//  Wie die Managementbewertung: unsichtbar gezeichnet, Stück für Stück
//  ins PDF, Seitenwechsel nur zwischen Zeilen. Lädt erst beim Abschluss.
// =================================================================
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { alt } from "../../bruecke.jsx";
import { ckBewertung, checklisteAuswerten, auswahlText, vpBewertung } from "../../daten/qmAlt.js";

const MM = 96 / 25.4;
const RAND = 14;
const BREITE = 210, HOEHE = 297;
const e = (t) => alt.esc(t == null ? "" : String(t));
const zeilen = (t) => e(t).replace(/\n/g, "<br>");
const datum = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "");

export function berichtHtml(audit, ck, fragen) {
  const d = audit.daten || {};
  const k = ck.kopf || {};
  const { zaehl, feststellungen, normen } = checklisteAuswerten(fragen, ck.antworten);
  let h = "<div class='ck-titel'><div><h1>Auditbericht</h1><div class='ck-unter'>" + e(auswahlText("audit", "art", d.art) || "Internes Audit")
    + " · ISO 9001:2026</div></div><div class='ck-firma'>Hofer + Co<br>Präzisionsdrehteile</div></div>";
  h += "<table class='ck-kopf'><tbody>"
    + "<tr><th>Bereich</th><td>" + e(ck.bereich || d.bereich) + "</td><th>Datum</th><td>" + e(datum(k.datum)) + "</td></tr>"
    + "<tr><th>Thema</th><td>" + e(audit.titel) + "</td><th>Auditor</th><td>" + e(k.auditor) + "</td></tr>"
    + "<tr><th>Auditierte Personen</th><td colspan='3'>" + e(k.auditiert) + "</td></tr>"
    + "<tr><th>Normkapitel</th><td colspan='3'>" + e(normen.join(", ")) + "</td></tr>"
    + "</tbody></table>";
  h += "<h2>Zusammenfassung</h2><table class='ck-zahlen'><tbody><tr>"
    + "<td><b>" + fragen.length + "</b> Fragen</td><td class='ck-gruen'><b>" + zaehl.ok + "</b> erfüllt</td>"
    + "<td class='ck-gelb'><b>" + zaehl.v + "</b> Verbesserung</td><td class='ck-rot'><b>" + zaehl.a + "</b> Abweichung</td>"
    + "<td><b>" + (zaehl.na + zaehl.offen) + "</b> nicht geprüft</td></tr></tbody></table>";
  if (String(ck.staerken || "").trim()) h += "<h3>Stärken</h3><p>" + zeilen(ck.staerken) + "</p>";
  if (String(ck.fazit || "").trim()) h += "<h3>Gesamteindruck</h3><p>" + zeilen(ck.fazit) + "</p>";
  h += "<h2>Feststellungen und Massnahmen</h2>";
  h += feststellungen.length
    ? "<table><thead><tr><th>Nr.</th><th>Art</th><th>Norm</th><th>Feststellung</th></tr></thead><tbody>"
      + feststellungen.map((f) => {
        const x = (ck.antworten || {})[f.id] || {};
        const fr = fragen.find((y) => y.id === f.id) || {};
        return "<tr><td>" + f.nr + "</td><td class='ck-" + (f.art === "a" ? "rot" : "gelb") + "'>" + (f.art === "a" ? "Abweichung" : "Verbesserung")
          + "</td><td>" + e(f.norm) + "</td><td><b>" + e(fr.thema) + "</b><br>" + zeilen(String(x.text || "").trim() || fr.frage) + "</td></tr>";
      }).join("") + "</tbody></table>"
      + "<p class='ck-klein'>Die Feststellungen sind als offene Einträge in der Liste Abweichungen erfasst und werden dort bis zur Wirksamkeit verfolgt.</p>"
    : "<p>Keine Abweichungen und keine Verbesserungen.</p>";
  const vl = ck.vorliste || [];
  if (vl.length) {
    h += "<h2>Offene Punkte aus früheren Audits</h2><table><thead><tr><th>Herkunft</th><th>Punkt</th><th>Stand</th><th>Bemerkung</th></tr></thead><tbody>"
      + vl.map((p) => {
        const x = (ck.vorpunkte || {})[p.id] || {};
        const b = vpBewertung(x.b);
        return "<tr><td class='ck-nw'>" + e(p.audit) + (p.art === "abweichung" ? "<div class='ck-klein'>Abweichung Nr. " + e(p.nr) + "</div>" : "")
          + "</td><td>" + zeilen(p.text) + "</td><td class='ck-nw ck-" + (b ? b[2] : "grau") + "'>" + e(b ? b[1] : "Nicht geprüft")
          + "</td><td>" + zeilen(x.text) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  h += "<h2>Checkliste</h2><table><thead><tr><th>Nr.</th><th>Norm</th><th>Frage</th><th>Ergebnis</th><th>Nachweis / Bemerkung</th></tr></thead><tbody>"
    + fragen.map((f, i) => {
      const x = (ck.antworten || {})[f.id] || {};
      const b = ckBewertung(x.b);
      return "<tr><td>" + (i + 1) + "</td><td class='ck-nw'>" + e(f.norm) + "</td><td><b>" + e(f.thema) + "</b><br>" + e(f.frage)
        + "</td><td class='ck-nw ck-" + (b ? b[2] : "grau") + "'>" + e(b ? b[1] : "Nicht geprüft") + "</td><td>"
        + zeilen(x.text) + (f.nachweis ? "<div class='ck-klein'>Nachweis: " + e(f.nachweis) + "</div>" : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
  h += "<table class='ck-unterschrift'><tbody><tr><th>Auditor</th><td></td><th>Bereich</th><td></td></tr></tbody></table>";
  return h;
}

const STIL = `
.ckpdf{font:9.5pt/1.35 Arial,Helvetica,sans-serif;color:#111;background:#fff}
.ckpdf .ck-titel{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #123d6b;padding-bottom:4px;margin-bottom:8px}
.ckpdf h1{font-size:18pt;margin:0;color:#123d6b}.ckpdf .ck-unter{color:#555}.ckpdf .ck-firma{text-align:right;font-weight:bold;color:#123d6b}
.ckpdf h2{font-size:12pt;margin:14px 0 4px;padding:4px 6px;background:#e8eef5;color:#123d6b}
.ckpdf h3{font-size:10pt;margin:8px 0 2px}.ckpdf p{margin:2px 0 6px}
.ckpdf table{border-collapse:collapse;width:100%;margin:4px 0 8px}
.ckpdf th,.ckpdf td{border:1px solid #9aa8b7;padding:3px 5px;vertical-align:top;text-align:left}
.ckpdf thead th,.ckpdf .ck-kopf th{background:#f1f4f8}.ckpdf .ck-kopf th{width:20%}
.ckpdf .ck-nw{white-space:nowrap}.ckpdf .ck-klein{font-size:8pt;color:#555;margin-top:2px}
.ckpdf .ck-gruen{color:#1d7a3a;font-weight:bold}.ckpdf .ck-gelb{color:#9a6b00;font-weight:bold}.ckpdf .ck-rot{color:#c02020;font-weight:bold}.ckpdf .ck-grau{color:#777}
.ckpdf .ck-zahlen td{text-align:center}.ckpdf .ck-unterschrift{margin-top:18px}.ckpdf .ck-unterschrift td{height:34px;width:30%}
`;

function trennstellen(blatt) {
  const oben = blatt.getBoundingClientRect().top;
  const stellen = new Set();
  blatt.querySelectorAll("tbody tr, table, p").forEach((x) => {
    const q = x.getBoundingClientRect();
    if (q.height) stellen.add(Math.ceil(q.bottom - oben) + 1);
  });
  blatt.querySelectorAll("h2, h3").forEach((x) => stellen.add(Math.floor(x.getBoundingClientRect().top - oben) - 2));
  return [...stellen].filter((s) => s > 0).sort((a, b) => a - b);
}

export async function berichtPdf(audit, ck, fragen) {
  return pdfAusHtml(berichtHtml(audit, ck, fragen), "Auditbericht " + (ck.bereich || "") + " · " + datum((ck.kopf || {}).datum));
}

// Auch für die Managementbewertung (seit 1.483.0): HTML mit dem Stil oben als A4 hoch
export async function pdfAusHtml(html, fuss) {
  const breite = (BREITE - 2 * RAND) * MM;
  const seite = (HOEHE - 2 * RAND - 6) * MM;
  const huelle = document.createElement("div");
  huelle.setAttribute("aria-hidden", "true");
  huelle.className = "hell-bleibt";
  huelle.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;background:#fff;overflow:hidden;width:" + breite + "px";
  const blatt = document.createElement("div");
  blatt.className = "ckpdf";
  blatt.style.cssText = "width:" + breite + "px";
  blatt.innerHTML = "<style>" + STIL + "</style>" + html;
  huelle.appendChild(blatt);
  document.body.appendChild(huelle);
  try {
    try { await document.fonts.ready; } catch (f) { /* dann so */ }
    const gesamt = Math.max(1, blatt.offsetHeight);
    const stellen = trennstellen(blatt);
    const enden = [];
    let ab = 0;
    while (ab < gesamt - 1) {
      const grenze = ab + seite;
      if (grenze >= gesamt) { enden.push([ab, gesamt]); break; }
      const passend = stellen.filter((s) => s > ab + seite * 0.4 && s <= grenze);
      const ende = passend.length ? passend[passend.length - 1] : Math.floor(grenze);
      enden.push([ab, ende]);
      ab = ende;
    }
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let n = 0; n < enden.length; n++) {
      const [von, bis] = enden[n];
      const h = Math.max(1, bis - von);
      huelle.style.height = h + "px";
      blatt.style.marginTop = -von + "px";
      const bild = await html2canvas(huelle, { scale: 2, backgroundColor: "#ffffff", logging: false,
        width: breite, height: h, windowWidth: Math.ceil(breite) + 40 });
      if (n) pdf.addPage("a4", "portrait");
      pdf.addImage(bild.toDataURL("image/jpeg", 0.9), "JPEG", RAND, RAND, BREITE - 2 * RAND, h / MM);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(130);
      pdf.text(fuss, RAND, HOEHE - 7);
      pdf.text(n + 1 + " / " + enden.length, BREITE - RAND, HOEHE - 7, { align: "right" });
    }
    pdf.setProperties({ title: fuss, creator: "HoferTool" });
    return pdf.output("blob");
  } finally {
    huelle.remove();
  }
}
