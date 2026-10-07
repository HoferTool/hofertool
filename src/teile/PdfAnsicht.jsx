// =================================================================
//  PDF-ANSICHT
//  Zeichnet ein PDF selbst (pdf.js) statt über die Anzeige des
//  Browsers. Grund: Safari auf dem iPad zeigt ein eingebettetes PDF in
//  seiner Originalgrösse und kümmert sich nicht um „#view=FitH“; das
//  Einrichtblatt blieb so klein in der Ecke, mit viel weissem Rand.
//  Hier wird jede Seite so gross wie möglich in die Fläche eingepasst
//  (ganze Seite sichtbar). Vergrössern geht mit zwei Fingern, mit
//  Strg + Mausrad oder den Knöpfen; Doppeltipp springt zurück.
//
//  Klappt das Laden nicht (fremder Server ohne Freigabe, kaputte
//  Datei), meldet sich die Ansicht über beiFehler, und der Betrachter
//  nimmt die Anzeige des Browsers.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// pdf.js erst laden, wenn ein PDF aufgeht: hält den Start der App klein.
// Die „legacy“-Fassung läuft auch auf älteren iPads.
let pdfjsLaden = null;
export function pdfjs() {
  if (!pdfjsLaden) {
    pdfjsLaden = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.mjs?url"),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsLaden;
}

const ZOOM_MIN = 1, ZOOM_MAX = 6;
// Safari verweigert zu grosse Zeichenflächen. Darüber wird die Seite
// lieber etwas weicher als gar nicht gezeichnet.
const MAX_PIXEL = 12_000_000;

export function PdfAnsicht({ daten, beiFehler }) {
  const buehne = useRef(null);
  const blatt = useRef(null);
  const [doc, setDoc] = useState(null);
  const [masse, setMasse] = useState([]);       // Seitengrösse bei Massstab 1
  const [flaeche, setFlaeche] = useState(null); // verfügbare Fläche in px
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  // Nach einem Zoom soll derselbe Punkt unter den Fingern bleiben
  const anker = useRef(null);

  // Laden
  useEffect(() => {
    let weg = false, aufgabe = null;
    pdfjs().then(async (lib) => {
      aufgabe = lib.getDocument({ data: daten.slice(), isEvalSupported: false });
      const d = await aufgabe.promise;
      const m = [];
      for (let i = 1; i <= d.numPages; i++) {
        const v = (await d.getPage(i)).getViewport({ scale: 1 });
        m.push({ b: v.width, h: v.height });
      }
      if (weg) return;
      setMasse(m); setDoc(d);
    }).catch((f) => { if (!weg) beiFehler(f); });
    return () => { weg = true; if (aufgabe) aufgabe.destroy(); };
  }, [daten]);

  // Fläche messen, auch beim Drehen des Tablets
  useLayoutEffect(() => {
    const el = buehne.current;
    const messen = () => setFlaeche({ b: el.clientWidth, h: el.clientHeight });
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grösse einer Seite auf dem Bildschirm: ganz sichtbar und so gross
  // wie möglich, dann mal Zoom
  const passend = (m) => {
    if (!flaeche) return 1;
    return Math.min(flaeche.b / m.b, flaeche.h / m.h);
  };

  // Nach dem Zoom die Bildlaufposition so setzen, dass der Punkt unter
  // den Fingern (oder die Mitte) stehen bleibt
  useLayoutEffect(() => {
    const a = anker.current, el = buehne.current;
    if (!a || !el) return;
    anker.current = null;
    const f = zoom / a.alt;
    el.scrollLeft = (a.x + el.scrollLeft) * f - a.x;
    el.scrollTop = (a.y + el.scrollTop) * f - a.y;
  }, [zoom]);

  const zoomSetzen = (neu, x, y) => {
    const el = buehne.current;
    neu = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, neu));
    if (Math.abs(neu - zoomRef.current) < 0.001) return;
    anker.current = {
      alt: zoomRef.current,
      x: x ?? el.clientWidth / 2,
      y: y ?? el.clientHeight / 2,
    };
    setZoom(neu);
  };

  // Zwei Finger und Strg + Mausrad. Während der Geste wird nur mit CSS
  // vergrössert (flüssig), erst am Ende wird scharf neu gezeichnet.
  useEffect(() => {
    const el = buehne.current;
    let start = null;
    const abstand = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mitte = (t) => {
      const r = el.getBoundingClientRect();
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };
    const beginn = (e) => {
      if (e.touches.length !== 2) return;
      const m = mitte(e.touches);
      start = { d: abstand(e.touches), x: m.x, y: m.y, f: 1 };
      blatt.current.style.transformOrigin = (m.x + el.scrollLeft) + "px " + (m.y + el.scrollTop) + "px";
    };
    const bewegen = (e) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const roh = abstand(e.touches) / start.d;
      start.f = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomRef.current * roh)) / zoomRef.current;
      blatt.current.style.transform = "scale(" + start.f + ")";
    };
    const ende = () => {
      if (!start) return;
      const s = start; start = null;
      blatt.current.style.transform = "";
      zoomSetzen(zoomRef.current * s.f, s.x, s.y);
    };
    const rad = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomSetzen(zoomRef.current * Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
    };
    // Safari: eigene Gesten-Ereignisse würden sonst die ganze Seite zoomen
    const geste = (e) => e.preventDefault();
    el.addEventListener("touchstart", beginn, { passive: true });
    el.addEventListener("touchmove", bewegen, { passive: false });
    el.addEventListener("touchend", ende);
    el.addEventListener("touchcancel", ende);
    el.addEventListener("wheel", rad, { passive: false });
    el.addEventListener("gesturestart", geste);
    el.addEventListener("gesturechange", geste);
    return () => {
      el.removeEventListener("touchstart", beginn);
      el.removeEventListener("touchmove", bewegen);
      el.removeEventListener("touchend", ende);
      el.removeEventListener("touchcancel", ende);
      el.removeEventListener("wheel", rad);
      el.removeEventListener("gesturestart", geste);
      el.removeEventListener("gesturechange", geste);
    };
  }, []);

  // Doppeltipp/Doppelklick: vergrössern, beim zweiten Mal zurück
  const doppelt = (e) => {
    const r = buehne.current.getBoundingClientRect();
    if (zoomRef.current > 1.05) zoomSetzen(1);
    else zoomSetzen(2.5, e.clientX - r.left, e.clientY - r.top);
  };

  return (
    <div className="pdfansicht">
      <div className="pdfansicht__buehne" ref={buehne} onDoubleClick={doppelt}>
        <div className="pdfansicht__blatt" ref={blatt}>
          {doc && flaeche && masse.map((m, i) => (
            <Seite key={i} doc={doc} nr={i + 1}
              breite={m.b * passend(m) * zoom} hoehe={m.h * passend(m) * zoom}
              massstab={passend(m) * zoom} flaeche={flaeche} />
          ))}
        </div>
        {!doc && <div className="pdfansicht__laden">PDF wird geladen …</div>}
      </div>
      {doc && <div className="pdfansicht__zoom">
        <button className="knopf knopf--klein" aria-label="Verkleinern" data-kleiner=""
          onClick={() => zoomSetzen(zoom / 1.4)} disabled={zoom <= ZOOM_MIN}>−</button>
        <button className="knopf knopf--klein" data-einpassen="" title="Ganze Seite"
          onClick={() => zoomSetzen(1)}>{Math.round(zoom * 100)}%</button>
        <button className="knopf knopf--klein" aria-label="Vergrössern" data-groesser=""
          onClick={() => zoomSetzen(zoom * 1.4)} disabled={zoom >= ZOOM_MAX}>+</button>
      </div>}
    </div>
  );
}

function Seite({ doc, nr, breite, hoehe, massstab, flaeche }) {
  const leinwand = useRef(null);
  useEffect(() => {
    let weg = false, aufgabe = null;
    const t = setTimeout(async () => {
      const seite = await doc.getPage(nr);
      if (weg) return;
      let dichte = (window.devicePixelRatio || 1);
      const px = breite * hoehe * dichte * dichte;
      if (px > MAX_PIXEL) dichte *= Math.sqrt(MAX_PIXEL / px);
      const v = seite.getViewport({ scale: massstab * dichte });
      // In eine neue Leinwand zeichnen und erst danach austauschen, damit
      // beim Zoomen nichts weiss aufblitzt
      const neu = document.createElement("canvas");
      neu.width = Math.floor(v.width); neu.height = Math.floor(v.height);
      aufgabe = seite.render({ canvasContext: neu.getContext("2d"), viewport: v, canvas: neu });
      try { await aufgabe.promise; } catch (f) { return; }
      if (weg || !leinwand.current) return;
      const alt = leinwand.current;
      alt.width = neu.width; alt.height = neu.height;
      alt.getContext("2d").drawImage(neu, 0, 0);
      alt.dataset.fertig = "1";
    }, 60);
    return () => { weg = true; clearTimeout(t); if (aufgabe) aufgabe.cancel(); };
  }, [doc, nr, massstab]);
  return (
    <div className="pdfansicht__seite" style={{ minHeight: flaeche.h }}>
      <canvas ref={leinwand} style={{ width: breite, height: hoehe }} />
    </div>
  );
}
