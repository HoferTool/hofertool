// =================================================================
//  HOFERCAM: Einstellungen je Maschinentyp
//  Seit 1.441.0 (Wunsch Patrick 6. November 2026: „pro Maschinentyp eine
//  Konfigurationsoberfläche, bei welcher ich selber Änderungen vornehmen
//  kann“, „ich will alles, was du gemacht hast, ändern können“). Zuerst
//  nur Star SB-20RG, weitere Typen später als Kopie.
//
//  Alles, was HOFERCAM schreibt, steht hier als Vorlage in Textform:
//  Kopf und Ende beider Kanäle und je Bearbeitungsart die Zeilen in
//  Kanal 1 und Kanal 2. Die Vorgaben geben genau das aus, was vorher fest
//  im Code stand (Prüfstand hofer_cam_typ.py vergleicht beides).
//
//  Schreibweise einer Vorlage, eine Programmzeile je Zeile:
//    {NAME}        Platzhalter, die App setzt den Wert ein
//    [hd] …        Zeile nur, wenn die Bedingung gilt; [!hd] nur, wenn nicht
//    {CODE}        allein auf der Zeile: der NC-Code der Bearbeitung
//    /{CODE}       ebenso, jede Zeile mit „/“ davor (Marken ohne)
//    {PAARE}       allein auf der Zeile: Markenpaare aus dem NC-Code mit
//                  dem Code aus dem Feld „Kanal 1 zwischen …“ dazwischen
//    {PAARE2}      ebenso mit dem Feld „Kanal 2 zwischen …“
//  Leere Zeilen fallen weg.
//
//  Gespeichert werden nur die Abweichungen von der Vorgabe, in
//  app_config.hofercam_typen = { "<typ>": { vorlagen, plaetze, vorgaben,
//  bloecke, marken } }; Vorgaben, die später im Code dazukommen, gelten so
//  von selbst.
// =================================================================

export const TYP = "star-sb20rg";
export const TYP_NAME = "Star SB-20RG";
// Seit 1.663.0 (Wunsch Patrick 20. November 2026: „Können wir jetzt die
// nächste machen. Star SW20“): zweiter Typ mit drei Kanälen. Kopf und Ende
// nach Patricks O1272 / O2272 / O3272 (10844-0049), Bearbeitungen folgen
// Schritt für Schritt nach seinen Beispielen.
export const TYP_SW20 = "star-sw20";
// kanaele: Anzahl Kanäle; nummern: O-Nummer je Kanal = Nr. + Wert
export const TYPEN = [
  { id: TYP, name: TYP_NAME, kanaele: 2, nummern: [0, 1000] },
  { id: TYP_SW20, name: "Star SW-20", kanaele: 3, nummern: [1000, 2000, 3000] },
];
export const typInfo = (id) => TYPEN.find((x) => x.id === id) || TYPEN[0];
export const CONFIG_SCHLUESSEL = "hofercam_typen";

// ---------- Vorgaben (Stand 1.440.0, Patricks O0458 / O1458) ----------
const V = {
  k1kopf: `%
O{NR}{NAME}
G40G97M9G18
G170({DATUM_KUERZEL})
(GRUNDVARIABLEN DEFINIEREN)
G266A{A}W{W}S{S}X{X}Z{Z}F{F}B{B}
(A = #531 = MATERIALDURCHMESSER)
(W = #530 = TEILELAENGE)
(S = #529 = ABSTECHDREHZAHL)
(X = #524 = ABSTECHENDPOSITION)
(Z = #525 = Z-ACHSE STARTPOSITION 200MM.MAX)
(F = #522 = VORSCHUB ABSTECHEN)
(B = #528 = BREITE DES ABSTECHSTAHLS)
#510=[#531+1.](#510 = WEG-/ANFAHRPOSITION)
G300
G125
N1
G18
G170
G40G97M9
G99M3S500
M11
G4U0.1
G125
G0Z{SCHLICHT}T0(SCHLICHTZUGABE)
M10
G4U0.1
G1W-0.2F0.5
M5
N12
M200
M20
M25
M3S1000
G0X[#531+4.]Z-{ABZ}
M27
M1
(Ende Kopf)`,
  k1ende: `(Start Ende)
T100(ABSTECHEN)
M25
M1891(HD AUS)
M1882D5
N100
M800
G97M3S#529
G00G99X#510Z[#530+#528]T1
G0W{PLAN}(ZUGABE PLANDREHEN HINTEN)
M82
M40
G96
G50S4000
M3S80
G1X#524F#522
M1894
M1892
M41
G4
M83
M3S500
M80(CONTROLLIERT STANGENENDE SIGNAL VOM LADER)
/M98P7000
M81(ENDE M80)
M99P1(GEHEN AUF PROGRAMMANFANG POS N1)
%`,
  k2kopf: `%
O{NR2}{NAME}
G130
G97G99G40
G18
M5
G28W0
T0
T2000
M200
M20
M5(SPINDEL STOP)
(Ende Kopf)`,
  k2ende: `(Start Ende)
M75
/T2900(AUSWERFEN)
/M84
/M4S200
/G0Z38.
/G4U1.
/M11
/G4U2.
/G28W0.
M1884D2
M76
T0
M1
T2000(ABGREIFEN)
M11
M14
M5
G900J50
T2000
M800
M1894
M1883D3(HD EIN)
M82
G131B{SCHNABEL}
M15
G0Z{ANNAEHERN}(EILGANG {ANNAEHERN_MM}MM VOR STUCK)
M68
G1G98Z{UEBER}F5000.({UEBER_MM}MM UBER DEM STUCK)
M69
M1893(HD AUS)
M10
G4U0.1
G31
M40
M41
M83
M68
M69
G28W0
G0T0
G99
M99
%`,
  "dreh.k1": `T{PLATZ}{BEZ_K}
[hd] M1881D{HD}
[g50] G50S{G50}
{G96}{DREH}S{S}T{T}
{VOR}
G0X[#531+1.]Z{ANZ}
{CODE}
G1X[#531+0.2]{WINKEL}F{WEGF}
G0X30.
[hdaus] M1891
[g96] G97
G99
T0
M1`,
  "dreh.k2": `{PAARE2}`,
  "front.k1": `T{PLATZ}{BEZ_K}
[hd] M1882D{HD}
[g50] G50S{G50}
{G96}{DREH}S{S}T{T}
{VOR}
G0Z{ANZ}
{CODE}
[hdaus] M1892
G0Z{WEGZ}
[g96] G97
G99
T0
M1`,
  "front.k2": `{PAARE2}`,
  "frontGegen.k1": `T{PLATZ}({BEZ_GEGEN})
[hd] M1882D{HD}
T{T}
{M1}
{PAARE}
{M2}
[hdaus] M1892
T0
M1`,
  "frontGegen.k2": `M75
/T2000({BEZ_GEGEN})
{M1}
[g50] /G50S{G50}
/{G96}{DREH}S{S}
/{VOR}
/G0Z{ANZ}
/{CODE}
/G0Z{WEGZ}
[g96] /G97
/G99
{M2}
G0G28W0.
T0
M1`,
  "seite.k1": `T{PLATZ}{BEZ_K}
[hd] M1883D{HD}
G0T{T}
{DREH}S{S}
G0X[#531+1.]Z{ANZ}
{VOR}
M8
M7
G0
G28H0.
G1Y0.C0.F1.
{CODE}
G0X30.
G0Y0.
[hdaus] M1893
T0
[m38] M38
M9
G99
T0
M1`,
  "seite.k2": `{PAARE2}`,
  "quer.k1": `T{PLATZ}{BEZ_K}
[hd] M1883D{HD}
{DREH}S{S}T{T2}
{VOR}
G0Z{ANZ}
{CODE}
[hdaus] M1893
G0Z{WEGZ}
[m38] M38
G99
T0
M1`,
  "quer.k2": `{PAARE2}`,
  "querGegen.k1": `T{PLATZ}({BEZ_GEGEN})
[hd] M1883D{HD}
{M1}
G0X{X}{Y}T{T2}
{M2}
{PAARE}
{M3}
[hdaus] M1893
T0
M1`,
  "querGegen.k2": `M75
/T2000({BEZ_GEGEN})
/{VOR}
/M8
/M7
/G0
/G28H0.
/M6
{M1}
{M2}
/{DREH}S{S}
/G0Z{ANZ}
/{CODE}
/G1Z{ANZ}F2000
/G0Z20.
[m38] /M38
/G99
G0G28W0.
T0
M1
{M3}`,
  "k2.k1": `{PAARE}`,
  "k2.k2": `M75
[hd] /M1884D{HD}
/T{PLATZ}{BEZ_K}
/G23
[g50] /G50S{G50}
/{G96}{DREH}S{S}T{T2V}
/{VOR}
/G0X{VORX}
/G0Z{VORZ}
/G50X{NX}Z{NZ}
/G1Z-1.F0.5
/G1X-11.
/{CODE}
/G1Z{NZ}F0.5
/G1X{NX}
/G50Z{VORZ}X{VORX}
/G0Z20.0
/G0X0.0
[g96] /G97
/G99
G28W0.0
M76
[hdaus] M1894
G22
T0
M1
[m5] M5`,
  "k2a.k1": `{PAARE}`,
  "k2a.k2": `M75
[hd] /M1884D{HD}
/T{PLATZ}{BEZ_K}
/{DREH}S{S}
/{VOR}
/M8
/M7
/G0
/G28H0.
/M6
/{CODE}
G28W0.
T0
/M7
[m38] /M38
/M9
/G99
M76
[hdaus] M1894
M1`,
};

// ---------- Star SW-20: Kopf und Ende (Patricks O1272 / O2272 / O3272) ----------
// Kanal 1 Hauptspindel, Kanal 2 Gegenspindel, Kanal 3 Rückseitenblock.
// Abgrenzung von Claude (Patrick gefragt): der Block mit M131 / M133, in
// dem Kanal 3 an der Hauptspindel arbeitet, gehört zu den Bearbeitungen.
const V_SW20 = {
  // Seit 1.665.0: Frontbohrapparat Kanal 1 (T500 / T600), nach Patricks
  // T600 (BOHREN D4.5) vom 20. November 2026: Korrektur zweistellig (T06),
  // X und Y positionieren, Z vor, Nullpunkt mit G50Z setzen, nach dem Code
  // zurück auf den Nullpunkt und G50Z zurücksetzen, M01, G28U0.
  "front.k1": `T{PLATZ}{BEZ_K}
[hd] M1882D{HD}
{G96}{DREH}S{S}T{TK}
G0X{X}{Y}
G0Z{ANZ}
G50Z{NZ}
{CODE}
G1Z{NZ}F2.0
G50Z{ANZ}
T0
M01
G28U0.`,
  "front.k2": `{PAARE2}`,
  // Seit 1.665.0: Drehwerkzeug Kanal 1 (T100–T400), nach Patricks T200
  // (DREHEN AUSSEN) vom 20. November 2026: Drehzahl und Korrektur zuerst,
  // dann Hochdruck, Anfahren, G50 und G96; am Ende G28U0. vor M01. Mit
  // G96 steht vorne die Start-Drehzahl, S in der G96-Zeile ist Vc.
  "dreh.k1": `T{PLATZ}{BEZ_K}
{DREH}S{SSTART}T{TK}
[hd] M1881D{HD}
G0X[#531+1.]Z{ANZ}
[g50] G50S{G50}
[g96] G96S{S}
{CODE}
[hdaus] M1891
[g96] G97
T0
G28U0.
M01`,
  "dreh.k2": `{PAARE2}`,
  k1kopf: `%
O{NR}{NAME}(N)
({DATUM_KUERZEL})
G266A{A}W{W}S{S}X{X}Z{Z}F{F}B{B}
(A=)(MATERIAL DIA.)
(W=)(PART LENGTH)
(S=)(MAIN SPINDLE RPM ABST.)
(X=)(END OF CUTOFF POS.)
(Z=)(B0 POS.)
(F=)(CUTOFF FEED)
(B=)(CUTOFF INSERT WIDTH)
M1881D1
G125
G300(ABSTECH-U-PROG.)
G97
M1891
G40M9
G99M3S1409
M11
G4U0.2
G0Z{SCHLICHT}T0(PLANDREH-ZUGABE)
M10
G4U0.20
T100
G0W-12.50
M27
G0Z-0.50
/M25
N12
M200P123
M20
G99
M25`,
  k1ende: `M420P13
M800P123
T100(ABSTECHEN)
M3S{S}T01
M25
G0X[#531+1]Z[#530+#528]
G4U0.20
G1W0.10F0.10
M1881D2(HD EIN)
M82
M40
M1898
G1X{X}F0.12
M1891(HD AUS)
M41
M83
M80
/G0X22.00W-0.5
/G0W1.80
/M98P7000
M81
M99
%`,
  k2kopf: `%
O{NR2}{NAME}
({DATUM_KUERZEL})
G130
G40G99M9
M5
G0T0
G28W0
T2000
M200P123
M20
G10L52
N1620P2R350
G11
M84`,
  k2ende: `N12
M75
/T2900(AUSWERFEN)
/M5
/G130
/G98
/G1Z55.00F5000
/M11
/G4U2.0
/M14
/G4U2.0
/M15
/M84
/M27
M76
G28W0.
G99
M1896
G10L52
N1620P2R50
G11
G900J777
M1011
M4S200
T2000
(M131 1)
(M133 1)
(M131 2)
(M420P13)
N19
M800P123
M101
M1012
M4S2200
G0Z20.00
M82
G131B{SCHNABEL}(*SCHNABELZANGE*)
M11
M1011D5
G0Z{ANNAEHERN}
M68
(M14)
G98G1Z{UEBER}F1000.00
G99M10
M15
M1012
M69
G133
M40
M41
G4
G4
M68
G0W-20.0
M69
M83
G130
(M27)
G28W0M5
N777
M99
%`,
  // Seit 1.667.0 Kanal 2 der SW-20 nach Patricks T2100 (Drehen), T2700
  // (Bohren stehend) und T2600 (angetrieben) vom 20. November 2026
  "k2.k2": `M75
/T{PLATZ}{BEZ_K}
/{DREH}S{SSTART}T{TK}
/G0X{VORX}Z{ANZ}
[hd] /M188{HDN}D{HD}
[g50] /G50S{G50}
[g96] /G96S{S}
/{CODE}
[g96] /G97
M76
G28W0.
[hdaus] M189{HDN}
T0
M01`,
  "k2b.k1": `{PAARE}`,
  "k2b.k2": `M75
/T{PLATZ}{BEZ_K}
/{DREH}S{S}T{TK}
/G0Z{ANZ}
/{CODE}
M76
M01
G28W0.
T0`,
  "k2a.k2": `M75
/T{PLATZ}{BEZ_K}
/{DREH}S{S}T{TK}
/M7
/M8
[c] /G0C{C}
/{CODE}
G0T0
G28W0.
M01
M76
[m38] M58
G28W0.
T0`,
  // Seit 1.666.0 Kanal 3: Frontbohrapparat T1300–T1500 nach Patricks
  // T1300 aus O3272 (20. November 2026); Kanal 1 und 2 bekommen nichts
  "k3f.k1": ``,
  "k3f.k2": ``,
  "k3f.k3": `T{PLATZ}{BEZ_K}
[hd] M1882D{HD}
{DREH}S{S}T{TK}
G0Z{ANZ}
G0X{X}{Y}
M5
M7
M8
[c] G0C{C}
M6
G1Z{ZUZ}F3.0
{CODE}
M1892(HD AUS)
G80
G4U0.02
G1Z{WEGZ}F10.0
G28U0.
M7
M9
[m38] M38
G0T0
M01`,
  // Feste Werkzeuge T1600–T1900 nach Patricks T1600 (20. November 2026);
  // Hochdruck mit Ausgang M188x / M189x (T1600 M1883, T1700 M1884 …)
  "k3d.k1": ``,
  "k3d.k2": ``,
  "k3d.k3": `T{PLATZ}{BEZ_K}
{VOR}
{DREH}S{S}T{TK}
[hd] M188{HDN}D{HD}
G0X{VORX}
G0Z{ANZ}
G50Z{NZ}
[y] G0{Y}
{CODE}
[hdaus] M189{HDN}(HD AUS)
M01
G28U0.
G0T0`,
  k3kopf: `%
O{NR3}{NAME}(N)
({DATUM_KUERZEL})
T1100
G28U0
G40G99
G140
M200P123
M20`,
  k3ende: `M420P13
M800P123
(M82)
(M40)
(M41)
(M83)
T1100
M99
%`,
};
const VORGABEN_SW20 = { A: "", W: "", S: "", X: "", Z: "", F: "", B: "", schlicht: "", plan: "", annaehern: "", ueber: "" };

// Bearbeitungsarten in der Reihenfolge der Knöpfe; `art` und `spindel`
// am Block bestimmen die Vorlage (Gegenspindel hat eigene)
export const ARTEN = [
  { id: "dreh", text: "Drehwerkzeug", plaetze: "dreh" },
  { id: "front", text: "Frontwerkzeug, Hauptspindel", plaetze: "front" },
  { id: "frontGegen", text: "Frontwerkzeug, Gegenspindel", plaetze: "front" },
  { id: "seite", text: "Querangetrieben", plaetze: "seite" },
  { id: "quer", text: "Frontangetrieben, Hauptspindel", plaetze: "quer" },
  { id: "querGegen", text: "Frontangetrieben, Gegenspindel", plaetze: "quer" },
  { id: "k2", text: "Kanal 2 stehende Werkzeuge", plaetze: "k2" },
  { id: "k2a", text: "Kanal 2 angetrieben", plaetze: "k2" },
  { id: "k2b", text: "Kanal 2 Bohren stehend", plaetze: "k2b" },
  // Seit 1.666.0 nur SW-20: Kanal 3, Frontbohrapparat T1300–T1500
  { id: "k3f", text: "Kanal 3 Frontbohrapparat", plaetze: "k3f" },
  { id: "k3d", text: "Kanal 3 feste Werkzeuge", plaetze: "k3d" },
];
export const vorlageArt = (b) => ((b.art === "front" || b.art === "quer") && b.spindel === "gegen" ? b.art + "Gegen" : b.art || "dreh");

// Werkzeugplätze je Knopf; Kanal 2 stehend und angetrieben teilen sich die Plätze
export const PLATZ_GRUPPEN = [
  { id: "dreh", text: "Drehwerkzeuge Kanal 1" },
  { id: "front", text: "Frontwerkzeuge fest" },
  { id: "seite", text: "Querangetrieben" },
  { id: "quer", text: "Frontangetrieben" },
  { id: "k2", text: "Kanal 2" },
  { id: "k2a", text: "Kanal 2 angetrieben" },
  { id: "k2b", text: "Kanal 2 Bohren stehend" },
  { id: "k3f", text: "Kanal 3 Frontbohrapparat" },
  { id: "k3d", text: "Kanal 3 feste Werkzeuge" },
];
const PLAETZE = {
  dreh: ["100", "200", "300", "400", "500", "600"],
  front: ["1100", "1200", "1300", "1400"],
  seite: ["3100", "3200", "3300", "3400"],
  quer: ["3421", "3422", "3423"],
  k2: ["2100", "2200", "2300", "2400"],
};

// Vorgaben der Felder oben (Programm) und je neue Bearbeitung
const VORGABEN = { A: "17", W: "15.125", S: "3000", X: "-0.8", Z: "167.85", F: "0.03", B: "1.5",
  schlicht: "-0.1", plan: "0.20", annaehern: "10", ueber: "4" };
// SW-20 (seit 1.665.0): Plätze nach dem Handbuch Kapitel 8, Kanal 1
// T100–T400 Drehwerkzeuge, T500 / T600 mit Frontbohrapparat, T700 quer;
// Kanal 2 T2100–T2800. Nur die Frontbearbeitung hat schon eine Vorlage,
// die übrigen werden beim Einlesen „wie eingelesen“.
const PLAETZE_SW20 = { ...PLAETZE, dreh: ["100", "200", "300", "400"], front: ["500", "600"], seite: ["700"], quer: [],
  k2: ["2100", "2200", "2300", "2400"], k2a: ["2500", "2600"], k2b: ["2700", "2800"], k3f: ["1300", "1400", "1500"],
  k3d: ["1600", "1700", "1800", "1900"] };
const BLOECKE_SW20 = { dreh: { hd: "3", dreh: "3", S: "2500", sArt: "vc", vc: "350", g96: "1", g50: "5000", anZ: "-0.5" },
  // Kanal 3 Frontbohrapparat (1.666.0) nach Patricks T1300
  // Kanal 2 (1.667.0) nach Patricks T2100, T2600 und T2700
  k2: { hd: "1", hdN: "6", dreh: "3", sArt: "S", S: "3000", vorX: "19.00", anZ: "-1.00" },
  k2a: { dreh: "56", S: "2500", C: "" },
  k2b: { dreh: "3", S: "2000", anZ: "-0.50" },
  k3f: { hd: "", dreh: "36", S: "5000", X: "", Y: "0.0", anZ: "-2.0", C: "0.1", zuZ: "", wegZ: "1.00" },
  // Kanal 3 feste Werkzeuge (1.666.0) nach Patricks T1600
  k3d: { hd: "5", hdN: "3", dreh: "3", S: "4500", vor: "99", vorX: "0.00", anZ: "25.00", nZ: "-0.50", Y: "0.00" },
  front: { hd: "3", dreh: "3", S: "3000", X: "0.0", Y: "0.0", anZ: "5.00", nZ: "-0.50" } };
const BLOECKE = {
  dreh: { hd: "4", dreh: "3", S: "3000", anZ: "0", wegF: "0.05", wegA: "45" },
  front: { hd: "4", dreh: "3", S: "2500", anZ: "5.0", wegZ: "0" },
  seite: { hd: "3", dreh: "36", S: "6000", anZ: "0" },
  quer: { hd: "3", dreh: "36", S: "6000", X: "", anZ: "5.0", wegZ: "0" },
  k2: { hd: "3", dreh: "4", S: "2500", vorX: "-45.4", vorZ: "61.40", nX: "-10", nZ: "-0.5" },
  k2a: { hd: "", dreh: "37", S: "6000", vor: "98" },
};
// Beschriftung der Felder je Bearbeitung im Fenster
export const BLOCK_FELDER = {
  hd: "Hochdruck-Stufe (leer = kein)", dreh: "Drehrichtung (Zahl hinter M)", S: "Drehzahl S",
  anZ: "Anfahren Z", wegZ: "Zurück Z", wegF: "Wegfahren F", wegA: "Wegfahren Winkel",
  sArt: "Eingabe S oder vc", vc: "Schnittgeschwindigkeit Vc", g96: "G96 (1 = an)", g50: "Max. S (G50)",
  X: "Position X", Y: "Position Y (leer = ohne)", vorX: "Vorpositionieren X", vorZ: "Vorpositionieren Z", nX: "G50 X", nZ: "G50 Z",
  vor: "Vorschub 98 oder 99 (leer = von selbst)",
  C: "Position C (leer = ohne)", hdN: "Hochdruck-Ausgang (M188…)", zuZ: "Anfahren Z im Vorschub",
};
const MARKEN = { ab: 300, schritt: 10 };

export function vorgabeTyp(id = TYP) {
  const info = typInfo(id), sw = info.id === TYP_SW20;
  return {
    id: info.id, name: info.name, kanaele: info.kanaele, nummern: [...info.nummern],
    // Bearbeitungsarten dieses Typs (SW-20: noch keine, folgen nach Patrick)
    // Seit 1.665.0 beim SW-20 die Frontbearbeitung Kanal 1
    arten: sw ? ["dreh", "front", "k2", "k2b", "k2a", "k3f", "k3d"] : ARTEN.map((a) => a.id).filter((a) => !a.startsWith("k3") && a !== "k2b"),
    vorlagen: sw ? { ...V, ...V_SW20 } : { ...V },
    plaetze: Object.fromEntries(Object.entries(sw ? PLAETZE_SW20 : PLAETZE).map(([k, l]) => [k, [...l]])),
    vorgaben: sw ? { ...VORGABEN_SW20 } : { ...VORGABEN },
    bloecke: Object.fromEntries(Object.entries(sw ? { ...BLOECKE, ...BLOECKE_SW20 } : BLOECKE).map(([k, o]) => [k, { ...o }])),
    marken: { ...MARKEN },
    // SW-20: Kopf und Ende haben kein {PLAN}, das Feld oben bleibt dort weg
    // Frontbearbeitung SW-20: ohne G99/G98 und ohne „Zurück Z“ (Patricks T600)
    felder: { aus: sw ? { kopf: ["plan"], dreh: ["vor", "wegA", "wegF"], front: ["vor"], k2: ["vor"], k2a: ["vor", "hd"], k2b: ["vor", "hd"], k3f: ["vor"] } : {}, eigene: [] },
  };
}

// Gespeicherte Abweichungen über die Vorgabe legen
export function typMischen(ab = {}, id = TYP) {
  const t = vorgabeTyp(id);
  for (const [k, txt] of Object.entries(ab.vorlagen || {})) if (k in t.vorlagen && typeof txt === "string") t.vorlagen[k] = txt;
  for (const [k, l] of Object.entries(ab.plaetze || {})) if (k in t.plaetze && Array.isArray(l) && l.length) t.plaetze[k] = l.map(String);
  for (const [k, w] of Object.entries(ab.vorgaben || {})) if (k in t.vorgaben) t.vorgaben[k] = String(w);
  for (const [a, o] of Object.entries(ab.bloecke || {})) if (t.bloecke[a]) for (const [k, w] of Object.entries(o || {})) if (k in t.bloecke[a]) t.bloecke[a][k] = String(w);
  const ms = ab.marken || {};
  if (Number(ms.ab) >= 200 && Number(ms.ab) <= 999) t.marken.ab = Number(ms.ab);
  if (Number(ms.schritt) >= 1 && Number(ms.schritt) <= 100) t.marken.schritt = Number(ms.schritt);
  const fe = ab.felder || {};
  for (const [o, l] of Object.entries(fe.aus || {})) if (Array.isArray(l) && l.length) t.felder.aus[o] = l.map(String);
  if (Array.isArray(fe.eigene)) t.felder.eigene = fe.eigene.filter((f) => f && f.id && FELD_ORTE.some(([o]) => o === f.ort))
    .map((f) => ({ id: String(f.id), ort: f.ort, text: String(f.text || ""), ph: String(f.ph || "").toUpperCase(),
      art: FELD_ARTEN.some(([a]) => a === f.art) ? f.art : "zahl", vorgabe: String(f.vorgabe ?? ""),
      liste: Array.isArray(f.liste) ? f.liste.map(String) : [], aus: !!f.aus }));
  return t;
}

// Nur die Abweichungen von der Vorgabe, zum Speichern
export function typAbweichungen(t) {
  const v = vorgabeTyp(t.id), ab = {};
  const vorl = Object.fromEntries(Object.entries(t.vorlagen).filter(([k, x]) => x !== v.vorlagen[k]));
  if (Object.keys(vorl).length) ab.vorlagen = vorl;
  const pl = Object.fromEntries(Object.entries(t.plaetze).filter(([k, l]) => l.join(",") !== v.plaetze[k].join(",")));
  if (Object.keys(pl).length) ab.plaetze = pl;
  const vg = Object.fromEntries(Object.entries(t.vorgaben).filter(([k, x]) => x !== v.vorgaben[k]));
  if (Object.keys(vg).length) ab.vorgaben = vg;
  const bl = {};
  for (const [a, o] of Object.entries(t.bloecke)) {
    const d = Object.fromEntries(Object.entries(o).filter(([k, x]) => x !== v.bloecke[a][k]));
    if (Object.keys(d).length) bl[a] = d;
  }
  if (Object.keys(bl).length) ab.bloecke = bl;
  if (t.marken.ab !== v.marken.ab || t.marken.schritt !== v.marken.schritt) ab.marken = { ...t.marken };
  const aus = Object.fromEntries(Object.entries(t.felder.aus).filter(([, l]) => l.length));
  if (Object.keys(aus).length || t.felder.eigene.length) ab.felder = { aus, eigene: t.felder.eigene };
  return ab;
}

// Der Typ, mit dem gerade gerechnet wird (eins für alle, solange es nur
// die SB-20RG gibt); `typSetzen` beim Laden und nach dem Speichern
let aktiv = vorgabeTyp();
const typHoerer = new Set();
export const typ = () => aktiv;
export function typSetzen(t) { aktiv = t; typHoerer.forEach((f) => f()); }
export function typBeobachten(f) { typHoerer.add(f); return () => typHoerer.delete(f); }
// Für die Vorschau im Fenster: mit einem ungespeicherten Stand rechnen,
// ohne jemanden zu benachrichtigen
export function mitTyp(t, f) { const vorher = aktiv; aktiv = t; try { return f(); } finally { aktiv = vorher; } }
// Seit 1.663.0 mehrere Typen: die gespeicherten Abweichungen aller Typen
// (app_config.hofercam_typen) und welcher gerade gilt. HOFERCAM wählt den
// Typ des offenen Programms (w.typ) mit typWaehlen.
let gespeichertAlle = {};
export function typenGeladen(alle) { gespeichertAlle = alle || {}; typSetzen(typMischen(gespeichertAlle[aktiv.id] || {}, aktiv.id)); }
export function typGespeichertSetzen(id, ab) { if (ab && Object.keys(ab).length) gespeichertAlle[id] = ab; else delete gespeichertAlle[id]; }
export const typVon = (w) => typInfo(w && w.typ).id;
export function typWaehlen(id, still) {
  id = typInfo(id).id;
  if (aktiv.id === id) return;
  aktiv = typMischen(gespeichertAlle[id] || {}, id);
  if (!still) typHoerer.forEach((f) => f());
}

// ---------- Vorlage ausfüllen ----------
// `werte`: Platzhalter → Text, `bed`: Bedingung → wahr/falsch,
// `listen`: CODE / PAARE / PAARE2 → Zeilen, `schraeg`: setzt „/“ davor
const BED_RE = /^\s*\[(!?)([a-z0-9]+)\]\s?/i;
export function vorlageFuellen(text, { werte = {}, bed = {}, listen = {}, schraeg = (z) => z } = {}) {
  const aus = [];
  for (const roh of String(text || "").split(/\r?\n/)) {
    let z = roh, m, weg = false;
    while ((m = z.match(BED_RE))) {
      const ok = !!bed[m[2].toLowerCase()];
      if (m[1] ? ok : !ok) weg = true;
      z = z.slice(m[0].length);
    }
    if (weg) continue;
    const t = z.trim();
    const lm = t.match(/^(\/?)\{(CODE|PAARE|PAARE2)\}$/);
    if (lm) { const l = listen[lm[2]] || []; aus.push(...(lm[1] ? l.map(schraeg) : l)); continue; }
    const fertig = t.replace(/\{([A-Z0-9_]+)\}/g, (a, n) => (n in werte ? String(werte[n]) : a));
    if (fertig !== "") aus.push(fertig);
  }
  return aus;
}

// Platzhalter und Bedingungen zum Nachschlagen im Fenster
export const PLATZHALTER_KOPF = [
  ["NR", "Programm-Nr. Kanal 1, vierstellig (0001)"], ["NR2", "Programm-Nr. Kanal 2 (Nr. + 1000)"],
  ["NAME", "HOCO Nr. in Klammern, leer ohne HOCO Nr."], ["HOCO", "HOCO Nr. ohne Klammern"],
  ["DATUM_KUERZEL", "Datum und Kürzel mit Leerzeichen"], ["DATUM", "Datum"], ["KUERZEL", "Kürzel"],
  ["A", "A Material-Ø"], ["W", "W Teilelänge"], ["S", "S Abstechdrehzahl"], ["X", "X Abstechende"],
  ["Z", "Z Start"], ["F", "F Vorschub Abstechen"], ["B", "B Stahlbreite"],
  ["SCHLICHT", "Schlichtzugabe Z"], ["PLAN", "Zugabe Plan hinten W"],
  ["ABZ", "Versatz Abstecher minus B (10.), normal 0."],
  ["ANNAEHERN", "Annähern Z mit Minus (-10.)"], ["ANNAEHERN_MM", "Annähern ohne Minus und Punkt (10)"],
  ["SCHNABEL", "B Schnabelzange Gegenspindel (G131B…), leer 0."],
  ["UEBER", "Über das Teil Z"], ["UEBER_MM", "Über das Teil ohne Minus und Punkt"],
];
export const PLATZHALTER_BLOCK = [
  ["PLATZ", "Werkzeugplatz (1400)"], ["T", "Platz durch 100 (14), Korrektur"], ["TK", "Korrektur zweistellig (06 bei T600)"], ["SSTART", "Drehzahl vor G96 (sonst wie S)"],
  ["T2", "letzte zwei Ziffern des Platzes (21 bei 3421)"], ["T2V", "erste zwei Ziffern (21 bei 2100)"],
  ["BEZ", "Bezeichnung"], ["BEZ_K", "Bezeichnung in Klammern, leer ohne"],
  ["BEZ_GEGEN", "Bezeichnung mit „MIT GEGENSPINDEL“"], ["HD", "Hochdruck-Stufe"],
  ["DREH", "Drehrichtung mit M (M3, M4, M36, M37)"], ["S", "Drehzahl (bei Vc gerechnet, bei G96 Vc)"],
  ["G96", "„G96“, wenn G96 gewählt, sonst leer"], ["G50", "Drehzahlbegrenzung bei G96 (U/min)"], ["VOR", "G98 oder G99"],
  ["ANZ", "Anfahren Z"], ["WEGZ", "Zurück Z"], ["WEGF", "Wegfahren F"], ["WINKEL", "„,A45.“ oder leer"],
  ["X", "Position X"], ["Y", "„Y…“ oder leer"], ["VORX", "Vorpositionieren X"], ["VORZ", "Vorpositionieren Z"],
  ["NX", "G50 X"], ["NZ", "G50 Z"], ["C", "Position C"], ["HDN", "Hochdruck-Ausgang (3 bei M1883)"], ["ZUZ", "Anfahren Z im Vorschub (G1Z…F3.0)"], ["M1", "Marke Start"], ["M2", "Marke 2 bzw. Ende"], ["M3", "Marke Ende (Frontangetrieben)"],
  ["CODE", "NC-Code der Bearbeitung (allein auf der Zeile, /{CODE} mit „/“)"],
  ["PAARE", "Markenpaare mit Code aus „Kanal 1 zwischen …“"], ["PAARE2", "Markenpaare mit Code aus „Kanal 2 zwischen …“"],
];
export const BEDINGUNGEN = [
  ["hd", "Hochdruck gewählt"], ["hdaus", "Hochdruck gewählt und „HD am Ende aus“ an"],
  ["g96", "G96 gewählt"], ["g50", "G96 mit Drehzahlbegrenzung"], ["m38", "„M38 am Ende“ an"], ["m5", "„M5 am Ende“ an"], ["y", "Position Y eingetragen"], ["c", "Position C eingetragen"],
];

// Unbekannte Platzhalter und Bedingungen einer Vorlage, für den Hinweis
export function vorlageFehler(text, block, extra = { namen: [], bed: [] }) {
  const namen = new Set([...(block ? PLATZHALTER_BLOCK : PLATZHALTER_KOPF).map(([n]) => n), ...extra.namen]);
  const bed = new Set([...BEDINGUNGEN.map(([n]) => n), ...extra.bed]);
  const f = new Set();
  for (const z of String(text || "").split(/\r?\n/)) {
    let r = z, m;
    while ((m = r.match(BED_RE))) { if (!bed.has(m[2].toLowerCase())) f.add("[" + m[2] + "]"); r = r.slice(m[0].length); }
    for (const p of r.matchAll(/\{([^}]*)\}/g)) if (!namen.has(p[1])) f.add("{" + p[1] + "}");
  }
  return [...f];
}

// =================================================================
//  Eingabefelder je Maschinentyp
//  Seit 1.450.0 (Wunsch Patrick 7. November 2026: „eigene Eingabefelder
//  hinzufügen und bestehende deaktivieren oder löschen“, „Auswahlliste als
//  Feldart ist gut“): `felder.aus[ort]` = Namen eingebauter Felder, die im
//  Formular fehlen; ihr Platzhalter nimmt dann fest die Vorgabe.
//  `felder.eigene` = [{ id, ort, text, ph, art, vorgabe, liste, aus }]:
//  ort "kopf" (oben bei den Programmangaben, der Platzhalter gilt auch in
//  den Bearbeitungen) oder eine Bearbeitungsart; art zahl / text / haken /
//  liste. {PH} setzt den Wert ein, [ph] gilt, wenn ausgefüllt bzw. an.
//  Eingebaute Felder lassen sich nur deaktivieren, weil die App mit
//  manchen rechnet (A für die Drehzahl aus Vc).
//  Die Werte stehen im Programm unter w.eigen bzw. b.eigen, je Platzhalter.
// =================================================================
// wie zahl() in hofercam.js (dort eingebunden, hier ohne Kreis)
const zahl = (text) => {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return t.includes(".") ? t : t + ".";
};
export const FELD_ORTE = [
  ["kopf", "Oben (Programm)"], ["dreh", "Drehwerkzeug"], ["front", "Frontwerkzeug"], ["seite", "Querangetrieben"],
  ["quer", "Frontangetrieben"], ["k2", "Kanal 2 stehende Werkzeuge"], ["k2a", "Kanal 2 angetrieben"],
];
export const FELD_ARTEN = [["zahl", "Zahl"], ["text", "Text"], ["haken", "Häkchen"], ["liste", "Auswahlliste"]];
// Eingebaute Felder, die sich deaktivieren lassen: die mit einer Vorgabe
export const eingebauteFelder = (t, ort) => (ort === "kopf" ? Object.keys(t.vorgaben) : Object.keys(t.bloecke[ort] || {}));
export const feldAus = (ort, name, t = aktiv) => (t.felder.aus[ort] || []).includes(name);
export const eigeneFelder = (ort, t = aktiv) => t.felder.eigene.filter((f) => f.ort === ort && !f.aus);
const eigeneFuer = (ort, t) => t.felder.eigene.filter((f) => f.ort === ort);

// Wert eines eigenen Felds: eingetippt, sonst die Vorgabe
export const eigenWert = (f, o) => { const e = (o && o.eigen) || {}; return f.ph in e ? String(e[f.ph] ?? "") : f.vorgabe; };
function eigeneWerte(liste, o, werte, bed) {
  for (const f of liste) {
    const roh = eigenWert(f, o);
    if (f.art === "haken") { const an = roh === "1"; werte[f.ph] = an ? "1" : ""; bed[f.ph.toLowerCase()] = an; continue; }
    const t = roh.trim();
    werte[f.ph] = f.art === "zahl" ? (zahl(t) ?? t) : t;
    bed[f.ph.toLowerCase()] = t !== "";
  }
}
export function kopfEigene(w, werte, bed = {}) { eigeneWerte(aktiv.felder.eigene.filter((f) => f.ort === "kopf"), w, werte, bed); return bed; }
export function blockEigene(b, w, werte, bed) {
  kopfEigene(w, werte, bed);
  eigeneWerte(aktiv.felder.eigene.filter((f) => f.ort === b.art), b, werte, bed);
}
// Vorgaben eigener Felder für ein neues Programm oder eine neue Bearbeitung
export const eigeneVorgaben = (ort, t = aktiv) => Object.fromEntries(eigeneFuer(ort, t).map((f) => [f.ph, f.vorgabe]));

// Deaktivierte eingebaute Felder bekommen fest die Vorgabe
export function wirksamW(w) {
  const aus = aktiv.felder.aus.kopf || [];
  if (!aus.length) return w;
  const n = { ...w };
  for (const k of aus) if (k in aktiv.vorgaben) n[k] = aktiv.vorgaben[k];
  return n;
}
export function wirksamB(b) {
  const aus = aktiv.felder.aus[b.art] || [], vg = aktiv.bloecke[b.art] || {};
  if (!aus.length) return b;
  const n = { ...b };
  for (const k of aus) if (k in vg) n[k] = vg[k];
  // Drehzahl fest: dann auch keine Schnittgeschwindigkeit
  if (aus.includes("S")) { n.sArt = "S"; n.g96 = false; n.g50 = ""; }
  return n;
}

// Platzhalter und Bedingungen der eigenen Felder für die Prüfung einer Vorlage
export function eigeneNamen(t, artId) {
  const ort = artId ? artId.replace("Gegen", "") : null;
  const l = t.felder.eigene.filter((f) => f.ort === "kopf" || (ort && f.ort === ort));
  return { namen: l.map((f) => f.ph), bed: l.map((f) => f.ph.toLowerCase()), liste: l };
}

// Fehler je eigenem Feld (id → Text): Platzhalter leer, ungültig, doppelt
// oder schon eingebaut
export function eigeneFehler(t) {
  const f = {};
  const eingebaut = new Set([...PLATZHALTER_KOPF, ...PLATZHALTER_BLOCK].map(([n]) => n));
  const bed = new Set(BEDINGUNGEN.map(([n]) => n));
  const gesehen = new Set();
  for (const e of t.felder.eigene) {
    if (!e.text.trim()) f[e.id] = "Name fehlt";
    if (!/^[A-Z][A-Z0-9_]*$/.test(e.ph)) f[e.id] = "Platzhalter: Grossbuchstaben, Ziffern, _ (mit Buchstabe vorne)";
    else if (eingebaut.has(e.ph) || ["CODE", "PAARE", "PAARE2"].includes(e.ph)) f[e.id] = "{" + e.ph + "} gibt es schon eingebaut";
    else if (bed.has(e.ph.toLowerCase())) f[e.id] = "[" + e.ph.toLowerCase() + "] gibt es schon als Bedingung";
    else if (gesehen.has(e.ph)) f[e.id] = "{" + e.ph + "} doppelt";
    gesehen.add(e.ph);
    if (e.art === "liste" && !e.liste.length) f[e.id] = f[e.id] || "Auswahlliste ist leer";
  }
  return f;
}
