// =================================================================
//  MATERIALRECHNER (Knopf oben auf der Planwand, neben den Symbolen)
//  Wunsch Patrick 16. Oktober 2026: von Stangen zu kg rechnen, für
//  Rund, Vierkant und Sechskant, Werkstoff wählbar; dazu eine HOCO Nr.
//  eingeben, die Zahl der Stück, und am Schluss stehen die kg. Die Form
//  bleibt auch mit HOCO Nr. wählbar, Standard ist Rund.
//
//  Gerechnet wird wie überall beim Material (daten/material.js):
//  Faktor (Dichte) je Kategorie, also Farbe, immer der höchste Wert
//  darin (seit 1.92.0), unter Einstellungen → Farben und Material änderbar; Querschnitt je Form, Stange 3 m.
//  Stück wie die Mindestmenge (bedarfRechnen): je Stück Länge +
//  Abstecher + 0,5 mm fürs Planieren, je Stange (Stange − Stumpen) /
//  das, ganze Stangen. kg oder Stangen → Stück oder Stück → kg, die
//  andere Einheit in Klammern, darunter nur „Stück pro Stange“ (Wunsch
//  Patrick 16. Oktober 2026). Nichts wird gespeichert. Externe bekommen
//  den Knopf nicht (Entscheid Patrick 16. Oktober 2026: „Externe nö“).
//  Seit 1.90.0 nur noch eine Richtung: Stück eingeben → wie viel man
//  bestellen muss, in kg und ganzen Stangen (Wunsch Patrick 17. Oktober
//  2026: „nur so, dass man Stückzahl eingeben kann, um zu wissen, wie
//  viel man bestellen muss“).
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { materialZerlegen, querschnittMm2, kategorienListe, werkstoffWahlVon, werkstoffGenau, dichtenLaden,
  STANGE_STANDARD_MM, STUMPEN_STANDARD_MM, PLANIEREN_STANDARD_MM } from "../daten/material.js";

const zahlLesen = (t) => { const n = Number(String(t ?? "").trim().replace(",", ".").replace(/'/g, "")); return String(t ?? "").trim() !== "" && isFinite(n) ? n : null; };
const zahlFeld = (n) => (n === null || n === undefined ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const zeigen = (n, stellen) => {
  const f = Math.pow(10, stellen || 0);
  const r = Math.round(n * f) / f;
  const [ganz, rest] = String(r).split(".");
  return (alt.zahlText ? alt.zahlText(Number(ganz)) : ganz) + (rest ? "," + rest : "");
};

const FORMEN = [["rd", "Rund"], ["4kt", "Vierkant"], ["6kt", "Sechskant"]];

// Kurze Gruppennamen, die die Werkstofferkennung allein nicht kennt
// (sie erwartet eine Bezeichnung wie beim Auftrag): „V2A“, „Stahl“ …
const GRUPPEN_WORTE = [[/\bv2a\b/, "kat:v2a"], [/\bv4a\b/, "kat:v4a"], [/chromstahl/, "kat:chrom"],
  [/neusilber/, "kat:neusilber"], [/messing|ecobrass/, "kat:messing"], [/\balu(minium)?\b/, "kat:alu"],
  [/titan/, "kat:titan"], [/kunststoff/, "kat:kunststoff"], [/\b(stahl|eisen|automatenstahl|etg)\b/, "kat:stahl"]];
function werkstoffAusText(t) {
  const w = werkstoffWahlVon(t);
  if (w) return w;
  const klein = t.toLowerCase();
  const g = GRUPPEN_WORTE.find(([re]) => re.test(klein));
  return g ? g[1] : "";
}
function dichteAus(wahlListe, wahl) {
  const e = wahlListe.find((x) => x.wert === wahl);
  return e ? e.dichte : null;
}

// HOCO Nr. → Material des jüngsten Auftrags, Länge des Fertigteils und
// was der Maschinentyp dieses Auftrags vorgibt
async function hocoLaden(nr) {
  const [teil, auftrag] = await Promise.all([
    alt.db.from("hoco_parts").select("hoco_nr, teil_laenge_mm, teil_mass_bestaetigt").eq("hoco_nr", nr).maybeSingle(),
    alt.db.from("jobs").select("material_bez, machine_id, planned_from").eq("job_number", nr)
      .not("material_bez", "is", null).order("planned_from", { ascending: false }).limit(1),
  ]);
  const t = teil && !teil.error ? teil.data : null;
  const j = auftrag && !auftrag.error && auftrag.data ? auftrag.data[0] : null;
  let typ = null;
  if (j && j.machine_id) {
    try {
      const [maschinen, typen] = await Promise.all([alt.ladeAlleMaschinen(), alt.ladeTypen()]);
      const m = maschinen.find((x) => x.id === j.machine_id);
      typ = m ? typen.find((x) => x.id === m.type_id) || null : null;
    } catch (f) { /* ohne Typ: Standardwerte */ }
  }
  return { gefunden: !!(t || j), teil: t, material: j ? j.material_bez : "", typ };
}

export function materialRechnerOeffnen() {
  if (document.querySelector(".dialog--matrechner")) return;
  alt.plan.imDialog = true;
  fensterOeffnen((zu) => (
    <div className="dialog dialog--matrechner">
      <h2>Material rechnen</h2>
      <MaterialRechner />
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" id="mr-zu" onClick={zu}>Schliessen</button>
      </div>
    </div>
  ), () => { alt.plan.imDialog = false; });
}

export default function MaterialRechner() {
  const [hoco, setHoco] = useState("");
  const [hocoInfo, setHocoInfo] = useState(null);
  const [form, setForm] = useState("rd");
  const [werkstoff, setWerkstoff] = useState("kat:v2a");
  // Material frei eintippen: Werkstoffnummer (1.4305), Kurzname
  // (X8CrNiS18-9), Gruppe (V2A, Messing) oder ganze Bezeichnung wie beim
  // Auftrag (X14CrMoS17 rd 024 mm h9); die App versteht, was sie kann,
  // und füllt Werkstoff, Form und Mass (Wunsch Patrick 19. Oktober 2026)
  const [matText, setMatText] = useState("");
  const [matErkannt, setMatErkannt] = useState(null);
  const [d, setD] = useState("");
  const [menge, setMenge] = useState("");
  // Eigene Dichten aus den Einstellungen holen, dann neu rechnen
  const [wahlListe, setWahlListe] = useState(kategorienListe);
  useEffect(() => { dichtenLaden(true).then(() => setWahlListe(kategorienListe())); }, []);
  const [laenge, setLaenge] = useState("");
  const [abstecher, setAbstecher] = useState("");
  const [stange, setStange] = useState(String(STANGE_STANDARD_MM));
  const [stumpen, setStumpen] = useState(String(STUMPEN_STANDARD_MM));

  // HOCO Nr. nach kurzer Pause nachschlagen und die Felder füllen; die
  // Form bleibt Rund, ausser das Material ist Vier- oder Sechskant
  useEffect(() => {
    const nr = hoco.trim();
    if (!nr) { setHocoInfo(null); return; }
    let weg = false;
    const zeit = setTimeout(async () => {
      setHocoInfo({ laedt: true });
      try {
        const h = await hocoLaden(nr);
        if (weg) return;
        setHocoInfo(h);
        if (!h.gefunden) return;
        if (h.material) setMatText(h.material);
        const z = materialZerlegen(h.material);
        if (z && z.d) setD(zahlFeld(z.d));
        setForm(z && (z.form === "4kt" || z.form === "6kt") ? z.form : "rd");
        const w = werkstoffWahlVon(h.material);
        if (w) setWerkstoff(w);
        if (h.teil && Number(h.teil.teil_laenge_mm)) setLaenge(zahlFeld(Number(h.teil.teil_laenge_mm)));
        if (h.typ) {
          if (Number(h.typ.abstecher_mm)) setAbstecher(zahlFeld(Number(h.typ.abstecher_mm)));
          if (Number(h.typ.stangen_mm)) setStange(String(h.typ.stangen_mm));
          if (h.typ.stumpen_mm !== null && h.typ.stumpen_mm !== undefined) setStumpen(String(h.typ.stumpen_mm));
        }
      } catch (f) {
        if (!weg) setHocoInfo({ fehler: alt.fehlertext ? alt.fehlertext(f) : f.message });
      }
    }, 450);
    return () => { weg = true; clearTimeout(zeit); };
  }, [hoco]);

  // Eingetipptes Material verstehen, sobald man kurz aufhört zu tippen
  useEffect(() => {
    const t = matText.trim();
    if (!t) { setMatErkannt(null); return; }
    const zeit = setTimeout(() => {
      const w = werkstoffAusText(t);
      const genau = werkstoffGenau(t);
      // „sw 12“ (Schlüsselweite) ist Sechskant
      const z = materialZerlegen(t.replace(/\bsw\b\.?/i, "6kt"));
      if (w) setWerkstoff(w);
      if (z && z.d) {
        setD(zahlFeld(z.d));
        setForm(z.form === "4kt" || z.form === "6kt" ? z.form : "rd");
      }
      const k = w ? kategorienListe().find((x) => x.wert === w) : null;
      setMatErkannt({ k, genau, d: z && z.d ? z.d : null, form: z && z.d ? z.form : null });
    }, 350);
    return () => clearTimeout(zeit);
  }, [matText]);

  const dichte = dichteAus(wahlListe, werkstoff);
  const dm = zahlLesen(d);
  const kgm = dichte && dm > 0 ? querschnittMm2(form, dm) * dichte / 1000 : null;
  const stangeMm = zahlLesen(stange) || STANGE_STANDARD_MM;
  const kgStange = kgm ? kgm * stangeMm / 1000 : null;
  const n = zahlLesen(menge);
  const stangenText = (x) => zeigen(x, 2) + (x === 1 ? " Stange" : " Stangen");
  // „ca.“, solange die Länge aus der HOCO Nr. kommt und nicht bestätigt
  // ist (Wunsch Patrick 17. Oktober 2026); selbst eingetippt gilt sie
  const teilLaenge = hocoInfo && hocoInfo.teil ? Number(hocoInfo.teil.teil_laenge_mm) : 0;
  const ca = !!(teilLaenge && !hocoInfo.teil.teil_mass_bestaetigt && zahlLesen(laenge) === teilLaenge);

  // Stück je Stange wie die Mindestmenge: Länge + Abstecher + 0,5 mm
  const l = zahlLesen(laenge);
  const jeTeil = l > 0 ? l + (zahlLesen(abstecher) || 0) + PLANIEREN_STANDARD_MM : null;
  const stumpenMm = zahlLesen(stumpen) ?? STUMPEN_STANDARD_MM;
  const jeStange = jeTeil ? Math.floor((stangeMm - stumpenMm) / jeTeil) : null;

  let ergebnis = null;
  if (kgm && n !== null && n >= 0) {
    if (jeTeil && jeStange < 1) ergebnis = { fehler: "Das Stück ist länger als eine Stange." };
    else if (!jeTeil) ergebnis = { hinweis: "Länge Fertigteil eintragen." };
    else {
      // Ganze Stangen bestellen, darunter nur Stück pro Stange (Wunsch Patrick)
      const stangen = Math.ceil(n / jeStange);
      ergebnis = { gross: zeigen(stangen * kgStange, 1), einheit: "kg", klammer: stangenText(stangen), ca,
        zusatz: zeigen(jeStange) + " Stück pro Stange" };
    }
  }

  const masName = form === "rd" ? "Durchmesser" : "Schlüsselweite";
  return (
    <div className="mr">
      <label className="feld">
        <span>HOCO Nr. (wenn vorhanden)</span>
        <input type="text" id="mr-hoco" value={hoco} data-fokus autoComplete="off" placeholder="z.B. 10841-0009"
          onChange={(e) => setHoco(e.target.value)} />
      </label>
      {hocoInfo && <p className="hinweis mr-hoco-info" id="mr-hoco-info">
        {hocoInfo.laedt ? "Wird gesucht …"
          : hocoInfo.fehler ? hocoInfo.fehler
          : !hocoInfo.gefunden ? "Diese HOCO Nr. kenne ich nicht."
          : <>{hocoInfo.material || "Kein Material bei den Aufträgen"}
              {hocoInfo.teil && Number(hocoInfo.teil.teil_laenge_mm)
                ? " · Länge " + zeigen(Number(hocoInfo.teil.teil_laenge_mm), 2) + " mm" + (hocoInfo.teil.teil_mass_bestaetigt ? "" : " (nicht bestätigt)")
                : " · keine Länge hinterlegt"}</>}
      </p>}

      <label className="feld">
        <span>Material: Nummer oder Bezeichnung</span>
        <input type="text" id="mr-material" value={matText} autoComplete="off"
          placeholder="z.B. 1.4305, X8CrNiS18-9, Messing oder X14CrMoS17 rd 024"
          onChange={(e) => setMatText(e.target.value)} />
      </label>
      {matErkannt && <p className={"hinweis mr-erkannt" + (matErkannt.k ? "" : " mr-erkannt--nein")} id="mr-erkannt">
        {matErkannt.k
          ? "Erkannt: " + [matErkannt.genau ? [matErkannt.genau.nr, matErkannt.genau.name].filter(Boolean).join(" ") : "",
              matErkannt.k.name + " (Faktor " + zahlFeld(matErkannt.k.dichte) + ")",
              matErkannt.d ? (matErkannt.form === "4kt" ? "Vierkant " : matErkannt.form === "6kt" ? "Sechskant " : "Ø ") + zahlFeld(matErkannt.d) + " mm" : ""]
              .filter(Boolean).join(" · ")
          : "Werkstoff nicht erkannt, bitte unten wählen."}
      </p>}

      <div className="moduswahl mr-wahl">
        {FORMEN.map(([wert, text]) => (
          <button key={wert} type="button" className={"moduswahl__knopf" + (form === wert ? " aktiv" : "")}
            data-form={wert} onClick={() => setForm(wert)}>{text}</button>
        ))}
      </div>

      <div className="mr-reihe">
        <label className="feld">
          <span>Werkstoff</span>
          <select id="mr-werkstoff" value={werkstoff} onChange={(e) => setWerkstoff(e.target.value)}>
            {wahlListe.map((k) => <option key={k.wert} value={k.wert}>
              {k.name + " · " + zahlFeld(k.dichte) + " g/cm³"}</option>)}
          </select>
        </label>
        <label className="feld">
          <span>{masName} in mm</span>
          <input type="text" id="mr-d" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
        </label>
      </div>

      <div className="mr-reihe">
        <label className="feld">
          <span>Anzahl Stück</span>
          <input type="text" id="mr-menge" inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} />
        </label>
        <label className="feld">
          <span>Länge Fertigteil in mm</span>
          <input type="text" id="mr-laenge" inputMode="decimal" value={laenge} onChange={(e) => setLaenge(e.target.value)} />
        </label>
      </div>
      <div className="mr-reihe mr-reihe--drei">
        <label className="feld"><span>Abstecher mm</span>
          <input type="text" id="mr-abstecher" inputMode="decimal" value={abstecher} placeholder="0" onChange={(e) => setAbstecher(e.target.value)} /></label>
        <label className="feld"><span>Stange mm</span>
          <input type="text" id="mr-stange" inputMode="decimal" value={stange} onChange={(e) => setStange(e.target.value)} /></label>
        <label className="feld"><span>Reststück mm</span>
          <input type="text" id="mr-stumpen" inputMode="decimal" value={stumpen} onChange={(e) => setStumpen(e.target.value)} /></label>
      </div>

      <section className="karte karte--ergebnis mr-ergebnis" id="mr-ergebnis">
        <div className="ergebnis">
          <div className="ergebnis__titel">Bestellen</div>
          {/* Wert mit Einheit gross, die andere Einheit klein daneben
              (Wunsch Patrick 17. Oktober 2026: „kg ist das Entscheidende“) */}
          <div className="ergebnis__wert mr-wert">{ergebnis && ergebnis.gross
            ? <>{ergebnis.ca && <span className="mr-ca" title="Länge des Fertigteils noch nicht bestätigt">ca.</span>}{ergebnis.gross + " " + ergebnis.einheit}
                {ergebnis.klammer && <span className="mr-klammer">{"(" + ergebnis.klammer + ")"}</span>}</>
            : "–"}</div>
        </div>
        {ergebnis && ergebnis.zusatz && <p className="hinweis mr-zusatz">{(ergebnis.ca ? "ca. " : "") + ergebnis.zusatz}</p>}
        {ergebnis && ergebnis.fehler && <p className="hinweis">{ergebnis.fehler}</p>}
        {ergebnis && ergebnis.hinweis && <p className="hinweis">{ergebnis.hinweis}</p>}
        {!kgm && <p className="hinweis">{"Werkstoff und " + masName + " eintragen."}</p>}
      </section>
    </div>
  );
}
