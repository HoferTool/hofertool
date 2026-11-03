// =================================================================
//  PABLO: SPRACHASSISTENT FÜR DIE PLANWAND (seit 1.362.0)
//  Wunsch Patrick 3. November 2026: „ein JARVIS … das mir Auskunft gibt,
//  was im Auftrag steht, auch Auslastung und so, es soll Pablo heissen“.
//
//  Pablo beantwortet alles selbst, direkt aus dem, was auf der Planwand
//  geladen ist (HOCO Nr., Maschine, Auslastung, freie Maschinen,
//  Probleme, Ferien). Keine KI, kein Konto, keine Kosten (Entscheid
//  Patrick 3. November 2026: „Nur selbst, ohne Claude“). Er sieht nur,
//  was die angemeldete Person auf der Planwand sieht.
// =================================================================
import { alt } from "../bruecke.jsx";
import { dokZeigen } from "../teile/DokAbruf.jsx";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];
const ZUSTAND = { geplant: "geplant", ruesten: "am Rüsten", laeuft: "läuft", fertig: "fertig" };

const heute = () => alt.isoDatum(new Date());
const zahl = (n) => (alt.zahlText ? alt.zahlText(Math.round(Number(n) || 0)) : String(Math.round(Number(n) || 0)));
export function datumText(iso, mitJahr) {
  if (!iso) return "";
  const [j, m, t] = String(iso).slice(0, 10).split("-").map(Number);
  const jetzt = new Date();
  return t + ". " + MONATE[m - 1] + (mitJahr || j !== jetzt.getFullYear() ? " " + j : "");
}
const ende = (j) => (j.planned_from ? alt.letzterArbeitstag(j.planned_from, j.planned_days || 1) : null);
// Maschinen nach Kennung, aus stamm(); die Sicht planwand bringt Nummer
// und Name meist schon mit
let MASCHINEN = new Map();
const mNr = (j) => j.maschine_nr || (MASCHINEN.get(j.machine_id) || {}).machine_number || "";
const mName = (j) => j.maschine || (MASCHINEN.get(j.machine_id) || {}).name || "";
const maschineKurz = (j) => (mNr(j) ? "der " + mNr(j) : mName(j) || "keiner Maschine");
const maschineLang = (j) => (mNr(j) ? "der " + mNr(j) + (mName(j) ? " (" + mName(j) + ")" : "") : mName(j) || "keiner Maschine");
const offen = (j) => (j.plan_status || "geplant") !== "fertig";

// ---------- Was in der Frage steht ----------

// Zahlenfolgen aus der Spracherkennung zusammenziehen: „10844 0049“,
// „10844-0049“, „108440049“ und „10844 00 49“ ergeben alle 10844-0049
function zahlenfolgen(text) {
  return (String(text).match(/\d[\d\s\-–.\/]*\d|\d/g) || [])
    .map((t) => t.replace(/\D/g, ""));
}

// Manche Geräte schreiben Zahlen als Wörter: „hundertzwanzig“ → 120
const EINER = { ein: 1, eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const ZEHNER = { zwanzig: 20, dreissig: 30, dreißig: 30, vierzig: 40, fünfzig: 50, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
const KLEIN = { zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
function unterHundert(w) {
  if (!w) return 0;
  if (KLEIN[w] !== undefined) return KLEIN[w];
  if (ZEHNER[w] !== undefined) return ZEHNER[w];
  if (EINER[w] !== undefined) return EINER[w];
  const m = w.match(/^(\w+?)und(\w+)$/);
  if (m && EINER[m[1]] !== undefined && ZEHNER[m[2]] !== undefined) return EINER[m[1]] + ZEHNER[m[2]];
  return null;
}
export function zahlwoerter(text) {
  return String(text).replace(/\b([a-zäöüß]*hundert[a-zäöüß]*)\b(\s+[a-zäöüß]+)?/gi, (ganz, wort, nach) => {
    const w = wort.toLowerCase();
    const [vor, rest] = w.split("hundert");
    const h = vor ? EINER[vor] : 1;
    let r = unterHundert(rest);
    let danach = nach || "";
    if (!rest && nach) {
      const n = unterHundert(nach.trim().toLowerCase());
      if (n !== null && n !== 0) { r = n; danach = ""; }
    }
    if (!h || r === null) return ganz;
    return String(h * 100 + (r || 0)) + danach;
  });
}

export function hocoAusText(text) {
  for (const z of zahlenfolgen(text)) {
    if (z.length === 9) return z.slice(0, 5) + "-" + z.slice(5);
  }
  return null;
}

function maschinenAusText(text, maschinen) {
  const t = String(text).toLowerCase();
  const treffer = [];
  for (const m of maschinen) {
    const n = String(m.machine_number || "").trim();
    if (!n) continue;
    // „120“ als ganze Zahl, „K-2001“ auch als „K 2001“ oder „K2001“
    const muster = n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]?");
    const re = new RegExp("(^|[^\\d\\w])" + muster + "(?![\\d\\w])");
    const fund = t.match(re);
    if (fund && !treffer.some((x) => x.n === n)) treffer.push({ n, pos: fund.index });
  }
  return treffer.sort((a, b) => a.pos - b.pos).map((x) => x.n);
}

const hat = (t, ...worte) => worte.some((w) => (w instanceof RegExp ? w.test(t) : t.includes(w)));

// ---------- Daten von der Planwand ----------

async function stamm() {
  let maschinen = alt.prod.maschinen || [], parks = alt.prod.parks || [];
  try { if (!maschinen.length) maschinen = await alt.ladeMaschinen(false, true); } catch (f) { /* was da ist */ }
  try { if (!parks.length) parks = await alt.ladeParks(false, true); } catch (f) { /* was da ist */ }
  MASCHINEN = new Map(maschinen.map((m) => [m.id, m]));
  return { maschinen: maschinen.filter((m) => m.is_active !== false), parks };
}
// Auf der Planwand gilt, was dort geladen ist; auf allen anderen Seiten
// holt Pablo die Aufträge selbst, höchstens alle zwei Minuten neu
let eigen = null, eigenZeit = 0;
async function datenSicher() {
  if (document.getElementById("pw-seite") && alt.plan.auftraege) { eigen = null; return; }
  if (eigen && Date.now() - eigenZeit < 120000) return;
  const [a, f] = await Promise.all([alt.ladePlanAuftraege(), alt.ladeFerien().catch(() => [])]);
  eigen = { auftraege: a || [], ferien: f || [] };
  eigenZeit = Date.now();
}
const auftraege = () => (eigen ? eigen.auftraege : alt.plan.auftraege || []);
const ferienListe = () => (eigen ? eigen.ferien : alt.plan.ferien || []);

// Wie lange eine Maschine belegt ist: Ende des letzten offenen Auftrags.
// Ein laufender Auftrag, dessen Plan schon vorbei ist, läuft bis heute.
function belegung(maschineId) {
  const h = heute();
  const liste = auftraege().filter((j) => j.machine_id === maschineId && offen(j) && j.planned_from);
  let bis = null, tage = 0;
  const gezaehlt = new Set();
  for (const j of liste) {
    let e = ende(j);
    if (e < h && j.plan_status !== "geplant") e = h;
    if (!bis || e > bis) bis = e;
    // Arbeitstage ab heute, die dieser Auftrag belegt (Überlappungen nur einmal)
    const von = j.planned_from > h ? j.planned_from : h;
    if (e >= von) {
      let d = alt.naechsterArbeitstag(von), n = 0;
      while (d <= e && n < 400) { gezaehlt.add(d); d = alt.naechsterArbeitstag(alt.plusTage(d, 1)); n++; }
    }
  }
  tage = gezaehlt.size;
  const freiAb = bis && bis >= h ? alt.naechsterArbeitstag(alt.plusTage(bis, 1)) : alt.naechsterArbeitstag(h);
  return { freiAb, tage, frei: !bis || bis < h };
}

function auftragSatz(j, felder) {
  const teile = [];
  const z = j.plan_status || "geplant";
  const e = ende(j);
  const alle = !felder || !felder.length;
  const will = (k) => alle || felder.includes(k);

  if (!alle && !felder.includes("wo") && !felder.includes("wann")) teile.push(j.job_number + " auf " + maschineKurz(j) + ":");
  if (will("wo")) {
    if (z === "fertig") teile.push(j.job_number + " ist fertig, lief auf " + maschineLang(j) + (e ? ", bis " + datumText(e) : "") + ".");
    else if (z === "geplant") teile.push(j.job_number + " ist geplant auf " + maschineLang(j)
      + (j.planned_from ? " ab " + datumText(j.planned_from) + " bis " + datumText(e) + ", " + (j.planned_days || 1) + " Arbeitstage" : "") + ".");
    else teile.push(j.job_number + " " + ZUSTAND[z] + " auf " + maschineLang(j)
      + (e ? ", geplant bis " + datumText(e) : "") + ".");
  } else if (will("wann") && j.planned_from) {
    teile.push(j.job_number + " auf " + maschineKurz(j) + ": " + datumText(j.planned_from) + " bis " + datumText(e) + ".");
  }
  if (will("menge")) {
    if (j.target_quantity) teile.push((j.stand ? zahl(j.stand) + " von " : "") + zahl(j.target_quantity) + " Stück.");
    else if (felder && felder.includes("menge")) teile.push("Keine Fertigungsmenge eingetragen.");
  }
  if (will("abruf") && j.abruf_info) teile.push("Abruf: " + String(j.abruf_info).replace(/\s+/g, " ").trim() + ".");
  if (will("material")) {
    if (j.material_bez) teile.push("Material " + j.material_bez + ".");
    if (j.material_menge) teile.push("Vorhanden oder bestellt: " + j.material_menge + ".");
    else if (z === "geplant") teile.push("Bei Material vorhanden oder bestellt steht noch nichts.");
    if (j.material_platz) teile.push("Materialplatz: " + j.material_platz + ".");
  }
  if (will("fa")) teile.push(j.fa_nr ? "FA Nr. " + j.fa_nr + "." : "Kein FA vorhanden.");
  if (will("notiz")) {
    const n = alt.notizTrennen ? (alt.notizTrennen(j.plan_note || "").notiz ?? j.plan_note) : j.plan_note;
    const t = String(typeof n === "string" ? n : j.plan_note || "").replace(/\(aus infoBoard\)/gi, "").replace(/\s+/g, " ").trim();
    if (t) teile.push("Notiz: " + t + (/[.!?]$/.test(t) ? "" : "."));
    else if (felder && felder.includes("notiz")) teile.push("Keine Notiz.");
  }
  if (will("problem")) {
    if (j.problem) teile.push("Gemeldetes Problem: " + j.problem + (j.problem_von ? " (" + j.problem_von + ")" : "") + ".");
    else if (felder && felder.includes("problem")) teile.push("Kein Problem gemeldet.");
  }
  if (will("siegel") && j.geplant_von && felder) teile.push("Eingeplant von " + j.geplant_von + ".");
  return teile.join(" ");
}

// Welche Felder die Frage meint; leer = alles Wichtige
function felderAusFrage(t) {
  const f = [];
  if (hat(t, "notiz", "bemerkung", "hinweis")) f.push("notiz");
  if (hat(t, "material", "stange", "werkstoff", "materialplatz", " kg")) f.push("material");
  if (hat(t, "stück", "stueck", "menge", "wie viel", "wieviel", " stand", "produziert", "liefermenge", "fertigungsmenge")) f.push("menge");
  if (hat(t, "wann", "fertig", "ende", "start", "beginn", "bis wann", "datum", "termin")) f.push("wann");
  if (hat(t, "wo ", "wo?", "welche maschine", "welcher maschine", "auf welcher", "läuft", "laeuft", "schon", "status", "zustand", "gerüstet", "rüsten")) f.push("wo");
  if (hat(t, " fa ", " fa?", " fa-", " fa nr", "fertigungsauftrag")) f.push("fa");
  if (hat(t, "abruf")) f.push("abruf");
  if (hat(t, "problem")) f.push("problem");
  if (hat(t, "eingeplant", "siegel", "wer hat")) f.push("siegel");
  return f;
}

// Befehle: Zeichnung, WBG, Einrichtblatt, Auftragsfenster öffnen oder
// den Balken auf der Planwand zeigen
function befehlAusFrage(t, felder) {
  const oeffnen = hat(t, "öffne", "oeffne", "öffnen", "zeig", "mach ", "auf ", "aufmachen", "anzeigen", "aufrufen", "hol ");
  if (!oeffnen) return null;
  if (hat(t, "zeichnung")) return "zeichnung";
  if (hat(t, "wbg", "warenbegleit", "waschgebinde", "begleitblatt")) return "wbg";
  if (hat(t, "einrichtblatt", " eb ", "einrichteblatt", "einricht")) return "einrichtblatt";
  if (hat(t, "auftragsfenster", "fenster", "auftrag öffnen", "öffne auftrag", "öffne den auftrag", "öffne der auftrag", "auftrag auf")) return "fenster";
  // „Zeig mir den Abruf …“ ist eine Frage, kein Befehl
  if (!(felder && felder.length) && hat(t, "zeig", "anzeigen", "planwand")) return "zeigen";
  return null;
}

function befehlAusfuehren(befehl, j, maschinen) {
  const nr = j.job_number;
  const titel = (befehl === "zeichnung" ? "Zeichnung " : befehl === "wbg" ? "WBG " : "Einrichtblatt ") + nr;
  if (befehl === "zeichnung") return { text: "Ich öffne die Zeichnung von " + nr + ".", auftragId: j.id, aktion: async () => {
    let adresse = j.drawing_url;
    if (!adresse && alt.zeichnungAnheften) { try { adresse = await alt.zeichnungAnheften(j); } catch (f) { /* ohne */ } }
    dokZeigen({ art: "zeichnung", titel, adresse: adresse || null, hoco: nr });
  } };
  if (befehl === "wbg") return { text: j.wbg_url ? "Ich öffne die WBG von " + nr + "." : "Zu " + nr + " ist keine WBG vorhanden.", auftragId: j.id,
    aktion: j.wbg_url ? () => dokZeigen({ art: "wbg", titel, adresse: j.wbg_url, hoco: nr, auftragId: j.id }) : null };
  if (befehl === "einrichtblatt") {
    const m = maschinen.find((x) => x.id === j.machine_id);
    return { text: "Ich öffne das Einrichtblatt von " + nr + " für " + maschineKurz(j) + ".", auftragId: j.id,
      aktion: () => alt.einrichtblattPdfOeffnen(nr, m && m.type_id, nr) };
  }
  if (befehl === "fenster") return { text: "Ich öffne den Auftrag " + nr + ".", auftragId: j.id, aktion: () => alt.balkenZeigen(j.id, false) };
  return { text: nr + " " + ZUSTAND[j.plan_status || "geplant"] + " auf " + maschineKurz(j) + ". Ich zeige ihn auf der Planwand.", auftragId: j.id,
    aktion: () => alt.balkenZeigen(j.id, true) };
}

// „Gehe zu …“: Seiten der App (nur die, die die Person sehen darf)
const SEITEN_WORTE = [
  [/startseite|\bstart\b|dashboard|übersicht/, "dashboard", "Start"],
  [/planwand|plantafel/, "planwand", "Planwand"],
  [/statistik/, "statistik", "Statistik"],
  [/produktion|erfassen|stückzahlen/, "produktion", "Produktion"],
  [/maschinen\b|maschinenseite/, "maschinen", "Maschinen"],
  [/kalkulation/, "kalkulation", "Kalkulation"],
  [/bestellung|bestellen/, "bestellungen", "Bestellungen"],
  [/einkauf/, "einkauf", "Einkaufsliste"],
  [/material(seite|übersicht)?\b|restmaterial/, "material", "Material"],
  [/rechner/, "rechner", "Rechner"],
  [/einlagen/, "einlagen", "Einlagen Gen"],
  [/infoboard/, "infoboard", "Infoboard"],
  [/empfang/, "empfang", "Empfang"],
  [/pausenraum/, "pausenraum", "Pausenraum"],
  [/anzeigen|bildschirme/, "bildschirme", "Anzeigen"],
  [/pad ?mode|\bpad\b|padmodus/, "pad", "Pad Mode"],
  [/einstellungen/, "einstellungen", "Einstellungen"],
];
function seiteAusFrage(t) {
  if (!hat(t, "geh", "wechsel", "navigier", "bring mich", "springe", "spring ", "öffne", "oeffne", "zeig mir die seite", "mach die seite", "zur seite", "zum ", "zur ")) return null;
  if (hocoAusText(t) || hat(t, "zeichnung", "wbg", "einrichtblatt", "auftragsfenster")) return null;
  for (const [re, pfad, name] of SEITEN_WORTE) {
    if (!re.test(t)) continue;
    if (pfad === "pad") return { text: "Ich öffne den Pad Mode.", aktion: () => alt.padOeffnen() };
    if (pfad === "einstellungen") return { text: "Ich öffne die Einstellungen.", aktion: () => alt.einstellungenOeffnen() };
    const pruef = pfad === "statistik" ? "produktion" : pfad === "einkauf" ? "dashboard" : pfad;
    if (alt.seiteSichtbar && !alt.seiteSichtbar(pruef)) return { text: name + " darfst du nicht öffnen." };
    return { text: "Ich gehe zu " + name + ".", aktion: () => { location.hash = "#/" + pfad; } };
  }
  return null;
}

// ---------- Stufe 1: selbst beantworten ----------

const HILFE = "Frag mich zum Beispiel: Was steht im Auftrag 10844-0049? Ist das Material da? Was läuft auf der 120? "
  + "Öffne die Zeichnung von 10844-0049. Öffne das Auftragsfenster. Gehe zu Bestellungen. Wann ist die 125 frei? Wie ist die Auslastung? Welche Maschine ist als Nächstes frei? Gibt es Probleme? Wer ist in den Ferien?";

let zuletzt = { hoco: null, maschine: null };

// { text, auftragId?, sicher } oder null, wenn Pablo es so nicht weiss
export async function selbstAntworten(frage) {
  const t = " " + zahlwoerter(String(frage || "").toLowerCase()).replace(/pablo( escobar)?/g, "").replace(/\s+/g, " ").trim() + " ";
  await datenSicher();
  const { maschinen, parks } = await stamm();

  if (hat(t, "was kannst du", "hilfe", "wie funktionierst")) return { text: HILFE };
  const seite = seiteAusFrage(t);
  if (seite) return seite;

  // HOCO Nr.
  let hoco = hocoAusText(t);
  const felder = felderAusFrage(t);
  const ms = maschinenAusText(t.replace(/\d{5}[\s\-–]*\d{4}/g, " "), maschinen);
  const befehl = befehlAusFrage(t, felder);
  if (!hoco && !ms.length && zuletzt.hoco && (befehl
    || (felder.length && hat(t, " der ", " den ", " dem ", " er ", " es ", " ihm ", " dort", "dieser", "diesem", " und ", " das ")))) hoco = zuletzt.hoco;
  if (hoco) {
    zuletzt = { hoco, maschine: null };
    const liste = auftraege().filter((j) => j.job_number === hoco);
    if (!liste.length) return { text: "Zur HOCO Nr. " + hoco + " finde ich auf der Planwand keinen Auftrag." };
    const rang = (j) => ({ laeuft: 0, ruesten: 1, geplant: 2, fertig: 3 }[j.plan_status || "geplant"]);
    liste.sort((a, b) => rang(a) - rang(b) || (rang(a) === 3
      ? String(b.planned_from || "").localeCompare(String(a.planned_from || ""))
      : String(a.planned_from || "").localeCompare(String(b.planned_from || ""))));
    const j = liste[0];
    if (befehl) return befehlAusfuehren(befehl, j, maschinen);
    let text = auftragSatz(j, felder);
    const weitere = liste.slice(1).filter(offen);
    if (weitere.length) text += " Dazu " + (weitere.length === 1 ? "ein weiterer offener Auftrag" : weitere.length + " weitere offene Aufträge")
      + ": " + weitere.slice(0, 3).map((w) => ZUSTAND[w.plan_status || "geplant"] + " auf " + maschineKurz(w)
        + (w.planned_from ? " ab " + datumText(w.planned_from) : "")).join(", ") + ".";
    return { text, auftragId: j.id, sicher: true };
  }

  // Maschine
  if (ms.length) {
    const nr = ms[0];
    zuletzt = { hoco: null, maschine: nr };
    const m = maschinen.find((x) => String(x.machine_number) === nr);
    const name = "Die " + nr + (m && m.name ? " (" + m.name + ")" : "");
    const liste = auftraege().filter((j) => j.machine_id === m.id && offen(j))
      .sort((a, b) => String(a.planned_from || "").localeCompare(String(b.planned_from || "")));
    const b = belegung(m.id);
    if (hat(t, "frei", "auslast", "voll", "belegt", "wie lange")) {
      return { text: name + (b.frei ? " ist frei." : " ist belegt bis " + datumText(alt.plusTage(b.freiAb, -1)) + ", frei ab " + datumText(b.freiAb)
        + ". Das sind " + b.tage + " Arbeitstage ab heute.") + (liste.length ? " " + liste.length + " offene Aufträge." : ""), sicher: true };
    }
    const dran = liste.filter((j) => j.plan_status === "laeuft" || j.plan_status === "ruesten");
    const geplant = liste.filter((j) => (j.plan_status || "geplant") === "geplant");
    const teile = [];
    if (dran.length) teile.push(name + ": " + dran.map((j) => j.job_number + " " + ZUSTAND[j.plan_status]
      + (j.target_quantity ? ", " + (j.stand ? zahl(j.stand) + " von " : "") + zahl(j.target_quantity) + " Stück" : "")
      + (ende(j) ? ", geplant bis " + datumText(ende(j)) : "")).join("; ") + ".");
    else teile.push(name + ": im Moment läuft nichts.");
    if (geplant.length) teile.push("Als Nächstes " + geplant.slice(0, 3).map((j) => j.job_number
      + (j.planned_from ? " ab " + datumText(j.planned_from) : "")).join(", ") + (geplant.length > 3 ? ", und " + (geplant.length - 3) + " weitere" : "") + ".");
    teile.push(b.frei ? "Danach ist sie frei." : "Frei ab " + datumText(b.freiAb) + ".");
    const einer = dran[0] || geplant[0];
    if (befehl && einer) { zuletzt = { hoco: einer.job_number, maschine: nr }; return befehlAusfuehren(befehl, einer, maschinen); }
    return { text: teile.join(" "), auftragId: einer && einer.id, sicher: true };
  }

  // Freie Maschinen
  if (hat(t, "frei") && hat(t, "maschine", "welche", "wo ")) {
    const reihe = maschinen.map((m) => ({ m, b: belegung(m.id) }))
      .sort((a, b) => a.b.freiAb.localeCompare(b.b.freiAb) || a.b.tage - b.b.tage);
    const freie = reihe.filter((x) => x.b.frei);
    if (freie.length) return { text: "Frei sind jetzt: " + freie.slice(0, 6).map((x) => "die " + (x.m.machine_number || x.m.name)).join(", ")
      + (freie.length > 6 ? " und " + (freie.length - 6) + " weitere" : "") + ".", sicher: true };
    return { text: "Als Nächstes frei: " + reihe.slice(0, 4).map((x) => "die " + (x.m.machine_number || x.m.name) + " ab " + datumText(x.b.freiAb)).join(", ") + ".", sicher: true };
  }

  // Auslastung
  if (hat(t, "auslast", "ausgelastet", "wie voll", "wie viel arbeit", "wieviel arbeit")) {
    const FENSTER = 20;   // vier Wochen
    const jePark = new Map();
    for (const m of maschinen) {
      const b = belegung(m.id);
      const p = jePark.get(m.park_id) || { n: 0, tage: 0 };
      p.n++; p.tage += Math.min(FENSTER, b.tage);
      jePark.set(m.park_id, p);
    }
    const saetze = [];
    for (const p of parks) {
      const x = jePark.get(p.id);
      if (!x || !x.n) continue;
      saetze.push(p.name + " " + Math.round(x.tage / (x.n * FENSTER) * 100) + " Prozent");
    }
    const leer = maschinen.filter((m) => belegung(m.id).frei).map((m) => m.machine_number || m.name);
    return { text: "Auslastung der nächsten vier Wochen: " + saetze.join(", ") + "."
      + (leer.length ? " Ohne Auftrag: " + leer.slice(0, 6).join(", ") + (leer.length > 6 ? " und " + (leer.length - 6) + " weitere" : "") + "." : ""), sicher: true };
  }

  // Probleme
  if (hat(t, "problem")) {
    const p = auftraege().filter((j) => j.problem && offen(j));
    if (!p.length) return { text: "Es sind keine Probleme gemeldet.", sicher: true };
    return { text: p.length + (p.length === 1 ? " Problem gemeldet: " : " Probleme gemeldet: ")
      + p.slice(0, 5).map((j) => j.job_number + " auf " + maschineKurz(j) + ", " + j.problem).join("; ") + ".",
      auftragId: p.length === 1 ? p[0].id : null, sicher: true };
  }

  // Was läuft
  if (hat(t, "was läuft", "was laeuft", "welche laufen", "was ist am laufen", "wie viele laufen", "was wird gerüstet", "rüsten")) {
    const l = auftraege().filter((j) => j.plan_status === "laeuft");
    const r = auftraege().filter((j) => j.plan_status === "ruesten");
    return { text: l.length + " Aufträge laufen" + (r.length ? ", " + r.length + " sind am Rüsten" : "") + "."
      + (r.length ? " Am Rüsten: " + r.slice(0, 5).map((j) => j.job_number + " auf " + maschineKurz(j)).join(", ") + "." : ""), sicher: true };
  }

  // Ferien
  if (hat(t, "ferien", "urlaub", "abwesend")) {
    const h = heute(), bis = alt.plusTage(h, 14);
    const f = ferienListe().map((v) => ({ v, e: alt.letzterArbeitstag(v.von, v.tage || 1) }))
      .filter((x) => x.e >= h && x.v.von <= bis).sort((a, b) => a.v.von.localeCompare(b.v.von));
    if (!f.length) return { text: "In den nächsten zwei Wochen ist niemand in den Ferien eingetragen.", sicher: true };
    return { text: "Ferien in den nächsten zwei Wochen: " + f.slice(0, 8).map((x) => x.v.person
      + (x.v.von <= h ? " bis " + datumText(x.e) : " ab " + datumText(x.v.von) + " bis " + datumText(x.e))).join(", ") + ".", sicher: true };
  }

  // Material fehlt: geplante Aufträge mit rotem M in den nächsten drei Wochen
  if (hat(t, "material") && hat(t, "kein", "fehlt", "fehlen", "ohne", "bestellen", "rotes m", "rote m")) {
    const h = heute(), bis = alt.plusTage(h, 21);
    const l = auftraege().filter((j) => (j.plan_status || "geplant") === "geplant" && !j.material_menge && j.planned_from && j.planned_from <= bis)
      .sort((a, b) => a.planned_from.localeCompare(b.planned_from));
    if (!l.length) return { text: "Bei allen geplanten Aufträgen der nächsten drei Wochen steht Material vorhanden oder bestellt.", sicher: true };
    return { text: l.length + " geplante Aufträge in den nächsten drei Wochen ohne Material vorhanden oder bestellt: "
      + l.slice(0, 6).map((j) => j.job_number + " auf " + maschineKurz(j) + " ab " + datumText(j.planned_from)).join(", ")
      + (l.length > 6 ? ", und " + (l.length - 6) + " weitere" : "") + ".", auftragId: l.length === 1 ? l[0].id : null, sicher: true };
  }

  // Was startet heute, morgen, diese oder nächste Woche
  if (hat(t, "startet", "starten", "beginnt", "geplant", "kommt", "fängt", "anfangen")
      && hat(t, "heute", "morgen", "diese woche", "nächste woche", "naechste woche", "kommende woche")) {
    const h = heute();
    let von = h, bis = h, wann = "heute";
    if (hat(t, "morgen")) { von = bis = alt.naechsterArbeitstag(alt.plusTage(h, 1)); wann = "am " + datumText(von); }
    else if (hat(t, "diese woche")) { bis = alt.plusTage(alt.wochenStart(h), 4); wann = "diese Woche"; }
    else if (hat(t, "nächste woche", "naechste woche", "kommende woche")) { von = alt.plusTage(alt.wochenStart(h), 7); bis = alt.plusTage(von, 4); wann = "nächste Woche"; }
    const l = auftraege().filter((j) => (j.plan_status || "geplant") === "geplant" && j.planned_from && j.planned_from >= von && j.planned_from <= bis)
      .sort((a, b) => a.planned_from.localeCompare(b.planned_from));
    if (!l.length) return { text: "Für " + wann + " ist kein neuer Auftrag geplant.", sicher: true };
    return { text: wann.charAt(0).toUpperCase() + wann.slice(1) + " starten " + l.length + " Aufträge: "
      + l.slice(0, 8).map((j) => j.job_number + " auf " + maschineKurz(j) + (von !== bis ? " am " + datumText(j.planned_from) : "")).join(", ")
      + (l.length > 8 ? ", und " + (l.length - 8) + " weitere" : "") + ".", auftragId: l.length === 1 ? l[0].id : null, sicher: true };
  }

  // Wie viele Aufträge
  if (hat(t, "wie viele auftr", "wieviele auftr", "anzahl auftr", "wie viel auftr")) {
    const o = auftraege().filter(offen);
    const g = o.filter((j) => (j.plan_status || "geplant") === "geplant").length;
    const l = o.filter((j) => j.plan_status === "laeuft").length;
    const r = o.filter((j) => j.plan_status === "ruesten").length;
    return { text: o.length + " offene Aufträge: " + l + " laufen, " + r + " am Rüsten, " + g + " geplant.", sicher: true };
  }

  // Fünfstellige Kundennummer: offene Aufträge dieses Kunden
  const kunde = (t.match(/\b\d{5}\b/) || [])[0];
  if (kunde) {
    const l = auftraege().filter((j) => offen(j) && String(j.job_number || "").startsWith(kunde + "-"))
      .sort((a, b) => String(a.planned_from || "").localeCompare(String(b.planned_from || "")));
    if (!l.length) return { text: "Zur Nummer " + kunde + " gibt es keinen offenen Auftrag.", sicher: true };
    return { text: l.length + (l.length === 1 ? " offener Auftrag" : " offene Aufträge") + " mit " + kunde + ": "
      + l.slice(0, 6).map((j) => j.job_number + " " + ZUSTAND[j.plan_status || "geplant"] + " auf " + maschineKurz(j)
        + (j.planned_from && (j.plan_status || "geplant") === "geplant" ? " ab " + datumText(j.planned_from) : "")).join(", ")
      + (l.length > 6 ? ", und " + (l.length - 6) + " weitere" : "") + ".", auftragId: l.length === 1 ? l[0].id : null, sicher: true };
  }

  return null;
}

// Gespräch: die letzte HOCO Nr. oder Maschine gilt für Nachfragen
// („und wann ist der fertig?“), siehe zuletzt in selbstAntworten
export async function antworten(frage) {
  let eigene = null;
  try { eigene = await selbstAntworten(frage); } catch (f) { console.warn("Pablo:", f); }
  if (eigene) return eigene;
  return { text: "Das habe ich nicht verstanden. " + HILFE, unklar: true };
}

// Für die Sprachausgabe: Tausender-Apostroph weg, HOCO Nr. in zwei Teilen
export function zumSprechen(text) {
  return String(text)
    .replace(/(\d)'(\d)/g, "$1$2")
    .replace(/\b(\d{5})-(\d{4})\b/g, "$1 $2")
    .replace(/\bStk\b/g, "Stück")
    .replace(/\bNr\./g, "Nummer")
    .replace(/[*_#`]/g, "");
}
