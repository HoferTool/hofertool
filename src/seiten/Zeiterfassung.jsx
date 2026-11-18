// =================================================================
//  SEITE ZEITERFASSUNG (seit 1.626.0, Wunsch Patrick 18. November 2026:
//  „Zeiterfassungstool für die Mitarbeiter … auf den Handys und am PC
//  auch melden“, „jeder Mitarbeiter soll seine Zeiten sehen und managen
//  können“, „es gibt Stundenlöhner und Monatslöhner“)
//  Oben der grosse Knopf Kommen / Gehen, darunter Woche oder Monat mit
//  jedem Tag: Stempelungen, Ist, bei Monatslöhnern Soll und Differenz,
//  dazu der Saldo. Antippen eines Tages zeigt die Stempelungen zum
//  Ändern, Löschen und Nachtragen. Jede Änderung schreibt die Datenbank
//  in zeit_verlauf (Knopf „Verlauf“). Admins sehen dazu alle
//  Mitarbeiter, wer gerade da ist, und stellen je Person Lohnart,
//  Sollzeit, Pensum und Saldo-Übertrag ein. Nicht für Externe, Dienst
//  und Gerätekonten. Rechnung in src/daten/zeit.js.
// =================================================================
import { useEffect, useState } from "react";
import { alt, useDaten, useGemerkt } from "../bruecke.jsx";
import {
  paareRechnen, tageRechnen, stand, stempeln, stempelLaden, uhrzeit, dauerText, tagVon,
  montag, tagePlus, ausFeldern, sollTag, abwesendeTage, freierTag, ferienStand, fehlerSuchen, feiertageEintragen, feiertageLaden, saldoRechnen, ferienStufenLaden, buchungenLaden, minutenJeFerientag, jubilaeen } from "../daten/zeit.js";
import { zeitApp, istTerminal, terminalSetzen } from "./zeit/app.js";
import { feiertageOeffnen, stufenOeffnen } from "./zeit/Feiertage.jsx";
import { profilOeffnen } from "./zeit/Profil.jsx";
import Panel from "./zeit/Panel.jsx";
import { gesichtOeffnen } from "./zeit/GesichtEinlernen.jsx";
import Auswertung from "./zeit/Auswertung.jsx";
import { ABWESENHEITEN } from "../daten/abwesenheit.js";

const gemerkt = { reiter: "ich", person: null, ansicht: "woche", bezug: null, offen: null };
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const LOHNART = { monat: "Monatslohn", stunde: "Stundenlohn" };
const ABW = { feiertag: "Feiertag (bezahlt)", ferien: "Ferien", kompensieren: "Kompensieren", militaer: "Militär/ZS", feuerwehr: "Feuerwehr", schule: "Schule", krankheit: "Krankheit", unfall: "Unfall" };

// Personen, die Zeiten erfassen: wie zeit_darf() in der Datenbank
function erfasst(p) {
  return p && p.is_active !== false && p.role !== "extern" && p.role !== "dienst" && !p.andere_nutzer;
}

async function personenLaden() {
  const r = await alt.zeitlimit(alt.db.from("profiles")
    .select("id, full_name, email, role, is_active, andere_nutzer, initialen, nur_zeit, ohne_passwort"), 10000, "Personen");
  return (r.data || []).filter((p) => (erfasst(p) || p.nur_zeit) && p.is_active !== false).sort((a, b) => alt.personName(a).localeCompare(alt.personName(b)));
}

async function einstLaden(personId) {
  const r = await alt.zeitlimit(alt.db.from("zeit_personen").select("*").eq("person_id", personId).maybeSingle(), 8000, "Zeit Person");
  return r.error ? null : r.data;
}

// Abwesenheiten der Planwand für diese Person. Die Datenbank sucht sie
// über den Namen und die Ferien-Namen (zeit_abwesenheiten), so sehen auch
// Konten nur für HOFERTIME ihre eigenen, ohne die Planwand lesen zu dürfen.
async function ferienLaden(personId, von, bis) {
  const r = await alt.zeitlimit(alt.db.rpc("zeit_abwesenheiten", { p_person: personId, p_von: von, p_bis: bis }),
    10000, "Ferien").then((x) => x, () => ({ data: [] }));
  return r.data || [];
}

function zeitraum(ansicht, bezug) {
  if (ansicht === "monat") {
    const von = new Date(bezug.getFullYear(), bezug.getMonth(), 1);
    return { von, bis: new Date(bezug.getFullYear(), bezug.getMonth() + 1, 1) };
  }
  const von = montag(bezug);
  return { von, bis: tagePlus(von, 7) };
}

function zeitraumText(ansicht, von) {
  if (ansicht === "monat") return von.toLocaleDateString("de-CH", { month: "long", year: "numeric" });
  const bis = tagePlus(von, 6);
  return "KW " + alt.kalenderwoche(alt.isoDatum(von)) + " · " + alt.kurzDatum(alt.isoDatum(von)) + " – " + alt.kurzDatum(alt.isoDatum(bis));
}

async function laden(personId, ansicht, bezugIso) {
  const bezug = alt.ausIso(bezugIso);
  const { von, bis } = zeitraum(ansicht, bezug);
  const [einst] = await Promise.all([einstLaden(personId), feiertageLaden()]);
  const startTag = (einst && einst.saldo_start_tag) || alt.isoDatum(new Date(new Date().getFullYear(), 0, 1));
  const abSaldo = alt.ausIso(startTag);
  const ab = abSaldo < von ? abSaldo : von;
  const morgen = tagePlus(new Date(), 1);
  const jahrEnde = alt.isoDatum(new Date(new Date().getFullYear(), 11, 31));
  const bisIso = alt.isoDatum(bis);
  // Ferien ab dem Jahr, für das der Übertrag im Profil steht, damit der
  // Rest der Vorjahre von selbst weiterläuft
  const ferienJahr = Number(einst && einst.ferien_jahr) || new Date().getFullYear();
  const ferienAb = [alt.plusTage(alt.isoDatum(ab), -30), ferienJahr + "-01-01"].sort()[0];
  const [stempelAlle, ferien, stufen, buchungen] = await Promise.all([
    stempelLaden(personId, ab.toISOString(), (bis > morgen ? bis : morgen).toISOString()),
    ferienLaden(personId, ferienAb, bisIso > jahrEnde ? bisIso : jahrEnde),
    ferienStufenLaden(),
    buchungenLaden(personId),
  ]);
  if (stempelAlle === null) return { fehlt: true };
  return { einst, stempelAlle, ferien, von, bis, stufen, buchungen };
}

export default function Zeiterfassung({ auffrischen }) {
  const admin = alt.zeitAdmin();
  const ich = alt.profil || {};
  const [reiter, setReiter] = useState(admin ? gemerkt.reiter : "ich");
  const [person, setPerson] = useState(gemerkt.person);
  const [ansicht, setAnsicht] = useState(gemerkt.ansicht);
  const [bezug, setBezug] = useState(gemerkt.bezug || alt.isoDatum(new Date()));
  const [offen, setOffen] = useState(gemerkt.offen);
  useGemerkt(gemerkt, { reiter, person, ansicht, bezug, offen });

  // Stempel-Panel am iPad: nur Namen antippen und stempeln
  if (ich.zeit_terminal) return <><AppKopf name={alt.personName(ich)} panel /><Panel /></>;
  if (!erfasst(ich) && !admin && !ich.nur_zeit) {
    return <><h1 className="seitentitel">HOFERTIME</h1>
      <div className="karte karte--hinweis"><p>Mit diesem Konto werden keine Zeiten erfasst.</p></div></>;
  }
  const personId = reiter === "person" && person ? person.id : ich.id;
  const name = reiter === "person" && person ? alt.personName(person) : alt.personName(ich);

  const konto = reiter === "person" && person ? person : ich;
  return (
    <>
      {document.body.classList.contains("ze-app") ? <AppKopf name={alt.personName(ich)} /> : <h1 className="seitentitel">HOFERTIME</h1>}
      {admin && (
        <div className="reiter ze-reiter">
          <button className={"reiter__knopf" + (reiter === "ich" ? " aktiv" : "")} id="ze-reiter-ich"
            onClick={() => setReiter("ich")}>Meine Zeiten</button>
          <button className={"reiter__knopf" + (reiter === "alle" ? " aktiv" : "")} id="ze-reiter-alle"
            onClick={() => setReiter("alle")}>Alle Mitarbeiter</button>
          <button className={"reiter__knopf" + (reiter === "auswertung" ? " aktiv" : "")} id="ze-reiter-auswertung"
            onClick={() => setReiter("auswertung")}>Auswertung</button>
          {person && <button className={"reiter__knopf" + (reiter === "person" ? " aktiv" : "")} id="ze-reiter-person"
            onClick={() => setReiter("person")}>{alt.personName(person)}</button>}
        </div>)}
      {reiter === "auswertung" && admin ? <Auswertung auffrischen={auffrischen} />
        : reiter === "alle"
        ? <Alle auffrischen={auffrischen} oeffnen={(p) => { setPerson(p); setReiter("person"); setOffen(null); }} />
        : <Person key={personId} personId={personId} name={name} konto={konto} eigene={personId === ich.id} admin={admin}
            ansicht={ansicht} setAnsicht={setAnsicht} bezug={bezug} setBezug={setBezug}
            offen={offen} setOffen={setOffen} auffrischen={auffrischen} />}
    </>
  );
}

// Läuft die Uhr, jede halbe Minute neu zeichnen
function useTakt(an) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!an) return undefined;
    const t = setInterval(() => setT((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, [an]);
}

// Eigener Kopf in der App HOFERTIME (ohne Kopfzeile und Menü des HoferTools)
function AppKopf({ name, panel }) {
  return (
    <header className="ze-appkopf">
      <img src="./logo-weiss.svg" alt="Hofer + Co" className="ze-appkopf__logo" />
      <b className="ze-appkopf__titel">HOFERTIME</b>
      <span className="ze-appkopf__name">{name}{istTerminal() ? " · Terminal" : ""}</span>
      <button className="knopf knopf--klein ze-appkopf__ab" id="ze-abmelden"
        onClick={() => (panel ? panelAbmelden() : istTerminal() && alt.jetztAbmelden ? alt.jetztAbmelden() : window.abmeldenFragen && window.abmeldenFragen())}>Abmelden</button>
    </header>);
}

// Nach dem Stempeln am Terminal: gross bestätigen, dann abmelden
function Bestaetigung({ b }) {
  useEffect(() => {
    const t = setTimeout(() => { if (alt.jetztAbmelden) alt.jetztAbmelden(); }, b.fehler && b.fehler.length ? 9000 : 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={"ze-bestaetigt ze-bestaetigt--" + b.art} id="ze-bestaetigt" onClick={() => alt.jetztAbmelden && alt.jetztAbmelden()}>
      <div className="ze-bestaetigt__haken">✓</div>
      <div className="ze-bestaetigt__text">{b.art === "kommen" ? "Eingestempelt" : "Ausgestempelt"} {b.zeit}</div>
      <div className="ze-bestaetigt__name">{b.art === "kommen" ? "Guten Tag" : "Schönen Feierabend"}, {b.name}</div>
      {b.fehler && b.fehler.length > 0 && <div className="ze-bestaetigt__fehler">
        ⚠ Bitte korrigieren: {b.fehler.slice(0, 3).map((f) => alt.kurzDatum(f.tag) + " " + f.text).join(" · ")}{b.fehler.length > 3 ? " …" : ""}
        <div className="klein">Am Handy oder PC in HOFERTIME, oder hier nochmals anmelden.</div>
      </div>}
      <div className="klein">Wird abgemeldet …</div>
    </div>);
}

function Person({ personId, name, konto, eigene, admin, ansicht, setAnsicht, bezug, setBezug, offen, setOffen, auffrischen }) {
  const { daten, fehler, neu } = useDaten(() => laden(personId, ansicht, bezug), [personId, ansicht, bezug, auffrischen]);
  const [laeuft, setLaeuft] = useState(false);
  const [bestaetigt, setBestaetigt] = useState(null);
  const jetzt = stand(daten && !daten.fehlt ? daten.stempelAlle : []);
  useTakt(jetzt.da);

  if (fehler && !daten) return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  if (!daten) return <div className="laedt">Wird geladen …</div>;
  if (daten.fehlt) return <div className="karte karte--hinweis"><p>Die Zeiterfassung ist in der Datenbank noch nicht eingerichtet (sql/zeiterfassung.sql).</p></div>;

  const { einst, stempelAlle, ferien, von, bis, stufen, buchungen } = daten;
  const tage = tageRechnen(paareRechnen(stempelAlle), einst || null);
  const abw = feiertageEintragen(abwesendeTage(ferien), tage);
  const heute = alt.isoDatum(new Date());
  const monatslohn = !einst || einst.lohnart !== "stunde";
  const saldo = saldoRechnen(einst, stempelAlle, ferien, name, buchungen);

  const liste = [];
  for (let d = new Date(von); d < bis; d = tagePlus(d, 1)) liste.push(alt.isoDatum(d));
  let ist = 0, soll = 0;
  liste.forEach((d) => {
    ist += tage.get(d) ? tage.get(d).minuten : 0;
    if (d < heute) soll += sollTag(d, einst, abw);
  });
  const heuteMin = tage.get(heute) ? tage.get(heute).minuten : 0;

  async function knopf() {
    setLaeuft(true);
    const art = jetzt.da ? "gehen" : "kommen";
    const r = await stempeln(art, personId);
    setLaeuft(false);
    if (r && eigene && istTerminal() && zeitApp) {
      setBestaetigt({ art, zeit: uhrzeit(r.zeit), name: name.split(" ")[0], fehler: fehlerListe });
      return;
    }
    if (r && fehlerListe.length) alt.meldung(fehlerListe.length + (fehlerListe.length === 1 ? " Sache stimmt" : " Sachen stimmen") + " noch nicht, siehe oben.", "warn");
    if (r) {
      alt.meldung((art === "kommen" ? "Eingestempelt " : "Ausgestempelt ") + uhrzeit(r.zeit) + (eigene ? "" : " für " + name) + ".", "gut");
      neu();
    }
  }

  // PDF „Tagessummen“ für die gezeigte Woche oder den Monat (seit 1.628.0)
  async function pdfMachen() {
    try {
      const { tagessummenPdf } = await import("./zeit/tagessummen.js");
      await tagessummenPdf([{ name, abteilung: einst && String(einst.abteilung || "").trim(), einst, stempel: stempelAlle, ferien, buchungen }],
        alt.isoDatum(von), alt.isoDatum(bis), stufen);
    } catch (f) { alt.meldung("PDF ging nicht: " + alt.fehlertext(f), "fehler"); }
  }

  const schieben = (n) => {
    const b = alt.ausIso(bezug);
    setBezug(alt.isoDatum(ansicht === "monat" ? new Date(b.getFullYear(), b.getMonth() + n, 1) : tagePlus(b, 7 * n)));
  };

  const jahr = new Date().getFullYear();
  const fe = ferienStand(einst, abw, jahr, heute, { stufen, buchungen });
  const ersterStempel = stempelAlle[0] && tagVon(stempelAlle[0].zeit);
  const fehlerListe = fehlerSuchen(tage, einst, abw, heute, (einst && einst.saldo_start_tag) || ersterStempel);
  const zumTag = (d) => { setAnsicht("woche"); setBezug(d); setOffen(d); };
  return (
    <>
      {bestaetigt && <Bestaetigung b={bestaetigt} />}
      <section className={"karte ze-stempel" + (jetzt.da ? " ze-stempel--da" : "")}>
        <div className="ze-stempel__text">
          <div className="ze-stempel__name">{name}{einst ? <span className="klein"> · {LOHNART[einst.lohnart] || ""}</span> : null}</div>
          <div className="ze-stempel__stand" id="ze-stand">
            {jetzt.da ? "Eingestempelt seit " + uhrzeit(jetzt.letzte.zeit)
              : jetzt.letzte ? "Ausgestempelt · zuletzt " + alt.datumZeitKurz(jetzt.letzte.zeit) : "Noch nie gestempelt"}
          </div>
          <div className="klein">Heute {dauerText(heuteMin)}
            {saldo ? <> · Gleitzeit <b className={saldo.min < 0 ? "ze-minus" : "ze-plus"} id="ze-saldo">{dauerText(saldo.min)}</b></> : null}
          </div>
        </div>
        <button className={"ze-knopf " + (jetzt.da ? "ze-knopf--gehen" : "ze-knopf--kommen")} id="ze-knopf"
          disabled={laeuft} onClick={knopf}>{jetzt.da ? "Gehen" : "Kommen"}</button>
      </section>

      <div className="ze-leiste">
        <div className="ze-umschalter">
          <button className={"knopf knopf--klein" + (ansicht === "woche" ? " knopf--haupt" : "")} id="ze-woche"
            onClick={() => setAnsicht("woche")}>Woche</button>
          <button className={"knopf knopf--klein" + (ansicht === "monat" ? " knopf--haupt" : "")} id="ze-monat"
            onClick={() => setAnsicht("monat")}>Monat</button>
        </div>
        <div className="ze-blaettern">
          <button className="knopf knopf--klein" id="ze-zurueck" onClick={() => schieben(-1)}>‹</button>
          <b>{zeitraumText(ansicht, von)}</b>
          <button className="knopf knopf--klein" id="ze-vor" onClick={() => schieben(1)}>›</button>
          <button className="knopf knopf--klein" onClick={() => setBezug(heute)}>Heute</button>
        </div>
        <div className="ze-umschalter">
          <button className="knopf knopf--klein" id="ze-nachtragen" onClick={() => nachtragen(personId, heute, neu)}>+ Nachtragen</button>
          <button className="knopf knopf--klein" id="ze-verlauf" onClick={() => verlaufZeigen(personId, name)}>Verlauf</button>
          <button className="knopf knopf--klein" id="ze-pdf" onClick={pdfMachen}>⬇ PDF</button>
          {(admin || eigene) && <button className="knopf knopf--klein" id="ze-gesicht-knopf" onClick={() => gesichtOeffnen(personId, name)}>🙂 Gesicht</button>}
          {eigene && konto && (konto.ohne_passwort || konto.nur_zeit) &&
            <button className="knopf knopf--klein" id="ze-pin-aendern" onClick={pinAendern}>🔑 PIN ändern</button>}
          {admin && <button className="knopf knopf--klein" id="ze-einst" onClick={() => profilOeffnen(personId, name, einst, neu)}>👤 Profil</button>}
          {admin && monatslohn && <button className="knopf knopf--klein" id="ze-umbuchen" onClick={() => umbuchen(personId, name, einst, neu)}>⇄ Umbuchen</button>}
          {admin && konto && konto.nur_zeit && <>
            <button className="knopf knopf--klein" id="ze-pin" onClick={() => pinSetzen(konto)}>PIN setzen</button>
            <button className="knopf knopf--klein knopf--gefahr" id="ze-konto-aus" onClick={() => kontoAus(konto)}>Konto deaktivieren</button>
          </>}
        </div>
      </div>

      {fehlerListe.length > 0 && <section className="karte ze-fehler" id="ze-fehler">
        <b>⚠ {fehlerListe.length === 1 ? "1 Sache stimmt nicht" : fehlerListe.length + " Sachen stimmen nicht"}</b>
        <div className="ze-fehler__liste">
          {fehlerListe.map((f) => (
            <button key={f.tag} className="ze-fehler__punkt" data-ze-fehler={f.tag} onClick={() => zumTag(f.tag)}>
              <b>{WT[alt.ausIso(f.tag).getDay()]} {alt.kurzDatum(f.tag)}</b> {f.text} <span className="klein">korrigieren ›</span>
            </button>))}
        </div>
      </section>}
      <section className="ze-kacheln">
        {monatslohn && saldo && <div className="karte ze-kachel">
          <span className="klein">Gleitzeit-Saldo</span>
          <b className={"ze-kachel__zahl " + (saldo.min < 0 ? "ze-minus" : "ze-plus")} id="ze-gleitzeit">{dauerText(saldo.min)}</b>
          <span className="klein">{saldo.ab ? "seit " + alt.kurzDatum(saldo.ab) : ""}</span>
        </div>}
        <div className="karte ze-kachel" id="ze-ferien">
          <span className="klein">Ferien {jahr}</span>
          <b className={"ze-kachel__zahl" + (fe.rest < 0 ? " ze-minus" : "")} id="ze-ferien-rest">{alt.zahlText(fe.rest)} Tage übrig</b>
          <span className="klein">Anspruch {alt.zahlText(fe.anspruch)}
            {fe.uebertrag ? " (Übertrag " + alt.zahlText(fe.uebertrag) + ")" : ""}
            {fe.gebucht ? " (umgebucht " + (fe.gebucht > 0 ? "+" : "") + alt.zahlText(fe.gebucht) + ")" : ""}
            {" "}· bezogen {fe.bezogen} · geplant {fe.geplant}</span>
          {(buchungen || []).length > 0 && <div className="ze-buchungen klein" id="ze-buchungen">
            {buchungen.slice(-5).map((b) => (
              <span key={b.id} className="ze-buchung">
                {alt.kurzDatum(b.datum)}: {Number(b.tage) > 0 ? "+" : ""}{alt.zahlText(b.tage)} Tage Ferien, {b.minuten > 0 ? "+" : ""}{dauerText(b.minuten)} Gleitzeit
                {b.notiz ? " · " + b.notiz : ""}
                {admin && <button className="knopf knopf--klein knopf--still" aria-label="Umbuchung löschen" onClick={() => umbuchungWeg(b, neu)}>✕</button>}
              </span>))}
          </div>}
        </div>
      </section>

      <section className="karte ze-tage">
        <div className="ze-zeile ze-zeile--kopf klein">
          <span>Tag</span><span>Stempelungen</span><span className="ze-zahl">Ist</span>
          {monatslohn && <><span className="ze-zahl">Soll</span><span className="ze-zahl">Diff.</span></>}
        </div>
        {liste.map((d) => {
          const t = tage.get(d);
          const s = d < heute ? sollTag(d, einst, abw) : (d === heute ? sollTag(d, einst, abw) : 0);
          const im = t ? t.minuten : 0;
          const frei = freierTag(d);
          const a = abw.get(d);
          const zukunft = d > heute;
          return (
            <div key={d} data-ze-tag={d}>
              <button className={"ze-zeile" + (d === heute ? " ze-zeile--heute" : "") + (frei ? " ze-zeile--frei" : "") + (t && t.fehler ? " ze-zeile--fehler" : "")}
                onClick={() => setOffen(offen === d ? null : d)} aria-expanded={offen === d}>
                <span><b>{WT[alt.ausIso(d).getDay()]}</b> {alt.kurzDatum(d)}</span>
                <span className="ze-paare">
                  {t ? t.paare.map((p, i) => (
                    <span key={i} className={"ze-paar" + (p.fehlt ? " ze-paar--fehlt" : "") + (p.laeuft ? " ze-paar--laeuft" : "")}>
                      {p.kommen ? uhrzeit(p.kommen.zeit) : "?"}–{p.gehen ? uhrzeit(p.gehen.zeit) : (p.laeuft ? "jetzt" : "?")}
                    </span>)) : null}
                  {a ? <span className="ze-abw">{ABW[a] || a}</span> : null}
                  {t && t.gutschrift ? <span className="ze-abw ze-gutschrift">Spätschicht +{dauerText(t.gutschrift)}</span> : null}
                  {t && t.fehler ? <span className="ze-hinweis">Stempelung fehlt</span> : null}
                </span>
                <span className="ze-zahl">{im ? dauerText(im) : ""}</span>
                {monatslohn && <>
                  <span className="ze-zahl klein">{s ? dauerText(s) : ""}</span>
                  <span className={"ze-zahl " + (im - s < 0 ? "ze-minus" : "ze-plus")}>{!zukunft && d !== heute && (s || im) ? dauerText(im - s) : ""}</span>
                </>}
              </button>
              {offen === d && <TagOffen tag={d} stempel={stempelAlle.filter((x) => tagVon(x.zeit) === d)} personId={personId} neu={neu}
                abwesendDarf={admin || eigene} selbst={!admin} planName={planName(einst, konto, name)} />}
            </div>);
        })}
        <div className="ze-zeile ze-zeile--summe">
          <b>Total</b><span />
          <b className="ze-zahl" id="ze-ist">{dauerText(ist)}</b>
          {monatslohn && <>
            <b className="ze-zahl">{dauerText(soll)}</b>
            <b className={"ze-zahl " + (ist - soll < 0 ? "ze-minus" : "ze-plus")}>{dauerText(ist - (soll + (tage.get(heute) && liste.includes(heute) ? 0 : 0)))}</b>
          </>}
        </div>
      </section>
      {monatslohn && <p className="klein ze-erklaerung">
        Soll je Arbeitstag {dauerText(einst ? (einst.soll_woche_h * einst.pensum / 100 / 5) * 60 : 0)}
        {einst ? " (" + alt.zahlText(Number(einst.soll_woche_h)) + " h Woche, " + alt.zahlText(Number(einst.pensum)) + " %)" : " · noch keine Sollzeit eingestellt"}.
        Kein Soll an Wochenenden, Feiertagen, Betriebsferien und bei Ferien, Militär oder Feuerwehr auf der Planwand. Heute zählt das Soll erst am Abend.
        {saldo && saldo.ab ? " Saldo ab " + alt.kurzDatum(saldo.ab) + "." : ""}
      </p>}
    </>
  );
}

function TagOffen({ tag, stempel, personId, neu, abwesendDarf, selbst, planName: wer }) {
  return (
    <div className="ze-offen">
      {stempel.length ? stempel.map((s) => (
        <div key={s.id} className="ze-eintrag" data-ze-stempel={s.id}>
          <b className={s.art === "kommen" ? "ze-plus" : "ze-minus"}>{s.art === "kommen" ? "Kommen" : "Gehen"}</b>
          <b>{uhrzeit(s.zeit)}</b>
          <span className="klein">{[quelleText(s.quelle), s.notiz, s.geaendert_am ? "geändert " + alt.datumZeitKurz(s.geaendert_am) : ""].filter(Boolean).join(" · ")}</span>
          <button className="knopf knopf--klein" onClick={() => aendern(s, neu)}>Ändern</button>
          <button className="knopf knopf--klein knopf--gefahr" onClick={() => loeschen(s, neu)}>Löschen</button>
        </div>)) : <p className="klein">Keine Stempelungen.</p>}
      <div className="ze-offen__knoepfe">
        <button className="knopf knopf--klein knopf--haupt" onClick={() => nachtragen(personId, tag, neu)}>+ Stempelung an diesem Tag</button>
        {abwesendDarf && <button className="knopf knopf--klein" data-ze-abwesend onClick={() => abwesendEintragen(wer, tag, neu, selbst)}>Abwesend …</button>}
      </div>
    </div>
  );
}

// ---------- Abwesend eintragen ----------
// Wunsch Patrick 18. November 2026 („ja“ auf den Vorschlag, krank oder
// kompensieren auch direkt in HOFERTIME einzutragen): schreibt einen
// Eintrag in die Ferienzeile der Planwand (vacations), dieselbe Quelle wie
// sonst, damit es nur eine Wahrheit gibt. Name wie auf der Planwand: der
// erste Name aus „Namen auf der Planwand“ im Profil, sonst der volle Name.
function planName(einst, konto, name) {
  const n = einst && Array.isArray(einst.ferien_namen) && einst.ferien_namen.find(Boolean);
  return n || (konto && konto.full_name) || name;
}

// Seit 1.629.0 (Wunsch Patrick 18. November 2026: „die Benutzer sollen
// auch an einem Tag Abwesenheitsarten eintragen können“) auch für sich
// selbst, auch mit reinem HOFERTIME-Konto: dann über die Funktion
// zeit_abwesend_eintragen in der Datenbank (sql/hofertime-4.sql), die nur
// für die angemeldete Person schreibt; ändern und löschen bleibt beim Admin.
async function abwesendEintragen(wer, tag, neu, selbst) {
  const w = await alt.dialogFelder({
    titel: selbst ? "Abwesend eintragen" : "Abwesend " + wer,
    text: selbst ? "Erscheint auch auf der Planwand. Ändern oder löschen kann danach ein Admin."
      : "Erscheint auch auf der Planwand in der Ferienzeile. Ändern oder löschen dort.",
    felder: [
      { name: "art", label: "Art", wert: "krankheit", auswahl: ABWESENHEITEN.map((a) => [a.id, a.name]) },
      { name: "von", label: "Erster Tag", typ: "date", wert: tag, pflicht: true },
      { name: "tage", label: "Anzahl Arbeitstage", wert: "1", ziffern: true, pflicht: true },
      { name: "notiz", label: "Notiz (freiwillig)", wert: "" },
    ],
    bestaetigen: "Eintragen" });
  if (!w) return;
  const tage = Math.round(Number(String(w.tage).replace(",", ".")));
  if (!w.von || !(tage >= 1 && tage <= 260)) { alt.meldung("Erster Tag und Anzahl Tage prüfen.", "warn"); return; }
  const von = alt.naechsterArbeitstag(w.von);
  const artName = (ABWESENHEITEN.find((a) => a.id === w.art) || {}).name || w.art;
  if (selbst) {
    if (tage > 60) { alt.meldung("Höchstens 60 Tage auf einmal.", "warn"); return; }
    const r = await alt.db.rpc("zeit_abwesend_eintragen", { p_von: von, p_tage: tage, p_art: w.art, p_notiz: String(w.notiz || "").trim() || null });
    if (r.error) {
      const fehlt = /zeit_abwesend_eintragen|function|schema cache/i.test(r.error.message || "");
      alt.meldung(fehlt ? "Selbst eintragen ist noch nicht eingerichtet. Bitte einem Admin melden." : "Nicht eingetragen: " + alt.fehlertext(r.error), "fehler");
      return;
    }
    alt.meldung(artName + " eingetragen.", "gut");
    neu();
    return;
  }
  const zeile = await freieZeile(von, tage);
  const r = await alt.db.from("vacations").insert({ person: wer, von, tage, zeile, note: String(w.notiz || "").trim() || null,
    abwesenheit: w.art, genehmigt: true }).select("id");
  if (r.error) { alt.meldung("Nicht eingetragen: " + alt.fehlertext(r.error), "fehler"); return; }
  const id = r.data && r.data[0] && r.data[0].id;
  const art = (ABWESENHEITEN.find((a) => a.id === w.art) || {}).name || w.art;
  if (id) alt.merkeSchritt(art + " von " + wer, alt.rueckWeg("vacations", { id }));
  alt.meldung(art + " eingetragen.", "gut");
  neu();
}

// Erste Ferienzeile ohne Überschneidung, wie freieFerienZeile auf der
// Planwand; hier frisch geladen, weil die Planwand nicht offen sein muss.
async function freieZeile(von, tage) {
  const tagePlan = alt.arbeitstage(von, tage);
  const ab = alt.plusTage(von, -120);
  const r = await alt.zeitlimit(alt.db.from("vacations").select("zeile, von, tage").gte("von", ab).lte("von", tagePlan[tagePlan.length - 1]), 8000, "Ferien")
    .catch(() => ({ data: [] }));
  const alle = r.data || [];
  const hoechste = Math.max(5, ...alle.map((f) => Number(f.zeile) || 1));
  for (let z = 1; z <= hoechste + 1; z++) {
    const belegt = alle.some((f) => (Number(f.zeile) || 1) === z && alt.arbeitstage(f.von, f.tage || 1).some((t) => tagePlan.includes(t)));
    if (!belegt) return z;
  }
  return hoechste + 1;
}

const QUELLEN = { handy: "Handy/Tablet", pc: "PC", terminal: "Terminal", nachgetragen: "nachgetragen", import: "übernommen" };
function quelleText(q) { return QUELLEN[q] || q || ""; }

function stempelFelder(s, tag) {
  return [
    { name: "art", label: "Art", wert: s ? s.art : "kommen", auswahl: [["kommen", "Kommen"], ["gehen", "Gehen"]] },
    { name: "datum", label: "Datum", typ: "date", wert: s ? tagVon(s.zeit) : tag, pflicht: true },
    { name: "zeit", label: "Uhrzeit", typ: "time", wert: s ? uhrzeit(s.zeit) : "", pflicht: true },
    { name: "notiz", label: "Grund / Notiz (freiwillig)", wert: s ? s.notiz || "" : "", platzhalter: "z.B. Stempeln vergessen" },
  ];
}

async function nachtragen(personId, tag, neu) {
  const w = await alt.dialogFelder({ titel: "Stempelung nachtragen", felder: stempelFelder(null, tag), bestaetigen: "Speichern" });
  if (!w) return;
  const zeit = ausFeldern(w.datum, w.zeit);
  if (!zeit) { alt.meldung("Datum und Uhrzeit prüfen.", "warn"); return; }
  const r = await alt.db.from("zeit_stempel").insert({ person_id: personId, art: w.art, zeit, quelle: "nachgetragen", notiz: w.notiz || null })
    .select("id").single();
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Stempelung nachtragen", alt.rueckWeg("zeit_stempel", { id: r.data.id }));
  alt.meldung("Nachgetragen.", "gut");
  neu();
}

async function aendern(s, neu) {
  const w = await alt.dialogFelder({ titel: "Stempelung ändern", felder: stempelFelder(s), bestaetigen: "Speichern" });
  if (!w) return;
  const zeit = ausFeldern(w.datum, w.zeit);
  if (!zeit) { alt.meldung("Datum und Uhrzeit prüfen.", "warn"); return; }
  const r = await alt.db.from("zeit_stempel").update({ art: w.art, zeit, notiz: w.notiz || null }).eq("id", s.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Stempelung ändern", alt.rueckSetz("zeit_stempel", { art: s.art, zeit: s.zeit, notiz: s.notiz }, { id: s.id }));
  alt.meldung("Geändert.", "gut");
  neu();
}

async function loeschen(s, neu) {
  const ok = await alt.nachfragen({ titel: "Stempelung löschen",
    text: (s.art === "kommen" ? "Kommen" : "Gehen") + " " + alt.datumZeitKurz(s.zeit) + " löschen?", bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const vorher = await alt.rueckSichern("zeit_stempel", { id: s.id });
  const r = await alt.db.from("zeit_stempel").delete().eq("id", s.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  if (vorher.length) alt.merkeSchritt("Stempelung löschen", alt.rueckRein("zeit_stempel", vorher));
  alt.meldung("Gelöscht.", "gut");
  neu();
}

async function verlaufZeigen(personId, name) {
  const r = await alt.zeitlimit(alt.db.from("zeit_verlauf").select("*").eq("person_id", personId)
    .order("wann", { ascending: false }).limit(100), 10000, "Verlauf");
  const leute = await alt.zeitlimit(alt.db.from("profiles").select("id, full_name, email"), 8000, "Personen").then((x) => x.data || [], () => []);
  const wer = new Map(leute.map((u) => [u.id, alt.personName(u)]));
  const was = { neu: "erfasst", geaendert: "geändert", geloescht: "gelöscht" };
  const st = (x) => x ? (x.art === "kommen" ? "Kommen " : "Gehen ") + alt.datumZeitKurz(x.zeit) : "";
  const zeilen = (r.data || []).map((v) => alt.datumZeitKurz(v.wann) + " · " + (wer.get(v.wer) || "") + ": " + (was[v.was] || v.was) + " "
    + (v.was === "geaendert" ? st(v.vorher) + " → " + st(v.nachher) : st(v.nachher || v.vorher)));
  await alt.nachfragen({ titel: "Verlauf " + name, text: zeilen.length ? zeilen.join("\n") : "Noch keine Änderungen.", bestaetigen: "Schliessen", ohneAbbrechen: true });
}

// ---------- Umbuchen Ferien ↔ Gleitzeit ----------
// Wunsch Patrick 18. November 2026: „Ferienguthaben und Gleitzeit sollen
// umgebucht werden können, in beide Richtungen“. Ein Ferientag gilt so
// viel wie die Sollzeit eines durchschnittlichen Arbeitstags im Profil.
async function umbuchen(personId, name, einst, neu) {
  const proTag = minutenJeFerientag(einst);
  if (!proTag) { alt.meldung("Im Profil fehlt die Sollzeit, ohne sie lässt sich nicht umbuchen.", "warn"); return; }
  const w = await alt.dialogFelder({
    titel: "Umbuchen " + name,
    text: "1 Ferientag = " + dauerText(proTag) + " Gleitzeit (Sollzeit eines Arbeitstags).",
    felder: [
      { name: "richtung", label: "Richtung", wert: "zuFerien", auswahl: [["zuFerien", "Gleitzeit → Ferien (Ferientage dazu)"], ["zuGleitzeit", "Ferien → Gleitzeit (Ferientage weg)"]] },
      { name: "tage", label: "Ferientage (z.B. 1 oder 0.5)", wert: "1", dezimal: true, pflicht: true },
      { name: "datum", label: "Gebucht am", typ: "date", wert: alt.isoDatum(new Date()), pflicht: true },
      { name: "notiz", label: "Grund (freiwillig)", wert: "" },
    ],
    bestaetigen: "Umbuchen",
  });
  if (!w) return;
  const t = Number(String(w.tage).replace(",", "."));
  if (!Number.isFinite(t) || t <= 0) { alt.meldung("Bitte eine Zahl grösser als 0 eintragen.", "warn"); return; }
  const tage = w.richtung === "zuFerien" ? t : -t;
  const r = await alt.db.from("zeit_buchungen").insert({
    person_id: personId, datum: w.datum, tage, minuten: Math.round(-tage * proTag), notiz: w.notiz || null,
  }).select().single();
  if (r.error) { alt.meldung("Nicht umgebucht: " + alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Umbuchen " + name, alt.rueckWeg("zeit_buchungen", { id: r.data.id }));
  alt.meldung("Umgebucht: " + (tage > 0 ? "+" : "") + alt.zahlText(tage) + " Ferientage, " + dauerText(Math.round(-tage * proTag)) + " Gleitzeit.", "gut");
  neu();
}

async function umbuchungWeg(b, neu) {
  if (!await alt.nachfragen({ titel: "Umbuchung löschen?", text: "Ferien und Gleitzeit stehen danach wieder wie vorher.", bestaetigen: "Löschen", gefahr: true })) return;
  const r = await alt.db.from("zeit_buchungen").delete().eq("id", b.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Umbuchung löschen", alt.rueckRein("zeit_buchungen", [b]));
  neu();
}

// ---------- Admins: alle Mitarbeiter ----------
async function alleLaden() {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const vor = tagePlus(heute, -1);
  const mo = montag(new Date());
  const [leute, stempel, einst] = await Promise.all([
    personenLaden(),
    stempelLaden(null, (mo < vor ? mo : vor).toISOString(), tagePlus(heute, 1).toISOString()),
    alt.zeitlimit(alt.db.from("zeit_personen").select("*"), 8000, "Zeit Personen").then((x) => x.data || [], () => []),
  ]);
  if (stempel === null) return { fehlt: true };
  return { leute, stempel, einst: new Map(einst.map((e) => [e.person_id, e])), mo };
}

function Alle({ auffrischen, oeffnen }) {
  const { daten, fehler, neu } = useDaten(alleLaden, [auffrischen]);
  const [suche, setSuche] = useState("");
  useTakt(true);
  if (fehler && !daten) return <div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div>;
  if (!daten) return <div className="laedt">Wird geladen …</div>;
  if (daten.fehlt) return <div className="karte karte--hinweis"><p>Die Zeiterfassung ist in der Datenbank noch nicht eingerichtet.</p></div>;
  const heute = alt.isoDatum(new Date());
  const moIso = alt.isoDatum(daten.mo);
  const zeilen = daten.leute.map((p) => {
    const st = daten.stempel.filter((s) => s.person_id === p.id);
    const tage = tageRechnen(paareRechnen(st), daten.einst.get(p.id) || null);
    let woche = 0;
    tage.forEach((t, d) => { if (d >= moIso) woche += t.minuten; });
    return { p, jetzt: stand(st), heute: tage.get(heute) ? tage.get(heute).minuten : 0, woche, e: daten.einst.get(p.id) };
  }).filter((z) => !suche.trim() || alt.personName(z.p).toLowerCase().includes(suche.trim().toLowerCase()));
  const da = zeilen.filter((z) => z.jetzt.da).length;
  // Dienstjubiläen alle 5 Jahre im nächsten Jahr (Wunsch Patrick 18. November 2026)
  const jubi = jubilaeen(daten.leute.map((p) => ({ person_id: p.id, name: alt.personName(p), eintritt: (daten.einst.get(p.id) || {}).eintritt }))
    .filter((x) => x.eintritt), heute, 365, 7);
  return (
    <>
      <div className="mat-kopf">
        <b id="ze-anwesend">{da} von {zeilen.length} anwesend</b>
        <input className="mat-sucheingabe" type="search" value={suche} placeholder="Person suchen" onChange={(e) => setSuche(e.target.value)} />
        <button className="knopf knopf--klein knopf--haupt" id="ze-neues-konto" onClick={() => neuesKonto(neu)}>+ Konto nur für HOFERTIME</button>
        <button className="knopf knopf--klein" id="ze-neues-panel" onClick={() => neuesPanel(neu)}>+ Stempel-Panel (iPad)</button>
        <button className="knopf knopf--klein" id="ze-feiertage-knopf" onClick={() => feiertageOeffnen(neu)}>Bezahlte Feiertage</button>
        <button className="knopf knopf--klein" id="ze-stufen-knopf" onClick={() => stufenOeffnen(neu)}>Ferien nach Alter</button>
      </div>
      {jubi.length > 0 && <section className="karte ze-jubi" id="ze-jubilaeen">
        <h3>🎉 Dienstjubiläen</h3>
        {jubi.map((x) => <div key={x.person_id + x.datum} className="ze-jubi__zeile" data-ze-jubi={x.person_id}>
          <span>{alt.kurzDatum(x.datum) + x.datum.slice(0, 4)}</span><b>{x.name}</b><span>{x.jahre} Jahre</span></div>)}
      </section>}
      <section className="karte ze-alle">
        <div className="ze-azeile ze-zeile--kopf klein">
          <span>Person</span><span>Jetzt</span><span className="ze-zahl">Heute</span><span className="ze-zahl">Diese Woche</span><span>Lohnart</span>
        </div>
        {zeilen.map((z) => (
          <button key={z.p.id} className="ze-azeile" data-ze-person={z.p.id} onClick={() => oeffnen(z.p)}>
            <b>{alt.personName(z.p)}{z.p.nur_zeit ? <span className="ze-schild">nur HOFERTIME</span> : null}{z.p.is_active === false ? <span className="ze-schild">deaktiviert</span> : null}</b>
            <span>{z.jetzt.da ? <span className="ze-da">● da seit {uhrzeit(z.jetzt.letzte.zeit)}</span>
              : <span className="klein">{z.jetzt.letzte ? "weg · " + alt.datumZeitKurz(z.jetzt.letzte.zeit) : "—"}</span>}</span>
            <span className="ze-zahl">{z.heute ? dauerText(z.heute) : ""}</span>
            <span className="ze-zahl">{z.woche ? dauerText(z.woche) : ""}</span>
            <span className="klein">{z.e ? LOHNART[z.e.lohnart] : "nicht eingestellt"}</span>
          </button>))}
      </section>
    </>
  );
}

// ---------- Konten nur für HOFERTIME (Admins) ----------
// Für Leute, die sonst nichts im HoferTool brauchen. Sie melden sich mit
// Name und PIN an, in HOFERTIME am iPad, Handy oder PC, und sehen nur ihre
// Zeiten. Angelegt über die Server-Funktion zeit-konto, die PIN setzt
// danach pin_setzen wie unter Einstellungen → Nutzer.
const PIN_FELD = { name: "pin", label: "PIN (4 bis 8 Ziffern, besser 6)", typ: "password", ziffern: true, pflicht: true };

async function pinSchreiben(id, pin) {
  if (!/^\d{4,8}$/.test(pin)) { alt.meldung("Die PIN braucht 4 bis 8 Ziffern.", "warn"); return false; }
  const { error } = await alt.db.rpc("pin_setzen", { p_pin: pin, p_ziel: id });
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return false; }
  return true;
}

async function neuesKonto(neu) {
  const w = await alt.dialogFelder({
    titel: "Neues Konto für HOFERTIME",
    text: "Die Person sieht nur ihre eigenen Zeiten, sonst nichts vom HoferTool. Sie tippt in HOFERTIME auf ihren Namen und gibt die PIN ein. Sag ihr die PIN persönlich.",
    felder: [{ name: "name", label: "Vorname und Name", pflicht: true }, PIN_FELD,
      { name: "lohnart", label: "Lohnart", wert: "monat", auswahl: [["monat", "Monatslohn"], ["stunde", "Stundenlohn"]] }],
    bestaetigen: "Konto anlegen",
  });
  if (!w) return;
  const name = String(w.name || "").trim();
  const pin = String(w.pin || "").trim();
  if (!/^\d{4,8}$/.test(pin)) { alt.meldung("Die PIN braucht 4 bis 8 Ziffern.", "warn"); return; }
  const r = await alt.zeitlimit(alt.db.functions.invoke("zeit-konto", { body: { name } }), 20000, "Konto anlegen")
    .then((x) => x, (f) => ({ error: f }));
  const id = r.data && r.data.id;
  if (r.error || !id) { alt.meldung("Konto nicht angelegt: " + alt.fehlertext(r.error || (r.data && r.data.fehler)), "fehler"); return; }
  if (!(await pinSchreiben(id, pin))) return;
  await alt.db.from("zeit_personen").upsert({ person_id: id, lohnart: w.lohnart || "monat" }, { onConflict: "person_id" });
  alt.meldung("Konto für " + name + " angelegt.", "gut");
  neu();
}

async function pinSetzen(konto) {
  const w = await alt.dialogFelder({ titel: "PIN für " + alt.personName(konto), felder: [PIN_FELD], bestaetigen: "PIN setzen" });
  if (!w) return;
  if (await pinSchreiben(konto.id, String(w.pin || "").trim())) alt.meldung("PIN gesetzt.", "gut");
}

// Die eigene PIN ändern (Wunsch Patrick 18. November 2026: „die Benutzer
// sollen ihren PIN ändern können“). pin_setzen ohne Ziel gilt für das
// eigene Konto, die Datenbank prüft das (anmeldung_darf).
async function pinAendern() {
  const w = await alt.dialogFelder({
    titel: "PIN ändern",
    text: "Neue PIN zweimal eingeben. Danach meldest du dich mit der neuen PIN an.",
    felder: [{ ...PIN_FELD, label: "Neue PIN (4 bis 8 Ziffern)" },
      { name: "pin2", label: "Neue PIN nochmals", typ: "password", ziffern: true, pflicht: true }],
    bestaetigen: "PIN ändern",
  });
  if (!w) return;
  const pin = String(w.pin || "").trim();
  if (pin !== String(w.pin2 || "").trim()) { alt.meldung("Die beiden PINs sind nicht gleich.", "warn"); return; }
  if (!/^\d{4,8}$/.test(pin)) { alt.meldung("Die PIN braucht 4 bis 8 Ziffern.", "warn"); return; }
  const { error } = await alt.db.rpc("pin_setzen", { p_pin: pin });
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.meldung("PIN geändert.", "gut");
}

async function kontoAus(konto) {
  const ok = await alt.nachfragen({ titel: "Konto deaktivieren",
    text: alt.personName(konto) + " kann sich danach nicht mehr anmelden. Die Zeiten bleiben. Wieder einschalten geht unter Einstellungen → Nutzer.",
    bestaetigen: "Deaktivieren", gefahr: true });
  if (!ok) return;
  const r = await alt.db.from("profiles").update({ is_active: false }).eq("id", konto.id);
  if (r.error) { alt.meldung(alt.fehlertext(r.error), "fehler"); return; }
  alt.merkeSchritt("Konto deaktivieren", alt.rueckSetz("profiles", { is_active: true }, { id: konto.id }));
  alt.meldung("Deaktiviert.", "gut");
}

function TerminalSchalter() {
  const [an, setAn] = useState(istTerminal());
  return (
    <label className="schalter ze-terminal" title="Für ein iPad in der Firma, an dem alle stempeln">
      <input type="checkbox" id="ze-terminal" checked={an} onChange={(e) => {
        terminalSetzen(e.target.checked);
        // Ein Terminal darf niemanden mit einem Tipp hereinlassen
        if (e.target.checked) { try { localStorage.removeItem("hofer.geraet.sitzungen"); } catch (f) { /* egal */ } }
        setAn(e.target.checked);
        alt.meldung(e.target.checked ? "Dieses Gerät ist jetzt ein Stempel-Terminal: kein Merken der Anmeldung, nach dem Stempeln abmelden." : "Kein Terminal mehr.", "gut");
      }} />
      <span>Dieses Gerät ist ein Stempel-Terminal</span>
    </label>);
}

// Ein Panel meldet sich nur mit Rückfrage ab, sonst stünde das iPad still
async function panelAbmelden() {
  const ok = await alt.nachfragen({ titel: "Panel abmelden", text: "Danach kann an diesem iPad niemand mehr stempeln, bis sich das Panel wieder anmeldet.", bestaetigen: "Abmelden", gefahr: true });
  if (ok && alt.jetztAbmelden) alt.jetztAbmelden();
}

async function neuesPanel(neu) {
  const w = await alt.dialogFelder({
    titel: "Neues Stempel-Panel",
    text: "Für ein iPad in der Firma: dort tippt jeder auf seinen Namen und stempelt, ohne Anmeldung. Danach am iPad hofertool.github.io/hofertool/hofertime öffnen, unten „Andere Nutzer“, das Panel wählen und einmal die PIN eingeben. Es bleibt angemeldet.",
    felder: [{ name: "name", label: "Name des Panels", wert: "Panel Eingang", pflicht: true }, PIN_FELD],
    bestaetigen: "Panel anlegen",
  });
  if (!w) return;
  const pin = String(w.pin || "").trim();
  if (!/^\d{4,8}$/.test(pin)) { alt.meldung("Die PIN braucht 4 bis 8 Ziffern.", "warn"); return; }
  const r = await alt.zeitlimit(alt.db.functions.invoke("zeit-konto", { body: { name: String(w.name).trim(), panel: true } }), 20000, "Panel anlegen")
    .then((x) => x, (f) => ({ error: f }));
  const id = r.data && r.data.id;
  if (r.error || !id) { alt.meldung("Panel nicht angelegt: " + alt.fehlertext(r.error || (r.data && r.data.fehler)), "fehler"); return; }
  if (!(await pinSchreiben(id, pin))) return;
  alt.meldung("Panel angelegt.", "gut");
  neu();
}
