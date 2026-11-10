// =================================================================
//  Managementbewertung als PDF (seit 1.460.0), A4 quer wie die
//  bisherige Word-Vorlage. Das Blatt wird unsichtbar neben dem
//  Bildschirm gezeichnet und Stück für Stück in ein PDF gelegt;
//  Seitenwechsel zwischen Zeilen und Abschnitten, nie mitten durch.
//  Eigenes Stück: html2canvas und jsPDF laden erst beim Klick.
// =================================================================
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { alt } from "../../bruecke.jsx";
import { zahlZeigen, statusText } from "../../daten/qm.js";
import { datumVoll } from "../../daten/qmBewertung.js";
import { LEISTUNG, RUECKMELDUNGEN, NK, AUDITS, AUTO_ZEILEN, erreichtText, inhaltVoll } from "../../daten/qmBewertung.js";

const MM = 96 / 25.4;
const RAND = 12;
const BREITE = 297, HOEHE = 210;

const e = (t) => alt.esc(t == null ? "" : String(t));
const jn = (w) => (w === "ja" ? "Ja" : w === "nein" ? "Nein" : "–");

// Ein Punkt je Zeile als Liste; eingerückte Zeilen eine Stufe tiefer
function punkte(text) {
  const zeilen = String(text || "").split("\n").filter((z) => z.trim());
  if (!zeilen.length) return "<p class='qp-leer'>–</p>";
  return "<ul>" + zeilen.map((z) => {
    const tief = /^\s{2,}|^\s*[o▪•]\s/.test(z);
    return "<li" + (tief ? " class='qp-tief'" : "") + ">" + e(z.replace(/^\s*[-–o▪•]\s*/, "")) + "</li>";
  }).join("") + "</ul>";
}

function massnahmen(titel, liste) {
  const zeilen = liste.length ? liste.map((m) => "<tr><td>" + e(m.nr) + "</td><td><b>" + e(m.thema) + "</b><br>" + e(m.massnahme)
    + "</td><td>" + e(m.beschreibung) + "</td><td>" + e(m.wer) + "</td><td>" + (m.termin ? e(datumVoll(m.termin)) : "")
    + "</td><td>" + e(m.messgroesse) + "</td><td>" + e(m.ziel) + "</td><td>" + e(m.ist) + "</td><td>"
    + e(erreichtText(m.status) || statusText(m.status)) + "</td></tr>").join("")
    : "<tr><td colspan='9' class='qp-leer'>Keine</td></tr>";
  return "<h2>" + e(titel) + "</h2><p class='qp-klein'>(Massnahmen aus nicht erreichten Zielen sind in die nächste Bewertungs-Periode zu übertragen)</p>"
    + "<table><thead><tr><th>Nr.</th><th>Ziel / Massnahme</th><th>Beschreibung / Ressourcen</th><th>Wer</th><th>Termin</th>"
    + "<th>Messgrösse</th><th>Ziel</th><th>Ist</th><th>Erreicht?</th></tr></thead><tbody>" + zeilen + "</tbody></table>";
}

export function bewertungHtml(b, inhalt0, ansicht) {
  const i = inhaltVoll(inhalt0);
  const k = i.kopf;
  const datum = datumVoll;
  let h = "<h1>Managementbewertung für das Jahr " + e(b.jahr) + "</h1>"
    + "<p>Die jährliche Managementbewertung unterstützt die Hofer + Co in der Verbesserung ihrer Produkte- und Dienstleistungsqualität. "
    + "Sie wird jährlich erhoben und durch die oberste Leitung analysiert, beurteilt und bewertet. Abgeleitete Massnahmen werden im KVP festgehalten, "
    + "abgearbeitet, verfolgt und deren Wirksamkeit überprüft.</p>"
    + "<table class='qp-kopf'><tr><th>Organisation</th><td>" + e(k.organisation) + "</td><th>Ort</th><td>" + e(k.ort) + "</td></tr>"
    + "<tr><th>Geschäftsleitung</th><td>" + e(k.gl).replace(/\n/g, "<br>") + "</td><th>Bewertungszeitraum</th><td>"
    + e(datum(b.von)) + " bis " + e(datum(b.bis)) + "</td></tr>"
    + "<tr><th>Norm</th><td>" + e(k.norm) + "</td><th>Fassung</th><td>" + e(b.fassung)
    + (b.status === "freigegeben" ? ", freigegeben " + e(datum(b.freigegeben_am)) + (b.freigegeben_name ? " durch " + e(b.freigegeben_name) : "") : ", Entwurf")
    + "</td></tr></table>"
    + "<table class='qp-kopf'><tr><th>CEO</th><td>" + e(k.ceo) + "</td><th>Ersteller</th><td>" + e(k.ersteller) + "</td></tr>"
    + "<tr><th>Ort / Datum</th><td>" + e(k.ceo_datum) + "</td><th>Ort / Datum</th><td>" + e(k.ersteller_datum) + "</td></tr>"
    + "<tr><th>Unterschrift</th><td class='qp-unterschrift'></td><th>Unterschrift</th><td class='qp-unterschrift'></td></tr></table>";

  h += "<h2>Allgemeiner Geschäftsverlauf</h2><h3>Allgemeine Ereignisse</h3>" + punkte(i.verlauf.allgemein);
  const w = ansicht.wirtschaft;
  if (w && w.zeilen.length) {
    h += "<table><thead><tr><th>Wirtschaftszahlen</th>" + w.jahre.map((j) => "<th class='qp-z'>" + j + "</th>").join("")
      + "</tr></thead><tbody>" + w.zeilen.map((z) => "<tr><td>" + e(z.text) + " (" + e(z.einheit) + ")</td>"
        + z.werte.map((v) => "<td class='qp-z'>" + e(zahlZeigen(v, z.einheit)) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  }
  h += "<h3>Positive Ereignisse / Entwicklungen</h3>" + punkte(i.verlauf.positiv)
    + "<h3>Negative Ereignisse / Entwicklungen</h3>" + punkte(i.verlauf.negativ)
    + "<h3>Fazit / Erkenntnisse</h3>" + punkte(i.verlauf.fazit);

  h += massnahmen("Status von vorangegangener Bewertungs-Periode", ansicht.massnahmen.status);
  h += massnahmen("Veränderungen, die sich auf das Qualitätsmanagementsystem auswirken", ansicht.massnahmen.veraenderung);

  h += "<h2>Rückmeldungen von Kunden und relevanten Parteien</h2><table><thead><tr><th></th>"
    + RUECKMELDUNGEN.map(([, t]) => "<th>" + e(t) + "</th>").join("") + "</tr></thead><tbody>";
  const rm = (f, fn) => "<tr><th>" + f + "</th>" + RUECKMELDUNGEN.map(([x]) => "<td>" + fn(i.rueckmeldungen[x]) + "</td>").join("") + "</tr>";
  h += rm("Anzahl / positiv / negativ", (r) => e(r.anzahl || "–") + " / " + e(r.positiv || "–") + " / " + e(r.negativ || "–"))
    + rm("Art der Rückmeldung", (r) => punkte(r.art)) + rm("Massnahmen?", (r) => jn(r.massnahmen))
    + rm("Bemerkung", (r) => e(r.bemerkung).replace(/\n/g, "<br>")) + "</tbody></table>";

  h += "<h2>Leistung und Wirksamkeit des Qualitätsmanagementsystems</h2>";
  if (ansicht.kennzahlen && ansicht.kennzahlen.length) {
    h += "<table><thead><tr><th>Messgrösse</th><th class='qp-z'>Ziel</th><th class='qp-z'>" + (b.jahr - 1) + "</th><th class='qp-z'>" + b.jahr
      + "</th><th>Trend</th><th>Bewertung</th></tr></thead><tbody>" + ansicht.kennzahlen.map((x) => "<tr><td>" + e(x.name)
        + "</td><td class='qp-z'>" + (x.ziel != null ? (x.richtung === "tief" ? "≤ " : "≥ ") + e(zahlZeigen(x.ziel, x.einheit)) + " " + e(x.einheit) : "")
        + "</td><td class='qp-z'>" + e(zahlZeigen(x.vorjahr, x.einheit)) + "</td><td class='qp-z'>" + e(zahlZeigen(x.ist, x.einheit))
        + "</td><td>" + e(x.trend) + "</td><td><span class='qp-ampel " + e(x.ampel || "") + "'></span>"
        + e({ gruen: "Ziel erreicht", gelb: "knapp verfehlt", rot: "verfehlt" }[x.ampel] || "") + "</td></tr>").join("") + "</tbody></table>";
  }
  const a = ansicht.auto;
  if (a && a.werte) {
    const z = AUTO_ZEILEN.filter(([x]) => a.werte[x] != null);
    if (z.length) {
      h += "<h3>Aus dem HoferTool" + (a.statistikVon ? " (Produktion " + e(datumVoll(a.statistikVon)) + " bis " + e(datumVoll(a.statistikBis)) + ")" : "")
        + "</h3><table class='qp-schmal'><tbody>" + z.map(([x, t, ein]) => "<tr><td>" + e(t) + "</td><td class='qp-z'>"
          + e(zahlZeigen(a.werte[x], ein)) + " " + e(ein) + "</td></tr>").join("") + "</tbody></table>";
    }
  }
  h += "<table><thead><tr><th>Thema</th><th>Bewertung / Bemerkung</th><th>Massnahmen?</th></tr></thead><tbody>"
    + LEISTUNG.map(([x, t]) => "<tr><td><b>" + e(t) + "</b></td><td>" + e(i.leistung[x].text).replace(/\n/g, "<br>")
      + "</td><td>" + jn(i.leistung[x].massnahmen) + "</td></tr>").join("") + "</tbody></table>";

  h += massnahmen("Neue Jahresziele / Verbesserung", ansicht.massnahmen.jahresziel);

  h += "<h2>Nichtkonformität und Korrekturmassnahmen</h2><table><thead><tr><th></th>"
    + NK.map(([, t]) => "<th>" + e(t) + "</th>").join("") + "</tr></thead><tbody>";
  const nk = (f, fn) => "<tr><th>" + f + "</th>" + NK.map(([x]) => "<td>" + fn(i.nk[x]) + "</td>").join("") + "</tr>";
  h += nk("Total / in Arbeit / erledigt / offen", (r) => [r.total, r.arbeit, r.erledigt, r.offen].map((v) => e(v || "–")).join(" / "))
    + nk("Kosten", (r) => e(r.kosten || "–")) + nk("Massnahmen gefordert?", (r) => jn(r.massnahmen))
    + nk("Bemerkung", (r) => e(r.bemerkung).replace(/\n/g, "<br>")) + "</tbody></table>";

  h += "<h2>Ergebnisse aus Audits</h2><table><thead><tr><th></th>" + AUDITS.map(([, t]) => "<th>" + e(t) + "</th>").join("")
    + "</tr></thead><tbody>";
  const au = (f, k2) => "<tr><th>" + f + "</th>" + AUDITS.map(([x]) => "<td>" + (k2 === "erreicht" || k2 === "massnahmen"
    ? jn(i.audits[x][k2]) : e(i.audits[x][k2] || "–").replace(/\n/g, "<br>")) + "</td>").join("") + "</tr>";
  h += au("Geplant", "geplant") + au("Realisiert", "realisiert") + au("Kritisch", "kritisch") + au("Feststellungen", "feststellungen")
    + au("Erledigt", "erledigt") + au("Ziel erreicht?", "erreicht") + au("Massnahmen?", "massnahmen") + au("Bemerkungen", "bemerkung")
    + "</tbody></table>";

  h += "<h2>Ergebnis der Bewertung</h2><h3>Möglichkeiten zur Verbesserung</h3>" + punkte(i.ergebnis.verbesserung)
    + "<h3>Änderungsbedarf am Qualitätsmanagementsystem</h3>" + punkte(i.ergebnis.aenderung)
    + "<h3>Bedarf an Ressourcen</h3>" + punkte(i.ergebnis.ressourcen);
  return h;
}

const STIL = `
.qmpdf{font:9.5pt/1.35 Arial,Helvetica,sans-serif;color:#111;background:#fff}
.qmpdf h1{font-size:16pt;margin:0 0 6px;color:#123d6b}
.qmpdf h2{font-size:12pt;margin:14px 0 4px;padding:4px 6px;background:#e8eef5;color:#123d6b}
.qmpdf h3{font-size:10pt;margin:8px 0 2px}
.qmpdf p{margin:2px 0 6px}.qmpdf .qp-klein{font-size:8pt;color:#555}.qmpdf .qp-leer{color:#888;text-align:left;margin:2px 0 6px}.qmpdf p,.qmpdf td,.qmpdf th{text-align:left}
.qmpdf table{border-collapse:collapse;width:100%;margin:4px 0 8px}
.qmpdf table.qp-schmal{width:60%}
.qmpdf th,.qmpdf td{border:1px solid #9aa8b7;padding:3px 5px;vertical-align:top;text-align:left}
.qmpdf thead th{background:#f1f4f8}.qmpdf .qmpdf-x{}.qmpdf td.qp-z,.qmpdf th.qp-z{text-align:right;white-space:nowrap}
.qmpdf table.qp-kopf th{width:14%;background:#f7f9fb}.qmpdf .qp-unterschrift{height:28px}
.qmpdf ul{margin:2px 0 6px 18px;padding:0}.qmpdf li{margin:1px 0}.qmpdf li.qp-tief{margin-left:18px;list-style:circle}
.qmpdf .qp-ampel{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;background:#ccc}
.qmpdf .qp-ampel.gruen{background:#2e9e4f}.qmpdf .qp-ampel.gelb{background:#e5b300}.qmpdf .qp-ampel.rot{background:#d33}
`;

function trennstellen(blatt) {
  const oben = blatt.getBoundingClientRect().top;
  const stellen = new Set();
  // nur unter Zeilen und Listenpunkten, nie direkt unter einer Überschrift
  // oder einem Tabellenkopf
  blatt.querySelectorAll("tbody tr, li, table, ul").forEach((x) => {
    const q = x.getBoundingClientRect();
    if (q.height) stellen.add(Math.ceil(q.bottom - oben) + 1);
  });
  // vor einer Überschrift trennen, damit sie nicht allein unten steht
  blatt.querySelectorAll("h2, h3").forEach((x) => stellen.add(Math.floor(x.getBoundingClientRect().top - oben) - 2));
  return [...stellen].filter((s) => s > 0).sort((a, b) => a - b);
}

export async function bewertungPdf(b, inhalt, ansicht) {
  const breite = (BREITE - 2 * RAND) * MM;
  const seite = (HOEHE - 2 * RAND - 6) * MM;
  const huelle = document.createElement("div");
  huelle.setAttribute("aria-hidden", "true");
  huelle.className = "hell-bleibt";
  huelle.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;background:#fff;overflow:hidden;width:" + breite + "px";
  const blatt = document.createElement("div");
  blatt.className = "qmpdf";
  blatt.style.cssText = "width:" + breite + "px";
  blatt.innerHTML = "<style>" + STIL + "</style>" + bewertungHtml(b, inhalt, ansicht);
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
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
    const titel = b.jahr + "_Ho-Co_Managementbewertung";
    for (let n = 0; n < enden.length; n++) {
      const [von, bis] = enden[n];
      const h = Math.max(1, bis - von);
      huelle.style.height = h + "px";
      blatt.style.marginTop = -von + "px";
      const bild = await html2canvas(huelle, { scale: 2, backgroundColor: "#ffffff", logging: false,
        width: breite, height: h, windowWidth: Math.ceil(breite) + 40 });
      if (n) pdf.addPage("a4", "landscape");
      pdf.addImage(bild.toDataURL("image/jpeg", 0.9), "JPEG", RAND, RAND, BREITE - 2 * RAND, h / MM);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(130);
      pdf.text(datumVoll(alt.isoDatum(new Date())), RAND, HOEHE - 6);
      pdf.text(titel + " · Fassung " + b.fassung, BREITE / 2, HOEHE - 6, { align: "center" });
      pdf.text(n + 1 + " / " + enden.length, BREITE - RAND, HOEHE - 6, { align: "right" });
    }
    pdf.setProperties({ title: "Managementbewertung " + b.jahr, creator: "HoferTool" });
    return pdf.output("blob");
  } finally {
    huelle.remove();
  }
}
