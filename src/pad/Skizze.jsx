// =================================================================
//  PAD MODE: SKIZZE
//  Zeichenfläche rechts im Dashboard: kurze Hinweise mit dem Finger
//  (Wunsch Patrick 5. Oktober 2026). Die Zeichnung gehört zum Auftrag,
//  steht also auf jedem Pad dieser Maschine und verschwindet, sobald
//  der Auftrag fertig ist (Auslöser in sql/pad-skizze.sql) oder jemand
//  "Löschen" drückt.
//
//  Gespeichert werden die Striche, kein Bild: Farbe, Dicke und Punkte.
//  Die Punkte sind durch die Breite der Fläche geteilt, darum passt
//  die Zeichnung auf jedes Pad, egal wie breit die Spalte dort ist,
//  und wird nie verzerrt.
// =================================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";

// Farben aus der App-Palette, die auf dem dunklen Pad gut zu sehen sind
const FARBEN = ["weiss", "gelb", "hellorange", "rot", "rosa", "hellgruen", "cyan", "flieder"];
// Dicke in Bildpunkten bei 400 px Breite, wächst mit der Fläche mit
const DICKEN = [["duenn", 3], ["mittel", 7], ["dick", 14]];
const NACHLADEN_MS = 15000;

// Kleine Symbole statt Wörtern, damit die Leiste in die schmale Spalte passt
const RADIERER = "M7 21h10M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5l-3-3a1 1 0 0 1 0-.5z";
const ZURUECK = "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11";
const EIMER = "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3";
function Symbol({ d }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

function farbHex(wert) {
  const f = (alt.PLANFARBEN || []).find((x) => x.wert === wert);
  return f ? f.hex : "#ffffff";
}

function rund(n) { return Math.round(n * 10000) / 10000; }

// Ein Strich: { f: "#hex", d: Dicke / Breite, p: [x0, y0, x1, y1, …] }
function strichZeichnen(c, s, w) {
  const p = s.p;
  if (!p || p.length < 2) return;
  c.strokeStyle = s.f; c.fillStyle = s.f;
  c.lineWidth = Math.max(1, s.d * w);
  c.lineCap = "round"; c.lineJoin = "round";
  if (p.length === 2) {
    c.beginPath(); c.arc(p[0] * w, p[1] * w, c.lineWidth / 2, 0, Math.PI * 2); c.fill();
    return;
  }
  // Weich durch die Mitten der Teilstücke, damit Finger-Striche nicht eckig wirken
  c.beginPath();
  c.moveTo(p[0] * w, p[1] * w);
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
    c.quadraticCurveTo(p[i] * w, p[i + 1] * w, mx * w, my * w);
  }
  c.lineTo(p[p.length - 2] * w, p[p.length - 1] * w);
  c.stroke();
}

// Liegt der Punkt (in Breitenanteilen) auf dem Strich?
function getroffen(s, x, y, r) {
  const p = s.p, rr = r + s.d / 2;
  for (let i = 0; i < p.length; i += 2) {
    const dx = p[i] - x, dy = p[i + 1] - y;
    if (dx * dx + dy * dy <= rr * rr) return true;
    if (i + 3 < p.length) {
      // Abstand zum Teilstück, damit schnelle, lange Striche auch zählen
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const l = (bx - ax) ** 2 + (by - ay) ** 2;
      if (l > 0) {
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l));
        const qx = ax + t * (bx - ax) - x, qy = ay + t * (by - ay) - y;
        if (qx * qx + qy * qy <= rr * rr) return true;
      }
    }
  }
  return false;
}

function fehltTabelle(e) {
  const t = String((e && (e.message || e.code)) || "");
  return /pad_skizzen|PGRST205|42P01|does not exist|schema cache/i.test(t);
}

export default function Skizze({ j }) {
  const jobId = j ? j.id : null;
  const darf = !!(jobId && alt.darfSchreiben && alt.darfSchreiben());
  const [striche, setStriche] = useState([]);
  const [farbe, setFarbe] = useState(() => alt.pad.skizzeFarbe || "weiss");
  const [dicke, setDicke] = useState(() => alt.pad.skizzeDicke || "mittel");
  const [radierer, setRadierer] = useState(false);
  const [zustand, setZustand] = useState("laedt"); // laedt | bereit | fehlt
  const flaeche = useRef(null);
  const leinwand = useRef(null);
  const breite = useRef(0);
  const aktuell = useRef(null);      // Strich, der gerade entsteht
  const zeiger = useRef(null);       // nur ein Finger zeichnet
  const stand = useRef("");          // geaendert_am der geladenen Fassung
  const offen = useRef(null);        // wartendes Speichern
  const strichRef = useRef(striche);
  strichRef.current = striche;

  // ---------- Zeichnen ----------
  const allesZeichnen = useCallback(() => {
    const cv = leinwand.current;
    if (!cv) return;
    const c = cv.getContext("2d");
    const w = breite.current;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const dpr = cv.width / (w || 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    strichRef.current.forEach((s) => strichZeichnen(c, s, w));
    if (aktuell.current) strichZeichnen(c, aktuell.current, w);
  }, []);

  useLayoutEffect(() => { allesZeichnen(); }, [striche, allesZeichnen]);

  // Die Fläche folgt der Grösse der Kachel
  useLayoutEffect(() => {
    const el = flaeche.current, cv = leinwand.current;
    if (!el || !cv) return;
    const anpassen = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      breite.current = r.width;
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
      allesZeichnen();
    };
    anpassen();
    const ro = new ResizeObserver(anpassen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [allesZeichnen]);

  // ---------- Laden und Speichern ----------
  const laden = useCallback(async (still) => {
    if (!jobId) { setZustand("bereit"); return; }
    try {
      const r = await alt.zeitlimit(alt.db.from("pad_skizzen")
        .select("striche, geaendert_am").eq("job_id", jobId).maybeSingle(), 8000, "Skizze");
      if (r && r.error) throw r.error;
      // Während jemand hier zeichnet oder noch gespeichert wird, nichts überschreiben
      if (zeiger.current !== null || offen.current) return;
      const d = r && r.data;
      const neu = d ? String(d.geaendert_am || "") : "";
      if (!still || neu !== stand.current) {
        stand.current = neu;
        setStriche(Array.isArray(d && d.striche) ? d.striche : []);
      }
      setZustand("bereit");
    } catch (e) {
      if (fehltTabelle(e)) setZustand("fehlt");
      else { setZustand("bereit"); if (!still) alt.fehlerMerken && alt.fehlerMerken("Skizze laden", alt.fehlertext(e)); }
    }
  }, [jobId]);

  useEffect(() => {
    setStriche([]); stand.current = ""; setZustand("laedt");
    laden(false);
    // Andere Pads derselben Maschine zeichnen mit: regelmässig nachsehen
    const t = setInterval(() => { if (!document.hidden) laden(true); }, NACHLADEN_MS);
    return () => clearInterval(t);
  }, [laden]);

  const speichern = useCallback((liste) => {
    if (!jobId) return;
    clearTimeout(offen.current && offen.current.t);
    const auftrag = { t: 0 };
    offen.current = auftrag;
    auftrag.t = setTimeout(async () => {
      const jetzt = new Date().toISOString();
      try {
        const r = await alt.zeitlimit(alt.db.from("pad_skizzen")
          .upsert({ job_id: jobId, striche: liste, geaendert_am: jetzt }, { onConflict: "job_id" }),
          8000, "Skizze speichern");
        if (r && r.error) throw r.error;
        stand.current = jetzt;
      } catch (e) {
        if (fehltTabelle(e)) {
          setZustand("fehlt");
        } else {
          alt.meldung("Skizze nicht gespeichert: " + alt.fehlertext(e), "fehler");
        }
      } finally {
        if (offen.current === auftrag) offen.current = null;
      }
    }, 500);
  }, [jobId]);

  // Beim Verlassen nichts verlieren: wartendes Speichern sofort senden
  useEffect(() => () => {
    if (offen.current && jobId) {
      clearTimeout(offen.current.t);
      offen.current = null;
      alt.db.from("pad_skizzen").upsert({ job_id: jobId, striche: strichRef.current,
        geaendert_am: new Date().toISOString() }, { onConflict: "job_id" }).then(() => {}, () => {});
    }
  }, [jobId]);

  const aendern = (liste) => { setStriche(liste); speichern(liste); };

  // ---------- Finger ----------
  const punkt = (e) => {
    const r = leinwand.current.getBoundingClientRect();
    const w = r.width || 1;
    return [rund((e.clientX - r.left) / w), rund((e.clientY - r.top) / w)];
  };

  const radieren = (x, y) => {
    const r = 12 / (breite.current || 400);
    const rest = strichRef.current.filter((s) => !getroffen(s, x, y, r));
    if (rest.length !== strichRef.current.length) { strichRef.current = rest; setStriche(rest); }
  };

  const runter = (e) => {
    if (!darf || zustand === "fehlt" || zeiger.current !== null) return;
    e.preventDefault();
    zeiger.current = e.pointerId;
    try { leinwand.current.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const [x, y] = punkt(e);
    if (radierer) { radieren(x, y); return; }
    const px = (DICKEN.find((d) => d[0] === dicke) || DICKEN[1])[1];
    aktuell.current = { f: farbHex(farbe), d: rund(px / 400), p: [x, y] };
    allesZeichnen();
  };

  const bewegen = (e) => {
    if (zeiger.current !== e.pointerId) return;
    e.preventDefault();
    // Zwischenpunkte, die der Browser zusammengefasst hat, mitnehmen
    const liste = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (liste.length ? liste : [e]).forEach((ev) => {
      const [x, y] = punkt(ev);
      if (radierer) { radieren(x, y); return; }
      const s = aktuell.current;
      if (!s) return;
      const n = s.p.length;
      // Sehr dichte Punkte bringen nichts und machen die Daten gross
      if (Math.hypot(x - s.p[n - 2], y - s.p[n - 1]) < 0.002) return;
      s.p.push(x, y);
    });
    if (!radierer) allesZeichnen();
  };

  const hoch = (e) => {
    if (zeiger.current !== e.pointerId) return;
    zeiger.current = null;
    if (radierer) {
      speichern(strichRef.current);
      return;
    }
    const s = aktuell.current;
    aktuell.current = null;
    if (s) aendern([...strichRef.current, s]);
  };

  // ---------- Leiste ----------
  const farbeWaehlen = (f) => { setFarbe(f); setRadierer(false); alt.pad.skizzeFarbe = f; };
  const dickeWaehlen = (d) => { setDicke(d); setRadierer(false); alt.pad.skizzeDicke = d; };
  const zurueck = () => { if (striche.length) aendern(striche.slice(0, -1)); };
  const loeschen = async () => {
    if (!striche.length) return;
    const ok = await alt.nachfragen({ titel: "Skizze löschen?",
      text: "Die ganze Zeichnung verschwindet auf allen Pads dieser Maschine.",
      bestaetigen: "Ja, löschen", gefahr: true });
    if (ok) aendern([]);
  };

  const leer = !striche.length && !aktuell.current;
  const hinweis = !jobId ? "Kein Auftrag: nichts zum Zeichnen."
    : zustand === "fehlt" ? "Zeichnen geht, sobald die Datei pad-skizze.sql in Supabase ausgeführt ist."
    : zustand === "laedt" ? "Wird geladen …"
    : !darf ? "Keine Zeichnung."
    : "Mit dem Finger zeichnen. Bleibt, bis der Auftrag fertig ist.";

  return (
    <div className="pad-karte2 pad-karte2--skizze" data-padfeld="skizze">
      <div className="pad-skizze__kopf">
        <span className="pad-name">Skizze</span>
        {darf && zustand !== "fehlt" &&
          <div className="pad-skizze__leiste">
            <div className="pad-skizze__farben">
              {FARBEN.map((f) => (
                <button key={f} type="button" aria-label={"Farbe " + f} data-skizzefarbe={f}
                  className={"pad-skizze__farbe" + (!radierer && farbe === f ? " aktiv" : "")}
                  style={{ "--f": farbHex(f) }} onClick={() => farbeWaehlen(f)} />
              ))}
            </div>
            <div className="pad-skizze__gruppe">
              {DICKEN.map(([d, px]) => (
                <button key={d} type="button" aria-label={"Stift " + d} data-skizzedicke={d}
                  className={"pad-skizze__knopf" + (!radierer && dicke === d ? " aktiv" : "")}
                  onClick={() => dickeWaehlen(d)}>
                  <i style={{ width: Math.max(4, px * 1.1), height: Math.max(4, px * 1.1),
                              background: radierer ? "#cfe0f5" : farbHex(farbe) }} /></button>
              ))}
              <button type="button" data-skizze="radierer" aria-label="Radierer"
                className={"pad-skizze__knopf" + (radierer ? " aktiv" : "")}
                onClick={() => setRadierer(!radierer)}><Symbol d={RADIERER} /></button>
              <button type="button" data-skizze="zurueck" aria-label="Rückgängig"
                className="pad-skizze__knopf" disabled={!striche.length}
                onClick={zurueck}><Symbol d={ZURUECK} /></button>
              <button type="button" data-skizze="loeschen" aria-label="Alles löschen"
                className="pad-skizze__knopf pad-skizze__knopf--rot"
                disabled={!striche.length} onClick={loeschen}><Symbol d={EIMER} /></button>
            </div>
          </div>}
      </div>
      <div className="pad-skizze__flaeche" ref={flaeche}>
        <canvas ref={leinwand} className={"pad-skizze__leinwand" + (radierer ? " pad-skizze__leinwand--radierer" : "")}
          onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
          onLostPointerCapture={hoch} />
        {leer && <span className="pad-skizze__hinweis">{hinweis}</span>}
      </div>
    </div>
  );
}
