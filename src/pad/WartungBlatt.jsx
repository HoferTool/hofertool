// =================================================================
//  WARTUNG MIT TEXT ALS QUERBLATT (seit 1.535.0)
//  Wunsch Patrick 13. November 2026: „die Texte für Vorlagen sollen so
//  ein Querblatt anzeigen, welches die iPad-Bildschirmgrösse zeigt, und
//  Bilder einfach einfügen können per Copy-Paste“, „die Texte sollen per
//  Textfeld einfügen können, dass man sie herumschieben kann“.
//
//  Das Blatt ist immer 1180 × 820 Punkte (Bildschirm eines iPads quer),
//  genau das, was der Bildschirmschoner an der Maschine zeigt. Darauf
//  liegen frei Textfelder und Bilder (Lage und Breite als Anteil des
//  Blatts, so passt es auf jede Grösse). Angezeigt wird das Blatt als
//  Ganzes eingepasst (Karte, Vorschau, Schoner), geschrieben wird in
//  derselben Ansicht, also genau so, wie es an der Maschine erscheint.
//
//  Gespeichert in inhalt_fmt als <!--blatt:{…}--> (keine neue Spalte),
//  in inhalt der reine Text aller Felder (Suche, ältere Fassungen).
//  Ältere Texte ohne Blatt zeigt WartungText weiter wie bisher; beim
//  Ändern werden sie ein Textfeld oben auf dem Blatt.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { RichFeld, formatHtml, htmlSauber } from "../einrichtblatt/markiert.jsx";
import { freiesBildHochladen } from "../einrichtblatt/daten.js";

export const BLATT_W = 1180, BLATT_H = 820;
// Grundschrift auf dem Blatt in Punkten des iPads: so gross wie bisher
// der Text im Schoner (20 px mal 1.6)
export const BLATT_SCHRIFT = 32;
const ANFANG = "<!--blatt:", ENDE = "-->";

const zahl = (v, min, max, vorgabe) => { const n = Number(v); return isFinite(n) ? Math.max(min, Math.min(max, n)) : vorgabe; };
const bildAdresse = (u) => typeof u === "string" && /^(https:\/\/|data:image\/)/.test(u) ? u : "";
let zaehler = 0;
const neueId = () => "t" + Date.now().toString(36) + (zaehler++).toString(36);

export const istBlatt = (fmt) => typeof fmt === "string" && fmt.startsWith(ANFANG);

// Blatt aus inhalt_fmt lesen, alles geprüft (Werte begrenzt, nur https-
// oder data:-Bilder), damit nichts Fremdes ins Markup kommt
export function blattLesen(fmt) {
  if (!istBlatt(fmt)) return null;
  try {
    const roh = JSON.parse(fmt.slice(ANFANG.length, fmt.lastIndexOf(ENDE)));
    const teile = (Array.isArray(roh.teile) ? roh.teile : []).map((t) => {
      const grund = { id: String(t.id || neueId()), x: zahl(t.x, 0, 0.98, 0.05), y: zahl(t.y, 0, 0.98, 0.1), w: zahl(t.w, 0.03, 1, 0.4) };
      if (t.art === "bild") { const url = bildAdresse(t.url); return url ? { ...grund, art: "bild", url, hoch: zahl(t.hoch, 0.05, 20, 0.75) } : null; }
      return { ...grund, art: "text", t: String(t.t || ""), f: t.f ? String(t.f) : null };
    }).filter(Boolean);
    return { teile };
  } catch (f) { return { teile: [] }; }
}

export function blattSchreiben(teile) {
  const sauber = teile.filter((t) => t.art === "bild" || (t.t || "").trim()).map((t) => {
    const r = (n) => Math.round(n * 10000) / 10000;
    const grund = { id: t.id, art: t.art, x: r(t.x), y: r(t.y), w: r(t.w) };
    return t.art === "bild" ? { ...grund, url: t.url, hoch: r(t.hoch) } : { ...grund, t: t.t, f: t.f || null };
  });
  // „-->“ darf im Text nicht vorkommen, sonst endete der Vermerk zu früh
  const json = JSON.stringify({ v: 1, teile: sauber }).replace(/-->/g, "--\\u003e");
  return { inhalt: sauber.filter((t) => t.art === "text").map((t) => t.t.trim()).join("\n\n"), inhalt_fmt: ANFANG + json + ENDE };
}

// Ein älterer Text (ohne Blatt) als ein Textfeld oben auf dem Blatt; die
// selbst gewählten Grössen waren im Schoner 1.6-fach, darum mal 1.6
export function blattAusAlt(inhalt, fmt) {
  if (istBlatt(fmt)) return blattLesen(fmt);
  if (!(inhalt || "").trim()) return { teile: [] };
  const f = fmt && htmlSauber(fmt).formatiert
    ? htmlSauber(fmt).html.replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (_, n) => "font-size:" + Math.round(Number(n) * 1.6) + "px") : null;
  return { teile: [{ id: neueId(), art: "text", x: 0.05, y: 0.12, w: 0.9, t: inhalt, f }] };
}

// Massstab: das Blatt passt ganz in den Behälter
function useMassstab(ref) {
  const [m, setM] = useState({ s: 0, l: 0, o: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const messen = () => {
      const W = el.clientWidth, H = el.clientHeight;
      const s = Math.min(W / BLATT_W, H ? H / BLATT_H : Infinity);
      if (s > 0 && isFinite(s)) setM({ s, l: (W - BLATT_W * s) / 2, o: H ? (H - BLATT_H * s) / 2 : 0 });
    };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return m;
}

const lageStil = (t) => ({ left: t.x * BLATT_W, top: t.y * BLATT_H, width: t.w * BLATT_W });

// Anzeige: Karte, Fenster, Vorschau und Bildschirmschoner
export function BlattAnsicht({ fmt, className }) {
  const ref = useRef(null);
  const m = useMassstab(ref);
  const b = blattLesen(fmt) || { teile: [] };
  return (
    <div ref={ref} className={"wblatt hell-bleibt" + (className ? " " + className : "")} data-wartung-blatt="">
      <div className="wblatt__blatt" style={{ width: BLATT_W, height: BLATT_H, transform: `translate(${m.l}px, ${m.o}px) scale(${m.s})` }}>
        {b.teile.map((t) => t.art === "bild"
          ? <img key={t.id} className="wblatt__bild" src={t.url} alt="" style={lageStil(t)} draggable={false} />
          : <div key={t.id} className="wblatt__text wartung-text" style={lageStil(t)}
              dangerouslySetInnerHTML={{ __html: formatHtml(t.f, t.t) }} />)}
      </div>
    </div>
  );
}

// Ziehen mit Maus oder Finger: bewegen(dx, dy) in Punkten des Blatts
function ziehen(e, s, bewegen, fertig) {
  e.preventDefault(); e.stopPropagation();
  const x0 = e.clientX, y0 = e.clientY;
  const zug = (ev) => bewegen((ev.clientX - x0) / s, (ev.clientY - y0) / s);
  const los = () => { window.removeEventListener("pointermove", zug); window.removeEventListener("pointerup", los);
    window.removeEventListener("pointercancel", los); if (fertig) fertig(); };
  window.addEventListener("pointermove", zug);
  window.addEventListener("pointerup", los);
  window.addEventListener("pointercancel", los);
}

async function bildAusDatei(datei) {
  const { url, hoch } = await freiesBildHochladen(datei, "wartung/bilder");
  return { id: neueId(), art: "bild", url, hoch, x: 0.3, y: 0.25, w: 0.4 };
}

// Schreiben: dasselbe Blatt, Textfelder und Bilder frei verschieben.
// teile/setTeile kommen vom Fenster, titel nur für die Hilfslinien.
export function BlattEditor({ teile, setTeile, titel }) {
  const ref = useRef(null);
  const m = useMassstab(ref);
  const [wahl, setWahl] = useState(teile.length ? teile[0].id : null);
  const [laedt, setLaedt] = useState(0);
  const teileRef = useRef(teile);
  teileRef.current = teile;
  const aendern = (id, neu) => setTeile(teileRef.current.map((t) => (t.id === id ? { ...t, ...neu } : t)));

  const bilderDazu = async (dateien) => {
    const bilder = [...dateien].filter((d) => /^image\//.test(d.type || ""));
    if (!bilder.length) return;
    setLaedt((n) => n + bilder.length);
    for (const [i, d] of bilder.entries()) {
      try {
        const b = await bildAusDatei(d);
        b.x = Math.min(0.55, b.x + i * 0.04); b.y = Math.min(0.55, b.y + i * 0.04);
        // nicht höher als das Blatt
        b.w = Math.min(b.w, 0.8 * BLATT_H / BLATT_W / b.hoch);
        setTeile([...teileRef.current, b]); setWahl(b.id);
      } catch (f) { alt.meldung("Bild liess sich nicht hochladen: " + alt.fehlertext(f), "fehler"); }
      setLaedt((n) => n - 1);
    }
  };
  // Einfügen (Strg + V, am iPad „Einsetzen“): Bilder kommen aufs Blatt,
  // egal wo die Schreibmarke ist; Text bleibt wie bisher im Feld
  useEffect(() => {
    const einfuegen = (e) => {
      if (!ref.current || !ref.current.isConnected) return;
      const dateien = [...((e.clipboardData && e.clipboardData.files) || [])].filter((d) => /^image\//.test(d.type || ""));
      if (!dateien.length) return;
      e.preventDefault(); e.stopPropagation();
      bilderDazu(dateien);
    };
    window.addEventListener("paste", einfuegen, true);
    return () => window.removeEventListener("paste", einfuegen, true);
  }, []);

  const textDazu = () => {
    const t = { id: neueId(), art: "text", x: 0.3, y: 0.4, w: 0.4, t: "", f: null };
    setTeile([...teileRef.current, t]); setWahl(t.id);
    setTimeout(() => { const el = document.querySelector(`[data-wblatt-feld="${t.id}"]`); if (el) el.focus(); }, 30);
  };
  const weg = (id) => { setTeile(teileRef.current.filter((t) => t.id !== id)); setWahl(null); };

  const verschieben = (e, t) => {
    setWahl(t.id);
    const x0 = t.x, y0 = t.y;
    ziehen(e, m.s, (dx, dy) => aendern(t.id, { x: Math.max(0, Math.min(0.98, x0 + dx / BLATT_W)), y: Math.max(0, Math.min(0.98, y0 + dy / BLATT_H)) }));
  };
  const breite = (e, t) => {
    setWahl(t.id);
    const w0 = t.w;
    ziehen(e, m.s, (dx) => aendern(t.id, { w: Math.max(0.05, Math.min(1, w0 + dx / BLATT_W)) }));
  };

  return (
    <div className="wblatt-editor">
      <div className="wblatt-editor__knoepfe">
        <button type="button" className="knopf" id="wblatt-text-neu" onMouseDown={(e) => e.preventDefault()} onClick={textDazu}>+ Textfeld</button>
        <label className="knopf" id="wblatt-bild-neu">+ Bild
          <input type="file" accept="image/*" multiple hidden data-ablegen="direkt"
            onChange={(e) => { bilderDazu(e.target.files); e.target.value = ""; }} /></label>
        <span className="klein wblatt-editor__hinweis">
          {laedt ? "Bild wird hochgeladen …" : "Bilder auch mit Strg + V einfügen. Am Griff ✥ ziehen verschiebt, am Rand rechts die Breite."}</span>
      </div>
      <div ref={ref} className="wblatt wblatt--editor hell-bleibt" id="wartung-blatt"
        onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.classList.contains("wblatt__blatt")) setWahl(null); }}>
        <div className="wblatt__blatt" style={{ width: BLATT_W, height: BLATT_H, transform: `translate(${m.l}px, ${m.o}px) scale(${m.s})`,
          "--inv": m.s ? 1 / m.s : 1 }}>
          {/* Hilfe: wo der Schoner an der Maschine „Erledigt“ zeigt */}
          <div className="wblatt__hilfe wblatt__hilfe--erledigt">✓ Erledigt</div>
          {!teile.length && <div className="wblatt__leer">Mit „+ Textfeld“ oder „+ Bild“ beginnen</div>}
          {teile.map((t, i) => {
            const an = wahl === t.id;
            return (
              <div key={t.id} className={"wblatt__teil wblatt__teil--" + t.art + (an ? " wblatt__teil--an" : "")}
                style={lageStil(t)} data-wblatt-teil={t.id}
                onPointerDown={() => setWahl(t.id)}>
                {t.art === "bild"
                  ? <img className="wblatt__bild wblatt__bild--edit" src={t.url} alt="" draggable={false}
                      onPointerDown={(e) => verschieben(e, t)} />
                  : <RichFeld className="wblatt__text wartung-text" text={t.t} html={t.f}
                      id={i === teile.findIndex((x) => x.art === "text") ? "wartung-schreiben-text" : undefined}
                      data-wblatt-feld={t.id} data-ohne-leiste="" platzhalter="Text schreiben …"
                      aendern={(tt, ff) => aendern(t.id, { t: tt, f: ff })} onFocus={() => setWahl(t.id)} />}
                <span className="wblatt__griff" title="Verschieben" data-wblatt-griff={t.id} onPointerDown={(e) => verschieben(e, t)}>✥</span>
                <span className="wblatt__breite" title="Breite ändern" data-wblatt-breite={t.id} onPointerDown={(e) => breite(e, t)} />
                <button type="button" className="wblatt__weg" title="Entfernen" data-wblatt-weg={t.id}
                  onPointerDown={(e) => e.stopPropagation()} onClick={() => weg(t.id)}>✕</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
