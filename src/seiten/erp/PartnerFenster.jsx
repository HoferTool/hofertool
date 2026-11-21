// Test ERP: Kunde und Lieferant wie im Gewatec, im Stil des HoferTools
// (Patrick 21. November 2026, Bilder Adresse, Lieferanschrift,
// Rechnungsanschrift, Parameter; „es geht nur um die Grundfunktionalität“).
// Kopf mit Code, Matchcode, Gruppe; Reiter Adresse, Lieferanschrift,
// Rechnungsanschrift, Parameter, Beschreibung, Ansprechpartner.
// Nur die Felder, die wir heute brauchen (keine Bankverbindung,
// Zertifizierung, Provision, Packmittel usw.).
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { formular, tun } from "./teile.jsx";
import { GFenster, KF, Gruppe, GTabelle, schliessenFragen } from "./Stamm.jsx";
import { allesLaden, einfuegen, aendern, loeschen, naechstePartnerNr, mapsLink, BELEGTYP, datumText, chf, belegSumme } from "../../daten/erp.js";
import { belegOeffnen, belegStand } from "./Belege.jsx";
import { cockpitOeffnen } from "./Cockpit.jsx";
import { artikelFensterOeffnen } from "./ArtikelFenster.jsx";

// p: bestehender Partner oder null; art: kunde | lieferant (für neue)
export function partnerFensterOeffnen(d, aussen, p, art, reiter) {
  fensterOeffnen((zu) => <PartnerFenster start={d} aussen={aussen} p0={p} art={p ? p.art : art || "kunde"} reiter0={reiter} zu={zu} />);
}

const LAENDER = [["CH", "Schweiz"], ["DE", "Deutschland"], ["AT", "Österreich"], ["FR", "Frankreich"], ["IT", "Italien"],
  ["LI", "Liechtenstein"], ["NL", "Niederlande"], ["US", "USA"]];
const SPRACHEN = [["de", "Deutsch"], ["fr", "Französisch"], ["it", "Italienisch"], ["en", "Englisch"]];
const WAEHRUNGEN = [["CHF", "Schweizer Franken"], ["EUR", "Euro"], ["USD", "US-Dollar"]];

function formAus(p, d, art) {
  const pd = (p && p.daten) || {};
  const ad = pd.adresse || {};
  return {
    nr: p ? p.nr : naechstePartnerNr(d, art), name: p ? p.name : "", gruppe: (p && p.gruppe) || "", aktiv: p ? p.aktiv !== false : true,
    name2: ad.name2 || "", strasse: ad.strasse || "", plz: ad.plz || "", ort: ad.ort || "", land: ad.land || "CH",
    telefon: pd.telefon || "", mail: pd.mail || "", webseite: pd.webseite || "",
    liefer: pd.liefer || "", zahlung: pd.zahlung || "",
    sprache: pd.sprache || "de", waehrung: pd.waehrung || "CHF", ust: pd.ust || "", unsere_nr: pd.unsere_nr || "",
    sammel: !!pd.sammel, termin_art: pd.termin_art || "datum", mwst: pd.mwst ?? "", rechnung_mail: pd.rechnung_mail || "",
    notiz: pd.notiz || "",
    // Frühere Anschriften ohne Werksbezeichnung bekommen beim Öffnen keine; die erste gilt als Standard
    anschriften: (pd.anschriften || []).map((x) => ({ ...x })), kontakte: (pd.kontakte || []).map((x) => ({ ...x })),
  };
}

function PartnerFenster({ start, aussen, p0, art, reiter0, zu }) {
  const [d, setD] = useState(start);
  const [id, setId] = useState(p0 ? p0.id : null);
  const p = id ? d.partnerMap.get(id) || p0 : null;
  const [w, setW] = useState(() => formAus(p0, start, art));
  const [basis, setBasis] = useState(() => JSON.stringify(formAus(p0, start, art)));
  const [reiter, setReiter] = useState(reiter0 || "adresse");
  const [laeuft, setLaeuft] = useState(false);
  const kunde = art === "kunde";
  const geaendert = JSON.stringify(w) !== basis;
  const set = (name) => (x) => setW((v) => ({ ...v, [name]: x }));
  const bed = (a) => [["", "—"]].concat(d.bedingungen.filter((b) => b.art === a).map((b) => [b.id, b.code + " · " + b.text]));

  const speichern = async () => {
    if (!/^\d{5}$/.test(w.nr.trim())) throw new Error("Der Code muss 5-stellig sein.");
    if (!w.name.trim()) throw new Error("Matchcode / Name fehlt.");
    if (d.partner.some((x) => x.id !== id && x.nr === w.nr.trim())) throw new Error("Diesen Code gibt es schon.");
    const zeile = { art, nr: w.nr.trim(), name: w.name.trim(), gruppe: w.gruppe.trim() || null, aktiv: !!w.aktiv,
      geaendert_am: new Date().toISOString(),
      daten: { ...((p0 && p0.daten) || {}),
        adresse: { name2: w.name2, strasse: w.strasse, plz: w.plz, ort: w.ort, land: w.land },
        telefon: w.telefon, mail: w.mail, webseite: w.webseite, liefer: w.liefer || null, zahlung: w.zahlung || null,
        sprache: w.sprache, waehrung: w.waehrung, ust: w.ust, unsere_nr: w.unsere_nr, sammel: !!w.sammel,
        termin_art: w.termin_art, mwst: w.mwst, rechnung_mail: w.rechnung_mail, notiz: w.notiz,
        anschriften: w.anschriften, kontakte: w.kontakte } };
    const r = id ? (await aendern("erp_partner", id, zeile)) || { ...zeile, id, nr: (p || {}).nr } : await einfuegen("erp_partner", zeile);
    const n = await allesLaden();
    setD(n); aussen(); setId(r.id);
    const f = formAus(n.partnerMap.get(r.id) || r, n, art);
    setW(f); setBasis(JSON.stringify(f));
    alt.meldung((kunde ? "Kunde " : "Lieferant ") + r.nr + " gespeichert.", "gut");
  };

  const schliessen = async () => { if (await schliessenFragen(geaendert, alt)) zu(); };
  const weg = async () => {
    if (!p) return zu();
    if (d.belege.some((b) => b.partner_id === p.id) || d.artikel.some((a) => a.kunde_id === p.id)) {
      alt.meldung("Es gibt Belege oder Artikel zu diesem Partner. Statt löschen: Aktiv ausschalten.", "warn"); return;
    }
    if (!(await alt.nachfragen({ titel: "Löschen", text: p.nr + " " + p.name + " löschen?", bestaetigen: "Löschen", gefahr: true }))) return;
    const r = await tun(() => loeschen("erp_partner", p.id), "Gelöscht.");
    if (r !== null) { aussen(); zu(); }
  };

  const belege = p ? d.belege.filter((b) => b.partner_id === p.id).sort((x, y) => (y.datum || "").localeCompare(x.datum || "")) : [];
  const artikel = p && kunde ? d.artikel.filter((a) => a.kunde_id === p.id) : [];
  const codeMenue = p && [["Belege", () => setReiter("belege")], kunde && ["Artikel des Kunden", () => setReiter("artikel")],
    kunde && artikel[0] && ["Artikel-Cockpit", () => cockpitOeffnen(d, aussen, artikel[0])],
    ...Object.entries(BELEGTYP).filter(([, t]) => t.partner === art && t.neu !== false).slice(0, 3)
      .map(([typ, t]) => ["+ " + t.name, () => belegOeffnen(d, aussen, null, { typ, partner_id: p.id })])];
  const karte = mapsLink(w);
  const webAdr = w.webseite && (/^https?:/.test(w.webseite) ? w.webseite : "https://" + w.webseite);

  const kopf = <>
    <KF label="Code" name="nr" wert={w.nr} setzen={set("nr")} menue={codeMenue} />
    <KF label="Art" wert={kunde ? "Kunde" : "Lieferant"} nurLesen />
    <KF label="Matchcode" name="name" wert={w.name} setzen={set("name")} breit />
    <KF label={kunde ? "Kundengruppe" : "Lieferantengruppe"} name="gruppe" wert={w.gruppe} setzen={set("gruppe")}
      platzhalter={kunde ? "z.B. Medizin, Uhren" : "z.B. Rohmaterial, Werkzeug"} />
    <KF label="Aktiv" typ="haken" name="aktiv" wert={w.aktiv} setzen={set("aktiv")} />
  </>;

  const reiterListe = [["adresse", "Adresse"], ["liefer", "Lieferanschrift"], kunde && ["rechnung", "Rechnungsanschrift"],
    ["parameter", "Parameter"], ["beschreibung", "Beschreibung"], ["kontakte", "Ansprechpartner"],
    p && ["belege", "Belege"], p && kunde && ["artikel", "Artikel"]];

  const fuss = <>
    {id && <button className="knopf knopf--gefahr" onClick={weg}>Löschen</button>}
    {kunde && artikel[0] && <button className="knopf" data-erp-partner-cockpit="" onClick={() => cockpitOeffnen(d, aussen, artikel[0])}>Artikel-Cockpit</button>}
    <span className="gf-fuss__luecke" />
    {geaendert && <span className="klein gf-geaendert">nicht gespeichert</span>}
    <button className="knopf knopf--still" data-nein="" onClick={schliessen}>Beenden</button>
    <button className="knopf knopf--haupt" disabled={laeuft || (!geaendert && !!id)} data-erp-speichern="" onClick={async () => {
      setLaeuft(true); await tun(speichern); setLaeuft(false);
    }}>Speichern</button>
  </>;

  return (
    <GFenster titel={(kunde ? "Kunde" : "Lieferant") + (p ? " " + p.nr + " " + p.name : " neu")} kopf={kopf} reiter={reiterListe}
      aktiv={reiter} setAktiv={setReiter} fuss={fuss} zu={schliessen} klasse="erp-partnerfenster" attr={{ "data-erp-partnerfenster": p ? p.nr : "neu" }}>
      {reiter === "adresse" && <div className="gf-spalten">
        <div>
          <Gruppe titel="Hausanschrift">
            <KF label="Name 1" wert={w.name} setzen={set("name")} name="adr_name" />
            <KF label="Name 2" wert={w.name2} setzen={set("name2")} name="name2" />
            <KF label="Strasse" wert={w.strasse} setzen={set("strasse")} name="strasse" />
            <div className="gf-plzort">
              <KF label="PLZ / Ort" wert={w.plz} setzen={set("plz")} name="plz" menue={karte && [["Auf der Karte zeigen", () => window.open(karte, "_blank")]]} />
              <div className="gf-f gf-f--ort"><input type="text" value={w.ort} placeholder="Ort" data-erp-feld="ort" onChange={(e) => set("ort")(e.target.value)} /></div>
            </div>
            <KF label="Land" wert={w.land} setzen={set("land")} name="land" auswahl={LAENDER.some(([c]) => c === w.land) ? LAENDER : LAENDER.concat([[w.land, w.land]])} />
          </Gruppe>
        </div>
        <div>
          <Gruppe titel="Bedingungen">
            <KF label="Zahlungsbedingung" name="zahlung" wert={w.zahlung} setzen={set("zahlung")} auswahl={bed("zahlung")} />
            <KF label="Lieferbedingung" name="liefer" wert={w.liefer} setzen={set("liefer")} auswahl={bed("liefer")} />
          </Gruppe>
          <Gruppe titel="Kommunikation">
            <KF label="Telefon" name="telefon" wert={w.telefon} setzen={set("telefon")}
              menue={w.telefon && [["Anrufen", () => { location.href = "tel:" + w.telefon.replace(/\s/g, ""); }]]} />
            <KF label="E-Mail" name="mail" wert={w.mail} setzen={set("mail")} menue={w.mail && [["Mail schreiben", () => { location.href = "mailto:" + w.mail; }]]} />
            <KF label="Homepage" name="webseite" wert={w.webseite} setzen={set("webseite")} platzhalter="https://…"
              menue={webAdr && [["Webseite öffnen", () => window.open(webAdr, "_blank")]]} />
          </Gruppe>
        </div>
      </div>}

      {(reiter === "liefer" || reiter === "rechnung") && <Anschriften w={w} setW={setW} typ={reiter} />}

      {reiter === "parameter" && <div className="gf-spalten">
        <div>
          <KF label="Sprache" name="sprache" wert={w.sprache} setzen={set("sprache")} auswahl={SPRACHEN} />
          <KF label="Währung" name="waehrung" wert={w.waehrung} setzen={set("waehrung")} auswahl={WAEHRUNGEN} />
          <KF label="UID / USt-IdNr." name="ust" wert={w.ust} setzen={set("ust")} />
          <KF label={kunde ? "Unsere Lieferanten-Nr." : "Unsere Kunden-Nr."} name="unsere_nr" wert={w.unsere_nr} setzen={set("unsere_nr")} />
        </div>
        <div>
          {kunde && <KF label="Sammelrechnung" typ="haken" name="sammel" wert={w.sammel} setzen={set("sammel")} />}
          {kunde && <KF label="Termin als KW drucken" typ="haken" name="termin_kw" wert={w.termin_art === "kw"}
            setzen={(x) => set("termin_art")(x ? "kw" : "datum")} />}
          {kunde && <KF label="MWST %" name="mwst" wert={w.mwst} setzen={set("mwst")} platzhalter="leer = 8.1, Ausland 0" />}
        </div>
      </div>}

      {reiter === "beschreibung" && <KF label="Beschreibung" name="notiz" typ="textarea" zeilen={14} wert={w.notiz} setzen={set("notiz")} breit />}

      {reiter === "kontakte" && <Kontakte w={w} setW={setW} />}

      {reiter === "belege" && <GTabelle kopf={["Beleg", "Nr.", "Datum", "Netto CHF", "Stand"]} rechts={[3]} leer="Noch keine Belege."
        zeilen={belege.map((b) => ({ key: b.id, klick: () => belegOeffnen(d, aussen, b),
          zellen: [BELEGTYP[b.typ].name, <b>{b.nr}</b>, datumText(b.datum), chf(belegSumme(d, b).netto), belegStand(d, b)[0]] }))} />}

      {reiter === "artikel" && <GTabelle kopf={["Artikel", "Index", "Matchcode", "Zeichnung"]} leer="Noch keine Artikel."
        zeilen={artikel.map((a) => ({ key: a.id, klick: () => artikelFensterOeffnen(d, aussen, a),
          zellen: [<b>{a.nr}</b>, a.idx || "–", a.bezeichnung || "", a.zeichnung || ""] }))} />}
    </GFenster>
  );
}

// Liefer- oder Rechnungsanschriften als Tabelle mit Neu / Ändern / Löschen
function Anschriften({ w, setW, typ }) {
  const [wahl, setWahl] = useState(null);
  const liste = w.anschriften.map((a, i) => ({ a, i })).filter(({ a }) => (a.typ || "liefer") === typ);
  const ersetzen = (i, neu) => setW((v) => ({ ...v, anschriften: i == null ? v.anschriften.concat([neu])
    : v.anschriften.map((x, j) => (j === i ? neu : x)) }));
  const eingabe = (i) => {
    const a = i != null ? w.anschriften[i] : { typ, werk: liste.length ? "" : "Standard", land: "CH" };
    formular({
      titel: "Eingabe " + (typ === "rechnung" ? "Rechnungsanschrift" : "Lieferanschrift"),
      wert: { werk: a.werk || "", name: a.name || "", zusatz: a.zusatz || "", strasse: a.strasse || "", plz: a.plz || "",
        ort: a.ort || "", land: a.land || "CH", mail: a.mail || "" },
      felder: [
        { name: "werk", label: "Werksbezeichnung" }, { name: "name", label: "Name 1" }, { name: "zusatz", label: "Name 2" },
        { name: "strasse", label: "Strasse" }, { name: "plz", label: "PLZ" }, { name: "ort", label: "Ort" },
        { name: "land", label: "Land" }, typ === "rechnung" && { name: "mail", label: "Rechnung per E-Mail an" },
      ].filter(Boolean),
      speichern: async (x) => {
        if (!x.name.trim()) throw new Error("Name 1 fehlt.");
        ersetzen(i, { ...a, ...x, typ });
      },
    });
  };
  return <>
    <GTabelle kopf={["Werksbezeichnung", "Name 1", "Name 2", "Strasse", "PLZ", "Ort", "Land"]} leer="Keine abweichende Anschrift, es gilt die Adresse."
      wahl={wahl} setWahl={setWahl}
      zeilen={liste.map(({ a, i }) => ({ key: i, klick: () => eingabe(i),
        zellen: [a.werk || "", a.name || "", a.zusatz || "", a.strasse || "", a.plz || "", a.ort || "", a.land || ""] }))} />
    <div className="gf-zeile">
      <button className="knopf knopf--klein" data-erp-anschrift-neu={typ} onClick={() => eingabe(null)}>Neu</button>
      <button className="knopf knopf--klein" disabled={wahl == null} onClick={() => eingabe(wahl)}>Ändern</button>
      <button className="knopf knopf--klein knopf--gefahr" disabled={wahl == null} onClick={() => {
        setW((v) => ({ ...v, anschriften: v.anschriften.filter((_, j) => j !== wahl) })); setWahl(null);
      }}>Löschen</button>
      <span className="klein">Änderungen gelten nach „Speichern“.</span>
    </div>
  </>;
}

function Kontakte({ w, setW }) {
  const [wahl, setWahl] = useState(null);
  const eingabe = (i) => {
    const k = i != null ? w.kontakte[i] : {};
    formular({
      titel: "Ansprechpartner",
      wert: { name: k.name || "", funktion: k.funktion || "", telefon: k.telefon || "", mail: k.mail || "" },
      felder: [{ name: "name", label: "Name" }, { name: "funktion", label: "Funktion" }, { name: "telefon", label: "Telefon" }, { name: "mail", label: "E-Mail" }],
      speichern: async (x) => {
        if (!x.name.trim()) throw new Error("Name fehlt.");
        setW((v) => ({ ...v, kontakte: i == null ? v.kontakte.concat([x]) : v.kontakte.map((y, j) => (j === i ? x : y)) }));
      },
    });
  };
  return <>
    <GTabelle kopf={["Name", "Funktion", "Telefon", "E-Mail"]} leer="Noch keine Ansprechpartner." wahl={wahl} setWahl={setWahl}
      zeilen={w.kontakte.map((k, i) => ({ key: i, klick: () => eingabe(i), zellen: [<b>{k.name}</b>, k.funktion || "", k.telefon || "",
        k.mail ? <a href={"mailto:" + k.mail} onClick={(e) => e.stopPropagation()}>{k.mail}</a> : ""] }))} />
    <div className="gf-zeile">
      <button className="knopf knopf--klein" data-erp-kontakt-neu="" onClick={() => eingabe(null)}>Neu</button>
      <button className="knopf knopf--klein" disabled={wahl == null} onClick={() => eingabe(wahl)}>Ändern</button>
      <button className="knopf knopf--klein knopf--gefahr" disabled={wahl == null} onClick={() => {
        setW((v) => ({ ...v, kontakte: v.kontakte.filter((_, j) => j !== wahl) })); setWahl(null);
      }}>Löschen</button>
    </div>
  </>;
}
