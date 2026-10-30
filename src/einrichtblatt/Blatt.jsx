// =================================================================
//  EINRICHTBLATT IN DER APP
//  Das Blatt wird beim Öffnen aus den gespeicherten Angaben gezeichnet,
//  im Aussehen wie das bisherige Excel „Werkzeug-Protokoll“ des Typs.
//  Jeder Typ hat seine Hofer-Version (vorlagen.js), abgeleitet aus
//  seinen bisherigen Excel-Blättern (Wunsch Patrick, 23. Oktober 2026:
//  „baue die Testseite für alle Maschinen, nicht nur SW-20“).
//
//  Im Bearbeiten füllt man den Kopf direkt im Blatt aus. Was zur HOCO
//  Nr. gehört, geht in die Stammdaten, Stückzeit und Laufzeit zur HOCO
//  Nr. und dem Typ, der Rest ans Blatt. Werkzeuge schreibt man nicht,
//  man wählt sie wie beim Bestellen (neu anlegen geht dort auch).
// =================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { dokZeigen } from "../teile/DokAbruf.jsx";
import { inDerAppDrucken } from "../teile/drucken.js";
import { werkzeugWaehlen, positionOeffnen } from "../seiten/bestellungen/PositionFenster.jsx";
import { excelVorlesen, blattVonAnderem, blattLaden, blattSpeichern, blattIstGut, leeresBlatt, stammSpeichern, typSpeichern, artikelBildSetzen,
  artikelHolen, artikelBezeichnung, STAMM_FELDER, WASCHGEBINDE, prgNummern, platzInGebrauch } from "./daten.js";
import { bildDaten, platzBild, eigeneBilder, sinnbilder, bildSchluesselVon } from "./bilder.js";
import { eigenesBildHochladen, eigenesBildLoeschen, freieBilderSpeichern, freiesBildHochladen } from "./daten.js";
import { vorlageFuer, reihenMitRest, platzName, platzGruppe } from "./vorlagen.js";
import { TextBlatt, textBearbeiten } from "../infoboard/TextFeld.jsx";
import { ohneFa } from "./excelEinlesen.js";
import { istMaterialBlatt, MATERIAL_OHNE, materialArtBez } from "./jeMaterial.js";

// Ein Bild aus der Bibliothek: Sinnbild der Norm oder hochgeladen
const BILDER_AN = false;

export function BildZeichnung({ schluessel, className }) {
  const b = bildDaten(schluessel);
  if (b && b.svg) return <span className={"eba-svg " + (className || "")} data-bild={schluessel} title={b.name}
    dangerouslySetInnerHTML={{ __html: b.svg }} />;
  return b && b.url ? <span className={"eba-svg eba-svg--foto " + (className || "")} data-bild={schluessel} title={b.name}>
    <img src={b.url} alt="" /></span> : null;
}

// Farben der Paths für Typen ohne eigene Farben in der Vorlage
const PFADFARBE = { 1: "#FFC000", 2: "#00B0F0", 3: "#00B050", 4: "#B4A7D6", 5: "#F4B183", 6: "#A9D18E" };
const GRAU = "#d0d0d0";

// Die Vorlage des Typs; beim SW-20 gilt ein Aufbau, den jemand beim Typ
// hinterlegt hat (machine_types.blatt_aufbau), wie bisher
export function blattVorlage(typ, paths) {
  const v = vorlageFuer(typ, paths);
  if (v.art === "sw" && typ && typ.blatt_aufbau && Array.isArray(typ.blatt_aufbau.reihen)) {
    v.reihen = typ.blatt_aufbau.reihen.map((r) => Array.from({ length: v.spalten }, (_, i) => r[i] || null));
  }
  return v;
}

function pfadVonPlatz(paths) {
  const k = {};
  paths.forEach((p) => (p.type_slots || []).forEach((s) => { if (s.tool_nr) k[s.tool_nr] = p; }));
  return k;
}

// Die Plätze, die im Aufbau des Typs stehen (Maschinen → ⚙ Typ → Paths
// mit Plätzen); beim Index je Revolver als „R2-T7“. Ohne Aufbau null,
// dann gelten alle Plätze der Vorlage wie bisher
function aufbauPlaetze(paths, art) {
  const s = new Set();
  (paths || []).forEach((p) => (p.type_slots || []).forEach((sl) => {
    if (sl.tool_nr) s.add(art === "index" ? "R" + p.nummer + "-" + sl.tool_nr : sl.tool_nr);
  }));
  return s.size ? s : null;
}

const heute = () => { const d = new Date(); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getFullYear()).slice(2); };
const leer = (w) => w === undefined || w === null ? "" : w;

// Wert eines Kopffelds, je nachdem, wo es gespeichert ist
function feldWert(f, d) {
  if (f.art === "fest") return f.wert !== undefined ? f.wert : d.blatt.hoco_nr;
  if (f.art === "stamm") return leer(d.teil[f.feld]);
  if (f.art === "typ") return leer(d.typDaten[f.feld]);
  if (f.art === "prg") {
    const pr = d.blatt.programme || {};
    return f.feld === "nr" ? (pr.nr !== undefined ? pr.nr : prgNummern(d.blatt)) : leer(pr[f.feld]);
  }
  if (f.art === "blatt") return leer(d.blatt[f.feld]);
  if (f.art === "kopf") return leer((d.blatt.kopf || {})[f.feld]);
  return "";
}

// So steht es auf dem Blatt
function feldText(f, w, d) {
  if (f.feld === "material") return [w, d.teil.material_groesse].filter(Boolean).join(" ");
  if (f.typVorne) return (d.typ.name || "") + (w ? "   " + w : "");
  if (f.einheit) {
    if (w === "" || isNaN(Number(w))) return w;
    return (f.feld === "stueckzeit_s" ? Math.round(Number(w) * 10) / 10 : w) + " " + f.einheit;
  }
  return w;
}

// Text, der immer auf einer Zeile bleibt: passt er nicht, wird die
// Schrift kleiner statt umzubrechen (Material mit Mass, Wunsch Patrick
// 26. Oktober 2026)
function EineZeile({ text }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = "";
    const voll = parseFloat(getComputedStyle(el).fontSize) || 14;
    const breit = el.parentElement ? el.parentElement.clientWidth - 8 : 0;
    if (breit > 0 && el.scrollWidth > breit) el.style.fontSize = Math.max(7, Math.floor(voll * breit / el.scrollWidth * 10) / 10) + "px";
  }, [text]);
  return <span ref={ref} className="eba-eine-zeile" data-eba-eine-zeile="">{text}</span>;
}

// Eingetippte T-Nr. ordentlich schreiben: „3121“ oder „t 3121“ → „T3121“
function tnrSchreiben(w) {
  const s = String(w || "").trim().replace(/\s+/g, "");
  if (!s) return "";
  return /^\d+$/.test(s) ? "T" + s : s.replace(/^t(?=\d)/, "T");
}

// Schriftfarben der Notiz im Platz; Schwarz ist die Vorgabe und wird
// nicht gespeichert
const GEO_SCHWARZ = "#000000";
const GEO_FARBEN = [["Schwarz", GEO_SCHWARZ], ["Rot", "#e03030"], ["Blau", "#1f5fd6"], ["Grün", "#1a8f3c"], ["Orange", "#e07a00"]];

// Schriftgrösse der Notiz im Platz von Hand (Punkte auf dem Blatt);
// leer = Auto, so gross wie das Feld es zulässt
const GEO_GROESSE_MIN = 6, GEO_GROESSE_MAX = 40, GEO_GROESSE_START = 14;

// Notiz (Geo-Offset) im Bildfeld eines Platzes: immer waagrecht mittig;
// ohne Bild auch senkrecht mittig und so gross, wie das Feld es zulässt
// (Wunsch Patrick 29. Oktober 2026: „schön mitte zentriert, Höhe und
// Breite anpassen“). Mit Bild bleibt sie klein über dem Bild.
function GeoText({ text, mitBild, farbe, fett, groesse }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const feld = el && el.parentElement;
    if (!el || !feld) return;
    const passen = () => {
      el.style.fontSize = "";
      el.style.lineHeight = "";
      // Von Hand gewählte Grösse (Wunsch Patrick 30. Oktober 2026); passt
      // sie nicht ins Feld, wird sie nur so weit kleiner, dass nichts
      // abgeschnitten wird
      if (groesse) { el.style.fontSize = groesse + "px"; el.style.lineHeight = "1.15"; }
      if (mitBild) return;
      const b = feld.clientWidth - 4, h = feld.clientHeight - 2;
      if (b <= 0 || h <= 0) return;
      const passt = (px) => {
        el.style.fontSize = px + "px";
        el.style.lineHeight = "1.15";
        return el.scrollWidth <= b && el.scrollHeight <= h;
      };
      let lo = Math.min(7, groesse || 7), hi = groesse || 26;
      if (passt(hi)) return;
      while (hi - lo > 0.25) { const m = (lo + hi) / 2; if (passt(m)) lo = m; else hi = m; }
      passt(Math.floor(lo * 4) / 4);
    };
    passen();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(passen);
    ro.observe(feld);
    return () => ro.disconnect();
  }, [text, mitBild, fett, groesse]);
  return <span ref={ref} className={"eba-geo" + (fett ? " eba-geo--fett" : "")} data-geo=""
    style={farbe ? { color: farbe, WebkitTextFillColor: farbe } : undefined}>{text}</span>;
}

// Ein Eingabefeld im Kopf
function KopfEingabe({ f, wert, aendern, d }) {
  const id = f.art + ":" + f.feld;
  if (f.art === "fest") return <span>{wert}</span>;
  if (f.auswahl === "waschgebinde") {
    const liste = [...new Set(WASCHGEBINDE.concat(wert ? [wert] : []))];
    return <select className="eba-ein" data-eba-feld={id} value={wert} onChange={(e) => aendern(f, e.target.value)}>
      <option value="">—</option>{liste.map((x) => <option key={x} value={x}>{x}</option>)}</select>;
  }
  const feld = <input className="eba-ein" data-eba-feld={id} value={wert} inputMode={f.zahl ? "decimal" : undefined}
    placeholder={f.platzhalter || ""} onChange={(e) => aendern(f, e.target.value)} />;
  // Material ist ein einziges Feld mit allem, auch dem Mass (Wunsch
  // Patrick 26. Oktober 2026: „nur eine Zeile mit allem, also Mass und
  // so“). Ein bisher getrennt gespeichertes Mass steht vorne mit drin und
  // wandert beim ersten Ändern ins Material.
  if (f.feld === "material") {
    return <input className="eba-ein" data-eba-feld={id} value={feldText(f, wert, d)}
      onChange={(e) => { aendern(f, e.target.value); if (d.teil.material_groesse) aendern({ art: "stamm", feld: "material_groesse" }, ""); }} />;
  }
  if (f.typVorne) return <span className="eba-ein-zwei"><span>{d.typ.name}</span>{feld}</span>;
  if (f.einheit) return <span className="eba-ein-zwei">{feld}<small>{f.einheit}</small></span>;
  return feld;
}

// ---------------- Das Blatt selbst ----------------
// Immer genau ein A4 quer, am Bildschirm wie auf dem Papier. Alle Reihen
// gleich hoch, jedes Werkzeugfeld bei allen Typen gleich aufgebaut
// (Wunsch Patrick, 24. Oktober 2026): Platz mit HD und Standzeit, zwei
// Zeilen Aufgabe („Bohren“ / „Ø 3.50“), Platz fürs Bild, Lieferant und
// Artikel-Nr. Was nicht passt, wird abgeschnitten statt das Blatt zu
// sprengen. Der Kopf nimmt so viel Platz, wie der Typ Angaben hat, der
// Rest darunter gehört den Bemerkungen.
// teil und typDaten sind im Bearbeiten die Entwürfe; aendern(f, wert)
// ändert ein Kopffeld
// pruefen: eingelesene Werkzeuge ohne hinterlegten oder bestätigten
// Artikel rot umranden (nur im Fenster, nicht im Pad und nicht im Druck)
export function BlattSeite({ typ, paths, teil, typDaten, blatt, auftrag, bearbeiten, platzWahl, aendern, aktiv, artikelBilder, pruefen, tauschen, wechsel, bestellen, bilderAendern }) {
  const vorlage = useMemo(() => blattVorlage(typ, paths), [typ, paths]);
  const reihen = useMemo(() => reihenMitRest(vorlage, blatt.plaetze), [vorlage, blatt.plaetze]);
  const pfad = useMemo(() => pfadVonPlatz(paths), [paths]);
  const aufbau = useMemo(() => aufbauPlaetze(paths, vorlage.art), [paths, vorlage.art]);
  const plaetze = blatt.plaetze || {};
  const { kopfAb, kopfBreite } = vorlage;
  const d = { blatt, teil, typDaten, typ };
  // Geometriedaten nur, wo die Vorlage sie hat oder schon etwas steht
  const jeMat = istMaterialBlatt(blatt.hoco_nr);
  const felder = vorlage.felder.filter((f) => f.feld !== "geometrie" || vorlage.art === "sw" || blatt.geometrie)
    // Blatt je Materialgrösse: HOCO Nr. vom Auftrag, Bezeichnung fest,
    // ohne Zeichnung, Index und N1000 (seit 1.298.0)
    .filter((f) => !jeMat || !MATERIAL_OHNE.includes(f.feld))
    .map((f) => !jeMat ? f : f.art === "fest" ? Object.assign({}, f, { wert: auftrag || "" })
      : f.feld === "bezeichnung" ? Object.assign({}, f, { art: "fest", wert: materialArtBez(blatt.hoco_nr) }) : f);
  // Die FA Nr. gehört nicht mehr ins Blatt, auch nicht in die Bemerkung
  const bemerkung = ohneFa(blatt.bemerkung);

  // Star wie im Excel: Plätze in Gebrauch in der Farbe des Typs, leere grau
  const inGebrauch = platzInGebrauch;
  const farbeVon = (nr) => (vorlage.farben && vorlage.farben[nr])
    || (vorlage.typFarbe ? (inGebrauch(plaetze[nr] || {}) ? vorlage.typFarbe : GRAU)
      : pfad[nr] ? PFADFARBE[pfad[nr].nummer] || GRAU : GRAU);
  const zelle = (nr, ri, si) => {
    const p = plaetze[nr] || {};
    // Keine Bilder und Sinnbilder mehr in den Werkzeugfeldern (seit 1.279.1,
    // Wunsch Patrick 30. Oktober 2026); gewählte Bilder bleiben in den
    // Daten, falls sie doch zurückkommen sollen
    const bild = BILDER_AN ? platzBild(p, artikelBilder) : null;
    // Beim Ansehen: antippen bestellt das Werkzeug (seit 1.271.0)
    const bestellbar = !bearbeiten && bestellen && p.article_id && !p.ungeprueft;
    // Ein Platz, den die Maschine laut Aufbau nicht hat, bleibt als leeres
    // Feld stehen, ohne T-Nr. und ohne Antippen (Wunsch Patrick 30. Oktober
    // 2026: „nur die Werkzeuge, die bei Aufbau auch drin sind“); steht dort
    // aber schon ein Werkzeug, bleibt er wie bisher, damit nichts verschwindet
    const aus = !!(aufbau && !aufbau.has(nr) && !inGebrauch(p));
    if (aus) {
      return <div key={nr} className="eba-zelle eba-platz eba-platz--aus" data-platz-aus={nr}
        style={{ gridRow: ri + 1, gridColumn: si + 1 }}>
        <div className="eba-tk" style={{ background: GRAU }} /><div className="eba-tat" /><div className="eba-mass" />
        <div className="eba-bild" /><div className="eba-her" /><div className="eba-wz" /><div className="eba-wz-bez" /></div>;
    }
    return (
      <div key={nr} className={"eba-zelle eba-platz" + (bearbeiten ? " eba-platz--bearbeiten" : "") + (aktiv === nr ? " eba-platz--aktiv" : "")
        + (pruefen && werkzeugOffen(p) ? " eba-platz--pruefen" : "") + (wechsel === nr ? " eba-platz--wechsel" : "")
        + (wechsel && wechsel !== nr ? " eba-platz--ziel" : "") + (bestellbar ? " eba-platz--bestellbar" : "")}
        title={bestellbar ? "Antippen: " + (p.werkzeug || "Werkzeug") + " bestellen" : undefined}
        style={{ gridRow: ri + 1, gridColumn: si + 1 }} data-platz={nr}
        onClick={bearbeiten ? () => platzWahl(nr) : bestellbar ? () => bestellen(nr, p) : undefined}
        // Am Computer ein Werkzeug direkt auf einen anderen Platz ziehen,
        // steht dort schon eins, tauschen die beiden (Wunsch Patrick 29. Oktober 2026)
        draggable={!!(bearbeiten && tauschen && inGebrauch(p))}
        onDragStart={bearbeiten && tauschen ? (e) => { e.dataTransfer.setData("text/plain", "eba-platz:" + nr); e.dataTransfer.effectAllowed = "move"; } : undefined}
        onDragOver={bearbeiten && tauschen ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
        onDrop={bearbeiten && tauschen ? (e) => {
          e.preventDefault();
          const m = /^eba-platz:(.+)$/.exec(e.dataTransfer.getData("text/plain") || "");
          if (m && m[1] !== nr) tauschen(m[1], nr);
        } : undefined}>
        <div className="eba-tk" style={{ background: farbeVon(nr), "--eba-schrift": vorlage.schrift }}>
          {p.standzeit ? <span className="eba-tk-links"><span className="eba-wert">{alt.zahlText(p.standzeit)}</span></span> : null}
          <b data-eba-tnr={p.tnr ? "" : undefined}>{p.tnr || platzName(nr)}</b>
          {p.hd && <span className="eba-tk-rechts"><span className="eba-hd" data-hd="">HD</span></span>}</div>
        <div className="eba-tat">{p.taetigkeit || ""}</div>
        <div className="eba-mass">{p.mass || ""}</div>
        {/* Geo-Offset nur, wo nötig: steht über dem Bild, das Bild wird
            kleiner oder fällt ganz weg (Wunsch Patrick, 24. Oktober 2026) */}
        <div className={"eba-bild" + (p.geo ? " eba-bild--geo" + (bild && !p.ohneBild ? "" : " eba-bild--nurgeo") : "")}>
          {p.geo ? <GeoText text={p.geo} mitBild={!!(bild && !p.ohneBild)} farbe={p.geoFarbe} fett={!!p.geoFett} groesse={p.geoGroesse || null} /> : null}
          {bild && !p.ohneBild ? <BildZeichnung schluessel={bild.schluessel} /> : null}</div>
        <div className="eba-her">{p.hersteller || ""}{p.spezial && p.article_id &&
          <span className="eba-stern" title="Spezialwerkzeug" data-eba-stern="">★</span>}</div>
        {/* Drei Zeilen: Lieferant, Artikel-Nr., Beschreibung (Wunsch
            Patrick, 26. Oktober 2026); ein nur selbst zugeordneter Artikel
            zeigt weiter nur den Text aus dem Excel */}
        <div className={"eba-wz" + (bearbeiten && p.werkzeug && !p.article_id ? " eba-wz--frei" : "")}>{p.werkzeug || ""}</div>
        <div className="eba-wz-bez" data-wz-bez="">{p.werkzeug && p.article_id && !p.ungeprueft && p.bezeichnung ? p.bezeichnung : ""}</div>
      </div>
    );
  };

  const zeile = (f) => {
    const w = feldWert(f, d);
    const inhalt = bearbeiten ? <KopfEingabe f={f} wert={w} aendern={aendern} d={d} />
      : f.feld === "material" ? <EineZeile text={feldText(f, w, d)} /> : feldText(f, w, d);
    if (f.farbe) return <div key={f.art + f.feld} className="eba-prg"><span style={{ background: f.farbe }}>{f.label}</span><b>{inhalt}</b></div>;
    return <div key={f.art + f.feld} className="eba-kz" data-eba-zeile={f.feld}><span>{f.label}</span><b>{inhalt}</b></div>;
  };
  return (
    <div className="eba-seite" data-eba-seite="" data-eba-vorlage={vorlage.art}>
      <div className="eba-titel"><span /><b>{vorlage.titel}</b><span className="eba-datum">{heute()}</span></div>
      <div className="eba-raster" style={{ gridTemplateRows: "repeat(" + reihen.length + ", minmax(0, 1fr))",
        gridTemplateColumns: vorlage.breiten || "repeat(" + vorlage.spalten + ", minmax(0, 1fr))" }}>
        {reihen.map((r, ri) => r.map((nr, si) => (nr ? zelle(nr, ri, si)
          : (ri >= kopfAb && si < kopfBreite) ? null
          : <div key={"l" + ri + "-" + si} className="eba-zelle eba-leer" style={{ gridRow: ri + 1, gridColumn: si + 1 }} />)))}
        <div className={"eba-zelle eba-kopf" + (kopfBreite < 2 ? " eba-kopf--schmal" : "") + (bearbeiten ? " eba-kopf--bearbeiten" : "")}
          style={{ gridRow: (kopfAb + 1) + " / " + (reihen.length + 1), gridColumn: "1 / " + (kopfBreite + 1) }}
          data-eba-kopf="" onClick={(e) => e.stopPropagation()}>
          {felder.filter((f) => f.farbe).length > 0 && <div className="eba-prgs">{felder.filter((f) => f.farbe).map(zeile)}</div>}
          {/* Die Revolver stehen im Index-Excel über dem Kopf */}
          {vorlage.legende && <div className="eba-legende">{vorlage.legende.map(([t, f]) =>
            <span key={t} style={{ background: f, "--eba-schrift": vorlage.schrift }}>{t}</span>)}</div>}
          <div className="eba-tab">{felder.filter((f) => !f.farbe).map(zeile)}</div>
          {bearbeiten
            ? <textarea className="eba-ein eba-bem-ein" data-eba-feld="blatt:bemerkung" placeholder="Bemerkungen, z. B. Abgreifen mit Schnabelzange"
                value={leer(blatt.bemerkung)} onChange={(e) => aendern({ art: "blatt", feld: "bemerkung" }, e.target.value)} />
            : <div className="eba-bem" data-eba-bem="">{bemerkung}</div>}
        </div>
      </div>
      <FreieBilder bilder={(blatt.kopf || {}).bilder} aendern={bilderAendern} />
    </div>
  );
}

// ---------------- Freie Bilder auf dem Blatt ----------------
// Liegen über allem, wo man sie hinzieht (Wunsch Patrick 30. Oktober
// 2026: „wo es Platz hat ein Bild rein, um zu wissen, wie es aussehen
// soll“). Antippen wählt, ziehen verschiebt, die Ecke unten rechts
// ändert die Grösse, ✕ löscht. Jede Änderung geht gleich an aendern.
// Ohne aendern nur zum Ansehen, Klicks gehen dann durch zum Platz.
function FreieBilder({ bilder, aendern }) {
  const [wahl, setWahl] = useState(null);
  const [zug, setZug] = useState(null);   // { id, x, y, w } während des Ziehens
  const liste = Array.isArray(bilder) ? bilder : [];
  useEffect(() => {
    if (!wahl || !aendern) return undefined;
    const weg = (e) => { if (!e.target.closest || !e.target.closest("[data-eba-fbild]")) setWahl(null); };
    document.addEventListener("pointerdown", weg, true);
    return () => document.removeEventListener("pointerdown", weg, true);
  }, [wahl, !!aendern]);
  if (!liste.length) return null;
  const greifen = (e, b, art) => {
    if (!aendern || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    setWahl(b.id);
    const seite = e.currentTarget.closest("[data-eba-seite]");
    if (!seite) return;
    const r = seite.getBoundingClientRect();
    const start = { cx: e.clientX, cy: e.clientY, x: b.x, y: b.y, w: b.w };
    let jetzt = null;
    const ziehen = (ev) => {
      const dx = (ev.clientX - start.cx) / r.width * 100, dy = (ev.clientY - start.cy) / r.height * 100;
      if (!jetzt && Math.abs(ev.clientX - start.cx) + Math.abs(ev.clientY - start.cy) < 3) return;
      jetzt = art === "gross"
        ? { id: b.id, x: b.x, y: b.y, w: Math.max(3, Math.min(100 - b.x, start.w + dx)) }
        : { id: b.id, x: Math.max(-b.w / 2, Math.min(100 - b.w / 2, start.x + dx)), y: Math.max(-5, Math.min(95, start.y + dy)), w: b.w };
      setZug(jetzt);
    };
    const los = () => {
      window.removeEventListener("pointermove", ziehen);
      window.removeEventListener("pointerup", los);
      window.removeEventListener("pointercancel", los);
      setZug(null);
      if (jetzt) {
        const r1 = (n) => Math.round(n * 100) / 100;
        aendern(liste.map((x) => (x.id === b.id ? Object.assign({}, x, { x: r1(jetzt.x), y: r1(jetzt.y), w: r1(jetzt.w) }) : x)));
      }
    };
    window.addEventListener("pointermove", ziehen);
    window.addEventListener("pointerup", los);
    window.addEventListener("pointercancel", los);
  };
  const loeschen = async (e, b) => {
    e.stopPropagation();
    if (!(await alt.nachfragen({ titel: "Bild löschen", text: "Dieses Bild vom Blatt löschen?", bestaetigen: "Löschen", gefahr: true }))) return;
    setWahl(null);
    aendern(liste.filter((x) => x.id !== b.id));
  };
  return (
    <div className={"eba-fbilder" + (aendern ? " eba-fbilder--aendern" : "")} data-eba-fbilder="">
      {liste.map((b0) => {
        const b = zug && zug.id === b0.id ? Object.assign({}, b0, zug) : b0;
        const an = aendern && wahl === b.id;
        return (
          <div key={b.id} className={"eba-fbild" + (an ? " eba-fbild--an" : "")} data-eba-fbild={b.id}
            style={{ left: b.x + "%", top: b.y + "%", width: b.w + "%" }}
            onPointerDown={(e) => greifen(e, b, "ziehen")} onClick={(e) => e.stopPropagation()}>
            <img src={b.url} alt="" draggable={false} crossOrigin="anonymous" />
            {an && <>
              <button className="eba-fbild-weg" data-eba-fbild-weg="" title="Bild löschen"
                onPointerDown={(e) => e.stopPropagation()} onClick={(e) => loeschen(e, b)}>✕</button>
              <span className="eba-fbild-gross" data-eba-fbild-gross="" title="Ziehen: grösser oder kleiner"
                onPointerDown={(e) => greifen(e, b, "gross")} /></>}
          </div>
        );
      })}
    </div>
  );
}

// Ein Platz braucht noch eine Hand: Werkzeug ohne Artikel, oder der
// Artikel kommt nur vom Einlesen und ist nicht bestätigt (rot umrandet)
function werkzeugOffen(p) {
  return !!(p && p.werkzeug && (!p.article_id || p.ungeprueft));
}

// ---------------- Ein Platz bearbeiten ----------------
// Ein Fenster je Werkzeugplatz: Tätigkeit, Mass, HD, Standzeit und das
// Werkzeug. Das Werkzeug wird nur gewählt, nicht geschrieben, im selben
// Fenster wie beim Bestellen, mit dem Knopf „Spezialwerkzeuge“ (Wunsch
// Patrick, 23. Oktober 2026). Der Hersteller ist der Lieferant des
// Artikels. Das Bild merkt sich der Artikel (Wunsch Patrick,
// 13. Oktober 2026).
function PlatzFenster({ nr, titel, wert, setzen, zu, artikelBilder, artikelBildNeu, wechseln }) {
  const [p, setP] = useState(Object.assign({}, wert));
  const [artikel, setArtikel] = useState(null);
  const [bildWahl, setBildWahl] = useState(false);
  const [bildGewaehlt, setBildGewaehlt] = useState(false);
  useEffect(() => { if (wert.article_id) artikelHolen(wert.article_id).then(setArtikel); }, []);
  const f = (feld) => (e) => setP(Object.assign({}, p, { [feld]: e.target.value }));
  const merkKey = bildSchluesselVon(p);
  const bild = platzBild(p, Object.assign({}, artikelBilder, merkKey && bildGewaehlt ? { [merkKey]: p.bild } : {}));

  // Ein gewähltes oder angelegtes Werkzeug ist geprüft. Ein selbst
  // zugeordnetes wird nicht mehr mit „Ja, stimmt“ bestätigt, sondern
  // über „Auswählen“ mit dem Excel-Text in der Suche; neu angelegt wird
  // nur im Fenster von Bestellen, dort ist der Lieferant Pflicht
  // (Wunsch Patrick, 26. Oktober 2026)
  const nehmen = (a) => {
    setArtikel(a);
    setP(Object.assign({}, p, { article_id: a.id, werkzeug: a.article_number || a.name || "", bezeichnung: a.article_number ? artikelBezeichnung(a) : "",
      hersteller: a.supplier_name || "",
      spezial_id: null, ungeprueft: false, spezial: !!a.spezial, bild: artikelBilder[a.id] || p.bild || null }));
  };
  const waehlen = async () => {
    const a = await werkzeugWaehlen({ suche: p.article_id && !p.ungeprueft ? "" : (p.werkzeug || ""), spezial: !!(artikel && artikel.spezial) });
    if (a) nehmen(a);
  };
  const fertig = async (danach) => {
    const z = {};
    const sz = String(leer(p.standzeit)).replace(/'/g, "").trim();
    if (sz !== "" && !isNaN(Number(sz))) z.standzeit = Number(sz);
    ["taetigkeit", "mass", "hersteller", "werkzeug", "bezeichnung"].forEach((k) => { const w = String(p[k] || "").trim(); if (w) z[k] = w; });
    if (p.hd) z.hd = true;
    // Andere T-Nr. auf diesem Platz, etwa weil ein anderer Halter drauf ist
    // (T3121 statt T3100, Wunsch Patrick 30. Oktober 2026); der Platz im
    // Blatt bleibt derselbe, nur die Anschrift ändert sich
    const tnr = tnrSchreiben(p.tnr);
    if (tnr && tnr !== platzName(nr)) z.tnr = tnr;
    const geo = String(p.geo || "").replace(/\s+$/, "");
    if (geo.trim()) {
      z.geo = geo;
      if (p.geoFarbe && p.geoFarbe !== GEO_SCHWARZ) z.geoFarbe = p.geoFarbe;
      if (p.geoFett) z.geoFett = true;
      if (p.geoGroesse) z.geoGroesse = p.geoGroesse;
    }
    if (p.ohneBild) z.ohneBild = true;
    if (p.article_id && z.werkzeug) z.article_id = p.article_id;
    else delete z.bezeichnung;
    if (z.article_id && p.ungeprueft) z.ungeprueft = true;
    if (z.article_id && p.spezial) z.spezial = true;
    if (p.bild) z.bild = p.bild;
    // Am Artikel merken, sobald jemand ein Bild wählt: jeder andere Platz
    // damit bekommt es von selbst
    if (z.article_id && bildGewaehlt && (artikelBilder[z.article_id] || null) !== (p.bild || null)) {
      try { await artikelBildSetzen(z.article_id, p.bild || null); artikelBildNeu(z.article_id, p.bild || null); }
      catch (x) { alt.meldung(alt.fehlertext(x), "warn"); }
    }
    setzen(z); zu();
    if (danach && Object.keys(z).length) danach();
  };
  return (
    <div className="eba-platzfenster" data-platzfenster={nr} onClick={(e) => e.stopPropagation()}>
      <div className="eba-pf-kopf"><b>{p.tnr ? p.tnr + " (auf " + platzName(nr) + ")" : platzName(nr)}{titel ? " · " + titel : ""}</b>
        <button className="knopf knopf--klein knopf--still" data-pf-zu="" onClick={zu}>✕</button></div>
      <div className="eba-pf-oben">
        {BILDER_AN && <button className="eba-pf-bildknopf" data-pf-bild="" onClick={() => setBildWahl(!bildWahl)} title="Bild wählen">
          {bild ? <BildZeichnung schluessel={bild.schluessel} /> : <span className="eba-plus">Bild<br />wählen</span>}
          <small>{!bild ? "" : bild.art === "gemerkt" ? "gemerkt" : "gewählt"}</small>
        </button>}
        <div className="eba-pf-felder">
          <label className="feld"><span>Tätigkeit</span><input data-pf="taetigkeit" value={p.taetigkeit || ""} onChange={f("taetigkeit")} /></label>
          <label className="feld"><span>Mass</span><input data-pf="mass" value={p.mass || ""} onChange={f("mass")} /></label>
          <label className="feld"><span>Andere T-Nr. (anderer Halter drauf)</span><input data-pf="tnr" value={p.tnr || ""}
            placeholder={"leer = " + platzName(nr)} onChange={f("tnr")} onBlur={() => setP(Object.assign({}, p, { tnr: tnrSchreiben(p.tnr) }))} /></label>
        </div>
      </div>
      {BILDER_AN && bildWahl && <Bibliothek aktiv={bild && bild.schluessel}
        waehlen={(k) => { setP(Object.assign({}, p, { bild: k })); setBildWahl(false); setBildGewaehlt(true); }} />}
      <div className="eba-pf-werkzeug" data-pf-werkzeug="">
        <span className="eba-pf-titel">Werkzeug</span>
        {p.article_id && p.ungeprueft
          ? <div className="eba-pf-artikel eba-pf-artikel--frei" data-pf-bestaetigen=""><b>„{p.werkzeug}“</b>
              <span>Aus dem Excel{p.hersteller ? ", " + p.hersteller : ""}. Noch nicht hinterlegt: „Auswählen“, die Suche steht schon da. Fehlt es, dort neu anlegen.</span></div>
          : p.article_id
          ? <div className="eba-pf-artikel"><b>{p.werkzeug}</b>
              <span>{[artikel && artikel.spezial ? "Spezialwerkzeug" : "", artikel && artikel.name, p.hersteller].filter(Boolean).join(" · ")}</span></div>
          : p.werkzeug
            ? <div className="eba-pf-artikel eba-pf-artikel--frei" data-pf-frei=""><b>„{p.werkzeug}“</b>
                <span>Aus dem Excel{p.hersteller ? ", " + p.hersteller : ", ohne Hersteller"}. Noch nicht hinterlegt: „Auswählen“, die Suche steht schon da. Fehlt es, dort neu anlegen.</span></div>
            : <div className="eba-pf-artikel"><span>Noch kein Werkzeug</span></div>}
        <div className="eba-pf-wknoepfe">
          <button className={"knopf knopf--klein" + (werkzeugOffen(p) ? " knopf--haupt" : "")} data-pf-waehlen="" onClick={waehlen}>
            {p.werkzeug ? (p.article_id && !p.ungeprueft ? "Anderes Werkzeug wählen" : "Auswählen") : "Werkzeug wählen"}</button>
          {p.werkzeug && <button className="knopf knopf--klein knopf--still" data-pf-wzweg=""
            onClick={() => setP(Object.assign({}, p, { werkzeug: "", bezeichnung: "", hersteller: "", article_id: null, spezial_id: null, ungeprueft: false }))}>Entfernen</button>}
        </div>
      </div>
      <label className="feld"><span>Geo-Offset, nur wenn nötig</span>
        <textarea data-pf="geo" rows={2} value={p.geo || ""} onChange={f("geo")} placeholder="z. B. X 0.12  Z -0.05"
          style={{ color: p.geoFarbe || undefined, WebkitTextFillColor: p.geoFarbe || undefined, fontWeight: p.geoFett ? 700 : undefined }} /></label>
      {/* Schriftfarbe und dünn/fett der Notiz, wie die Leiste der Skizze im
          Pad: ein paar feste Farben und der Farbwähler des Geräts
          (Wunsch Patrick 30. Oktober 2026) */}
      <div className="eba-pf-geostil" data-pf-geostil="">
        {GEO_FARBEN.map(([name, wert]) => <button key={wert} type="button" title={name} aria-label={name}
          data-pf-geofarbe={wert} className={"eba-pf-geofarbe" + ((p.geoFarbe || GEO_SCHWARZ) === wert ? " aktiv" : "")}
          style={{ "--f": wert }} onClick={() => setP(Object.assign({}, p, { geoFarbe: wert === GEO_SCHWARZ ? null : wert }))} />)}
        <label className={"eba-pf-geofarbe eba-pf-geofarbe--waehler" + (p.geoFarbe && !GEO_FARBEN.some((x) => x[1] === p.geoFarbe) ? " aktiv" : "")}
          style={{ "--f": p.geoFarbe || GEO_SCHWARZ }} title="Andere Farbe wählen" aria-label="Andere Farbe wählen">
          <input type="color" data-pf-geowahl="" value={p.geoFarbe || GEO_SCHWARZ}
            onChange={(e) => setP(Object.assign({}, p, { geoFarbe: e.target.value.toLowerCase() }))} /></label>
        <span className="eba-pf-geodicke">
          <button type="button" data-pf-geodicke="duenn" className={!p.geoFett ? "aktiv" : ""}
            onClick={() => setP(Object.assign({}, p, { geoFett: false }))}>Dünn</button>
          <button type="button" data-pf-geodicke="fett" className={p.geoFett ? "aktiv" : ""}
            onClick={() => setP(Object.assign({}, p, { geoFett: true }))}><b>Fett</b></button>
        </span>
      </div>
      {/* Schriftgrösse der Notiz: Auto füllt das Feld, sonst von Hand
          (Wunsch Patrick 30. Oktober 2026) */}
      <div className="eba-pf-geogroesse" data-pf-geogroesse="">
        <span>Schriftgrösse</span>
        <button type="button" data-pf-geogr="auto" className={!p.geoGroesse ? "aktiv" : ""}
          onClick={() => setP(Object.assign({}, p, { geoGroesse: null }))}>Auto</button>
        <button type="button" data-pf-geogr="minus" aria-label="Kleiner"
          onClick={() => setP(Object.assign({}, p, { geoGroesse: Math.max(GEO_GROESSE_MIN, (p.geoGroesse || GEO_GROESSE_START + 1) - 1) }))}>−</button>
        <b data-pf-geogr-wert="">{p.geoGroesse || ""}</b>
        <button type="button" data-pf-geogr="plus" aria-label="Grösser"
          onClick={() => setP(Object.assign({}, p, { geoGroesse: Math.min(GEO_GROESSE_MAX, (p.geoGroesse || GEO_GROESSE_START - 1) + 1) }))}>+</button>
      </div>
      {BILDER_AN && <label className="eba-pf-check"><input type="checkbox" data-pf="ohneBild" checked={!!p.ohneBild}
        onChange={(e) => setP(Object.assign({}, p, { ohneBild: e.target.checked }))} /> Kein Bild auf dem Blatt</label>}
      <div className="eba-pf-zeile">
        <button className={"eba-pf-hd" + (p.hd ? " eba-pf-hd--an" : "")} data-pf="hd" aria-pressed={!!p.hd}
          onClick={() => setP(Object.assign({}, p, { hd: !p.hd }))}>HD {p.hd ? "ein" : "aus"}</button>
        <label className="feld"><span>Standzeit (Stk.), wenn bekannt</span>
          <input data-pf="standzeit" inputMode="numeric" placeholder="leer lassen"
            value={leer(p.standzeit)} onChange={f("standzeit")} /></label>
      </div>
      <div className="eba-pf-fuss">
        <button className="knopf knopf--klein" data-pf-leeren="" onClick={() => setP({})}>Platz leeren</button>
        {wechseln && platzInGebrauch(p) && <button className="knopf knopf--klein" data-pf-wechseln=""
          title="Danach den neuen Platz antippen; steht dort schon etwas, wird getauscht"
          onClick={() => fertig(wechseln)}>Platz wechseln</button>}
        <button className="knopf knopf--klein knopf--haupt" data-pf-ok="" onClick={() => fertig()}>Übernehmen</button>
      </div>
    </div>
  );
}

// Auswahl der Bilder: nur hochgeladene Bilder ohne Beschriftung, dazu
// „+“ zum Hochladen und „—“ für kein Bild (Wunsch Patrick, 13. und
// 15. Oktober 2026)
function Bibliothek({ aktiv, waehlen }) {
  const [, neu] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const darf = alt.darfSchreiben() && !alt.istExtern();
  const hoch = async (e) => {
    const d = (e.target.files || [])[0];
    e.target.value = "";
    if (!d) return;
    setLaedt(true);
    try { const k = await eigenesBildHochladen(d); neu((x) => x + 1); waehlen(k); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaedt(false); }
  };
  const weg = async (b, ev) => {
    ev.stopPropagation();
    if (!(await alt.nachfragen({ titel: "Bild löschen", text: "Dieses Bild aus der Bibliothek löschen? Wo es schon verwendet ist, steht danach kein Bild mehr.", bestaetigen: "Löschen", gefahr: true }))) return;
    try { await eigenesBildLoeschen(b.id); neu((x) => x + 1); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <div className="eba-pf-bibliothek" data-pf-bibliothek="">
      {sinnbilder().map((b) => <button key={b.schluessel} className={"eba-pf-bib eba-pf-bib--norm" + (aktiv === b.schluessel ? " eba-pf-bib--an" : "")}
        data-bib={b.schluessel} title={b.name} onClick={() => waehlen(b.schluessel)}><BildZeichnung schluessel={b.schluessel} /></button>)}
      {eigeneBilder().map((b) => <button key={b.schluessel} className={"eba-pf-bib" + (aktiv === b.schluessel ? " eba-pf-bib--an" : "")}
        data-bib={b.schluessel} title={b.name} onClick={() => waehlen(b.schluessel)}><BildZeichnung schluessel={b.schluessel} />
        {darf && <span className="eba-pf-bib-weg" data-bib-weg={b.id} onClick={(ev) => weg(b, ev)}>✕</span>}</button>)}
      {darf && <label className="eba-pf-bib eba-pf-bib--hoch" title="Eigenes Bild hochladen">{laedt ? "…" : "+"}
        <input type="file" accept="image/*" hidden data-bib-hoch="" onChange={hoch} /></label>}
      <button className="eba-pf-bib eba-pf-bib--keins" data-bib="" title="Kein Bild" onClick={() => waehlen(null)}>—</button>
    </div>
  );
}

// ---------------- Weitere Seiten ----------------
// Hinter dem Werkzeugblatt beliebig viele Seiten, unten wie die Blätter
// in Excel, je mit Namen und hoch oder quer, Inhalt wie in Word: Text,
// Tabellen (auch aus Excel hineinkopiert, etwa Geo-Offset-Daten) und
// Bilder (Wunsch Patrick, 24. Oktober 2026). Im Pad nur zum Lesen.
const A4 = [794, 1123];
export function seitenMass(seite) { return seite && seite.quer ? [A4[1], A4[0]] : A4; }

export function ZusatzSeite({ seite, bearbeiten, inhaltBearbeiten }) {
  const [w, h] = seitenMass(seite);
  return (
    <div className={"eba-zseite" + (bearbeiten ? " eba-zseite--bearbeiten" : "")} data-eba-zseite=""
      style={{ width: w, height: h }} onClick={bearbeiten ? inhaltBearbeiten : undefined}
      title={bearbeiten ? "Antippen, um den Inhalt zu bearbeiten" : undefined}>
      <TextBlatt html={seite.html || ""} format={seite.quer ? "a4q" : "a4"} breite={w} hoehe={h} />
      {bearbeiten && !seite.html && <div className="eba-zseite-leer">Antippen und schreiben, Tabellen aus Excel
        hineinkopieren oder Bilder einfügen</div>}
    </div>
  );
}

// Unten die Reiter: das Werkzeugblatt und die weiteren Seiten
function SeitenReiter({ seiten, aktiv, waehlen, bearbeiten, neu }) {
  if (!seiten.length && !bearbeiten) return null;
  return (
    <div className="eba-reiter" data-eba-reiter="">
      <button className={"eba-reiter__r" + (aktiv === 0 ? " eba-reiter__r--an" : "")} data-eba-seite-nr="0"
        onClick={() => waehlen(0)}>Werkzeuge</button>
      {seiten.map((x, i) => (
        <button key={i} className={"eba-reiter__r" + (aktiv === i + 1 ? " eba-reiter__r--an" : "")}
          data-eba-seite-nr={i + 1} onClick={() => waehlen(i + 1)}>{x.name || "Seite " + (i + 2)}</button>))}
      {bearbeiten && <button className="eba-reiter__r eba-reiter__neu" data-eba-seite-neu="" onClick={neu}>+ Seite</button>}
    </div>
  );
}

// ---------------- Das Fenster ----------------
// nurLesen: für alle ohne Schreibrecht und für Externe (im Pad Mode seit 1.236.0 nicht mehr)
// Beim Bearbeiten fällt die FA-Zeile aus der Bemerkung gleich weg
function entwurfVon(b) {
  return b.bemerkung && ohneFa(b.bemerkung) !== b.bemerkung ? Object.assign({}, b, { bemerkung: ohneFa(b.bemerkung) || null }) : b;
}

function BlattFenster({ hocoNr, typId, zu, daten: start, nurLesen, gleichBearbeiten, auftrag }) {
  const [daten, setDaten] = useState(start);
  const darf = !nurLesen && alt.darfSchreiben() && !alt.istExtern();
  const [bearbeiten, setBearbeiten] = useState(darf && (!start.blatt || !!gleichBearbeiten));
  const [entwurf, setEntwurf] = useState(() => entwurfVon(start.blatt || leeresBlatt(hocoNr, typId)));
  const [teilE, setTeilE] = useState(Object.assign({}, start.teil));
  const [typE, setTypE] = useState(Object.assign({}, start.typDaten));
  const [platz, setPlatz] = useState(null);
  // Platz, dessen Werkzeug gerade auf einen anderen Platz wechselt
  const [wechsel, setWechsel] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [seiteNr, setSeiteNr] = useState(0);
  const [artikelBilder, setArtikelBilder] = useState(start.artikelBilder || {});
  // Was beim Bearbeiten aus dem Excel vorgelesen wurde: { liest } oder { hinweise }
  const [vorgelesen, setVorgelesen] = useState(null);
  const seite = useRef(null);
  const { typ, paths, teil, typDaten } = daten;
  const excel = typDaten.blatt_url || null;
  const blatt = bearbeiten ? entwurf : (daten.blatt || entwurf);
  const seiten = Array.isArray(blatt.seiten) ? blatt.seiten : [];
  const zseite = seiteNr > 0 ? seiten[seiteNr - 1] : null;
  const vorlage = useMemo(() => blattVorlage(typ, paths), [typ, paths]);
  const hatPlaetze = vorlage.reihen.some((r) => r.some(Boolean)) || Object.keys(blatt.plaetze || {}).length > 0;
  useEffect(() => { if (seiteNr > seiten.length) setSeiteNr(seiten.length); }, [seiten.length]);
  // Das Blatt füllt den Platz, so gross es geht (Wunsch Patrick 25. Oktober
  // 2026: „etwas grösser, die Schrift ist nicht lesbar“). Am Handy bleibt
  // es in echter Grösse und rollt, verkleinert wäre es nicht lesbar.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = seite.current;
    if (!el || zseite) return undefined;
    const rechnen = () => {
      const k = Math.min((el.clientWidth - 28) / 1123, (el.clientHeight - 28) / 794);
      setZoom(k > 0 && (k >= 1 || el.clientWidth >= 800) ? Math.round(k * 100) / 100 : 1);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!zseite]);

  // Beim Bearbeiten versucht die App zuerst selbst, das Blatt aus dem
  // Excel zu füllen, man passt danach nur noch an (Wunsch Patrick,
  // 25. Oktober 2026: „kurz selber versuchen, dann passen wir es so an,
  // dass es stimmt“). Nur solange in der App noch kein Werkzeug steht,
  // und nur in leere Felder; gespeichert wird erst mit Speichern.
  const vorlesen = async (d) => {
    const url = d.typDaten && d.typDaten.blatt_url;
    if (!url || /\.pdf(\?|#|$)/i.test(String(url))) return;   // .xlsx, .xlsm und seit 1.194.0 auch alte .xls
    if (d.blatt && Object.keys(d.blatt.plaetze || {}).length) return;
    setVorgelesen({ liest: true });
    try {
      const v = await excelVorlesen(hocoNr, d.typ, url);
      const leer0 = (x) => x === undefined || x === null || x === "" || (typeof x === "object" && !Object.keys(x).length);
      setEntwurf((b) => {
        const n = Object.assign({}, b);
        Object.entries(v.blatt).forEach(([k, w]) => { if (leer0(n[k]) && !leer0(w)) n[k] = w; });
        return n;
      });
      setTeilE((t) => {
        const n = Object.assign({}, t);
        STAMM_FELDER.forEach(([f]) => { if (f !== "material_groesse" && v.stamm[f] && leer0(n[f])) n[f] = v.stamm[f]; });
        return n;
      });
      setTypE((t) => {
        const n = Object.assign({}, t);
        ["stueckzeit_s", "abend_stk"].forEach((f) => { if (v.typDaten[f] && leer0(n[f])) n[f] = v.typDaten[f]; });
        return n;
      });
      setVorgelesen({ hinweise: v.hinweise });
    } catch (f) {
      setVorgelesen({ fehler: alt.fehlertext(f) });
    }
  };
  useEffect(() => { if (bearbeiten) vorlesen(start); }, []);

  const neuLaden = async () => { const d = await blattLaden(hocoNr, typId); setDaten(d); setArtikelBilder(d.artikelBilder || {}); return d; };
  const anfangen = (d) => {
    setEntwurf(entwurfVon(d.blatt || leeresBlatt(hocoNr, typId)));
    setTeilE(Object.assign({}, d.teil)); setTypE(Object.assign({}, d.typDaten));
  };
  const speichern = async () => {
    setLaeuft(true);
    try {
      await blattSpeichern(entwurf, "Einrichtblatt " + hocoNr + " " + (typ.name || ""));
      // Ein Blatt je Materialgrösse gehört zu keiner HOCO Nr.: keine Stammdaten
      if (!istMaterialBlatt(hocoNr)) {
        await stammSpeichern(hocoNr, teil, Object.fromEntries(STAMM_FELDER.map(([f]) => [f, leer(teilE[f])])));
        await typSpeichern(hocoNr, typId, typDaten, typE);
      }
      const d = await neuLaden();
      anfangen(d);
      setBearbeiten(false); setPlatz(null); setWechsel(null); setVorgelesen(null);
      alt.meldung("Einrichtblatt gespeichert.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  // Ein anderes Blatt als Anfang nehmen: Werkzeuge, Programme und Kopf
  // kommen mit, die HOCO Nr. bleibt die eigene (Wunsch Patrick 29. Oktober 2026)
  const vonAnderem = async () => {
    const w = await alt.dialogFelder({ titel: "Von anderem Blatt übernehmen",
      text: "Das Blatt einer anderen HOCO Nr. auf " + (typ.name || "diesem Typ") + " wird übernommen und als "
        + hocoNr + " gespeichert. Danach anpassen und Speichern.",
      felder: [{ name: "nr", label: "HOCO Nr. des anderen Blatts", platzhalter: "z. B. 10000-0355", pflicht: true }],
      bestaetigen: "Übernehmen" });
    if (!w) return;
    setLaeuft(true);
    try {
      const v = await blattVonAnderem(w.nr, hocoNr, typ);
      setEntwurf((b) => entwurfVon(Object.assign({}, b, v.blatt, { hoco_nr: hocoNr, type_id: typId })));
      setPlatz(null); setSeiteNr(0);
      setVorgelesen({ uebernommen: w.nr.trim(), hinweise: v.hinweise || [] });
    } catch (f) { alt.meldung(alt.fehlertext(f), "warn"); }
    finally { setLaeuft(false); }
  };
  const abbrechen = () => {
    if (!daten.blatt) { zu(); return; }
    anfangen(daten); setBearbeiten(false); setPlatz(null); setWechsel(null); setVorgelesen(null);
  };
  // Ein Kopffeld ändern, dort, wo es hingehört
  const aendern = (f, w) => {
    if (f.art === "stamm") setTeilE((t) => Object.assign({}, t, { [f.feld]: w }));
    else if (f.art === "typ") setTypE((t) => Object.assign({}, t, { [f.feld]: w }));
    else if (f.art === "prg") setEntwurf((b) => {
      const pr = Object.assign({}, b.programme || {});
      if (String(w).trim()) pr[f.feld] = w; else delete pr[f.feld];
      return Object.assign({}, b, { programme: pr });
    });
    else if (f.art === "kopf") setEntwurf((b) => {
      const k = Object.assign({}, b.kopf || {});
      if (String(w).trim()) k[f.feld] = w; else delete k[f.feld];
      return Object.assign({}, b, { kopf: k });
    });
    else if (f.art === "blatt") setEntwurf((b) => Object.assign({}, b, { [f.feld]: String(w).trim() ? w : null }));
  };
  // Erst nach „EB OK“ (bis 1.177.0 „Blatt ist gut“) zeigt der Pad Mode das Blatt aus der App
  // (Wunsch Patrick, 24. Oktober 2026); ein Excel dazu wird gelöscht
  const gut = async () => {
    // Erst wenn jedes Werkzeug hinterlegt und bestätigt ist (Wunsch
    // Patrick, 26. Oktober 2026: nie mehr ohne Hersteller)
    if (offen > 0) {
      alt.meldung(offen === 1 ? "Ein Werkzeug ist noch rot: zuerst antippen und auswählen."
        : offen + " Werkzeuge sind noch rot: zuerst antippen und auswählen.", "warn");
      return;
    }
    const ok = await alt.nachfragen({ titel: "EB OK",
      text: excel
        ? "Stimmt das Blatt? Dann gilt es ab jetzt auch im Pad Mode. Das bisherige Excel-Einrichtblatt von " + hocoNr + " auf "
          + typ.name + " wird aus der Datenbank gelöscht, und die Aufgabe „HoferTool“ lädt dafür kein Excel mehr hoch."
        : "Stimmt das Blatt? Dann gilt es ab jetzt auch im Pad Mode.",
      bestaetigen: excel ? "EB OK, Excel löschen" : "EB OK", gefahr: !!excel });
    if (!ok) return;
    setLaeuft(true);
    try {
      await blattIstGut(daten.blatt); await neuLaden();
      alt.meldung(excel ? "Das Excel ist gelöscht, es gilt das Blatt in der App." : "Das Blatt gilt jetzt auch im Pad Mode.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  const drucken = () => {
    const k = seite.current && seite.current.querySelector(zseite ? "[data-eba-zseite]" : "[data-eba-seite]");
    if (!k) return;
    const kopie = k.cloneNode(true);
    kopie.classList.add(zseite ? "eba-zseite--druck" : "eba-seite--druck");
    if (zseite) kopie.classList.toggle("eba-zseite--quer", !!zseite.quer);
    try { inDerAppDrucken([kopie], { quer: zseite ? !!zseite.quer : true, titel: "Einrichtblatt " + hocoNr + " " + (typ.name || ""), rand: zseite ? "0" : "8mm" }); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const platzSetzen = (nr, z) => {
    const plaetze = Object.assign({}, entwurf.plaetze || {});
    if (Object.keys(z).length) plaetze[nr] = z; else delete plaetze[nr];
    setEntwurf(Object.assign({}, entwurf, { plaetze }));
  };
  // Zwei Plätze tauschen; ist das Ziel leer, wandert das Werkzeug nur
  // (Wunsch Patrick 29. Oktober 2026: „wenn dort auch was ist, dann einfach Switch“)
  const tauschen = (von, nach) => {
    setEntwurf((b) => {
      const pl = Object.assign({}, b.plaetze || {});
      const a = pl[von], z = pl[nach];
      if (z && Object.keys(z).length) pl[von] = z; else delete pl[von];
      if (a && Object.keys(a).length) pl[nach] = a; else delete pl[nach];
      return Object.assign({}, b, { plaetze: pl });
    });
    setWechsel(null); setPlatz(null);
    const war = (entwurf.plaetze || {})[nach];
    alt.meldung(platzName(von) + (war && platzInGebrauch(war) ? " und " + platzName(nach) + " getauscht." : " auf " + platzName(nach) + " verschoben."), "gut");
  };
  // Werkzeug eines Platzes gleich bestellen: Neue Bestellposition mit dem
  // Artikel, danach steht es unter Bestellungen → Offen (Wunsch Patrick
  // 29. Oktober 2026: „auf den Platz klicken und direkt zu offenen
  // Bestellungen hinzufügen“); seit 1.275.1 Notiz leer und ohne Foto
  // (Wunsch Patrick 30. Oktober 2026)
  const bestellen = async (nr, p) => {
    const a = await artikelHolen(p.article_id);
    if (!a) { alt.meldung("Der Artikel zu diesem Platz ist nicht mehr da.", "warn"); return; }
    positionOeffnen(null, { artikel: a });
  };
  const platzWahl = (nr) => setTimeout(() => {
    if (wechsel) { if (wechsel !== nr) tauschen(wechsel, nr); else setWechsel(null); return; }
    setPlatz(nr);
  }, 0);
  const seitenSetzen = (liste) => setEntwurf((b) => Object.assign({}, b, { seiten: liste }));
  const seiteAendern = (i, z) => seitenSetzen(seiten.map((x, j) => (j === i ? Object.assign({}, x, z) : x)));
  const neueSeite = () => {
    seitenSetzen(seiten.concat([{ name: "Seite " + (seiten.length + 2), quer: false, html: "" }]));
    setSeiteNr(seiten.length + 1);
  };
  const seiteWeg = async (i) => {
    if (!(await alt.nachfragen({ titel: "Seite löschen", text: "Die Seite „" + (seiten[i].name || "") + "“ löschen?",
      bestaetigen: "Löschen", gefahr: true }))) return;
    seitenSetzen(seiten.filter((_, j) => j !== i)); setSeiteNr(i);
  };
  const inhaltBearbeiten = async (i) => {
    const x = seiten[i];
    const [w, h] = seitenMass(x);
    const html = await textBearbeiten({ html: x.html || "", format: x.quer ? "a4q" : "a4", seitenVerhaeltnis: h / w,
      titel: (x.name || "Seite") + " · " + hocoNr });
    // Von Hand geändert: kommt nicht mehr von der NC-Datei (GEO-OFFSET)
    if (html !== null && html !== x.html) seiteAendern(i, { html, nc: undefined });
  };
  // Freie Bilder: gehen gleich in die Datenbank, auch mitten im
  // Bearbeiten; ein neues Blatt ohne gespeicherte Zeile behält sie im
  // Entwurf bis Speichern
  const mitBildern = (kopf, liste) => {
    const k = Object.assign({}, kopf || {});
    if (liste.length) k.bilder = liste; else delete k.bilder;
    return k;
  };
  const bilderAendern = async (liste) => {
    if (bearbeiten) setEntwurf((b) => Object.assign({}, b, { kopf: mitBildern(b.kopf, liste) }));
    if (!daten.blatt) return;
    setDaten((d) => Object.assign({}, d, { blatt: Object.assign({}, d.blatt, { kopf: mitBildern(d.blatt.kopf, liste) }) }));
    try { await freieBilderSpeichern(daten.blatt.hoco_nr, daten.blatt.type_id, liste); }
    catch (f) { alt.meldung("Bild nicht gespeichert: " + alt.fehlertext(f), "fehler"); }
  };
  const bildDatei = useRef(null);
  const bildEinfuegen = async (datei) => {
    if (!datei) return;
    if (!/^image\//.test(datei.type || "")) { alt.meldung("Nur Bilder lassen sich ins Blatt einfügen.", "warn"); return; }
    setLaeuft(true);
    try {
      const { url, hoch } = await freiesBildHochladen(datei);
      const w = 22, h = w * hoch * 1123 / 794;
      const r1 = (x) => Math.round(x * 100) / 100;
      const liste = (Array.isArray((blatt.kopf || {}).bilder) ? blatt.kopf.bilder : [])
        .concat([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url,
          x: r1(50 - w / 2), y: r1(Math.max(2, 50 - h / 2)), w }]);
      await bilderAendern(liste);
      alt.meldung(daten.blatt ? "Bild eingefügt. Ziehen verschiebt es, die Ecke unten rechts ändert die Grösse."
        : "Bild eingefügt. Es wird mit dem Blatt gespeichert.", "gut");
    } catch (f) { alt.meldung("Bild nicht eingefügt: " + alt.fehlertext(f), "fehler"); }
    finally { setLaeuft(false); }
  };
  // Strg + V fügt ein Bild aus der Zwischenablage ein (nicht in Feldern)
  const einfuegenRef = useRef(bildEinfuegen);
  einfuegenRef.current = bildEinfuegen;
  useEffect(() => {
    if (!darf || zseite) return undefined;
    const kleben = (e) => {
      const t = e.target;
      if (t && (t.closest && t.closest("input, textarea, [contenteditable=true], [contenteditable='']"))) return;
      const d = e.clipboardData;
      const f = d && [...(d.files || [])].find((x) => /^image\//.test(x.type));
      if (!f) return;
      e.preventDefault();
      einfuegenRef.current(f);
    };
    document.addEventListener("paste", kleben);
    return () => document.removeEventListener("paste", kleben);
  }, [darf, !!zseite]);
  const bildKnopf = darf && !zseite && <>
    <button className="knopf knopf--klein" data-eba-bild-neu="" disabled={laeuft} title="Bild einfügen, auch mit Strg + V"
      onClick={() => bildDatei.current && bildDatei.current.click()}>Bild einfügen</button>
    <input ref={bildDatei} type="file" accept="image/*" hidden data-eba-bild-datei=""
      onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; bildEinfuegen(f); }} /></>;
  const offen = Object.values(blatt.plaetze || {}).filter(werkzeugOffen).length;
  const pfad = pfadVonPlatz(paths);
  const platzTitel = (nr) => platzGruppe(nr) || (pfad[nr] ? pfad[nr].name : "");

  return (
    <div className="betrachter eba-fenster">
      <div className="betrachter__kopf">
        <span className="betrachter__titel">Einrichtblatt {hocoNr} · {typ.name}
          {daten.blatt && !daten.blatt.gut_am && <span className="eba-offen" data-eba-offen=""> noch nicht bestätigt</span>}
          {darf && offen > 0 && <span className="eba-rot-zahl" data-eba-rot={offen}> · {offen} {offen === 1 ? "Werkzeug" : "Werkzeuge"} rot: antippen und auswählen</span>}</span>
        <div className="betrachter__knoepfe">
          {bearbeiten
            ? <>
                <span className="eba-hinweis">{zseite ? "Seite antippen zum Schreiben" : "Kopf direkt ausfüllen, Platz antippen für Werkzeug"}</span>
                {!daten.blatt && <button className="knopf knopf--klein" data-eba-von-anderem="" disabled={laeuft} onClick={vonAnderem}>Von anderem Blatt übernehmen</button>}
                {bildKnopf}
                <button className="knopf knopf--klein" data-eba-abbrechen="" onClick={abbrechen}>Abbrechen</button>
                <button className="knopf knopf--klein knopf--haupt" data-eba-speichern="" disabled={laeuft} onClick={speichern}>Speichern</button>
              </>
            : <>
                {darf && <button className="knopf knopf--klein" data-eba-bearbeiten="" onClick={() => { anfangen(daten); setBearbeiten(true); vorlesen(daten); }}>Bearbeiten</button>}
                {bildKnopf}
                {excel && !nurLesen && <button className="knopf knopf--klein" data-eba-excel="" onClick={() => dokZeigen({ art: "einrichtblatt", titel: "Excel " + hocoNr, adresse: excel })}>Excel ansehen</button>}
                {darf && daten.blatt && !daten.blatt.gut_am && <button className="knopf knopf--klein" data-eba-gut="" disabled={laeuft} onClick={gut}>EB OK</button>}
                <button className="knopf knopf--klein" data-eba-drucken="" onClick={drucken}>Drucken</button>
                <button className="knopf knopf--klein" data-zu="" onClick={zu}>Schliessen</button>
              </>}
        </div>
      </div>
      {bearbeiten && vorgelesen && <div className={"eba-vorgelesen" + (vorgelesen.fehler ? " eba-vorgelesen--fehler" : "")} data-eba-vorgelesen="">
        {vorgelesen.liest ? <span>Lese das Excel …</span>
          : vorgelesen.fehler ? <span>Excel nicht gelesen: {vorgelesen.fehler}</span>
          : vorgelesen.uebernommen ? <span><b>Von {vorgelesen.uebernommen} übernommen.</b> Bitte prüfen und anpassen, dann Speichern: es wird als {hocoNr} gespeichert.
              {vorgelesen.hinweise.length > 0 && <> Achtung: {vorgelesen.hinweise.join(" · ")}</>}</span>
          : <span><b>Aus dem Excel vorgelesen.</b> Bitte prüfen und anpassen, dann Speichern.
              {vorgelesen.hinweise.length > 0 && <> Achtung: {vorgelesen.hinweise.join(" · ")}</>}</span>}
        {!vorgelesen.liest && <button className="linkknopf" data-eba-vorgelesen-zu="" onClick={() => setVorgelesen(null)}>✕</button>}
      </div>}
      {bearbeiten && wechsel && !zseite && <div className="eba-vorgelesen eba-wechsel" data-eba-wechsel={wechsel}>
        <span><b>{platzName(wechsel)} wechseln:</b> jetzt den neuen Platz antippen. Steht dort schon ein Werkzeug, tauschen die beiden.</span>
        <button className="knopf knopf--klein" data-eba-wechsel-ab="" onClick={() => setWechsel(null)}>Abbrechen</button>
      </div>}
      <div className="betrachter__buehne eba-buehne" ref={seite} onClick={() => setPlatz(null)}>
        {zseite && bearbeiten && <div className="eba-zseite-leiste" onClick={(e) => e.stopPropagation()}>
          <label>Name <input className="eba-zseite-name" data-eba-seite-name="" value={zseite.name || ""}
            onChange={(e) => seiteAendern(seiteNr - 1, { name: e.target.value })} /></label>
          <span className="eba-zseite-format">
            <button className={"knopf knopf--klein" + (!zseite.quer ? " knopf--haupt" : "")} data-eba-seite-hoch=""
              onClick={() => seiteAendern(seiteNr - 1, { quer: false })}>Hochformat</button>
            <button className={"knopf knopf--klein" + (zseite.quer ? " knopf--haupt" : "")} data-eba-seite-quer=""
              onClick={() => seiteAendern(seiteNr - 1, { quer: true })}>Querformat</button></span>
          <button className="knopf knopf--klein" data-eba-seite-inhalt="" onClick={() => inhaltBearbeiten(seiteNr - 1)}>Inhalt bearbeiten</button>
          <button className="knopf knopf--klein knopf--gefahr-leise" data-eba-seite-weg="" onClick={() => seiteWeg(seiteNr - 1)}>Seite löschen</button>
        </div>}
        {zseite
          ? <ZusatzSeite seite={zseite} bearbeiten={bearbeiten} inhaltBearbeiten={() => inhaltBearbeiten(seiteNr - 1)} />
          : <div className="eba-zoom" style={{ zoom }}><BlattSeite typ={typ} paths={paths} teil={bearbeiten ? teilE : teil} typDaten={bearbeiten ? typE : typDaten} blatt={blatt} auftrag={auftrag}
              bearbeiten={bearbeiten} aktiv={platz} artikelBilder={artikelBilder} aendern={aendern} pruefen={darf}
              platzWahl={platzWahl} tauschen={tauschen} wechsel={wechsel} bestellen={darf ? bestellen : null}
              bilderAendern={darf ? bilderAendern : null} /></div>}
        {bearbeiten && platz && !zseite && <PlatzFenster key={platz} nr={platz} titel={platzTitel(platz)}
          wert={(entwurf.plaetze || {})[platz] || {}} setzen={(z) => platzSetzen(platz, z)} zu={() => setPlatz(null)}
          artikelBilder={artikelBilder} artikelBildNeu={(id, b) => setArtikelBilder((x) => Object.assign({}, x, { [id]: b }))}
          wechseln={() => setWechsel(platz)} />}
        {!hatPlaetze && !zseite && <div className="abruf-leer"><b>Für {typ.name} sind noch keine Werkzeugplätze angelegt.</b>
          <p>Unter Maschinen → Typen → {typ.name} → Aufbau anlegen.</p></div>}
      </div>
      <SeitenReiter seiten={seiten} aktiv={seiteNr} waehlen={setSeiteNr} bearbeiten={bearbeiten} neu={neueSeite} />
    </div>
  );
}

// Öffnen: gleich das Blatt. Den Kopf samt Stammdaten füllt man direkt
// darin aus. { nurLesen } ohne Schreibrecht, { bearbeiten } gleich zum Ändern
// (Produktion → Infos zum Richten)
// { auftrag } beim Blatt je Materialgrösse: die HOCO Nr. des Auftrags
export async function einrichtblattAppOeffnen(hocoNr, typId, { nurLesen, bearbeiten, auftrag } = {}) {
  let daten;
  try { daten = await blattLaden(hocoNr, typId); }
  catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }
  fensterOeffnen((zu) => <BlattFenster hocoNr={hocoNr} typId={typId} daten={daten} zu={zu}
    nurLesen={!!nurLesen} gleichBearbeiten={!!bearbeiten} auftrag={auftrag} />,
    null, "betrachter-huelle eba-huelle");
}

// Nur das Werkzeugblatt, eingepasst in den Platz darum (Bildschirmschoner
// im Pad Mode)
export function BlattAnzeige({ hocoNr, typId, auftrag }) {
  const [daten, setDaten] = useState(null);
  const [k, setK] = useState(1);
  const platz = useRef(null);
  useEffect(() => {
    let weg = false;
    blattLaden(hocoNr, typId).then((d) => { if (!weg) setDaten(d); }).catch(() => {});
    return () => { weg = true; };
  }, [hocoNr, typId]);
  useEffect(() => {
    const el = platz.current;
    if (!el) return undefined;
    const rechnen = () => setK(Math.min(el.clientWidth / 1123, el.clientHeight / 794) || 1);
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [daten]);
  if (!daten || !daten.blatt) return <div className="pdfansicht__laden">Einrichtblatt wird geladen …</div>;
  return (
    <div className="eba-anzeige" ref={platz} data-eba-anzeige="">
      <div style={{ width: 1123 * k, height: 794 * k }}>
        <div style={{ transform: "scale(" + k + ")", transformOrigin: "top left", width: 1123 }}>
          <BlattSeite typ={daten.typ} paths={daten.paths} teil={daten.teil} typDaten={daten.typDaten} blatt={daten.blatt} auftrag={auftrag}
            artikelBilder={daten.artikelBilder || {}} />
        </div>
      </div>
    </div>
  );
}

// Schild der Test-Fassung unter .../test/, damit niemand sie mit der
// Live-App verwechselt
if (typeof location !== "undefined" && /\/test\//.test(location.pathname)) {
  setTimeout(() => {
    if (document.querySelector(".vorschau-schild")) return;
    const s = document.createElement("div");
    s.className = "vorschau-schild";
    s.textContent = "Test: Einrichtblatt in der App";
    document.body.appendChild(s);
  }, 0);
}
