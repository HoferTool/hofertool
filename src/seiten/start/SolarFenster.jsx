// =================================================================
//  SOLARANLAGE, MEHR INFOS (seit 1.747.0, Wunsch Patrick 23. November
//  2026: „Solaranlage soll man anklicken können, um mehr Infos zu
//  erfahren, versuche mehr Infos zu finden, um anzuzeigen“)
//
//  Antippen der Karte auf der Startseite öffnet dieses Fenster. Jetzt-
//  Werte kommen aus der letzten Messung, alles über Tage aus der
//  Datenbank-Funktion solar_tage (sql/solar-tage.sql), die je Tag
//  zusammenzählt: so holt das Fenster rund 90 Zeilen statt 25'000
//  Messwerte. Messwerte in solar_werte wurden bis 1.814.0 nach 90 Tagen
//  gelöscht, seither bleiben sie. Gezeigt wird nur, was die Messungen hergeben; die CO₂-
//  Zahl ist eine Annahme und steht so da.
// =================================================================
import { useEffect, useMemo, useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { Saeulen, Kennzahl } from "../../teile/Diagramm.jsx";

// Schweizer Verbrauchermix, rund 128 g CO₂ je kWh (BAFU, Annahme)
const CO2_JE_KWH = 0.128;

// Zahlen wie sonst im HoferTool: 1'200 und Komma (5,2 kWh)
const zahl = (n, stellen = 0) => {
  const [g, d] = Math.abs(n).toFixed(stellen).split(".");
  return (n < 0 ? "-" : "") + g.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (d ? "," + d : "");
};
const kwh = (n, stellen = 0) => {
  const z = Number(n) || 0;
  if (Math.abs(z) >= 10000) return zahl(z / 1000, 1) + " MWh";
  return zahl(z, stellen) + " kWh";
};
const prozent = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const tagText = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
};
const zeitText = (iso) => {
  try { return new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }); }
  catch (f) { return ""; }
};
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];

async function tageLaden() {
  const { data, error } = await alt.zeitlimit(alt.db.rpc("solar_tage", { p_tage: 90 }), 15000, "Solar Tageswerte");
  if (error) throw error;
  return (data || []).map((t) => ({
    datum: t.datum,
    ertrag: Number(t.ertrag_kwh) || 0,
    verbrauch: Number(t.verbrauch_kwh) || 0,
    bezug: Number(t.bezug_kwh) || 0,
    einspeisung: Number(t.einspeisung_kwh) || 0,
    spitze: Number(t.spitze_w) || 0,
    spitzeZeit: t.spitze_zeit,
    verbrauchSpitze: Number(t.verbrauch_spitze_w) || 0,
    messungen: t.messungen || 0,
  }));
}

function SolarFenster({ zu }) {
  const [tage, setTage] = useState(null);
  const [jetzt, setJetzt] = useState(null);
  const [fehler, setFehler] = useState("");
  const [spanne, setSpanne] = useState(30);

  useEffect(() => {
    tageLaden().then(setTage).catch((f) => setFehler(alt.fehlertext(f)));
    alt.solarLaden().then((r) => setJetzt(r[r.length - 1] || null)).catch(() => {});
  }, []);

  const heuteIso = alt.isoDatum(new Date());
  const r = useMemo(() => {
    if (!tage) return null;
    // Nur ganze Tage zählen; der erste Tag der Aufzeichnung ist meist halb
    const voll = tage.filter((t) => t.messungen >= 200 || t.datum === heuteIso);
    const heute = tage.find((t) => t.datum === heuteIso) || null;
    const gestern = tage.find((t) => t.datum === alt.plusTage(heuteIso, -1)) || null;
    const ohneHeute = voll.filter((t) => t.datum !== heuteIso);
    const zeitraum = ohneHeute.slice(-spanne);
    const summe = (l, f) => l.reduce((s, t) => s + t[f], 0);
    const ertrag = summe(zeitraum, "ertrag");
    const verbrauch = summe(zeitraum, "verbrauch");
    const bester = zeitraum.reduce((b, t) => (!b || t.ertrag > b.ertrag ? t : b), null);
    const spitze = zeitraum.reduce((b, t) => (!b || t.spitze > b.spitze ? t : b), null);
    // Monate über alles, was da ist
    const monate = new Map();
    voll.forEach((t) => {
      const k = t.datum.slice(0, 7);
      const m = monate.get(k) || { k, ertrag: 0, verbrauch: 0, tage: 0 };
      m.ertrag += t.ertrag; m.verbrauch += t.verbrauch; m.tage += 1;
      monate.set(k, m);
    });
    return {
      heute, gestern, zeitraum, ertrag, verbrauch, bester, spitze,
      schnitt: zeitraum.length ? ertrag / zeitraum.length : 0,
      monate: [...monate.values()].reverse(),
      erster: tage[0] ? tage[0].datum : null,
    };
  }, [tage, spanne, heuteIso]);

  const prod = jetzt ? Number(jetzt.produktion_w) || 0 : 0;
  const verb = jetzt ? Number(jetzt.verbrauch_w) || 0 : 0;
  const netz = jetzt ? Number(jetzt.netz_w) || 0 : 0;
  const alt_min = jetzt ? Math.round((Date.now() - new Date(jetzt.gemessen).getTime()) / 60000) : 0;

  return (
    <div className="dialog dialog--breit solfenster" role="dialog" aria-modal="true" id="solar-fenster">
      <div className="blatt__kopf">
        <h2>Solaranlage</h2>
        <button className="knopf knopf--still" data-zu="" onClick={zu}>Schliessen</button>
      </div>

      {fehler && <p className="hinweis">{fehler}
        {/solar_tage|function|schema cache/i.test(fehler) ? " Die Funktion fehlt noch: sql/solar-tage.sql im SQL-Editor ausführen." : ""}</p>}

      {jetzt && <section className="solfenster__block">
        <h3>Jetzt <span className="klein">{alt_min < 2 ? "live" : "vor " + alt_min + " Min."}</span></h3>
        <div className="solfenster__zahlen">
          <Kennzahl titel="Erzeugung" wert={alt.solarKw(prod)} id="solf-jetzt-prod" />
          <Kennzahl titel="Verbrauch Betrieb" wert={alt.solarKw(verb)} />
          <Kennzahl titel={netz > 0 ? "Netzbezug" : "Einspeisung"} wert={alt.solarKw(Math.abs(netz))} />
          <Kennzahl titel="Vom Dach gedeckt" wert={prozent(Math.min(prod, verb), verb) + " %"}
            unter="vom Verbrauch im Moment" />
        </div>
      </section>}

      {!tage && !fehler && <p className="klein">Tageswerte werden geladen …</p>}

      {r && <>
        <section className="solfenster__block">
          <h3>Heute und gestern</h3>
          <div className="solfenster__zahlen">
            <Kennzahl titel="Ertrag heute" wert={kwh(r.heute?.ertrag, 1)} id="solf-heute"
              unter={r.heute && r.heute.spitze ? "Spitze " + alt.solarKw(r.heute.spitze) + " um " + zeitText(r.heute.spitzeZeit) : ""} />
            <Kennzahl titel="Verbrauch heute" wert={kwh(r.heute?.verbrauch)}
              unter={r.heute ? prozent(r.heute.ertrag, r.heute.verbrauch) + " % vom Dach" : ""} />
            <Kennzahl titel="Ertrag gestern" wert={kwh(r.gestern?.ertrag, 1)}
              unter={r.gestern && r.gestern.spitze ? "Spitze " + alt.solarKw(r.gestern.spitze) + " um " + zeitText(r.gestern.spitzeZeit) : ""} />
            <Kennzahl titel="Verbrauch gestern" wert={kwh(r.gestern?.verbrauch)}
              unter={r.gestern ? "Spitze " + alt.solarKw(r.gestern.verbrauchSpitze) : ""} />
          </div>
        </section>

        <section className="solfenster__block">
          <div className="solfenster__titelzeile">
            <h3>Letzte {spanne} Tage</h3>
            <span className="sol-spanne">
              {[7, 30, 90].map((n) => (
                <button key={n} type="button" data-solftage={n}
                  className={"sol-spanne__knopf" + (spanne === n ? " aktiv" : "")}
                  onClick={() => setSpanne(n)}>{n} Tage</button>))}
            </span>
          </div>
          <div className="solfenster__zahlen">
            <Kennzahl titel="Ertrag" wert={kwh(r.ertrag)} id="solf-summe"
              unter={"Ø " + kwh(r.schnitt, 1) + " je Tag"} />
            <Kennzahl titel="Vom Dach gedeckt" wert={prozent(r.ertrag, r.verbrauch) + " %"}
              unter={"vom Verbrauch " + kwh(r.verbrauch)} />
            <Kennzahl titel="Bester Tag" wert={r.bester ? kwh(r.bester.ertrag) : "–"}
              unter={r.bester ? tagText(r.bester.datum) : ""} />
            <Kennzahl titel="Höchste Leistung" wert={r.spitze ? alt.solarKw(r.spitze.spitze) : "–"}
              unter={r.spitze ? tagText(r.spitze.datum) + ", " + zeitText(r.spitze.spitzeZeit) : ""} />
            <Kennzahl titel="CO₂ vermieden" wert={"ca. " + zahl(r.ertrag * CO2_JE_KWH) + " kg"}
              unter="Annahme: Schweizer Strommix 128 g je kWh" />
          </div>
          <h4 className="solfenster__unter">Ertrag je Tag</h4>
          <Saeulen id="solf-ertrag" hoehe={170}
            werte={r.zeitraum.map((t) => ({
              key: t.datum, label: t.datum.slice(8, 10) + "." + t.datum.slice(5, 7), wert: t.ertrag,
              tip: <><b>{kwh(t.ertrag, 1)}</b> {tagText(t.datum)}<br />Spitze {alt.solarKw(t.spitze)} um {zeitText(t.spitzeZeit)}</>,
            }))}
            format={(n) => Math.round(n) + ""} wertText={(n) => spanne > 30 ? "" : Math.round(n) + ""} />
          <h4 className="solfenster__unter">Anteil vom Dach je Tag</h4>
          <Saeulen id="solf-anteil" hoehe={120}
            werte={r.zeitraum.map((t) => ({
              key: t.datum, label: t.datum.slice(8, 10) + "." + t.datum.slice(5, 7),
              wert: prozent(t.ertrag, t.verbrauch),
              tip: <><b>{prozent(t.ertrag, t.verbrauch)} %</b> {tagText(t.datum)}<br />
                {kwh(t.ertrag)} von {kwh(t.verbrauch)}</>,
            }))}
            format={(n) => Math.round(n) + " %"} wertText={(n) => spanne > 30 ? "" : Math.round(n) + ""} />
        </section>

        {r.monate.length > 0 && <section className="solfenster__block">
          <h3>Monate</h3>
          <table className="solfenster__tabelle" id="solf-monate">
            <thead><tr><th>Monat</th><th>Ertrag</th><th>Verbrauch</th><th>Vom Dach</th><th>Tage</th></tr></thead>
            <tbody>
              {r.monate.map((m) => (
                <tr key={m.k}>
                  <td>{MONATE[Number(m.k.slice(5, 7)) - 1]} {m.k.slice(0, 4)}</td>
                  <td>{kwh(m.ertrag)}</td><td>{kwh(m.verbrauch)}</td>
                  <td>{prozent(m.ertrag, m.verbrauch)} %</td><td>{m.tage}</td>
                </tr>))}
            </tbody>
          </table>
        </section>}

        <p className="klein solfenster__fuss">
          Gemessen alle 5 Minuten am Solar-Log{r.erster ? ", aufgezeichnet seit " + tagText(r.erster) : ""}.
          Verbrauch und Netzbezug sind aus den Messungen hochgerechnet,
          der Ertrag kommt direkt vom Solar-Log.
        </p>
      </>}
    </div>
  );
}

export function solarFensterOeffnen() {
  fensterOeffnen((zu) => <SolarFenster zu={zu} />);
}
