// =================================================================
//  AUFTRAGSFENSTER
//  Einplanen, ändern, kopieren: ein Fenster in drei Spalten.
//    1. Auftrag und Zeit (HOCO Nr., FA Nr., Maschine, Ab/Tage/Bis,
//       Menge, Hinweis zum Material, wer eingeplant hat)
//    2. Material (Bezeichnung, Menge, Liefertermin, Farbe, Vorschau
//       der Zeichnung)
//    3. Zustand, Notiz, Zeichnung und WBG
//  Keine Häkchen „FA erstellt“ oder „Material da“: Das ergibt sich
//  aus FA Nr. und Materialmenge.
//
//  Aufruf wie bisher: planAuftragDialog(auftrag, b, maschine, datum,
//  vorlage). Ohne auftrag ist es ein neuer Auftrag, mit vorlage eine
//  Kopie (alles übernommen ausser Nummer, Maschine, Stückzahl und
//  Zeichnung; Beginn dort, wo die Maschine wieder frei ist).
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useVerzoegert } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { neueFarbeDialog } from "../teile/Dialoge.jsx";
import { auftragSpeichern, auftragLoeschen } from "./auftragSpeichern.js";

export function planAuftragDialog(auftrag, b, vorgabeMaschine, vorgabeDatum, vorlage) {
  alt.plan.imDialog = true;
  fensterOeffnen((zu) => (
    <AuftragFenster auftrag={auftrag || null} b={b} vorgabeMaschine={vorgabeMaschine}
      vorgabeDatum={vorgabeDatum} vorlage={vorlage || null} zu={zu} />
  ), () => { alt.plan.imDialog = false; });
}

const istBild = (adresse) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(adresse);

// Was beim Öffnen in den Feldern steht
function anfangswerte(auftrag, v, vorgabeMaschine, vorgabeDatum) {
  const maschinen = alt.prod.maschinen || [];
  const quelle = auftrag || v || {};
  const leerOder = (x) => (x === null || x === undefined ? "" : x);
  const maschine = auftrag ? auftrag.machine_id
    : (vorgabeMaschine || (maschinen[0] ? maschinen[0].id : ""));
  // Ein neuer Auftrag beginnt dort, wo die Maschine wieder frei ist —
  // nicht heute. Sonst liegt die Kopie sofort auf einem anderen Auftrag.
  const von = auftrag ? (auftrag.planned_from || "")
    : (vorgabeDatum
       || alt.naechsterFreierTag(vorgabeMaschine || (v && v.machine_id)
            || (maschinen[0] ? maschinen[0].id : null))
       || alt.isoDatum(new Date()));
  const tage = quelle.planned_days || 1;

  // Wer hat eingeplant? Bei einem neuen Auftrag die eigenen Initialen,
  // sofern man selbst als Planer eingetragen ist.
  let planer = [];
  if (auftrag && auftrag.geplant_von) {
    planer = String(auftrag.geplant_von).split("/").map((x) => x.trim()).filter(Boolean);
  } else if (!auftrag) {
    const eigene = alt.meineInitialen();
    if (eigene) planer = [eigene];
  }

  return {
    nr: v ? (v.job_number || "") : "",
    faNr: auftrag ? (auftrag.fa_nr || "") : "",
    maschine: maschine || "",
    von,
    tage: String(tage),
    bis: auftrag && auftrag.planned_from ? alt.letzterArbeitstag(auftrag.planned_from, tage) : "",
    menge: String(leerOder(auftrag ? auftrag.target_quantity : (v ? v.target_quantity : ""))),
    matOrt: alt.notizTrennen(quelle.plan_note || "").ort,
    planer,
    matBez: quelle.material_bez || "",
    matMenge: quelle.material_menge || "",
    liefer: quelle.material_liefertermin || "",
    farbe: (auftrag && auftrag.color) || (v && v.color) || "blau",
    zustand: (auftrag && auftrag.plan_status) || "geplant",
    notiz: quelle.plan_note || "",
    // Die Kopie übernimmt auch die Zeichnung
    pdf: auftrag ? auftrag.drawing_url : (v ? (v.drawing_url || null) : null),
    wbg: auftrag ? auftrag.wbg_url : (v ? (v.wbg_url || null) : null),
  };
}

// Zeichnung als Vorschau. PDFs stellt der Browser selbst dar, Bilder
// werden eingebettet. Die Fläche bleibt bedienbar (blättern, rollen);
// zum Vergrössern gibt es den Knopf in der Ecke.
function Vorschau({ adresse, titel }) {
  if (!adresse) {
    return <div className="auf-vorschau" id="pl-vorschau">
      <span className="auf-vorschau__leer">Keine Zeichnung hinterlegt</span></div>;
  }
  const bild = istBild(adresse);
  return (
    <div className="auf-vorschau auf-vorschau--da" id="pl-vorschau">
      {bild
        ? <img src={adresse} alt="Zeichnung" />
        : <iframe src={adresse + "#navpanes=0&view=FitH"} title="Zeichnung" loading="lazy" />}
      <button type="button" className="auf-vorschau__gross" title="Gross ansehen"
        onClick={() => alt.betrachter(adresse, titel, !bild)}>⤢</button>
    </div>
  );
}

// Ein PDF-Anhang: ansehen, entfernen oder wählen und hochladen
function Anhang({ was, ordner, adresse, setzen, darf, titel, id, wegId, standId, stand, setStand }) {
  const hochladen = async (e) => {
    const datei = (e.target.files || [])[0];
    if (!datei) return;
    setStand(was + " wird hochgeladen …");
    try {
      const name = ordner + "/" + Date.now() + "-" + datei.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
      const ablage = alt.db.storage.from("zeichnungen");
      const r = await ablage.upload(name, datei, { contentType: "application/pdf" });
      if (r.error) throw r.error;
      setzen(ablage.getPublicUrl(name).data.publicUrl);
      setStand(was + " hochgeladen: " + datei.name);
    } catch (f) {
      setStand("Hochladen fehlgeschlagen: " + (f.message || f));
    }
  };
  // Die Datei selbst bleibt in der Ablage, bis gespeichert wird
  const weg = async () => {
    const ok = await alt.nachfragen({ titel: "Anhang entfernen",
      text: "Soll das PDF von diesem Auftrag genommen werden?",
      bestaetigen: "Entfernen", gefahr: true });
    if (!ok) return;
    setzen(null);
    setStand("Entfernt. Wird beim Speichern übernommen.");
  };
  return (
    <>
      <div className="pdfreihe" id={id}>
        {adresse && <button type="button" className="knopf knopf--klein pdflink" data-pdfzeigen={adresse}
          onClick={() => alt.betrachter(adresse, titel, true)}>Ansehen</button>}
        {adresse && darf && <button type="button" className="knopf knopf--klein knopf--gefahr"
          id={wegId} title={was + " entfernen"} onClick={weg}>✕</button>}
        {/* Wählen erscheint nur, solange nichts dranhängt */}
        {!adresse && darf && <label className="knopf knopf--klein bildknopf">PDF wählen
          <input type="file" accept="application/pdf" hidden onChange={hochladen} /></label>}
      </div>
      {darf && <span className="feldhinweis" id={standId}>{stand}</span>}
    </>
  );
}

function AuftragFenster({ auftrag, b, vorgabeMaschine, vorgabeDatum, vorlage: v, zu }) {
  const darf = alt.darfPlanen();
  // Ohne Planungsrecht ist das Fenster zum Nachschauen da: ändern lässt
  // sich nur, was auch vorher schon ging, also Zustand und Problem melden
  const nurLesen = !darf;
  const extern = alt.istExtern();
  const maschinen = alt.prod.maschinen || [];
  const [w, setW] = useState(() => anfangswerte(auftrag, v, vorgabeMaschine, vorgabeDatum));
  const setze = (feld, wert) => setW((x) => ({ ...x, [feld]: wert }));
  const aktuell = useRef(w);
  aktuell.current = w;
  const farbeVonHand = useRef(false);
  const [hocoInfo, setHocoInfo] = useState("");
  const [pdfStand, setPdfStand] = useState("");
  const [wbgStand, setWbgStand] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  // ----- Von, Bis und Dauer im Gleichklang -----
  const vonAendern = (von) => setW((x) => ({ ...x, von,
    bis: von ? alt.letzterArbeitstag(von, Math.max(1, Number(x.tage) || 1)) : x.bis }));
  const tageAendern = (tage) => setW((x) => ({ ...x, tage,
    bis: x.von ? alt.letzterArbeitstag(x.von, Math.max(1, Number(tage) || 1)) : x.bis }));
  const bisAendern = (bis) => setW((x) => {
    if (!x.von || !bis) return { ...x, bis };
    const b2 = bis < x.von ? x.von : bis;
    return { ...x, bis: b2, tage: String(alt.arbeitstageZwischen(x.von, b2)) };
  });

  // ----- Werkstoff erkennen -----
  // Gruppe unter dem Feld, Farbe dazu — ausser die Farbe wurde in
  // diesem Fenster von Hand gewählt. Beim Öffnen nur bei einem neuen
  // Auftrag auch die Farbe.
  const matRuhig = useVerzoegert(w.matBez, 250);
  const ersterLauf = useRef(true);
  const gruppe = w.matBez.trim() ? alt.werkstoffErkennen(w.matBez) : null;
  useEffect(() => {
    const farbeSetzen = !ersterLauf.current || !auftrag;
    ersterLauf.current = false;
    if (!farbeSetzen || farbeVonHand.current || !matRuhig.trim()) return;
    const g = alt.werkstoffErkennen(matRuhig);
    if (g && aktuell.current.farbe !== g.farbe) setze("farbe", g.farbe);
  }, [matRuhig, auftrag]);

  // ----- HOCO Nr. nachschlagen -----
  // Sobald eine bekannte Nummer dasteht, die Stammdaten anzeigen und
  // Material, Zeichnung und Farbe übernehmen, soweit noch leer.
  const nrRuhig = useVerzoegert(w.nr, 400);
  useEffect(() => {
    if (auftrag) return;
    const nr = nrRuhig.trim();
    if (!nr) { setHocoInfo(""); return; }
    let gueltig = true;
    alt.ladeHocoEins(nr).then((teil) => {
      if (!gueltig) return;
      if (!teil) {
        setHocoInfo("Zu dieser Nummer sind noch keine Stammdaten hinterlegt. "
          + "Anlegen geht unter Produktion → HOCO Nr.");
        return;
      }
      const jetzt = aktuell.current;
      const neu = {};
      const uebernommen = [];
      if (teil.zeichnung_url && !jetzt.pdf) {
        neu.pdf = teil.zeichnung_url;
        uebernommen.push("Zeichnung");
        setPdfStand("Zeichnung aus den Stammdaten übernommen");
      }
      if (!jetzt.matBez && teil.material) {
        neu.matBez = teil.material;
        uebernommen.push("Material");
      }
      // Die Farbe aus der Zuteilung, falls dort genau dieses Material
      // steht und noch keine eigene gewählt wurde
      if (teil.material && jetzt.farbe === "blau") {
        const zuteilung = alt.FARBZUTEILUNG;
        const passend = alt.PLANFARBEN.find((fb) => {
          const z = zuteilung[fb.wert];
          return z && z.material && String(z.material).toLowerCase() === String(teil.material).toLowerCase();
        });
        if (passend) { neu.farbe = passend.wert; uebernommen.push("Farbe"); }
      }
      if (Object.keys(neu).length) setW((x) => ({ ...x, ...neu }));
      setHocoInfo([teil.bezeichnung, teil.material,
        teil.zeichnungs_nr ? "Zeichnung " + teil.zeichnungs_nr : ""].filter((x) => x).join(" · ")
        + (uebernommen.length ? "  ·  übernommen: " + uebernommen.join(", ") : ""));
    }, () => { /* dann eben ohne */ });
    return () => { gueltig = false; };
  }, [nrRuhig, auftrag]);

  const farbeWaehlen = (wert) => { farbeVonHand.current = true; setze("farbe", wert); };

  // Eigene Farben gibt es nicht mehr (111.37.0). Hat ein alter Auftrag
  // noch eine, schlägt das Fenster beim Bearbeiten die nächstliegende
  // Palettenfarbe vor; gespeichert wird sie erst mit "Speichern".
  const [vorschlag] = useState(() => (/^#/.test(w.farbe) && !nurLesen
    ? alt.naechstePlanfarbe(w.farbe, alt.farbenZurWahl()).wert : null));
  useEffect(() => { if (vorschlag) setze("farbe", vorschlag); }, []);

  // Neue Farbe: nur aus der Palette, gleich mit Material und Kürzel
  const [, farbenNeu] = useState(0);
  const neueFarbe = async () => {
    const frei = alt.PLANFARBEN.filter((f) => !alt.FARBZUTEILUNG[f.wert]);
    if (!frei.length) {
      alt.meldung("Alle Farben der Palette sind schon vergeben. In den Einstellungen unter Farben und Material umbenennen.", "warn");
      return;
    }
    const neu = await neueFarbeDialog(frei);
    if (!neu) return;
    const nr = alt.PLANFARBEN.findIndex((f) => f.wert === neu.farbe);
    const { error } = await alt.db.from("farb_material").upsert({
      farbe: neu.farbe, material: neu.material, buchstabe: neu.kuerzel || null, sortierung: nr });
    if (error) alt.meldung(alt.fehlertext(error), "fehler");
    else {
      await alt.farbzuteilungLaden();
      alt.meldung("Farbe " + alt.farbeVon(neu.farbe).name + " für " + neu.material + " angelegt.", "gut");
    }
    farbenNeu((x) => x + 1);
    farbeWaehlen(neu.farbe);
  };
  const planerUmschalten = (k) => setW((x) => ({ ...x,
    planer: x.planer.includes(k) ? x.planer.filter((p) => p !== k) : [...x.planer, k] }));

  // ----- Speichern -----
  const speichern = async () => {
    if (beschaeftigt) return;
    // Wer nicht planen darf, kann trotzdem den Zustand setzen
    if (!darf && auftrag) {
      zu();
      try {
        const r = await alt.zustandSetzen(auftrag, w.zustand);
        alt.meldung("Zustand geändert." + (r.hinweis ? " " + r.hinweis : ""));
        alt.planAktualisieren(b);
      } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
      return;
    }
    const daten = {
      planned_from: w.von || null,
      planned_days: Math.max(1, Math.round(Number(w.tage) || 1)),
      target_quantity: w.menge === "" ? null : Math.max(0, Math.round(Number(w.menge))),
      // Notiz und Materialhinweis stehen gemeinsam im selben Feld
      plan_note: alt.notizZusammen(w.notiz, w.matOrt || ""),
      drawing_url: w.pdf,
      wbg_url: w.wbg,
      plan_status: w.zustand,
      color: w.farbe,
      geplant_von: w.planer.length ? w.planer.join("/") : null,
      // FA gilt als erstellt, sobald eine FA Nr. dasteht, Material als
      // da, sobald eine Menge eingetragen ist
      fa_erstellt: !!w.faNr.trim(),
      material_ok: !!w.matMenge.trim(),
      material_bez: w.matBez.trim() || null,
      material_menge: w.matMenge.trim() || null,
      material_liefertermin: w.liefer || null,
      // Bei jedem Durchlauf eine andere — gehört an den Auftrag
      fa_nr: w.faNr.trim() || null,
      machine_id: w.maschine,
    };
    setBeschaeftigt(true);
    try { await auftragSpeichern({ auftrag, daten, nr: w.nr.trim(), b, zu }); }
    finally { setBeschaeftigt(false); }
  };

  const titelZeichnung = "Zeichnung " + ((auftrag && auftrag.job_number) || "");
  const freieFarbe = /^#/.test(w.farbe);
  const zuteilung = alt.FARBZUTEILUNG;
  const planerListe = alt.PLANER;
  const geaendertVon = auftrag && auftrag.geaendert_von ? alt.personVoll(auftrag.geaendert_von) : "";

  return (
    <div className="dialog dialog--auftrag">
      {/* ---------- Kopfzeile ---------- */}
      <div className="auf-kopf">
        <div className="auf-kopf__titel">
          {auftrag
            ? <>
                <h2>{auftrag.job_number}</h2>
                <span className="auf-kopf__unter">{auftrag.maschine || ""}
                  {auftrag.stand ? " · " + alt.zahlText(auftrag.stand) : ""}
                  {auftrag.target_quantity ? " / " + alt.zahlText(auftrag.target_quantity) : ""}</span>
                {geaendertVon && <span className="auf-kopf__unter">Zuletzt geändert von {geaendertVon}
                  {auftrag.geaendert_am ? " · " + alt.datumZeitKurz(auftrag.geaendert_am) : ""}</span>}
              </>
            : <>
                <h2>{v ? "Kopie anlegen" : "Auftrag einplanen"}</h2>
                {v && <span className="auf-kopf__unter">von {v.job_number} — Nummer, Maschine,
                  Stückzahl und Zeichnung neu setzen</span>}
              </>}
        </div>
        {auftrag && !extern && <div className="auf-kopf__knoepfe">
          <button type="button" className="knopf knopf--klein knopf--warnung" id="pl-problem-eigen"
            onClick={() => { zu(); alt.problemMelden(b, auftrag); }}>Problem</button>
        </div>}
      </div>

      {auftrag && auftrag.problem && <div className="problemkasten problemkasten--schmal">
        <span>⚠ {auftrag.problem}</span>
        <span className="klein">{auftrag.problem_von || ""}</span>
        {darf && <button type="button" className="knopf knopf--klein" id="pl-problemweg"
          onClick={() => { zu(); alt.problemQuittieren(auftrag, b); }}>Erledigt</button>}
      </div>}

      {nurLesen && auftrag && <p className="klein auf-nurlesen" id="pl-nurlesen">
        Nur zum Ansehen. {extern ? "" : "Ändern lässt sich hier der Zustand, und mit „Problem“ meldest du, was fehlt oder klemmt."}</p>}

      {/* ---------- Drei Spalten ---------- */}
      <div className="auf-raster">

        {/* Spalte 1: Auftrag und Zeit */}
        <div className="auf-spalte">
          {!auftrag && <>
            <label className="feld"><span>HOCO Nr.</span>
              <input id="pl-nr" type="text" autoCapitalize="characters" value={w.nr}
                onChange={(e) => setze("nr", e.target.value)} /></label>
            <p className="klein" id="pl-hoco-info">{hocoInfo}</p>
          </>}
          <label className="feld"><span>FA Nr.</span>
            <input id="pl-fa-nr" type="text" autoComplete="off" value={w.faNr} readOnly={!darf}
              onChange={(e) => setze("faNr", e.target.value)} /></label>
          <label className="feld"><span>Maschine</span>
            <select id="pl-maschine" disabled={!darf} value={w.maschine}
              onChange={(e) => setze("maschine", e.target.value)}>
              {maschinen.map((m) => <option key={m.id} value={m.id}>
                {m.name + (m.machine_number ? " (" + m.machine_number + ")" : "")}</option>)}
            </select></label>

          <div className="auf-dreier">
            <label className="feld"><span>Ab</span>
              <input id="pl-von" type="date" readOnly={nurLesen} value={w.von} onChange={(e) => vonAendern(e.target.value)} /></label>
            <label className="feld"><span>Tage</span>
              <input id="pl-tage" inputMode="decimal" readOnly={nurLesen} type="number" min="1" step="1" value={w.tage}
                onChange={(e) => tageAendern(e.target.value)} /></label>
            <label className="feld"><span>Bis</span>
              <input id="pl-bis" type="date" readOnly={nurLesen} value={w.bis} onChange={(e) => bisAendern(e.target.value)} /></label>
          </div>

          <label className="feld"><span>Fertigungsmenge</span>
            <input id="pl-menge" inputMode="decimal" readOnly={nurLesen} type="number" min="0" step="1" value={w.menge}
              onChange={(e) => setze("menge", e.target.value)} /></label>

          <label className="feld" id="pl-ortfeld"><span>Hinweis zum Material</span>
            <input type="text" id="pl-matort" maxLength={120} readOnly={!darf}
              placeholder="z. B. Regal 4 oben, Palette bei der Säge" value={w.matOrt}
              onChange={(e) => setze("matOrt", e.target.value)} /></label>

          <div className="feld"><span className="feldlabel">Eingeplant von</span>
            {!planerListe.length
              ? <span className="feldhinweis">Niemand ist als Planer hinterlegt. Das wird in den
                  Einstellungen bei der Person angehakt, zusammen mit einem Kürzel.</span>
              : <div className="auf-planer">
                  {planerListe.map((u) => {
                    const kuerzel = (u.initialen || "").trim();
                    return <button key={u.id || kuerzel} type="button" data-planer={kuerzel}
                      className={"planerknopf" + (w.planer.includes(kuerzel) ? " aktiv" : "")}
                      title={u.full_name || u.email} disabled={nurLesen} onClick={() => planerUmschalten(kuerzel)}>{kuerzel}</button>;
                  })}
                </div>}
          </div>
        </div>

        {/* Spalte 2: Material */}
        <div className="auf-spalte">
          <div className="auf-blocktitel">Material</div>
          {/* Alles in einem Feld, so wie es an der Stange steht */}
          <label className="feld"><span>Material</span>
            <input id="pl-mat-bez" type="text" readOnly={nurLesen} list="pl-matliste" autoComplete="off"
              placeholder="z. B. X10CrNiS18-9 rd 011 mm h8" value={w.matBez}
              onChange={(e) => setze("matBez", e.target.value)} />
            <span className="pl-werkstoff" id="pl-werkstoff">
              {!w.matBez.trim() ? null
                : !gruppe
                  ? <span className="gedaempft">Werkstoff nicht erkannt — in den Einstellungen unter
                      Farben und Material zuordnen</span>
                  : <><span className="ws-farbe" style={{ background: alt.farbeVon(gruppe.farbe).hex }} />
                      {alt.werkstoffText(gruppe) + (gruppe.spaene ? " · Späne " + gruppe.spaene : "")}</>}
            </span></label>
          <div className="auf-zweier">
            <label className="feld"><span>Menge vorhanden oder bestellt</span>
              <input id="pl-menge-mat" type="text" readOnly={nurLesen} value={w.matMenge}
                onChange={(e) => setze("matMenge", e.target.value)} /></label>
            <label className="feld"><span>Liefertermin</span>
              <input id="pl-liefer" type="text" readOnly={nurLesen} value={w.liefer}
                onChange={(e) => setze("liefer", e.target.value)} /></label>
          </div>
          <div className="feld"><span className="feldlabel">Farbe und Material</span>
            <div className="farbwahl">
              {alt.farbenZurWahl().map((f) => {
                const z = zuteilung[f.wert];
                return <button key={f.wert} type="button" data-plfarbe={f.wert}
                  className={"farbknopf" + (w.farbe === f.wert ? " aktiv" : "")}
                  style={{ background: f.hex, color: f.schrift }}
                  title={z ? z.material + " (" + f.name + ")" : f.name}
                  disabled={nurLesen} onClick={() => farbeWaehlen(f.wert)}>{z ? (z.buchstabe || "") : ""}</button>;
              })}
              {/* Ein alter Auftrag mit eigener Farbe: nur zum Ansehen */}
              {freieFarbe && <span className="farbknopf farbknopf--alt aktiv" title="Eigene Farbe (alt)"
                style={{ background: w.farbe }} />}
              {darf && <button type="button" id="pl-farbneu" className="farbknopf farbknopf--neu"
                title="Neue Farbe aus der Palette" aria-label="Neue Farbe" onClick={neueFarbe}>+</button>}
            </div>
            <span className="feldhinweis" id="pl-farbmaterial">
              {[zuteilung[w.farbe] ? zuteilung[w.farbe].material : "",
                vorschlag && w.farbe === vorschlag ? "eigene Farbe ersetzt durch " + alt.farbeVon(w.farbe).name
                  + ", gilt nach dem Speichern" : ""].filter((x) => x).join(" · ")}</span>
          </div>
          {/* Vorschau der Zeichnung füllt den freien Platz unter dem Material */}
          <div className="feld auf-zeichnung"><span className="feldlabel">Zeichnung</span>
            <Vorschau adresse={w.pdf || ""} titel={titelZeichnung} /></div>
        </div>

        {/* Spalte 3: Zustand, Notiz, Zeichnung */}
        <div className="auf-spalte">
          <div className="feld"><span className="feldlabel">Zustand</span>
            <div className="auf-zustand">
              {Object.keys(alt.PLANSTATUS).map((k) => (
                <button key={k} type="button" data-plstatus={k}
                  className={"wahlknopf" + (w.zustand === k ? " aktiv" : "")}
                  disabled={extern} onClick={() => setze("zustand", k)}>
                  {alt.PLANSTATUS[k].zeichen} {alt.PLANSTATUS[k].name}</button>
              ))}
            </div></div>

          <label className="feld feld--wachsend"><span>Notiz für die Maschine</span>
            <textarea id="pl-notiz" readOnly={!darf} value={w.notiz}
              onChange={(e) => setze("notiz", e.target.value)} /></label>

          <div className="feld"><span className="feldlabel">Zeichnung</span>
            <Anhang was="PDF" ordner="zeichnung" adresse={w.pdf} setzen={(x) => setze("pdf", x)}
              darf={darf} titel={titelZeichnung} id="pl-pdfreihe" wegId="pl-pdfweg"
              standId="pl-pdfstand" stand={pdfStand} setStand={setPdfStand} /></div>

          {/* Das Warenbegleitblatt liegt später den fertigen Teilen bei */}
          <div className="feld"><span className="feldlabel">WBG</span>
            <Anhang was="WBG" ordner="wbg" adresse={w.wbg} setzen={(x) => setze("wbg", x)}
              darf={darf} titel={"WBG " + ((auftrag && auftrag.job_number) || "")} wegId="pl-wbgweg"
              standId="pl-wbgstand" stand={wbgStand} setStand={setWbgStand} /></div>
        </div>
      </div>

      <div className="dialog__knoepfe">
        {auftrag && darf && <button className="knopf knopf--gefahr" id="pl-loeschen"
          onClick={() => auftragLoeschen(auftrag, b, zu)}>Löschen</button>}
        {/* Kopieren: der Auftrag kommt in die Zwischenablage, eingefügt
            wird mit einem Klick auf die Tafel */}
        {auftrag && darf && <button type="button" className="knopf" id="pl-kopieren-eigen"
          onClick={() => { zu(); alt.zwischenablageSetzen(auftrag, b); }}>Kopieren</button>}
        <button className="knopf knopf--still" id="pl-nein" onClick={zu}>Schliessen</button>
        {!extern && <button className="knopf knopf--haupt" id="pl-ja" disabled={beschaeftigt}
          onClick={speichern}>Speichern</button>}
      </div>
    </div>
  );
}
