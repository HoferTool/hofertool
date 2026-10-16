// =================================================================
//  EINRICHTBLATT IN DER APP: Daten
//  Ein Blatt je HOCO Nr. und Maschinentyp in einrichtblatt_app
//  (sql/einrichtblatt-app.sql). Was zur HOCO Nr. gehört (Artikel-
//  Bezeichnung, Zeichnungs-Nr., Index, Waschgebinde) steht in den
//  Stammdaten hoco_parts, Stückzeit und Stück am Abend je Typ in
//  hoco_type_data; das Blatt zeigt sie nur (Wunsch Patrick, 12. Oktober
//  2026: „Infos zu Stammdaten hinzufügen, der Rest typspezifisch“).
// =================================================================
import { alt } from "../bruecke.jsx";
import { excelRoh, blattAusExcel } from "./excelEinlesen.js";
import { eigeneBilderSetzen } from "./bilder.js";

export const TABELLE = "einrichtblatt_app";

// Die Felder eines Platzes, in dieser Reihenfolge auf dem Blatt
export const PLATZ_FELDER = ["standzeit", "taetigkeit", "mass", "hersteller", "werkzeug"];
export const STAMM_FELDER = [
  ["bezeichnung", "Artikel-Bezeichnung"],
  ["zeichnungs_nr", "Zeichnungs-Nr."],
  ["index_nr", "Index"],
  ["waschgebinde", "Waschgebinde"],
];
// Wie in der Auswahl im bisherigen Excel (Tabelle2)
export const WASCHGEBINDE = ["Typ 1 fein", "Typ 1 mittel", "Typ 1 grob", "Typ 2 fein", "Typ 2 mittel",
  "Typ 2 grob", "Typ 3 fein", "Typ 3 mittel", "Typ 3 grob", "Typ 4 fein", "Typ 4 grob", "direkt in Renfer"];

// Fehlt die Tabelle noch (SQL nicht ausgeführt), ist das kein Fehler:
// dann gibt es eben noch keine Blätter in der App.
export const tabelleFehlt = (f) => !!f && /einrichtblatt_app|relation .* does not exist|schema cache/i.test(String(f.message || f));

export async function blattSuchen(hocoNr, typId) {
  if (!hocoNr || !typId) return null;
  try {
    const r = await alt.db.from(TABELLE).select("*").eq("hoco_nr", hocoNr).eq("type_id", typId).limit(1);
    if (r.error) return null;
    return (r.data || [])[0] || null;
  } catch (f) { return null; }
}

// Alles, was das Blatt zum Zeichnen braucht
export async function blattLaden(hocoNr, typId) {
  const db = alt.db;
  const [blatt, typen, paths, teil, typDaten, artikelBilder] = await Promise.all([
    blattSuchen(hocoNr, typId),
    alt.ladeTypen(),
    alt.ladeTypAufbau(typId),
    db.from("hoco_parts").select("*").eq("hoco_nr", hocoNr).limit(1).then((r) => (r.data || [])[0] || null),
    db.from("hoco_type_data").select("*").eq("hoco_nr", hocoNr).eq("type_id", typId).limit(1)
      .then((r) => (r.data || [])[0] || null),
    artikelBilderLaden(),
    eigeneBilderLaden(),
  ]);
  const typ = (typen || []).find((t) => t.id === typId) || { id: typId, name: "" };
  // blatt_aufbau holt die gemerkte Typenliste nicht unbedingt mit
  if (typ.blatt_aufbau === undefined) {
    try {
      const r = await db.from("machine_types").select("blatt_aufbau").eq("id", typId).limit(1);
      if (!r.error) typ.blatt_aufbau = ((r.data || [])[0] || {}).blatt_aufbau || null;
    } catch (f) { /* ohne Aufbau ordnet die App selbst */ }
  }
  return { blatt, typ, paths: paths || [], teil: teil || { hoco_nr: hocoNr }, typDaten: typDaten || {}, artikelBilder };
}

// Programm-Nr.: die letzten drei Ziffern der Programme im Werkzeug-
// protokoll (Patrick, 15. Oktober 2026: SW 1236, 2236, 3236 für die Paths
// und 4236 für die Geometriedaten, andere 0236 und 1236, Prg.-Nr. 236).
// Jeder Typ zählt eigen, mit der HOCO Nr. hat sie nichts zu tun. Selten
// hat eine HOCO Nr. auf demselben Typ zwei, dann stehen beide da.
// Gespeichert unter programme.nr; fehlt sie, kommt sie aus den Programmen.
export function prgNummern(blatt) {
  const pr = (blatt && blatt.programme) || {};
  if (pr.nr) return String(pr.nr);
  const quellen = Object.entries(pr).filter(([k]) => k !== "nr").map(([, v]) => v)
    .concat(blatt && blatt.geometrie ? [blatt.geometrie] : []);
  const nummern = [];
  quellen.forEach((v) => (String(v || "").match(/\d{3,}/g) || []).forEach((z) => {
    const n = z.slice(-3);
    if (nummern.indexOf(n) === -1) nummern.push(n);
  }));
  return nummern.join(", ");
}

// Ein leeres Blatt für die HOCO Nr. auf diesem Typ
export function leeresBlatt(hocoNr, typId) {
  return { hoco_nr: hocoNr, type_id: typId, programme: {}, geometrie: null, maschine_nr: null,
    bemerkung: null, plaetze: {}, excel_url: null, gut_am: null };
}

const SPALTEN = ["programme", "geometrie", "maschine_nr", "bemerkung", "plaetze", "excel_url", "gut_am", "gut_von"];

// Speichern mit Rückgängig. Gibt die gespeicherte Zeile zurück.
export async function blattSpeichern(blatt, text) {
  const db = alt.db;
  const vorher = await alt.rueckSichern(TABELLE, { hoco_nr: blatt.hoco_nr, type_id: blatt.type_id });
  const daten = { hoco_nr: blatt.hoco_nr, type_id: blatt.type_id };
  SPALTEN.forEach((s) => { if (blatt[s] !== undefined) daten[s] = blatt[s]; });
  const r = await db.from(TABELLE).upsert([daten], { onConflict: "hoco_nr,type_id" }).select();
  if (r.error) {
    if (tabelleFehlt(r.error)) throw new Error("Die Datenbank kennt das Einrichtblatt in der App noch nicht (sql/einrichtblatt-app.sql).");
    throw r.error;
  }
  const neu = (r.data || [])[0] || daten;
  const alt0 = vorher[0];
  if (text) {
    alt.merkeSchritt(text, alt0
      ? alt.rueckSetz(TABELLE, Object.fromEntries(SPALTEN.map((s) => [s, alt0[s] === undefined ? null : alt0[s]])),
          { hoco_nr: blatt.hoco_nr, type_id: blatt.type_id })
      : alt.rueckWeg(TABELLE, { hoco_nr: blatt.hoco_nr, type_id: blatt.type_id }));
  }
  return neu;
}

// Stammdaten der HOCO Nr. ändern (nur, was sich geändert hat)
export async function stammSpeichern(hocoNr, alteWerte, neueWerte) {
  const neu = {};
  STAMM_FELDER.forEach(([f]) => {
    if (neueWerte[f] === undefined) return;          // nicht gefragt: bleibt
    const w = (neueWerte[f] || "").trim() || null;
    if (w !== ((alteWerte && alteWerte[f]) || null)) neu[f] = w;
  });
  if (!Object.keys(neu).length) return false;
  const vorher = await alt.rueckSichern("hoco_parts", { hoco_nr: hocoNr });
  let r;
  if (vorher.length) r = await alt.db.from("hoco_parts").update(neu).eq("hoco_nr", hocoNr);
  else r = await alt.db.from("hoco_parts").insert([Object.assign({ hoco_nr: hocoNr }, neu)]);
  if (r.error) throw r.error;
  alt.merkeSchritt("Stammdaten " + hocoNr, vorher.length
    ? alt.rueckSetz("hoco_parts", Object.fromEntries(Object.keys(neu).map((f) => [f, vorher[0][f] === undefined ? null : vorher[0][f]])), { hoco_nr: hocoNr })
    : alt.rueckWeg("hoco_parts", { hoco_nr: hocoNr }));
  try { alt.stammVergessen && alt.stammVergessen(); } catch (f) { /* nur das Gedächtnis */ }
  return true;
}

// Gemerkte Bilder (sql/einrichtblatt-bilder.sql): { article_id: Schlüssel,
// "s:<Spezialwerkzeug>": Schlüssel }. Fehlt die Tabelle, gibt es eben keine.
export async function artikelBilderLaden() {
  const aus = {};
  try {
    const r = await alt.db.from("artikel_bild").select("article_id, bild");
    if (!r.error) (r.data || []).forEach((z) => { aus[z.article_id] = z.bild; });
  } catch (f) { /* keine */ }
  (await spezialLaden()).forEach((s) => { if (s.bild) aus["s:" + s.id] = s.bild; });
  return aus;
}

// Spezialwerkzeuge: füllen einen Platz wie ein Artikel, sind aber kein
// Artikel und erscheinen nicht beim Bestellen (Wunsch Patrick,
// 15. Oktober 2026). Tabelle eb_spezial.
const spezialFehlt = (f) => /eb_spezial|does not exist|schema cache/i.test(String((f && f.message) || f || ""));
export async function spezialLaden() {
  try {
    const r = await alt.db.from("eb_spezial").select("id, name, hersteller, bild").order("name");
    return r.error ? [] : (r.data || []);
  } catch (f) { return []; }
}
export async function spezialAnlegen(name, hersteller) {
  const r = await alt.db.from("eb_spezial").insert([{ name, hersteller: hersteller || null }]).select();
  if (r.error) {
    if (spezialFehlt(r.error)) throw new Error("Die Datenbank kennt die Spezialwerkzeuge noch nicht (sql/einrichtblatt-bilder.sql).");
    throw r.error;
  }
  return (r.data || [])[0];
}
export async function spezialBildSetzen(id, bild) {
  const r = await alt.db.from("eb_spezial").update({ bild: bild || null }).eq("id", id);
  if (r.error) throw r.error;
}

// Eigene Bilder der Bibliothek (Tabelle eb_bilder, Wunsch Patrick
// 13. Oktober 2026: „soll auch die Option haben, weitere Bilder per App
// hochzuladen“). Fehlt die Tabelle, gibt es eben keine.
export async function eigeneBilderLaden() {
  try {
    const r = await alt.db.from("eb_bilder").select("id, name, url").order("erstellt_am");
    if (!r.error) eigeneBilderSetzen(r.data || []);
  } catch (f) { /* dann keine */ }
}

// Verkleinert auf höchstens 480 Pixel, damit das Blatt schnell lädt
async function verkleinern(datei) {
  try {
    const bild = await createImageBitmap(datei);
    const f = Math.min(1, 480 / Math.max(bild.width, bild.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bild.width * f); c.height = Math.round(bild.height * f);
    c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
    if (blob) return blob;
  } catch (f) { /* dann das Original */ }
  return datei;
}

// Hochladen, in die Bibliothek eintragen, Schlüssel zurückgeben
export async function eigenesBildHochladen(datei) {
  const blob = await verkleinern(datei);
  const daten = new Uint8Array(await blob.arrayBuffer());
  let name;
  try {
    const h = await crypto.subtle.digest("SHA-256", daten);
    name = [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (f) { name = Date.now() + "-" + Math.random().toString(36).slice(2, 8); }
  const pfad = "einrichtblatt/bilder/" + name + ".png";
  const ablage = alt.db.storage.from("zeichnungen");
  const r = await ablage.upload(pfad, blob, { upsert: true, contentType: blob.type || "image/png" });
  if (r.error && !/exist/i.test(String(r.error.message || ""))) throw r.error;
  const url = ablage.getPublicUrl(pfad).data.publicUrl;
  const e = await alt.db.from("eb_bilder").insert([{ name: String(datei.name || "Eigenes Bild").replace(/\.[^.]+$/, ""), url, pfad }]).select();
  if (e.error) {
    if (/eb_bilder|does not exist|schema cache/i.test(String(e.error.message || "")))
      throw new Error("Die Datenbank kennt die eigenen Bilder noch nicht (sql/einrichtblatt-bilder.sql).");
    throw e.error;
  }
  await eigeneBilderLaden();
  return "eigen:" + ((e.data || [])[0] || {}).id;
}

export async function eigenesBildLoeschen(id) {
  const r = await alt.db.from("eb_bilder").select("pfad").eq("id", id).limit(1);
  const pfad = ((r.data || [])[0] || {}).pfad;
  const d = await alt.db.from("eb_bilder").delete().eq("id", id);
  if (d.error) throw d.error;
  if (pfad) { try { await alt.db.storage.from("zeichnungen").remove([pfad]); } catch (f) { /* bleibt eben liegen */ } }
  await eigeneBilderLaden();
}

// Ab jetzt hat dieser Artikel überall dieses Bild (null nimmt es weg)
export async function artikelBildSetzen(articleId, bild) {
  const r = bild
    ? await alt.db.from("artikel_bild").upsert([{ article_id: articleId, bild }], { onConflict: "article_id" })
    : await alt.db.from("artikel_bild").delete().eq("article_id", articleId);
  if (r.error) {
    if (/artikel_bild|does not exist|schema cache/i.test(String(r.error.message || "")))
      throw new Error("Die Datenbank kennt die Bilder am Artikel noch nicht (sql/einrichtblatt-bilder.sql).");
    throw r.error;
  }
}

// ---------------- Einlesen aus Excel ----------------

// Ein Excel-Blatt einlesen. Legt das Blatt in der App an, füllt leere
// Stammdaten und leere Werte je Typ und meldet Abweichungen. Bestehende
// Blätter in der App bleiben, ausser ueberschreiben ist gesetzt.
// Gibt { ok, hoco, hinweise, blatt } zurück.
// Artikelnummer im Werkzeugtext finden („Art.553692 1.50mm“), damit
// der Platz gleich am Artikel hängt und dessen Bild bekommt
const nrKurz = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export async function artikelFuerText() {
  const r = await alt.db.from("articles").select("id, article_number, supplier_id");
  const liste = (r.data || []).map((a) => ({ id: a.id, nr: nrKurz(a.article_number) })).filter((a) => a.nr.length >= 4);
  liste.sort((a, b) => b.nr.length - a.nr.length);
  return (text) => {
    const woerter = String(text || "").split(/[\s,;/]+/).map((w) => nrKurz(w.replace(/^art\.?/i, ""))).filter(Boolean);
    const ganz = nrKurz(text);
    const a = liste.find((x) => woerter.includes(x.nr)) || liste.find((x) => x.nr.length >= 8 && ganz.includes(x.nr));
    return a ? a.id : null;
  };
}

export async function ausExcelEinlesen(hocoNr, typ, excelUrl, { ueberschreiben, artikel } = {}) {
  const hinweise = [];
  const db = alt.db;
  if (!ueberschreiben) {
    const da = await blattSuchen(hocoNr, typ.id);
    if (da) return { ok: true, hoco: hocoNr, schon: true, hinweise: ["schon in der App, nicht neu eingelesen"] };
  }
  const antwort = await fetch(excelUrl);
  if (!antwort.ok) throw new Error("Excel nicht erreichbar (" + antwort.status + ")");
  const roh = await excelRoh(new Uint8Array(await antwort.arrayBuffer()));
  const e = blattAusExcel(roh);
  hinweise.push(...e.hinweise);
  if (e.hoco && e.hoco.replace(/\s/g, "") !== hocoNr) hinweise.push("Im Blatt steht HOCO Nr. " + e.hoco);
  const typKurz = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (e.autom && !typKurz(typ.name).includes(typKurz(e.autom)) && !typKurz(e.autom).includes(typKurz(typ.name))) hinweise.push("Im Blatt steht Typ " + e.autom);

  // Plätze: nur die Felder des Blatts. Die Fotos aus dem Excel kommen
  // bewusst nicht mit (verpixelt), das Bild kommt aus der Bibliothek.
  const plaetze = {};
  for (const [nr, p] of Object.entries(e.plaetze)) {
    const z = {};
    PLATZ_FELDER.forEach((f) => { if (p[f] !== undefined && p[f] !== "") z[f] = p[f]; });
    if (p.hd) z.hd = true;
    if (z.werkzeug) {
      try {
        const gemerkt = artikel || {};
        if (!gemerkt.finden) gemerkt.finden = artikelFuerText();
        const id = (await gemerkt.finden)(z.werkzeug);
        if (id) z.article_id = id;
      } catch (f) { /* dann ohne Artikel */ }
    }
    if (Object.keys(z).length) plaetze[nr] = z;
  }

  // Die Prg.-Nr. liest prgNummern jedes Mal aus den Programmen, gespeichert
  // wird sie nur, wenn jemand sie bei den Stammdaten ändert
  const programme = Object.assign({}, e.kopf.programme);
  const blatt = await blattSpeichern({ hoco_nr: hocoNr, type_id: typ.id, programme,
    geometrie: e.kopf.geometrie, maschine_nr: e.kopf.maschine_nr, bemerkung: e.kopf.bemerkung,
    plaetze, excel_url: excelUrl }, null);

  // Stammdaten: leere Felder füllen, Abweichungen melden (die Person
  // bestätigt sie beim Öffnen sowieso jedes Mal)
  const teil = await db.from("hoco_parts").select("*").eq("hoco_nr", hocoNr).limit(1).then((r) => (r.data || [])[0] || null);
  const fuellen = {};
  for (const [f, name] of STAMM_FELDER) {
    const x = e.stamm[f];
    if (!x) continue;
    const jetzt = teil && teil[f];
    if (!jetzt) fuellen[f] = x;
    else if (String(jetzt).trim() !== x) hinweise.push(name + ": App „" + jetzt + "“, Excel „" + x + "“");
  }
  if (Object.keys(fuellen).length) {
    const r = teil ? await db.from("hoco_parts").update(fuellen).eq("hoco_nr", hocoNr)
      : await db.from("hoco_parts").insert([Object.assign({ hoco_nr: hocoNr }, fuellen)]);
    if (r.error) hinweise.push("Stammdaten nicht ergänzt: " + alt.fehlertext(r.error));
  }
  if (e.stamm.material && teil && teil.material) {
    const m = [teil.material, teil.material_groesse].filter(Boolean).join(" ");
    if (m.replace(/\s/g, "") !== e.stamm.material.replace(/\s/g, "")) hinweise.push("Material: App „" + m + "“, Excel „" + e.stamm.material + "“");
  }

  // Stückzeit und Stück am Abend je Typ: nur, wo noch nichts steht
  const td = await db.from("hoco_type_data").select("*").eq("hoco_nr", hocoNr).eq("type_id", typ.id).limit(1)
    .then((r) => (r.data || [])[0] || null);
  const typNeu = {};
  if (e.typDaten.stueckzeit_s && !(td && td.stueckzeit_s)) typNeu.stueckzeit_s = e.typDaten.stueckzeit_s;
  if (e.typDaten.abend_stk && !(td && td.abend_stk)) typNeu.abend_stk = e.typDaten.abend_stk;
  if (Object.keys(typNeu).length && td) {
    const r = await db.from("hoco_type_data").update(typNeu).eq("hoco_nr", hocoNr).eq("type_id", typ.id);
    if (r.error) hinweise.push("Stückzeit nicht ergänzt: " + alt.fehlertext(r.error));
  }
  return { ok: true, hoco: hocoNr, hinweise, blatt };
}

// „Blatt ist gut“: das Excel ist ab jetzt überflüssig und kommt weg,
// aus hoco_type_data, den Dokumenten und der Ablage (Wunsch Patrick,
// 13. Oktober 2026: „wenn man sagt, das Einrichtblatt ist gut, soll das
// andere nicht mehr auf der Datenbank sein“). Die Aufgabe „HoferTool“
// lädt danach für diese Nummer und diesen Typ kein Excel mehr hoch.
export async function blattIstGut(blatt) {
  const db = alt.db;
  const td = await alt.rueckSichern("hoco_type_data", { hoco_nr: blatt.hoco_nr, type_id: blatt.type_id });
  const doks = await alt.rueckSichern("dokumente", { art: "einrichtblatt", hoco_nr: blatt.hoco_nr, type_id: blatt.type_id });
  const adressen = [...new Set([(td[0] || {}).blatt_url, blatt.excel_url].concat(doks.map((d) => d.datei_url)).filter(Boolean))];
  const gut = await blattSpeichern(Object.assign({}, blatt, { gut_am: new Date().toISOString(),
    gut_von: (alt.profil && alt.profil.id) || null }), null);
  if (td.length && td[0].blatt_url) {
    const r = await db.from("hoco_type_data").update({ blatt_url: null }).eq("hoco_nr", blatt.hoco_nr).eq("type_id", blatt.type_id);
    if (r.error) throw r.error;
  }
  try { if (doks.length) await db.from("dokumente").delete().in("id", doks.map((d) => d.id)); } catch (f) { /* bleibt eben */ }
  // Die Dateien selbst: nur solche in unserer Ablage
  const pfade = adressen.map((a) => (/\/object\/public\/zeichnungen\/(.+)$/.exec(String(a)) || [])[1])
    .filter(Boolean).map((p) => decodeURIComponent(p.split(/[?#]/)[0]));
  if (pfade.length) { try { await db.storage.from("zeichnungen").remove(pfade); } catch (f) { /* bleibt eben liegen */ } }
  return gut;
}
