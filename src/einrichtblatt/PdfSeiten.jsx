// =================================================================
//  PDF ALS SEITEN IM EINRICHTBLATT
//  Ein hochgeladenes PDF ist eine weitere Seite hinter dem Werkzeugblatt
//  (Reiter unten wie die anderen Seiten). Es bleibt das PDF selbst, kein
//  Bild: alle Seiten stehen untereinander und man rollt durch wie in
//  einem PDF (Wunsch Patrick 5. November 2026: „Docs hinterlegen, nicht
//  als Bild, sondern gleich hochladen, als weitere Seite oder Seiten,
//  dann runterscrollen wie PDF“). Gezeichnet wird mit pdf.js, jede
//  Seite erst, wenn sie in die Nähe des sichtbaren Bereichs kommt, damit
//  grosse PDFs das iPad nicht überfordern.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { pdfjs } from "../teile/PdfAnsicht.jsx";

// Seite im Einrichtblatt, die ein PDF ist
export const istPdfSeite = (s) => !!s && s.art === "pdf" && !!s.url;

// Die Datei einmal je Adresse holen (Ansicht, Druck, Sicherung)
const vorrat = new Map();
export function pdfDaten(url) {
  if (!vorrat.has(url)) {
    vorrat.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error("PDF nicht gefunden (" + r.status + ")");
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b)).catch((f) => { vorrat.delete(url); throw f; }));
  }
  return vorrat.get(url);
}

function EineSeite({ doc, nr, breite }) {
  const huelle = useRef(null);
  const leinwand = useRef(null);
  const [mass, setMass] = useState(null);
  const [sichtbar, setSichtbar] = useState(false);
  useEffect(() => {
    let weg = false;
    doc.getPage(nr).then((p) => { if (!weg) { const v = p.getViewport({ scale: 1 }); setMass({ b: v.width, h: v.height }); } });
    return () => { weg = true; };
  }, [doc, nr]);
  useEffect(() => {
    const el = huelle.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setSichtbar(true); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Hochformat höchstens 900 Punkte breit, sonst wird die Seite riesig
  const b = Math.min(breite, mass && mass.b > mass.h ? 1300 : 900);
  const h = mass ? b * mass.h / mass.b : breite * 1.414;
  useEffect(() => {
    if (!sichtbar || !mass) return undefined;
    let aufgabe = null, weg = false;
    doc.getPage(nr).then((p) => {
      if (weg) return;
      // Scharf auf dem Bildschirm, aber nicht über 8 Mio. Pixel (Safari)
      let k = (b / mass.b) * Math.min(3, Math.max(1.5, window.devicePixelRatio || 1));
      k = Math.min(k, Math.sqrt(8e6 / (mass.b * mass.h)));
      const v = p.getViewport({ scale: k });
      const c = leinwand.current;
      if (!c) return;
      c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      aufgabe = p.render({ canvasContext: c.getContext("2d"), viewport: v, canvas: c });
      aufgabe.promise.catch(() => {});
    });
    return () => { weg = true; if (aufgabe) aufgabe.cancel(); };
  }, [sichtbar, mass, Math.round(b)]);
  return (
    <div ref={huelle} className="eba-pdf-seite" data-eba-pdf-seite={nr} style={{ width: b, height: h }}>
      <canvas ref={leinwand} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export function PdfSeiten({ seite }) {
  const huelle = useRef(null);
  const [doc, setDoc] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [breite, setBreite] = useState(900);
  useEffect(() => {
    let weg = false, aufgabe = null;
    setDoc(null); setFehler(null);
    Promise.all([pdfjs(), pdfDaten(seite.url)]).then(([lib, daten]) => {
      if (weg) return null;
      aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
      return aufgabe.promise.then((d) => { if (!weg) setDoc(d); });
    }).catch((f) => { if (!weg) setFehler(String((f && f.message) || f)); });
    return () => { weg = true; if (aufgabe) aufgabe.destroy(); };
  }, [seite.url]);
  useEffect(() => {
    const el = huelle.current && huelle.current.parentElement;
    if (!el) return undefined;
    const messen = () => setBreite(Math.max(280, Math.min(1400, el.clientWidth - 28)));
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={huelle} className="eba-pdf" data-eba-pdf={seite.url}>
      {fehler ? <div className="abruf-leer"><b>PDF lässt sich nicht laden.</b><p>{fehler}</p></div>
        : !doc ? <div className="pdfansicht__laden">PDF wird geladen …</div>
        : Array.from({ length: doc.numPages }, (_, i) => <EineSeite key={i} doc={doc} nr={i + 1} breite={breite} />)}
    </div>
  );
}
