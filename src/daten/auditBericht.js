// =================================================================
//  QMS: externen Auditbericht lesen (seit 1.482.0, Wunsch Patrick
//  11. November 2026: „wenn der nächste externe Auditbericht zugeordnet
//  wird, soll er automatisch verarbeitet werden“).
//
//  Liest die Textzeilen eines Berichts (aus pdf.js, zeilenAusStuecken:
//  Spalten mit zwei Leerzeichen getrennt) und holt heraus, was ans Audit
//  und in die Liste Abweichungen gehört. Gebaut nach dem Bericht von
//  Swiss Safety Center (Kopf „Bezeichnung  Wert“, Management Summary mit
//  „Empfehlung 1 …“, Antrag mit ☒, Kapitel 4 bis 10 mit „Bewertung: ☒
//  erfüllt“ und den Feststellungen unter ihrem Kapitel), aber so offen,
//  dass auch ein Kunde mit „Abweichung 1“ oder „Hinweis 2“ durchgeht.
//  Ohne Abhängigkeiten, damit der Prüfstand es auch in Node prüfen kann.
// =================================================================

const ARTEN = [
  ["kritische abweichung", "abweichung", "Kritische Abweichung"],
  ["nebenabweichung", "abweichung", "Abweichung"],
  ["hauptabweichung", "abweichung", "Kritische Abweichung"],
  ["abweichung", "abweichung", "Abweichung"],
  ["empfehlung", "verbesserung", "Empfehlung"],
  ["verbesserungspotenzial", "verbesserung", "Verbesserungspotenzial"],
  ["verbesserungsvorschlag", "verbesserung", "Empfehlung"],
  ["hinweis", "feststellung", "Hinweis"],
  ["feststellung", "feststellung", "Feststellung"],
  ["beobachtung", "feststellung", "Beobachtung"],
];
const PUNKT_RE = /^(Kritische Abweichung|Nebenabweichung|Hauptabweichung|Abweichung|Empfehlung|Verbesserungspotenzial|Verbesserungsvorschlag|Hinweis|Feststellung|Beobachtung)\s*(?:Nr\.?\s*)?(\d{1,2})\b[:.]?\s*(.*)$/i;
const DATUM_RE = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/;

const iso = (s) => { const m = DATUM_RE.exec(s || ""); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null; };
const leer = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Zeilen zusammenhängen, Trennstriche am Zeilenende auflösen („be-“ + „schreiben“)
function zusammen(teile) {
  let aus = "";
  for (const t0 of teile) {
    const t = leer(t0);
    if (!t) continue;
    if (/[a-zäöüß]-$/.test(aus) && /^[a-zäöüß]/.test(t)) aus = aus.slice(0, -1) + t;
    else aus = aus ? aus + " " + t : t;
  }
  return aus;
}

// Kopf-, Fuss- und Seitenzeilen, die mitten in einem Text stehen können
function istRauschen(z, org) {
  const t = leer(z);
  return !t || /Geschäftsvertraulich|\.docx\b|\b\d{1,2}\/\d{1,2}$/.test(t) || /^Seite \d+/.test(t) || t === "Auditbericht" || (!!org && t === org);
}

// Kapitel der Norm: „7.5 Dokumentierte Informationen“, nicht Inhaltsverzeichnis
function kapitelVon(z) {
  const m = /^(\d{1,2}(?:\.\d{1,2}){0,3})(\.?)\s+([A-ZÄÖÜ][^]*)$/.exec(leer(z));
  if (!m || z.length > 90 || /\s{2}\d+$/.test(z)) return null;
  // „4. Bewusstsein …“ ist eine Aufzählung, kein Kapitel
  if (m[2] && !m[1].includes(".")) return null;
  const haupt = Number(m[1].split(".")[0]);
  if (haupt < 4 || haupt > 10) return null;
  return m[1];
}

// Wörter für den Vergleich zweier Texte (Zusammenfassung ↔ Kapitel)
const woerter = (s) => new Set(leer(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3));
function aehnlich(a, b) {
  const x = woerter(a), y = woerter(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.min(x.size, y.size);
}

function wert(zeilen, re) {
  for (const z of zeilen) {
    const m = re.exec(z);
    if (m) return leer(m[1]);
  }
  return "";
}

const ersterSatz = (s) => { const m = /^(.{20,}?[.!?])\s+[A-ZÄÖÜ]/.exec(s); return m ? m[1] : s; };

export function berichtLesen(zeilen0) {
  const zeilen = (zeilen0 || []).map((z) => String(z || "").replace(/ /g, " ").trimEnd());
  const text = zeilen.join("\n");
  const kopf = zeilen.slice(0, 120);
  const org = wert(kopf, /^\s*(?:Organisation|Auftraggeber)\s{2,}(.+)$/);
  const datum = iso(wert(kopf, /^\s*(?:Auditdatum|Datum des Audits|Audit(?:-| )?Datum)\s{1,}(.*\d{4}.*)$/i));
  const audittyp = wert(kopf, /^\s*Audittyp\s{2,}(.+)$/) || wert(kopf, /^\s*Auditart\s{2,}(.+)$/);
  const norm = wert(kopf, /^\s*(?:Anforderungen|Auditkriterien(?: \(Standard\))?|Norm)\s{2,}(.+)$/);
  const nichtAnw = wert(kopf, /^\s*nicht anwendbare (?:Kriterien|Anforderungen)\s{2,}(.+)$/i);
  const strip = (s) => leer(String(s || "").replace(/\s*\([A-Z]{3,6}\)/g, ""));
  const leitend = strip(wert(kopf, /^\s*Leitende[rn]? Auditor(?:in)?\s{1,}(.+)$/));
  const weitere = strip(wert(kopf, /^\s*Auditoren(?:\/[^ ]+)*\s{1,}(.+)$/)).replace(/^-\s*/, "");
  // Zertifizierer: eine Firma oben auf der ersten Seite, die nicht wir sind
  const firma = kopf.slice(0, 15).map(leer).find((z) => /\b(AG|GmbH|SA|Sàrl|S\.A\.|Ltd)$/.test(z) && z !== org && !/Hofer/i.test(z)) || "";
  const stelle = /Swiss Safety Center/i.test(firma) || /\bSSC\b/.test(text.slice(0, 4000)) ? "SSC" : firma;
  const auditor = [leitend && (leitend + (weitere ? " (leitend)" : "")), weitere, firma].filter(Boolean).join(", ");

  // Nächstes Audit
  let naechstes = null;
  const iN = zeilen.findIndex((z) => /^\s*nächstes Audit/i.test(z));
  if (iN >= 0) {
    const typ = leer((/\s{2,}(.+)$/.exec(zeilen[iN]) || [])[1]);
    const d = iso(zeilen.slice(iN, iN + 4).join(" "));
    if (typ || d) naechstes = { typ, datum: d };
  }

  // Antrag: angekreuzte Zeile ☒ (oder ☑ / [x]) bis zur nächsten Kästchenzeile
  let antrag = "";
  // erste Stelle mit „Antrag“, nach der bald ein Kreuz kommt (nicht das Inhaltsverzeichnis)
  const iA = zeilen.findIndex((z, i) => /Antrag/i.test(z) && zeilen.slice(i, i + 15).some((y) => /^\s*(☒|☑|\[x\])/i.test(y)));
  if (iA >= 0) {
    for (let i = iA; i < Math.min(zeilen.length, iA + 15); i++) {
      if (/^\s*(☒|☑|\[x\])/i.test(zeilen[i])) {
        const teile = [zeilen[i].replace(/^\s*(☒|☑|\[x\])\s*/i, "")];
        for (let j = i + 1; j < zeilen.length && !/^\s*(☐|☒|☑|\[ ?\])/.test(zeilen[j]) && !/^[A-Z] [A-ZÄÖÜ]/.test(zeilen[j]); j++) teile.push(zeilen[j]);
        antrag = ersterSatz(zusammen(teile));
        break;
      }
    }
  }

  // Stärken: nummerierte Überschriften der Management Summary
  const staerken = [];
  const iS = zeilen.findIndex((z) => /^\s*[A-Z]?\s*Management Summary\s*$/i.test(z) || /^\s*(?:[A-Z]\s+)?Zusammenfassung\s*$/i.test(z));
  if (iS >= 0) {
    for (let i = iS + 1; i < zeilen.length && !/^[A-Z] [A-ZÄÖÜ]/.test(zeilen[i]) && !PUNKT_RE.test(leer(zeilen[i])) && !/folgende/i.test(zeilen[i]); i++) {
      const m = /^\s*\d{1,2}\.\s+([A-ZÄÖÜ][^.]{3,70})$/.exec(zeilen[i]);
      if (m) staerken.push(leer(m[1]));
    }
  }

  // Wo die Kapitel beginnen (nach dem Inhaltsverzeichnis)
  let iK = zeilen.findIndex((z) => kapitelVon(z));
  if (iK < 0) iK = zeilen.length;

  // Feststellungen sammeln, in der Zusammenfassung ganz, in den Kapiteln mit Kapitel
  const vorn = [], kapitel = [];
  let akt = null, kap = null, imKap = false;
  const ende = () => { if (akt) { akt.text = zusammen(akt.teile); delete akt.teile; (akt.kap ? kapitel : vorn).push(akt); } akt = null; };
  const bewertungen = [];
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i], t = leer(z);
    if (i >= iK) imKap = true;
    const k = imKap ? kapitelVon(z) : null;
    if (k) { ende(); kap = k; continue; }
    if (imKap && /^Bewertung:/i.test(t) && kap) {
      const b = /☒\s*nicht erfüllt/i.test(t) ? "nicht" : /☒\s*teilweise/i.test(t) ? "teil" : /☒\s*erfüllt/i.test(t) ? "ok" : null;
      if (b) bewertungen.push({ kap, b });
    }
    const m = PUNKT_RE.exec(t);
    if (m && m[3] && !/^[:]/.test(t.slice(m[1].length))) {
      ende();
      const a = ARTEN.find((x) => x[0] === m[1].toLowerCase());
      akt = { art: a[1], name: a[2], nr: Number(m[2]), kap: imKap ? kap : null, teile: [m[3]] };
      continue;
    }
    if (!akt) continue;
    if (!t || /^[A-Z] [A-ZÄÖÜ]/.test(z) || /^\s*(☐|☒)/.test(z) || /^(Objektive Nachweise|Bewertung):?/i.test(t)) { ende(); continue; }
    if (istRauschen(z, org)) continue;
    akt.teile.push(t);
    // In den Kapiteln endet ein Punkt mit dem Satz, danach geht der Bericht weiter
    if (akt.kap && /[.!]$/.test(t)) ende();
  }
  ende();

  // Zusammenfassung ist massgebend; Kapitel geben die Normstelle
  let punkte;
  if (vorn.length) {
    punkte = vorn.map((p) => {
      const kaps = [...new Set(kapitel.filter((q) => q.art === p.art && aehnlich(p.text, q.text) >= 0.5).map((q) => q.kap))];
      return { ...p, norm: kaps.join(" / ") };
    });
    // Was nur in den Kapiteln steht, kommt dazu
    for (const q of kapitel) {
      if (!punkte.some((p) => p.art === q.art && aehnlich(p.text, q.text) >= 0.5)) punkte.push({ ...q, norm: q.kap });
    }
  } else {
    punkte = [];
    for (const q of kapitel) {
      const da = punkte.find((p) => p.art === q.art && aehnlich(p.text, q.text) >= 0.8);
      if (da) { if (!da.norm.split(" / ").includes(q.kap)) da.norm += " / " + q.kap; }
      else punkte.push({ ...q, norm: q.kap });
    }
  }
  punkte = punkte.map(({ kap, ...p }) => p);

  const keineAbw = /keine (?:kritischen? )?Abweichungen/i.test(text);
  const zahl = (a) => punkte.filter((p) => p.art === a).length;
  const nichtErfuellt = bewertungen.filter((b) => b.b !== "ok");
  const ergebnis = [
    [antrag ? "Antrag des Auditors: " + antrag : "",
      zahl("abweichung") ? zahl("abweichung") + " Abweichung(en)" : keineAbw ? "Keine Abweichungen" : "",
      zahl("verbesserung") ? zahl("verbesserung") + " Empfehlung(en)" : "",
      zahl("feststellung") ? zahl("feststellung") + " Hinweis(e)" : "",
      bewertungen.length ? (nichtErfuellt.length ? "nicht ganz erfüllt: " + nichtErfuellt.map((b) => b.kap).join(", ") : "Alle bewerteten Kapitel erfüllt") : "",
    ].filter(Boolean).join(". ").replace(/\.\./g, ".") + ".",
    staerken.length ? "Stärken: " + staerken.join("; ") + "." : "",
    naechstes ? "Nächstes Audit: " + [naechstes.typ, naechstes.datum ? "am " + naechstes.datum.split("-").reverse().join(".") : ""].filter(Boolean).join(" ") + "." : "",
  ].filter((x) => x && x !== ".").join("\n");

  return {
    erkannt: !!(datum || punkte.length || antrag),
    org, datum, audittyp, stelle, auditor,
    norm: norm ? norm + (nichtAnw && !/keine|nein/i.test(nichtAnw) ? " (" + nichtAnw + " nicht anwendbar)" : "") : "",
    antrag, staerken, naechstes, keineAbw, bewertungen, punkte, ergebnis,
  };
}

// Text eines Punkts für die Liste Abweichungen und die Feststellungen am Audit
export function punktTitel(p, stelle) {
  const kurz = p.text.length > 200 ? ersterSatz(p.text) : p.text;
  return p.name + (stelle ? " " + stelle : "") + ": " + kurz + (p.norm ? " (" + p.norm + ")" : "");
}
