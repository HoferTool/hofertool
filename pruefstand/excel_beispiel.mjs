// Baut die Beispiel-Einrichtblätter für den Prüfstand (excel_ansicht.py):
// einrichtblatt-beispiel.xlsx mit Schrift, Farben, Rahmen, verbundenen
// Zellen, Bild und zwei Blättern, dazu dieselben Werte als altes .xls.
// Aufruf aus dem Hauptordner: node pruefstand/excel_beispiel.mjs
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";

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
ws.getCell("D12").value = "Summe"; ws.getCell("D12").font = { italic: true };
ws.getCell("E12").value = { formula: "SUM(E8:E10)", result: 4700 }; ws.getCell("E12").numFmt = "#,##0";
ws.getCell("E12").font = { bold: true, color: { argb: "FFC00000" } };
ws.getCell("A14").value = { richText: [{ text: "Achtung: ", font: { bold: true, color: { argb: "FFC00000" } } }, { text: "Masse nach Zeichnung prüfen" }] };
const bild = wb.addImage({ buffer: readFileSync("public/logo.png"), extension: "png" });
ws.addImage(bild, { tl: { col: 4, row: 3 }, br: { col: 6, row: 5.5 }, editAs: "oneCell" });

const w2 = wb.addWorksheet("Werkzeuge");
w2.getCell("A1").value = "Platz"; w2.getCell("B1").value = "Artikel"; w2.getCell("A1").font = { bold: true };
w2.getCell("A2").value = "T01"; w2.getCell("B2").value = "VCGT 160404";
w2.getCell("C2").value = 0.25; w2.getCell("C2").numFmt = "0%";
const w3 = wb.addWorksheet("Versteckt"); w3.state = "hidden"; w3.getCell("A1").value = "geheim";

await wb.xlsx.writeFile("pruefstand/einrichtblatt-beispiel.xlsx");

const alt = XLSX.utils.book_new();
const blatt = XLSX.utils.aoa_to_sheet([["Einrichtblatt alt"], [], ["Pos", "Werkzeug", "Drehzahl"],
  [1, "Längsdrehmeissel", 3200], [2, "Abstechstahl", 2800]]);
blatt["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
blatt["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 10 }];
XLSX.utils.book_append_sheet(alt, blatt, "Blatt1");
writeFileSync("pruefstand/einrichtblatt-alt.xls", XLSX.write(alt, { type: "buffer", bookType: "biff8" }));
console.log("geschrieben");
