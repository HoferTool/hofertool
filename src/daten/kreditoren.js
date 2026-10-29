// =================================================================
//  KREDITORENRECHNUNGEN ERKENNEN UND TRENNEN
//
//  Wunsch Patrick, 29. Oktober 2026: „ich möchte meine Kreditoren-
//  rechnungen digitalisieren und nach Lieferant in einem Ordner ablegen“.
//  Der Scanner legt einen ganzen Stapel in eine PDF (mit Text, OCR).
//  Hier steht nur das Lesen: aus dem Text jeder Seite den Lieferanten,
//  die Rechnungsnummer, das Datum und „Seite x von y“ holen, und daraus
//  den Stapel in einzelne Rechnungen teilen. Das Ablegen im Ordner macht
//  src/teile/kreditorenAblage.js.
//
//  Der Lieferant kommt, in dieser Reihenfolge, aus
//    1. gelernten Merkmalen (_Lieferanten.json im Ordner): UID-Nummer,
//       IBAN oder Name, wie sie auf seinen Rechnungen stehen,
//    2. dem Zahlteil der QR-Rechnung („Konto / Zahlbar an“, darunter
//       IBAN und Name), dort steht er immer gleich und sauber,
//    3. sonst gar nicht: die Rechnung kommt nach „_Zuordnen“, und der
//       Name, den man dort einmal eingibt, wird gelernt.
//  OCR verliest Buchstaben („Hafer“, „uTiis“), darum zählen UID und
//  IBAN vor dem Namen.
// =================================================================

// Die eigene UID und Namen, die auf jeder Rechnung als Empfänger stehen
const EIGENE_UID = ["313094963"];
const EIGENE = /hofer|hafer|präzisionsdrehteile|prazisionsdrehteile|lohn-ammannsegg|zurbrügg|zurbrugg/i;

// Klein, ohne Akzente und Satzzeichen, für Vergleiche trotz OCR
export function einfach(t) {
  return String(t || "").toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/[éèê]/g, "e").replace(/[àâ]/g, "a")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Rechtsform und Füllwörter zählen beim Namen nicht
const RECHTSFORM = /\b(ag|gmbh|sa|sarl|s a r l|kg|ltd|inc|co|und|and|schweiz|suisse|switzerland)\b/g;
export function nameKern(name) {
  return einfach(name).replace(RECHTSFORM, " ").replace(/\s+/g, " ").trim();
}

// Zeichen, die Windows im Ordner- oder Dateinamen nicht mag
export function sauber(t) {
  return String(t || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
}

// UID-Nummern (CHE-123.456.789) als neun Ziffern, ohne die eigene
export function uidsIn(text) {
  const aus = new Set();
  const re = /CHE[\s\-–.·]*(\d{3})[\s.,·]*(\d{3})[\s.,·]*(\d{3})/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = m[1] + m[2] + m[3];
    if (!EIGENE_UID.includes(n)) aus.add(n);
  }
  return [...aus];
}

// IBAN aus der Schweiz und Liechtenstein (CH/LI + 19 Zeichen), ohne Leerzeichen
export function ibansIn(text) {
  const aus = new Set();
  const re = /\b(CH|LI)\s?(\d{2})((?:\s?[0-9A-Z]){17})\b/g;
  let m;
  while ((m = re.exec(text))) aus.add((m[1] + m[2] + m[3]).replace(/\s/g, ""));
  return [...aus];
}

// Name im Zahlteil der QR-Rechnung: nach „Konto / Zahlbar an“ die
// erste Zeile nach der IBAN. Im Empfangsschein und im Zahlteil steht
// derselbe Name; der kürzere ohne angehängte Spalte gewinnt.
export function qrName(zeilen) {
  const namen = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (!/konto\s*\/?\s*zahlbar\s*an/i.test(zeilen[i])) continue;
    for (let j = i; j < Math.min(zeilen.length, i + 6); j++) {
      // In derselben Zeile können zwei Spalten stehen; nur was nach der IBAN kommt
      const rest = j === i ? zeilen[j].replace(/.*zahlbar\s*an/i, "") : zeilen[j];
      if (!ibansIn(rest.toUpperCase()).length) continue;
      for (let k = j + 1; k < Math.min(zeilen.length, j + 4); k++) {
        let z = zeilen[k].replace(/\s{2,}.*$/, "").trim();
        if (!z || ibansIn(z).length || /^\d|referenz|zahlbar|konto/i.test(z) || EIGENE.test(z)) continue;
        if (/[a-zäöü]{2}/i.test(z)) { namen.push(z); break; }
      }
      break;
    }
  }
  if (!namen.length) return null;
  return namen.sort((a, b) => a.length - b.length)[0].replace(/^(\S+?)(AG|GmbH)$/, "$1 $2");
}

// Ein Vorschlag, wenn nichts sicher ist: die erste Firma (… AG, GmbH)
// auf der Seite, die nicht wir selbst sind
export function firmaVorschlag(zeilen) {
  for (const z of zeilen) {
    if (EIGENE.test(z)) continue;
    const m = /([A-ZÄÖÜ][\wÄÖÜäöü&.\-/ ]{1,40}?\s(?:AG|GmbH|SA|Sàrl))\b/.exec(z);
    if (m) return m[1].replace(/^.*:\s*/, "").trim();
  }
  return null;
}

// Steht eine Firma in derselben Zeile wie ihre UID-Nummer (Fusszeile
// „Steeltec AG / … / UID-Nr. CHE-105.900.006“), ist sie es sicher
export function uidFirma(zeilen) {
  for (const z of zeilen) {
    if (!uidsIn(z).length || EIGENE.test(z)) continue;
    const f = firmaVorschlag([z]);
    if (f) return f;
  }
  return null;
}

// Ohne QR-Zahlteil: der Name direkt über der IBAN bei „Bankverbindung“
// („Bankverbindung: / Basel que si / IBAN CH61 …“). Bankname und Ort
// (UBS, Kantonalbank, „8098 Zürich“) zählen nicht.
export function bankName(zeilen) {
  for (let i = 0; i < zeilen.length; i++) {
    if (!/bankverbindung|kontoinhaber|zugunsten|zahlbar an/i.test(zeilen[i])) continue;
    for (let j = i + 1; j < Math.min(zeilen.length, i + 5); j++) {
      if (!ibansIn(zeilen[j].toUpperCase()).length) continue;
      const z = (zeilen[j - 1] || "").replace(/\s{2,}.*$/, "").trim();
      if (j - 1 > i && z && /[a-zäöü]{3}/i.test(z) && !/^\d|bank|ubs|credit|raiffeisen|postfinance|iban|konto|swift|bic/i.test(z)
        && !EIGENE.test(z)) return z;
      break;
    }
  }
  return null;
}

// „Seite 2 von 3“, „Seite 2/2“, „Seite: 1“, „Seite 2 / 3“
export function seiteIn(text) {
  const m = /seite\s*:?\s*(\d{1,2})(?:\s*(?:von|\/|of)\s*(\d{1,2}))?/i.exec(text);
  if (!m) return null;
  const n = +m[1], von = m[2] ? +m[2] : null;
  if (!n || (von && n > von)) return null;
  return { n, von };
}

// Rechnungsnummer
export function nummerIn(text) {
  const muster = [
    /rechnungs?\s*-?\s*(?:nr|nummer|no)\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]*\d[A-Z0-9\-/]*)/i,
    /rechnung\s*:?\s*(?:RG\s+)?([A-Z]{0,4}-?\d[A-Z0-9\-/]*\d)\b/i,
  ];
  for (const re of muster) {
    const m = re.exec(text);
    if (m) return m[1].replace(/[.\-/]+$/, "");
  }
  return null;
}

// Rechnungsdatum als JJJJ-MM-TT: zuerst ein Datum bei „Rechnung“ oder
// „Datum“, nicht Bestell-, Liefer- oder Verfalldatum
export function datumIn(zeilen) {
  const re = /\b(\d{1,2})[.\s]\s?(\d{1,2})[.\s]\s?(20\d{2})\b/;
  const iso = (m) => {
    const t = +m[1], mo = +m[2];
    if (t < 1 || t > 31 || mo < 1 || mo > 12) return null;
    return m[3] + "-" + String(mo).padStart(2, "0") + "-" + String(t).padStart(2, "0");
  };
  const stufen = [
    (z) => /rechnung/i.test(z) && !/bestell|liefer|verfall|auftrag/i.test(z),
    (z) => /datum|\bden\b|\bvom\b|, \d/i.test(z) && !/bestell|liefer|verfall|auftrag|letzte/i.test(z),
    () => true,
  ];
  for (const passt of stufen) {
    for (const z of zeilen) {
      if (!passt(z)) continue;
      const m = re.exec(z);
      const d = m && iso(m);
      if (d) return d;
    }
  }
  return null;
}

// Welcher gelernte Lieferant passt zur Seite? Zuerst UID, dann IBAN,
// dann der Name (als ganze Wörter, damit „Ades“ nicht in „Kades“ passt)
export function lieferantSuchen(text, liste) {
  const uids = uidsIn(text), ibans = ibansIn(text.toUpperCase());
  const einf = " " + einfach(text) + " ";
  for (const l of liste) if ((l.uid || []).some((u) => uids.includes(u))) return l;
  for (const l of liste) if ((l.iban || []).some((i) => ibans.includes(i))) return l;
  let best = null, laenge = 0;
  for (const l of liste) {
    for (const w of [l.name, ...(l.text || [])]) {
      const k = nameKern(w);
      if (k.length < 4) continue;
      if (einf.includes(" " + k + " ") && k.length > laenge) { best = l; laenge = k.length; }
    }
  }
  return best;
}

// Merkmale einer Seite. zeilen = Textzeilen der Seite von oben nach unten
export function seiteLesen(zeilen, liste) {
  const text = zeilen.join("\n");
  const flach = zeilen.join(" ");
  const l = lieferantSuchen(text, liste);
  return {
    zeilen,
    lieferant: l ? l.name : null,
    qr: qrName(zeilen) || uidFirma(zeilen) || bankName(zeilen),
    seite: seiteIn(flach),
    nummer: nummerIn(flach),
    datum: datumIn(zeilen),
    uids: uidsIn(text),
    ibans: ibansIn(text.toUpperCase()),
    leer: einfach(text).length < 15,
    zahlteil: /zahlteil|empfangsschein/i.test(text),
  };
}

// Liest alle Seiten eines Stapels. Namen aus dem QR-Zahlteil gelten
// schon im selben Stapel als gelernt, damit auch die Seiten davor
// (mit Logo oder UID) dem Lieferanten zugeordnet werden.
export function stapelLesen(seitenZeilen, liste) {
  let seiten = seitenZeilen.map((z) => seiteLesen(z, liste));
  const dazu = [];
  seiten.forEach((s) => {
    if (s.lieferant || !s.qr || dazu.some((x) => einfach(x.name) === einfach(s.qr))) return;
    dazu.push({ name: s.qr, uid: s.uids, iban: s.ibans, text: [], neu: true });
  });
  if (dazu.length) {
    const ganz = liste.concat(dazu);
    seiten = seitenZeilen.map((z) => seiteLesen(z, ganz));
  }
  return seiten;
}

// Teilt einen Stapel in Rechnungen. Eine neue beginnt bei „Seite 1“,
// bei einem anderen Lieferanten, bei einer anderen Rechnungsnummer
// desselben Lieferanten, oder nach einer vollständigen Rechnung („2 von 2“),
// wenn die Seite nicht erkennbar zum selben Lieferanten gehört.
// Leere Seiten (Rückseiten, Trennblätter) trennen und fallen weg.
export function stapelTeilen(seiten) {
  const docs = [];
  let akt = null, trenn = false;
  seiten.forEach((s, i) => {
    if (s.leer) { trenn = true; return; }
    const lief = s.lieferant || s.qr;
    let neu = !akt || trenn;
    if (!neu && s.seite && s.seite.n === 1) neu = true;
    if (!neu && lief && akt.lieferant && einfach(lief) !== einfach(akt.lieferant)) neu = true;
    if (!neu && s.nummer && akt.nummer && einfach(s.nummer) !== einfach(akt.nummer)
      && (!s.seite || s.seite.n === 1)) neu = true;
    // Der Zahlteil (QR-Rechnung) auf eigenem Blatt gehört zur Rechnung davor
    const gleich = lief && (!akt || !akt.lieferant || einfach(lief) === einfach(akt.lieferant));
    if (!neu && akt.fertig && !(gleich && (akt.lieferant || s.zahlteil))) neu = true;
    // Eine Folgeseite („Seite 2“) gehört zur Rechnung davor, wenn nichts dagegen spricht
    if (neu && akt && !trenn && s.seite && s.seite.n > 1 && !akt.fertig
      && !(lief && akt.lieferant && einfach(lief) !== einfach(akt.lieferant))) neu = false;
    trenn = false;
    if (neu) {
      akt = { seiten: [], lieferant: null, gelernt: false, nummer: null, datum: null, fertig: false,
        uids: new Set(), ibans: new Set(), vorschlag: null };
      docs.push(akt);
    }
    akt.seiten.push(i);
    if (s.lieferant) { akt.lieferant = s.lieferant; akt.gelernt = true; }
    else if (s.qr && !akt.gelernt) akt.lieferant = s.qr;
    if (!akt.nummer && s.nummer) akt.nummer = s.nummer;
    if (!akt.datum && s.datum) akt.datum = s.datum;
    s.uids.forEach((u) => akt.uids.add(u));
    s.ibans.forEach((x) => akt.ibans.add(x));
    if (!akt.vorschlag) akt.vorschlag = firmaVorschlag(s.zeilen);
    if (s.seite && s.seite.von) akt.fertig = s.seite.n === s.seite.von;
  });
  return docs.map((d) => Object.assign(d, { uids: [...d.uids], ibans: [...d.ibans] }));
}

// Dateiname einer Rechnung: „2026-10-28 KR26-17717.pdf“
export function dateiName(d, stapel) {
  const teile = [d.datum || "ohne Datum", d.nummer ? d.nummer : null].filter(Boolean);
  if (!d.nummer) teile.push("aus " + stapel.replace(/\.pdf$/i, "") + " S" + (d.seiten[0] + 1));
  return sauber(teile.join(" ")) + ".pdf";
}

// Nach dem Ablegen lernen: UID und IBAN der Rechnung gehören ab jetzt
// zu diesem Lieferanten (nur solche, die nicht schon einem anderen gehören)
export function lernen(liste, name, d) {
  let l = liste.find((x) => einfach(x.name) === einfach(name));
  if (!l) { l = { name, uid: [], iban: [], text: [] }; liste.push(l); }
  const fremd = (art, wert) => liste.some((x) => x !== l && (x[art] || []).includes(wert));
  for (const u of d.uids || []) if (!l.uid.includes(u) && !fremd("uid", u)) l.uid.push(u);
  for (const i of d.ibans || []) if (!l.iban.includes(i) && !fremd("iban", i)) l.iban.push(i);
  return l;
}

// Aus den Textstücken von pdf.js die Zeilen bauen: gleiche Höhe auf dem
// Blatt ist eine Zeile, von oben nach unten, links nach rechts. Zwischen
// weit auseinander liegenden Stücken (zwei Spalten) stehen zwei Leerzeichen.
export function zeilenAusStuecken(stuecke) {
  const zeilen = [];
  for (const s of stuecke) {
    if (!s.str || !s.str.trim()) continue;
    const x = s.transform[4], y = s.transform[5];
    let z = zeilen.find((r) => Math.abs(r.y - y) < 4);
    if (!z) { z = { y, teile: [] }; zeilen.push(z); }
    z.teile.push({ x, ende: x + (s.width || 0), text: s.str.trim() });
  }
  return zeilen.sort((a, b) => b.y - a.y).map((z) => {
    const t = z.teile.sort((a, b) => a.x - b.x);
    let aus = "";
    t.forEach((s, i) => { aus += i === 0 ? s.text : (s.x - t[i - 1].ende > 40 ? "  " : " ") + s.text; });
    return aus;
  });
}
