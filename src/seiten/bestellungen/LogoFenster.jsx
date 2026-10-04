// =================================================================
//  BESTELLUNGEN · Fenster „Logo“ eines Lieferanten (111.31.0)
//  Drei Möglichkeiten: automatisch das Symbol der Website, ein eigenes
//  Bild (hochladen oder Adresse einfügen) oder nur die Buchstaben.
//  Gespeichert in suppliers.logo_url: leer = automatisch, "keins" =
//  Buchstaben, sonst das Bild. Ein hochgeladenes Bild steht verkleinert
//  direkt in der Spalte, so braucht es keinen Speicherplatz-Ordner.
// =================================================================
import { useState } from "react";
import { alt } from "../../bruecke.jsx";
import { fensterOeffnen } from "../../teile/Fenster.jsx";
import { Logo, websiteSymbol } from "./teile.jsx";

export function logoOeffnen(lief, fertig) {
  fensterOeffnen((zu) => <LogoFenster lief={lief} zu={zu} fertig={fertig} />);
}

// Bild auf höchstens 160 Pixel verkleinern, als PNG, damit ein
// durchsichtiger Hintergrund erhalten bleibt
function logoVerkleinern(datei) {
  return new Promise((fertig, ablehnen) => {
    const leser = new FileReader();
    leser.onload = () => {
      const bild = new Image();
      bild.onload = () => {
        const f = Math.min(1, 160 / Math.max(bild.width, bild.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bild.width * f));
        c.height = Math.max(1, Math.round(bild.height * f));
        c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
        fertig(c.toDataURL("image/png"));
      };
      bild.onerror = () => ablehnen(new Error("Das Bild lässt sich nicht lesen."));
      bild.src = leser.result;
    };
    leser.onerror = () => ablehnen(new Error("Die Datei lässt sich nicht lesen."));
    leser.readAsDataURL(datei);
  });
}

function LogoFenster({ lief, zu, fertig }) {
  const jetzt = String(lief.logo_url || "").trim();
  const [art, setArt] = useState(!jetzt ? "auto" : jetzt === "keins" ? "keins" : "eigen");
  const [eigen, setEigen] = useState(jetzt && jetzt !== "keins" ? jetzt : "");
  const [speichert, setSpeichert] = useState(false);
  const auto = websiteSymbol(lief.website);

  const wert = art === "auto" ? null : art === "keins" ? "keins" : eigen.trim();
  const vorschau = { ...lief, logo_url: wert };

  const datei = async (e) => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    try { setEigen(await logoVerkleinern(f)); setArt("eigen"); }
    catch (f2) { alt.meldung(f2.message, "fehler"); }
  };

  const speichern = async () => {
    if (art === "eigen" && !eigen.trim()) {
      alt.meldung("Bitte ein Bild wählen oder eine Adresse einfügen.", "warn"); return;
    }
    setSpeichert(true);
    try {
      const r = await alt.aendernOhneUnbekannte("suppliers", { logo_url: wert }, "id", lief.id);
      if (r && r.weggelassen && r.weggelassen.includes("logo_url")) {
        alt.meldung("Eigene Logos brauchen noch sql/lieferant-logo.sql in der Datenbank.", "warn");
      } else {
        alt.meldung("Logo gespeichert.");
        lief.logo_url = wert;
      }
      zu();
      if (fertig) fertig();
    } catch (f) {
      alt.meldung(alt.fehlertext(f), "fehler");
    } finally { setSpeichert(false); }
  };

  return (
    <div className="dialog bs-logofenster"><h2>Logo von {lief.name}</h2>
      <div className="bs-logofenster__vorschau">
        <Logo key={art + wert} lief={vorschau} name={lief.name} />
        <span className="bs-gedaempft">So erscheint es in den Bestellungen.</span>
      </div>

      <div className="bs-logowahl" role="radiogroup" aria-label="Logo">
        <label className={"bs-logowahl__zeile" + (art === "auto" ? " aktiv" : "")}>
          <input type="radio" name="logoart" data-logoart="auto" checked={art === "auto"}
            onChange={() => setArt("auto")} disabled={!auto} />
          <span><b>Automatisch von der Website</b>
            <small>{auto ? "Das Symbol von " + new URL(auto).searchParams.get("domain") + "."
              : "Beim Lieferanten ist keine Website eingetragen."}</small></span>
        </label>
        <label className={"bs-logowahl__zeile" + (art === "eigen" ? " aktiv" : "")}>
          <input type="radio" name="logoart" data-logoart="eigen" checked={art === "eigen"}
            onChange={() => setArt("eigen")} />
          <span><b>Eigenes Bild</b>
            <small>Ein Bild hochladen oder die Adresse eines Bildes einfügen.</small></span>
        </label>
        {art === "eigen" &&
          <div className="bs-logowahl__eigen">
            <label className="knopf knopf--mini bs-knopf">Bild wählen
              <input type="file" accept="image/*" hidden data-logodatei="" onChange={datei} /></label>
            <input type="text" placeholder="oder Adresse: https://…" data-logoadresse=""
              value={eigen.startsWith("data:") ? "" : eigen}
              onChange={(e) => setEigen(e.target.value)} />
          </div>}
        <label className={"bs-logowahl__zeile" + (art === "keins" ? " aktiv" : "")}>
          <input type="radio" name="logoart" data-logoart="keins" checked={art === "keins"}
            onChange={() => setArt("keins")} />
          <span><b>Kein Logo</b><small>Nur die Anfangsbuchstaben.</small></span>
        </label>
      </div>

      <div className="dialog__knoepfe">
        <button className="knopf knopf--still" data-nein="" onClick={zu}>Abbrechen</button>
        <button className="knopf knopf--haupt" data-ja="" disabled={speichert} onClick={speichern}>Speichern</button>
      </div>
    </div>
  );
}
