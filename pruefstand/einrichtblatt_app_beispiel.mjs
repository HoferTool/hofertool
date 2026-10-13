// Baut ein erfundenes Werkzeug-Protokoll wie beim SW-20 für den
// Prüfstand (einrichtblatt_app.py). Keine echten Kundendaten.
// Aufruf aus dem Hauptordner: node pruefstand/einrichtblatt_app_beispiel.mjs
import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Tabelle1");
ws.getCell("A1").value = "Werkzeug- Protokoll-SR32J";
const platz = (zelle, w) => {
  const c = ws.getCell(zelle); c.value = w.nr;
  const s = c.col, z = Number(c.row);
  const setz = (dz, v) => { if (v !== undefined) ws.getCell(z + dz, s).value = v; };
  setz(1, w.standzeit); setz(2, w.taetigkeit); setz(3, w.mass); setz(5, w.hersteller); setz(6, w.werkzeug);
};
platz("A3", { nr: "T100", standzeit: 1000, taetigkeit: "Abstechen", hersteller: "Vischer & Bolli AG", werkzeug: "Art.MTEC-452410" });
platz("C3", { nr: "T200", taetigkeit: "Bohren", mass: "Ø4.20", hersteller: "Muster AG", werkzeug: "HSS Bohrer 4.2" });
platz("E3", { nr: "T3100", taetigkeit: "Gewinde formen", mass: "M5", werkzeug: "Former M5" });
const kopf = [["Programm Path 1:", "O1111"], ["Programm Path 3:", "O3333"], ["Ho&Co. Nr:", "10000-0301"],
  ["Artikel Bezeich:", "Deckel Muster"], ["Zeichnungs Nr:", "416.4638.01"], ["Index:", "B"],
  ["Autom.-Typ / Nr:", "SR32J", "Nr.7"], ["Material:", "CW400J Ø20h9"], ["Prod.- Zeit:", "33 Sek./Stk."],
  ["Waschgebinde:", "Typ 2 fein"], ["Masch.- Laufzeit:", "40 Stk. am Abend"]];
kopf.forEach((k, i) => { ws.getCell(12 + i, 1).value = k[0]; ws.getCell(12 + i, 3).value = k[1]; if (k[2]) ws.getCell(12 + i, 4).value = k[2]; });
ws.getCell(12 + kopf.length + 1, 1).value = "Abgreifen mit Schnabelzange";
await wb.xlsx.writeFile(new URL("./einrichtblatt-app-beispiel.xlsx", import.meta.url));
console.log("ok");
