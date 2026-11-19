// =================================================================
//  ZEITERFASSUNG: Daten und Rechnung (seit 1.626.0, Wunsch Patrick
//  18. November 2026). Jede Stempelung ist eine Zeile in zeit_stempel
//  (sql/zeiterfassung.sql) mit art „kommen“ oder „gehen“. Hier werden
//  daraus Paare (Kommen → Gehen) und Summen je Tag gerechnet. Ein Paar
//  gehört zum Tag, an dem gekommen wurde; wer noch da ist, zählt bis
//  jetzt. Fehlt ein Gegenstück, ist das Paar „offen“ und zählt nicht.
// =================================================================
import { alt } from "../bruecke.jsx";

export const MAX_PAAR_STUNDEN = 16;   // länger offen = Gehen vergessen

// Stempelart (seit 1.640.0, Wunsch Patrick 19. November 2026: „anwesend
// von bis … dort soll auch die Stempelart eingetragen werden können“,
// „Rest vom Tag mit krank etc. ausfüllen bis auf Sollzeit“). Leer = Arbeit.
// Eine andere Art steht an beiden Stempelungen des Paars (zeit_stempel.
// stempelart, sql/hofertime-7-stempelart.sql). Bezahlte Arten zählen als
// Zeit wie Arbeit; Kompensieren zählt nicht, das Soll bleibt, die Stunden
// gehen also von der Gleitzeit ab.
export const STEMPELARTEN = [
  { id: "", name: "Arbeit" },
  { id: "krankheit", name: "Krankheit" },
  { id: "unfall", name: "Unfall" },
  { id: "arzt", name: "Arzt / Zahnarzt" },
  { id: "militaer", name: "Militär/Zivilschutz" },
  { id: "feuerwehr", name: "Feuerwehr" },
  { id: "schule", name: "Schule" },
  { id: "kompensieren", name: "Kompensieren (von der Gleitzeit)" },
];
export function stempelartName(id) {
  const a = STEMPELARTEN.find((x) => x.id === (id || ""));
  return a ? a.name.replace(/ \(.*\)$/, "") : id;
}

export function tagVon(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function uhrzeit(iso) {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// Minuten als „7:42 h“
export function dauerText(min) {
  const m = Math.round(min || 0);
  const v = m < 0 ? "−" : "";
  const a = Math.abs(m);
  return v + Math.floor(a / 60) + ":" + String(a % 60).padStart(2, "0") + " h";
}

// Stempelungen einer Person (sortiert) → Paare
export function paareRechnen(stempel, jetzt = new Date()) {
  const liste = [...stempel].sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));
  const paare = [];
  let offen = null;
  for (const s of liste) {
    if (s.art === "kommen") {
      if (offen) paare.push({ kommen: offen, gehen: null, fehlt: "gehen" });
      offen = s;
    } else {
      if (offen) { paare.push({ kommen: offen, gehen: s }); offen = null; }
      else paare.push({ kommen: null, gehen: s, fehlt: "kommen" });
    }
  }
  if (offen) {
    const std = (jetzt - new Date(offen.zeit)) / 36e5;
    paare.push(std <= MAX_PAAR_STUNDEN && std >= 0
      ? { kommen: offen, gehen: null, laeuft: true }
      : { kommen: offen, gehen: null, fehlt: "gehen" });
  }
  for (const p of paare) {
    const ende = p.gehen ? new Date(p.gehen.zeit) : (p.laeuft ? jetzt : null);
    p.dauer = p.kommen && ende ? Math.max(0, (ende - new Date(p.kommen.zeit)) / 6e4) : 0;
    p.stempelart = (p.kommen && p.kommen.stempelart) || (p.gehen && p.gehen.stempelart) || "";
    p.minuten = p.stempelart === "kompensieren" ? 0 : p.dauer;
    p.tag = tagVon((p.kommen || p.gehen).zeit);
  }
  return paare;
}

// Gutschrift Spätschicht (seit 1.628.0, Wunsch Patrick 18. November 2026:
// „wenn diese Personen erst gegen Mittag einstempeln und am Abend nach
// 18.00 ausstempeln, sollen sie 2,5 h plus gutgeschrieben bekommen“, „wer
// schon am Morgen vor 11 kommt, zählt nicht“, „nicht für Fatih Semiz, er
// arbeitet immer am Abend“): erstes Kommen des Tages ab 11:00 und letztes
// Gehen nach 18:00, Tag ohne fehlende Stempelung → 2:30 h dazu. Nur für
// Personen mit Häkchen im Profil (zeit_personen.spaet_gutschrift = true;
// Patrick: „es können nur Gabriele, Sebastian, Tristan und Dominik sein“).
export const SPAET = { ab: 11 * 60, nach: 18 * 60, minuten: 150 };
const tagesMinute = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
export function spaetGutschrift(t, einst) {
  if (!t || t.fehler || !einst || einst.spaet_gutschrift !== true) return 0;
  const arbeit = t.paare.filter((p) => !p.stempelart);
  const kommen = arbeit.filter((p) => p.kommen).map((p) => p.kommen.zeit).sort();
  const gehen = arbeit.filter((p) => p.gehen).map((p) => p.gehen.zeit).sort();
  if (!kommen.length || !gehen.length) return 0;
  const letztes = gehen[gehen.length - 1];
  if (tagVon(letztes) !== t.tag) return 0;
  return tagesMinute(kommen[0]) >= SPAET.ab && tagesMinute(letztes) > SPAET.nach ? SPAET.minuten : 0;
}

// Paare → Map Tag → { paare, minuten, fehler, gutschrift }. Mit einst
// zählt die Gutschrift Spätschicht in minuten mit.
export function tageRechnen(paare, einst) {
  const tage = new Map();
  for (const p of paare) {
    let t = tage.get(p.tag);
    if (!t) { t = { tag: p.tag, paare: [], minuten: 0, fehler: 0, arten: {} }; tage.set(p.tag, t); }
    t.paare.push(p);
    t.minuten += p.minuten;
    if (p.stempelart) t.arten[p.stempelart] = (t.arten[p.stempelart] || 0) + p.dauer;
    if (p.fehlt) t.fehler++;
  }
  if (einst !== undefined) tage.forEach((t) => { t.gutschrift = spaetGutschrift(t, einst); t.minuten += t.gutschrift; });
  return tage;
}

// Ist die Person gerade eingestempelt? Letzte Stempelung ist „kommen“
// und nicht älter als MAX_PAAR_STUNDEN.
export function stand(stempel, jetzt = new Date()) {
  const letzte = [...stempel].sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)))[0];
  if (!letzte) return { da: false, letzte: null };
  const std = (jetzt - new Date(letzte.zeit)) / 36e5;
  return { da: letzte.art === "kommen" && std <= MAX_PAAR_STUNDEN, letzte };
}

export function quelleJetzt() {
  return alt.istTippgeraet && alt.istTippgeraet() ? "handy" : "pc";
}

export async function stempelLaden(personId, von, bis) {
  let q = alt.db.from("zeit_stempel").select("*").gte("zeit", von).lt("zeit", bis).order("zeit");
  if (personId) q = q.eq("person_id", personId);
  const r = await alt.zeitlimit(q, 15000, "Zeiterfassung");
  if (r.error) {
    if (/zeit_stempel|relation|schema cache/i.test(String(r.error.message || ""))) return null;
    throw r.error;
  }
  return r.data || [];
}

// Stempeln jetzt. Rückgängig löscht die Zeile wieder.
export async function stempeln(art, personId, quelle) {
  const zeile = { art, quelle: quelle || quelleJetzt() };
  if (personId) zeile.person_id = personId;
  const r = await alt.db.from("zeit_stempel").insert(zeile).select("*").single();
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return null; }
  alt.merkeSchritt(art === "kommen" ? "Einstempeln" : "Ausstempeln", alt.rueckWeg("zeit_stempel", { id: r.data.id }));
  return r.data;
}

// Wochenbeginn (Montag) als Date um 00:00
export function montag(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wt = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wt);
  return x;
}

export function tagePlus(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return x;
}

// Datum und Uhrzeit aus Feldern (JJJJ-MM-TT, HH:MM) als ISO mit Zeitzone des Geräts
export function ausFeldern(datum, zeit) {
  const [j, m, t] = String(datum).split("-").map(Number);
  const [h, mi] = String(zeit).split(":").map(Number);
  if (!j || !m || !t || !Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return new Date(j, m - 1, t, h, mi).toISOString();
}

// ---------- Sollzeit und Saldo (Monatslöhner) ----------
// Soll je Arbeitstag = Woche × Pensum / 5. Kein Soll an Wochenenden,
// Betriebsferien (istWochenende), Feiertagen und an Tagen mit Ferien,
// Militär/ZS oder Feuerwehr auf der Planwand. Kompensieren hat Soll
// (es geht vom Saldo ab). Stundenlöhner haben kein Soll.
export function sollJeTag(einst, tag) {
  if (!einst || einst.lohnart === "stunde") return 0;
  // Sollzeit je Wochentag aus dem Profil (Teilpensen), 1 = Montag
  const st = einst.soll_tage;
  if (st && typeof st === "object" && Object.keys(st).length) {
    if (!tag) return 0;
    return (Number(st[new Date(tag + "T12:00").getDay()]) || 0) * 60;
  }
  if (tag && [0, 6].includes(new Date(tag + "T12:00").getDay())) return 0;
  return (Number(einst.soll_woche_h) || 0) * (Number(einst.pensum) || 0) / 100 / 5 * 60;
}

// Bezahlte Feiertage (seit 1.626.0, Wunsch Patrick 18. November 2026:
// „zum Voraus bezahlte Feiertage angeben … wenn sie dann nicht stempeln,
// wird es als abwesend bezahlt gerechnet“, „oder auch im Nachhinein“).
// Admins tragen sie in zeit_feiertage ein. Stempelt jemand an so einem Tag
// nicht, gilt er als bezahlt abwesend (Art „feiertag“, kein Soll); stempelt
// er, ist es ein normaler Arbeitstag. Gerechnet wird jedes Mal neu, darum
// wirkt ein nachträglich eingetragener Feiertag auch rückwirkend.
// Solange keine eingetragen sind, gelten die Feiertage der Planwand fest
// als frei wie bisher.
let bezahlteFeiertage = null; // Map datum → name, null = noch keine
export function feiertageSetzen(liste) {
  bezahlteFeiertage = liste && liste.length ? new Map(liste.map((f) => [f.datum, f.name || "Feiertag"])) : null;
}
export function feiertageAktiv() { return bezahlteFeiertage; }
export async function feiertageLaden() {
  const r = await alt.zeitlimit(alt.db.from("zeit_feiertage").select("datum, name").order("datum"), 8000, "Feiertage")
    .then((x) => x, () => ({ data: null }));
  if (!r.error && r.data) feiertageSetzen(r.data);
  return r.error ? null : (r.data || []);
}
// Trägt bezahlte Feiertage ohne Stempelung in die Abwesenheiten ein
export function feiertageEintragen(abwesend, tage) {
  if (!bezahlteFeiertage) return abwesend;
  bezahlteFeiertage.forEach((name, tag) => {
    if (abwesend.get(tag) || (tage && tage.get(tag)) || freierTag(tag)) return;
    abwesend.set(tag, "feiertag");
  });
  return abwesend;
}

const feiertagGemerkt = new Map();
export function istFeiertag(tag) {
  if (bezahlteFeiertage) return false;
  const j = Number(tag.slice(0, 4));
  if (!feiertagGemerkt.has(j)) feiertagGemerkt.set(j, new Set((alt.feiertage ? alt.feiertage(j) : []).map((f) => f.datum)));
  return feiertagGemerkt.get(j).has(tag);
}

export function freierTag(tag) {
  return (alt.istWochenende ? alt.istWochenende(tag) : [0, 6].includes(new Date(tag).getDay())) || istFeiertag(tag);
}

// Abwesenheiten der Planwand (vacations.person ist der Name) → Set der Tage
// Gezählt wird ein Eintrag, dessen Name genau dem vollen Namen der Person
// oder einem ihrer Ferien-Namen (zeit_personen.ferien_namen) entspricht.
export function abwesendeTage(ferien, name, weitere) {
  const tage = new Map();
  // Ohne Namen ist die Liste schon gefiltert (zeit_abwesenheiten in der Datenbank)
  const namen = new Set([name].concat(weitere || []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean));
  for (const f of ferien || []) {
    if (namen.size && !namen.has(String(f.person || "").trim().toLowerCase())) continue;
    for (const d of alt.arbeitstage(f.von, Number(f.tage) || 1)) tage.set(d, f.abwesenheit || "ferien");
  }
  return tage;
}

// Soll, das bis jetzt zählt (seit 1.640.0, Patrick 19. November 2026:
// „warum steigt die Gleitzeit, obwohl die Sollzeit noch nicht erreicht
// ist?“): frühere Tage ganz; heute höchstens so viel, wie schon gearbeitet
// wurde. So bleibt die Gleitzeit während des Tages stehen und steigt erst,
// wenn die Sollzeit überschritten ist. Am Abend zählt das ganze Soll.
export function sollBisher(tag, heute, einst, abwesend, ist) {
  if (tag < heute) return sollTag(tag, einst, abwesend);
  if (tag > heute) return 0;
  return Math.min(sollTag(tag, einst, abwesend), Math.max(0, ist || 0));
}

export function sollTag(tag, einst, abwesend) {
  if (freierTag(tag)) return 0;
  const a = abwesend && abwesend.get(tag);
  if (a && a !== "kompensieren") return 0;
  return sollJeTag(einst, tag);
}

// Ferienguthaben eines Jahres. Anspruch: mit Geburtstag und Ferienstufen
// (Wunsch Patrick 18. November 2026: „verschiedene Ferienguthaben anhand
// des Alters … auf Grund des Alters und des Anstellungspensums selbst
// berechnet“) die Tage der Stufe für das Alter, das die Person in diesem
// Jahr erreicht, mal Pensum; sonst die Tage aus dem Profil. Dazu der
// Übertrag: im Jahr, für das er im Profil steht, dieser, in jedem
// späteren Jahr von selbst der Rest des Vorjahrs („im neuen Jahr soll dann
// automatisch aufgefüllt werden“). Dazu Umbuchungen Gleitzeit ↔ Ferien
// (zeit_buchungen.tage). Gezählt werden Arbeitstage mit Art „Ferien“ auf
// der Planwand, ohne Feiertage und ohne Tage ohne Sollzeit (Teilpensum).
export function altersStufe(stufen, alter) {
  let tage = null;
  for (const s of (stufen || []).slice().sort((x, y) => x.ab_alter - y.ab_alter)) if (alter >= s.ab_alter) tage = Number(s.tage);
  return tage;
}
export function ferienAnspruchJahr(einst, jahr, stufen) {
  const e = einst || {};
  if (e.ferien_auto !== false && e.geburtstag && stufen && stufen.length) {
    const alter = jahr - Number(String(e.geburtstag).slice(0, 4));
    const t = altersStufe(stufen, alter);
    if (t !== null) return Math.round(t * (Number(e.pensum ?? 100) / 100) * 10) / 10;
  }
  return Number(e.ferien_tage_jahr ?? 25);
}
export function ferienStand(einst, abwesend, jahr, heute, extra) {
  const e = einst || {};
  const x = extra || {};
  const startJahr = Number(e.ferien_jahr) || jahr;
  if (jahr < startJahr) return { anspruch: 0, uebertrag: 0, gebucht: 0, bezogen: 0, geplant: 0, rest: 0 };
  let uebertrag = 0;
  if (jahr === startJahr) uebertrag = Number(e.ferien_uebertrag) || 0;
  else if (jahr - startJahr <= 10) uebertrag = ferienStand(einst, abwesend, jahr - 1, heute, extra).rest;
  const jahresTage = ferienAnspruchJahr(e, jahr, x.stufen);
  const gebucht = (x.buchungen || []).filter((b) => String(b.datum).startsWith(String(jahr)))
    .reduce((s, b) => s + (Number(b.tage) || 0), 0);
  let bezogen = 0, geplant = 0;
  // Der Übertrag im Startjahr ist der Stand aus dem alten System per
  // Saldo-Start, darin sind frühere Ferien schon abgezogen (Patrick 18.
  // November 2026: „nichts aus der Vergangenheit, die Salden von heute aus
  // dem alten System stimmen“). Darum zählen dort nur Tage ab Saldo-Start.
  const ab = jahr === startJahr && e.saldo_start_tag ? String(e.saldo_start_tag).slice(0, 10) : "";
  abwesend.forEach((art, tag) => {
    if (art !== "ferien" || Number(tag.slice(0, 4)) !== jahr || freierTag(tag)) return;
    if (ab && tag < ab) return;
    // Teilpensum: an einem Tag ohne Sollzeit kostet Ferien nichts
    if (e.soll_tage && Object.keys(e.soll_tage).length && e.lohnart !== "stunde" && !sollJeTag(e, tag)) return;
    if (tag <= heute) bezogen++; else geplant++;
  });
  const anspruch = Math.round((jahresTage + uebertrag + gebucht) * 100) / 100;
  return { anspruch, jahresTage, uebertrag, gebucht, bezogen, geplant, rest: Math.round((anspruch - bezogen - geplant) * 100) / 100 };
}

// Ein Ferientag beim Umbuchen = Sollzeit eines durchschnittlichen Arbeitstags
export function minutenJeFerientag(einst) {
  const e = einst || {};
  const st = e.soll_tage;
  if (st && Object.keys(st).length) {
    const tage = Object.values(st).map(Number).filter((h) => h > 0);
    return tage.length ? Math.round(tage.reduce((s, h) => s + h, 0) / tage.length * 60) : 0;
  }
  return Math.round(sollJeTag({ ...e, lohnart: "monat" }, "2026-11-16"));
}

// Was nicht stimmt, in den letzten 31 Tagen bis gestern (Wunsch Patrick
// 18. November 2026: „Fehlermeldungen erhalten, wenn etwas nicht stimmt“):
// fehlendes Kommen oder Gehen, mehr als 12 Stunden am Tag, und bei
// Monatslöhnern ein Arbeitstag ohne Stempelung und ohne Abwesenheit.
export const LANGER_TAG_MIN = 12 * 60;
export function fehlerSuchen(tage, einst, abwesend, heute, ab) {
  const raus = [];
  const monat = !!einst && einst.lohnart !== "stunde";
  for (let tag = alt.plusTage(heute, -31); tag < heute; tag = alt.plusTage(tag, 1)) {
    const t = tage.get(tag);
    if (t && t.fehler) {
      const p = t.paare.find((x) => x.fehlt);
      raus.push({ tag, text: p && p.fehlt === "kommen" ? "Kommen fehlt" : "Gehen fehlt" });
    } else if (t && t.minuten > LANGER_TAG_MIN) {
      raus.push({ tag, text: "Über 12 Stunden, stimmt das?" });
    } else if (!t && monat && ab && tag >= ab && !freierTag(tag) && sollJeTag(einst, tag) > 0 && !(abwesend && abwesend.get(tag))) {
      raus.push({ tag, text: "Keine Stempelung" });
    }
  }
  return raus;
}

// Saldo von saldo_start_tag (sonst erste Stempelung) bis gestern, dazu
// heute, was schon da ist. Nur Monatslöhner.
// Gleitzeit am Ende jedes Tages ab Saldo-Beginn bis heute (seit 1.633.0,
// Wunsch Patrick 18. November 2026: „man soll täglich sehen, wie sich der
// Gleitzeitverlauf ändert“). Gleich gerechnet wie saldoRechnen; heute
// ohne Soll, solange der Tag läuft. Liefert Map Datum → Minuten.
export function saldoVerlauf(einst, stempelAlle, ferien, buchungen) {
  const aus = new Map();
  if (!einst || einst.lohnart === "stunde") return aus;
  const heute = alt.isoDatum(new Date());
  const tage = tageRechnen(paareRechnen(stempelAlle), einst);
  const erster = einst.saldo_start_tag || (stempelAlle[0] && tagVon(stempelAlle[0].zeit));
  if (!erster) return aus;
  const abw = feiertageEintragen(abwesendeTage(ferien), tage);
  const jeTag = new Map();
  for (const b of buchungen || []) if (b.datum <= heute) jeTag.set(b.datum, (jeTag.get(b.datum) || 0) + (Number(b.minuten) || 0));
  let min = einst.saldo_start_min || 0;
  for (let d = erster; d <= heute; d = alt.plusTage(d, 1)) {
    const ist = tage.get(d) ? tage.get(d).minuten : 0;
    min += (jeTag.get(d) || 0) + ist - sollBisher(d, heute, einst, abw, ist);
    aus.set(d, min);
  }
  // Vor dem Saldo-Beginn zurückgerechnet (seit 1.635.0, Wunsch Patrick
  // 18. November 2026: „der Saldo soll für jeden Tag angezeigt werden“).
  // Der Saldo-Start ist der Stand am Morgen des Starttags, also der Stand
  // am Abend davor; jeder frühere Tag zieht ab, was der Tag danach brachte.
  // Reicht zurück bis zur ersten Stempelung.
  const frueh = stempelAlle.reduce((m, x) => { const t = tagVon(x.zeit); return !m || t < m ? t : m; }, "");
  if (frueh && frueh < erster) {
    let stand = einst.saldo_start_min || 0;
    for (let d = alt.plusTage(erster, -1); d >= frueh; d = alt.plusTage(d, -1)) {
      aus.set(d, stand);
      const ist = tage.get(d) ? tage.get(d).minuten : 0;
      stand -= (jeTag.get(d) || 0) + ist - sollTag(d, einst, abw);
    }
  }
  return aus;
}

export function saldoRechnen(einst, stempelAlle, ferien, name, buchungen) {
  if (!einst || einst.lohnart === "stunde") return null;
  const heute = alt.isoDatum(new Date());
  const tage = tageRechnen(paareRechnen(stempelAlle), einst);
  const erster = einst.saldo_start_tag || (stempelAlle[0] && tagVon(stempelAlle[0].zeit));
  if (!erster) return { min: (einst.saldo_start_min || 0) + (buchungen || []).reduce((s, b) => s + (b.datum <= heute ? Number(b.minuten) || 0 : 0), 0), ab: null };
  const abw = feiertageEintragen(abwesendeTage(ferien), tage);
  let min = einst.saldo_start_min || 0;
  // Umbuchungen Ferien ↔ Gleitzeit ab Saldo-Beginn bis heute
  for (const b of buchungen || []) if (b.datum >= erster && b.datum <= heute) min += Number(b.minuten) || 0;
  for (let d = erster; d <= heute; d = alt.plusTage(d, 1)) {
    const ist = tage.get(d) ? tage.get(d).minuten : 0;
    // Heute zählt das Soll erst, wenn der Tag vorbei ist
    min += ist - sollBisher(d, heute, einst, abw, ist);
  }
  return { min, ab: erster };
}


// Ferienstufen nach Alter und Umbuchungen einer Person
export async function ferienStufenLaden() {
  const r = await alt.zeitlimit(alt.db.from("zeit_ferienstufen").select("ab_alter, tage").order("ab_alter"), 8000, "Ferienstufen")
    .then((x) => x, () => ({ data: [] }));
  return r.error ? [] : (r.data || []);
}
export async function buchungenLaden(personId) {
  const r = await alt.zeitlimit(alt.db.from("zeit_buchungen").select("*").eq("person_id", personId).order("datum"), 8000, "Umbuchungen")
    .then((x) => x, () => ({ data: [] }));
  return r.error ? [] : (r.data || []);
}

// ---------- Dienstjubiläen ----------
// Wunsch Patrick 18. November 2026: „5 Jahres Jubiläen sollen mir
// angezeigt werden“, „alle 5 Jahre ist ein Dienstjubiläum“. Aus dem
// Eintritt im Profil (zeit_personen.eintritt). Liefert die Jubiläen,
// deren Tag zwischen `vorTagen` zurück und `tage` voraus liegt.
export function jubilaeen(liste, heuteIso, tage = 60, vorTagen = 7) {
  const von = alt.plusTage(heuteIso, -vorTagen);
  const bis = alt.plusTage(heuteIso, tage);
  const aus = [];
  liste.forEach((x) => {
    if (!x.eintritt) return;
    const [j, m, t] = String(x.eintritt).slice(0, 10).split("-");
    for (let jahr = Number(heuteIso.slice(0, 4)) - 1; jahr <= Number(bis.slice(0, 4)); jahr++) {
      const jahre = jahr - Number(j);
      if (jahre <= 0 || jahre % 5) continue;
      // 29. Februar im Nicht-Schaltjahr: am 28.
      let datum = jahr + "-" + m + "-" + t;
      if (alt.isoDatum(alt.ausIso(datum)) !== datum) datum = jahr + "-" + m + "-28";
      if (datum >= von && datum <= bis) aus.push({ ...x, jahre, datum });
    }
  });
  return aus.sort((a, b) => (a.datum < b.datum ? -1 : 1));
}

export async function jubilaeenLaden(heuteIso, tage, vorTagen) {
  const [e, p] = await Promise.all([
    alt.zeitlimit(alt.db.from("zeit_personen").select("person_id, eintritt"), 8000, "Eintritt").then((x) => x, () => ({ data: [] })),
    alt.zeitlimit(alt.db.from("profiles").select("id, full_name, is_active"), 8000, "Personen").then((x) => x, () => ({ data: [] })),
  ]);
  if (e.error || p.error) return [];
  const namen = new Map((p.data || []).filter((x) => x.is_active !== false).map((x) => [x.id, x.full_name]));
  const liste = (e.data || []).filter((x) => x.eintritt && namen.has(x.person_id))
    .map((x) => ({ person_id: x.person_id, name: namen.get(x.person_id), eintritt: x.eintritt }));
  return jubilaeen(liste, heuteIso, tage, vorTagen);
}
