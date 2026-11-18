// =================================================================
//  STEMPEL-PANEL (seit 1.626.0, Wunsch Patrick 18. November 2026: „an
//  den Panels ohne Anmeldung Person wählen können und stempeln“)
//  Das iPad ist mit einem Panel-Konto angemeldet (profiles.zeit_terminal,
//  Gerätekonto, bleibt angemeldet). Es zeigt alle Personen als Kacheln,
//  grün wer da ist. Antippen → ein grosser Knopf Kommen oder Gehen, je
//  nachdem, ob die Person da ist → Bestätigung mit „Rückgängig“ (2 Minuten
//  lang, zeit_panel_zurueck), nach ein paar Sekunden wieder die Kacheln.
//  Das Panel liest nur Name und Stand, keine Zeiten (zeit_panel_personen).
//  Seit 1.632.0 wählt die Gesichtserkennung die Person (Kamera oben
//  rechts, ein- und ausschaltbar je Gerät), drücken muss man weiter.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../../bruecke.jsx";
import {
  uhrzeit, dauerText, saldoRechnen, ferienStand, abwesendeTage, feiertageEintragen, feiertageLaden,
  tageRechnen, paareRechnen, montag, tagePlus,
} from "../../daten/zeit.js";
import { gesichtLesen, personFinden, kameraStarten, kameraMoeglich } from "./gesicht.js";

// Kamera am Panel je Gerät ein oder aus (Vorgabe ein)
const KAMERA_KEY = "hofer.zeit.kamera";
function kameraAn() { try { return localStorage.getItem(KAMERA_KEY) !== "aus"; } catch { return true; } }
function kameraMerken(an) { try { localStorage.setItem(KAMERA_KEY, an ? "an" : "aus"); } catch { /* egal */ } }

// Erkennung am Panel: liest alle 0.7 Sekunden, solange die Kacheln stehen.
// Dieselbe Person zweimal nacheinander erkannt → wählen. Das Gesicht muss
// gross genug sein (steht vor dem Panel), wer gerade gestempelt hat, wird
// 20 Sekunden nicht nochmals gewählt.
function useErkennung({ an, aktiv, leute, waehlen }) {
  const video = useRef(null);
  const [gesichter, setGesichter] = useState(null);
  const [stand, setStand] = useState("");
  const pause = useRef({});
  const zuletzt = useRef(null);
  const aktivRef = useRef(aktiv);
  aktivRef.current = aktiv;
  const leuteRef = useRef(leute);
  leuteRef.current = leute;
  const waehlenRef = useRef(waehlen);
  waehlenRef.current = waehlen;

  useEffect(() => {
    if (!an) return undefined;
    const holen = () => alt.db.rpc("zeit_panel_gesichter").then((r) => { if (!r.error) setGesichter(r.data || []); }, () => {});
    holen();
    const t = setInterval(holen, 300000);
    return () => clearInterval(t);
  }, [an]);

  const bereit = an && gesichter && gesichter.length > 0 && kameraMoeglich();
  useEffect(() => {
    if (!bereit) return undefined;
    let weg = false;
    let stopp = null;
    let timer = null;
    setStand("Kamera startet …");
    const runde = async () => {
      if (weg) return;
      if (aktivRef.current && video.current) {
        try {
          const g = await gesichtLesen(video.current);
          const p = g && g.gross >= 0.15 && g.sicher >= 0.6 ? personFinden(g.muster, gesichter) : null;
          if (p && !(pause.current[p.id] > Date.now())) {
            if (zuletzt.current === p.id) {
              const person = (leuteRef.current || []).find((x) => x.id === p.id);
              zuletzt.current = null;
              if (person) { pause.current[p.id] = Date.now() + 20000; waehlenRef.current(person); }
            } else zuletzt.current = p.id;
          } else zuletzt.current = null;
        } catch (f) {
          setStand("Gesichtserkennung: " + alt.fehlertext(f));
        }
      }
      if (!weg) timer = setTimeout(runde, 700);
    };
    kameraStarten(video.current).then((s) => {
      if (weg) { s(); return; }
      stopp = s;
      setStand("");
      runde();
    }, (f) => setStand("Kamera nicht erlaubt: " + (f && f.message ? f.message : f)));
    return () => { weg = true; clearTimeout(timer); if (stopp) stopp(); };
  }, [bereit, gesichter]);

  return { video, bereit, stand, anzahl: gesichter ? gesichter.length : 0 };
}

// Saldo am Panel ohne Stempeln (Wunsch Patrick 18. November 2026: „es
// soll auch eine Saldoanzeige geben, ohne Kommen oder Gehen“). Die
// Datenbank gibt nur die Daten dieser einen Person (zeit_panel_saldo),
// gerechnet wird wie in HOFERTIME.
async function saldoHolen(person) {
  const [r] = await Promise.all([
    alt.zeitlimit(alt.db.rpc("zeit_panel_saldo", { p_person: person.id }), 10000, "Saldo"),
    feiertageLaden(),
  ]);
  if (r.error) throw r.error;
  const d = r.data || {};
  const einst = d.einst || null;
  const stempel = d.stempel || [];
  const ferien = d.ferien || [];
  const buchungen = d.buchungen || [];
  const stufen = d.stufen || [];
  const heute = alt.isoDatum(new Date());
  const tage = tageRechnen(paareRechnen(stempel), einst);
  const abw = feiertageEintragen(abwesendeTage(ferien), tage);
  const mo = alt.isoDatum(montag(new Date()));
  let woche = 0;
  for (let i = 0; i < 7; i++) { const t = tage.get(alt.isoDatum(tagePlus(alt.ausIso(mo), i))); woche += t ? t.minuten : 0; }
  return {
    saldo: saldoRechnen(einst, stempel, ferien, null, buchungen),
    ferien: einst ? ferienStand(einst, abw, new Date().getFullYear(), heute, { stufen, buchungen }) : null,
    heute: tage.get(heute) ? tage.get(heute).minuten : 0,
    woche,
    stunde: !!einst && einst.lohnart === "stunde",
  };
}

async function personenHolen() {
  const r = await alt.zeitlimit(alt.db.rpc("zeit_panel_personen"), 10000, "Panel");
  if (r.error) throw r.error;
  return r.data || [];
}

export default function Panel() {
  const [leute, setLeute] = useState(null);
  const [fehler, setFehler] = useState("");
  const [wahl, setWahl] = useState(null);
  const [fertig, setFertig] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [suche, setSuche] = useState("");
  const [uhr, setUhr] = useState(new Date());
  const [saldo, setSaldo] = useState(null);
  const [kamera, setKamera] = useState(kameraAn);
  const [perGesicht, setPerGesicht] = useState(false);
  const erk = useErkennung({
    an: kamera, aktiv: !wahl && !fertig && !saldo, leute,
    waehlen: (p) => { setPerGesicht(true); setWahl(p); },
  });

  const laden = () => personenHolen().then((d) => { setLeute(d); setFehler(""); }, (f) => setFehler(alt.fehlertext(f)));
  useEffect(() => {
    laden();
    const t = setInterval(laden, 60000);
    const u = setInterval(() => setUhr(new Date()), 15000);
    return () => { clearInterval(t); clearInterval(u); };
  }, []);
  // Gewählt und nichts gedrückt: nach 20 Sekunden zurück zu den Kacheln
  useEffect(() => {
    if (!wahl) return undefined;
    const t = setTimeout(() => setWahl(null), 20000);
    return () => clearTimeout(t);
  }, [wahl]);
  // Saldo bleibt 15 Sekunden, dann wieder die Kacheln
  useEffect(() => {
    if (!saldo) return undefined;
    const t = setTimeout(() => setSaldo(null), 15000);
    return () => clearTimeout(t);
  }, [saldo]);
  async function saldoZeigen() {
    const p = wahl;
    setLaeuft(true);
    const r = await saldoHolen(p).then((x) => x, (f) => ({ fehler: alt.fehlertext(f) }));
    setLaeuft(false);
    if (r.fehler) { alt.meldung("Saldo nicht geladen: " + r.fehler, "fehler"); return; }
    setSaldo({ ...r, name: p.full_name });
    setWahl(null);
  }
  useEffect(() => {
    if (!fertig) return undefined;
    const t = setTimeout(() => { setFertig(null); setSuche(""); }, 5000);
    return () => clearTimeout(t);
  }, [fertig]);

  async function stempeln(art) {
    setLaeuft(true);
    const r = await alt.zeitlimit(alt.db.rpc("zeit_panel_stempeln", { p_person: wahl.id, p_art: art }), 15000, "Stempeln")
      .then((x) => x, (f) => ({ error: f }));
    setLaeuft(false);
    if (r.error || !r.data) { alt.meldung("Nicht gestempelt: " + alt.fehlertext(r.error), "fehler"); return; }
    setFertig({ art, zeit: uhrzeit(r.data.zeit || new Date().toISOString()), name: wahl.full_name, id: r.data.id });
    setWahl(null);
    laden();
  }

  async function zurueck() {
    const r = await alt.db.rpc("zeit_panel_zurueck", { p_id: fertig.id });
    if (r.error || r.data === false) { alt.meldung("Geht nicht mehr zurück, bitte in HOFERTIME korrigieren.", "warn"); return; }
    alt.meldung("Zurückgenommen.", "gut");
    setFertig(null);
    laden();
  }

  const zeit = String(uhr.getHours()).padStart(2, "0") + ":" + String(uhr.getMinutes()).padStart(2, "0");
  let inhalt;
  if (fertig) {
    inhalt = (
      <div className={"ze-bestaetigt ze-bestaetigt--" + fertig.art} id="ze-bestaetigt">
        <div className="ze-bestaetigt__haken">✓</div>
        <div className="ze-bestaetigt__text">{fertig.art === "kommen" ? "Eingestempelt" : "Ausgestempelt"} {fertig.zeit}</div>
        <div className="ze-bestaetigt__name">{fertig.art === "kommen" ? "Guten Tag" : "Schönen Feierabend"}, {String(fertig.name || "").split(" ")[0]}</div>
        <div className="ze-panel__nach">
          <button className="knopf" id="ze-panel-zurueck" onClick={zurueck}>Rückgängig, falsche Person</button>
          <button className="knopf knopf--haupt" onClick={() => setFertig(null)}>Fertig</button>
        </div>
      </div>);
  } else if (saldo) {
    inhalt = (
      <section className="ze-panel ze-panel--wahl" id="ze-panel-saldo">
        <div className="ze-panel__person">{saldo.name}</div>
        <div className="ze-panel__werte">
          {saldo.saldo && <div className="ze-panel__wert">
            <span>Gleitzeit</span>
            <b className={saldo.saldo.min < 0 ? "ze-minus" : "ze-plus"} id="ze-panel-gleitzeit">{dauerText(saldo.saldo.min)}</b>
          </div>}
          {saldo.ferien && <div className="ze-panel__wert">
            <span>Ferien übrig {new Date().getFullYear()}</span>
            <b id="ze-panel-ferien">{alt.zahlText(saldo.ferien.rest)} Tage</b>
            <span className="klein">bezogen {saldo.ferien.bezogen} · geplant {saldo.ferien.geplant}</span>
          </div>}
          <div className="ze-panel__wert"><span>Heute</span><b>{dauerText(saldo.heute)}</b></div>
          <div className="ze-panel__wert"><span>Diese Woche</span><b>{dauerText(saldo.woche)}</b></div>
        </div>
        <div className="ze-panel__nach">
          <button className="knopf knopf--haupt" id="ze-panel-saldo-zu" onClick={() => setSaldo(null)}>Fertig</button>
        </div>
      </section>);
  } else if (wahl) {
    const da = wahl.da;
    inhalt = (
      <section className="ze-panel ze-panel--wahl">
        <div className="ze-panel__person">{wahl.full_name}</div>
        <div className="ze-panel__stand">{da ? "Da seit " + uhrzeit(wahl.seit) : "Nicht eingestempelt"}</div>
        {perGesicht && <div className="ze-panel__erkannt" id="ze-panel-erkannt">Am Gesicht erkannt. Bist du es nicht, tippe unten auf „Nicht ich“.</div>}
        <button className={"ze-knopf ze-panel__gross " + (da ? "ze-knopf--gehen" : "ze-knopf--kommen")} id="ze-panel-knopf"
          disabled={laeuft} onClick={() => stempeln(da ? "gehen" : "kommen")}>{da ? "Gehen" : "Kommen"}</button>
        <div className="ze-panel__nach">
          <button className="knopf" onClick={() => stempeln(da ? "kommen" : "gehen")} disabled={laeuft}>
            Doch {da ? "Kommen" : "Gehen"}</button>
          <button className="knopf" id="ze-panel-saldo-knopf" onClick={saldoZeigen} disabled={laeuft}>Nur Saldo ansehen</button>
          <button className="knopf" id="ze-panel-weg" onClick={() => setWahl(null)}>Nicht ich, zurück</button>
        </div>
      </section>);
  } else {
  const s = suche.trim().toLowerCase();
  const liste = (leute || []).filter((p) => !s || String(p.full_name || "").toLowerCase().includes(s));
  inhalt = (
    <section className="ze-panel">
      <div className="ze-panel__kopf">
        <b className="ze-panel__uhr">{zeit}</b>
        <span>{erk.bereit ? "Schau in die Kamera oder tippe auf deinen Namen" : "Tippe auf deinen Namen"}</span>
        <input type="search" className="mat-sucheingabe" placeholder="Name suchen" value={suche}
          data-ohne-leiste onChange={(e) => setSuche(e.target.value)} />
        {(erk.anzahl > 0 || !kamera) && <button className="knopf knopf--klein" id="ze-panel-kamera" onClick={() => { kameraMerken(!kamera); setKamera(!kamera); }}>
          {kamera ? "📷 Kamera aus" : "📷 Kamera an"}</button>}
      </div>
      {erk.stand && <p className="klein" id="ze-panel-kamera-stand">{erk.stand}</p>}
      {fehler && <div className="karte karte--fehler"><p>{fehler}</p></div>}
      {!leute && !fehler && <div className="laedt">Wird geladen …</div>}
      <div className="ze-panel__kacheln">
        {liste.map((p) => (
          <button key={p.id} className={"ze-panel__kachel" + (p.da ? " ze-panel__kachel--da" : "")} data-ze-panel={p.id}
            onClick={() => { setPerGesicht(false); setWahl(p); }}>
            {p.bild_url ? <img src={p.bild_url} alt="" /> : <span className="ze-panel__buchstabe">{String(p.full_name || "?").charAt(0)}</span>}
            <span className="ze-panel__name">{p.full_name}</span>
            <span className="klein">{p.da ? "da seit " + uhrzeit(p.seit) : "weg"}</span>
          </button>))}
      </div>
    </section>);
  }
  return (
    <>
      {inhalt}
      {erk.bereit && <video ref={erk.video} className="ze-panel__kamera" id="ze-panel-video" playsInline muted autoPlay />}
    </>);
}
