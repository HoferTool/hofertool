// =================================================================
//  EXCEL LESEN
//  Macht aus einer Excel-Datei (Einrichtblatt) ein einfaches Modell,
//  das ExcelAnsicht zeichnet: Spaltenbreiten und Zeilenhöhen in
//  Pixeln, Zellen mit Text und Gestaltung, verbundene Zellen,
//  Rahmenlinien und Bilder.
//
//  .xlsx/.xlsm liest exceljs, das auch Schrift, Farben und Rahmen
//  kennt. Alte .xls und .ods liest SheetJS; das kennt nur Werte,
//  verbundene Zellen und Breiten, sieht also schlichter aus. Beide
//  Bibliotheken kommen erst beim ersten Öffnen dazu, damit der Start
//  der App klein bleibt.
// =================================================================

const ENDUNG = /\.(xlsx|xlsm|xls|ods)(\?|#|$)/i;
export const istExcel = (name) => ENDUNG.test(String(name || ""));

// Grenzen, damit eine Datei mit einer verirrten Zelle in Zeile 60'000
// das Tablet nicht lahmlegt
const MAX_ZEILEN = 1500, MAX_SPALTEN = 120;
const PX_JE_PT = 96 / 72;

export async function excelLesen(daten) {
  // Am Anfang der Datei steht, was sie ist: „PK“ = neues Format (zip),
  // D0 CF 11 E0 = altes .xls
  const zip = daten[0] === 0x50 && daten[1] === 0x4b;
  if (zip) {
    try { return await mitExcelJS(daten); }
    catch (f) { /* z. B. .ods: dann mit SheetJS */ }
  }
  // Weder zip noch altes .xls: SheetJS würde sonst jeden Text als
  // Tabelle lesen, auch eine Fehlerseite des Servers
  const ole = daten[0] === 0xd0 && daten[1] === 0xcf && daten[2] === 0x11 && daten[3] === 0xe0;
  if (!zip && !ole) throw new Error("Keine Excel-Datei");
  return mitSheetJS(daten);
}

// ---------- Farben ----------

// Die alte Excel-Palette (indexierte Farben)
const INDEXIERT = ("000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
  + "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
  + "800000 008000 000080 808000 800080 008080 C0C0C0 808080 "
  + "9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF "
  + "000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF "
  + "00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 "
  + "3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 "
  + "003366 339966 003300 333300 993300 993366 333399 333333 000000 FFFFFF").split(" ");

// Office-Standard, falls die Datei kein eigenes Farbschema mitbringt
const THEMA_STANDARD = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31",
  "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];

function themaLesen(wb) {
  const xml = wb && wb._themes && wb._themes.theme1;
  if (typeof xml !== "string") return THEMA_STANDARD;
  const gefunden = {};
  const re = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>\s*<a:(?:srgbClr val|sysClr[^>]*?lastClr)="([0-9A-Fa-f]{6})"/g;
  let m;
  while ((m = re.exec(xml))) gefunden[m[1]] = m[2].toUpperCase();
  // Excel zählt hell vor dunkel: 0 = lt1, 1 = dk1, 2 = lt2, 3 = dk2
  const reihe = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3",
    "accent4", "accent5", "accent6", "hlink", "folHlink"];
  return reihe.map((k, i) => gefunden[k] || THEMA_STANDARD[i]);
}

// Aufhellen/Abdunkeln wie Excel: über die Helligkeit im HLS-Raum
function toenen(hex, tint) {
  let r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255,
    b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const f = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
  }
  const x = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return x(r) + x(g) + x(b);
}

function farbe(c, thema) {
  if (!c) return null;
  let hex = null;
  if (c.argb) hex = String(c.argb).slice(-6);
  else if (c.theme != null) hex = thema[c.theme];
  else if (c.indexed != null) hex = INDEXIERT[c.indexed];
  if (!hex || !/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  if (c.tint) hex = toenen(hex, c.tint);
  return "#" + hex;
}

// ---------- Zahlen und Daten ----------

const MONATE = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
const MONATE_LANG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];

// Abschnitte eines Zahlenformats trennen, ohne „;“ in Anführungszeichen
function abschnitte(fmt) {
  const aus = []; let jetzt = "", inText = false;
  for (let i = 0; i < fmt.length; i++) {
    const z = fmt[i];
    if (z === '"') inText = !inText;
    if (z === "\\" && !inText) { jetzt += z + (fmt[i + 1] || ""); i++; continue; }
    if (z === ";" && !inText) { aus.push(jetzt); jetzt = ""; continue; }
    jetzt += z;
  }
  aus.push(jetzt);
  return aus;
}

const ohneText = (f) => f.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, "");
const istDatumFormat = (f) => { const g = ohneText(f); return /[dmyhs]/i.test(g) && !/[0#?]/.test(g); };

function seriellZuDatum(v) { return new Date(Math.round((v - 25569) * 86400000)); }

function datumText(d, f) {
  const g = ohneText(f).toLowerCase();
  const zwei = (n) => String(n).padStart(2, "0");
  const teile = [];
  const mitDatum = /[dy]/.test(g) || (/m/.test(g) && !/[hs]/.test(g));
  if (mitDatum) {
    const tag = d.getUTCDate(), mon = d.getUTCMonth(), jahr = d.getUTCFullYear();
    const jahrText = /yyy/.test(g) || !/y/.test(g) ? String(jahr) : zwei(jahr % 100);
    if (/mmmm/.test(g)) teile.push(tag + ". " + MONATE_LANG[mon] + (/y/.test(g) ? " " + jahrText : ""));
    else if (/mmm/.test(g)) teile.push(tag + ". " + MONATE[mon] + (/y/.test(g) ? " " + jahrText : ""));
    else teile.push(zwei(tag) + "." + zwei(mon + 1) + (/y/.test(g) ? "." + jahrText : "."));
  }
  if (/h/.test(g) || (/s/.test(g) && !mitDatum)) {
    teile.push(zwei(d.getUTCHours()) + ":" + zwei(d.getUTCMinutes())
      + (/s/.test(g) ? ":" + zwei(d.getUTCSeconds()) : ""));
  }
  return teile.join(" ") || d.toISOString().slice(0, 10);
}

function allgemein(v) {
  if (Number.isInteger(v)) return String(v);
  return String(parseFloat(v.toPrecision(10)));
}

// Zahl wie im Format: Nachkommastellen, Tausender mit Apostroph
// (Schweizer Schreibweise), Prozent, Text davor und danach
export function zahlText(wert, fmt) {
  if (wert == null) return "";
  if (wert instanceof Date) return datumText(wert, fmt || "dd.mm.yyyy");
  if (typeof wert === "boolean") return wert ? "WAHR" : "FALSCH";
  if (typeof wert !== "number") return String(wert);
  if (!fmt || /^(general|standard)$/i.test(fmt) || fmt === "@") return allgemein(wert);
  const ab = abschnitte(fmt);
  let f = ab[0], v = wert, minus = wert < 0;
  if (wert < 0 && ab[1] != null && ab[1] !== "") { f = ab[1]; v = -wert; minus = false; }
  else if (wert === 0 && ab[2] != null && ab[2] !== "") f = ab[2];
  if (istDatumFormat(f)) return datumText(seriellZuDatum(v), f);
  if (/E[+-]/i.test(ohneText(f))) return allgemein(wert);

  // Zeichen für Zeichen: Text davor, Zahlenkern, Text danach
  let vor = "", kern = "", nach = "", prozent = false;
  for (let i = 0; i < f.length; i++) {
    const z = f[i];
    let text = null;
    if (z === '"') { const e = f.indexOf('"', i + 1); text = f.slice(i + 1, e < 0 ? f.length : e); i = e < 0 ? f.length : e; }
    else if (z === "\\") { text = f[i + 1] || ""; i++; }
    else if (z === "[") { const e = f.indexOf("]", i); i = e < 0 ? f.length : e; continue; }
    else if (z === "_") { text = " "; i++; }
    else if (z === "*") { i++; continue; }
    else if ("#0?,.".includes(z) && !nach) { kern += z; continue; }
    else if (z === "%") { prozent = true; text = "%"; }
    else text = z;
    if (kern) nach += text; else vor += text;
  }
  if (!kern) return vor + nach;
  if (prozent) v *= 100;
  const [ganz, komma = ""] = kern.split(".");
  const stellen = (komma.match(/[0#?]/g) || []).length;
  const mindest = (komma.match(/0/g) || []).length;
  let s = Math.abs(v).toFixed(stellen);
  if (stellen > mindest) {
    // „#“ hinten: Nullen fallen weg, bis zur Mindestzahl
    let [g, k = ""] = s.split(".");
    while (k.length > mindest && k.endsWith("0")) k = k.slice(0, -1);
    s = k ? g + "." + k : g;
  }
  if (/,/.test(ganz.replace(/,+$/, ""))) {
    const [g, k] = s.split(".");
    s = g.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (k != null ? "." + k : "");
  }
  if (!/0/.test(ganz) && /^0(\.|$)/.test(s)) s = s.replace(/^0/, "");
  return (minus && v !== 0 ? "-" : "") + vor + s + nach;
}

// ---------- Schrift, Füllung, Ausrichtung ----------

function schriftStil(font, thema) {
  const s = {};
  if (!font) return s;
  if (font.name) s.fontFamily = '"' + font.name + '", Calibri, Carlito, Arial, sans-serif';
  if (font.size) s.fontSize = Math.round(font.size * PX_JE_PT * 10) / 10 + "px";
  if (font.bold) s.fontWeight = 700;
  if (font.italic) s.fontStyle = "italic";
  const deko = [];
  if (font.underline) deko.push("underline");
  if (font.strike) deko.push("line-through");
  if (deko.length) s.textDecoration = deko.join(" ");
  const c = farbe(font.color, thema);
  if (c) s.color = c;
  if (font.vertAlign === "superscript") s.verticalAlign = "super";
  if (font.vertAlign === "subscript") s.verticalAlign = "sub";
  return s;
}

const RAHMEN = {
  thin: [1, "solid"], hair: [1, "dotted"], dotted: [1, "dotted"], dashed: [1, "dashed"],
  dashDot: [1, "dashed"], dashDotDot: [1, "dotted"], medium: [2, "solid"],
  mediumDashed: [2, "dashed"], mediumDashDot: [2, "dashed"], mediumDashDotDot: [2, "dashed"],
  slantDashDot: [2, "dashed"], thick: [3, "solid"], double: [3, "double"],
};

// ---------- exceljs ----------

let excelJsLaden = null;
async function mitExcelJS(daten) {
  if (!excelJsLaden) excelJsLaden = import("exceljs").then((m) => m.default || m);
  const ExcelJS = await excelJsLaden;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(daten.buffer.slice(daten.byteOffset, daten.byteOffset + daten.byteLength));
  const thema = themaLesen(wb);
  const blaetter = [];
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    blaetter.push(blattAusExcelJS(ws, wb, thema));
  }
  if (!blaetter.length) throw new Error("Die Datei enthält kein sichtbares Blatt.");
  return blaetter;
}

function zelleWert(cell) {
  let v = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if (v.richText) return { runs: v.richText };
    if ("formula" in v || "sharedFormula" in v) v = v.result;
    else if (v.error) return { wert: v.error };
    else if (v.text != null) v = v.text;
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if (v.richText) return { runs: v.richText };
      if (v.error) return { wert: v.error };
      v = null;
    }
  }
  return { wert: v };
}

function blattAusExcelJS(ws, wb, thema) {
  // Was gehört dazu? Alles mit Wert, Füllung oder Rahmen
  const zellen = new Map();   // "r,c" → Rohzelle (1-basiert)
  let letzteZ = 0, letzteS = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r > MAX_ZEILEN) return;
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      if (c > MAX_SPALTEN) return;
      const w = cell.type === 1 /* Merge */ ? { wert: null } : zelleWert(cell);
      const fill = cell.fill && cell.fill.type === "pattern" && cell.fill.pattern && cell.fill.pattern !== "none"
        ? farbe(cell.fill.fgColor, thema) || farbe(cell.fill.bgColor, thema) : null;
      const gradient = cell.fill && cell.fill.type === "gradient" && cell.fill.stops && cell.fill.stops[0]
        ? farbe(cell.fill.stops[0].color, thema) : null;
      const b = cell.border || {};
      const rahmen = ["top", "right", "bottom", "left"].some((s) => b[s] && b[s].style);
      const hatWert = (w.wert != null && w.wert !== "") || (w.runs && w.runs.length);
      if (!hatWert && !fill && !gradient && !rahmen) return;
      zellen.set(r + "," + c, { cell, ...w, fill: fill || gradient, b });
      if (r > letzteZ) letzteZ = r;
      if (c > letzteS) letzteS = c;
    });
  });

  // Verbundene Zellen
  let merges = [];
  if (ws._merges) merges = Object.values(ws._merges).map((m) => m.model || m);
  else if (ws.model && ws.model.merges) merges = ws.model.merges.map(bereichLesen).filter(Boolean);
  merges = merges.filter((m) => m && m.top <= MAX_ZEILEN && m.left <= MAX_SPALTEN);
  merges.forEach((m) => {
    letzteZ = Math.max(letzteZ, Math.min(m.bottom, MAX_ZEILEN));
    letzteS = Math.max(letzteS, Math.min(m.right, MAX_SPALTEN));
  });

  // Bilder: wo sie sitzen, in Zellen und Versatz (EMU)
  const rohBilder = [];
  try {
    for (const bild of ws.getImages()) {
      const medium = wb.getImage(Number(bild.imageId));
      if (!medium || !medium.buffer || !/^(png|jpe?g|gif|bmp|webp|svg)$/i.test(medium.extension || "")) continue;
      const tl = bild.range && bild.range.tl;
      if (!tl) continue;
      rohBilder.push({ medium, tl, br: bild.range.br, ext: bild.range.ext });
      // Endet das Bild genau am Anfang einer Zeile/Spalte, gehört diese nicht mehr dazu
      const br = bild.range.br;
      const unten = br ? br.nativeRow + (br.nativeRowOff ? 1 : 0) : tl.nativeRow + 1;
      const rechts = br ? br.nativeCol + (br.nativeColOff ? 1 : 0) : tl.nativeCol + 1;
      letzteZ = Math.max(letzteZ, Math.min(unten, MAX_ZEILEN));
      letzteS = Math.max(letzteS, Math.min(rechts, MAX_SPALTEN));
    }
  } catch (f) { /* ohne Bilder */ }

  letzteZ = Math.max(1, letzteZ); letzteS = Math.max(1, letzteS);

  // Masse
  const p = ws.properties || {};
  const stdBreite = p.defaultColWidth ? Math.round(p.defaultColWidth * 7) : 64;
  const stdHoehe = Math.round((p.defaultRowHeight || 15) * PX_JE_PT);
  const spalten = [];
  for (let c = 1; c <= letzteS; c++) {
    const col = ws.getColumn(c);
    spalten.push(col.hidden ? 0 : col.width ? Math.round(col.width * 7) : stdBreite);
  }
  const zeilen = [];
  for (let r = 1; r <= letzteZ; r++) {
    const row = ws.findRow(r);
    zeilen.push(row && row.hidden ? 0 : row && row.height ? Math.round(row.height * PX_JE_PT) : stdHoehe);
  }

  const zelle = (r, c) => zellen.get(r + "," + c);
  const ansichten = ws.views && ws.views[0];
  const gitter = !(ansichten && ansichten.showGridLines === false);

  return modellBauen({
    name: ws.name, spalten, zeilen, gitter, merges,
    alle: zellen, zelle,
    stil: (z) => {
      const cell = z.cell;
      const font = cell.font;
      const a = cell.alignment || {};
      let text = null, runs = null;
      if (z.runs) runs = z.runs.map((t) => ({ text: t.text, stil: schriftStil(t.font, thema) }));
      else text = zahlText(z.wert, cell.numFmt);
      // Text links, Zahlen rechts, wenn nichts anderes eingestellt ist
      const zahl = typeof z.wert === "number" || z.wert instanceof Date;
      return {
        text, runs,
        schrift: schriftStil(font, thema),
        fill: z.fill,
        ha: a.horizontal && a.horizontal !== "general" ? a.horizontal
          : zahl ? "right" : typeof z.wert === "boolean" ? "center" : "left",
        v: a.vertical || "bottom",
        umbruch: !!a.wrapText || a.horizontal === "justify" || a.vertical === "justify",
        einzug: a.indent || 0,
        drehung: a.textRotation,
      };
    },
    rahmen: (z, seite) => {
      const s = z.b[seite];
      if (!s || !s.style || !RAHMEN[s.style]) return null;
      const [dicke, art] = RAHMEN[s.style];
      return { dicke, art, farbe: farbe(s.color, thema) || "#000" };
    },
    bilder: rohBilder.map((b) => {
      const typ = /svg/i.test(b.medium.extension) ? "image/svg+xml" : "image/" + b.medium.extension.toLowerCase().replace("jpg", "jpeg");
      return {
        blob: new Blob([b.medium.buffer], { type: typ }),
        von: { s: b.tl.nativeCol, so: b.tl.nativeColOff || 0, z: b.tl.nativeRow, zo: b.tl.nativeRowOff || 0 },
        bis: b.br ? { s: b.br.nativeCol, so: b.br.nativeColOff || 0, z: b.br.nativeRow, zo: b.br.nativeRowOff || 0 } : null,
        ext: b.ext,
      };
    }),
  });
}

function bereichLesen(text) {
  const m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(String(text || "").trim());
  if (!m) return null;
  const sp = (s) => [...s.toUpperCase()].reduce((n, z) => n * 26 + z.charCodeAt(0) - 64, 0);
  return { top: +m[2], left: sp(m[1]), bottom: +m[4], right: sp(m[3]) };
}

// ---------- SheetJS (alte .xls, .ods) ----------

let sheetJsLaden = null;
async function mitSheetJS(daten) {
  if (!sheetJsLaden) sheetJsLaden = import("xlsx").then((m) => m.default && m.default.read ? m.default : m);
  const XLSX = await sheetJsLaden;
  const wb = XLSX.read(daten, { type: "array", cellStyles: true, cellDates: true, cellNF: true });
  const blaetter = [];
  wb.SheetNames.forEach((name, i) => {
    const info = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i];
    if (info && info.Hidden) return;
    const ws = wb.Sheets[name];
    const rng = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const letzteZ = Math.min(rng.e.r + 1, MAX_ZEILEN), letzteS = Math.min(rng.e.c + 1, MAX_SPALTEN);
    const zellen = new Map();
    for (let r = 1; r <= letzteZ; r++) {
      for (let c = 1; c <= letzteS; c++) {
        const z = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
        if (!z || z.v == null || z.v === "") continue;
        zellen.set(r + "," + c, { z });
      }
    }
    const cols = ws["!cols"] || [], rows = ws["!rows"] || [];
    const spalten = [], zeilen = [];
    for (let c = 0; c < letzteS; c++) {
      const k = cols[c] || {};
      spalten.push(k.hidden ? 0 : k.wpx ? Math.round(k.wpx) : k.wch ? Math.round(k.wch * 7 + 5) : 64);
    }
    for (let r = 0; r < letzteZ; r++) {
      const k = rows[r] || {};
      zeilen.push(k.hidden ? 0 : k.hpx ? Math.round(k.hpx) : k.hpt ? Math.round(k.hpt * PX_JE_PT) : 20);
    }
    const merges = (ws["!merges"] || []).map((m) => ({ top: m.s.r + 1, left: m.s.c + 1, bottom: m.e.r + 1, right: m.e.c + 1 }))
      .filter((m) => m.top <= letzteZ && m.left <= letzteS);
    blaetter.push(modellBauen({
      name, spalten, zeilen, gitter: true, merges,
      alle: zellen, zelle: (r, c) => zellen.get(r + "," + c),
      stil: ({ z }) => {
        const zahl = z.t === "n" || z.t === "d";
        let text = z.w;
        if (text == null) text = z.v instanceof Date ? zahlText(z.v, z.z) : zahlText(z.v, null);
        // SheetJS schreibt Tausender und Komma englisch; Schweizer Schreibweise
        if (zahl && typeof z.v === "number" && /^-?[\d,]+(\.\d+)?%?$/.test(text)) text = text.replace(/,/g, "'");
        return { text, schrift: {}, fill: null, ha: zahl ? "right" : z.t === "b" ? "center" : "left",
          v: "bottom", umbruch: false, einzug: 0 };
      },
      rahmen: () => null,
      bilder: [],
    }));
  });
  if (!blaetter.length) throw new Error("Die Datei enthält kein sichtbares Blatt.");
  return blaetter;
}

// ---------- Gemeinsames Modell ----------

function modellBauen({ name, spalten, zeilen, gitter, merges, alle, zelle, stil, rahmen, bilder }) {
  const x = [0]; spalten.forEach((b, i) => x.push(x[i] + b));
  const y = [0]; zeilen.forEach((h, i) => y.push(y[i] + h));
  const nZ = zeilen.length, nS = spalten.length;

  // Welche Zellen sind von einer Verbindung überdeckt? „gruppe“ sagt
  // für jede Zelle einer Verbindung, zu welcher sie gehört.
  const verdeckt = new Set(), anfang = new Map(), gruppe = new Map();
  merges.forEach((m, i) => {
    const b = Math.min(m.bottom, nZ), rr = Math.min(m.right, nS);
    anfang.set(m.top + "," + m.left, { rs: b - m.top + 1, cs: rr - m.left + 1 });
    for (let r = m.top; r <= b; r++) for (let c = m.left; c <= rr; c++) {
      gruppe.set(r + "," + c, i);
      if (r !== m.top || c !== m.left) verdeckt.add(r + "," + c);
    }
  });
  const innen = (r1, c1, r2, c2) => {
    const g = gruppe.get(r1 + "," + c1);
    return g != null && g === gruppe.get(r2 + "," + c2);
  };

  const felder = [];
  const leer = (r, c) => {
    if (verdeckt.has(r + "," + c) || anfang.has(r + "," + c)) return false;
    const z = zelle(r, c);
    return !z || ((z.wert == null || z.wert === "") && !z.runs && !(z.z && z.z.v != null));
  };
  for (const [key, roh] of alle) {
    const [r, c] = key.split(",").map(Number);
    if (verdeckt.has(key) || r > nZ || c > nS) continue;
    const m = anfang.get(key) || { rs: 1, cs: 1 };
    const s = stil(roh);
    const hatText = (s.text != null && s.text !== "") || (s.runs && s.runs.length);
    if (!hatText && !s.fill && m.rs === 1 && m.cs === 1) continue;
    // Text darf wie in Excel in leere Nachbarzellen hinauslaufen
    let ueber = false;
    if (hatText && !s.umbruch && m.cs === 1 && !s.drehung) {
      const rechts = s.ha === "left" || s.ha === "center" ? leer(r, c + 1) : true;
      const links = s.ha === "right" || s.ha === "center" ? c === 1 || leer(r, c - 1) : true;
      ueber = rechts && links;
    }
    felder.push({ r, c, x: x[c - 1], y: y[r - 1], b: x[c - 1 + m.cs] - x[c - 1], h: y[r - 1 + m.rs] - y[r - 1],
      verbunden: m.rs > 1 || m.cs > 1, ueber, ...s });
  }
  // Verbundene Bereiche ohne eigenen Eintrag decken trotzdem das Gitter ab
  for (const [key, m] of anfang) {
    if (alle.has(key)) continue;
    const [r, c] = key.split(",").map(Number);
    if (r > nZ || c > nS) continue;
    felder.push({ r, c, x: x[c - 1], y: y[r - 1], b: x[c - 1 + m.cs] - x[c - 1], h: y[r - 1 + m.rs] - y[r - 1],
      verbunden: true, text: "", schrift: {}, ha: "left", v: "bottom" });
  }

  // Rahmen als einzelne Linien auf den Gitterlinien. Teilen sich zwei
  // Zellen eine Kante, gilt die kräftigere. Kanten im Innern einer
  // Verbindung zeigt Excel nicht.
  const linien = new Map();
  const merken = (k, l) => {
    if (!l) return;
    const da = linien.get(k);
    if (!da || l.dicke > da.dicke) linien.set(k, l);
  };
  for (const [key, roh] of alle) {
    if (!roh.b) continue;
    const [r, c] = key.split(",").map(Number);
    if (r > nZ || c > nS) continue;
    if (!innen(r, c, r - 1, c)) merken("h" + (r - 1) + "," + (c - 1), rahmen(roh, "top"));
    if (!innen(r, c, r + 1, c)) merken("h" + r + "," + (c - 1), rahmen(roh, "bottom"));
    if (!innen(r, c, r, c - 1)) merken("v" + (r - 1) + "," + (c - 1), rahmen(roh, "left"));
    if (!innen(r, c, r, c + 1)) merken("v" + (r - 1) + "," + c, rahmen(roh, "right"));
  }
  const striche = [];
  for (const [k, l] of linien) {
    const [a, b] = k.slice(1).split(",").map(Number);
    if (k[0] === "h") striche.push({ x: x[b], y: y[a] - l.dicke / 2, b: spalten[b], h: l.dicke, waag: true, ...l });
    else striche.push({ x: x[b] - l.dicke / 2, y: y[a], b: l.dicke, h: zeilen[a], waag: false, ...l });
  }

  // Bilder in Pixel umrechnen (1 Pixel = 9525 EMU)
  const posX = (s, o) => (x[Math.min(s, nS)] || 0) + o / 9525;
  const posY = (z, o) => (y[Math.min(z, nZ)] || 0) + o / 9525;
  const bildListe = bilder.map((b) => {
    const bx = posX(b.von.s, b.von.so), by = posY(b.von.z, b.von.zo);
    let bb, bh;
    if (b.bis) { bb = posX(b.bis.s, b.bis.so) - bx; bh = posY(b.bis.z, b.bis.zo) - by; }
    else if (b.ext) { bb = b.ext.width; bh = b.ext.height; }
    return { x: bx, y: by, b: bb, h: bh, blob: b.blob };
  }).filter((b) => b.b > 0 && b.h > 0);

  return { name, spalten, zeilen, x, y, breite: x[nS], hoehe: y[nZ], gitter, felder, striche, bilder: bildListe };
}
