// =================================================================
//  PAD MODE: DATEN
//  Was das Dashboard einer Maschine braucht: Tagesmengen über ein
//  halbes Jahr, die Schnitte je Woche und Monat, was danach kommt,
//  und das Wetter mit Stundenverlauf. Reine Rechnungen, kein Markup.
// =================================================================
import { alt } from "../bruecke.jsx";
import { uhrzeit } from "../daten/auftragswechsel.js";

const TAG = 86400000;

// Wetter samt Stundenverlauf — für die Säule im Pad Mode
export async function holeWetterStunden() {
  const adresse = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + alt.ORT.lat + "&longitude=" + alt.ORT.lon
    + "&current=temperature_2m,weather_code"
    + "&hourly=temperature_2m,weather_code,precipitation_probability"
    + "&daily=sunset&timezone=Europe%2FZurich&forecast_days=2";

  const antwort = await alt.zeitlimit(fetch(adresse), 6000, "Wetter");
  if (!antwort.ok) throw new Error("Wetterdienst antwortet nicht");
  const d = await antwort.json();

  const jetzt = new Date();
  const stunden = [];
  (d.hourly.time || []).forEach((zeit, i) => {
    const t = new Date(zeit);
    // Sechs Stunden ab der laufenden; die Abfrage holt zwei Tage,
    // sonst wäre es am Abend leer
    if (t.getTime() + 3600e3 <= jetzt.getTime() || stunden.length >= 6) return;
    stunden.push({
      stunde: String(t.getHours()).padStart(2, "0") + ".00",
      grad: Math.round(d.hourly.temperature_2m[i]),
      code: d.hourly.weather_code[i],
      regen: d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null,
    });
  });

  return {
    temperatur: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    text: alt.WETTER_TEXT[d.current.weather_code] || "",
    stunden,
    untergang: (d.daily && d.daily.sunset && d.daily.sunset[0] || "").slice(11, 16),
  };
}

// Zeichen zum Wettercode — grob, aber auf einen Blick verständlich
export function wetterZeichen(code) {
  if (code === 0) return "☀";
  if (code === 1 || code === 2) return "⛅";
  if (code === 3) return "☁";
  if (code >= 45 && code <= 48) return "🌫";
  if (code >= 51 && code <= 57) return "🌦";
  if (code >= 61 && code <= 67) return "🌧";
  if (code >= 71 && code <= 77) return "🌨";
  if (code >= 80 && code <= 82) return "🌦";
  if (code >= 85 && code <= 86) return "🌨";
  if (code >= 95) return "⛈";
  return "⛅";
}

// Tagesmengen einer Maschine über ein halbes Jahr. Eingetragen wird
// der Gesamtzähler, und zwar am Morgen danach (Wunsch 5. Oktober
// 2026): Was am Dienstag dasteht, ist am Montag gemacht worden. Darum
// gehört die Zunahme gegenüber dem vorherigen Stand desselben Auftrags
// zum Tag DIESES vorherigen Stands, nicht zum Tag der Eingabe. So
// landet, was am Montag für Freitag eingetragen wird, beim Freitag,
// und heute bleibt leer, bis morgen der nächste Stand kommt.
// Der erste Stand eines Auftrags zählt nur, wenn er kurz nach dessen
// Beginn liegt, und gehört dann zum Tag des Beginns — sonst wäre er
// der ganze Zähler seit Wochen und kein Tagewerk.
//
// Ein Tag ist der Kalendertag von 00:00 bis 00:00 (record_date, das
// Datum des Geräts beim Eintragen). Gespeichert wird weiter am Tag der
// Eingabe; nur die Statistik im Pad Mode rechnet so.
//
// Mit auftragId zählt nur dieser Auftrag: Die Statistik im Pad Mode
// beginnt bei jedem neuen Auftrag von vorn (Wunsch 5. Oktober 2026).
export async function tagesmengen(maschineId, auftragId) {
  const db = alt.db;
  const von = new Date(Date.now() - 200 * TAG);
  const zeilen = [];
  try {
    for (let ab = 0; ab < 5000; ab += 1000) {
      let q = db.from("production_records")
        .select("record_date, quantity, job_id, updated_at, created_at")
        .eq("machine_id", maschineId);
      if (auftragId) q = q.eq("job_id", auftragId);
      const r = await q
        .gte("record_date", alt.isoDatum(von))
        .order("record_date").range(ab, ab + 999);
      const teil = (r && r.data) || [];
      zeilen.push(...teil);
      if (teil.length < 1000) break;
    }
  } catch (f) { return {}; }

  // Beginn der beteiligten Aufträge
  const jobIds = [...new Set(zeilen.map((z) => z.job_id).filter(Boolean))];
  const beginn = {};
  if (jobIds.length) {
    try {
      const r = await db.from("jobs").select("id, started_at, planned_from").in("id", jobIds);
      ((r && r.data) || []).forEach((j) => {
        // Beginn als Kalendertag des Geräts, nicht als UTC-Datum
        beginn[j.id] = j.started_at ? alt.isoDatum(new Date(j.started_at)) : String(j.planned_from || "");
      });
    } catch (f) { /* ohne Beginn zählt der erste Stand nicht */ }
  }

  // Je Auftrag und Tag der jüngste Stand
  const jeAuftrag = {};
  zeilen.forEach((z) => {
    const k = z.job_id || "ohne";
    const zeit = z.updated_at || z.created_at || "";
    const liste = jeAuftrag[k] || (jeAuftrag[k] = {});
    const frueher = liste[z.record_date];
    if (!frueher || String(zeit) > String(frueher.zeit)) {
      liste[z.record_date] = { stand: Number(z.quantity) || 0, zeit };
    }
  });

  // Zunahmen je Tag, über alle Aufträge zusammen. stand und zeit sind
  // der Zählerstand am Tag der Eingabe (für den Verlauf), gutZeit die
  // Eingabe, deren Zunahme diesem Tag gutgeschrieben wurde.
  const jeTag = {};
  const tagVon = (d, k) => jeTag[d]
    || (jeTag[d] = { menge: null, zeit: "", stand: 0, job: k, gutZeit: "" });
  const gutschreiben = (d, k, menge, zeit) => {
    const t = tagVon(d, k);
    t.menge = (t.menge || 0) + menge;
    if (String(zeit) > String(t.gutZeit)) t.gutZeit = zeit;
  };
  Object.keys(jeAuftrag).forEach((k) => {
    let vorher = null, vorherTag = null;
    Object.keys(jeAuftrag[k]).sort().forEach((d) => {
      const e = jeAuftrag[k][d];
      if (vorher) gutschreiben(vorherTag, k, Math.max(0, e.stand - vorher.stand), e.zeit);
      else {
        const b = beginn[k];
        const nah = b && b <= d && (alt.ausIso(d) - alt.ausIso(b)) / TAG <= 3.1;
        if (nah) gutschreiben(b, k, e.stand, e.zeit);
      }
      const t = tagVon(d, k);
      if (String(e.zeit) > String(t.zeit)) { t.zeit = e.zeit; t.stand = e.stand; t.job = k; }
      vorher = e; vorherTag = d;
    });
  });
  return jeTag;
}

// Uhrzeit des Geräts (der Zeitstempel kommt in UTC), an einem anderen
// Tag als dem des Balkens mit dem Wochentag davor
function eingetragen(zeit, tag) {
  const d = new Date(zeit);
  if (isNaN(d) || alt.isoDatum(d) === tag) return uhrzeit(zeit);
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()] + " " + uhrzeit(zeit);
}

// Die letzten sieben Tage
export function letzteTage(jeTag) {
  const heute = new Date();
  const raus = [];
  for (let k = 6; k >= 0; k--) {
    // Mit setDate statt Millisekunden: An der Zeitumstellung hat ein
    // Tag 23 oder 25 Stunden, sonst rutscht ein Tag doppelt hinein
    const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() - k);
    const tag = alt.isoDatum(d);
    const e = jeTag[tag] || null;
    raus.push({ datum: tag, wochentag: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()],
                nummer: d.getDate(), heute: k === 0,
                eintrag: e ? { stand: e.stand, zeit: e.zeit, job: e.job } : null,
                menge: e ? e.menge : null,
                // Wann die Zahl dieses Balkens eingetragen wurde, meist
                // am Tag danach: dann mit Wochentag („Mo 07:10“).
                uhr: e && e.gutZeit ? eingetragen(e.gutZeit, tag) : "" });
  }
  return raus;
}

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Schnitt pro Produktionstag, je Woche oder je Monat. Gezählt werden
// nur Tage, an denen etwas erfasst wurde — ein Wochenende oder eine
// Pause drückt den Schnitt nicht.
export function schnitte(jeTag, art) {
  const heute = new Date();
  const gruppen = [];
  if (art === "woche") {
    const montag = alt.ausIso(alt.wochenStart(alt.isoDatum(heute)));
    for (let k = 7; k >= 0; k--) {
      const start = new Date(montag.getFullYear(), montag.getMonth(), montag.getDate() - k * 7);
      gruppen.push({ von: alt.isoDatum(start), bis: alt.plusTage(alt.isoDatum(start), 6),
                     titel: "KW " + alt.kalenderwoche(alt.isoDatum(start)), jetzt: k === 0 });
    }
  } else {
    for (let k = 5; k >= 0; k--) {
      const d = new Date(heute.getFullYear(), heute.getMonth() - k, 1);
      const ende = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      gruppen.push({ von: alt.isoDatum(d), bis: alt.isoDatum(ende),
                     titel: MONATE[d.getMonth()] + " " + String(d.getFullYear()).slice(2),
                     jetzt: k === 0 });
    }
  }
  gruppen.forEach((g) => {
    let summe = 0, tage = 0;
    Object.keys(jeTag).forEach((d) => {
      if (d < g.von || d > g.bis) return;
      const m = jeTag[d].menge;
      if (m === null || m === undefined || m <= 0) return;
      summe += m; tage++;
    });
    g.summe = summe; g.tage = tage;
    g.schnitt = tage ? Math.round(summe / tage) : null;
  });
  return gruppen;
}

// Schnitt der letzten sieben Tage, nur Tage mit Eintrag
export function schnittTage(tage) {
  const mitWert = tage.filter((t) => t.menge !== null && t.menge !== undefined);
  return mitWert.length
    ? Math.round(mitWert.reduce((n, t) => n + (t.menge || 0), 0) / mitWert.length) : 0;
}

// Schnitt der letzten 20 Produktionstage — Grundlage der Prognose
export function schnittLang(jeTag) {
  const werte = Object.keys(jeTag).sort().reverse()
    .map((d) => jeTag[d].menge).filter((m) => m && m > 0).slice(0, 20);
  return werte.length ? Math.round(werte.reduce((n, m) => n + m, 0) / werte.length) : 0;
}

// Was danach auf dieser Maschine eingeplant ist
export async function naechsteAuftraege(maschineId, ausserId) {
  try {
    const r = await alt.db.from("jobs")
      .select("id, job_number, planned_from, target_quantity")
      .eq("machine_id", maschineId).is("ended_at", null)
      .not("planned_from", "is", null)
      .neq("plan_status", "fertig")
      .order("planned_from").limit(6);
    return ((r && r.data) || []).filter((x) => x.id !== ausserId).slice(0, 4);
  } catch (f) { return []; }
}

// Hochrechnung: was fehlt, geteilt durch die Tagesleistung, in
// Arbeitstagen (Mo–Fr) ab morgen
export function prognose(auftrag, proTag) {
  if (!auftrag || !auftrag.target_quantity || !(proTag > 0)) return "";
  const offen = Math.max(0, auftrag.target_quantity - (auftrag.stand || 0));
  const tageNoch = Math.ceil(offen / proTag);
  const d = new Date();
  let zaehler = 0;
  while (zaehler < tageNoch) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) zaehler++;
  }
  return "fertig etwa " + alt.kurzDatum(alt.isoDatum(d));
}
