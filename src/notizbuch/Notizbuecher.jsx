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
import { buecherLaden, seitenLaden, fehltTabelle, BUCHFARBEN, BUECHER, SEITEN,
  buchOeffnen, passwortSetzen, buecherZu, passwortText, fehltFunktion } from "./daten.js";

export const BUCH = "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6";
const STIFT = "M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z";
const PLUS = "M12 5v14M5 12h14";
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

function Notizbuecher({ zu, huelle, schwebend, umschalten }) {
  const darf = !(alt.istExtern && alt.istExtern());
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
  const istZu = (b) => !!(b && b.gesperrt && offene.indexOf(b.id) === -1);
  const [spalten, setSpalten] = useState(spaltenLesen);
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

  const buecherNeu = useCallback(async (waehlen) => {
    try {
      const l = await buecherLaden();
      setBuecher(l || []);
      setBuchId((alt0) => {
        const w = waehlen || alt0;
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
  const seitenNeu = useCallback(async (waehlen) => {
    if (!buchId || buchZu) { setSeiten([]); return; }
    try {
      const l = (await seitenLaden(buchId)) || [];
      setSeiten(l);
      setSeiteId((alt0) => {
        const w = waehlen || alt0;
        return l.some((s) => s.id === w) ? w : ((l[0] && l[0].id) || null);
      });
    } catch (e) {
      alt.meldung("Seiten nicht geladen: " + alt.fehlertext(e), "fehler");
      setSeiten([]);
    }
  }, [buchId, buchZu]);
  useEffect(() => { setSeiten(null); seitenNeu(); }, [seitenNeu]);
  useEffect(() => { if (buchId) merken({ buch: buchId, seite: seiteId }); }, [buchId, seiteId]);

  // ---------- Bücher ----------
  const buchDialog = (b) => alt.dialogFelder({
    titel: b ? "Notizbuch bearbeiten" : "Neues Notizbuch",
    felder: [
      { name: "name", label: "Name", wert: b ? b.name : "", pflicht: true, platzhalter: "z. B. Besprechungen" },
      // Farbwähler des Geräts mit Pipette statt einer Liste (Wunsch Patrick 7. Oktober 2026)
      { name: "farbe", label: "Farbe", typ: "color",
        wert: b ? b.farbe : BUCHFARBEN[(buecher || []).length % BUCHFARBEN.length][0] }],
    bestaetigen: b ? "Speichern" : "Anlegen" });

  const buchNeu = async () => {
    const w = await buchDialog(null);
    if (!w) return;
    const reihenfolge = (buecher || []).reduce((m, b) => Math.max(m, b.reihenfolge || 0), 0) + 1;
    const { data, error } = await alt.db.from(BUECHER)
      .insert({ name: w.name, farbe: w.farbe, reihenfolge }).select("id");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = data && data[0] && data[0].id;
    if (!id) return;
    alt.merkeSchritt("Neues Notizbuch", alt.rueckWeg(BUECHER, { id }));
    // Ein neues Buch hat gleich eine leere Seite, wie in OneNote
    const s = await alt.db.from(SEITEN).insert({ buch_id: id, titel: "", reihenfolge: 1 }).select("id");
    setSeiteId((s.data && s.data[0] && s.data[0].id) || null);
    await buecherNeu(id);
  };

  const buchBearbeiten = async (b) => {
    const w = await buchDialog(b);
    if (!w) return;
    const { error } = await alt.db.from(BUECHER).update({ name: w.name, farbe: w.farbe,
      geaendert_am: new Date().toISOString() }).eq("id", b.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Notizbuch umbenennen", alt.rueckSetz(BUECHER, { name: b.name, farbe: b.farbe }, { id: b.id }));
    buecherNeu();
  };

  const buchLoeschen = async (b) => {
    const ok = await alt.nachfragen({ titel: "Notizbuch löschen?",
      text: "„" + b.name + "“ mit allen Seiten wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    // Für Rückgängig: Buch und alle Seiten samt Inhalt sichern
    const buch = await alt.rueckSichern(BUECHER, { id: b.id });
    const blaetter = await alt.rueckSichern(SEITEN, { buch_id: b.id });
    const { error } = await alt.db.from(BUECHER).delete().eq("id", b.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    // Die Seiten gehen in der Datenbank mit; ausdrücklich, falls nicht
    await alt.db.from(SEITEN).delete().eq("buch_id", b.id);
    alt.merkeSchritt("Notizbuch löschen", [alt.rueckRein(BUECHER, buch), alt.rueckRein(SEITEN, blaetter)]);
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
      .insert({ buch_id: buchId, titel: "", reihenfolge }).select("id");
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
    const rest = (seiten || []).filter((x) => x.id !== s.id);
    setSeiteId(rest[0] ? rest[0].id : null);
    await new Promise((r) => setTimeout(r, 50));
    const sicherung = await alt.rueckSichern(SEITEN, { id: s.id });
    const { error } = await alt.db.from(SEITEN).delete().eq("id", s.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Notizbuch-Seite löschen", alt.rueckRein(SEITEN, sicherung));
    alt.meldung("Gelöscht.");
    seitenNeu();
  };

  // Der Titel steht auf der Seite selbst; die Liste zieht mit
  const titelGeaendert = useCallback((id, titel) => {
    setSeiten((l) => (l || []).map((s) => (s.id === id ? { ...s, titel } : s)));
  }, []);

  const buch = (buecher || []).find((b) => b.id === buchId);

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
  } else if (buecher && !buecher.length) {
    haupt = <div className="nb-fehlt"><p>Noch kein Notizbuch.</p>
      {darf && <button type="button" className="knopf knopf--haupt" onClick={buchNeu}>Erstes Notizbuch anlegen</button>}</div>;
  } else if (seiteId) {
    haupt = <Seite key={seiteId} id={seiteId} darf={darf} onTitel={titelGeaendert} huelle={huelle()} />;
  } else if (seiten && !seiten.length) {
    haupt = <div className="nb-fehlt"><p>Dieses Buch hat noch keine Seite.</p>
      {darf && <button type="button" className="knopf knopf--haupt" onClick={seiteNeu}>Seite anlegen</button>}</div>;
  } else {
    haupt = <div className="nb-fehlt"><p>Wird geladen …</p></div>;
  }

  const stil = { "--buch": (buch && buch.farbe) || "var(--marke)" };
  if (rahmen) Object.assign(stil, { left: rahmen.x + "px", top: rahmen.y + "px", width: rahmen.w + "px", height: rahmen.h + "px" });
  // Schmal: Bücher und Seiten als Leisten oben, wie auf dem Handy
  const schmal = rahmen && rahmen.w < 760;
  return (
    <div className={"dialog nb" + (schwebend ? " nb--klein" : "") + (schmal ? " nb--schmal" : "")}
      role="dialog" aria-label="Notizbücher" style={stil}>
      <div className="nb-kopf" onPointerDown={schwebend ? (e) => rahmenZiehen(e, null) : undefined}
        title={schwebend ? "Am Kopf ziehen zum Verschieben" : undefined}>
        <span className="nb-kopf__zeichen"><Symbol d={BUCH} /></span>
        <h2>{buch ? buch.name : "Notizbücher"}</h2>
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
            {darf && !fehlt && <button type="button" className="nb-plus" data-nb="buch-neu" aria-label="Neues Notizbuch"
              title="Neues Notizbuch" onClick={buchNeu}><Symbol d={PLUS} /></button>}</div>
          <div className="nb-liste">
            {(buecher || []).map((b) => (
              <div key={b.id} className={"nb-eintrag nb-eintrag--buch" + (b.id === buchId ? " aktiv" : "")}
                style={{ "--f": b.farbe }}>
                <button type="button" className="nb-eintrag__name" data-nbbuch={b.id}
                  onClick={() => { if (b.id !== buchId) { setSeiteId(null); setBuchId(b.id); } }}>
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
              </div>))}
          </div>
          <span className="nb-teiler" data-nbteiler="0" role="separator" aria-orientation="vertical"
            aria-label="Breite der Bücher" title="Breite ziehen" onPointerDown={(e) => spalteZiehen(e, 0)} />
        </nav>
        <nav className="nb-seiten" aria-label="Seiten">
          <div className="nb-spaltenkopf">Seiten
            {darf && buchId && !fehlt && !buchZu && <button type="button" className="nb-plus" data-nb="seite-neu" aria-label="Neue Seite"
              title="Neue Seite" onClick={seiteNeu}><Symbol d={PLUS} /></button>}</div>
          <div className="nb-liste">
            {(seiten || []).map((s) => (
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
        <main className="nb-haupt">{haupt}</main>
      </div>
      {schwebend && RAENDER.map((r) => <span key={r} className={"nb-rand nb-rand--" + r} data-nbrand={r}
        onPointerDown={(e) => rahmenZiehen(e, r)} />)}
    </div>
  );
}
