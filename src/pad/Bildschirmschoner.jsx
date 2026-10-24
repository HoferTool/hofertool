// =================================================================
//  PAD MODE: BILDSCHIRMSCHONER MIT DEM EINRICHTBLATT
//  Wird auf dem Dashboard einer Maschine eine Minute lang nichts
//  berührt, zeigt das Pad das Einrichtblatt des laufenden Auftrags
//  über den ganzen Bildschirm. Ein Tipp irgendwohin führt zurück aufs
//  Dashboard (Wunsch Patrick, 13. Oktober 2026).
//
//  Welches Blatt: dasselbe wie hinter dem Knopf „Einrichtblatt“
//  (eigenes Blatt der HOCO Nr. für diesen Typ, sonst die Vorlage des
//  Typs, alt.blattPdfSuchen). Ohne Auftrag, ohne Typ oder ohne Blatt
//  kommt kein Bildschirmschoner. Die Anzeige selbst ist die Excel- bzw.
//  PDF-Ansicht des Betrachters. Ist das Blatt in der App mit „Blatt ist
//  gut“ bestätigt, zeigt der Schoner dieses (seit 1.170.0).
//
//  Abgemeldet wird im Pad Mode nie (leerlaufPruefen in app.js), darum
//  kommen sich Bildschirmschoner und Abmeldung nicht in die Quere.
// =================================================================
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { alt } from "../bruecke.jsx";
import { ExcelAnsicht } from "../teile/ExcelAnsicht.jsx";
import { PdfAnsicht } from "../teile/PdfAnsicht.jsx";
import { istExcel } from "../teile/excelLesen.js";
import { blattSuchen } from "../einrichtblatt/daten.js";
import { BlattAnzeige } from "../einrichtblatt/Blatt.jsx";

export const SCHONER_NACH_MS = 60 * 1000;

// Letzte Berührung, für das ganze Pad. Bewusst ausserhalb der
// Komponente: Neuzeichnen des Dashboards soll die Uhr nicht neu starten.
let letzte = Date.now();
const AKTIV = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
function beruehrt() { letzte = Date.now(); }
let lauscher = 0;
function lauschen() {
  if (lauscher++ === 0) {
    letzte = Date.now();
    AKTIV.forEach((a) => document.addEventListener(a, beruehrt, { capture: true, passive: true }));
  }
  return () => {
    if (--lauscher === 0) AKTIV.forEach((a) => document.removeEventListener(a, beruehrt, { capture: true }));
  };
}

// Die Datei nur einmal je Adresse holen: der Schoner kommt immer wieder
const vorrat = new Map();
function dateiHolen(adresse) {
  if (!vorrat.has(adresse)) {
    const p = fetch(adresse)
      .then((a) => { if (!a.ok) throw new Error("nicht erreichbar"); return a.arrayBuffer(); })
      .then((b) => new Uint8Array(b));
    p.catch(() => vorrat.delete(adresse));
    if (vorrat.size > 3) vorrat.delete(vorrat.keys().next().value);
    vorrat.set(adresse, p);
  }
  return vorrat.get(adresse);
}

// Nicht über etwas legen, mit dem gerade gearbeitet wird: offene
// Fenster (Zifferblock, Betrachter, Rückfragen), die grosse Skizze
// oder ein Feld mit Schreibmarke
function stoertNicht() {
  if (document.hidden) return false;
  if (document.querySelector(".dialog-huelle, .pad-skizze-gross")) return false;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return false;
  return true;
}

function Blatt({ adresse }) {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let weg = false;
    dateiHolen(adresse).then((d) => { if (!weg) setDaten(d); }).catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [adresse]);
  if (fehler) return <div className="pdfansicht__laden">Das Einrichtblatt lässt sich gerade nicht laden.</div>;
  if (!daten) return <div className="pdfansicht__laden">Einrichtblatt wird geladen …</div>;
  return istExcel(adresse.split(/[?#]/)[0])
    ? <ExcelAnsicht daten={daten} beiFehler={() => setFehler(true)} />
    : <PdfAnsicht daten={daten} beiFehler={() => setFehler(true)} />;
}

export default function Bildschirmschoner({ hoco, typId }) {
  const [adresse, setAdresse] = useState(null);
  const [zeigen, setZeigen] = useState(false);

  // Gibt es ein Blatt? Neu bei jedem Auftrag und Typ.
  useEffect(() => {
    setAdresse(null);
    if (!hoco || !typId) return;
    let weg = false;
    blattSuchen(hoco, typId)
      .then((b) => (b && b.gut_am ? "app:" : alt.blattPdfSuchen(hoco, typId).then((g) => (g && g.adresse) || null)))
      .then((a) => { if (!weg) setAdresse(a); })
      .catch(() => { /* dann eben kein Schoner */ });
    return () => { weg = true; };
  }, [hoco, typId]);

  useEffect(lauschen, []);

  useEffect(() => {
    if (!adresse || zeigen) return;
    const takt = setInterval(() => {
      if (Date.now() - letzte >= SCHONER_NACH_MS && stoertNicht()) {
        // Schon vorher holen, damit das Blatt gleich da ist
        if (adresse !== "app:") dateiHolen(adresse).catch(() => {});
        setZeigen(true);
      }
    }, 1000);
    return () => clearInterval(takt);
  }, [adresse, zeigen]);

  // Escape am Computer wie ein Tipp. Vor allen anderen abgefangen,
  // sonst ginge das Pad zusätzlich einen Schritt zurück.
  useEffect(() => {
    if (!zeigen) return;
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setZeigen(false);
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [zeigen]);

  if (!zeigen || !adresse) return null;
  // Der Deckel über dem Blatt fängt den Tipp ab: Geschlossen wird erst
  // beim „click“, also wenn der Finger wieder oben ist. So landet der
  // Tipp nicht noch auf einem Knopf des Dashboards darunter, und
  // Zoomen oder Doppeltipp der Ansicht greifen hier nicht.
  return createPortal(
    <div className="pad-schoner" data-padschoner="">
      <div className="pad-schoner__blatt">
        {adresse === "app:" ? <BlattAnzeige hocoNr={hoco} typId={typId} /> : <Blatt adresse={adresse} />}</div>
      <div className="pad-schoner__deckel" data-padschonerzu=""
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setZeigen(false); }} />
      <div className="pad-schoner__hinweis">Tippen, um zum Dashboard zurückzukehren</div>
    </div>,
    document.body);
}
