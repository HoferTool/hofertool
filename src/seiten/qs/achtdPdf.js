// =================================================================
//  8D-Report als PDF (seit 1.748.0), aufgebaut wie Patricks Bericht
//  vom 23. November 2026: Briefkopf der Firma (blauer Balken wie das
//  Bestellblatt), Lieferant und Kunde, Beanstandung, Artikel und
//  Mengen, dann die Punkte 1 bis 8. Angekreuzte Punkte stehen als
//  Zeilen da, darunter der freie Text. Lädt erst beim Erstellen.
// =================================================================
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { alt } from "../../bruecke.jsx";
import { ACHT_D } from "./Reklamationen.jsx";

const MM = 96 / 25.4;
const BREITE = 210, HOEHE = 297, OBEN = 12, UNTEN = 14;
const esc = (t) => alt.esc(t == null ? "" : String(t));
const leer = (v) => v == null || String(v).trim() === "";
const zl = (t) => esc(t).replace(/\n/g, "<br>");
const datum = (d) => {
  if (!d) return "";
  const t = alt.ausIso(String(d).slice(0, 10));
  return isNaN(t.getTime()) ? String(d) : String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") + "." + t.getFullYear();
};
const zahl = (v) => (leer(v) ? "" : (isNaN(Number(v)) ? String(v) : alt.zahlText(Number(v))));

const HOFER = "Hofer + Co. Präzisionsdrehteile\nAlte Bernstrasse 24\nCH-4573 Lohn-Ammannsegg";

const STIL = `
.rkpdf { font: 9.5pt/1.4 Aptos, "Segoe UI", Arial, sans-serif; color: #1a1f29; background: #fff; }
.rkpdf * { box-sizing: border-box; }
.rkpdf .balken { background: #003884; color: #fff; height: 30mm; padding: 0 9mm;
  display: flex; align-items: center; justify-content: space-between; }
.rkpdf .balken img { height: 21mm; width: auto; display: block; }
.rkpdf .balken img.siegel { height: 22mm; width: 22mm; }
.rkpdf .balken .adresse, .rkpdf .balken .kontakt2 { font-size: 7.5pt; line-height: 1.5; white-space: nowrap; color: #fff; }
.rkpdf .balken .kontakt2 { border-left: .6pt solid rgba(255,255,255,.55); padding-left: 5mm; }
.rkpdf .balken .kontakt2 span { display: inline-block; width: 4mm; opacity: .7; }
.rkpdf .balken .firma, .rkpdf .balken .ort { font-weight: 700; }
.rkpdf .balken .firma { font-size: 8.5pt; }
.rkpdf .inhalt { padding: 8mm 14mm 0; }
.rkpdf h1 { font-size: 20pt; color: #003884; margin: 0 0 4mm; letter-spacing: .02em; }
.rkpdf h2 { font-size: 11pt; color: #003884; margin: 5mm 0 1.5mm; padding-bottom: 1mm; border-bottom: .8pt solid #003884; }
.rkpdf table { width: 100%; border-collapse: collapse; }
.rkpdf td { border: .5pt solid #b9c3d1; padding: 1.4mm 2mm; vertical-align: top; }
.rkpdf td.b { background: #eef2f8; font-weight: 600; width: 38mm; color: #33405a; }
.rkpdf .zwei { display: flex; gap: 4mm; }
.rkpdf .zwei > div { flex: 1; border: .5pt solid #b9c3d1; padding: 2mm 3mm; }
.rkpdf .zwei .titel { font-size: 8pt; font-weight: 700; color: #003884; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1mm; }
.rkpdf p { margin: 0 0 1mm; }
.rkpdf ul { margin: 0 0 1mm; padding-left: 5mm; }
.rkpdf li { margin: 0 0 .5mm; }
.rkpdf .gruppe { font-weight: 700; margin-top: 1mm; }
.rkpdf .frei { white-space: normal; }
.rkpdf .nichts { color: #8a93a3; font-style: italic; }
`;

function briefkopf() {
  return '<div class="balken">'
    + '<img src="' + (alt.LOGO_BRIEF || "./logo-weiss.svg") + '" alt="Hofer + Co.">'
    + '<div class="adresse"><span class="firma">Hofer + Co. Präzisionsdrehteile</span><br>'
    + 'Alte Bernstrasse 24<br><span class="ort">CH-4573 Lohn-Ammannsegg</span></div>'
    + '<div class="kontakt2"><span>T</span>032 677 55 77<br><span>F</span>032 677 55 70<br>'
    + 'admin@hoferco.ch<br>www.hoferco.ch</div>'
    + (alt.SIEGEL_BRIEF ? '<img class="siegel" src="' + alt.SIEGEL_BRIEF + '" alt="ISO 9001">' : "")
    + '</div>';
}

const zeile = (b, w) => '<tr><td class="b">' + esc(b) + "</td><td>" + (w || "") + "</td></tr>";

// Ein Abschnitt 2 bis 7: angekreuzte Punkte je Gruppe, dann der freie Text
function abschnitt(w, a) {
  const l = (w.achtd && Array.isArray(w.achtd[a.s])) ? w.achtd[a.s] : [];
  const bekannt = new Set();
  let h = "";
  for (const [g, punkte] of a.gruppen) {
    punkte.forEach((p) => bekannt.add(p));
    const da = punkte.filter((p) => l.includes(p));
    if (!da.length) continue;
    if (g) h += '<p class="gruppe">' + esc(g) + "</p>";
    h += "<ul>" + da.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>";
  }
  const rest = l.filter((p) => !bekannt.has(p));
  if (rest.length) h += "<ul>" + rest.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>";
  if (!leer(w[a.text])) h += '<p class="frei">' + zl(w[a.text]) + "</p>";
  return "<h2>" + a.nr + " · " + esc(a.titel) + "</h2>" + (h || '<p class="nichts">–</p>');
}

export function achtdHtml(w) {
  const k = w.kopf || {};
  const kunde = w.art !== "lieferant";
  const hofer = '<div class="titel">' + (kunde ? "Lieferant" : "Kunde") + "</div><p>" + zl(HOFER) + "</p>"
    + (leer(k.bearbeiter) ? "" : "<p>Bearbeiter: <b>" + esc(k.bearbeiter) + "</b></p>")
    + (leer(k.tel) ? "" : "<p>Tel.: " + esc(k.tel) + "</p>")
    + (leer(k.mail) ? "" : "<p>Mail: " + esc(k.mail) + "</p>");
  const andere = '<div class="titel">' + (kunde ? "Kunde" : "Lieferant") + "</div>"
    + "<p><b>" + esc(w.partner || (w.art === "intern" ? "Intern" : "")) + "</b></p>"
    + (leer(k.adresse) ? "" : "<p>" + zl(k.adresse) + "</p>")
    + (leer(w.kontakt) ? "" : "<p>Kontakt: " + esc(w.kontakt) + "</p>");
  const zeichnung = [k.zeichnung, k.index].filter((x) => !leer(x)).join(" / ");
  let h = briefkopf() + '<div class="inhalt"><h1>8D-Report</h1>'
    + '<div class="zwei"><div>' + (kunde ? hofer : andere) + "</div><div>" + (kunde ? andere : hofer) + "</div></div>"
    + "<h2>Beanstandung</h2><table>"
    + zeile("Beanstand.-Nr.", "Intern: <b>" + esc(w.nr || "") + "</b>" + (leer(w.ref_partner) ? "" : " · " + (kunde ? "Kunde" : "Lieferant") + ": <b>" + esc(w.ref_partner) + "</b>"))
    + zeile("Eröffnet am", datum(w.eingang))
    + zeile("Berichtsdatum", datum(k.berichtsdatum || alt.isoDatum(new Date())))
    + "</table><h2>Artikel und Mengen</h2><table>"
    + zeile("Artikelbezeichnung", esc(w.teil))
    + zeile("Artikelnummer Hoco", esc(w.hoco_nr))
    + zeile("Zeichnungs-Nr. / Index", esc(zeichnung))
    + zeile("Kunden Art. Nr.", esc(k.kunden_art))
    + zeile("Bestellte Menge", zahl(k.bestellt))
    + zeile("Gelieferte Menge", zahl(w.menge_geliefert))
    + zeile("Beanstandungsmenge", zahl(w.menge_reklamiert))
    + zeile("Retournierte Menge", zahl(k.retour))
    + zeile("Gutteile", zahl(k.gut))
    + zeile("Lieferschein Nr.", esc(k.lieferschein))
    + zeile("Lieferdatum", datum(k.lieferdatum))
    + zeile("Auftrags Nr.", esc(k.auftrag))
    + zeile("Fabrikationsauftrag", esc(w.fa_nr))
    + "</table>"
    + "<h2>1 · Problembeschreibung</h2>" + (leer(w.fehler) ? '<p class="nichts">–</p>' : '<p class="frei">' + zl(w.fehler) + "</p>");
  for (const a of ACHT_D) h += abschnitt(w, a);
  h += "<h2>8 · Bemerkung</h2>" + (leer(w.bemerkung) ? '<p class="nichts">–</p>' : '<p class="frei">' + zl(w.bemerkung) + "</p>");
  return h + "</div>";
}

function trennstellen(blatt) {
  const oben = blatt.getBoundingClientRect().top;
  const s = new Set();
  blatt.querySelectorAll("tr, p, li, .zwei").forEach((x) => {
    const q = x.getBoundingClientRect();
    if (q.height) s.add(Math.ceil(q.bottom - oben) + 1);
  });
  blatt.querySelectorAll("h2").forEach((x) => s.add(Math.floor(x.getBoundingClientRect().top - oben) - 2));
  return [...s].filter((x) => x > 0).sort((a, b) => a - b);
}

export async function achtdPdf(w, fuss) {
  const breite = BREITE * MM;
  const huelle = document.createElement("div");
  huelle.setAttribute("aria-hidden", "true");
  huelle.className = "hell-bleibt";
  huelle.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;background:#fff;overflow:hidden;width:" + breite + "px";
  const blatt = document.createElement("div");
  blatt.className = "rkpdf";
  blatt.style.cssText = "width:" + breite + "px";
  blatt.innerHTML = "<style>" + STIL + "</style>" + achtdHtml(w);
  huelle.appendChild(blatt);
  document.body.appendChild(huelle);
  try {
    try { await document.fonts.ready; } catch (f) { /* dann so */ }
    await Promise.all([...blatt.querySelectorAll("img")].map((b) => b.complete ? null
      : new Promise((ok) => { b.onload = ok; b.onerror = ok; setTimeout(ok, 5000); })));
    const gesamt = Math.max(1, blatt.offsetHeight);
    const stellen = trennstellen(blatt);
    // Seite 1 beginnt ganz oben mit dem Balken, die weiteren mit Rand oben
    const enden = [];
    let ab = 0;
    while (ab < gesamt - 1) {
      const seite = (HOEHE - UNTEN - (enden.length ? OBEN : 0)) * MM;
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
      pdf.addImage(bild.toDataURL("image/jpeg", 0.9), "JPEG", 0, n ? OBEN : 0, BREITE, h / MM);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(130);
      pdf.text(fuss, 14, HOEHE - 7);
      pdf.text("Seite " + (n + 1) + " von " + enden.length, BREITE - 14, HOEHE - 7, { align: "right" });
    }
    pdf.setProperties({ title: fuss, creator: "HoferTool" });
    return pdf.output("blob");
  } finally {
    huelle.remove();
  }
}
