// =================================================================
//  PLANWAND
//  Die Seite um die Tafel herum: Kopfleiste mit Zeitregler, Tage und
//  Höhe, die Eckknöpfe (Heute, Suchen, HOCO Nr.) und die Bühne, auf
//  der das alte Programm die Tafel zeichnet (zeichnePlanwand).
//
//  Die Tafel selbst (#pw-inhalt) hat keine React-Kinder: Sie wird beim
//  Schieben laufend neu gezeichnet und gehört ganz dem alten Programm.
//
//  Die Regler sind ungesteuert und hören auf native Ereignisse. Der
//  Zeitregler wird beim Ziehen sehr oft gemeldet und vom alten Programm
//  auch von aussen verstellt (Heute, Taste H); React soll dabei weder
//  mitzeichnen noch den Wert zurücksetzen.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { symboleFensterOeffnen } from "../einstellungen/Symbole.jsx";

// Strg + F öffnet die Suche, solange die Planwand offen ist. Einmal
// angemeldet für die ganze Sitzung, der Behälter kommt aus plan.
let suchTasteDa = false;
function suchTasteAnmelden() {
  if (suchTasteDa) return;
  suchTasteDa = true;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f"
        && document.getElementById("pw-inhalt")) {
      e.preventDefault();
      alt.sucheDialog(alt.plan.behaelter);
    }
  });
}

// Aufträge, Ferien und Stempel holen, dann die Tafel zeichnen
async function tafelLaden(b, inhalt) {
  const plan = alt.plan;
  try {
    const [stErst, listeErst] = await Promise.all([
      alt.serverStempel(["jobs", "vacations", "production_records"]), alt.ladePlanAuftraege()]);
    if (stErst) plan.stempel = stErst;
    plan.auftraege = listeErst;
    // Aufträge, die nur mit einer HOCO Nr. angelegt wurden, holen
    // sich hier Material, Grösse und Zeichnung aus den Stammdaten.
    try {
      const wieViele = await alt.stammdatenAufPlanwand();
      if (wieViele) {
        alt.meldung(wieViele + (wieViele === 1 ? " Auftrag" : " Aufträge")
          + " aus den Stammdaten ergänzt.");
      }
    } catch (g) { /* Beiwerk, die Wand steht auch ohne */ }
  } catch (f) {
    inhalt.innerHTML = '<div class="karte karte--fehler"><p>' + alt.esc(alt.fehlertext(f)) + '</p>'
      + '<p class="klein">Version ' + alt.esc(alt.APP_VERSION) + '</p></div>';
    return;
  }
  if (!inhalt.isConnected) return;

  try {
    plan.ferien = (await alt.ladeFerien()).map((f) => {
      f.genehmigt_von_name = f.profiles ? f.profiles.full_name : null;
      return f;
    });
  } catch (f) {
    plan.ferien = [];
    console.warn("Ferien:", f.message);
  }
  if (!inhalt.isConnected) return;

  try {
    alt.zeichnePlanwand(b);
    alt.planSyncStarten(b);
  } catch (f) {
    inhalt.innerHTML = '<div class="karte karte--fehler">'
      + '<h2>Die Planwand konnte nicht gezeichnet werden</h2>'
      + '<p>' + alt.esc(f && f.message ? f.message : String(f)) + '</p>'
      + '<p class="klein">Version ' + alt.esc(alt.APP_VERSION) + '</p></div>';
    console.error("Planwand zeichnen:", f);
  }
}

// Zeitregler: rückwärts so weit, wie Aufträge eingeplant sind,
// vorwärts zwei Jahre. So kommt man überall hin, ohne dass der
// Regler bei wenigen Aufträgen unnötig lang wird.
function zeitreglerEinrichten(zeitregler, marke, von, bis, b) {
  const plan = alt.plan;
  const heuteStart = alt.wochenStart(alt.isoDatum(new Date()));

  // Der Regler reicht bis zum ältesten eingeplanten Auftrag, aber
  // mindestens bis Anfang 2022 — so lässt sich auch dann zurück-
  // blättern, wenn aus jener Zeit nichts mehr eingeplant ist.
  let aeltester = heuteStart;
  (plan.auftraege || []).forEach((j) => {
    if (j.planned_from && j.planned_from < aeltester) aeltester = j.planned_from;
  });
  if (aeltester > "2022-01-03") aeltester = "2022-01-03";

  // Direkt gerechnet, nicht über arbeitstageZwischen — das hört
  // bei 400 Tagen auf und käme nie bis 2022 zurück.
  const tageRoh = Math.round(
    (new Date(heuteStart + "T00:00:00") - new Date(alt.wochenStart(aeltester) + "T00:00:00"))
    / 86400000);
  const zurueck = Math.max(60, Math.round((tageRoh / 7) * 5) + 10);
  const vorwaerts = 520;   // rund zwei Jahre in Arbeitstagen

  const nullpunkt = alt.arbeitstagePlus(heuteStart, -zurueck);
  const spanne = zurueck + vorwaerts;
  zeitregler.min = 0;
  zeitregler.max = spanne;

  // Position des aktuellen Starts auf der Skala
  const stelleVonStart = () => {
    for (let i = 0; i <= spanne; i++) {
      if (alt.arbeitstagePlus(nullpunkt, i) >= plan.start) return i;
    }
    return zurueck;
  };
  const beschriften = () => {
    const v = alt.arbeitstagePlus(nullpunkt, Number(zeitregler.value));
    von.textContent = alt.kurzDatum(v);
    bis.textContent = alt.kurzDatum(alt.arbeitstagePlus(v, Math.max(0, plan.tage - 1)));
  };
  zeitregler.value = stelleVonStart();
  marke.style.left = (zurueck / spanne * 100) + "%";
  beschriften();

  // Für den Knopf „Heute“: den Regler an den neuen Beginn setzen
  plan.reglerNachfuehren = () => {
    zeitregler.value = stelleVonStart();
    beschriften();
  };

  // Live mitzeichnen: die Aufträge sind schon geladen, es braucht
  // keinen neuen Zugriff auf die Datenbank. Beim Ziehen kommen mehr
  // Schritte, als der Bildschirm zeigen kann; gezeichnet wird höchstens
  // einmal je Bild, mit dem neusten Stand.
  let bildAngefordert = false;
  const schieben = () => {
    beschriften();
    plan.start = alt.arbeitstagePlus(nullpunkt, Number(zeitregler.value));
    if (bildAngefordert) return;
    bildAngefordert = true;
    requestAnimationFrame(() => {
      bildAngefordert = false;
      plan.nurZeitGeschoben = true;
      alt.neuZeichnen(b);
    });
  };
  zeitregler.addEventListener("input", schieben);
  return () => zeitregler.removeEventListener("input", schieben);
}

function Kopfleiste({ b, mobil }) {
  const plan = alt.plan;
  const tageRef = useRef(null);
  const zahlRef = useRef(null);
  const hoeheRef = useRef(null);
  const hoeheWertRef = useRef(null);

  useEffect(() => {
    const regler = tageRef.current, zahlfeld = zahlRef.current;
    const hoehe = hoeheRef.current, hoeheWert = hoeheWertRef.current;

    // Zeilenhöhe: beim Ziehen sofort sehen, gespeichert wird erst
    // beim Loslassen
    const hoeheZeigen = () => {
      const w = Number(hoehe.value) / 100;
      plan.vskala = w;
      plan.breiteFest = false;
      const tafel = document.querySelector(".pw-tafel");
      if (tafel) {
        tafel.style.setProperty("--pw-v", w.toFixed(3));
        // Unter 80 Prozent bleibt nur Platz für eine Textzeile
        tafel.classList.toggle("pw-tafel--flach", w < 0.8);
        // Unter 55 % bleibt nur die Auftragsnummer stehen — so wird die
        // Zeile wirklich schmal, statt an zwei Textzeilen hängenzubleiben.
        tafel.classList.toggle("pw-tafel--sehrflach", w < 0.55);
      }
      hoeheWert.textContent = hoehe.value + " %";
    };
    const hoeheFest = () => {
      hoeheZeigen();
      alt.einstellungSetzenWert("pwhoehe", Number(hoehe.value));
    };

    const zoomSetzen = (wert) => {
      const n = Math.max(5, Math.min(200, Math.round(Number(wert) || 15)));
      plan.tageWunsch = n;
      alt.einstellungSetzenWert("pwtage", n);
      alt.masseBerechnen(b);
      alt.neuZeichnen(b);
    };
    const reglerZiehen = () => { zahlfeld.value = regler.value; zoomSetzen(regler.value); };
    const zahlFest = () => zoomSetzen(zahlfeld.value);
    const zahlTaste = (e) => {
      if (e.key === "Enter") { e.preventDefault(); zoomSetzen(zahlfeld.value); }
    };

    hoehe.addEventListener("input", hoeheZeigen);
    hoehe.addEventListener("change", hoeheFest);
    regler.addEventListener("input", reglerZiehen);
    zahlfeld.addEventListener("change", zahlFest);
    zahlfeld.addEventListener("keydown", zahlTaste);
    return () => {
      hoehe.removeEventListener("input", hoeheZeigen);
      hoehe.removeEventListener("change", hoeheFest);
      regler.removeEventListener("input", reglerZiehen);
      zahlfeld.removeEventListener("change", zahlFest);
      zahlfeld.removeEventListener("keydown", zahlTaste);
    };
  }, [b, plan]);

  const tage = plan.tageWunsch || 15;
  const prozent = Math.round((plan.vskala || 1) * 100);
  return (
    <div className="pw-kopfleiste">
      <div className="pw-regler-reihe">
        <div className="pw-zoom">
          <span className="klein">Tage</span>
          <input type="range" id="pw-regler" min="5" max="200" step="1" defaultValue={tage} ref={tageRef} />
          <input type="number" id="pw-zoomwert" min="5" max="200" defaultValue={tage} ref={zahlRef} />
        </div>
        {/* Zeilenhöhe getrennt vom Zeitraum: wie viele Maschinen auf den
            Bildschirm passen, entscheidet dieser Regler. */}
        <div className="pw-zoom pw-zoom--hoehe">
          <span className="klein">Höhe</span>
          <input type="range" id="pw-hoehe" min="35" max="180" step="1" defaultValue={prozent} ref={hoeheRef} />
          <span className="klein" id="pw-hoehewert" ref={hoeheWertRef}>{prozent + " %"}</span>
        </div>
      </div>
      <div className="pw-eckknoepfe">
        {/* Ein ganz leerer Auftrag (Wunsch Patrick 8. Oktober 2026): die
            HOCO Nr. holt den Rest, ohne Datum kommt er ans Ende */}
        {alt.darfPlanen() && <button className="knopf knopf--klein pw-eck pw-eck--plus" id="pw-neu"
          title="Neuer Auftrag" aria-label="Neuer Auftrag"
          onClick={() => alt.planAuftragDialog(null, b, null, null, null, true)}>
          <svg viewBox="0 0 24 24" className="pw-ecksym" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>}
        {/* Symbole für die Balken anlegen, nur für Admins */}
        {alt.istAdmin() && !mobil && <button className="knopf knopf--klein pw-eck pw-eck--plus" id="pw-symbole"
          title="Symbole" aria-label="Symbole" onClick={symboleFensterOeffnen}>
          <svg viewBox="0 0 24 24" className="pw-ecksym" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" />
            <path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2" />
            <circle cx="9" cy="10" r=".9" fill="currentColor" /><circle cx="15" cy="10" r=".9" fill="currentColor" /></svg>
        </button>}
        {/* Zu heute springen, mit zwei Wochen Rückblick */}
        <button className="knopf knopf--klein pw-eck" id="pw-heute"
          title="Zu heute, mit zwei Wochen Rückblick — Taste H" onClick={() => alt.zuHeute(b)}>
          <svg viewBox="0 0 24 24" className="pw-ecksym" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" />
            <circle cx="12" cy="14.5" r="1.8" fill="currentColor" /></svg>
          <span>Heute</span><kbd className="pw-taste">H</kbd>
        </button>
        <button className="knopf knopf--klein pw-eck" id="pw-suche-los" title="Suchen"
          onClick={() => alt.sucheDialog(b)}>
          <svg viewBox="0 0 24 24" className="pw-ecksym" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" /></svg>
          <span>Suchen</span>
        </button>
        {/* Die HOCO Nummern liegen gleich daneben — von der Planwand aus
            schaut man am häufigsten dort nach. */}
        <button className="knopf knopf--klein pw-eck" id="pw-hoco" title="HOCO Nr."
          onClick={() => alt.hocoFenster(b)}>
          <svg viewBox="0 0 24 24" className="pw-ecksym" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinejoin="round">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          <span>HOCO Nr.</span>
        </button>
      </div>
      {!alt.darfPlanen() && <div className="nurlesen">{mobil
        ? "Bearbeitbar nur am Desktop, nicht auf dem Handy."
        : "Du kannst die Planung ansehen. Ändern dürfen Planer und Administratoren."}</div>}
    </div>
  );
}

// Der Zeitregler lebt auf der Bühne, ausserhalb der Tafel: die Tafel
// wird beim Schieben laufend neu gezeichnet, der Regler darf dabei
// nicht mit ersetzt werden, sonst bricht der Browser das Ziehen ab.
// zeitschichtLegen im alten Programm legt die Schicht über den
// Platzhalter unter der Datumszeile.
function Zeitregler({ b }) {
  const regler = useRef(null), marke = useRef(null), von = useRef(null), bis = useRef(null);
  useLayoutEffect(() => zeitreglerEinrichten(regler.current, marke.current, von.current, bis.current, b), [b]);
  return (
    <div className="pw-zeitregler">
      <input type="range" id="pw-zeit" min="0" max="200" step="1" defaultValue="100" ref={regler} />
      <div className="pw-zeitmarke" id="pw-zeitmarke" ref={marke} />
      <div className="pw-zeitinfo"><span id="pw-zeitvon" ref={von} />
        <span className="klein">Zeitraum</span>
        <span id="pw-zeitbis" ref={bis} /></div>
    </div>
  );
}

function FehlerKarte({ titel, text }) {
  return (
    <div className="karte karte--fehler">
      {titel && <h2>{titel}</h2>}
      <p>{text}</p>
      <p className="klein">Version {alt.APP_VERSION}</p>
    </div>
  );
}

export default function Planwand({ auffrischen, behaelter: b }) {
  const plan = alt.plan;
  // laedt → bereit, oder ein Fehler beim Laden der Maschinen
  const [stand, setStand] = useState({ art: "laedt" });
  const inhaltRef = useRef(null);
  const mobil = alt.isMobil();

  // Vor dem ersten Zeichnen: Platz und Masse festlegen
  useLayoutEffect(() => {
    plan.behaelter = b;
    if (plan.adminModus === false && alt.einstellung("pwadmin")) plan.adminModus = true;
    // Diese Seite darf die ganze Fensterbreite nutzen.
    b.classList.add("inhalt--breit");
    // So viele Arbeitstage, wie nebeneinander Platz haben.
    alt.masseBerechnen(b);
    if (!plan.start) plan.start = alt.naechsterArbeitstag(alt.wochenStart(alt.isoDatum(new Date())));
    plan.zeitreglerEl = null;
    suchTasteAnmelden();

    let weg = false;
    (async () => {
      try {
        alt.prod.parks = await alt.ladeParks(false);
        alt.prod.maschinen = await alt.ladeMaschinen(false);
        if (!weg) setStand({ art: "bereit" });
      } catch (f) {
        if (!weg) setStand({ art: "fehler", text: alt.fehlertext(f) });
      }
    })();
    return () => { weg = true; };
  }, [b, plan]);

  // Sobald die Bühne steht: Tafel laden und zeichnen
  useEffect(() => {
    if (stand.art !== "bereit") return;
    const inhalt = inhaltRef.current;
    inhalt.innerHTML = '<div class="laedt">Planung wird geladen …</div>';
    tafelLaden(b, inhalt).catch((f) => {
      console.error("Planwand:", f);
      setStand({ art: "kaputt", text: f && f.message ? f.message : String(f) });
    });
  }, [stand.art, b]);

  // Der laufende Abgleich ruft die Seite erneut auf: still nachladen,
  // Zeitraum und Scrollstand bleiben
  useEffect(() => {
    if (auffrischen && stand.art === "bereit") alt.planAktualisieren(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auffrischen]);

  if (stand.art === "laedt") return <div id="pw-seite"><div className="laedt">Wird geladen …</div></div>;
  if (stand.art === "fehler") return <div id="pw-seite"><FehlerKarte text={stand.text} /></div>;
  if (stand.art === "kaputt") {
    return <div id="pw-seite"><FehlerKarte titel="Die Planwand konnte nicht aufgebaut werden" text={stand.text} /></div>;
  }
  return (
    <div id="pw-seite">
      <Kopfleiste b={b} mobil={mobil} />
      <div className="pw-buehne">
        <div id="pw-inhalt" ref={inhaltRef} />
        <div className="pw-zeitschicht" id="pw-zeitschicht" hidden>{!mobil && <Zeitregler b={b} />}</div>
      </div>
    </div>
  );
}
