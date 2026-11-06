// =================================================================
//  MESSBERICHTE · Fenster (seit 1.443.0, Wunsch Patrick 6. November
//  2026: Messprotokolle vom Keyence IM von selbst im Tool)
//
//  messberichteOeffnen({ hoco }): alle Teilberichte der HOCO Nr., der
//  neueste oben; antippen klappt die Messwerte auf. Geöffnet aus dem
//  Auftragsfenster der Planwand und bei der HOCO Nr. Nicht für Externe.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { messberichteLaden, fehltMessTabelle, urteil } from "../daten/messberichte.js";
import { hocoNormal } from "../daten/spezialwerkzeuge.js";

export function messberichteOeffnen({ hoco }) {
  if (!hoco) return;
  const h = hocoNormal(hoco);
  fensterOeffnen((zu) => <MessFenster hoco={h} zu={zu} />, null, "unterlagen-huelle",
    { art: "messberichte", daten: { hoco: h } });
}
wiederOeffner("messberichte", (d) => messberichteOeffnen(d));

const zeitText = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("de-CH") + " " + d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
};

function Schild({ text }) {
  if (!text) return null;
  const u = urteil(text);
  return <span className={"mess-schild" + (u ? " mess-schild--" + u : "")}>{text}</span>;
}

function MessFenster({ hoco, zu }) {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(null);
  useEffect(() => {
    messberichteLaden(hoco)
      .then((l) => { setListe(l); if (l.length) setOffen(l[0].id); })
      .catch((f) => { setFehler(fehltMessTabelle(f) ? "Die Datenbank kennt die Messberichte noch nicht." : alt.fehlertext(f)); setListe([]); });
  }, []);

  return (
    <div className="dialog dialog--breit unterlagen messberichte" id="messberichte">
      <div className="blatt__kopf">
        <h2>Messberichte · {hoco}</h2>
        <span className="klein">Keyence IM</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="unterlagen__rolle">
        {liste === null
          ? <p className="klein">Lädt …</p>
          : !liste.length
          ? <p className="unterlagen__leer">Für {hoco} sind noch keine Messberichte da. Sie kommen von selbst,
              wenn am Keyence eine Messeinstellung mit „{hoco}“ im Namen gemessen wird.</p>
          : <ul className="mess__liste">
              {liste.map((m) => <li key={m.id} className={"mess__eintrag" + (offen === m.id ? " mess__eintrag--offen" : "")}>
                <button type="button" className="mess__kopf" data-messbericht={m.id}
                  onClick={() => setOffen(offen === m.id ? null : m.id)}>
                  <span className="mess__pfeil">{offen === m.id ? "▾" : "▸"}</span>
                  <b>{zeitText(m.gemessen_am)}</b>
                  <span className="mess__name">{m.einstellung || ""}</span>
                  <Schild text={m.ergebnis} />
                </button>
                {offen === m.id && <MessWerte m={m} />}
              </li>)}
            </ul>}
      </div>
    </div>
  );
}

function MessWerte({ m }) {
  const spalten = Array.isArray(m.spalten) ? m.spalten : [];
  const roh = Array.isArray(m.zeilen) ? m.zeilen.map((z) => Array.isArray(z) ? z : []) : [];
  const breite = Math.max(spalten.length, ...roh.map((z) => z.length), 0);
  // Ohne Messwert fehlt dem Gerät eine Spalte: das Urteil (Fehler, NG …)
  // kommt dann trotzdem in die letzte Spalte, nicht unter „Auflsg.“
  const zeilen = roh.map((z) => z.length < breite && urteil(z[z.length - 1])
    ? [...z.slice(0, -1), ...Array(breite - z.length).fill(""), z[z.length - 1]] : z);
  // Das Gerät schreibt das Urteil je Element in eine Spalte ohne Namen
  const namen = Array.from({ length: breite }, (_, i) => spalten[i] || (i === breite - 1 ? "Ergebnis" : ""));
  const kopf = m.kopf && typeof m.kopf === "object" ? Object.entries(m.kopf).filter(([, w]) => w) : [];
  return (
    <div className="mess__werte">
      {kopf.length > 0 && <dl className="mess__angaben">
        {kopf.map(([k, w]) => <div key={k}><dt>{k}</dt><dd>{w}</dd></div>)}</dl>}
      {zeilen.length
        ? <div className="mess__tabelle"><table>
            <thead><tr>{namen.map((n, i) => <th key={i}>{n}</th>)}</tr></thead>
            <tbody>{zeilen.map((z, j) => {
              const u = urteil(z[breite - 1]);
              return <tr key={j} className={u ? "mess__zeile--" + u : ""}>
                {namen.map((_, i) => <td key={i}>{i === breite - 1 && z[i] ? <Schild text={z[i]} /> : z[i] || ""}</td>)}
              </tr>;
            })}</tbody></table></div>
        : <p className="klein">Keine Messwerte im Bericht.</p>}
    </div>
  );
}
