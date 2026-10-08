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
import { bildHell } from "../teile/profilbilder.js";

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
// das andere einblenden.
const REIN = 260;
// So lange schwebt die gewählte Kachel in die Mitte oder ins Feld
const FLUG = 520;
// So lange bleibt sie mit Ladezeichen in der Mitte, auch wenn es schneller ginge
const HALT = 650;
const SCHWUNG = "cubic-bezier(.2,.8,.2,1)";

const wenigBewegung = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Wo die schwebende Kachel in der Mitte stehen bleibt: etwas über der
// Bildschirmmitte, damit Name und Ladezeichen darunter Platz haben.
function mitteRechteck() {
  const g = Math.round(Math.min(132, Math.max(96, window.innerWidth * 0.28)));
  return { left: (window.innerWidth - g) / 2, top: window.innerHeight / 2 - g / 2 - 36, width: g, height: g };
}

// Die schwebende Kachel von einem Rechteck zum anderen bringen. Das
// Element steht schon am Ziel; die Bewegung läuft nur über transform
// (FLIP), damit nichts neu gesetzt werden muss und es flüssig bleibt.
function fliegen(el, von, nach) {
  Object.assign(el.style, { left: nach.left + "px", top: nach.top + "px",
    width: nach.width + "px", height: nach.height + "px" });
  if (!von || wenigBewegung() || typeof el.animate !== "function") return Promise.resolve();
  const s = von.width / nach.width;
  const a = el.animate([
    { transform: `translate(${von.left - nach.left}px, ${von.top - nach.top}px) scale(${s})` },
    { transform: "none" }], { duration: FLUG, easing: SCHWUNG });
  return a.finished.catch(() => {});
}

function Bildchen({ konto, className }) {
  const name = konto.full_name || konto.email;
  return konto.bild_url
    ? <img className={className} src={konto.bild_url} alt="" data-hell={bildHell(konto.bild_url) ? "" : undefined} />
    : <span className={className + " login__buchstabe"}>{name.charAt(0).toUpperCase()}</span>;
}

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

// Gerätekonten wie Planwand, Pad Mode oder Päckli Pad stehen nicht
// zwischen den Leuten, sondern unten unter „Andere Nutzer“ (Wunsch
// Patrick, 7. Oktober 2026). Das Häkchen setzt der Admin unter
// Einstellungen → Nutzer. Solange sql/andere-nutzer.sql fehlt, kennen
// die Kacheln das Häkchen nicht; dann gelten die Planwand-Konten als
// solche, denn genau das sind bisher die Gerätekonten.
export function istAndererNutzer(u) {
  return u.andere_nutzer === undefined || u.andere_nutzer === null ? u.role === "planwand" : !!u.andere_nutzer;
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
  // Die schwebende Kachel: { konto, laedt } oder null
  const [flieger, setFlieger] = useState(null);
  // Karte ausgeblendet, solange die Kachel allein in der Mitte schwebt
  const [karteWeg, setKarteWeg] = useState(false);
  // Das grosse Bild im Anmeldefeld wartet unsichtbar, bis die Kachel landet
  const [landet, setLandet] = useState(false);
  const [auswahlFehler, setAuswahlFehler] = useState("");
  // Kachel, die gerade an ihren Platz zurückschwebt (dort solange leer)
  const [heim, setHeim] = useState(null);
  // Welche Kacheln die Wand zeigt: die Leute oder die anderen Nutzer
  const [andere, setAndere] = useState(false);
  const fliegerRef = useRef(null);
  const beschaeftigt = useRef(false);
  const uhr = useRef([]);
  const spaeter = (fn, ms) => uhr.current.push(setTimeout(fn, ms));

  useEffect(() => {
    let weg = false;
    kachelnLaden().then((d) => { if (!weg) setKacheln(d); }, () => { if (!weg) setKacheln(null); });
    return () => { weg = true; uhr.current.forEach(clearTimeout); };
  }, []);

  // Kachel aus der Mitte ins Anmeldefeld bringen (oder direkt von der
  // Wand, wenn sie nicht in der Mitte gewartet hat)
  const insFeld = async (konto, mitPin, hinweis, von) => {
    flushSync(() => {
      setFlieger({ konto, laedt: false });
      setWahl({ konto, mitPin, hinweis });
      setKarteWeg(false);
      setLandet(true);
      setAnmeldungKlasse("login__wechsel--rein");
    });
    const el = fliegerRef.current;
    const ziel = document.querySelector("#lg-anmeldung .login__gross");
    if (el && ziel) await fliegen(el, von || el.getBoundingClientRect(), ziel.getBoundingClientRect());
    setLandet(false);
    setFlieger(null);
    beschaeftigt.current = false;
  };

  // Tipp auf eine Kachel: Sie schwebt los. Kennt das Gerät die Person
  // schon, oder hat das Konto kein Passwort, wartet sie in der Mitte mit
  // Ladezeichen, bis die Anmeldung steht. Braucht es PIN oder Passwort,
  // landet sie oben im Anmeldefeld.
  const kontoWaehlen = async (konto, ev) => {
    if (beschaeftigt.current) return;
    beschaeftigt.current = true;
    setAuswahlFehler("");
    const quelle = ev.currentTarget.querySelector(".login__kachel-bild");
    const von = quelle ? quelle.getBoundingClientRect() : null;
    const gemerkt = alt.sitzungGemerkt(konto.email);

    if (!gemerkt && !konto.ohne_passwort) return insFeld(konto, false, "", von);

    flushSync(() => { setFlieger({ konto, laedt: true }); setKarteWeg(true); });
    const flug = fliegerRef.current ? fliegen(fliegerRef.current, von, mitteRechteck()) : Promise.resolve();
    // Der Server antwortet oft schneller, als die Kachel fliegt. Damit man
    // sie trotzdem in der Mitte ankommen und kurz schweben sieht, geht es
    // erst nach dem Flug und einem kurzen Halt hinein (Wunsch Patrick,
    // 6. Oktober 2026: „auch bei Leuten ohne PIN in die Mitte“).
    const angekommen = flug.then(() => new Promise((ok) => setTimeout(ok, wenigBewegung() ? 0 : HALT)));

    const hinein = async () => {
      alt.geraetKontoMerken(konto.email);
      await Promise.all([alt.profilLaden(), angekommen]);
      alt.zeichneGeruest();
    };
    try {
      if (gemerkt && await alt.gemerktAnmelden(konto.email)) return await hinein();
      let mitPin = !!konto.ohne_passwort;
      if (mitPin) {
        const e = await alt.offenAnmelden(konto.email);
        if (e.status === "ok") return await hinein();
        // "pin", oder der Server ist nicht erreichbar: PIN-Feld wie bisher
        if (e.status === "passwort") mitPin = false;
      }
      await flug;
      return insFeld(konto, mitPin, "", null);
    } catch (f) {
      // Etwas ging schief: Kachelwand wieder zeigen, Grund darunter
      await flug;
      setFlieger(null);
      setKarteWeg(false);
      setAuswahlFehler(alt.fehlertext(f));
      beschaeftigt.current = false;
    }
  };

  // „anderes Konto“: Die Kachel schwebt aus dem Anmeldefeld zurück an
  // ihren Platz in der Kachelwand (Wunsch Patrick, 6. Oktober 2026).
  const zurueck = async () => {
    if (beschaeftigt.current || !wahl) return;
    beschaeftigt.current = true;
    const konto = wahl.konto;
    const gross = document.querySelector("#lg-anmeldung .login__gross");
    const von = gross ? gross.getBoundingClientRect() : null;
    flushSync(() => {
      setFlieger({ konto, laedt: false });
      setHeim(konto.email);
      setWahl(null);
      setAnmeldungKlasse("");
      setAuswahlKlasse("login__wechsel--rein");
    });
    const el = fliegerRef.current;
    const platz = [...document.querySelectorAll("#lg-auswahl .login__kachel")]
      .find((k) => k.dataset.email === konto.email);
    const ziel = platz && platz.querySelector(".login__kachel-bild");
    if (el && ziel && von) await fliegen(el, von, ziel.getBoundingClientRect());
    setHeim(null);
    setFlieger(null);
    spaeter(() => setAuswahlKlasse(""), REIN);
    beschaeftigt.current = false;
  };

  // Zwischen Leuten und anderen Nutzern wechseln: kurz ausblenden und
  // die andere Gruppe einblenden, wie beim Wechsel ins Anmeldefeld
  const umschalten = () => {
    if (beschaeftigt.current) return;
    setAuswahlFehler("");
    setAndere((a) => !a);
    setAuswahlKlasse("login__wechsel--rein");
    spaeter(() => setAuswahlKlasse(""), REIN);
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
  let leute = [], geraete = [], gezeigt = [];
  if (kacheln) {
    leute = kacheln.filter((u) => !istAndererNutzer(u));
    geraete = kacheln.filter(istAndererNutzer);
    // Ohne Leute gleich die anderen, ohne andere gibt es nichts umzuschalten
    gezeigt = (andere && geraete.length) || !leute.length ? geraete : leute;
    wand = reihenBilden(gezeigt);
    const breit = wand.breiteste * 112 + (wand.breiteste - 1) * 14 + 56;
    karteStil = { maxWidth: "min(96vw, " + Math.max(380, breit) + "px)" };
  }

  let auswahl;
  if (kacheln === undefined) auswahl = <div className="login__laedt">Wird geladen …</div>;
  else if (kacheln === null) auswahl = <AnmeldeFormular />;
  else {
    auswahl = (<>
      <div className="login__kacheln login__kacheln--reihen" style={{ "--spalten": Math.max(1, wand.breiteste) }}>
        {wand.reihen.map((reihe, r) => (
          <div className="login__reihe" key={r}>
            {reihe.map((u) => (
              <button type="button" key={u.email || u.full_name} data-email={u.email}
                className={"login__kachel" + (heim && heim === u.email ? " login__kachel--heim" : "")}
                onClick={(ev) => kontoWaehlen(u, ev)}>
                <Bildchen konto={u} className={"login__kachel-bild" + (u.bild_url ? "" : " login__kachel-buchstabe")} />
                <span className="login__kachel-name">{alt.personName(u)}</span>
                {u.ohne_passwort && <span className="login__offen" title="Ohne Passwort oder mit PIN">•</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      {auswahlFehler && <div className="login__fehler" role="alert">{auswahlFehler}</div>}
      {leute.length > 0 && geraete.length > 0 && (
        <button type="button" className="linkknopf login__anderekonto" id="lg-andere"
          onClick={umschalten}>{gezeigt === geraete ? "Personen" : "Andere Nutzer"}</button>
      )}
    </>);
  }

  return (
    <div className="login">
      <div className={"login__karte" + (karteWeg ? " login__karte--weg" : "")} style={karteStil}>
        <div className="login__marke" id="lg-marke">
          <div className="login__band">
            <img className="login__logo-svg" src="./logo-weiss.svg" alt="Hofer + Co. Präzisionsdrehteile" />
          </div>
          <div className="login__untertitel">{alt.APP_UNTERTITEL}</div>
        </div>
        <div id="lg-auswahl" className={auswahlKlasse} hidden={!!wahl}>{auswahl}</div>
        {wahl && (
          <div id="lg-anmeldung" className={anmeldungKlasse}>
            <KontoAnmeldung key={wahl.konto.email + (wahl.mitPin ? "-pin" : "")} konto={wahl.konto}
              mitPin={wahl.mitPin} hinweis={wahl.hinweis} wartet={landet}
              // Klappt die PIN-Anmeldung grundsätzlich nicht (nicht
              // eingerichtet), geht es mit dem Passwort weiter
              aufPasswort={(text) => setWahl({ konto: wahl.konto, mitPin: false, hinweis: text })} />
            <button type="button" className="linkknopf login__anderekonto" id="lg-anderes"
              onClick={zurueck}>anderes Konto</button>
          </div>
        )}
      </div>
      {flieger && (
        <div className={"login__flieger" + (flieger.laedt ? " login__flieger--laedt" : "")} ref={fliegerRef}>
          <Bildchen konto={flieger.konto} className="login__flieger-bild" />
          {flieger.laedt && (
            <div className="login__flieger-name" role="status">
              {alt.personName(flieger.konto)}<span className="login__sr"> wird angemeldet</span>
              <span className="login__ring" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Meldet an und baut danach das Gerüst auf. vorgabeMail ist die Adresse
// der gewählten Kachel; beim Formular kommt sie aus dem Namensfeld.
// aufPasswort gesetzt heisst: Das Feld nimmt eine PIN.
// Rückmeldungen gibt es keine als Meldung unten rechts: Nur wenn etwas
// nicht stimmt, erscheint der Grund direkt unter dem Feld.
function useAnmelden(vorgabeMail, aufPasswort, hinweis) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(hinweis ? { text: hinweis, n: 0 } : null);
  const nameRef = useRef(null);
  const pwRef = useRef(null);
  const merkRef = useRef(null);

  const zeigen = (text) => {
    setFehler((alt0) => ({ text, n: alt0 ? alt0.n + 1 : 0 }));
    const el = pwRef.current;
    if (el && !wenigBewegung() && typeof el.animate === "function") {
      el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-7px)" },
        { transform: "translateX(6px)" }, { transform: "translateX(-4px)" },
        { transform: "translateX(2px)" }, { transform: "translateX(0)" }], { duration: 360, easing: "ease-out" });
    }
  };

  const nochmal = (text) => {
    zeigen(text);
    setLaeuft(false);
    if (pwRef.current) { pwRef.current.value = ""; pwRef.current.focus(); }
  };

  const absenden = async (e) => {
    e.preventDefault();
    if (laeuft) return;
    const eingabe = (vorgabeMail || (nameRef.current ? nameRef.current.value : "")).trim().toLowerCase();
    const pw = pwRef.current ? pwRef.current.value : "";
    if (!eingabe || !pw) {
      zeigen(!eingabe ? "Benutzername und Passwort eingeben." : aufPasswort ? "PIN eingeben." : "Passwort eingeben.");
      if (pwRef.current && eingabe) pwRef.current.focus();
      return;
    }
    // Ohne @ wird daraus automatisch eine gültige Adresse
    const email = eingabe.includes("@") ? eingabe : eingabe + alt.LOGIN_ENDUNG;

    setFehler(null);
    setLaeuft(true);
    try {
      if (aufPasswort) {
        const e2 = await alt.pinAnmelden(email, pw);
        if (e2.status === "fehler" || e2.status === "keine_pin") {
          aufPasswort(alt.pinMeldung(e2));
          return;
        }
        if (e2.status !== "ok") return nochmal(alt.pinMeldung(e2));
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
      nochmal(alt.fehlertext(f));
    }
  };

  // Der Grund steht direkt unter dem Feld und gleitet herein; der
  // Schlüssel n spielt das Hereingleiten bei jedem neuen Fehler ab.
  const fehlerZeile = fehler
    ? <div className="login__fehler" role="alert" key={fehler.n}>{fehler.text}</div>
    : null;

  const knopf = (<>
    <label className="schalter login__merken"><input type="checkbox" id="lmerk" defaultChecked ref={merkRef} />
      <span>Auf diesem Gerät merken</span></label>
    <button type="submit" className={"knopf knopf--haupt knopf--breit" + (laeuft ? " login__knopf--laeuft" : "")}
      id="lk" disabled={laeuft} aria-busy={laeuft}>
      {laeuft ? <><span className="login__punkt" aria-hidden="true" />Anmelden …</> : "Anmelden"}</button>
  </>);
  return { absenden, nameRef, pwRef, knopf, laeuft, fehlerZeile };
}

function KontoAnmeldung({ konto, mitPin, aufPasswort, hinweis, wartet }) {
  const { absenden, pwRef, knopf, fehlerZeile } = useAnmelden(konto.email, mitPin ? aufPasswort : null, hinweis);
  // autoFocus wirkt beim Wechsel nicht zuverlässig, darum von Hand
  useLayoutEffect(() => { if (pwRef.current) pwRef.current.focus({ preventScroll: true }); }, [pwRef]);
  const name = konto.full_name || konto.email;
  return (
    <>
      <div className={"login__gross-rahmen" + (wartet ? " login__gross-rahmen--wartet" : "")}>
        <Bildchen konto={konto} className="login__gross" />
      </div>
      <div className="login__name">{name}</div>
      <form id="lf" noValidate onSubmit={absenden}>
        {mitPin
          // inputMode none: Am Tablet soll nicht die Handytastatur den
          // Ziffernblock verdecken. Eine echte Tastatur geht trotzdem.
          ? <><input type="password" id="lp" className="login__pw login__pw--pin" placeholder="PIN" ref={pwRef}
              inputMode="none" pattern="[0-9]*" maxLength={8} autoComplete="off" required />
            {fehlerZeile}
            <PinTasten feld={pwRef} /></>
          : <><input type="password" id="lp" className="login__pw" placeholder="Passwort" ref={pwRef}
              autoComplete="current-password" required />{fehlerZeile}</>}
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
  const { absenden, nameRef, pwRef, knopf, fehlerZeile } = useAnmelden(null, null, "");
  return (
    <form id="lf" noValidate onSubmit={absenden}>
      <label className="feld"><span>Benutzername</span>
        <input type="text" id="le" autoComplete="username" autoCapitalize="none"
          spellCheck="false" required ref={nameRef} /></label>
      <label className="feld"><span>Passwort oder PIN</span>
        <input type="password" id="lp" autoComplete="current-password" required ref={pwRef} /></label>
      {fehlerZeile}
      {knopf}
    </form>
  );
}
