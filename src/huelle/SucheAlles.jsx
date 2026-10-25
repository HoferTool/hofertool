// =================================================================
//  SUCHE ÜBER ALLES (Fenster)
//  Ein Feld für die HOCO Nummern (seit 1.59.0 nur noch diese).
//  Öffnet über die Lupe in der Kopfzeile oder mit Strg + K. Die Daten
//  holt und merkt das alte Programm (sucheAllesDaten), die Treffer
//  rechnet sucheTreffer; getippt wird ohne Anfrage an den Server.
//  Seit 1.169.0 sucht das Fenster auf jeder Seite, was dort steht
//  (src/teile/seitenSuche.js); die HOCO Nummern bleiben auf Start,
//  Planwand und Infoboard und hinter dem Knopf „HOCO Nr. suchen“.
// =================================================================
import { Fragment, useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { seitenSuche, seitenTreffer } from "../teile/seitenSuche.js";

const ARTEN = {
  auftrag:   { name: "Aufträge",    zeichen: "▤" },
  hoco:      { name: "HOCO Nr.",    zeichen: "▣" },
  maschine:  { name: "Maschinen",   zeichen: "⚙" },
  artikel:   { name: "Artikel",     zeichen: "◧" },
  lieferant: { name: "Lieferanten", zeichen: "◈" },
};

export function sucheOeffnen() {
  // Auf der Planwand genau das Suchfenster der Planwand, das in jedem
  // Feld der Aufträge sucht (Wunsch Patrick 25. Oktober 2026)
  if (document.getElementById("pw-inhalt")) {
    if (!document.getElementById("su-text")) alt.sucheDialog(alt.plan.behaelter);
    return;
  }
  if (document.querySelector(".suche-alles")) return;
  fensterOeffnen((zu) => <SucheAlles zu={zu} />, null, "suche-huelle");
}

function SucheAlles({ zu }) {
  // Was die offene Seite zum Suchen anbietet; ohne das die HOCO Nummern.
  // Externe suchen vorerst wie bisher (Entscheid Patrick offen)
  const [seite] = useState(() => (alt.istExtern() ? null : seitenSuche()));
  const [hoco, setHoco] = useState(!seite);
  const [daten, setDaten] = useState(null);
  const [eintraege, setEintraege] = useState(null);
  const [text, setText] = useState("");
  const [markiert, setMarkiert] = useState(null);

  useEffect(() => {
    let weg = false;
    if (hoco) alt.sucheAllesDaten().then((d) => { if (!weg) setDaten(d); });
    else {
      Promise.resolve(typeof seite.eintraege === "function" ? seite.eintraege() : seite.eintraege)
        .then((l) => { if (!weg) setEintraege(l || []); },
          (f) => { if (!weg) { setEintraege([]); alt.meldung(alt.fehlertext(f), "fehler"); } });
    }
    return () => { weg = true; };
  }, [hoco]);

  const bereit = hoco ? !!daten : !!eintraege;
  const treffer = !bereit ? [] : hoco ? alt.sucheTreffer(daten, text) : seitenTreffer(eintraege, text);
  // Ist eine HOCO Nr. (oder ein Name) vollständig eingetippt, steht ihr
  // Treffer schon bereit: Enter öffnet ihn direkt (Wunsch 5. Oktober 2026).
  // Mit den Pfeiltasten wählt man wie bisher.
  const genau = treffer.findIndex((x) => String(x.titel).toLowerCase() === text.trim().toLowerCase());
  const stelle = markiert === null ? Math.max(0, genau)
    : Math.min(markiert, Math.max(0, treffer.length - 1));
  const springen = (x) => { zu(); if (hoco) alt.sucheSpringen(x); else seite.springen(x); };
  const umschalten = () => {
    setHoco(!hoco); setMarkiert(null);
    requestAnimationFrame(() => { const f = document.getElementById("suche-alles-feld"); if (f) f.focus(); });
  };
  const gruppeVon = (x) => (hoco ? ARTEN[x.art].name : x.gruppe);

  const taste = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setMarkiert(Math.min(treffer.length - 1, stelle + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMarkiert(Math.max(0, stelle - 1)); }
    else if (e.key === "Enter" && treffer[stelle]) { e.preventDefault(); springen(treffer[stelle]); }
  };

  let inhalt;
  if (!bereit) inhalt = <div className="laedt">Wird geladen …</div>;
  else if (text.trim().length < 2) inhalt = <p className="hinweis">Mindestens zwei Zeichen eingeben.</p>;
  else if (!treffer.length) inhalt = <p className="hinweis">Nichts gefunden zu „{text.trim()}".</p>;
  else {
    inhalt = treffer.map((x, i) => (
      <Fragment key={i}>
        {(i === 0 || gruppeVon(treffer[i - 1]) !== gruppeVon(x))
          && <div className="suche-alles__gruppe">{gruppeVon(x)}</div>}
        <button type="button" className={"suche-alles__treffer" + (i === stelle ? " aktiv" : "")}
          data-treffer={i} onClick={() => springen(x)}>
          <span className="suche-alles__zeichen">{hoco ? ARTEN[x.art].zeichen : x.zeichen || "•"}</span>
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
          placeholder={hoco ? "HOCO Nr. oder Material …" : seite.platzhalter || "Suchen …"}
          value={text} onChange={(e) => { setText(e.target.value); setMarkiert(null); }} onKeyDown={taste} />
        <kbd>Esc</kbd>
      </div>
      {seite && <div className="suche-alles__wo" id="suche-alles-wo">
        <span>{hoco ? "Sucht in den HOCO Nummern" : "Sucht auf der Seite " + seite.name}</span>
        <button type="button" className="linkknopf" id="suche-alles-umschalten" onClick={umschalten}>
          {hoco ? "Zurück zu " + seite.name : "HOCO Nr. suchen"}</button>
      </div>}
      <div className="suche-alles__liste" id="suche-alles-liste">{inhalt}</div>
    </div>
  );
}
