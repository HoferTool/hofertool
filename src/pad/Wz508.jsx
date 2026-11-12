// =================================================================
//  PAD MODE: 508 WERKZEUGE (seit 1.495.0, Wunsch Patrick 12. November
//  2026: „im Pad Mode, bevor ich die Datei auf die Maschine lade,
//  auswählen, welches Werkzeug auf welchen Magazinplatz kommt … von den
//  vorbereiteten Werkzeugen mit dem 3D-Clip zusammen ein Foto machen …
//  auf dem Pad die Marke dem Werkzeug zuweisen … eine Liste, welche
//  Werkzeuge in der Maschine sind und welche im Werkzeugschrank“).
//  Kachel „508 Werkzeuge“ auf dem Startbild, nicht für Externe und Dienst.
//   - Vorbereiten: Foto von Werkzeug und Clip, 6 Ziffern der Marke
//   - Maschine bestücken: GESTOUTI.DAT + CSV wie in NC-PRO, dazu je
//     Werkzeug Fach und Marke; nach dem Herunterladen nachgeführt
//   - Liste: in der Maschine (nach Fach), im Werkzeugschrank, vorbereitet
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import Werkzeuge508 from "../seiten/rechner/Werkzeuge508.jsx";
import { ORTE, SQL_FEHLT, markeGut, markenLaden, vorbereiten, aendern, loeschen, nachDemSchreiben, nachDemSchreibenRechnen } from "../daten/wz508Marken.js";

export async function wz508Laden() {
  const m = await markenLaden();
  return { art: "wz508", ...m };
}

export const wz508Sichtbar = () => !alt.istExtern() && !(alt.meineRolle && alt.meineRolle() === "dienst");

let reiterGemerkt = "vorbereiten";
const ortText = (w) => (w.ort === "maschine" ? "Fach " + w.fach + (w.nr ? " · T" + w.nr : "") : ORTE[w.ort] || w.ort);

function Bild({ w, gross }) {
  if (!w || !w.foto_url) return <span className={"wz5p-bild wz5p-bild--leer" + (gross ? " wz5p-bild--gross" : "")}>kein Foto</span>;
  return <img className={"wz5p-bild" + (gross ? " wz5p-bild--gross" : "")} src={w.foto_url} alt={"Werkzeug " + w.marke} loading="lazy"
    onClick={(e) => { e.stopPropagation(); alt.betrachter(w.foto_url, "Werkzeug " + w.marke, false); }} />;
}

export default function PadWz508({ d, Kopf, neu }) {
  const [reiter, setReiter] = useState(reiterGemerkt);
  const wahl = (r) => { reiterGemerkt = r; setReiter(r); };
  const schreiben = alt.darfSchreiben();
  const zahl = (o) => d.liste.filter((w) => w.ort === o).length;
  return (
    <>
      <Kopf titel="508 Werkzeuge" zurueck />
      <div className="pad-wz5" id="pad-wz5">
        {d.fehlt && <p className="pad-wz5__fehlt">{SQL_FEHLT}</p>}
        <div className="pad-wz5__reiter" role="tablist">
          {[["vorbereiten", "📷 Vorbereiten", zahl("vorbereitet")], ["bestuecken", "⚙ Maschine bestücken", null],
            ["liste", "☰ Liste", d.liste.length]].map(([k, t, n]) => (
            <button key={k} role="tab" aria-selected={reiter === k} data-wz5p-reiter={k}
              className={"pad-wz5__tab" + (reiter === k ? " pad-wz5__tab--an" : "")} onClick={() => wahl(k)}>
              {t}{n ? <span className="pad-wz5__zahl">{n}</span> : null}</button>))}
        </div>
        {reiter === "vorbereiten" && <Vorbereiten liste={d.liste} schreiben={schreiben && !d.fehlt} neu={neu} />}
        {reiter === "bestuecken" && <Bestuecken liste={d.liste} schreiben={schreiben && !d.fehlt} neu={neu} />}
        {reiter === "liste" && <Liste liste={d.liste} schreiben={schreiben && !d.fehlt} neu={neu} />}
      </div>
    </>
  );
}

// ---------- Vorbereiten: Foto und Marke ----------
function Vorbereiten({ liste, schreiben, neu }) {
  const [datei, setDatei] = useState(null);
  const [vorschau, setVorschau] = useState("");
  const [marke, setMarke] = useState("");
  const [name, setName] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => () => { if (vorschau) URL.revokeObjectURL(vorschau); }, [vorschau]);
  const da = liste.find((w) => w.marke === marke);
  const vorbereitet = liste.filter((w) => w.ort === "vorbereitet");

  const foto = (e) => {
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    setDatei(f); setVorschau(URL.createObjectURL(f));
  };
  const speichern = async () => {
    if (!markeGut(marke)) { alt.meldung("Die Marke hat genau 6 Ziffern.", "warn"); return; }
    setLaeuft(true);
    try {
      await vorbereiten({ marke, name, datei }, liste);
      alt.meldung("Werkzeug " + marke + " ist vorbereitet", "gut");
      setDatei(null); setVorschau(""); setMarke(""); setName("");
      neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    setLaeuft(false);
  };

  return (
    <div className="pad-wz5__teil">
      {schreiben ? <div className="pad-wz5__erfassen">
        <label className="pad-wz5__foto" data-wz5p-foto="">
          {vorschau ? <img src={vorschau} alt="Foto" /> : <span>📷<b>Foto: Werkzeug mit Clip</b><i>antippen</i></span>}
          <input type="file" accept="image/*" capture="environment" id="wz5p-foto" hidden onChange={foto} />
        </label>
        <div className="pad-wz5__felder">
          <label>Marke (6 Ziffern auf dem Clip)
            <input id="wz5p-marke" className="pad-wz5__marke" inputMode="numeric" autoComplete="off"
              value={marke} placeholder="000000" onChange={(e) => setMarke(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") speichern(); }} /></label>
          {da && <p className="pad-wz5__hinweis" id="wz5p-schon">Marke {marke} gibt es schon: {da.name || "ohne Name"}, {ortText(da)}.
            {datei ? " Speichern ersetzt das Foto." : ""}</p>}
          <label>Werkzeug (freiwillig, z.B. Fräser D6)
            <input id="wz5p-name" value={name} maxLength={60} placeholder={da && da.name ? da.name : ""}
              onChange={(e) => setName(e.target.value)} /></label>
          <button className="pad-wz5__knopf pad-wz5__knopf--haupt" id="wz5p-speichern" disabled={laeuft || !markeGut(marke)}
            onClick={speichern}>{laeuft ? "Wird gespeichert …" : "Speichern"}</button>
          <p className="pad-wz5__klein">Das Foto geht auch mit dem Handy: dort im Pad Mode dasselbe.
            Beim Bestücken der Maschine wählst du dann die Marke beim Werkzeug.</p>
        </div>
      </div> : <p className="pad-wz5__hinweis">Zum Vorbereiten braucht es Schreibrecht.</p>}
      <h3 className="pad-wz5__zwischen">Vorbereitet ({vorbereitet.length})</h3>
      {!vorbereitet.length ? <p className="pad-wz5__leer">Noch nichts vorbereitet.</p>
        : <div className="pad-wz5__karten">{vorbereitet.map((w) => <Karte key={w.marke} w={w} schreiben={schreiben} neu={neu} />)}</div>}
    </div>
  );
}

function Karte({ w, schreiben, neu }) {
  const weg = async () => {
    const ja = await alt.nachfragen({ titel: "Werkzeug löschen", text: "Soll Marke " + w.marke + " aus der Liste gelöscht werden?",
      bestaetigen: "Löschen", gefahr: true });
    if (!ja) return;
    try { await loeschen(w); neu(); } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  const ort = async (o) => {
    try {
      await aendern(w, { ort: o, fach: null }, "Werkzeug " + w.marke + ": " + ORTE[o]);
      neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <div className="pad-wz5__karte" data-wz5p-karte={w.marke}>
      <Bild w={w} />
      <div className="pad-wz5__text">
        <b className="pad-wz5__nummer">{w.marke}</b>
        <span>{w.name || "ohne Name"}</span>
        <span className="pad-wz5__ort">{ortText(w)}</span>
      </div>
      {schreiben && <div className="pad-wz5__aktionen">
        {w.ort === "maschine" && <button className="pad-wz5__knopf" data-wz5p-schrank={w.marke} onClick={() => ort("schrank")}>In den Schrank</button>}
        {w.ort === "schrank" && <button className="pad-wz5__knopf" data-wz5p-vorbereiten={w.marke} onClick={() => ort("vorbereitet")}>Vorbereiten</button>}
        <button className="pad-wz5__knopf pad-wz5__knopf--weg" aria-label="Löschen" title="Löschen" data-wz5p-weg={w.marke} onClick={weg}>✕</button>
      </div>}
    </div>
  );
}

// ---------- Liste: Maschine, Schrank, vorbereitet ----------
function Liste({ liste, schreiben, neu }) {
  const [suche, setSuche] = useState("");
  const passt = (w) => !suche.trim() || suche.toLowerCase().split(/\s+/).filter(Boolean)
    .every((s) => [w.marke, w.name, w.notiz, w.fach && "fach " + w.fach, w.nr && "t" + w.nr].filter(Boolean).join(" ").toLowerCase().includes(s));
  const gruppen = [
    ["maschine", liste.filter((w) => w.ort === "maschine").sort((a, b) => (a.fach || 0) - (b.fach || 0))],
    ["schrank", liste.filter((w) => w.ort === "schrank")],
    ["vorbereitet", liste.filter((w) => w.ort === "vorbereitet")],
  ];
  return (
    <div className="pad-wz5__teil">
      <input className="pad-wz5__suche" id="wz5p-suche" placeholder="Suchen: Marke, Name, Fach …" value={suche}
        onChange={(e) => setSuche(e.target.value)} />
      {gruppen.map(([o, l]) => {
        const zeigen = l.filter(passt);
        return (
          <section key={o} className="pad-wz5__gruppe" data-wz5p-gruppe={o}>
            <h3 className="pad-wz5__zwischen">{ORTE[o]} ({l.length})</h3>
            {!zeigen.length ? <p className="pad-wz5__leer">{l.length ? "Nichts passt zur Suche." : "Keine."}</p>
              : <div className="pad-wz5__karten">{zeigen.map((w) => <Karte key={w.marke} w={w} schreiben={schreiben} neu={neu} />)}</div>}
          </section>
        );
      })}
    </div>
  );
}

// ---------- Maschine bestücken ----------
function Bestuecken({ liste, schreiben, neu }) {
  const vergebenText = (w) => (w ? <span className="wz5-marke-text">{w.foto_url && <Bild w={w} />}<b>{w.marke}</b></span> : null);
  const MarkeZeigen = ({ marke }) => {
    const w = liste.find((x) => x.marke === marke);
    return w ? vergebenText(w) : <b>{marke}</b>;
  };
  const geschrieben = async (aktiv) => {
    if (!schreiben) return;
    try {
      const raus = nachDemSchreibenRechnen(aktiv, liste).raus.map((m) => liste.find((w) => w.marke === m)).filter(Boolean);
      const zerlegt = raus.length ? await rausFragen(raus) : [];
      const r = await nachDemSchreiben(aktiv, liste, zerlegt);
      if (r.rein || r.raus || r.weg) alt.meldung("Liste nachgeführt: " + r.rein + " in der Maschine"
        + (r.raus ? ", " + r.raus + " in den Schrank" : "") + (r.weg ? ", " + r.weg + " zerlegt" : ""), "gut");
      neu();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };
  return (
    <div className="pad-wz5__teil pad-wz5__bestuecken">
      <Werkzeuge508 pad marken={liste} MarkeZeigen={MarkeZeigen} onGeschrieben={geschrieben}
        waehleMarke={(vergeben, v) => markeWahl(liste, vergeben, v)} />
    </div>
  );
}

// Auswahl der Marke für ein Werkzeug: zuerst die vorbereiteten mit Foto
function markeWahl(liste, vergeben, v) {
  return new Promise((fertig) => {
    let ende = false;
    const mit = (wert) => { if (!ende) { ende = true; fertig(wert); } };
    const zu = fensterOeffnen(() => <MarkeWahl liste={liste} vergeben={vergeben} v={v}
      fertig={(m) => { mit(m); zu(); }} />, () => mit(null), "wz5p-huelle");
  });
}

function MarkeWahl({ liste, vergeben, v, fertig }) {
  const [eigen, setEigen] = useState("");
  const frei = useMemo(() => {
    const rang = { vorbereitet: 0, schrank: 1, maschine: 2 };
    return liste.filter((w) => !vergeben.includes(w.marke))
      .sort((a, b) => rang[a.ort] - rang[b.ort] || String(a.marke).localeCompare(b.marke));
  }, [liste, vergeben]);
  return (
    <div className="dialog dialog--breit wz5p-wahl" id="wz5p-wahl">
      <div className="blatt__kopf">
        <h2>Marke für T{v.nr} · Fach {v.fach}</h2>
        <button className="knopf knopf--still" data-nein="" onClick={() => fertig(null)}>Abbrechen</button>
      </div>
      <p className="klein">{v.name}. Wähle das Werkzeug mit seinem Clip.</p>
      <div className="wz5p-wahl__eigen">
        <input inputMode="numeric" placeholder="Marke eintippen" value={eigen} id="wz5p-wahl-eigen" data-fokus=""
          onChange={(e) => setEigen(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter" && markeGut(eigen) && !vergeben.includes(eigen)) fertig(eigen); }} />
        <button className="knopf knopf--haupt" disabled={!markeGut(eigen) || vergeben.includes(eigen)} onClick={() => fertig(eigen)}>Übernehmen</button>
        <button className="knopf" data-wz5p-ohne="" onClick={() => fertig("")}>Ohne Marke</button>
      </div>
      {!frei.length ? <p className="klein">Noch keine Werkzeuge vorbereitet. Unter „Vorbereiten“ Foto und Marke erfassen.</p>
        : <ul className="wz5p-wahl__liste">
          {frei.map((w) => (
            <li key={w.marke}><button type="button" className="wz5p-wahl__karte" data-wz5p-wahl={w.marke} onClick={() => fertig(w.marke)}>
              {w.foto_url ? <img src={w.foto_url} alt="" /> : <span className="wz5p-wahl__leer">kein Foto</span>}
              <b>{w.marke}</b><span>{w.name || "ohne Name"}</span><span className="klein">{ortText(w)}</span>
            </button></li>))}
        </ul>}
    </div>
  );
}

// Was passiert mit den Werkzeugen, die aus der Maschine kommen?
// Vorgabe Schrank; Schliessen ohne Wahl heisst ebenfalls Schrank.
function rausFragen(raus) {
  return new Promise((fertig) => {
    let ende = false;
    const mit = (wert) => { if (!ende) { ende = true; fertig(wert); } };
    const zu = fensterOeffnen(() => <RausWahl raus={raus} fertig={(z) => { mit(z); zu(); }} />, () => mit([]), "wz5p-huelle");
  });
}

function RausWahl({ raus, fertig }) {
  const [zerlegt, setZerlegt] = useState([]);
  const setze = (m, ja) => setZerlegt((z) => (ja ? [...z.filter((x) => x !== m), m] : z.filter((x) => x !== m)));
  return (
    <div className="dialog dialog--breit wz5p-wahl wz5p-raus" id="wz5p-raus">
      <div className="blatt__kopf"><h2>Diese Werkzeuge kommen aus der Maschine</h2></div>
      <p className="klein">Was passiert mit ihnen?</p>
      <ul className="wz5p-raus__liste">
        {raus.map((w) => {
          const z = zerlegt.includes(w.marke);
          return (
            <li key={w.marke} data-wz5p-raus={w.marke}>
              {w.foto_url ? <img src={w.foto_url} alt="" /> : <span className="wz5p-wahl__leer">kein Foto</span>}
              <span><b>{w.marke}</b> {w.name || ""}<br /><span className="klein">war in Fach {w.fach}</span></span>
              <span className="wz5p-raus__wahl">
                <button className={"knopf" + (!z ? " knopf--haupt" : "")} data-wz5p-raus-schrank={w.marke} onClick={() => setze(w.marke, false)}>In den Schrank</button>
                <button className={"knopf" + (z ? " knopf--haupt" : "")} data-wz5p-raus-zerlegt={w.marke} onClick={() => setze(w.marke, true)}>Zerlegt, Marke frei</button>
              </span>
            </li>);
        })}
      </ul>
      <div className="wz5-fuss"><button className="knopf knopf--haupt" id="wz5p-raus-ok" onClick={() => fertig(zerlegt)}>Fertig</button></div>
    </div>
  );
}
