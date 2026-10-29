// =================================================================
//  ALTE EXCEL-DATEIEN (.xls) SELBST LESEN
//  SheetJS liest aus einer .xls nur Werte und rechnet die Spalten-
//  breiten falsch (doppelt so breit), darum sahen alte Einrichtblätter
//  im Betrachter klein, ohne Rahmen, Farben und Bilder aus (Patrick
//  29. Oktober 2026: „die alte Version liest es immer noch komisch“).
//  Hier liest die App aus dem Datenstrom „Workbook“ (BIFF8) selbst,
//  was zum Aussehen gehört: Schriften, Zellformate mit Rahmen,
//  Füllung und Ausrichtung, Spaltenbreiten, Zeilenhöhen, verbundene
//  Zellen, Seite einrichten und die Bilder. Die Werte selbst liefert
//  weiter SheetJS.
// =================================================================

// Die alte Excel-Palette, wie sie in jeder .xls ohne eigene Palette gilt
const PALETTE = ("000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
  + "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
  + "800000 008000 000080 808000 800080 008080 C0C0C0 808080 "
  + "9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF "
  + "000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF "
  + "00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 "
  + "3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 "
  + "003366 339966 003300 333300 993300 993366 333399 333333").split(" ");

const WAAG = ["general", "left", "center", "right", "fill", "justify", "centerContinuous", "distributed"];
const SENK = ["top", "middle", "bottom", "justify", "distributed"];

// Text in der Form „Länge, Flag, Zeichen“ (8 oder 16 Bit je Zeichen)
function textLesen(dv, o, cch, laenge16) {
  let p = o, n;
  if (laenge16) { n = dv.getUint16(p, true); p += 2; } else { n = cch; }
  const breit = dv.getUint8(p) & 1; p += 1;
  let s = "";
  for (let i = 0; i < n && p < dv.byteLength; i++) {
    if (breit) { s += String.fromCharCode(dv.getUint16(p, true)); p += 2; }
    else { s += String.fromCharCode(dv.getUint8(p)); p += 1; }
  }
  return s;
}

function* records(bytes, start, ende) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = start;
  while (p + 4 <= ende) {
    const typ = dv.getUint16(p, true), len = dv.getUint16(p + 2, true);
    const daten = new DataView(bytes.buffer, bytes.byteOffset + p + 4, Math.min(len, ende - p - 4));
    yield { typ, daten, pos: p };
    p += 4 + len;
  }
}

function zusammen(teile) {
  const n = teile.reduce((s, t) => s + t.byteLength, 0);
  const aus = new Uint8Array(n); let p = 0;
  teile.forEach((t) => { aus.set(new Uint8Array(t.buffer, t.byteOffset, t.byteLength), p); p += t.byteLength; });
  return aus;
}

// ---------- OfficeArt (Bilder) ----------

// Ein OfficeArt-Eintrag: Kopf mit Version/Instanz, Typ und Länge
function artEintraege(bytes, start = 0, ende = bytes.length) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const aus = [];
  let p = start;
  while (p + 8 <= ende) {
    const vi = dv.getUint16(p, true), typ = dv.getUint16(p + 2, true), len = dv.getUint32(p + 4, true);
    aus.push({ ver: vi & 0xf, inst: vi >> 4, typ, start: p + 8, ende: Math.min(p + 8 + len, ende) });
    if ((vi & 0xf) !== 0xf && len > ende - p) break;
    p += 8 + len;
  }
  return aus;
}

// Bitmap aus einer DIB (ohne Dateikopf) zu einer .bmp machen
function dibZuBmp(dib) {
  const dv = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const kopf = dv.getUint32(0, true), bits = dv.getUint16(14, true);
  let farben = kopf >= 40 ? dv.getUint32(32, true) : 0;
  if (!farben && bits <= 8) farben = 1 << bits;
  const komp = kopf >= 40 ? dv.getUint32(16, true) : 0;
  const masken = komp === 3 && kopf === 40 ? 12 : 0;
  const aus = new Uint8Array(14 + dib.length);
  const ov = new DataView(aus.buffer);
  aus[0] = 0x42; aus[1] = 0x4d;
  ov.setUint32(2, aus.length, true);
  ov.setUint32(10, 14 + kopf + masken + farben * 4, true);
  aus.set(dib, 14);
  return aus;
}

// Bilderlager der Mappe: Index (ab 1) → Blob
function bilderLager(bytes) {
  const lager = [];
  const dgg = artEintraege(bytes).find((e) => e.typ === 0xf000);
  if (!dgg) return lager;
  const bstore = artEintraege(bytes, dgg.start, dgg.ende).find((e) => e.typ === 0xf001);
  if (!bstore) return lager;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const bse of artEintraege(bytes, bstore.start, bstore.ende)) {
    if (bse.typ !== 0xf007) { lager.push(null); continue; }
    // FBSE ist 36 Byte, dann der Name, dann das Bild selbst
    const cbName = dv.getUint8(bse.start + 33);
    const blip = artEintraege(bytes, bse.start + 36 + cbName, bse.ende)[0];
    lager.push(blip ? blipLesen(bytes, blip) : null);
  }
  return lager;
}

function blipLesen(bytes, b) {
  // Kopf: eine oder zwei UIDs (16 Byte) je nach Instanz, dann 1 Byte Tag
  const zweiUid = b.inst & 1 ? 16 : 0;
  let typ = null, kopf = 0;
  switch (b.typ) {
    case 0xf01d: case 0xf02a: typ = "image/jpeg"; kopf = 17 + zweiUid; break;
    case 0xf01e: typ = "image/png"; kopf = 17 + zweiUid; break;
    case 0xf01f: typ = "image/bmp"; kopf = 17 + zweiUid; break;
    case 0xf029: typ = "image/tiff"; kopf = 17 + zweiUid; break;
    default: return null; // EMF, WMF, PICT kann der Browser nicht zeigen
  }
  let roh = bytes.subarray(b.start + kopf, b.ende);
  if (typ === "image/bmp") roh = dibZuBmp(roh);
  return new Blob([roh], { type: typ });
}

// Eigenschaften einer Form (FOPT): Nummer → Wert
function eigenschaften(bytes, e) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const aus = new Map();
  for (let i = 0; i < e.inst; i++) {
    const p = e.start + i * 6;
    if (p + 6 > e.ende) break;
    aus.set(dv.getUint16(p, true) & 0x3fff, dv.getInt32(p + 2, true));
  }
  return aus;
}

// Farbe in OfficeArt: 0x00BBGGRR, oder mit 0x08 vorne eine Nummer der Palette
function artFarbe(wert, ctx, deckung = 1) {
  let hex;
  if ((wert >>> 24) === 0x08) {
    const i = wert & 0xff;
    hex = i === 64 ? "#000000" : i === 65 ? "#FFFFFF" : ctx.farbe(i);
    if (!hex) return null;
    hex = hex.slice(1);
  } else hex = [wert & 0xff, (wert >> 8) & 0xff, (wert >> 16) & 0xff].map((n) => n.toString(16).padStart(2, "0")).join("");
  if (deckung < 1) return "rgba(" + [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",") + "," + deckung + ")";
  return "#" + hex.toUpperCase();
}

// Rechteck, Ellipse, Linie oder Textfeld wie die Formen einer .xlsx
const FORM_ARTEN = { 1: "rechteck", 2: "rund", 3: "ellipse", 20: "linie", 202: "text" };
function formVon(f, ctx) {
  const art = FORM_ARTEN[f.art];
  if (!art) return null;
  const ei = f.ei || new Map();
  // Schalter: Bit „benutzt“ (16 höher) sagt, ob das Bit gilt
  const schalter = (nr, bit, std) => {
    if (!ei.has(nr)) return std;
    const v = ei.get(nr);
    return v & (1 << (bit + 16)) ? !!(v & (1 << bit)) : std;
  };
  const gefuellt = art !== "linie" && schalter(0x1bf, 4, art !== "text");
  const rand = schalter(0x1ff, 3, art !== "text");
  const deckung = ei.has(0x182) ? ei.get(0x182) / 65536 : 1;
  const fuellung = gefuellt ? artFarbe(ei.has(0x181) ? ei.get(0x181) : 0xffffff, ctx, deckung) : null;
  const dicke = Math.max(1, Math.round((ei.has(0x1cb) ? ei.get(0x1cb) : 9525) / 9525));
  const strich = ei.get(0x1ce) > 0 ? "dashed" : "solid";
  const form = {
    linie: art === "linie", ellipse: art === "ellipse", rund: art === "rund",
    fuellung, rand: rand ? { dicke, art: strich, farbe: artFarbe(ei.has(0x1c0) ? ei.get(0x1c0) : 0, ctx) || "#000" } : null,
    spiegelH: f.spiegelH, spiegelV: f.spiegelV,
    anker: "t", innen: { l: 7.2, r: 7.2, o: 3.6, u: 3.6 }, umbruch: true, senkrecht: false, absaetze: [],
  };
  const t = f.text;
  if (t && t.text) {
    form.anker = ["t", "t", "ctr", "b", "just", "dist"][t.va] || "t";
    const ausrichtung = ["l", "l", "ctr", "r", "just", "dist"][t.ha] || "l";
    // Läufe mit Schrift auf Absätze verteilen
    const laeufe = t.laeufe.length ? t.laeufe : [{ ab: 0, font: 0 }];
    let absatz = { ausrichtung, pt: 10, teile: [] };
    form.absaetze.push(absatz);
    laeufe.forEach((l, i) => {
      const bis = i + 1 < laeufe.length ? laeufe[i + 1].ab : t.text.length;
      const sf = ctx.schriften[l.font] || {};
      const stueck = t.text.slice(l.ab, bis).replace(/\r\n?/g, "\n");
      stueck.split("\n").forEach((z, j) => {
        if (j > 0) { absatz = { ausrichtung, pt: sf.size || 10, teile: [] }; form.absaetze.push(absatz); }
        absatz.pt = sf.size || absatz.pt;
        if (z) absatz.teile.push({ text: z, pt: sf.size || 10, fett: sf.bold, kursiv: sf.italic, unter: sf.underline,
          durch: sf.strike, schrift: sf.name, farbe: sf.farbe < 64 ? ctx.farbe(sf.farbe) : undefined,
          hoch: sf.vertAlign === "superscript" ? 1 : sf.vertAlign === "subscript" ? -1 : 0 });
      });
    });
  }
  if (!form.linie && !form.fuellung && !form.rand && !form.absaetze.some((a) => a.teile.length)) return null;
  return { form, drehung: f.drehung || 0, spiegelH: f.spiegelH, spiegelV: f.spiegelV };
}

// Formen eines Blatts mit Bild: Anker in Zellen, bei Gruppen die Teile
function blattBilder(bytes, ctx, texte) {
  const { lager } = ctx;
  let textNr = 0;
  if (!bytes || !bytes.length) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const aus = [];
  const dg = artEintraege(bytes).find((e) => e.typ === 0xf002);
  if (!dg) return aus;
  const anker = (e) => {
    const g = (o) => dv.getUint16(e.start + o, true);
    return { von: { s: g(2), so: g(4), z: g(6), zo: g(8) }, bis: { s: g(10), so: g(12), z: g(14), zo: g(16) } };
  };
  const rechteck = (e) => {
    const g = (o) => dv.getInt32(e.start + o, true);
    return { x: g(0), y: g(4), r: g(8), u: g(12) };
  };
  // Eine Form: Bildnummer, Anker, Drehung und Spiegeln, bei Rechteck,
  // Linie und Textfeld Füllung, Rand und Text
  const form = (sp) => {
    const teile = artEintraege(bytes, sp.start, sp.ende);
    const f = { pib: 0, art: 0 };
    for (const t of teile) {
      if (t.typ === 0xf00a) { const fl = dv.getUint32(t.start + 4, true); f.art = t.inst; f.spiegelH = !!(fl & 0x40); f.spiegelV = !!(fl & 0x80); f.gruppe = !!(fl & 1); }
      else if (t.typ === 0xf00d) f.text = texte[textNr++] || null;
      else if (t.typ === 0xf00b) {
        const ei = eigenschaften(bytes, t);
        f.ei = ei;
        if (ei.has(0x104)) f.pib = ei.get(0x104);
        if (ei.has(0x04)) f.drehung = ei.get(0x04) / 65536;
        if (ei.has(0x100)) f.zu = { o: ei.get(0x100), u: ei.get(0x101) || 0, l: ei.get(0x102) || 0, r: ei.get(0x103) || 0 };
      }
      else if (t.typ === 0xf010) f.anker = anker(t);
      else if (t.typ === 0xf00f) f.kind = rechteck(t);
      else if (t.typ === 0xf009) f.grp = rechteck(t);
    }
    return f;
  };
  const bildVon = (f) => {
    const blob = f.pib > 0 ? lager[f.pib - 1] : null;
    if (!blob) return formVon(f, ctx);
    const t = { blob, drehung: f.drehung || 0, spiegelH: f.spiegelH, spiegelV: f.spiegelV };
    // Zuschnitt in 1/65536 der Bildgrösse
    if (f.zu && (f.zu.o || f.zu.u || f.zu.l || f.zu.r)) {
      t.zuschnitt = { t: f.zu.o / 65536, b: f.zu.u / 65536, l: f.zu.l / 65536, r: f.zu.r / 65536 };
    }
    return t;
  };
  for (const e of artEintraege(bytes, dg.start, dg.ende)) {
    if (e.typ !== 0xf003) continue;
    // Die oberste Gruppe ist das Blatt selbst; darin Formen und Gruppen
    const kinder = artEintraege(bytes, e.start, e.ende);
    kinder.forEach((k, i) => {
      if (i === 0 && k.typ === 0xf004) return; // Form des Blatts
      if (k.typ === 0xf004) {
        const f = form(k);
        const t = f.anker && bildVon(f);
        if (t) aus.push({ ...f.anker, teile: [t] });
      } else if (k.typ === 0xf003) {
        const innen = artEintraege(bytes, k.start, k.ende);
        const kopf = innen[0] && innen[0].typ === 0xf004 ? form(innen[0]) : null;
        if (!kopf || !kopf.anker || !kopf.grp) return;
        const teile = [];
        const sammeln = (liste) => liste.forEach((s) => {
          if (s.typ === 0xf004) {
            const f = form(s);
            const t = f.kind && bildVon(f);
            if (t) teile.push({ ...t, lage: { x: f.kind.x, y: f.kind.y, cx: f.kind.r - f.kind.x, cy: f.kind.u - f.kind.y } });
          } else if (s.typ === 0xf003) sammeln(artEintraege(bytes, s.start, s.ende).slice(1));
        });
        sammeln(innen.slice(1));
        if (teile.length) aus.push({ ...kopf.anker, teile,
          gruppe: { off: { x: kopf.grp.x, y: kopf.grp.y }, ext: { cx: kopf.grp.r - kopf.grp.x, cy: kopf.grp.u - kopf.grp.y } } });
      }
    });
  }
  return aus;
}

// ---------- Mappe ----------

export function biffLesen(workbook) {
  const bytes = workbook instanceof Uint8Array ? workbook : new Uint8Array(workbook);
  const schriften = [], xfs = [], blaetter = [];
  const palette = PALETTE.slice();
  let gruppe = [], lager = [];
  let imGlobal = true;
  for (const { typ, daten: d } of records(bytes, 0, bytes.length)) {
    if (!imGlobal) break;
    switch (typ) {
      case 0x0031: { // FONT
        const g = d.getUint16(2, true);
        schriften.push({
          size: d.getUint16(0, true) / 20, italic: !!(g & 2), strike: !!(g & 8),
          farbe: d.getUint16(4, true), bold: d.getUint16(6, true) >= 700,
          vertAlign: ["", "superscript", "subscript"][d.getUint16(8, true)] || "",
          underline: d.getUint8(10) > 0,
          name: textLesen(d, 15, d.getUint8(14), false),
        });
        // Schrift Nummer 4 gibt es in BIFF nicht
        if (schriften.length === 4) schriften.push(schriften[0]);
        break;
      }
      case 0x00e0: { // XF
        const alc = d.getUint8(6), ind = d.getUint8(8);
        const b1 = d.getUint32(10, true), b2 = d.getUint32(14, true), fc = d.getUint16(18, true);
        xfs.push({
          font: d.getUint16(0, true), ha: WAAG[alc & 7], umbruch: !!(alc & 8), va: SENK[(alc >> 4) & 7],
          drehung: d.getUint8(7), einzug: ind & 15, kleiner: !!(ind & 16),
          l: [b1 & 15, (b1 >> 16) & 0x7f], r: [(b1 >> 4) & 15, (b1 >> 23) & 0x7f],
          o: [(b1 >> 8) & 15, b2 & 0x7f], u: [(b1 >> 12) & 15, (b2 >> 7) & 0x7f],
          muster: (b2 >>> 26) & 0x3f, vorne: fc & 0x7f, hinten: (fc >> 7) & 0x7f,
        });
        break;
      }
      case 0x0092: { // PALETTE
        const n = d.getUint16(0, true);
        for (let i = 0; i < n && 2 + i * 4 + 3 <= d.byteLength; i++) {
          const p = 2 + i * 4;
          palette[8 + i] = [0, 1, 2].map((k) => d.getUint8(p + k).toString(16).padStart(2, "0")).join("").toUpperCase();
        }
        break;
      }
      case 0x0085: // BOUNDSHEET8
        blaetter.push({ pos: d.getUint32(0, true), versteckt: (d.getUint8(4) & 3) !== 0, art: d.getUint8(5),
          name: textLesen(d, 7, d.getUint8(6), false) });
        break;
      case 0x00eb: case 0x003c: // MSODRAWINGGROUP und Fortsetzung
        if (typ === 0x00eb || gruppe.length) gruppe.push(d);
        break;
      case 0x00fc: // SST: danach gehören CONTINUE nicht mehr zur Bildergruppe
        if (gruppe.length) { lager = bilderLager(zusammen(gruppe)); gruppe = []; }
        break;
      case 0x000a: imGlobal = false; break;
      default:
        if (typ !== 0x003c && gruppe.length) { lager = bilderLager(zusammen(gruppe)); gruppe = []; }
    }
  }
  if (gruppe.length) lager = bilderLager(zusammen(gruppe));

  const farbe = (i) => (i < 64 && palette[i] ? "#" + palette[i] : null);
  const ctx = { lager, schriften, farbe };
  const blattListe = blaetter.filter((b) => b.art === 0).map((b) => blattLesen(bytes, b, ctx));
  return { schriften, xfs, farbe, blaetter: blattListe };
}

function blattLesen(bytes, b, ctx) {
  const texte = []; let txo = null, txoSchritt = 0;
  const zellen = new Map(); // "r,c" (1-basiert) → XF
  const spalten = [], zeilen = new Map(), merges = [];
  let stdBreite = null, stdHoehe = null, einpassen = false, hoch = true, ohneAusrichtung = false;
  const seite = { massstab: 1, fitB: 1, fitH: 1, raender: {}, mitte: false, druckGitter: false, gitter: true };
  const zeichnung = [];
  for (const { typ, daten: d } of records(bytes, b.pos, bytes.length)) {
    const xf = (o) => d.getUint16(o, true);
    switch (typ) {
      case 0x0203: case 0x027e: case 0x00fd: case 0x0201: case 0x0006: case 0x0205: case 0x0204: case 0x00d6:
        zellen.set((d.getUint16(0, true) + 1) + "," + (d.getUint16(2, true) + 1), xf(4)); break;
      case 0x00bd: case 0x00be: { // MULRK, MULBLANK
        const r = d.getUint16(0, true), c0 = d.getUint16(2, true), schritt = typ === 0x00bd ? 6 : 2;
        const n = (d.byteLength - 6) / schritt;
        for (let i = 0; i < n; i++) zellen.set((r + 1) + "," + (c0 + i + 1), xf(4 + i * schritt));
        break;
      }
      case 0x007d: { // COLINFO
        const von = d.getUint16(0, true), bis = Math.min(d.getUint16(2, true), 255);
        for (let c = von; c <= bis; c++) spalten[c] = { breite: d.getUint16(4, true) / 256, aus: !!(d.getUint16(8, true) & 1) };
        break;
      }
      case 0x0055: stdBreite = d.getUint16(0, true) + 0.71; break; // DEFCOLWIDTH (Zeichen ohne Rand)
      case 0x0099: stdBreite = d.getUint16(0, true) / 256; break; // STANDARDWIDTH
      case 0x0225: stdHoehe = d.getUint16(2, true) / 20; break; // DEFAULTROWHEIGHT
      case 0x0208: { // ROW
        const h = d.getUint16(6, true), g = d.getUint16(12, true);
        zeilen.set(d.getUint16(0, true), { pt: (h & 0x7fff) / 20, aus: !!(g & 0x20), eigen: !!(g & 0x40) || !(h & 0x8000) });
        break;
      }
      case 0x00e5: { // MERGEDCELLS
        const n = d.getUint16(0, true);
        for (let i = 0; i < n; i++) {
          const p = 2 + i * 8;
          merges.push({ top: d.getUint16(p, true) + 1, bottom: d.getUint16(p + 2, true) + 1,
            left: d.getUint16(p + 4, true) + 1, right: d.getUint16(p + 6, true) + 1 });
        }
        break;
      }
      case 0x00a1: { // SETUP
        const g = d.getUint16(10, true);
        seite.massstab = (d.getUint16(2, true) || 100) / 100;
        seite.fitB = d.getUint16(6, true); seite.fitH = d.getUint16(8, true);
        hoch = !!(g & 2); ohneAusrichtung = !!(g & 4);
        // Ohne Drucker eingerichtet sind die Werte nicht gültig
        if (ohneAusrichtung || seite.massstab < 0.1 || seite.massstab > 4) seite.massstab = 1;
        break;
      }
      case 0x0081: einpassen = !!(d.getUint16(0, true) & 0x100); break; // WSBOOL
      case 0x0026: seite.raender.l = d.getFloat64(0, true); break;
      case 0x0027: seite.raender.r = d.getFloat64(0, true); break;
      case 0x0028: seite.raender.o = d.getFloat64(0, true); break;
      case 0x0029: seite.raender.u = d.getFloat64(0, true); break;
      case 0x0083: seite.mitte = !!d.getUint16(0, true); break; // HCENTER
      case 0x002b: seite.druckGitter = !!d.getUint16(0, true); break; // PRINTGRIDLINES
      case 0x023e: seite.gitter = !!(d.getUint16(0, true) & 2); break; // WINDOW2
      case 0x00ec: zeichnung.push(d); break; // MSODRAWING
      case 0x01b6: // TXO: Text eines Textfelds folgt in zwei CONTINUE
        txo = { ha: (d.getUint16(0, true) >> 1) & 7, va: (d.getUint16(0, true) >> 4) & 7,
          laenge: d.getUint16(10, true), text: "", laeufe: [] };
        texte.push(txo); txoSchritt = txo.laenge ? 1 : 0;
        break;
      case 0x003c:
        if (txo && txoSchritt === 1) { txo.text = textLesen(d, 0, txo.laenge, false); txoSchritt = 2; }
        else if (txo && txoSchritt === 2) {
          for (let p = 0; p + 4 <= d.byteLength; p += 8) txo.laeufe.push({ ab: d.getUint16(p, true), font: d.getUint16(p + 2, true) });
          txo.laeufe = txo.laeufe.filter((l) => l.ab < txo.text.length);
          txoSchritt = 0;
        }
        break;
    }
    if (typ !== 0x003c && typ !== 0x01b6) txoSchritt = 0;
    if (typ === 0x000a) break; // EOF des Blatts
  }
  let bilder = [];
  try { bilder = blattBilder(zusammen(zeichnung), ctx, texte); } catch (f) { bilder = []; }
  return {
    name: b.name, versteckt: b.versteckt, zellen, spalten, zeilen, merges, stdBreite, stdHoehe, bilder,
    seite: { ...seite, quer: ohneAusrichtung ? null : !hoch, einpassen },
  };
}
