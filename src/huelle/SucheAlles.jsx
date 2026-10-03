// =================================================================
//  SUCHE ÜBER ALLES (Fenster)
//  Ein Feld für Aufträge, HOCO Nr., Maschinen, Artikel und Lieferanten.
//  Öffnet über die Lupe in der Kopfzeile oder mit Strg + K. Die Daten
//  holt und merkt das alte Programm (sucheAllesDaten), die Treffer
//  rechnet sucheTreffer; getippt wird ohne Anfrage an den Server.
// =================================================================
import { Fragment, useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";

const ARTEN = {
  auftrag:   { name: "Aufträge",    zeichen: "▤" },
  hoco:      { name: "HOCO Nr.",    zeichen: "▣" },
  maschine:  { name: "Maschinen",   zeichen: "⚙" },
  artikel:   { name: "Artikel",     zeichen: "◧" },
  lieferant: { name: "Lieferanten", zeichen: "◈" },
};

export function sucheOeffnen() {
  if (document.querySelector(".suche-alles")) return;
  fensterOeffnen((zu) => <SucheAlles zu={zu} />, null, "suche-huelle");
}

function SucheAlles({ zu }) {
  const [daten, setDaten] = useState(null);
  const [text, setText] = useState("");
  const [markiert, setMarkiert] = useState(0);

  useEffect(() => {
    let weg = false;
    alt.sucheAllesDaten().then((d) => { if (!weg) setDaten(d); });
    return () => { weg = true; };
  }, []);

  const treffer = daten ? alt.sucheTreffer(daten, text) : [];
  const stelle = Math.min(markiert, Math.max(0, treffer.length - 1));
  const springen = (x) => { zu(); alt.sucheSpringen(x); };

  const taste = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setMarkiert(Math.min(treffer.length - 1, stelle + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMarkiert(Math.max(0, stelle - 1)); }
    else if (e.key === "Enter" && treffer[stelle]) { e.preventDefault(); springen(treffer[stelle]); }
  };

  let inhalt;
  if (!daten) inhalt = <div className="laedt">Wird geladen …</div>;
  else if (text.trim().length < 2) inhalt = <p className="hinweis">Mindestens zwei Zeichen eingeben.</p>;
  else if (!treffer.length) inhalt = <p className="hinweis">Nichts gefunden zu „{text.trim()}".</p>;
  else {
    inhalt = treffer.map((x, i) => (
      <Fragment key={i}>
        {(i === 0 || treffer[i - 1].art !== x.art)
          && <div className="suche-alles__gruppe">{ARTEN[x.art].name}</div>}
        <button type="button" className={"suche-alles__treffer" + (i === stelle ? " aktiv" : "")}
          data-treffer={i} onClick={() => springen(x)}>
          <span className="suche-alles__zeichen">{ARTEN[x.art].zeichen}</span>
          <span className="suche-alles__text"><b>{x.titel}</b>{x.zeile && <span>{x.zeile}</span>}</span>
        </button>
      </Fragment>
    ));
  }

  return (
    <div className="dialog suche-alles">
      <div className="suche-alles__feld">
        <span className="suche-alles__lupe">⌕</span>
        <input type="search" id="suche-alles-feld" autoComplete="off" data-fokus=""
          placeholder="HOCO Nr., FA Nr., Material, Werkzeug, Lieferant, Maschine …"
          value={text} onChange={(e) => { setText(e.target.value); setMarkiert(0); }} onKeyDown={taste} />
        <kbd>Esc</kbd>
      </div>
      <div className="suche-alles__liste" id="suche-alles-liste">{inhalt}</div>
    </div>
  );
}
