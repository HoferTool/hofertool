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
import { materialDatenLaden, materialRechnen, postenMengeText, laengenNachholen,
  orteLaden, orteSpeichern, werkstoffSuchtext } from "../daten/material.js";
import { postenFenster } from "../material/PostenFenster.jsx";
import { materialHistorieOeffnen } from "../material/Historie.jsx";
import { MKnopf } from "../material/WoEinsetzen.jsx";

const gemerkt = { suche: "" };


async function laden() {
  const r = await alt.zeitlimit(alt.db.from("planwand").select("*").is("ended_at", null), 15000, "Aufträge");
  if (r.error) throw r.error;
  const auftraege = r.data || [];
  await alt.standsNachtragen(auftraege);
  const d = await materialDatenLaden(auftraege);
  if (!d) return { fehlt: true };
  // Namen für „erfasst von“ und „geändert von“; ohne sie steht nur die Zeit
  const leute = await alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email"), 8000, "Personen")
    .then((x) => x.data || [], () => []);
  const personen = new Map(leute.map((u) => [u.id, alt.personName(u)]));
  return { ...materialRechnen(auftraege, d), ...d, auftraege, personen };
}


export default function Material({ auffrischen }) {
  const [suche, setSuche] = useState(gemerkt.suche);
  useGemerkt(gemerkt, { suche });
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);

  // Restmaterial gehört keinem Auftrag (seit 1.104.0); wo es passt,
  // zeigt das rote M beim Posten
  const erfassen = async (o) => {
    if (await postenFenster({ ...(o || {}) })) neu();
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
        {/* Die letzten 100 Änderungen (Wunsch Patrick 16. Oktober 2026) */}
        <button className="knopf" id="mat-historie-knopf" disabled={!daten || daten.fehlt}
          onClick={() => materialHistorieOeffnen(daten && daten.personen)}>Historie</button>
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

// Punkt in der Farbe, die dieses Material auf der Planwand hat: die
// häufigste unter den offenen Aufträgen mit diesem Werkstoff, sonst die
// der Werkstoffgruppe (Wunsch Patrick 16. Oktober 2026)
function farbeJeWerkstoff(auftraege) {
  const zaehler = new Map();
  (auftraege || []).forEach((j) => {
    if (!j.color || !j.material_bez) return;
    const k = alt.werkstoffSchluessel(j.material_bez);
    const z = zaehler.get(k) || new Map();
    z.set(j.color, (z.get(j.color) || 0) + 1);
    zaehler.set(k, z);
  });
  const ergebnis = new Map();
  zaehler.forEach((z, k) => ergebnis.set(k, [...z.entries()].sort((a, b) => b[1] - a[1])[0][0]));
  return ergebnis;
}

function Punkt({ p, jeWerkstoff }) {
  const color = jeWerkstoff.get(alt.werkstoffSchluessel(p.material));
  const f = alt.auftragFarbe(color ? { color } : null, p.material);
  return <span className="mat-punkt" style={{ background: f ? f.hex : "transparent" }} />;
}

// ---------- Für Aufträge ----------

async function aufgebraucht(p, neu) {
  const r = await alt.db.from("material_posten").update({ weg_am: new Date().toISOString() }).eq("id", p.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Material aufgebraucht", alt.rueckSetz("material_posten", { weg_am: null }, { id: p.id }));
  alt.meldung("Als aufgebraucht vermerkt.", "gut");
  neu();
}

// Wer den Posten erfasst und wer ihn zuletzt geändert hat, mit Datum
// und Zeit (Wunsch Patrick 16. Oktober 2026, seit 1.81.0). Die
// Datenbank trägt beides selbst ein (erstellt_von als Vorgabe,
// geaendert_von im Auslöser material_posten_geaendert).
function WerWann({ p, personen }) {
  const wer = (id) => (id && personen && personen.get(id)) || "";
  const teil = (was, am, von) => was + " " + alt.datumZeitKurz(am) + (wer(von) ? " · " + wer(von) : "");
  if (!p.erstellt_am && !p.geaendert_am) return null;
  return (
    <span className="mat-posten__werwann klein">
      {p.erstellt_am ? teil("Erfasst", p.erstellt_am, p.erstellt_von) : null}
      {p.geaendert_am ? (p.erstellt_am ? " — " : "") + teil("geändert", p.geaendert_am, p.geaendert_von) : null}
    </span>);
}

// Ein Posten Restmaterial: Menge, Ort; rotes M (wo einsetzen), Ändern
// und Aufgebraucht. Ohne „für …“: Restmaterial gehört keinem Auftrag
// (Wunsch Patrick 19. Oktober 2026)
function PostenZeile({ p, neu, mitMaterial, erfassen, personen, auftraege }) {
  return (
    <div className="mat-posten">
      <span className="mat-posten__menge">{postenMengeText(p)}</span>
      <span className="mat-posten__wo">
        {mitMaterial && <b>{p.material} </b>}
        {p.ort || "ohne Ort"}{p.be_nr ? <span className="klein"> · {p.be_nr}</span> : null}
        {p.notiz ? <span className="klein"> · {p.notiz}</span> : null}
        <WerWann p={p} personen={personen} />
      </span>
      <span className="mat-posten__knoepfe">
        <MKnopf p={p} auftraege={auftraege} neu={neu} />
        {erfassen && <button className="knopf knopf--klein" onClick={() => erfassen({ posten: p })}>Ändern</button>}
        <button className="knopf knopf--klein" onClick={() => aufgebraucht(p, neu)}>Aufgebraucht</button>
      </span>
    </div>
  );
}

// ---------- An Lager ----------

function Lager({ d, suche, neu, erfassen }) {
  const s = suche.trim().toLowerCase();
  const liste = d.posten.filter((p) => p.art !== "bestellt")
    .filter((p) => !s || s.split(/\s+/).every((w) => (p.material + " " + werkstoffSuchtext(p.material) + " " + (p.ort || "") + " " + (p.notiz || "")).toLowerCase().includes(w)));
  const jeWerkstoff = farbeJeWerkstoff(d.auftraege);
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
            return (
              <div key={p.id} className="mat-lagerzeile">
                <Punkt p={p} jeWerkstoff={jeWerkstoff} />
                <PostenZeile p={p} neu={neu} erfassen={erfassen} personen={d.personen} auftraege={d.auftraege} mitMaterial />
              </div>);
          })}
        </section>))}
      {!liste.length && <div className="karte karte--hinweis"><p>{s ? "Nichts gefunden." : "Noch nichts erfasst. Reste kommen von selbst dazu, wenn Aufträge beendet werden, oder mit „+ Material erfassen“."}</p></div>}
      {/* Orte dürfen alle ändern (Wunsch Patrick 16. Oktober 2026, sql/material-orte-alle.sql) */}
      {!alt.istExtern() && <button className="linkknopf" id="mat-orte" onClick={orteAendern}>Orte bearbeiten</button>}
    </>
  );
}

