// =================================================================
//  SEITE MATERIAL (seit 1.67.0, Wunsch Patrick 15. Oktober 2026)
//  Der Planer sieht hier sehr schnell, ob Material da ist oder
//  bestellt werden muss. Oben „Zu bestellen“: jedes fehlende Material
//  einmal, zusammengezählt über alle Aufträge. Darunter alle Materialien
//  der offenen Aufträge mit Lager, Bestellungen und Bedarf.
//  Reiter „An Lager“: alles, was herumliegt, nach Ort.
//  Reiter „Längen“: Länge der Fertigteile aus den Einrichtblättern
//  holen und bestätigen, erst dann rechnet die Mindestmenge sicher.
//  Rechnen und Laden in src/daten/material.js, Erfassen in
//  src/material/PostenFenster.jsx. Nicht für Externe.
// =================================================================
import { useMemo, useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import { materialDatenLaden, materialRechnen, AMPEL, kgText, mengeText, massAusEinrichtblatt,
  orteLaden, orteSpeichern, materialZerlegen } from "../daten/material.js";
import { postenFenster } from "../material/PostenFenster.jsx";

const gemerkt = { reiter: "auftraege", suche: "" };

const REIHENFOLGE = { fehlt: 0, unklar: 1, bestellt: 2, gut: 3, maschine: 4, lager: 5 };

async function laden() {
  const r = await alt.zeitlimit(alt.db.from("planwand").select("*").is("ended_at", null), 15000, "Aufträge");
  if (r.error) throw r.error;
  const auftraege = r.data || [];
  await alt.standsNachtragen(auftraege);
  const d = await materialDatenLaden(auftraege);
  if (!d) return { fehlt: true };
  return { ...materialRechnen(auftraege, d), ...d, auftraege };
}

const kurz = (iso) => (iso ? alt.kurzDatum(iso) : "");

export default function Material({ auffrischen }) {
  const [reiter, setReiter] = useState(gemerkt.reiter);
  const [suche, setSuche] = useState(gemerkt.suche);
  useGemerkt(gemerkt, { reiter, suche });
  const { daten, fehler, neu } = useDaten(laden, [auffrischen]);

  const erfassen = async (o) => { if (await postenFenster(o || {})) neu(); };

  return (
    <>
      <h1 className="seitentitel">Material</h1>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" id="mat-neu" onClick={() => erfassen()}>+ Material erfassen</button>
        <input className="mat-sucheingabe" id="mat-filter" type="search" value={suche}
          placeholder="Suchen: Material, HOCO Nr., Ort" onChange={(e) => setSuche(e.target.value)} />
      </div>
      <div className="reiter reiter--fein" id="mat-reiter">
        {[["auftraege", "Für Aufträge"], ["lager", "An Lager"], ["laengen", "Längen"]].map(([w, t]) => (
          <button key={w} className={"reiter__knopf" + (reiter === w ? " aktiv" : "")} data-matreiter={w}
            onClick={() => setReiter(w)}>{t}</button>))}
      </div>
      {fehler && !daten
        ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
        : !daten
          ? <div className="laedt">Wird geladen …</div>
          : daten.fehlt
            ? <div className="karte karte--hinweis"><p>Die Material-Übersicht ist in der Datenbank noch nicht
                eingerichtet. Dafür einmal <b>sql/material-uebersicht.sql</b> im Supabase SQL Editor ausführen.</p></div>
            : reiter === "lager"
              ? <Lager d={daten} suche={suche} neu={neu} erfassen={erfassen} />
              : reiter === "laengen"
                ? <Laengen d={daten} suche={suche} neu={neu} />
                : <Auftraege d={daten} suche={suche} neu={neu} erfassen={erfassen} />}
    </>
  );
}

function gruppePasst(g, suche) {
  const s = suche.trim().toLowerCase();
  if (!s) return true;
  const texte = [g.material, ...g.auftraege.map((a) => a.auftrag.job_number), ...g.maschine.map((a) => a.auftrag.job_number),
    ...g.lager.map((p) => p.ort || ""), ...g.bestellt.map((p) => (p.lieferant || "") + " " + (p.be_nr || ""))];
  return s.split(/\s+/).every((w) => texte.some((t) => String(t).toLowerCase().includes(w)));
}

function Ampel({ ampel, text }) {
  const a = AMPEL[ampel] || AMPEL.lager;
  return <span className={"mat-ampel mat-ampel--" + a.klasse}>{text || a.text}</span>;
}

function Punkt({ bez }) {
  const g = alt.werkstoffErkennen(bez);
  return <span className="mat-punkt" style={{ background: g ? alt.farbeVon(g.farbe).hex : "transparent" }} />;
}

// ---------- Für Aufträge ----------

function Auftraege({ d, suche, neu, erfassen }) {
  const [offen, setOffen] = useState(null);
  const gruppen = useMemo(() => d.gruppen
    .filter((g) => g.auftraege.length || g.maschine.length)
    .sort((a, b) => (REIHENFOLGE[a.ampel] - REIHENFOLGE[b.ampel])
      || String(a.erster || "9").localeCompare(String(b.erster || "9"))), [d]);
  const sichtbar = gruppen.filter((g) => gruppePasst(g, suche));
  const zuBestellen = sichtbar.filter((g) => g.ampel === "fehlt");

  return (
    <>
      <section className="karte mat-bestellen" id="mat-bestellen">
        <div className="karte__kopf"><h2>Zu bestellen</h2><span className="klein">{zuBestellen.length}</span></div>
        {zuBestellen.length
          ? <div className="mat-bestellliste">
              {zuBestellen.map((g) => (
                <div key={g.schluessel} className="mat-bestellzeile">
                  <div className="mat-name"><Punkt bez={g.material} />{g.material}</div>
                  <div className="mat-bestellzeile__was">
                    <b>{g.fehltKg ? "fehlt " + kgText(g.fehltKg) : g.lager.length || g.bestellt.length ? "reicht nicht" : "nichts da, nichts bestellt"}</b>
                    <span className="klein">{bedarfText(g)}</span>
                    <span className="klein">{g.auftraege.length === 1 ? "1 Auftrag" : g.auftraege.length + " Aufträge"}
                      {g.erster ? ", erster voraussichtlich ab " + kurz(g.erster) : ""}
                      {" · "}{g.auftraege.map((a) => a.auftrag.job_number).join(", ")}</span>
                    {g.aehnlich.length > 0 && <span className="klein mat-aehnlich">Ähnlich an Lager: {g.aehnlich.map((x) => x.material).join(", ")}</span>}
                  </div>
                  <button className="knopf knopf--klein" onClick={() => erfassen({ material: g.material, art: "bestellt", titel: "Bestellung erfassen" })}>Bestellt</button>
                </div>))}
            </div>
          : <p className="klein">Für alle offenen Aufträge ist Material da oder bestellt.</p>}
      </section>

      <section className="karte karte--raster">
        <div className="tabelle-rolle">
          <table className="tabelle mat-tabelle" id="mat-tabelle">
            <thead><tr><th>Material</th><th>Da (wo)</th><th>Bestellt</th><th>Brauchen</th><th>Stand</th></tr></thead>
            <tbody>
              {sichtbar.map((g) => {
                const auf = offen === g.schluessel;
                return [
                  <tr key={g.schluessel} className={"mat-zeile" + (auf ? " offen" : "")} data-material={g.material}
                    onClick={() => setOffen(auf ? null : g.schluessel)}>
                    <td><div className="mat-name"><Punkt bez={g.material} />{g.material}</div>
                      {g.aehnlich.length > 0 && <div className="klein mat-aehnlich">ähnlich an Lager: {g.aehnlich.map((x) => x.tol || "ohne Toleranz").join(", ")}</div>}</td>
                    <td>{g.lager.map((p) => <div key={p.id}>{mengeText(p.menge, p.einheit)} <span className="klein">{p.ort}</span></div>)}
                      {g.maschine.length > 0 && <div className="klein">an {[...new Set(g.maschine.map(maschineName))].join(", ")}</div>}
                      {!g.lager.length && !g.maschine.length && <span className="klein">nichts</span>}</td>
                    <td>{g.bestellt.map((p) => <div key={p.id}>{p.menge !== null && p.menge !== undefined ? mengeText(p.menge, p.einheit) : "?"} <span className="klein">{[p.lieferant, p.be_nr].filter(Boolean).join(" ")}{p.termin ? ", " + kurz(p.termin) : ""}</span></div>)}
                      {!g.bestellt.length && <span className="klein">nichts</span>}</td>
                    <td>{g.auftraege.length ? <>{g.auftraege.length === 1 ? "1 Auftrag" : g.auftraege.length + " Aufträge"}{g.erster ? ", ab " + kurz(g.erster) : ""}</> : <span className="klein">läuft</span>}
                      <div className="klein">{bedarfText(g)}</div></td>
                    <td><Ampel ampel={g.ampel} text={g.ampel === "fehlt" && g.fehltKg ? "fehlt " + kgText(g.fehltKg) : null} /></td>
                  </tr>,
                  auf && <tr key={g.schluessel + "-mehr"} className="mat-mehr"><td colSpan={5}>
                    <Gruppe g={g} neu={neu} erfassen={erfassen} /></td></tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        {!sichtbar.length && <p className="leer">Nichts gefunden.</p>}
      </section>
    </>
  );
}

function maschineName(x) {
  const m = x.maschine;
  return m ? m.name + (m.machine_number ? " " + m.machine_number : "") : (x.auftrag.maschine || "Maschine");
}

function bedarfText(g) {
  if (!g.auftraege.length) return "";
  if (!g.bedarfBekannt) return "Menge noch unbekannt";
  const teil = g.bedarfBekannt < g.auftraege.length ? " (" + g.bedarfBekannt + " von " + g.auftraege.length + " gerechnet)" : "";
  return "mind. " + kgText(g.kgBedarf) + teil + (g.bedarfSicher ? "" : ", nicht sicher: Länge nicht bestätigt");
}

// Aufgeklappt: Aufträge und Posten mit Knöpfen
function Gruppe({ g, neu, erfassen }) {
  return (
    <div className="mat-gruppe">
      {g.auftraege.length > 0 && <div className="mat-gruppe__teil">
        <h3>Aufträge</h3>
        {g.auftraege.map((a) => (
          <div key={a.auftrag.id} className="mat-auftrag">
            <b>{a.auftrag.job_number}</b>
            <span>{maschineName(a)}</span>
            <span>{a.start ? "ab " + kurz(a.start) : "ohne Start"}
              {a.versatz ? <span className="klein"> (Planwand {kurz(a.auftrag.planned_from)}, Maschine {a.versatz > 0 ? a.versatz + " Tage hinten" : -a.versatz + " Tage voraus"})</span> : null}</span>
            <span className="zahl">{alt.zahlText(Math.max(0, (Number(a.auftrag.target_quantity) || 0) - (Number(a.auftrag.stand) || 0)))} Stk.</span>
            <span className="klein">{a.bedarf
              ? "mind. " + kgText(a.bedarf.kg) + " (" + a.bedarf.stangen + " Stangen à " + a.bedarf.jeStange + " Stk."
                + (a.bedarf.abstecher ? "" : ", ohne Abstecher") + ")" + (a.bedarf.sicher ? "" : ", Länge nicht bestätigt")
              : "Länge fehlt"}</span>
            <Ampel ampel={a.ampel} text={a.ampel === "fehlt" && a.fehltKg ? "fehlt " + kgText(a.fehltKg) : null} />
          </div>))}
      </div>}
      <div className="mat-gruppe__teil">
        <h3>Da und bestellt</h3>
        {g.lager.concat(g.bestellt).map((p) => <PostenZeile key={p.id} p={p} neu={neu} />)}
        {!g.lager.length && !g.bestellt.length && <p className="klein">Nichts erfasst.</p>}
        <button className="knopf knopf--klein" onClick={() => erfassen({ material: g.material })}>+ Hier erfassen</button>
      </div>
    </div>
  );
}

async function aufgebraucht(p, neu) {
  const r = await alt.db.from("material_posten").update({ weg_am: new Date().toISOString() }).eq("id", p.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Material aufgebraucht", alt.rueckSetz("material_posten", { weg_am: null }, { id: p.id }));
  alt.meldung("Als aufgebraucht vermerkt.", "gut");
  neu();
}

function PostenZeile({ p, neu, mitMaterial }) {
  const bestellt = p.art === "bestellt";
  // Ist da: aus einer Bestellung wird ein Posten an Lager (aus der Notiz
  // ein neuer mit derselben Nummer, dann verschwindet der aus der Notiz)
  const istDa = async () => {
    const vorlage = { ...p, art: "lager", ort: "" };
    if (await postenFenster({ posten: vorlage, titel: "Lieferung ist da" })) neu();
  };
  return (
    <div className={"mat-posten" + (bestellt ? " mat-posten--bestellt" : "")}>
      <span className="mat-posten__menge">{p.menge !== null && p.menge !== undefined ? mengeText(p.menge, p.einheit) : "Menge?"}</span>
      <span className="mat-posten__wo">
        {mitMaterial && <b>{p.material} </b>}
        {bestellt
          ? <>bestellt{p.lieferant ? " bei " + p.lieferant : ""}{p.be_nr ? " · " + p.be_nr : ""}{p.termin ? " · kommt " + kurz(p.termin) : ""}
              {p.aus_notiz ? <span className="klein"> (aus Auftrag {p.job.job_number})</span> : null}</>
          : <>{p.ort || "ohne Ort"}{p.be_nr ? <span className="klein"> · {p.be_nr}</span> : null}</>}
        {p.notiz ? <span className="klein"> · {p.notiz}</span> : null}
      </span>
      <span className="mat-posten__knoepfe">
        {bestellt && <button className="knopf knopf--klein knopf--haupt" onClick={istDa}>Ist da</button>}
        {!p.aus_notiz && <button className="knopf knopf--klein" onClick={async () => { if (await postenFenster({ posten: p })) neu(); }}>Ändern</button>}
        {!p.aus_notiz && <button className="knopf knopf--klein" onClick={() => aufgebraucht(p, neu)}>{bestellt ? "Weg" : "Aufgebraucht"}</button>}
      </span>
    </div>
  );
}

// ---------- An Lager ----------

function Lager({ d, suche, neu }) {
  const brauchen = new Set(d.gruppen.filter((g) => g.auftraege.length).map((g) => g.schluessel));
  const s = suche.trim().toLowerCase();
  const liste = d.posten.filter((p) => p.art !== "bestellt")
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
                <PostenZeile p={p} neu={neu} mitMaterial />
                {z && !brauchen.has(z.schluessel) && <span className="mat-ampel mat-ampel--grau">kein Auftrag</span>}
              </div>);
          })}
        </section>))}
      {!liste.length && <div className="karte karte--hinweis"><p>{s ? "Nichts gefunden." : "Noch nichts erfasst. Reste kommen von selbst dazu, wenn Aufträge beendet werden, oder mit „+ Material erfassen“."}</p></div>}
      {alt.istAdmin() && <button className="linkknopf" id="mat-orte" onClick={orteAendern}>Orte bearbeiten</button>}
    </>
  );
}

// ---------- Längen der Fertigteile ----------

function Laengen({ d, suche, neu }) {
  const [laeuft, setLaeuft] = useState(null);
  const darf = alt.darfSchreiben();
  // Jede HOCO Nr. der offenen, noch nicht laufenden Aufträge einmal
  const nummern = new Map();
  for (const g of d.gruppen) for (const a of g.auftraege) {
    if (!nummern.has(a.auftrag.job_number)) nummern.set(a.auftrag.job_number, { nr: a.auftrag.job_number, material: a.auftrag.material_bez, auftrag: a.auftrag });
  }
  const s = suche.trim().toLowerCase();
  const liste = [...nummern.values()].filter((x) => !s || (x.nr + " " + x.material).toLowerCase().includes(s))
    .sort((a, b) => a.nr.localeCompare(b.nr));
  const offen = liste.filter((x) => !(d.teile[x.nr] && d.teile[x.nr].teil_mass_bestaetigt));

  const speichern = async (nr, werte) => {
    const r = await alt.db.from("hoco_parts").upsert([{ hoco_nr: nr, ...werte }], { onConflict: "hoco_nr" });
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return false; }
    return true;
  };

  const ausBlaettern = async () => {
    const ohne = liste.filter((x) => !(d.teile[x.nr] && d.teile[x.nr].teil_laenge_mm)).map((x) => x.nr);
    if (!ohne.length) { alt.meldung("Alle haben schon eine Länge."); return; }
    const r = await alt.db.from("hoco_type_data").select("hoco_nr, type_id, blatt_url").in("hoco_nr", ohne).not("blatt_url", "is", null);
    if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
    const jeNr = {};
    (r.data || []).forEach((x) => { (jeNr[x.hoco_nr] = jeNr[x.hoco_nr] || []).push(x); });
    const aufgaben = Object.keys(jeNr);
    // Ohne Einrichtblatt gibt es nichts zu lesen; das steht dann dabei
    await Promise.all(ohne.filter((nr) => !jeNr[nr]).map((nr) =>
      speichern(nr, { teil_mass_quelle: "Nicht gefunden: kein Einrichtblatt vorhanden" })));
    let gefunden = 0, fertig = 0;
    setLaeuft({ fertig: 0, von: aufgaben.length });
    const eine = async (nr) => {
      // Zuerst das Blatt vom Typ der geplanten Maschine
      const typ = (d.maschineVon[nummern.get(nr).auftrag.machine_id] || {}).type_id;
      const blaetter = jeNr[nr].sort((a, b) => (b.type_id === typ) - (a.type_id === typ));
      let grund = "";
      for (const b of blaetter) {
        try {
          const m = await massAusEinrichtblatt(b.blatt_url);
          if (m && m.laenge) {
            if (await speichern(nr, { teil_d_mm: m.d, teil_laenge_mm: m.laenge, teil_mass_bestaetigt: false,
              teil_mass_quelle: "Einrichtblatt: " + m.text.slice(0, 120) })) { gefunden++; grund = ""; break; }
          } else if (m && !grund) grund = m.grund + (m.text ? ": " + m.text : "");
        } catch (f) { if (!grund) grund = "Excel nicht lesbar"; }
      }
      // Woran es lag, steht danach in der Liste bei der Nummer
      if (grund) await speichern(nr, { teil_mass_quelle: "Nicht gefunden: " + grund.slice(0, 140) });
      fertig++;
      setLaeuft({ fertig, von: aufgaben.length });
    };
    // Drei gleichzeitig, damit es nicht ewig dauert und das Netz nicht verstopft
    const warte = aufgaben.slice();
    await Promise.all([1, 2, 3].map(async () => { while (warte.length) await eine(warte.shift()); }));
    setLaeuft(null);
    const ohneBlatt = ohne.length - aufgaben.length;
    alt.meldung(gefunden + " von " + ohne.length + " Längen gefunden"
      + (ohneBlatt > 0 ? ", " + ohneBlatt + " ohne Einrichtblatt" : "")
      + ". Bitte prüfen und bestätigen; bei den übrigen steht, woran es lag.", gefunden ? "gut" : "warn");
    neu();
  };

  const aendern = async (x) => {
    const t = d.teile[x.nr] || {};
    // Nur die Länge: den Durchmesser nimmt die App vom Material, der
    // des Fertigteils bringt für die Menge nichts (Patrick 15. Oktober 2026)
    const w = await alt.dialogFelder({ titel: "Länge " + x.nr, text: x.material,
      felder: [{ name: "l", label: "Länge des Teils in mm", wert: t.teil_laenge_mm || "", dezimal: true }],
      bestaetigen: "Bestätigen" });
    if (!w) return;
    const zahl = (v) => { const n = Number(String(v).replace(",", ".")); return v !== "" && isFinite(n) && n > 0 ? n : null; };
    if (!zahl(w.l)) { alt.meldung("Die Länge fehlt.", "warn"); return; }
    if (await speichern(x.nr, { teil_laenge_mm: zahl(w.l), teil_mass_bestaetigt: true,
      teil_mass_quelle: "von Hand" })) neu();
  };
  const bestaetigen = async (x) => { if (await speichern(x.nr, { teil_mass_bestaetigt: true })) neu(); };

  return (
    <>
      <div className="karte karte--hinweis">
        <p>Die Länge des Fertigteils steht im Einrichtblatt bei „Artikel Bez.“, etwa „Getriebedeckel 17 x 7.00“
          (Durchmesser x Länge); die App nimmt nur die Länge, den Durchmesser nimmt sie vom Material.
          Erst wenn sie bestätigt ist, gilt die Mindestmenge als sicher. Im Pad steht sie bei „Art. Info“,
          beim Beenden muss sie stimmen.
          Stangenlänge und Rest-Stumpen stehen beim Maschinentyp (Produktion → Typen).</p>
        {darf && <button className="knopf knopf--haupt" id="mat-laengen-holen" disabled={!!laeuft} onClick={ausBlaettern}>
          {laeuft ? "Liest " + laeuft.fertig + " von " + laeuft.von + " …" : "Längen aus Einrichtblättern lesen"}</button>}
      </div>
      <section className="karte">
        <div className="karte__kopf"><h2>Fertigteile der geplanten Aufträge</h2>
          <span className="klein">{offen.length} offen</span></div>
        {liste.map((x) => {
          const t = d.teile[x.nr] || {};
          return (
            <div key={x.nr} className="mat-laenge" data-hoco={x.nr}>
              <b>{x.nr}</b>
              <span className="klein">{x.material}</span>
              <span>{t.teil_laenge_mm ? "Länge " + String(t.teil_laenge_mm).replace(".", ",") + " mm" : "keine Länge"}</span>
              <span className="klein">{t.teil_mass_quelle || ""}</span>
              {t.teil_laenge_mm
                ? (t.teil_mass_bestaetigt ? <span className="mat-ampel mat-ampel--gut">bestätigt</span>
                  : <span className="mat-ampel mat-ampel--warn">nicht bestätigt</span>)
                : <span className="mat-ampel mat-ampel--grau">fehlt</span>}
              {darf && <span className="mat-posten__knoepfe">
                {t.teil_laenge_mm && !t.teil_mass_bestaetigt && <button className="knopf knopf--klein knopf--haupt" onClick={() => bestaetigen(x)}>Stimmt</button>}
                <button className="knopf knopf--klein" onClick={() => aendern(x)}>{t.teil_laenge_mm ? "Ändern" : "Eintragen"}</button>
              </span>}
            </div>);
        })}
      </section>
    </>
  );
}
