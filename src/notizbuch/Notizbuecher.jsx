// =================================================================
//  NOTIZBÜCHER
//  Grosses Fenster ähnlich wie OneNote (Wunsch Patrick 7. Oktober
//  2026): links die Bücher, daneben die Seiten des gewählten Buchs,
//  rechts die Seite zum Zeichnen, Schreiben und Einfügen von Bildern
//  und PDFs (Seite.jsx). Geöffnet mit dem Buch-Knopf bei den Notizen
//  auf der Startseite; die normalen Notizen bleiben, wie sie sind.
//
//  Jeder ausser Externen darf alles bearbeiten, wie bei den Notizen.
//  Löschen fragt einmal nach; Neu, Umbenennen und Löschen von Büchern
//  und Seiten lassen sich mit Rückgängig zurücknehmen, ebenso alles,
//  was auf einer Seite geändert wurde (als ein Schritt je Besuch).
// =================================================================
import { useCallback, useEffect, useState } from "react";
import { alt } from "../bruecke.jsx";
import { fensterOeffnen } from "../teile/Fenster.jsx";
import { Symbol, EIMER } from "../teile/zeichnen.jsx";
import Seite from "./Seite.jsx";
import { buecherLaden, seitenLaden, fehltTabelle, BUCHFARBEN, BUECHER, SEITEN } from "./daten.js";

export const BUCH = "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6";
const STIFT = "M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z";
const PLUS = "M12 5v14M5 12h14";

// Zuletzt offenes Buch und Seite, nur als Bequemlichkeit auf dem Gerät
const MERKEN = "hofer.notizbuch";
function gemerkt() { try { return JSON.parse(localStorage.getItem(MERKEN) || "{}") || {}; } catch (f) { return {}; } }
function merken(o) { try { localStorage.setItem(MERKEN, JSON.stringify(o)); } catch (f) { /* egal */ } }

export function notizbuecherOeffnen() {
  let huelle = null;
  fensterOeffnen((zu) => <Notizbuecher zu={zu} huelle={() => huelle} />, null, "nb-huelle");
  const alle = document.querySelectorAll(".dialog-huelle.nb-huelle");
  huelle = alle[alle.length - 1];
}

const seitenName = (s) => (s.titel || "").trim() || "Ohne Titel";

function Notizbuecher({ zu, huelle }) {
  const darf = !(alt.istExtern && alt.istExtern());
  const [buecher, setBuecher] = useState(null);
  const [fehlt, setFehlt] = useState(false);
  const [buchId, setBuchId] = useState(() => gemerkt().buch || null);
  const [seiten, setSeiten] = useState(null);
  const [seiteId, setSeiteId] = useState(() => gemerkt().seite || null);

  const buecherNeu = useCallback(async (waehlen) => {
    try {
      const l = await buecherLaden();
      setBuecher(l || []);
      setBuchId((alt0) => {
        const w = waehlen || alt0;
        return (l || []).some((b) => b.id === w) ? w : ((l && l[0] && l[0].id) || null);
      });
    } catch (e) {
      if (fehltTabelle(e)) setFehlt(true);
      else alt.meldung("Notizbücher nicht geladen: " + alt.fehlertext(e), "fehler");
      setBuecher([]);
    }
  }, []);
  useEffect(() => { buecherNeu(); }, [buecherNeu]);

  const seitenNeu = useCallback(async (waehlen) => {
    if (!buchId) { setSeiten([]); return; }
    try {
      const l = (await seitenLaden(buchId)) || [];
      setSeiten(l);
      setSeiteId((alt0) => {
        const w = waehlen || alt0;
        return l.some((s) => s.id === w) ? w : ((l[0] && l[0].id) || null);
      });
    } catch (e) {
      alt.meldung("Seiten nicht geladen: " + alt.fehlertext(e), "fehler");
      setSeiten([]);
    }
  }, [buchId]);
  useEffect(() => { setSeiten(null); seitenNeu(); }, [seitenNeu]);
  useEffect(() => { if (buchId) merken({ buch: buchId, seite: seiteId }); }, [buchId, seiteId]);

  // ---------- Bücher ----------
  const buchDialog = (b) => alt.dialogFelder({
    titel: b ? "Notizbuch bearbeiten" : "Neues Notizbuch",
    felder: [
      { name: "name", label: "Name", wert: b ? b.name : "", pflicht: true, platzhalter: "z. B. Besprechungen" },
      { name: "farbe", label: "Farbe", wert: b ? b.farbe : BUCHFARBEN[(buecher || []).length % BUCHFARBEN.length][0],
        auswahl: BUCHFARBEN }],
    bestaetigen: b ? "Speichern" : "Anlegen" });

  const buchNeu = async () => {
    const w = await buchDialog(null);
    if (!w) return;
    const reihenfolge = (buecher || []).reduce((m, b) => Math.max(m, b.reihenfolge || 0), 0) + 1;
    const { data, error } = await alt.db.from(BUECHER)
      .insert({ name: w.name, farbe: w.farbe, reihenfolge }).select("id");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = data && data[0] && data[0].id;
    if (!id) return;
    alt.merkeSchritt("Neues Notizbuch", alt.rueckWeg(BUECHER, { id }));
    // Ein neues Buch hat gleich eine leere Seite, wie in OneNote
    const s = await alt.db.from(SEITEN).insert({ buch_id: id, titel: "", reihenfolge: 1 }).select("id");
    setSeiteId((s.data && s.data[0] && s.data[0].id) || null);
    await buecherNeu(id);
  };

  const buchBearbeiten = async (b) => {
    const w = await buchDialog(b);
    if (!w) return;
    const { error } = await alt.db.from(BUECHER).update({ name: w.name, farbe: w.farbe,
      geaendert_am: new Date().toISOString() }).eq("id", b.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Notizbuch umbenennen", alt.rueckSetz(BUECHER, { name: b.name, farbe: b.farbe }, { id: b.id }));
    buecherNeu();
  };

  const buchLoeschen = async (b) => {
    const ok = await alt.nachfragen({ titel: "Notizbuch löschen?",
      text: "„" + b.name + "“ mit allen Seiten wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    // Für Rückgängig: Buch und alle Seiten samt Inhalt sichern
    const buch = await alt.rueckSichern(BUECHER, { id: b.id });
    const blaetter = await alt.rueckSichern(SEITEN, { buch_id: b.id });
    const { error } = await alt.db.from(BUECHER).delete().eq("id", b.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    // Die Seiten gehen in der Datenbank mit; ausdrücklich, falls nicht
    await alt.db.from(SEITEN).delete().eq("buch_id", b.id);
    alt.merkeSchritt("Notizbuch löschen", [alt.rueckRein(BUECHER, buch), alt.rueckRein(SEITEN, blaetter)]);
    alt.meldung("Gelöscht.");
    setSeiteId(null);
    buecherNeu();
  };

  // ---------- Seiten ----------
  const seiteNeu = async () => {
    if (!buchId) return;
    const reihenfolge = (seiten || []).reduce((m, s) => Math.max(m, s.reihenfolge || 0), 0) + 1;
    const { data, error } = await alt.db.from(SEITEN)
      .insert({ buch_id: buchId, titel: "", reihenfolge }).select("id");
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    const id = data && data[0] && data[0].id;
    if (!id) return;
    alt.merkeSchritt("Neue Notizbuch-Seite", alt.rueckWeg(SEITEN, { id }));
    await seitenNeu(id);
  };

  const seiteLoeschen = async (s) => {
    const ok = await alt.nachfragen({ titel: "Seite löschen?",
      text: "„" + seitenName(s) + "“ wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
    if (!ok) return;
    // Erst wegwechseln, damit die offene Seite ihren Stand noch speichert
    const rest = (seiten || []).filter((x) => x.id !== s.id);
    setSeiteId(rest[0] ? rest[0].id : null);
    await new Promise((r) => setTimeout(r, 50));
    const sicherung = await alt.rueckSichern(SEITEN, { id: s.id });
    const { error } = await alt.db.from(SEITEN).delete().eq("id", s.id);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    alt.merkeSchritt("Notizbuch-Seite löschen", alt.rueckRein(SEITEN, sicherung));
    alt.meldung("Gelöscht.");
    seitenNeu();
  };

  // Der Titel steht auf der Seite selbst; die Liste zieht mit
  const titelGeaendert = useCallback((id, titel) => {
    setSeiten((l) => (l || []).map((s) => (s.id === id ? { ...s, titel } : s)));
  }, []);

  const buch = (buecher || []).find((b) => b.id === buchId);

  let haupt;
  if (fehlt) {
    haupt = <div className="nb-fehlt"><p><b>Notizbücher sind noch nicht eingerichtet.</b></p>
      <p>Sie gehen, sobald die Datei notizbuecher.sql in Supabase ausgeführt ist.</p></div>;
  } else if (buecher && !buecher.length) {
    haupt = <div className="nb-fehlt"><p>Noch kein Notizbuch.</p>
      {darf && <button type="button" className="knopf knopf--haupt" onClick={buchNeu}>Erstes Notizbuch anlegen</button>}</div>;
  } else if (seiteId) {
    haupt = <Seite key={seiteId} id={seiteId} darf={darf} onTitel={titelGeaendert} huelle={huelle()} />;
  } else if (seiten && !seiten.length) {
    haupt = <div className="nb-fehlt"><p>Dieses Buch hat noch keine Seite.</p>
      {darf && <button type="button" className="knopf knopf--haupt" onClick={seiteNeu}>Seite anlegen</button>}</div>;
  } else {
    haupt = <div className="nb-fehlt"><p>Wird geladen …</p></div>;
  }

  return (
    <div className="dialog nb" role="dialog" aria-label="Notizbücher" style={{ "--buch": (buch && buch.farbe) || "var(--marke)" }}>
      <div className="nb-kopf">
        <span className="nb-kopf__zeichen"><Symbol d={BUCH} /></span>
        <h2>{buch ? buch.name : "Notizbücher"}</h2>
        <button type="button" className="nb-zu" aria-label="Schliessen" title="Schliessen (Escape)" onClick={zu}>×</button>
      </div>
      <div className="nb-koerper">
        <nav className="nb-buecher" aria-label="Notizbücher">
          <div className="nb-spaltenkopf">Bücher
            {darf && !fehlt && <button type="button" className="nb-plus" data-nb="buch-neu" aria-label="Neues Notizbuch"
              title="Neues Notizbuch" onClick={buchNeu}><Symbol d={PLUS} /></button>}</div>
          <div className="nb-liste">
            {(buecher || []).map((b) => (
              <div key={b.id} className={"nb-eintrag nb-eintrag--buch" + (b.id === buchId ? " aktiv" : "")}
                style={{ "--f": b.farbe }}>
                <button type="button" className="nb-eintrag__name" data-nbbuch={b.id}
                  onClick={() => { if (b.id !== buchId) { setSeiteId(null); setBuchId(b.id); } }}>
                  <span className="nb-ruecken" />{b.name}</button>
                {darf && b.id === buchId && <>
                  <button type="button" className="nb-mini" aria-label="Notizbuch bearbeiten" title="Umbenennen, Farbe"
                    data-nbbuchbearb="" onClick={() => buchBearbeiten(b)}><Symbol d={STIFT} /></button>
                  <button type="button" className="nb-mini nb-mini--weg" aria-label="Notizbuch löschen" title="Löschen"
                    data-nbbuchweg="" onClick={() => buchLoeschen(b)}><Symbol d={EIMER} /></button>
                </>}
              </div>))}
          </div>
        </nav>
        <nav className="nb-seiten" aria-label="Seiten">
          <div className="nb-spaltenkopf">Seiten
            {darf && buchId && !fehlt && <button type="button" className="nb-plus" data-nb="seite-neu" aria-label="Neue Seite"
              title="Neue Seite" onClick={seiteNeu}><Symbol d={PLUS} /></button>}</div>
          <div className="nb-liste">
            {(seiten || []).map((s) => (
              <div key={s.id} className={"nb-eintrag" + (s.id === seiteId ? " aktiv" : "")}>
                <button type="button" className="nb-eintrag__name" data-nbseite={s.id}
                  onClick={() => setSeiteId(s.id)}>{seitenName(s)}</button>
                {darf && s.id === seiteId &&
                  <button type="button" className="nb-mini nb-mini--weg" aria-label="Seite löschen" title="Seite löschen"
                    data-nbseiteweg="" onClick={() => seiteLoeschen(s)}><Symbol d={EIMER} /></button>}
              </div>))}
          </div>
        </nav>
        <main className="nb-haupt">{haupt}</main>
      </div>
    </div>
  );
}
