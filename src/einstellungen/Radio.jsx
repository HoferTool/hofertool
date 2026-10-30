// =================================================================
//  EINSTELLUNGEN · RADIO IM PAUSENRAUM
//  Welche Sender auf dem Pausenraum-Display zum Antippen stehen
//  (Wunsch Patrick 30. Oktober 2026). Radio = Adresse des Stroms
//  (https, mp3 oder aac), YouTube = Adresse eines Kanals, einer
//  Wiedergabeliste oder eines Videos. Nur Admins.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Gruppe } from "./teile.jsx";
import { VORGABE, senderLaden, senderSpeichern, istVideo, videoEinbetten, neueSenderId } from "../daten/radio.js";

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function RadioSender() {
  const [liste, setListe] = useState(null);
  const [gespeichert, setGespeichert] = useState(null);
  const [probe, setProbe] = useState(null);
  const ton = useRef(null);

  useEffect(() => {
    senderLaden().then((l) => { setListe(l); setGespeichert(l); });
    return () => { if (ton.current) ton.current.pause(); };
  }, []);
  if (!liste) return null;

  const aendern = (i, feld, wert) => setListe((l) => l.map((s, j) => (j === i ? { ...s, [feld]: wert } : s)));

  const probeHoeren = (s) => {
    const a = ton.current;
    if (probe === s.id) { a.pause(); setProbe(null); return; }
    if (istVideo(s)) {
      const url = videoEinbetten(s);
      if (url) window.open(url.replace("autoplay=1", "autoplay=0").replace("autoplay=true", "autoplay=false"), "_blank", "noopener");
      else alt.meldung("Diese Adresse versteht die App nicht. YouTube: Kanal (…/channel/UC…), Wiedergabeliste oder Video. SRF: Adresse aus Play SRF oder urn:srf:video:…", "warn");
      return;
    }
    a.src = s.adresse; setProbe(s.id);
    a.play().catch(() => { setProbe(null); alt.meldung(s.name + ": Sender spielt nicht. Stimmt die Adresse (https)?", "warn"); });
  };

  const speichern = async () => {
    const neu = liste.map((s) => ({ ...s, name: s.name.trim(), adresse: s.adresse.trim() }))
      .filter((s) => s.name || s.adresse);
    if (neu.some((s) => !s.name || !s.adresse)) { alt.meldung("Bitte bei jedem Sender Name und Adresse eintragen.", "warn"); return; }
    if (neu.some((s) => s.art === "radio" && !/^https:\/\//i.test(s.adresse))) {
      alt.meldung("Radio-Adressen müssen mit https:// beginnen, sonst spielt der Browser sie nicht.", "warn"); return;
    }
    if (neu.some((s) => istVideo(s) && !videoEinbetten(s))) {
      alt.meldung("Eine Video-Adresse versteht die App nicht. YouTube: Kanal (…/channel/UC…), Wiedergabeliste oder Video. SRF: Adresse aus Play SRF oder urn:srf:video:…", "warn"); return;
    }
    try {
      await senderSpeichern(neu);
      setListe(neu); setGespeichert(neu);
      alt.meldung("Sender gespeichert. Das Display holt sie innert 10 Minuten.", "gut");
    } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
  };

  return (
    <Gruppe titel="Radio im Pausenraum" id="radio-sender"
      text="Diese Sender stehen auf dem Pausenraum-Display zum Antippen. Radio: Adresse des Stroms mit https. YouTube: Adresse eines Kanals (…/channel/UC…), einer Wiedergabeliste oder eines Videos. SRF: Adresse einer Sendung oder eines Livestreams aus Play SRF."
      aktionen={!gleich(liste, gespeichert) && (
        <button className="knopf knopf--klein knopf--haupt" id="radio-speichern" onClick={speichern}>Speichern</button>
      )}>
      <div className="es-radio">
        {liste.map((s, i) => (
          <div className="es-radio__zeile" key={s.id}>
            <input className="es-radio__name" value={s.name} placeholder="Name" onChange={(e) => aendern(i, "name", e.target.value)} />
            <select value={s.art} onChange={(e) => aendern(i, "art", e.target.value)}>
              <option value="radio">Radio</option>
              <option value="youtube">YouTube</option>
              <option value="srf">SRF (Play SRF)</option>
            </select>
            <input className="es-radio__adresse" value={s.adresse} placeholder="https://…" onChange={(e) => aendern(i, "adresse", e.target.value)} />
            <button className="knopf knopf--klein" onClick={() => probeHoeren(s)}>
              {probe === s.id ? "■ Stopp" : istVideo(s) ? "Ansehen" : "▶ Probe"}</button>
            <button className="knopf knopf--klein" aria-label="Entfernen" title="Entfernen"
              onClick={() => setListe((l) => l.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div className="es-radio__unten">
          <button className="knopf knopf--klein" id="radio-neu"
            onClick={() => setListe((l) => [...l, { id: neueSenderId(), name: "", art: "radio", adresse: "" }])}>+ Sender</button>
          <button className="knopf knopf--klein" onClick={() => setListe(VORGABE)}>Wie am Anfang</button>
        </div>
      </div>
      <audio ref={ton} onEnded={() => setProbe(null)} />
    </Gruppe>
  );
}
