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

// Verweise innerhalb des PDF (etwa Seitenzahlen im Inhaltsverzeichnis):
// je Seite die Felder als Anteil der Seite und die Zielseite (ab 1).
// Wunsch Patrick 15. Oktober 2026: draufdrücken springt dorthin.
export async function seitenLinks(doc, seite) {
  const v = seite.getViewport({ scale: 1 });
  let ann = [];
  try { ann = await seite.getAnnotations(); } catch (f) { return []; }
  const r3 = (n) => Math.round(n * 10000) / 10000;
  const aus = [];
  for (const a of ann) {
    if (a.subtype !== "Link" || !a.rect) continue;
    let z = null;
    try {
      let dest = a.dest;
      if (typeof dest === "string") dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0] != null) {
        z = typeof dest[0] === "object" ? (await doc.getPageIndex(dest[0])) + 1
          : (Number.isInteger(dest[0]) ? dest[0] + 1 : null);
      }
    } catch (f) { z = null; }
    if (!z) continue;
    // Ecken mit der Matrix der Ansicht umrechnen (dreht und spiegelt die
    // PDF-Koordinaten, die unten links beginnen)
    const t = v.transform, pt = (x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
    const p1 = pt(a.rect[0], a.rect[1]), p2 = pt(a.rect[2], a.rect[3]);
    const r = [p1[0], p1[1], p2[0], p2[1]];
    aus.push({ x: r3(Math.min(r[0], r[2]) / v.width), y: r3(Math.min(r[1], r[3]) / v.height),
      w: r3(Math.abs(r[2] - r[0]) / v.width), h: r3(Math.abs(r[3] - r[1]) / v.height), z });
  }
  return aus;
}

// Suche im Text des PDF (seit 1.134.0, Wunsch Patrick 22. Oktober 2026:
// „nicht alle Anleitungen haben Inhaltsverzeichnisse“). Je Seite einmal
// den Text holen und merken, Treffer als Anteil der Seite wie bei den
// Verweisen. Gross/klein und Akzente zählen nicht. Gescannte PDFs ohne
// Text finden nichts, das sagt die Leiste dann.
const suchForm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function seitenText(doc, nr) {
  const seite = await doc.getPage(nr);
  const v = seite.getViewport({ scale: 1 });
  const inhalt = await seite.getTextContent();
  const teile = [];
  for (const it of inhalt.items) {
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const [, , c, d, e, f] = it.transform;
    const hoch = Math.hypot(c, d) || it.height || 10;
    const t = v.transform, pt = (x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
    const p1 = pt(e, f - hoch * 0.25), p2 = pt(e + (it.width || 0), f + hoch * 0.9);
    const r = [p1[0], p1[1], p2[0], p2[1]];
    const x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]);
    teile.push({ text: suchForm(it.str), x: x / v.width, y: y / v.height,
      w: Math.abs(r[2] - r[0]) / v.width, h: Math.abs(r[3] - r[1]) / v.height });
  }
  seite.cleanup();
  return teile;
}

function trefferAufSeite(teile, q) {
  const aus = [];
  for (const t of teile) {
    let i = t.text.indexOf(q);
    while (i >= 0) {
      // Innerhalb des Textstücks nach Anteil der Zeichen eingrenzen
      const n = t.text.length || 1;
      aus.push({ x: t.x + t.w * i / n, y: t.y, w: Math.max(t.w * q.length / n, 0.004), h: t.h });
      i = t.text.indexOf(q, i + q.length);
    }
  }
  return aus.sort((a, b) => a.y - b.y || a.x - b.x);
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
  // Suche
  const [suche, setSuche] = useState(null);     // null = zu, sonst Text im Feld
  const [treffer, setTreffer] = useState([]);   // [{ nr, x, y, w, h }]
  const [aktiv, setAktiv] = useState(0);
  const [sucht, setSucht] = useState(null);     // { seite, von } während der Suche
  const texte = useRef({});
  const suchLauf = useRef(0);
  const suchFeld = useRef(null);

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
    // Beim Drucken aus der App ist der Betrachter kurz ausgeblendet
    // (Fläche 0): dann bleibt das letzte Mass stehen.
    const messen = () => { if (el.clientWidth && el.clientHeight) setFlaeche({ b: el.clientWidth, h: el.clientHeight }); };
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

  // Treffer suchen, Seite für Seite; ein neuer Suchtext bricht den alten Lauf ab
  const suchen = async (text) => {
    const q = suchForm(text).trim();
    const lauf = ++suchLauf.current;
    setTreffer([]); setAktiv(0);
    if (!doc || q.length < 2) { setSucht(null); return; }
    const alle = [];
    let gezeigt = false;
    for (let nr = 1; nr <= doc.numPages; nr++) {
      if (lauf !== suchLauf.current) return;
      if (!texte.current[nr]) {
        try { texte.current[nr] = await seitenText(doc, nr); } catch (f) { texte.current[nr] = []; }
      }
      trefferAufSeite(texte.current[nr], q).forEach((t) => alle.push({ nr, ...t }));
      if (nr % 10 === 0 || nr === doc.numPages) {
        if (lauf !== suchLauf.current) return;
        setSucht(nr < doc.numPages ? { seite: nr, von: doc.numPages } : null);
        setTreffer(alle.slice());
        // Den ersten Treffer gleich zeigen, nicht erst am Ende
        if (!gezeigt && alle.length) { gezeigt = true; zuTreffer(alle[0]); }
      }
    }
  };
  useEffect(() => {
    if (suche === null) { suchLauf.current++; setTreffer([]); setSucht(null); return; }
    const t = setTimeout(() => suchen(suche), 350);
    return () => clearTimeout(t);
  }, [suche, doc]);

  const zuTreffer = (t) => {
    const el = buehne.current, seite = el && el.querySelector('[data-pdfseite="' + t.nr + '"]');
    if (!seite) return;
    const f = seite.firstElementChild.getBoundingClientRect(), b = el.getBoundingClientRect();
    const top = el.scrollTop + f.top - b.top + t.y * f.height;
    const links = el.scrollLeft + f.left - b.left + t.x * f.width;
    el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), left: Math.max(0, links - el.clientWidth / 3) });
  };
  const blaettern = (schritt) => {
    if (!treffer.length) return;
    const n = (aktiv + schritt + treffer.length) % treffer.length;
    setAktiv(n); zuTreffer(treffer[n]);
  };
  const sucheZu = () => setSuche(null);
  useEffect(() => { if (suche !== null && suchFeld.current) suchFeld.current.focus(); }, [suche === null]);
  // Escape schliesst zuerst nur die Suche, nicht den Betrachter. Die
  // Fenster hören schon in der Einfangphase am document, darum hier noch
  // früher am window.
  useEffect(() => {
    if (suche === null) return;
    const taste = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopImmediatePropagation();
      sucheZu();
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [suche === null]);

  // Verweis im PDF: zur Zielseite rollen
  const springen = (nr) => {
    const el = buehne.current, ziel = el && el.querySelector('[data-pdfseite="' + nr + '"]');
    if (ziel) el.scrollTo({ top: ziel.offsetTop, behavior: "smooth" });
  };

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
              massstab={passend(m) * zoom} flaeche={flaeche} springen={springen} buehne={buehne}
              treffer={treffer} aktiv={treffer[aktiv]} />
          ))}
        </div>
        {!doc && <div className="pdfansicht__laden">PDF wird geladen …</div>}
      </div>
      {doc && suche !== null && <div className="pdfansicht__suche" data-pdfsuchleiste="">
        <input ref={suchFeld} type="search" data-pdfsuchfeld="" placeholder="Im Dokument suchen"
          value={suche} enterKeyHint="search"
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); blaettern(e.shiftKey ? -1 : 1); }
          }} />
        <span className="pdfansicht__suchstand" data-pdfsuchstand="">
          {suchForm(suche).trim().length < 2 ? ""
            : treffer.length ? (aktiv + 1) + " / " + treffer.length + (sucht ? " …" : "")
            : sucht ? "Sucht … Seite " + sucht.seite + " / " + sucht.von
            : "Nichts gefunden"}
        </span>
        <button className="knopf knopf--klein" aria-label="Vorheriger Treffer" data-pdfzurueck=""
          disabled={!treffer.length} onClick={() => blaettern(-1)}>▲</button>
        <button className="knopf knopf--klein" aria-label="Nächster Treffer" data-pdfweiter=""
          disabled={!treffer.length} onClick={() => blaettern(1)}>▼</button>
        <button className="knopf knopf--klein" aria-label="Suche schliessen" data-pdfsuchezu=""
          onClick={sucheZu}>✕</button>
      </div>}
      {doc && <div className="pdfansicht__zoom">
        <button className="knopf knopf--klein" aria-label="Suchen" title="Im Dokument suchen" data-pdfsuche=""
          onClick={() => setSuche(suche === null ? "" : null)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg></button>
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

// Gezeichnet werden nur Seiten in der Nähe des sichtbaren Bereichs, weiter
// entfernte geben ihre Zeichenfläche wieder frei. Ein Handbuch mit
// Hunderten Seiten hat sonst auf dem iPad den Speicher gesprengt und
// Safari hat die App neu geladen (Patrick 22. Oktober 2026: „grosse
// Dokumente werden auf den Pads nicht angezeigt“).
function Seite({ doc, nr, breite, hoehe, massstab, flaeche, springen, buehne, treffer, aktiv }) {
  const leinwand = useRef(null);
  const huelle = useRef(null);
  const [nah, setNah] = useState(nr <= 2);
  const [links, setLinks] = useState([]);
  useEffect(() => {
    const el = huelle.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNah(true); return; }
    const io = new IntersectionObserver((e) => setNah(e.some((x) => x.isIntersecting)),
      { root: buehne && buehne.current, rootMargin: "100% 50%" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Weit weg: Zeichenfläche freigeben (Safari gibt den Speicher erst so zurück)
  useEffect(() => {
    if (nah || !leinwand.current) return;
    const c = leinwand.current;
    c.width = 0; c.height = 0;
    delete c.dataset.fertig;
  }, [nah]);
  useEffect(() => {
    let weg = false;
    doc.getPage(nr).then((s) => seitenLinks(doc, s)).then((l) => { if (!weg) setLinks(l); }).catch(() => {});
    return () => { weg = true; };
  }, [doc, nr]);
  useEffect(() => {
    if (!nah) return;
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
      const frei = () => { neu.width = 0; neu.height = 0; };
      try { await aufgabe.promise; } catch (f) { frei(); return; }
      if (weg || !leinwand.current) { frei(); return; }
      const alt = leinwand.current;
      alt.width = neu.width; alt.height = neu.height;
      alt.getContext("2d").drawImage(neu, 0, 0);
      frei();
      seite.cleanup();
      alt.dataset.fertig = "1";
    }, 60);
    return () => { weg = true; clearTimeout(t); if (aufgabe) aufgabe.cancel(); };
  }, [doc, nr, massstab, nah]);
  return (
    <div className="pdfansicht__seite" ref={huelle} data-pdfseite={nr} style={{ minHeight: flaeche.h }}>
      <div className="pdfansicht__flaeche" style={{ width: breite, height: hoehe }}>
        <canvas ref={leinwand} style={{ width: breite, height: hoehe }} />
        {treffer && treffer.filter((t) => t.nr === nr).map((t, i) => (
          <span key={i} className={"pdf-treffer" + (t === aktiv ? " pdf-treffer--aktiv" : "")} data-pdftreffer=""
            style={{ left: t.x * 100 + "%", top: t.y * 100 + "%", width: t.w * 100 + "%", height: t.h * 100 + "%" }} />))}
        {links.map((l, i) => (
          <button key={i} type="button" className="pdf-link" data-pdflink={l.z} aria-label={"Zu Seite " + l.z}
            title={"Zu Seite " + l.z}
            style={{ left: l.x * 100 + "%", top: l.y * 100 + "%", width: l.w * 100 + "%", height: l.h * 100 + "%" }}
            onClick={(e) => { e.stopPropagation(); springen(l.z); }}
            onDoubleClick={(e) => e.stopPropagation()} />))}
      </div>
    </div>
  );
}
