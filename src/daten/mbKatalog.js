// =================================================================
//  Managementbewertung wie ein Audit (seit 1.483.0, Wunsch Patrick
//  11. November 2026: „möglichst einfaches Tool, um die Managementbewertungen
//  zu erstellen … ähnlich einem durchzuführenden Audit … die manuell
//  einzutragenden Zahlen, wie Wirtschaft, Finanzen etc. nach einem
//  Fragekatalog abfragen“, „auch bestehende Auswertungen wie die
//  Produktionsstatistiken aus dem HoferTool integrieren“).
//
//  Die Kapitel folgen ISO 9001 Kapitel 9.3 (Eingaben 9.3.2 a–f, Ergebnisse
//  9.3.3) und der Gliederung der bisherigen Bewertung von Hofer + Co. Je
//  Kapitel: was das HoferTool schon weiss (autoZeilen), die Fragen aus dem
//  Katalog (nur in der Datenbank, qma_texte „bewertung:fragen“), Bewertung
//  Gut / Handlungsbedarf / Kritisch, „Massnahmen nötig?“ und eine Bemerkung.
//  Hier steht nur der Aufbau, keine Firmenzahlen.
// =================================================================
import { lbPunkte, lbAmpel } from "./lieferantenListe.js";
import { istZu, risikoErst, risikoWert, hatNeu, lieferantNote, heute, statusVon, auditQuartal } from "./qmAlt.js";

export const MB_KAPITEL = [
  { id: "vorperiode", titel: "Status aus der vorangegangenen Bewertung", norm: "9.3.2 a" },
  { id: "geschaeft", titel: "Allgemeiner Geschäftsverlauf", norm: "9.3.2 b" },
  { id: "veraenderungen", titel: "Veränderungen interner und externer Themen", norm: "9.3.2 b" },
  { id: "rueckmeldungen", titel: "Rückmeldungen von Kunden und interessierten Parteien", norm: "9.3.2 c1" },
  { id: "ziele", titel: "Erfüllung der Qualitätsziele", norm: "9.3.2 c2" },
  { id: "prozesse", titel: "Prozessleistung und Konformität der Produkte", norm: "9.3.2 c3" },
  { id: "abweichungen", titel: "Nichtkonformitäten und Korrekturmassnahmen", norm: "9.3.2 c4" },
  { id: "messung", titel: "Ergebnisse von Überwachung und Messung", norm: "9.3.2 c5" },
  { id: "audits", titel: "Ergebnisse aus Audits", norm: "9.3.2 c6" },
  { id: "lieferanten", titel: "Leistung externer Anbieter", norm: "9.3.2 c7" },
  { id: "ressourcen", titel: "Angemessenheit der Ressourcen", norm: "9.3.2 d" },
  { id: "risiken", titel: "Wirksamkeit der Massnahmen zu Risiken und Chancen", norm: "9.3.2 e" },
  { id: "verbesserung", titel: "Möglichkeiten zur Verbesserung", norm: "9.3.2 f" },
  { id: "wirksamkeit", titel: "Fazit: Eignung, Angemessenheit und Wirksamkeit des QM-Systems", norm: "9.3.1" },
];
export const MB_BEWERTUNG = [["gut", "Gut", "gruen"], ["handlung", "Handlungsbedarf", "gelb"], ["kritisch", "Kritisch", "rot"]];
export const mbBewertung = (b) => MB_BEWERTUNG.find((x) => x[0] === b) || null;
export const MB_ARTEN = [["zahl", "Zahl"], ["chf", "CHF"], ["prozent", "%"], ["text", "Text"]];

// ---------- Fragekatalog als Text ----------
// „## Kapitel“ beginnt ein Kapitel (Titel oder Kennung), darunter eine Frage
// je Zeile: Frage | Art (zahl, chf, prozent, text) | Einheit | Hilfe
const kapitelVon = (s) => {
  const t = String(s || "").trim().toLowerCase();
  return MB_KAPITEL.find((k) => k.id === t || k.titel.toLowerCase() === t || k.titel.toLowerCase().startsWith(t)) || null;
};
export function mbFragenZuText(fragen) {
  return MB_KAPITEL.map((k) => {
    const l = (fragen || []).filter((f) => f.kapitel === k.id);
    return "## " + k.titel + (l.length ? "\n" + l.map((f) => [f.text, f.art || "text", f.einheit || "", f.hilfe || ""].join(" | ").replace(/( \| )+$/, "")).join("\n") : "");
  }).join("\n\n");
}
export function mbFragenAusText(text, vorher) {
  const alte = vorher || [];
  const neu = [];
  let k = null;
  for (const roh of String(text || "").split("\n")) {
    const z = roh.trim();
    if (!z) continue;
    if (z.startsWith("#")) { const x = kapitelVon(z.replace(/^#+/, "")); if (x) k = x.id; continue; }
    if (!k) continue;
    const [t, art, einheit, hilfe] = z.split("|").map((s) => s.trim());
    if (!t) continue;
    const a = MB_ARTEN.some((x) => x[0] === (art || "").toLowerCase()) ? art.toLowerCase() : "text";
    // gleiche Frage im selben Kapitel behält ihre Kennung, damit Antworten und Vorjahr bleiben
    const gleich = alte.find((f) => f.kapitel === k && f.text === t && !neu.some((n) => n.id === f.id));
    neu.push({ id: gleich ? gleich.id : "f" + Math.random().toString(36).slice(2, 9), kapitel: k, text: t, art: a,
      einheit: einheit || "", hilfe: hilfe || "" });
  }
  return neu;
}
export const mbFragenVon = (texte) => (texte && texte["bewertung:fragen"] && texte["bewertung:fragen"].felder && texte["bewertung:fragen"].felder.fragen) || [];

// ---------- Zahlen ----------
export function zahlLesen(w) {
  if (w === null || w === undefined || w === "") return NaN;
  const s = String(w).replace(/['’\s]/g, "").replace(/(chf|%|mio\.?)/gi, "").replace(",", ".");
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const zt = (n, st = 0) => (Number.isFinite(n) ? (st ? n.toFixed(st).replace(/\B(?=(\d{3})+(?!\d))/g, "'") : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'")) : "–");
export function wertText(f, w) {
  if (w === undefined || w === null || String(w).trim() === "") return "";
  if (f.art === "text") return String(w);
  const n = zahlLesen(w);
  if (!Number.isFinite(n)) return String(w);
  const s = zt(n, Math.abs(n) < 100 && n % 1 ? 1 : 0);
  return f.art === "chf" ? "CHF " + s : f.art === "prozent" ? s + " %" : s + (f.einheit ? " " + f.einheit : "");
}
// Vergleich zum Vorjahr: bei Prozent in Prozentpunkten, sonst in Prozent
export function vergleich(f, w, vorher) {
  const a = zahlLesen(w), b = zahlLesen(vorher);
  if (f.art === "text" || !Number.isFinite(a) || !Number.isFinite(b)) return "";
  if (f.art === "prozent") { const d = a - b; return (d > 0 ? "+" : "") + zt(d, d % 1 ? 1 : 0) + " Prozentpunkte"; }
  if (!b) return "";
  const p = (a - b) / Math.abs(b) * 100;
  return (p > 0 ? "+" : "") + zt(p, Math.abs(p) < 10 && p % 1 ? 1 : 0) + " %";
}

// Bewertung des Vorjahres: Antwort derselben Frage (Kennung, sonst gleicher Text)
export function vorjahrWert(f, vorBew) {
  const mb = vorBew && vorBew.daten && vorBew.daten.mb;
  if (!mb) return "";
  const a = mb.antworten || {};
  if (a[f.id] && a[f.id].wert !== undefined && String(a[f.id].wert).trim() !== "") return a[f.id].wert;
  const g = (mb.fragen || []).find((x) => x.kapitel === f.kapitel && x.text === f.text);
  return g && a[g.id] ? a[g.id].wert || "" : "";
}

// ---------- Was das HoferTool schon weiss ----------
const imJahr = (iso, j) => !!iso && String(iso).slice(0, 4) === String(j);
const datumVon = (e) => (e.daten && (e.daten.datum || e.daten.aufnahme)) || e.erstellt_am;
const QUELLE = { kunde: "Kunden", intern: "intern", lieferant: "Lieferanten", audit: "Audits", idee: "Ideen", risiko: "Risiken", bewertung: "Bewertung" };
const pr = (x) => (Number.isFinite(x) ? Math.round(x * 100) + " %" : "–");
const zahl = (n) => zt(n);

// Zeilen [Bezeichnung, Wert, Hinweis] je Kapitel; prod = Produktionsstatistik des Jahres (oder null)
export function autoZeilen(kid, { eintraege, jahr, bew, prod, prodFehler }) {
  const von = (art) => eintraege.filter((e) => e.art === art);
  const z = [];
  const abw = von("abweichung").filter((e) => imJahr(datumVon(e), jahr));
  const zaehle = (l) => {
    const zu = l.filter(istZu).length;
    return { n: l.length, zu, offen: l.length - zu };
  };
  if (kid === "vorperiode") {
    const frueher = von("abweichung").filter((e) => e.daten.quelle === "bewertung" && e.daten.herkunft !== (bew && bew.id));
    const s = zaehle(frueher);
    z.push(["Massnahmen aus früheren Bewertungen", s.n ? s.zu + " von " + s.n + " abgeschlossen" : "keine", s.offen ? s.offen + " noch offen" : ""]);
    for (const e of frueher.filter((x) => !istZu(x))) z.push(["• " + (e.titel || ""), statusVon("abweichung", e.status).text, e.daten.wer || ""]);
    const ziele = von("ziel").filter((e) => String(e.daten.jahr) === String(jahr));
    z.push(["Ziele " + jahr, ziele.length ? ziele.filter((e) => e.status === "erreicht").length + " von " + ziele.length + " erreicht" : "keine erfasst", ""]);
  } else if (kid === "veraenderungen") {
    const r = von("risiko");
    const neu = r.filter((e) => imJahr(e.daten.aufnahme || e.erstellt_am, jahr));
    z.push(["Themen im Kontext (Risiken und Chancen)", zahl(r.length), neu.length + " neu aufgenommen " + jahr]);
    for (const e of neu.slice(0, 8)) z.push(["• " + (e.titel || ""), e.daten.partei || "", ""]);
  } else if (kid === "rueckmeldungen") {
    const k = abw.filter((e) => e.daten.quelle === "kunde");
    const s = zaehle(k);
    z.push(["Kundenreklamationen " + jahr, zahl(s.n), s.n ? s.zu + " abgeschlossen, " + s.offen + " offen" : ""]);
  } else if (kid === "ziele") {
    const ziele = von("ziel").filter((e) => String(e.daten.jahr) === String(jahr));
    if (!ziele.length) z.push(["Ziele " + jahr, "keine erfasst", "Unter Qualitätsziele erfassen oder unten neue Ziele beschliessen"]);
    for (const e of ziele) z.push([e.titel || "", statusVon("ziel", e.status).text,
      [e.daten.zielwert ? "Ziel " + e.daten.zielwert : "", e.daten.ist ? "Ist " + e.daten.ist : ""].filter(Boolean).join(" · ")]);
  } else if (kid === "prozesse") {
    if (prodFehler) z.push(["Produktionsstatistik", "nicht geladen", prodFehler]);
    else if (!prod) z.push(["Produktionsstatistik", "wird geladen …", ""]);
    else if (prod.leer) z.push(["Produktionsstatistik", "keine Daten", "Die Statistik zählt erst ab " + prod.ab.split("-").reverse().join(".")]);
    else {
      const g = prod.gesamt;
      const hinweis = "Statistik " + prod.von.split("-").reverse().join(".") + " bis " + prod.bis.split("-").reverse().join(".");
      z.push(["Ausstoss", zahl(g.stk) + " Stück", hinweis]);
      z.push(["Produktionszeit", zahl(g.h) + " h", g.stkOhneZeit ? zahl(g.stkOhneZeit) + " Stück ohne Stückzeit nicht gerechnet" : ""]);
      z.push(["Auslastung", pr(g.auslastung), "10 h je Arbeitstag = 100 %, nur Tage mit gemeldeter Stückzahl"]);
      z.push(["Aufträge mit Stückzahl", zahl(g.auftraege), zahl(prod.maschinen) + " Maschinen"]);
      if (Number.isFinite(g.uebergangMittel)) z.push(["Ø Auftragswechsel", zt(g.uebergangMittel / 3600000, 1) + " h", "Ende alter bis Start neuer Auftrag, ohne Wochenende"]);
    }
  } else if (kid === "abweichungen") {
    for (const q of ["kunde", "intern", "lieferant", "audit"]) {
      const s = zaehle(abw.filter((e) => (e.daten.quelle || "intern") === q));
      z.push([({ kunde: "Beanstandungen aus Kundensicht", intern: "Intern entdeckte Abweichungen", lieferant: "Beanstandungen gegenüber Lieferanten", audit: "Auditfeststellungen" })[q],
        zahl(s.n), s.n ? s.zu + " erledigt, " + s.offen + " offen" : ""]);
    }
    const kosten = abw.reduce((s, e) => s + (Number(e.daten.kosten) || 0), 0);
    if (kosten) z.push(["Fehlerkosten (geschätzt)", "CHF " + zahl(kosten), ""]);
    const ueber = von("abweichung").filter((e) => !istZu(e) && e.faellig && e.faellig < heute()).length;
    if (ueber) z.push(["Überfällig (alle Jahre)", zahl(ueber), ""]);
  } else if (kid === "messung") {
    const pm = von("pruefmittel").filter((e) => e.status === "aktiv" || !e.status);
    z.push(["Prüfmittel", zahl(pm.length), pm.filter((e) => e.faellig && e.faellig < heute()).length + " überfällig"]);
    if (prod && !prod.leer) z.push(["Ausschuss (QS-Meldungen)", zahl(prod.gesamt.ausschuss) + " Stück", "Quote " + (Number.isFinite(prod.gesamt.ausschussQuote) ? zt(prod.gesamt.ausschussQuote * 100, 2) + " %" : "–") + " am Ausstoss"]);
  } else if (kid === "audits") {
    const a = von("audit").filter((e) => imJahr(e.daten.datum, jahr) || String(auditQuartal(e) || "").startsWith(String(jahr)));
    const gruppen = [["Interne Audits", (e) => ["intern", "as"].includes(e.daten.art || "intern")], ["Kundenaudits", (e) => e.daten.art === "kunde"],
      ["Zertifizierung (SSC)", (e) => e.daten.art === "zert"], ["Lieferantenaudits", (e) => e.daten.art === "lieferant"]];
    for (const [t, fn] of gruppen) {
      const l = a.filter(fn);
      if (!l.length && t !== "Interne Audits") continue;
      const d = l.filter((e) => e.status === "durchgefuehrt");
      const fest = d.reduce((s, e) => s + String(e.daten.feststellungen || "").split("\n").filter((x) => x.trim()).length, 0);
      z.push([t, d.length + " von " + l.length + " durchgeführt", fest + " Feststellungen"]);
    }
    const aus = von("abweichung").filter((e) => e.daten.quelle === "audit");
    const s = zaehle(aus);
    if (s.n) z.push(["Feststellungen in der Liste (alle Jahre)", s.zu + " von " + s.n + " erledigt", s.offen + " offen"]);
  } else if (kid === "lieferanten") {
    // Seit 1.483.0 Bewertung je Jahr wie im Gewatec (daten.verlauf[Jahr])
    const allL = von("lieferant");
    const imJ = (j) => allL.map((e) => [e, ((e.daten.verlauf || {})[j] || {})]).filter(([, v]) => lbPunkte(v) > 0);
    const jetzt = imJ(jahr), vor = imJ(jahr - 1);
    if (jetzt.length) {
      const mittel = (l) => l.reduce((a, [, v]) => a + lbPunkte(v), 0) / l.length;
      const ampel = { gruen: 0, gelb: 0, rot: 0 };
      for (const [, v] of jetzt) ampel[lbAmpel(lbPunkte(v))[0]]++;
      z.push(["Lieferanten bewertet " + jahr, zahl(jetzt.length), ampel.gruen + " ohne Massnahme · " + ampel.gelb + " mit Massnahme · " + ampel.rot + " sperren"]);
      z.push(["Mittlere Punktzahl", Math.round(mittel(jetzt)) + " von 100", vor.length ? jahr - 1 + ": " + Math.round(mittel(vor)) : ""]);
      const tief = jetzt.slice().sort((a, b) => lbPunkte(a[1]) - lbPunkte(b[1]))[0];
      z.push(["Tiefste Punktzahl", lbPunkte(tief[1]) + " · " + tief[0].titel, tief[1].bemerkung ? String(tief[1].bemerkung).slice(0, 80) : ""]);
    } else {
      const lief = allL.filter((e) => e.status !== "gesperrt" || imJahr(e.daten.letzte, jahr));
      const noten = { A: 0, B: 0, C: 0 };
      for (const e of lief) { const n = lieferantNote(e.daten); if (n) noten[n]++; }
      z.push(["Lieferanten bewertet " + jahr, lief.filter((e) => imJahr(e.daten.letzte, jahr)).length + " von " + lief.length, "A " + noten.A + " · B " + noten.B + " · C " + noten.C]);
    }
    const lf = abw.filter((e) => e.daten.quelle === "lieferant");
    z.push(["Lieferantenfehler " + jahr, zahl(lf.length), ""]);
  } else if (kid === "ressourcen") {
    const sch = von("schulung").filter((e) => imJahr(e.daten.datum, jahr) && e.status !== "geplant");
    z.push(["Schulungen " + jahr, zahl(sch.length), ""]);
    if (prod && !prod.leer) z.push(["Auslastung der Maschinen", pr(prod.gesamt.auslastung), "aus der Produktionsstatistik"]);
  } else if (kid === "risiken") {
    const r = von("risiko");
    const typ = (t) => r.filter((e) => (e.daten.typ || "risiko") === t).length;
    z.push(["Themen", zahl(r.length), "R " + typ("risiko") + " · C " + typ("chance") + " · R/C " + typ("beides")]);
    z.push(["Davon neu " + jahr, zahl(r.filter((e) => imJahr(e.daten.aufnahme || e.erstellt_am, jahr)).length), ""]);
    z.push(["Einstufung hoch (rot, ab 10)", zahl(r.filter((e) => risikoWert(e.daten) >= 10).length), "erst beurteilt: " + r.filter((e) => risikoErst(e.daten) >= 10).length]);
    const neu = r.filter((e) => hatNeu(e.daten));
    z.push(["Neu beurteilt", zahl(neu.length), neu.filter((e) => risikoWert(e.daten) < risikoErst(e.daten)).length + " davon gesenkt (Massnahme wirkt)"]);
    z.push(["Massnahme zu 100 % umgesetzt", zahl(r.filter((e) => String(e.daten.fortschritt) === "100").length), ""]);
  } else if (kid === "verbesserung") {
    const id = abw.filter((e) => e.daten.quelle === "idee");
    z.push(["Verbesserungsideen " + jahr, zahl(id.length), id.filter(istZu).length + " umgesetzt"]);
  }
  return z;
}

// Stand: wie viele Kapitel bewertet, wie viele Fragen beantwortet
export function mbStand(mb, fragen) {
  const k = (mb && mb.kapitel) || {};
  const a = (mb && mb.antworten) || {};
  return {
    kapitel: MB_KAPITEL.filter((x) => k[x.id] && k[x.id].b).length,
    fragen: fragen.filter((f) => a[f.id] && String(a[f.id].wert || "").trim()).length,
    massnahmen: MB_KAPITEL.filter((x) => k[x.id] && k[x.id].m === "ja").length,
  };
}
