// =================================================================
//  STARTSEITE · UMFRAGEN (seit 1.612.0, Wunsch Patrick 17. November
//  2026: „ein Umfrage-Tool, ich will Vorschläge machen, abgestimmt wird
//  nicht mit dem Benutzerprofil, sondern mit Namen, auch Bilder“)
//
//  Admins legen eine Umfrage an: Frage, Beschreibung, Bild, Vorschläge
//  je mit Text und Bild, ein oder mehrere Vorschläge wählbar. Alle ausser
//  Externen und Dienst stimmen ab: Vorschlag antippen, Namen eintippen,
//  „Abstimmen“. Derselbe Name nochmals ersetzt die Stimme (in der
//  Datenbank, umfrage_abstimmen), so stimmen am selben Gerät auch
//  mehrere Leute ab. Das Ergebnis sieht man nach dem Abstimmen und wenn
//  die Umfrage geschlossen ist; Admins sehen es immer, mit den Namen.
//  Tabellen: sql/umfragen.sql. Bilder in der Ablage „zeichnungen“ unter
//  umfragen/.
// =================================================================
import { useRef, useState } from "react";
import { alt, useDaten } from "../../bruecke.jsx";
import { Symbol } from "../../teile/zeichnen.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";

const ABLAGE = "zeichnungen";
const PLUS = "M12 5v14M5 12h14";
const NAME_SPEICHER = "hofer.umfrage.name";
const STIMME_SPEICHER = "hofer.umfrage.stimmen";

function lesen(schluessel, standard) {
  try { const w = localStorage.getItem(schluessel); return w == null ? standard : JSON.parse(w); }
  catch (f) { return standard; }
}
function ablegen(schluessel, wert) {
  try { localStorage.setItem(schluessel, JSON.stringify(wert)); } catch (f) { /* privat */ }
}

function fehltTabelle(f) {
  return /umfrage|PGRST205|42P01|schema cache/i.test(String((f && (f.message || f.code)) || ""));
}

export function umfrageSehen() {
  const r = alt.meineRolle();
  return !!alt.profil && r !== "extern" && r !== "dienst";
}

async function umfragenLaden() {
  const { data, error } = await alt.zeitlimit(alt.db.from("umfragen")
    .select("*, umfrage_vorschlaege(*), umfrage_stimmen(id, vorschlag_id, name)")
    .order("erstellt_am", { ascending: false }).limit(40), 9000, "Umfragen");
  if (error) throw error;
  return (data || []).map((u) => ({ ...u,
    vorschlaege: (u.umfrage_vorschlaege || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    stimmen: u.umfrage_stimmen || [] }));
}

async function bildHochladen(datei) {
  const blob = await alt.bildVerkleinern(datei, 1600);
  const pfad = "umfragen/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
  const r = await alt.zeitlimit(alt.db.storage.from(ABLAGE).upload(pfad, blob, { contentType: "image/jpeg" }),
    60000, "Bild hochladen");
  if (r.error) throw r.error;
  return alt.db.storage.from(ABLAGE).getPublicUrl(pfad).data.publicUrl;
}

// Leute zählen statt Stimmen: bei Mehrfachwahl hat eine Person mehrere Zeilen
function auswerten(u) {
  const je = new Map(u.vorschlaege.map((v) => [v.id, []]));
  u.stimmen.forEach((s) => { if (je.has(s.vorschlag_id)) je.get(s.vorschlag_id).push(s.name); });
  const leute = new Set(u.stimmen.map((s) => s.name.toLowerCase())).size;
  const max = Math.max(0, ...[...je.values()].map((l) => l.length));
  return { je, leute, max };
}

export default function Umfragen({ auffrischen }) {
  const sehen = umfrageSehen();
  const { daten, fehler, neu } = useDaten(sehen ? umfragenLaden : async () => [], [auffrischen, sehen]);
  if (!sehen) return null;
  if (fehler && !daten) {
    if (fehltTabelle(fehler)) return null;
    return <div id="db-umfragen"><div className="karte karte--fehler"><p>{alt.fehlertext(fehler)}</p></div></div>;
  }
  if (!daten) return <div id="db-umfragen" />;
  const admin = alt.istAdmin();
  const offen = daten.filter((u) => u.offen);
  const zu = daten.filter((u) => !u.offen);
  // Ohne offene Umfrage steht die Karte nur bei Admins, mit dem Plus
  if (!offen.length && !admin) return <div id="db-umfragen" />;

  return (
    <div id="db-umfragen">
      <section className="karte umf-karte">
        <div className="karte__kopf"><h2>Umfrage{offen.length > 1 ? "n" : ""}
          {offen.length > 1 && <> <span className="marke">{offen.length}</span></>}</h2>
          {admin && <div className="notiz-kopfrechts">
            <button type="button" className="notizbuch-knopf" id="umf-neu" aria-label="Neue Umfrage"
              title="Neue Umfrage" onClick={() => bearbeitenOeffnen(null, neu)}><Symbol d={PLUS} /></button>
          </div>}
        </div>
        {!offen.length && <p className="hinweis">Keine offene Umfrage. Mit + legst du eine an.</p>}
        {offen.map((u) => <Umfrage key={u.id} u={u} neu={neu} admin={admin} />)}
        {zu.length > 0 && (
          <details className="umf-zu" data-umf-zu="">
            <summary>Abgeschlossene Umfragen <span className="probleme-andere__zahl">{zu.length}</span></summary>
            {zu.map((u) => <Umfrage key={u.id} u={u} neu={neu} admin={admin} />)}
          </details>)}
      </section>
    </div>
  );
}

function Umfrage({ u, neu, admin }) {
  const gemerkt = lesen(STIMME_SPEICHER, {})[u.id];
  const [wahl, setWahl] = useState(() => new Set());
  const [name, setName] = useState(() => lesen(NAME_SPEICHER, "") || "");
  const [nochmals, setNochmals] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [fehlt, setFehlt] = useState("");
  const { je, leute, max } = auswerten(u);
  const abgestimmt = !!gemerkt && !nochmals;
  const ergebnis = !u.offen || abgestimmt || admin;
  const waehlbar = u.offen && !abgestimmt;

  const tippen = (id) => {
    if (!waehlbar) return;
    setFehlt("");
    setWahl((alt0) => {
      const n = new Set(u.mehrfach ? alt0 : []);
      if (alt0.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const abstimmen = async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (!wahl.size) { setFehlt("wahl"); return; }
    if (n.length < 2) { setFehlt("name"); document.getElementById("umf-name-" + u.id)?.focus(); return; }
    setSendet(true);
    const { error } = await alt.zeitlimit(alt.db.rpc("umfrage_abstimmen",
      { p_umfrage: u.id, p_vorschlaege: [...wahl], p_name: n }), 10000, "Abstimmen");
    setSendet(false);
    if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
    ablegen(NAME_SPEICHER, n);
    ablegen(STIMME_SPEICHER, { ...lesen(STIMME_SPEICHER, {}), [u.id]: n });
    setNochmals(false); setWahl(new Set());
    alt.meldung("Danke, " + n + "! Deine Stimme ist gezählt.", "gut");
    neu();
  };

  return (
    <article className={"umf" + (u.offen ? "" : " umf--zu")} data-umfrage={u.id}>
      <div className="umf__kopf">
        <h3 className="umf__titel">{u.titel}</h3>
        {admin && <div className="umf__admin">
          <button className="linkknopf" data-umfbearb={u.id} onClick={() => bearbeitenOeffnen(u, neu)}>Bearbeiten</button>
          <button className="linkknopf" data-umfoffen={u.id} onClick={() => offenSetzen(u, !u.offen, neu)}>
            {u.offen ? "Schliessen" : "Wieder öffnen"}</button>
          <button className="linkknopf linkknopf--gefahr" data-umfweg={u.id} onClick={() => umfrageLoeschen(u, neu)}>Löschen</button>
        </div>}
      </div>
      {u.beschreibung && <p className="umf__text">{u.beschreibung}</p>}
      {u.bild_url && <button type="button" className="umf__bild" onClick={() => alt.betrachter(u.bild_url, u.titel, false)}>
        <img src={u.bild_url} alt="" loading="lazy" /></button>}
      <p className="umf__info klein">
        {u.offen ? (u.mehrfach ? "Mehrere Vorschläge wählbar" : "Einen Vorschlag wählen") : "Abgeschlossen"}
        {ergebnis && <> · {leute} {leute === 1 ? "Person hat" : "Personen haben"} abgestimmt</>}
      </p>
      <div className="umf__vorschlaege">
        {u.vorschlaege.map((v) => {
          const namen = je.get(v.id) || [];
          const anteil = leute ? Math.round((namen.length / leute) * 100) : 0;
          const an = wahl.has(v.id);
          const vorne = ergebnis && namen.length > 0 && namen.length === max;
          return (
            <div key={v.id} role={waehlbar ? "button" : undefined} tabIndex={waehlbar ? 0 : undefined}
              aria-pressed={waehlbar ? an : undefined} data-umfvorschlag={v.id}
              className={"umf-v" + (an ? " umf-v--an" : "") + (waehlbar ? " umf-v--waehlbar" : "") + (vorne ? " umf-v--vorne" : "")}
              onClick={() => tippen(v.id)}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tippen(v.id); } }}>
              {v.bild_url && <div className="umf-v__bild"><img src={v.bild_url} alt="" loading="lazy" />
                <button type="button" className="umf-v__lupe" title="Bild gross" aria-label="Bild gross"
                  onClick={(e) => { e.stopPropagation(); alt.betrachter(v.bild_url, v.text, false); }}>⤢</button></div>}
              <div className="umf-v__unten">
                {waehlbar && <span className={"umf-v__wahl" + (u.mehrfach ? " umf-v__wahl--eckig" : "")} aria-hidden="true">{an ? "✓" : ""}</span>}
                <span className="umf-v__text">{v.text}</span>
                {ergebnis && <span className="umf-v__zahl">{namen.length}</span>}
              </div>
              {ergebnis && <div className="umf-v__balken" aria-label={anteil + " %"}><span style={{ width: anteil + "%" }} /></div>}
              {ergebnis && admin && namen.length > 0 && <div className="umf-v__namen klein">{namen.join(", ")}</div>}
            </div>);
        })}
      </div>
      {waehlbar && (
        <div className="umf__abstimmen">
          <input id={"umf-name-" + u.id} type="text" className={"umf__name" + (fehlt === "name" ? " fehlt" : "")}
            value={name} placeholder="Dein Name" aria-label="Dein Name" maxLength={60} autoComplete="off"
            onChange={(e) => { setName(e.target.value); setFehlt(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") abstimmen(); }} />
          <button type="button" className="knopf knopf--haupt" data-umfabstimmen={u.id} disabled={sendet} onClick={abstimmen}>
            {sendet ? "Wird gesendet …" : "Abstimmen"}</button>
          {nochmals && <button type="button" className="knopf knopf--still" onClick={() => setNochmals(false)}>Abbrechen</button>}
          {fehlt === "wahl" && <span className="feld-fehler">Bitte zuerst einen Vorschlag antippen.</span>}
          {fehlt === "name" && <span className="feld-fehler">Bitte deinen Namen eintragen.</span>}
        </div>)}
      {u.offen && abgestimmt && (
        <p className="umf__danke">✓ Abgestimmt als <b>{gemerkt}</b>
          <button className="linkknopf" data-umfnochmals={u.id} onClick={() => { setNochmals(true); setName(""); }}>
            Jemand anderes stimmt ab</button>
          <button className="linkknopf" onClick={() => { setNochmals(true); setName(gemerkt); }}>Meine Stimme ändern</button>
        </p>)}
    </article>
  );
}

async function offenSetzen(u, offen, neu) {
  const { error } = await alt.db.from("umfragen")
    .update({ offen, geschlossen_am: offen ? null : new Date().toISOString() }).eq("id", u.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  alt.merkeSchritt(offen ? "Umfrage öffnen" : "Umfrage schliessen",
    alt.rueckSetz("umfragen", { offen: u.offen, geschlossen_am: u.geschlossen_am || null }, { id: u.id }));
  alt.meldung(offen ? "Umfrage wieder offen." : "Umfrage geschlossen.");
  neu();
}

// Löschen mit einer Rückfrage; Rückgängig holt Umfrage, Vorschläge und
// Stimmen in dieser Reihenfolge zurück
async function umfrageLoeschen(u, neu) {
  const ok = await alt.nachfragen({ titel: "Umfrage löschen",
    text: "„" + u.titel + "“ mit allen Vorschlägen und " + u.stimmen.length + " Stimmen wird entfernt.",
    bestaetigen: "Löschen", gefahr: true });
  if (!ok) return;
  const [a, b, c] = await Promise.all([
    alt.db.from("umfragen").select("*").eq("id", u.id),
    alt.db.from("umfrage_vorschlaege").select("*").eq("umfrage_id", u.id),
    alt.db.from("umfrage_stimmen").select("*").eq("umfrage_id", u.id)]);
  const { error } = await alt.db.from("umfragen").delete().eq("id", u.id);
  if (error) { alt.meldung(alt.fehlertext(error), "fehler"); return; }
  const schritte = [];
  if (a.data && a.data.length) schritte.push(alt.rueckRein("umfragen", a.data));
  if (b.data && b.data.length) schritte.push(alt.rueckRein("umfrage_vorschlaege", b.data));
  if (c.data && c.data.length) schritte.push(alt.rueckRein("umfrage_stimmen", c.data));
  alt.merkeSchritt("Umfrage löschen", schritte);
  alt.meldung("Umfrage gelöscht.");
  neu();
}

// ---------- Anlegen und Bearbeiten ----------

let schluessel = 0;
const neuerVorschlag = (v) => ({ k: ++schluessel, id: v ? v.id : null, text: v ? v.text : "", bild_url: v ? v.bild_url : null });

function bearbeitenOeffnen(u, neu) {
  fensterOeffnen((zu) => <Bearbeiten u={u} zu={zu} neu={neu} />);
}

function Bearbeiten({ u, zu, neu }) {
  const [titel, setTitel] = useState(u ? u.titel : "");
  const [text, setText] = useState(u ? u.beschreibung || "" : "");
  const [bild, setBild] = useState(u ? u.bild_url : null);
  const [mehrfach, setMehrfach] = useState(u ? u.mehrfach : false);
  const [vorschlaege, setVorschlaege] = useState(() =>
    u && u.vorschlaege.length ? u.vorschlaege.map(neuerVorschlag) : [neuerVorschlag(), neuerVorschlag()]);
  const [laedt, setLaedt] = useState(0);
  const [fehlt, setFehlt] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const wahl = useRef(null);
  const ziel = useRef(null);   // "kopf" oder Schlüssel des Vorschlags

  const aendern = (k, fn) => setVorschlaege((l) => l.map((x) => (x.k === k ? fn(x) : x)));
  const bildDazu = async (wohin, dateien) => {
    const d = Array.from(dateien || []).find((x) => /^image\//.test(x.type));
    if (!d) return;
    setLaedt((n) => n + 1);
    try {
      const url = await bildHochladen(d);
      if (wohin === "kopf") setBild(url); else aendern(wohin, (x) => ({ ...x, bild_url: url }));
    } catch (f) { alt.meldung("Bild nicht hochgeladen: " + alt.fehlertext(f), "fehler"); }
    setLaedt((n) => n - 1);
  };
  const waehlen = (wohin) => { ziel.current = wohin; wahl.current.click(); };
  const ablage = (wohin) => ({
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); bildDazu(wohin, e.dataTransfer.files); },
    onPaste: (e) => {
      const d = Array.from((e.clipboardData && e.clipboardData.files) || []);
      if (d.some((x) => /^image\//.test(x.type))) { e.preventDefault(); bildDazu(wohin, d); }
    } });
  const schieben = (i, r) => setVorschlaege((l) => {
    const n = l.slice(); const j = i + r;
    if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const speichern = async () => {
    const t = titel.trim();
    const liste = vorschlaege.filter((v) => v.text.trim() || v.bild_url)
      .map((v, i) => ({ ...v, text: v.text.trim() || "Vorschlag " + (i + 1) }));
    if (!t) { setFehlt("titel"); document.getElementById("umf-titel").focus(); return; }
    if (liste.length < 2) { setFehlt("vorschlaege"); return; }
    // Weggenommene Vorschläge mit Stimmen: einmal nachfragen
    const weg = u ? u.vorschlaege.filter((v) => !liste.some((x) => x.id === v.id)) : [];
    const wegStimmen = u ? u.stimmen.filter((s) => weg.some((v) => v.id === s.vorschlag_id)).length : 0;
    if (wegStimmen && !(await alt.nachfragen({ titel: "Vorschläge entfernen",
      text: weg.length + (weg.length === 1 ? " Vorschlag" : " Vorschläge") + " mit " + wegStimmen
        + " Stimmen werden entfernt.", bestaetigen: "Entfernen", gefahr: true }))) return;
    setSpeichert(true);
    try {
      const kopf = { titel: t, beschreibung: text.trim() || null, bild_url: bild || null, mehrfach };
      let id = u && u.id;
      if (id) {
        const { error } = await alt.db.from("umfragen").update(kopf).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await alt.db.from("umfragen").insert(kopf).select("id");
        if (error) throw error;
        id = data[0].id;
      }
      if (weg.length) {
        const { error } = await alt.db.from("umfrage_vorschlaege").delete().in("id", weg.map((v) => v.id));
        if (error) throw error;
      }
      for (let i = 0; i < liste.length; i++) {
        const v = liste[i];
        const zeile = { umfrage_id: id, text: v.text, bild_url: v.bild_url || null, sort: i };
        const { error } = v.id
          ? await alt.db.from("umfrage_vorschlaege").update(zeile).eq("id", v.id)
          : await alt.db.from("umfrage_vorschlaege").insert(zeile);
        if (error) throw error;
      }
      if (!u) alt.merkeSchritt("Umfrage anlegen", alt.rueckWeg("umfragen", { id }));
      alt.meldung(u ? "Umfrage gespeichert." : "Umfrage ist auf der Startseite.", "gut");
      zu(); neu();
    } catch (f) {
      setSpeichert(false);
      alt.meldung(alt.fehlertext(f), "fehler");
    }
  };

  return (
    <div className="dialog umf-bearbeiten" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <h2>{u ? "Umfrage bearbeiten" : "Neue Umfrage"}</h2>
      <label className="feld"><span>Frage</span>
        <input id="umf-titel" type="text" value={titel} data-fokus="" placeholder="z. B. Wohin geht der Firmenausflug?"
          className={fehlt === "titel" ? "fehlt" : ""} onChange={(e) => { setTitel(e.target.value); setFehlt(""); }} />
      </label>
      <label className="feld"><span>Beschreibung (freiwillig)</span>
        <textarea id="umf-text" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Worum geht es, bis wann abstimmen …" />
      </label>
      <div className="umf-b__bildzeile" {...ablage("kopf")}>
        {bild
          ? <div className="umf-b__bild"><img src={bild} alt="" />
              <button type="button" className="knopf knopf--klein am-bilder__weg" title="Bild entfernen" onClick={() => setBild(null)}>✕</button></div>
          : <button type="button" className="am-bilder__dazu" id="umf-bild-kopf" onClick={() => waehlen("kopf")}>
              <span aria-hidden="true">+</span>Bild zur Umfrage</button>}
      </div>
      <label className="umf-b__haken"><input type="checkbox" id="umf-mehrfach" checked={mehrfach}
        onChange={(e) => setMehrfach(e.target.checked)} /> Mehrere Vorschläge wählbar</label>

      <h3 className="umf-b__titel">Vorschläge</h3>
      {fehlt === "vorschlaege" && <p className="feld-fehler">Bitte mindestens zwei Vorschläge eintragen.</p>}
      <div className="umf-b__liste">
        {vorschlaege.map((v, i) => (
          <div key={v.k} className="umf-b__v" data-umfbv={i} {...ablage(v.k)}>
            <div className="umf-b__vbild">
              {v.bild_url
                ? <><img src={v.bild_url} alt="" />
                    <button type="button" className="knopf knopf--klein am-bilder__weg" title="Bild entfernen"
                      onClick={() => aendern(v.k, (x) => ({ ...x, bild_url: null }))}>✕</button></>
                : <button type="button" className="umf-b__vdazu" title="Bild hinzufügen" data-umfbvbild={i}
                    onClick={() => waehlen(v.k)}>+ Bild</button>}
            </div>
            <input type="text" value={v.text} aria-label={"Vorschlag " + (i + 1)} placeholder={"Vorschlag " + (i + 1)}
              onChange={(e) => { const w = e.target.value; setFehlt(""); aendern(v.k, (x) => ({ ...x, text: w })); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && i === vorschlaege.length - 1 && v.text.trim()) {
                  e.preventDefault(); setVorschlaege((l) => [...l, neuerVorschlag()]);
                  setTimeout(() => { const f = document.querySelectorAll(".umf-b__v input"); f[f.length - 1]?.focus(); }, 30);
                }
              }} />
            <div className="umf-b__vknoepfe">
              <button type="button" className="knopf knopf--klein knopf--still" title="Nach oben" disabled={i === 0} onClick={() => schieben(i, -1)}>↑</button>
              <button type="button" className="knopf knopf--klein knopf--still" title="Nach unten" disabled={i === vorschlaege.length - 1} onClick={() => schieben(i, 1)}>↓</button>
              <button type="button" className="linkknopf linkknopf--gefahr" title="Vorschlag entfernen" data-umfbvweg={i}
                onClick={() => setVorschlaege((l) => l.filter((x) => x.k !== v.k))}>✕</button>
            </div>
          </div>))}
      </div>
      <button type="button" className="am-seite-dazu" id="umf-v-dazu"
        onClick={() => setVorschlaege((l) => [...l, neuerVorschlag()])}>+ Vorschlag</button>
      {laedt > 0 && <p className="hinweis">Bild wird hochgeladen …</p>}
      <input ref={wahl} type="file" accept="image/*" hidden id="umf-bild-datei"
        onChange={(e) => { bildDazu(ziel.current, e.target.files); e.target.value = ""; }} />
      <div className="dialog__knoepfe">
        <button type="button" className="knopf knopf--still" onClick={zu}>Abbrechen</button>
        <button type="button" className="knopf knopf--haupt" id="umf-speichern" disabled={speichert || laedt > 0} onClick={speichern}>
          {u ? "Speichern" : "Umfrage starten"}</button>
      </div>
    </div>
  );
}
