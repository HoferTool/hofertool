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
import { materialZerlegen, materialDatenLaden, bedarfRechnen, startSchaetzen, istOffen, istRahmen } from "./material.js";

// Gefunden in den Aufträgen (12. November 2026); gilt, solange in den
// Einstellungen nichts gespeichert ist
export const LIEFERANTEN_VORGABE = [
  { name: "Notz", aliase: ["Notzi"] }, { name: "Metalix" }, { name: "Steeltec", aliase: ["Steelttec"] },
  { name: "Prometall", aliase: ["Pormetall"] }, { name: "Schmobi", aliase: ["Schmob"] }, { name: "Klein" },
  { name: "Kindlimann" }, { name: "Allega" }, { name: "Böhler", aliase: ["Boehler"] }, { name: "Pfenninger" },
  { name: "Thyssen" }, { name: "Bibus" }, { name: "Prexa" }, { name: "Looser" }, { name: "Capo" }, { name: "Cellpack" },
];
export const WOCHENTAGE = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"]];

const KONFIG = "material_lieferanten";
const WAHL = "planer_lieferant_wahl";

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
  return { bestellen: tag, da: werktagPlus(tag, l.tage) };
}

export function lieferbarText(l) {
  if (!l) return "";
  const t = [];
  if (l.tage !== null && l.tage !== undefined) t.push(l.tage === 0 ? "sofort lieferbar" : "Lieferbar " + l.tage + (l.tage === 1 ? " Arbeitstag" : " Arbeitstage"));
  if ((l.bestelltage || []).length && l.bestelltage.length < 5) t.push("bestellen nur " + l.bestelltage.map((n) => WOCHENTAGE.find((w) => w[0] === n)[1]).join(", "));
  if (l.schluss) t.push("bis " + l.schluss);
  return t.join(" · ");
}

// ---------- Laden ----------

export async function planerLaden(tage) {
  const heute = heuteIso();
  const bis = werktagPlus(heute, tage || 10);
  const [lieferanten, wahl, offenR, histR, qsR, todoR, maschinen] = await Promise.all([
    lieferantenLaden(),
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
    const stand = materialStand(j);
    // An der Maschine (läuft, Rüsten) mit Material: nichts mehr zu tun
    if (status !== "geplant" && stand !== "fehlt" && stand !== "offen") continue;
    const z = materialZerlegen(j.material_bez);
    let bedarf = null;
    if (material && material.teile[j.job_number]) {
      const b = bedarfRechnen(j, material.teile[j.job_number], material.maschineVon[j.machine_id], false);
      if (b && b.kg) bedarf = { kg: Math.ceil(b.kg), stangen: b.stangen, sicher: b.sicher };
    }
    const rest = material && z ? (material.posten || []).filter((p) => p.art === "lager" && !p.weg_am
      && (materialZerlegen(p.material) || {}).grund === z.grund) : [];
    zeilen.push({ j, start, stand, z, bedarf, rest, rahmen: istRahmen(j),
      maschine: j.maschine_nr || nrVon[j.machine_id] || "",
      kandidaten: z && verlauf[z.grund] ? Object.entries(verlauf[z.grund])
        .sort((a, b) => b[1].zuletzt.localeCompare(a[1].zuletzt)).map(([n, e]) => ({ name: n, ...e })) : [] });
  }
  zeilen.sort((a, b) => a.start.localeCompare(b.start) || String(a.maschine).localeCompare(String(b.maschine), "de", { numeric: true }));
  lieferantenVerteilen(zeilen, lieferanten, wahl);

  return { heute, bis, tage, lieferanten, wahl, zeilen, offen, nrVon,
    qs: qsR.error ? [] : (qsR.data || []).filter((q) => !q.quittiert_am),
    todos: todoR.error ? null : (todoR.data || []) };
}

// Lieferant je Zeile: bestellt → aus dem Text; da → keiner; fehlt/offen
// → von Hand gewählt, sonst gebündelt vorgeschlagen.
export function lieferantenVerteilen(zeilen, lieferanten, wahl) {
  const vonName = Object.fromEntries(lieferanten.map((l) => [l.name, l]));
  const offen = [];
  for (const z of zeilen) {
    z.lieferant = null; z.quelle = null; z.auch = [];
    if (z.stand === "bestellt") { z.lieferant = lieferantIn(z.j.material_menge, lieferanten); z.quelle = "bestellt"; continue; }
    if (z.stand === "da") continue;
    if (wahl[z.j.id]) { z.lieferant = wahl[z.j.id]; z.quelle = "gewaehlt"; continue; }
    if (z.kandidaten.length) offen.push(z);
  }
  // Zuerst zählen schon gewählte und bestellte Lieferanten: dort geht
  // ohnehin eine Bestellung hin
  const schonDa = new Set(zeilen.filter((z) => z.lieferant && z.stand !== "bestellt").map((z) => z.lieferant));
  const rechtzeitig = (z, name) => {
    const a = ankunft(vonName[name]);
    return !a || a.da <= z.start;
  };
  let rest = offen.slice();
  while (rest.length) {
    const punkte = {};
    for (const z of rest) for (const k of z.kandidaten) {
      const p = (punkte[k.name] = punkte[k.name] || { name: k.name, n: 0, recht: 0, zuletzt: "" });
      p.n++;
      if (rechtzeitig(z, k.name)) p.recht++;
      if (k.zuletzt > p.zuletzt) p.zuletzt = k.zuletzt;
    }
    const best = Object.values(punkte).sort((a, b) => (schonDa.has(b.name) - schonDa.has(a.name))
      || b.n - a.n || b.recht - a.recht || b.zuletzt.localeCompare(a.zuletzt))[0];
    if (!best) break;
    schonDa.add(best.name);
    rest = rest.filter((z) => {
      if (!z.kandidaten.some((k) => k.name === best.name)) return true;
      z.lieferant = best.name; z.quelle = "vorschlag";
      return false;
    });
  }
  for (const z of zeilen) {
    if (z.quelle === "vorschlag" || z.quelle === "gewaehlt") z.auch = z.kandidaten.map((k) => k.name).filter((n) => n !== z.lieferant);
    const l = z.lieferant && vonName[z.lieferant];
    const a = (z.stand === "fehlt" || z.stand === "offen") && ankunft(l);
    z.ankunft = a || null;
    z.zuSpaet = !!(a && a.da > z.start);
  }
  return zeilen;
}

// ---------- Todos ----------

export async function todoNeu(text, faellig) {
  const p = alt.profil || {};
  const { data, error } = await alt.db.from("planer_todos").insert({ text, faellig: faellig || null,
    erstellt_name: p.full_name || p.email || null }).select("*").single();
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
  const { error } = await alt.db.from("planer_todos").update(felder).eq("id", t.id);
  if (error) throw error;
  alt.merkeSchritt("Todo ändern", alt.rueckRein("planer_todos", vorher));
}
export async function todoLoeschen(t) {
  const { error } = await alt.db.from("planer_todos").delete().eq("id", t.id);
  if (error) throw error;
  alt.merkeSchritt("Todo löschen", alt.rueckRein("planer_todos", t));
}
