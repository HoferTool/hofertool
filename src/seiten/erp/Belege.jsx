// Test ERP: Belege. Aufträge (Einzel und Rahmen mit Lieferplan), daraus
// Fertigungsaufträge, Lieferscheine und Proforma; Bestellungen mit
// Wareneingang; Rechnungen aus Lieferscheinen, Gutschriften, Fibu-Export
// und Rückverfolgung über die Chargen.
// Warum alles über Bewegungen: Bestand, Liefermengen und Herkunft rechnet
// die App aus erp_bewegungen. So gibt es keinen zweiten Stand, der
// auseinanderlaufen kann, und jede Charge lässt sich zurückverfolgen.
import { useState, useRef, useEffect } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { BESTELLARTEN } from "./formulare.js";
import { Feld, Tabelle, Suche, passt, tun, formular, belegDrucken, abDrucken, lsDrucken, reDrucken, beDrucken, LagerEingabe, lagerStart, lagerAus, ohneSuche, sucheLeer } from "./teile.jsx";
import {
  allesLaden, einfuegen, aendern, loeschen, naechsteBelegNr, BELEGTYP, MWST, zahl, chf, mengeText, artikelText,
  partnerText, datumText, terminText, bestand, buchen, gebucht, folgePositionen, belegSumme, chargeVerfolgen, fibuText,
  posPe, posBetrag, peKurz, peZahl, preisFuerMenge, PE_AUSWAHL, kwText, kwZuDatum, kwTag, lagerName, posIdx, artikelIdxText,
} from "../../daten/erp.js";
import { GFenster, KF, GTabelle, schliessenFragen } from "./Stamm.jsx";
import { partnerFensterOeffnen } from "./PartnerFenster.jsx";
import { artikelFensterOeffnen, AG_FORM } from "./ArtikelFenster.jsx";
import { cockpitOeffnen } from "./Cockpit.jsx";

const heute = () => new Date().toISOString().slice(0, 10);
const mitPreis = (typ) => typ !== "lieferschein" && typ !== "fertigung";
const lagerText = (d, id) => lagerName(d.lagerMap.get(id));

// ---------- Stand eines Belegs ----------
// Gerechnet aus den Folgebelegen und Bewegungen, nicht gespeichert
// Termin und KW einer Position ziehen einander nach (Wunsch Patrick 25. November
// 2026). Bei Kunden mit Termin als KW wird termin_kw gespeichert, sonst steht
// die KW nur zum Ansehen und Eintippen da (_kw, wird nicht gespeichert), damit
// Drucke dort weiter das Datum zeigen.
// Eine eingetippte KW setzt bei Aufträgen den Freitag, bei Bestellungen den Montag.
function terminNachziehen(n, name, w, kw, typ) {
  if (name === "termin") { if (kw) n.termin_kw = w ? kwText(w) : ""; else delete n._kw; }
  if (name === "termin_kw" || name === "_kw") { const t = kwZuDatum(w, new Date(), kwTag(typ)); if (t) n.termin = t; }
  return n;
}
// feld(props) zeichnet ein Feld; als Funktion, nicht als Komponente, sonst
// verlöre das Feld beim Tippen den Fokus
function terminFelder(p, kw, setzen, feld) {
  const kwWert = kw ? p.termin_kw : (p._kw ?? (p.termin ? kwText(p.termin) : ""));
  const kwFeld = feld({ key: "kw", name: kw ? "termin_kw" : "_kw", label: kw ? "Termin KW" : "KW", wert: kwWert || "", platzhalter: "48", setzen: (w) => setzen(kw ? "termin_kw" : "_kw", w) });
  const datum = feld({ key: "d", name: "termin", label: "Termin", typ: "datum", wert: p.termin, setzen: (w) => setzen("termin", w) });
  return kw ? [kwFeld, datum] : [datum, kwFeld];
}

export function belegStand(d, b) {
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id || zahl(p.menge));
  const anteil = (fn) => {
    const soll = pos.reduce((s, p) => s + zahl(p.menge), 0);
    const ist = pos.reduce((s, p) => s + Math.min(zahl(p.menge), fn(p)), 0);
    if (!soll || !ist) return 0;
    return ist >= soll - 1e-9 ? 2 : 1;
  };
  if (b.status === "storniert") return ["storniert", "erp-blass"];
  // Aus dem alten ERP übernommener Verlauf: erledigt, zählt nirgends als offen
  if (b.status === "abgeschlossen") return ["abgeschlossen", "erp-gut"];
  if (b.typ === "auftrag") {
    const a = anteil((p) => folgePositionen(d, p.id, "lieferschein").reduce((s, x) => s + zahl(x.menge), 0));
    return [["offen", "teilgeliefert", "geliefert"][a], a === 2 ? "erp-gut" : ""];
  }
  if (b.typ === "bestellung") {
    const a = anteil((p) => gebucht(d, p.id, "eingang"));
    return [["bestellt", "teilweise eingegangen", "eingegangen"][a], a === 2 ? "erp-gut" : ""];
  }
  if (b.typ === "fertigung") {
    const a = anteil((p) => gebucht(d, p.id, "fertig"));
    // Läuft oder rüstet der Auftrag auf der Planwand, ist der FA auch „in Arbeit“ (seit 1.911.1, Patrick:
    // „warum gibt es keine in Arbeit?“; vorher nur mit abgehaktem Arbeitsgang oder Buchung)
    const pw = ((b.daten || {}).planwand || {}).stand;
    const begonnen = pw === "laeuft" || pw === "ruesten" || d.bewegungen.some((x) => x.beleg_id === b.id) || ((b.daten || {}).ap || []).some((x) => x.erledigt_am);
    return [a === 2 ? "fertig" : a === 1 ? "teilweise fertig" : begonnen ? "in Arbeit" : "offen", a === 2 ? "erp-gut" : ""];
  }
  if (b.typ === "lieferschein") {
    const a = anteil((p) => folgePositionen(d, p.id, "rechnung").reduce((s, x) => s + zahl(x.menge), 0));
    return [["nicht verrechnet", "teilweise verrechnet", "verrechnet"][a], a === 2 ? "erp-gut" : ""];
  }
  if (b.typ === "rechnung" || b.typ === "gutschrift") {
    return (b.daten || {}).fibu_am ? ["in Fibu", "erp-gut"] : ["offen", ""];
  }
  return [b.status || "offen", ""];
}

// Stände eines Fertigungsauftrags (belegStand); die Wahl der Häkchen bleibt, solange die Seite offen ist
const FA_STAENDE = ["offen", "in Arbeit", "teilweise fertig", "fertig", "abgeschlossen", "storniert"];
let faStaende = FA_STAENDE.filter((w) => w !== "storniert");

// Zustand des Auftrags auf der Planwand mit demselben Zeichen wie auf dem Balken
// (○ Geplant, 🔧 Rüsten, ▶ Läuft, ✔ Fertig) und Maschine (seit 1.914.0, Wunsch Patrick
// 27. November 2026: „in der Liste der FAs den Status und auch das Symbol“)
export function planwandZelle(b) {
  const pw = (b.daten || {}).planwand;
  if (!pw || !pw.stand) return "";
  const z = (alt.PLANSTATUS || {})[pw.stand] || { name: pw.stand, zeichen: "" };
  const masch = pw.maschine || pw.maschine_nr;
  return <span className={"erp-pw erp-pw--" + pw.stand} data-erp-pw={pw.stand}>{z.zeichen} {z.name}{masch ? " · " + masch : ""}</span>;
}

// Art einer Bestellung (seit 1.913.0, Wunsch Patrick 27. November 2026: „in Bestellungen filtern nach
// Rohmaterial und ZA extern“): ZA extern = Zusatzarbeit extern (Fremdleistung), d. h. ein Hofer-Artikel
// geht zum Lieferanten, oder aus dem Gewatec als Fremdleistung übernommen
const BE_ARTEN = [["roh", "Rohmaterial"], ["za", "ZA extern"], ["andere", "Andere"]];
let beArten = BE_ARTEN.map(([w]) => w);
export function bestellArt(d, b) {
  const pos = d.posJe.get(b.id) || [];
  const arten = pos.map((p) => (d.artikelMap.get(p.artikel_id) || {}).art);
  if ((b.daten || {}).fremdleistung || arten.includes("hofer")) return "za";
  if (arten.includes("rohmaterial")) return "roh";
  return "andere";
}

// ---------- Liste je Belegart ----------
export function BelegListe({ d, neu, typ, ohneNeu, hinweis }) {
  const [suche, setSuche] = useState("");
  const [nurOffen, setNurOffen] = useState(false);
  // Fertigung zeigt gleich alle FAs, Häkchen je Stand wählen, was man sieht
  // (seit 1.909.0, Wunsch Patrick 27. November 2026: „nicht nur die Suchtreffer, sondern alle, mit Checkboxen“)
  const mitStand = typ === "fertigung";
  const [staende, setStaende] = useState(() => new Set(faStaende));
  const standUm = (w, an) => setStaende((v) => { const n = new Set(v); if (an) n.add(w); else n.delete(w); faStaende = [...n]; return n; });
  const mitArt = typ === "bestellung";
  const [arten, setArten] = useState(() => new Set(beArten));
  const artUm = (w, an) => setArten((v) => { const n = new Set(v); if (an) n.add(w); else n.delete(w); beArten = [...n]; return n; });
  const t = BELEGTYP[typ];
  // Bestellungen sind wenige: wie Fertigung gleich alle zeigen, gefiltert mit den Häkchen
  const warten = !mitStand && !mitArt && ohneSuche(suche) && !nurOffen;
  const liste = warten ? [] : d.belege.filter((b) => b.typ === typ).filter((b) => {
    const p = d.partnerMap.get(b.partner_id) || {};
    const pos = (d.posJe.get(b.id) || []).map((x) => artikelText(d.artikelMap.get(x.artikel_id)) + " " + (x.text || "")).join(" ");
    return passt(suche, [b.nr, p.nr, p.name, (b.daten || {}).ihre_nr, pos, datumText(b.datum)].join(" "));
  }).map((b) => ({ b, stand: belegStand(d, b) }))
    .filter((x) => !nurOffen || !/^(geliefert|eingegangen|fertig|verrechnet|in Fibu|storniert|abgeschlossen)$/.test(x.stand[0]))
    .filter((x) => !mitStand || staende.has(x.stand[0]))
    .filter((x) => !mitArt || arten.has(bestellArt(d, x.b)))
    // Neuste Nr. oben (Fertigung, Bestellungen)
    .sort((x, y) => (mitStand || mitArt ? String(y.b.nr).localeCompare(String(x.b.nr)) : 0));
  return (
    <>
      <div className="mat-kopf">
        {!ohneNeu && <button className="knopf knopf--haupt" data-erp-neu={typ}
          onClick={() => belegOeffnen(d, neu, null, { typ })}>+ {t.name}</button>}
        <Suche wert={suche} setzen={setSuche} platzhalter="Nr., Kunde, Artikel …" fokus />
        {!mitStand && <label className="feld-haken"><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} />
          <span>Nur offene</span></label>}
        {mitArt && BE_ARTEN.map(([w, text]) => <label key={w} className="feld-haken" data-erp-be-art={w}>
          <input type="checkbox" checked={arten.has(w)} onChange={(e) => artUm(w, e.target.checked)} /><span>{text}</span></label>)}
        {mitStand && FA_STAENDE.map((w) => <label key={w} className="feld-haken" data-erp-fa-stand={w}>
          <input type="checkbox" checked={staende.has(w)} onChange={(e) => standUm(w, e.target.checked)} /><span>{w}</span></label>)}
      </div>
      {hinweis && <p className="klein">{hinweis}</p>}
      <Tabelle kopf={["Nr.", "Datum", t.partner === "lieferant" ? "Lieferant" : "Kunde", "Artikel", mitPreis(typ) ? "Netto CHF" : "Menge"]
          .concat(mitStand ? ["Planwand"] : []).concat(["Stand"])}
        leer={warten ? sucheLeer(t.mehr) + " Oder „Nur offene“ anhaken." : "Keine " + t.mehr + " gefunden."}
        zeilen={liste.map(({ b, stand }) => {
          const pos = d.posJe.get(b.id) || [];
          const art = pos.map((x) => { const a = d.artikelMap.get(x.artikel_id); const ix = posIdx(d, x); return a ? a.nr + (ix ? " " + ix : "") : x.text; })
            .filter(Boolean);
          return {
            key: b.id, klasse: stand[1], klick: () => belegOeffnen(d, neu, b),
            zellen: [<b>{b.nr}</b>, datumText(b.datum), partnerText(d.partnerMap.get(b.partner_id)) + (b.art === "rahmen" ? " · Rahmen" : ""),
              art.slice(0, 3).join(", ") + (art.length > 3 ? " …" : ""),
              mitPreis(typ) ? chf(belegSumme(d, b).netto) : mengeText(pos.reduce((s, x) => s + zahl(x.menge), 0))]
              .concat(mitStand ? [planwandZelle(b)] : []).concat([stand[0]]),
          };
        })} />
    </>
  );
}

// ---------- Fenster eines Belegs ----------
// vorlage: { typ, art, partner_id, bezug_id, daten, positionen } für neue Belege
export function belegOeffnen(d, neu, b, vorlage) {
  fensterOeffnen((zu) => <BelegFenster start={d} id={b ? b.id : null} vorlage={vorlage || {}} aussen={neu} zu={zu} />);
}

function kopfAus(b) {
  return { typ: b.typ, nr: b.nr || "", partner_id: b.partner_id || "", art: b.art || "einzel", status: b.status || "offen",
    datum: b.datum || heute(), bezug_id: b.bezug_id || null, daten: { ...(b.daten || {}) } };
}
function posAus(liste) {
  return liste.map((p) => ({ id: p.id, artikel_id: p.artikel_id || "", text: p.text || "", menge: p.menge ?? "", einheit: p.einheit || "Stk",
    preis: p.preis ?? "", termin: p.termin || "", termin_kw: p.termin_kw || "", bezug_id: p.bezug_id || null, daten: { ...(p.daten || {}) } }));
}

function BelegFenster({ start, id, vorlage, aussen, zu }) {
  const [d, setD] = useState(start);
  const [belegId, setBelegId] = useState(id);
  const b = belegId ? d.belegMap.get(belegId) : null;
  const [kopf, setKopf] = useState(() => kopfAus(b || vorlage));
  const [pos, setPos] = useState(() => posAus(b ? d.posJe.get(b.id) || [] : vorlage.positionen || []));
  const [bearbeiten, setBearbeiten] = useState(!b);
  const [laeuft, setLaeuft] = useState(false);
  const typ = kopf.typ;
  const t = BELEGTYP[typ];

  // Nach jeder Buchung frisch laden, damit Bestand und Stand stimmen
  const frisch = async (neueId) => {
    const n = await allesLaden();
    setD(n); aussen();
    const nid = neueId || belegId;
    if (nid && n.belegMap.get(nid)) {
      setBelegId(nid);
      setKopf(kopfAus(n.belegMap.get(nid)));
      setPos(posAus(n.posJe.get(nid) || []));
    }
    return n;
  };

  const partner = d.partnerMap.get(kopf.partner_id);
  const setDaten = (name, w) => setKopf((k) => ({ ...k, daten: { ...k.daten, [name]: w } }));

  const speichern = async () => {
    if (typ !== "fertigung" && !kopf.partner_id) throw new Error((t.partner === "lieferant" ? "Lieferant" : "Kunde") + " fehlt.");
    const echte = pos.filter((p) => p.artikel_id || p.text.trim());
    if (!echte.length) throw new Error("Mindestens eine Position.");
    echte.forEach((p, i) => { if (!(zahl(p.menge) > 0) && typ !== "proforma") throw new Error("Position " + (i + 1) + ": Menge fehlt."); });
    const alte = b ? d.posJe.get(b.id) || [] : [];
    // Index durchgängig: eine Position mit Buchungen behält ihren Artikel
    for (const p of echte.filter((x) => x.id)) {
      const vorher = alte.find((x) => x.id === p.id);
      if (vorher && vorher.artikel_id !== (p.artikel_id || null) && (d.bewegungen.some((x) => x.position_id === p.id) || folgePositionen(d, p.id).length)) {
        throw new Error("Position " + vorher.pos + " hat schon Buchungen oder Folgebelege, der Artikel (samt Index) lässt sich nicht mehr ändern.");
      }
    }
    for (const p of alte.filter((x) => !echte.some((y) => y.id === x.id))) {
      if (d.bewegungen.some((x) => x.position_id === p.id) || folgePositionen(d, p.id).length) {
        throw new Error("Position " + p.pos + " hat schon Buchungen oder Folgebelege und bleibt.");
      }
    }
    const zeile = { typ, partner_id: kopf.partner_id || null, art: kopf.art, status: kopf.status, datum: kopf.datum || heute(),
      bezug_id: kopf.bezug_id || null, daten: kopf.daten, geaendert_am: new Date().toISOString() };
    const bel = b ? (await aendern("erp_belege", b.id, zeile)) || { ...b, ...zeile }
      : await einfuegen("erp_belege", { ...zeile, nr: naechsteBelegNr(d, typ) });
    for (const p of alte.filter((x) => !echte.some((y) => y.id === x.id))) await loeschen("erp_positionen", p.id);
    for (let i = 0; i < echte.length; i++) {
      const p = echte[i];
      // Index der Position festhalten: bekommt der Artikel später einen neuen Index,
      // bleibt dieser Auftrag beim Index, mit dem er angelegt wurde
      const vorher = p.id ? alte.find((x) => x.id === p.id) : null;
      const art = p.artikel_id && d.artikelMap.get(p.artikel_id);
      if (art && (!vorher || vorher.artikel_id !== p.artikel_id || !p.daten || p.daten.idx == null)) {
        p.daten = { ...(p.daten || {}), idx: art.idx || "" };
      }
      const w = { beleg_id: bel.id, pos: (i + 1) * 10, artikel_id: p.artikel_id || null, text: p.text || null,
        menge: zahl(p.menge), einheit: p.einheit || "Stk", preis: p.preis === "" || p.preis == null ? null : zahl(p.preis),
        termin: p.termin || null, termin_kw: p.termin_kw || null, bezug_id: p.bezug_id || null, daten: (p.daten || {}).abrufe ? { ...p.daten, abrufe: lpAbrufe(p.daten.abrufe) } : (p.daten || {}) };
      if (p.id) await aendern("erp_positionen", p.id, w); else await einfuegen("erp_positionen", w);
    }
    alt.meldung(t.name + " " + bel.nr + " gespeichert.", "gut");
    // Erst frisch laden, dann Ansicht: sonst zeigt die Ansicht einen neuen Beleg, den sie noch nicht kennt
    await frisch(bel.id);
    setBearbeiten(false);
  };

  const belegLoeschen = async () => {
    if (!b) return zu();
    const meine = d.posJe.get(b.id) || [];
    if (meine.some((p) => folgePositionen(d, p.id).length) || d.belege.some((x) => x.bezug_id === b.id)) {
      alt.meldung("Es gibt schon Folgebelege. Zuerst diese löschen.", "warn"); return;
    }
    const buch = d.bewegungen.filter((x) => x.beleg_id === b.id);
    if (!(await alt.nachfragen({ titel: "Löschen", gefahr: true, bestaetigen: "Löschen",
      text: t.name + " " + b.nr + " löschen?" + (buch.length ? " Die " + buch.length + " Lagerbuchungen dazu werden auch gelöscht." : "") }))) return;
    await tun(async () => {
      // Reihenfolge so, dass Rückgängig zuerst den Beleg, dann Positionen und Buchungen zurückholt
      for (const x of buch) await loeschen("erp_bewegungen", x.id);
      for (const p of meine) await loeschen("erp_positionen", p.id);
      await loeschen("erp_belege", b.id);
    }, t.name + " gelöscht.");
    aussen(); zu();
  };

  // Wie im Gewatec (Wunsch Patrick 21. November 2026): oben der Kopf mit den
  // Schlüsselfeldern, darunter Reiter Positionen und Kopfdaten, unten die
  // Knöpfe. Bearbeiten bleibt ein eigener Schritt, damit niemand aus
  // Versehen einen gebuchten Beleg ändert.
  const [reiter, setReiter] = useState("positionen");
  const basis = useRef(bearbeiten ? JSON.stringify([kopf, pos]) : "");
  const bearbeitenStarten = () => { basis.current = JSON.stringify([kopf, pos]); setBearbeiten(true); };
  const geaendert = bearbeiten && JSON.stringify([kopf, pos]) !== basis.current;
  const abbrechen = async () => {
    const r = await schliessenFragen(geaendert, alt, speichern); if (!r || r === "gespeichert") return;
    if (b) { setBearbeiten(false); setKopf(kopfAus(b)); setPos(posAus(d.posJe.get(b.id) || [])); } else zu();
  };
  const schliessen = async () => { if (await schliessenFragen(geaendert, alt, speichern)) zu(); };
  const stand = b ? belegStand(d, b) : null;
  const summe = b && mitPreis(typ) ? belegSumme(d, b) : null;
  const titel = t.name + " " + (b ? b.nr : "neu") + (kopf.art === "rahmen" ? " · Rahmenauftrag" : "")
    + (summe ? " (Gesamtwert " + chf(summe.netto) + " CHF)" : "");
  const bezug = d.belegMap.get(kopf.bezug_id);
  const partnerMenue = partner && [[(t.partner === "lieferant" ? "Lieferant" : "Kunde") + " öffnen", () => partnerFensterOeffnen(d, aussen, partner)],
    ["Belege von " + partner.name, () => partnerFensterOeffnen(d, aussen, partner, null, "belege")]];
  const kopfTeil = bearbeiten
    ? <KopfFelder d={d} kopf={kopf} setKopf={setKopf} setDaten={setDaten} teil="oben" />
    : <>
      <KF label="Nummer" nurLesen wert={<b>{b.nr}</b>} />
      <KF label="Datum" nurLesen wert={datumText(b.datum)} />
      {typ !== "fertigung" && <KF label={t.partner === "lieferant" ? "Lieferant" : "Kunde"} nurLesen wert={partnerText(partner)} menue={partnerMenue} />}
      {(typ === "auftrag" || typ === "bestellung") && <KF label="Art" nurLesen wert={kopf.art === "rahmen" ? "Rahmenauftrag" : "Einzelauftrag"} />}
      <KF label="Stand" nurLesen wert={<span className={"erp-schild " + stand[1]}>{stand[0]}</span>} />
      {kopf.daten.ihre_nr && <KF label={typ === "bestellung" ? "AB Lieferant" : "Ihre Bestellung"} nurLesen wert={kopf.daten.ihre_nr} />}
      {/* FA aus der Planwand (seit 1.907.0, sql/erp-fa-aus-planwand.sql): Maschine und Stand beim Übernehmen */}
      {typ === "fertigung" && kopf.daten.planwand && <KF label="Planwand" nurLesen wert={"Maschine " + (kopf.daten.planwand.maschine || kopf.daten.planwand.maschine_nr || "–")
        + " · " + ({ geplant: "geplant", ruesten: "rüsten", laeuft: "läuft", fertig: "fertig" }[kopf.daten.planwand.stand] || kopf.daten.planwand.stand || "")} />}
      {bezug && <KF label="Aus" nurLesen wert={BELEGTYP[bezug.typ].name + " " + bezug.nr}
        menue={[[BELEGTYP[bezug.typ].name + " " + bezug.nr + " öffnen", () => belegOeffnen(d, aussen, bezug)]]} />}
    </>;
  const fuss = <>
    {b && !bearbeiten && <button className="knopf knopf--gefahr" onClick={belegLoeschen}>Löschen</button>}
    {b && !bearbeiten && <button className="knopf" data-erp-drucken="" data-erp-ab-drucken={b.typ === "auftrag" ? "" : undefined} onClick={() => (b.typ === "lieferschein" ? lsDrucken(d, b)
      : b.typ === "rechnung" || b.typ === "gutschrift" || b.typ === "proforma" ? reDrucken(d, b)
        : b.typ === "bestellung" ? beDrucken(d, b)
          // Beim Auftrag druckt „Drucken“ die Auftragsbestätigung wie im Gewatec (1.935.2)
          : b.typ === "auftrag" ? abDrucken(d, b) : belegDrucken(d, b))}>Drucken</button>}
    <span className="gf-fuss__luecke" />
    {geaendert && <span className="klein gf-geaendert">nicht gespeichert</span>}
    <button className="knopf knopf--still" data-nein="" onClick={bearbeiten ? abbrechen : zu}>{bearbeiten && b ? "Abbrechen" : "Beenden"}</button>
    {bearbeiten
      ? <button className="knopf knopf--haupt" disabled={laeuft} data-erp-speichern="" onClick={async () => {
        setLaeuft(true); await tun(speichern); setLaeuft(false);
      }}>Speichern</button>
      : <button className="knopf knopf--haupt" data-erp-bearbeiten="" onClick={bearbeitenStarten}>Bearbeiten</button>}
  </>;
  return (
    <GFenster titel={titel} kopf={kopfTeil} reiter={[["positionen", "Positionen"], ["kopf", "Kopfdaten"]]} aktiv={reiter} setAktiv={setReiter}
      fuss={fuss} zu={schliessen} attr={{ "data-erp-beleg": b ? b.nr : "neu", "data-erp-typ": b ? b.typ : "" }}>
      {reiter === "positionen" && <>
        <Positionen d={d} kopf={kopf} pos={pos} setPos={setPos} bearbeiten={bearbeiten} b={b} aussen={aussen} frisch={frisch} starten={bearbeitenStarten} />
        {b && !bearbeiten && typ === "fertigung" && <Arbeitsgaenge d={d} b={b} frisch={frisch} />}
        {b && !bearbeiten && <Aktionen d={d} b={b} aussen={aussen} frisch={frisch} />}
        {b && !bearbeiten && <Buchungen d={d} b={b} />}
      </>}
      {reiter === "kopf" && (bearbeiten
        ? <KopfFelder d={d} kopf={kopf} setKopf={setKopf} setDaten={setDaten} teil="rest" />
        : <KopfAnsicht d={d} b={b} />)}
      {partner && partner.daten && partner.daten.hinweis && <p className="klein">Hinweis Partner: {partner.daten.hinweis}</p>}
    </GFenster>
  );
}

function bedAuswahl(d, art) {
  return [["", "—"]].concat(d.bedingungen.filter((x) => x.art === art).map((x) => [x.id, x.code + " · " + x.text]));
}

function anschriften(p, typ) {
  const pd = (p && p.daten) || {};
  const haupt = { name: p ? p.name : "", ...(pd.adresse || {}) };
  return [["haupt", haupt]].concat((pd.anschriften || []).filter((a) => !typ || a.typ === typ).map((a, i) => ["a" + i, a]));
}

function KopfFelder({ d, kopf, setKopf, setDaten, teil }) {
  const typ = kopf.typ;
  const t = BELEGTYP[typ];
  const partner = d.partnerMap.get(kopf.partner_id);
  const anschriftTyp = typ === "rechnung" || typ === "gutschrift" || typ === "proforma" ? "rechnung" : "liefer";
  const wahl = anschriften(partner, anschriftTyp);
  const partnerWahl = (id) => {
    const p = d.partnerMap.get(id);
    const pd = (p && p.daten) || {};
    // Bedingungen und Anschrift kommen vom Partner, lassen sich ändern
    setKopf((k) => ({ ...k, partner_id: id, daten: { ...k.daten, liefer: pd.liefer || k.daten.liefer || "", zahlung: pd.zahlung || k.daten.zahlung || "",
      mwst: pd.mwst ?? k.daten.mwst, anschrift: anschriften(p, anschriftTyp)[anschriften(p, anschriftTyp).length > 1 ? 1 : 0][1] } }));
  };
  const pAuswahl = [["", "— wählen —"]].concat(d.partner.filter((p) => p.art === t.partner && p.aktiv)
    .sort((a, b) => a.nr.localeCompare(b.nr)).map((p) => [p.id, p.nr + " " + p.name]));
  const setK = (name) => (w) => setKopf((k) => ({ ...k, [name]: w }));
  if (teil === "oben") return <>
    {typ !== "fertigung" && <KF label={t.partner === "lieferant" ? "Lieferant" : "Kunde"} name="partner_id" wert={kopf.partner_id} setzen={partnerWahl} auswahl={pAuswahl} />}
    <KF label="Datum" typ="datum" name="datum" wert={kopf.datum} setzen={setK("datum")} />
    {(typ === "auftrag" || typ === "bestellung") && <KF label="Art" name="art" wert={kopf.art} setzen={setK("art")}
      auswahl={[["einzel", "Einzelauftrag"], ["rahmen", "Rahmenauftrag (Lieferplan)"]]} />}
    {typ === "bestellung" && <KF label="Bestellart" name="bestellart" wert={kopf.daten.bestellart || ""} setzen={(w) => setDaten("bestellart", w)}
      auswahl={[["", "— von selbst —"]].concat(BESTELLARTEN)} />}
    <KF label="Status" name="status" wert={kopf.status} setzen={setK("status")} auswahl={[["offen", "offen"], ["abgeschlossen", "abgeschlossen"], ["storniert", "storniert"]]} />
    <KF label={typ === "bestellung" ? "AB Lieferant" : "Ihre Bestellung"} name="ihre_nr" wert={kopf.daten.ihre_nr} setzen={(w) => setDaten("ihre_nr", w)} />
    {typ === "auftrag" && <KF label="Bestelldatum" name="ihre_datum" typ="datum" wert={kopf.daten.ihre_datum} setzen={(w) => setDaten("ihre_datum", w)} />}
    {typ === "auftrag" && <KF label="Ihr Zeichen" name="zeichen" wert={kopf.daten.zeichen} setzen={(w) => setDaten("zeichen", w)} />}
  </>;
  return (
    <div className="erp-formular">
      {typ !== "fertigung" && <>
        <Feld f={{ name: "liefer", label: "Lieferbedingung", auswahl: bedAuswahl(d, "liefer") }} wert={kopf.daten.liefer} setzen={(w) => setDaten("liefer", w)} />
        <Feld f={{ name: "zahlung", label: "Zahlungsbedingung", auswahl: bedAuswahl(d, "zahlung") }} wert={kopf.daten.zahlung} setzen={(w) => setDaten("zahlung", w)} />
        {partner && <AnschriftFeld titel={anschriftTyp === "rechnung" ? "Rechnungsanschrift" : "Lieferanschrift"} name="anschrift"
          wahl={wahl} wert={kopf.daten.anschrift} setzen={(a) => setDaten("anschrift", a)} />}
        {partner && (typ === "auftrag" || typ === "lieferschein") && <AnschriftFeld titel="Rechnungsanschrift" name="rechnung_an"
          wahl={anschriften(partner, "rechnung")} wert={kopf.daten.rechnung_an} setzen={(a) => setDaten("rechnung_an", a)} />}
      </>}
      {typ === "lieferschein" && <>
        <Feld f={{ name: "versand", label: "Versandbedingung" }} wert={kopf.daten.versand} setzen={(w) => setDaten("versand", w)} />
        <Feld f={{ name: "verpackung", label: "Verpackung" }} wert={kopf.daten.verpackung} setzen={(w) => setDaten("verpackung", w)} />
        <Feld f={{ name: "verp_kosten", label: "Verpackungskosten" }} wert={kopf.daten.verp_kosten} setzen={(w) => setDaten("verp_kosten", w)} />
        <Feld f={{ name: "porto", label: "Porto" }} wert={kopf.daten.porto} setzen={(w) => setDaten("porto", w)} />
        <Feld f={{ name: "gewicht_brutto", label: "Gesamtgewicht brutto kg", typ: "zahl" }} wert={kopf.daten.gewicht_brutto} setzen={(w) => setDaten("gewicht_brutto", w)} />
      </>}
      {mitPreis(typ) && <Feld f={{ name: "mwst", label: "MWST %", typ: "zahl", platzhalter: String(MWST) }}
        wert={kopf.daten.mwst} setzen={(w) => setDaten("mwst", w)} />}
      <Feld f={{ name: "text", label: "Text auf dem Beleg", typ: "textarea", breit: true }} wert={kopf.daten.text} setzen={(w) => setDaten("text", w)} />
    </div>
  );
}

// Anschrift im Beleg: aus den Anschriften des Partners wählen und danach
// frei ändern (Wunsch Patrick 25. November 2026: „im Auftrag die Kopfdaten
// noch ändern können, z. B. Lieferanschrift“). Geändert gilt nur für diesen Beleg.
const ANSCHRIFT_TEILE = [["name", "Name"], ["zusatz", "Zusatz"], ["strasse", "Strasse"], ["plz", "PLZ"], ["ort", "Ort"], ["land", "Land"]];
function anschriftKurz(a) {
  if (!a) return "";
  return [a.name, a.zusatz || a.name2, a.strasse, [a.plz, a.ort].filter(Boolean).join(" "), a.land && a.land !== "CH" ? a.land : ""].filter(Boolean).join(", ");
}
function AnschriftFeld({ titel, name, wahl, wert, setzen }) {
  const jetzt = wert || wahl[0][1];
  const gleich = wahl.find(([, a]) => JSON.stringify(a) === JSON.stringify(jetzt));
  const auswahl = wahl.map(([k, a], i) => [k, (i === 0 ? "Hauptadresse: " : "") + [a.werk, a.name, a.ort].filter(Boolean).join(", ")])
    .concat(gleich ? [] : [["_eigen", "Von Hand geändert"]]);
  return (
    <fieldset className="erp-anschrift feld--breit" data-erp-anschrift={name}>
      <legend>{titel}</legend>
      <Feld f={{ name: name + "_wahl", label: "Aus Stammdaten", auswahl }} wert={gleich ? gleich[0] : "_eigen"}
        setzen={(w) => { const g = wahl.find(([k]) => k === w); if (g) setzen({ ...g[1] }); }} />
      {ANSCHRIFT_TEILE.map(([k, l]) => (
        <Feld key={k} f={{ name: name + "_" + k, label: l }} wert={(k === "zusatz" ? jetzt.zusatz ?? jetzt.name2 : jetzt[k]) || ""}
          setzen={(w) => setzen({ ...jetzt, [k]: w })} />
      ))}
    </fieldset>
  );
}

function KopfAnsicht({ d, b }) {
  const p = d.partnerMap.get(b.partner_id);
  const bd = b.daten || {};
  const bez = d.belegMap.get(b.bezug_id);
  const bed = (id) => (d.bedingungen.find((x) => x.id === id) || {}).text;
  const zeilen = [
    [BELEGTYP[b.typ].partner === "lieferant" ? "Lieferant" : "Kunde", partnerText(p)],
    ["Datum", datumText(b.datum)],
    bez && ["Aus", BELEGTYP[bez.typ].name + " " + bez.nr],
    b.typ === "bestellung" && bd.bestellart && ["Bestellart", (BESTELLARTEN.find((x) => x[0] === bd.bestellart) || [])[1] || bd.bestellart],
    bd.ihre_nr && [b.typ === "bestellung" ? "AB Lieferant" : "Ihre Bestellung", bd.ihre_nr],
    bd.ihre_datum && ["Bestelldatum", datumText(bd.ihre_datum)],
    bd.zeichen && ["Ihr Zeichen", bd.zeichen],
    bd.versand && ["Versandbedingung", bd.versand],
    bd.verpackung && ["Verpackung", bd.verpackung],
    bd.gewicht_brutto && ["Gesamtgewicht brutto", bd.gewicht_brutto + " kg"],
    bd.anschrift && [b.typ === "rechnung" || b.typ === "gutschrift" || b.typ === "proforma" ? "Rechnungsanschrift" : "Lieferanschrift", anschriftKurz(bd.anschrift)],
    bd.rechnung_an && ["Rechnungsanschrift", anschriftKurz(bd.rechnung_an)],
    bed(bd.liefer) && ["Lieferung", bed(bd.liefer)],
    bed(bd.zahlung) && ["Zahlung", bed(bd.zahlung)],
    p && p.art === "kunde" && b.typ === "rechnung" && [ "Rechnung", (p.daten || {}).sammel ? "Sammelrechnung" : "Einzelrechnung"],
    p && (p.daten || {}).rechnung_mail && (b.typ === "rechnung" || b.typ === "gutschrift") && ["Rechnung an", p.daten.rechnung_mail],
    bd.fibu_am && ["Fibu", "exportiert am " + datumText(bd.fibu_am)],
    bd.text && ["Text", bd.text],
  ].filter(Boolean);
  return <>
    <dl className="erp-kopf">{zeilen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <p className="klein">Ändern: unten auf „Bearbeiten“ drücken, dann hier im Reiter Kopfdaten.</p>
  </>;
}

// Artikel per Eingabe mit Vorschlägen: bei tausenden Artikeln ist eine Auswahl zu lang
let listenNr = 0;
function ArtikelWahl({ d, wert, setzen, gesperrt, aussen }) {
  const [nr] = useState(() => "erp-art-" + (++listenNr));
  const a = d.artikelMap.get(wert);
  // Im Feld steht nur die Artikel-Nr., die übrigen Angaben in eigenen Feldern daneben
  // (Wunsch Patrick 25. November 2026); die Vorschläge zeigen weiter Nr. und Bezeichnung
  const [text, setText] = useState(a ? a.nr : "");
  const liste = d.artikel.filter((x) => x.aktiv).slice(0, 5000);
  return (
    <label className="feld erp-feld erp-feld--artnr">
      {/* Mit gewähltem Artikel öffnet „Artikel-Nr.“ das Artikelfenster (Wunsch Patrick 25. November 2026) */}
      {a ? <span className="erp-artnr-link" data-erp-artnr-link role="link" tabIndex={0} title="Artikel öffnen"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); artikelFensterOeffnen(d, aussen, a); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); artikelFensterOeffnen(d, aussen, a); } }}>Artikel-Nr.</span>
        : <span>Artikel-Nr.</span>}
      <input list={nr} value={text} disabled={gesperrt} data-erp-feld="artikel" placeholder="Nr. tippen …"
        onChange={(e) => {
          const v = e.target.value;
          const f = liste.find((x) => artikelText(x) === v) || liste.find((x) => x.nr === v.trim());
          setText(f ? f.nr : v);
          setzen(f ? f.id : "");
        }} />
      <datalist id={nr}>{liste.map((x) => <option key={x.id} value={artikelText(x)} />)}</datalist>
    </label>
  );
}

// Angaben zum gewählten Artikel als eigene Felder nur zum Lesen
function ArtikelAngaben({ a, idx }) {
  const ad = (a && a.daten) || {};
  const f = (k, label, wert, klasse) => (
    <label key={k} className={"feld erp-feld " + (klasse || "")}><span>{label}</span>
      <input value={wert || ""} readOnly tabIndex={-1} data-erp-artfeld={k} /></label>
  );
  return <>
    {f("idx", "Index", a ? idx : "", "erp-feld--schmal")}
    {f("bez", "Bezeichnung", a ? a.bezeichnung : "", "erp-feld--bez")}
    {f("zeichnung", "Zeichnung", a ? a.zeichnung : "")}
    {f("ident", "Ident-Nr. Kunde", a ? ad.kunden_nr || ad.ident : "")}
  </>;
}


function Positionen({ d, kopf, pos, setPos, bearbeiten, b, aussen, frisch, starten }) {
  // Tipp auf eine Position in der Ansicht startet gleich das Bearbeiten und
  // rollt zu dieser Position (Wunsch Patrick 25. November 2026: „die Übersicht,
  // welche jetzt kommt, bringt mir nichts“).
  const fokusId = useRef(null);
  const listeRef = useRef(null);
  useEffect(() => {
    if (!bearbeiten || !fokusId.current || !listeRef.current) return;
    const el = listeRef.current.querySelector('[data-erp-pos-id="' + fokusId.current + '"]');
    fokusId.current = null;
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    el.classList.add("erp-pos--fokus");
    setTimeout(() => el.classList.remove("erp-pos--fokus"), 1600);
  }, [bearbeiten]);
  const typ = kopf.typ;
  const preis = mitPreis(typ);
  const rahmen = kopf.art === "rahmen";
  const kw = ((d.partnerMap.get(kopf.partner_id) || {}).daten || {}).termin_art === "kw";
  const setzen = (i, name, w) => setPos((l) => l.map((p, j) => {
    if (j !== i) return p;
    const n = terminNachziehen({ ...p, [name]: w }, name, w, kw, typ);
    if (name === "artikel_id") {
      const a = d.artikelMap.get(w);
      if (a) n.einheit = a.einheit || n.einheit;
    }
    // Preis aus der Preisliste des Artikels nach Menge, solange er nicht
    // von Hand geändert wurde (daten.preisAuto); mit der Preiseinheit
    if (name === "preis" || name === "pe") n.daten = { ...n.daten, preisAuto: false };
    if (name === "pe") n.daten = { ...n.daten, pe: peZahl(w) };
    if ((name === "artikel_id" || name === "menge") && preis) {
      const a = d.artikelMap.get(n.artikel_id);
      const leer = n.preis === "" || n.preis == null;
      const vp = a ? preisFuerMenge(a, n.menge) : null;
      if (vp && (leer || (n.daten && n.daten.preisAuto))) {
        n.preis = vp.preis;
        n.daten = { ...n.daten, pe: vp.pe, preisAuto: true };
      }
    }
    return n;
  }));
  if (!bearbeiten) {
    const s = b ? belegSumme(d, b) : null;
    return (
      <>
        <Tabelle kopf={["Pos", "Artikel", "Menge", "Termin"].concat(preis ? ["Preis", "Betrag"] : []).concat(["Stand"])}
          zeilen={(d.posJe.get(b.id) || []).map((p) => {
            const a = d.artikelMap.get(p.artikel_id);
            return {
              key: p.id, klick: () => { if (starten) { fokusId.current = p.id; starten(); } else positionOeffnen(d, aussen, b, p, frisch); },
              zellen: [p.pos, <>{a ? <b>{artikelIdxText(a, posIdx(d, p))}</b> : p.text}{a && a.zeichnung && <small> · Zeichnung {a.zeichnung}{posIdx(d, p) ? " Ind. " + posIdx(d, p) : ""}</small>}
                {a && p.text && <><br /><small>{p.text}</small></>}{p.daten && p.daten.charge && <><br /><small>Charge {p.daten.charge}</small></>}
                {(p.daten.abrufe || []).length > 0 && <Lieferplan d={d} p={p} />}</>,
              mengeText(p.menge) + " " + (p.einheit || ""), terminText(p)]
                .concat(preis ? [p.preis != null ? chf(p.preis) + (posPe(p) > 1 ? " " + peKurz(posPe(p)) : "") : "", chf(posBetrag(p))] : [])
                .concat([posStand(d, b, p)]),
            };
          })} />
        {preis && s && <div className="erp-summe"><span>Netto {chf(s.netto)}</span><span>MWST {s.satz} % {chf(s.steuer)}</span><b>Total CHF {chf(s.brutto)}</b></div>}
        {/* Neue Position direkt in der Ansicht, ohne zuerst „Bearbeiten“ (Wunsch Patrick 25. November 2026) */}
        <div><button type="button" className="knopf knopf--klein" data-erp-ansicht-neupos=""
          onClick={() => {
            const alle = d.posJe.get(b.id) || [];
            const naechste = alle.reduce((m, x) => Math.max(m, zahl(x.pos)), 0) + 10;
            positionOeffnen(d, aussen, b, { neu: true, pos: naechste, artikel_id: "", menge: "", einheit: "Stk", preis: null, text: "", daten: {} }, frisch);
          }}>+ Position</button></div>
      </>
    );
  }
  return (
    <fieldset ref={listeRef} className="erp-liste erp-feld--breit"><legend>Positionen</legend>
      {pos.map((p, i) => {
        // Artikel änderbar, solange auf der Position nichts gebucht ist und kein Folgebeleg darauf zeigt
        const gesperrt = p.id && (d.bewegungen.some((x) => x.position_id === p.id) || folgePositionen(d, p.id).length > 0);
        return (
          <div key={p.id || "n" + i} className="erp-pos" data-erp-pos-id={p.id || ""}>
            <div className="erp-liste__zeile">
              <ArtikelWahl d={d} wert={p.artikel_id} setzen={(w) => setzen(i, "artikel_id", w)} gesperrt={gesperrt} aussen={aussen} />
              <ArtikelAngaben a={d.artikelMap.get(p.artikel_id)} idx={p.id && p.artikel_id === (d.posMap.get(p.id) || {}).artikel_id ? posIdx(d, p) : (d.artikelMap.get(p.artikel_id) || {}).idx} />
            </div>
            <div className="erp-liste__zeile">
              <Feld f={{ name: "menge", label: rahmen ? "Rahmenmenge" : "Menge", typ: "zahl" }} wert={p.menge} setzen={(w) => setzen(i, "menge", w)} />
              <Feld f={{ name: "einheit", label: "Einheit" }} wert={p.einheit} setzen={(w) => setzen(i, "einheit", w)} />
              {preis && <Feld f={{ name: "preis", label: "Preis CHF", typ: "zahl" }} wert={p.preis} setzen={(w) => setzen(i, "preis", w)} />}
              {preis && <Feld f={{ name: "pe", label: "pro", auswahl: PE_AUSWAHL }} wert={String(posPe(p))} setzen={(w) => setzen(i, "pe", w)} />}
              {!rahmen && terminFelder(p, kw, (name, w) => setzen(i, name, w),
                ({ key, name, label, typ, platzhalter, wert, setzen: s2 }) => <Feld key={key} f={{ name, label, typ, platzhalter }} wert={wert} setzen={s2} />)}
              {typ === "auftrag" && !rahmen && !(p.daten.abrufe || []).length && <button type="button" className="knopf knopf--klein" data-erp-pos-lpneu=""
                title="Mehrere Fälligkeiten für diese Position"
                onClick={() => setzen(i, "daten", { ...p.daten, abrufe: [{ termin: "", kw: "", menge: "", bemerkung: "" }] })}>+ Lieferplan</button>}
              {typ === "auftrag" && b && p.id && p.artikel_id && b.status !== "storniert" && <button type="button" className="knopf knopf--klein" data-erp-pos-ls=""
                title="Lieferschein nur für diese Position"
                onClick={async () => { const n = await frisch(); fensterOeffnen((zu2) => <LieferscheinFenster d={n} b={b} nurPos={p.id} zu={zu2} fertig={frisch} />); }}>Liefern</button>}
              <button type="button" className="knopf knopf--klein knopf--gefahr" title="Entfernen" data-erp-pos-weg=""
                onClick={() => setPos((l) => l.filter((_, j) => j !== i))}>✕</button>
            </div>
            <Feld f={{ name: "text", label: "Text (ohne Artikel: freie Position)", breit: true }} wert={p.text} setzen={(w) => setzen(i, "text", w)} />
            {typ === "bestellung" && <Feld f={{ name: "vorschrift", label: "Bearbeitungsvorschrift", typ: "textarea", breit: true }}
              wert={p.daten.vorschrift || ""} setzen={(w) => setzen(i, "daten", { ...p.daten, vorschrift: w })} />}
            {(rahmen || (p.daten.abrufe || []).length > 0) && <div className="erp-feld--breit"><div className="lp-legende">Lieferplan</div>
              <LieferplanAnsicht d={d} aussen={aussen} p={p}
                zeilen={(p.daten.abrufe || []).map((x) => ({ ...x, kw: x.kw || (x.termin ? kwText(x.termin) : ""), menge: x.menge ?? "" }))}
                setZeilen={(z) => setzen(i, "daten", { ...p.daten, abrufe: z.map((x) => ({ ...x, menge: x.menge === "" ? "" : x.menge })) })} /></div>}
          </div>
        );
      })}
      <button type="button" className="knopf knopf--klein" data-erp-neupos=""
        onClick={() => setPos((l) => l.concat([{ artikel_id: "", text: "", menge: "", einheit: "Stk", preis: "", termin: "", termin_kw: "", daten: {} }]))}>
        + Position</button>
    </fieldset>
  );
}

export function geliefert(d, p) {
  return folgePositionen(d, p.id, "lieferschein").reduce((s, x) => s + zahl(x.menge), 0);
}

// Abrufe eines Rahmenauftrags, abgehakt nach der gelieferten Menge
function Lieferplan({ d, p }) {
  let rest = geliefert(d, p);
  return (
    <ul className="erp-abrufe">{(p.daten.abrufe || []).map((x, i) => {
      const m = zahl(x.menge);
      const da = Math.min(m, rest); rest -= da;
      return <li key={i} className={da >= m ? "erp-gut" : ""}>{lpText(x)}: {mengeText(m)}
        {da > 0 && da < m ? " (" + mengeText(da) + " geliefert)" : da >= m ? " ✓" : ""}</li>;
    })}</ul>
  );
}

// ---------- Position und Lieferplan als eigene Fenster ----------
// Wie die Auftrags-Position im Gewatec, aber nur das Nötige (Patrick
// 21. November 2026: „es geht nur um die Grundfunktionalität“): Menge,
// Preis, Termin, Text, was schon geliefert ist und die Folgebelege.
export function positionOeffnen(d, aussen, b, p, frisch) {
  fensterOeffnen((zu) => <PositionFenster d={d} aussen={aussen} b={b} p={p} frisch={frisch} zu={zu} />);
}

function PositionFenster({ d, aussen, b, p, frisch, zu }) {
  const t = BELEGTYP[b.typ];
  const preis = mitPreis(b.typ);
  const a = d.artikelMap.get(p.artikel_id);
  const start = { artikel_id: p.artikel_id || "", menge: String(p.menge ?? ""), einheit: p.einheit || "Stk", preis: p.preis == null ? "" : String(p.preis),
    pe: String(posPe(p)), termin: p.termin || "", termin_kw: p.termin_kw || "", text: p.text || "" };
  const [w, setW] = useState(start);
  const [laeuft, setLaeuft] = useState(false);
  const geaendert = JSON.stringify(w) !== JSON.stringify(start);
  const set = (name) => (x) => setW((v) => {
    const n = terminNachziehen({ ...v, [name]: x }, name, x, kw, b.typ);
    // Neuer Artikel: Einheit und Preis aus seiner Preisliste mitnehmen
    if (name === "artikel_id") {
      const na = d.artikelMap.get(x);
      if (na) {
        n.einheit = na.einheit || n.einheit;
        const vp = preis ? preisFuerMenge(na, zahl(n.menge)) : null;
        if (vp) { n.preis = String(vp.preis); n.pe = String(vp.pe || 1); }
      }
    }
    return n;
  });
  const artGesperrt = !p.neu && (d.bewegungen.some((x) => x.position_id === p.id) || d.positionen.some((x) => x.bezug_id === p.id));
  const ist = b.typ === "auftrag" ? geliefert(d, p) : b.typ === "bestellung" ? gebucht(d, p.id, "eingang")
    : b.typ === "fertigung" ? gebucht(d, p.id, "fertig") : 0;
  const istText = { auftrag: "Geliefert", bestellung: "Eingegangen", fertigung: "Fertig gemeldet" }[b.typ];
  const folge = d.positionen.filter((x) => x.bezug_id === p.id).map((x) => ({ x, f: d.belegMap.get(x.beleg_id) })).filter((z) => z.f);
  const wert = posBetrag({ ...p, menge: zahl(w.menge), preis: w.preis === "" ? null : zahl(w.preis), daten: { ...(p.daten || {}), pe: peZahl(w.pe) } });
  const kw = ((d.partnerMap.get(b.partner_id) || {}).daten || {}).termin_art === "kw";

  const speichern = async () => {
    if (!(zahl(w.menge) > 0) && b.typ !== "proforma") throw new Error("Menge fehlt.");
    const daten = { ...(p.daten || {}), pe: peZahl(w.pe) };
    if (w.preis !== start.preis || w.pe !== start.pe) daten.preisAuto = false;
    const neuArt = w.artikel_id !== start.artikel_id;
    if (neuArt) {
      if (artGesperrt) throw new Error("Die Position hat schon Buchungen oder Folgebelege, der Artikel lässt sich nicht mehr ändern.");
      if (!w.artikel_id && !w.text.trim()) throw new Error("Artikel fehlt.");
      const na = d.artikelMap.get(w.artikel_id);
      daten.idx = na ? na.idx || "" : "";
    }
    if (p.neu) {
      if (!w.artikel_id && !w.text.trim()) throw new Error("Artikel oder Text fehlt.");
      const na = d.artikelMap.get(w.artikel_id);
      await einfuegen("erp_positionen", { beleg_id: b.id, pos: p.pos, artikel_id: w.artikel_id || null, menge: zahl(w.menge), einheit: w.einheit || "Stk",
        preis: w.preis === "" ? null : zahl(w.preis), termin: w.termin || null, termin_kw: w.termin_kw || null, text: w.text || null,
        daten: { ...daten, idx: na ? na.idx || "" : "" } });
      alt.meldung("Position " + p.pos + " hinzugefügt.", "gut");
      await frisch(); zu();
      return;
    }
    await aendern("erp_positionen", p.id, { ...(neuArt ? { artikel_id: w.artikel_id || null } : {}), menge: zahl(w.menge), einheit: w.einheit, preis: w.preis === "" ? null : zahl(w.preis),
      termin: w.termin || null, termin_kw: w.termin_kw || null, text: w.text || null, daten });
    alt.meldung("Position " + p.pos + " gespeichert.", "gut");
    await frisch(); zu();
  };
  // Einzelne Position löschen, der Kopf bleibt (Wunsch Patrick 25. November 2026)
  const posLoeschen = async () => {
    if (artGesperrt) { alt.meldung("Position " + p.pos + " hat schon Buchungen oder Folgebelege und bleibt.", "warn"); return; }
    if (!(await alt.nachfragen({ titel: "Position löschen", gefahr: true, bestaetigen: "Löschen",
      text: "Position " + p.pos + " aus " + t.name + " " + b.nr + " löschen? Der Beleg bleibt." }))) return;
    await loeschen("erp_positionen", p.id);
    alt.meldung("Position " + p.pos + " gelöscht.", "gut");
    await frisch(); zu();
  };
  const schliessen = async () => { if ((await schliessenFragen(geaendert, alt, speichern)) === true) zu(); };
  const artMenue = a && [["Artikel öffnen", () => artikelFensterOeffnen(d, aussen, a)], ["Artikel-Cockpit", () => cockpitOeffnen(d, aussen, a)]];

  const kopf = <>
    <KF label={t.name} nurLesen wert={<b>{b.nr}</b>} />
    <KF label="Position" nurLesen wert={p.pos} />
    {artGesperrt
      ? <KF label="Artikel" nurLesen wert={a ? artikelIdxText(a, posIdx(d, p)) : p.text || "freie Position"} menue={artMenue} />
      : <ArtikelWahl d={d} wert={w.artikel_id} setzen={set("artikel_id")} aussen={aussen} />}
    <KF label="Matchcode" nurLesen wert={(d.artikelMap.get(w.artikel_id) || {}).bezeichnung || ""} />
    {(() => {
      const na = d.artikelMap.get(w.artikel_id);
      if (!na) return null;
      const nd = na.daten || {};
      return <>
        <KF label="Index" nurLesen wert={w.artikel_id === p.artikel_id ? posIdx(d, p) : na.idx || ""} />
        <KF label="Zeichnung" nurLesen wert={na.zeichnung || ""} />
        <KF label="Ident-Nr. Kunde" nurLesen wert={nd.kunden_nr || nd.ident || ""} />
      </>;
    })()}
  </>;
  const fuss = <>
    {!p.neu && <button className="knopf knopf--gefahr" data-erp-pos-loeschen="" disabled={artGesperrt}
      title={artGesperrt ? "Hat schon Buchungen oder Folgebelege" : "Nur diese Position löschen"} onClick={() => tun(posLoeschen)}>Position löschen</button>}
    {b.typ === "auftrag" && !p.neu && <button className="knopf" data-erp-pos-lieferplan="" onClick={() => lieferplanOeffnen(d, aussen, b, p, frisch)}>Lieferplan</button>}
    <span className="gf-fuss__luecke" />
    {geaendert && <span className="klein gf-geaendert">nicht gespeichert</span>}
    <button className="knopf knopf--still" data-nein="" onClick={schliessen}>Beenden</button>
    <button className="knopf knopf--haupt" disabled={laeuft || !geaendert} data-erp-speichern="" onClick={async () => {
      setLaeuft(true); await tun(speichern); setLaeuft(false);
    }}>Speichern</button>
  </>;
  return (
    <GFenster titel={t.name + "-Position " + b.nr + " / " + p.pos + (p.neu ? " (neu)" : "")} kopf={kopf} fuss={fuss} zu={schliessen} attr={{ "data-erp-posfenster": p.pos }}>
      <div className="gf-spalten">
        <div>
          <KF label="Menge" name="menge" typ="zahl" rechts wert={w.menge} setzen={set("menge")} />
          <KF label="ME" name="einheit" wert={w.einheit} setzen={set("einheit")} />
          {preis && <KF label="Preis CHF" name="preis" typ="zahl" rechts wert={w.preis} setzen={set("preis")} />}
          {preis && <KF label="pro" name="pe" wert={w.pe} setzen={set("pe")} auswahl={PE_AUSWAHL} />}
          {preis && <KF label="Wert CHF" nurLesen rechts wert={chf(wert)} />}
          {terminFelder(w, kw, (name, x) => set(name)(x), ({ key, ...r }) => <KF key={key} {...r} />)}
        </div>
        <div>
          {istText && <KF label={istText} nurLesen rechts wert={mengeText(ist) + " " + (p.einheit || "")} />}
          {istText && <KF label="Offene Menge" nurLesen rechts wert={mengeText(Math.max(0, zahl(p.menge) - ist)) + " " + (p.einheit || "")} />}
          {(p.daten.abrufe || []).length > 0 && <KF label="Lieferplan" nurLesen wert={(p.daten.abrufe || []).length + " Fälligkeiten"}
            menue={[["Lieferplan öffnen", () => lieferplanOeffnen(d, aussen, b, p, frisch)]]} />}
          <KF label="Text" name="text" typ="textarea" zeilen={4} wert={w.text} setzen={set("text")} breit />
        </div>
      </div>
      <h3 className="gf-zwischentitel">Folgebelege</h3>
      <GTabelle kopf={["Beleg", "Nr.", "Datum", "Pos", "Menge"]} rechts={[4]} leer="Noch keine."
        zeilen={folge.map(({ x, f }) => ({ key: x.id, klick: () => belegOeffnen(d, aussen, f),
          zellen: [BELEGTYP[f.typ].name, <b>{f.nr}</b>, datumText(f.datum), x.pos, mengeText(x.menge) + " " + (x.einheit || "")] }))} />
    </GFenster>
  );
}

// Lieferplan: Fälligkeiten der Position, die Lieferungen werden der Reihe
// nach darauf verteilt. So sieht man Rückstand und was offen ist.
export function lieferplanOeffnen(d, aussen, b, p, frisch) {
  fensterOeffnen((zu) => <LieferplanFenster d={d} aussen={aussen} b={b} p={p} frisch={frisch} zu={zu} />);
}

// Fälligkeiten und Lieferungen nebeneinander wie im Gewatec (Wunsch Patrick
// 25. November 2026, Bild „Auftrag: Lieferplan“): links Fälligkeiten mit
// Zeichen erledigt / offen / im Rückstand und Offen aufgelaufen, rechts die
// Lieferungen, unten die Summen. Gebraucht im Lieferplan-Fenster und beim
// Bearbeiten des Auftrags.
// „Auf Abruf“ (seit 1.934.0, Patrick 27. November 2026: Termine am 31.12. aus dem Gewatec sind
// Rahmenaufträge, die offenen Mengen „müssen auf Abruf gesetzt werden“): Fälligkeit ohne Datum,
// zählt nie als fällig oder Rückstand; das frühere Datum bleibt als „bis“ (Ende des Rahmens)
export const lpText = (x) => (x.abruf ? "auf Abruf" + (x.bis ? " (bis " + datumText(x.bis) + ")" : "") : x.kw ? "KW " + x.kw : datumText(x.termin));
function lpZeileSetzen(z, name, x) {
  if (name === "abruf") return x ? { ...z, abruf: true, bis: z.bis || z.termin || "", termin: "", kw: "" } : { ...z, abruf: false };
  if (name === "termin") return { ...z, termin: x, kw: x ? kwText(x) : "" };
  if (name === "kw") { const t = kwZuDatum(x, new Date(), 4); return t ? { ...z, kw: x, termin: t } : { ...z, kw: x }; }
  return { ...z, [name]: x };
}

function LieferplanAnsicht({ d, aussen, p, zeilen, setZeilen }) {
  const setZ = (i, name, x) => setZeilen(zeilen.map((z, j) => (j === i ? lpZeileSetzen(z, name, x) : z)));
  const lieferungen = p.id ? folgePositionen(d, p.id, "lieferschein").map((x) => ({ x, ls: d.belegMap.get(x.beleg_id) })).filter((z) => z.ls)
    .sort((u, v) => (u.ls.datum || "").localeCompare(v.ls.datum || "")) : [];
  const gesamt = lieferungen.reduce((s, z) => s + zahl(z.x.menge), 0);
  const heute0 = heute();
  let rest = gesamt, rueck = 0, kum = 0, faelligBis = 0;
  const verteilt = zeilen.map((z) => {
    const m = zahl(z.menge), da = Math.min(m, Math.max(0, rest)); rest -= da;
    const faellig = z.termin ? z.termin <= heute0 : false;
    if (faellig) faelligBis += m;
    if (faellig && da < m) rueck += m - da;
    kum += m - da;
    return { m, da, faellig, offen: kum };
  });
  const summe = zeilen.reduce((s, z) => s + zahl(z.menge), 0);
  const menge = zahl(p.menge);
  const zeichen = (v) => (v.m && v.da >= v.m ? <span className="lp-z lp-z--gut" title="geliefert">✓</span>
    : v.faellig ? <span className="lp-z lp-z--rot" title="im Rückstand">●</span> : <span className="lp-z lp-z--offen" title="offen">●</span>);
  return (
    <div className="lp" data-erp-lp="">
      <div className="lp-seiten">
        <div className="lp-teil">
          <div className="lp-titel">Fälligkeiten</div>
          <div className="gf-tab-huelle"><table className="gf-tab lp-tab">
            <thead><tr><th /><th className="rechts">Pos.</th><th>Abruf</th><th>Datum</th><th>KW</th><th className="rechts">Menge</th><th className="rechts">Offen</th><th>Bemerkung</th><th /></tr></thead>
            <tbody>
              {!zeilen.length && <tr><td colSpan={9} className="gf-tab__leer">Noch keine Fälligkeit.</td></tr>}
              {zeilen.map((z, i) => {
                const v = verteilt[i];
                return <tr key={i} data-erp-lp-zeile={i} className={v.m && v.da >= v.m ? "lp-gut" : v.faellig ? "lp-rot" : "lp-offen"}>
                  <td>{zeichen(v)}</td>
                  <td className="rechts">{i + 1}</td>
                  <td><input type="checkbox" checked={!!z.abruf} title="Auf Abruf (ohne festen Termin)" data-erp-feld="abruf" onChange={(e) => setZ(i, "abruf", e.target.checked)} /></td>
                  {z.abruf ? <td colSpan={2} className="lp-abruf" data-erp-lp-abruf="">auf Abruf{z.bis ? " (bis " + datumText(z.bis) + ")" : ""}</td> : <>
                  <td><input type="date" value={z.termin || ""} data-erp-feld="termin" onChange={(e) => setZ(i, "termin", e.target.value)} /></td>
                  <td><input className="lp-kw" value={z.kw ?? (z.termin ? kwText(z.termin) : "")} placeholder="KW" data-erp-feld="kw" onChange={(e) => setZ(i, "kw", e.target.value)} /></td></>}
                  <td><input className="gf-rechts lp-menge" inputMode="decimal" value={z.menge ?? ""} data-erp-feld="menge" onChange={(e) => setZ(i, "menge", e.target.value)} /></td>
                  <td className="rechts">{v.offen > 0 ? mengeText(v.offen) : ""}</td>
                  <td><input value={z.bemerkung || ""} data-erp-feld="bemerkung" onChange={(e) => setZ(i, "bemerkung", e.target.value)} /></td>
                  <td><button type="button" className="knopf knopf--klein knopf--gefahr" title="Entfernen" onClick={() => setZeilen(zeilen.filter((_, j) => j !== i))}>✕</button></td>
                </tr>;
              })}
            </tbody>
          </table></div>
          <div className="gf-zeile gf-knoepfe">
            <button type="button" className="knopf knopf--klein" data-erp-lp-neu="" onClick={() => setZeilen(zeilen.concat([{ termin: "", kw: "", menge: "", bemerkung: "" }]))}>+ Fälligkeit</button>
            <span className={"klein" + (Math.abs(summe - menge) > 1e-9 ? " gf-warn" : "")} data-erp-lp-summe="">
              Summe Fälligkeiten {mengeText(summe)} von {mengeText(menge)}
              {summe > menge + 1e-9 ? " · Überlieferung " + mengeText(summe - menge) : summe < menge - 1e-9 ? " · noch nicht eingeplant " + mengeText(menge - summe) : ""}</span>
          </div>
        </div>
        <div className="lp-teil">
          <div className="lp-titel">Lieferungen</div>
          <div className="gf-tab-huelle"><table className="gf-tab lp-tab">
            <thead><tr><th /><th className="rechts">Pos.</th><th>Datum</th><th>KW</th><th className="rechts">Menge</th><th>Lieferschein</th></tr></thead>
            <tbody>
              {!lieferungen.length && <tr><td colSpan={6} className="gf-tab__leer">Noch nichts geliefert.</td></tr>}
              {lieferungen.map(({ x, ls }, i) => <tr key={x.id} className="lp-gut lp-klick" onClick={() => belegOeffnen(d, aussen, ls)}>
                <td><span className="lp-z lp-z--gut">●</span></td>
                <td className="rechts">{i + 1}</td><td>{datumText(ls.datum)}</td><td>{ls.datum ? kwText(ls.datum) : ""}</td>
                <td className="rechts">{mengeText(x.menge)}</td><td><button type="button" className="gf-verweis lp-ls-link" data-erp-lp-ls={ls.nr}
                  title="Lieferschein öffnen" onClick={(e) => { e.stopPropagation(); belegOeffnen(d, aussen, ls); }}>{ls.nr} öffnen</button></td>
              </tr>)}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="lp-summen">
        <div><span>Rückstände</span><b className={rueck > 0 ? "erp-rot" : ""} data-erp-lp-rueck="">{mengeText(rueck)}</b></div>
        <div><span>Lieferungen</span><b>{mengeText(gesamt)}</b></div>
        <div><span>Offen</span><b>{mengeText(Math.max(0, summe - gesamt))}</b></div>
        <div><span>Unter-/Überlieferung</span><b title="Geliefert minus fällig bis heute">{mengeText(gesamt - faelligBis)}</b></div>
        <div><span>Fälligkeiten</span><b>{mengeText(summe)}</b></div>
      </div>
    </div>
  );
}

function lpAbrufe(zeilen) {
  return zeilen.filter((z) => zahl(z.menge) > 0 || z.termin || z.kw || z.abruf)
    .map((z) => (z.abruf ? { termin: "", kw: "", abruf: true, bis: z.bis || "", menge: zahl(z.menge), bemerkung: z.bemerkung || "" }
      : { termin: z.termin || "", kw: z.kw || (z.termin ? kwText(z.termin) : ""), menge: zahl(z.menge), bemerkung: z.bemerkung || "" }))
    .sort((u, v) => (u.termin || "9").localeCompare(v.termin || "9"));
}

function LieferplanFenster({ d, aussen, b, p, frisch, zu }) {
  const start = (p.daten.abrufe || []).map((x) => ({ termin: x.termin || "", kw: x.termin ? kwText(x.termin) : (x.kw || ""), menge: String(x.menge ?? ""), bemerkung: x.bemerkung || "",
    ...(x.abruf ? { abruf: true, bis: x.bis || "" } : {}) }));
  const [zeilen, setZeilen] = useState(start);
  const [laeuft, setLaeuft] = useState(false);
  const geaendert = JSON.stringify(zeilen) !== JSON.stringify(start);
  const a = d.artikelMap.get(p.artikel_id);
  const kunde = d.partnerMap.get(b.partner_id);
  const bd = b.daten || {};
  const speichern = async () => {
    await aendern("erp_positionen", p.id, { daten: { ...(p.daten || {}), abrufe: lpAbrufe(zeilen) } });
    alt.meldung("Lieferplan gespeichert.", "gut");
    await frisch(); zu();
  };
  const schliessen = async () => { if ((await schliessenFragen(geaendert, alt, speichern)) === true) zu(); };
  const kopf = <>
    <KF label="Auftrag" nurLesen wert={<b>{b.nr}</b>} />
    <KF label="Position" nurLesen wert={p.pos} />
    <KF label="Artikel" nurLesen wert={a ? artikelIdxText(a, posIdx(d, p)) : p.text || ""}
      menue={a && [["Artikel öffnen", () => artikelFensterOeffnen(d, aussen, a)], ["Artikel-Cockpit", () => cockpitOeffnen(d, aussen, a)]]} />
    <KF label="Kunde" nurLesen wert={kunde ? partnerText(kunde) : ""} />
    <KF label="Bestellnummer" nurLesen wert={bd.ihre_nr || ""} />
    <KF label="Bestelldatum" nurLesen wert={bd.ihre_datum ? datumText(bd.ihre_datum) : datumText(b.datum)} />
    {bd.zeichen && <KF label="Bestellzeichen" nurLesen wert={bd.zeichen} />}
    <KF label="Menge Position" nurLesen rechts wert={mengeText(zahl(p.menge)) + " " + (p.einheit || "")} />
  </>;
  const fuss = <>
    <span className="gf-fuss__luecke" />
    {geaendert && <span className="klein gf-geaendert">nicht gespeichert</span>}
    <button className="knopf knopf--still" data-nein="" onClick={schliessen}>Schliessen</button>
    <button className="knopf knopf--haupt" disabled={laeuft || !geaendert} data-erp-speichern="" onClick={async () => {
      setLaeuft(true); await tun(speichern); setLaeuft(false);
    }}>Speichern</button>
  </>;
  return (
    <GFenster titel={"Auftrag: Lieferplan " + b.nr + " / " + p.pos} kopf={kopf} fuss={fuss} zu={schliessen} attr={{ "data-erp-lieferplan": p.pos }}>
      <LieferplanAnsicht d={d} aussen={aussen} p={p} zeilen={zeilen} setZeilen={setZeilen} />
    </GFenster>
  );
}

export function naechsterAbruf(d, p) {
  let kum = 0;
  const g = geliefert(d, p);
  for (const x of p.daten.abrufe || []) { kum += zahl(x.menge); if (kum > g + 1e-9) return kum - g; }
  return 0;
}

function posStand(d, b, p) {
  if (b.typ === "auftrag") {
    const fa = folgePositionen(d, p.id, "fertigung").reduce((s, x) => s + zahl(x.menge), 0);
    return mengeText(geliefert(d, p)) + " geliefert" + (fa ? " · " + mengeText(fa) + " in FA" : "");
  }
  if (b.typ === "bestellung") return mengeText(gebucht(d, p.id, "eingang")) + " eingegangen";
  if (b.typ === "fertigung") return mengeText(gebucht(d, p.id, "fertig")) + " fertig";
  if (b.typ === "lieferschein") return folgePositionen(d, p.id, "rechnung").length ? "verrechnet" : "";
  return "";
}

// Arbeitsgänge des Fertigungsauftrags zum Abhaken
function Arbeitsgaenge({ d, b, frisch }) {
  const ap = (b.daten || {}).ap || [];
  if (!ap.length) return <p className="klein">Kein Arbeitsplan beim Artikel hinterlegt.</p>;
  const haken = async (i, an) => {
    const neu = ap.map((x, j) => (j === i ? { ...x, erledigt_am: an ? new Date().toISOString() : null, erledigt_von: an ? alt.meineProfilId() : null } : x));
    const r = await tun(() => aendern("erp_belege", b.id, { daten: { ...b.daten, ap: neu } }));
    if (r !== null) frisch();
  };
  // Position öffnen wie im Artikelfenster (seit 1.921.0, Patrick 27. November 2026: „ich kann die
  // Arbeitsplan-Positionen nicht öffnen“); Änderungen gelten nur für diesen FA
  const oeffnen = (i) => {
    const x = ap[i];
    formular({ titel: "Arbeitsgang " + (x.pos || (i + 1) * 10) + " · FA " + b.nr, felder: AG_FORM, breit: true,
      wert: { ...x, code: x.code || x.ag_code || "" },
      speichern: async (w) => {
        const neu = ap.map((y, j) => (j === i ? { ...y, ...w } : y));
        await aendern("erp_belege", b.id, { daten: { ...b.daten, ap: neu } });
        frisch();
      } });
  };
  return (
    <fieldset className="erp-liste erp-feld--breit"><legend>Arbeitsplan</legend>
      {ap.map((x, i) => (
        <div key={i} className="erp-ag-zeile">
          <label className="feld-haken erp-ag" data-erp-ag={i}>
            <input type="checkbox" checked={!!x.erledigt_am} onChange={(e) => haken(i, e.target.checked)} />
            <span><b>{x.pos || (i + 1) * 10}</b> {x.bez}{x.maschine ? " · " + x.maschine : ""}{x.te ? " · Stückzeit " + x.te + " s" : ""}
              {x.ruest ? " · Rüsten " + x.ruest + " h" : ""}{x.extern ? " · extern" : ""}{x.pauschal ? " · Pauschal " + x.pauschal + " " + (x.pauschal_einheit || "") : ""}{x.pruef ? " · " + x.pruef : ""}
              {x.erledigt_am && <small> · erledigt {datumText(x.erledigt_am)}</small>}</span>
          </label>
          <button type="button" className="knopf knopf--klein" data-erp-ag-oeffnen={i} onClick={() => oeffnen(i)}>Öffnen</button>
        </div>))}
    </fieldset>
  );
}

function Buchungen({ d, b }) {
  const liste = d.bewegungen.filter((x) => x.beleg_id === b.id);
  if (!liste.length) return null;
  return (
    <details className="erp-buchungen" open={b.typ === "fertigung"}>
      <summary>Lagerbuchungen ({liste.length})</summary>
      <Tabelle kopf={["Art", "Artikel", "Charge", "Lagerart", "Lagerplatz", "Menge", "Am"]}
        zeilen={liste.map((x) => ({ key: x.id, klasse: x.menge < 0 ? "erp-minus" : "",
          zellen: [x.art, artikelText(d.artikelMap.get(x.artikel_id)), x.charge, (d.lagerMap.get(x.lager_id) || {}).lagerart || "–", (d.lagerMap.get(x.lager_id) || {}).platz || "–", mengeText(x.menge), datumText(x.am)] }))} />
    </details>
  );
}

// ---------- Aktionen je Belegart ----------
function Aktionen({ d, b, aussen, frisch }) {
  // Jede Aktion holt zuerst den frischen Stand: in einem anderen Fenster
  // kann inzwischen gebucht worden sein (Fertigmeldung, Wareneingang)
  const k = [];
  const offen = b.status !== "storniert" && b.status !== "abgeschlossen";
  if (b.typ === "auftrag" && offen) {
    k.push(<button key="fa" className="knopf" data-erp-aktion="fa" onClick={async () => faErstellen(await frisch(), b, aussen)}>Fertigungsauftrag erstellen</button>);
    k.push(<button key="ls" className="knopf" data-erp-aktion="ls" onClick={async () => { const n = await frisch(); fensterOeffnen((zu) =>
      <LieferscheinFenster d={n} b={b} zu={zu} fertig={frisch} />); }}>Lieferschein erstellen</button>);
    k.push(<button key="pr" className="knopf" data-erp-aktion="pr" onClick={() => belegOeffnen(d, aussen, null, kopieVorlage(d, b, "proforma"))}>
      Proformarechnung</button>);
  }
  if (b.typ === "bestellung" && offen) {
    k.push(<button key="we" className="knopf" data-erp-aktion="we" onClick={async () => { const n = await frisch(); fensterOeffnen((zu) =>
      <EingangFenster d={n} b={b} zu={zu} fertig={frisch} />); }}>Wareneingang buchen</button>);
  }
  if (b.typ === "fertigung" && offen) {
    k.push(<button key="mat" className="knopf" data-erp-aktion="material" onClick={async () => { const n = await frisch(); fensterOeffnen((zu) =>
      <MaterialFenster d={n} b={b} zu={zu} fertig={frisch} />); }}>Material entnehmen</button>);
    k.push(<button key="fm" className="knopf" data-erp-aktion="fertig" onClick={async () => { const n = await frisch(); fensterOeffnen((zu) =>
      <FertigFenster d={n} b={b} zu={zu} fertig={frisch} />); }}>Fertig melden</button>);
  }
  if (b.typ === "rechnung") {
    k.push(<button key="gs" className="knopf" data-erp-aktion="gs" onClick={() => belegOeffnen(d, aussen, null, kopieVorlage(d, b, "gutschrift"))}>
      Gutschrift aus Rechnung</button>);
  }
  const folge = d.belege.filter((x) => x.bezug_id === b.id || (d.posJe.get(x.id) || [])
    .some((p) => (d.posJe.get(b.id) || []).some((q) => q.id === p.bezug_id)));
  return (
    <>
      {k.length > 0 && <div className="erp-aktionen">{k}</div>}
      {folge.length > 0 && <p className="erp-folge">Folgebelege: {folge.map((x) => (
        <button key={x.id} className="knopf knopf--klein knopf--still" onClick={() => belegOeffnen(d, aussen, x)}>
          {BELEGTYP[x.typ].kurz} {x.nr}</button>))}</p>}
    </>
  );
}

// Gutschrift aus Rechnung, Proforma aus Auftrag: Positionen mit Verweis
function kopieVorlage(d, b, typ) {
  const p = d.partnerMap.get(b.partner_id);
  const pd = (p && p.daten) || {};
  const rechnungAn = anschriften(p, "rechnung");
  return {
    typ, partner_id: b.partner_id, bezug_id: b.id,
    daten: { ...b.daten, fibu_am: null, anschrift: typ === "lieferschein" ? b.daten.anschrift : b.daten.rechnung_an || (rechnungAn[1] || rechnungAn[0])[1],
      mwst: b.daten.mwst ?? pd.mwst, text: typ === "gutschrift" ? "Gutschrift zu Rechnung " + b.nr : b.daten.text },
    positionen: (d.posJe.get(b.id) || []).map((x) => ({ ...x, id: null, bezug_id: x.id, termin: null })),
  };
}

async function faErstellen(d, b, aussen) {
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id);
  if (!pos.length) { alt.meldung("Keine Position mit Artikel.", "warn"); return; }
  const offen = (p) => Math.max(0, zahl(p.menge) - folgePositionen(d, p.id, "fertigung").reduce((s, x) => s + zahl(x.menge), 0));
  const w = await alt.dialogFelder({
    titel: "Fertigungsauftrag erstellen", bestaetigen: "Erstellen",
    text: "Der Fertigungsauftrag übernimmt den Arbeitsplan des Artikels (mit Index).",
    felder: [
      { name: "pos", label: "Position", auswahl: pos.map((p) => [p.id, p.pos + " · " + artikelText(d.artikelMap.get(p.artikel_id)) + " · offen " + mengeText(offen(p))]), wert: pos[0].id },
      { name: "menge", label: "Menge", wert: String(offen(pos[0]) || pos[0].menge), dezimal: true, pflicht: true },
      { name: "termin", label: "Fertig bis", typ: "date", wert: pos[0].termin || "" },
    ],
  });
  if (!w) return;
  const p = pos.find((x) => x.id === w.pos);
  const a = d.artikelMap.get(p.artikel_id);
  const fa = await tun(async () => {
    const kopf = await einfuegen("erp_belege", { typ: "fertigung", nr: naechsteBelegNr(d, "fertigung"), partner_id: b.partner_id,
      datum: heute(), bezug_id: b.id, daten: { ap: (a.arbeitsplan || []).map((x) => ({ ...x, erledigt_am: null })) } });
    await einfuegen("erp_positionen", { beleg_id: kopf.id, pos: 10, artikel_id: a.id, menge: zahl(w.menge), einheit: p.einheit,
      termin: w.termin || null, bezug_id: p.id, daten: {} });
    return kopf;
  }, "Fertigungsauftrag erstellt.");
  if (fa) { const n = await allesLaden(); aussen(); belegOeffnen(n, aussen, n.belegMap.get(fa.id)); }
}

// Bestand eines Artikels als Auswahl. Nur genau dieser Artikel samt Index:
// Bestand mit Index A kann einen Auftrag mit Index B nie beliefern.
export function chargenWahl(d, artikelId, idx) {
  return bestand(d, artikelId).filter((e) => e.menge > 0 && (idx == null || e.idx === idx))
    .map((e) => [e.charge + "|" + (e.lager_id || ""), "Charge " + e.charge + " · " + lagerText(d, e.lager_id) + " · " + mengeText(e.menge), e]);
}

export function LieferscheinFenster({ d, b, zu, fertig, nurPos }) {
  // Aus einer Position: nur diese; aus dem Kopf: alle zur Auswahl
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id && (!nurPos || p.id === nurPos));
  const [w, setW] = useState(() => pos.map((p) => {
    const offen = Math.max(0, zahl(p.menge) - geliefert(d, p));
    const ch = chargenWahl(d, p.artikel_id, posIdx(d, p));
    const vor = b.art === "rahmen" ? Math.min(offen, naechsterAbruf(d, p)) : offen;
    return { id: p.id, an: offen > 0 && ch.length > 0, menge: String(ch.length ? Math.min(vor, ch[0][2].menge) : vor), charge: ch.length ? ch[0][0] : "" };
  }));
  const [laeuft, setLaeuft] = useState(false);
  const setzen = (i, name, v) => setW((l) => l.map((x, j) => (j === i ? { ...x, [name]: v } : x)));
  const los = async () => {
    const wahl = w.map((x, i) => ({ ...x, p: pos[i] })).filter((x) => x.an && zahl(x.menge) > 0);
    if (!wahl.length) { alt.meldung("Keine Menge gewählt.", "warn"); return; }
    for (const x of wahl) {
      const e = chargenWahl(d, x.p.artikel_id, posIdx(d, x.p)).find((c) => c[0] === x.charge);
      if (!e) throw new Error("Position " + x.p.pos + ": Charge wählen (nur Bestand mit gleichem Index).");
      if (zahl(x.menge) > e[2].menge + 1e-9) throw new Error("Position " + x.p.pos + ": nur " + mengeText(e[2].menge) + " an Lager in dieser Charge.");
    }
    setLaeuft(true);
    const ls = await einfuegen("erp_belege", { typ: "lieferschein", nr: naechsteBelegNr(d, "lieferschein"), partner_id: b.partner_id,
      datum: heute(), bezug_id: b.id, daten: { anschrift: b.daten.anschrift, rechnung_an: b.daten.rechnung_an, ihre_nr: b.daten.ihre_nr,
        ihre_datum: b.daten.ihre_datum, zeichen: b.daten.zeichen, liefer: b.daten.liefer, versand: b.daten.versand } });
    let n = 10;
    for (const x of wahl) {
      const [charge, lager] = x.charge.split("|");
      const lp = await einfuegen("erp_positionen", { beleg_id: ls.id, pos: n, artikel_id: x.p.artikel_id, text: x.p.text, menge: zahl(x.menge),
        einheit: x.p.einheit, bezug_id: x.p.id, daten: { charge, idx: posIdx(d, x.p) } });
      await buchen({ artikel_id: x.p.artikel_id, idx: posIdx(d, x.p), lager_id: lager || null, charge, menge: -zahl(x.menge), art: "lieferung",
        beleg_id: ls.id, position_id: lp.id, herkunft: "LS " + ls.nr });
      n += 10;
    }
    alt.meldung("Lieferschein " + ls.nr + " erstellt.", "gut");
    zu(); await fertig();
  };
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog">
      <h2>Lieferschein aus {b.nr}{nurPos && pos[0] ? ", Position " + pos[0].pos : ""}</h2>
      <p className="klein">Geliefert wird nur aus Bestand desselben Artikels mit demselben Index. Ohne Bestand zuerst einen Fertigungsauftrag fertig melden.</p>
      {pos.map((p, i) => {
        const a = d.artikelMap.get(p.artikel_id);
        const ch = chargenWahl(d, p.artikel_id, posIdx(d, p));
        return (
          <div key={p.id} className="erp-liste__zeile erp-wahlzeile" data-erp-lspos={p.pos}>
            <label className="feld-haken"><input type="checkbox" checked={w[i].an} onChange={(e) => setzen(i, "an", e.target.checked)} />
              <span><b>{p.pos}</b> {artikelIdxText(a, posIdx(d, p))}<br /><small>bestellt {mengeText(p.menge)}, geliefert {mengeText(geliefert(d, p))}
                {b.art === "rahmen" && naechsterAbruf(d, p) ? ", nächster Abruf " + mengeText(naechsterAbruf(d, p)) : ""}</small></span></label>
            <Feld f={{ name: "menge", label: "Menge", typ: "zahl" }} wert={w[i].menge} setzen={(v) => setzen(i, "menge", v)} />
            <Feld f={{ name: "charge", label: "Charge", auswahl: ch.length ? ch.map(([k, t]) => [k, t]) : [["", "kein Bestand mit Index " + (posIdx(d, p) || "–")]] }}
              wert={w[i].charge} setzen={(v) => setzen(i, "charge", v)} />
          </div>);
      })}
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" disabled={laeuft} data-erp-ja="" onClick={async () => { await tun(los); setLaeuft(false); }}>
          Lieferschein erstellen</button>
      </div>
    </div>
  );
}

export function EingangFenster({ d, b, zu, fertig }) {
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id);
  const [w, setW] = useState(() => pos.map((p) => {
    const offen = Math.max(0, zahl(p.menge) - gebucht(d, p.id, "eingang"));
    return { an: offen > 0, menge: String(offen), charge: "WE-" + b.nr + "-" + p.pos, lief: "", ...lagerStart(d, d.artikelMap.get(p.artikel_id)) };
  }));
  const setzen = (i, name, v) => setW((l) => l.map((x, j) => (j === i ? { ...x, [name]: v } : x)));
  const lief = d.partnerMap.get(b.partner_id) || {};
  const los = async () => {
    const wahl = w.map((x, i) => ({ ...x, p: pos[i] })).filter((x) => x.an && zahl(x.menge) > 0);
    if (!wahl.length) throw new Error("Keine Menge gewählt.");
    for (const x of wahl) {
      if (!x.charge.trim()) throw new Error("Position " + x.p.pos + ": Charge fehlt.");
    }
    for (const x of wahl) x.lagerId = await lagerAus(d, d.artikelMap.get(x.p.artikel_id), x);
    for (const x of wahl) {
      await buchen({ artikel_id: x.p.artikel_id, idx: posIdx(d, x.p), lager_id: x.lagerId, charge: x.charge.trim(), menge: zahl(x.menge), art: "eingang",
        beleg_id: b.id, position_id: x.p.id, herkunft: "Lieferant " + (lief.nr || "") + " " + (lief.name || ""),
        notiz: x.lief ? "Charge Lieferant " + x.lief : null });
    }
    alt.meldung("Wareneingang gebucht.", "gut");
    zu(); await fertig();
  };
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog">
      <h2>Wareneingang {b.nr}</h2>
      {pos.map((p, i) => (
        <div key={p.id} className="erp-liste__zeile erp-wahlzeile" data-erp-wepos={p.pos}>
          <label className="feld-haken"><input type="checkbox" checked={w[i].an} onChange={(e) => setzen(i, "an", e.target.checked)} />
            <span><b>{p.pos}</b> {artikelText(d.artikelMap.get(p.artikel_id))}<br />
              <small>bestellt {mengeText(p.menge)}, eingegangen {mengeText(gebucht(d, p.id, "eingang"))}</small></span></label>
          <Feld f={{ name: "menge", label: "Menge", typ: "zahl" }} wert={w[i].menge} setzen={(v) => setzen(i, "menge", v)} />
          <Feld f={{ name: "charge", label: "Charge" }} wert={w[i].charge} setzen={(v) => setzen(i, "charge", v)} />
          <Feld f={{ name: "lief", label: "Charge / Zeugnis Lieferant" }} wert={w[i].lief} setzen={(v) => setzen(i, "lief", v)} />
          <LagerEingabe d={d} artikel={d.artikelMap.get(p.artikel_id)} w={w[i]} id={p.id} setzen={(n, v) => setzen(i, n, v)} />
        </div>))}
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-erp-ja="" onClick={() => tun(los)}>Buchen</button>
      </div>
    </div>
  );
}

function MaterialFenster({ d, b, zu, fertig }) {
  const p = (d.posJe.get(b.id) || [])[0];
  // Alles an Lager ausser dem Teil selbst: Rohmaterial, Werkzeug, Halbfabrikate
  // Dasselbe Teil mit anderem Index ist kein Material; Rohmaterial steht zuoberst
  const teil = p && d.artikelMap.get(p.artikel_id);
  const rang = (e) => ({ rohmaterial: 0, werkzeug: 2 }[(d.artikelMap.get(e.artikel_id) || {}).art] ?? 1);
  const wahl = bestand(d).filter((e) => e.menge > 0 && !(teil && (d.artikelMap.get(e.artikel_id) || {}).nr === teil.nr))
    .map((e) => [e.artikel_id + "|" + e.idx + "|" + e.charge + "|" + (e.lager_id || ""),
      artikelIdxText(d.artikelMap.get(e.artikel_id), e.idx) + " · Charge " + e.charge + " · " + lagerText(d, e.lager_id) + " · " + mengeText(e.menge), e])
    .sort((x, y) => rang(x[2]) - rang(y[2]) || x[1].localeCompare(y[1]));
  const [w, setW] = useState({ wahl: wahl.length ? wahl[0][0] : "", menge: "" });
  const los = async () => {
    const e = wahl.find((x) => x[0] === w.wahl);
    if (!e) throw new Error("Material wählen.");
    if (!(zahl(w.menge) > 0)) throw new Error("Menge fehlt.");
    if (zahl(w.menge) > e[2].menge + 1e-9) throw new Error("Nur " + mengeText(e[2].menge) + " an Lager.");
    await buchen({ artikel_id: e[2].artikel_id, idx: e[2].idx, lager_id: e[2].lager_id || null, charge: e[2].charge, menge: -zahl(w.menge), art: "entnahme",
      beleg_id: b.id, position_id: p ? p.id : null, herkunft: "FA " + b.nr });
    alt.meldung("Material entnommen.", "gut");
    zu(); await fertig();
  };
  return (
    <div className="dialog erp-fenster" role="dialog">
      <h2>Material für {b.nr}</h2>
      <p className="klein">Die Charge des Materials wird mit dem Fertigungsauftrag verknüpft. So lässt sich jedes Teil bis zum Rohmaterial zurückverfolgen.</p>
      <Feld f={{ name: "wahl", label: "Material und Charge", auswahl: wahl.length ? wahl.map(([k, t]) => [k, t]) : [["", "nichts an Lager"]], breit: true }}
        wert={w.wahl} setzen={(v) => setW((x) => ({ ...x, wahl: v }))} />
      <Feld f={{ name: "menge", label: "Menge", typ: "zahl" }} wert={w.menge} setzen={(v) => setW((x) => ({ ...x, menge: v }))} />
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-erp-ja="" onClick={() => tun(los)}>Entnehmen</button>
      </div>
    </div>
  );
}

export function FertigFenster({ d, b, zu, fertig }) {
  const p = (d.posJe.get(b.id) || [])[0];
  const a = p && d.artikelMap.get(p.artikel_id);
  const offen = p ? Math.max(0, zahl(p.menge) - gebucht(d, p.id, "fertig")) : 0;
  const [w, setW] = useState({ menge: String(offen), charge: b.nr, ...lagerStart(d, a) });
  const los = async () => {
    if (!p || !a) throw new Error("Der Fertigungsauftrag hat keinen Artikel.");
    if (!(zahl(w.menge) > 0)) throw new Error("Menge fehlt.");
    if (!d.bewegungen.some((x) => x.beleg_id === b.id && x.art === "entnahme")
      && !(await alt.nachfragen({ titel: "Ohne Material?", text: "Für diesen Fertigungsauftrag ist noch kein Material entnommen. Die Charge hat dann keine Herkunft. Trotzdem fertig melden?", bestaetigen: "Trotzdem" }))) return;
    const lagerId = await lagerAus(d, a, w);
    await buchen({ artikel_id: a.id, idx: posIdx(d, p), lager_id: lagerId, charge: w.charge.trim() || b.nr, menge: zahl(w.menge), art: "fertig",
      beleg_id: b.id, position_id: p.id, herkunft: "FA " + b.nr });
    alt.meldung("Fertig gemeldet, " + mengeText(w.menge) + " " + (p.einheit || "") + " an Lager.", "gut");
    zu(); await fertig();
  };
  return (
    <div className="dialog erp-fenster" role="dialog">
      <h2>Fertig melden {b.nr}</h2>
      <p>{artikelIdxText(a, posIdx(d, p))} · offen {mengeText(offen)}</p>
      <Feld f={{ name: "menge", label: "Menge gut", typ: "zahl" }} wert={w.menge} setzen={(v) => setW((x) => ({ ...x, menge: v }))} />
      <Feld f={{ name: "charge", label: "Charge" }} wert={w.charge} setzen={(v) => setW((x) => ({ ...x, charge: v }))} />
      <LagerEingabe d={d} artikel={a} w={w} id="fertig" setzen={(n, v) => setW((x) => ({ ...x, [n]: v }))} />
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-erp-ja="" onClick={() => tun(los)}>Fertig melden</button>
      </div>
    </div>
  );
}

// ---------- Rechnungen ----------
const RE_ARTEN = [["rechnung", "Rechnungen"], ["gutschrift", "Gutschriften"], ["proforma", "Proforma"]];
const gemerkt = { re: "rechnung" };

export function Rechnungen({ d, neu }) {
  const [typ, setTyp] = useState(gemerkt.re);
  gemerkt.re = typ;
  const offeneLs = lsOffen(d);
  return (
    <>
      <div className="mat-kopf">
        {RE_ARTEN.map(([w, t]) => <button key={w} className={"knopf" + (typ === w ? " knopf--haupt" : "")} data-erp-reart={w}
          onClick={() => setTyp(w)}>{t}</button>)}
      </div>
      <div className="mat-kopf">
        <button className="knopf knopf--haupt" data-erp-aktion="re-ls" onClick={() => fensterOeffnen((zu) => <AusLsFenster d={d} zu={zu} neu={neu} />)}>
          Rechnungen aus Lieferscheinen{offeneLs.length ? " (" + offeneLs.length + ")" : ""}</button>
        <button className="knopf" onClick={() => belegOeffnen(d, neu, null, { typ: "rechnung" })}>+ Freie Rechnung</button>
        <button className="knopf" onClick={() => belegOeffnen(d, neu, null, { typ: "gutschrift" })}>+ Freie Gutschrift</button>
        <button className="knopf" onClick={() => belegOeffnen(d, neu, null, { typ: "proforma" })}>+ Proformarechnung</button>
      </div>
      <BelegListe d={d} neu={neu} typ={typ} ohneNeu />
    </>
  );
}

// Lieferscheine mit Positionen, die noch nicht verrechnet sind
function lsOffen(d) {
  return d.belege.filter((b) => b.typ === "lieferschein" && b.status !== "storniert" && b.status !== "abgeschlossen"
    && (d.posJe.get(b.id) || []).some((p) => !folgePositionen(d, p.id, "rechnung").length));
}

function AusLsFenster({ d, zu, neu }) {
  const liste = lsOffen(d).sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  const [an, setAn] = useState(() => new Set(liste.map((b) => b.id)));
  const los = async () => {
    const wahl = liste.filter((b) => an.has(b.id));
    if (!wahl.length) throw new Error("Keinen Lieferschein gewählt.");
    // Sammelrechnung: ein Beleg je Kunde, sonst einer je Lieferschein
    const gruppen = new Map();
    wahl.forEach((ls) => {
      const p = d.partnerMap.get(ls.partner_id) || {};
      const k = (p.daten || {}).sammel ? "k" + ls.partner_id : "l" + ls.id;
      if (!gruppen.has(k)) gruppen.set(k, []);
      gruppen.get(k).push(ls);
    });
    let d2 = d, n = 0;
    for (const lsListe of gruppen.values()) {
      const ls0 = lsListe[0];
      const p = d.partnerMap.get(ls0.partner_id);
      const pd = (p && p.daten) || {};
      const an2 = anschriften(p, "rechnung");
      const re = await einfuegen("erp_belege", { typ: "rechnung", nr: naechsteBelegNr(d2, "rechnung"), partner_id: ls0.partner_id, datum: heute(),
        bezug_id: lsListe.length === 1 ? ls0.id : null,
        daten: { liefer: pd.liefer || ls0.daten.liefer, zahlung: pd.zahlung, mwst: pd.mwst, anschrift: ls0.daten.rechnung_an || (an2[1] || an2[0])[1],
          ihre_nr: [...new Set(lsListe.map((x) => x.daten.ihre_nr).filter(Boolean))].join(", "),
          text: "Lieferschein " + lsListe.map((x) => x.nr + " vom " + datumText(x.datum)).join(", ") } });
      // Damit die nächste Nummer weiterzählt, ohne neu zu laden
      d2 = { ...d2, belege: d2.belege.concat([re]) };
      let i = 10;
      for (const ls of lsListe) {
        for (const lp of (d.posJe.get(ls.id) || []).filter((x) => !folgePositionen(d, x.id, "rechnung").length)) {
          const auf = d.posMap.get(lp.bezug_id);
          const a = d.artikelMap.get(lp.artikel_id);
          await einfuegen("erp_positionen", { beleg_id: re.id, pos: i, artikel_id: lp.artikel_id, text: lp.text, menge: lp.menge, einheit: lp.einheit,
            // Preis samt Preiseinheit aus dem Auftrag, sonst aus der Preisliste nach Menge
            ...(auf && auf.preis != null ? { preis: auf.preis, daten: { charge: lp.daten.charge, ls: ls.nr, pe: posPe(auf) } }
              : (() => { const vp = preisFuerMenge(a, lp.menge); return { preis: vp ? vp.preis : null, daten: { charge: lp.daten.charge, ls: ls.nr, pe: vp ? vp.pe : 1 } }; })()),
            bezug_id: lp.id });
          i += 10;
        }
      }
      n++;
    }
    alt.meldung(n + (n === 1 ? " Rechnung" : " Rechnungen") + " erstellt.", "gut");
    neu(); zu();
  };
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog">
      <h2>Rechnungen aus Lieferscheinen</h2>
      <p className="klein">Kunden mit Sammelrechnung bekommen eine Rechnung für alle gewählten Lieferscheine, alle anderen eine je Lieferschein. Der Preis kommt aus dem Auftrag.</p>
      {liste.length ? liste.map((ls) => {
        const p = d.partnerMap.get(ls.partner_id) || {};
        return (
          <label key={ls.id} className="feld-haken erp-wahlzeile" data-erp-lswahl={ls.nr}>
            <input type="checkbox" checked={an.has(ls.id)} onChange={(e) => setAn((s) => { const n = new Set(s); if (e.target.checked) n.add(ls.id); else n.delete(ls.id); return n; })} />
            <span><b>{ls.nr}</b> {datumText(ls.datum)} · {partnerText(p)} {(p.daten || {}).sammel ? "(Sammelrechnung)" : ""}<br />
              <small>{(d.posJe.get(ls.id) || []).map((x) => mengeText(x.menge) + " × " + artikelText(d.artikelMap.get(x.artikel_id))).join(", ")}</small></span>
          </label>);
      }) : <p>Alle Lieferscheine sind verrechnet.</p>}
      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-erp-ja="" onClick={() => tun(los)}>Rechnungen erstellen</button>
      </div>
    </div>
  );
}

// ---------- Fibu ----------
export function Fibu({ d, neu }) {
  const [alle, setAlle] = useState(false);
  const liste = d.belege.filter((b) => (b.typ === "rechnung" || b.typ === "gutschrift") && b.status !== "storniert")
    .filter((b) => alle || (!(b.daten || {}).fibu_am && b.status !== "abgeschlossen"));
  const [an, setAn] = useState(() => new Set());
  const gewaehlt = liste.filter((b) => an.has(b.id));
  const exportieren = async () => {
    if (!gewaehlt.length) throw new Error("Keine Belege gewählt.");
    const text = fibuText(d, gewaehlt);
    const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const l = document.createElement("a");
    l.href = url; l.download = "Fibu-Export-" + heute() + ".txt";
    document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    const jetzt = new Date().toISOString();
    for (const b of gewaehlt) await aendern("erp_belege", b.id, { daten: { ...b.daten, fibu_am: jetzt } });
    alt.meldung(gewaehlt.length + " Belege exportiert.", "gut");
    setAn(new Set()); neu();
  };
  return (
    <>
      <div className="karte karte--hinweis"><p><b>Schnittstelle Infoniqa:</b> Die Vorlage fehlt noch. Bis sie da ist, schreibt die App eine Textdatei
        mit einer Zeile je Rechnung oder Gutschrift (Semikolon: Belegart, Nr., Datum, fällig, Kunde, Netto, MWST, Brutto, Text).</p></div>
      <div className="mat-kopf">
        <button className="knopf" onClick={() => setAn(new Set(liste.filter((b) => !(b.daten || {}).fibu_am).map((b) => b.id)))}>Alle offenen wählen</button>
        <button className="knopf knopf--haupt" data-erp-aktion="fibu" onClick={() => tun(exportieren)}>Export erstellen ({gewaehlt.length})</button>
        <label className="feld-haken"><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /><span>Auch schon exportierte</span></label>
      </div>
      <Tabelle kopf={["", "Beleg", "Datum", "Kunde", "Brutto CHF", "Fibu"]} leer="Nichts zu exportieren."
        zeilen={liste.map((b) => ({ key: b.id,
          zellen: [<input type="checkbox" checked={an.has(b.id)} onChange={(e) => setAn((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} />,
            <b>{BELEGTYP[b.typ].kurz} {b.nr}</b>, datumText(b.datum), partnerText(d.partnerMap.get(b.partner_id)),
            chf((b.typ === "gutschrift" ? -1 : 1) * belegSumme(d, b).brutto), (b.daten || {}).fibu_am ? datumText(b.daten.fibu_am) : "offen"] }))} />
    </>
  );
}

// ---------- Rückverfolgung ----------
export function Rueckverfolgung({ d, neu }) {
  const [suche, setSuche] = useState("");
  const s = suche.trim();
  const chargen = [...new Set(d.bewegungen.map((x) => x.charge))];
  const treffer = s ? chargen.filter((c) => c.toLowerCase().includes(s.toLowerCase())).slice(0, 30) : [];
  const belege = s ? d.belege.filter((b) => b.nr.toLowerCase().includes(s.toLowerCase())).slice(0, 10) : [];
  return (
    <>
      <div className="mat-kopf"><Suche wert={suche} setzen={setSuche} platzhalter="Charge oder Beleg-Nr. (LS, FA, BE …)" /></div>
      {!s && <p className="klein">Charge eintippen: woher sie kommt (Lieferant oder Fertigungsauftrag mit Material) und wohin sie ging (Kunde, Fertigung).</p>}
      {belege.map((b) => {
        const ch = [...new Set(d.bewegungen.filter((x) => x.beleg_id === b.id).map((x) => x.charge))];
        return <div key={b.id} className="karte erp-spur"><b>{BELEGTYP[b.typ].name} {b.nr}</b> · {partnerText(d.partnerMap.get(b.partner_id))}
          <button className="knopf knopf--klein" onClick={() => belegOeffnen(d, neu, b)}>Öffnen</button>
          {ch.length ? <div>Chargen: {ch.map((c) => <button key={c} className="knopf knopf--klein knopf--still" onClick={() => setSuche(c)}>{c}</button>)}</div>
            : <div className="klein">Keine Lagerbuchungen.</div>}</div>;
      })}
      {treffer.map((c) => <ChargeSpur key={c} d={d} charge={c} setSuche={setSuche} neu={neu} />)}
      {s && !treffer.length && !belege.length && <p>Nichts gefunden.</p>}
    </>
  );
}

function ChargeSpur({ d, charge, setSuche, neu }) {
  const v = chargeVerfolgen(d, charge);
  const zeile = (x) => {
    const b = d.belegMap.get(x.beleg_id);
    const p = b && d.partnerMap.get(b.partner_id);
    return (
      <li key={x.id}>{datumText(x.am)} · {x.art} · {mengeText(x.menge)} {artikelText(d.artikelMap.get(x.artikel_id))}
        {b && <> · <button className="knopf knopf--klein knopf--still" onClick={() => belegOeffnen(d, neu, b)}>{BELEGTYP[b.typ].kurz} {b.nr}</button></>}
        {p && " · " + partnerText(p)}{x.notiz ? " · " + x.notiz : ""}</li>);
  };
  return (
    <div className="karte erp-spur" data-erp-spur={charge}>
      <h3>Charge {charge}</h3>
      <div className="erp-spur__teil"><b>Herkunft</b><ul>{v.herkunft.length ? v.herkunft.map(zeile) : <li>keine</li>}</ul></div>
      {v.material.length > 0 && <div className="erp-spur__teil"><b>Material daraus</b><ul>{v.material.map((m) => (
        <li key={m.id}>{mengeText(-m.menge)} {artikelText(d.artikelMap.get(m.artikel_id))} · Charge{" "}
          <button className="knopf knopf--klein knopf--still" onClick={() => setSuche(m.charge)}>{m.charge}</button></li>))}</ul></div>}
      <div className="erp-spur__teil"><b>Verwendung</b><ul>{v.verwendung.length ? v.verwendung.map(zeile) : <li>noch an Lager</li>}</ul></div>
      <div className="klein">Bestand jetzt: {mengeText(v.bewegungen.reduce((s, x) => s + zahl(x.menge), 0))}</div>
    </div>
  );
}
