// =================================================================
//  PRODUKTION · Erfassen
//  Zählerstände je Maschine, als Tag (Karten) oder Woche (Tabelle).
//  Datum, Tag/Woche, Park und Suche ändern nur den Ausschnitt, ohne
//  Parks und Maschinen neu zu laden. Nach jeder gespeicherten Zahl
//  werden nur die Zahlen neu geholt; Bildlauf und Fokus bleiben.
// =================================================================
import { useReducer, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";

const NICHTS_GEFUNDEN = (suche) => 'Nichts gefunden zu "' + suche + '". Gesucht wird in '
  + "Maschinenname, Maschinennummer und HOCO Nr.";

// Filtert die Maschinen nach Park und Suchtext
function gefiltert(prod, suche) {
  const s = suche.trim().toLowerCase();
  return prod.maschinen.filter((m) => {
    if (!s) return m.park_id === prod.parkId;
    const auftrag = prod.auftraege ? prod.auftraege[m.id] : null;
    return (m.name || "").toLowerCase().includes(s)
      || (m.machine_number || "").toLowerCase().includes(s)
      || (auftrag && (auftrag.job_number || "").toLowerCase().includes(s));
  });
}

export default function Erfassen({ geladen, neuLaden, behaelter, zuMaschinen }) {
  const prod = alt.prod;
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const [suche, setSucheRoh] = useState(prod.suche || "");
  const setSuche = (w) => { prod.suche = w; setSucheRoh(w); };

  if (!prod.parks.length) {
    return (
      <div className="karte karte--hinweis"><h2>Noch keine Maschinen</h2>
        <p>Lege zuerst einen Maschinenpark und Maschinen an.</p>
        {alt.darfSchreiben() &&
          <button className="knopf knopf--haupt" id="zu-maschinen" onClick={zuMaschinen}>Maschinen einrichten</button>}
      </div>
    );
  }
  if (!prod.parkId || !prod.parks.some((p) => p.id === prod.parkId)) prod.parkId = prod.parks[0].id;

  const maschinen = gefiltert(prod, suche);
  const istWoche = prod.modus === "woche";
  const tageProWoche = alt.einstellung("wochenende") ? 7 : 5;
  const von = istWoche ? alt.wochenStart(prod.tag) : prod.tag;
  const bis = istWoche ? alt.plusTage(von, tageProWoche - 1) : prod.tag;
  const setzen = (aenderung) => { Object.assign(prod, aenderung); zeichnen(); };

  const parkwahl = prod.parks.length >= 2 && (
    <div className="parkwahl">
      {prod.parks.map((p) => (
        <button key={p.id} className={"parkwahl__knopf" + (p.id === prod.parkId ? " aktiv" : "")}
          data-park={p.id} onClick={() => setzen({ parkId: p.id })}>{p.name}</button>
      ))}
    </div>
  );
  const suchfeld = (
    <div className="suchleiste">
      <input type="search" id="p-suche" placeholder="Suchen" value={suche} autoComplete="off"
        autoFocus={!!suche} onChange={(e) => setSuche(e.target.value)} />
    </div>
  );
  const leer = (
    <div className="karte karte--hinweis"><p>{suche.trim()
      ? NICHTS_GEFUNDEN(suche) : "In diesem Maschinenpark ist noch keine Maschine angelegt."}</p></div>
  );

  // Ohne Maschine nur Park, Suche und Hinweis, wie bisher
  if (!maschinen.length && !suche.trim()) return <>{parkwahl}{suchfeld}{leer}</>;

  return (
    <>
      {parkwahl}
      <div className="steuerung">
        <button className="knopf knopf--klein" id="zurueck"
          onClick={() => setzen({ tag: alt.plusTage(prod.tag, istWoche ? -7 : -1) })}>‹</button>
        <div className="steuerung__mitte">
          <div className="steuerung__titel" id="zeitraum">{istWoche
            ? "Woche " + alt.kurzDatum(von) + " – " + alt.kurzDatum(bis)
            : alt.wochentagName(prod.tag) + ", " + alt.kurzDatum(prod.tag) + alt.ausIso(prod.tag).getFullYear()}</div>
          <button className="linkknopf" id="heute"
            onClick={() => setzen({ tag: alt.isoDatum(new Date()) })}>Heute</button>
        </div>
        <button className="knopf knopf--klein" id="vor"
          onClick={() => setzen({ tag: alt.plusTage(prod.tag, istWoche ? 7 : 1) })}>›</button>
      </div>
      <div className="moduswahl">
        <button className={"moduswahl__knopf" + (!istWoche ? " aktiv" : "")} data-modus="tag"
          onClick={() => setzen({ modus: "tag" })}>Tag</button>
        <button className={"moduswahl__knopf" + (istWoche ? " aktiv" : "")} data-modus="woche"
          onClick={() => setzen({ modus: "woche" })}>Woche</button>
      </div>
      {suchfeld}
      <div id="raster">
        {maschinen.length
          ? <Raster maschinen={maschinen} von={von} bis={bis} istWoche={istWoche}
              tageProWoche={tageProWoche} geladen={geladen} neuLaden={neuLaden} behaelter={behaelter} />
          : leer}
      </div>
    </>
  );
}

function Raster({ maschinen, von, bis, istWoche, tageProWoche, geladen, neuLaden, behaelter }) {
  const prod = alt.prod;
  const ids = maschinen.map((m) => m.id);
  const { daten: staende, fehler, neu } = useDaten(
    () => alt.ladeZaehlerstaende(von, bis, ids), [von, bis, ids.join(","), geladen]);

  if (fehler && !staende) {
    return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  }
  if (!staende) return <div className="laedt">Zahlen werden geladen …</div>;

  const aktionen = auftragsAktionen(neuLaden);
  const feld = (m, datum) => (
    <StandFeld maschine={m} datum={datum} staende={staende} neu={neu} behaelter={behaelter} />
  );

  if (!istWoche) {
    return (
      <div className="mkarten">
        {maschinen.map((m) => (
          <div className="mkarte" key={m.id}>
            <div className="mkarte__kopf"><div className="mkarte__name">{m.name}
              {m.machine_number && <> <span className="mkarte__nrneben">{m.machine_number}</span></>}
              {m.machine_number && <span className="mkarte__nr">{m.machine_number}</span>}
            </div></div>
            <AuftragsZeile maschine={m} aktionen={aktionen} />
            <div className="mkarte__eingabe">
              <div className="mkarte__label">Zählerstand<span>gesamt seit Auftragsbeginn</span></div>
              {feld(m, prod.tag)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const tage = [];
  for (let i = 0; i < tageProWoche; i++) tage.push(alt.plusTage(von, i));
  const heute = alt.isoDatum(new Date());

  return (
    <>
      <div className="karte karte--raster"><div className="rasterrolle">
        <table className="raster raster--woche">
          <thead><tr><th className="fest">Maschine und Auftrag</th>
            {tage.map((t, i) => (
              <th key={t} className={t === heute ? "heute" : ""}>{alt.WT_KURZ[i]}
                <span className="th__datum">{alt.kurzDatum(t)}</span></th>
            ))}
            <th className="aw-summe">Woche<span className="th__datum">Stück</span></th>
          </tr></thead>
          <tbody>
            {maschinen.map((m) => {
              const j = prod.auftraege[m.id];
              let summe = 0, erfasst = false;
              const eintraege = tage.map((t) => staende.proSchluessel[m.id + "|" + t]);
              eintraege.forEach((e) => {
                if (e && Number.isFinite(e.leistung)) { summe += e.leistung; erfasst = true; }
              });
              return (
                <tr key={m.id}>
                  <th className="fest fest--voll fest--woche">
                    <AuftragsBlockWoche maschine={m} aktionen={aktionen}
                      stand={j ? aktuellerStand(m.id, staende) : null} />
                  </th>
                  {tage.map((t, i) => {
                    const e = eintraege[i];
                    return (
                      <td key={t} className={t === heute ? "heute" : ""}>{feld(m, t)}
                        {/* Die Zeile darunter steht immer da, auch leer, damit
                            alle Felder einer Reihe auf gleicher Höhe bleiben */}
                        <span className="zelle__leistung">
                          {e && Number.isFinite(e.leistung) ? leistungText(e.leistung) : ""}</span>
                      </td>
                    );
                  })}
                  <td className="aw-summe">{erfasst
                    ? <b>{leistungText(summe)}</b> : <span className="kein-feld">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div>
      <p className="hinweis">Die grosse Zahl ist der Zählerstand seit Auftragsbeginn.
        {" "}Darunter steht die daraus errechnete Tagesleistung, ganz rechts die Summe der Woche.
        {" "}Links stehen Stand und Ziel des laufenden Auftrags.</p>
    </>
  );
}

function leistungText(n) {
  return (n > 0 ? "+" : "") + alt.zahlText(n);
}

// Letzter erfasster Zählerstand des laufenden Auftrags
function aktuellerStand(maschineId, staende) {
  const j = alt.prod.auftraege[maschineId];
  if (!j) return 0;
  const liste = (staende.proMaschine && staende.proMaschine[maschineId]) || [];
  for (let i = liste.length - 1; i >= 0; i--) {
    if (liste[i].job_id === j.id) return liste[i].quantity;
  }
  return 0;
}

// ---------- Ein Eingabefeld für den Zählerstand ----------

function StandFeld({ maschine, datum, staende, neu }) {
  const j = alt.prod.auftraege[maschine.id];
  const eintrag = staende.proSchluessel[maschine.id + "|" + datum];
  // Zahlen erfassen geht nur, solange der Auftrag wirklich läuft —
  // nicht schon bei Geplant, Rüsten oder QS Check. Ohne laufenden
  // Auftrag lässt sich nur ein vorhandener Eintrag aus der
  // Vergangenheit noch korrigieren.
  const laeuftJetzt = j && j.plan_status === "laeuft";
  const istVergangenheit = datum < alt.isoDatum(new Date());
  if (!laeuftJetzt && !(istVergangenheit && eintrag)) return <div className="kein-feld">–</div>;

  const auftragId = laeuftJetzt ? j.id : eintrag.job_id;
  const wert = eintrag ? String(eintrag.quantity) : "";

  const speichern = async (e) => {
    const el = e.target;
    const roh = el.value.trim();
    if (roh === "") return;
    const stand = Math.max(0, Math.round(Number(roh)));
    if (!Number.isFinite(stand)) { alt.meldung("Bitte eine Zahl eingeben.", "warn"); return; }
    if (eintrag && eintrag.quantity === stand) return;

    el.classList.add("menge--speichert");
    try {
      await alt.speichereStand(maschine.id, datum, stand, auftragId);
      const vorherWert = eintrag ? eintrag.quantity : null;
      alt.merkeSchritt("Zählerstand vom " + alt.kurzDatum(datum), async () => {
        if (vorherWert === null) {
          await alt.db.from("production_records").delete()
            .eq("machine_id", maschine.id).eq("record_date", datum);
        } else {
          await alt.speichereStand(maschine.id, datum, vorherWert, auftragId);
        }
        neu();
      });
      el.classList.remove("menge--speichert");
      el.classList.add("menge--gespeichert");
      setTimeout(() => el.classList.remove("menge--gespeichert"), 900);
      // Nur die Zahlen neu holen, damit die Tagesleistungen stimmen
      neu();
    } catch (f) {
      el.classList.remove("menge--speichert");
      el.classList.add("menge--fehler");
      el.value = wert;
      alt.meldung(alt.fehlertext(f), "fehler");
    }
  };

  // Ungesteuertes Feld: Was man tippt, bleibt stehen, bis man das Feld
  // verlässt. Ändert sich der gespeicherte Wert, kommt ein frisches
  // Feld (key), damit nicht der alte Text stehen bleibt.
  return (
    <input key={wert} className="menge" type="number" inputMode="numeric" min="0" step="1"
      aria-label={"Stückzahl " + (maschine.name || "") + " " + alt.kurzDatum(datum)}
      data-maschine={maschine.id} data-datum={datum} data-auftrag={auftragId}
      // Externe dürfen sonst nichts ändern, aber ihre Stückzahlen melden
      disabled={!(alt.darfSchreiben() || alt.istExtern())}
      defaultValue={wert}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }}
      onChange={() => {}}
      onBlur={speichern} />
  );
}

// ---------- Die Zeile mit dem laufenden Auftrag ----------

function AuftragsZeile({ maschine, aktionen }) {
  const j = alt.prod.auftraege[maschine.id];
  const schreiben = alt.darfSchreiben();
  if (!j) {
    return (
      <div className="auftrag auftrag--leer">
        <span className="auftrag__nr auftrag__nr--fehlt">Auftrag fehlt</span>
        {schreiben && <button className="linkknopf" data-auftrag-start={maschine.id}
          onClick={() => aktionen.starten(maschine)}>Auftrag wählen</button>}
      </div>
    );
  }
  const zustand = alt.PLANSTATUS[j.plan_status || "geplant"] || alt.PLANSTATUS.geplant;
  const seit = j.target_quantity ? "Ziel " + alt.zahlText(j.target_quantity) + " Stück"
    : "seit " + alt.kurzDatum(alt.isoDatum(new Date(j.started_at)));

  // Den Zustand darf jeder ändern, auch ohne Schreibrecht
  const zustandKnopf = (
    <button className="auftrag__status" data-auftrag-status={j.id} title="Zustand ändern"
      onClick={() => aktionen.zustand(j)}>{zustand.zeichen} {zustand.name}</button>
  );
  // Die HOCO Nr. steht am Auftrag — damit lässt sich das Einrichtblatt
  // für diese Maschine direkt öffnen
  const knoepfe = (
    <>
      <button className="linkknopf" data-blatt={j.id} data-maschine={maschine.id}
        onClick={() => aktionen.einrichtblatt(j, maschine)}>Einrichtblatt</button>
      {schreiben && <>
        <button className="linkknopf" data-auftrag-menge={j.id} onClick={() => aktionen.menge(j)}>Menge</button>
        <button className="linkknopf" data-auftrag-ende={j.id} data-maschine={maschine.id}
          onClick={() => aktionen.beenden(j)}>Beenden</button>
      </>}
    </>
  );

  return (
    <div className="auftrag">
      <span className="auftrag__nr">{j.job_number}</span>
      {zustandKnopf}
      <span className="auftrag__seit">{seit}</span>
      {knoepfe}
    </div>
  );
}

// ---------- Woche: links alles zum Auftrag in einem Block ----------

// Oben Maschine und Zustand, darunter gross die Nummer, ein Balken für
// Stand und Ziel und die Knöpfe in einer Reihe. Dieselben Knöpfe wie in
// der Tagesansicht.
function AuftragsBlockWoche({ maschine, aktionen, stand }) {
  const j = alt.prod.auftraege[maschine.id];
  const schreiben = alt.darfSchreiben();
  const kopf = (
    <span className="aw-name">{maschine.name}
      {maschine.machine_number && <> <span className="aw-mnr">{maschine.machine_number}</span></>}
    </span>
  );
  if (!j) {
    return (
      <>
        <div className="aw-kopf">{kopf}</div>
        <div className="fest__zeile"><AuftragsZeile maschine={maschine} aktionen={aktionen} /></div>
      </>
    );
  }

  const schl = alt.PLANSTATUS[j.plan_status] ? j.plan_status : "geplant";
  const zustand = alt.PLANSTATUS[schl];
  const ziel = Number(j.target_quantity) || 0;
  const st = Number(stand) || 0;
  const anteil = ziel ? Math.round(st / ziel * 100) : 0;

  return (
    <>
      <div className="aw-kopf">{kopf}
        {/* Den Zustand darf jeder ändern, auch ohne Schreibrecht */}
        <button className={"auftrag__status aw-status aw-status--" + schl} data-auftrag-status={j.id}
          title="Zustand ändern" onClick={() => aktionen.zustand(j)}>{zustand.zeichen} {zustand.name}</button>
      </div>
      <div className="aw-nr">{j.job_number}</div>
      {ziel ? <>
        <div className={"aw-fortschritt aw-fortschritt--" + schl + (anteil >= 100 ? " aw-fortschritt--voll" : "")}
          role="img" aria-label={"Stand " + alt.zahlText(st) + " von " + alt.zahlText(ziel) + " Stück"}>
          <i style={{ width: Math.min(100, anteil) + "%" }} />
        </div>
        <div className="aw-zahlen">
          <span><b>{alt.zahlText(st)}</b> von {alt.zahlText(ziel)} Stück</span>
          <span className="aw-prozent">{anteil} %</span>
        </div>
      </> : (
        <div className="aw-zahlen">
          <span>Stand <b>{alt.zahlText(st)}</b> Stück</span>
          <span>seit {alt.kurzDatum(alt.isoDatum(new Date(j.started_at)))}</span>
        </div>
      )}
      <div className="aw-knoepfe">
        {/* Die HOCO Nr. steht am Auftrag, damit öffnet sich das
            Einrichtblatt für diese Maschine direkt */}
        <button className="aw-knopf" data-blatt={j.id} data-maschine={maschine.id}
          onClick={() => aktionen.einrichtblatt(j, maschine)}>Einrichtblatt</button>
        {schreiben && <>
          <button className="aw-knopf" data-auftrag-menge={j.id} onClick={() => aktionen.menge(j)}>Menge</button>
          <button className="aw-knopf aw-knopf--ende" data-auftrag-ende={j.id} data-maschine={maschine.id}
            onClick={() => aktionen.beenden(j)}>Beenden</button>
        </>}
      </div>
    </>
  );
}

// Was die Knöpfe am Auftrag tun. Danach werden die Aufträge neu
// geladen (neuLaden), nicht die ganze Seite neu aufgebaut.
function auftragsAktionen(neuLaden) {
  const fertig = (text, r) => { alt.meldung(text + (r && r.hinweis ? " " + r.hinweis : "")); neuLaden(); };

  return {
    async einrichtblatt(j, m) {
      await alt.einrichtblattPdfOeffnen(j.job_number, m && m.type_id, j.job_number);
    },

    async zustand(j) {
      const P = alt.PLANSTATUS;
      const wahl = await alt.auswahlDialog("Zustand ändern — " + j.job_number,
        Object.keys(P).map((k) => ({ wert: k, text: P[k].zeichen + "  " + P[k].name })));
      if (!wahl || wahl === j.plan_status) return;
      try { fertig("Zustand geändert.", await alt.zustandSetzen(j, wahl)); }
      catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    },

    // Nur was auf der Planwand für diese Maschine eingeplant ist, in
    // der geplanten Reihenfolge
    async starten(maschine) {
      let geplant = [];
      try {
        const { data, error } = await alt.zeitlimit(
          alt.db.from("jobs").select("*").eq("machine_id", maschine.id)
            .is("ended_at", null).not("planned_from", "is", null)
            .order("planned_from"), 10000, "Planung");
        if (error) throw error;
        geplant = (data || []).filter((j) => j.plan_status !== "fertig");
      } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); return; }

      if (!geplant.length) {
        await alt.nachfragen({ titel: "Nichts eingeplant",
          text: "Für " + maschine.name + " steht auf der Planwand kein Auftrag. "
              + "Aufträge werden dort angelegt und eingeplant.",
          bestaetigen: "Verstanden" });
        return;
      }
      const wahl = await alt.auswahlDialog("Auftrag auf " + maschine.name,
        geplant.map((j) => ({ wert: j.id, text: j.job_number + "   ab " + alt.kurzDatum(j.planned_from)
          + (j.target_quantity ? "  ·  " + alt.zahlText(j.target_quantity) + " Stück" : "") })));
      if (!wahl) return;
      const auftrag = geplant.find((j) => j.id === wahl);
      try { fertig("Auftrag " + auftrag.job_number + " gestartet.", await alt.zustandSetzen(auftrag, "laeuft")); }
      catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    },

    async menge(j) {
      const w = await alt.dialogFelder({ titel: "Fertigungsmenge", text: "Auftrag " + j.job_number,
        felder: [{ name: "menge", label: "Wie viele Stück", typ: "number",
                   wert: j.target_quantity === null || j.target_quantity === undefined ? "" : j.target_quantity }],
        bestaetigen: "Speichern" });
      if (!w) return;
      const { error } = await alt.db.from("jobs")
        .update({ target_quantity: w.menge === 0 && String(w.menge) === "0"
          ? 0 : (w.menge ? Math.max(0, Math.round(w.menge)) : null) })
        .eq("id", j.id);
      if (error) alt.meldung(alt.fehlertext(error), "fehler");
      else fertig("Gespeichert.");
    },

    async beenden(j) {
      const ok = await alt.nachfragen({ titel: "Auftrag beenden",
        text: "Auftrag " + j.job_number + " wird abgeschlossen. "
            + "Der Zähler beginnt beim nächsten Auftrag wieder bei null. "
            + "Die erfassten Zahlen bleiben erhalten.",
        bestaetigen: "Auftrag beenden" });
      if (!ok) return;
      try { fertig("Auftrag beendet.", await alt.zustandSetzen(j, "fertig")); }
      catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
    },
  };
}
