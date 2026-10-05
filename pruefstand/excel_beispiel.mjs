// Baut die Beispiel-Einrichtblätter für den Prüfstand (excel_ansicht.py):
// einrichtblatt-beispiel.xlsx mit Schrift, Farben, Rahmen, verbundenen
// Zellen, Bild und zwei Blättern, dazu dieselben Werte als altes .xls.
// Aufruf aus dem Hauptordner: node pruefstand/excel_beispiel.mjs
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Einrichtblatt", { views: [{ showGridLines: false }] });
ws.columns = [{ width: 8 }, { width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }];
ws.mergeCells("A1:D2");
const t = ws.getCell("A1");
t.value = "Einrichtblatt 10844-0049";
t.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003884" } };
t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
ws.getRow(1).height = 22; ws.getRow(2).height = 22;
ws.mergeCells("E1:F1"); ws.getCell("E1").value = "Maschine: SW-20";
ws.getCell("E1").font = { bold: true }; ws.getCell("E1").alignment = { horizontal: "right" };
ws.mergeCells("E2:F2"); ws.getCell("E2").value = new Date(Date.UTC(2026, 9, 5));
ws.getCell("E2").numFmt = "dd.mm.yyyy"; ws.getCell("E2").alignment = { horizontal: "right" };
ws.getCell("A4").value = "Material"; ws.getCell("B4").value = "1.4305 V2A Ø 12 h9";
ws.getCell("A5").value = "Menge"; ws.getCell("B5").value = 12500; ws.getCell("B5").numFmt = "#,##0 \"Stk\"";
ws.getCell("B5").alignment = { horizontal: "left" };
const kopf = ["Pos", "Werkzeug", "Drehzahl", "Vorschub", "Standzeit", "Bemerkung"];
ws.getRow(7).values = kopf;
ws.getRow(7).eachCell((c) => {
  c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 4, tint: 0.6 } };
  c.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
});
const zeilen = [
  [1, "Längsdrehmeissel VCGT 1604", 3200, 0.08, 1500, "Schlichten, Kühlung voll"],
  [2, "Abstechstahl 2 mm", 2800, 0.035, 800, "Langer Text, der umbrechen muss, weil er nicht in die Zelle passt"],
  [3, "Bohrer Ø 4.2 HSS", 4500, 0.06, 2400, ""],
];
zeilen.forEach((z, i) => {
  const r = ws.getRow(8 + i); r.values = z;
  r.getCell(3).numFmt = "#,##0"; r.getCell(4).numFmt = "0.000"; r.getCell(5).numFmt = "#,##0";
  r.getCell(6).alignment = { wrapText: true, vertical: "top" };
  r.eachCell({ includeEmpty: true }, (c, n) => { if (n <= 6) c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; });
});
ws.getRow(9).height = 32;
// Zeile ohne Wert, nur mit Rahmen (exceljs liess solche Zeilen beim
// Lesen weg, die Linien fehlten im Werkzeugprotokoll 10332-0762)
for (let c = 1; c <= 6; c++) ws.getCell(11, c).border = { bottom: { style: "medium" }, left: { style: "thin" } };
ws.getCell("D12").value = "Summe"; ws.getCell("D12").font = { italic: true };
ws.getCell("E12").value = { formula: "SUM(E8:E10)", result: 4700 }; ws.getCell("E12").numFmt = "#,##0";
ws.getCell("E12").font = { bold: true, color: { argb: "FFC00000" } };
ws.getCell("A14").value = { richText: [{ text: "Achtung: ", font: { bold: true, color: { argb: "FFC00000" } } }, { text: "Masse nach Zeichnung prüfen" }] };
const bild = wb.addImage({ buffer: readFileSync("public/logo.png"), extension: "png" });
ws.addImage(bild, { tl: { col: 4, row: 3 }, br: { col: 6, row: 5.5 }, editAs: "oneCell" });

// Werkzeugbild wie aus dem Katalog: links rot, rechts weiss. In Excel
// ist es zugeschnitten (nur die linke Hälfte, srcRect) und Weiss ist
// durchsichtig gesetzt (clrChange). Beides baut unten der Nachtrag ein.
const werkzeug = wb.addImage({ buffer: pngBauen(40, 20, (x) => (x < 20 ? [200, 0, 0] : [255, 255, 255])), extension: "png" });
ws.addImage(werkzeug, { tl: { col: 0, row: 14 }, br: { col: 1, row: 16 }, editAs: "oneCell" });

// Druckeinstellung wie ein echtes Einrichtblatt: A4 quer, eine Seite
ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
  printArea: "A1:F16", margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };

const w2 = wb.addWorksheet("Werkzeuge");
w2.getCell("A1").value = "Platz"; w2.getCell("B1").value = "Artikel"; w2.getCell("A1").font = { bold: true };
w2.getCell("A2").value = "T01"; w2.getCell("B2").value = "VCGT 160404";
w2.getCell("C2").value = 0.25; w2.getCell("C2").numFmt = "0%";
const w3 = wb.addWorksheet("Versteckt"); w3.state = "hidden"; w3.getCell("A1").value = "geheim";

// Nachtrag: exceljs kann Zuschneiden und „Farbe transparent setzen“
// nicht schreiben, also direkt in die Zeichnung des ersten Blattes
const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
const zPfad = Object.keys(zip.files).find((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
let z = await zip.file(zPfad).async("string");
const teile = z.split("<xdr:pic>");
// Das zweite Bild im Blatt ist das Werkzeug
teile[2] = teile[2]
  .replace(/(<a:blip[^>]*?)\/>/, '$1><a:clrChange><a:clrFrom><a:srgbClr val="FFFFFF"/></a:clrFrom><a:clrTo><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:clrTo></a:clrChange></a:blip>')
  .replace(/<a:stretch>/, '<a:srcRect r="50000"/><a:stretch>');
z = teile.join("<xdr:pic>");
// Textfeld wie die HD-Kästchen im Werkzeugprotokoll: Rand und Füllung
// aus dem Formstil, Text fett, dazu „mm²“ mit hochgestellter 2
z = z.replace("</xdr:wsDr>", '<xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
  + '<xdr:ext cx="900000" cy="220000"/><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="90" name="Textfeld 1"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>'
  + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="220000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
  + '<xdr:style><a:lnRef idx="2"><a:srgbClr val="C00000"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="lt1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent2"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="dk1"/></a:fontRef></xdr:style>'
  + '<xdr:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="de-CH" sz="1200" b="1"/><a:t>HD</a:t></a:r>'
  + '<a:r><a:rPr lang="de-CH" sz="1000"/><a:t> 4 mm</a:t></a:r><a:r><a:rPr lang="de-CH" sz="1000" baseline="30000"/><a:t>2</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>');
if (!z.includes("srcRect") || !z.includes("clrChange") || !z.includes("Textfeld 1")) throw new Error("Nachtrag ging nicht");
zip.file(zPfad, z);
writeFileSync("pruefstand/einrichtblatt-beispiel.xlsx", await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

const alt = XLSX.utils.book_new();
const blatt = XLSX.utils.aoa_to_sheet([["Einrichtblatt alt"], [], ["Pos", "Werkzeug", "Drehzahl"],
  [1, "Längsdrehmeissel", 3200], [2, "Abstechstahl", 2800]]);
blatt["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
blatt["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 10 }];
XLSX.utils.book_append_sheet(alt, blatt, "Blatt1");
writeFileSync("pruefstand/einrichtblatt-alt.xls", XLSX.write(alt, { type: "buffer", bookType: "biff8" }));
console.log("geschrieben");

// Kleines PNG ohne Bibliothek: farbe(x, y) → [r, g, b]
function pngBauen(b, h, farbe) {
  const roh = Buffer.alloc((b * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const [r, g, bl] = farbe(x, y), i = y * (b * 3 + 1) + 1 + x * 3;
    roh[i] = r; roh[i + 1] = g; roh[i + 2] = bl;
  }
  const crc = (buf) => { let c = ~0; for (const v of buf) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const stueck = (typ, daten) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(daten.length);
    const td = Buffer.concat([Buffer.from(typ), daten]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const kopf = Buffer.alloc(13); kopf.writeUInt32BE(b, 0); kopf.writeUInt32BE(h, 4); kopf[8] = 8; kopf[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), stueck("IHDR", kopf),
    stueck("IDAT", deflateSync(roh)), stueck("IEND", Buffer.alloc(0))]);
}
