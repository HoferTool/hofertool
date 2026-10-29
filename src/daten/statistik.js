// =================================================================
//  STATISTIK (1.159.0, Wunsch Patrick 23. Oktober 2026)
//  Zahlen zur Produktion je Maschine und je Artikel (HOCO Nr.):
//  Ausstoss pro Tag, Produktionszeit in Stunden, Auslastung und die
//  Übergangszeit von Auftrag zu Auftrag. Dazu der Werkzeugverbrauch,
//  vorerst aus den Bestellungen (Einrichtblätter mit Artikelnummern
//  der Werkzeuge gibt es noch nicht).
//
//  Woher die Zahlen kommen:
//  - Ausstoss: production_records hält den Gesamtzähler seit Beginn
//    des Auftrags, die Tagesmenge ist die Differenz zum vorherigen
//    Eintrag desselben Auftrags (wie ladeZaehlerstaende in app.js).
//  - Produktionszeit: Tagesmenge × Stückzeit (hoco_type_data je HOCO
//    Nr. und Maschinentyp). Ohne Stückzeit zählen die Stück trotzdem
//    zum Ausstoss, aber nicht zur Zeit; die Seite sagt, wie viele.
//  - Auslastung: Produktionszeit geteilt durch 10 h je Tag, 10 h =
//    100 % (Vorgabe Patrick). Seit 1.258.0 zählen nur Tage, an denen
//    für die Maschine eine Stückzahl gemeldet ist (Wunsch Patrick
//    29. Oktober 2026: „Tage nicht berücksichtigen, an denen keine
//    Stückzahl gemeldet ist“); ein Tag ohne Meldung ist kein Tag mit
//    0 Stück, sondern einer, über den man nichts weiss. Vorher alle
//    Arbeitstage Mo–Fr. Heute zählt nicht (1.257.0).
//  - Startmengen (1.160.0, Wunsch Patrick 23. Oktober 2026: „Es kann
//    keine höhere Auslastung als 240 % geben“): Als das HoferTool Ende
//    September startete, liefen viele Aufträge schon; ihr erster
//    Zählerstand war der Stand seit Wochen, kein Tagesausstoss. Der
//    erste Eintrag eines Auftrags zählt darum nur, wenn der Auftrag am
//    selben oder am Arbeitstag davor angefangen hat, sonst ist er die
//    Startmenge. Ein Eintrag, der mehr Stunden ergibt, als seit dem
//    vorherigen Eintrag Zeit war (24 h je Tag), zählt auch nicht. Und
//    eine Maschine kann an einem Tag höchstens 24 h laufen (240 %).
//  - Übergang: vom Beenden eines Auftrags (ended_at) bis der nächste
//    Auftrag derselben Maschine auf „läuft“ geht (started_at). Rüsten
//    setzt kein started_at, die Rüstzeit steckt also im Übergang.
//    Samstag und Sonntag zählen nicht mit.
//  - Ausschuss: die Mengen aus den Meldungen der Qualitätssicherung
//    (qs_ausschuss, bleibt nach dem Quittieren, sql/qs-ausschuss.sql),
//    Quote = Ausschuss / Ausstoss, nach dem Tag der Meldung.
//  - Werkzeug: Bestellpositionen nach Artikel, mit Ziel Maschine auch
//    je Maschine; gezählt nach dem Tag der Bestellung (sonst Anlegen).
// =================================================================
import { alt } from "../bruecke.jsx";

export const STUNDEN_VOLL = 10;
const TAG = 86400000;
const MINUTE = 60000;
// Längere Lücken sind keine Übergänge mehr, sondern Stillstand oder
// alte Daten aus dem Import
const UEBERGANG_MAX = 14 * TAG;
// Mehr kann eine Maschine an einem Tag nicht laufen
export const STUNDEN_MAX = 24;

const LAUFEN = new Set(["laeuft", "fertig"]);

// Alle Zeilen einer Abfrage, auch über die Grenze von 1'000 hinaus
async function alleZeilen(bauen, name) {
  const raus = [];
  for (let von = 0; von < 50000; von += 1000) {
    const r = await alt.zeitlimit(bauen().range(von, von + 999), 15000, name);
    if (r.error) throw r.error;
    const d = r.data || [];
    raus.push(...d);
    if (d.length < 1000) break;
  }
  return raus;
}

// Mo–Fr von von bis bis (beide JJJJ-MM-TT), höchstens bis gestern,
// weil der heutige Tag nicht mitzählt
export function arbeitstageZaehlen(von, bis) {
  const gestern = alt.plusTage(alt.isoDatum(new Date()), -1);
  const ende = bis < gestern ? bis : gestern;
  let n = 0;
  for (let t = von; t <= ende; t = alt.plusTage(t, 1)) {
    const w = alt.ausIso(t).getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

// Zeit zwischen zwei Zeitpunkten ohne Samstag und Sonntag
export function ohneWochenende(a, b) {
  let ms = 0;
  let t = new Date(a);
  const ende = new Date(b);
  while (t < ende) {
    const morgen = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    const stueck = (morgen < ende ? morgen : ende) - t;
    const w = t.getDay();
    if (w !== 0 && w !== 6) ms += stueck;
    t = morgen;
  }
  return ms;
}

export function dauerText(ms) {
  if (!Number.isFinite(ms)) return "–";
  const min = Math.round(ms / MINUTE);
  if (min < 60) return min + " min";
  const h = ms / 3600000;
  if (h < 24) return kommaText(h) + " h";
  return kommaText(h / 24) + " Tage";
}

// Eine Stelle nach dem Komma, Tausender mit Apostroph: 1'234,5
export function kommaText(n, stellen = 1) {
  const f = Math.pow(10, stellen);
  const r = Math.round(Math.abs(n) * f);
  const ganz = Math.floor(r / f), rest = r % f;
  return (n < 0 && r ? "-" : "") + alt.zahlText(ganz) + (stellen ? "," + String(rest).padStart(stellen, "0") : "");
}

export const stundenText = (h) => Number.isFinite(h) ? kommaText(h) + " h" : "–";

export const prozentText = (p) => Number.isFinite(p) ? Math.round(p * 100) + " %" : "–";

export function hocoNormal(nr) {
  return String(nr || "").trim().replace(/\s+/g, "");
}

// Maschinen in der Reihenfolge der Planwand: zuerst nach Park (wie
// ladeParks sie liefert, externe zuletzt), im Park nach sort_order.
// ladeMaschinen sortiert schon nach sort_order und Name; sort ist
// stabil, darum genügt der Park.
export function planwandReihe(maschinen, parks) {
  const platz = new Map((parks || []).map((p, i) => [p.id, i]));
  const von = (m) => (platz.has(m.park_id) ? platz.get(m.park_id) : 1e6);
  return maschinen.slice().sort((a, b) => von(a) - von(b));
}

// ---------------------------------------------------------------
//  Laden
// ---------------------------------------------------------------
export async function statistikLaden(von, bis) {
  const parks = await alt.ladeParks(false);
  // Reihenfolge wie auf der Planwand: Park für Park, darin sort_order
  // ohne Maschinen externer Parks (Wunsch Patrick 26. Oktober 2026)
  const maschinen = planwandReihe((await alt.ladeMaschinen(false))
    .filter((m) => !alt.parkIstExtern(m.park_id)), parks);
  let typen = [];
  try { typen = await alt.ladeTypen(); } catch (f) { /* ohne Typnamen geht es auch */ }
  const ids = maschinen.map((m) => m.id);
  if (!ids.length) return { maschinen, typen, jobs: [], records: [], zeiten: [], ausschuss: [], von, bis };

  const ab = alt.ausIso(von);
  const bisEnde = alt.ausIso(alt.plusTage(bis, 1));
  const felder = "id, job_number, fa_nr, machine_id, plan_status, started_at, ended_at, target_quantity, material_bez";
  const [jobsOffen, jobsBeendet, records, zeiten, ausschuss] = await Promise.all([
    alleZeilen(() => alt.db.from("jobs").select(felder).in("machine_id", ids)
      .is("ended_at", null).lt("started_at", bisEnde.toISOString()).order("id"), "Aufträge"),
    // Vorgänger der ersten Übergänge: bis zwei Wochen vor dem Zeitraum
    alleZeilen(() => alt.db.from("jobs").select(felder).in("machine_id", ids)
      .gte("ended_at", new Date(ab.getTime() - UEBERGANG_MAX).toISOString())
      .order("id"), "Aufträge"),
    // Ein Auftrag, der vor dem Zeitraum anfing, braucht seinen letzten
    // Zählerstand davor, sonst zählt sein ganzer Stand am ersten Tag
    alleZeilen(() => alt.db.from("production_records")
      .select("id, machine_id, record_date, quantity, job_id")
      .in("machine_id", ids).gte("record_date", alt.plusTage(von, -120)).lte("record_date", bis)
      .order("record_date").order("id"), "Stückzahlen"),
    alleZeilen(() => alt.db.from("hoco_type_data").select("hoco_nr, type_id, stueckzeit_s").order("hoco_nr"),
      "Stückzeiten").catch(() => []),
    // null = Tabelle fehlt noch (sql/qs-ausschuss.sql)
    alleZeilen(() => alt.db.from("qs_ausschuss")
      .select("id, job_id, machine_id, hoco_nr, stueck, notiz, erstellt_am, erstellt_name")
      .in("machine_id", ids).gte("erstellt_am", ab.toISOString()).lt("erstellt_am", bisEnde.toISOString())
      .order("erstellt_am"), "Ausschuss").catch(() => null),
  ]);
  const jobs = new Map();
  jobsOffen.concat(jobsBeendet).forEach((j) => jobs.set(j.id, j));
  // Aufträge, zu denen Zählerstände da sind, die aber nicht oben dabei waren
  const fehlen = [...new Set(records.map((z) => z.job_id).filter((id) => id && !jobs.has(id)))];
  for (let i = 0; i < fehlen.length; i += 200) {
    const r = await alt.zeitlimit(alt.db.from("jobs").select(felder).in("id", fehlen.slice(i, i + 200)),
      15000, "Aufträge");
    if (r.error) throw r.error;
    (r.data || []).forEach((j) => jobs.set(j.id, j));
  }
  return { maschinen, typen, jobs: [...jobs.values()], records, zeiten, ausschuss, von, bis };
}

// ---------------------------------------------------------------
//  Rechnen
// ---------------------------------------------------------------
export function statistikRechnen(d) {
  const { maschinen, typen, jobs, records, zeiten, ausschuss, von, bis } = d;
  const jobVon = new Map(jobs.map((j) => [j.id, j]));
  const maschineVon = new Map(maschinen.map((m) => [m.id, m]));
  const typName = new Map((typen || []).map((t) => [t.id, t.name]));
  const stueckzeit = new Map();
  (zeiten || []).forEach((z) => {
    const s = Number(z.stueckzeit_s);
    if (s > 0) stueckzeit.set(hocoNormal(z.hoco_nr) + "|" + z.type_id, s);
  });

  const tage = [];
  for (let t = von; t <= bis; t = alt.plusTage(t, 1)) tage.push(t);
  const arbeitstage = arbeitstageZaehlen(von, bis);

  // Tagesmengen je Auftrag
  const eintraege = [], ausgelassen = [];
  const letzter = {};
  const vorArbeitstag = (t) => {
    let x = alt.plusTage(t, -1);
    while ([0, 6].includes(alt.ausIso(x).getDay())) x = alt.plusTage(x, -1);
    return x;
  };
  const tageZwischen = (a, b) => Math.round((alt.ausIso(b) - alt.ausIso(a)) / TAG);
  records.slice().sort((a, b) => String(a.record_date).localeCompare(String(b.record_date)))
    .forEach((z) => {
      const k = z.machine_id + "|" + (z.job_id || "");
      const vorher = letzter[k];
      const q = Number(z.quantity);
      // -1 = „Laufen lassen“ gehört nicht hierher, aber sicher ist sicher
      if (!Number.isFinite(q) || q < 0) return;
      letzter[k] = z;
      let stk = vorher ? q - Number(vorher.quantity) : q;
      // Zähler zurückgestellt: dann ist der neue Stand die Menge
      if (stk < 0) stk = q;
      if (z.record_date < von || z.record_date > bis) return;
      const m = maschineVon.get(z.machine_id);
      if (!m) return;
      const j = jobVon.get(z.job_id) || null;
      const hoco = hocoNormal(j && j.job_number);
      const s = hoco ? stueckzeit.get(hoco + "|" + m.type_id) : undefined;
      const e = { mid: m.id, datum: z.record_date, jobId: z.job_id, hoco, stk,
        sek: s || null, h: s ? stk * s / 3600 : null };
      let grund = "";
      if (!vorher) {
        const start = j && j.started_at ? alt.isoDatum(new Date(j.started_at)) : "";
        if (!start || start < vorArbeitstag(z.record_date) || start > z.record_date) grund = "start";
      }
      // Mehr Stunden, als seit dem letzten Eintrag (oder Start) Zeit war
      if (!grund && e.h !== null) {
        const ab = vorher ? vorher.record_date : alt.isoDatum(new Date(j.started_at));
        if (e.h > STUNDEN_MAX * Math.max(1, tageZwischen(ab, z.record_date))) grund = "zuviel";
      }
      if (grund) { if (stk) ausgelassen.push({ ...e, grund }); return; }
      eintraege.push(e);
    });
  // Höchstens 24 h je Maschine und Tag: ein Nachtrag über mehrere Tage
  // wird auf den Tag gekürzt, die Stück bleiben
  const jeMaschineTag = {};
  eintraege.forEach((e) => {
    if (e.h === null) return;
    (jeMaschineTag[e.mid + "|" + e.datum] = jeMaschineTag[e.mid + "|" + e.datum] || []).push(e);
  });
  Object.values(jeMaschineTag).forEach((l) => {
    const summe = l.reduce((s, e) => s + e.h, 0);
    if (summe > STUNDEN_MAX) l.forEach((e) => { e.hVoll = e.h; e.h = e.h * STUNDEN_MAX / summe; });
  });

  // Ausschuss aus der Qualitätssicherung
  const ausschussListe = [];
  (ausschuss || []).forEach((a) => {
    if (!maschineVon.has(a.machine_id)) return;
    const datum = alt.isoDatum(new Date(a.erstellt_am));
    if (datum < von || datum > bis) return;
    const j = jobVon.get(a.job_id) || null;
    ausschussListe.push({ id: a.id, mid: a.machine_id, datum, zeit: a.erstellt_am,
      hoco: hocoNormal(a.hoco_nr || (j && j.job_number)), stk: Number(a.stueck) || 0,
      notiz: a.notiz || "", wer: a.erstellt_name || "" });
  });
  ausschussListe.sort((x, y) => String(y.zeit).localeCompare(String(x.zeit)));

  // Übergänge je Maschine
  const uebergaenge = [];
  const jeMaschine = {};
  jobs.forEach((j) => { if (j.machine_id) (jeMaschine[j.machine_id] = jeMaschine[j.machine_id] || []).push(j); });
  const abZeit = alt.ausIso(von), bisZeit = alt.ausIso(alt.plusTage(bis, 1));
  Object.entries(jeMaschine).forEach(([mid, liste]) => {
    if (!maschineVon.has(mid)) return;
    const enden = liste.filter((j) => j.ended_at);
    liste.forEach((b) => {
      if (!b.started_at || !LAUFEN.has(b.plan_status)) return;
      const start = new Date(b.started_at);
      if (start < abZeit || start >= bisZeit) return;
      let a = null;
      enden.forEach((x) => {
        if (x.id === b.id) return;
        const e = new Date(x.ended_at);
        // Beide Zeitstempel kommen aus einem Schritt: der Vorgänger darf
        // ein paar Minuten nach dem Start enden
        if (e - start > 10 * MINUTE || start - e > UEBERGANG_MAX) return;
        if (!a || e > new Date(a.ended_at)) a = x;
      });
      if (!a) return;
      const ende = new Date(a.ended_at);
      const ms = start > ende ? ohneWochenende(ende, start) : 0;
      uebergaenge.push({ mid, datum: alt.isoDatum(start), ende: a.ended_at, start: b.started_at, ms,
        vorher: a.job_number || "", vorherId: a.id, neu: b.job_number || "", neuId: b.id,
        hoco: hocoNormal(b.job_number) });
    });
  });
  uebergaenge.sort((x, y) => String(y.start).localeCompare(String(x.start)));

  // Zusammenfassen
  const leer = () => ({ stk: 0, h: 0, stkOhneZeit: 0, tage: new Set(), jeTag: {}, auftraege: new Set(),
    maschinen: new Set(), artikel: new Set(), ueb: [], aus: 0, ausListe: [], stkStart: 0,
    // Tage mit gemeldeter Stückzahl; maschinenTage zählt beim Gesamten
    // jede Maschine an jedem dieser Tage einzeln
    meldeTage: new Set(), maschinenTage: new Set() });
  const dazu = (z, e) => {
    z.stk += e.stk;
    if (e.h !== null) z.h += e.h; else if (e.stk) z.stkOhneZeit += e.stk;
    if (e.stk) z.tage.add(e.datum);
    z.meldeTage.add(e.datum);
    z.maschinenTage.add(e.mid + "|" + e.datum);
    const t = (z.jeTag[e.datum] = z.jeTag[e.datum] || { stk: 0, h: 0 });
    t.stk += e.stk; if (e.h !== null) t.h += e.h;
    (t.mids = t.mids || new Set()).add(e.mid);
    if (e.jobId) z.auftraege.add(e.jobId);
    z.maschinen.add(e.mid);
    if (e.hoco) z.artikel.add(e.hoco);
  };
  const ms = {}, art = {}, alle = leer();
  maschinen.forEach((m) => { ms[m.id] = leer(); });
  eintraege.forEach((e) => {
    dazu(ms[e.mid], e); dazu(alle, e);
    if (e.hoco) dazu(art[e.hoco] = art[e.hoco] || leer(), e);
  });
  ausgelassen.forEach((e) => {
    ms[e.mid].stkStart += e.stk; alle.stkStart += e.stk;
    if (e.hoco && art[e.hoco]) art[e.hoco].stkStart += e.stk;
  });
  const ausDazu = (z, a) => {
    z.aus += a.stk; z.ausListe.push(a);
    const t = (z.jeTag[a.datum] = z.jeTag[a.datum] || { stk: 0, h: 0 });
    t.aus = (t.aus || 0) + a.stk;
  };
  ausschussListe.forEach((a) => {
    ausDazu(ms[a.mid], a); ausDazu(alle, a);
    if (a.hoco) ausDazu(art[a.hoco] = art[a.hoco] || leer(), a);
  });
  uebergaenge.forEach((u) => {
    ms[u.mid].ueb.push(u); alle.ueb.push(u);
    if (u.hoco) (art[u.hoco] = art[u.hoco] || leer()).ueb.push(u);
  });

  const mittel = (l) => l.length ? l.reduce((s, u) => s + u.ms, 0) / l.length : NaN;
  const fertig = (z, nMaschinen) => ({
    stk: z.stk, h: z.h, stkOhneZeit: z.stkOhneZeit, stkStart: z.stkStart,
    produktionsTage: z.tage.size,
    stkJeTag: z.tage.size ? z.stk / z.tage.size : NaN,
    meldeTage: z.meldeTage.size, maschinenTage: z.maschinenTage.size,
    // Ø Stunden je Maschine und Tag mit gemeldeter Stückzahl
    hJeTag: z.maschinenTage.size ? z.h / z.maschinenTage.size : NaN,
    auslastung: nMaschinen && z.maschinenTage.size ? z.h / (z.maschinenTage.size * STUNDEN_VOLL) : NaN,
    jeTag: tage.map((t) => {
      const x = z.jeTag[t] || {};
      // gemeldet = so viele Maschinen haben an dem Tag eine Stückzahl
      return { datum: t, stk: x.stk || 0, h: x.h || 0, aus: x.aus || 0, gemeldet: x.mids ? x.mids.size : 0 };
    }),
    ausschuss: z.aus, ausschussQuote: z.stk ? z.aus / z.stk : NaN, ausschussMeldungen: z.ausListe,
    auftraege: z.auftraege.size, maschinen: [...z.maschinen], artikel: [...z.artikel],
    uebergaenge: z.ueb, uebergangMittel: mittel(z.ueb),
  });

  const maschinenListe = maschinen.map((m) => ({
    id: m.id, m, name: alt.maschineZielText(m), typ: typName.get(m.type_id) || "", ...fertig(ms[m.id], 1),
  }));
  const artikelListe = Object.entries(art).map(([hoco, z]) => {
    const r = fertig(z, 0);
    // Stückzeiten dieses Artikels auf den Typen, auf denen er lief
    const sek = [...new Set(r.maschinen.map((mid) => stueckzeit.get(hoco + "|" + (maschineVon.get(mid) || {}).type_id))
      .filter(Boolean))];
    // Auslastung je Artikel: Anteil an der möglichen Zeit der Maschinen,
    // auf denen er lief, wäre irreführend; darum nur Stunden
    return { hoco, ...r, auslastung: NaN, stueckzeiten: sek };
  }).sort((a, b) => b.stk - a.stk);

  return {
    von, bis, tage, arbeitstage, ausschussFehlt: ausschuss === null,
    gesamt: fertig(alle, maschinen.length),
    maschinen: maschinenListe, artikel: artikelListe,
    maschineVon, jobVon, eintraege, ausgelassen,
  };
}

// ---------------------------------------------------------------
//  Werkzeugverbrauch aus den Bestellungen
// ---------------------------------------------------------------
export async function werkzeugLaden(von, bis, maschinen) {
  const ab = alt.ausIso(von).toISOString();
  const bisEnde = alt.ausIso(alt.plusTage(bis, 1)).toISOString();
  // Nach Anlegen holen und unten nach dem Tag der Bestellung filtern:
  // eine Position wird nicht vor ihrem Anlegen bestellt
  const pos = await alleZeilen(() => alt.db.from("order_items")
    .select("id, article_id, quantity, status, ordered_at, created_at, ziel_art, ziel_text")
    .lt("created_at", bisEnde).gte("created_at", new Date(alt.ausIso(von).getTime() - 180 * TAG).toISOString())
    .order("created_at"), "Bestellungen");
  const imZeitraum = pos.filter((p) => {
    const t = p.ordered_at || p.created_at;
    return t && t >= ab && t < bisEnde;
  });
  const artIds = [...new Set(imZeitraum.map((p) => p.article_id).filter(Boolean))];
  const artikel = new Map();
  for (let i = 0; i < artIds.length; i += 200) {
    const r = await alt.zeitlimit(alt.db.from("articles").select("id, article_number, name, unit, spezial")
      .in("id", artIds.slice(i, i + 200)), 15000, "Artikel");
    if (r.error) throw r.error;
    (r.data || []).forEach((a) => artikel.set(a.id, a));
  }
  return werkzeugRechnen(imZeitraum, artikel, maschinen, von, bis);
}

// Ziel „Maschine“ steht als Text da („Star SR-20 12“); passt er zu
// keiner Maschine, bleibt er als Text stehen
function maschineFinden(text, maschinen) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  return maschinen.find((m) => alt.maschineZielText(m).toLowerCase() === t)
    || maschinen.find((m) => m.machine_number && t.split(/\s+/).includes(String(m.machine_number).toLowerCase()))
    || null;
}

function platzIn(maschinen, id) {
  const i = maschinen.findIndex((m) => m.id === id);
  return i < 0 ? 1e6 : i;
}

export function werkzeugRechnen(positionen, artikel, maschinen, von, bis) {
  const jeArtikel = {}, jeMaschine = {}, jeMonat = {};
  let stk = 0;
  positionen.forEach((p) => {
    const a = artikel.get(p.article_id) || null;
    const menge = Number(p.quantity) || 0;
    stk += menge;
    const ak = p.article_id || "ohne";
    const za = (jeArtikel[ak] = jeArtikel[ak] || { id: ak, nr: a ? a.article_number || "" : "",
      name: a ? a.name || "" : "Ohne Artikel", einheit: a ? a.unit || "" : "", spezial: !!(a && a.spezial),
      stk: 0, pos: 0, maschinen: new Set() });
    za.stk += menge; za.pos++;
    if (p.ziel_art === "maschine") {
      const m = maschineFinden(p.ziel_text, maschinen);
      const name = m ? alt.maschineZielText(m) : String(p.ziel_text || "Maschine");
      const k = m ? m.id : "text:" + name;
      const zm = (jeMaschine[k] = jeMaschine[k] || { id: k, name, stk: 0, pos: 0, artikel: {} });
      zm.stk += menge; zm.pos++;
      zm.artikel[ak] = (zm.artikel[ak] || 0) + menge;
      za.maschinen.add(name);
    }
    const monat = String(p.ordered_at || p.created_at).slice(0, 7);
    const zt = (jeMonat[monat] = jeMonat[monat] || { stk: 0, pos: 0 });
    zt.stk += menge; zt.pos++;
  });
  // Alle Monate des Zeitraums, auch leere
  const monate = [];
  for (let t = von.slice(0, 7); t <= bis.slice(0, 7);) {
    monate.push({ monat: t, ...(jeMonat[t] || { stk: 0, pos: 0 }) });
    const [j, m] = t.split("-").map(Number);
    t = m === 12 ? (j + 1) + "-01" : j + "-" + String(m + 1).padStart(2, "0");
  }
  return {
    positionen: positionen.length, stk,
    artikel: Object.values(jeArtikel).map((a) => ({ ...a, maschinen: [...a.maschinen] }))
      .sort((a, b) => b.stk - a.stk || b.pos - a.pos),
    // wie auf der Planwand, Maschinen nur als Text zuletzt
    maschinen: Object.values(jeMaschine).sort((a, b) => platzIn(maschinen, a.id) - platzIn(maschinen, b.id)
      || b.stk - a.stk),
    monate,
  };
}
