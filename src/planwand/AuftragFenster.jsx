// =================================================================
//  AUFTRAGSFENSTER
//  Einplanen, ändern, kopieren: ein Fenster in zwei Bereichen
//  (Anordnung Wunsch Patrick 6. Oktober 2026, vorher ragte unten
//  einiges aus dem Fenster):
//    links  Zustand als Auswahlfeld, FA Nr., Menge, darunter die
//           Abrufinformation, Maschine, Siegel (wer eingeplant hat),
//           Ab/Tage/Bis, Material, Farbe und unten die Notiz
//    rechts die Zeichnung quer (Zeichnungen sind fast immer quer),
//           darunter Zeichnung, Einrichtblatt und WBG nebeneinander
//  Keine Häkchen „FA erstellt“ oder „Material da“: Das ergibt sich
//  aus FA Nr. und Materialmenge.
//
//  Aufruf wie bisher: planAuftragDialog(auftrag, b, maschine, datum,
//  vorlage). Ohne auftrag ist es ein neuer Auftrag, mit vorlage eine
//  Kopie (alles übernommen ausser Nummer, Maschine, Stückzahl und
//  Zeichnung; Beginn dort, wo die Maschine wieder frei ist).
//  Mit leer (Plus-Knopf der Planwand, Wunsch Patrick 8. Oktober 2026)
//  ist alles leer, auch Maschine und Datum: Die HOCO Nr. holt
//  Maschine, Material, Zeichnung und Dauer aus Stammdaten und letztem
//  Auftrag; ohne Ab kommt der Auftrag ans Ende der Maschine.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useVerzoegert } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { auftragSpeichern, auftragLoeschen } from "./auftragSpeichern.js";
import { materialBestellungLesen, materialAusNotizEntfernen } from "../daten/materialBestellung.js";
import { dokZeigen } from "../teile/DokAbruf.jsx";
import { PfadKopieren } from "../daten/zeichnungPfad.jsx";

export function planAuftragDialog(auftrag, b, vorgabeMaschine, vorgabeDatum, vorlage, leer) {
  alt.plan.imDialog = true;
  fensterOeffnen((zu) => (
    <AuftragFenster auftrag={auftrag || null} b={b} vorgabeMaschine={vorgabeMaschine}
      vorgabeDatum={vorgabeDatum} vorlage={vorlage || null} leer={!auftrag && !vorlage && !!leer} zu={zu} />
  ), () => { alt.plan.imDialog = false; });
}

const istBild = (adresse) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(adresse);

// Was beim Öffnen in den Feldern steht
function anfangswerte(auftrag, v, vorgabeMaschine, vorgabeDatum, leer) {
  const maschinen = alt.prod.maschinen || [];
  const quelle = auftrag || v || {};
  const leerOder = (x) => (x === null || x === undefined ? "" : x);
  const maschine = auftrag ? auftrag.machine_id
    : leer ? ""
    : (vorgabeMaschine || (maschinen[0] ? maschinen[0].id : ""));
  // Ein neuer Auftrag beginnt dort, wo die Maschine wieder frei ist —
  // nicht heute. Sonst liegt die Kopie sofort auf einem anderen Auftrag.
  const von = auftrag ? (auftrag.planned_from || "")
    : leer ? ""
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

  // Steht in der Notiz eine Material-Bestellung („Mat BE: Metalix
  // 2025007893 500kg 24.09.26“), füllt sie leere Felder gleich aus.
  // So kommen auch Aufträge aus infoBoard zu Menge und Termin.
  const be = materialBestellungLesen(quelle.plan_note);
  const matMenge = quelle.material_menge || (be && be.mengeText) || "";
  const liefer = quelle.material_liefertermin || (be && be.termin) || "";

  return {
    nr: v ? (v.job_number || "") : "",
    faNr: auftrag ? (auftrag.fa_nr || "") : "",
    // Gehört nur zu diesem Auftrag: keine Stammdaten, nicht in die Kopie
    abruf: auftrag ? (auftrag.abruf_info || "") : "",
    maschine: maschine || "",
    von,
    tage: String(tage),
    bis: auftrag && auftrag.planned_from ? alt.letzterArbeitstag(auftrag.planned_from, tage) : "",
    menge: String(leerOder(auftrag ? auftrag.target_quantity : (v ? v.target_quantity : ""))),
    matOrt: alt.materialPlatz(quelle),
    planer,
    matBez: quelle.material_bez || "",
    matMenge,
    liefer,
    ausNotiz: be && ((!quelle.material_menge && be.mengeText) || (!quelle.material_liefertermin && be.termin))
      ? be : null,
    farbe: (auftrag && auftrag.color) || (v && v.color) || "blau",
    zustand: (auftrag && auftrag.plan_status) || "geplant",
    // Die Zeile "Material: …" steht im eigenen Feld Materialplatz. Stand
    // sie auch hier, kam sie beim Speichern ein zweites Mal dazu. Was
    // aus der Bestellung in Menge und Liefertermin steht, fällt weg.
    notiz: materialAusNotizEntfernen(alt.notizTrennen(quelle.plan_note || "").notiz, matMenge, liefer),
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
        : <iframe src={adresse + "#navpanes=0&view=Fit"} title="Zeichnung" loading="lazy" />}
      <button type="button" className="auf-vorschau__gross" title="Gross ansehen"
        onClick={() => alt.betrachter(adresse, titel, !bild)}>⤢</button>
    </div>
  );
}

// Ein PDF-Anhang: ansehen, entfernen oder wählen und hochladen
// „abruf“ (gespeicherter Auftrag): Ansehen lässt den Pool-Rechner im
// Ordner nach Neuerem schauen und geht auch ohne Datei (dokZeigen)
function Anhang({ was, ordner, adresse, setzen, darf, titel, id, wegId, standId, stand, setStand, abruf }) {
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
        {(adresse || abruf) && <button type="button" className="knopf knopf--klein pdflink" data-pdfzeigen={adresse || ""}
          onClick={() => (abruf ? dokZeigen({ ...abruf, titel, adresse, neu: setzen })
            : alt.betrachter(adresse, titel, true))}>Ansehen</button>}
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

// Der letzte Auftrag dieser HOCO Nr.: welche Maschine, wie lange, welches
// Material. Ohne frühere Aufträge eine Maschine des Typs, auf dem die
// Nummer schon gerüstet wurde (hoco_type_data).
async function letzterAuftrag(nr) {
  const maschinen = alt.prod.maschinen || [];
  const bekannt = (id) => maschinen.some((m) => m.id === id);
  try {
    const r = await alt.db.from("jobs").select("machine_id, planned_days, material_bez, planned_from")
      .eq("job_number", nr).order("planned_from", { ascending: false, nullsFirst: false }).limit(5);
    const liste = r.data || [];
    const j = liste.find((x) => bekannt(x.machine_id)) || liste[0];
    let maschine = j && bekannt(j.machine_id) ? j.machine_id : "";
    if (!maschine) {
      const t = await alt.db.from("hoco_type_data").select("type_id").eq("hoco_nr", nr).limit(5);
      const typen = (t.data || []).map((x) => x.type_id);
      const m = maschinen.find((x) => typen.includes(x.type_id));
      if (m) maschine = m.id;
    }
    if (!j && !maschine) return null;
    return { maschine, tage: j ? Number(j.planned_days) || 0 : 0, material: j ? j.material_bez : null };
  } catch (f) { return null; }
}

function AuftragFenster({ auftrag, b, vorgabeMaschine, vorgabeDatum, vorlage: v, leer, zu }) {
  const darf = alt.darfPlanen();
  // Ohne Planungsrecht ist das Fenster zum Nachschauen da: ändern lässt
  // sich nur, was auch vorher schon ging, also Zustand und Problem melden
  const nurLesen = !darf;
  // Den Materialplatz ändern nur Admins und wer das Häkchen „Materialplatz
  // bearbeiten“ hat, auch ohne Planungsrecht; alle anderen sehen ihn nur
  // (Wunsch Patrick, 9. Oktober 2026)
  const darfPlatz = alt.darfMaterialplatz();
  const extern = alt.istExtern();
  const maschinen = alt.prod.maschinen || [];
  const [w, setW] = useState(() => anfangswerte(auftrag, v, vorgabeMaschine, vorgabeDatum, leer));
  const setze = (feld, wert) => setW((x) => ({ ...x, [feld]: wert }));
  const aktuell = useRef(w);
  aktuell.current = w;
  const farbeVonHand = useRef(false);
  const tageVonHand = useRef(false);
  const [hocoInfo, setHocoInfo] = useState("");
  const [pdfStand, setPdfStand] = useState("");
  const [wbgStand, setWbgStand] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  // Abrufinformation: Pflicht für Neue und alles ab 8. Oktober 2026
  // (Wunsch Patrick). Ohne das SQL gibt es die Spalte noch nicht.
  const abrufDa = alt.abrufSpalte(auftrag);
  const abrufMuss = darf && abrufDa && alt.abrufPflicht(auftrag);
  const [abrufFehlt, setAbrufFehlt] = useState(false);
  const abrufFeld = useRef(null);

  // ----- Zeichnung der HOCO Nr. -----
  // Hängt am Auftrag noch keine Zeichnung, die HOCO Nr. hat aber eine,
  // wird sie beim Öffnen gleich angeheftet (Wunsch Patrick 5. Oktober
  // 2026): nicht nur anzeigen, sondern wirklich am Auftrag speichern.
  useEffect(() => {
    if (!auftrag || auftrag.drawing_url || !auftrag.job_number) return;
    let gueltig = true;
    alt.zeichnungAnheften(auftrag).then((adresse) => {
      if (!gueltig || !adresse || aktuell.current.pdf) return;
      setze("pdf", adresse);
      setPdfStand("Zeichnung von der HOCO Nr. angeheftet");
    }, () => { /* dann eben ohne */ });
    return () => { gueltig = false; };
  }, [auftrag]);

  // ----- Notiz: eine neue Material-Bestellung füllt Menge und Termin -----
  // Nur wenn sich die erkannte Bestellung ändert, sonst bliebe nichts
  // von Hand Geändertes stehen, sobald man in der Notiz weitertippt.
  const notizAendern = (neu) => setW((x) => {
    const r = materialBestellungLesen(neu);
    const vorher = materialBestellungLesen(x.notiz);
    const schluessel = (k) => (k ? k.mengeText + "|" + k.termin : "");
    if (!r || schluessel(r) === schluessel(vorher)) return { ...x, notiz: neu };
    return { ...x, notiz: neu,
      matMenge: r.mengeText || x.matMenge,
      liefer: r.termin || x.liefer,
      ausNotiz: r };
  });

  // ----- Von, Bis und Dauer im Gleichklang -----
  const vonAendern = (von) => setW((x) => ({ ...x, von,
    bis: von ? alt.letzterArbeitstag(von, Math.max(1, Number(x.tage) || 1)) : x.bis }));
  const tageAendern = (tage) => { tageVonHand.current = true; tageSetzen(tage); };
  const tageSetzen = (tage) => setW((x) => ({ ...x, tage,
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
    Promise.all([alt.ladeHocoEins(nr), letzterAuftrag(nr)]).then(([teil, vorher]) => {
      if (!gueltig) return;
      const jetzt = aktuell.current;
      const neu = {};
      const uebernommen = [];
      // Maschine und Dauer vom letzten Auftrag dieser Nummer, sonst eine
      // Maschine des Typs, auf dem sie schon lief. Die Maschine nur, wenn
      // noch keine gewählt ist (Plus-Knopf), sonst gilt der Klick auf die Zeile.
      if (vorher && !jetzt.maschine && vorher.maschine) {
        neu.maschine = vorher.maschine; uebernommen.push("Maschine");
      }
      if (vorher && vorher.tage && !tageVonHand.current && jetzt.tage === "1" && vorher.tage > 1) {
        tageSetzen(String(vorher.tage)); uebernommen.push("Dauer");
      }
      // Die Farbe kommt wie immer aus dem Werkstoff des Materials
      if (!jetzt.matBez && !(teil && teil.material) && vorher && vorher.material) {
        neu.matBez = vorher.material; uebernommen.push("Material");
      }
      if (!teil) {
        if (Object.keys(neu).length) setW((x) => ({ ...x, ...neu }));
        setHocoInfo((uebernommen.length ? "Vom letzten Auftrag übernommen: " + uebernommen.join(", ") + ". " : "")
          + "Zu dieser Nummer sind noch keine Stammdaten hinterlegt. "
          + "Anlegen geht unter Produktion → HOCO Nr.");
        return;
      }
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
      setHocoInfo((teil.material || "")
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

  // Neue Farben gibt es nur noch in den Einstellungen unter Farben und
  // Material (Wunsch Patrick 8. Oktober 2026), nicht mehr hier mit „+“.
  // Symbole kommen nicht über dieses Fenster, sondern über den Smiley
  // auf der Planwand direkt an den Balken.
  const planerUmschalten = (k) => setW((x) => ({ ...x,
    planer: x.planer.includes(k) ? x.planer.filter((p) => p !== k) : [...x.planer, k] }));

  // ----- Speichern -----
  const speichern = async () => {
    if (beschaeftigt) return;
    // Wer nicht planen darf, kann trotzdem den Zustand setzen
    if (!darf && auftrag) {
      zu();
      try {
        const platzNeu = (w.matOrt || "").trim();
        if (darfPlatz && platzNeu !== alt.materialPlatz(auftrag).trim()) {
          await alt.aendernOhneUnbekannte("jobs", alt.materialPlatzSpalte()
            ? { material_platz: platzNeu || null }
            : { plan_note: alt.notizZusammen(alt.notizTrennen(auftrag.plan_note).notiz, platzNeu) },
            "id", auftrag.id);
        }
        const r = await alt.zustandSetzen(auftrag, w.zustand);
        alt.meldung("Zustand geändert." + (r.hinweis ? " " + r.hinweis : ""));
        alt.planAktualisieren(b);
      } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
      return;
    }
    if (abrufMuss && !w.abruf.trim()) {
      setAbrufFehlt(true);
      alt.meldung("Bitte die Abrufinformation eintragen, sonst lässt sich der Auftrag nicht speichern.", "warn");
      if (abrufFeld.current) abrufFeld.current.focus();
      return;
    }
    if (!w.maschine) { alt.meldung("Bitte eine Maschine wählen.", "warn"); return; }
    // Mit eigener Spalte steht der Materialplatz nicht mehr in der Notiz
    const platzSpalte = alt.materialPlatzSpalte();
    // Ohne Recht bleibt der Materialplatz, wie er war
    const platzWert = darfPlatz ? (w.matOrt || "") : (auftrag ? alt.materialPlatz(auftrag) : "");
    const daten = {
      planned_from: w.von || null,
      planned_days: Math.max(1, Math.round(Number(w.tage) || 1)),
      target_quantity: w.menge === "" ? null : Math.max(0, Math.round(Number(w.menge))),
      // Eine eben eingetippte Bestellung steht nach dem Speichern nur
      // noch in Menge und Liefertermin, nicht doppelt in der Notiz
      plan_note: alt.notizZusammen(materialAusNotizEntfernen(w.notiz, w.matMenge, w.liefer),
        platzSpalte ? "" : platzWert),
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
    if (abrufDa) daten.abruf_info = w.abruf.trim() || null;
    if (platzSpalte && darfPlatz) daten.material_platz = platzWert.trim() || null;
    setBeschaeftigt(true);
    try { await auftragSpeichern({ auftrag, daten, nr: w.nr.trim(), b, zu }); }
    finally { setBeschaeftigt(false); }
  };

  const titelZeichnung = "Zeichnung " + ((auftrag && auftrag.job_number) || "");
  const freieFarbe = /^#/.test(w.farbe);
  const zuteilung = alt.FARBZUTEILUNG;
  const planerListe = alt.PLANER;
  // Kürzel, die am Auftrag stehen oder einem selbst gehören, aber nicht
  // in der Planerliste sind: trotzdem als Knopf zeigen
  const planerExtra = w.planer.filter((k) =>
    !planerListe.some((u) => (u.initialen || "").trim() === k));
  const geaendertVon = auftrag && auftrag.geaendert_von ? alt.personVoll(auftrag.geaendert_von) : "";

  return (
    <div className="dialog dialog--auftrag">
      {/* ---------- Kopfzeile ---------- */}
      <div className="auf-kopf">
        <div className="auf-kopf__titel">
          {auftrag
            ? <>
                <div className="auf-kopf__nr"><h2>{auftrag.job_number}</h2>
                  {w.planer.length > 0 && <span className="siegel-reihe" id="pl-siegel">
                    {w.planer.map((k) => <span key={k} className="siegel"
                      title={"Eingeplant von " + (alt.siegelName(k) || k)}>{k}</span>)}</span>}</div>
                <span className="auf-kopf__unter">{auftrag.maschine || ""}
                  {auftrag.stand ? " · " + alt.zahlText(auftrag.stand) : ""}
                  {auftrag.target_quantity ? " / " + alt.zahlText(auftrag.target_quantity) : ""}</span>
                {geaendertVon && <span className="auf-kopf__unter">Zuletzt geändert von {geaendertVon}
                  {auftrag.geaendert_am ? " · " + alt.datumZeitKurz(auftrag.geaendert_am) : ""}</span>}
              </>
            : <>
                <h2>{v ? "Kopie anlegen" : leer ? "Neuer Auftrag" : "Auftrag einplanen"}</h2>
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

      {/* ---------- Zwei Bereiche ----------
          Links alles zum Auftrag und Material, unten die Notiz.
          Rechts die Zeichnung quer, darunter die Dokumente
          (Wunsch Patrick 6. Oktober 2026). */}
      <div className="auf-raster">

        {/* Links: Auftrag, Material, Notiz */}
        <div className="auf-spalte auf-spalte--links">
          {!auftrag && <>
            <label className="feld"><span>HOCO Nr.</span>
              <input id="pl-nr" type="text" autoCapitalize="characters" value={w.nr}
                onChange={(e) => setze("nr", e.target.value)} /></label>
            <p className="klein" id="pl-hoco-info">{hocoInfo}</p>
          </>}
          {/* Zustand als ein Auswahlfeld statt fünf Knöpfe: braucht
              eine Zeile statt drei. Auch ohne Planrecht wählbar. */}
          <div className="auf-dreier auf-dreier--gleich">
            <label className="feld"><span>Zustand</span>
              <select id="pl-zustand" className={"auf-zustandwahl auf-zustandwahl--" + w.zustand}
                disabled={extern} value={w.zustand} onChange={(e) => setze("zustand", e.target.value)}>
                {Object.keys(alt.PLANSTATUS).map((k) => (
                  <option key={k} value={k} data-plstatus={k}>
                    {alt.PLANSTATUS[k].zeichen} {alt.PLANSTATUS[k].name}</option>
                ))}
              </select></label>
            <label className="feld"><span>FA Nr.</span>
              <input id="pl-fa-nr" type="text" autoComplete="off" value={w.faNr} readOnly={!darf}
                onChange={(e) => setze("faNr", e.target.value)} /></label>
            <label className="feld"><span>Fertigungsmenge</span>
              <input id="pl-menge" inputMode="decimal" readOnly={nurLesen} type="number" min="0" step="1" value={w.menge}
                onChange={(e) => setze("menge", e.target.value)} /></label>
          </div>
          {/* Gleich darunter die Abrufinformation, daneben das Siegel.
              Damit das Fenster auf dem Laptop ohne Rollen Platz hat,
              steht die Maschine dafür in der Zeile mit Ab, Tage und Bis. */}
          <div className="auf-zweier auf-zweier--abruf">
            {/* Freier Text, keine Regel: „je 1000 Stk KW 44, 45, 46“ */}
            <label className="feld auf-abruf"><span>Abrufinformation{abrufMuss ? " *" : ""}</span>
              <input id="pl-abruf" ref={abrufFeld} type="text" autoComplete="off" readOnly={nurLesen}
                className={abrufFehlt && !w.abruf.trim() ? "fehlt" : ""}
                title={darf && !abrufDa ? "Wird erst gespeichert, wenn sql/abruf-siegel.sql in Supabase ausgeführt ist." : undefined}
                placeholder={darf && !abrufDa ? "erst nach sql/abruf-siegel.sql" : "z. B. je 1'000 Stk KW 44, 45, 46"}
                value={w.abruf} onChange={(e) => setze("abruf", e.target.value)} />
              {abrufFehlt && !w.abruf.trim() && <span className="feldhinweis feldhinweis--fehlt" id="pl-abruf-fehlt">
                Ohne Abrufinformation lässt sich der Auftrag nicht speichern.</span>}</label>

            <div className="feld"><span className="feldlabel">Siegel</span>
              {!planerListe.length && !planerExtra.length
                ? <span className="feldhinweis">Niemand ist als Planer hinterlegt. Das wird in den
                    Einstellungen bei der Person angehakt, zusammen mit einem Kürzel.</span>
                : <div className="auf-planer">
                    {planerListe.map((u) => {
                      const kuerzel = (u.initialen || "").trim();
                      return <button key={u.id || kuerzel} type="button" data-planer={kuerzel}
                        className={"planerknopf" + (w.planer.includes(kuerzel) ? " aktiv" : "")}
                        title={u.full_name || u.email} disabled={nurLesen} onClick={() => planerUmschalten(kuerzel)}>{kuerzel}</button>;
                    })}
                    {planerExtra.map((k) => <button key={"x" + k} type="button" data-planer={k}
                      className="planerknopf aktiv" title={alt.siegelName(k) || k} disabled={nurLesen}
                      onClick={() => planerUmschalten(k)}>{k}</button>)}
                  </div>}
            </div>
          </div>
          <div className="auf-vierer">
            <label className="feld"><span>Maschine</span>
              <select id="pl-maschine" disabled={!darf} value={w.maschine}
                onChange={(e) => setze("maschine", e.target.value)}>
                {!w.maschine && <option value="">Maschine wählen</option>}
                {maschinen.map((m) => <option key={m.id} value={m.id}>
                  {m.name + (m.machine_number ? " (" + m.machine_number + ")" : "")}</option>)}
              </select></label>
            <label className="feld"><span>Ab</span>
              <input id="pl-von" type="date" readOnly={nurLesen} value={w.von} onChange={(e) => vonAendern(e.target.value)} /></label>
            <label className="feld"><span>Tage</span>
              <input id="pl-tage" inputMode="decimal" readOnly={nurLesen} type="number" min="1" step="1" value={w.tage}
                onChange={(e) => tageAendern(e.target.value)} /></label>
            <label className="feld"><span>Bis</span>
              <input id="pl-bis" type="date" readOnly={nurLesen} value={w.bis} onChange={(e) => bisAendern(e.target.value)} /></label>
          </div>
          {!auftrag && !w.von && <span className="feldhinweis" id="pl-ans-ende">
            Ohne Datum kommt der Auftrag ans Ende der Maschine.</span>}

          <div className="auf-trenner" />
          <div className="auf-zweier">
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
                        {gruppe.name}</>}
              </span></label>
            {/* Eigenes Feld, unabhängig von Notiz und Bestellung */}
            <label className="feld" id="pl-ortfeld"><span>Materialplatz</span>
              <input type="text" id="pl-matort" maxLength={120} readOnly={!darfPlatz}
                placeholder="z. B. Regal 4 oben, Palette bei der Säge" value={w.matOrt}
                onChange={(e) => setze("matOrt", e.target.value)} /></label>
          </div>
          <div className="auf-zweier auf-zweier--menge">
            <label className="feld"><span>Menge vorhanden oder bestellt</span>
              <input id="pl-menge-mat" type="text" readOnly={nurLesen} value={w.matMenge}
                onChange={(e) => setze("matMenge", e.target.value)} /></label>
            <label className="feld"><span>Liefertermin</span>
              <input id="pl-liefer" type="text" readOnly={nurLesen} value={w.liefer}
                onChange={(e) => setze("liefer", e.target.value)} /></label>
          </div>
          {w.ausNotiz && <span className="feldhinweis auf-ausnotiz" id="pl-ausnotiz">
            Aus der Notiz übernommen: {[w.ausNotiz.lieferant, w.ausNotiz.nr].filter(Boolean).join(" ")}
            {darf ? " · wird beim Speichern eingetragen" : ""}</span>}
          <div className="feld"><span className="feldlabel">Farbe und Material
            {/* Das Material zur Farbe steht gleich daneben, spart eine Zeile */}
            <span className="auf-farbname" id="pl-farbmaterial">
              {[zuteilung[w.farbe] ? zuteilung[w.farbe].material : "",
                vorschlag && w.farbe === vorschlag ? "eigene Farbe ersetzt durch " + alt.farbeVon(w.farbe).name
                  + ", gilt nach dem Speichern" : ""].filter((x) => x).join(" · ")}</span></span>
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
            </div>
          </div>


          {/* Die Notiz füllt, was in der linken Spalte noch frei ist */}
          <label className="feld feld--wachsend auf-notiz"><span>Notiz für die Maschine</span>
            <textarea id="pl-notiz" readOnly={!darf} value={w.notiz}
              onChange={(e) => notizAendern(e.target.value)} /></label>
        </div>

        {/* Rechts: Zeichnung quer, darunter die Dokumente */}
        <div className="auf-spalte auf-spalte--zeichnung">
          <div className="feld auf-zeichnung">
            <Vorschau adresse={w.pdf || ""} titel={titelZeichnung} /></div>
          {/* Dokumente direkt unter der Zeichnung, nebeneinander */}
          <div className="auf-dokumente">
            <div className="auf-dok"><span className="feldlabel">Zeichnung <PfadKopieren adresse={w.pdf} /></span>
              <div className="auf-dok__knoepfe">
                <Anhang was="PDF" ordner="zeichnung" adresse={w.pdf} setzen={(x) => setze("pdf", x)}
                  abruf={auftrag && auftrag.job_number ? { art: "zeichnung", hoco: auftrag.job_number } : null}
                  darf={darf} titel={titelZeichnung} id="pl-pdfreihe" wegId="pl-pdfweg"
                  standId="pl-pdfstand" stand={pdfStand} setStand={setPdfStand} /></div></div>

            {/* Das Einrichtblatt hängt an HOCO Nr. und Maschinentyp: es gilt
                das der gewählten Maschine, wie im Pad Mode */}
            {auftrag && auftrag.job_number && <div className="auf-dok"><span className="feldlabel">Einrichtblatt</span>
              <div className="auf-dok__knoepfe">
                <div className="pdfreihe" id="pl-blattreihe">
                  <button type="button" className="knopf knopf--klein pdflink"
                    title="Einrichtblatt für den Typ der gewählten Maschine" onClick={() => {
                    const m = maschinen.find((x) => x.id === w.maschine);
                    alt.einrichtblattPdfOeffnen(auftrag.job_number, m && m.type_id, auftrag.job_number);
                  }}>Ansehen</button></div>
                <span className="feldhinweis">für den Typ der gewählten Maschine</span></div></div>}

            {/* Das Warenbegleitblatt liegt später den fertigen Teilen bei */}
            <div className="auf-dok"><span className="feldlabel">WBG</span>
              <div className="auf-dok__knoepfe">
                <Anhang was="WBG" ordner="wbg" adresse={w.wbg} setzen={(x) => setze("wbg", x)}
                  abruf={auftrag && auftrag.job_number ? { art: "wbg", hoco: auftrag.job_number,
                    auftragId: auftrag.id, fa: auftrag.fa_nr } : null}
                  darf={darf} titel={"WBG " + ((auftrag && auftrag.job_number) || "")} wegId="pl-wbgweg"
                  standId="pl-wbgstand" stand={wbgStand} setStand={setWbgStand} /></div></div>
          </div>
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
