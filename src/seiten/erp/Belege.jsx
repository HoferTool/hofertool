// Test ERP: Belege. Aufträge (Einzel und Rahmen mit Lieferplan), daraus
// Fertigungsaufträge, Lieferscheine und Proforma; Bestellungen mit
// Wareneingang; Rechnungen aus Lieferscheinen, Gutschriften, Fibu-Export
// und Rückverfolgung über die Chargen.
// Warum alles über Bewegungen: Bestand, Liefermengen und Herkunft rechnet
// die App aus erp_bewegungen. So gibt es keinen zweiten Stand, der
// auseinanderlaufen kann, und jede Charge lässt sich zurückverfolgen.
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { Feld, Tabelle, Suche, passt, tun, belegDrucken } from "./teile.jsx";
import {
  allesLaden, einfuegen, aendern, loeschen, naechsteBelegNr, BELEGTYP, MWST, zahl, chf, mengeText, artikelText,
  partnerText, datumText, terminText, bestand, buchen, gebucht, folgePositionen, belegSumme, chargeVerfolgen, fibuText,
  posPe, posBetrag, peKurz, peZahl, preisFuerMenge, PE_AUSWAHL,
} from "../../daten/erp.js";

const heute = () => new Date().toISOString().slice(0, 10);
const mitPreis = (typ) => typ !== "lieferschein" && typ !== "fertigung";
const LAGER_JE_ART = { hofer: "FT", rohmaterial: "RM", werkzeug: "WZ" };

function lagerVorgabe(d, artikel) {
  const vor = LAGER_JE_ART[(artikel || {}).art] || "FT";
  return (d.lager.find((l) => l.platz.startsWith(vor)) || d.lager[0] || {}).id || "";
}
const lagerText = (d, id) => { const l = d.lagerMap.get(id); return l ? l.platz : "–"; };

// ---------- Stand eines Belegs ----------
// Gerechnet aus den Folgebelegen und Bewegungen, nicht gespeichert
export function belegStand(d, b) {
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id || zahl(p.menge));
  const anteil = (fn) => {
    const soll = pos.reduce((s, p) => s + zahl(p.menge), 0);
    const ist = pos.reduce((s, p) => s + Math.min(zahl(p.menge), fn(p)), 0);
    if (!soll || !ist) return 0;
    return ist >= soll - 1e-9 ? 2 : 1;
  };
  if (b.status === "storniert") return ["storniert", "erp-blass"];
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
    const begonnen = d.bewegungen.some((x) => x.beleg_id === b.id) || ((b.daten || {}).ap || []).some((x) => x.erledigt_am);
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

// ---------- Liste je Belegart ----------
export function BelegListe({ d, neu, typ, ohneNeu, hinweis }) {
  const [suche, setSuche] = useState("");
  const [nurOffen, setNurOffen] = useState(false);
  const t = BELEGTYP[typ];
  const liste = d.belege.filter((b) => b.typ === typ).filter((b) => {
    const p = d.partnerMap.get(b.partner_id) || {};
    const pos = (d.posJe.get(b.id) || []).map((x) => artikelText(d.artikelMap.get(x.artikel_id)) + " " + (x.text || "")).join(" ");
    return passt(suche, [b.nr, p.nr, p.name, (b.daten || {}).ihre_nr, pos, datumText(b.datum)].join(" "));
  }).map((b) => ({ b, stand: belegStand(d, b) }))
    .filter((x) => !nurOffen || !/^(geliefert|eingegangen|fertig|verrechnet|in Fibu|storniert)$/.test(x.stand[0]));
  return (
    <>
      <div className="mat-kopf">
        {!ohneNeu && <button className="knopf knopf--haupt" data-erp-neu={typ}
          onClick={() => belegOeffnen(d, neu, null, { typ })}>+ {t.name}</button>}
        <Suche wert={suche} setzen={setSuche} platzhalter="Nr., Kunde, Artikel …" />
        <label className="feld-haken"><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} />
          <span>Nur offene</span></label>
      </div>
      {hinweis && <p className="klein">{hinweis}</p>}
      <Tabelle kopf={["Nr.", "Datum", t.partner === "lieferant" ? "Lieferant" : "Kunde", "Artikel", mitPreis(typ) ? "Netto CHF" : "Menge", "Stand"]}
        leer={"Noch keine " + t.mehr + "."}
        zeilen={liste.map(({ b, stand }) => {
          const pos = d.posJe.get(b.id) || [];
          const art = pos.map((x) => { const a = d.artikelMap.get(x.artikel_id); return a ? a.nr + (a.idx ? " " + a.idx : "") : x.text; })
            .filter(Boolean);
          return {
            key: b.id, klasse: stand[1], klick: () => belegOeffnen(d, neu, b),
            zellen: [<b>{b.nr}</b>, datumText(b.datum), partnerText(d.partnerMap.get(b.partner_id)) + (b.art === "rahmen" ? " · Rahmen" : ""),
              art.slice(0, 3).join(", ") + (art.length > 3 ? " …" : ""),
              mitPreis(typ) ? chf(belegSumme(d, b).netto) : mengeText(pos.reduce((s, x) => s + zahl(x.menge), 0)), stand[0]],
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
      if (vorher && vorher.artikel_id !== (p.artikel_id || null) && d.bewegungen.some((x) => x.position_id === p.id)) {
        throw new Error("Position " + vorher.pos + " hat schon Buchungen, der Artikel (samt Index) lässt sich nicht mehr ändern.");
      }
    }
    for (const p of alte.filter((x) => !echte.some((y) => y.id === x.id))) {
      if (d.bewegungen.some((x) => x.position_id === p.id) || folgePositionen(d, p.id).length) {
        throw new Error("Position " + p.pos + " hat schon Buchungen oder Folgebelege und bleibt.");
      }
    }
    const zeile = { typ, partner_id: kopf.partner_id || null, art: kopf.art, status: kopf.status, datum: kopf.datum || heute(),
      bezug_id: kopf.bezug_id || null, daten: kopf.daten, geaendert_am: new Date().toISOString() };
    const bel = b ? await aendern("erp_belege", b.id, zeile)
      : await einfuegen("erp_belege", { ...zeile, nr: naechsteBelegNr(d, typ) });
    for (const p of alte.filter((x) => !echte.some((y) => y.id === x.id))) await loeschen("erp_positionen", p.id);
    for (let i = 0; i < echte.length; i++) {
      const p = echte[i];
      const w = { beleg_id: bel.id, pos: (i + 1) * 10, artikel_id: p.artikel_id || null, text: p.text || null,
        menge: zahl(p.menge), einheit: p.einheit || "Stk", preis: p.preis === "" || p.preis == null ? null : zahl(p.preis),
        termin: p.termin || null, termin_kw: p.termin_kw || null, bezug_id: p.bezug_id || null, daten: p.daten || {} };
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

  const stand = b ? belegStand(d, b) : null;
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog" data-erp-beleg={b ? b.nr : "neu"}>
      <h2>{t.name} {b ? b.nr : "neu"}{kopf.art === "rahmen" ? " · Rahmenauftrag" : ""}
        {stand && <span className={"erp-schild " + stand[1]}>{stand[0]}</span>}</h2>
      {bearbeiten || !b
        ? <KopfFelder d={d} kopf={kopf} setKopf={setKopf} setDaten={setDaten} />
        : <KopfAnsicht d={d} b={b} />}
      <Positionen d={d} kopf={kopf} pos={pos} setPos={setPos} bearbeiten={bearbeiten} b={b} />
      {b && !bearbeiten && typ === "fertigung" && <Arbeitsgaenge d={d} b={b} frisch={frisch} />}
      {b && !bearbeiten && <Buchungen d={d} b={b} />}
      {b && !bearbeiten && <Aktionen d={d} b={b} aussen={aussen} frisch={frisch} />}
      <div className="dialog__knoepfe">
        {b && !bearbeiten && <button className="knopf knopf--gefahr" onClick={belegLoeschen}>Löschen</button>}
        {b && !bearbeiten && <button className="knopf" onClick={() => belegDrucken(d, b)}>Drucken</button>}
        <button className="knopf knopf--still" data-nein="" onClick={() => {
          if (bearbeiten && b) { setBearbeiten(false); setKopf(kopfAus(b)); setPos(posAus(d.posJe.get(b.id) || [])); } else zu();
        }}>{bearbeiten && b ? "Abbrechen" : "Schliessen"}</button>
        {bearbeiten
          ? <button className="knopf knopf--haupt" disabled={laeuft} data-erp-speichern="" onClick={async () => {
            setLaeuft(true); await tun(speichern); setLaeuft(false);
          }}>Speichern</button>
          : <button className="knopf knopf--haupt" data-erp-bearbeiten="" onClick={() => setBearbeiten(true)}>Bearbeiten</button>}
      </div>
      {partner && partner.daten && partner.daten.hinweis && <p className="klein">Hinweis Partner: {partner.daten.hinweis}</p>}
    </div>
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

function KopfFelder({ d, kopf, setKopf, setDaten }) {
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
  const felder = [
    { name: "partner_id", label: t.partner === "lieferant" ? "Lieferant" : "Kunde",
      auswahl: [["", "— wählen —"]].concat(d.partner.filter((p) => p.art === t.partner && p.aktiv)
        .sort((a, b) => a.nr.localeCompare(b.nr)).map((p) => [p.id, p.nr + " " + p.name])) },
    { name: "datum", label: "Datum", typ: "datum" },
    (typ === "auftrag" || typ === "bestellung") && { name: "art", label: "Art", auswahl: [["einzel", "Einzelauftrag"], ["rahmen", "Rahmenauftrag (Lieferplan)"]] },
    { name: "status", label: "Status", auswahl: [["offen", "offen"], ["storniert", "storniert"]] },
  ];
  return (
    <div className="erp-formular">
      {felder.filter(Boolean).map((f) => <Feld key={f.name} f={f} wert={kopf[f.name]}
        setzen={(w) => (f.name === "partner_id" ? partnerWahl(w) : setKopf((k) => ({ ...k, [f.name]: w })))} />)}
      <Feld f={{ name: "ihre_nr", label: typ === "bestellung" ? "Auftragsbestätigung Lieferant" : "Ihre Bestellung" }}
        wert={kopf.daten.ihre_nr} setzen={(w) => setDaten("ihre_nr", w)} />
      {typ !== "fertigung" && <>
        <Feld f={{ name: "liefer", label: "Lieferbedingung", auswahl: bedAuswahl(d, "liefer") }} wert={kopf.daten.liefer} setzen={(w) => setDaten("liefer", w)} />
        <Feld f={{ name: "zahlung", label: "Zahlungsbedingung", auswahl: bedAuswahl(d, "zahlung") }} wert={kopf.daten.zahlung} setzen={(w) => setDaten("zahlung", w)} />
        {partner && <Feld f={{ name: "anschrift", label: anschriftTyp === "rechnung" ? "Rechnungsanschrift" : "Lieferanschrift",
          auswahl: wahl.map(([k, a], i) => [k, (i === 0 ? "Hauptadresse: " : "") + [a.name, a.ort].filter(Boolean).join(", ")]) }}
          wert={(wahl.find(([, a]) => JSON.stringify(a) === JSON.stringify(kopf.daten.anschrift)) || wahl[0])[0]}
          setzen={(w) => setDaten("anschrift", (wahl.find(([k]) => k === w) || wahl[0])[1])} />}
      </>}
      {mitPreis(typ) && <Feld f={{ name: "mwst", label: "MWST %", typ: "zahl", platzhalter: String(MWST) }}
        wert={kopf.daten.mwst} setzen={(w) => setDaten("mwst", w)} />}
      <Feld f={{ name: "text", label: "Text auf dem Beleg", typ: "textarea", breit: true }} wert={kopf.daten.text} setzen={(w) => setDaten("text", w)} />
    </div>
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
    bd.ihre_nr && [b.typ === "bestellung" ? "AB Lieferant" : "Ihre Bestellung", bd.ihre_nr],
    bed(bd.liefer) && ["Lieferung", bed(bd.liefer)],
    bed(bd.zahlung) && ["Zahlung", bed(bd.zahlung)],
    p && p.art === "kunde" && b.typ === "rechnung" && [ "Rechnung", (p.daten || {}).sammel ? "Sammelrechnung" : "Einzelrechnung"],
    p && (p.daten || {}).rechnung_mail && (b.typ === "rechnung" || b.typ === "gutschrift") && ["Rechnung an", p.daten.rechnung_mail],
    bd.fibu_am && ["Fibu", "exportiert am " + datumText(bd.fibu_am)],
    bd.text && ["Text", bd.text],
  ].filter(Boolean);
  return <dl className="erp-kopf">{zeilen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

// Artikel per Eingabe mit Vorschlägen: bei tausenden Artikeln ist eine Auswahl zu lang
let listenNr = 0;
function ArtikelWahl({ d, wert, setzen, gesperrt }) {
  const [nr] = useState(() => "erp-art-" + (++listenNr));
  const a = d.artikelMap.get(wert);
  const [text, setText] = useState(a ? artikelText(a) : "");
  const liste = d.artikel.filter((x) => x.aktiv).slice(0, 5000);
  return (
    <label className="feld erp-feld erp-feld--artikel"><span>Artikel</span>
      <input list={nr} value={text} disabled={gesperrt} data-erp-feld="artikel" placeholder="Nr. tippen …"
        onChange={(e) => {
          setText(e.target.value);
          const f = liste.find((x) => artikelText(x) === e.target.value) || liste.find((x) => x.nr === e.target.value.trim() && !x.idx);
          setzen(f ? f.id : "");
        }} />
      <datalist id={nr}>{liste.map((x) => <option key={x.id} value={artikelText(x)} />)}</datalist>
    </label>
  );
}

const ABRUF = [{ name: "termin", label: "Termin", typ: "datum" }, { name: "kw", label: "oder KW" }, { name: "menge", label: "Menge", typ: "zahl" }];

function Positionen({ d, kopf, pos, setPos, bearbeiten, b }) {
  const typ = kopf.typ;
  const preis = mitPreis(typ);
  const rahmen = kopf.art === "rahmen";
  const kw = ((d.partnerMap.get(kopf.partner_id) || {}).daten || {}).termin_art === "kw";
  const setzen = (i, name, w) => setPos((l) => l.map((p, j) => {
    if (j !== i) return p;
    const n = { ...p, [name]: w };
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
              key: p.id,
              zellen: [p.pos, <>{a ? <b>{artikelText(a)}</b> : p.text}{a && a.zeichnung && <small> · Zeichnung {a.zeichnung}{a.idx ? " Ind. " + a.idx : ""}</small>}
                {a && p.text && <><br /><small>{p.text}</small></>}{p.daten && p.daten.charge && <><br /><small>Charge {p.daten.charge}</small></>}
                {(p.daten.abrufe || []).length > 0 && <Lieferplan d={d} p={p} />}</>,
              mengeText(p.menge) + " " + (p.einheit || ""), terminText(p)]
                .concat(preis ? [p.preis != null ? chf(p.preis) + (posPe(p) > 1 ? " " + peKurz(posPe(p)) : "") : "", chf(posBetrag(p))] : [])
                .concat([posStand(d, b, p)]),
            };
          })} />
        {preis && s && <div className="erp-summe"><span>Netto {chf(s.netto)}</span><span>MWST {s.satz} % {chf(s.steuer)}</span><b>Total CHF {chf(s.brutto)}</b></div>}
      </>
    );
  }
  return (
    <fieldset className="erp-liste erp-feld--breit"><legend>Positionen</legend>
      {pos.map((p, i) => {
        const gesperrt = p.id && d.bewegungen.some((x) => x.position_id === p.id);
        return (
          <div key={p.id || "n" + i} className="erp-pos">
            <div className="erp-liste__zeile">
              <ArtikelWahl d={d} wert={p.artikel_id} setzen={(w) => setzen(i, "artikel_id", w)} gesperrt={gesperrt} />
              <Feld f={{ name: "menge", label: rahmen ? "Rahmenmenge" : "Menge", typ: "zahl" }} wert={p.menge} setzen={(w) => setzen(i, "menge", w)} />
              <Feld f={{ name: "einheit", label: "Einheit" }} wert={p.einheit} setzen={(w) => setzen(i, "einheit", w)} />
              {preis && <Feld f={{ name: "preis", label: "Preis CHF", typ: "zahl" }} wert={p.preis} setzen={(w) => setzen(i, "preis", w)} />}
              {preis && <Feld f={{ name: "pe", label: "pro", auswahl: PE_AUSWAHL }} wert={String(posPe(p))} setzen={(w) => setzen(i, "pe", w)} />}
              {!rahmen && (kw
                ? <Feld f={{ name: "termin_kw", label: "Termin KW", platzhalter: "48/2026" }} wert={p.termin_kw} setzen={(w) => setzen(i, "termin_kw", w)} />
                : <Feld f={{ name: "termin", label: "Termin", typ: "datum" }} wert={p.termin} setzen={(w) => setzen(i, "termin", w)} />)}
              <button type="button" className="knopf knopf--klein knopf--gefahr" title="Entfernen"
                onClick={() => setPos((l) => l.filter((_, j) => j !== i))}>✕</button>
            </div>
            <Feld f={{ name: "text", label: "Text (ohne Artikel: freie Position)", breit: true }} wert={p.text} setzen={(w) => setzen(i, "text", w)} />
            {rahmen && <Feld f={{ name: "abrufe", label: "Lieferplan (Abrufe)", typ: "liste", felder: ABRUF, neu: "Abruf" }}
              wert={p.daten.abrufe || []} setzen={(w) => setzen(i, "daten", { ...p.daten, abrufe: w })} />}
          </div>
        );
      })}
      <button type="button" className="knopf knopf--klein" data-erp-neupos=""
        onClick={() => setPos((l) => l.concat([{ artikel_id: "", text: "", menge: "", einheit: "Stk", preis: "", termin: "", termin_kw: "", daten: {} }]))}>
        + Position</button>
    </fieldset>
  );
}

function geliefert(d, p) {
  return folgePositionen(d, p.id, "lieferschein").reduce((s, x) => s + zahl(x.menge), 0);
}

// Abrufe eines Rahmenauftrags, abgehakt nach der gelieferten Menge
function Lieferplan({ d, p }) {
  let rest = geliefert(d, p);
  return (
    <ul className="erp-abrufe">{(p.daten.abrufe || []).map((x, i) => {
      const m = zahl(x.menge);
      const da = Math.min(m, rest); rest -= da;
      return <li key={i} className={da >= m ? "erp-gut" : ""}>{x.kw ? "KW " + x.kw : datumText(x.termin)}: {mengeText(m)}
        {da > 0 && da < m ? " (" + mengeText(da) + " geliefert)" : da >= m ? " ✓" : ""}</li>;
    })}</ul>
  );
}

function naechsterAbruf(d, p) {
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
  return (
    <fieldset className="erp-liste erp-feld--breit"><legend>Arbeitsplan</legend>
      {ap.map((x, i) => (
        <label key={i} className="feld-haken erp-ag" data-erp-ag={i}>
          <input type="checkbox" checked={!!x.erledigt_am} onChange={(e) => haken(i, e.target.checked)} />
          <span><b>{x.pos || (i + 1) * 10}</b> {x.bez}{x.maschine ? " · " + x.maschine : ""}{x.te ? " · te " + x.te + " s" : ""}
            {x.extern ? " · extern" : ""}{x.pruef ? " · " + x.pruef : ""}
            {x.erledigt_am && <small> · erledigt {datumText(x.erledigt_am)}</small>}</span>
        </label>))}
    </fieldset>
  );
}

function Buchungen({ d, b }) {
  const liste = d.bewegungen.filter((x) => x.beleg_id === b.id);
  if (!liste.length) return null;
  return (
    <details className="erp-buchungen" open={b.typ === "fertigung"}>
      <summary>Lagerbuchungen ({liste.length})</summary>
      <Tabelle kopf={["Art", "Artikel", "Charge", "Lager", "Menge", "Am"]}
        zeilen={liste.map((x) => ({ key: x.id, klasse: x.menge < 0 ? "erp-minus" : "",
          zellen: [x.art, artikelText(d.artikelMap.get(x.artikel_id)), x.charge, lagerText(d, x.lager_id), mengeText(x.menge), datumText(x.am)] }))} />
    </details>
  );
}

// ---------- Aktionen je Belegart ----------
function Aktionen({ d, b, aussen, frisch }) {
  // Jede Aktion holt zuerst den frischen Stand: in einem anderen Fenster
  // kann inzwischen gebucht worden sein (Fertigmeldung, Wareneingang)
  const k = [];
  const offen = b.status !== "storniert";
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
    daten: { ...b.daten, fibu_am: null, anschrift: typ === "lieferschein" ? b.daten.anschrift : (rechnungAn[1] || rechnungAn[0])[1],
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
function chargenWahl(d, artikelId) {
  return bestand(d, artikelId).filter((e) => e.menge > 0)
    .map((e) => [e.charge + "|" + (e.lager_id || ""), "Charge " + e.charge + " · " + lagerText(d, e.lager_id) + " · " + mengeText(e.menge), e]);
}

function LieferscheinFenster({ d, b, zu, fertig }) {
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id);
  const [w, setW] = useState(() => pos.map((p) => {
    const offen = Math.max(0, zahl(p.menge) - geliefert(d, p));
    const ch = chargenWahl(d, p.artikel_id);
    const vor = b.art === "rahmen" ? Math.min(offen, naechsterAbruf(d, p)) : offen;
    return { id: p.id, an: offen > 0 && ch.length > 0, menge: String(ch.length ? Math.min(vor, ch[0][2].menge) : vor), charge: ch.length ? ch[0][0] : "" };
  }));
  const [laeuft, setLaeuft] = useState(false);
  const setzen = (i, name, v) => setW((l) => l.map((x, j) => (j === i ? { ...x, [name]: v } : x)));
  const los = async () => {
    const wahl = w.map((x, i) => ({ ...x, p: pos[i] })).filter((x) => x.an && zahl(x.menge) > 0);
    if (!wahl.length) { alt.meldung("Keine Menge gewählt.", "warn"); return; }
    for (const x of wahl) {
      const e = chargenWahl(d, x.p.artikel_id).find((c) => c[0] === x.charge);
      if (!e) throw new Error("Position " + x.p.pos + ": Charge wählen (nur Bestand mit gleichem Index).");
      if (zahl(x.menge) > e[2].menge + 1e-9) throw new Error("Position " + x.p.pos + ": nur " + mengeText(e[2].menge) + " an Lager in dieser Charge.");
    }
    setLaeuft(true);
    const ls = await einfuegen("erp_belege", { typ: "lieferschein", nr: naechsteBelegNr(d, "lieferschein"), partner_id: b.partner_id,
      datum: heute(), bezug_id: b.id, daten: { anschrift: b.daten.anschrift, ihre_nr: b.daten.ihre_nr, liefer: b.daten.liefer } });
    let n = 10;
    for (const x of wahl) {
      const [charge, lager] = x.charge.split("|");
      const lp = await einfuegen("erp_positionen", { beleg_id: ls.id, pos: n, artikel_id: x.p.artikel_id, text: x.p.text, menge: zahl(x.menge),
        einheit: x.p.einheit, bezug_id: x.p.id, daten: { charge } });
      await buchen({ artikel_id: x.p.artikel_id, lager_id: lager || null, charge, menge: -zahl(x.menge), art: "lieferung",
        beleg_id: ls.id, position_id: lp.id, herkunft: "LS " + ls.nr });
      n += 10;
    }
    alt.meldung("Lieferschein " + ls.nr + " erstellt.", "gut");
    zu(); await fertig();
  };
  return (
    <div className="dialog erp-fenster erp-fenster--breit" role="dialog">
      <h2>Lieferschein aus {b.nr}</h2>
      <p className="klein">Geliefert wird nur aus Bestand desselben Artikels mit demselben Index. Ohne Bestand zuerst einen Fertigungsauftrag fertig melden.</p>
      {pos.map((p, i) => {
        const a = d.artikelMap.get(p.artikel_id);
        const ch = chargenWahl(d, p.artikel_id);
        return (
          <div key={p.id} className="erp-liste__zeile erp-wahlzeile" data-erp-lspos={p.pos}>
            <label className="feld-haken"><input type="checkbox" checked={w[i].an} onChange={(e) => setzen(i, "an", e.target.checked)} />
              <span><b>{p.pos}</b> {artikelText(a)}<br /><small>bestellt {mengeText(p.menge)}, geliefert {mengeText(geliefert(d, p))}
                {b.art === "rahmen" && naechsterAbruf(d, p) ? ", nächster Abruf " + mengeText(naechsterAbruf(d, p)) : ""}</small></span></label>
            <Feld f={{ name: "menge", label: "Menge", typ: "zahl" }} wert={w[i].menge} setzen={(v) => setzen(i, "menge", v)} />
            <Feld f={{ name: "charge", label: "Charge", auswahl: ch.length ? ch.map(([k, t]) => [k, t]) : [["", "kein Bestand mit Index " + (a.idx || "–")]] }}
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

function EingangFenster({ d, b, zu, fertig }) {
  const pos = (d.posJe.get(b.id) || []).filter((p) => p.artikel_id);
  const [w, setW] = useState(() => pos.map((p) => {
    const offen = Math.max(0, zahl(p.menge) - gebucht(d, p.id, "eingang"));
    return { an: offen > 0, menge: String(offen), charge: "WE-" + b.nr + "-" + p.pos, lager: lagerVorgabe(d, d.artikelMap.get(p.artikel_id)), lief: "" };
  }));
  const setzen = (i, name, v) => setW((l) => l.map((x, j) => (j === i ? { ...x, [name]: v } : x)));
  const lagerWahl = d.lager.map((l) => [l.id, l.platz + (l.bezeichnung ? " · " + l.bezeichnung : "")]);
  const lief = d.partnerMap.get(b.partner_id) || {};
  const los = async () => {
    const wahl = w.map((x, i) => ({ ...x, p: pos[i] })).filter((x) => x.an && zahl(x.menge) > 0);
    if (!wahl.length) throw new Error("Keine Menge gewählt.");
    for (const x of wahl) {
      if (!x.charge.trim()) throw new Error("Position " + x.p.pos + ": Charge fehlt.");
      await buchen({ artikel_id: x.p.artikel_id, lager_id: x.lager || null, charge: x.charge.trim(), menge: zahl(x.menge), art: "eingang",
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
          <Feld f={{ name: "lager", label: "Lager", auswahl: lagerWahl }} wert={w[i].lager} setzen={(v) => setzen(i, "lager", v)} />
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
    .map((e) => [e.artikel_id + "|" + e.charge + "|" + (e.lager_id || ""),
      artikelText(d.artikelMap.get(e.artikel_id)) + " · Charge " + e.charge + " · " + lagerText(d, e.lager_id) + " · " + mengeText(e.menge), e])
    .sort((x, y) => rang(x[2]) - rang(y[2]) || x[1].localeCompare(y[1]));
  const [w, setW] = useState({ wahl: wahl.length ? wahl[0][0] : "", menge: "" });
  const los = async () => {
    const e = wahl.find((x) => x[0] === w.wahl);
    if (!e) throw new Error("Material wählen.");
    if (!(zahl(w.menge) > 0)) throw new Error("Menge fehlt.");
    if (zahl(w.menge) > e[2].menge + 1e-9) throw new Error("Nur " + mengeText(e[2].menge) + " an Lager.");
    await buchen({ artikel_id: e[2].artikel_id, lager_id: e[2].lager_id || null, charge: e[2].charge, menge: -zahl(w.menge), art: "entnahme",
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

function FertigFenster({ d, b, zu, fertig }) {
  const p = (d.posJe.get(b.id) || [])[0];
  const a = p && d.artikelMap.get(p.artikel_id);
  const offen = p ? Math.max(0, zahl(p.menge) - gebucht(d, p.id, "fertig")) : 0;
  const [w, setW] = useState({ menge: String(offen), charge: b.nr, lager: lagerVorgabe(d, a) });
  const los = async () => {
    if (!p || !a) throw new Error("Der Fertigungsauftrag hat keinen Artikel.");
    if (!(zahl(w.menge) > 0)) throw new Error("Menge fehlt.");
    if (!d.bewegungen.some((x) => x.beleg_id === b.id && x.art === "entnahme")
      && !(await alt.nachfragen({ titel: "Ohne Material?", text: "Für diesen Fertigungsauftrag ist noch kein Material entnommen. Die Charge hat dann keine Herkunft. Trotzdem fertig melden?", bestaetigen: "Trotzdem" }))) return;
    await buchen({ artikel_id: a.id, lager_id: w.lager || null, charge: w.charge.trim() || b.nr, menge: zahl(w.menge), art: "fertig",
      beleg_id: b.id, position_id: p.id, herkunft: "FA " + b.nr });
    alt.meldung("Fertig gemeldet, " + mengeText(w.menge) + " " + (p.einheit || "") + " an Lager.", "gut");
    zu(); await fertig();
  };
  return (
    <div className="dialog erp-fenster" role="dialog">
      <h2>Fertig melden {b.nr}</h2>
      <p>{artikelText(a)} · offen {mengeText(offen)}</p>
      <Feld f={{ name: "menge", label: "Menge gut", typ: "zahl" }} wert={w.menge} setzen={(v) => setW((x) => ({ ...x, menge: v }))} />
      <Feld f={{ name: "charge", label: "Charge" }} wert={w.charge} setzen={(v) => setW((x) => ({ ...x, charge: v }))} />
      <Feld f={{ name: "lager", label: "Lager", auswahl: d.lager.map((l) => [l.id, l.platz]) }} wert={w.lager} setzen={(v) => setW((x) => ({ ...x, lager: v }))} />
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
  return d.belege.filter((b) => b.typ === "lieferschein" && b.status !== "storniert"
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
        daten: { liefer: pd.liefer || ls0.daten.liefer, zahlung: pd.zahlung, mwst: pd.mwst, anschrift: (an2[1] || an2[0])[1],
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
    .filter((b) => alle || !(b.daten || {}).fibu_am);
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
