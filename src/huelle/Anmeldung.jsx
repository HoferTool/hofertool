// =================================================================
//  ANMELDUNG
//  Kachelwand mit allen Konten (alphabetisch, immer im gewohnten Blau).
//  Antippen öffnet das Feld für Passwort oder PIN. Konten mit PIN
//  (Punkt auf der Kachel) melden sich mit ihrer PIN an; der Server
//  prüft sie und sperrt nach fünf falschen Versuchen fünf Minuten.
//
//  Ohne lesbare Kacheln (kein Netz, fremdes Gerät ohne bekannte Konten)
//  erscheint ein Formular mit Benutzername und Passwort.
//
//  Gezeichnet wird in eine eigene Hülle im Wurzelelement. Das Gerüst
//  nach dem Anmelden leert die Wurzel; die Hülle wird danach abgebaut.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { alt } from "../bruecke.jsx";

let wurzel = null;

export function anmeldungZeigen(ziel) {
  anmeldungAbbauen();
  ziel.innerHTML = "";
  const huelle = document.createElement("div");
  huelle.className = "react-seite";
  ziel.appendChild(huelle);
  wurzel = createRoot(huelle);
  flushSync(() => wurzel.render(<Anmeldung />));
}

// Später abbauen: Der Aufruf kommt meist aus dem Anmelden-Knopf selbst
export function anmeldungAbbauen() {
  if (!wurzel) return;
  const w = wurzel;
  wurzel = null;
  queueMicrotask(() => w.unmount());
}

// Wechsel zwischen Kachelwand und Anmeldefeld: kurz ausblenden, dann
// das andere einblenden. Ein fliegender Klon machte jedes Mal einen
// kleinen Sprung; sauberes Aus- und Einblenden wirkt ruhiger.
const RAUS = 160, REIN = 260;

// Kacheln holen. Externes Gerät: nur Konten, die sich hier schon
// angemeldet haben. Eigenes Gerät: Externe und das Dienstkonto
// erscheinen nicht auf eurer Kachelwand.
async function kachelnLaden() {
  const antwort = await alt.db.from("login_kacheln").select("*");
  if (antwort.error || !antwort.data) throw antwort.error || new Error("leer");
  const bekannt = alt.geraetKonten();
  const data = alt.istExternGeraet()
    ? antwort.data.filter((u) => bekannt.indexOf(String(u.email || "").toLowerCase()) !== -1)
    : antwort.data.filter((u) => u.role !== "extern" && u.role !== "dienst");
  if (!data.length) throw new Error("leer");
  // Immer in derselben Reihenfolge: nach Namen, wie im Telefonbuch
  data.sort((x, y) => String(x.full_name || x.email || "").localeCompare(
    String(y.full_name || y.email || ""), "de", { sensitivity: "base" }));
  return data;
}

// Reihen ausgleichen: lieber 3 + 3 als 5 + 1. Höchstens drei Zeilen,
// waagrecht gefüllt: aus 18 Personen werden 6 · 6 · 6. Bei wenigen
// Personen mindestens drei nebeneinander, sonst stünde bei drei
// Personen eine senkrechte Spalte da.
function reihenBilden(data) {
  const anzahl = data.length;
  const reihen = Math.min(3, Math.max(1, Math.ceil(anzahl / 3)));
  const grund = Math.floor(anzahl / reihen);
  const mehr = anzahl % reihen;          // so viele Zeilen kriegen eine mehr
  const raus = [];
  let zeiger = 0;
  for (let r = 0; r < reihen; r++) {
    const inReihe = grund + (r < mehr ? 1 : 0);
    raus.push(data.slice(zeiger, zeiger + inReihe));
    zeiger += inReihe;
  }
  // Die vollste Zeile bestimmt die Kachelbreite — so sind am Handy
  // alle Kacheln gleich gross, auch in der kürzeren letzten Zeile
  return { reihen: raus, breiteste: grund + (mehr ? 1 : 0) };
}

function Anmeldung() {
  // undefined: lädt · null: Formular ohne Kacheln · Liste: Kachelwand
  const [kacheln, setKacheln] = useState(undefined);
  // Das gewählte Konto, und ob es sich mit PIN anmeldet
  const [wahl, setWahl] = useState(null);
  const [auswahlKlasse, setAuswahlKlasse] = useState("");
  const [anmeldungKlasse, setAnmeldungKlasse] = useState("");
  const uhr = useRef([]);
  const spaeter = (fn, ms) => uhr.current.push(setTimeout(fn, ms));

  useEffect(() => {
    let weg = false;
    kachelnLaden().then((d) => { if (!weg) setKacheln(d); }, () => { if (!weg) setKacheln(null); });
    return () => { weg = true; uhr.current.forEach(clearTimeout); };
  }, []);

  // Tipp auf eine Kachel: Kennt das Gerät die Person schon, geht es
  // direkt hinein. Konten ohne Passwort fragen den Server: Ist das Konto
  // noch offen (keine PIN), geht es ebenfalls direkt hinein, wie vor
  // 111.12.0. Sonst kommt das Feld für PIN oder Passwort.
  const kontoWaehlen = async (konto) => {
    const hinein = async () => {
      alt.geraetKontoMerken(konto.email);
      await alt.profilLaden();
      alt.zeichneGeruest();
    };
    if (alt.sitzungGemerkt(konto.email)) {
      alt.meldung("Anmelden …");
      if (await alt.gemerktAnmelden(konto.email)) return hinein();
    }
    let mitPin = !!konto.ohne_passwort;
    if (mitPin) {
      alt.meldung("Anmelden …");
      const e = await alt.offenAnmelden(konto.email);
      if (e.status === "ok") return hinein();
      // "pin", oder der Server ist nicht erreichbar: PIN-Feld wie bisher
      if (e.status === "passwort") mitPin = false;
    }
    setAuswahlKlasse("login__wechsel--raus");
    spaeter(() => {
      setAuswahlKlasse("");
      setWahl({ konto, mitPin });
      setAnmeldungKlasse("login__wechsel--rein");
    }, RAUS);
  };

  const zurueck = () => {
    setAnmeldungKlasse("login__wechsel--raus");
    spaeter(() => {
      setWahl(null);
      setAnmeldungKlasse("");
      setAuswahlKlasse("login__wechsel--rein");
      spaeter(() => setAuswahlKlasse(""), REIN);
    }, RAUS);
  };

  // Mit Escape zurück zur Auswahl
  useEffect(() => {
    if (!wahl) return undefined;
    const taste = (e) => { if (e.key === "Escape") zurueck(); };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wahl]);

  // Die Karte ist von Haus aus schmal. Bei sechs Kacheln in einer Zeile
  // liefe die Reihe über den Rand; also wächst sie mit, höchstens aber
  // auf die Fensterbreite.
  let karteStil;
  let wand = null;
  if (kacheln) {
    wand = reihenBilden(kacheln);
    const breit = wand.breiteste * 112 + (wand.breiteste - 1) * 14 + 56;
    karteStil = { maxWidth: "min(96vw, " + Math.max(380, breit) + "px)" };
  }

  let auswahl;
  if (kacheln === undefined) auswahl = <div className="login__laedt">Wird geladen …</div>;
  else if (kacheln === null) auswahl = <AnmeldeFormular />;
  else {
    auswahl = (
      <div className="login__kacheln login__kacheln--reihen" style={{ "--spalten": Math.max(1, wand.breiteste) }}>
        {wand.reihen.map((reihe, r) => (
          <div className="login__reihe" key={r}>
            {reihe.map((u) => (
              <button type="button" className="login__kachel" key={u.email || u.full_name}
                onClick={() => kontoWaehlen(u)}>
                {u.bild_url
                  ? <img src={u.bild_url} alt="" />
                  : <span className="login__kachel-buchstabe">{(u.full_name || u.email).charAt(0).toUpperCase()}</span>}
                <span className="login__kachel-name">{alt.personName(u)}</span>
                {u.ohne_passwort && <span className="login__offen" title="Ohne Passwort oder mit PIN">•</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="login"><div className="login__karte" style={karteStil}>
      <div className="login__marke" id="lg-marke">
        <img className="login__bild" src="./login.png" alt="Hofer + Co. Präzisionsdrehteile" />
        <div className="login__untertitel">{alt.APP_UNTERTITEL}</div>
      </div>
      <div id="lg-auswahl" className={auswahlKlasse} hidden={!!wahl}>{auswahl}</div>
      {wahl && (
        <div id="lg-anmeldung" className={anmeldungKlasse}>
          <KontoAnmeldung key={wahl.konto.email + (wahl.mitPin ? "-pin" : "")} konto={wahl.konto}
            mitPin={wahl.mitPin}
            // Klappt die PIN-Anmeldung grundsätzlich nicht (nicht
            // eingerichtet), geht es mit dem Passwort weiter
            aufPasswort={() => setWahl({ konto: wahl.konto, mitPin: false })} />
          <button type="button" className="linkknopf login__anderekonto" id="lg-anderes"
            onClick={zurueck}>anderes Konto</button>
        </div>
      )}
    </div></div>
  );
}

// Meldet an und baut danach das Gerüst auf. vorgabeMail ist die Adresse
// der gewählten Kachel; beim Formular kommt sie aus dem Namensfeld.
// aufPasswort gesetzt heisst: Das Feld nimmt eine PIN.
function useAnmelden(vorgabeMail, aufPasswort) {
  const [laeuft, setLaeuft] = useState(false);
  const nameRef = useRef(null);
  const pwRef = useRef(null);
  const merkRef = useRef(null);

  const nochmal = (text, art) => {
    alt.meldung(text, art || "fehler");
    setLaeuft(false);
    if (pwRef.current) { pwRef.current.value = ""; pwRef.current.focus(); }
  };

  const absenden = async (e) => {
    e.preventDefault();
    const eingabe = (vorgabeMail || (nameRef.current ? nameRef.current.value : "")).trim().toLowerCase();
    const pw = pwRef.current ? pwRef.current.value : "";
    if (!eingabe || !pw) { alt.meldung("Benutzername und Passwort eingeben.", "warn"); return; }
    // Ohne @ wird daraus automatisch eine gültige Adresse
    const email = eingabe.includes("@") ? eingabe : eingabe + alt.LOGIN_ENDUNG;

    setLaeuft(true);
    try {
      if (aufPasswort) {
        const e2 = await alt.pinAnmelden(email, pw);
        if (e2.status === "fehler" || e2.status === "keine_pin") {
          alt.meldung(alt.pinMeldung(e2), "warn");
          aufPasswort();
          return;
        }
        if (e2.status !== "ok") return nochmal(alt.pinMeldung(e2), e2.status === "gesperrt" ? "warn" : "fehler");
      } else {
        let { error } = await alt.zeitlimit(
          alt.db.auth.signInWithPassword({ email, password: pw }), 15000, "Anmeldung");
        // Nur Ziffern und kein passendes Passwort? Dann als PIN versuchen
        if (error && /^\d{4,8}$/.test(pw)) {
          const e2 = await alt.pinAnmelden(email, pw);
          if (e2.status === "ok") error = null;
          else if (e2.status === "falsch" || e2.status === "gesperrt") return nochmal(alt.pinMeldung(e2));
        }
        if (error) throw error;
      }
      alt.geraetKontoMerken(email);
      // Häkchen „Auf diesem Gerät merken“: Schlüssel der Sitzung aufheben
      const s = await alt.sitzung();
      alt.sitzungMerken(email, merkRef.current && merkRef.current.checked && s ? s.refresh_token : null);
      await alt.profilLaden();
      alt.zeichneGeruest();
    } catch (f) {
      alt.meldung(alt.fehlertext(f), "fehler");
      setLaeuft(false);
    }
  };

  const knopf = (<>
    <label className="schalter login__merken"><input type="checkbox" id="lmerk" defaultChecked ref={merkRef} />
      <span>Auf diesem Gerät merken</span></label>
    <button type="submit" className="knopf knopf--haupt knopf--breit" id="lk" disabled={laeuft}>
      {laeuft ? "Anmelden …" : "Anmelden"}</button>
  </>);
  return { absenden, nameRef, pwRef, knopf };
}

function KontoAnmeldung({ konto, mitPin, aufPasswort }) {
  const { absenden, pwRef, knopf } = useAnmelden(konto.email, mitPin ? aufPasswort : null);
  // autoFocus wirkt beim Wechsel nicht zuverlässig, darum von Hand
  useLayoutEffect(() => { if (pwRef.current) pwRef.current.focus(); }, [pwRef]);
  const name = konto.full_name || konto.email;
  return (
    <>
      {konto.bild_url
        ? <img className="login__gross" src={konto.bild_url} alt="" />
        : <span className="login__gross login__gross--buchstabe">{name.charAt(0).toUpperCase()}</span>}
      <div className="login__name">{name}</div>
      <form id="lf" noValidate onSubmit={absenden}>
        {mitPin
          // inputMode none: Am Tablet soll nicht die Handytastatur den
          // Ziffernblock verdecken. Eine echte Tastatur geht trotzdem.
          ? <><input type="password" id="lp" className="login__pw login__pw--pin" placeholder="PIN" ref={pwRef}
              inputMode="none" pattern="[0-9]*" maxLength={8} autoComplete="off" required />
            <PinTasten feld={pwRef} /></>
          : <input type="password" id="lp" className="login__pw" placeholder="Passwort" ref={pwRef}
              autoComplete="current-password" required />}
        {knopf}
      </form>
    </>
  );
}

// Ziffernblock unter dem PIN-Feld. Schreibt direkt ins Feld, damit
// Tasten und echte Tastatur zusammen funktionieren.
function PinTasten({ feld }) {
  const tippen = (t) => {
    const el = feld.current;
    if (!el) return;
    if (t === "C") el.value = "";
    else if (t === "⌫") el.value = el.value.slice(0, -1);
    else if (el.value.length < 8) el.value += t;
    el.focus();
  };
  return (
    <div className="zb-tasten login__ziffern">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((t) => (
        <button type="button" key={t} data-lz={t} onClick={() => tippen(t)}
          className={t === "C" || t === "⌫" ? "zb-taste--neben" : undefined}>{t}</button>
      ))}
    </div>
  );
}

function AnmeldeFormular() {
  const { absenden, nameRef, pwRef, knopf } = useAnmelden(null, null);
  return (
    <form id="lf" noValidate onSubmit={absenden}>
      <label className="feld"><span>Benutzername</span>
        <input type="text" id="le" autoComplete="username" autoCapitalize="none"
          spellCheck="false" required ref={nameRef} /></label>
      <label className="feld"><span>Passwort oder PIN</span>
        <input type="password" id="lp" autoComplete="current-password" required ref={pwRef} /></label>
      {knopf}
    </form>
  );
}
