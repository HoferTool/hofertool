// =================================================================
//  QM alternativ: das schlanke Handbuch. Oben die Landkarte des
//  Management-Systems wie Patricks Ellipse (Ebenen 01 Führung, 02 Prozesse,
//  03 QM-System, 04 Kontext; seit 1.465.0), darunter die Normkorrelation
//  Prozess × ISO-9001-Kapitel fürs Audit, dann die festen Abschnitte.
//  Prozesse: Karte je Prozessblatt (Zweck, Eigner, Input, Ablauf, Output,
//  Nachweis, Kennzahl, Risiken, mitgeltende Dokumente), Text in qma_texte.
// =================================================================
import { alt } from "../../bruecke.jsx";
import {
  ABSCHNITTE, PROZESS_GRUPPEN, PROZESS_FELDER, QM_SYSTEM, PARTEIEN_VORGABE, textSpeichern, textLoeschen,
  ebeneVon, prozessNr, prozesseSortiert, normPruefen, deckt, risikoWert, risikoTon,
} from "../../daten/qmAlt.js";
import { blattDrucken, absatz } from "./drucken.js";

export default function Handbuch({ daten, neu, gehe }) {
  const { texte } = daten;
  const prozesse = prozesseSortiert(texte);
  const stand = Object.values(texte).map((t) => t.geaendert_am).filter(Boolean).sort().pop();
  const parteien = (texte.landkarte && texte.landkarte.felder && texte.landkarte.felder.parteien) || PARTEIEN_VORGABE;
  // Ebene 04: jede Partei führt zu ihren Themen in Kontext und Risiken (Kontext-Blatt 04_01_00).
  const themen = daten.eintraege.filter((e) => e.art === "risiko");
  const parteiKnopf = (x, i, flach) => {
    const meine = themen.filter((e) => e.daten.partei === x);
    const rot = meine.some((e) => e.daten.typ !== "chance" && risikoTon(risikoWert(e.daten)) === "rot");
    return (
      <button key={x + i} className={"qma-partei" + (flach ? " qma-partei--flach" : "")} data-qmapartei={x}
        title={meine.length + " Themen im Kontext" + (rot ? ", davon mit Handlungsbedarf" : "")}
        style={flach ? undefined : aufEllipse(270 + (i * 360) / parteien.length, 42, 44)}
        onClick={() => gehe && gehe("risiko", x)}>
        {x}{meine.length ? <span className={"qma-partei__zahl" + (rot ? " qma-partei__zahl--rot" : "")}>{meine.length}</span> : null}
      </button>);
  };
  const zuAbschnitt = (k) => {
    const el = document.querySelector(`[data-qmaabschnitt='${k}']`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("qma-blitz"); setTimeout(() => el.classList.remove("qma-blitz"), 1600); }
  };
  const qmTeil = (q) => (q.abschnitt ? zuAbschnitt(q.abschnitt) : gehe && gehe(q.reiter));

  return (<>
    <section className="karte" id="qma-prozesse">
      <div className="karte__kopf">
        <h2>Hofer + Co Management-System <span className="klein">ISO 4.4</span></h2>
        <div className="qm-bew-knoepfe">
          <button className="knopf" id="qma-hb-drucken" onClick={() => handbuchDrucken(texte, prozesse)}>Drucken / PDF</button>
          <button className="knopf" id="qma-parteien" onClick={() => parteienDialog(texte, parteien, neu)}>Parteien ändern</button>
          <button className="knopf knopf--haupt" id="qma-neu-prozess" onClick={() => prozessDialog(null, prozesse, neu)}>+ Prozess</button>
        </div>
      </div>
      <p className="hinweis">Prozess antippen öffnet sein Prozessblatt. Ebene 03 führt zum passenden Reiter.
        {stand ? " Zuletzt geändert " + alt.datumZeitKurz(stand) + "." : ""}</p>
      <div className="qma-legende" aria-label="Ebenen von innen nach aussen">
        {[["1", "01", "Führung"], ["2", "02", "Prozesse"], ["3", "03", "QM-System"], ["4", "04", "Hofer + Co im Kontext"]].map(([k, nr, text]) => (
          <span key={k} className="qma-legende__punkt"><i className={"qma-legende__farbe qma-legende__farbe--" + k} /><b>{nr}</b> {text}</span>))}
      </div>
      <Ellipse prozesse={prozesse} parteien={parteien} oeffnen={(p) => prozessDialog(p, prozesse, neu)} qmTeil={qmTeil}
        partei={parteiKnopf} />
      <Baender prozesse={prozesse} parteien={parteien} oeffnen={(p) => prozessDialog(p, prozesse, neu)} qmTeil={qmTeil}
        partei={parteiKnopf} />
    </section>

    <Organigramm texte={texte} neu={neu} />

    <NormMatrix texte={texte} eintraege={daten.eintraege} prozesse={prozesse} oeffnen={(p) => prozessDialog(p, prozesse, neu)} />

    <section className="karte" id="qma-abschnitte">
      <div className="karte__kopf"><h2>Handbuch</h2></div>
      <p className="hinweis">Kurz und ehrlich. Antippen zum Bearbeiten. Ist ein Abschnitt leer, zeigt das Cockpit ihn als fehlend.</p>
      {ABSCHNITTE.map((a) => {
        const t = texte[a.k];
        const leer = !(t && String(t.inhalt || "").trim());
        return (
          <div key={a.k} className={"qma-abschnitt" + (leer ? " qma-abschnitt--leer" : "")} data-qmaabschnitt={a.k}
            onClick={() => abschnittDialog(a, t, neu)}>
            <div className="qma-abschnitt__kopf"><h3>{a.titel}</h3><span className="klein">ISO {a.norm}</span></div>
            {leer ? <p className="klein">{a.hilfe} <b>Noch leer.</b></p> : <div className="qm-umbruch">{t.inhalt}</div>}
          </div>);
      })}
    </section>
  </>);
}

// ---------- Landkarte als Ellipse (am Computer und iPad quer) ----------
// Lage in Prozent der Fläche; Punkte auf einer Ellipse um die Mitte.
const aufEllipse = (grad, rx, ry) => {
  const w = (grad * Math.PI) / 180;
  return { left: 50 + rx * Math.cos(w) + "%", top: 50 + ry * Math.sin(w) + "%" };
};
// Ebene 03 wie im Bild: Bewertung oben links, Risiko oben rechts, Ziele
// rechts unten, Audits unten, Dokumente links unten.
const QM_WINKEL = [236, 304, 34, 90, 146];
const FUEHRUNG_ORT = [[39.5, 43], [60.5, 43], [39.5, 57], [60.5, 57]];

function Ellipse({ prozesse, parteien, oeffnen, qmTeil, partei }) {
  const kern = prozesse.filter((p) => ebeneVon(p) === "kern");
  const fuehrung = prozesse.filter((p) => ebeneVon(p) === "fuehrung");
  // Prozesse im Uhrzeigersinn, Start links oben wie Verkauf im Bild.
  const schritt = 360 / Math.max(kern.length, 1);
  return (
    <div className="qma-ellipse" id="qma-landkarte" aria-label="Landkarte des Management-Systems">
      <div className="qma-ring qma-ring--4" /><div className="qma-ring qma-ring--3" />
      <div className="qma-ring qma-ring--2" /><div className="qma-ring qma-ring--1" />
      {/* Wellen aus dem Kern wie bei der Anmeldung (seit 1.476.0) */}
      <span className="qma-wellen" aria-hidden="true"><i /><i /><i /></span>
      {/* Ablauf der Prozesse im Uhrzeigersinn: gestrichelte Bahn durch die
          Kärtchen und kleine Pfeile dazwischen (seit 1.475.0) */}
      <svg className="qma-bahn" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="50" rx="26.5" ry="21" vectorEffect="non-scaling-stroke" />
      </svg>
      {kern.length > 1 && kern.map((p, i) => {
        const grad = 196 + (i + 0.5) * schritt;
        const t = (grad * Math.PI) / 180;
        // Richtung der Bahn in Bildpunkten (Fläche 1.55 : 1)
        const winkel = (Math.atan2((21 / 1.55) * Math.cos(t), -26.5 * Math.sin(t)) * 180) / Math.PI;
        return <span key={"pf" + i} className="qma-pfeil" aria-hidden="true"
          style={{ ...aufEllipse(grad, 26.5, 21), transform: `translate(-50%, -50%) rotate(${winkel}deg)` }} />;
      })}
      {parteien.map((x, i) => partei(x, i, false))}
      {QM_SYSTEM.map((q, i) => (
        <button key={q.text} className="qma-qmteil" data-qmateil={q.reiter} title={"ISO " + q.norm}
          style={aufEllipse(QM_WINKEL[i], 37.5, 33.5)} onClick={() => qmTeil(q)}>{q.text}</button>))}
      {kern.map((p, i) => (
        <button key={p.schluessel} className="qma-knoten" data-qmaprozess={p.schluessel}
          title={p.norm ? "ISO " + p.norm : ""} style={{ ...aufEllipse(196 + i * schritt, 26.5, 21), animationDelay: 200 + i * 45 + "ms" }} onClick={() => oeffnen(p)}>
          {prozessNr(p) ? <span className="qma-knoten__nr">{prozessNr(p)}</span> : null}{p.titel}</button>))}
      {/* Weisses Logo im Kern wie auf der Anmeldung (seit 1.476.0) */}
      <img className="qma-logo" src="./logo-weiss.svg" alt="Hofer + Co" />
      <div className="qma-fuehrung-mitte" style={{ left: "50%", top: "54.5%" }}>01 · Führung</div>
      <div className="qma-ebene qma-ebene--4" style={aufEllipse(249, 41.5, 42.5)}>04 · Kontext</div>
      <div className="qma-ebene qma-ebene--3" style={{ left: "50%", top: "16.4%" }}>03 · QM-System</div>
      {fuehrung.slice(0, 4).map((p, i) => (
        <button key={p.schluessel} className="qma-knoten qma-knoten--f" data-qmaprozess={p.schluessel}
          title={p.norm ? "ISO " + p.norm : ""} style={{ left: FUEHRUNG_ORT[i][0] + "%", top: FUEHRUNG_ORT[i][1] + "%", animationDelay: 60 + i * 45 + "ms" }}
          onClick={() => oeffnen(p)}>
          {prozessNr(p) ? <span className="qma-knoten__nr">{prozessNr(p)}</span> : null}{p.titel}</button>))}
      {fuehrung.length > 4 && <span className="qma-mehr klein">+ {fuehrung.length - 4} weitere unten</span>}
    </div>);
}

// ---------- Landkarte als Bänder (Handy, iPad hoch) ----------
function Baender({ prozesse, parteien, oeffnen, qmTeil, partei }) {
  const knopf = (p) => (
    <button key={p.schluessel} className="qma-prozess" data-qmaprozessband={p.schluessel} onClick={() => oeffnen(p)}>
      <b>{prozessNr(p) ? prozessNr(p) + " " : ""}{p.titel}</b>
      {p.norm ? <span className="klein">ISO {p.norm}</span> : null}
      {p.felder && p.felder.verantwortlich ? <span className="klein">{p.felder.verantwortlich}</span> : null}
    </button>);
  return (
    <div className="qma-landkarte">
      <img className="qma-landkarte__logo" src="./logo-weiss.svg" alt="Hofer + Co" />
      {PROZESS_GRUPPEN.map(([g, text]) => (
        <div key={g} className={"qma-band qma-band--" + g} data-qmagruppe={g}>
          <div className="qma-band__titel">{text}</div>
          <div className="qma-band__reihe">
            {prozesse.filter((p) => ebeneVon(p) === g).map(knopf)}
            {!prozesse.some((p) => ebeneVon(p) === g) && <span className="klein">noch keiner</span>}
          </div>
        </div>))}
      <div className="qma-band qma-band--qm">
        <div className="qma-band__titel">Ebene 03 QM-System</div>
        <div className="qma-band__reihe">
          {QM_SYSTEM.map((q) => <button key={q.text} className="qma-prozess" onClick={() => qmTeil(q)}><b>{q.text}</b><span className="klein">ISO {q.norm}</span></button>)}
        </div>
      </div>
      <div className="qma-band qma-band--kontext">
        <div className="qma-band__titel">Ebene 04 Hofer + Co im Kontext <span className="klein">ISO 4.2</span></div>
        <div className="qma-band__reihe">{parteien.map((x, i) => partei(x, i, true))}</div>
      </div>
    </div>);
}

// ---------- Normkorrelation ----------
function NormMatrix({ texte, eintraege, prozesse, oeffnen }) {
  const zeilen = normPruefen(texte, eintraege);
  const qmFuer = (norm) => QM_SYSTEM.filter((q) => deckt(q.norm, norm)).map((q) => q.text);
  return (
    <section className="karte" id="qma-normmatrix">
      <div className="karte__kopf"><h2>Normkorrelation Prozess × ISO 9001</h2></div>
      <p className="hinweis">● = Prozess erfüllt das Kapitel laut seinem Normbezug (im Prozessblatt änderbar). Rot = kein Prozess und
        kein Teil des QM-Systems deckt es ab. Spalten = Prozess-Nr. wie in der Landkarte, antippen öffnet das Prozessblatt.</p>
      <div className="qm-tabelle-huelle"><table className="tabelle qma-matrix-norm">
        <thead><tr><th>Kapitel</th><th>Thema</th>
          {prozesse.map((p) => (
            <th key={p.schluessel} className="qma-matrix-norm__kopf" title={p.titel}>
              <button className="qma-spaltenkopf" onClick={() => oeffnen(p)}>{prozessNr(p) || p.titel}</button></th>))}
          <th>QM-System / Handbuch</th></tr></thead>
        <tbody>
          {zeilen.map((z) => {
            const qm = qmFuer(z.norm);
            // Ohne Prozess zählt auch ein Teil des QM-Systems oder ein Handbuch-Abschnitt.
            const leer = z.stand !== "na" && !z.prozesse.length && !qm.length && !/Handbuch/.test(z.wo);
            return (
              <tr key={z.norm} data-qmamatrix={z.norm} className={leer ? "qma-matrix-norm--leer" : ""}>
                <td className="qm-nowrap">{z.norm}</td><td>{z.titel}</td>
                {prozesse.map((p) => <td key={p.schluessel} className="qma-zelle-punkt">
                  {z.stand !== "na" && deckt(p.norm, z.norm) ? "●" : ""}</td>)}
                <td className="klein">{z.stand === "na" ? "nicht anwendbar" : (qm.length ? qm.join(", ") : (z.prozesse.length ? "" : z.wo))}</td>
              </tr>);
          })}
        </tbody>
      </table></div>
    </section>);
}

async function abschnittDialog(a, t, neu) {
  const w = await alt.dialogFelder({
    titel: a.titel + " (ISO " + a.norm + ")",
    felder: [{ name: "inhalt", label: a.hilfe, typ: "textarea", zeilen: 14, wert: (t && t.inhalt) || "" }],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  try {
    await textSpeichern(a.k, { gruppe: "handbuch", titel: a.titel, norm: a.norm, inhalt: w.inhalt.trim() || null }, "Ändern: " + a.titel);
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

async function parteienDialog(texte, parteien, neu) {
  const w = await alt.dialogFelder({
    titel: "Ebene 04: Hofer + Co im Kontext",
    felder: [{ name: "liste", label: "Interessierte Parteien, eine je Zeile (ISO 4.2). Was sie erwarten, steht im Handbuch unter „Interessierte Parteien“.",
      typ: "textarea", zeilen: 10, wert: parteien.join("\n") }],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  const liste = w.liste.split("\n").map((x) => x.trim()).filter(Boolean);
  try {
    await textSpeichern("landkarte", { gruppe: "einstellung", titel: "Landkarte", felder: { ...((texte.landkarte && texte.landkarte.felder) || {}), parteien: liste } }, "Ändern: Parteien");
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}

async function prozessDialog(p, prozesse, neu) {
  const f = (p && p.felder) || {};
  const w = await alt.dialogFelder({
    titel: p ? "Prozess: " + (prozessNr(p) ? prozessNr(p) + " " : "") + p.titel : "Neuer Prozess",
    felder: [
      { name: "nr", label: "Nr.", wert: f.nr || "", platzhalter: "02.04" },
      { name: "titel", label: "Name", pflicht: true, wert: (p && p.titel) || "" },
      { name: "gruppe", label: "Ebene", auswahl: PROZESS_GRUPPEN, wert: ebeneVon(p) },
      { name: "norm", label: "Normbezug ISO 9001 (Kapitel, mit · oder Komma getrennt)", wert: (p && p.norm) || "", platzhalter: "8.5.1 · 8.6" },
      ...PROZESS_FELDER.map((x) => ({ name: x.k, label: x.text, typ: x.lang ? "textarea" : "text", zeilen: x.lang ? 6 : undefined, wert: f[x.k] || "" })),
      { name: "sort", label: "Reihenfolge", typ: "number", wert: (p && p.sort) || (Math.max(0, ...prozesse.map((x) => x.sort || 0)) + 10) },
      ...(p ? [{ name: "weg", label: "Diesen Prozess löschen", typ: "haken", wert: false }] : []),
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  try {
    if (p && w.weg) {
      const ok = await alt.nachfragen({ titel: "Prozess löschen", text: "„" + p.titel + "“ wird gelöscht.", bestaetigen: "Löschen", gefahr: true });
      if (!ok) return;
      await textLoeschen(p.schluessel, "Löschen: " + p.titel);
      alt.meldung("Gelöscht."); neu(); return;
    }
    const schluessel = p ? p.schluessel : "prozess:" + Date.now().toString(36);
    // Felder, die das Fenster nicht kennt (etwa die Quelle), bleiben erhalten.
    const felder = { ...f, nr: String(w.nr || "").trim() || null };
    for (const x of PROZESS_FELDER) felder[x.k] = String(w[x.k] || "").trim() || null;
    await textSpeichern(schluessel, { gruppe: w.gruppe, titel: w.titel.trim(), norm: w.norm.trim() || null, felder, sort: Number(w.sort) || 0 },
      (p ? "Ändern: " : "Neu: ") + w.titel.trim());
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f2) { alt.meldung(alt.fehlertext(f2), "fehler"); }
}

function handbuchDrucken(texte, prozesse) {
  const e = alt.esc;
  let h = `<h1>Managementhandbuch Hofer + Co</h1><div class="kopf">ISO 9001 · Stand ${e(alt.kurzDatum(new Date()))} · aus dem HoferTool</div>`;
  for (const a of ABSCHNITTE) {
    h += `<h2>${e(a.titel)} <span class="norm">ISO ${e(a.norm)}</span></h2>${absatz(texte[a.k] && texte[a.k].inhalt)}`;
  }
  // Normkorrelation als Tabelle: je Kapitel die Prozesse, die es abdecken.
  h += `<h2>Normkorrelation <span class="norm">ISO 4.4</span></h2><table><tr><th>Kapitel</th><th>Thema</th><th>Prozesse</th><th>QM-System</th></tr>`;
  for (const z of normPruefen(texte, [])) {
    const qm = QM_SYSTEM.filter((q) => deckt(q.norm, z.norm)).map((q) => q.text).join(", ");
    h += `<tr><td>${e(z.norm)}</td><td>${e(z.titel)}</td><td>${z.norm === "8.3" ? "nicht anwendbar" : e(z.prozesse.map((p) => (prozessNr(p) ? prozessNr(p) + " " : "") + p.titel).join(", ") || "–")}</td><td>${e(qm || "–")}</td></tr>`;
  }
  h += `</table>`;
  h += `<h2>Prozesse <span class="norm">ISO 4.4</span></h2>`;
  for (const [g, gt] of PROZESS_GRUPPEN) {
    const liste = prozesse.filter((p) => ebeneVon(p) === g);
    if (!liste.length) continue;
    h += `<h3>${e(gt)}</h3>`;
    for (const p of liste) {
      h += `<table><tr><th colspan="2">${e((prozessNr(p) ? prozessNr(p) + " " : "") + p.titel)}${p.norm ? ` <span class="norm">ISO ${e(p.norm)}</span>` : ""}</th></tr>`;
      for (const x of PROZESS_FELDER) h += `<tr><td style="width:28%">${e(x.text)}</td><td class="text">${e((p.felder || {})[x.k] || "–")}</td></tr>`;
      h += `</table>`;
    }
  }
  blattDrucken("Managementhandbuch", h);
}

// ---------- Organigramm (ISO 5.3, seit 1.479.0) ----------
// Nach Patricks „Organisation Hofer + Co 2026“: die Bereiche rund um das Logo,
// im selben Blau wie die Landkarte. Namen und Kontakte stehen nur in der
// Datenbank (qma_texte „organigramm“, felder.personen), nie im Repository.
const ORG_SPALTEN = ["bereich", "name", "rolle", "mail", "tel", "stv"];
const orgZeile = (x) => ORG_SPALTEN.map((k) => x[k] || "").join(" | ");
const orgAusText = (text) => text.split("\n").map((z) => z.trim()).filter(Boolean).map((z) => {
  const t = z.split("|").map((x) => x.trim());
  const o = {}; ORG_SPALTEN.forEach((k, i) => { if (t[i]) o[k] = t[i]; });
  return o;
}).filter((o) => o.name || o.bereich);

function Organigramm({ texte, neu }) {
  const t = texte.organigramm;
  const personen = (t && t.felder && t.felder.personen) || [];
  const stand = t && t.felder && t.felder.stand;
  const n = personen.length;
  const karte = (x, i, rund) => {
    const gl = /GL/.test(x.rolle || "");
    const w = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const ort = rund ? { left: 50 + 37 * Math.cos(w) + "%", top: 50 + 36 * Math.sin(w) + "%", animationDelay: 80 + i * 60 + "ms" } : undefined;
    return (
      <div key={i} className={"qma-org__karte" + (gl ? " qma-org__karte--gl" : "")} style={ort}>
        <div className="qma-org__bereich">{x.bereich}</div>
        <div className="qma-org__name">{x.name}</div>
        {x.rolle ? <div className="qma-org__rolle">{x.rolle}</div> : null}
        {x.mail ? <a className="qma-org__kontakt" href={"mailto:" + x.mail} onClick={(e) => e.stopPropagation()}>{x.mail}</a> : null}
        {x.tel ? <a className="qma-org__kontakt" href={"tel:" + x.tel.replace(/\s/g, "")} onClick={(e) => e.stopPropagation()}>{x.tel}</a> : null}
        {x.stv ? <div className="qma-org__stv">Stv. {x.stv.replace(/^Stv\.?\s*/i, "")}</div> : null}
      </div>);
  };
  return (
    <section className="karte" id="qma-organigramm">
      <div className="karte__kopf">
        <h2>Organigramm <span className="klein">ISO 5.3</span></h2>
        <div className="qm-bew-knoepfe">
          <button className="knopf" id="qma-org-aendern" onClick={() => organigrammDialog(texte, personen, stand, neu)}>Organigramm ändern</button>
        </div>
      </div>
      {n ? <>
        <div className="qma-org" aria-label="Organigramm">
          <span className="qma-wellen"><i /><i /><i /></span>
          <img className="qma-org__logo" src="./logo-weiss.svg" alt="Hofer + Co" />
          {personen.map((x, i) => karte(x, i, true))}
          {stand ? <div className="qma-org__stand">Stand {stand}</div> : null}
        </div>
        <div className="qma-org-liste">
          <img className="qma-landkarte__logo" src="./logo-weiss.svg" alt="Hofer + Co" />
          {personen.map((x, i) => karte(x, i, false))}
          {stand ? <div className="qma-org__stand">Stand {stand}</div> : null}
        </div>
      </> : <p className="klein">Noch kein Organigramm erfasst. „Organigramm ändern“ antippen.</p>}
    </section>);
}

async function organigrammDialog(texte, personen, stand, neu) {
  const w = await alt.dialogFelder({
    titel: "Organigramm",
    felder: [
      { name: "stand", label: "Stand", wert: stand || "" },
      { name: "liste", label: "Eine Person je Zeile: Bereich | Name | Rolle | Mail | Telefon | Stellvertretung. Wer „GL“ in der Rolle hat, ist hervorgehoben.",
        typ: "textarea", zeilen: 12, wert: personen.map(orgZeile).join("\n") },
    ],
    bestaetigen: "Speichern",
  });
  if (!w) return;
  try {
    const alte = (texte.organigramm && texte.organigramm.felder) || {};
    await textSpeichern("organigramm", { gruppe: "einstellung", titel: "Organigramm", norm: "5.3",
      felder: { ...alte, stand: w.stand.trim() || null, personen: orgAusText(w.liste) } }, "Ändern: Organigramm");
    alt.meldung("Gespeichert.", "gut"); neu();
  } catch (f) { alt.meldung(alt.fehlertext(f), "fehler"); }
}
