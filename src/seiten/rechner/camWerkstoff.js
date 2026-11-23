// =================================================================
//  HOFERCAM: Material und Schnittwerte (seit 1.729.0)
//  Wunsch Patrick 23. November 2026: „im Programmkopf das Material
//  angeben … wenn dann Bearbeitungen erstellt werden, sollen die
//  Schnittgeschwindigkeiten und Drehzahlen als Vorschlag schon
//  eingetragen sein, anstelle der jetzigen Standards“, „gehe davon aus,
//  dass immer Hartmetallwerkzeuge eingesetzt werden“.
//  Die Richtwerte (Hartmetall) gelten auch für die Optimierung.
// =================================================================

import { alt } from "../../bruecke.jsx";

// Richtwerte Hartmetall: Vc [m/min] Drehen, Bohren, Fräsen; fB Vorschub
// Bohren je Umdrehung als Anteil vom Bohrer-Ø
export const WERKSTOFFE = [
  { key: "stahl", name: "Automatenstahl / Stahl", dreh: [150, 260], bohr: [60, 110], fraes: [90, 160], fB: [0.012, 0.025] },
  { key: "v2a", name: "Rostfrei V2A (1.4301, 1.4305)", dreh: [120, 200], bohr: [40, 70], fraes: [60, 110], fB: [0.01, 0.02], rostfrei: true },
  { key: "v4a", name: "Rostfrei V4A (1.4404, 1.4571)", dreh: [100, 180], bohr: [35, 60], fraes: [50, 100], fB: [0.008, 0.018], rostfrei: true },
  { key: "chrom", name: "Chromstahl (1.4104, 1.4542)", dreh: [100, 180], bohr: [35, 65], fraes: [50, 100], fB: [0.008, 0.018], rostfrei: true },
  { key: "messing", name: "Messing", dreh: [200, 400], bohr: [80, 160], fraes: [150, 300], fB: [0.015, 0.035] },
  { key: "neusilber", name: "Neusilber", dreh: [120, 250], bohr: [50, 100], fraes: [80, 180], fB: [0.012, 0.03] },
  { key: "alu", name: "Aluminium", dreh: [250, 600], bohr: [100, 250], fraes: [200, 500], fB: [0.015, 0.04] },
  { key: "titan", name: "Titan", dreh: [40, 90], bohr: [25, 45], fraes: [30, 60], fB: [0.008, 0.015], zaeh: true },
  { key: "kunststoff", name: "Kunststoff", dreh: [150, 400], bohr: [80, 200], fraes: [150, 400], fB: [0.02, 0.05] },
];
const GRUPPE_ZU = { messing_ohne_pb: "messing" };
// Kurzwörter, die die Erkennung der App allein nicht kennt
const KURZ = [[/\bv2a\b/, "v2a"], [/\bv4a\b/, "v4a"], [/chromstahl/, "chrom"], [/\bstahl\b|\bets?g\b/, "stahl"],
  [/messing/, "messing"], [/neusilber/, "neusilber"], [/\balu/, "alu"], [/titan/, "titan"], [/kunststoff/, "kunststoff"]];

// Werkstoffgruppe aus einer Bezeichnung (X14CrMoS17 rd 024, 1.4305, V2A, Messing …)
export function werkstoffAusBez(bez, erkennen = alt.werkstoffErkennen) {
  const t = String(bez || "").trim();
  if (!t) return null;
  const genau = WERKSTOFFE.find((x) => x.name.toLowerCase() === t.toLowerCase());
  if (genau) return genau;
  const g = erkennen ? erkennen(t) : null;
  const key = g ? GRUPPE_ZU[g.key] || g.key : (KURZ.find(([re]) => re.test(t.toLowerCase())) || [])[1];
  return WERKSTOFFE.find((x) => x.key === key) || null;
}

// Werkzeug steht still, das Teil dreht (Drehen)
const DREHEN = new Set(["dreh", "k3dr", "k2"]);
// Querangetriebene: eher Fräsen
const QUER = new Set(["seite", "k3s"]);
// Angetriebene Werkzeuge (Drehzahl des Werkzeugs, eigene Höchstdrehzahl)
const ANGETRIEBEN = new Set(["seite", "quer", "querGegen", "k2a", "k1f", "k3f", "k3s"]);
// Für Bohren und Fräsen ist das Werkzeug beim Anlegen noch nicht bekannt
export const WZ_D_ANGENOMMEN = 3;
const SPINDEL_MAX = 10000, ANTRIEB_MAX = 8000;

const mitte = (r) => Math.round((r[0] + r[1]) / 2 / 10) * 10;
const auf50 = (n) => Math.max(50, Math.round(n / 50) * 50);

// Vorschlag für eine neue Bearbeitung: nur die Felder S bzw. vc
export function schnittVorschlag(nb, w) {
  const m = werkstoffAusBez(w && w.material);
  if (!m) return null;
  const art = nb.art;
  const dreh = DREHEN.has(art);
  const vc = mitte(dreh ? m.dreh : QUER.has(art) ? m.fraes : m.bohr);
  const max = ANGETRIEBEN.has(art) ? ANTRIEB_MAX : SPINDEL_MAX;
  if (nb.sArt === "vc") return { vc: String(vc) };
  if (dreh) {
    const a = Number(String(w.A ?? "").replace(",", "."));
    if (!(a > 0)) return { sArt: "vc", vc: String(vc) };
    return { S: String(Math.min(max, auf50(vc * 1000 / (Math.PI * a)))) };
  }
  return { S: String(Math.min(max, auf50(vc * 1000 / (Math.PI * WZ_D_ANGENOMMEN)))) };
}
