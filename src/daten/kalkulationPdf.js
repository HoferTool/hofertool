// =================================================================
//  ANGEBOT ALS PDF (Kalkulation, seit 1.214.0)
//  Aufbau wie das Angebot aus dem Gewatec: blauer Kopf mit Logo,
//  Angaben links, Kunde rechts, Teil, eine Zeile je Staffel, dann
//  Bedingungen und Schlusstext. Eigenes Stück, damit jsPDF nur geladen
//  wird, wenn jemand ein Angebot macht.
// =================================================================
import { jsPDF } from "jspdf";
import { alt } from "../bruecke.jsx";
import { chf } from "./kalkulation.js";
import { heuteText, datumText } from "../seiten/Kalkulation.jsx";

const BLAU = [42, 123, 209];

export async function angebotPdf(k, nr, rechnung) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const L = 22, R = 188;

  // Kopf: blaues Band mit weissem Logo und Adresse
  pdf.setFillColor(...BLAU);
  pdf.rect(0, 0, 210, 32, "F");
  if (alt.LOGO_WEISS) {
    try { pdf.addImage(alt.LOGO_WEISS, "PNG", L, 6, 52, 20, undefined, "FAST"); } catch (e) { /* ohne Logo weiter */ }
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text(["Hofer+Co Präzisionsdrehteile AG", "Alte Bernstrasse 24", "CH-4573 Lohn-Ammannsegg"], 110, 14);

  pdf.setTextColor(0, 0, 0);
  let y = 52;
  pdf.setFontSize(16);
  pdf.text("Angebot", L, y);
  pdf.setFontSize(9.5);
  const links = [["Angebots-Nr.", nr || ""], ["Datum", heuteText()]];
  if (k.kopf.sachbearbeiter) links.push(["Sachbearbeiter", k.kopf.sachbearbeiter]);
  let yl = y + 7;
  links.forEach(([a, b]) => { pdf.text(a, L, yl); pdf.text(": " + b, L + 30, yl); yl += 5; });

  // Kunde rechts
  const an = [k.kopf.kunde].concat(String(k.kopf.adresse || "").split("\n")).filter(Boolean);
  pdf.text(an, 120, y - 5);
  let yr = y - 5 + an.length * 5 + 4;
  if (k.kopf.zeichen) { pdf.text("Ihr Zeichen", 120, yr); pdf.text(": " + k.kopf.zeichen, 145, yr); yr += 5; }

  y = Math.max(yl, yr) + 6;
  if (k.kopf.anfrage) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Ihre Anfrage vom " + datumText(k.kopf.anfrage), L, y);
    pdf.setFont("helvetica", "normal");
    y += 8;
  }

  // Teil
  pdf.setDrawColor(0); pdf.setLineWidth(0.3);
  pdf.line(L, y, R, y); y += 6;
  const teil = [["Bezeichnung", k.kopf.bezeichnung], ["Werkstoff", k.material.bez], ["Werkst. Nr.", k.material.nr],
    ["Artikel-Code", k.kopf.artikel], ["Zeichnung", (k.kopf.zeichnung || "") + (k.kopf.index ? " / Index: " + k.kopf.index : "")]]
    .filter(([, w]) => w);
  teil.forEach(([a, b]) => { pdf.text(a, L, y); pdf.text(": " + b, L + 30, y); y += 5; });
  y += 2;

  // Preise, eine Zeile je Staffel
  pdf.line(L, y, R, y); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text("POS", L, y); pdf.text("MENGE", 70, y, { align: "right" }); pdf.text("ME", 74, y);
  pdf.text("Preis (exkl. MwSt.)", 150, y, { align: "right" }); pdf.text("PRO", 170, y);
  pdf.setFont("helvetica", "normal");
  y += 2; pdf.line(L, y, R, y); y += 6;
  rechnung.forEach((r, i) => {
    pdf.text(String(i + 1), L, y);
    pdf.text(chf(r.menge, 0), 70, y, { align: "right" });
    pdf.text("Stk", 74, y);
    pdf.text(chf(r.angebot) + "  CHF", 150, y, { align: "right" });
    pdf.text("1", 172, y);
    y += 6;
  });
  pdf.line(L, y, R, y); y += 14;

  const bed = [["Lieferzeit", k.angebot.lieferzeit], ["Lieferbedingung", k.angebot.lieferbed], ["Zahlungsbedingung", k.angebot.zahlung]]
    .filter(([, w]) => w);
  bed.forEach(([a, b]) => { pdf.text(a, L, y); pdf.text(": " + b, L + 36, y); y += 5; });
  y += 5;
  if (k.angebot.gueltig) {
    const zeilen = pdf.splitTextToSize(k.angebot.gueltig, R - L);
    pdf.text(zeilen, L, y); y += zeilen.length * 5 + 5;
  }
  pdf.text(pdf.splitTextToSize("Ihrem Auftrag, dem wir unsere volle Aufmerksamkeit schenken werden, sehen wir gerne entgegen. "
    + "Für allfällige weitere Fragen stehen wir Ihnen jederzeit zur Verfügung.", R - L), L, y);
  y += 16;
  pdf.text("Mit freundlichen Grüssen", L, y);

  pdf.save("Angebot " + (nr || "") + ".pdf");
}
