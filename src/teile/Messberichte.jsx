// =================================================================
//  KEYENCE BERICHTE (seit 1.443.0, Wunsch Patrick 6. November 2026:
//  „bei Prod einen weiteren Unterreiter mit Keyence Berichten, nach
//  HOCO Nr. abgespeichert mit Datum Zeit zum Nachschauen, 30 Tage“,
//  „bei Padmode QS oben neben Offene Meldungen der Button dafür“)
//
//  <KeyenceBerichte />: Suche, darunter je HOCO Nr. eine Zeile mit der
//  Zahl der Berichte und dem letzten; antippen zeigt die Berichte mit
//  Datum und Zeit, ein Bericht klappt seine Messwerte auf.
//  Reiter „Keyence Berichte“ der Produktion und Fenster aus dem
//  QS Check im Pad (keyenceOeffnen). Nicht für Externe.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "./Fenster.jsx";
import { wiederOeffner } from "./wiederherstellen.js";
import { Suchfeld, passtWoerter } from "./Suchfeld.jsx";
import { messberichteLaden, fehltMessTabelle, urteil, nachHoco } from "../daten/messberichte.js";

export function keyenceOeffnen() {
  fensterOeffnen((zu) => (
    <div className="dialog dialog--breit unterlagen messberichte" id="keyence-fenster">
      <div className="blatt__kopf">
        <h2>Keyence Berichte</h2>
        <span className="klein">letzte 30 Tage</span>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>
      <div className="unterlagen__rolle"><KeyenceBerichte /></div>
    </div>), null, "unterlagen-huelle", { art: "keyence" });
}
wiederOeffner("keyence", () => keyenceOeffnen());

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

// Gemerkt, solange die App offen ist: Suche und offene HOCO Nr.
const merk = { suche: "", hoco: null, bericht: null };

export function KeyenceBerichte() {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [suche, setSucheS] = useState(merk.suche);
  const [hoco, setHocoS] = useState(merk.hoco);
  const [bericht, setBerichtS] = useState(merk.bericht);
  const setSuche = (x) => { merk.suche = x; setSucheS(x); };
  const setHoco = (x) => { merk.hoco = x; setHocoS(x); };
  const setBericht = (x) => { merk.bericht = x; setBerichtS(x); };
  const laden = () => messberichteLaden()
    .then((l) => { setListe(l); setFehler(""); })
    .catch((f) => { setFehler(fehltMessTabelle(f) ? "Die Datenbank kennt die Keyence Berichte noch nicht." : alt.fehlertext(f)); setListe((x) => x || []); });
  // Jede Minute frisch, so oft wie der Pool-Rechner nachschaut
  useEffect(() => { laden(); const t = setInterval(laden, 60000); return () => clearInterval(t); }, []);

  const gruppen = nachHoco(liste || []).filter((g) =>
    passtWoerter(suche, [g.hoco, ...g.berichte.map((m) => m.einstellung)]));

  return (
    <div className="keyence" id="keyence-berichte">
      <div className="keyence__leiste">
        <Suchfeld id="keyence-suche" wert={suche} setzen={setSuche} platzhalter="HOCO Nr. oder Messeinstellung …" />
        <span className="klein">{liste ? liste.length + " Berichte · bleiben 30 Tage" : ""}</span>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {liste === null
        ? <p className="klein">Lädt …</p>
        : !gruppen.length
        ? <p className="unterlagen__leer">{suche ? "Nichts gefunden." : "Noch keine Berichte. Sie kommen von selbst, "
            + "sobald am Keyence gemessen wird (Ordner W:\\KONTROLLE\\Keyence)."}</p>
        : <ul className="mess__liste">
            {gruppen.map((g) => {
              const auf = hoco === g.hoco || (gruppen.length === 1 && hoco === null);
              const neu = g.berichte[0];
              return <li key={g.hoco} className={"mess__eintrag" + (auf ? " mess__eintrag--offen" : "")}>
                <button type="button" className="mess__kopf" data-keyence-hoco={g.hoco}
                  onClick={() => setHoco(auf ? "" : g.hoco)}>
                  <span className="mess__pfeil">{auf ? "▾" : "▸"}</span>
                  <b className="mess__hoco">{g.hoco || "Ohne HOCO Nr."}</b>
                  <span className="mess__name">{g.berichte.length} {g.berichte.length === 1 ? "Bericht" : "Berichte"} · zuletzt {zeitText(neu.gemessen_am)}</span>
                  <Schild text={neu.ergebnis} />
                </button>
                {auf && <ul className="mess__liste mess__liste--innen">
                  {g.berichte.map((m) => <li key={m.id} className="mess__eintrag">
                    <button type="button" className="mess__kopf" data-messbericht={m.id}
                      onClick={() => setBericht(bericht === m.id ? null : m.id)}>
                      <span className="mess__pfeil">{bericht === m.id ? "▾" : "▸"}</span>
                      <b>{zeitText(m.gemessen_am)}</b>
                      <span className="mess__name">{m.einstellung || ""}</span>
                      <Schild text={m.ergebnis} />
                    </button>
                    {bericht === m.id && <MessWerte m={m} />}
                  </li>)}
                </ul>}
              </li>;
            })}
          </ul>}
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
