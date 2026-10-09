// =================================================================
//  PAD MODE: WETTERFENSTER
//  Ein Tipp aufs Wetter im Pad öffnet dieses Fenster (Wunsch Patrick
//  9. Oktober 2026: „mehr Wetterinfos, stündlich und so“). Oben das
//  Wetter jetzt mit gefühlter Temperatur, Wind, Böen, Feuchte, UV und
//  Sonne, darunter die nächsten 24 Stunden mit Temperaturkurve, Regen
//  und Wind, zuletzt sieben Tage mit Spanne, Regenmenge und Sonnenstunden.
//  Die Daten holt das Fenster erst beim Öffnen frisch, damit die Säule
//  im Pad schlank bleibt.
// =================================================================
import { useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { wetterZeichen } from "./daten.js";

const TAGNAME = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const RICHTUNG = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
const STUNDE_BREITE = 58;   // Breite einer Stunde, Kurve und Spalten liegen genau übereinander

const runde = (n) => (n === null || n === undefined ? null : Math.round(n));
const richtung = (grad) => (grad === null || grad === undefined ? "" : RICHTUNG[Math.round(grad / 45) % 8]);
const zeitVon = (iso) => (iso || "").slice(11, 16);

export function wetterFensterOeffnen() {
  fensterOeffnen((zu) => <WetterFenster zu={zu} />, null, "wetter-huelle");
}

export async function holeWetterGenau() {
  const adresse = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + alt.ORT.lat + "&longitude=" + alt.ORT.lon
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,"
    + "wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day"
    + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day,uv_index"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
    + "precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max,sunshine_duration"
    + "&timezone=Europe%2FZurich&forecast_days=7";

  const antwort = await alt.zeitlimit(fetch(adresse), 8000, "Wetter");
  if (!antwort.ok) throw new Error("Wetterdienst antwortet nicht");
  const d = await antwort.json();
  const h = d.hourly || {}, t = d.daily || {}, c = d.current || {};
  const wert = (reihe, i) => (reihe ? reihe[i] : null);

  // Ab der laufenden Stunde 24 Stunden (Zeiten kommen in Ortszeit)
  const jetztStunde = alt.isoDatum(new Date()) + "T" + String(new Date().getHours()).padStart(2, "0") + ":00";
  const stunden = (h.time || []).map((zeit, i) => ({
    zeit,
    temp: runde(wert(h.temperature_2m, i)),
    regen: wert(h.precipitation_probability, i),
    mm: wert(h.precipitation, i),
    code: wert(h.weather_code, i),
    wind: runde(wert(h.wind_speed_10m, i)),
    tag: wert(h.is_day, i) !== 0,
    uv: wert(h.uv_index, i),
  })).filter((x) => x.zeit >= jetztStunde).slice(0, 24);

  const tage = (t.time || []).map((datum, i) => ({
    datum,
    code: wert(t.weather_code, i),
    hoch: runde(wert(t.temperature_2m_max, i)),
    tief: runde(wert(t.temperature_2m_min, i)),
    mm: wert(t.precipitation_sum, i),
    regen: wert(t.precipitation_probability_max, i),
    wind: runde(wert(t.wind_speed_10m_max, i)),
    boeen: runde(wert(t.wind_gusts_10m_max, i)),
    auf: zeitVon(wert(t.sunrise, i)),
    unter: zeitVon(wert(t.sunset, i)),
    uv: wert(t.uv_index_max, i),
    sonne: wert(t.sunshine_duration, i),
  }));

  return {
    temp: runde(c.temperature_2m),
    gefuehlt: runde(c.apparent_temperature),
    feuchte: runde(c.relative_humidity_2m),
    mm: c.precipitation,
    code: c.weather_code,
    text: alt.WETTER_TEXT[c.weather_code] || "",
    wind: runde(c.wind_speed_10m),
    richtung: richtung(c.wind_direction_10m),
    boeen: runde(c.wind_gusts_10m),
    tag: c.is_day !== 0,
    stunden,
    tage,
  };
}

// Klarer Himmel in der Nacht: Mond statt Sonne
function zeichen(code, tag) {
  if (!tag && (code === 0 || code === 1)) return "🌙";
  return wetterZeichen(code);
}

const mmText = (mm) => (mm === null || mm === undefined ? "" : (mm < 0.1 ? "0" : mm < 10 ? mm.toFixed(1) : Math.round(mm)) + " mm");

function WetterFenster({ zu }) {
  const [w, setW] = useState(null);   // null = lädt, false = nicht verfügbar
  useEffect(() => {
    let gueltig = true;
    holeWetterGenau().then((x) => gueltig && setW(x), () => gueltig && setW(false));
    return () => { gueltig = false; };
  }, []);

  return (
    <div className="dialog dialog--wetter" role="dialog" aria-label="Wetter">
      <div className="wf-kopf">
        <h2>Wetter <span>Lohn-Ammannsegg</span></h2>
        <button type="button" className="wf-zu" data-nein="" data-fokus="" onClick={zu} aria-label="Schliessen">✕</button>
      </div>
      {w === null && <p className="wf-hinweis">Wetter wird geladen …</p>}
      {w === false && <p className="wf-hinweis">Wetter nicht verfügbar. Bitte später noch einmal versuchen.</p>}
      {w && <>
        <Jetzt w={w} />
        <Stunden stunden={w.stunden} />
        <Tage tage={w.tage} />
      </>}
    </div>
  );
}

function Jetzt({ w }) {
  const heute = w.tage[0] || {};
  const angaben = [
    ["Gefühlt", w.gefuehlt + "°"],
    ["Wind", w.wind + " km/h " + w.richtung],
    ["Böen", w.boeen + " km/h"],
    ["Feuchte", w.feuchte + " %"],
    ["Regen heute", mmText(heute.mm) + (heute.regen !== null && heute.regen !== undefined ? " · " + heute.regen + " %" : "")],
    ["UV heute", heute.uv !== null && heute.uv !== undefined ? String(Math.round(heute.uv)) : "–"],
    ["Sonne auf", heute.auf || "–"],
    ["Sonne unter", heute.unter || "–"],
  ];
  return (
    <div className="wf-jetzt">
      <div className="wf-jetzt__haupt">
        <span className="wf-jetzt__zeichen">{zeichen(w.code, w.tag)}</span>
        <div>
          <div className="wf-jetzt__grad">{w.temp}°</div>
          <div className="wf-jetzt__text">{w.text}</div>
          <div className="wf-jetzt__spanne">{heute.tief}° bis {heute.hoch}°</div>
        </div>
      </div>
      <div className="wf-angaben">
        {angaben.map(([titel, text]) => (
          <div key={titel} className="wf-angabe"><span>{titel}</span><b>{text}</b></div>
        ))}
      </div>
    </div>
  );
}

// Die nächsten 24 Stunden: oben die Temperaturkurve, darunter je Stunde
// Zeit, Zeichen, Temperatur, Regenbalken und Wind. Rollt seitlich.
function Stunden({ stunden }) {
  if (!stunden.length) return null;
  const temps = stunden.map((x) => x.temp);
  const min = Math.min(...temps), max = Math.max(...temps);
  const hoehe = 54, rand = 8;
  const y = (t) => rand + (max === min ? (hoehe - 2 * rand) / 2 : (max - t) / (max - min) * (hoehe - 2 * rand));
  const breite = stunden.length * STUNDE_BREITE;
  const punkte = stunden.map((x, i) => (i * STUNDE_BREITE + STUNDE_BREITE / 2) + "," + y(x.temp).toFixed(1)).join(" ");
  return (
    <section className="wf-block">
      <h3>Nächste 24 Stunden</h3>
      <div className="wf-stunden" data-wetterstunden="">
        <div style={{ width: breite }}>
          <svg className="wf-kurve" width={breite} height={hoehe} viewBox={"0 0 " + breite + " " + hoehe} aria-hidden="true">
            <polyline points={punkte} fill="none" stroke="#ffb547" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {stunden.map((x, i) => <circle key={x.zeit} cx={i * STUNDE_BREITE + STUNDE_BREITE / 2} cy={y(x.temp)} r="3" fill="#ffb547" />)}
          </svg>
          <div className="wf-stundenreihe">
            {stunden.map((x, i) => {
              const neuerTag = i > 0 && x.zeit.slice(11, 13) === "00";
              return (
                <div key={x.zeit} className={"wf-stunde" + (neuerTag ? " wf-stunde--neuertag" : "")} style={{ width: STUNDE_BREITE }}>
                  <b>{i === 0 ? "Jetzt" : x.zeit.slice(11, 13) + " Uhr"}</b>
                  <i>{zeichen(x.code, x.tag)}</i>
                  <u>{x.temp}°</u>
                  <span className="wf-regenbalken" title={"Regen " + (x.regen ?? 0) + " %"}>
                    <span style={{ height: Math.max(2, x.regen || 0) + "%" }} className={(x.regen || 0) >= 50 ? "wf-viel" : ""} />
                  </span>
                  <span className="wf-regen">{x.regen ?? 0}%</span>
                  <span className="wf-mm">{x.mm >= 0.1 ? mmText(x.mm) : ""}</span>
                  <span className="wf-wind">{x.wind} km/h</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// Sieben Tage untereinander, die Spanne von Tief bis Hoch als Balken
// auf derselben Skala für die ganze Woche
function Tage({ tage }) {
  if (!tage.length) return null;
  const heute = alt.isoDatum(new Date());
  const min = Math.min(...tage.map((x) => x.tief)), max = Math.max(...tage.map((x) => x.hoch));
  const anteil = (t) => (max === min ? 0 : (t - min) / (max - min) * 100);
  return (
    <section className="wf-block">
      <h3>7 Tage</h3>
      <div className="wf-tage">
        {tage.map((x) => (
          <div key={x.datum} className="wf-tag" data-wettertag={x.datum}>
            <b className="wf-tag__name">{x.datum === heute ? "Heute" : TAGNAME[new Date(x.datum + "T12:00").getDay()]}
              <small>{alt.kurzDatum(x.datum)}</small></b>
            <i className="wf-tag__zeichen">{wetterZeichen(x.code)}</i>
            <span className="wf-tag__text">{alt.WETTER_TEXT[x.code] || ""}</span>
            <span className="wf-tag__tief">{x.tief}°</span>
            <span className="wf-spanne"><span style={{ left: anteil(x.tief) + "%", width: Math.max(4, anteil(x.hoch) - anteil(x.tief)) + "%" }} /></span>
            <span className="wf-tag__hoch">{x.hoch}°</span>
            <span className={"wf-tag__regen" + ((x.regen || 0) >= 50 ? " wf-viel" : "")}>💧 {x.regen ?? 0}% · {mmText(x.mm)}</span>
            <span className="wf-tag__wind">💨 {x.wind} km/h{x.boeen ? " (Böen " + x.boeen + ")" : ""}</span>
            <span className="wf-tag__sonne">☀ {x.sonne !== null && x.sonne !== undefined ? Math.round(x.sonne / 3600) + " h" : "–"} · {x.auf}–{x.unter}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
