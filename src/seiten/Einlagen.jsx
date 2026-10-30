// =================================================================
//  EINLAGEN GEN (created by Ecker)
//  Werkzeug-Konturscanner: Werkzeuge auf A4 fotografieren, Kontur
//  erkennen und korrigieren, daraus eine Einlage mit Taschen bauen und
//  als SVG oder STL für den 3D-Drucker speichern (Wunsch Patrick
//  30. Oktober 2026: „baue das als weiteren Reiter ein“).
//
//  Das Werkzeug ist eine eigene, fertige Seite (public/einlagen/) und
//  läuft hier unverändert in einem Rahmen. So bleibt es genau, wie Ecker
//  es gebaut und geprüft hat, und Fenster, Meldungen und Kamera darin
//  bleiben im Rahmen. Nicht für Externe.
//
//  Jede Einlage kommt von selbst in die Tabelle einlagen (sql/einlagen.sql),
//  damit sie an jedem Gerät weiter bearbeitet werden kann (Wunsch Patrick
//  30. Oktober 2026: „alle generierten Modelle dort direkt abspeichern,
//  dass es von überall bearbeitbar ist“). Dafür hängt sich die Seite an
//  laySaveLocal des Werkzeugs, das es bei jeder Änderung der Einlage
//  aufruft; layData und layApply lesen und setzen die ganze Einlage.
// =================================================================
import { useEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";

// Bedienung im Rahmen sieht die App nicht von selbst; ohne Weitergabe
// würde sie nach 5 Minuten mitten in der Arbeit abmelden
const BEDIENUNG = ["pointerdown", "keydown", "wheel", "touchstart", "input"];

// Welche Einlage auf diesem Gerät gerade offen ist; das Werkzeug selbst
// merkt sich ihren Inhalt im localStorage (konturscanner-einlage)
const AKTUELL = "hofer.einlagen.aktuell";
const WARTEN_MS = 1500;

function aktuellLesen() {
  try { return JSON.parse(localStorage.getItem(AKTUELL) || "null"); } catch { return null; }
}
function aktuellSetzen(a) {
  try { a ? localStorage.setItem(AKTUELL, JSON.stringify(a)) : localStorage.removeItem(AKTUELL); } catch { /* nur dieser Tab */ }
}

const uhr = (iso) => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, "0");
  return d.toDateString() === new Date().toDateString()
    ? p(d.getHours()) + ":" + p(d.getMinutes()) : alt.datumZeitKurz(iso);
};

export default function Einlagen() {
  const rahmen = useRef(null);
  const zustand = useRef({ w: null, gespeichert: null, still: false, takt: null, laeuft: null });
  const [stand, setStand] = useState(() => {
    const a = aktuellLesen();
    return { id: a && a.id, name: a && a.name, am: a && a.am, text: "", fehler: false };
  });
  const [liste, setListe] = useState(null);
  const listeOffen = useRef(false);
  listeOffen.current = !!liste;

  // Der Rahmen reicht bis an den unteren Rand des Bildschirms; das
  // Werkzeug rollt in sich, weil es seine Fläche nach der Fensterhöhe misst
  useEffect(() => {
    const r = rahmen.current;
    const anpassen = () => {
      const oben = r.getBoundingClientRect().top + window.scrollY;
      const unten = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--navhoehe")) || 0;
      const handy = document.body.classList.contains("mobil") || window.innerWidth <= 640;
      r.style.height = Math.max(420, window.innerHeight - oben - (handy ? unten : 0) - 8) + "px";
    };
    anpassen();
    window.addEventListener("resize", anpassen);
    // Kommt man an dieses Gerät zurück, die Fassung vom Server holen,
    // falls inzwischen an einem anderen Gerät weitergearbeitet wurde
    const sichtbar = () => { if (document.visibilityState === "visible") abgleichen(); };
    document.addEventListener("visibilitychange", sichtbar);
    return () => {
      window.removeEventListener("resize", anpassen);
      document.removeEventListener("visibilitychange", sichtbar);
      const z = zustand.current;
      if (z.takt) { clearTimeout(z.takt); speichern(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function merken(a) {
    aktuellSetzen(a && a.id ? { id: a.id, name: a.name, am: a.am } : null);
    setStand((s) => ({ ...s, id: a ? a.id : null, name: a ? a.name : null, am: a ? a.am : null }));
  }

  // Einlage ins Werkzeug setzen, ohne dass das gleich wieder gespeichert wird
  function einsetzen(daten) {
    const z = zustand.current, w = z.w;
    if (!w) return;
    z.still = true;
    try { w.layPush(); w.layApply(daten); w.layChanged(); } finally { z.still = false; }
    z.gespeichert = JSON.stringify(w.layData());
  }

  async function abgleichen() {
    const z = zustand.current, a = aktuellLesen();
    if (!z.w || !a || !a.id || z.takt) return;
    const { data, error } = await alt.db.from("einlagen").select("id, name, daten, geaendert_am").eq("id", a.id).maybeSingle();
    if (error) return;
    if (!data) { merken(null); return; } // anderswo gelöscht: die Einlage bleibt offen, wird neu gespeichert
    merken({ id: data.id, name: data.name, am: data.geaendert_am });
    if (data.geaendert_am !== a.am) einsetzen(data.daten);
    else planen(); // hier Geändertes, das vor dem Schliessen nicht mehr hinauskam

  }

  function planen() {
    const z = zustand.current;
    if (z.still) return;
    if (z.takt) clearTimeout(z.takt);
    z.takt = setTimeout(() => { z.takt = null; speichern(); }, WARTEN_MS);
  }

  async function speichern() {
    const z = zustand.current, w = z.w;
    if (!w || !w.layData) return;
    if (z.laeuft) { await z.laeuft; }
    const daten = w.layData(), text = JSON.stringify(daten);
    if (text === z.gespeichert) return;
    const a = aktuellLesen();
    // Leere Einlage ohne Werkzeuge erst speichern, wenn etwas drin ist
    if ((!a || !a.id) && !(daten.items && daten.items.length)) return;
    const name = String(daten.name || "").trim() || "einlage";
    z.laeuft = (async () => {
      let antwort = null;
      if (a && a.id) {
        antwort = await alt.db.from("einlagen").update({ name, daten }).eq("id", a.id).select("id, name, geaendert_am").maybeSingle();
      }
      if (!antwort || (!antwort.error && !antwort.data)) {
        antwort = await alt.db.from("einlagen").insert({ name, daten }).select("id, name, geaendert_am").single();
      }
      if (antwort.error) {
        const fehlt = /einlagen/.test(antwort.error.message || "") && /exist|schema cache/i.test(antwort.error.message || "");
        setStand((s) => ({ ...s, fehler: true, text: fehlt
          ? "Nicht in der App gespeichert: Die Tabelle „einlagen“ fehlt noch (sql/einlagen.sql)."
          : "Nicht in der App gespeichert: " + alt.fehlertext(antwort.error) }));
        return;
      }
      z.gespeichert = text;
      merken({ id: antwort.data.id, name: antwort.data.name, am: antwort.data.geaendert_am });
      setStand((s) => ({ ...s, fehler: false, text: "" }));
      if (listeOffen.current) listeLaden();
    })();
    try { await z.laeuft; } finally { z.laeuft = null; }
  }

  function geladen() {
    let doc, w;
    try { w = rahmen.current.contentWindow; doc = rahmen.current.contentDocument; } catch { return; }
    if (!doc || !w || typeof w.layData !== "function") return;
    const aktiv = () => { if (alt.leerlaufAktiv) alt.leerlaufAktiv(); };
    BEDIENUNG.forEach((art) => doc.addEventListener(art, aktiv, { capture: true, passive: true }));
    // „Neues Projekt“ im Werkzeug leert die Einlage und lädt neu: danach
    // ist es eine neue Einlage, die gespeicherte bleibt, wie sie war
    doc.addEventListener("click", (e) => {
      const ok = e.target.closest && e.target.closest('[data-n="ok"]');
      if (ok && /Neues Projekt/.test(ok.closest(".pickbox")?.textContent || "")) {
        const z = zustand.current;
        if (z.takt) { clearTimeout(z.takt); z.takt = null; }
        merken(null);
      }
    }, true);
    const z = zustand.current;
    z.w = w;
    const vorher = w.laySaveLocal;
    w.laySaveLocal = function () { vorher.apply(this, arguments); planen(); };
    // Name und Tiefe hängen laySaveLocal direkt an ihr Feld, also an die
    // Fassung vor dem Umhängen; darum jede Änderung im Werkzeug vergleichen
    doc.addEventListener("change", planen, true);
    z.gespeichert = null;
    const a = aktuellLesen();
    if (a && a.id) abgleichen();
    else planen(); // eine Einlage von vorher, die noch nie in der App war
  }

  async function listeLaden() {
    const { data, error } = await alt.db.from("einlagen")
      .select("id, name, daten, geaendert_am, geaendert_von").order("geaendert_am", { ascending: false }).limit(200);
    if (error) { setListe({ fehler: alt.fehlertext(error), zeilen: [] }); return; }
    const ids = [...new Set(data.map((x) => x.geaendert_von).filter(Boolean))];
    let leute = {};
    if (ids.length) {
      const p = await alt.db.from("profiles").select("id, full_name, email").in("id", ids);
      (p.data || []).forEach((x) => { leute[x.id] = alt.personName(x); });
    }
    setListe({ zeilen: data.map((x) => ({ ...x, wer: leute[x.geaendert_von] || "" })) });
  }

  async function oeffnen(x) {
    const z = zustand.current;
    if (z.takt) { clearTimeout(z.takt); z.takt = null; await speichern(); }
    einsetzen(x.daten);
    merken({ id: x.id, name: x.name, am: x.geaendert_am });
    setListe(null);
    alt.meldung("Einlage „" + x.name + "“ geöffnet.", "gut");
  }

  async function neu() {
    const z = zustand.current;
    if (!z.w) return;
    if (z.takt) { clearTimeout(z.takt); z.takt = null; await speichern(); }
    merken(null);
    // Grundkörper und Verbinder bleiben wie beim „Neuen Projekt“ des Werkzeugs
    einsetzen({ ...z.w.layData(), name: "einlage", items: [] });
    z.gespeichert = null;
    setListe(null);
  }

  async function weg(x) {
    const ok = await alt.loeschen({ tabelle: "einlagen", id: x.id, titel: "Einlage löschen?",
      text: "„" + x.name + "“ wird für alle gelöscht.", rueckText: "Einlage löschen" });
    if (!ok) return;
    if (stand.id === x.id) merken(null);
    listeLaden();
  }

  const offen = !!liste;
  return (
    <div className="einlagen">
      <div className="einlagen__leiste">
        <button type="button" className={"knopf" + (offen ? " aktiv" : "")} id="einlagen-liste"
          onClick={() => (offen ? setListe(null) : (setListe({ zeilen: null }), listeLaden()))}>
          Gespeicherte Einlagen {offen ? "▴" : "▾"}
        </button>
        <button type="button" className="knopf" id="einlagen-neu" onClick={neu}>Neue Einlage</button>
        <span className={"einlagen__stand" + (stand.fehler ? " einlagen__stand--fehler" : "")} id="einlagen-stand">
          {stand.text || (stand.id
            ? <>„{stand.name}“ in der App gespeichert{stand.am ? ", " + uhr(stand.am) : ""}</>
            : "Wird in der App gespeichert, sobald ein Werkzeug in der Einlage ist.")}
        </span>
      </div>
      {offen && (
        <div className="einlagen__liste" id="einlagen-fenster">
          {liste.fehler && <p className="einlagen__stand--fehler">{liste.fehler}</p>}
          {!liste.zeilen ? <p className="einlagen__stand">Lädt …</p>
            : !liste.zeilen.length ? <p className="einlagen__stand">Noch keine Einlage gespeichert.</p>
            : liste.zeilen.map((x) => {
              const b = (x.daten && x.daten.base) || {}, n = (x.daten && x.daten.items || []).length;
              return (
                <div key={x.id} className={"einlagen__zeile" + (x.id === stand.id ? " aktiv" : "")}>
                  <button type="button" className="einlagen__oeffnen" onClick={() => oeffnen(x)}>
                    <b>{x.name}</b>
                    <span>{n} Werkzeug{n === 1 ? "" : "e"} · {b.W} × {b.H} × {b.T} mm</span>
                    <span className="einlagen__stand">{alt.datumZeitKurz(x.geaendert_am)}{x.wer ? " · " + x.wer : ""}</span>
                  </button>
                  <button type="button" className="knopf einlagen__weg" title="Löschen" aria-label="Löschen" onClick={() => weg(x)}>✕</button>
                </div>
              );
            })}
        </div>
      )}
      <iframe ref={rahmen} className="einlagen-rahmen" title="Einlagen Gen"
        src={import.meta.env.BASE_URL + "einlagen/index.html"} onLoad={geladen}
        allow="camera" />
    </div>
  );
}
