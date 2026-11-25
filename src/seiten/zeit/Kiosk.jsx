// =================================================================
//  HOFERTIME: KIOSK (seit 1.816.0, Wunsch Patrick 25. November 2026:
//  „per HOFERTIME auf Kiosk, Sachen kaufen, man belastet das Konto, und
//  wenn man abrechnen will, kommt eine Rechnung mit QR-Einzahlungsschein“)
//  Statt Twint: jeder Kauf geht aufs eigene Konto, „Abrechnen“ fasst alle
//  offenen Käufe zu einer Rechnung zusammen (Funktion kiosk_abrechnen in
//  der Datenbank), das PDF mit QR-Einzahlungsschein rechnet das Gerät.
//  Der Admin von HOFERTIME pflegt Artikel, Konto (IBAN nur in der
//  Datenbank) und setzt Rechnungen auf bezahlt.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { dialogFelder, nachfragen } from "../../teile/Dialoge.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { rechnungNr, rechnungPdf, qrSvg, kontoFehlt, ibanSauber, ibanGut, istQrIban } from "./kioskRechnung.js";

const chf = (b) => Number(b || 0).toFixed(2);
const RUECKNAHME_MS = 10 * 60 * 1000;
const ABLAGE = "zeichnungen";

// Bild eines Artikels verkleinert in die Ablage (seit 1.830.0, Wunsch Patrick
// 25. November 2026: „man soll Bild einfügen können … statt Emoji Beschreibung“)
async function artikelBildHochladen(datei) {
  const blob = await alt.bildVerkleinern(datei, 800);
  const pfad = "kiosk/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
  const r = await alt.zeitlimit(alt.db.storage.from(ABLAGE).upload(pfad, blob, { contentType: "image/jpeg" }),
    60000, "Bild hochladen");
  if (r.error) throw r.error;
  return alt.db.storage.from(ABLAGE).getPublicUrl(pfad).data.publicUrl;
}
function dateiWaehlen() {
  return new Promise((ok) => {
    const f = document.createElement("input");
    f.type = "file"; f.accept = "image/*";
    f.setAttribute("data-ablegen", "direkt");
    f.onchange = () => ok(f.files && f.files[0]);
    f.click();
  });
}

async function holen(abfrage, name) {
  const { data, error } = await alt.zeitlimit(abfrage, 15000, name);
  if (error) throw error;
  return data || [];
}

async function kontoLaden() {
  const z = await holen(alt.db.from("kiosk_konto").select("daten").eq("id", 1), "Kiosk-Konto");
  return (z[0] && z[0].daten) || {};
}

// PDF der Rechnung machen und im Betrachter zeigen
export async function rechnungZeigen(r, personName) {
  try {
    const [kaeufe, konto] = await Promise.all([
      holen(alt.db.from("kiosk_buchungen").select("*").eq("rechnung_id", r.id), "Kiosk-Käufe"),
      kontoLaden(),
    ]);
    const fehlt = kontoFehlt(konto);
    if (fehlt.length) {
      alt.meldung("Für den Einzahlungsschein fehlt noch: " + fehlt.join(", ") + ". Der Admin trägt es unter Kiosk → Verwalten ein.", "warn");
      return;
    }
    const blob = await rechnungPdf({ r, kaeufe, person: personName, konto });
    const url = URL.createObjectURL(blob);
    alt.betrachter(url, "Kiosk-Rechnung " + rechnungNr(r.nr), true);
  } catch (e) {
    alt.fehlerMerken("Kiosk-Rechnung", String(e && e.message || e));
    alt.meldung("Rechnung konnte nicht erstellt werden: " + (e && e.message || e), "fehler");
  }
}

// QR-Code gross am Bildschirm, zum Scannen mit der Banking-App am Handy
async function qrZeigen(r, personName) {
  try {
    const konto = await kontoLaden();
    const fehlt = kontoFehlt(konto);
    if (fehlt.length) { alt.meldung("Für den QR-Code fehlt noch: " + fehlt.join(", ") + ".", "warn"); return; }
    const svg = await qrSvg(konto, r, personName);
    fensterOeffnen((zu) => (
      <div className="dialog ki-qr-fenster" role="dialog" aria-modal="true">
        <h2>{rechnungNr(r.nr)} · CHF {chf(r.betrag)}</h2>
        <p className="klein">Mit der Banking-App scannen und bezahlen.</p>
        <div className="ki-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="dialog__knoepfe">
          <button className="knopf" data-fokus="" onClick={zu}>Schliessen</button>
        </div>
      </div>));
  } catch (e) {
    alt.meldung("QR-Code ging nicht: " + (e && e.message || e), "fehler");
  }
}

export default function Kiosk({ admin }) {
  const ich = alt.profil || {};
  const [teil, setTeil] = useState("kaufen");
  return (
    <div className="ki" id="ki">
      {admin && <div className="ki-teilwahl">
        <button className={"knopf knopf--klein" + (teil === "kaufen" ? "" : " knopf--still")} id="ki-teil-kaufen" onClick={() => setTeil("kaufen")}>Einkaufen</button>
        <button className={"knopf knopf--klein" + (teil === "verwalten" ? "" : " knopf--still")} id="ki-teil-verwalten" onClick={() => setTeil("verwalten")}>Verwalten</button>
      </div>}
      {teil === "verwalten" && admin ? <Verwalten /> : <Kaufen ich={ich} />}
    </div>
  );
}

function Kaufen({ ich }) {
  const [stand, setStand] = useState(null);
  const [fehler, setFehler] = useState("");
  const [, setTick] = useState(0);
  const laden = async () => {
    try {
      const [artikel, buchungen, rechnungen] = await Promise.all([
        holen(alt.db.from("kiosk_artikel").select("*").eq("aktiv", true).order("sort").order("name"), "Kiosk-Artikel"),
        holen(alt.db.from("kiosk_buchungen").select("*").eq("person_id", ich.id).is("rechnung_id", null).order("am", { ascending: false }), "Kiosk-Käufe"),
        holen(alt.db.from("kiosk_rechnungen").select("*").eq("person_id", ich.id).order("erstellt_am", { ascending: false }).limit(30), "Kiosk-Rechnungen"),
      ]);
      setStand({ artikel, buchungen, rechnungen });
      setFehler("");
    } catch (e) {
      setFehler(String(e && e.message || e));
    }
  };
  useEffect(() => { laden(); const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  if (fehler) return <div className="karte karte--hinweis" id="ki-fehler"><p>Der Kiosk ist noch nicht bereit: {fehler}</p></div>;
  if (!stand) return <p className="klein">Lädt …</p>;
  const name = alt.personName(ich);
  const offen = stand.buchungen.reduce((s, b) => s + Number(b.preis) * b.menge, 0);

  const kaufen = async (a) => {
    const { data, error } = await alt.db.from("kiosk_buchungen")
      .insert({ person_id: ich.id, artikel_id: a.id, name: a.name, preis: a.preis, menge: 1, am: new Date().toISOString() }).select().single();
    if (error) { alt.meldung("Kauf ging nicht: " + error.message, "fehler"); return; }
    alt.merkeSchritt("Kauf " + a.name, [alt.rueckWeg("kiosk_buchungen", { id: data.id })]);
    alt.meldung(a.name + " gekauft, CHF " + chf(a.preis) + " aufs Konto.", "gut");
    laden();
  };
  const zuruecknehmen = async (b) => {
    const { error } = await alt.db.from("kiosk_buchungen").delete().eq("id", b.id);
    if (error) { alt.meldung("Zurücknehmen ging nicht: " + error.message, "fehler"); return; }
    laden();
  };
  const abrechnen = async () => {
    const ja = await nachfragen({ titel: "Jetzt abrechnen?", text: "Alle offenen Käufe (CHF " + chf(offen) + ") kommen auf eine Rechnung mit QR-Einzahlungsschein.", bestaetigen: "Abrechnen" });
    if (!ja) return;
    const { data, error } = await alt.db.rpc("kiosk_abrechnen", {});
    if (error) { alt.meldung(error.message, "fehler"); return; }
    await laden();
    const r = (await holen(alt.db.from("kiosk_rechnungen").select("*").eq("id", data), "Kiosk-Rechnung"))[0];
    if (r) rechnungZeigen(r, name);
  };

  return (<>
    <section className="karte ki-kopf">
      <div>
        <span className="klein">Offen auf deinem Konto</span>
        <b className="ki-offen" id="ki-offen">CHF {chf(offen)}</b>
      </div>
      <button className="knopf" id="ki-abrechnen" disabled={offen <= 0} onClick={abrechnen}>Abrechnen</button>
    </section>

    <section className="ki-artikel" id="ki-artikel">
      {stand.artikel.length === 0 && <p className="klein">Noch keine Artikel. Der Admin legt sie unter „Verwalten“ an.</p>}
      {stand.artikel.map((a) => (
        <button key={a.id} className="ki-art" data-ki-artikel={a.name} onClick={() => kaufen(a)}>
          {a.bild_url ? <img className="ki-art__bild" src={a.bild_url} alt="" /> : <span className="ki-art__ohne">🛒</span>}
          <span className="ki-art__name">{a.name}</span>
          {a.beschreibung && <span className="ki-art__text">{a.beschreibung}</span>}
          <span className="ki-art__preis">CHF {chf(a.preis)}</span>
        </button>))}
    </section>

    {stand.buchungen.length > 0 && <section className="karte">
      <h3>Noch nicht abgerechnet</h3>
      <ul className="ki-liste" id="ki-offene">
        {stand.buchungen.map((b) => {
          const frisch = Date.now() - new Date(b.am).getTime() < RUECKNAHME_MS;
          return (<li key={b.id} data-ki-buchung={b.id}>
            <span>{alt.datumZeitKurz ? alt.datumZeitKurz(b.am) : b.am}</span>
            <span>{b.menge > 1 ? b.menge + " × " : ""}{b.name}</span>
            <b>{chf(b.preis * b.menge)}</b>
            {frisch ? <button className="knopf knopf--klein knopf--still" title="Zurücknehmen" data-ki-weg={b.id} onClick={() => zuruecknehmen(b)}>✕</button> : <span />}
          </li>);
        })}
      </ul>
      <p className="klein">Ein Kauf lässt sich 10 Minuten lang zurücknehmen.</p>
    </section>}

    {stand.rechnungen.length > 0 && <section className="karte">
      <h3>Meine Rechnungen</h3>
      <ul className="ki-liste" id="ki-rechnungen">
        {stand.rechnungen.map((r) => (
          <li key={r.id} data-ki-rechnung={r.nr}>
            <span>{rechnungNr(r.nr)}</span>
            <span>{alt.kurzDatum(r.erstellt_am)} · CHF {chf(r.betrag)}</span>
            <span className={r.bezahlt_am ? "ki-bezahlt" : "ki-unbezahlt"}>{r.bezahlt_am ? "bezahlt" : "offen"}</span>
            <span className="ki-knoepfe">
              <button className="knopf knopf--klein" onClick={() => rechnungZeigen(r, name)}>PDF</button>
              {!r.bezahlt_am && <button className="knopf knopf--klein knopf--still" onClick={() => qrZeigen(r, name)}>QR</button>}
            </span>
          </li>))}
      </ul>
    </section>}
  </>);
}

// ---------- Verwalten (nur Admin von HOFERTIME) ----------

function Verwalten() {
  const [stand, setStand] = useState(null);
  const [fehler, setFehler] = useState("");
  const laden = async () => {
    try {
      const [artikel, offen, rechnungen, personen, konto] = await Promise.all([
        holen(alt.db.from("kiosk_artikel").select("*").order("sort").order("name"), "Kiosk-Artikel"),
        holen(alt.db.from("kiosk_buchungen").select("person_id, preis, menge").is("rechnung_id", null), "Kiosk-Käufe"),
        holen(alt.db.from("kiosk_rechnungen").select("*").order("erstellt_am", { ascending: false }).limit(300), "Kiosk-Rechnungen"),
        holen(alt.db.rpc("kiosk_personen"), "Kiosk-Personen"),
        kontoLaden(),
      ]);
      setStand({ artikel, offen, rechnungen, personen, konto });
      setFehler("");
    } catch (e) { setFehler(String(e && e.message || e)); }
  };
  useEffect(() => { laden(); }, []);
  if (fehler) return <div className="karte karte--hinweis"><p>Der Kiosk ist noch nicht bereit: {fehler}</p></div>;
  if (!stand) return <p className="klein">Lädt …</p>;

  const namen = Object.fromEntries(stand.personen.map((p) => [p.id, p.name]));
  const offenJe = {};
  for (const b of stand.offen) offenJe[b.person_id] = (offenJe[b.person_id] || 0) + Number(b.preis) * b.menge;
  const fehlt = kontoFehlt(stand.konto);
  const unbezahlt = stand.rechnungen.filter((r) => !r.bezahlt_am);

  const kontoAendern = async () => {
    const k = stand.konto;
    const w = await dialogFelder({
      titel: "Konto für den Einzahlungsschein",
      text: "Auf dieses Konto wird bezahlt. Mit normaler IBAN ohne Referenz, die Rechnungsnummer steht in der Mitteilung.",
      felder: [
        { name: "iban", label: "IBAN oder QR-IBAN", wert: k.iban || "", pflicht: true },
        { name: "name", label: "Name", wert: k.name || "", pflicht: true },
        { name: "strasse", label: "Strasse", wert: k.strasse || "" },
        { name: "hausnr", label: "Hausnummer", wert: k.hausnr || "" },
        { name: "plz", label: "PLZ", wert: k.plz || "", pflicht: true },
        { name: "ort", label: "Ort", wert: k.ort || "", pflicht: true },
      ],
      bestaetigen: "Speichern",
    });
    if (!w) return;
    w.iban = ibanSauber(w.iban);
    if (!ibanGut(w.iban)) { alt.meldung("Diese IBAN stimmt nicht (nur CH oder LI).", "warn"); return; }
    const daten = { ...k, ...w, land: k.land || "CH" };
    const { error } = await alt.db.from("kiosk_konto").upsert({ id: 1, daten, geaendert_am: new Date().toISOString() });
    if (error) { alt.meldung("Speichern ging nicht: " + error.message, "fehler"); return; }
    alt.meldung("Konto gespeichert" + (istQrIban(w.iban) ? " (QR-IBAN, mit QR-Referenz)." : "."), "gut");
    laden();
  };

  const artikelBearbeiten = async (a) => {
    const w = await dialogFelder({
      titel: a ? "Artikel ändern" : "Neuer Artikel",
      felder: [
        { name: "name", label: "Name", wert: a ? a.name : "", pflicht: true },
        { name: "preis", label: "Preis CHF", wert: a ? String(a.preis) : "", pflicht: true, dezimal: true },
        { name: "beschreibung", label: "Beschreibung (freiwillig)", typ: "textarea", zeilen: 2, wert: a ? a.beschreibung || "" : "" },
      ],
      bestaetigen: "Speichern",
    });
    if (!w) return;
    const preis = Number(String(w.preis).replace(",", "."));
    if (!(preis >= 0)) { alt.meldung("Preis bitte als Zahl, z. B. 2.50.", "warn"); return; }
    const zeile = { name: w.name, preis, beschreibung: (w.beschreibung || "").trim() || null };
    if (a) {
      const vorher = await alt.rueckSichern("kiosk_artikel", { id: a.id });
      const { error } = await alt.db.from("kiosk_artikel").update(zeile).eq("id", a.id);
      if (error) { alt.meldung(error.message, "fehler"); return; }
      alt.merkeSchritt("Artikel " + a.name, [alt.rueckSetz("kiosk_artikel", vorher)]);
    } else {
      const sort = stand.artikel.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 10;
      const { data, error } = await alt.db.from("kiosk_artikel").insert({ ...zeile, sort }).select().single();
      if (error) { alt.meldung(error.message, "fehler"); return; }
      alt.merkeSchritt("Artikel " + w.name, [alt.rueckWeg("kiosk_artikel", { id: data.id })]);
    }
    laden();
  };
  const bildSetzen = async (a, weg) => {
    let url = null;
    if (!weg) {
      const datei = await dateiWaehlen();
      if (!datei) return;
      try { url = await artikelBildHochladen(datei); }
      catch (f) { alt.meldung("Bild hochladen ging nicht: " + (f.message || f), "fehler"); return; }
    }
    const { error } = await alt.db.from("kiosk_artikel").update({ bild_url: url }).eq("id", a.id);
    if (error) { alt.meldung(error.message, "fehler"); return; }
    alt.merkeSchritt("Bild " + a.name, [alt.rueckSetz("kiosk_artikel", [{ id: a.id, bild_url: a.bild_url || null }])]);
    laden();
  };
  const artikelAktiv = async (a) => {
    await alt.db.from("kiosk_artikel").update({ aktiv: !a.aktiv }).eq("id", a.id);
    alt.merkeSchritt("Artikel " + a.name, [alt.rueckSetz("kiosk_artikel", [{ id: a.id, aktiv: a.aktiv }])]);
    laden();
  };
  const schieben = async (i, d) => {
    const l = [...stand.artikel];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    await Promise.all(l.map((a, k) => alt.db.from("kiosk_artikel").update({ sort: (k + 1) * 10 }).eq("id", a.id)));
    laden();
  };

  const abrechnenFuer = async (pid) => {
    const ja = await nachfragen({ titel: "Für " + (namen[pid] || "") + " abrechnen?", text: "Offen: CHF " + chf(offenJe[pid]) + ".", bestaetigen: "Abrechnen" });
    if (!ja) return;
    const { data, error } = await alt.db.rpc("kiosk_abrechnen", { p_person: pid });
    if (error) { alt.meldung(error.message, "fehler"); return; }
    await laden();
    const r = (await holen(alt.db.from("kiosk_rechnungen").select("*").eq("id", data), "Kiosk-Rechnung"))[0];
    if (r) rechnungZeigen(r, namen[pid]);
  };
  const bezahlt = async (r, ja) => {
    const { error } = await alt.db.from("kiosk_rechnungen")
      .update(ja ? { bezahlt_am: new Date().toISOString(), bezahlt_von: alt.profil.id } : { bezahlt_am: null, bezahlt_von: null }).eq("id", r.id);
    if (error) { alt.meldung(error.message, "fehler"); return; }
    alt.merkeSchritt(rechnungNr(r.nr) + (ja ? " bezahlt" : " offen"),
      [alt.rueckSetz("kiosk_rechnungen", [{ id: r.id, bezahlt_am: r.bezahlt_am, bezahlt_von: r.bezahlt_von }])]);
    laden();
  };
  const aufloesen = async (r) => {
    const ja = await nachfragen({ titel: rechnungNr(r.nr) + " auflösen?", text: "Die Käufe gelten wieder als offen, die Rechnung verschwindet.", bestaetigen: "Auflösen", gefahr: true });
    if (!ja) return;
    const { error } = await alt.db.rpc("kiosk_rechnung_aufloesen", { p_id: r.id });
    if (error) { alt.meldung(error.message, "fehler"); return; }
    laden();
  };

  const mitOffen = Object.keys(offenJe);
  return (<>
    <section className={"karte" + (fehlt.length ? " ki-warn" : "")} id="ki-konto">
      <h3>Konto für den Einzahlungsschein</h3>
      {fehlt.length
        ? <p>Fehlt noch: <b>{fehlt.join(", ")}</b>. Ohne das gibt es keine Rechnung.</p>
        : <p>{stand.konto.name}, {stand.konto.strasse} {stand.konto.hausnr}, {stand.konto.plz} {stand.konto.ort} · IBAN …{ibanSauber(stand.konto.iban).slice(-4)}
          {istQrIban(stand.konto.iban) ? " (QR-IBAN)" : ""}</p>}
      <button className="knopf knopf--klein" id="ki-konto-aendern" onClick={kontoAendern}>Konto ändern</button>
    </section>

    <section className="karte">
      <h3>Artikel</h3>
      <ul className="ki-liste" id="ki-artikel-liste">
        {stand.artikel.map((a, i) => (
          <li key={a.id} className={a.aktiv ? "" : "ki-aus"} data-ki-verwalten={a.name}>
            <span className="ki-verw">
              {a.bild_url ? <img className="ki-verw__bild" src={a.bild_url} alt="" /> : <span className="ki-verw__bild ki-verw__leer">🛒</span>}
              <span>{a.name}{a.beschreibung && <small className="klein"><br />{a.beschreibung}</small>}</span>
            </span>
            <b>CHF {chf(a.preis)}</b>
            <span>{a.aktiv ? "" : "ausgeschaltet"}</span>
            <span className="ki-knoepfe">
              <button className="knopf knopf--klein knopf--still" onClick={() => schieben(i, -1)} disabled={i === 0}>↑</button>
              <button className="knopf knopf--klein knopf--still" onClick={() => schieben(i, 1)} disabled={i === stand.artikel.length - 1}>↓</button>
              <button className="knopf knopf--klein" onClick={() => artikelBearbeiten(a)}>Ändern</button>
              <button className="knopf knopf--klein" data-ki-bild={a.name} onClick={() => bildSetzen(a)}>{a.bild_url ? "Bild ändern" : "+ Bild"}</button>
              {a.bild_url && <button className="knopf knopf--klein knopf--still" title="Bild entfernen" onClick={() => bildSetzen(a, true)}>✕ Bild</button>}
              <button className="knopf knopf--klein knopf--still" onClick={() => artikelAktiv(a)}>{a.aktiv ? "Aus" : "Ein"}</button>
            </span>
          </li>))}
      </ul>
      <button className="knopf knopf--klein" id="ki-artikel-neu" onClick={() => artikelBearbeiten(null)}>+ Artikel</button>
    </section>

    <section className="karte">
      <h3>Offen auf den Konten</h3>
      {mitOffen.length === 0 ? <p className="klein">Niemand hat offene Käufe.</p> :
        <ul className="ki-liste" id="ki-offen-alle">
          {mitOffen.map((pid) => (
            <li key={pid}>
              <span>{namen[pid] || "?"}</span>
              <b>CHF {chf(offenJe[pid])}</b>
              <span />
              <button className="knopf knopf--klein" onClick={() => abrechnenFuer(pid)}>Abrechnen</button>
            </li>))}
        </ul>}
    </section>

    <section className="karte">
      <h3>Rechnungen {unbezahlt.length ? "· " + unbezahlt.length + " offen, CHF " + chf(unbezahlt.reduce((s, r) => s + Number(r.betrag), 0)) : ""}</h3>
      {stand.rechnungen.length === 0 ? <p className="klein">Noch keine Rechnungen.</p> :
        <ul className="ki-liste" id="ki-rechnungen-alle">
          {stand.rechnungen.map((r) => (
            <li key={r.id} data-ki-rechnung={r.nr}>
              <span>{rechnungNr(r.nr)} · {namen[r.person_id] || "?"}</span>
              <span>{alt.kurzDatum(r.erstellt_am)} · CHF {chf(r.betrag)}</span>
              <span className={r.bezahlt_am ? "ki-bezahlt" : "ki-unbezahlt"}>{r.bezahlt_am ? "bezahlt " + alt.kurzDatum(r.bezahlt_am) : "offen"}</span>
              <span className="ki-knoepfe">
                <button className="knopf knopf--klein knopf--still" onClick={() => rechnungZeigen(r, namen[r.person_id])}>PDF</button>
                {r.bezahlt_am
                  ? <button className="knopf knopf--klein knopf--still" onClick={() => bezahlt(r, false)}>Doch offen</button>
                  : <>
                    <button className="knopf knopf--klein" data-ki-bezahlt={r.nr} onClick={() => bezahlt(r, true)}>Bezahlt</button>
                    <button className="knopf knopf--klein knopf--still" onClick={() => aufloesen(r)}>Auflösen</button>
                  </>}
              </span>
            </li>))}
        </ul>}
    </section>
  </>);
}
