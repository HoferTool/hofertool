// =================================================================
//  BESTELLUNGEN
//  Ganz in React. Die Reiter liegen in src/seiten/bestellungen/.
//  Einige Fenster (Status, neue Position, Artikel und Lieferant
//  bearbeiten) und die Bestellmail sind noch im alten Programm.
//
//  Das alte Programm ruft nach jeder Änderung seiteBestellungen(b)
//  auf. Das kommt hier als „auffrischen“ an und lädt den Reiter
//  still neu, ohne die Seite neu aufzubauen.
// =================================================================
import { useReducer, useState } from "react";
import { alt } from "../bruecke.jsx";
import { useSeitenSuche } from "../teile/seitenSuche.js";
import { Reiter, Uebergang } from "../teile/Reiter.jsx";
import Offen from "./bestellungen/Offen.jsx";
import Historie from "./bestellungen/Historie.jsx";
import Artikel from "./bestellungen/Artikel.jsx";
import Spezialwerkzeuge from "./bestellungen/Spezialwerkzeuge.jsx";
import Bezeichnungen from "./bestellungen/Bezeichnungen.jsx";
import Lieferanten from "./bestellungen/Lieferanten.jsx";
import { istSpezial } from "./bestellungen/Offen.jsx";

export const REITER = [
  ["offen", "Offen"], ["bestellt", "Bestellt"], ["historie", "Historie"],
  ["artikel", "Artikel"], ["spezial", "Spezialwerkzeuge"], ["bezeichnungen", "Bezeichnungen"], ["lieferanten", "Lieferanten"],
];

export default function Bestellungen({ auffrischen, behaelter }) {
  // Der gewählte Reiter steht in best.ansicht im alten Programm, weil
  // auch die Suche und die Taste Zurück ihn setzen.
  const best = alt.best;
  const [, zeichnen] = useReducer((x) => x + 1, 0);
  const waehlen = (wert) => { best.ansicht = wert; zeichnen(); };
  // Nach einem Treffer der Suche den Reiter frisch aufbauen, damit er
  // den gesetzten Suchtext übernimmt, auch wenn er schon offen war
  const [sprung, setSprung] = useState(0);

  // Strg + K sucht Positionen, Artikel und Lieferanten (seit 1.169.0);
  // ein Treffer öffnet den passenden Reiter, gefiltert auf ihn
  useSeitenSuche({
    name: "Bestellungen", platzhalter: "Artikel, Nummer, Lieferant …",
    eintraege: bestellSuchListe,
    springen: (x) => {
      const spezial = !!x.spezial;
      const unter = x.art === "position" ? (x.status === "offen" ? "offen" : "bestellt") : "artikel";
      if (x.art === "lieferant") { best.ansicht = "lieferanten"; best.liefSuche = x.titel; }
      else if (spezial) {
        best.ansicht = "spezial"; best.spezialAnsicht = unter;
        best[unter === "artikel" ? "spezialArtikelSuche" : "spezialOffenSuche"] = x.suchwort;
      } else {
        best.ansicht = unter;
        best[unter === "artikel" ? "artikelSuche" : "offenSuche"] = x.suchwort;
      }
      setSprung((n) => n + 1);
    },
  });

  return (
    <>
      {/* Die Spezialwerkzeuge sind ein eigener Bereich (seit 1.142.0) */}
      <h1 className="seitentitel">{best.ansicht === "spezial" ? "Spezialwerkzeuge" : "Bestellungen"}</h1>
      <Reiter reiter={REITER} aktiv={best.ansicht} waehlen={waehlen} merkmal="best" seite="bestellungen" />
      {!alt.darfSchreiben() &&
        <div className="nurlesen">Du kannst hier alles ansehen, aber nichts ändern.</div>}
      <Uebergang key={best.ansicht + "|" + sprung}>
        <div id="best-inhalt">
          <Inhalt ansicht={best.ansicht} auffrischen={auffrischen} behaelter={behaelter} />
        </div>
      </Uebergang>
    </>
  );
}

function Inhalt({ ansicht, ...weiter }) {
  if (ansicht === "historie") return <Historie {...weiter} />;
  if (ansicht === "artikel") return <Artikel {...weiter} />;
  if (ansicht === "spezial") return <Spezialwerkzeuge {...weiter} />;
  if (ansicht === "bezeichnungen") return <Bezeichnungen {...weiter} />;
  if (ansicht === "lieferanten") return <Lieferanten {...weiter} />;
  return <Offen bereich={ansicht === "bestellt" ? "bestellt" : "offen"} {...weiter} />;
}

// Alles, was Strg + K auf dieser Seite findet. Fehlt ein Teil, gehen die anderen.
async function bestellSuchListe() {
  const lieferant = (z) => ((z.articles && z.articles.suppliers) || z.suppliers || {}).name || "";
  const [positionen, artikel, lieferanten] = await Promise.all([
    alt.ladeBestellungen(true).catch(() => []),
    alt.zeitlimit(alt.db.from("artikel_uebersicht").select("*").order("article_number").limit(5000), 12000, "Artikel")
      .then((r) => r.data || [], () => []),
    alt.zeitlimit(alt.db.from("suppliers").select("id, name").order("name"), 8000, "Lieferanten")
      .then((r) => r.data || [], () => []),
  ]);
  const STATUS = { offen: "Offen", bestellt: "Bestellt", teilweise_geliefert: "Teilweise geliefert" };
  return [
    ...positionen.map((z) => {
      const a = z.articles || {};
      return { art: "position", gruppe: "Positionen", zeichen: "◧", spezial: istSpezial(z), status: z.status,
        titel: [a.article_number, a.name].filter(Boolean).join(" · ") || "Position",
        zeile: [STATUS[z.status] || z.status, z.quantity && alt.zahlText(z.quantity) + " " + (a.unit || ""), lieferant(z),
          z.ziel_anzeige || z.ziel_text].filter(Boolean).join(" · "),
        such: [a.description, z.note, alt.personName(z.profiles, "")].filter(Boolean).join(" "),
        suchwort: a.article_number || a.name || "" };
    }),
    ...artikel.map((a) => ({ art: "artikel", gruppe: a.spezial ? "Spezialwerkzeuge" : "Artikel", zeichen: "◧",
      spezial: !!a.spezial, titel: [a.article_number, a.name].filter(Boolean).join(" · "),
      zeile: a.supplier_name || "", suchwort: a.article_number || a.name || "" })),
    ...lieferanten.map((l) => ({ art: "lieferant", gruppe: "Lieferanten", zeichen: "◈", titel: l.name })),
  ];
}
