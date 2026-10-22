// =================================================================
//  ARTIKEL AUS DEM FOTO DER VERPACKUNG ERKENNEN (seit 1.109.0)
//  Wunsch Patrick 19. Oktober 2026: „Artikel fotografieren, zuerst im
//  System schauen, ob es ihn schon gibt, sonst neuen Artikel anlegen;
//  ich lade später mehrere Verpackungen der Hersteller hoch zum
//  Lernen“.
//
//  Lesen: dieselbe Texterkennung wie beim Foto der Bestellung
//  (Tesseract im Gerät), dazu Strich- und Data-Matrix-Codes, wo der
//  Browser sie lesen kann (Chrome am Handy und Computer; Safari nicht).
//
//  Suchen: Die Artikelnummer (auch in Teilen, mit einem Lesefehler
//  bei langen Teilen) im gelesenen Text, dazu Lieferant und
//  Beschreibung, und vor allem das Gelernte: Zu jedem Artikel merkt
//  sich die App die Codes und Nummern, die auf seiner Verpackung
//  standen (articles.foto_merkmale), wenn man ihn nach einem Foto
//  bestellt oder unter Bestellungen → Artikel eine Verpackung
//  fotografiert. Ein Merkmal, das bei mehreren Artikeln steht (etwa
//  ISO 9001 eines Herstellers), zählt nicht.
//
//  Beispielfotos liegen in der Ablage „zeichnungen“ unter
//  „artikel/<id>/“, die Liste in articles.foto_bilder
//  (sql/artikel-foto.sql). Sie dienen zum Nachsehen und um die
//  Erkennung später zu verbessern.
// =================================================================
import { alt } from "../bruecke.jsx";
import { mitTexterkennung } from "./bestellFoto.js";

// Für den Vergleich: nur Buchstaben und Ziffern, gross, und was die
// Erkennung gern verwechselt gleich (O/0, I/L/1, S/5, B/8, Z/2)
export function vergleichbar(t) {
  return String(t || "").toUpperCase()
    .replace(/[ØÖ]/g, "0").replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
}

// Steht auf fast jeder Verpackung und sagt nichts über den Artikel
const ALLERWELT = /^(150\d{3,5}|EN\d+|D1N\d+|CE|0RDER|ART1KE1)$/;

// Wörter aus dem Text, die Codes sein könnten: Buchstaben mit Ziffern
// ab 5 Zeichen, reine Zahlen ab 6 Ziffern
export function merkmaleAusText(text) {
  const raus = new Set();
  for (const roh of String(text || "").split(/[\s,;:()[\]{}"'|]+/)) {
    // Datum ist Losnummer, kein Merkmal
    if (/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(roh)) continue;
    const v = vergleichbar(roh);
    if (ALLERWELT.test(v)) continue;
    const ziffern = /\d/.test(roh), buchstaben = /[a-z]/i.test(roh);
    if ((ziffern && buchstaben && v.length >= 5) || (/^\d+$/.test(v) && v.length >= 6)) raus.add(v);
  }
  return [...raus].slice(0, 30);
}

// Strich- und 2D-Codes (EAN, Code 128, Data Matrix, QR …). Zuerst die
// eingebaute Erkennung des Browsers (Chrome), sonst und zusätzlich der
// eigene Codeleser zxing-wasm, der auch auf iPad und iPhone geht
// (seit 1.147.0, Wunsch Patrick 22. Oktober 2026: „Strichcode lesen
// von jeglichen Herstellern“). Er läuft im Gerät; das Programm (rund
// 1 MB) kommt beim ersten Mal von jsdelivr und bleibt dann im Gerät.
// GS1-Codes (Data Matrix der Werkzeughersteller) tragen Los und Datum
// mit: dann nur die Artikelnummer (GTIN, „01“ + 14 Ziffern).
// → [{ code: "CODE:…", roh: lesbarer Inhalt }]
function codeEintrag(roh) {
  // Trennzeichen FNC1 kommt als Zeichen 29 oder als Text „<GS>“
  const r = String(roh || "").replace(/<GS>|\x1d/g, " ").trim();
  const gs1 = r.replace(/\s/g, "").match(/^(?:\]d2|\]C1)?\(?01\)?(\d{14})/);
  // GTIN-14 mit führender 0 ist die EAN-13 auf der Schachtel
  const gtin = gs1 ? gs1[1].replace(/^0(?=\d{13}$)/, "") : null;
  const code = "CODE:" + (gtin || vergleichbar(r));
  return code.length > 8 ? { code, roh: gtin || r } : null;
}

let zxing = null;
async function zxingHolen() {
  if (!zxing) {
    zxing = import("zxing-wasm/reader").then(async (m) => {
      m.prepareZXingModule({
        overrides: {
          locateFile: (pfad, vorne) => (pfad.endsWith(".wasm")
            ? "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/reader/zxing_reader.wasm" : vorne + pfad),
        },
        fireImmediately: true,
      });
      return m;
    }).catch((f) => { zxing = null; throw f; });
  }
  return zxing;
}

export async function codesLesen(bild, datei) {
  const funde = [];
  try {
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      const formate = await window.BarcodeDetector.getSupportedFormats();
      if (formate && formate.length) {
        for (const f of await new window.BarcodeDetector({ formats: formate }).detect(bild)) funde.push(f.rawValue);
      }
    }
  } catch (f) { /* dann nur der eigene Leser */ }
  if (!funde.length) {
    try {
      const m = await zxingHolen();
      // Das Foto in voller Grösse: kleine Codes gehen beim Verkleinern verloren
      const r = await m.readBarcodes(datei || bild, {
        tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 8,
      });
      for (const x of r || []) if (x.isValid && x.text) funde.push(x.text);
    } catch (f) { /* ohne Code, der Text reicht oft */ }
  }
  const raus = new Map();
  for (const roh of funde) { const e = codeEintrag(roh); if (e) raus.set(e.code, e); }
  return [...raus.values()];
}

// Verkleinern (höchstens 2000 Pixel), Graustufen mit gestrecktem
// Kontrast. Anders als bei der Bestellung nicht nur der Rotanteil:
// Verpackungen sind bunt, weisse Schrift auf Rot ginge sonst verloren.
async function bildVorbereiten(datei) {
  const bild = await createImageBitmap(datei);
  const f = Math.min(1, 2000 / Math.max(bild.width, bild.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bild.width * f);
  c.height = Math.round(bild.height * f);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bild, 0, 0, c.width, c.height);
  const codes = await codesLesen(bild, datei);
  if (bild.close) bild.close();
  // Das Beispielfoto zum Ablegen: farbig, höchstens 1600 Pixel
  const g = Math.min(1, 1600 / Math.max(c.width, c.height));
  const k = document.createElement("canvas");
  k.width = Math.round(c.width * g);
  k.height = Math.round(c.height * g);
  k.getContext("2d").drawImage(c, 0, 0, k.width, k.height);
  const jpg = await new Promise((fertig) => k.toBlob(fertig, "image/jpeg", 0.82));

  const daten = ctx.getImageData(0, 0, c.width, c.height);
  const px = daten.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    px[i] = v;
    hist[px[i]]++;
  }
  const n = px.length / 4;
  let lo = 0, hi = 255, summe = 0;
  while (lo < 255 && (summe += hist[lo]) < n * 0.01) lo++;
  summe = 0;
  while (hi > 0 && (summe += hist[hi]) < n * 0.01) hi--;
  lo = Math.min(lo, 90);
  hi = Math.max(hi, 160);
  const spanne = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / spanne));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(daten, 0, 0);
  return { c, codes, jpg };
}

// → { text, codes, codeTexte, merkmale, nummern, jpg }
export async function artikelFotoLesen(datei, fortschritt) {
  return mitTexterkennung(fortschritt, async (w) => {
    let c = datei, gefunden = [], jpg = null;
    try { ({ c, codes: gefunden, jpg } = await bildVorbereiten(datei)); } catch (f) { /* dann das Foto, wie es ist */ }
    const r = await w.recognize(c);
    const text = (r && r.data && r.data.text) || "";
    const codes = gefunden.map((x) => x.code);
    // Ein Code, der keine EAN/GTIN ist, ist oft die Artikelnummer selbst
    const ausCode = gefunden.map((x) => x.roh).filter((t) => !/^\d{8,14}$/.test(t) && t.length <= 40);
    const nummern = [...new Set(ausCode.concat(nummernVorschlagen(text)))].slice(0, 6);
    return { text, codes, codeTexte: gefunden.map((x) => x.roh), merkmale: codes.concat(merkmaleAusText(text)), nummern, jpg };
  });
}

// Für einen neuen Artikel: was als Artikelnummer in Frage kommt.
// Zuerst, was hinter „Art.-Nr.“, „Bestell-Nr.“, „Ref.“, „Type“ steht.
export function nummernVorschlagen(text) {
  const kand = new Map();
  const dazu = (t, punkte) => {
    const s = t.replace(/^[^A-Za-z0-9Ø]+|[^A-Za-z0-9]+$/g, "");
    if (s.length < 4 || s.length > 40 || !/\d/.test(s)) return;
    if (/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(s)) return;
    kand.set(s, Math.max(kand.get(s) || 0, punkte + Math.min(s.length, 14) / 14));
  };
  for (const zeile of String(text || "").split(/\r?\n/)) {
    const z = zeile.replace(/\s+/g, " ").trim();
    // Los, Charge, EAN und Seriennummer sind keine Artikelnummern
    if (!z || /\b(lot|charge|batch|ean|gtin|s\/?n|serial|serien)\b/i.test(z)) continue;
    const nach = z.match(/\b(?:art(?:ikel)?\.?\s*-?\s*n(?:r|o)|bestell\s*-?\s*n(?:r|o)|order\s*(?:n(?:o|r)|code)|ref(?:erenz|erence)?|typ(?:e)?|cat(?:alog)?\.?\s*no|item|code)\b\.?\s*:?\s*(.+)$/i);
    if (nach) {
      const rest = nach[1].split(" ");
      dazu(rest.slice(0, 2).join(" "), 3);
      dazu(rest[0], 3);
    }
    const woerter = z.split(" ");
    woerter.forEach((w, i) => {
      if (/\d/.test(w) && /[a-z]/i.test(w)) dazu(w, 1);
      else if (/^\d[\d.-]{4,}$/.test(w)) dazu(w, 0.5);
      // Zwei Teile, wie „DNMU 110404-MF1“
      if (i > 0 && /\d/.test(w) && /^[A-Z]{2,}\d*$/.test(woerter[i - 1])) dazu(woerter[i - 1] + " " + w, 1.2);
    });
  }
  return [...kand.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
}

// Kleinste Zahl Fehler, mit der muster irgendwo im Text steht
function fehlerImText(muster, text, grenze) {
  const m = muster.length;
  let vorher = new Array(m + 1);
  for (let i = 0; i <= m; i++) vorher[i] = i;
  let best = vorher[m];
  for (let j = 1; j <= text.length; j++) {
    const jetzt = [0];
    for (let i = 1; i <= m; i++) {
      jetzt[i] = Math.min(vorher[i] + 1, jetzt[i - 1] + 1, vorher[i - 1] + (muster[i - 1] === text[j - 1] ? 0 : 1));
    }
    if (jetzt[m] < best) { best = jetzt[m]; if (best === 0) return 0; }
    vorher = jetzt;
  }
  return best <= grenze ? best : Infinity;
}

// Steht der Teil im Text? Ziffern am Rand dürfen nicht an weiteren
// Ziffern kleben (137654 nicht in 761234513765412)
function stehtDrin(teil, text) {
  let ab = 0;
  for (;;) {
    const i = text.indexOf(teil, ab);
    if (i < 0) return false;
    const links = /\d/.test(teil[0]) && /\d/.test(text[i - 1] || "");
    const rechts = /\d/.test(teil[teil.length - 1]) && /\d/.test(text[i + teil.length] || "");
    if (!links && !rechts) return true;
    ab = i + 1;
  }
}

// Wie gut passt ein Artikel? 0 bis über 100
function punkteFuer(a, kompakt, merkmalSet, wieOft) {
  let punkte = 0;
  const gruende = [];
  // Artikelnummer
  const ganz = vergleichbar(a.article_number);
  if (ganz.length >= 5 && stehtDrin(ganz, kompakt)) { punkte += 90; gruende.push("Artikelnummer"); }
  else {
    const teile = String(a.article_number || "").split(/\s+/).map(vergleichbar)
      .filter((t) => t.length >= 4 || (t.length >= 3 && /\d/.test(t) && /[A-Z]/.test(t)));
    let alle = 0, gefunden = 0, mitZiffer = false;
    for (const t of teile) {
      alle += t.length;
      if (stehtDrin(t, kompakt)) { gefunden += t.length; if (/\d/.test(t)) mitZiffer = true; }
      else if (t.length >= 6) {
        const f = fehlerImText(t, kompakt, t.length >= 10 ? 2 : 1);
        if (f !== Infinity) { gefunden += t.length * 0.7; if (/\d/.test(t)) mitZiffer = true; }
      }
    }
    if (alle && gefunden && mitZiffer) {
      const p = Math.round(80 * gefunden / alle);
      if (p >= 20) { punkte += p; gruende.push("Teil der Artikelnummer"); }
    }
  }
  // Gelerntes: nur Merkmale, die zu genau diesem Artikel gehören
  let gelernt = 0;
  for (const m of a.foto_merkmale || []) {
    if ((wieOft.get(m) || 0) > 1) continue;
    // Strichcode 100, lange Zahl (EAN auf der Packung) 60, sonst 35
    if (m.startsWith("CODE:") ? merkmalSet.has(m) : stehtDrin(m, kompakt))
      gelernt += m.startsWith("CODE:") ? 100 : /^\d{12,14}$/.test(m) ? 60 : 35;
  }
  if (gelernt) { punkte += Math.min(120, gelernt); gruende.push("früheres Foto"); }
  if (!punkte) return null;
  // Lieferant und Beschreibung helfen nur mit, allein reichen sie nicht
  const lief = vergleichbar(a.supplier_name);
  if (lief.length >= 4 && kompakt.includes(lief)) { punkte += 10; gruende.push("Lieferant"); }
  const besch = String(a.description || "").split(/\s+/).map(vergleichbar).filter((w) => w.length >= 4);
  if (besch.some((w) => kompakt.includes(w))) punkte += 5;
  return { punkte, gruende };
}

// Alle Artikel mit Lieferant; es sind wenige hundert, darum ganz
export async function artikelFuerFoto() {
  let r = await alt.db.from("articles").select("*, suppliers(name, website)").order("article_number");
  if (r.error) r = await alt.db.from("artikel_uebersicht").select("*").order("article_number");
  if (r.error) throw r.error;
  return (r.data || []).map((a) => ({
    ...a,
    supplier_name: a.supplier_name || (a.suppliers && a.suppliers.name) || null,
    supplier_website: a.supplier_website || (a.suppliers && a.suppliers.website) || null,
  }));
}

// → [{ a, punkte, sicher, gruende }], beste zuerst
export function artikelFinden(lesung, artikel) {
  // Je Zeile ohne Leerzeichen (Nummern, die die Erkennung zerlegt) und
  // Wort für Wort; Zeilen nicht zusammenkleben, sonst hängt an einer
  // Zahl am Zeilenende die nächste Zeile
  const zeilen = String(lesung.text || "").split(/\r?\n/);
  const kompakt = zeilen.map(vergleichbar).join(" ") + " "
    + zeilen.join(" ").split(/\s+/).map(vergleichbar).filter(Boolean).join(" ") + " "
    + (lesung.codes || []).join(" ");
  const merkmalSet = new Set(lesung.merkmale || []);
  const wieOft = new Map();
  for (const a of artikel) for (const m of new Set(a.foto_merkmale || [])) wieOft.set(m, (wieOft.get(m) || 0) + 1);
  const treffer = [];
  for (const a of artikel) {
    if (a.is_active === false) continue;
    const p = punkteFuer(a, kompakt, merkmalSet, wieOft);
    if (p && p.punkte >= 25) treffer.push({ a, punkte: p.punkte, gruende: p.gruende, sicher: p.punkte >= 80 });
  }
  return treffer.sort((x, y) => y.punkte - x.punkte).slice(0, 6);
}

// Merkt sich am Artikel, was auf dem Foto stand, und legt das Foto
// als Beispiel ab. Fehler stören das Bestellen nicht.
export async function artikelLernen(artikelId, lesung, mitFoto = true) {
  if (!artikelId || !lesung) return false;
  const r = await alt.db.from("articles").select("foto_merkmale, foto_bilder").eq("id", artikelId).maybeSingle();
  if (r.error || !r.data) return false;
  const merkmale = [...new Set((lesung.merkmale || []).concat(r.data.foto_merkmale || []))].slice(0, 120);
  const bilder = Array.isArray(r.data.foto_bilder) ? r.data.foto_bilder.slice() : [];
  if (mitFoto && lesung.jpg) {
    try {
      const pfad = "artikel/" + artikelId + "/" + Date.now() + ".jpg";
      const up = await alt.db.storage.from("zeichnungen").upload(pfad, lesung.jpg, { contentType: "image/jpeg", upsert: false });
      if (!up.error) {
        bilder.push({ url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl, pfad,
          am: new Date().toISOString(), von: alt.meineProfilId ? alt.meineProfilId() : null });
      }
    } catch (f) { /* ohne Foto, Merkmale reichen */ }
  }
  const u = await alt.db.from("articles").update({ foto_merkmale: merkmale, foto_bilder: bilder }).eq("id", artikelId);
  return !u.error;
}

// Ein Beispielfoto wieder weg; die Merkmale bleiben, ausser es war
// das letzte Foto
export async function artikelFotoWeg(artikelId, bild, alleMerkmaleWeg) {
  const r = await alt.db.from("articles").select("foto_bilder").eq("id", artikelId).maybeSingle();
  if (r.error) throw r.error;
  const bilder = (r.data && r.data.foto_bilder || []).filter((b) => b.pfad !== bild.pfad);
  const daten = { foto_bilder: bilder };
  if (alleMerkmaleWeg) daten.foto_merkmale = [];
  const u = await alt.db.from("articles").update(daten).eq("id", artikelId);
  if (u.error) throw u.error;
  try { await alt.db.storage.from("zeichnungen").remove([bild.pfad]); } catch (f) { /* bleibt liegen */ }
  return bilder;
}
