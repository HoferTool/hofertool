// =================================================================
//  SICHERUNG IM BROWSER — eine Datei mit allem, ohne Zusatzprogramm
//
//  Wunsch Patrick, 8. Oktober 2026: „ohne Zusatzprogramm; um die Zeit,
//  die ich einstelle, an den Ort, den ich einstelle, eine einzige Datei,
//  wo alles drin ist; Jetzt sichern; Zurückspielen mit Datei auswählen,
//  dann ist alles wieder wie im Backup“.
//
//  Eine Sicherung ist eine ZIP-Datei Hofer-Sicherung-JJJJ-MM-TT-HHMM.zip:
//    sicherung.json      Kopf: wann, wer, welche Tabellen und Dateien
//    tabellen/<t>.json   alle Zeilen einer Tabelle (aus sicherung_lesen,
//                        ein Augenblick für alle Tabellen)
//    dateien/<b>/<p>     jede hochgeladene Datei (WBGs, Bilder,
//                        Notizbuch-Seiten …), ausser Zeichnungen und
//                        Einrichtblätter (auch Vorlagen der Typen) und alter
//                        Dateien, die nirgends mehr gebraucht werden (seit 111.116.0,
//                        Wunsch Patrick 8. Oktober 2026: „alles sichern
//                        ausser Einrichtblätter und Zeichnungen, weil man
//                        das wieder hochladen kann per Aufgaben“): die
//                        liegen in den Ordnern am Pool-Rechner, und die
//                        Aufgabe „HoferTool“ lädt sie von dort hoch. Welche
//                        Dateien das sind, steht in den Tabellen
//                        (ohneDateien); im Kopf stehen sie unter
//                        „ausgelassen“, damit das Zurückspielen weiss,
//                        was nicht aus der Sicherung kommen kann.
//
//  Den Ordner wählt man einmal auf einem Gerät (Chrome oder Edge):
//  Ein Browser darf nicht von selbst in einen Ordner schreiben, nur in
//  einen, den man ihm gezeigt hat. Die Freigabe (FileSystemDirectoryHandle)
//  liegt im IndexedDB dieses Geräts. Dieses Gerät ist dann das
//  Sicherungsgerät (app_config.sicherung.geraet): Ist dort ein Admin oder
//  das gewählte Sicherungskonto angemeldet (app_config.sicherung.konto,
//  etwa "Planwand" auf dem Pool-Rechner, Wunsch Patrick 8. Oktober 2026,
//  braucht sql/sicherung-konto.sql), sichert die App ab der eingestellten
//  Stunde einmal am Tag (war sie zu, beim nächsten Öffnen) und löscht
//  Sicherungen, die älter sind als eingestellt; die neuesten drei bleiben.
//
//  Zurückspielen nutzt die Funktionen aus sql/sicherung.sql, die Admins
//  ohnehin dürfen: sicherung_puffern je Tabelle, dann sicherung_einspielen
//  ersetzt alles in einem Zug (scheitert etwas, bleibt alles wie vorher).
//  Danach kommen Dateien, die fehlen, aus der ZIP wieder hoch. Zeichnungen
//  und Einrichtblätter sind nicht in der ZIP: Fehlen sie in der Ablage,
//  meldet das Zurückspielen, wie viele, und sie müssen aus den Ordnern am
//  Pool-Rechner wieder hochgeladen werden.
// =================================================================
import { Zip, ZipDeflate, ZipPassThrough, inflateSync, strToU8, strFromU8 } from "fflate";
import { alt } from "../bruecke.jsx";

export const PRAEFIX = "Hofer-Sicherung-";
export const kannOrdner = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

// ---------- Gerät und Ordner-Freigabe ----------

export function geraetId() {
  try {
    let id = localStorage.getItem("hofer.sicherung.geraet");
    if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem("hofer.sicherung.geraet", id); }
    return id;
  } catch (f) { return "ohne-speicher"; }
}

export function geraetName() {
  const u = navigator.userAgent || "";
  const sys = /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iPad/iPhone" : "Gerät";
  const br = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : "Browser";
  const p = alt.profil || {};
  return (p.full_name ? p.full_name + ", " : "") + sys + " " + br;
}

function idb() {
  return new Promise((ok, nein) => {
    const r = indexedDB.open("hofer-sicherung", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("griffe");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nein(r.error);
  });
}
export async function idbTun(art, ...werte) {
  const d = await idb();
  return new Promise((ok, nein) => {
    const tx = d.transaction("griffe", art === "get" ? "readonly" : "readwrite");
    const r = tx.objectStore("griffe")[art](...werte);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nein(r.error);
  });
}

// Zusätzlich im Speicher: falls IndexedDB fehlt (privates Fenster), gilt
// die Wahl wenigstens bis zum Neuladen
let griffHier = null;
export async function ordnerHolen() {
  if (griffHier) return griffHier;
  try { return (await idbTun("get", "ordner")) || null; } catch (f) { return null; }
}

// Fragt nach dem Ordner (braucht einen Klick) und merkt ihn sich
export async function ordnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-sicherung", mode: "readwrite" });
  griffHier = h;
  try { await idbTun("put", h, "ordner"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

// "granted", "prompt" oder "denied". frage = true nur nach einem Klick.
export async function ordnerErlaubt(h, frage) {
  if (!h) return "fehlt";
  try {
    let s = await h.queryPermission({ mode: "readwrite" });
    if (s === "prompt" && frage) s = await h.requestPermission({ mode: "readwrite" });
    return s;
  } catch (f) { return "denied"; }
}

// Sicherungen im Ordner, neueste zuerst
export async function ordnerListe(h) {
  const liste = [];
  for await (const [name, e] of h.entries()) {
    if (e.kind !== "file" || !name.startsWith(PRAEFIX) || !name.endsWith(".zip")) continue;
    const f = await e.getFile();
    liste.push({ d: name, z: new Date(f.lastModified).toISOString(), mb: Math.round(f.size / 104857.6) / 10 });
  }
  return liste.sort((a, b) => (b.d > a.d ? 1 : b.d < a.d ? -1 : 0));
}

// Älter als eingestellt kommt weg, die neuesten drei bleiben immer
async function aufraeumen(h, tage) {
  const liste = await ordnerListe(h);
  const grenze = Date.now() - tage * 86400000;
  for (let i = 3; i < liste.length; i++) {
    const w = wannAusName(liste[i].d, liste[i].z);
    if (w && w.getTime() < grenze) { try { await h.removeEntry(liste[i].d); } catch (f) { /* bleibt eben */ } }
  }
}

// „Hofer-Sicherung-2026-10-06-1900.zip“ → Datum
export function wannAusName(name, ersatz) {
  const m = /(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)/.exec(name || "");
  if (!m) return ersatz ? new Date(ersatz) : null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

// ---------- Einstellung und Stand in app_config ----------

function jsonOder(text, ersatz) {
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

export async function konfLaden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
    .in("schluessel", ["sicherung", "sicherung_status"]), 8000, "Sicherung");
  if (r && r.error) throw r.error;
  const w = {};
  ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert, null); });
  return { konf: w.sicherung || {}, status: w.sicherung_status || null };
}

export async function konfSpeichern(konf) {
  const r = await alt.db.from("app_config").upsert([{ schluessel: "sicherung", wert: JSON.stringify(konf) }]);
  if (r.error) throw r.error;
}

async function statusMelden(teil) {
  let alt0 = null;
  try { alt0 = (await konfLaden()).status; } catch (f) { /* dann neu */ }
  const s = Object.assign({}, alt0 || {}, teil, { zeit: new Date().toISOString() });
  try {
    await alt.db.from("app_config").upsert([{ schluessel: "sicherung_status", wert: JSON.stringify(s) }]);
  } catch (f) { /* Anzeige ist nicht das Wichtigste */ }
  return s;
}

// ---------- Sichern ----------

const zwei = (n) => String(n).padStart(2, "0");
function dateiName(d, grund) {
  return PRAEFIX + d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate()) + "-"
    + zwei(d.getHours()) + zwei(d.getMinutes()) + (grund === "vorher" ? "-vor-Zurueckspielen" : "") + ".zip";
}

let laeuft = null;
export const sicherungLaeuft = () => !!laeuft;

// Aus der öffentlichen Adresse einer Datei Ablage und Pfad:
// …/storage/v1/object/public/zeichnungen/dok/123-abc.pdf → "zeichnungen|dok/123-abc.pdf"
function ablageSchluessel(adresse) {
  const m = /\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/.exec(String(adresse || ""));
  if (!m) return null;
  try { return m[1] + "|" + decodeURIComponent(m[2]); } catch (f) { return m[1] + "|" + m[2]; }
}

// Welche Dateien nicht in die Sicherung gehören (Wunsch Patrick, 8. und
// 9. Oktober 2026: „einfach keine Zeichnungen, auch Master-Zeichnungen,
// und alles, was mit Excel-Einrichtblättern zu tun hat“): Zeichnungen
// (Stammdaten, Aufträge, Dokumentenpool), Einrichtblätter (je HOCO Nr.
// und Typ, Vorlagen der Typen, Dokumentenpool) und
// alte Dateien in der Ablage „zeichnungen“, auf die keine Tabelle mehr
// verweist (ersetzte Zeichnungen und Einrichtblätter aus dem Umzug und
// von der Aufgabe; die App selbst gilt sie als löschbar, siehe
// dateiNochVerwendet). Ob eine Datei noch gebraucht wird, zeigt ein
// Blick in alle gesicherten Tabellen: Jede Adresse in irgendeinem Feld
// zählt, auch in Tabellen, die es heute noch nicht gibt. Gibt Map
// "ablage|pfad" → Art zurück
// ("zeichnung", "einrichtblatt" oder "alt").
export function ohneDateien(tabellen, dateien) {
  const ohne = new Map();
  const merke = (adresse, art) => { const k = ablageSchluessel(adresse); if (k && !ohne.has(k)) ohne.set(k, art); };
  const zeilen = (t) => { const x = (tabellen || []).find((y) => y && y.t === t); return (x && x.zeilen) || []; };
  zeilen("hoco_parts").forEach((z) => merke(z.zeichnung_url, "zeichnung"));
  zeilen("jobs").forEach((z) => merke(z.drawing_url, "zeichnung"));
  zeilen("hoco_type_data").forEach((z) => merke(z.blatt_url, "einrichtblatt"));
  zeilen("machine_types").forEach((z) => merke(z.blatt_url, "einrichtblatt"));
  zeilen("dokumente").forEach((z) => {
    if (z.art === "zeichnung") merke(z.datei_url, "zeichnung");
    else if (z.art === "einrichtblatt") merke(z.datei_url, "einrichtblatt");
  });
  // Alles, worauf irgendeine Tabelle verweist, egal in welchem Feld
  const verwendet = new Set();
  const muster = /\/object\/(?:public|sign|authenticated)\/[^/?#"\\]+\/[^?#"\\]+/g;
  for (const t of tabellen || []) {
    const text = JSON.stringify((t && t.zeilen) || []);
    let m;
    while ((m = muster.exec(text))) { const k = ablageSchluessel(m[0]); if (k) verwendet.add(k); }
  }
  for (const d of dateien || []) {
    if (!d || d.b !== "zeichnungen") continue;
    const k = d.b + "|" + d.p;
    if (!ohne.has(k) && !verwendet.has(k)) ohne.set(k, "alt");
  }
  return ohne;
}

// Zählt, wie viele Zeichnungen, Einrichtblätter und alte Dateien in einer Liste stehen
export function ohneZaehlen(liste) {
  const n = { zeichnungen: 0, einrichtblaetter: 0, alt: 0 };
  (liste || []).forEach((o) => { if (o.art === "einrichtblatt") n.einrichtblaetter++; else if (o.art === "alt") n.alt++; else n.zeichnungen++; });
  return n;
}

// fortschritt(text) meldet, wie weit es ist. Gibt { datei, mb, zeilen, dateien, fehlt } zurück.
export async function sichern(h, grund, fortschritt) {
  if (laeuft) throw new Error("Es läuft schon eine Sicherung.");
  laeuft = (async () => {
    const melde = (t) => { try { if (fortschritt) fortschritt(t); } catch (f) { /* egal */ } };
    melde("Daten werden gelesen …");
    const r = await alt.db.rpc("sicherung_lesen");
    if (r.error) throw r.error;
    const tabellen = (r.data || []).filter((x) => x && x.t);
    if (!tabellen.length) throw new Error("Die Datenbank hat keine Tabellen geliefert (sql/sicherung.sql ausgeführt?).");
    const d = await alt.db.rpc("sicherung_dateien");
    if (d.error) throw d.error;
    const alle = (d.data || []).filter((x) => x && x.b && x.p);
    // Zeichnungen, Einrichtblätter und alte Dateien bleiben draussen (Wunsch Patrick, 8. und 9. Oktober 2026)
    const ohne = ohneDateien(tabellen, alle);
    const liste = alle.filter((x) => !ohne.has(x.b + "|" + x.p));
    const ausgelassen = alle.filter((x) => ohne.has(x.b + "|" + x.p)).map((x) => ({ b: x.b, p: x.p, art: ohne.get(x.b + "|" + x.p) }));
    const ohneZahl = ohneZaehlen(ausgelassen);

    const jetzt = new Date();
    let name = dateiName(jetzt, grund);
    // Erst unter anderem Namen schreiben, damit nie eine halbe Sicherung in der Liste steht
    const halb = name + ".teil";
    const dateiGriff = await h.getFileHandle(halb, { create: true });
    const aus = await dateiGriff.createWritable();
    let kette = Promise.resolve();
    let schreibFehler = null;
    const zip = new Zip((f, stueck, ende) => {
      if (f) { schreibFehler = f; return; }
      kette = kette.then(() => aus.write(stueck)).catch((e) => { schreibFehler = e; });
      if (ende) kette = kette.then(() => aus.close());
    });
    const eintragen = async (pfad, daten, packen) => {
      const e = packen ? new ZipDeflate(pfad, { level: 6 }) : new ZipPassThrough(pfad);
      zip.add(e);
      e.push(daten, true);
      // Nicht zu viel im Speicher stauen lassen
      await kette;
      if (schreibFehler) throw schreibFehler;
    };

    let zeilen = 0;
    const kopfTabellen = tabellen.map((x) => { zeilen += x.nr || 0; return { t: x.t, n: x.nr || 0 }; });
    await eintragen("sicherung.json", strToU8(JSON.stringify({ art: "hofer-sicherung", version: 2,
      erstellt: jetzt.toISOString(), geraet: geraetName(), grund, tabellen: kopfTabellen, dateien: liste, ausgelassen }, null, 1)), true);
    for (const x of tabellen) await eintragen("tabellen/" + x.t + ".json", strToU8(JSON.stringify(x.zeilen || [])), true);

    let n = 0, fehlt = 0;
    for (const o of liste) {
      n++;
      if (n % 10 === 1) melde("Dateien " + n + " von " + liste.length + " …");
      try {
        const b = await alt.db.storage.from(o.b).download(o.p);
        if (b.error || !b.data) throw b.error || new Error("leer");
        await eintragen("dateien/" + o.b + "/" + o.p, new Uint8Array(await b.data.arrayBuffer()), false);
      } catch (f) {
        if (schreibFehler) throw schreibFehler;
        fehlt++;
      }
    }
    zip.end();
    await kette;
    if (schreibFehler) throw schreibFehler;

    // Fertig: auf den richtigen Namen umbenennen (move gibt es nicht überall)
    let ziel = name;
    for (let i = 2; ; i++) {
      try { await h.getFileHandle(ziel); ziel = name.replace(/\.zip$/, "-" + i + ".zip"); } catch (f) { break; }
    }
    if (typeof dateiGriff.move === "function") {
      await dateiGriff.move(ziel);
    } else {
      const f = await dateiGriff.getFile();
      const w = await (await h.getFileHandle(ziel, { create: true })).createWritable();
      await f.stream().pipeTo(w);
      await h.removeEntry(halb);
    }
    const groesse = (await (await h.getFileHandle(ziel)).getFile()).size;
    return { zeit: jetzt.toISOString(), datei: ziel, mb: Math.round(groesse / 104857.6) / 10, tabellen: tabellen.length,
      zeilen, dateien: liste.length - fehlt, fehlt, ohneZeichnungen: ohneZahl.zeichnungen, ohneEinrichtblaetter: ohneZahl.einrichtblaetter, ohneAlt: ohneZahl.alt,
      grund, geraet: geraetName() };
  })();
  try { return await laeuft; } finally { laeuft = null; }
}

// Sichern, aufräumen und den Stand für alle Geräte melden
export async function sichernUndMelden(h, grund, fortschritt, tage) {
  try {
    const l = await sichern(h, grund, fortschritt);
    try { await aufraeumen(h, tage || 30); } catch (f) { /* nächstes Mal */ }
    let liste = [];
    try { liste = (await ordnerListe(h)).slice(0, 100); } catch (f) { /* leer */ }
    await statusMelden({ letzte: l, fehler: null, liste, geraet: geraetName(), ordner: h.name });
    return l;
  } catch (f) {
    await statusMelden({ fehler: alt.fehlertext(f), geraet: geraetName() });
    throw f;
  }
}

// ---------- ZIP lesen, ohne alles in den Speicher zu laden ----------

async function zipInhalt(datei) {
  const groesse = datei.size;
  const hinten = new Uint8Array(await datei.slice(Math.max(0, groesse - 65558)).arrayBuffer());
  const dv = new DataView(hinten.buffer);
  let e = -1;
  for (let i = hinten.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("Das ist keine ZIP-Datei.");
  const anzahl = dv.getUint16(e + 10, true);
  const cdGroesse = dv.getUint32(e + 12, true);
  const cdAb = dv.getUint32(e + 16, true);
  const cd = new Uint8Array(await datei.slice(cdAb, cdAb + cdGroesse).arrayBuffer());
  const c = new DataView(cd.buffer);
  const eintraege = new Map();
  let p = 0;
  for (let i = 0; i < anzahl; i++) {
    if (c.getUint32(p, true) !== 0x02014b50) throw new Error("Die ZIP-Datei ist beschädigt.");
    const art = c.getUint16(p + 10, true);
    const gepackt = c.getUint32(p + 20, true);
    const nl = c.getUint16(p + 28, true), xl = c.getUint16(p + 30, true), kl = c.getUint16(p + 32, true);
    const lokal = c.getUint32(p + 42, true);
    const name = strFromU8(cd.subarray(p + 46, p + 46 + nl));
    eintraege.set(name, { art, gepackt, lokal });
    p += 46 + nl + xl + kl;
  }
  const lesen = async (name) => {
    const x = eintraege.get(name);
    if (!x) return null;
    const k = new DataView(await datei.slice(x.lokal, x.lokal + 30).arrayBuffer());
    const ab = x.lokal + 30 + k.getUint16(26, true) + k.getUint16(28, true);
    const roh = new Uint8Array(await datei.slice(ab, ab + x.gepackt).arrayBuffer());
    return x.art === 8 ? inflateSync(roh) : roh;
  };
  return { eintraege, lesen };
}

// Kopf einer Sicherung lesen (zum Nachfragen vor dem Zurückspielen)
export async function sicherungKopf(datei) {
  const z = await zipInhalt(datei);
  const k = await z.lesen("sicherung.json");
  if (!k) throw new Error("Das ist keine Sicherung des Hofer Tools.");
  const kopf = JSON.parse(strFromU8(k));
  if (kopf.art !== "hofer-sicherung") throw new Error("Das ist keine Sicherung des Hofer Tools.");
  return { kopf, z };
}

// ---------- Zurückspielen ----------

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export async function zurueckspielen(datei, fortschritt) {
  const melde = (t) => { try { if (fortschritt) fortschritt(t); } catch (f) { /* egal */ } };
  const { kopf, z } = await sicherungKopf(datei);
  const lauf = uuid();
  let i = 0;
  for (const t of kopf.tabellen) {
    i++;
    melde("Tabelle " + i + " von " + kopf.tabellen.length + " wird hochgeladen …");
    const roh = await z.lesen("tabellen/" + t.t + ".json");
    if (!roh) throw new Error("In der Sicherung fehlt die Tabelle " + t.t + ".");
    const r = await alt.db.rpc("sicherung_puffern", { p_lauf: lauf, p_tabelle: t.t, p_zeilen: JSON.parse(strFromU8(roh)) });
    if (r.error) throw r.error;
  }
  melde("Alles wird ersetzt …");
  const e = await alt.db.rpc("sicherung_einspielen", { p_lauf: lauf, p_tabellen: kopf.tabellen });
  if (e.error) throw e.error;
  const antw = e.data || {};

  // Dateien, die es nicht mehr gibt, wieder hochladen
  const jetzt = new Set();
  let listeDa = false;
  try {
    const d = await alt.db.rpc("sicherung_dateien");
    if (d.error) throw d.error;
    (d.data || []).forEach((x) => jetzt.add(x.b + "|" + x.p));
    listeDa = true;
  } catch (f) { /* dann eben alle versuchen */ }
  let wieder = 0, fehlt = 0, n = 0;
  const fehlend = (kopf.dateien || []).filter((o) => o && !jetzt.has(o.b + "|" + o.p));
  for (const o of fehlend) {
    n++;
    if (n % 10 === 1) melde("Dateien " + n + " von " + fehlend.length + " werden hochgeladen …");
    try {
      const daten = await z.lesen("dateien/" + o.b + "/" + o.p);
      if (!daten) throw new Error("nicht in der Sicherung");
      const r = await alt.db.storage.from(o.b).upload(o.p, new Blob([daten], { type: o.a || "application/octet-stream" }),
        { contentType: o.a || "application/octet-stream", upsert: true });
      if (r.error) throw r.error;
      wieder++;
    } catch (f) { fehlt++; }
  }
  // Zeichnungen und Einrichtblätter waren nicht in der Sicherung: Welche
  // davon fehlen jetzt in der Ablage? (Alte Dateien braucht niemand.)
  const ohneFehlt = ohneZaehlen(listeDa ? (kopf.ausgelassen || []).filter((o) => o && o.b && o.p && o.art !== "alt" && !jetzt.has(o.b + "|" + o.p)) : []);
  return { tabellen: antw.tabellen, zeilen: antw.zeilen, ohneKonto: antw.ohne_konto, dateien: wieder, dateienFehlt: fehlt,
    ohneZeichnungen: ohneFehlt.zeichnungen, ohneEinrichtblaetter: ohneFehlt.einrichtblaetter, stand: kopf.erstellt };
}

// ---------- Täglich von selbst ----------
//  Läuft auf jedem Gerät nach der Anmeldung, tut aber nur etwas auf dem
//  Sicherungsgerät, wenn ein Admin, Planwand oder das Sicherungskonto angemeldet
//  ist. Fehlt die Freigabe für den Ordner (der Browser fragt nach einem
//  Neustart manchmal neu), zeigt die App unten links einen Knopf
//  „Sicherung: Ordner freigeben“; ein Tipp darauf genügt, auch ohne Admin.

let takt = null;
let letzterVersuch = 0;
let hinweisGezeigt = false;

async function pruefen() {
  if (laeuft || !alt.db || !alt.profil) return;
  if (Date.now() - letzterVersuch < 60 * 60000) return;
  let k;
  try { k = await konfLaden(); } catch (f) { return; }
  const konf = k.konf || {};
  if (!konf.geraet || konf.geraet.id !== geraetId()) return;
  // Admins, das Konto Planwand (9. Oktober 2026) oder das gewählte Sicherungskonto
  const darf = (alt.darfDokumenteUndSicherung ? alt.darfDokumenteUndSicherung() : alt.istAdmin()) || (konf.konto && konf.konto === alt.profil.id);
  if (!darf) return;
  const stunde = konf.stunde ?? 18;
  const letzte = k.status && k.status.letzte && k.status.letzte.zeit ? new Date(k.status.letzte.zeit) : null;
  const jetzt = new Date();
  const heuteAb = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde);
  const faellig = !letzte || (jetzt - letzte) >= 24 * 3600000 || (jetzt >= heuteAb && letzte < heuteAb);
  if (!faellig) return;
  const h = await ordnerHolen();
  const erlaubt = await ordnerErlaubt(h, false);
  if (erlaubt !== "granted") {
    if (erlaubt === "prompt") freigabeKnopf(h);
    else if (!hinweisGezeigt) {
      hinweisGezeigt = true;
      alt.meldung("Sicherung fällig, aber der Ordner fehlt auf diesem Gerät. Ein Admin wählt ihn unter Einstellungen → Backup.", "warn");
    }
    return;
  }
  freigabeKnopfWeg();
  letzterVersuch = Date.now();
  try {
    await sichernUndMelden(h, "taeglich", null, konf.behalten || 30);
  } catch (f) {
    console.warn("Sicherung:", f);
  }
}

// Der Browser gibt den Ordner nur nach einem Tipp frei (nach einem
// Neustart von Chrome manchmal nötig). Darum ein Knopf unten links.
function freigabeKnopf(h) {
  if (document.getElementById("si-freigeben")) return;
  const k = document.createElement("button");
  k.id = "si-freigeben";
  k.className = "knopf knopf--klein si-freigeben";
  k.textContent = "Sicherung: Ordner freigeben";
  k.onclick = async () => {
    if ((await ordnerErlaubt(h, true)) === "granted") {
      freigabeKnopfWeg();
      letzterVersuch = 0;
      pruefen().catch(() => {});
    }
  };
  document.body.appendChild(k);
}
function freigabeKnopfWeg() {
  const k = document.getElementById("si-freigeben");
  if (k) k.remove();
}

export function sicherungWaechter() {
  if (takt || !kannOrdner) return;
  takt = setInterval(() => { pruefen().catch(() => {}); }, 5 * 60000);
  setTimeout(() => { pruefen().catch(() => {}); }, 15000);
}
