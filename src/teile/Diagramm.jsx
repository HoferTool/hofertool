// =================================================================
//  DIAGRAMME (1.159.0, für die Statistik)
//  Säulen über die Zeit und waagrechte Balken zum Vergleichen, ohne
//  Bibliothek, aus HTML und CSS, damit sie mit Themenfarbe und dunklem
//  Modus von selbst stimmen. Eine Reihe je Diagramm, eine Achse; eine
//  gestrichelte Linie zeigt das Ziel (10 h, 100 %). Darüberfahren oder
//  Antippen zeigt den Wert in einem kleinen Fenster.
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
// Obergrenze der Achse (etwa 24 h), höhere Werte stehen bis zum Rand
export function Saeulen({ werte, format, ziel, zielText, hoehe = 190, id, deckel }) {
  const [zeig, setZeig] = useState(null);
  const groesster = Math.max(0, ...werte.map((w) => w.wert || 0));
  // Die Ziellinie soll sichtbar unter dem oberen Rand liegen
  const max = deckel || Math.max(rundesMax(groesster * 1.05), (ziel || 0) * 1.2);
  const schritt = Math.max(1, Math.ceil(werte.length / 12));
  const f = format || ((n) => String(Math.round(n)));
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
              <i className="dg-saeule" style={{ height: Math.min(100, (w.wert || 0) / max * 100) + "%" }} />
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
