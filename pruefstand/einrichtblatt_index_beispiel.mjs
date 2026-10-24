// Baut ein erfundenes Werkzeug-Protokoll wie beim Index für den
// Prüfstand (einrichtblatt_app.py): dreimal T1 bis T10, je einmal für
// Revolver 1, 2 und 3, jeder Platz eine Spalte breit, links der Kopf
// ohne Programm-Nr. Keine echten Kundendaten.
// Aufruf aus dem Hauptordner: node pruefstand/einrichtblatt_index_beispiel.mjs
import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Tabelle1");
ws.getCell("A1").value = "Werkzeug- Protokoll-Index";
const SP = ["C", "D", "E", "F", "G"];
[[2, 10], [18, 24], [31, 37]].forEach(([oben, unten], r) => {
  [oben, unten].forEach((zeile, h) => SP.forEach((s, i) => {
    const t = h * 5 + i + 1;
    ws.getCell(s + zeile).value = "T" + t;
    ws.getCell(s + (zeile + 2)).value = "R" + (r + 1) + " Tät " + t;
    if (t === 3) ws.getCell(s + (zeile + 5)).value = "Werkzeug R" + (r + 1);
  }));
});
const kopf = [["Ho&Co. Nr:", "10000-0301"], ["Fabrik.-Auftr. Nr.:", "FA-4711"], ["Artikel Bezeich:", "Hülse Muster"],
  ["Index:", "C"], ["Autom.-Nr/Typ:", "Index Nr.3"], ["Prod.- Zeit:", "12 Sek./Stk."],
  ["Festanschlag Länge:", "55.5"], ["Anschlag von:", "Revolver 2"]];
// Der Kopf steht links neben den Plätzen, wie im Index-Excel
kopf.forEach((k, i) => { ws.getCell(3 + i, 1).value = k[0]; ws.getCell(3 + i, 2).value = k[1]; });
await wb.xlsx.writeFile(new URL("./einrichtblatt-index-beispiel.xlsx", import.meta.url));
console.log("ok");
