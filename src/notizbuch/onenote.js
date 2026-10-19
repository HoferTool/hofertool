// =================================================================
//  NOTIZBÜCHER · Aus OneNote übernehmen
//  (Wunsch Patrick 19. Oktober 2026: „von OneNote Bücher herunterladen
//  und direkt bei Notizen hochladen“)
//
//  OneNote gibt ohne Microsoft-Konto nur PDF sauber heraus (Datei →
//  Exportieren → Notizbuch oder Abschnitt → PDF). Die eigenen Formate
//  .onepkg und .one kann kein Browser lesen. Darum: Die PDF wird
//  wieder in Seiten zerlegt, jede OneNote-Seite wird eine Seite im
//  Notizbuch, ihr Inhalt als Ausdruck (Bild je PDF-Seite), auf dem man
//  weiter schreiben und zeichnen kann.
//
//  Wo eine OneNote-Seite anfängt, steht in der PDF so:
//    1. Lesezeichen der PDF, wenn es welche gibt (Abschnitt → Seite)
//    2. sonst der Kopf, den OneNote über jede Seite druckt: Titel,
//       darunter Datum mit Jahr und Uhrzeit. Folgeseiten einer langen
//       OneNote-Seite haben diesen Kopf nicht.
//    3. sonst jede PDF-Seite für sich
// =================================================================
import { pdfjs } from "../teile/PdfAnsicht.jsx";
import { pdfSeiteHochladen, pdfHochladen } from "./daten.js";

// Mehr Seiten pro Blatt macht Safari auf dem iPad zu langsam; eine
// längere OneNote-Seite geht auf mehrere Blätter „(2)“, „(3)“ …
const MAX_JE_BLATT = 40;
const MAX_SEITEN = 600;

const JAHR = /\b(19|20)\d{2}\b/;
const UHRZEIT = /\b\d{1,2}:\d{2}\b/;

export const istOneNoteDatei = (d) => /\.(one|onepkg|onetoc2)$/i.test(d.name || "");

// Zeilen oben auf der Seite: Textstücke mit gleicher Höhe zusammen,
// von oben nach unten
async function kopfZeilen(seite) {
  const h = seite.getViewport({ scale: 1 }).height;
  let t;
  try { t = await seite.getTextContent(); } catch (f) { return []; }
  const zeilen = [];
  for (const it of t.items || []) {
    const s = String(it.str || "").trim();
    if (!s || !it.transform) continue;
    const y = it.transform[5];
    if (y < h * 0.6) continue;           // nur das obere Drittel zählt
    const gr = Math.abs(it.transform[3]) || it.height || 10;
    const z = zeilen.find((z0) => Math.abs(z0.y - y) < gr * 0.5);
    if (z) { z.teile.push([it.transform[4], s]); z.gr = Math.max(z.gr, gr); }
    else zeilen.push({ y, gr, teile: [[it.transform[4], s]] });
  }
  zeilen.sort((a, b) => b.y - a.y);
  return zeilen.map((z) => ({ y: z.y, gr: z.gr,
    text: z.teile.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(" ").replace(/\s+/g, " ") }));
}

// Kopf einer OneNote-Seite? → Titel ("" wenn ohne Titel) oder null.
// Das Datum muss unter den ersten Zeilen stehen, die Uhrzeit gleich
// daneben oder darunter, sonst wäre ein Datum im Text schon ein Kopf.
export function oneNoteKopf(zeilen) {
  const oben = zeilen.slice(0, 5);
  for (let i = 0; i < oben.length; i++) {
    if (!JAHR.test(oben[i].text)) continue;
    const zeit = UHRZEIT.test(oben[i].text) ? i
      : (oben[i + 1] && UHRZEIT.test(oben[i + 1].text) && oben[i].y - oben[i + 1].y < oben[i].gr * 3 ? i + 1 : -1);
    if (zeit < 0) continue;
    // Ohne Titel steht das Datum ganz oben; sonst darf über dem Datum
    // nur der Titel stehen (höchstens zwei Zeilen)
    if (i > 2) return null;
    return oben.slice(0, i).map((z) => z.text).join(" ").trim();
  }
  return null;
}

// Lesezeichen der PDF flach: [{ titel, abschnitt, seite }] nach Seite.
// Die oberste Ebene sind die Abschnitte; ist dort nur ein Eintrag mit
// Kindern (das Notizbuch selbst), zählt die Ebene darunter.
async function lesezeichen(doc) {
  let baum = null;
  try { baum = await doc.getOutline(); } catch (f) { return []; }
  if (!baum || !baum.length) return [];
  const aus = [];
  const seiteVon = async (dest) => {
    try {
      if (typeof dest === "string") dest = await doc.getDestination(dest);
      if (!Array.isArray(dest) || dest[0] == null) return null;
      return typeof dest[0] === "object" ? (await doc.getPageIndex(dest[0])) + 1
        : (Number.isInteger(dest[0]) ? dest[0] + 1 : null);
    } catch (f) { return null; }
  };
  const gehen = async (liste, vorne) => {
    for (const e of liste) {
      const titel = String(e.title || "").trim();
      const kinder = e.items || [];
      if (kinder.length) await gehen(kinder, vorne.concat(titel ? [titel] : []));
      else {
        const s = await seiteVon(e.dest);
        // Abschnitt = oberste Ebene, Titel = der Rest
        const pfad = vorne.concat(titel ? [titel] : []);
        if (s) aus.push(vorne.length ? { abschnitt: pfad[0], titel: pfad.slice(1).join(" · "), seite: s }
          : { abschnitt: null, titel: pfad.join(" · "), seite: s });
      }
    }
  };
  while (baum.length === 1 && (baum[0].items || []).length) baum = baum[0].items;
  await gehen(baum, []);
  aus.sort((a, b) => a.seite - b.seite);
  // Mehrere Zeichen auf derselben PDF-Seite: das erste gilt
  return aus.filter((e, i) => !i || e.seite !== aus[i - 1].seite);
}

// Die PDF in OneNote-Seiten teilen → [{ titel, von, bis }]
export async function oneNoteSeiten(doc, n) {
  const zeichen = await lesezeichen(doc);
  if (zeichen.length) {
    const aus = [];
    if (zeichen[0].seite > 1) aus.push({ titel: "", abschnitt: zeichen[0].abschnitt, von: 1 });
    zeichen.forEach((z) => { if (z.seite <= n) aus.push({ titel: z.titel, abschnitt: z.abschnitt, von: z.seite }); });
    return grenzen(aus, n);
  }
  const aus = [];
  for (let i = 1; i <= n; i++) {
    const zeilen = await kopfZeilen(await doc.getPage(i));
    const titel = oneNoteKopf(zeilen);
    if (titel !== null) aus.push({ titel, von: i });
    else if (i === 1) aus.push({ titel: null, von: 1, erste: (zeilen[0] && zeilen[0].text) || "" });
  }
  // Gar kein Kopf gefunden: jede PDF-Seite für sich, Titel aus der
  // ersten Zeile
  if (aus.length === 1 && aus[0].titel === null && n > 1) {
    const jede = [];
    for (let i = 1; i <= n; i++) {
      const z = i === 1 ? aus[0].erste : (((await kopfZeilen(await doc.getPage(i)))[0] || {}).text || "");
      jede.push({ titel: z.slice(0, 80), von: i });
    }
    return grenzen(jede, n);
  }
  return grenzen(aus.map((s) => ({ titel: s.titel === null ? (s.erste || "").slice(0, 80) : s.titel, von: s.von })), n);
}

function grenzen(liste, n) {
  const aus = [];
  liste.forEach((s, i) => {
    const bis = i + 1 < liste.length ? liste[i + 1].von - 1 : n;
    // Zu lange Seiten in Stücke
    for (let a = s.von, teil = 1; a <= bis; a += MAX_JE_BLATT, teil++) {
      aus.push({ titel: s.titel + (teil > 1 ? " (" + teil + ")" : ""), abschnitt: s.abschnitt || null,
        von: a, bis: Math.min(bis, a + MAX_JE_BLATT - 1) });
    }
  });
  return aus;
}

// Eine PDF übernehmen. blatt(titel, inhalt, abschnitt) legt eine Seite
// an (abschnitt: Name aus den Lesezeichen oder null) (wird
// für jede OneNote-Seite gleich aufgerufen, damit bei einem Abbruch
// das Fertige bleibt). → { blaetter, seiten, alle }
export async function oneNoteUebernehmen(datei, blatt, fortschritt) {
  const daten = new Uint8Array(await datei.arrayBuffer());
  const lib = await pdfjs();
  const aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
  const doc = await aufgabe.promise;
  try {
    const n = Math.min(doc.numPages, MAX_SEITEN);
    if (fortschritt) fortschritt("Seiten werden gesucht …");
    const teile = await oneNoteSeiten(doc, n);
    const q = await pdfHochladen(daten);
    let fertig = 0;
    for (const t of teile) {
      const inhalt = [];
      let y = 0.04;
      for (let i = t.von; i <= t.bis; i++) {
        fertig++;
        if (fortschritt) fortschritt("Seite " + fertig + " von " + n);
        const s = await pdfSeiteHochladen(doc, i, q);
        // Verweise nur behalten, wenn ihr Ziel auf demselben Blatt liegt
        const l = (s.l || []).filter((x) => x.z >= t.von && x.z <= t.bis);
        inhalt.push({ t: "bild", u: s.u, q, s: i, n: datei.name, x: 0.04, y: Math.round(y * 10000) / 10000,
          b: 0.92, v: Math.round(s.v * 10000) / 10000, l, p: [] });
        y += 0.92 * s.v + 0.03;
      }
      await blatt(t.titel || "", inhalt, t.abschnitt || null);
    }
    return { blaetter: teile.length, seiten: n, alle: doc.numPages };
  } finally {
    aufgabe.destroy();
  }
}
