// =================================================================
//  NOTIZBÜCHER
//  Grosses Fenster ähnlich wie OneNote (Wunsch Patrick 7. Oktober
//  2026): links die Bücher, daneben die Seiten des gewählten Buchs,
//  rechts die Seite zum Zeichnen, Schreiben und Einfügen von Bildern
//  und PDFs (Seite.jsx). Geöffnet mit dem Buch-Knopf bei den Notizen
//  auf der Startseite; die normalen Notizen bleiben, wie sie sind.
//
//  Jeder ausser Externen darf alles bearbeiten, wie bei den Notizen.
//  Löschen fragt einmal nach; Neu, Umbenennen und Löschen von Büchern
//  und Seiten lassen sich mit Rückgängig zurücknehmen, ebenso alles,
//  was auf einer Seite geändert wurde (als ein Schritt je Besuch).
// =================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { wiederOeffner, teilMerken } from "../teile/wiederherstellen.js";
import { Symbol, EIMER, GROSS, KLEIN } from "../teile/zeichnen.jsx";
import Seite from "./Seite.jsx";
import { buecherLaden, seitenLaden, fehltTabelle, BUCHFARBEN, BUECHER, SEITEN, ABSCHNITTE,
  abschnitteLaden, padAbschnitteLaden,
  buchOeffnen, passwortSetzen, buecherZu, passwortText, fehltFunktion, padSeitenLaden, istPdf } from "./daten.js";
import { oneNoteUebernehmen, istOneNoteDatei } from "./onenote.js";

export const BUCH = "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6";
const STIFT = "M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z";
const PLUS = "M12 5v14M5 12h14";
const HOLEN = "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14";
// Fenster mit Leiste links: mit Strich = Leiste da, ohne = ganze Breite
const SPALTEN_WEG = "M4 5h16v14H4zM10 5v14M15 10l-2 2 2 2";
const SPALTEN_ZEIGEN = "M4 5h16v14H4zM10 5v14M13 10l2 2-2 2";
const SCHLOSS = "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2";

// Zuletzt offenes Buch und Seite, nur als Bequemlichkeit auf dem Gerät
const MERKEN = "hofer.notizbuch";
function gemerkt() { try { return JSON.parse(localStorage.getItem(MERKEN) || "{}") || {}; } catch (f) { return {}; } }
function merken(o) { try { localStorage.setItem(MERKEN, JSON.stringify(o)); } catch (f) { /* egal */ } }

// Bücher, die mit dem Passwort geöffnet sind, solange die Notizbücher
// offen sind (gross oder klein). Geht das Fenster ganz zu, sperrt die
// Datenbank sie wieder.
const offeneBuecher = new Set();
function allesZu() {
  // Etwas später: Die offene Seite speichert beim Schliessen noch ihren
  // letzten Stand, das ginge nach dem Sperren nicht mehr
  if (offeneBuecher.size) setTimeout(() => { if (!offeneBuecher.size) buecherZu(); }, 2500);
  offeneBuecher.clear();
}

// ---------- Kleines Fenster ----------
// Verkleinert schwebt das Notizbuch als Feld über der App, lässt sich
// am Kopf verschieben und an Rändern und Ecken in der Grösse ziehen
// und bleibt beim Wechsel auf andere Seiten der App offen (Wunsch
// Patrick 7. Oktober 2026). Es ist kein .dialog-huelle: Die App bleibt
// daneben bedienbar, und Escape oder Zurück schliessen es nicht.
let schwebe = null;

function schwebendZu() {
  if (!schwebe) return;
  const { el, wurzel, weg } = schwebe;
  schwebe = null;
  document.removeEventListener("pointerdown", weg, true);
  el.remove();
  queueMicrotask(() => wurzel.unmount());
}

function schwebendOeffnen() {
  schwebendZu();
  const el = document.createElement("div");
  el.className = "nb-schwebend";
  // Strg + Z und Einfügen gelten dem kleinen Notizbuch, wenn man
  // zuletzt hineingetippt hat (das alte Programm fragt data-aktiv ab)
  const weg = (e) => { el.dataset.aktiv = el.contains(e.target) ? "1" : ""; };
  document.addEventListener("pointerdown", weg, true);
  const wurzel = createRoot(el);
  schwebe = { el, wurzel, weg };
  wurzel.render(<Notizbuecher schwebend huelle={() => el}
    zu={() => { schwebendZu(); allesZu(); }}
    umschalten={() => { schwebendZu(); grossOeffnen(); }} />);
  document.body.appendChild(el);
}

function grossOeffnen() {
  let huelle = null;
  let verkleinert = false;
  const zu = fensterOeffnen((zu0) => <Notizbuecher zu={zu0} huelle={() => huelle}
    umschalten={() => { verkleinert = true; zu0(); schwebendOeffnen(); }} />,
  () => { if (!verkleinert) allesZu(); }, "nb-huelle", { art: "notizbuch" });
  const alle = document.querySelectorAll(".dialog-huelle.nb-huelle");
  huelle = alle[alle.length - 1];
  return zu;
}

// Der Buch-Knopf: ist das kleine Notizbuch offen, wird es wieder gross
export function notizbuecherOeffnen() {
  schwebendZu();
  grossOeffnen();
}

// Pad Mode: nur die Bücher, die dem Park der Maschine zugewiesen sind,
// nur zum Lesen (Wunsch Patrick 15. Oktober 2026). Kein kleines
// Fenster und kein Merken für nach dem Neuladen.
// maschine: das Buch geht beim Abschnitt dieser Maschine auf, wenn es
// einen gibt, der ihre Nummer oder ihren Namen trägt (Wunsch Patrick
// 19. Oktober 2026: Handbücher und Schemas auch in den Notizbüchern).
export function notizbuecherFuerPark(parkId, titel, maschine) {
  let huelle = null;
  fensterOeffnen((zu0) => <Notizbuecher zu={zu0} huelle={() => huelle} park={parkId} titel={titel} maschine={maschine} />,
  () => allesZu(), "nb-huelle nb-huelle--pad");
  const alle = document.querySelectorAll(".dialog-huelle.nb-huelle");
  huelle = alle[alle.length - 1];
}

// Bücher eines Parks für die Kachel im Pad; ohne SQL einfach keine
export async function buecherFuerPark(parkId) {
  if (!parkId) return [];
  try {
    return ((await buecherLaden()) || []).filter((b) => Array.isArray(b.parks) && b.parks.indexOf(parkId) !== -1);
  } catch (e) {
    return [];
  }
}

// Nach dem Neuladen wieder offen, gross oder klein, mit demselben Buch
// und derselben Seite (MERKEN). Bücher mit Passwort sind dann wieder zu.
wiederOeffner("notizbuch", () => notizbuecherOeffnen());
teilMerken("notizbuchKlein", () => (schwebe ? true : null), () => schwebendOeffnen(), true);

// Lage und Grösse des kleinen Fensters, je Person gemerkt
const RAHMEN = "notizbuch_rahmen";
const RAHMEN_MIN_B = 320, RAHMEN_MIN_H = 260;
function rahmenEinpassen(r) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.round(Math.min(vw - 8, Math.max(Math.min(RAHMEN_MIN_B, vw - 8), r.w)));
  const h = Math.round(Math.min(vh - 8, Math.max(Math.min(RAHMEN_MIN_H, vh - 8), r.h)));
  const x = Math.round(Math.min(vw - w - 4, Math.max(4, r.x)));
  const y = Math.round(Math.min(vh - h - 4, Math.max(4, r.y)));
  return { x, y, w, h };
}
function rahmenLesen() {
  const t = String((alt.einstellungWert && alt.einstellungWert(RAHMEN, "")) || "").split(",").map(Number);
  const vw = window.innerWidth, vh = window.innerHeight;
  if (t.length === 4 && t.every((n) => isFinite(n) && n >= 0)) {
    return rahmenEinpassen({ x: t[0], y: t[1], w: t[2], h: t[3] });
  }
  // Erstes Mal: unten rechts, gut halb so gross wie der Bildschirm
  const w = Math.min(620, vw - 32), h = Math.min(560, vh - 96);
  return rahmenEinpassen({ x: vw - w - 16, y: vh - h - 16, w, h });
}
const RAENDER = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

const seitenName = (s) => (s.titel || "").trim() || "Ohne Titel";

// Breite der Spalten Bücher und Seiten: mit dem Strich dazwischen
// ziehen, je Person gemerkt (Wunsch Patrick 7. Oktober 2026)
const SPALTEN = "notizbuch_spalten";
const SPALTE_MIN = 120, SPALTE_MAX = 480;
function spaltenLesen() {
  const t = String((alt.einstellungWert && alt.einstellungWert(SPALTEN, "")) || "").split(",").map(Number);
  const gut = (n) => (n >= SPALTE_MIN && n <= SPALTE_MAX ? n : 220);
  return [gut(t[0]), gut(t[1])];
}

// Gehört der Abschnitt zu dieser Maschine? Vergleich ohne Leerzeichen,
// Striche und Gross-/Kleinschreibung: „K-2001“ passt zu „k 2001 Elektro“.
// Zuerst die Nummer, dann der Name.
const flach = (t) => String(t || "").toLowerCase().replace(/[\s._\-–]+/g, "");
function abschnittFuerMaschine(abschnitte, m) {
  const proben = [m.machine_number, m.name].map(flach).filter((x) => x.length >= 2);
  for (const p of proben) {
    const a = (abschnitte || []).find((x) => flach(x.name).includes(p));
    if (a) return a;
  }
  return null;
}

function Notizbuecher({ zu, huelle, schwebend, umschalten, park, titel, maschine }) {
  // Mit park (Pad Mode) nur lesen
  const darf = !park && !(alt.istExtern && alt.istExtern());
  const [rahmen, setRahmen] = useState(() => (schwebend ? rahmenLesen() : null));
  const rahmenRef = useRef(rahmen);
  rahmenRef.current = rahmen;
  // Wird das Browserfenster kleiner, bleibt das Notizbuch ganz sichtbar
  useEffect(() => {
    if (!schwebend) return undefined;
    const passen = () => setRahmen((r) => rahmenEinpassen(r));
    window.addEventListener("resize", passen);
    return () => window.removeEventListener("resize", passen);
  }, [schwebend]);
  // Am Kopf verschieben (rand = null) oder an Rand und Ecke ziehen
  const rahmenZiehen = (e, rand) => {
    if (!schwebend || e.button > 0) return;
    if (!rand && e.target.closest("button, input, select, a")) return;
    e.preventDefault();
    const ziel = e.currentTarget;
    try { ziel.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const r0 = rahmenRef.current, sx = e.clientX, sy = e.clientY;
    const vw = window.innerWidth, vh = window.innerHeight;
    huelle().classList.add("nb-schwebend--zieht");
    const bewegt = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!rand) { setRahmen(rahmenEinpassen({ ...r0, x: r0.x + dx, y: r0.y + dy })); return; }
      let { x, y, w, h } = r0;
      const minB = Math.min(RAHMEN_MIN_B, vw - 8), minH = Math.min(RAHMEN_MIN_H, vh - 8);
      if (rand.includes("e")) w = Math.min(vw - 4 - x, Math.max(minB, r0.w + dx));
      if (rand.includes("s")) h = Math.min(vh - 4 - y, Math.max(minH, r0.h + dy));
      if (rand.includes("w")) { const nx = Math.max(4, Math.min(r0.x + r0.w - minB, r0.x + dx)); w = r0.w + r0.x - nx; x = nx; }
      if (rand.includes("n")) { const ny = Math.max(4, Math.min(r0.y + r0.h - minH, r0.y + dy)); h = r0.h + r0.y - ny; y = ny; }
      setRahmen({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const fertig = () => {
      huelle().classList.remove("nb-schwebend--zieht");
      ziel.removeEventListener("pointermove", bewegt);
      ziel.removeEventListener("pointerup", fertig);
      ziel.removeEventListener("pointercancel", fertig);
      const r = rahmenRef.current;
      alt.einstellungSetzenWert(RAHMEN, [r.x, r.y, r.w, r.h].join(","));
    };
    ziel.addEventListener("pointermove", bewegt);
    ziel.addEventListener("pointerup", fertig);
    ziel.addEventListener("pointercancel", fertig);
  };
  // Mit dem Passwort geöffnete Bücher (für die Anzeige)
  const [offene, setOffene] = useState(() => [...offeneBuecher]);
  // Im Pad Mode (park) braucht ein zugewiesenes Buch kein Passwort
  // (Wunsch Patrick 15. Oktober 2026); ohne sql/notizbuch-pad-lesen.sql
  // bleibt es gesperrt wie bisher
  const [padOhneSql, setPadOhneSql] = useState(false);
  const istZu = (b) => !!(b && b.gesperrt && offene.indexOf(b.id) === -1 && (!park || padOhneSql));
  const [spalten, setSpalten] = useState(spaltenLesen);
  // Vollbild: Bücher und Seiten links weg, die Seite bekommt die ganze Breite
  const [vollbild, setVollbild] = useState(false);
  const spaltenRef = useRef(spalten);
  spaltenRef.current = spalten;
  const spalteZiehen = (e, nr) => {
    e.preventDefault();
    const ziel = e.currentTarget;
    try { ziel.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const start = e.clientX, breite = spaltenRef.current[nr];
    ziel.classList.add("aktiv");
    const bewegt = (ev) => {
      const neu = spaltenRef.current.slice();
      neu[nr] = Math.round(Math.max(SPALTE_MIN, Math.min(SPALTE_MAX, breite + ev.clientX - start)));
      setSpalten(neu);
    };
    const fertig = () => {
      ziel.classList.remove("aktiv");
      ziel.removeEventListener("pointermove", bewegt);
      ziel.removeEventListener("pointerup", fertig);
      ziel.removeEventListener("pointercancel", fertig);
      alt.einstellungSetzenWert(SPALTEN, spaltenRef.current.join(","));
    };
    ziel.addEventListener("pointermove", bewegt);
    ziel.addEventListener("pointerup", fertig);
    ziel.addEventListener("pointercancel", fertig);
  };
  const [buecher, setBuecher] = useState(null);
  const [fehlt, setFehlt] = useState(false);
  const [buchId, setBuchId] = useState(() => gemerkt().buch || null);
  const [seiten, setSeiten] = useState(null);
  const [seiteId, setSeiteId] = useState(() => gemerkt().seite || null);
  // Abschnitte wie in OneNote (Wunsch Patrick 19. Oktober 2026): Buch →
  // Abschnitt → Seite. null heisst ohne Abschnitte (sql/notizbuch-
  // abschnitte.sql fehlt), dann alles wie vorher.
  const [abschnitte, setAbschnitte] = useState(null);
  const [abschnittId, setAbschnittId] = useState(() => gemerkt().abschnitt || null);
  const wahlRef = useRef({});
  wahlRef.current = { seite: seiteId, abschnitt: abschnittId };
  // Pad an einer Maschine: einmal zu ihrem Abschnitt springen
  const zielAb = useRef(null);

  const buecherNeu = useCallback(async (waehlen) => {
    try {
      let l = await buecherLaden();
      if (park) l = (l || []).filter((b) => Array.isArray(b.parks) && b.parks.indexOf(park) !== -1);
      let maschinenBuch = null;
      if (park && maschine && !waehlen) {
        for (const b of (l || [])) {
          const p0 = await padAbschnitteLaden(b.id, park);
          let ab = p0 && p0.abschnitte;
          if (!ab) { try { ab = await abschnitteLaden(b.id); } catch (f) { ab = null; } }
          const a = abschnittFuerMaschine(ab, maschine);
          if (a) { maschinenBuch = b.id; zielAb.current = a.id; break; }
        }
      }
      setBuecher(l || []);
      setBuchId((alt0) => {
        const w = maschinenBuch || waehlen || alt0;
        return (l || []).some((b) => b.id === w) ? w : ((l && l[0] && l[0].id) || null);
      });
    } catch (e) {
      if (fehltTabelle(e)) setFehlt(true);
      else alt.meldung("Notizbücher nicht geladen: " + alt.fehlertext(e), "fehler");
      setBuecher([]);
    }
  }, []);
  useEffect(() => { buecherNeu(); }, [buecherNeu]);

  const buchZu = istZu((buecher || []).find((b) => b.id === buchId));
  // Lädt Abschnitte und Seiten des Buchs. waehlen: diese Seite zeigen
  // (samt ihrem Abschnitt), abWaehlen: diesen Abschnitt
  const seitenNeu = useCallback(async (waehlen, abWaehlen) => {
    if (!buchId || buchZu) { setSeiten([]); setAbschnitte(null); return; }
    try {
      let l = null, ab;
      if (park && !padOhneSql) {
        const p0 = await padAbschnitteLaden(buchId, park);
        if (p0) { ab = p0.abschnitte; l = p0.seiten; }
        else {
          ab = null;
          try { l = (await padSeitenLaden(buchId, park)) || []; } catch (f) {
            if (!fehltFunktion(f) && !/notizbuch_pad_seiten/i.test(String(f && f.message))) throw f;
            setPadOhneSql(true); return;
          }
        }
      }
      if (!l) l = (await seitenLaden(buchId)) || [];
      if (ab === undefined) ab = await abschnitteLaden(buchId);
      // Ein Buch ohne Abschnitt (von einer älteren Fassung angelegt)
      // bekommt einen mit seinem Namen, wie beim Umstellen
      if (ab && !ab.length && darf) {
        const b0 = (buecher || []).find((x) => x.id === buchId);
        const r = await alt.db.from(ABSCHNITTE).insert({ buch_id: buchId, name: (b0 && b0.name) || "Neuer Abschnitt",
          farbe: (b0 && b0.farbe) || null, reihenfolge: 1 }).select("*");
        if (!r.error && r.data && r.data[0]) ab = [r.data[0]];
      }
      if (ab && !ab.length) ab = null;
      const abVon = (x) => (!ab ? null : (ab.some((a0) => a0.id === x.abschnitt_id) ? x.abschnitt_id : ab[0].id));
      let abNeu = null;
      if (ab) {
        const w = l.find((x) => x.id === waehlen);
        const vorher = abWaehlen || zielAb.current || wahlRef.current.abschnitt;
        zielAb.current = null;
        abNeu = w ? abVon(w) : (ab.some((a0) => a0.id === vorher) ? vorher : ab[0].id);
      }
      const drin = ab ? l.filter((x) => abVon(x) === abNeu) : l;
      const sw = waehlen || wahlRef.current.seite;
      setAbschnitte(ab);
      setAbschnittId(abNeu);
      setSeiten(l);
      setSeiteId(drin.some((x) => x.id === sw) ? sw : ((drin[0] && drin[0].id) || null));
    } catch (e) {
      alt.meldung("Seiten nicht geladen: " + alt.fehlertext(e), "fehler");
      setSeiten([]);
    }
    // buecher nur für den Namen eines nachträglichen Abschnitts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buchId, buchZu, park, padOhneSql]);
  // Seite gehört zu: ohne passende abschnitt_id zum ersten Abschnitt
  const abschnittVon = (x) => (!abschnitte ? null
    : (abschnitte.some((a0) => a0.id === x.abschnitt_id) ? x.abschnitt_id : abschnitte[0].id));
  const sichtbar = (seiten || []).filter((x) => !abschnitte || abschnittVon(x) === abschnittId);
  const abschnittWaehlen = (id) => {
    if (id === abschnittId) return;
    const drin = (seiten || []).filter((x) => abschnittVon(x) === id);
    setAbschnittId(id);
    setSeiteId((drin[0] && drin[0].id) || null);
  };
  useEffect(() => { setSeiten(null); seitenNeu(); }, [seitenNeu]);
  useEffect(() => { if (buchId) merken({ buch: buchId, abschnitt: abschnittId, seite: seiteId }); }, [buchId, abschnittId, seiteId]);

  // ---------- Bücher ----------
  // Parks, in denen das Buch im Pad Mode an jeder Maschine zu sehen
  // ist (Wunsch Patrick 15. Oktober 2026, sql/notizbuch-parks.sql)
  const buchDialog = async (b) => {
    let parks = [];
    try { parks = (await alt.ladeParks(false, true)) || []; } catch (f) { /* ohne Parks */ }
    return alt.dialogFelder({
    titel: b ? "Notizbuch bearbeiten" : "Neues Notizbuch",
    felder: [
      { name: "name", label: "Name", wert: b ? b.name : "", pflicht: true, platzhalter: "z. B. Besprechungen" },
      // Farbwähler des Geräts mit Pipette statt einer Liste (Wunsch Patrick 7. Oktober 2026)
      { name: "farbe", label: "Farbe", typ: "color",
        wert: b ? b.farbe : BUCHFARBEN[(buecher || []).length % BUCHFARBEN.length][0] },
      { name: "parks", label: "Im Pad Mode zeigen bei", mehrfach: parks.map((p) => [p.id, p.name]),
        wert: (b && b.parks) || [], hinweis: "Nur lesen, an allen Maschinen der gewählten Parks." }],
    bestaetigen: b ? "Speichern" : "Anlegen" });
  };
  // Ohne sql/notizbuch-parks.sql gibt es die Spalte noch nicht: dann
  // ohne Parks noch einmal, mit Hinweis
  const fehltParks = (e) => /parks/i.test(String((e && (e.message || e.details)) || ""));
  const ohneParksHinweis = () => alt.meldung("Parks zuweisen geht, sobald die Datei notizbuch-parks.sql "
    + "in Supabase ausgeführt ist.", "warn");
  const mitParks = (daten, w) => ({ ...daten, parks: w.parks || [] });

  const buchNeu = async () => {
    const w = await buchDialog(null);
    if (!w) return;
    const reihenfolge = (buecher || []).reduce((m, b) => Math.max(m, b.reihenfolge || 0), 0) + 1;
    let { data, error } = await alt.db.from(BUECHER)
      .insert(mitParks({ name: w.name, farbe: w.farbe, reihenfolge }, w)).select("id");
    if (error && fehltParks(error)) {
      ohneParksHinweis();
      ({ data, error } = await alt.db.from(BUECHER).insert({ name: w.name, farbe: w.farbe, reihenfolge }).select("id"));
    }
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = data && data[0] && data[0].id;
    if (!id) return;
    alt.merkeSchritt("Neues Notizbuch", [alt.rueckWeg(SEITEN, { buch_id: id }),
      alt.rueckWeg(ABSCHNITTE, { buch_id: id }), alt.rueckWeg(BUECHER, { id })]);
    // Ein neues Buch hat gleich einen Abschnitt mit einer leeren Seite,
    // wie in OneNote (ohne SQL nur die Seite)
    const a = await alt.db.from(ABSCHNITTE).insert({ buch_id: id, name: "Neuer Abschnitt 1", farbe: w.farbe, reihenfolge: 1 }).select("id");
    const abId = !a.error && a.data && a.data[0] ? a.data[0].id : null;
    const s = await alt.db.from(SEITEN).insert(Object.assign({ buch_id: id, titel: "", reihenfolge: 1 },
      abId ? { abschnitt_id: abId } : {})).select("id");
    setAbschnittId(abId);
    setSeiteId((s.data && s.data[0] && s.data[0].id) || null);
    await buecherNeu(id);
  };

  const buchBearbeiten = async (b) => {
    const w = await buchDialog(b);
    if (!w) return;
    const daten = { name: w.name, farbe: w.farbe, geaendert_am: new Date().toISOString() };
    let { error } = await alt.db.from(BUECHER).update(mitParks(daten, w)).eq("id", b.id);
    let mit = true;
    if (error && fehltParks(error)) {
      ohneParksHinweis(); mit = false;
      ({ error } = await alt.db.from(BUECHER).update(daten).eq("id", b.id));
    }
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const vorher = { name: b.name, farbe: b.farbe };
    alt.merkeSchritt("Notizbuch bearbeiten", alt.rueckSetz(BUECHER,
      mit ? mitParks(vorher, { parks: b.parks }) : vorher, { id: b.id }));
    buecherNeu();
  };

  const buchLoeschen = async (b) => {
    const ok = await alt.nachfragen({ titel: "Notizbuch löschen?",
      text: "„" + b.name + "“ mit allen Seiten wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    // Für Rückgängig: Buch und alle Seiten samt Inhalt sichern
    const buch = await alt.rueckSichern(BUECHER, { id: b.id });
    const blaetter = await alt.rueckSichern(SEITEN, { buch_id: b.id });
    const teile = abschnitte ? await alt.rueckSichern(ABSCHNITTE, { buch_id: b.id }) : [];
    const { error } = await alt.db.from(BUECHER).delete().eq("id", b.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    // Die Seiten gehen in der Datenbank mit; ausdrücklich, falls nicht
    await alt.db.from(SEITEN).delete().eq("buch_id", b.id);
    alt.merkeSchritt("Notizbuch löschen", [alt.rueckRein(BUECHER, buch),
      ...(teile.length ? [alt.rueckRein(ABSCHNITTE, teile)] : []), alt.rueckRein(SEITEN, blaetter)]);
    alt.meldung("Gelöscht.");
    setSeiteId(null);
    buecherNeu();
  };

  // ---------- Passwort ----------
  const [pw, setPw] = useState("");
  const [pwFehler, setPwFehler] = useState("");
  const [pwLaeuft, setPwLaeuft] = useState(false);
  useEffect(() => { setPw(""); setPwFehler(""); }, [buchId]);
  const ohneSql = () => alt.meldung("Das Sperren mit Passwort geht, sobald die Datei "
    + "notizbuch-passwort.sql in Supabase ausgeführt ist.", "warn");
  const freigeben = (id) => { offeneBuecher.add(id); setOffene([...offeneBuecher]); };

  const mitPasswortOeffnen = async (e) => {
    if (e) e.preventDefault();
    if (!buchId || pwLaeuft) return;
    setPwLaeuft(true); setPwFehler("");
    try {
      const r = await buchOeffnen(buchId, pw.trim());
      if (r === "ok") { setPw(""); setSeiteId(null); freigeben(buchId); }
      else setPwFehler(passwortText(r) || "Nicht geöffnet.");
    } catch (f) {
      if (fehltFunktion(f)) ohneSql();
      else setPwFehler(alt.fehlertext(f));
    }
    setPwLaeuft(false);
  };

  // Sperren, Passwort ändern oder Sperre aufheben. Ist das Buch
  // gesperrt, braucht es immer das alte Passwort, auch für Admins; ein
  // vergessenes Passwort setzt ein Admin unter Einstellungen →
  // Notizbücher neu (Wunsch Patrick 7. Oktober 2026).
  const passwortDialog = async (b) => {
    const felder = [];
    if (b.gesperrt) felder.push({ name: "alt", label: "Bisheriges Passwort", typ: "password", pflicht: true });
    felder.push({ name: "neu", label: b.gesperrt ? "Neues Passwort" : "Passwort", typ: "password",
      pflicht: !b.gesperrt, hinweis: b.gesperrt ? "Leer lassen hebt die Sperre auf." : "Mindestens 4 Zeichen." });
    felder.push({ name: "nochmals", label: "Passwort nochmals", typ: "password" });
    const w = await alt.dialogFelder({
      titel: b.gesperrt ? "Passwort für „" + b.name + "“" : "„" + b.name + "“ mit Passwort sperren",
      text: b.gesperrt ? "Passwort vergessen? Ein Admin setzt es unter Einstellungen → Notizbücher neu."
        : "Die Seiten sieht danach nur, wer das Passwort eingibt, auch kein Admin. Wer es vergisst, fragt einen Admin.",
      felder, bestaetigen: b.gesperrt ? "Speichern" : "Sperren" });
    if (!w) return;
    if (w.neu !== w.nochmals) { alt.meldung("Die beiden Passwörter sind nicht gleich.", "warn"); return; }
    if (w.neu && w.neu.length < 4) { alt.meldung("Das Passwort braucht mindestens 4 Zeichen.", "warn"); return; }
    try {
      const r = await passwortSetzen(b.id, w.alt || null, w.neu || "");
      if (r !== "ok") { alt.meldung(passwortText(r) || "Nicht gespeichert.", "fehler"); return; }
      if (w.neu) { freigeben(b.id); alt.meldung(b.gesperrt ? "Passwort geändert." : "Notizbuch gesperrt.", "gut"); }
      else alt.meldung("Sperre aufgehoben.", "gut");
      buecherNeu();
    } catch (f) {
      if (fehltFunktion(f)) ohneSql();
      else alt.meldung(alt.fehlertext(f), "fehler");
    }
  };

  // ---------- Seiten ----------
  const seiteNeu = async () => {
    if (!buchId) return;
    const reihenfolge = (seiten || []).reduce((m, s) => Math.max(m, s.reihenfolge || 0), 0) + 1;
    const { data, error } = await alt.db.from(SEITEN)
      .insert(Object.assign({ buch_id: buchId, titel: "", reihenfolge }, abschnittId ? { abschnitt_id: abschnittId } : {})).select("id");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = data && data[0] && data[0].id;
    if (!id) return;
    alt.merkeSchritt("Neue Notizbuch-Seite", alt.rueckWeg(SEITEN, { id }));
    await seitenNeu(id);
  };

  const seiteLoeschen = async (s) => {
    const ok = await alt.nachfragen({ titel: "Seite löschen?",
      text: "„" + seitenName(s) + "“ wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    // Erst wegwechseln, damit die offene Seite ihren Stand noch speichert
    const rest = sichtbar.filter((x) => x.id !== s.id);
    setSeiteId(rest[0] ? rest[0].id : null);
    await new Promise((r) => setTimeout(r, 50));
    const sicherung = await alt.rueckSichern(SEITEN, { id: s.id });
    const { error } = await alt.db.from(SEITEN).delete().eq("id", s.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Notizbuch-Seite löschen", alt.rueckRein(SEITEN, sicherung));
    alt.meldung("Gelöscht.");
    seitenNeu();
  };

  // ---------- Abschnitte ----------
  const abschnittDialog = (a) => alt.dialogFelder({
    titel: a ? "Abschnitt bearbeiten" : "Neuer Abschnitt",
    felder: [
      { name: "name", label: "Name", wert: a ? a.name : "", pflicht: true, platzhalter: "z. B. Rüsten" },
      { name: "farbe", label: "Farbe", typ: "color",
        wert: (a && a.farbe) || BUCHFARBEN[((abschnitte || []).length + 1) % BUCHFARBEN.length][0] }],
    bestaetigen: a ? "Speichern" : "Anlegen" });

  const abschnittNeu = async () => {
    if (!buchId || !abschnitte) return;
    const w = await abschnittDialog(null);
    if (!w) return;
    const reihenfolge = abschnitte.reduce((m, a) => Math.max(m, a.reihenfolge || 0), 0) + 1;
    const r = await alt.db.from(ABSCHNITTE).insert({ buch_id: buchId, name: w.name, farbe: w.farbe, reihenfolge }).select("id");
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    const id = r.data && r.data[0] && r.data[0].id;
    if (!id) return;
    // Ein neuer Abschnitt hat gleich eine leere Seite, wie in OneNote
    const sr = (seiten || []).reduce((m, x) => Math.max(m, x.reihenfolge || 0), 0) + 1;
    const s0 = await alt.db.from(SEITEN).insert({ buch_id: buchId, abschnitt_id: id, titel: "", reihenfolge: sr }).select("id");
    alt.merkeSchritt("Neuer Abschnitt", [alt.rueckWeg(SEITEN, { abschnitt_id: id }), alt.rueckWeg(ABSCHNITTE, { id })]);
    await seitenNeu((s0.data && s0.data[0] && s0.data[0].id) || null, id);
  };

  const abschnittBearbeiten = async (a) => {
    const w = await abschnittDialog(a);
    if (!w) return;
    const { error } = await alt.db.from(ABSCHNITTE)
      .update({ name: w.name, farbe: w.farbe, geaendert_am: new Date().toISOString() }).eq("id", a.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Abschnitt bearbeiten", alt.rueckSetz(ABSCHNITTE, { name: a.name, farbe: a.farbe }, { id: a.id }));
    seitenNeu();
  };

  const abschnittLoeschen = async (a) => {
    const n = (seiten || []).filter((x) => abschnittVon(x) === a.id).length;
    const ok = await alt.nachfragen({ titel: "Abschnitt löschen?",
      text: "„" + (a.name || "Ohne Name") + "“" + (n ? (n === 1 ? " mit 1 Seite" : " mit allen " + n + " Seiten") : "") + " wird gelöscht.",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    const rest = abschnitte.filter((x) => x.id !== a.id);
    // Erst wegwechseln, damit die offene Seite ihren Stand noch speichert
    setSeiteId(null);
    await new Promise((r) => setTimeout(r, 50));
    const teil = await alt.rueckSichern(ABSCHNITTE, { id: a.id });
    // Seiten ohne passende abschnitt_id zeigt der erste Abschnitt: die gehen mit
    const ids = (seiten || []).filter((x) => abschnittVon(x) === a.id).map((x) => x.id);
    const blaetter = [];
    for (const id of ids) blaetter.push(...(await alt.rueckSichern(SEITEN, { id })));
    const { error } = await alt.db.from(ABSCHNITTE).delete().eq("id", a.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    for (const id of ids) await alt.db.from(SEITEN).delete().eq("id", id);
    alt.merkeSchritt("Abschnitt löschen", [alt.rueckRein(ABSCHNITTE, teil), ...(blaetter.length ? [alt.rueckRein(SEITEN, blaetter)] : [])]);
    alt.meldung("Gelöscht.");
    seitenNeu(null, rest[0] && rest[0].id);
  };

  // ---------- Aus OneNote übernehmen (src/notizbuch/onenote.js) ----------
  const [holt, setHolt] = useState("");
  const SO_EXPORTIEREN = "In OneNote am Computer: Datei → Exportieren → Abschnitt → PDF → Exportieren, für jeden Abschnitt. "
    + "Dann alle PDFs zusammen hier wählen, jede wird ein Abschnitt.";
  const OHNE_ABSCHNITTE = "In der PDF stehen keine Abschnitte, darum ist alles in einem Abschnitt. "
    + "OneNote schreibt sie nicht in die PDF, wenn man das ganze Notizbuch exportiert. "
    + "So kommen die Abschnitte mit: in OneNote jeden Abschnitt einzeln exportieren "
    + "(Datei → Exportieren → Abschnitt → PDF), dann hier alle PDFs zusammen wählen.";
  // Das Dateifeld entsteht erst beim Tippen, damit im Fenster kein
  // verstecktes Feld vor den anderen steht
  const oneNoteWaehlen = () => {
    const feld = document.createElement("input");
    feld.type = "file"; feld.multiple = true;
    feld.accept = "application/pdf,.pdf,.one,.onepkg";
    feld.onchange = oneNoteGewaehlt;
    feld.click();
  };
  const oneNoteGewaehlt = async (e) => {
    const dateien = Array.from((e.target && e.target.files) || []);
    if (e.target) e.target.value = "";
    if (!dateien.length || holt) return;
    const pdfs = dateien.filter(istPdf);
    if (!pdfs.length) {
      await alt.auswahlDialog("Diese Datei geht nicht", [{ wert: "ok", text: "OK" }],
        (dateien.some(istOneNoteDatei) ? "OneNote-Dateien (.one, .onepkg) kann der Browser nicht lesen. "
          : "Es geht nur PDF. ") + SO_EXPORTIEREN);
      return;
    }
    // Wohin: neues Buch (Name aus der Datei) oder ins offene Buch
    // Mehrere PDFs (ein Abschnitt je PDF): zuerst ein neues Buch mit
    // allen als Abschnitte
    let ziel = pdfs.length > 1 ? "eins" : "neu";
    if (pdfs.length > 1 || (buch && !istZu(buch))) {
      ziel = await alt.auswahlDialog("Aus OneNote übernehmen", [].concat(
        pdfs.length > 1 ? [{ wert: "eins", text: "Ein neues Notizbuch, jede PDF ein Abschnitt" }] : [],
        [{ wert: "neu", text: pdfs.length > 1 ? "Je ein neues Notizbuch" : "Als neues Notizbuch" }],
        buch && !istZu(buch) ? [{ wert: "hier", text: "In „" + buch.name + "“" + (pdfs.length > 1 ? ", jede PDF ein Abschnitt" : "") }] : []),
      "Jede OneNote-Seite wird eine Seite, ihr Inhalt kommt als Ausdruck darauf.");
      if (!ziel) return;
    }
    let einsName = "";
    if (ziel === "eins") {
      const w = await alt.dialogFelder({ titel: "Name des Notizbuchs",
        felder: [{ name: "name", label: "Name", wert: "OneNote", pflicht: true }], bestaetigen: "Übernehmen" });
      if (!w) return;
      einsName = String(w.name || "").trim() || "OneNote";
    }
    let letztesBuch = null, ersteSeite = null, blaetter = 0, rfEins = 0;
    const schritte = [];
    let reihe = (buecher || []).reduce((m, b) => Math.max(m, b.reihenfolge || 0), 0);
    // Abschnitte: aus den Lesezeichen der PDF, sonst einer mit dem
    // Namen der Datei (wie beim Umstellen der alten Bücher)
    let ohneAb = false, abZahl = 0, keineAbschnitte = false;
    const abHolen = async (id, liste, name) => {
      if (ohneAb) return null;
      if (liste.has(name)) return liste.get(name);
      const reihenfolge = ++abZahl + (ziel === "hier" && abschnitte ? abschnitte.length : 0);
      const r = await alt.db.from(ABSCHNITTE).insert({ buch_id: id, name, reihenfolge,
        farbe: BUCHFARBEN[(reihenfolge - 1) % BUCHFARBEN.length][0] }).select("id");
      if (r.error) {
        if (fehltTabelle(r.error)) { ohneAb = true; return null; }
        throw r.error;
      }
      const aid = r.data && r.data[0] && r.data[0].id;
      liste.set(name, aid);
      if (ziel === "hier") schritte.push(alt.rueckWeg(SEITEN, { abschnitt_id: aid }), alt.rueckWeg(ABSCHNITTE, { id: aid }));
      return aid;
    };
    try {
      for (const d of pdfs) {
        let id = buchId, rf = (seiten || []).reduce((m, x) => Math.max(m, x.reihenfolge || 0), 0);
        // Weitere PDFs ins selbe Buch: Reihenfolge weiterzählen
        if (ziel !== "neu" && letztesBuch) { id = letztesBuch; rf = rfEins; }
        else if (ziel === "neu" || ziel === "eins") {
          const name = ziel === "eins" ? einsName : (d.name.replace(/\.pdf$/i, "").trim() || "OneNote");
          const farbe = BUCHFARBEN[(reihe) % BUCHFARBEN.length][0];
          const r = await alt.db.from(BUECHER).insert({ name, farbe, reihenfolge: ++reihe }).select("id");
          if (r.error) throw r.error;
          id = r.data && r.data[0] && r.data[0].id;
          if (!id) throw new Error("Notizbuch nicht angelegt");
          schritte.push(alt.rueckWeg(SEITEN, { buch_id: id }), alt.rueckWeg(ABSCHNITTE, { buch_id: id }), alt.rueckWeg(BUECHER, { id }));
          rf = 0; abZahl = 0;
        }
        letztesBuch = id;
        const dateiName = d.name.replace(/\.pdf$/i, "").trim() || "OneNote";
        const liste = new Map();
        const r = await oneNoteUebernehmen(d, async (titel, inhalt, abschnitt) => {
          const aid = await abHolen(id, liste, abschnitt || dateiName);
          const a = await alt.db.from(SEITEN).insert(Object.assign({ buch_id: id, titel, reihenfolge: ++rf, inhalt },
            aid ? { abschnitt_id: aid } : {})).select("id");
          if (a.error) throw a.error;
          const sid = a.data && a.data[0] && a.data[0].id;
          if (sid && ziel === "hier" && !aid) schritte.push(alt.rueckWeg(SEITEN, { id: sid }));
          if (!ersteSeite) ersteSeite = sid;
          blaetter++;
        }, (t) => setHolt(d.name + ": " + t));
        rfEins = rf;
        if (pdfs.length === 1 && !r.abschnitte) keineAbschnitte = true;
        if (r.alle > r.seiten) alt.meldung("Nur die ersten " + r.seiten + " von " + r.alle + " PDF-Seiten übernommen.", "warn");
      }
      alt.meldung(blaetter === 1 ? "1 Seite übernommen." : blaetter + " Seiten übernommen.", "gut");
    } catch (f) {
      alt.fehlerMerken && alt.fehlerMerken("OneNote übernehmen", alt.fehlertext(f));
      alt.meldung("Übernehmen ging nicht: " + alt.fehlertext(f), "fehler");
    } finally {
      setHolt("");
    }
    if (schritte.length) alt.merkeSchritt("Aus OneNote übernommen", schritte);
    if (!letztesBuch) return;
    // Zum Übernommenen wechseln: neues Buch mit seiner ersten Seite
    if (ziel !== "hier") { setSeiteId(ersteSeite); setAbschnittId(null); await buecherNeu(letztesBuch); }
    else await seitenNeu(ersteSeite);
    if (keineAbschnitte) await alt.auswahlDialog("Ohne Abschnitte", [{ wert: "ok", text: "OK" }], OHNE_ABSCHNITTE);
  };

  // Der Titel steht auf der Seite selbst; die Liste zieht mit
  const titelGeaendert = useCallback((id, titel) => {
    setSeiten((l) => (l || []).map((s) => (s.id === id ? { ...s, titel } : s)));
  }, []);

  const buch = (buecher || []).find((b) => b.id === buchId);

  // Abschnitte als Liste: im Baum unter dem Buch (breit) oder als Leiste
  // oben (schmal, Handy); attr unterscheidet die beiden für die Tests
  const abschnittListe = (attr) => {
    const b = buch;
    return <>
      {(abschnitte || []).map((a) => {
        const aktiv = a.id === abschnittId;
        return <div key={a.id} className={"nb-eintrag nb-eintrag--ab" + (aktiv ? " aktiv" : "")}
          style={{ "--f": a.farbe || (b && b.farbe) || "var(--marke)" }}>
          <button type="button" className="nb-eintrag__name" {...{ ["data-" + attr]: a.id }}
            onClick={() => abschnittWaehlen(a.id)}>
            <span className="nb-reiter" /><span className="nb-eintrag__text">{a.name || "Ohne Name"}</span></button>
          {darf && aktiv && <>
            <button type="button" className="nb-mini" aria-label="Abschnitt bearbeiten" title="Umbenennen, Farbe"
              data-nbabbearb="" onClick={() => abschnittBearbeiten(a)}><Symbol d={STIFT} /></button>
            {abschnitte.length > 1 && <button type="button" className="nb-mini nb-mini--weg" aria-label="Abschnitt löschen"
              title="Abschnitt mit allen Seiten löschen" data-nbabweg="" onClick={() => abschnittLoeschen(a)}><Symbol d={EIMER} /></button>}
          </>}
        </div>;
      })}
      {darf && <button type="button" className="nb-ab-neu" data-nb={attr === "nbabschnitt" ? "abschnitt-neu" : "abschnitt-neu-l"}
        title="Neuer Abschnitt" onClick={abschnittNeu}><Symbol d={PLUS} /><span>Abschnitt</span></button>}
    </>;
  };

  let haupt;
  if (!fehlt && istZu(buch)) {
    haupt = <form className="nb-fehlt nb-schloss" onSubmit={mitPasswortOeffnen} data-nbschloss="">
      <span className="nb-schloss__zeichen"><Symbol d={SCHLOSS} /></span>
      <p><b>„{buch.name}“ ist gesperrt.</b></p>
      <p>Passwort eingeben, um die Seiten zu sehen.</p>
      <input type="password" className="nb-schloss__feld" value={pw} autoComplete="off" aria-label="Passwort"
        data-nbpasswort="" onChange={(e) => { setPw(e.target.value); setPwFehler(""); }} autoFocus />
      {pwFehler && <p className="nb-schloss__fehler" role="alert">{pwFehler}</p>}
      <button type="submit" className="knopf knopf--haupt" disabled={pwLaeuft || !pw.trim()}>Öffnen</button>
    </form>;
  } else if (fehlt) {
    haupt = <div className="nb-fehlt"><p><b>Notizbücher sind noch nicht eingerichtet.</b></p>
      <p>Sie gehen, sobald die Datei notizbuecher.sql in Supabase ausgeführt ist.</p></div>;
  } else if (buecher && !buecher.length && park) {
    haupt = <div className="nb-fehlt"><p>Keine Notizen.</p></div>;
  } else if (buecher && !buecher.length) {
    haupt = <div className="nb-fehlt"><p>Noch kein Notizbuch.</p>
      {darf && <button type="button" className="knopf knopf--haupt" onClick={buchNeu}>Erstes Notizbuch anlegen</button>}</div>;
  } else if (seiteId && (!park || padOhneSql || (seiten || []).some((x) => x.id === seiteId))) {
    haupt = <Seite key={seiteId} id={seiteId} darf={darf} onTitel={titelGeaendert} huelle={huelle()}
      laden={park && !padOhneSql ? (id) => Promise.resolve((seiten || []).find((s) => s.id === id) || null) : undefined} />;
  } else if (seiten && !sichtbar.length) {
    haupt = <div className="nb-fehlt"><p>{abschnitte ? "Dieser Abschnitt hat noch keine Seite." : "Dieses Buch hat noch keine Seite."}</p>
      {darf && <button type="button" className="knopf knopf--haupt" onClick={seiteNeu}>Seite anlegen</button>}</div>;
  } else {
    haupt = <div className="nb-fehlt"><p>Wird geladen …</p></div>;
  }

  const stil = { "--buch": (buch && buch.farbe) || "var(--marke)" };
  if (rahmen) Object.assign(stil, { left: rahmen.x + "px", top: rahmen.y + "px", width: rahmen.w + "px", height: rahmen.h + "px" });
  // Schmal: Bücher und Seiten als Leisten oben, wie auf dem Handy
  const schmal = rahmen && rahmen.w < 760;
  return (
    <div className={"dialog nb" + (schwebend ? " nb--klein" : "") + (schmal ? " nb--schmal" : "") + (vollbild ? " nb--vollbild" : "")}
      role="dialog" aria-label="Notizbücher" style={stil}>
      <div className="nb-kopf" onPointerDown={schwebend ? (e) => rahmenZiehen(e, null) : undefined}
        title={schwebend ? "Am Kopf ziehen zum Verschieben" : undefined}>
        <span className="nb-kopf__zeichen"><Symbol d={BUCH} /></span>
        <h2>{buch ? buch.name : "Notizbücher"}{park && titel ? <small className="nb-kopf__park"> · {titel}</small> : null}</h2>
        {park && <span className="nb-nurlesen">Nur lesen</span>}
        <button type="button" className={"nb-zu nb-zu--klein" + (vollbild ? " aktiv" : "")} data-nbvollbild=""
          aria-pressed={vollbild} aria-label={vollbild ? "Vollbild verlassen" : "Vollbild"}
          title={vollbild ? "Vollbild verlassen: Bücher und Seiten wieder zeigen" : "Vollbild: Bücher und Seiten ausblenden"}
          onClick={() => setVollbild((v) => !v)}><Symbol d={vollbild ? SPALTEN_ZEIGEN : SPALTEN_WEG} /></button>
        {umschalten && <button type="button" className="nb-zu nb-zu--klein" data-nbumschalten=""
          aria-label={schwebend ? "Vergrössern" : "Verkleinern"}
          title={schwebend ? "Wieder gross machen" : "Verkleinern: bleibt als kleines Fenster offen, auch auf anderen Seiten"}
          onClick={umschalten}><Symbol d={schwebend ? GROSS : KLEIN} /></button>}
        <button type="button" className="nb-zu" data-zu="" aria-label="Schliessen"
          title={schwebend ? "Schliessen" : "Schliessen (Escape)"} onClick={zu}>×</button>
      </div>
      <div className="nb-koerper" style={{ "--nb-b": spalten[0] + "px", "--nb-s": spalten[1] + "px" }}>
        <nav className="nb-buecher" aria-label="Notizbücher">
          <div className="nb-spaltenkopf">Bücher
            {darf && !fehlt && <span className="nb-knoepfe">
              <button type="button" className="nb-plus" data-nb="onenote" aria-label="Aus OneNote übernehmen"
                title={"Aus OneNote übernehmen (PDF). " + SO_EXPORTIEREN} disabled={!!holt}
                onClick={oneNoteWaehlen}><Symbol d={HOLEN} /></button>
              <button type="button" className="nb-plus" data-nb="buch-neu" aria-label="Neues Notizbuch"
                title="Neues Notizbuch" onClick={buchNeu}><Symbol d={PLUS} /></button></span>}</div>
          <div className="nb-liste">
            {(buecher || []).map((b) => ([
              <div key={b.id} className={"nb-eintrag nb-eintrag--buch" + (b.id === buchId ? " aktiv" : "")}
                style={{ "--f": b.farbe }}>
                <button type="button" className="nb-eintrag__name" data-nbbuch={b.id}
                  onClick={() => { if (b.id !== buchId) { setSeiteId(null); setAbschnittId(null); setBuchId(b.id); } }}>
                  <span className="nb-ruecken" /><span className="nb-eintrag__text">{b.name}</span>
                  {b.gesperrt && (b.id !== buchId || !darf) && <span className={"nb-schlosschen" + (istZu(b) ? "" : " offen")}
                    title={istZu(b) ? "Gesperrt" : "Mit Passwort geöffnet"}><Symbol d={SCHLOSS} /></span>}</button>
                {darf && b.id === buchId && <>
                  {!istZu(b) && <button type="button" className="nb-mini" aria-label="Notizbuch bearbeiten" title="Umbenennen, Farbe"
                    data-nbbuchbearb="" onClick={() => buchBearbeiten(b)}><Symbol d={STIFT} /></button>}
                  <button type="button" className="nb-mini" aria-label="Passwort" title={b.gesperrt ? "Passwort ändern oder Sperre aufheben" : "Mit Passwort sperren"}
                    data-nbbuchpw="" onClick={() => passwortDialog(b)}><Symbol d={SCHLOSS} /></button>
                  {!istZu(b) && <button type="button" className="nb-mini nb-mini--weg" aria-label="Notizbuch löschen" title="Löschen"
                    data-nbbuchweg="" onClick={() => buchLoeschen(b)}><Symbol d={EIMER} /></button>}
                </>}
              </div>,
              // Die Abschnitte des offenen Buchs darunter, eingerückt wie in OneNote
              b.id === buchId && abschnitte && !istZu(b) && <div key={b.id + "-ab"} className="nb-baum" role="group"
                aria-label={"Abschnitte von " + b.name}>{abschnittListe("nbabschnitt")}</div>]))}
          </div>
          <span className="nb-teiler" data-nbteiler="0" role="separator" aria-orientation="vertical"
            aria-label="Breite der Bücher" title="Breite ziehen" onPointerDown={(e) => spalteZiehen(e, 0)} />
        </nav>
        {abschnitte && !buchZu && <nav className="nb-abschnitte-leiste" aria-label="Abschnitte">
          <div className="nb-liste">{abschnittListe("nbabschnittl")}</div></nav>}
        <nav className="nb-seiten" aria-label="Seiten">
          <div className="nb-spaltenkopf">Seiten
            {darf && buchId && !fehlt && !buchZu && <button type="button" className="nb-plus" data-nb="seite-neu" aria-label="Neue Seite"
              title="Neue Seite" onClick={seiteNeu}><Symbol d={PLUS} /></button>}</div>
          <div className="nb-liste">
            {sichtbar.map((s) => (
              <div key={s.id} className={"nb-eintrag" + (s.id === seiteId ? " aktiv" : "")}>
                <button type="button" className="nb-eintrag__name" data-nbseite={s.id}
                  onClick={() => setSeiteId(s.id)}>{seitenName(s)}</button>
                {darf && s.id === seiteId &&
                  <button type="button" className="nb-mini nb-mini--weg" aria-label="Seite löschen" title="Seite löschen"
                    data-nbseiteweg="" onClick={() => seiteLoeschen(s)}><Symbol d={EIMER} /></button>}
              </div>))}
          </div>
          <span className="nb-teiler" data-nbteiler="1" role="separator" aria-orientation="vertical"
            aria-label="Breite der Seiten" title="Breite ziehen" onPointerDown={(e) => spalteZiehen(e, 1)} />
        </nav>
        <main className="nb-haupt">{haupt}
          {holt && <div className="nb-holt" role="status" data-nbholt=""><b>Aus OneNote übernehmen</b><span>{holt}</span></div>}</main>
      </div>
      {schwebend && RAENDER.map((r) => <span key={r} className={"nb-rand nb-rand--" + r} data-nbrand={r}
        onPointerDown={(e) => rahmenZiehen(e, r)} />)}
    </div>
  );
}
