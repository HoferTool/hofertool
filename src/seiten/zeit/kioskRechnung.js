// =================================================================
//  KIOSK-RECHNUNG MIT QR-EINZAHLUNGSSCHEIN (seit 1.816.0, Wunsch
//  Patrick 25. November 2026: „wenn man einmal abrechnen will, kommt
//  eine Rechnung mit QR-Einzahlungsschein zum Zahlen“)
//  Rechnet die Referenz aus der Rechnungsnummer, baut den Inhalt des
//  Swiss QR Code (SPC 0200) und zeichnet ein A4 mit Briefkopf, den
//  Käufen und unten dem Zahlteil mit Empfangsschein nach den Swiss
//  Payment Standards (Empfangsschein 62 mm, Zahlteil 148 mm, 105 mm hoch,
//  QR 46 mm mit Schweizerkreuz 7 mm). Die IBAN steht nur in der
//  Datenbank (kiosk_konto), nie hier.
// =================================================================
import { jsPDF } from "jspdf";
import { BRIEF_HOEHE, briefkopfAufSeite } from "../../teile/briefkopf.js";

export const rechnungNr = (nr) => "KI-" + nr;

export const ibanSauber = (iban) => String(iban || "").replace(/\s+/g, "").toUpperCase();

// IBAN prüfen (nur CH und LI, wie es die QR-Rechnung verlangt)
export function ibanGut(iban) {
  const i = ibanSauber(iban);
  if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(i)) return false;
  return mod97(i.slice(4) + i.slice(0, 4)) === 1;
}

// QR-IBAN: Institut-Nummer 30000–31999, dann braucht es eine QR-Referenz
export function istQrIban(iban) {
  const iid = Number(ibanSauber(iban).slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}

function mod97(text) {
  let rest = 0;
  for (const z of text) {
    const w = /[A-Z]/.test(z) ? String(z.charCodeAt(0) - 55) : z;
    for (const c of w) rest = (rest * 10 + Number(c)) % 97;
  }
  return rest;
}

// Prüfziffer Modulo 10 rekursiv (QR-Referenz, wie beim alten ESR)
function mod10(ziffern) {
  const T = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let u = 0;
  for (const c of ziffern) u = T[(u + Number(c)) % 10];
  return String((10 - u) % 10);
}

// Referenz: mit normaler IBAN keine (NON), bezahlt wird auf Vertrauen,
// die Rechnungsnummer steht in der Mitteilung (Wunsch Patrick 25. November 2026:
// „es braucht keine Referenz“). Nur eine QR-IBAN verlangt nach der Norm eine
// QR-Referenz (27 Ziffern aus der Rechnungsnummer).
export function referenz(iban, nr) {
  if (istQrIban(iban)) {
    const r = String(nr).padStart(26, "0");
    return { typ: "QRR", ref: r + mod10(r) };
  }
  return { typ: "NON", ref: "" };
}

// Referenz lesbar in Fünfer- bzw. Vierergruppen
export function referenzText(r) {
  if (r.typ === "NON") return "";
  if (r.typ === "QRR") return r.ref.slice(0, 2) + " " + r.ref.slice(2).replace(/(.{5})/g, "$1 ").trim();
  return r.ref.replace(/(.{4})/g, "$1 ").trim();
}

const ibanText = (i) => ibanSauber(i).replace(/(.{4})/g, "$1 ").trim();
export const betragText = (b) => {
  const [g, r] = Number(b || 0).toFixed(2).split(".");
  return g.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + r;
};

// Inhalt des Swiss QR Code, Zeile für Zeile nach SPC 0200
export function qrInhalt(konto, betrag, ref, mitteilung) {
  const k = konto || {};
  const zeilen = [
    "SPC", "0200", "1", ibanSauber(k.iban),
    "S", k.name || "", k.strasse || "", k.hausnr || "", k.plz || "", k.ort || "", k.land || "CH",
    "", "", "", "", "", "", "",
    Number(betrag).toFixed(2), "CHF",
    "", "", "", "", "", "", "",
    ref.typ, ref.ref, String(mitteilung || "").slice(0, 140), "EPD",
  ];
  return zeilen.join("\r\n");
}

// Was am Konto für den Schein fehlt (leer = gut)
export function kontoFehlt(k) {
  const f = [];
  if (!ibanGut(k && k.iban)) f.push("IBAN");
  if (!(k && k.name)) f.push("Name");
  if (!(k && k.plz) || !(k && k.ort)) f.push("PLZ und Ort");
  return f;
}

async function qrZeichnen(pdf, inhalt, x, y, gr) {
  const { default: qrcode } = await import("qrcode-generator");
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const qr = qrcode(0, "M");
  qr.addData(inhalt, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const m = gr / n;
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let e = c;
      while (e < n && qr.isDark(r, e)) e++;
      pdf.rect(x + c * m, y + r * m, (e - c) * m + 0.01, m + 0.01, "F");
      c = e;
    }
  }
  // Schweizerkreuz in der Mitte: weisser Rand, schwarzes Feld, weisses Kreuz
  const kx = x + gr / 2, ky = y + gr / 2;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(kx - 3.5, ky - 3.5, 7, 7, "F");
  pdf.setFillColor(0, 0, 0);
  pdf.rect(kx - 2.9, ky - 2.9, 5.8, 5.8, "F");
  pdf.setFillColor(255, 255, 255);
  const lang = 3.6, breit = 1.1;
  pdf.rect(kx - breit / 2, ky - lang / 2, breit, lang, "F");
  pdf.rect(kx - lang / 2, ky - breit / 2, lang, breit, "F");
}

// Leeres Feld mit Eckmarken für „Zahlbar durch“ und „Betrag“
function ecken(pdf, x, y, b, h) {
  const l = 3;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.25);
  pdf.line(x, y, x + l, y); pdf.line(x, y, x, y + l);
  pdf.line(x + b, y, x + b - l, y); pdf.line(x + b, y, x + b, y + l);
  pdf.line(x, y + h, x + l, y + h); pdf.line(x, y + h, x, y + h - l);
  pdf.line(x + b, y + h, x + b - l, y + h); pdf.line(x + b, y + h, x + b, y + h - l);
}

function adresse(k) {
  return [k.name, [k.strasse, k.hausnr].filter(Boolean).join(" "), [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean);
}

// Zahlteil und Empfangsschein unten auf der aktuellen Seite
async function zahlteil(pdf, konto, betrag, ref, mitteilung) {
  const y0 = 297 - 105;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.2);
  pdf.setLineDashPattern([1, 1], 0);
  pdf.line(0, y0, 210, y0);
  pdf.line(62, y0, 62, 297);
  pdf.setLineDashPattern([], 0);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(0);
  pdf.text("Vor der Einzahlung abzutrennen", 105, y0 - 1.5, { align: "center" });
  const adr = adresse(konto);
  const zeilen = (x, y, titel, werte, tg, wg, abst) => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(tg); pdf.text(titel, x, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(wg);
    let yy = y + abst;
    for (const w of werte) { pdf.text(w, x, yy); yy += abst; }
    return yy + abst * 0.6;
  };

  // Empfangsschein
  let x = 5, y = y0 + 9;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Empfangsschein", x, y0 + 9);
  y = y0 + 16;
  y = zeilen(x, y, "Konto / Zahlbar an", [ibanText(konto.iban), ...adr], 6, 8, 3.5);
  if (ref.typ !== "NON") y = zeilen(x, y, "Referenz", [referenzText(ref)], 6, 8, 3.5);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6); pdf.text("Zahlbar durch (Name/Adresse)", x, y);
  ecken(pdf, x, y + 1.5, 52, 20);
  y = y0 + 73;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6);
  pdf.text("Währung", x, y); pdf.text("Betrag", x + 14, y);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
  pdf.text("CHF", x, y + 4); pdf.text(betragText(betrag), x + 14, y + 4);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6);
  pdf.text("Annahmestelle", 57, y0 + 87, { align: "right" });

  // Zahlteil
  x = 67;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Zahlteil", x, y0 + 9);
  await qrZeichnen(pdf, qrInhalt(konto, betrag, ref, mitteilung), x, y0 + 17, 46);
  y = y0 + 73;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
  pdf.text("Währung", x, y); pdf.text("Betrag", x + 16, y);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  pdf.text("CHF", x, y + 5); pdf.text(betragText(betrag), x + 16, y + 5);
  x = 118; y = y0 + 9;
  y = zeilen(x, y, "Konto / Zahlbar an", [ibanText(konto.iban), ...adr], 8, 10, 4.2);
  if (ref.typ !== "NON") y = zeilen(x, y, "Referenz", [referenzText(ref)], 8, 10, 4.2);
  if (mitteilung) {
    const teile = pdf.splitTextToSize(String(mitteilung), 87);
    y = zeilen(x, y, "Zusätzliche Informationen", teile.slice(0, 2), 8, 10, 4.2);
  }
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("Zahlbar durch (Name/Adresse)", x, y);
  ecken(pdf, x, y + 1.5, 65, 25);
}

const chf = (b) => Number(b || 0).toFixed(2);
const datum = (d) => {
  const t = new Date(d);
  return String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") + "." + t.getFullYear();
};

// Ganze Rechnung als PDF (Blob). r = Rechnung, kaeufe = ihre Buchungen,
// person = Name der Person, konto = kiosk_konto.daten
export async function rechnungPdf({ r, kaeufe, person, konto }) {
  const k = konto || {};
  const ref = referenz(k.iban, r.nr);
  const mitteilung = "Kiosk " + rechnungNr(r.nr) + " " + (person || "");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  await briefkopfAufSeite(pdf, 210);
  let y = BRIEF_HOEHE + 14;
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
  pdf.text(String(person || ""), 20, y);
  pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text("Lohn-Ammannsegg, " + datum(r.erstellt_am), 190, y, { align: "right" });
  y += 14;
  pdf.setTextColor(0); pdf.setFont("helvetica", "bold"); pdf.setFontSize(18);
  pdf.text("Kiosk-Rechnung " + rechnungNr(r.nr), 20, y);
  y += 7;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text("Deine Käufe im Kiosk über HOFERTIME. Bitte mit dem QR-Einzahlungsschein unten bezahlen.", 20, y);
  y += 10;

  const kopf = () => {
    pdf.setFillColor(238, 243, 249); pdf.rect(20, y - 4.5, 170, 7, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(0, 56, 132);
    pdf.text("Datum", 22, y); pdf.text("Artikel", 46, y);
    pdf.text("Menge", 140, y, { align: "right" }); pdf.text("Preis", 162, y, { align: "right" });
    pdf.text("Betrag CHF", 188, y, { align: "right" });
    y += 7;
  };
  kopf();
  pdf.setFont("helvetica", "normal"); pdf.setTextColor(0);
  const liste = [...(kaeufe || [])].sort((a, b) => String(a.am).localeCompare(String(b.am)));
  // Platz unten für Summe und Zahlteil
  const unten = 297 - 105 - 22;
  for (const b of liste) {
    if (y > 297 - 20) {
      pdf.addPage("a4", "portrait"); await briefkopfAufSeite(pdf, 210);
      y = BRIEF_HOEHE + 14; kopf(); pdf.setFont("helvetica", "normal"); pdf.setTextColor(0);
    }
    pdf.setFontSize(9);
    pdf.text(datum(b.am), 22, y);
    pdf.text(pdf.splitTextToSize(String(b.name || ""), 88)[0], 46, y);
    pdf.text(String(b.menge || 1), 140, y, { align: "right" });
    pdf.text(chf(b.preis), 162, y, { align: "right" });
    pdf.text(chf(Number(b.preis) * Number(b.menge || 1)), 188, y, { align: "right" });
    pdf.setDrawColor(225); pdf.setLineWidth(0.1); pdf.line(20, y + 1.8, 190, y + 1.8);
    y += 5.6;
  }
  if (y > unten) { pdf.addPage("a4", "portrait"); await briefkopfAufSeite(pdf, 210); y = BRIEF_HOEHE + 14; }
  y += 2;
  pdf.setDrawColor(0, 56, 132); pdf.setLineWidth(0.4); pdf.line(120, y, 190, y);
  y += 6;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(0, 56, 132);
  pdf.text("Total CHF", 140, y); pdf.text(chf(r.betrag), 188, y, { align: "right" });
  pdf.setTextColor(0);
  await zahlteil(pdf, k, r.betrag, ref, mitteilung);
  pdf.setProperties({ title: "Kiosk-Rechnung " + rechnungNr(r.nr), creator: "HOFERTIME" });
  return pdf.output("blob");
}

// QR-Code allein als SVG (für die Anzeige im Handy)
export async function qrSvg(konto, r, person) {
  const { default: qrcode } = await import("qrcode-generator");
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const qr = qrcode(0, "M");
  qr.addData(qrInhalt(konto, r.betrag, referenz(konto.iban, r.nr), "Kiosk " + rechnungNr(r.nr) + " " + (person || "")), "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}
