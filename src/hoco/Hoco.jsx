// =================================================================
//  HOCO NUMMERN
//  Übersicht in Ordnern (Nummernbereich je 100 → Kunde → Teile), Suche
//  über alle Nummern und die Ansicht eines einzelnen Teils. Wo man
//  gerade steht, liegt in prod.hocoBereich, prod.hocoKunde und
//  prod.hocoOffen im alten Programm: Die Suche über alles springt von
//  aussen direkt zu einer Nummer.
//
//  Nummern, die bisher nur auf der Planwand stehen, erscheinen mit
//  „noch nicht hinterlegt“, bis jemand Stammdaten anlegt.
// =================================================================
import { useReducer, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { hocoLaden, kundeVon, bereichVon } from "./daten.js";
import HocoTeil from "./HocoTeil.jsx";

export default function Hoco() {
  const prod = alt.prod;
  const darf = alt.darfSchreiben();
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const { daten, fehler, neu } = useDaten(() => hocoLaden(darf), []);
  const [suche, setSuche] = useState(prod.hocoSuche || "");

  // Wohin man geht, merkt sich prod; danach frisch laden, wie bisher
  const gehe = (aenderung) => { Object.assign(prod, aenderung); neu(); zeichnen(); };
  const nachAenderung = () => { alt.stammVergessen(); neu(); };

  if (fehler && !daten) {
    return (
      <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p>
        <p className="klein">Wurde das SQL für die Einrichtblätter schon ausgeführt?</p></div>
    );
  }
  if (!daten) return <div className="laedt">Wird geladen …</div>;
  const { teile, ausPlan } = daten;

  // ----- Ein einzelnes Teil -----
  if (prod.hocoOffen) {
    const t = teile.find((x) => x.hoco_nr === prod.hocoOffen);
    if (t) {
      return <HocoTeil key={t.hoco_nr} t={t} darf={darf}
        zurueck={() => gehe({ hocoOffen: null })} nachAenderung={nachAenderung} />;
    }
    prod.hocoOffen = null;
  }

  // ----- Übersicht -----
  const bekannt = {};
  teile.forEach((t) => { bekannt[t.hoco_nr] = true; });
  // Am Auftrag steht nur die Grösse. Die Materialart gehört an die
  // HOCO Nr. und wird dort einmal hinterlegt.
  const nurPlan = Object.keys(ausPlan).filter((nr) => !bekannt[nr])
    .map((nr) => ({ hoco_nr: nr, ohneStamm: true, material: alt.groesseAusAuftrag(ausPlan[nr]) }));
  const alle = teile.concat(nurPlan).sort((x, y) => String(x.hoco_nr).localeCompare(String(y.hoco_nr)));

  const suchen = (wert) => { setSuche(wert); prod.hocoSuche = wert; };
  const suchText = suche.trim().toLowerCase();

  const aktionen = {
    darf,
    oeffnen: (nr) => gehe({ hocoOffen: nr }),
    neu: async () => { if (await alt.hocoDialog(null)) nachAenderung(); },
    anlegen: async (nr) => {
      const j = ausPlan[nr] || {};
      // Durchmesser, Material und Zeichnung kommen aus dem Auftrag
      const w = await alt.hocoDialog(null, {
        hoco_nr: nr, material: alt.groesseAusAuftrag(j), zeichnung_url: j.drawing_url || null });
      if (w) nachAenderung();
    },
    bearbeiten: async (nr) => {
      if (await alt.hocoDialog(teile.find((x) => x.hoco_nr === nr))) nachAenderung();
    },
    loeschen: async (nr) => {
      const ok = await alt.doppeltNachfragen(
        { titel: "HOCO Nr. löschen", text: nr + " löschen? Die Einrichtblätter dazu gehen mit.",
          bestaetigen: "Weiter zum Löschen", gefahr: true },
        { titel: "Wirklich endgültig löschen?", text: "Letzte Rückfrage.",
          bestaetigen: "Endgültig löschen", gefahr: true });
      if (!ok) return;
      const { error } = await alt.db.from("hoco_parts").delete().eq("hoco_nr", nr);
      if (error) alt.meldung(alt.fehlertext(error), "fehler");
      else { alt.meldung("Gelöscht."); nachAenderung(); }
    },
  };

  let pfad = null, titel, anzahl, inhalt;
  const bereichText = (v) => v + " – " + (v + 99);

  // Wird gesucht, sind Ordner nur im Weg: dann alle Treffer flach
  if (suchText) {
    const treffer = alle.filter((t) => String(t.hoco_nr).toLowerCase().includes(suchText)
      || String(t.bezeichnung || "").toLowerCase().includes(suchText)
      || String(t.material || "").toLowerCase().includes(suchText));
    titel = "Suche"; anzahl = treffer.length;
    inhalt = treffer.length ? <Tabelle liste={treffer} {...aktionen} /> : <p className="hinweis">Nichts gefunden.</p>;

  // Ebene 3: die Teile eines Kunden
  } else if (prod.hocoKunde) {
    const liste = alle.filter((t) => kundeVon(t.hoco_nr) === prod.hocoKunde);
    pfad = <>
      <button className="linkknopf" data-pfad="alle" onClick={() => gehe({ hocoBereich: null, hocoKunde: null })}>Alle Bereiche</button>
      {" › "}
      <button className="linkknopf" data-pfad="bereich" onClick={() => gehe({ hocoKunde: null })}>{bereichText(prod.hocoBereich)}</button>
      {" › "}<strong>Kunde {prod.hocoKunde}</strong>
    </>;
    titel = "Kunde " + prod.hocoKunde; anzahl = liste.length;
    inhalt = liste.length ? <Tabelle liste={liste} {...aktionen} /> : <p className="hinweis">Keine Nummer in diesem Ordner.</p>;

  // Ebene 2: die Kunden eines Bereichs
  } else if (prod.hocoBereich !== null && prod.hocoBereich !== undefined) {
    const kunden = {};
    alle.filter((t) => bereichVon(kundeVon(t.hoco_nr)) === prod.hocoBereich).forEach((t) => {
      const k = kundeVon(t.hoco_nr);
      if (!kunden[k]) kunden[k] = { anzahl: 0, offen: 0 };
      kunden[k].anzahl++;
      if (t.ohneStamm) kunden[k].offen++;
    });
    const namen = Object.keys(kunden).sort();
    pfad = <>
      <button className="linkknopf" data-pfad="alle" onClick={() => gehe({ hocoBereich: null, hocoKunde: null })}>Alle Bereiche</button>
      {" › "}<strong>{bereichText(prod.hocoBereich)}</strong>
    </>;
    titel = "Kunden " + bereichText(prod.hocoBereich); anzahl = namen.length;
    inhalt = namen.length
      ? <div className="ordner">{namen.map((k) => (
          <button key={k} className="ordner__feld" data-kunde={k} onClick={() => gehe({ hocoKunde: k })}>
            <span className="ordner__name">{k}</span>
            <span className="ordner__zahl">{kunden[k].anzahl + " Nummern"
              + (kunden[k].offen ? " · " + kunden[k].offen + " offen" : "")}</span>
          </button>))}</div>
      : <p className="hinweis">Kein Kunde in diesem Bereich.</p>;

  // Ebene 1: die Bereiche
  } else {
    const bereiche = {};
    alle.forEach((t) => {
      const b2 = bereichVon(kundeVon(t.hoco_nr));
      const s = b2 === null ? "?" : b2;
      if (!bereiche[s]) bereiche[s] = { anzahl: 0, offen: 0, kunden: {} };
      bereiche[s].anzahl++;
      bereiche[s].kunden[kundeVon(t.hoco_nr)] = true;
      if (t.ohneStamm) bereiche[s].offen++;
    });
    // Immer alle Bereiche von 10000 bis 11000 zeigen, auch leere — so
    // weiss man, wo eine neue Nummer hingehört.
    const fest = [];
    for (let v = 10000; v < 11000; v += 100) fest.push(v);
    Object.keys(bereiche).forEach((k) => {
      const z = parseInt(k, 10);
      if (!isNaN(z) && fest.indexOf(z) === -1) fest.push(z);
    });
    fest.sort((a, c) => a - c);
    titel = "HOCO Nr."; anzahl = alle.length;
    inhalt = <>
      <div className="ordner">{fest.map((v) => {
        const d = bereiche[v] || { anzahl: 0, offen: 0, kunden: {} };
        return (
          <button key={v} className={"ordner__feld" + (d.anzahl ? "" : " ordner__feld--leer")} data-bereich={v}
            onClick={() => gehe({ hocoBereich: v, hocoKunde: null })}>
            <span className="ordner__name">{bereichText(v)}</span>
            <span className="ordner__zahl">{d.anzahl
              ? Object.keys(d.kunden).length + " Kunden · " + d.anzahl + " Nummern" + (d.offen ? " · " + d.offen + " offen" : "")
              : "leer"}</span>
          </button>
        );
      })}</div>
      {bereiche["?"] && <p className="klein">{bereiche["?"].anzahl} Nummern lassen sich keinem Bereich
        zuordnen. Über die Suche findest du sie.</p>}
    </>;
  }

  // Feste Schlüssel: Das Suchfeld bleibt dasselbe Element, auch wenn
  // der Pfad darüber erscheint oder verschwindet — so bleibt der Cursor.
  return (
    <>
      {pfad && <div className="pfad" key="pfad">{pfad}</div>}
      <section className="karte" key="karte">
        <div className="karte__kopf">
          <h2>{titel}</h2>
          <span className="marke">{anzahl}</span>
          {darf && <div className="karte__aktionen">
            <button className="knopf knopf--klein" id="hoco-neu" onClick={aktionen.neu}>+ HOCO Nr.</button></div>}
        </div>
        <div className="suchleiste"><input type="text" id="hoco-such" placeholder="Suchen" autoComplete="off"
          value={suche} onChange={(e) => suchen(e.target.value)} /></div>
        {inhalt}
      </section>
    </>
  );
}

function Tabelle({ liste, darf, oeffnen, anlegen, bearbeiten, loeschen }) {
  return (
    <table className="tabelle">
      <thead><tr><th>HOCO Nr.</th><th>Bezeichnung</th><th>Material</th><th /></tr></thead>
      <tbody>{liste.map((t) => (
        <tr key={t.hoco_nr} className={t.ohneStamm ? "zeile--offen" : undefined}>
          <td>{t.ohneStamm
            ? <strong>{t.hoco_nr}</strong>
            : <button className="linkknopf" data-hoco-auf={t.hoco_nr} onClick={() => oeffnen(t.hoco_nr)}>
                <strong>{t.hoco_nr}</strong></button>}</td>
          <td>{t.ohneStamm ? <span className="gedaempft">noch nicht hinterlegt</span> : (t.bezeichnung || "")}</td>
          <td className={t.ohneStamm ? "gedaempft" : undefined}>{t.material || ""}</td>
          <td className="rechts nowrap">{darf && (t.ohneStamm
            ? <button className="linkknopf" data-hoco-anlegen={t.hoco_nr} onClick={() => anlegen(t.hoco_nr)}>Stammdaten anlegen</button>
            : <>
                <button className="linkknopf" data-hoco-um={t.hoco_nr} onClick={() => bearbeiten(t.hoco_nr)}>Bearbeiten</button>{" "}
                <button className="linkknopf linkknopf--gefahr" data-hoco-weg={t.hoco_nr} onClick={() => loeschen(t.hoco_nr)}>Löschen</button>
              </>)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
