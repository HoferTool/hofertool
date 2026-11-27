// =================================================================
//  PRÜFUNG IN DEN STAMMDATEN EINER HOCO NR. (seit 1.779.0, Wunsch Patrick
//  24. November 2026: „was wo gemacht werden muss, wird bei Stammdaten
//  definiert“, „Excel hochladen nur per Stammdaten, neue sollen dort
//  gleich ausgefüllt werden“).
//  Welche Prüfungen nötig sind (Erstteil, Endkontrolle, AQL, LL), die
//  AQL-Vorgabe und die Masse mit Soll und Prüfmittel. Ein Excel-Prüfbericht
//  füllt die Masse nur einmal (im Gerät gelesen, nicht abgelegt), danach
//  gilt, was hier steht. Gespeichert in pruef_stamm (sql/pruef-stamm.sql).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STIL, briefkopf } from "../seiten/qs/achtdBlatt.js";
import { alt } from "../bruecke.jsx";
import {
  ARTEN, AQL_WERTE, stammMitMassen, stammSpeichern, excelMasse, zeilenId, toleranz, toleranzText, fehltTabelle, lehrenAus,
  bildVon, massBildHochladen, kopfInStammdaten, pmAnzeige,
} from "../daten/pruefbericht.js";
import { FormLage } from "../einrichtblatt/markiert.jsx";
import { masseInQsOeffnen } from "../seiten/qs/qsSprung.js";
import { pmWaehlen, pmAutomatisch } from "./PmWahl.jsx";

const KOPF = [["bezeichnung", "Artikel"], ["zeichnung", "Zeichnung"], ["index", "Index"], ["alltol", "Allg. Toleranz"]];

// modus "stamm" (Stammdaten der HOCO Nr.): nur die Häkchen, welche Prüfungen
// nötig sind, und AQL. modus "qs" (QS → Prüfberichte): die Prüfmasse mit
// Kopf, Blatt und Excel. Seit 1.837.0, Wunsch Patrick 25. November 2026:
// „prüfbericht soll im qs selber bearbeitet werden nicht stammdaten, dort
// soll dan nur hacken gestzet werden was notwenig ist“.
export default function Pruefung({ hoco, darf, modus = "stamm", zurueck, zurueckText = "← Prüfberichte" }) {
  const qs = modus === "qs";
  const [st, setSt] = useState(null);      // gespeicherter bzw. geladener Stand
  const [w, setW] = useState(null);        // Arbeitsstand
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [blatt, setBlatt] = useState(false);   // Masse-Blatt (A4) offen
  const datei = useRef(null);
  const neuFokus = useRef(null);
  const schreibt = darf && alt.darfSchreiben() && !alt.istExtern();

  const laden = () => stammMitMassen(hoco).then((s) => {
    const x = s || { hoco_nr: hoco, arten: [], aql: null, niveau: null, zeilen: [], kopf: {}, aus: "neu" };
    setSt(x); setW({ arten: x.arten || [], aql: x.aql ?? "", niveau: x.niveau || "", zeilen: x.zeilen || [], kopf: x.kopf || {} });
    setFehler("");
  }, (f) => setFehler(fehltTabelle(f) ? "Die Datenbank kennt die Prüfung noch nicht (sql/pruef-stamm.sql fehlt)." : alt.fehlertext(f)));
  useEffect(() => { laden(); }, [hoco]);

  if (alt.istExtern()) return null;
  if (fehler) return <section className="karte hocoteil__karte"><div className="karte__kopf"><h2>Prüfung</h2></div><p className="hinweis">{fehler}</p></section>;
  if (!w) return <section className="karte hocoteil__karte"><div className="karte__kopf"><h2>Prüfung</h2></div><p className="klein">Wird geladen …</p></section>;

  const vergl = (x) => (qs ? { zeilen: x.zeilen || [], kopf: x.kopf || {} } : { arten: x.arten || [], aql: x.aql ?? "", niveau: x.niveau || "" });
  const geaendert = JSON.stringify(vergl(w)) !== JSON.stringify(vergl(st)) || (qs && st.aus === "excel");
  const artUm = (id) => setW((x) => ({ ...x, arten: x.arten.includes(id) ? x.arten.filter((a) => a !== id) : ARTEN.map((a) => a.id).filter((a) => a === id || x.arten.includes(a)) }));
  const zeileSetzen = (id, n, v) => setW((x) => ({ ...x, zeilen: x.zeilen.map((z) => (z.id === id ? { ...z, [n]: v } : z)) }));
  const zeileWeg = (id) => setW((x) => ({ ...x, zeilen: x.zeilen.filter((z) => z.id !== id) }));
  // Markierte Zeilen im Masse-Blatt leeren oder löschen (seit 1.786.0)
  const zeilenLeeren = (ids) => setW((x) => ({ ...x, zeilen: x.zeilen.map((z) => (!ids.has(z.id) ? z
    : "abschnitt" in z ? { ...z, abschnitt: "" } : { ...z, nr: "", soll: "", pm: "", ll: false, pm_nr: null, pm_id: null, pm_ids: null, pm_art: null, tol_min: undefined, tol_max: undefined })) }));
  const zeilenWeg = (ids) => setW((x) => ({ ...x, zeilen: x.zeilen.filter((z) => !ids.has(z.id)) }));
  // bei = Index, vor dem eingefügt wird (leer = ans Ende)
  const zeileDazu = (abschnitt, bei) => setW((x) => {
    const nrn = x.zeilen.map((z) => parseInt(z.nr, 10)).filter((v) => !isNaN(v));
    const z = abschnitt ? { abschnitt: "Neuer Abschnitt" } : { nr: String((nrn.length ? Math.max(...nrn) : 0) + 1), soll: "", pm: "" };
    const neu = { ...z, id: zeilenId(x.zeilen, z) };
    const l = [...x.zeilen]; l.splice(bei == null ? l.length : bei, 0, neu);
    neuFokus.current = neu.id;
    return { ...x, zeilen: l };
  });
  const schieben = (i, d) => setW((x) => {
    const z = [...x.zeilen]; const j = i + d;
    if (j < 0 || j >= z.length) return x;
    [z[i], z[j]] = [z[j], z[i]];
    return { ...x, zeilen: z };
  });

  const excelEinlesen = async (liste) => {
    if (!liste.length) return;
    if (w.zeilen.length) {
      const ok = await alt.nachfragen({ titel: "Masse ersetzen?", text: "Die " + w.zeilen.length + " Zeilen hier werden durch die Masse aus dem Excel ersetzt.", bestaetigen: "Ersetzen" });
      if (!ok) return;
    }
    setLaeuft(true);
    try {
      const v = await excelMasse(liste);
      if (!v.zeilen.length) { alt.meldung("Im Excel keine Masse gefunden (Zeile „Nr. | Soll“ fehlt).", "warn"); return; }
      setW((x) => ({ ...x, zeilen: v.zeilen, kopf: { ...v.kopf, ...Object.fromEntries(Object.entries(x.kopf).filter(([, y]) => y)) } }));
      alt.meldung(v.zeilen.filter((z) => !z.abschnitt).length + " Masse eingelesen. Bitte prüfen und speichern.", "gut");
    } catch (f) { alt.meldung("Excel nicht lesbar: " + alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };

  const speichern = async () => {
    setLaeuft(true);
    try {
      // jede Ansicht schreibt nur ihren Teil, damit sie sich nicht überschreiben
      // Artikel, Zeichnung, Index mit den Stammdaten abgleichen (Index nur nach Rückfrage)
      const kopf = qs ? await kopfInStammdaten(hoco, w.kopf) : w.kopf;
      const felder = qs ? { zeilen: w.zeilen, kopf }
        : { arten: w.arten, aql: w.aql === "" ? null : Number(w.aql), niveau: w.niveau || null };
      await stammSpeichern(hoco, felder);
      alt.meldung("Prüfung gespeichert", "gut");
      setSt({ ...st, ...felder, aus: "stamm" });
      if (!qs) setW({ ...w, aql: felder.aql ?? "", niveau: felder.niveau || "" });
      else setW({ ...w, kopf });
    } catch (f) { alt.meldung(fehltTabelle(f) ? "sql/pruef-stamm.sql fehlt noch." : alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };

  const lehren = lehrenAus({ zeilen: w.zeilen });
  const anzahl = w.zeilen.filter((z) => !z.abschnitt).length;
  const knoepfeUnten = (mitExcel) => schreibt ? (
    <div className="pst-knoepfe">
      {mitExcel ? <>
        <button type="button" className="knopf knopf--klein" id="pst-excel" disabled={laeuft} onClick={() => datei.current && datei.current.click()}>📥 Excel-Prüfbericht einlesen</button>
        <input ref={datei} type="file" multiple accept=".xlsx,.xlsm,.xls" hidden id="pst-excel-datei" data-ablegen="direkt"
          onChange={(e) => { const l = [...e.target.files]; e.target.value = ""; excelEinlesen(l); }} />
      </> : null}
      <span className="pst-platz" />
      {geaendert ? <span className="klein pb-rot">Noch nicht gespeichert</span> : null}
      <button type="button" className="knopf knopf--haupt" id="pst-speichern" disabled={laeuft || !geaendert} onClick={speichern}>Speichern</button>
    </div>
  ) : null;

  // Stammdaten (seit 1.837.0, Wunsch Patrick 25. November 2026: „prüfbericht
  // soll im qs selber bearbeitet werden nicht stammdaten, dort soll dan nur
  // hacken gesetzt werden was notwendig ist“): nur die Arten, AQL und Niveau
  if (!qs) return (
    <section className="karte hocoteil__karte pst" id="pst">
      <div className="karte__kopf"><h2>Prüfung</h2>
        <span className="klein">was bei jedem Auftrag geprüft werden muss</span>
        {/* Knopf Prüfbericht (seit 1.908.0, Wunsch Patrick 27. November 2026: „einfach im Feld
            Prüfung noch einen Button Prüfbericht, und dann springt es zu QS und macht den Bericht
            auf als Vorlage zum Bearbeiten“) */}
        <button type="button" className="knopf knopf--klein" id="pst-zu-qs" style={{ marginLeft: "auto" }}
          title="In QS → Prüfberichte die Masse dieser HOCO Nr. bearbeiten" onClick={() => masseInQsOeffnen(hoco)}>
          📄 Prüfbericht{anzahl ? " (" + anzahl + " Masse)" : ""}</button></div>
      <div className="pst-arten">
        <b>Nötig bei jedem Auftrag:</b>
        {ARTEN.map((a) => (
          <label key={a.id} className={"pb-wahl" + (w.arten.includes(a.id) ? " pb-wahl--an" : "")} data-pstart={a.id}>
            <input type="checkbox" checked={w.arten.includes(a.id)} disabled={!schreibt} onChange={() => artUm(a.id)} /> {a.name}
          </label>
        ))}
      </div>
      {w.arten.includes("aql") ? (
        <div className="pst-zeile">
          <label>AQL<select value={String(w.aql === "" ? "" : w.aql)} disabled={!schreibt} onChange={(e) => setW({ ...w, aql: e.target.value === "" ? "" : Number(e.target.value) })}>
            <option value="">1.0 (Vorgabe)</option>{AQL_WERTE.map((a) => <option key={a} value={String(a)}>{a}</option>)}</select></label>
          <label>Prüfniveau<select value={w.niveau} disabled={!schreibt} onChange={(e) => setW({ ...w, niveau: e.target.value })}>
            <option value="">II (Vorgabe)</option><option>I</option><option>II</option><option>III</option></select></label>
        </div>
      ) : null}
      {knoepfeUnten(false)}
    </section>
  );

  return (
    <section className="karte pst" id="pst">
      <div className="karte__kopf">
        {zurueck ? <button type="button" className="knopf knopf--klein" id="pst-zurueck" onClick={zurueck}>{zurueckText}</button> : null}
        <h2>Prüfmasse {hoco}</h2>
        <span className="klein">{anzahl} Masse · gilt für alle Prüfprotokolle dieser HOCO Nr.</span></div>

      <div className="pst-zeile">
        {KOPF.map(([n, t]) => (
          <label key={n}>{t}<input value={w.kopf[n] || ""} disabled={!schreibt} onChange={(e) => setW({ ...w, kopf: { ...w.kopf, [n]: e.target.value } })} /></label>
        ))}
      </div>

      {st.aus === "excel" ? <p className="hinweis">Diese Masse kommen aus einem früher abgelegten Excel. Bitte prüfen und speichern, danach gilt nur noch, was hier steht.</p> : null}
      <div className="pst-blattknopf">
        <button type="button" className="knopf knopf--haupt" id="pst-blatt-auf" onClick={() => setBlatt(true)}>📄 Masse-Blatt öffnen</button>
        <span className="klein">{anzahl
          ? anzahl + " Masse" + (w.zeilen.some((z) => z.abschnitt) ? " in " + w.zeilen.filter((z) => z.abschnitt).length + " Abschnitten" : "")
          : "Noch keine Masse. Öffne das Blatt und trage sie ein."}</span>
      </div>
      {blatt ? createPortal(<MasseBlatt w={w} hoco={hoco} schreibt={schreibt} kopfSetzen={(k, x) => setW((y) => ({ ...y, kopf: { ...y.kopf, [k]: x } }))} zeileSetzen={zeileSetzen} zeileWeg={zeileWeg} zeilenLeeren={zeilenLeeren} zeilenWeg={zeilenWeg} zeileDazu={zeileDazu}
        schieben={schieben} neuFokus={neuFokus} geaendert={geaendert} laeuft={laeuft} speichern={speichern} zu={() => setBlatt(false)} />, document.body) : null}
      {lehren.lehren.length ? <p className="klein">Benötigte Lehren: {lehren.lehren.map((l) => l.name + " " + l.mass).join(" · ")}</p> : null}
      {/* Kein Knopf „Excel einlesen“ mehr (Patrick 27. November 2026: „reicht per Ordner,
          eines Tages braucht es ihn gar nicht mehr“); Excel kommt über den Ordner-Abgleich. */}
      {knoepfeUnten(false)}
    </section>
  );
}

function Knoepfe({ i, schieben, weg }) {
  return <>
    <button type="button" className="knopf knopf--klein" title="Nach oben" onClick={() => schieben(i, -1)}>↑</button>
    <button type="button" className="knopf knopf--klein" title="Nach unten" onClick={() => schieben(i, 1)}>↓</button>
    <button type="button" className="knopf knopf--klein knopf--gefahr-leise" title="Zeile löschen" data-pstweg="" onClick={weg}>✕</button>
  </>;
}

// ---------- Masse-Blatt: A4 hochkant wie das Prüfprotokoll, eine Zeile je Mass ----------
// Wunsch Patrick 24. November 2026: „wie ein A4 aufgehen … nicht per Tabelle
// direkt … automatisch auf einer weiteren Seite, wenn es mehr sind … Abschnitte“.
// Seiten nach Anzahl Zeilen: Seite 1 hat den Briefkopf und weniger Platz.
const JE_SEITE_1 = 20, JE_SEITE = 28;
function seitenTeilen(zeilen) {
  const s = [[]];
  zeilen.forEach((z, i) => {
    const max = s.length === 1 ? JE_SEITE_1 : JE_SEITE;
    // Abschnitt nicht allein unten auf einer Seite stehen lassen
    const voll = s[s.length - 1].length >= max || (z.abschnitt && s[s.length - 1].length >= max - 1);
    if (voll) s.push([]);
    s[s.length - 1].push({ z, i });
  });
  return s;
}

// Auch für die Vorlage in QS → Prüfberichte gebraucht (seit 1.872.0), dort
// mit eigenem Titel und Knopf Drucken (titel, weiterText, label, extra, zuText).
export function MasseBlatt({ w, hoco, schreibt, kopfSetzen, zeileSetzen, zeileWeg, zeilenLeeren, zeilenWeg, zeileDazu, schieben, neuFokus, geaendert, laeuft, speichern, zu, titel, weiterText, label, extra, zuText }) {
  const huelle = useRef(null);
  // Zeilen markieren wie in Excel (seit 1.786.0, Wunsch Patrick 24. November
  // 2026: „ganze Bereiche markieren, zum Beispiel leeren“): Zeilenkopf links
  // antippen, ziehen oder mit Shift erweitern, Strg einzeln dazu
  const [mark, setMark] = useState(() => new Set());
  const anker = useRef(null);
  const zieht = useRef(false);
  const idx = (id) => w.zeilen.findIndex((z) => z.id === id);
  const bereich = (a, b) => {
    const [i, j] = [idx(a), idx(b)].sort((x, y) => x - y);
    return new Set(w.zeilen.slice(i, j + 1).map((z) => z.id));
  };
  const kopfDown = (id) => (e) => {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (e.shiftKey && anker.current && idx(anker.current) >= 0) setMark(bereich(anker.current, id));
    else if (e.ctrlKey || e.metaKey) { setMark((m) => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n; }); anker.current = id; }
    else { anker.current = id; setMark(new Set([id])); }
    zieht.current = true;
  };
  useEffect(() => {
    const bewegt = (e) => {
      if (!zieht.current || !anker.current) return;
      const tr = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("tr[data-pstzeile]");
      if (tr) setMark(bereich(anker.current, tr.getAttribute("data-pstzeile")));
    };
    const los = () => { zieht.current = false; };
    window.addEventListener("pointermove", bewegt); window.addEventListener("pointerup", los);
    return () => { window.removeEventListener("pointermove", bewegt); window.removeEventListener("pointerup", los); };
  });
  // Nur ein Fenster, das über dem Blatt liegt (später angehängt), zählt;
  // das Fenster der Stammdaten darunter ist auch eine .dialog-huelle, sonst
  // schloss Escape statt des Blatts gleich die ganzen Stammdaten.
  const dialogDarueber = () => [...document.querySelectorAll(".dialog-huelle")].some((d) =>
    huelle.current && !d.contains(huelle.current) && (huelle.current.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING));
  const markiert = [...mark].filter((id) => idx(id) >= 0);
  const leeren = () => { if (markiert.length) zeilenLeeren(new Set(markiert)); };
  const loeschen = async () => {
    if (!markiert.length) return;
    const ok = await alt.nachfragen({ titel: "Zeilen löschen", text: markiert.length + (markiert.length === 1 ? " Zeile löschen?" : " Zeilen löschen?"), bestaetigen: "Löschen" });
    if (!ok) return;
    zeilenWeg(new Set(markiert)); setMark(new Set());
  };
  useEffect(() => {
    const t = (e) => {
      if (!markiert.length || dialogDarueber()) return;
      const imFeld = e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setMark(new Set()); return; }
      if (imFeld || !schreibt) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); leeren(); }
    };
    window.addEventListener("keydown", t, true);
    return () => window.removeEventListener("keydown", t, true);
  });
  const zuFragen = async () => {
    if (geaendert && schreibt) {
      const ok = await alt.nachfragen({ titel: "Noch nicht gespeichert", text: zuText || "Die Änderungen bleiben in den Stammdaten stehen, sind aber noch nicht gespeichert.", bestaetigen: "Trotzdem schliessen" });
      if (!ok) return;
    }
    zu();
  };
  useEffect(() => {
    const t = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || dialogDarueber()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      // Erst die Markierung aufheben, erst das nächste Escape schliesst
      if (markiert.length) { setMark(new Set()); return; }
      zuFragen();
    };
    window.addEventListener("keydown", t, true);
    return () => window.removeEventListener("keydown", t, true);
  });
  useEffect(() => {
    if (!neuFokus.current || !huelle.current) return;
    const el = huelle.current.querySelector('[data-pstfokus="' + neuFokus.current + '"]');
    neuFokus.current = null;
    if (el) { el.focus(); if (el.value === "Neuer Abschnitt") el.select(); el.scrollIntoView({ block: "nearest" }); }
  });
  // Zeichen und Form- und Lagetoleranzen ins zuletzt angetippte Feld Soll
  // (seit 1.867.0, Wunsch Patrick 26. November 2026: „die form und lage
  // toleranzen … als symbol einfügbar“)
  const sollFeld = useRef(null);
  const zeichenEinsetzen = (zeichen) => {
    const el = sollFeld.current;
    if (!el || !el.isConnected) { alt.meldung("Zuerst ins Feld Soll tippen.", "warn"); return; }
    const id = el.getAttribute("data-pstfokus");
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    const neu = el.value.slice(0, a) + zeichen + el.value.slice(b);
    zeileSetzen(id, "soll", neu);
    requestAnimationFrame(() => { try { el.focus(); el.setSelectionRange(a + zeichen.length, a + zeichen.length); } catch (_) { /* egal */ } });
  };
  // Lehren, die nur als Text dastehen, beim Öffnen gleich mit dem passenden Mittel der
  // Verwaltung verbinden (seit 1.939.0); was nicht passt, bleibt zum Wählen von Hand
  useEffect(() => {
    if (!schreibt) return;
    let weg = false;
    pmAutomatisch(w.zeilen, hoco).then((l) => {
      if (weg || !l.length) return;
      for (const { id, felder } of l) for (const [k, v] of Object.entries(felder)) zeileSetzen(id, k, v);
      alt.meldung(l.length + " Prüfmittel automatisch aus der Verwaltung gewählt. Bitte prüfen und speichern.", "gut");
    }, () => {});
    return () => { weg = true; };
  }, []);
  // Prüfmittel/Hinweis über ein kleines Fenster wählen (seit 1.897.0)
  const pmFenster = async (z) => {
    if (!schreibt) return;
    const r = await pmWaehlen(z, hoco);
    if (r) for (const [k, v] of Object.entries(r)) zeileSetzen(z.id, k, v);
  };
  // Bild je Mass: aus dem Excel gelesen, hochgeladen oder mit Strg + V
  const [laedt, setLaedt] = useState(null);
  const bildSetzen = async (id, datei) => {
    if (!datei || !/^image\//.test(datei.type || "")) { alt.meldung("Nur Bilder gehen hier.", "warn"); return; }
    setLaedt(id);
    try {
      const url = await massBildHochladen(hoco, datei);
      zeileSetzen(id, "_bild", null); zeileSetzen(id, "_bildUrl", null); zeileSetzen(id, "bild", url);
    } catch (f) { alt.meldung("Bild liess sich nicht hochladen: " + ((f && f.message) || f), "fehler"); }
    setLaedt(null);
  };
  const bildWeg = (id) => { zeileSetzen(id, "bild", ""); zeileSetzen(id, "_bild", null); zeileSetzen(id, "_bildUrl", null); };
  const bildWaehlen = (id) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => bildSetzen(id, inp.files && inp.files[0]);
    inp.click();
  };
  const einfuegen = (id) => (e) => {
    const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    bildSetzen(id, f);
  };
  const seiten = seitenTeilen(w.zeilen);
  const v = w.kopf || {};
  const enter = (i) => (e) => { if (e.key === "Enter") { e.preventDefault(); zeileDazu(false, i + 1); } };
  return (
    <div className="pst-blattfenster" ref={huelle} data-pstblatt="">
      <div className="pst-blattleiste">
        <b>{label || "Masse " + hoco}</b>
        <span className="klein">{w.zeilen.filter((z) => !z.abschnitt).length} Masse · {seiten.length} {seiten.length === 1 ? "Seite" : "Seiten"}</span>
        <span className="pst-platz" />
        {schreibt ? <>
          {markiert.length ? <span className="pst-markleiste" data-pstmarkleiste="">
            <b>{markiert.length} {markiert.length === 1 ? "Zeile" : "Zeilen"} markiert</b>
            <button type="button" className="knopf knopf--klein" id="pst-mark-leeren" onClick={leeren}>Leeren</button>
            <button type="button" className="knopf knopf--klein" id="pst-mark-weg" onClick={loeschen}>Löschen</button>
            <button type="button" className="knopf knopf--klein" onClick={() => setMark(new Set())}>Aufheben</button>
          </span> : null}
          <span className="pst-zeichen" data-pstzeichen="">
            {["Ø", "±"].map((z) => <button key={z} type="button" className="knopf knopf--klein" data-pstzeichen-knopf={z}
              title={z + " einfügen"} onMouseDown={(e) => e.preventDefault()} onClick={() => zeichenEinsetzen(z)}>{z}</button>)}
            <FormLage behalten={(e) => e.preventDefault()} einsetzen={zeichenEinsetzen} />
          </span>
          <button type="button" className="knopf knopf--klein" id="pst-mass-neu" onClick={() => zeileDazu(false)}>+ Mass</button>
          <button type="button" className="knopf knopf--klein" id="pst-abschnitt-neu" onClick={() => zeileDazu(true)}>+ Abschnitt</button>
          {geaendert ? <span className="klein pb-rot">Noch nicht gespeichert</span> : null}
          <button type="button" className="knopf knopf--haupt" id="pst-blatt-speichern" disabled={laeuft || !geaendert} onClick={speichern}>Speichern</button>
        </> : null}
        {extra || null}
        <button type="button" className="knopf knopf--klein" id="pst-blatt-zu" onClick={zuFragen}>Schliessen</button>
      </div>
      {/* Seit 1.938.0 sieht die Vorlage aus wie das Prüfprotokoll beim Ausfüllen, nur
          bearbeitbar (Patrick 27. November 2026: „die Vorlage zum Bearbeiten soll genau
          gleich anzeigen wie wenn man es ausfüllt“). Teil 1–5, FA, Maschine, Entscheid usw.
          stehen grau da, ausgefüllt werden sie erst im Protokoll. */}
      <div className="pst-seiten">
        {seiten.map((seite, n) => (
          <div className="pb-blatt pst-a4 hell-bleibt" key={n} data-pstseite={n + 1}>
            {n === 0 ? <>
              <div className="rkpdf pb-briefkopf" dangerouslySetInnerHTML={{ __html: "<style>" + STIL + "</style>" + briefkopf() }} />
              <h2 className="pb-blatt__titel">Prüfprotokoll</h2>
              <div className="pb-kopf pst-kopfraster">
                <div><small>HOCO Nr.</small><b>{hoco}</b></div>
                {KOPF.map(([k, t]) => <div key={k}><small>{t}</small>{kopfSetzen && schreibt
                  ? <input className="pst-kopffeld" data-pstkopffeld={k} value={v[k] || ""} placeholder="–" onChange={(e) => kopfSetzen(k, e.target.value)} />
                  : <b>{v[k] || "–"}</b>}</div>)}
                <div className="pst-grau"><small>Material</small><b>vom Auftrag</b></div>
                <div className="pst-grau"><small>Bestellte Menge</small><b>vom Auftrag</b></div>
              </div>
              <div className="pb-felder pst-grau"><label>FA Nr.<input disabled /></label><label className="pb-felder__rechts">Maschine<select disabled><option>vom Auftrag</option></select></label></div>
            </> : <p className="klein pst-a4-weiter">{weiterText || "Prüfprotokoll " + hoco + " · Fortsetzung"}</p>}
            <table className="pb-tabelle pst-a4-tabelle pst-wie-protokoll">
              <thead><tr>{schreibt ? <th className="pst-c-kopf" title="Zeilen markieren: antippen, ziehen, Shift oder Strg" /> : null}<th className="pst-c-nr">Nr.</th><th className="pst-c-soll">Soll</th>
                {[1, 2, 3, 4, 5].map((t) => <th key={t} className="pst-c-teil">Teil {t}</th>)}
                <th>Prüfmittel/Hinweis</th><th className="pst-c-ll" title="Kommt auf die Langläufer-Liste">LL</th>{schreibt ? <th className="pst-c-kn" /> : null}</tr></thead>
              <tbody>
                {seite.map(({ z, i }) => "abschnitt" in z ? (
                  <tr key={z.id} className={"pst-abschnitt pb-abschnitt" + (mark.has(z.id) ? " pst-markiert" : "")} data-pstzeile={z.id}>
                    {schreibt ? <td className="pst-c-kopf" data-pstkopf={z.id} onPointerDown={kopfDown(z.id)}>{i + 1}</td> : null}
                    <td colSpan={9}><input data-pstfokus={z.id} value={z.abschnitt} placeholder="Name des Abschnitts, z.B. Aussendurchmesser" disabled={!schreibt}
                      onChange={(e) => zeileSetzen(z.id, "abschnitt", e.target.value)} onKeyDown={enter(i)} /></td>
                    {schreibt ? <td className="pst-c-kn"><Knoepfe i={i} schieben={schieben} weg={() => zeileWeg(z.id)} /></td> : null}
                  </tr>
                ) : (
                  <tr key={z.id} className={mark.has(z.id) ? "pst-markiert" : ""} data-pstzeile={z.id}>
                    {schreibt ? <td className="pst-c-kopf" data-pstkopf={z.id} onPointerDown={kopfDown(z.id)}>{i + 1}</td> : null}
                    <td className="pst-c-nr"><input value={z.nr || ""} disabled={!schreibt} onChange={(e) => zeileSetzen(z.id, "nr", e.target.value)} /></td>
                    <td className="pst-c-soll"><div className="pst-sollzelle">
                      {bildVon(z) ? <img className="pst-massbild" src={bildVon(z)} alt="Mass" data-pstbild={z.id}
                        onClick={() => alt.betrachter && alt.betrachter(bildVon(z), "Mass " + (z.nr || ""), false)} /> : null}
                      <input data-pstfokus={z.id} className="pst-soll" value={z.soll || ""} disabled={!schreibt} placeholder={bildVon(z) ? "Soll (frei)" : "z.B. Ø 6.00 ±0.02"}
                        onFocus={(e) => { sollFeld.current = e.target; }}
                        onChange={(e) => zeileSetzen(z.id, "soll", e.target.value)} />
                      {schreibt && bildVon(z) ? (laedt === z.id ? <span className="klein">…</span>
                        : <button type="button" className="pst-bildknopf" title="Bild entfernen" data-pstbildweg={z.id} onClick={() => bildWeg(z.id)}>✕</button>) : null}
                    </div>
                    {!String(z.soll || "").trim() && z.tol_min == null && z.tol_max == null ? null : (() => { const t = toleranz(z.soll);
                      // Min und Max klein unter dem Soll, wie gerechnet; was man ändert, gilt (tolVon)
                      const feld = (k, auto) => <input className="pst-tol" data-psttol={z.id + ":" + k} inputMode="decimal" disabled={!schreibt}
                        value={z["tol_" + k] !== undefined && z["tol_" + k] !== null ? z["tol_" + k] : auto === null || auto === undefined ? "" : String(auto)}
                        placeholder={k === "min" ? "Min" : "Max"} title={k === "min" ? "Kleinstes Mass" : "Grösstes Mass"}
                        onChange={(e) => zeileSetzen(z.id, "tol_" + k, e.target.value)} />;
                      return <span className="pst-tolfelder" title="Toleranz: kleinstes und grösstes Mass">{feld("min", t ? t.min : null)}<span>–</span>{feld("max", t ? t.max : null)}</span>; })()}
                    </td>
                    {[0, 1, 2, 3, 4].map((t) => <td key={t} className="pst-c-teil"><span className="pst-teilfeld" /></td>)}
                    <td><input className="pst-pm" data-pstpm={z.id} readOnly value={pmAnzeige(z)} disabled={!schreibt} placeholder={schreibt ? "wählen …" : ""}
                      title="Antippen: Prüfmittel, Prüfstifte oder Hinweis wählen"
                      onClick={() => pmFenster(z)} onKeyDown={(e) => { if (e.key === " " || e.key === "F2") { e.preventDefault(); pmFenster(z); } else enter(i)(e); }} /></td>
                    <td className="pst-c-ll"><input type="checkbox" checked={!!z.ll} disabled={!schreibt} onChange={() => zeileSetzen(z.id, "ll", !z.ll)} /></td>
                    {schreibt ? <td className="pst-c-kn">
                      <button type="button" className="knopf knopf--klein" title="Abschnitt davor einfügen" data-pstabschnittdavor="" onClick={() => zeileDazu(true, i)}>§</button>
                      <Knoepfe i={i} schieben={schieben} weg={() => zeileWeg(z.id)} /></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {!w.zeilen.length ? <p className="hinweis">Noch keine Masse. Mit „+ Mass“ beginnen, Prüfmittel/Hinweis antippen zum Wählen, Enter dort gibt die nächste Zeile.</p> : null}
            {n === seiten.length - 1 ? <div className="pst-grau pst-fuss-vorschau">
              <div className="pb-entscheid"><b>Prüf-Entscheid</b>{["Freigabe", "Nacharbeit / Sortieren", "Neuanfertigung"].map((x) => <label key={x} className="pb-wahl"><input type="radio" disabled /> {x}</label>)}</div>
              <label className="pst-fuss-feld">Bemerkung<textarea disabled rows={2} /></label>
              <div className="pst-fuss-zeile"><label>Datum<input disabled /></label><label>Visum<input disabled /></label></div>
            </div> : null}
            <p className="pst-a4-fuss klein">Seite {n + 1} von {seiten.length}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
