// =================================================================
//  PLANER-DASHBOARD IM PAD MODE: DATEN (seit 1.507.0)
//  Wunsch Patrick 12. November 2026: „Dashboard für Planer im Pad Mode,
//  aktuelle wichtige Sachen, Todos wie Probleme (auch eigene), Material-
//  bestellungen für die nächsten Aufträge nach Lieferant, Lieferbarkeit
//  in Einstellungen definierbar“.
//
//  Material-Lieferanten kennt die App nur aus dem Text im Feld „Menge
//  vorhanden oder bestellt“ der Aufträge („300 kg · Schmobi 2026008672“).
//  Daraus lernt sie je Material, bei wem es schon bestellt wurde. Für
//  fehlendes Material schlägt sie den Lieferanten so vor, dass möglichst
//  wenige Lieferanten nötig sind (Patrick: „wenn das Material bei zwei
//  Orten bestellt wurde, das andere nur bei einem, soll beides beim
//  anderen vorgeschlagen werden“). Nur ein Vorschlag, je Auftrag
//  änderbar (app_config.planer_lieferant_wahl).
// =================================================================
import { alt } from "../bruecke.jsx";
import { materialZerlegen, materialDatenLaden, bedarfRechnen, startSchaetzen, istOffen, istRahmen, kgJeStange } from "./material.js";

// Gefunden in den Aufträgen (12. November 2026); gilt, solange in den
// Einstellungen nichts gespeichert ist
export const LIEFERANTEN_VORGABE = [
  { name: "Notz", aliase: ["Notzi"] }, { name: "Metalix" }, { name: "Steeltec", aliase: ["Steelttec"] },
  { name: "Prometall", aliase: ["Pormetall"] }, { name: "Schmobi", aliase: ["Schmob"] }, { name: "Klein" },
  { name: "Kindlimann" }, { name: "Allega" }, { name: "Voestalpine", aliase: ["Böhler", "Boehler"] }, { name: "Pfenninger" },
  { name: "Thyssenkrupp", aliase: ["Thyssen"] }, { name: "Bibus" }, { name: "Prexa" }, { name: "Looser" }, { name: "Capo" }, { name: "Cellpack" },
];
export const WOCHENTAGE = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"]];

const KONFIG = "material_lieferanten";
const WAHL = "planer_lieferant_wahl";
const REGELN = "material_regeln";

async function konfigLesen(schluessel) {
  const r = await alt.db.from("app_config").select("wert").eq("schluessel", schluessel).maybeSingle();
  if (!r || r.error || !r.data || !r.data.wert) return null;
  try { return JSON.parse(r.data.wert); } catch (f) { return null; }
}
async function konfigSchreiben(schluessel, wert) {
  const { error } = await alt.db.from("app_config").upsert(
    [{ schluessel, wert: JSON.stringify(wert) }], { onConflict: "schluessel" });
  if (error) throw error;
}

export async function lieferantenLaden() {
  const l = await konfigLesen(KONFIG);
  return Array.isArray(l) && l.length ? l : LIEFERANTEN_VORGABE.map((x) => ({ ...x }));
}
export async function lieferantenSpeichern(liste) {
  const sauber = liste.map((l) => ({
    name: String(l.name || "").trim(),
    aliase: (l.aliase || []).map((a) => String(a).trim()).filter(Boolean),
    tage: l.tage === "" || l.tage === null || l.tage === undefined || !isFinite(Number(l.tage)) ? null : Math.max(0, Math.round(Number(l.tage))),
    bestelltage: (l.bestelltage || []).map(Number).filter((n) => n >= 1 && n <= 5).sort(),
    // An welchen Tagen der Lieferant zu uns liefert (seit 1.514.0, Liste
    // „Liefertage Rohmaterial-Lieferanten“ von Patrick); alle fünf = täglich
    liefertage: [...new Set((l.liefertage || []).map(Number).filter((n) => n >= 1 && n <= 5))].sort(),
    schluss: /^\d{1,2}:\d{2}$/.test(String(l.schluss || "").trim()) ? String(l.schluss).trim() : "",
    notiz: String(l.notiz || "").trim(),
  })).filter((l) => l.name);
  await konfigSchreiben(KONFIG, sauber);
  return sauber;
}
export async function wahlLaden() { return (await konfigLesen(WAHL)) || {}; }
export async function wahlSetzen(jobId, name) {
  const w = await wahlLaden();
  if (name) w[jobId] = name; else delete w[jobId];
  await konfigSchreiben(WAHL, w);
}

// ---------- Regeln je Material (seit 1.514.0) ----------
// Wunsch Patrick 13. November 2026: manches Material gibt es nur bei einem
// Lieferanten, anderes wurde nur im Notfall woanders bestellt. Eine Regel
// sagt „muss bei“ (gilt für den Vorschlag) und „kann auch bei“ (nur zur
// Info, nie für den Vorschlag). Beispiele: „ETG“ → Steeltec, „Neusilber
// Rohr“ → Metalix, „Messing Rohr“ → Prometall, „Automatenstahl rd 24“ →
// Steeltec. Gespeichert in app_config.material_regeln
// [{material, muss, kann: []}].
export async function regelnLaden() {
  const r = await konfigLesen(REGELN).catch(() => null);
  return Array.isArray(r) ? r : [];
}
export async function regelnSpeichern(liste) {
  const sauber = liste.map((r) => ({
    material: String(r.material || "").replace(/\s+/g, " ").trim(),
    muss: String(r.muss || "").trim(),
    kann: [...new Set((r.kann || []).map((k) => String(k).trim()).filter(Boolean))],
  })).filter((r) => r.material && (r.muss || r.kann.length));
  await konfigSchreiben(REGELN, sauber);
  return sauber;
}
const FORM_WORT = { rd: "rd", rund: "rd", rohr: "rohr", "6kt": "6kt", sechskant: "6kt", sk: "6kt", "4kt": "4kt", vierkant: "4kt", vk: "4kt", fl: "fl", flach: "fl" };
const zahlWert = (t) => Number(String(t).replace(",", "."));
// Stücke der Regel: Form („rohr“), Form mit Mass („rd 24“, „Ø24“), Mass
// allein, sonst Wörter, die in der Bezeichnung oder im Namen der
// Werkstoffgruppe stehen (Neusilber, Messing, Automatenstahl …)
function regelStuecke(text) {
  const t = klein(text).replace(/ø/g, " ø ").replace(/\b(rd|rund|rohr|6kt|sechskant|sk|4kt|vierkant|vk|fl|flach)(\d)/g, "$1 $2");
  const w = t.split(/[\s,;]+/).filter(Boolean);
  const st = [];
  for (let i = 0; i < w.length; i++) {
    const f = FORM_WORT[w[i]] || (w[i] === "ø" ? "*" : null);
    const nach = w[i + 1];
    if (f && nach && /^\d+([.,]\d+)?$/.test(nach)) { st.push({ form: f, d: zahlWert(nach) }); i++; continue; }
    if (f && f !== "*") { st.push({ form: f }); continue; }
    if (f) continue;
    // Werkstoffnummern wie 1.4305 sind kein Mass, sondern ein Wort
    if (/^\d\.\d{4}$/.test(w[i])) { st.push({ wort: w[i] }); continue; }
    if (/^\d+([.,]\d+)?$/.test(w[i])) { st.push({ d: zahlWert(w[i]) }); continue; }
    st.push({ wort: w[i].replace(/[^a-z0-9.+-]/g, "") });
  }
  return st.filter((x) => x.wort !== "");
}
export function regelPasst(regel, bez) {
  const z = materialZerlegen(bez);
  if (!z) return false;
  const st = regelStuecke(regel.material);
  if (!st.length) return false;
  const text = klein(bez).replace(/\s+/g, " ");
  const g = alt.werkstoffErkennen ? alt.werkstoffErkennen(bez) : null;
  const gruppe = g ? klein(g.name || "") + " " + (g.key || "") : "";
  return st.every((x) => {
    if (x.form && x.form !== "*" && z.form !== x.form) return false;
    if (x.d !== undefined && z.d !== x.d) return false;
    if (x.wort) return text.includes(x.wort) || gruppe.includes(x.wort);
    return true;
  });
}
// Die genauste passende Regel (mit den meisten Stücken)
export function regelFuer(bez, regeln) {
  let best = null, n = -1;
  for (const r of regeln || []) {
    if (!regelPasst(r, bez)) continue;
    const k = regelStuecke(r.material).length;
    if (k > n) { best = r; n = k; }
  }
  return best;
}

// ---------- Text lesen ----------

const klein = (t) => String(t || "").toLowerCase().replace(/ö/g, "oe").replace(/ä/g, "ae").replace(/ü/g, "ue");
// Welcher Lieferant steht im Text? Ganzes Wort, ohne Gross/klein.
export function lieferantIn(text, liste) {
  const t = " " + klein(text).replace(/[^a-z0-9]+/g, " ") + " ";
  for (const l of liste) {
    for (const n of [l.name, ...(l.aliase || [])]) {
      const w = klein(n).replace(/[^a-z0-9]+/g, " ").trim();
      if (w && t.includes(" " + w + " ")) return l.name;
    }
  }
  return null;
}
// Bestellnummer wie 2026008672 (BE-Nr. aus dem Gewatec)
const BE_RE = /\b20\d{8}\b/;
// fehlt (nichts eingetragen), bestellt (BE-Nr.), da (Menge oder Lager
// ohne BE-Nr.), offen (nur Text wie „Mat und FA noch orga“)
export function materialStand(j) {
  const t = String(j.material_menge || "").replace(/\|\s*$/, "").trim();
  if (!t) return "fehlt";
  if (BE_RE.test(t)) return "bestellt";
  if (/\d\s*(kg|stg|st\b|stk|stangen)|lager|rest|vorhanden|\bda\b/i.test(t)) return "da";
  return "offen";
}

// Muss (noch) bestellt werden: fehlt, nur Text, oder zu wenig da
export const zuBestellen = (z) => z.stand === "fehlt" || z.stand === "offen" || z.stand === "teil";

// Alle Mengen im Text in kg („300 kg · Notz …“, „10 Stg.“), null ohne Menge
export function mengeKg(j) {
  const t = String(j.material_menge || "").replace(BE_RE, " ");
  let kg = 0, gefunden = false;
  for (const m of t.matchAll(/(\d[\d']*(?:[.,]\d+)?)\s*(kg|stg|stangen)\b/gi)) {
    const n = Number(m[1].replace(/'/g, "").replace(",", "."));
    if (!isFinite(n)) continue;
    if (/kg/i.test(m[2])) kg += n;
    else { const je = kgJeStange(j.material_bez); if (!je) return null; kg += n * je; }
    gefunden = true;
  }
  return gefunden ? kg : null;
}
// Eine Menge für mehrere Aufträge („für alle 3 Artikel“, Rahmen) lässt
// sich nicht mit einem Auftrag vergleichen
const GETEILT_RE = /alle|rahmen|gesamt|zusammen|f[üu]r\s+\d|abruf/i;

// ---------- Arbeitstage ----------

const iso = (d) => alt.isoDatum(d);
export const heuteIso = () => iso(new Date());
function werktagPlus(von, n) {
  const d = new Date(von + "T12:00:00");
  let rest = n;
  while (rest > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) rest--; }
  return iso(d);
}
function naechsterWerktag(von) {
  const d = new Date(von + "T12:00:00");
  while (!(d.getDay() % 6)) d.setDate(d.getDate() + 1);
  return iso(d);
}

// Wann käme Material an, wenn man jetzt bestellt? null = Lieferzeit unbekannt
export function ankunft(l, jetzt) {
  if (!l || l.tage === null || l.tage === undefined) return null;
  jetzt = jetzt || new Date();
  let tag = iso(jetzt);
  // Nach dem Bestellschluss zählt erst der nächste Tag
  if (l.schluss) {
    const [h, m] = l.schluss.split(":").map(Number);
    if (jetzt.getHours() * 60 + jetzt.getMinutes() > h * 60 + m) tag = werktagPlus(tag, 1);
  }
  tag = naechsterWerktag(tag);
  if ((l.bestelltage || []).length) {
    for (let i = 0; i < 10 && !l.bestelltage.includes(new Date(tag + "T12:00:00").getDay()); i++) tag = werktagPlus(tag, 1);
  }
  let da = werktagPlus(tag, l.tage);
  // Kommt erst am nächsten Liefertag des Lieferanten
  if ((l.liefertage || []).length) {
    for (let i = 0; i < 10 && !l.liefertage.includes(new Date(da + "T12:00:00").getDay()); i++) da = werktagPlus(da, 1);
  }
  return { bestellen: tag, da };
}

const tagName = (n) => WOCHENTAGE.find((w) => w[0] === n)[1];
// „liefert täglich“, „liefert Di, Do“, leer = unbekannt
export function liefertageText(l) {
  const t = (l && l.liefertage) || [];
  if (!t.length) return "";
  return "liefert " + (t.length === 5 ? "täglich" : t.map(tagName).join(", "));
}

export function lieferbarText(l) {
  if (!l) return "";
  const t = [];
  if (l.tage !== null && l.tage !== undefined) t.push(l.tage === 0 ? "sofort lieferbar" : "Lieferbar " + l.tage + (l.tage === 1 ? " Arbeitstag" : " Arbeitstage"));
  if ((l.bestelltage || []).length && l.bestelltage.length < 5) t.push("bestellen nur " + l.bestelltage.map(tagName).join(", "));
  const lt = liefertageText(l);
  if (lt) t.push(lt);
  if (l.schluss) t.push("bis " + l.schluss);
  return t.join(" · ");
}

// ---------- Laden ----------

export async function planerLaden(tage) {
  const heute = heuteIso();
  const bis = werktagPlus(heute, tage || 10);
  const [lieferanten, regeln, wahl, offenR, histR, qsR, todoR, maschinen] = await Promise.all([
    lieferantenLaden(),
    regelnLaden(),
    wahlLaden().catch(() => ({})),
    alt.db.from("planwand").select("*").is("ended_at", null),
    // Verlauf: in welchem Auftrag welches Material wo bestellt wurde
    alt.db.from("jobs").select("id, material_bez, material_menge, planned_from")
      .not("material_menge", "is", null).not("material_bez", "is", null)
      .order("planned_from", { ascending: false }).limit(5000),
    alt.db.from("qs_meldungen").select("*").order("erstellt_am"),
    alt.db.from("planer_todos").select("*").order("erstellt_am"),
    alt.ladeAlleMaschinen().catch(() => []),
  ]);
  if (offenR.error) throw offenR.error;
  const offen = (offenR.data || []).filter(istOffen);
  const nrVon = {};
  maschinen.forEach((m) => { nrVon[m.id] = m.machine_number || m.name || ""; });

  // Je Material (Werkstoff + Form + Mass): bei wem wie oft, zuletzt wann
  const verlauf = {};
  for (const h of histR.data || []) {
    const z = materialZerlegen(h.material_bez);
    const l = z && lieferantIn(h.material_menge, lieferanten);
    if (!l) continue;
    const v = (verlauf[z.grund] = verlauf[z.grund] || {});
    const e = (v[l] = v[l] || { anzahl: 0, zuletzt: "" });
    e.anzahl++;
    if (String(h.planned_from || "") > e.zuletzt) e.zuletzt = String(h.planned_from || "");
  }

  // Aufträge, die im Zeitraum anfangen oder schon dran sind
  const geschaetzt = startSchaetzen(offen, heute);
  const material = await materialDatenLaden(offen).catch(() => null);
  const zeilen = [];
  for (const j of offen) {
    if (!j.planned_from || !String(j.material_bez || "").trim()) continue;
    const status = j.plan_status || "geplant";
    const start = status === "geplant" ? ((geschaetzt[j.id] || {}).start || j.planned_from) : heute;
    if (start > bis) continue;
    let stand = materialStand(j);
    const z = materialZerlegen(j.material_bez);
    let bedarf = null;
    if (material && material.teile[j.job_number]) {
      const b = bedarfRechnen(j, material.teile[j.job_number], material.maschineVon[j.machine_id], false);
      if (b && b.kg) bedarf = { kg: Math.ceil(b.kg), stangen: b.stangen, sicher: b.sicher };
    }
    // Teilmenge (Wunsch Patrick 12. November 2026: „wenn nur Teilmenge
    // vorhanden ist, soll es anzeigen, noch so viel“): da oder bestellt,
    // aber weniger als der Bedarf der offenen Stück
    let hatKg = null, fehltKg = null;
    if ((stand === "da" || stand === "bestellt") && bedarf && !istRahmen(j) && !GETEILT_RE.test(j.material_menge || "")) {
      hatKg = mengeKg(j);
      if (hatKg !== null && hatKg < bedarf.kg * 0.98) { fehltKg = Math.ceil(bedarf.kg - hatKg); stand = "teil"; }
    }
    // Ganz da: für die Bestellung uninteressant (Patrick: „juckt nicht“)
    if (stand === "da") continue;
    // An der Maschine (läuft, Rüsten) und bestellt: nichts mehr zu tun
    if (status !== "geplant" && stand === "bestellt") continue;
    const rest = material && z ? (material.posten || []).filter((p) => p.art === "lager" && !p.weg_am
      && (materialZerlegen(p.material) || {}).grund === z.grund) : [];
    zeilen.push({ j, start, stand, z, bedarf, regel: regelFuer(j.material_bez, regeln), hatKg, fehltKg, rest, rahmen: istRahmen(j),
      maschine: j.maschine_nr || nrVon[j.machine_id] || "",
      kandidaten: z && verlauf[z.grund] ? Object.entries(verlauf[z.grund])
        .sort((a, b) => b[1].anzahl - a[1].anzahl || b[1].zuletzt.localeCompare(a[1].zuletzt)).map(([n, e]) => ({ name: n, ...e })) : [] });
  }
  zeilen.sort((a, b) => a.start.localeCompare(b.start) || String(a.maschine).localeCompare(String(b.maschine), "de", { numeric: true }));
  lieferantenVerteilen(zeilen, lieferanten, wahl);

  return { heute, bis, tage, lieferanten, regeln, wahl, zeilen, offen, nrVon,
    qs: qsR.error ? [] : (qsR.data || []).filter((q) => !q.quittiert_am),
    todos: todoR.error ? null : (todoR.data || []) };
}

// Lieferant je Zeile: bestellt → aus dem Text; da → keiner; fehlt/offen
// → Regel „immer bei“, sonst wo am häufigsten bestellt (Gleichstand: zuletzt).
export function lieferantenVerteilen(zeilen, lieferanten, wahl) {
  const vonName = Object.fromEntries(lieferanten.map((l) => [l.name, l]));
  const offen = [];
  for (const z of zeilen) {
    z.lieferant = null; z.quelle = null; z.auch = [];
    z.kann = z.regel ? (z.regel.kann || []).filter((k) => k !== z.regel.muss) : [];
    if (z.stand === "bestellt") { z.lieferant = lieferantIn(z.j.material_menge, lieferanten); z.quelle = "bestellt"; continue; }
    if (z.stand === "da") continue;
    if (wahl[z.j.id]) { z.lieferant = wahl[z.j.id]; z.quelle = "gewaehlt"; continue; }
    // Regel „muss bei“ geht vor dem Verlauf
    if (z.regel && z.regel.muss) { z.lieferant = z.regel.muss; z.quelle = "regel"; continue; }
    if (z.kandidaten.length) offen.push(z);
  }
  // Ohne Regel (seit 1.516.0, Wunsch Patrick 13. November 2026): wo das Material am
  // häufigsten bestellt wurde, bei Gleichstand zuletzt; die anderen als „auch“.
  // Die Kandidaten sind schon so sortiert. Der Planer passt es mit Regeln an.
  for (const z of offen) { z.lieferant = z.kandidaten[0].name; z.quelle = "vorschlag"; }
  for (const z of zeilen) {
    // „Kann auch bei“ einer Regel ist nur Info: nicht im Vorschlag
    if (z.quelle === "vorschlag" || z.quelle === "gewaehlt") z.auch = z.kandidaten.map((k) => k.name).filter((n) => n !== z.lieferant);
    const l = z.lieferant && vonName[z.lieferant];
    const a = zuBestellen(z) && ankunft(l);
    z.ankunft = a || null;
    z.zuSpaet = !!(a && a.da > z.start);
  }
  return zeilen;
}

// ---------- Todos ----------

export async function todoNeu(text, faellig, fuerAlle = true) {
  const p = alt.profil || {};
  const zeile = { text, faellig: faellig || null, erstellt_name: p.full_name || p.email || null, fuer_alle: !!fuerAlle };
  if (alt.meineProfilId()) zeile.erstellt_von = alt.meineProfilId();
  let { data, error } = await alt.db.from("planer_todos").insert(zeile).select("*").single();
  // Ohne sql/planer-todos-fuer.sql kennt die Datenbank fuer_alle noch nicht: dann für alle
  if (error && /fuer_alle/.test(error.message || "")) {
    delete zeile.fuer_alle;
    ({ data, error } = await alt.db.from("planer_todos").insert(zeile).select("*").single());
  }
  if (error) throw error;
  alt.merkeSchritt("Todo anlegen", alt.rueckWeg("planer_todos", { id: data.id }));
  return data;
}
export async function todoHaken(t, erledigt) {
  const vorher = await alt.rueckSichern("planer_todos", { id: t.id });
  const p = alt.profil || {};
  const { error } = await alt.db.from("planer_todos").update(erledigt
    ? { erledigt_am: new Date().toISOString(), erledigt_von: p.full_name || p.email || null }
    : { erledigt_am: null, erledigt_von: null }).eq("id", t.id);
  if (error) throw error;
  alt.merkeSchritt(erledigt ? "Todo erledigt" : "Todo wieder offen", alt.rueckRein("planer_todos", vorher));
}
export async function todoAendern(t, felder) {
  const vorher = await alt.rueckSichern("planer_todos", { id: t.id });
  let { error } = await alt.db.from("planer_todos").update(felder).eq("id", t.id);
  if (error && /fuer_alle/.test(error.message || "")) {
    const ohne = { ...felder }; delete ohne.fuer_alle;
    ({ error } = await alt.db.from("planer_todos").update(ohne).eq("id", t.id));
  }
  if (error) throw error;
  alt.merkeSchritt("Todo ändern", alt.rueckRein("planer_todos", vorher));
}
export async function todoLoeschen(t) {
  const { error } = await alt.db.from("planer_todos").delete().eq("id", t.id);
  if (error) throw error;
  alt.merkeSchritt("Todo löschen", alt.rueckRein("planer_todos", t));
}
