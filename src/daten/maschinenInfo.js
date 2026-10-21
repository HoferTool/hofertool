// =================================================================
//  INFOS, WARTUNG UND BACKUP-BATTERIEN JE MASCHINE (seit 1.134.0,
//  Wunsch Patrick 21. Oktober 2026)
//
//  maschinen_info: ein Feld für allgemeine Infos und der Termin für
//  den Wechsel der Backup-Batterien. Die Batterien halten etwa zwei
//  Jahre, darum schlägt „Batterien gewechselt“ den nächsten Wechsel in
//  zwei Jahren vor; der Termin lässt sich frei verschieben.
//  maschinen_wartung: die Wartungshistorie mit Bildern und PDFs.
//  Beides aus sql/maschinen-wartung.sql. Fehlt das SQL, sagt die App
//  das, statt abzustürzen.
// =================================================================
import { alt } from "../bruecke.jsx";

export const BATTERIE_JAHRE = 2;
// So viele Tage vor dem Termin kommt der Hinweis, damit noch Zeit
// bleibt, Batterien zu bestellen
export const BATTERIE_VORLAUF_TAGE = 30;

export const fehltSql = (f) => /maschinen_(info|wartung)|schema cache|does not exist/i.test(alt.fehlertext(f));
export const SQL_FEHLT = "Die Wartung ist in der Datenbank noch nicht eingerichtet (sql/maschinen-wartung.sql).";

export async function infoLaden(maschineId) {
  const r = await alt.zeitlimit(alt.db.from("maschinen_info").select("*")
    .eq("machine_id", maschineId), 10000, "Maschineninfo");
  if (r.error) throw r.error;
  return (r.data || [])[0] || null;
}

// Schreibt nur die übergebenen Felder; gibt es noch keine Zeile, wird
// sie angelegt. Mit Rückgängig.
export async function infoSetzen(maschineId, felder, rueckText) {
  const vorher = await alt.rueckSichern("maschinen_info", { machine_id: maschineId });
  const daten = { ...felder, geaendert_am: new Date().toISOString(), geaendert_von: alt.meineProfilId() };
  const r = vorher.length
    ? await alt.db.from("maschinen_info").update(daten).eq("machine_id", maschineId)
    : await alt.db.from("maschinen_info").insert({ machine_id: maschineId, ...daten });
  if (r.error) throw r.error;
  if (rueckText) {
    alt.merkeSchritt(rueckText, vorher.length
      ? alt.rueckRein("maschinen_info", vorher)
      : alt.rueckWeg("maschinen_info", { machine_id: maschineId }));
  }
}

export function plusJahre(iso, jahre) {
  const d = alt.ausIso(iso);
  d.setFullYear(d.getFullYear() + jahre);
  return alt.isoDatum(d);
}

// Tage bis zum Termin (negativ = überfällig), null ohne Termin
export function tageBis(iso) {
  if (!iso) return null;
  const heute = alt.ausIso(alt.isoDatum(new Date()));
  return Math.round((alt.ausIso(iso) - heute) / 86400000);
}

// Steht ein Hinweis an? Nur mit Termin und eingeschaltetem Hinweis.
export function batterieFaellig(info) {
  if (!info || info.batterie_hinweis === false || !info.batterie_faellig) return false;
  return tageBis(info.batterie_faellig) <= BATTERIE_VORLAUF_TAGE;
}

export function batterieText(info) {
  const t = tageBis(info && info.batterie_faellig);
  if (t === null) return "";
  if (t < 0) return "seit " + alt.kurzDatum(info.batterie_faellig) + " fällig";
  if (t === 0) return "heute fällig";
  if (t === 1) return "morgen fällig";
  return "fällig am " + alt.kurzDatum(info.batterie_faellig) + " (in " + t + " Tagen)";
}

// Für die Startseite: alle Maschinen mit fälligen Batterien
export async function faelligeBatterien() {
  const r = await alt.zeitlimit(alt.db.from("maschinen_info")
    .select("machine_id, batterie_faellig, batterie_hinweis, batterie_gewechselt")
    .not("batterie_faellig", "is", null), 10000, "Batterien");
  if (r.error) {
    if (fehltSql(r.error)) return [];
    throw r.error;
  }
  const faellig = (r.data || []).filter(batterieFaellig);
  if (!faellig.length) return [];
  const maschinen = await alt.ladeAlleMaschinen();
  return faellig.map((i) => ({ ...i, m: maschinen.find((m) => m.id === i.machine_id) }))
    .filter((x) => x.m)
    .sort((a, b) => String(a.batterie_faellig).localeCompare(String(b.batterie_faellig)));
}

// ---------- Wartungshistorie ----------

export async function wartungLaden(maschineId) {
  const r = await alt.zeitlimit(alt.db.from("maschinen_wartung").select("*")
    .eq("machine_id", maschineId).order("datum", { ascending: false })
    .order("erstellt_am", { ascending: false }), 10000, "Wartung");
  if (r.error) throw r.error;
  // Der Nachbau im Prüfstand ordnet nicht: lieber selbst
  return (r.data || []).slice().sort((a, b) => String(b.datum).localeCompare(String(a.datum))
    || String(b.erstellt_am).localeCompare(String(a.erstellt_am)));
}

function ablageName(name) {
  const rein = String(name || "datei").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + "-" + rein.slice(-80);
}

// Bilder werden vorher verkleinert (Handyfotos sind sonst 5 MB),
// PDFs gehen unverändert hoch
export async function anhangHochladen(maschineId, datei) {
  let blob = datei, name = datei.name || "foto.jpg";
  const bild = /^image\//.test(datei.type) && !/svg|gif/.test(datei.type);
  if (bild && typeof alt.bildVerkleinern === "function") {
    try {
      const klein = await alt.bildVerkleinern(datei, 2000);
      if (klein && klein.size < datei.size) { blob = klein; name = name.replace(/\.[^.]+$/, "") + ".jpg"; }
    } catch (f) { /* dann eben das Original */ }
  }
  const pfad = "maschinen/" + maschineId + "/wartung/" + ablageName(name);
  const up = await alt.db.storage.from("zeichnungen").upload(pfad, blob,
    { contentType: blob.type || datei.type || "application/octet-stream", upsert: false });
  if (up.error) throw up.error;
  const url = alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl;
  return { url, pfad, name: datei.name || name, typ: blob.type || datei.type || "", groesse: blob.size || null };
}

export const istPdf = (a) => /pdf/i.test(a.typ || "") || /\.pdf$/i.test(a.name || a.url || "");
export const istBild = (a) => /^image\//.test(a.typ || "") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || "");
