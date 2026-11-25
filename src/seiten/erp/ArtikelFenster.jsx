// Test ERP: Artikel-Stamm wie im Gewatec, im Stil des HoferTools (Wunsch
// Patrick 21. November 2026: „kannst du alles eher so bauen, aber moderner
// mit HoferTool-Stil“, „bau nicht alle Details, es geht nur um die
// Grundfunktionalität“). Oben der Kopf mit den Schlüsselfeldern und dem Bild,
// darunter Reiter, unten die Knöpfe. Alles wird direkt im Fenster geändert
// und mit „Speichern“ übernommen, auch die Preisliste aus der Kalkulation
// (Herkunft bleibt sichtbar, von Hand geändert mit Vermerk).
// Zeichnung kommt aus der HOCO Nr. (hoco_parts.zeichnung_url), das 3D-Modell mit dem Dokumentenmanagement (Patrick:
// „noch nicht holen, wir brauchen dann ein Dokumentenmanagement“).
import { useState, useEffect } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { briefBlatt } from "../../teile/briefkopf.js";
import { tun, formular } from "./teile.jsx";
import { GFenster, KF, Gruppe, GTabelle, BildFlaeche, schliessenFragen } from "./Stamm.jsx";
import {
  allesLaden, einfuegen, aendern, loeschen, artikelText, chf, mengeText, datumText, preisliste, peKurz, peZahl, zahl,
  PE_AUSWAHL, ARTIKELART, HOFER_NR, BELEGTYP, bestand, partnerText,
} from "../../daten/erp.js";
import { cockpitOeffnen } from "./Cockpit.jsx";
import { belegOeffnen, belegStand } from "./Belege.jsx";
import { partnerFensterOeffnen } from "./PartnerFenster.jsx";
import { umbuchenOeffnen, BewegungListe } from "./Bewegungen.jsx";
import { ZiehListe } from "../../teile/ZiehListe.jsx";

let agZaehler = 0;
const agKey = () => "ag" + Date.now().toString(36) + "-" + (++agZaehler);

// Pro HOCO Nr. gibt es nur einen Artikel (Patrick 25. November 2026: „es kann
// pro hoco nr nur einen artikel geben“). Ein neuer Index ändert denselben
// Artikel, der alte kommt in den Verlauf daten.indexe. Positionen und
// Lagerbewegungen merken sich ihren Index selbst, so bleibt der Bestand je
// Index getrennt.
export function indexVerlauf(a, neuIdx, notiz) {
  const daten = { ...((a && a.daten) || {}) };
  const alt0 = (a && a.idx) || "";
  if (alt0 !== (neuIdx || "")) {
    daten.indexe = [...(daten.indexe || []), { idx: alt0, bis: new Date().toISOString().slice(0, 10), notiz: notiz || "" }];
  }
  return daten;
}

export async function neuerIndex(d, a, fertig) {
  const w = await alt.dialogFelder({
    titel: "Neuer Index für " + a.nr, bestaetigen: "Index ändern",
    text: "Der Artikel bleibt derselbe, nur der Index ändert. Der bisherige Index „" + (a.idx || "–")
      + "“ kommt in den Verlauf, sein Lagerbestand bleibt unter dem alten Index.",
    felder: [
      { name: "idx", label: "Neuer Index", wert: "", pflicht: true },
      { name: "notiz", label: "Notiz (freiwillig)", wert: "" },
    ],
  });
  if (!w) return null;
  const neu = String(w.idx || "").trim();
  if (neu === (a.idx || "")) { alt.meldung("Das ist schon der aktuelle Index.", "warn"); return null; }
  const r = await tun(() => aendern("erp_artikel", a.id, { idx: neu, daten: indexVerlauf(a, neu, w.notiz), geaendert_am: new Date().toISOString() }),
    "Index von " + a.nr + " ist jetzt " + neu + ".");
  if (r !== null && fertig) await fertig();
  return r;
}

// a: bestehender Artikel oder null; was: { art, kopie, reiter }
export function artikelFensterOeffnen(d, neu, a, was) {
  fensterOeffnen((zu) => <ArtikelFenster start={d} aussen={neu} a0={a} was={was || {}} zu={zu} />);
}

const ME = [["Stk", "Stk"], ["kg", "kg"], ["m", "m"], ["Stg", "Stangen"]];

function formAus(a, art, was) {
  const ad = (a && a.daten) || {};
  const pl = a ? preisliste(a) : { pe: 1, staffeln: [] };
  return {
    art: a ? a.art : art || "hofer", nr: a && !was.kopie ? a.nr : "", idx: a ? a.idx || "" : "",
    bezeichnung: (a && a.bezeichnung) || "", zeichnung: (a && a.zeichnung) || "", kunde_id: (a && a.kunde_id) || "",
    einheit: (a && a.einheit) || (art === "rohmaterial" ? "kg" : "Stk"), preis: a && a.preis != null ? String(a.preis) : "",
    aktiv: a ? a.aktiv !== false : true,
    kunden_nr: ad.kunden_nr || "", rohmaterial_id: ad.rohmaterial_id || "", material: ad.material || "",
    materialbedarf: ad.materialbedarf != null ? String(ad.materialbedarf) : "", lieferant_id: ad.lieferant_id || "", lieferant_nr: ad.lieferant_nr || "", text: ad.text || "", notiz: ad.notiz || "", notiz_bilder: ad.notiz_bilder || [],
    pe: String(pl.pe), staffeln: pl.staffeln.map((x) => ({ ab: String(x.ab), preis: String(x.preis) })),
    arbeitsplan: ((a && a.arbeitsplan) || []).map((x) => ({ ...x, _k: agKey() })),
  };
}

function ArtikelFenster({ start, aussen, a0, was, zu }) {
  const [d, setD] = useState(start);
  const [id, setId] = useState(a0 && !was.kopie ? a0.id : null);
  const a = id ? d.artikelMap.get(id) || a0 : null;
  const [w, setW] = useState(() => formAus(a0, was.art, was));
  const [basis, setBasis] = useState(() => JSON.stringify(formAus(a0, was.art, was)));
  const [reiter, setReiter] = useState(was.reiter || "artikel");
  const [laeuft, setLaeuft] = useState(false);
  const hofer = w.art === "hofer";
  const geaendert = JSON.stringify(w) !== basis;
  const set = (name) => (x) => setW((v) => ({ ...v, [name]: x }));
  const kunde = d.partnerMap.get(w.kunde_id);
  const roh = d.artikelMap.get(w.rohmaterial_id);
  const pl = a ? preisliste(a) : { staffeln: [] };

  const kunden = [["", "—"]].concat(d.partner.filter((p) => p.art === "kunde").sort((x, y) => x.nr.localeCompare(y.nr)).map((p) => [p.id, p.nr + " " + p.name]));
  const lieferanten = [["", "—"]].concat(d.partner.filter((p) => p.art === "lieferant").sort((x, y) => x.nr.localeCompare(y.nr)).map((p) => [p.id, p.nr + " " + p.name]));
  const rohe = [["", "—"]].concat(d.artikel.filter((x) => x.art === "rohmaterial").sort((x, y) => x.nr.localeCompare(y.nr))
    .map((x) => [x.id, x.nr + (x.bezeichnung && x.bezeichnung !== x.nr ? " · " + x.bezeichnung : "")]));

  const frisch = async (nid) => { const n = await allesLaden(); setD(n); aussen(); return n.artikelMap.get(nid || id); };

  const speichern = async () => {
    const nr = w.nr.trim();
    if (!nr) throw new Error("Artikel Code fehlt.");
    if (hofer && !HOFER_NR.test(nr)) throw new Error("Hofer + Co Artikel haben die Form xxxxx-xxxx.");
    if (hofer && d.artikel.some((x) => x.id !== id && x.art === "hofer" && x.nr === nr)) {
      throw new Error("Den Artikel " + nr + " gibt es schon. Pro HOCO Nr. gibt es nur einen Artikel, einen neuen Index setzt man dort mit „Neuer Index“.");
    }
    if (!hofer && d.artikel.some((x) => x.id !== id && x.art === w.art && x.nr === nr && (x.idx || "") === w.idx.trim())) {
      throw new Error("Diesen Artikel gibt es schon.");
    }
    const basisDaten = hofer && a ? indexVerlauf(a, w.idx.trim(), "") : { ...((a0 && a0.daten) || {}) };
    const daten = { ...basisDaten, kunden_nr: w.kunden_nr, text: w.text, notiz: w.notiz, notiz_bilder: w.notiz_bilder || [] };
    if (hofer) {
      daten.rohmaterial_id = w.rohmaterial_id || null;
      daten.material = w.material;
      daten.materialbedarf = w.materialbedarf.trim() === "" ? null : zahl(w.materialbedarf);
      const st = w.staffeln.filter((x) => String(x.preis ?? "").trim() !== "")
        .map((x) => ({ ab: Math.max(0, Math.round(zahl(x.ab))), preis: zahl(x.preis) })).sort((x, y) => x.ab - y.ab);
      if (st.some((x, i) => i && x.ab === st[i - 1].ab)) throw new Error("Zwei Staffeln mit derselben Menge.");
      const neuPe = peZahl(w.pe);
      const alt0 = a0 ? preisliste(a0) : { pe: 1, staffeln: [] };
      // Von Hand geändert: Herkunft aus der Kalkulation bleibt, mit Vermerk
      const gleich = neuPe === alt0.pe && st.length === alt0.staffeln.length
        && st.every((x, i) => x.ab === alt0.staffeln[i].ab && Math.abs(x.preis - alt0.staffeln[i].preis) < 1e-9);
      daten.pe = neuPe;
      daten.preisliste = { ...((a0 && a0.daten && a0.daten.preisliste) || {}), pe: neuPe, waehrung: "CHF", staffeln: st,
        von_hand: gleich ? !!alt0.von_hand : true, geaendert_am: gleich ? alt0.geaendert_am || null : new Date().toISOString() };
      if (!gleich && !st.length && !alt0.kalkulation_nr) delete daten.preisliste;
    } else {
      daten.lieferant_id = w.lieferant_id || null;
      daten.lieferant_nr = w.lieferant_nr;
    }
    const st0 = hofer && daten.preisliste ? daten.preisliste.staffeln : [];
    const zeile = { art: w.art, nr, idx: hofer ? w.idx.trim() : "", bezeichnung: w.bezeichnung.trim() || null,
      zeichnung: hofer ? w.zeichnung.trim() || null : null, kunde_id: hofer ? w.kunde_id || null : null, einheit: w.einheit,
      preis: hofer ? (st0.length ? st0[0].preis : null) : w.preis === "" ? null : zahl(w.preis), aktiv: !!w.aktiv,
      arbeitsplan: w.arbeitsplan.map(({ _k, ...x }, i) => ({ ...x, pos: (i + 1) * 10 })), geaendert_am: new Date().toISOString(), daten };
    let r;
    // aendern kann ohne Zeile zurückkommen; dann gilt der Stand, den wir geschrieben haben,
    // sonst verlöre das Fenster seinen Artikel und hiesse wieder „neu“
    if (id) r = (await aendern("erp_artikel", id, zeile)) || { ...a, ...zeile, id };
    else r = await einfuegen("erp_artikel", { ...zeile, kalkulation_id: null });
    const n = await frisch(r.id);
    setId(r.id);
    const f = formAus(n || r, w.art, {});
    setW(f); setBasis(JSON.stringify(f));
    alt.meldung("Artikel " + artikelText(r) + " gespeichert.", "gut");
  };

  const schliessen = async () => { if (await schliessenFragen(geaendert, alt)) zu(); };
  const artLoeschen = async () => {
    if (!a) return zu();
    if (d.positionen.some((p) => p.artikel_id === a.id) || d.bewegungen.some((x) => x.artikel_id === a.id)) {
      alt.meldung("Der Artikel steht schon in Belegen oder Buchungen und bleibt. Statt löschen: Aktiv ausschalten.", "warn"); return;
    }
    if (!(await alt.nachfragen({ titel: "Löschen", text: artikelText(a) + " löschen?", bestaetigen: "Löschen", gefahr: true }))) return;
    const r = await tun(() => loeschen("erp_artikel", a.id), "Gelöscht.");
    if (r !== null) { aussen(); zu(); }
  };

  const titel = (ARTIKELART[w.art] || "Artikel") + (id ? " " + artikelText(a) : " neu");
  const codeMenue = a && [["Artikel-Cockpit", () => cockpitOeffnen(d, aussen, a)], hofer && ["Preisliste drucken", () => preislisteDrucken(d, a)],
    ["Belege mit diesem Artikel", () => setReiter("belege")], ["Lagerbestand", () => setReiter("lager")]];
  const kundeMenue = kunde && [["Kunde öffnen", () => partnerFensterOeffnen(d, aussen, kunde)],
    ["Artikel-Cockpit", () => cockpitOeffnen(d, aussen, a || null)]];
  const rohMenue = roh && [["Rohmaterial öffnen", () => artikelFensterOeffnen(d, aussen, roh)],
    ["Cockpit Rohmaterial", () => cockpitOeffnen(d, aussen, roh)]];

  const kopf = <>
    <KF label="Artikel Code" name="nr" wert={w.nr} setzen={set("nr")} menue={codeMenue} platzhalter={hofer ? "xxxxx-xxxx" : ""} />
    {hofer ? <KF label="Index" name="idx" wert={w.idx} setzen={set("idx")} /> : <KF label="Artikelart" wert={ARTIKELART[w.art]} nurLesen />}
    <KF label="Matchcode" name="bezeichnung" wert={w.bezeichnung} setzen={set("bezeichnung")} breit />
    {hofer && <KF label="Zeichnungsnr." name="zeichnung" wert={w.zeichnung} setzen={set("zeichnung")} />}
    {hofer && <KF label="Kunde" name="kunde_id" wert={w.kunde_id} setzen={set("kunde_id")} auswahl={kunden} menue={kundeMenue} />}
    {hofer && <KF label="Ident-Nr. Kunde" name="kunden_nr" wert={w.kunden_nr} setzen={set("kunden_nr")} />}
    <KF label="ME" name="einheit" wert={w.einheit} setzen={set("einheit")} auswahl={ME} />
    {hofer && <KF label="Rohmaterial" nurLesen menue={rohMenue}
      wert={<span data-erp-art-roh="">{roh ? roh.nr : w.material ? <>{w.material} <small>(nur Text)</small></> : "–"}</span>} />}
    <KF label="Aktiv" typ="haken" name="aktiv" wert={w.aktiv} setzen={set("aktiv")} />
  </>;

  const fuss = <>
    {id && <button className="knopf knopf--gefahr" onClick={artLoeschen}>Löschen</button>}
    {a && <button className="knopf" data-erp-art-kopie="" onClick={() => artikelFensterOeffnen(d, aussen, a, { kopie: true })}>Kopieren</button>}
    {a && hofer && <button className="knopf" data-erp-art-index="" onClick={() => neuerIndex(d, a, async () => {
      const n = await frisch(a.id); const f = formAus(n, w.art, {}); setW(f); setBasis(JSON.stringify(f));
    })}>Neuer Index</button>}
    {a && <button className="knopf" data-erp-art-cockpit="" onClick={() => cockpitOeffnen(d, aussen, a)}>Artikel-Cockpit</button>}
    <span className="gf-fuss__luecke" />
    {geaendert && <span className="klein gf-geaendert">nicht gespeichert</span>}
    <button className="knopf knopf--still" data-nein="" onClick={schliessen}>Beenden</button>
    <button className="knopf knopf--haupt" disabled={laeuft || (!geaendert && !!id)} data-erp-speichern="" onClick={async () => {
      setLaeuft(true); await tun(speichern); setLaeuft(false);
    }}>Speichern</button>
  </>;

  const reiterListe = [["artikel", "Artikel"], hofer && ["verkauf", "Verkauf"], hofer && ["arbeitsplan", "Arbeitsplan"],
    ["lager", "Lager"], ["bewegungen", "Bewegungen"], ["belege", "Belege"], ["dokumente", "Dokumente"]];

  return (
    <GFenster titel={titel} kopf={kopf} bild={hofer && a && a.nr ? <ZeichnungVorschau nr={a.nr} titel={titel} /> : <BildFlaeche text={hofer ? "Zeichnung" : "Bild"} />} reiter={reiterListe}
      aktiv={reiter} setAktiv={setReiter} fuss={fuss} zu={schliessen} klasse="erp-artfenster"
      attr={{ "data-erp-artfenster": id ? a.nr : "neu" }}>
      {reiter === "artikel" && <div className="gf-spalten">
        <div>
          {hofer ? <Gruppe titel="Rohmaterial">
            <KF label="Rohmaterial-Artikel" name="rohmaterial_id" wert={w.rohmaterial_id} setzen={set("rohmaterial_id")} auswahl={rohe} menue={rohMenue} />
            <KF label="Material (Text)" name="material" wert={w.material} setzen={set("material")}
              platzhalter="steht da, solange es keinen Rohmaterial-Artikel gibt" />
          </Gruppe> : <Gruppe titel="Einkauf">
            <KF label="Einstandspreis CHF" name="preis" wert={w.preis} setzen={set("preis")} typ="zahl" rechts />
            <KF label="Lieferant" name="lieferant_id" wert={w.lieferant_id} setzen={set("lieferant_id")} auswahl={lieferanten}
              menue={d.partnerMap.get(w.lieferant_id) && [["Lieferant öffnen", () => partnerFensterOeffnen(d, aussen, d.partnerMap.get(w.lieferant_id))]]} />
            <KF label="Art.-Nr. Lieferant" name="lieferant_nr" wert={w.lieferant_nr} setzen={set("lieferant_nr")} />
          </Gruppe>}
          <KF label="Text" name="text" typ="textarea" wert={w.text} setzen={set("text")} platzhalter="Text für Belege" breit />
        </div>
        <div>
          <NotizMitBildern w={w} setW={setW} set={set} />
          {a && <p className="klein">Zuletzt geändert {a.geaendert_am ? datumText(a.geaendert_am.slice(0, 10)) : "–"}
            {pl.kalkulation_nr ? " · aus Kalkulation " + pl.kalkulation_nr : ""}</p>}
          {hofer && a && (a.daten?.indexe || []).length > 0 && <Gruppe titel="Frühere Indexe">
            <div data-erp-art-indexe="">{a.daten.indexe.slice().reverse().map((x, i) => <p key={i} className="klein">
              <b>{x.idx || "–"}</b>{x.bis || x.am ? " · bis " + datumText(x.bis || x.am) : ""}{x.notiz ? " · " + x.notiz : ""}</p>)}</div>
          </Gruppe>}
        </div>
      </div>}

      {reiter === "verkauf" && <Verkauf d={d} a={a} w={w} setW={setW} />}

      {reiter === "arbeitsplan" && <ArbeitsplanReiter w={w} setW={setW} set={set} roh={roh} />}

      {reiter === "lager" && <LagerReiter d={d} a={a} neu={() => frisch()} />}
      {reiter === "bewegungen" && (a ? <BewegungListe d={d} artikelId={a.id} aussen={aussen} /> : <p className="klein">Erst speichern.</p>)}
      {reiter === "belege" && <BelegeReiter d={d} a={a} aussen={aussen} />}

      {reiter === "dokumente" && <div className="erp-artfenster__rechts gf-doku">
        <div className="erp-art-zeichnung" data-erp-art-zeichnung="">
          {hofer && a && a.nr ? <ZeichnungVorschau nr={a.nr} titel={titel} gross />
            : <div className="h3d-hinweis"><b>Zeichnung</b><br />Keine Zeichnung hinterlegt.</div>}
        </div>
        <div className="erp-art-modell" data-erp-art-modell="">
          <div className="h3d-hinweis"><b>3D-Modell</b><br />Wird hier gezeigt, wenn eines vorhanden ist.</div>
        </div>
      </div>}
    </GFenster>
  );
}

// Zeichnung der HOCO Nr. (hoco_parts.zeichnung_url, dieselbe wie auf der
// Planwand), Wunsch Patrick 25. November 2026: „zeichnung??“
const istBild = (u) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u || "");
function ZeichnungVorschau({ nr, titel, gross }) {
  const [url, setUrl] = useState(undefined);
  useEffect(() => {
    let weg = false;
    alt.db.from("hoco_parts").select("zeichnung_url").eq("hoco_nr", nr).maybeSingle()
      .then(({ data }) => { if (!weg) setUrl((data && data.zeichnung_url) || null); }, () => { if (!weg) setUrl(null); });
    return () => { weg = true; };
  }, [nr]);
  const kl = "erp-zvorschau" + (gross ? " erp-zvorschau--gross" : "");
  if (url === undefined) return <div className={kl} data-erp-zeichnung=""><span className="klein">Zeichnung wird geladen …</span></div>;
  if (!url) return <div className={kl} data-erp-zeichnung="leer"><span className="klein">Keine Zeichnung hinterlegt</span></div>;
  const bild = istBild(url);
  return (<div className={kl + " erp-zvorschau--da"} data-erp-zeichnung="da">
    {bild ? <img src={url} alt="Zeichnung" /> : <iframe src={url + "#navpanes=0&toolbar=0&view=Fit"} title="Zeichnung" loading="lazy" />}
    <button type="button" className="erp-zvorschau__gross" title="Gross ansehen" data-erp-zeichnung-gross=""
      onClick={() => alt.betrachter(url, "Zeichnung " + (titel || nr), !bild)}>⤢</button>
  </div>);
}

// Notiz mit Bildern: Strg + V oder Hineinziehen legt das Bild in die Ablage
// (zeichnungen/erp/artikel/), gespeichert mit dem Artikel in daten.notiz_bilder
// (Wunsch Patrick 25. November 2026: „im Feld Notiz sollen auch Bilder
// eingefügt werden können“).
async function bildHochladen(datei) {
  const endung = ((datei.name || "").match(/\.([a-z0-9]+)$/i) || [, (datei.type || "image/png").split("/")[1] || "png"])[1].toLowerCase();
  const pfad = "erp/artikel/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + endung;
  const r = await alt.zeitlimit(alt.db.storage.from("zeichnungen").upload(pfad, datei,
    { contentType: datei.type || "image/png", upsert: false }), 60000, "Bild hochladen");
  if (r.error) throw r.error;
  return { url: alt.db.storage.from("zeichnungen").getPublicUrl(pfad).data.publicUrl, pfad, name: datei.name || "Bild" };
}

function NotizMitBildern({ w, setW, set }) {
  const [laedt, setLaedt] = useState(0);
  const bilder = w.notiz_bilder || [];
  async function dazu(dateien) {
    const liste = [...dateien].filter((f) => /^image\//.test(f.type));
    if (!liste.length) return false;
    setLaedt((n) => n + liste.length);
    for (const f of liste) {
      try {
        const b = await bildHochladen(f);
        setW((x) => ({ ...x, notiz_bilder: [...(x.notiz_bilder || []), b] }));
      } catch (e) { alt.meldung("Bild nicht hochgeladen: " + (e.message || e), "fehler"); }
      setLaedt((n) => n - 1);
    }
    return true;
  }
  const klebe = (e) => {
    const f = [...(e.clipboardData?.files || [])];
    if (f.some((x) => /^image\//.test(x.type))) { e.preventDefault(); dazu(f); }
  };
  const ablegen = (e) => {
    const f = [...(e.dataTransfer?.files || [])];
    if (f.some((x) => /^image\//.test(x.type))) { e.preventDefault(); e.stopPropagation(); dazu(f); }
  };
  return (<div className="erp-notiz" data-erp-notiz="" onPaste={klebe} onDrop={ablegen} onDragOver={(e) => e.preventDefault()}>
    <KF label="Notiz" name="notiz" typ="textarea" zeilen={8} wert={w.notiz} setzen={set("notiz")} breit
      platzhalter="Bilder mit Strg + V einfügen oder hineinziehen" />
    {(bilder.length > 0 || laedt > 0) && <div className="erp-notiz__bilder" data-erp-notiz-bilder="">
      {bilder.map((b, i) => <div key={b.pfad || b.url} className="erp-notiz__bild">
        <img src={b.url} alt={b.name || "Bild"} onClick={() => alt.betrachter(b.url, b.name || "Bild", false)} />
        <button type="button" title="Bild entfernen" data-erp-notiz-weg={i}
          onClick={() => setW((x) => ({ ...x, notiz_bilder: (x.notiz_bilder || []).filter((_, k) => k !== i) }))}>✕</button>
      </div>)}
      {laedt > 0 && <div className="erp-notiz__bild erp-notiz__bild--laedt">…</div>}
    </div>}
    <label className="knopf knopf--still klein erp-notiz__knopf">+ Bild
      <input type="file" accept="image/*" multiple hidden data-ablegen="direkt" onChange={(e) => { dazu(e.target.files); e.target.value = ""; }} />
    </label>
  </div>);
}

// Arbeitsplan wie im Gewatec: oben Material und Bedarf, darunter die
// Arbeitsgänge als Tabelle, bearbeitet je Arbeitsgang in einem Fenster.
// Nur die Felder, die wir brauchen (Patrick: „wir verwenden nicht alles“).
const AG_FORM = [
  { name: "code", label: "AG-Code", platzhalter: "z.B. DREH" },
  { name: "bez", label: "Beschreibung", typ: "textarea", zeilen: 3, breit: true },
  { name: "maschine", label: "Arbeitsplatz (Betriebsmittel, extern: Lieferant)", breit: true },
  { name: "te", label: "Stückzeit s", typ: "zahl" }, { name: "ruest", label: "Rüstzeit h", typ: "zahl" },
  { name: "extern", label: "Extern", typ: "haken" },
  { name: "pruef", label: "Prüfung / Hinweis", typ: "textarea", zeilen: 2, breit: true },
];

function ArbeitsplanReiter({ w, setW, set, roh }) {
  const [wahl, setWahl] = useState(null);
  const ap = w.arbeitsplan;
  const setAp = (neu) => setW((v) => ({ ...v, arbeitsplan: neu }));
  const bearbeiten = (i, vorlage) => {
    const x = i == null ? vorlage : ap[i];
    formular({ titel: i == null ? (x.extern ? "Neuer Arbeitsgang extern" : "Neuer Arbeitsgang intern") : "Arbeitsgang " + ((i + 1) * 10),
      felder: AG_FORM, wert: x, breit: true,
      speichern: (neuW) => {
        if (!String(neuW.bez || "").trim()) throw new Error("Beschreibung fehlt.");
        if (i == null) { setAp(ap.concat([{ ...neuW, _k: agKey() }])); setWahl(ap.length); } else setAp(ap.map((y, j) => (j === i ? { ...neuW, _k: y._k } : y)));
      },
      loeschen: i == null ? null : () => { setAp(ap.filter((_, j) => j !== i)); setWahl(null); } });
  };
  const schieben = (r) => {
    if (wahl == null || wahl + r < 0 || wahl + r >= ap.length) return;
    const neu = ap.slice(); [neu[wahl], neu[wahl + r]] = [neu[wahl + r], neu[wahl]];
    setAp(neu); setWahl(wahl + r);
  };
  return <>
    <div className="gf-zeile">
      <KF label="Material" nurLesen wert={roh ? roh.nr + (roh.bezeichnung && roh.bezeichnung !== roh.nr ? " · " + roh.bezeichnung : "") : w.material || "–"} breit />
      <KF label="Materialbedarf kg pro Fertigteil" name="materialbedarf" typ="zahl" rechts wert={w.materialbedarf} setzen={set("materialbedarf")} />
    </div>
    {/* Reihenfolge mit Ziehen wie in der Kalkulation (seit 1.804.0, Wunsch Patrick 25. November 2026) */}
    <div className="gf-tab-huelle erp-ap">
      <div className="erp-ap__zeile erp-ap__kopf" aria-hidden="true">
        <span>Pos</span><span>I/E</span><span>AG-Code</span><span>Beschreibung</span><span>Arbeitsplatz</span><span className="rechts">SZ s</span><span className="rechts">RZ h</span>
      </div>
      {!ap.length && <div className="gf-tab__leer">Noch kein Arbeitsgang. Meist kommt er aus der Kalkulation.</div>}
      <ZiehListe id="erp-ap-liste" className="erp-ap__liste" darf={true}
        ordnen={(reihe) => {
          const gewaehlt = wahl == null ? null : ap[wahl] && ap[wahl]._k;
          const neu = reihe.map((k) => ap.find((x) => x._k === k)).filter(Boolean);
          setAp(neu);
          if (gewaehlt) setWahl(neu.findIndex((x) => x._k === gewaehlt));
        }}
        eintraege={ap.map((x, i) => ({ key: x._k, inhalt:
          <div className={"erp-ap__zeile erp-klick" + (wahl === i ? " gewaehlt" : "")} data-erp-zeile={i}
            onClick={() => setWahl(i)} onDoubleClick={() => bearbeiten(i)}>
            <span>{(i + 1) * 10}</span><span>{x.extern ? "E" : "I"}</span><span>{x.code || ""}</span><span>{x.bez || ""}</span>
            <span>{x.maschine || ""}</span><span className="rechts">{x.te || ""}</span><span className="rechts">{x.ruest || ""}</span>
          </div> }))} />
    </div>
    <div className="gf-zeile gf-knoepfe">
      <button type="button" className="knopf knopf--klein" data-erp-ag-neu="int" onClick={() => bearbeiten(null, { extern: false })}>Neu intern</button>
      <button type="button" className="knopf knopf--klein" data-erp-ag-neu="ext" onClick={() => bearbeiten(null, { extern: true })}>Neu extern</button>
      <button type="button" className="knopf knopf--klein" disabled={wahl == null} data-erp-ag-bearbeiten="" onClick={() => bearbeiten(wahl)}>Bearbeiten</button>
      <button type="button" className="knopf knopf--klein knopf--gefahr" disabled={wahl == null}
        onClick={() => { setAp(ap.filter((_, j) => j !== wahl)); setWahl(null); }}>Löschen</button>
      <button type="button" className="knopf knopf--klein" disabled={wahl == null || wahl === 0} title="Nach oben" onClick={() => schieben(-1)}>↑</button>
      <button type="button" className="knopf knopf--klein" disabled={wahl == null || wahl === ap.length - 1} title="Nach unten" onClick={() => schieben(1)}>↓</button>
      <span className="klein">Fertigungsaufträge übernehmen diesen Arbeitsplan. Am Griff ziehen ändert die Reihenfolge, Doppelklick bearbeitet. Gespeichert mit „Speichern“.</span>
    </div>
  </>;
}

function Verkauf({ d, a, w, setW }) {
  const pl = a ? preisliste(a) : { staffeln: [] };
  const setZ = (i, name, x) => setW((v) => ({ ...v, staffeln: v.staffeln.map((z, j) => (j === i ? { ...z, [name]: x } : z)) }));
  const pe = peZahl(w.pe);
  return (
    <div className="erp-preisliste" id="erp-preisliste">
      <p className="klein" data-erp-pl-herkunft="">
        {pl.kalkulation_nr ? <>Preise aus Kalkulation <b>{pl.kalkulation_nr}</b>{pl.uebernommen_am ? " vom " + datumText(pl.uebernommen_am.slice(0, 10)) : ""}
          {pl.aus_waehrung ? " (aus " + pl.aus_waehrung + " in CHF umgerechnet)" : ""}
          {pl.von_hand ? <> · <b className="erp-rot">von Hand geändert{pl.geaendert_am ? " am " + datumText(pl.geaendert_am.slice(0, 10)) : ""}</b></> : ""}</>
          : pl.staffeln.length ? "Preise von Hand eingetragen." : "Noch keine Preisliste. In der Kalkulation „Artikel und Arbeitsplan anlegen“ oder hier eintragen."}
      </p>
      <div className="gf-zeile">
        <KF label="Preis pro" name="pe" wert={w.pe} setzen={(x) => setW((v) => ({ ...v, pe: x }))} auswahl={PE_AUSWAHL} />
        {a && pl.staffeln.length > 0 && <button className="knopf knopf--klein" data-erp-pl-drucken="" onClick={() => preislisteDrucken(d, a)}>Preisliste drucken</button>}
      </div>
      <table className="gf-tab erp-pl-tab">
        <thead><tr><th className="rechts">Ab Menge (Stk)</th><th className="rechts">Preis CHF {peKurz(pe)}</th><th className="rechts">je Stk</th><th /></tr></thead>
        <tbody>{w.staffeln.map((z, i) => <tr key={i} data-erp-pl-zeile={i}>
          <td><input className="gf-rechts" inputMode="decimal" value={z.ab} data-erp-feld="ab" onChange={(e) => setZ(i, "ab", e.target.value)} /></td>
          <td><input className="gf-rechts" inputMode="decimal" value={z.preis} data-erp-feld="preis" onChange={(e) => setZ(i, "preis", e.target.value)} /></td>
          <td className="rechts klein">{z.preis !== "" ? (zahl(z.preis) / pe).toFixed(4) : ""}</td>
          <td><button type="button" className="knopf knopf--klein knopf--gefahr" title="Entfernen"
            onClick={() => setW((v) => ({ ...v, staffeln: v.staffeln.filter((_, j) => j !== i) }))}>✕</button></td>
        </tr>)}</tbody>
      </table>
      <button type="button" className="knopf knopf--klein" data-erp-pl-neu=""
        onClick={() => setW((v) => ({ ...v, staffeln: v.staffeln.concat([{ ab: "", preis: "" }]) }))}>+ Staffel</button>
    </div>
  );
}

function LagerReiter({ d, a, neu }) {
  if (!a) return <p className="klein">Erst speichern.</p>;
  const liste = bestand(d, a.id);
  const summe = liste.reduce((s, e) => s + e.menge, 0);
  return <>
    <GTabelle kopf={["Index", "Charge", "Lagerart", "Lagerplatz", "Menge"]} rechts={[4]} leer="Kein Bestand."
      zeilen={liste.map((e) => { const l = d.lagerMap.get(e.lager_id);
        return { key: e.idx + "|" + e.charge + e.lager_id, klasse: e.menge < 0 ? "erp-minus" : "",
          klick: e.menge > 0 ? () => umbuchenOeffnen(d, e, neu) : undefined,
          zellen: [(e.idx || "–") + (a.art === "hofer" && (e.idx || "") !== (a.idx || "") ? " (alt)" : ""), e.charge,
            l ? l.lagerart : "–", l ? l.platz : "–", mengeText(e.menge) + " " + (a.einheit || "")] }; })} />
    {liste.some((e) => e.menge > 0) && <p className="klein">Zeile antippen zum Umbuchen (z. B. HFL → FL, FL → SPL).</p>}
    <p className="gf-summe">Bestand gesamt <b>{mengeText(summe)} {a.einheit}</b></p>
  </>;
}

function BelegeReiter({ d, a, aussen }) {
  if (!a) return <p className="klein">Erst speichern.</p>;
  const pos = d.positionen.filter((p) => p.artikel_id === a.id).map((p) => ({ p, b: d.belegMap.get(p.beleg_id) })).filter((x) => x.b)
    .sort((x, y) => (y.b.datum || "").localeCompare(x.b.datum || ""));
  return <GTabelle kopf={["Beleg", "Nr.", "Datum", "Partner", "Menge", "Preis", "Stand"]} rechts={[4, 5]} leer="Noch in keinem Beleg."
    zeilen={pos.map(({ p, b }) => ({ key: p.id, klick: () => belegOeffnen(d, aussen, b),
      zellen: [BELEGTYP[b.typ].name, <b>{b.nr}</b>, datumText(b.datum), partnerText(d.partnerMap.get(b.partner_id)),
        mengeText(p.menge) + " " + (p.einheit || ""), p.preis != null ? chf(p.preis) : "", belegStand(d, b)[0]] }))} />;
}

export function preislisteDrucken(d, a) {
  const pl = preisliste(a);
  const esc = alt.esc;
  const kunde = d.partnerMap.get(a.kunde_id);
  const zeilen = pl.staffeln.map((x) => "<tr><td class='r'>" + mengeText(x.ab) + " Stk</td><td class='r'><b>" + chf(x.preis) + "</b></td></tr>").join("");
  const roh = "<!doctype html><html><head><meta charset='utf-8'><title>Preisliste " + esc(artikelText(a)) + "</title><style>"
    + "body{font:11pt Arial,sans-serif;margin:18mm 16mm;color:#111}h1{font-size:16pt;margin:30px 0 4px}table{width:60%;border-collapse:collapse;margin-top:16px}"
    + "th,td{border-bottom:1px solid #ccc;padding:5px 4px;text-align:left}th{background:#eef2f7}.r{text-align:right}"
    + ".kopf{display:flex;justify-content:space-between}.test{color:#b00;font-weight:bold}small{color:#555}@media print{.test{display:none}}</style></head><body>"
    + "<!--INHALT-->"
    + "<p class='test'>TESTVERSION ERP</p>"
    + "<h1>Preisliste " + esc(artikelText(a)) + "</h1>"
    + "<div>" + esc(a.bezeichnung || "") + (a.zeichnung ? " · Zeichnung " + esc(a.zeichnung) + (a.idx ? " Index " + esc(a.idx) : "") : "")
    + (kunde ? "<br>Kunde " + esc(kunde.nr + " " + kunde.name) : "") + "</div>"
    + "<table><thead><tr><th class='r'>Ab Menge</th><th class='r'>Preis CHF pro " + (pl.pe === 1 ? "Stk" : mengeText(pl.pe) + " Stk") + "</th></tr></thead><tbody>" + zeilen + "</tbody></table>"
    + "<p><small>Preise exkl. MWST, Stand " + datumText(new Date().toISOString().slice(0, 10))
    + (pl.kalkulation_nr ? " · Kalkulation " + esc(pl.kalkulation_nr) : "") + "</small></p>"
    + "<script>setTimeout(()=>print(),300)</script></body></html>";
  const html = briefBlatt(roh);
  const w = window.open("", "_blank");
  if (!w) { alt.meldung("Das Fenster wurde vom Browser blockiert.", "warn"); return; }
  w.document.write(html);
  w.document.close();
}
