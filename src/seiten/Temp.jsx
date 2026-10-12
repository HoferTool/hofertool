// =================================================================
//  TEMP-ORDNER (1.38.0, Wunsch Patrick 12. Oktober 2026)
//  Ein eigener Ordner je Person, um Dateien, Fotos und Videos vom
//  Handy oder Tablet auf den Computer zu bringen: dort hochladen oder
//  direkt aufnehmen, am Computer herunterladen und löschen. Nur die
//  Person selbst sieht ihn (geprüft in der Datenbank). Nach 7 Tagen
//  ist alles von selbst weg. Daten in src/daten/temp.js.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt, useDaten } from "../bruecke.jsx";
import { betrachter } from "../teile/Betrachter.jsx";
import { TEMP_TAGE, TEMP_MAX, TEMP_MAX_MB, tempListe, tempHochladen, tempLoeschen, tempAdresse, tempVorschauen } from "../daten/temp.js";

const ruehrbar = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches;

function groesseText(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1).replace(".0", "") + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " Byte";
}

function restText(am) {
  const rest = TEMP_TAGE - Math.floor((Date.now() - new Date(am).getTime()) / 86400000);
  if (rest <= 1) return "wird bald gelöscht";
  return "noch " + rest + " Tage";
}

const istBild = (d) => /^image\//.test(d.typ) || /\.(jpe?g|png|gif|webp|heic)$/i.test(d.name);
const istVideo = (d) => /^video\//.test(d.typ) || /\.(mp4|mov|m4v|webm)$/i.test(d.name);
const istPdf = (d) => d.typ === "application/pdf" || /\.pdf$/i.test(d.name);
const istXl = (d) => /\.(xlsx?|xlsm)$/i.test(d.name);
const endung = (d) => ((d.name.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || "Datei").toUpperCase();

export default function Temp({ auffrischen }) {
  const { daten: liste, fehler, neu } = useDaten(tempListe, [auffrischen]);
  const [laeuft, setLaeuft] = useState([]);
  const [ziehen, setZiehen] = useState(false);
  const [bilder, setBilder] = useState({});
  const wahl = useRef(null), foto = useRef(null), video = useRef(null);
  const touch = ruehrbar();

  // Was am Handy hochgeladen wurde, erscheint am Computer von selbst:
  // beim Zurückkommen in den Tab und alle 20 Sekunden, solange sichtbar
  useEffect(() => {
    const sichtbar = () => { if (document.visibilityState === "visible") neu(); };
    document.addEventListener("visibilitychange", sichtbar);
    const t = setInterval(sichtbar, 20000);
    return () => { document.removeEventListener("visibilitychange", sichtbar); clearInterval(t); };
  }, [neu]);

  // Vorschaubilder holen, nur für Bilder ohne Vorschau
  useEffect(() => {
    if (!liste) return;
    const fehlt = liste.filter((d) => istBild(d) && !bilder[d.pfad]).map((d) => d.pfad);
    if (!fehlt.length) return;
    tempVorschauen(fehlt).then((neue) => setBilder((b) => ({ ...b, ...neue }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste]);

  const hochladen = async (dateien) => {
    dateien = Array.from(dateien || []);
    if (!dateien.length) return;
    const zuGross = dateien.filter((d) => d.size > TEMP_MAX);
    if (zuGross.length) alt.meldung(zuGross.map((d) => d.name).join(", ")
      + (zuGross.length > 1 ? " sind" : " ist") + " grösser als " + TEMP_MAX_MB + " MB und " + (zuGross.length > 1 ? "werden" : "wird") + " nicht hochgeladen.", "warn");
    const ok = dateien.filter((d) => d.size <= TEMP_MAX);
    let gut = 0;
    for (const d of ok) {
      const eintrag = { name: d.name || "Foto", groesse: d.size };
      setLaeuft((l) => l.concat([eintrag]));
      try { await tempHochladen(d); gut++; }
      catch (f) { alt.meldung((d.name || "Datei") + ": " + alt.fehlertext(f), "fehler"); }
      setLaeuft((l) => l.filter((x) => x !== eintrag));
      neu();
    }
    if (gut) alt.meldung(gut === 1 ? "Hochgeladen." : gut + " Dateien hochgeladen.", "gut");
  };

  // Solange Kamera oder Dateiauswahl offen sind, ist die App im Hintergrund;
  // die Abmeldung nach 1 Minute wartet darauf (leerlaufPruefen in app.js)
  const waehlen = (ref) => { document.body.dataset.tempWahl = String(Date.now()); ref.current.click(); };
  const fertig = () => { delete document.body.dataset.tempWahl; };
  useEffect(() => {
    // „Abbrechen“ in der Auswahl (Browser mit cancel-Ereignis)
    const felder = [wahl, foto, video].map((r) => r.current).filter(Boolean);
    felder.forEach((f) => f.addEventListener("cancel", fertig));
    return () => { felder.forEach((f) => f.removeEventListener("cancel", fertig)); fertig(); };
  }, []);
  const gewaehlt = (e) => { fertig(); const f = e.target.files; hochladen(f).finally(() => { e.target.value = ""; }); };

  const ansehen = async (d) => {
    try {
      const url = await tempAdresse(d.pfad);
      if (istVideo(d)) { window.open(url, "_blank", "noopener"); return; }
      if (istBild(d) || istPdf(d) || istXl(d)) {
        betrachter(url, d.name.replace(/\.[^.]+$/, ""), istPdf(d), istXl(d) ? "excel" : istPdf(d) ? "pdf" : "bild",
          (d.name.match(/\.([A-Za-z0-9]+)$/) || [])[1]);
        return;
      }
      herunterladen(d);
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const herunterladen = async (d) => {
    try {
      const a = document.createElement("a");
      a.href = await tempAdresse(d.pfad, d.name);
      a.download = d.name;
      a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  const loeschen = async (dateien, alle) => {
    const ok = await alt.nachfragen({
      titel: alle ? "Ganzen Temp-Ordner leeren" : "Datei löschen",
      text: alle ? "Sollen alle " + dateien.length + " Dateien gelöscht werden?" : "Soll „" + dateien[0].name + "“ gelöscht werden?",
      bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    try { await tempLoeschen(dateien.map((d) => d.pfad)); alt.meldung("Gelöscht."); }
    catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    neu();
  };

  // Am Computer: Dateien einfach auf die Seite ziehen
  const zieh = {
    onDragOver: (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setZiehen(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setZiehen(false); },
    onDrop: (e) => { e.preventDefault(); setZiehen(false); hochladen(e.dataTransfer.files); },
  };

  return (
    <div className={"temp" + (ziehen ? " temp--ziehen" : "")} id="temp-seite" {...zieh}>
      <h1 className="seitentitel">Mein Temp-Ordner</h1>
      <p className="temp__hinweis">
        Nur du siehst diese Dateien. Nach {TEMP_TAGE} Tagen werden sie von selbst gelöscht. Höchstens {TEMP_MAX_MB} MB je Datei.
      </p>
      <div className="temp__knoepfe">
        {touch && <>
          <button className="knopf knopf--haupt" id="temp-foto" onClick={() => waehlen(foto)}>
            <Zeichen art="foto" /> Foto aufnehmen</button>
          <button className="knopf knopf--haupt" id="temp-video" onClick={() => waehlen(video)}>
            <Zeichen art="video" /> Video aufnehmen</button>
        </>}
        <button className={"knopf" + (touch ? "" : " knopf--haupt")} id="temp-hochladen" onClick={() => waehlen(wahl)}>
          <Zeichen art="hoch" /> Dateien hochladen</button>
        <input ref={wahl} type="file" multiple hidden id="temp-datei" onChange={gewaehlt} />
        <input ref={foto} type="file" accept="image/*" capture="environment" hidden id="temp-foto-datei" onChange={gewaehlt} />
        <input ref={video} type="file" accept="video/*" capture="environment" hidden id="temp-video-datei" onChange={gewaehlt} />
      </div>
      {!touch && <div className="temp__ablage">oder Dateien hierher ziehen</div>}

      {laeuft.length > 0 && (
        <ul className="temp__liste temp__liste--laeuft">
          {laeuft.map((l, i) => (
            <li className="temp__zeile" key={i}>
              <span className="temp__bild temp__bild--leer"><span className="temp__dreht" /></span>
              <span className="temp__text"><b>{l.name}</b>
                <span className="klein">{groesseText(l.groesse)} · wird hochgeladen …</span></span>
            </li>
          ))}
        </ul>
      )}

      {fehler && !liste
        ? <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>
        : !liste
          ? <div className="laedt">Wird geladen …</div>
          : !liste.length && !laeuft.length
            ? <div className="karte karte--hinweis temp__leer"><p>Dein Temp-Ordner ist leer.</p></div>
            : <>
                <ul className="temp__liste" id="temp-liste">
                  {liste.map((d) => (
                    <li className="temp__zeile" key={d.pfad} data-temp={d.name}>
                      <button className="temp__bild" title="Ansehen" onClick={() => ansehen(d)}>
                        {istBild(d) && bilder[d.pfad]
                          ? <img src={bilder[d.pfad]} alt="" loading="lazy" />
                          : <span className="temp__art">{istVideo(d) ? <Zeichen art="video" /> : endung(d)}</span>}
                      </button>
                      <button className="temp__text" onClick={() => ansehen(d)} title="Ansehen">
                        <b>{d.name}</b>
                        <span className="klein">{groesseText(d.groesse)} · {alt.datumZeitKurz(d.am)} · {restText(d.am)}</span>
                      </button>
                      <button className="knopf knopf--klein temp__runter" data-temprunter={d.name} title="Herunterladen"
                        onClick={() => herunterladen(d)}><Zeichen art="runter" /><span>Herunterladen</span></button>
                      <button className="chipweg" data-tempweg={d.name} title="Löschen" onClick={() => loeschen([d])}>×</button>
                    </li>
                  ))}
                </ul>
                {liste.length > 1 && (
                  <button className="linkknopf temp__alle" id="temp-alle-weg" onClick={() => loeschen(liste, true)}>
                    Alle {liste.length} Dateien löschen</button>
                )}
              </>}
    </div>
  );
}

function Zeichen({ art }) {
  const pfad = {
    foto: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
    hoch: <><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
    runter: <><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
  }[art];
  return <svg className="temp__zeichen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{pfad}</svg>;
}
