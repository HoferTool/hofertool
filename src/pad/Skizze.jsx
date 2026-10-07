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
//
//  Mit dem Knopf oben rechts in der Fläche geht die Skizze gross über
//  das ganze Pad auf und mit demselben Knopf (oder Escape) wieder
//  zurück in die kleine Kachel (Wunsch Patrick 6. Oktober 2026).
//  Klein und gross ist dasselbe Blatt im Querformat 16:10, klein einfach
//  verkleinert: gleiche Umbrüche, nichts abgeschnitten (Wunsch Patrick
//  6. Oktober 2026, "meistens macht man es eh auf"). Nur ältere
//  Zeichnungen, die über das Blatt hinausgehen, werden kleiner gezeigt.
//
//  Knopf "T" setzt ein Textfeld auf die Skizze, mit Fett, Kursiv,
//  Unterstrichen und Schriftgrösse wie die Info an der Maschine
//  (Wunsch Patrick 6. Oktober 2026). Textfelder stehen in derselben
//  Liste wie die Striche, darum gelten dieselben Regeln (je Auftrag,
//  auf allen Pads, weg bei Fertig) und es braucht kein neues SQL.
// =================================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alt } from "../bruecke.jsx";
import { FettText } from "../teile/FettText.jsx";
import { rund, strichZeichnen, getroffen, Symbol, RADIERER, ZURUECK, EIMER, TEXT, GROSS, KLEIN } from "../teile/zeichnen.jsx";

// Alles zum Zeichnen steht auf einer Zeile (Wunsch Patrick 6. Oktober
// 2026): ein Farbknopf mit dem Farbwähler des Geräts (dort gibt es auch
// die Pipette; Weiss und Schwarz gibt es dort auch, darum keine eigenen
// Knöpfe mehr dafür) und ein Knopf, der die Stiftdicke reihum wechselt
// (Start: mittel).
// Dicke in Bildpunkten bei 400 px Breite, wächst mit der Fläche mit
const DICKEN = [["duenn", 3], ["mittel", 7], ["dick", 14]];
const NACHLADEN_MS = 15000;
// Höhe des Blatts im Verhältnis zur Breite (16:10, wie die grosse
// Skizze auf dem iPad quer)
const BLATT = 0.625;
// Textfelder werden auf einem gedachten Blatt dieser Breite gesetzt und
// als Ganzes skaliert, damit sie klein genau so umbrechen wie gross
const TEXTBLATT = 1000;
// Schriftgrösse der Textfelder in Bildpunkten bei 400 px Breite,
// wächst wie die Striche mit der Fläche mit
const SCHRIFTEN = [["klein", "Klein", 14], ["mittel", "Mittel", 20], ["gross", "Gross", 30],
                   ["riesig", "Sehr gross", 44]];
const schriftPx = (g) => (SCHRIFTEN.find((x) => x[0] === g) || SCHRIFTEN[1])[2];
// Ein Textfeld: { t: 1, h: Text (mit <b>, <i>, <u>, <s>, <br>), x, y, g: Grösse,
// f: "#hex", b: Breite (fehlt = so breit wie der Text), p: [] }. Das leere p lässt ältere Fassungen der App, die
// noch auf einem Pad offen sind, das Feld einfach übergehen.
const istText = (s) => !!(s && s.t);

// Früher gemerkte Farben waren Namen aus der Palette, jetzt #hex
function farbHex(wert) {
  if (/^#[0-9a-f]{6}$/i.test(wert || "")) return wert.toLowerCase();
  const f = (alt.PLANFARBEN || []).find((x) => x.wert === wert);
  return f ? f.hex : "#ffffff";
}

function fehltTabelle(e) {
  const t = String((e && (e.message || e.code)) || "");
  return /pad_skizzen|PGRST205|42P01|does not exist|schema cache/i.test(t);
}

export default function Skizze({ j }) {
  const jobId = j ? j.id : null;
  const darf = !!(jobId && alt.darfSchreiben && alt.darfSchreiben());
  const [striche, setStriche] = useState([]);
  const [farbe, setFarbe] = useState(() => farbHex(alt.pad.skizzeFarbe || "#ffffff"));
  const [dicke, setDicke] = useState(() => alt.pad.skizzeDicke || "mittel");
  const [radierer, setRadierer] = useState(false);
  const [zustand, setZustand] = useState("laedt"); // laedt | bereit | fehlt
  const [gross, setGross] = useState(false);
  const [masse, setMasse] = useState({ w: 0, k: 1 });
  const [zieh, setZieh] = useState(null); // Textfeld, das gerade verschoben wird
  const [breiteZieh, setBreiteZieh] = useState(null); // Textfeld, dessen Breite gerade gezogen wird
  const verlauf = useRef([]);        // frühere Fassungen für Rückgängig
  const ziehen = useRef(null);
  const getippt = useRef(null);
  const massstab = useRef(1);        // < 1, wenn die Zeichnung sonst nicht ganz hineinpasst
  const flaeche = useRef(null);
  const raum = useRef(null);         // Platz in der Kachel, in den das Blatt passen muss
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
    // Passt die Zeichnung nicht ganz hinein (gross gezeichnet, oder auf
    // einem Pad mit höherer Fläche), wird sie verkleinert, damit überall
    // alles zu sehen ist. Nur die fertigen Striche zählen, sonst würde
    // der Strich unter dem Finger springen.
    let mx = 0, my = 0;
    strichRef.current.forEach((s) => {
      // Bei Textfeldern zählt der Anfang; verschieben lassen sie sich nur in der Fläche
      if (istText(s)) { mx = Math.max(mx, s.x); my = Math.max(my, s.y + 0.03); return; }
      const p = s.p || [], r = (s.d || 0) / 2;
      for (let i = 0; i + 1 < p.length; i += 2) { mx = Math.max(mx, p[i] + r); my = Math.max(my, p[i + 1] + r); }
    });
    const hoehe = BLATT;
    let k = 1;
    // mit etwas Rand, damit nichts an der Kante klebt
    if (mx > 1) k = Math.min(k, 0.98 / mx);
    if (my > hoehe) k = Math.min(k, 0.98 * hoehe / my);
    massstab.current = k;
    // Die Textfelder liegen als Elemente über der Leinwand und brauchen
    // dieselbe Breite und Verkleinerung
    setMasse((m) => (m.w === w && m.k === k ? m : { w, k }));
    strichRef.current.forEach((s) => strichZeichnen(c, s, w * k));
    if (aktuell.current) strichZeichnen(c, aktuell.current, w * k);
  }, []);

  useLayoutEffect(() => { allesZeichnen(); }, [striche, allesZeichnen]);

  // Die Fläche folgt der Grösse der Kachel
  useLayoutEffect(() => {
    const el = flaeche.current, cv = leinwand.current, rm = raum.current;
    if (!el || !cv || !rm) return;
    const anpassen = () => {
      // Das grösste Blatt 16:10, das in den Platz passt
      const r = rm.getBoundingClientRect();
      const w = Math.max(1, Math.floor(Math.min(r.width, r.height / BLATT)));
      const h = Math.max(1, Math.round(w * BLATT));
      el.style.width = w + "px"; el.style.height = h + "px";
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      breite.current = w;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + "px"; cv.style.height = h + "px";
      allesZeichnen();
    };
    anpassen();
    const ro = new ResizeObserver(anpassen);
    ro.observe(rm);
    return () => ro.disconnect();
  }, [allesZeichnen, gross]);

  const grossUmschalten = () => setGross(!gross);

  // Escape macht die grosse Skizze klein, statt das ganze Pad zu
  // schliessen: darum schon auf window und vor allen anderen
  useEffect(() => {
    if (!gross) return;
    const taste = (e) => {
      if (e.key !== "Escape" || document.querySelector(".dialog-huelle")) return;
      e.preventDefault(); e.stopPropagation();
      setGross(false);
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [gross]);

  // Auftrag gewechselt: wieder klein
  useEffect(() => { setGross(false); }, [jobId]);

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
        verlauf.current = [];
        setStriche(Array.isArray(d && d.striche) ? d.striche : []);
      }
      setZustand("bereit");
    } catch (e) {
      if (fehltTabelle(e)) setZustand("fehlt");
      else { setZustand("bereit"); if (!still) alt.fehlerMerken && alt.fehlerMerken("Skizze laden", alt.fehlertext(e)); }
    }
  }, [jobId]);

  useEffect(() => {
    setStriche([]); stand.current = ""; verlauf.current = []; setZustand("laedt");
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

  // Jede Änderung merkt sich die Fassung davor, damit Rückgängig auch
  // Verschieben, Bearbeiten und Löschen zurücknimmt
  const merken = () => {
    verlauf.current.push(strichRef.current);
    if (verlauf.current.length > 60) verlauf.current.shift();
  };
  const aendern = (liste) => { merken(); strichRef.current = liste; setStriche(liste); speichern(liste); };

  // ---------- Finger ----------
  const punkt = (e) => {
    const r = leinwand.current.getBoundingClientRect();
    const w = (r.width || 1) * massstab.current;
    return [rund((e.clientX - r.left) / w), rund((e.clientY - r.top) / w)];
  };

  const radieren = (x, y) => {
    const r = 12 / ((breite.current || 400) * massstab.current);
    const rest = strichRef.current.filter((s) => istText(s) || !getroffen(s, x, y, r));
    if (rest.length !== strichRef.current.length) { strichRef.current = rest; setStriche(rest); }
  };

  const runter = (e) => {
    if (!darf || zustand === "fehlt" || zeiger.current !== null) return;
    e.preventDefault();
    zeiger.current = e.pointerId;
    try { leinwand.current.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const [x, y] = punkt(e);
    if (radierer) { merken(); radieren(x, y); return; }
    const px = (DICKEN.find((d) => d[0] === dicke) || DICKEN[1])[1];
    aktuell.current = { f: farbe, d: rund(px / 400), p: [x, y] };
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
      // Nichts getroffen: auch nichts zum Zurücknehmen
      const vorher = verlauf.current[verlauf.current.length - 1];
      if (vorher === strichRef.current) verlauf.current.pop();
      else speichern(strichRef.current);
      return;
    }
    const s = aktuell.current;
    aktuell.current = null;
    if (s) aendern([...strichRef.current, s]);
  };

  // ---------- Leiste ----------
  const farbeWaehlen = (f) => { setFarbe(f); setRadierer(false); alt.pad.skizzeFarbe = f; };
  const dickeWechseln = () => {
    const i = DICKEN.findIndex((d) => d[0] === dicke);
    const d = DICKEN[(i + 1) % DICKEN.length][0];
    setDicke(d); setRadierer(false); alt.pad.skizzeDicke = d;
  };
  const dickePx = (DICKEN.find((d) => d[0] === dicke) || DICKEN[1])[1];
  const zurueck = () => {
    const vorher = verlauf.current.pop();
    const liste = vorher || striche.slice(0, -1);
    if (!vorher && !striche.length) return;
    strichRef.current = liste; setStriche(liste); speichern(liste);
  };

  // ---------- Textfelder ----------
  const textDialog = (wert) => alt.dialogFelder({
    titel: wert ? "Text bearbeiten" : "Text einfügen",
    felder: [
      { name: "text", label: "Text", typ: "textarea", fett: true, durch: true, wert: wert ? wert.h : "",
        hinweis: wert ? "Text leeren und speichern nimmt das Feld weg." : "Danach mit dem Finger verschieben." },
      { name: "schrift", label: "Schriftgrösse", wert: wert ? wert.g : (alt.pad.skizzeSchrift || "mittel"),
        auswahl: SCHRIFTEN.map((x) => [x[0], x[1]]) }],
    bestaetigen: wert ? "Speichern" : "Einfügen" });

  const textNeu = async () => {
    setRadierer(false);
    const w = await textDialog(null);
    if (!w || !(w.text || "").trim()) return;
    alt.pad.skizzeSchrift = w.schrift;
    // Links oben, ein weiteres unter den Texten, die schon da sind
    const k = massstab.current || 1;
    const f = flaeche.current.getBoundingClientRect();
    let unten = 0.05;
    flaeche.current.querySelectorAll("[data-skizzetext]").forEach((el) => {
      unten = Math.max(unten, (el.getBoundingClientRect().bottom - f.top) / (f.width || 1) + 0.015);
    });
    if (unten > BLATT - 0.06) unten = 0.05;
    aendern([...strichRef.current, { t: 1, h: w.text.trim(), x: rund(0.05 / k),
      y: rund(unten / k), g: w.schrift, f: farbe, p: [] }]);
  };

  const textBearbeiten = async (i) => {
    const alt0 = strichRef.current[i];
    const w = await textDialog(alt0);
    if (!w || strichRef.current[i] !== alt0) return;
    const text = (w.text || "").trim();
    const liste = strichRef.current.slice();
    if (text) liste[i] = { ...alt0, h: text, g: w.schrift };
    else liste.splice(i, 1);
    aendern(liste);
  };

  // Antippen bearbeitet, Ziehen verschiebt, mit dem Radierer weg
  const textRunter = (e, i) => {
    if (!darf || zeiger.current !== null) return;
    e.preventDefault(); e.stopPropagation();
    if (radierer) { aendern(strichRef.current.filter((_, n) => n !== i)); return; }
    zeiger.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const s = strichRef.current[i];
    ziehen.current = { i, s, sx: e.clientX, sy: e.clientY, weit: false };
    setZieh({ i, x: s.x, y: s.y });
  };
  const textBewegen = (e) => {
    const z = ziehen.current;
    if (!z || zeiger.current !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - z.sx, dy = e.clientY - z.sy;
    if (!z.weit && Math.hypot(dx, dy) < 8) return;
    z.weit = true;
    const cv = leinwand.current.getBoundingClientRect();
    const einheit = (cv.width || 1) * massstab.current;
    // In der Fläche bleiben
    const x = Math.max(0, Math.min((cv.width - 30) / einheit, z.s.x + dx / einheit));
    const y = Math.max(0, Math.min((cv.height - 20) / einheit, z.s.y + dy / einheit));
    setZieh({ i: z.i, x: rund(x), y: rund(y) });
    z.x = rund(x); z.y = rund(y);
  };
  const textHoch = (e) => {
    const z = ziehen.current;
    if (!z || zeiger.current !== e.pointerId) return;
    zeiger.current = null; ziehen.current = null; setZieh(null);
    if (strichRef.current[z.i] !== z.s) return;
    if (z.weit) {
      const liste = strichRef.current.slice();
      liste[z.i] = { ...z.s, x: z.x, y: z.y };
      aendern(liste);
    } else if (e.type === "pointerup") getippt.current = z.i;
  };
  // Bearbeiten erst beim Klick, sonst landet der Klick nach dem Antippen
  // auf dem Hintergrund des neuen Fensters und schliesst es gleich wieder
  const textKlick = (i) => {
    if (getippt.current !== i) return;
    getippt.current = null;
    textBearbeiten(i);
  };
  // Breite eines Textfelds mit dem Griff rechts ziehen (Wunsch Patrick
  // 7. Oktober 2026: „Grösse vom Feld anpassen“). Gespeichert als b in
  // Breitenanteilen wie x; ohne b ist das Feld so breit wie sein Text.
  const breiteRunter = (e, i) => {
    if (!darf || zeiger.current !== null) return;
    e.preventDefault(); e.stopPropagation();
    const ziel = e.currentTarget, s0 = strichRef.current[i];
    try { ziel.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const cv = leinwand.current.getBoundingClientRect();
    const einheit = (cv.width || 1) * massstab.current;
    // Ecke unten rechts: Breite und Höhe zugleich (Wunsch Patrick
    // 7. Oktober 2026: „in beide Richtungen“); m ist die Mindesthöhe
    const r0 = ziel.parentNode.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, b0 = r0.width / einheit, m0 = r0.height / einheit;
    let b = b0, m = s0.m || 0;
    const bewegt = (ev) => {
      b = rund(Math.max(0.08, Math.min(1 / massstab.current - s0.x, b0 + (ev.clientX - sx) / einheit)));
      m = rund(Math.max(0.02, m0 + (ev.clientY - sy) / einheit));
      setBreiteZieh({ i, b, m });
    };
    const fertig = () => {
      ziel.removeEventListener("pointermove", bewegt);
      ziel.removeEventListener("pointerup", fertig);
      ziel.removeEventListener("pointercancel", fertig);
      setBreiteZieh(null);
      if (strichRef.current[i] !== s0 || (Math.abs(b - b0) < 0.005 && Math.abs(m - (s0.m || 0)) < 0.005)) return;
      const liste = strichRef.current.slice();
      liste[i] = { ...s0, b, m };
      aendern(liste);
    };
    ziel.addEventListener("pointermove", bewegt);
    ziel.addEventListener("pointerup", fertig);
    ziel.addEventListener("pointercancel", fertig);
  };

  const loeschen = async () => {
    if (!striche.length) return;
    const ok = await alt.nachfragen({ titel: "Skizze löschen?",
      text: "Die ganze Zeichnung verschwindet auf allen Pads dieser Maschine.",
      bestaetigen: "Ja, löschen", gefahr: true });
    if (ok) aendern([]);
  };

  const leer = !striche.length && !aktuell.current;
  const kannZurueck = !!(striche.length || verlauf.current.length);
  const hinweis = !jobId ? "Kein Auftrag: nichts zum Zeichnen."
    : zustand === "fehlt" ? "Zeichnen geht, sobald die Datei pad-skizze.sql in Supabase ausgeführt ist."
    : zustand === "laedt" ? "Wird geladen …"
    : !darf ? "Keine Zeichnung."
    : "Mit dem Finger zeichnen. Bleibt, bis der Auftrag fertig ist.";

  const grossKnopf = jobId && zustand !== "fehlt" &&
    <button type="button" data-skizze="gross" className="pad-skizze__knopf pad-skizze__gross"
      aria-label={gross ? "Verkleinern" : "Gross öffnen"} title={gross ? "Verkleinern" : "Gross öffnen"}
      onClick={grossUmschalten}>
      <Symbol d={gross ? KLEIN : GROSS} />{gross && <span>Verkleinern</span>}</button>;

  const flaecheTeil = (
    <div className="pad-skizze__raum" ref={raum}>
    <div className="pad-skizze__flaeche" ref={flaeche}>
      <canvas ref={leinwand} className={"pad-skizze__leinwand" + (radierer ? " pad-skizze__leinwand--radierer" : "")}
        onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
        onLostPointerCapture={hoch} />
      {masse.w > 0 &&
      <div className="pad-skizze__textblatt" style={{ width: TEXTBLATT, height: TEXTBLATT * BLATT,
        transform: "scale(" + masse.w / TEXTBLATT + ")" }}>
      {striche.map((s, i) => {
        if (!istText(s)) return null;
        const pos = zieh && zieh.i === i ? zieh : s;
        const e = TEXTBLATT * masse.k;
        const links = pos.x * e;
        const b = breiteZieh && breiteZieh.i === i ? breiteZieh.b : s.b;
        const m = breiteZieh && breiteZieh.i === i ? breiteZieh.m : s.m;
        return (
          <div key={"t" + i} className={"pad-skizze__text" + (darf ? " pad-skizze__text--darf" : "")
            + (zieh && zieh.i === i ? " pad-skizze__text--zieht" : "")}
            data-skizzetext={i}
            style={{ left: links, top: pos.y * e, color: s.f,
                     fontSize: schriftPx(s.g) / 400 * e,
                     width: b ? b * e : undefined, minHeight: m ? m * e : undefined, maxWidth: b ? undefined : Math.max(120, TEXTBLATT - links - 8) }}
            onPointerDown={(ev) => textRunter(ev, i)} onPointerMove={textBewegen}
            onPointerUp={textHoch} onPointerCancel={textHoch} onClick={() => textKlick(i)}>
            <FettText text={s.h} />
            {darf && <span className="pad-skizze__breite" data-skizzebreite={i} aria-label="Grösse ändern"
              title="Grösse ändern" onPointerDown={(ev) => breiteRunter(ev, i)} onClick={(ev) => ev.stopPropagation()} />}
            </div>
        );
      })}
      </div>}
      {leer && <span className="pad-skizze__hinweis">{hinweis}</span>}
      {!gross && grossKnopf}
    </div>
    </div>
  );

  const karte = (
    <div className={"pad-karte2 pad-karte2--skizze" + (gross ? " pad-karte2--skizze-gross" : "")}
      data-padfeld="skizze" data-skizzegross={gross ? "" : undefined}>
      <div className="pad-skizze__kopf">
        <span className="pad-name">Skizze</span>
        {darf && zustand !== "fehlt" &&
          <div className="pad-skizze__leiste">
            {/* Der Farbwähler liegt unsichtbar über dem Knopf: ein Tipp
                öffnet direkt den des Geräts */}
            <label className={"pad-skizze__farbe pad-skizze__farbe--waehler" + (!radierer
              ? " aktiv" : "")} style={{ "--f": farbe }}
              aria-label="Farbe wählen" title="Farbe wählen">
              <input type="color" value={farbe} data-skizzefarbwahl=""
                onChange={(e) => farbeWaehlen(e.target.value.toLowerCase())} />
            </label>
            <button type="button" data-skizze="text" aria-label="Text einfügen" title="Text einfügen"
              className="pad-skizze__knopf" onClick={textNeu}><Symbol d={TEXT} /></button>
            <button type="button" aria-label={"Stiftdicke " + dicke} title="Stiftdicke wechseln"
              data-skizzedicke={dicke} className="pad-skizze__knopf" onClick={dickeWechseln}>
              <i style={{ width: Math.max(4, dickePx * 1.1), height: Math.max(4, dickePx * 1.1),
                          background: farbe, boxShadow: "0 0 0 1px rgba(255,255,255,.5)" }} /></button>
            <button type="button" data-skizze="radierer" aria-label="Radierer"
              className={"pad-skizze__knopf" + (radierer ? " aktiv" : "")}
              onClick={() => setRadierer(!radierer)}><Symbol d={RADIERER} /></button>
            <button type="button" data-skizze="zurueck" aria-label="Rückgängig"
              className="pad-skizze__knopf" disabled={!kannZurueck}
              onClick={zurueck}><Symbol d={ZURUECK} /></button>
            <button type="button" data-skizze="loeschen" aria-label="Alles löschen"
              className="pad-skizze__knopf pad-skizze__knopf--rot"
              disabled={!striche.length} onClick={loeschen}><Symbol d={EIMER} /></button>
          </div>}
        {gross && grossKnopf}
      </div>
      {flaecheTeil}
    </div>
  );

  if (!gross) return karte;
  // Gross liegt die Skizze über dem ganzen Pad; in der Spalte bleibt
  // eine leere Kachel, damit sich das Dashboard darunter nicht verschiebt
  const ziel = document.getElementById("pad") || document.body;
  return (
    <>
      <div className="pad-karte2 pad-karte2--skizze" aria-hidden="true" />
      {createPortal(<div className="pad-skizze-gross">{karte}</div>, ziel)}
    </>
  );
}
