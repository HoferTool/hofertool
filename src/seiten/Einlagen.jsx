// =================================================================
//  EINLAGEN GEN (created by Ecker)
//  Werkzeug-Konturscanner: Werkzeuge auf A4 fotografieren, Kontur
//  erkennen und korrigieren, daraus eine Einlage mit Taschen bauen und
//  als SVG oder STL für den 3D-Drucker speichern (Wunsch Patrick
//  30. Oktober 2026: „baue das als weiteren Reiter ein“).
//
//  Das Werkzeug ist eine eigene, fertige Seite (public/einlagen/) und
//  läuft hier unverändert in einem Rahmen. So bleibt es genau, wie Ecker
//  es gebaut und geprüft hat, und Fenster, Meldungen und Kamera darin
//  bleiben im Rahmen. Nicht für Externe.
//
//  Jede Einlage kommt von selbst in die Tabelle einlagen (sql/einlagen.sql),
//  damit sie an jedem Gerät weiter bearbeitet werden kann (Wunsch Patrick
//  30. Oktober 2026: „alle generierten Modelle dort direkt abspeichern,
//  dass es von überall bearbeitbar ist“). Dafür hängt sich die Seite an
//  laySaveLocal des Werkzeugs, das es bei jeder Änderung der Einlage
//  aufruft; layData und layApply lesen und setzen die ganze Einlage.
//
//  Beim Erfassen lässt sich jedes Werkzeug einzeln in der App speichern
//  (Tabelle einlagen_werkzeuge) und später in jede Einlage holen oder
//  samt Foto weiter bearbeiten; der aktuelle Scan liegt auf dem Gerät,
//  damit die Kontur beim Hin und Her nicht verloren geht (Wunsch Patrick
//  30. Oktober 2026, einlagen/scan.js).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import {
  scanLesen, scanAblegen, scanWeg, verknuepftLesen, verknuepftSetzen, signatur, projektOhneFoto,
  foto, werkzeugDaten, finden, umrissPfad,
} from "./einlagen/scan.js";

// Bedienung im Rahmen sieht die App nicht von selbst; ohne Weitergabe
// würde sie nach 5 Minuten mitten in der Arbeit abmelden
const BEDIENUNG = ["pointerdown", "keydown", "wheel", "touchstart", "input"];

// Welche Einlage auf diesem Gerät gerade offen ist; das Werkzeug selbst
// merkt sich ihren Inhalt im localStorage (konturscanner-einlage)
const AKTUELL = "hofer.einlagen.aktuell";
const WARTEN_MS = 1500;
// „Neues Projekt“ lädt das Werkzeug neu: der Scan auf dem Gerät soll dann nicht wiederkommen
const VERWERFEN = "hofer.einlagen.verwerfen";

function aktuellLesen() {
  try { return JSON.parse(localStorage.getItem(AKTUELL) || "null"); } catch { return null; }
}
function aktuellSetzen(a) {
  try { a ? localStorage.setItem(AKTUELL, JSON.stringify(a)) : localStorage.removeItem(AKTUELL); } catch { /* nur dieser Tab */ }
}

const uhr = (iso) => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, "0");
  return d.toDateString() === new Date().toDateString()
    ? p(d.getHours()) + ":" + p(d.getMinutes()) : alt.datumZeitKurz(iso);
};

export default function Einlagen() {
  const rahmen = useRef(null);
  const zustand = useRef({ w: null, gespeichert: null, still: false, takt: null, laeuft: null,
    scanTakt: null, scanSig: null, scanLaeuft: null });
  const [wzStand, setWzStand] = useState(() => {
    const v = verknuepftLesen();
    return v && v.zeilen && v.zeilen.length ? { namen: v.zeilen.map((x) => x.name), am: v.am, text: "" } : null;
  });
  const [stand, setStand] = useState(() => {
    const a = aktuellLesen();
    return { id: a && a.id, name: a && a.name, am: a && a.am, text: "", fehler: false };
  });
  const [liste, setListe] = useState(null);
  const listeOffen = useRef(null);
  listeOffen.current = liste && liste.art;

  // Der Rahmen reicht bis an den unteren Rand des Bildschirms; das
  // Werkzeug rollt in sich, weil es seine Fläche nach der Fensterhöhe misst
  useEffect(() => {
    const r = rahmen.current;
    const anpassen = () => {
      const oben = r.getBoundingClientRect().top + window.scrollY;
      const unten = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--navhoehe")) || 0;
      const handy = document.body.classList.contains("mobil") || window.innerWidth <= 640;
      r.style.height = Math.max(420, window.innerHeight - oben - (handy ? unten : 0) - 8) + "px";
    };
    anpassen();
    window.addEventListener("resize", anpassen);
    // Kommt man an dieses Gerät zurück, die Fassung vom Server holen,
    // falls inzwischen an einem anderen Gerät weitergearbeitet wurde
    const sichtbar = () => { if (document.visibilityState === "visible") abgleichen(); };
    document.addEventListener("visibilitychange", sichtbar);
    return () => {
      window.removeEventListener("resize", anpassen);
      document.removeEventListener("visibilitychange", sichtbar);
      const z = zustand.current;
      if (z.takt) { clearTimeout(z.takt); speichern(); }
      if (z.scanTakt) { clearTimeout(z.scanTakt); scanSichern(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function merken(a) {
    aktuellSetzen(a && a.id ? { id: a.id, name: a.name, am: a.am } : null);
    setStand((s) => ({ ...s, id: a ? a.id : null, name: a ? a.name : null, am: a ? a.am : null }));
  }

  // Einlage ins Werkzeug setzen, ohne dass das gleich wieder gespeichert wird
  function einsetzen(daten) {
    const z = zustand.current, w = z.w;
    if (!w) return;
    z.still = true;
    try { w.layPush(); w.layApply(daten); w.layChanged(); } finally { z.still = false; }
    z.gespeichert = JSON.stringify(w.layData());
  }

  async function abgleichen() {
    const z = zustand.current, a = aktuellLesen();
    if (!z.w || !a || !a.id || z.takt) return;
    const { data, error } = await alt.db.from("einlagen").select("id, name, daten, geaendert_am").eq("id", a.id).maybeSingle();
    if (error) return;
    if (!data) { merken(null); return; } // anderswo gelöscht: die Einlage bleibt offen, wird neu gespeichert
    merken({ id: data.id, name: data.name, am: data.geaendert_am });
    if (data.geaendert_am !== a.am) einsetzen(data.daten);
    else planen(); // hier Geändertes, das vor dem Schliessen nicht mehr hinauskam

  }

  function planen() {
    const z = zustand.current;
    if (z.still) return;
    if (z.takt) clearTimeout(z.takt);
    z.takt = setTimeout(() => { z.takt = null; speichern(); }, WARTEN_MS);
  }

  async function speichern() {
    const z = zustand.current, w = z.w;
    if (!w || !w.layData) return;
    if (z.laeuft) { await z.laeuft; }
    const daten = w.layData(), text = JSON.stringify(daten);
    if (text === z.gespeichert) return;
    const a = aktuellLesen();
    // Leere Einlage ohne Werkzeuge erst speichern, wenn etwas drin ist
    if ((!a || !a.id) && !(daten.items && daten.items.length)) return;
    const name = String(daten.name || "").trim() || "einlage";
    z.laeuft = (async () => {
      let antwort = null;
      if (a && a.id) {
        antwort = await alt.db.from("einlagen").update({ name, daten }).eq("id", a.id).select("id, name, geaendert_am").maybeSingle();
      }
      if (!antwort || (!antwort.error && !antwort.data)) {
        antwort = await alt.db.from("einlagen").insert({ name, daten }).select("id, name, geaendert_am").single();
      }
      if (antwort.error) {
        const fehlt = /einlagen/.test(antwort.error.message || "") && /exist|schema cache/i.test(antwort.error.message || "");
        setStand((s) => ({ ...s, fehler: true, text: fehlt
          ? "Nicht in der App gespeichert: Die Tabelle „einlagen“ fehlt noch (sql/einlagen.sql)."
          : "Nicht in der App gespeichert: " + alt.fehlertext(antwort.error) }));
        return;
      }
      z.gespeichert = text;
      merken({ id: antwort.data.id, name: antwort.data.name, am: antwort.data.geaendert_am });
      setStand((s) => ({ ...s, fehler: false, text: "" }));
      if (listeOffen.current === "einlagen") listeLaden();
    })();
    try { await z.laeuft; } finally { z.laeuft = null; }
  }

  function geladen() {
    let doc, w;
    try { w = rahmen.current.contentWindow; doc = rahmen.current.contentDocument; } catch { return; }
    if (!doc || !w || typeof w.layData !== "function") return;
    const aktiv = () => { if (alt.leerlaufAktiv) alt.leerlaufAktiv(); };
    BEDIENUNG.forEach((art) => doc.addEventListener(art, aktiv, { capture: true, passive: true }));
    // „Neues Projekt“ im Werkzeug leert die Einlage und lädt neu: danach
    // ist es eine neue Einlage, die gespeicherte bleibt, wie sie war
    doc.addEventListener("click", (e) => {
      const ok = e.target.closest && e.target.closest('[data-n="ok"]');
      if (ok && /Neues Projekt/.test(ok.closest(".pickbox")?.textContent || "")) {
        const z = zustand.current;
        if (z.takt) { clearTimeout(z.takt); z.takt = null; }
        if (z.scanTakt) { clearTimeout(z.scanTakt); z.scanTakt = null; }
        merken(null);
        verknuepftSetzen(null); setWzStand(null);
        try { localStorage.setItem(VERWERFEN, "1"); } catch { /* dann kommt der Scan wieder */ }
      }
    }, true);
    const z = zustand.current;
    z.w = w;
    const vorher = w.laySaveLocal;
    w.laySaveLocal = function () { vorher.apply(this, arguments); planen(); };
    // Name und Tiefe hängen laySaveLocal direkt an ihr Feld, also an die
    // Fassung vor dem Umhängen; darum jede Änderung im Werkzeug vergleichen
    doc.addEventListener("change", planen, true);
    z.gespeichert = null;
    const a = aktuellLesen();
    if (a && a.id) abgleichen();
    else planen(); // eine Einlage von vorher, die noch nie in der App war

    // Jede Änderung am Scan zeichnet neu: daran hängt das Sichern
    if (typeof w.scanState === "function") {
      const zeichne = w.render;
      w.render = function () { const r = zeichne.apply(this, arguments); scanPlanen(); return r; };
      scanHolen();
    }
  }

  // Scan dieses Geräts wieder einsetzen (nach Reiterwechsel oder Neuladen)
  async function scanHolen() {
    const z = zustand.current;
    let weg = false;
    try { weg = !!localStorage.getItem(VERWERFEN); localStorage.removeItem(VERWERFEN); } catch { /* egal */ }
    if (weg) { await scanWeg(); return; }
    const s = await scanLesen();
    if (!s || !z.w || typeof z.w.projApply !== "function") return;
    z.still = true;
    z.w.projApply(s, null, () => { z.scanSig = signatur(z.w); });
    setTimeout(() => { z.still = false; }, 0);
  }

  function scanPlanen() {
    const z = zustand.current;
    if (z.scanTakt) clearTimeout(z.scanTakt);
    z.scanTakt = setTimeout(() => { z.scanTakt = null; scanSichern(); }, WARTEN_MS);
  }

  // Scan auf dem Gerät ablegen und verknüpfte Werkzeuge in der App nachführen
  async function scanSichern() {
    const z = zustand.current, w = z.w;
    if (!w || typeof w.scanState !== "function") return;
    const st = w.scanState();
    if (!st.srcCanvas || !st.result || st.sample) return; // das Beispielfoto nicht
    if (z.scanLaeuft) await z.scanLaeuft;
    const sig = signatur(w);
    if (sig === z.scanSig) return;
    z.scanLaeuft = (async () => {
      await scanAblegen({ ...projektOhneFoto(w), image: foto(w) });
      const v = verknuepftLesen();
      if (v && v.scanId === st.scanId && v.zeilen.length) {
        const projekt = projektOhneFoto(w), schon = new Set();
        for (const x of v.zeilen) {
          const i = finden(w, x.mitte, schon);
          if (i < 0) continue;
          schon.add(i);
          const daten = werkzeugDaten(w, i, x.name);
          const { data, error } = await alt.db.from("einlagen_werkzeuge")
            .update({ name: x.name, daten, projekt }).eq("id", x.id).select("geaendert_am").maybeSingle();
          if (error) { setWzStand((s) => ({ ...(s || {}), text: "Werkzeug nicht in der App gespeichert: " + alt.fehlertext(error) })); return; }
          if (!data) continue; // anderswo gelöscht
          x.mitte = daten.mitte; v.am = data.geaendert_am;
        }
        verknuepftSetzen(v);
        setWzStand({ namen: v.zeilen.map((x) => x.name), am: v.am, text: "" });
      }
      z.scanSig = sig;
    })();
    try { await z.scanLaeuft; } finally { z.scanLaeuft = null; }
  }

  // „Werkzeug speichern“: jedes gewählte Werkzeug des Fotos als eigene Zeile
  async function werkzeugSpeichern() {
    const z = zustand.current, w = z.w;
    const st = w && typeof w.scanState === "function" ? w.scanState() : null;
    if (!st || !st.result || !st.result.tools.length) { alt.meldung("Im Scan ist noch keine Kontur vorhanden.", "warn"); return; }
    if (st.sample) { alt.meldung("Das ist das Beispielfoto. Zuerst ein eigenes Foto aufnehmen oder laden.", "warn"); return; }
    const tools = st.result.tools;
    const idx = tools.length === 1 ? [0] : await w.pickTools(tools, "Welche Werkzeuge in der App speichern?", "Weiter");
    if (!idx.length) return;
    if (z.scanTakt) { clearTimeout(z.scanTakt); z.scanTakt = null; }
    let v = verknuepftLesen();
    if (!v || v.scanId !== st.scanId) v = { scanId: st.scanId, zeilen: [] };
    // Schon gespeicherte Werkzeuge dieses Fotos wiedererkennen: die werden ersetzt
    const zuordnung = new Map(), schon = new Set();
    v.zeilen.forEach((x) => { const i = finden(w, x.mitte, schon); if (i >= 0) { schon.add(i); zuordnung.set(i, x); } });
    const grund = w.baseName();
    const namen = await alt.dialogFelder({
      titel: idx.length > 1 ? "Werkzeuge in der App speichern" : "Werkzeug in der App speichern",
      text: "Gespeicherte Werkzeuge sehen alle unter „Gespeicherte Werkzeuge“ und können sie in jede Einlage holen.",
      felder: idx.map((i) => ({
        name: "n" + i, pflicht: true,
        label: (idx.length > 1 ? "Name Werkzeug Nr. " + (i + 1) : "Name") + (zuordnung.has(i) ? " (schon gespeichert, wird ersetzt)" : ""),
        wert: zuordnung.has(i) ? zuordnung.get(i).name : (idx.length > 1 || tools.length > 1 ? grund + " " + (i + 1) : grund),
      })),
      bestaetigen: "Speichern",
    });
    if (!namen) return;
    const projekt = projektOhneFoto(w);
    let bild = null;
    for (const i of idx) {
      const name = String(namen["n" + i]).slice(0, 60), daten = werkzeugDaten(w, i, name), alt_ = zuordnung.get(i);
      let antwort = null;
      if (alt_) {
        antwort = await alt.db.from("einlagen_werkzeuge").update({ name, daten, projekt })
          .eq("id", alt_.id).select("id, geaendert_am").maybeSingle();
      }
      if (!antwort || (!antwort.error && !antwort.data)) {
        if (!bild) bild = foto(w);
        antwort = await alt.db.from("einlagen_werkzeuge").insert({ name, daten, projekt, foto: bild, scan_id: st.scanId })
          .select("id, geaendert_am").single();
      }
      if (antwort.error) {
        const fehlt = /einlagen_werkzeuge/.test(antwort.error.message || "") && /exist|schema cache/i.test(antwort.error.message || "");
        alt.meldung(fehlt ? "Die Tabelle „einlagen_werkzeuge“ fehlt noch (sql/einlagen-werkzeuge.sql)."
          : "Werkzeug nicht gespeichert: " + alt.fehlertext(antwort.error), "fehler");
        return;
      }
      v.zeilen = v.zeilen.filter((x) => x.id !== antwort.data.id && x !== alt_);
      v.zeilen.push({ id: antwort.data.id, name, mitte: daten.mitte });
      v.am = antwort.data.geaendert_am;
    }
    verknuepftSetzen(v);
    setWzStand({ namen: v.zeilen.map((x) => x.name), am: v.am, text: "" });
    z.scanSig = null; scanSichern();
    alt.meldung(idx.length > 1 ? idx.length + " Werkzeuge gespeichert." : "Werkzeug „" + namen["n" + idx[0]] + "“ gespeichert.", "gut");
    if (listeOffen.current === "werkzeuge") werkzeugeLaden();
  }

  async function werkzeugeLaden() {
    const { data, error } = await alt.db.from("einlagen_werkzeuge")
      .select("id, name, daten, scan_id, geaendert_am, geaendert_von").order("geaendert_am", { ascending: false }).limit(300);
    if (error) { setListe({ art: "werkzeuge", fehler: alt.fehlertext(error), zeilen: [] }); return; }
    const leute = await personen(data);
    setListe({ art: "werkzeuge", zeilen: data.map((x) => ({ ...x, wer: leute[x.geaendert_von] || "" })) });
  }

  async function personen(data) {
    const ids = [...new Set(data.map((x) => x.geaendert_von).filter(Boolean))], leute = {};
    if (ids.length) {
      const p = await alt.db.from("profiles").select("id, full_name, email").in("id", ids);
      (p.data || []).forEach((x) => { leute[x.id] = alt.personName(x); });
    }
    return leute;
  }

  // Gespeichertes Werkzeug in die offene Einlage holen
  function inEinlage(x) {
    const w = zustand.current.w, d = x.daten || {};
    if (!w) return;
    const nextId = 1 + (w.layData().items || []).reduce((m, it) => Math.max(m, +it.id || 0), 0);
    const it = { id: nextId, name: x.name, polys: d.polys, grips: Array.isArray(d.grips) ? d.grips : [],
      x: 0, y: 0, ang: 0, depth: Number.isFinite(+d.depth) && +d.depth > 0 ? +d.depth : 20 };
    if (x.scan_id && Number.isInteger(d.nr)) it.scan = x.scan_id + ":" + d.nr;
    if (!w.validItem(it)) { alt.meldung("Die Kontur von „" + x.name + "“ ist nicht gültig.", "fehler"); return; }
    setListe(null);
    w.layAddItems([it], true);
  }

  // Foto und Kontur eines gespeicherten Werkzeugs zum Weiterbearbeiten öffnen
  async function konturOeffnen(x) {
    const z = zustand.current, w = z.w;
    if (!w || typeof w.projApply !== "function") return;
    if (z.scanTakt) { clearTimeout(z.scanTakt); z.scanTakt = null; await scanSichern(); }
    const { data, error } = await alt.db.from("einlagen_werkzeuge").select("projekt, foto").eq("id", x.id).maybeSingle();
    if (error || !data || !data.projekt || !data.foto) {
      alt.meldung(error ? alt.fehlertext(error) : "Zu „" + x.name + "“ ist kein Foto gespeichert.", "fehler"); return;
    }
    const geschw = x.scan_id ? await alt.db.from("einlagen_werkzeuge").select("id, name, daten").eq("scan_id", x.scan_id) : { data: [x] };
    const zeilen = (geschw.data || [x]).map((y) => ({ id: y.id, name: y.name, mitte: (y.daten && y.daten.mitte) || [0, 0] }));
    setListe(null);
    w.setMode("scan");
    w.projApply({ ...data.projekt, image: data.foto }, "„" + x.name + "“ geöffnet.", () => {
      const st = w.scanState();
      const v = { scanId: st.scanId, zeilen, am: x.geaendert_am };
      verknuepftSetzen(v);
      setWzStand({ namen: zeilen.map((y) => y.name), am: v.am, text: "" });
      z.scanSig = signatur(w);
      scanAblegen({ ...projektOhneFoto(w), image: data.foto });
    });
  }

  async function werkzeugWeg(x) {
    const ok = await alt.loeschen({ tabelle: "einlagen_werkzeuge", id: x.id, titel: "Werkzeug löschen?",
      text: "„" + x.name + "“ wird für alle gelöscht. Einlagen, in denen es schon liegt, behalten es.", rueckText: "Werkzeug löschen" });
    if (!ok) return;
    const v = verknuepftLesen();
    if (v) {
      v.zeilen = v.zeilen.filter((y) => y.id !== x.id);
      verknuepftSetzen(v.zeilen.length ? v : null);
      setWzStand(v.zeilen.length ? { namen: v.zeilen.map((y) => y.name), am: v.am, text: "" } : null);
    }
    werkzeugeLaden();
  }

  async function listeLaden() {
    const { data, error } = await alt.db.from("einlagen")
      .select("id, name, daten, geaendert_am, geaendert_von").order("geaendert_am", { ascending: false }).limit(200);
    if (error) { setListe({ art: "einlagen", fehler: alt.fehlertext(error), zeilen: [] }); return; }
    const leute = await personen(data);
    setListe({ art: "einlagen", zeilen: data.map((x) => ({ ...x, wer: leute[x.geaendert_von] || "" })) });
  }

  async function oeffnen(x) {
    const z = zustand.current;
    if (z.takt) { clearTimeout(z.takt); z.takt = null; await speichern(); }
    einsetzen(x.daten);
    merken({ id: x.id, name: x.name, am: x.geaendert_am });
    setListe(null);
    alt.meldung("Einlage „" + x.name + "“ geöffnet.", "gut");
  }

  async function neu() {
    const z = zustand.current;
    if (!z.w) return;
    if (z.takt) { clearTimeout(z.takt); z.takt = null; await speichern(); }
    merken(null);
    // Grundkörper und Verbinder bleiben wie beim „Neuen Projekt“ des Werkzeugs
    einsetzen({ ...z.w.layData(), name: "einlage", items: [] });
    z.gespeichert = null;
    setListe(null);
  }

  async function weg(x) {
    const ok = await alt.loeschen({ tabelle: "einlagen", id: x.id, titel: "Einlage löschen?",
      text: "„" + x.name + "“ wird für alle gelöscht.", rueckText: "Einlage löschen" });
    if (!ok) return;
    if (stand.id === x.id) merken(null);
    listeLaden();
  }

  const offen = liste && liste.art;
  const umschalten = (art, laden) => (offen === art ? setListe(null) : (setListe({ art, zeilen: null }), laden()));
  return (
    <div className="einlagen">
      <div className="einlagen__leiste">
        <button type="button" className={"knopf" + (offen === "einlagen" ? " aktiv" : "")} id="einlagen-liste"
          onClick={() => umschalten("einlagen", listeLaden)}>
          Gespeicherte Einlagen {offen === "einlagen" ? "▴" : "▾"}
        </button>
        <button type="button" className="knopf" id="einlagen-neu" onClick={neu}>Neue Einlage</button>
        <button type="button" className={"knopf" + (offen === "werkzeuge" ? " aktiv" : "")} id="einlagen-werkzeuge"
          onClick={() => umschalten("werkzeuge", werkzeugeLaden)}>
          Gespeicherte Werkzeuge {offen === "werkzeuge" ? "▴" : "▾"}
        </button>
        <button type="button" className="knopf knopf--haupt" id="einlagen-wz-speichern" onClick={werkzeugSpeichern}
          title="Werkzeuge aus dem Foto einzeln in der App speichern">Werkzeug speichern</button>
        <span className={"einlagen__stand" + (stand.fehler ? " einlagen__stand--fehler" : "")} id="einlagen-stand">
          {stand.text || (stand.id
            ? <>„{stand.name}“ in der App gespeichert{stand.am ? ", " + uhr(stand.am) : ""}</>
            : "Wird in der App gespeichert, sobald ein Werkzeug in der Einlage ist.")}
          {wzStand && (wzStand.text
            ? <span className="einlagen__stand--fehler"> · {wzStand.text}</span>
            : <> · Werkzeug {wzStand.namen.map((n) => "„" + n + "“").join(", ")} gespeichert{wzStand.am ? ", " + uhr(wzStand.am) : ""}</>)}
        </span>
      </div>
      {offen === "einlagen" && (
        <div className="einlagen__liste" id="einlagen-fenster">
          {liste.fehler && <p className="einlagen__stand--fehler">{liste.fehler}</p>}
          {!liste.zeilen ? <p className="einlagen__stand">Lädt …</p>
            : !liste.zeilen.length ? <p className="einlagen__stand">Noch keine Einlage gespeichert.</p>
            : liste.zeilen.map((x) => {
              const b = (x.daten && x.daten.base) || {}, n = (x.daten && x.daten.items || []).length;
              return (
                <div key={x.id} className={"einlagen__zeile" + (x.id === stand.id ? " aktiv" : "")}>
                  <button type="button" className="einlagen__oeffnen" onClick={() => oeffnen(x)}>
                    <b>{x.name}</b>
                    <span>{n} Werkzeug{n === 1 ? "" : "e"} · {b.W} × {b.H} × {b.T} mm</span>
                    <span className="einlagen__stand">{alt.datumZeitKurz(x.geaendert_am)}{x.wer ? " · " + x.wer : ""}</span>
                  </button>
                  <button type="button" className="knopf einlagen__weg" title="Löschen" aria-label="Löschen" onClick={() => weg(x)}>✕</button>
                </div>
              );
            })}
        </div>
      )}
      {offen === "werkzeuge" && (
        <div className="einlagen__liste" id="einlagen-wz-fenster">
          {liste.fehler && <p className="einlagen__stand--fehler">{liste.fehler}</p>}
          {!liste.zeilen ? <p className="einlagen__stand">Lädt …</p>
            : !liste.zeilen.length ? <p className="einlagen__stand">Noch kein Werkzeug gespeichert. Beim Erfassen „Werkzeug speichern“ antippen.</p>
            : liste.zeilen.map((x) => {
              const d = x.daten || {}, u = umrissPfad(d), m = d.mass || [];
              return (
                <div key={x.id} className="einlagen__zeile einlagen__wz">
                  {u ? <svg className="einlagen__umriss" viewBox={u.box} aria-hidden="true"><path d={u.d} fillRule="evenodd" /></svg>
                    : <span className="einlagen__umriss" />}
                  <div className="einlagen__wz-text">
                    <b>{x.name}</b>
                    {m.length === 2 && <span>{alt.zahlText(Math.round(m[0]))} × {alt.zahlText(Math.round(m[1]))} mm{d.depth ? " · Tiefe " + d.depth + " mm" : ""}</span>}
                    <span className="einlagen__stand">{alt.datumZeitKurz(x.geaendert_am)}{x.wer ? " · " + x.wer : ""}</span>
                  </div>
                  <button type="button" className="knopf" data-wz="einlage" onClick={() => inEinlage(x)}>In die Einlage</button>
                  <button type="button" className="knopf" data-wz="kontur" onClick={() => konturOeffnen(x)}>Kontur bearbeiten</button>
                  <button type="button" className="knopf einlagen__weg" title="Löschen" aria-label="Löschen" onClick={() => werkzeugWeg(x)}>✕</button>
                </div>
              );
            })}
        </div>
      )}
      <iframe ref={rahmen} className="einlagen-rahmen" title="Einlagen Gen"
        src={import.meta.env.BASE_URL + "einlagen/index.html"} onLoad={geladen}
        allow="camera" />
    </div>
  );
}
