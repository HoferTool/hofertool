// =================================================================
//  SEITE LEHRLINGE (1.148.0 mit KI, seit 1.149.0 Nachschlagewerk,
//  Wunsch Patrick 22. Oktober 2026)
//  Für Polymechaniker und Produktionsmechaniker in Ausbildung: Kapitel
//  (Grundausbildung, Bohren und Gewinde, Drehen und Fräsen, CNC, Star,
//  Programmieren, Werkstoff, Mathe, Zeichnung, Maschinentechnik, Schule)
//  mit Unterkapiteln und häufigen Fragen zum Aufklappen, dazu eine Suche
//  über alles. Kostenlos, ohne KI. Ersetzt keinen Ausbildner; das steht
//  oben. Nicht für Externe und Dienst (seiteSichtbar, Entscheid Patrick
//  22. Oktober 2026). Inhalte in src/daten/lehrlinge/*.md.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { teilMerken } from "../teile/wiederherstellen.js";
import { KAPITEL, anzahlFragen, suchen, antwortHtml } from "../daten/lehrlinge.js";

// Auch nach dem Neuladen wieder im selben Kapitel
const gemerkt = { kapitel: null, suche: "" };
teilMerken("lehrlinge", () => ({ ...gemerkt }), (z) => { Object.assign(gemerkt, z); });

function Frage({ frage, offen, ort }) {
  return (
    <details className="lehr-frage" open={offen || undefined}>
      <summary>
        {ort && <span className="lehr-frage__ort">{ort}</span>}
        <span className="lehr-frage__text">{frage.f}</span>
      </summary>
      <div className="lehr__text" dangerouslySetInnerHTML={{ __html: antwortHtml(frage.a) }} />
    </details>
  );
}

export default function Lehrlinge() {
  const [kapId, setKapId] = useState(gemerkt.kapitel);
  const [suche, setSuche] = useState(gemerkt.suche);
  const oben = useRef(null);
  const kap = KAPITEL.find((k) => k.id === kapId) || null;

  useEffect(() => { gemerkt.kapitel = kapId; gemerkt.suche = suche; }, [kapId, suche]);

  // Escape geht eine Ebene zurück: zuerst die Suche, dann das Kapitel.
  // In der Einfangphase, damit escapeZurueck (app.js) danach sieht, dass
  // Escape schon verbraucht ist, und nicht „Abmelden?“ fragt
  useEffect(() => {
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".dialog-huelle")) return;
      if (suche) { setSuche(""); e.preventDefault(); }
      else if (kapId) { setKapId(null); e.preventDefault(); }
    };
    document.addEventListener("keydown", taste, true);
    return () => document.removeEventListener("keydown", taste, true);
  }, [suche, kapId]);

  const oeffnen = (id) => {
    setKapId(id); setSuche("");
    requestAnimationFrame(() => oben.current && oben.current.scrollIntoView({ block: "start" }));
  };
  const zuUnter = (i) => {
    const el = document.getElementById("lehr-unter-" + i);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const treffer = suche.trim() ? suchen(suche) : null;

  return (
    <div className="lehr" ref={oben}>
      <div className="lehr__kopf">
        <h1 className="seitentitel">Lehrlinge</h1>
        <input className="lehr__suche" type="search" value={suche} placeholder="Frage oder Begriff suchen …"
          onChange={(e) => setSuche(e.target.value)} />
      </div>
      <div className="lehr__hinweis">
        <b>Nachschlagewerk für Polymechaniker und Produktionsmechaniker.</b> Hier stehen Antworten auf häufige
        Fragen zur Ausbildung. Es ersetzt deinen Ausbildner nicht: Bei Sicherheit, Programmen für die Maschine und
        allem, was unklar ist, frag immer zuerst ihn. Fehlt eine Frage? Sag es deinem Ausbildner, dann kommt sie dazu.
      </div>

      {treffer ? (
        <div className="lehr__treffer">
          <p className="klein">{treffer.length ? treffer.length + (treffer.length === 1 ? " Treffer" : " Treffer") : "Nichts gefunden. Versuch es mit einem anderen Wort."}</p>
          {treffer.slice(0, 60).map((t, i) => (
            <Frage key={t.kap.id + i + t.frage.f} frage={t.frage} offen={treffer.length === 1}
              ort={t.kap.titel + " › " + t.unter.titel} />
          ))}
        </div>
      ) : kap ? (
        <div className="lehr-kapitel">
          <button className="knopf lehr__zurueck" onClick={() => setKapId(null)}>‹ Alle Kapitel</button>
          <h2 className="lehr-kapitel__titel">{kap.titel}</h2>
          {kap.text && <p className="lehr-kapitel__text">{kap.text}</p>}
          {kap.einleitung && <div className="lehr-kapitel__achtung">{kap.einleitung}</div>}
          {kap.unter.length > 1 && (
            <div className="lehr-kapitel__sprung">
              {kap.unter.map((u, i) => <button key={i} className="lehr-chip" onClick={() => zuUnter(i)}>{u.titel}</button>)}
            </div>
          )}
          {kap.unter.map((u, i) => (
            <section key={i} id={"lehr-unter-" + i} className="lehr-unter">
              <h3>{u.titel}</h3>
              {u.fragen.map((f, j) => <Frage key={j} frage={f} />)}
            </section>
          ))}
          <div className="lehr-kapitel__nav">
            {(() => {
              const n = KAPITEL.indexOf(kap);
              return <>
                {n > 0 ? <button className="knopf" onClick={() => oeffnen(KAPITEL[n - 1].id)}>‹ {KAPITEL[n - 1].titel}</button> : <span />}
                {n < KAPITEL.length - 1 && <button className="knopf" onClick={() => oeffnen(KAPITEL[n + 1].id)}>{KAPITEL[n + 1].titel} ›</button>}
              </>;
            })()}
          </div>
        </div>
      ) : (
        <div className="lehr__kapitelliste">
          {KAPITEL.map((k, i) => (
            <button key={k.id} className="lehr-karte" onClick={() => oeffnen(k.id)}>
              <span className="lehr-karte__nr">{i + 1}</span>
              <b>{k.titel}</b>
              <span className="lehr-karte__text">{k.text}</span>
              <span className="lehr-karte__zahl">{k.unter.length} Unterkapitel · {anzahlFragen(k)} Fragen</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
