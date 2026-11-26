// =================================================================
//  PRÜFBERICHTE (seit 1.771.0, Wunsch Patrick 24. November 2026:
//  „alle Berichte per Pfad hochladen und daraus ein Prüfprotokoll machen,
//  das per Tool läuft und ähnlich aufgebaut ist“)
//  Die Excel-Prüfberichte (Kopf A1:I7, Tabelle ab der Zeile „Nr. | Soll
//  | Ist ×5 | Bemerkungen / spez. Prüfmittel“, unten „Prüf-Entscheid“)
//  liest die App mit excelRoh und baut daraus die Vorlage einer HOCO Nr.
//  (alle Seiten 1/2, 2/2 … zusammen). In der App ausgefüllt werden die
//  Protokolle (Tabelle pruefprotokolle), Excel bleibt nur Quelle.
//  Aus der Toleranz in „Soll“ prüft die App jeden Ist-Wert, und aus der
//  letzten Spalte, welche Lehren es braucht.
// =================================================================
import { alt } from "../bruecke.jsx";

export const fehltTabelle = (e) =>
  /pruefbericht_dateien|pruefprotokolle|pruef_stamm|does not exist|schema cache/i.test(String((e && e.message) || e || ""));

const zahl = (t) => {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(t ?? "").replace(/'/g, ""));
  return m ? Number(m[0].replace(",", ".")) : null;
};
const ZAHL = "(\\d+(?:[.,]\\d+)?)";
const n = (t) => Number(String(t).replace(",", "."));
const rund = (x) => Math.round(x * 10000) / 10000;

// HOCO Nr. aus Text: 10844-0049 (auch 10844 0049)
export function hocoAus(text) {
  const m = /(\d{5})[\s\-_.]?(\d{4})(?!\d)/.exec(String(text || ""));
  return m ? m[1] + "-" + m[2] : "";
}

// ---------- Excel lesen ----------
const KOPF = [
  [/^fa-?nummer/i, "fa_nr"], [/^artikel-?bez/i, "bezeichnung"], [/^ho\+?co/i, "hoco"],
  [/^zeichn/i, "zeichnung"], [/^bestellte/i, "menge"], [/^automaten/i, "typ"],
  [/^nummer/i, "maschine"], [/^allg/i, "alltol"],
];

// Index wie „B“, „Ind. B“, „– –“: Striche, Punkte und Bezeichnungen sind kein Index
export function indexNorm(t) {
  const s = String(t ?? "").trim().replace(/^ind(ex)?\.?\s*:?\s*/i, "").trim();
  if (!s || /^[\s\-–—_.\/]+$/.test(s) || /:$/.test(s)) return "";
  return s.toUpperCase().slice(0, 12);
}

// Aus den Rohdaten (excelRoh mit formeln) ein Bericht:
// { kopf, zeilen, seite, seiten, teilweise: [Gründe] }
// Seit 1.821.0 (Patrick 25. November 2026: „manche Excel kann man nicht
// lesen“, „Index wichtig“): Index irgendwo im Kopf (rechts, darunter oder
// in derselben Zelle), Ist- und Prüfmittel-Spalten aus der Kopfzeile der
// Tabelle (alte .xls haben das Prüfmittel in I statt H).
export function berichtAusExcel(roh) {
  const z = roh.zellen || {};
  const zelle = (r, s) => (z[r + ":" + s] || {}).text || "";
  const zeilenNr = [...new Set(Object.values(z).map((c) => c.z))].sort((a, b) => a - b);
  const kopf = {};
  const teilweise = [];
  let tabStart = null, ende = null, seite = null, seiten = null, indexGesehen = false;
  // Spalte, in der „Nr.“ steht (bei älteren Blättern nicht immer in der ersten)
  let o = 1;
  for (const r of zeilenNr) {
    const a = zelle(r, o).trim();
    if (tabStart === null) {
      let gefunden = 0;
      for (let s = 1; s <= 4 && !gefunden; s++) if (/^(nr|pos)\.?$/i.test(zelle(r, s).trim()) && /soll|mass|merkmal/i.test(zelle(r, s + 1))) gefunden = s;
      if (gefunden) { tabStart = r; o = gefunden; continue; }
    }
    // Ende der Tabelle: „Prüf-Entscheid“, bei älteren Blättern „Freigabe Maschine …“, „Datum / Visum“ oder „Bemerkungen“
    if (tabStart !== null && (/^prüf\s*-?\s*entscheid|^bemerkung/i.test(a) || /^(freigabe\s+maschine|datum\s*\/\s*visum)/i.test(zelle(r, o + 1).trim()))) ende = ende || r;
    else if (/^prüf\s*-?\s*entscheid/i.test(a)) ende = ende || r;
    for (let s = 1; s <= 14; s++) {
      const t = zelle(r, s).trim();
      const sm = /seite\s*(\d+)\s*(?:\/|von)\s*(\d+)/i.exec(t);
      if (sm) { seite = Number(sm[1]); seiten = Number(sm[2]); }
      if (tabStart !== null) continue;
      if (/^ind(ex)?\.?(\s|:|$)/i.test(t) && !kopf.index) {
        indexGesehen = true;
        let v = indexNorm(t);
        if (!v && /^ind(ex)?\.?\s*:?\s*$/i.test(t)) {
          let rechts = "";
          for (let w = s + 1; w <= s + 3; w++) { const x = zelle(r, w).trim(); if (x) { rechts = x; break; } }
          // rechts ein Wert, sonst die Zelle darunter (wenn dort keine Bezeichnung steht)
          if (rechts && !/:$/.test(rechts)) v = indexNorm(rechts);
          else if (!rechts) v = indexNorm(zelle(r + 1, s));
        }
        if (v) kopf.index = v;
        continue;
      }
      const k = KOPF.find(([re]) => re.test(t));
      if (!k || kopf[k[1]]) continue;
      // Der Wert steht in der nächsten belegten Zelle rechts davon
      for (let w = s + 1; w <= s + 3; w++) {
        const v = zelle(r, w).trim();
        if (!v) continue;
        if (!KOPF.some(([re]) => re.test(v)) && !/^ind(ex)?\b/i.test(v) && !/:$/.test(v)) kopf[k[1]] = v;
        break;
      }
    }
  }
  // Ohne Tabelle trotzdem den Kopf behalten, damit die Vorlage so weit wie möglich gefüllt ist
  if (tabStart === null) {
    if (!Object.keys(kopf).length) throw new Error("Kein Prüfbericht: Zeile „Nr. / Soll“ fehlt");
    return { kopf, zeilen: [], seite, seiten, teilweise: ["Tabelle mit „Nr. / Soll“ nicht gefunden, Masse von Hand eintragen"] };
  }
  // Spalten aus der Kopfzeile der Tabelle
  let istSp = [], pmSp = 0;
  for (let s = o + 2; s <= 14 + o - 1; s++) {
    const t = zelle(tabStart, s);
    if (/^ist/i.test(t.trim())) istSp.push(s);
    else if (!pmSp && /bemerk|prüfm|pruefm|mittel/i.test(t)) pmSp = s;
  }
  if (!istSp.length) istSp = [o + 2, o + 3, o + 4, o + 5, o + 6];
  if (!pmSp) pmSp = Math.max(...istSp) + 1;
  const zeilen = [];
  let ohneSoll = 0;
  for (const r of zeilenNr) {
    if (r <= tabStart || (ende && r >= ende)) continue;
    const nr = zelle(r, o).trim(), soll = zelle(r, o + 1).trim(), pm = zelle(r, pmSp).trim();
    const ist = istSp.map((s) => zelle(r, s));
    if (!nr && !soll && !pm) continue;
    if (!nr && soll && !pm && ist.every((x) => !x)) { zeilen.push({ abschnitt: soll }); continue; }
    if (nr && !soll) { ohneSoll++; continue; }   // leere Zeile mit Nummer: nichts zu prüfen
    zeilen.push({ nr, soll, pm });
  }
  if (!zeilen.some((x) => x.soll)) teilweise.push("keine Masse gefunden");
  if (!ende) teilweise.push("Ende der Tabelle (Prüf-Entscheid) fehlt");
  return { kopf, zeilen, seite, seiten, teilweise };
}

// Mehrere Seiten einer HOCO Nr. zu einer Vorlage, Seite 1 zuerst
export function vorlageAus(berichte) {
  const b = [...berichte].sort((x, y) => (x.seite || 99) - (y.seite || 99));
  const kopf = {};
  for (const x of b) for (const [k, v] of Object.entries(x.kopf || {})) if (v && !kopf[k]) kopf[k] = v;
  const zeilen = [];
  let frei = 0;
  for (const x of b) for (const zl of x.zeilen) zeilen.push({ ...zl, id: zl.nr ? "n" + zl.nr : "x" + (++frei) });
  // Teilweise nicht lesbar: Gründe aller Seiten zusammen, ohne doppelte
  const teilweise = [...new Set(b.flatMap((x) => x.teilweise || []))];
  return { kopf, zeilen, teilweise };
}

// ---------- Toleranz ----------
// Gibt { min, max, einheit } oder null (ohne Mass, nur Gewinde, Material …)
const NUR_MAX = /^(ra|rz|rmax|rundlauf|planlauf|gesamtlauf|position|ebenheit|parallel\w*|rechtwink\w*|koaxial\w*|konzentr\w*|symmetrie|geradheit|rundheit|zylindr\w*|kb)\b/i;
export function toleranz(soll) {
  let s = String(soll || "").trim().replace(/^Ø\s*/, "").replace(/\s*x\s*45°\s*$/i, "")
    .replace(/\s+\d+\s*x\s*$/i, "").trim();
  if (!s || /^M\d/i.test(s)) return null;
  const grad = /°/.test(s) ? "°" : "";
  // Bereich wie „1.24-1.34“, „KB 0.02-0.1“
  let m = new RegExp("^(?:[A-Za-zÄÖÜäöü.]+\\s*)?" + ZAHL + "\\s*-\\s*" + ZAHL + "°?$").exec(s);
  // „5.5 -0.1“ ist kein Bereich, sondern Nennmass mit Abmass
  if (m && n(m[2]) > n(m[1])) return { min: n(m[1]), max: n(m[2]), einheit: grad };
  // Nur obere Grenze: Ra 1.6, Rundlauf 0.03, R0.1 max.
  m = new RegExp("^[A-Za-zÄÖÜäöü.]*\\s*" + ZAHL + "\\s*max\\.?$", "i").exec(s);
  if (m) return { min: null, max: n(m[1]), einheit: grad };
  if (NUR_MAX.test(s)) { const v = zahl(s); return v === null ? null : { min: null, max: v, einheit: "" }; }
  // Nennmass mit Abmassen: „17 -0.03/-0.06“, „23.3 +0.05“, „30° +/-5°“, „R0.4 +/-0.2“
  m = new RegExp("^R?\\s*" + ZAHL + "\\s*°?\\s*(.*)$", "i").exec(s);
  if (!m) return null;
  const nenn = n(m[1]), rest = m[2].trim();
  if (!rest) return null;
  const pm = new RegExp("^(?:\\+\\s*/\\s*-|±)\\s*" + ZAHL).exec(rest);
  if (pm) return { min: rund(nenn - n(pm[1])), max: rund(nenn + n(pm[1])), einheit: grad };
  const ab = [...rest.matchAll(new RegExp("([+-])\\s*" + ZAHL, "g"))].map((x) => (x[1] === "-" ? -1 : 1) * n(x[2]));
  if (!ab.length) return null;
  if (ab.length === 1) ab.push(0);
  return { min: rund(nenn + Math.min(...ab)), max: rund(nenn + Math.max(...ab)), einheit: grad };
}

export function toleranzText(t) {
  if (!t) return "";
  const e = t.einheit || "";
  if (t.min === null) return "≤ " + t.max + e;
  return t.min + e + " … " + t.max + e;
}

// Ist-Wert gegen die Toleranz: "gut", "schlecht" oder "" (nicht prüfbar)
export function istPruefen(ist, t) {
  const s = String(ist ?? "").trim();
  if (!s) return "";
  if (/^(n\.?\s*i\.?\s*o\.?|nok|nicht\s*i\.?\s*o|nicht\s*ok|schlecht|ausschuss)\b/i.test(s)) return "schlecht";
  if (/^(ok|i\.?\s*o\.?|gut)\b/i.test(s)) return "gut";
  if (!t) return "";
  const v = zahl(s);
  if (v === null) return "";
  const eps = 1e-9;
  if (/^<|kleiner/i.test(s)) return t.max !== null && v <= t.max + eps ? "gut" : "";
  if (t.min !== null && v < t.min - eps) return "schlecht";
  if (t.max !== null && v > t.max + eps) return "schlecht";
  return "gut";
}

// ---------- Lehren und Messmittel aus der letzten Spalte ----------
const LEHRE_RE = /lehr|kontrollring|grenzdorn|gewinde-?\s*(ring|dorn)/i;
const KEIN_MESSMITTEL = /^(material|kernbohrung|siehe|vgl|ø|visuell|sichtprüfung)/i;
// Seit 1.838.0 (Patrick 25. November 2026): Prüfstifte gibt es einfach, sie
// zählen weder beim Checken noch beim Ausbuchen. Messgeräte, die sowieso an
// ihrem Platz stehen (Isoma, Mikrometer, Messuhr, Fühlhebelmessuhr, Keyence),
// müssen nicht extra zum Checken in der Liste stehen.
const STIFT_RE = /prüfstift|pruefstift|\bstifte?\b/i;
const SELBST_RE = /isoma|mikrometer|messschraube|messuhr|fühlhebel|fuehlhebel|keyence|messmikroskop/i;

export function lehrenAus(vorlage) {
  const lehren = new Map(), mess = new Map();
  for (const zl of vorlage.zeilen || []) {
    const pm = String(zl.pm || "").trim();
    if (!pm || STIFT_RE.test(pm)) continue;
    if (LEHRE_RE.test(pm)) {
      const name = pm.replace(/\s*[ØøD]?\s*\d+(?:[.,]\d+)?\s*(\/\s*\d+(?:[.,]\d+)?)?\s*$/, "").trim() || pm;
      let mass = (/(\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?)/.exec(pm) || [])[1] || "";
      const t = toleranz(zl.soll);
      if (!mass && /gewinde/i.test(pm)) mass = String(zl.soll || "").replace(/\s+\d+\s*x\s*$/i, "").trim();
      else if (!mass && t && t.min !== null) mass = "Ø " + t.min.toFixed(3) + " / " + t.max.toFixed(3);
      else if (!mass && t) mass = "≤ " + t.max;
      if (!mass) mass = String(zl.soll || "").trim();
      mass = mass.replace(/\s+/g, " ");
      // Gleiche Lehre für dasselbe Soll nur einmal (Nr. 07 und 41 bei 10844-0049)
      const key = (name + "|" + (t ? toleranzText(t) : mass)).toLowerCase();
      const da = lehren.get(key);
      const vonHand = /\d\s*\/\s*\d/.test(pm);
      if (da) { da.nr.push(zl.nr || "–"); if (vonHand && !da.vonHand) { da.mass = mass; da.vonHand = true; } }
      else lehren.set(key, { name, mass, soll: zl.soll, nr: [zl.nr || "–"], vonHand });
    } else if (!KEIN_MESSMITTEL.test(pm) && !SELBST_RE.test(pm)) {
      const w = pm.split(/[\/Ø(]/)[0].trim();
      if (!w) continue;
      const k = w.toLowerCase();
      if (mess.has(k)) mess.get(k).nr.push(zl.nr || "–");
      else mess.set(k, { name: w, nr: [zl.nr || "–"] });
    }
  }
  return { lehren: [...lehren.values()], messmittel: [...mess.values()] };
}

// Passt ein Prüfmittel aus der Prüfmittelverwaltung zu einer Lehre?
// Seit 1.838.0 sucht die App selbst in allen Prüfmitteln (Patrick 25.
// November 2026: „es soll das Mittel selber suchen aus allen Mitteln, die wir
// haben“): Grenzlehrdorne über die Grenzen aus dem Nennmass („15 H9 +0.043“
// = 15.000 … 15.043, „10.1 E9 +0.075/+0.032“ = 10.132 … 10.175), Gewinde über
// M-Grösse und Steigung, Ring oder Dorn, sonst gleiche Zahlen (Kontrollring).
// Im Schrank zuerst.
const zahlenIn = (t) => (String(t || "").match(/\d+(?:[.,]\d+)?/g) || []).map((x) => n(x));
function gewindeVon(t) {
  const m = /\bM\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/i.exec(String(t || ""));
  return m ? "M" + n(m[1]) + (m[2] ? "x" + n(m[2]) : "") : "";
}
function grenzenPm(p) {
  const s = String(p.nennmass || p.mass || "").trim();
  const m = /^Ø?\s*(\d+(?:[.,]\d+)?)\s*(?:[A-Za-z]{1,2}\d{1,2})?\s*(.*)$/.exec(s);
  if (!m) return null;
  const nenn = n(m[1]);
  const pm = /(?:\+\s*\/\s*-|±)\s*(\d+(?:[.,]\d+)?)/.exec(m[2]);
  if (pm) return { min: rund(nenn - n(pm[1])), max: rund(nenn + n(pm[1])) };
  const ab = [...m[2].matchAll(/([+-])\s*(\d+(?:[.,]\d+)?)/g)].map((x) => (x[1] === "-" ? -1 : 1) * n(x[2]));
  if (!ab.length) return null;
  if (ab.length === 1) ab.push(0);
  return { min: rund(nenn + Math.min(...ab)), max: rund(nenn + Math.max(...ab)) };
}
function grenzenLehre(lehre) {
  const m = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/.exec(String(lehre.mass || ""));
  if (m) {
    const stellen = Math.max(...[m[1], m[2]].map((x) => (x.split(/[.,]/)[1] || "").length));
    return { min: n(m[1]), max: n(m[2]), spiel: 0.5 * Math.pow(10, -stellen) + 0.0006 };
  }
  const t = toleranz(lehre.soll);
  return t && t.min !== null ? { min: t.min, max: t.max, spiel: 0.0011 } : null;
}
const istStift = (p) => STIFT_RE.test((p.typ || "") + " " + (p.bezeichnung || ""));

export function pruefmittelFuer(lehre, liste, hoco) {
  const name = String(lehre.name || "");
  const gew = /gewinde/i.test(name) || /^M\d/i.test(String(lehre.mass || "")) ? gewindeVon(lehre.mass || lehre.soll) : "";
  const ring = /ring/i.test(name) ? true : /dorn/i.test(name) ? false : null;
  const g = gew ? null : grenzenLehre(lehre);
  const soll = zahlenIn(lehre.mass);
  const treffer = (liste || []).filter((p) => {
    if (p.status && p.status !== "aktiv") return false;
    if (istStift(p)) return false;
    const art = (p.typ || "") + " " + (p.bezeichnung || "");
    if (hoco && p.hoco && String(p.hoco).includes(hoco)) return true;
    if (gew) {
      if (!/gewinde/i.test(art)) return false;
      if (ring !== null && /ring/i.test(art) !== ring) return false;
      const pg = gewindeVon(p.nennmass || p.mass || p.bezeichnung);
      if (!pg) return false;
      // „M5“ in der Lehre passt zu „M5“ und „M5x0.8“ (Regelgewinde)
      return pg === gew || (!/x/.test(gew) && pg.split("x")[0] === gew);
    }
    if (g && /lehrdorn|grenzdorn/i.test(art) && !/gewinde/i.test(art)) {
      const pg = grenzenPm(p);
      if (pg) return Math.abs(pg.min - g.min) <= g.spiel && Math.abs(pg.max - g.max) <= g.spiel;
    }
    if (/gewinde/i.test(art)) return false;
    const ist = zahlenIn((p.nennmass || "") + " " + (p.mass || "") + " " + (p.bezeichnung || ""));
    return soll.length > 0 && soll.every((v) => ist.some((x) => Math.abs(x - v) < 0.0005));
  });
  const rang = (p) => (p.ort_art === "schrank" ? 0 : p.ort_art ? 1 : 0);
  return treffer.sort((a, b) => rang(a) - rang(b) || String(a.nr || "").localeCompare(String(b.nr || "")));
}

// Wo liegt ein Prüfmittel? Kurzer Text für Checkliste und QS-Fenster
export function pmOrtText(p) {
  return { schrank: "im Schrank", maschine: "an einer Maschine", rueckgabe: "in der Rückgabekiste", extern: "extern" }[p && p.ort_art] || "";
}

// Alle Prüfmittel lesen, für alle ausser Externen und Dienst (Funktion
// pruefmittel_suchen_lesen, nur Nr., Mass und Ort), seitenweise je 1'000.
// Admins notfalls direkt aus der Tabelle.
export async function pruefmittelAlleLaden() {
  const holen = async (q) => {
    const alle = [];
    for (let ab = 0; ab < 20000; ab += 1000) {
      const { data, error } = await alt.zeitlimit(q().range(ab, ab + 999), 15000, "Prüfmittel");
      if (error) throw error;
      alle.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return alle;
  };
  try { return await holen(() => alt.db.rpc("pruefmittel_suchen_lesen")); }
  catch (e) {
    if (!alt.istAdmin()) return [];
    try { return await holen(() => alt.db.from("pruefmittel").select("*").order("id")); }
    catch (_) { return []; }
  }
}

// ---------- Datenbank ----------
// Seitenweise je 1'000, die Datenbank gibt nie mehr auf einmal (25. November 2026)
export async function dateienLaden(hoco) {
  const alle = [];
  for (let ab = 0; ab < 50000; ab += 1000) {
    let q = alt.db.from("pruefbericht_dateien").select("*").order("hoco_nr").order("id").range(ab, ab + 999);
    if (hoco) q = q.eq("hoco_nr", hoco);
    const { data, error } = await alt.zeitlimit(q, 15000, "Prüfberichte");
    if (error) throw error;
    alle.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return alle;
}

export async function protokolleLaden(hoco) {
  let q = alt.db.from("pruefprotokolle").select("*").order("erstellt_am", { ascending: false });
  if (hoco) q = q.eq("hoco_nr", hoco);
  const { data, error } = await alt.zeitlimit(q, 15000, "Prüfprotokolle");
  if (error) throw error;
  return data || [];
}

// Vorlage einer HOCO Nr. aus ihren Dateien, im Speicher gemerkt je Adresse
const gelesen = new Map();
export async function dateiLesen(d) {
  if (gelesen.has(d.url)) return gelesen.get(d.url);
  const p = (async () => {
    const r = await fetch(d.url, { cache: "no-cache" });
    if (!r.ok) throw new Error("Datei nicht ladbar (" + r.status + ")");
    const { excelRoh } = await import("../einrichtblatt/excelEinlesen.js");
    const b = berichtAusExcel(await excelRoh(new Uint8Array(await r.arrayBuffer()), { formeln: true }));
    if (!b.seite && d.seite) b.seite = d.seite;
    return b;
  })();
  gelesen.set(d.url, p);
  p.catch(() => gelesen.delete(d.url));
  return p;
}

// Eine Seite, die sich nicht lesen lässt, verdirbt nicht die anderen: sie steht
// dann nur unter „teilweise“
export async function vorlageLaden(dateien) {
  const r = await Promise.allSettled(dateien.map(dateiLesen));
  const gut = r.filter((x) => x.status === "fulfilled").map((x) => x.value);
  if (!gut.length) throw (r[0] && r[0].reason) || new Error("keine Datei");
  const v = vorlageAus(gut);
  r.forEach((x, i) => { if (x.status === "rejected") v.teilweise.push((dateien[i].name || "Seite") + " nicht lesbar"); });
  return v;
}

// Von Hand hochladen: liest die Datei zuerst, damit HOCO Nr. und Seite stimmen
export async function dateiHochladen(datei) {
  const { excelRoh } = await import("../einrichtblatt/excelEinlesen.js");
  const daten = new Uint8Array(await datei.arrayBuffer());
  const b = berichtAusExcel(await excelRoh(daten, { formeln: true }));
  const hoco = hocoAus(b.kopf.hoco) || hocoAus(datei.name);
  if (!hoco) throw new Error(datei.name + ": keine HOCO Nr. gefunden");
  const endung = (datei.name.split(".").pop() || "xlsx").toLowerCase();
  const ablage = "pruefberichte/" + hoco + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + endung;
  const { error: fu } = await alt.db.storage.from("zeichnungen").upload(ablage, datei, { upsert: false });
  if (fu) throw fu;
  const url = alt.db.storage.from("zeichnungen").getPublicUrl(ablage).data.publicUrl;
  // Gleiche HOCO Nr. und Seite: die neue Datei ersetzt die alte
  const { data: vorher } = await alt.db.from("pruefbericht_dateien").select("*").eq("hoco_nr", hoco);
  const gleich = (vorher || []).filter((v) => (v.seite || null) === (b.seite || null) && v.quelle === "hand");
  const { data, error } = await alt.db.from("pruefbericht_dateien").insert({
    hoco_nr: hoco, name: datei.name, url, ablage, seite: b.seite || null, quelle: "hand",
    geaendert: datei.lastModified ? new Date(datei.lastModified).toISOString() : null,
  }).select().single();
  if (error) throw error;
  if (gleich.length) await alt.db.from("pruefbericht_dateien").delete().in("id", gleich.map((v) => v.id));
  return { zeile: data, ersetzt: gleich, bericht: b };
}

// ---------- Prüfung in den Stammdaten (seit 1.779.0, Wunsch Patrick
// 24. November 2026: „was wo gemacht werden muss, wird bei Stammdaten
// definiert“, „Excel hochladen nur per Stammdaten, neue sollen dort gleich
// ausgefüllt werden“). Tabelle pruef_stamm aus sql/pruef-stamm.sql:
// je HOCO Nr. die nötigen Arten, AQL-Vorgabe, Masse und Kopf. Das Excel
// zeigt die App nie, es füllt nur einmal die Masse. ----------
export async function stammLaden(hoco) {
  let q = alt.db.from("pruef_stamm").select("*");
  if (hoco) q = q.eq("hoco_nr", hoco);
  const { data, error } = await alt.zeitlimit(q, 15000, "Prüfung Stammdaten");
  if (error) throw error;
  return hoco ? (data || [])[0] || null : data || [];
}

// Stamm einer HOCO Nr. mit Masse: gespeicherte, sonst still aus den
// früher abgelegten Excel-Vorlagen (Ordner oder von Hand vor 1.779.0)
export async function stammMitMassen(hoco) {
  const st = await stammLaden(hoco).catch((f) => { if (fehltTabelle(f)) return null; throw f; });
  if (st && (st.zeilen || []).length) return { ...st, aus: "stamm" };
  const dateien = await dateienLaden(hoco).catch(() => []);
  if (!dateien.length) return st ? { ...st, aus: "stamm" } : null;
  try {
    const v = await vorlageLaden(dateien);
    return { hoco_nr: hoco, arten: (st && st.arten) || [], aql: st && st.aql, niveau: st && st.niveau,
      zeilen: v.zeilen, kopf: { ...(v.kopf || {}), ...((st && st.kopf) || {}) }, aus: "excel" };
  } catch (_) { return st ? { ...st, aus: "stamm" } : null; }
}

export async function stammSpeichern(hoco, felder) {
  const vorher = await alt.rueckSichern("pruef_stamm", { hoco_nr: hoco });
  const zeile = { hoco_nr: hoco, ...felder };
  const { error } = await alt.db.from("pruef_stamm").upsert(zeile, { onConflict: "hoco_nr" });
  if (error) throw error;
  alt.merkeSchritt("Prüfung " + hoco + " ändern",
    vorher && vorher.length ? alt.rueckRein("pruef_stamm", vorher, "hoco_nr") : alt.rueckWeg("pruef_stamm", { hoco_nr: hoco }));
}

// Excel-Dateien (Seite 1/2, 2/2 …) im Gerät lesen: Masse und Kopf, ohne Ablage
export async function excelMasse(dateien) {
  const { excelRoh } = await import("../einrichtblatt/excelEinlesen.js");
  const berichte = [];
  for (const d of dateien) berichte.push(berichtAusExcel(await excelRoh(new Uint8Array(await d.arrayBuffer()), { formeln: true })));
  return vorlageAus(berichte);
}

// Neue Kennung für eine von Hand dazugefügte Zeile
export const zeilenId = (zeilen, z) => {
  const ids = new Set((zeilen || []).map((x) => x.id));
  let id = z && z.nr ? "n" + z.nr : "x1";
  let i = 1;
  while (ids.has(id)) id = (z && z.nr ? "n" + z.nr + "_" : "x") + (++i);
  return id;
};

// ---------- Arten von Berichten (seit 1.771.0, Wunsch Patrick 24. November 2026:
// „Teileprüfbericht, wo man 5 Teile für Erstteilprüfung oder Endkontrolle
// braucht … AQL … und LL Langläufer, wichtige Masse auf eine Liste und dann
// täglich stichprobenmässig kontrolliert“) ----------
export const ARTEN = [
  { id: "erstteil", name: "Erstteilprüfung", kurz: "Erstteil", text: "5 Teile, alle Masse" },
  { id: "endkontrolle", name: "Endkontrolle", kurz: "Endkontrolle", text: "5 Teile, alle Masse" },
  { id: "aql", name: "AQL-Stichprobe", kurz: "AQL", text: "Stichprobe nach Losgrösse (ISO 2859-1)" },
  { id: "ll", name: "LL Langläufer", kurz: "LL", text: "Wichtige Masse, Stichproben laufend" },
];
export const artVon = (id) => ARTEN.find((a) => a.id === id) || ARTEN[0];
// Bei der Endkontrolle wählt die QS-Leitung, ob es eine End- oder eine
// Zwischenkontrolle ist (seit 1.826.0, Wunsch Patrick 25. November 2026),
// gespeichert in kopf.kontrolle ("zwischen", sonst End)
export const istZwischen = (kopf) => (kopf || {}).art === "endkontrolle" && (kopf || {}).kontrolle === "zwischen";
export const artName = (kopf) => istZwischen(kopf)
  ? { id: "endkontrolle", name: "Zwischenkontrolle", kurz: "Zwischen", text: "Nur was jetzt zu prüfen ist" }
  : artVon((kopf || {}).art);
export const TEILE = 5;

// ---------- AQL nach ISO 2859-1, Einfach-Stichprobe, normale Prüfung ----------
// Kennbuchstabe aus der Losgrösse (Prüfniveau I, II, III)
const LOSE = [8, 15, 25, 50, 90, 150, 280, 500, 1200, 3200, 10000, 35000, 150000, 500000, Infinity];
const NIVEAU = {
  I: "AABCCDEFGHJKLMN", II: "ABCDEFGHJKLMNPQ", III: "BCDEFGHJKLMNPQR",
};
const BUCHST = "ABCDEFGHJKLMNPQR";
const UMFANG = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000];
export const AQL_WERTE = [0.010, 0.015, 0.025, 0.040, 0.065, 0.10, 0.15, 0.25, 0.40, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5, 10];
const FOLGE = [1, 2, 3, 5, 7, 10, 14, 21];

// Feld der Tabelle II-A: Zahl (Annahmezahl Ac) oder "u" / "d" (Pfeil hinauf / hinunter).
// Das Muster je Reihe: links vom Ac 0 Pfeil hinunter, rechts davon Pfeil
// hinauf, Pfeil hinunter, dann 1, 2, 3, 5, 7, 10, 14, 21, danach hinauf.
function feld(reihe, spalte) {
  const c0 = 14 - reihe; // A: Ac 0 bei AQL 6.5 … R: eine Spalte links von 0.010
  const d = spalte - c0;
  if (d < 0) return "d";
  if (d === 0) return 0;
  if (d === 1) return "u";
  if (d === 2) return "d";
  return d - 3 < FOLGE.length ? FOLGE[d - 3] : "u";
}

// { buchstabe, n, ac, re, hundert } für Losgrösse, AQL und Niveau
export function aqlPlan(los, aql, niveau = "II") {
  los = Math.floor(Number(los) || 0);
  const spalte = AQL_WERTE.findIndex((a) => Math.abs(a - Number(aql)) < 1e-9);
  if (los < 2 || spalte < 0) return null;
  const nv = NIVEAU[niveau] || NIVEAU.II;
  const start = BUCHST.indexOf(nv[LOSE.findIndex((g) => los <= g)]);
  let r = start;
  for (let i = 0; i < 40; i++) {
    const f = feld(r, spalte);
    if (f === "d") { if (r < BUCHST.length - 1) { r++; continue; } return null; }
    if (f === "u") { if (r > 0) { r--; continue; } return null; }
    const n = UMFANG[r];
    return { buchstabe: BUCHST[start], n: Math.min(n, los), ac: f, re: f + 1, hundert: n >= los };
  }
  return null;
}

// Sperre vor „läuft“ (seit 1.783.0, Wunsch Patrick 24. November 2026:
// „zuerst der Bericht, ist mässig eine Sperre“): verlangen die Stammdaten
// der HOCO Nr. eine Erstteilprüfung, lässt sich der Auftrag erst auf
// „läuft“ stellen, wenn für genau diesen Auftrag (job_id, nicht nur dieselbe
// FA Nr.) eine abgeschlossen ist. Gestellt wird nie von selbst, nur von Hand.
// Fehlen Tabelle oder Leserecht (Externe), hält nichts auf.
export async function erstteilVorLaeuft(j) {
  if (!j || !j.id || !j.job_number || j.plan_status === "laeuft") return;
  let st = null;
  try { st = await stammLaden(j.job_number); } catch (f) { return; }
  if (!st || !(st.arten || []).includes("erstteil")) return;
  const r = await alt.db.from("pruefprotokolle").select("id, kopf, abgeschlossen_am").eq("job_id", j.id);
  if (r.error) return;
  const r2 = await alt.db.from("pruefprotokolle").select("id, kopf, abgeschlossen_am, entscheid").eq("job_id", j.id);
  const liste = r2.error ? (r.data || []) : (r2.data || []);
  // Seit 1.785.0 nur mit Freigabe
  const fertig = liste.some((p) => (p.kopf || {}).art === "erstteil" && p.abgeschlossen_am && (r2.error || p.entscheid === "freigabe"));
  if (fertig) return;
  throw new Error(j.job_number + (j.fa_nr ? " (FA " + j.fa_nr + ")" : "") + " lässt sich noch nicht auf „läuft“ stellen: "
    + "zuerst die Erstteilprüfung machen und mit Freigabe abschliessen (Qualitätssicherung → Prüfberichte).");
}
