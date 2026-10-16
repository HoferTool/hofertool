// =================================================================
//  SEITE MATERIAL (seit 1.67.0, Wunsch Patrick 15. Oktober 2026)
//  Seit 1.72.0 nur noch Restmaterial (Wunsch Patrick 16. Oktober 2026:
//  „Material bestellt und das andere bringt nichts, soll nur Restmaterial
//  sein, wo dort reinkommt und rausgeht“): alles, was herumliegt, nach
//  Ort; erfassen, ändern, aufgebraucht. Die Reiter „Zu bestellen“ und
//  „Bestellt“ sind weg. Gerechnet wird weiter (Zuweisung, Schnellvorschau).
//  Die Längen der Fertigteile liest die App selbst aus den
//  Einrichtblättern (laengenNachholen), bestätigt werden sie im Pad bei
//  „Art. Info“ und beim Beenden. Der Reiter „Längen“ ist seit 1.70.0 weg
//  (Wunsch Patrick 15. Oktober 2026).
//  Rechnen und Laden in src/daten/material.js, Erfassen in
//  src/material/PostenFenster.jsx. Nicht für Externe.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { materialDatenLaden, materialRechnen, mengeText, laengenNachholen,
  orteLaden, orteSpeichern, materialZerlegen, istOffen } from "../daten/material.js";
import { postenFenster } from "../material/PostenFenster.jsx";

const gemerkt = { suche: "" };


async function laden() {
  const r = await alt.zeitlimit(alt.db.from("planwand").select("*").is("ended_at", null), 15000, "Aufträge");
  if (r.error) throw r.error;
  const auftraege = r.data || [];
  await alt.standsNachtragen(auftraege);
  const d = await materialDatenLaden(auftraege);
  if (!d) return { fehlt: true };
  return { ...materialRechnen(auftraege, d), ...d, auftraege };
}


export default function Material({ auffrischen }) {
  const [suche, setSuche] = useState(gemerkt.suche);
  useGemerkt(gemerkt, { suche });
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);

  // Offene Aufträge zum Zuweisen; das Fenster zeigt nur die mit diesem Material
  const erfassen = async (o) => {
    const auftraege = daten && daten.auftraege ? daten.auftraege.filter(istOffen) : [];
    if (await postenFenster({ auftraege, ...(o || {}) })) neu();
  };
  // Fehlende Längen im Hintergrund aus den Einrichtblättern holen; was
  // gefunden wird, rechnet danach mit (unbestätigt, „nicht sicher“)
  useEffect(() => {
    if (daten && daten.teile) laengenNachholen(daten.teile, (n) => { if (n) neu(); });
  }, [daten]);

  return (
    <>
      <h1 className="seitentitel">Material</h1>
      <p className="klein mat-erklaerung">Restmaterial: was reinkommt, erfassen; was gebraucht ist, mit „Aufgebraucht“ austragen.
        Beim Beenden eines Auftrags fragt die App von selbst nach dem Rest.</p>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" id="mat-neu" onClick={() => erfassen()}>+ Material erfassen</button>
        <input className="mat-sucheingabe" id="mat-filter" type="search" value={suche}
          placeholder="Suchen: Material, Ort" onChange={(e) => setSuche(e.target.value)} />
      </div>
      {fehler && !daten
        ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
        : !daten
          ? <div className="laedt">Wird geladen …</div>
          : daten.fehlt
            ? <div className="karte karte--hinweis"><p>Die Material-Übersicht ist in der Datenbank noch nicht
                eingerichtet. Dafür einmal <b>sql/material-uebersicht.sql</b> im Supabase SQL Editor ausführen.</p></div>
            : <Lager d={daten} suche={suche} neu={neu} erfassen={erfassen} />}
    </>
  );
}

function Punkt({ bez }) {
  const g = alt.werkstoffErkennen(bez);
  return <span className="mat-punkt" style={{ background: g ? alt.farbeVon(g.farbe).hex : "transparent" }} />;
}

// ---------- Für Aufträge ----------

async function aufgebraucht(p, neu) {
  const r = await alt.db.from("material_posten").update({ weg_am: new Date().toISOString() }).eq("id", p.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Material aufgebraucht", alt.rueckSetz("material_posten", { weg_am: null }, { id: p.id }));
  alt.meldung("Als aufgebraucht vermerkt.", "gut");
  neu();
}

// Ein Posten Restmaterial: Menge, Ort, Zuweisung; Ändern und Aufgebraucht
function PostenZeile({ p, neu, mitMaterial, erfassen }) {
  return (
    <div className="mat-posten">
      <span className="mat-posten__menge">{p.menge !== null && p.menge !== undefined ? mengeText(p.menge, p.einheit) : "Menge?"}</span>
      <span className="mat-posten__wo">
        {mitMaterial && <b>{p.material} </b>}
        {p.ort || "ohne Ort"}{p.be_nr ? <span className="klein"> · {p.be_nr}</span> : null}
        {p.notiz ? <span className="klein"> · {p.notiz}</span> : null}
        {p.fuerNr ? <span className="mat-fuer"> · {p.fuer_hoco ? "Rahmen " : "für "}{p.fuerNr}{p.platz ? ", " + p.platz : ""}</span> : null}
      </span>
      <span className="mat-posten__knoepfe">
        {erfassen && <button className="knopf knopf--klein" onClick={() => erfassen({ posten: p })}>Ändern</button>}
        <button className="knopf knopf--klein" onClick={() => aufgebraucht(p, neu)}>Aufgebraucht</button>
      </span>
    </div>
  );
}

// ---------- An Lager ----------

function Lager({ d, suche, neu, erfassen }) {
  const brauchen = new Set(d.gruppen.filter((g) => g.auftraege.length).map((g) => g.schluessel));
  const s = suche.trim().toLowerCase();
  // Die gerechneten Posten wissen, wofür sie zugewiesen sind
  const gerechnet = new Map(d.gruppen.flatMap((g) => g.lager.map((p) => [p.id, p])));
  const liste = d.posten.filter((p) => p.art !== "bestellt").map((p) => gerechnet.get(p.id) || p)
    .filter((p) => !s || s.split(/\s+/).every((w) => (p.material + " " + (p.ort || "") + " " + (p.notiz || "")).toLowerCase().includes(w)));
  const jeOrt = new Map();
  liste.forEach((p) => {
    const o = p.ort || "Ohne Ort";
    if (!jeOrt.has(o)) jeOrt.set(o, []);
    jeOrt.get(o).push(p);
  });

  const orteAendern = async () => {
    const jetzt = await orteLaden();
    const w = await alt.dialogFelder({ titel: "Orte", text: "Ein Ort pro Zeile. So erscheinen sie als Knöpfe beim Erfassen.",
      felder: [{ name: "orte", label: "Orte", typ: "textarea", wert: jetzt.join("\n") }] });
    if (!w) return;
    const neueListe = w.orte.split(/\n/).map((x) => x.trim()).filter(Boolean);
    try { await orteSpeichern(neueListe); alt.meldung("Gespeichert.", "gut"); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <>
      {[...jeOrt.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ort, posten]) => (
        <section key={ort} className="karte" data-ort={ort}>
          <div className="karte__kopf"><h2>{ort}</h2><span className="klein">{posten.length}</span></div>
          {posten.sort((a, b) => a.material.localeCompare(b.material)).map((p) => {
            const z = materialZerlegen(p.material);
            return (
              <div key={p.id} className="mat-lagerzeile">
                <Punkt bez={p.material} />
                <PostenZeile p={p} neu={neu} erfassen={erfassen} mitMaterial />
                {z && !brauchen.has(z.schluessel) && <span className="mat-ampel mat-ampel--grau">kein Auftrag</span>}
              </div>);
          })}
        </section>))}
      {!liste.length && <div className="karte karte--hinweis"><p>{s ? "Nichts gefunden." : "Noch nichts erfasst. Reste kommen von selbst dazu, wenn Aufträge beendet werden, oder mit „+ Material erfassen“."}</p></div>}
      {alt.istAdmin() && <button className="linkknopf" id="mat-orte" onClick={orteAendern}>Orte bearbeiten</button>}
    </>
  );
}

