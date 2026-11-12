// =================================================================
//  RUNDES MAGAZIN DER 508 (seit 1.500.0)
//  Wunsch Patrick 12. November 2026: „die 2 Ebenen vom runden Magazin
//  mit je 24 Werkzeugen graphisch zeigen, dann kann man die Werkzeuge
//  aus der CAM-Liste per Drag and Drop aufs Magazin legen“.
//  Ebene 1 = Fach 1–24, Ebene 2 = Fach 25–48 (bestätigt Patrick 12. November 2026).
//  Ziehen mit Pointer-Ereignissen statt HTML-Drag, damit es auch mit
//  dem Finger auf dem iPad geht. Antippen eines belegten Platzes wählt
//  die Marke (erst Platz, dann Marke, Entscheid Patrick).
// =================================================================
import { useRef, useState } from "react";
import { fachGeschuetzt, wirdGeschrieben } from "./wz508.js";

const JE_EBENE = 24;
const kurz = (s, n = 18) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

export default function Magazin508({ bloecke, zeilen, marken = [], onFach, onMarke, MarkeZeigen }) {
  const [gewaehlt, setGewaehlt] = useState(null);
  const [geist, setGeist] = useState(null);
  // Antippen statt Ziehen (Handy, wenn der Platz nicht im Bild ist):
  // Werkzeug antippen nimmt es „in die Hand“, dann den Platz antippen
  const [hand, setHand] = useState(null);
  const zug = useRef(null);

  // Was steckt nach dem Schreiben in welchem Fach?
  const cam = {};
  const geleert = new Set();
  zeilen.filter(wirdGeschrieben).forEach((v) => {
    (cam[v.fach] = cam[v.fach] || []).push(v);
    if (v.leeren) geleert.add(v.leeren.fach);
  });
  const sortiert = bloecke.slice().sort((a, b) => a.fach - b.fach);
  const ebenen = [];
  for (let i = 0; i < sortiert.length; i += JE_EBENE) ebenen.push(sortiert.slice(i, i + JE_EBENE));

  // ---------- Ziehen ----------
  const runter = (e, v) => {
    if (e.button && e.button !== 0) return;
    zug.current = { v, x0: e.clientX, y0: e.clientY, zieht: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (f) { /* ohne Fangen geht es auch */ }
  };
  const bewegen = (e) => {
    const z = zug.current;
    if (!z) return;
    if (!z.zieht && Math.hypot(e.clientX - z.x0, e.clientY - z.y0) > 6) z.zieht = true;
    if (!z.zieht) return;
    setGeist({ v: z.v, x: e.clientX, y: e.clientY });
    // Am Rand rollt die Seite mit, damit man auch Plätze weiter unten erreicht
    const fenster = e.currentTarget.ownerDocument.defaultView;
    const rolle = e.currentTarget.closest(".pad-wz5") || fenster.document.scrollingElement;
    const rand = 60;
    if (e.clientY > fenster.innerHeight - rand) rolle.scrollTop += 18;
    else if (e.clientY < rand) rolle.scrollTop -= 18;
  };
  const los = (e, tippen) => {
    const z = zug.current;
    zug.current = null;
    setGeist(null);
    if (!z) return;
    if (!z.zieht) { if (tippen) tippen(); return; }
    const d = e.currentTarget.ownerDocument;
    const ziel = d.elementFromPoint(e.clientX, e.clientY);
    const platz = ziel && ziel.closest("[data-mag-fach]");
    setHand(null);
    if (platz) { onFach(z.v, Number(platz.dataset.magFach)); setGewaehlt(Number(platz.dataset.magFach)); }
    else if (ziel && ziel.closest("[data-mag-liste]")) onFach(z.v, null);
  };
  const abbrechen = () => { zug.current = null; setGeist(null); };
  const ziehbar = (v, tippen) => ({
    onPointerDown: (e) => runter(e, v), onPointerMove: bewegen,
    onPointerUp: (e) => los(e, tippen), onPointerCancel: abbrechen,
  });

  const info = (() => {
    if (gewaehlt == null) return null;
    const b = bloecke.find((x) => x.fach === gewaehlt);
    if (!b) return null;
    const c = (cam[gewaehlt] || [])[0];
    if (c) return { titel: "Fach " + gewaehlt, zeilen: ["T" + c.nr + " " + c.name, c.ersetzt ? "raus: " + c.ersetzt.name : "", c.marke ? "Marke " + c.marke : "Antippen: Marke wählen"] };
    const m = marken.find((x) => x.ort === "maschine" && x.fach === gewaehlt);
    if (geleert.has(gewaehlt)) return { titel: "Fach " + gewaehlt, zeilen: ["wird geleert", b.name] };
    if (b.leer) return { titel: "Fach " + gewaehlt, zeilen: ["leer"] };
    return { titel: "Fach " + gewaehlt, zeilen: ["N" + b.nr + " " + b.name, fachGeschuetzt(b) ? "bleibt immer so" : "", m ? "Marke " + m.marke : ""] };
  })();

  return (
    <div className="mag5" id="mag5">
      <div className="mag5-liste" data-mag-liste="">
        <h3>Werkzeuge aus dem CAM</h3>
        <p className="klein">{hand ? "T" + hand.nr + " ist gewählt: jetzt den Platz im Magazin antippen."
          : "Auf einen Platz im Magazin ziehen oder antippen und dann den Platz antippen. Hierher zurückziehen = wieder Fach wie Nr."}</p>
        <ul>{zeilen.map((v) => {
          const geht = wirdGeschrieben(v);
          return (
            <li key={v.nr}>
              <div className={"mag5-wz" + (geht ? "" : " mag5-wz--aus") + (hand && hand.nr === v.nr ? " mag5-wz--hand" : "") + (v.doppelt ? " mag5-wz--doppelt" : "")} data-mag-wz={v.nr}
                {...ziehbar(v, () => { setGewaehlt(v.fach); setHand(hand && hand.nr === v.nr ? null : v); })}>
                <b>T{v.nr}</b><span>{kurz(v.name, 24)}</span>
                <em>{geht ? "→ Fach " + v.fach : v.mit === false ? "nicht übernommen" : v.aktion === "fehlt" ? "Fach fehlt" : "bleibt"}</em>
                {geht && v.marke ? <i className="mag5-wz__marke">{MarkeZeigen ? <MarkeZeigen marke={v.marke} /> : v.marke}</i> : null}
              </div>
            </li>);
        })}</ul>
      </div>
      <div className="mag5-ebenen">
        {ebenen.map((eb, k) => (
          <div className="mag5-ebene" key={k} data-mag-ebene={k + 1}>
            <h3>Ebene {k + 1} · Fach {eb[0].fach}–{eb[eb.length - 1].fach}</h3>
            <div className="mag5-ring">
              <div className="mag5-mitte">
                {info && info.titel && (gewaehlt >= eb[0].fach && gewaehlt <= eb[eb.length - 1].fach)
                  ? <><b>{info.titel}</b>{info.zeilen.filter(Boolean).map((t, i) => <span key={i}>{t}</span>)}</>
                  : <span className="klein">Platz antippen</span>}
              </div>
              {eb.map((b, i) => {
                const w = (i / eb.length) * 2 * Math.PI - Math.PI / 2;
                const stil = { left: 50 + 42 * Math.cos(w) + "%", top: 50 + 42 * Math.sin(w) + "%" };
                const c = cam[b.fach] || [];
                const v = c[0];
                const schutz = fachGeschuetzt(b);
                const art = v ? (c.length > 1 ? "doppelt" : v.marke ? "marke" : "cam")
                  : geleert.has(b.fach) ? "geleert" : b.leer ? "leer" : schutz ? "schutz" : "belegt";
                const tippen = () => {
                  setGewaehlt(b.fach);
                  if (hand) { onFach(hand, b.fach); setHand(null); return; }
                  if (v && onMarke) onMarke(v);
                };
                return (
                  <div key={b.fach} role="button" tabIndex={0} style={stil} data-mag-fach={b.fach}
                    className={"mag5-platz mag5-platz--" + art + (gewaehlt === b.fach ? " mag5-platz--an" : "")}
                    title={"Fach " + b.fach + (v ? ": T" + v.nr + " " + v.name : b.leer ? ": leer" : ": " + b.name)}
                    {...(v ? ziehbar(v, tippen) : { onClick: tippen })}
                    onKeyDown={(e) => { if (e.key === "Enter") tippen(); }}>
                    <b>{b.fach}</b><span>{v ? "T" + v.nr : !b.leer && !geleert.has(b.fach) ? (schutz ? "🔒" : "N" + b.nr) : ""}</span>
                  </div>);
              })}
            </div>
          </div>
        ))}
        <div className="mag5-legende">
          <span><i className="mag5-platz--cam" />neu aus dem CAM</span><span><i className="mag5-platz--marke" />mit Marke</span>
          <span><i className="mag5-platz--belegt" />bleibt</span><span><i className="mag5-platz--schutz" />Taster, Greifer …</span>
          <span><i className="mag5-platz--leer" />leer</span>
        </div>
      </div>
      {geist && <div className="mag5-geist" style={{ left: geist.x, top: geist.y }}>T{geist.v.nr}</div>}
    </div>
  );
}
