// =================================================================
//  DIAGRAMME (1.159.0, für die Statistik)
//  Säulen über die Zeit und waagrechte Balken zum Vergleichen, ohne
//  Bibliothek, aus HTML und CSS, damit sie mit Themenfarbe und dunklem
//  Modus von selbst stimmen. Eine Reihe je Diagramm, eine Achse; eine
//  gestrichelte Linie zeigt das Ziel (10 h, 100 %). Darüberfahren oder
//  Antippen zeigt den Wert in einem kleinen Fenster. Seit 1.164.0 steht
//  der Wert auch ohne Darüberfahren an jeder Säule (h oder Stück), bei
//  schmalen Säulen senkrecht, bei hohen innen in der Säule.
// =================================================================
import { useState } from "react";

// Runde Obergrenze für die Achse: 1, 2, 2,5, 5 mal 10er-Potenz
export function rundesMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 2, 2.5, 5, 10]) if (v <= f * p) return f * p;
  return 10 * p;
}

// werte: [{ key, label, wert, tip, blass }]; format(zahl) für Achse und
// Fenster; ziel: Höhe der gestrichelten Linie mit zielText; deckel: feste
// Obergrenze der Achse (etwa 24 h), höhere Werte stehen bis zum Rand;
// wertText(zahl) für die Anschrift an der Säule (sonst format)
export function Saeulen({ werte, format, wertText, ziel, zielText, hoehe = 190, id, deckel }) {
  const [zeig, setZeig] = useState(null);
  const groesster = Math.max(0, ...werte.map((w) => w.wert || 0));
  // Die Ziellinie soll sichtbar unter dem oberen Rand liegen
  const max = deckel || Math.max(rundesMax(groesster * 1.05), (ziel || 0) * 1.2);
  const schritt = Math.max(1, Math.ceil(werte.length / 12));
  const f = format || ((n) => String(Math.round(n)));
  const wt = wertText || f;
  const aktiv = zeig !== null ? werte[zeig] : null;
  return (
    <div className="dg-saeulen" id={id} style={{ "--dg-h": hoehe + "px" }}
      onMouseLeave={() => setZeig(null)}>
      <div className="dg-achse">
        {[1, 0.5, 0].map((a) => <span key={a} style={{ bottom: a * 100 + "%" }}>{f(max * a)}</span>)}
      </div>
      <div className="dg-flaeche">
        {[1, 0.5].map((a) => <i key={a} className="dg-gitter" style={{ bottom: a * 100 + "%" }} />)}
        {ziel > 0 && <i className="dg-ziel" style={{ bottom: ziel / max * 100 + "%" }}>
          {zielText && <b>{zielText}</b>}</i>}
        <div className="dg-spalten">
          {werte.map((w, i) => (
            <div key={w.key} className={"dg-spalte" + (w.blass ? " dg-spalte--blass" : "") + (zeig === i ? " aktiv" : "")}
              onMouseEnter={() => setZeig(i)} onClick={() => setZeig(zeig === i ? null : i)}>
              {w.teile && w.teile.length
                ? <Teile w={w} anteil={Math.min(1, (w.wert || 0) / max)} />
                : <i className="dg-saeule" style={{ height: Math.min(100, (w.wert || 0) / max * 100) + "%" }} />}
              {w.wert > 0 && <WertAnschrift anteil={Math.min(1, w.wert / max)} text={wt(w.wert, w)} />}
              <span className={"dg-x" + (i % (2 * schritt) ? " dg-x--handy-weg" : "")}>{i % schritt === 0 ? w.label : ""}</span>
            </div>
          ))}
        </div>
        {aktiv && <div className="dg-tip" style={tipLage((zeig + 0.5) / werte.length)}>
          {aktiv.tip || <><b>{f(aktiv.wert || 0)}</b> {aktiv.label}</>}</div>}
      </div>
    </div>
  );
}

// Säule aus Stücken übereinander, je eines mit senkrechter Anschrift
// (Statistik: ein Stück je Auftrag, 1.258.0). teile: [{ wert, text,
// farbe }], farbe 0 oder 1, damit zwei Aufträge am selben Tag sich
// abheben; eine Farbe als Text (#…) gilt direkt. Steht der Wert innen oben, hält die Säule oben Platz frei.
function Teile({ w, anteil }) {
  const teile = w.teile.filter((t) => t.wert > 0);
  // Der freie Platz oben in der Farbe des obersten Stücks
  const oben = teile.length ? teile[teile.length - 1].farbe : null;
  return (
    <div className={"dg-saeule dg-saeule--teile" + (anteil > 0.72 ? " dg-saeule--platz" : "")}
      style={{ height: Math.min(100, anteil * 100) + "%", ...(typeof oben === "string" ? { background: oben } : {}) }}>
      {teile.map((t, i) => (
        <i key={i} className={"dg-teil" + (typeof t.farbe === "number" ? " dg-teil--" + t.farbe : "")}
          style={{ flexGrow: t.wert, ...(typeof t.farbe === "string" ? { background: t.farbe } : {}) }}>
          <span>{t.text}</span></i>
      ))}
    </div>
  );
}

// Über der Säule; reicht sie fast nach oben, innen in der Säule, damit
// nichts über den Rand des Diagramms ragt
function WertAnschrift({ anteil, text }) {
  const innen = anteil > 0.72;
  return <span className={"dg-wert" + (innen ? " dg-wert--innen" : "")}
    style={innen ? { top: (1 - anteil) * 100 + "%" } : { bottom: anteil * 100 + "%" }}>{text}</span>;
}

// Am Rand nicht über die Karte hinaus: links bündig, rechts bündig
function tipLage(anteil) {
  const left = anteil * 100 + "%";
  if (anteil < 0.2) return { left, transform: "translate(-12px, -100%)" };
  if (anteil > 0.8) return { left, transform: "translate(calc(-100% + 12px), -100%)" };
  return { left };
}

// zeilen: [{ key, label, unter, wert, text, aktiv }]; waehlen(key) macht
// die Zeilen anklickbar; ziel wie oben (etwa 1 für 100 %)
export function Balken({ zeilen, ziel, zielText, waehlen, id, max: maxVorgabe }) {
  const groesster = Math.max(0, ...zeilen.map((z) => z.wert || 0), ziel || 0);
  const max = maxVorgabe || groesster * 1.08 || 1;
  if (!zeilen.length) return <p className="klein dg-leer">Keine Daten im Zeitraum.</p>;
  return (
    <div className="dg-balken" id={id}>
      {zeilen.map((z) => {
        const Tag = waehlen ? "button" : "div";
        return (
          <Tag key={z.key} className={"dg-zeile" + (z.aktiv ? " aktiv" : "") + (waehlen ? " dg-zeile--knopf" : "")}
            data-dgzeile={z.key} onClick={waehlen ? () => waehlen(z.key) : undefined}>
            <span className="dg-name">{z.label}{z.unter && <small>{z.unter}</small>}</span>
            <span className="dg-bahn">
              <i className="dg-balken__wert" style={{ width: Math.min(100, (z.wert || 0) / max * 100) + "%" }} />
              {ziel > 0 && <i className="dg-ziel dg-ziel--senkrecht" style={{ left: ziel / max * 100 + "%" }}
                title={zielText || ""} />}
            </span>
            <span className="dg-text">{z.text}</span>
          </Tag>
        );
      })}
    </div>
  );
}

// Grosse Zahl mit Beschriftung
export function Kennzahl({ titel, wert, unter, id }) {
  return (
    <div className="dg-kennzahl" id={id}>
      <span className="dg-kennzahl__titel">{titel}</span>
      <b className="dg-kennzahl__wert">{wert}</b>
      {unter && <span className="dg-kennzahl__unter">{unter}</span>}
    </div>
  );
}
