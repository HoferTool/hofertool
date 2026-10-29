// =================================================================
//  KREDITORENRECHNUNGEN ABLEGEN
//
//  Wunsch Patrick, 29. Oktober 2026: eingescannte Rechnungen aus dem
//  Ordner G:\Rechnungen Kreditoren „im selben Ordner in Unterordnern
//  mit Lieferantennamen anlegen und die Rechnungen dort richtig
//  verteilen“. Der Scanner legt einen ganzen Stapel in eine PDF.
//
//  Ablauf, gleich wie die Einrichtblätter als PDF: Den Ordner wählt ein
//  Admin einmal auf dem Gerät, wo er erreichbar ist (Chrome oder Edge).
//  Ist dort die App mit einem Admin oder dem Konto Planwand offen, schaut
//  sie alle 2 Minuten nach neuen PDFs direkt im Ordner und
//    - teilt jeden Stapel in einzelne Rechnungen (src/daten/kreditoren.js),
//    - legt jede als „<Lieferant>\2026-10-28 KR26-17717.pdf“ ab,
//    - legt, was sie keinem Lieferanten zuordnen kann, nach „_Zuordnen“;
//      dort gibt man in den Einstellungen einmal den Namen ein, und die
//      App lernt UID und IBAN dieses Lieferanten,
//    - verschiebt den Stapel selbst nach „_Originale“ (nichts geht verloren).
//  Gelernte Lieferanten stehen in „_Lieferanten.json“ im Ordner, nicht in
//  der Datenbank: Rechnungen und Lieferanten bleiben auf dem Laufwerk.
//  Ordner, die man selbst anlegt, gelten als Lieferant mit diesem Namen.
// =================================================================
import { alt } from "../bruecke.jsx";
import { kannOrdner, idbTun, ordnerErlaubt } from "./sicherung.js";
import { stapelLesen, stapelTeilen, dateiName, lernen, sauber, einfach, zeilenAusStuecken } from "../daten/kreditoren.js";

export const LISTE_DATEI = "_Lieferanten.json";
export const ZUORDNEN = "_Zuordnen";
export const ORIGINALE = "_Originale";
const PROTOKOLL = "_Protokoll.txt";
const ZU_INFO = ".hofer-zuordnen.json";
// Eine Datei, die noch so jung ist, schreibt der Scanner vielleicht noch
const RUHE_MS = 60000;

// ---------- Ordner ----------

let griffHier = null;
export async function krOrdnerHolen() {
  if (griffHier) return griffHier;
  try { return (await idbTun("get", "kreditoren-ordner")) || null; } catch (f) { return null; }
}

export async function krOrdnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-kreditoren", mode: "readwrite" });
  griffHier = h;
  try { await idbTun("put", h, "kreditoren-ordner"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

// ---------- Dateien ----------

async function textLesen(ordner, name, ersatz) {
  try {
    const f = await (await ordner.getFileHandle(name)).getFile();
    return JSON.parse(await f.text());
  } catch (f) { return ersatz; }
}

async function schreiben(ordner, name, inhalt) {
  const w = await (await ordner.getFileHandle(name, { create: true })).createWritable();
  try { await w.write(inhalt); await w.close(); }
  catch (f) { try { await w.abort(); } catch (f2) { /* egal */ } throw f; }
}

async function gibt(ordner, name) {
  try { await ordner.getFileHandle(name); return true; } catch (f) { return false; }
}

// Nie überschreiben: „… (2).pdf“, „… (3).pdf“
async function freierName(ordner, name) {
  if (!(await gibt(ordner, name))) return name;
  const basis = name.replace(/\.pdf$/i, "");
  for (let n = 2; n < 1000; n++) {
    const neu = basis + " (" + n + ").pdf";
    if (!(await gibt(ordner, neu))) return neu;
  }
  throw new Error("Kein freier Dateiname für " + name);
}

// Datei in einen anderen Ordner: kopieren, dann löschen (move() kann
// nicht jeder Browser auf einem Netzlaufwerk)
async function verschieben(von, name, nach, neuName) {
  const datei = await (await von.getFileHandle(name)).getFile();
  const ziel = await freierName(nach, neuName || name);
  await schreiben(nach, ziel, datei);
  await von.removeEntry(name);
  return ziel;
}

async function protokoll(h, zeilen) {
  if (!zeilen.length) return;
  let vorher = "";
  try { vorher = await (await (await h.getFileHandle(PROTOKOLL)).getFile()).text(); } catch (f) { /* neu */ }
  const z = new Date().toLocaleString("de-CH");
  // Nur die letzten 2000 Zeilen behalten
  const neu = (vorher + zeilen.map((x) => z + "  " + x).join("\r\n") + "\r\n").split("\r\n").slice(-2000).join("\r\n");
  await schreiben(h, PROTOKOLL, neu);
}

// ---------- Lieferanten ----------

// Gelernte Liste plus alle Unterordner, die nicht mit „_“ anfangen
export async function lieferantenLaden(h) {
  const liste = await textLesen(h, LISTE_DATEI, []);
  const gueltig = Array.isArray(liste) ? liste.filter((l) => l && l.name) : [];
  for await (const [name, e] of h.entries()) {
    if (e.kind !== "directory" || name.startsWith("_") || name.startsWith(".")) continue;
    if (!gueltig.some((l) => sauber(l.name) === name || einfach(l.name) === einfach(name))) {
      gueltig.push({ name, uid: [], iban: [], text: [] });
    }
  }
  return gueltig;
}

async function lieferantenSpeichern(h, liste) {
  await schreiben(h, LISTE_DATEI, JSON.stringify(liste.map(({ name, uid, iban, text }) => ({ name, uid, iban, text })), null, 2));
}

// ---------- Ein Stapel ----------

async function seitenLesen(daten) {
  const { pdfjs } = await import("./PdfAnsicht.jsx");
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: daten.slice(), isEvalSupported: false }).promise;
  const zeilen = [], weiss = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const z = zeilenAusStuecken((await p.getTextContent()).items);
      zeilen.push(z);
      weiss.push(z.join("").replace(/\s/g, "").length < 15 ? await istWeiss(p) : false);
    }
  } finally { try { doc.destroy(); } catch (f) { /* egal */ } }
  return { zeilen, weiss };
}

// Eine Seite ohne Text ist eine leere Rückseite, wenn sie auch gezeichnet
// fast nur weiss ist (der Rand zählt nicht, dort liegen Scannerschatten).
// Bilder ohne OCR sind nicht weiss und bleiben in der Rechnung.
async function istWeiss(p) {
  try {
    const v = p.getViewport({ scale: 0.25 });
    const c = document.createElement("canvas");
    c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: ctx, viewport: v }).promise;
    const rx = Math.floor(c.width * 0.06), ry = Math.floor(c.height * 0.06);
    const d = ctx.getImageData(rx, ry, c.width - 2 * rx, c.height - 2 * ry).data;
    let dunkel = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11 < 150) dunkel++;
    return dunkel / (d.length / 4) < 0.003;
  } catch (f) { return false; }
}

async function stapelAblegen(h, name, liste, zuInfo) {
  const datei = await (await h.getFileHandle(name)).getFile();
  const daten = new Uint8Array(await datei.arrayBuffer());
  const gelesen = await seitenLesen(daten);
  const seiten = stapelLesen(gelesen.zeilen, liste);
  seiten.forEach((s, i) => { s.weiss = gelesen.weiss[i]; });
  const docs = stapelTeilen(seiten);
  const { PDFDocument } = await import("pdf-lib");
  const quelle = await PDFDocument.load(daten, { ignoreEncryption: true, updateMetadata: false });
  const zeilen = [];
  let abgelegt = 0, zuordnen = 0, doppelt = 0;
  for (const d of docs) {
    const neu = await PDFDocument.create();
    (await neu.copyPages(quelle, d.seiten)).forEach((p) => neu.addPage(p));
    const blob = new Blob([await neu.save({ useObjectStreams: false })], { type: "application/pdf" });
    const ordnerName = d.lieferant ? sauber(d.lieferant) : ZUORDNEN;
    const ordner = await h.getDirectoryHandle(ordnerName, { create: true });
    const seitenText = "S. " + (d.seiten[0] + 1) + (d.seiten.length > 1 ? "–" + (d.seiten[d.seiten.length - 1] + 1) : "");
    // Dieselbe Rechnungsnummer beim selben Lieferanten ist dieselbe Rechnung
    // (zweimal gescannt oder an zwei Geräten zugleich abgelegt): nicht doppelt
    // ablegen (Patrick 29. Oktober 2026: „warum 2 Dokumente aus der gleichen Rechnung?“)
    if (d.lieferant && d.nummer && (await gibt(ordner, dateiName(d, name)))) {
      lernen(liste, d.lieferant, d);
      doppelt++;
      zeilen.push(name + " " + seitenText + " → schon da: " + ordnerName + "\\" + dateiName(d, name));
      continue;
    }
    const ziel = await freierName(ordner, dateiName(d, name));
    await schreiben(ordner, ziel, blob);
    if (d.lieferant) {
      lernen(liste, d.lieferant, d);
      abgelegt++;
      zeilen.push(name + " " + seitenText + " → " + ordnerName + "\\" + ziel);
    } else {
      zuInfo[ziel] = { vorschlag: d.vorschlag, uids: d.uids, ibans: d.ibans, aus: name, seiten: seitenText };
      zuordnen++;
      zeilen.push(name + " " + seitenText + " → " + ZUORDNEN + "\\" + ziel + " (Lieferant nicht erkannt)");
    }
  }
  const originale = await h.getDirectoryHandle(ORIGINALE, { create: true });
  await verschieben(h, name, originale);
  return { abgelegt, zuordnen, doppelt, zeilen };
}

// ---------- Ganzer Ordner ----------

let laeuft = null;
export const krLaeuft = () => !!laeuft;

// Alle PDFs direkt im Ordner. sofort = auch ganz junge Dateien (Knopf)
export async function krSortieren(h, { sofort = false, fortschritt } = {}) {
  if (laeuft) return laeuft;
  laeuft = (async () => {
    const offen = [];
    for await (const [name, e] of h.entries()) {
      if (e.kind !== "file" || !/\.pdf$/i.test(name)) continue;
      const f = await e.getFile();
      if (!sofort && Date.now() - f.lastModified < RUHE_MS) continue;
      offen.push(name);
    }
    const ergebnis = { stapel: 0, abgelegt: 0, zuordnen: 0, doppelt: 0, fehler: [] };
    if (!offen.length) return ergebnis;
    const liste = await lieferantenLaden(h);
    const zuOrdner = await h.getDirectoryHandle(ZUORDNEN, { create: true });
    const zuInfo = await textLesen(zuOrdner, ZU_INFO, {});
    const zeilen = [];
    for (const name of offen.sort()) {
      if (fortschritt) fortschritt(name, ergebnis.stapel, offen.length);
      try {
        const l = await stapelAblegen(h, name, liste, zuInfo);
        ergebnis.stapel++;
        ergebnis.abgelegt += l.abgelegt;
        ergebnis.zuordnen += l.zuordnen;
        ergebnis.doppelt += l.doppelt;
        zeilen.push(...l.zeilen);
      } catch (f) {
        // Bleibt liegen und kommt beim nächsten Mal wieder (etwa wenn er offen war)
        ergebnis.fehler.push(name + ": " + alt.fehlertext(f));
        zeilen.push(name + ": nicht abgelegt, " + alt.fehlertext(f));
      }
    }
    await lieferantenSpeichern(h, liste);
    await schreiben(zuOrdner, ZU_INFO, JSON.stringify(zuInfo));
    try { await protokoll(h, zeilen); } catch (f) { /* Protokoll offen in einem Programm */ }
    return ergebnis;
  })();
  try { return await laeuft; } finally { laeuft = null; }
}

// ---------- Zuordnen von Hand ----------

export async function zuordnenListe(h) {
  const zuOrdner = await h.getDirectoryHandle(ZUORDNEN, { create: true });
  const info = await textLesen(zuOrdner, ZU_INFO, {});
  const aus = [];
  for await (const [name, e] of zuOrdner.entries()) {
    if (e.kind !== "file" || !/\.pdf$/i.test(name)) continue;
    aus.push(Object.assign({ name }, info[name] || {}));
  }
  return aus.sort((a, b) => (a.name > b.name ? 1 : -1));
}

export async function zuordnenDatei(h, name) {
  const zuOrdner = await h.getDirectoryHandle(ZUORDNEN);
  return (await zuOrdner.getFileHandle(name)).getFile();
}

// Legt eine Rechnung aus „_Zuordnen“ beim Lieferanten ab und lernt ihn
export async function zuordnen(h, name, lieferant) {
  lieferant = String(lieferant || "").trim();
  if (!sauber(lieferant)) throw new Error("Bitte einen Lieferanten eingeben.");
  const zuOrdner = await h.getDirectoryHandle(ZUORDNEN);
  const info = await textLesen(zuOrdner, ZU_INFO, {});
  const liste = await lieferantenLaden(h);
  const vorhanden = liste.find((l) => einfach(l.name) === einfach(lieferant));
  const l = lernen(liste, vorhanden ? vorhanden.name : lieferant, { uids: (info[name] || {}).uids, ibans: (info[name] || {}).ibans });
  // Den eingegebenen Namen auch als Text merken, falls er so auf der Rechnung steht
  if (!vorhanden && !l.text.includes(lieferant)) l.text.push(lieferant);
  const ziel = await h.getDirectoryHandle(sauber(l.name), { create: true });
  const neu = await verschieben(zuOrdner, name, ziel);
  delete info[name];
  await schreiben(zuOrdner, ZU_INFO, JSON.stringify(info));
  await lieferantenSpeichern(h, liste);
  try { await protokoll(h, [ZUORDNEN + "\\" + name + " → " + sauber(l.name) + "\\" + neu + " (von Hand)"]); } catch (f) { /* egal */ }
  return sauber(l.name) + "\\" + neu;
}

// ---------- Alle 2 Minuten von selbst ----------

let takt = null;
const darf = () => !!(alt.profil && (alt.istAdmin() || (alt.darfDokumenteUndSicherung && alt.darfDokumenteUndSicherung())));

async function pruefen() {
  if (laeuft || !darf()) return;
  const h = await krOrdnerHolen();
  if (!h) return;
  if ((await ordnerErlaubt(h, false)) !== "granted") return;
  try {
    const l = await krSortieren(h);
    if (l.stapel) {
      try { localStorage.setItem("hofer.kreditoren.zuletzt", JSON.stringify(Object.assign({ zeit: Date.now() }, l))); } catch (f) { /* egal */ }
    }
  } catch (f) {
    console.warn("Kreditorenrechnungen:", f);
  }
}

export function kreditorenWaechter() {
  if (takt || !kannOrdner) return;
  takt = setInterval(() => { pruefen().catch(() => {}); }, 2 * 60000);
  setTimeout(() => { pruefen().catch(() => {}); }, 45000);
}
