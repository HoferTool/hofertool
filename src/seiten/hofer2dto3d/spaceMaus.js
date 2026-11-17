// =================================================================
//  3DCONNEXION SPACEMOUSE ÜBER WEBHID (HOFER2DTO3D, seit 1.609.0)
//  Wunsch Patrick 17. November 2026: „ich habe noch eine 3D Connexion,
//  geht das auch?“. Chrome und Edge lesen die SpaceMouse direkt als
//  HID-Gerät, ohne Zusatzprogramm. Einmal mit dem Knopf koppeln (der
//  Browser fragt), danach verbindet sie sich von selbst.
//  Bedienung wie in CAD (Objekt-Modus): die Kappe kippen oder drehen
//  dreht das Teil mit, seitlich schieben verschiebt, nach vorne/hinten
//  schieben zoomt. Linker Knopf Iso, rechter Knopf Vorne.
// =================================================================
import * as THREE from "three";

// 3Dconnexion (neu) und Logitech (ältere SpaceMouse / SpaceNavigator)
const HERSTELLER = [0x256f, 0x046d];
const TOT = 10;            // Ruhebereich, die Kappe zittert leicht
const DREH = 0.00012;      // Bogenmass je Bild und Einheit
const SCHUB = 0.000035;    // Anteil der Entfernung je Bild und Einheit

const achsen = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };
let geraet = null;
let knoepfeVorher = 0;

export function spaceMausStand() {
  const moeglich = typeof navigator !== "undefined" && !!navigator.hid;
  return { moeglich, verbunden: !!(geraet && geraet.opened), name: geraet ? geraet.productName : "" };
}

function lesen(e) {
  const d = e.data;
  const i = (n) => (d.byteLength >= n * 2 + 2 ? d.getInt16(n * 2, true) : 0);
  if (e.reportId === 1) {
    achsen.tx = i(0); achsen.ty = i(1); achsen.tz = i(2);
    // Neuere Modelle schicken alle sechs Achsen in einem Bericht
    if (d.byteLength >= 12) { achsen.rx = i(3); achsen.ry = i(4); achsen.rz = i(5); }
  } else if (e.reportId === 2) {
    achsen.rx = i(0); achsen.ry = i(1); achsen.rz = i(2);
  } else if (e.reportId === 3 && d.byteLength >= 1) {
    const k = d.getUint8(0);
    for (const b of [0, 1]) {
      if ((k & (1 << b)) && !(knoepfeVorher & (1 << b)))
        window.dispatchEvent(new CustomEvent("hofer-spacemaus-knopf", { detail: b }));
    }
    knoepfeVorher = k;
  }
}

async function oeffnen(g, melden) {
  try {
    if (!g.opened) await g.open();
    if (geraet && geraet !== g) geraet.removeEventListener("inputreport", lesen);
    g.removeEventListener("inputreport", lesen);
    g.addEventListener("inputreport", lesen);
    geraet = g;
  } catch (f) {
    if (window.TEST) console.warn("SpaceMouse", f);
  }
  melden && melden(spaceMausStand());
}

const passt = (g) => HERSTELLER.includes(g.vendorId) && (g.productName || "").match(/space|3dconnexion|navigator|cadmouse/i)
  || g.vendorId === 0x256f;

// Schon gekoppelte Geräte ohne Nachfrage verbinden
export async function spaceMausSuchen(melden) {
  if (!navigator.hid) return;
  if (geraet && geraet.opened) { melden(spaceMausStand()); return; }
  try {
    const liste = (await navigator.hid.getDevices()).filter(passt);
    if (liste.length) await oeffnen(liste[0], melden);
  } catch { /* nichts gekoppelt */ }
  if (!spaceMausSuchen.hoert) {
    spaceMausSuchen.hoert = true;
    navigator.hid.addEventListener("connect", (e) => { if (passt(e.device)) oeffnen(e.device, melden); });
    navigator.hid.addEventListener("disconnect", (e) => {
      if (e.device === geraet) { geraet = null; Object.keys(achsen).forEach((k) => { achsen[k] = 0; }); melden(spaceMausStand()); }
    });
  }
}

// Knopf: der Browser zeigt die Geräte zur Wahl
export async function spaceMausVerbinden(melden) {
  if (!navigator.hid) return;
  try {
    const liste = await navigator.hid.requestDevice({ filters: HERSTELLER.map((vendorId) => ({ vendorId })) });
    if (liste.length) await oeffnen(liste[0], melden);
  } catch { /* abgebrochen */ }
}

const w = (v) => (Math.abs(v) < TOT ? 0 : v);
const q = new THREE.Quaternion();
const achse = new THREE.Vector3();
const versatz = new THREE.Vector3();
const rechts = new THREE.Vector3();
const oben = new THREE.Vector3();
const blick = new THREE.Vector3();

// Jedes Bild: Ausschlag der Kappe auf die Kamera anwenden
export function spaceMausAnwenden(kamera, ziel) {
  if (!geraet) return;
  const tx = w(achsen.tx), ty = w(achsen.ty), tz = w(achsen.tz);
  const rx = w(achsen.rx), ry = w(achsen.ry), rz = w(achsen.rz);
  if (!(tx || ty || tz || rx || ry || rz)) return;
  kamera.updateMatrixWorld();
  rechts.setFromMatrixColumn(kamera.matrixWorld, 0);
  oben.setFromMatrixColumn(kamera.matrixWorld, 1);
  blick.setFromMatrixColumn(kamera.matrixWorld, 2); // zeigt vom Teil zur Kamera
  versatz.subVectors(kamera.position, ziel);

  // Drehen: das Teil folgt der Kappe, also dreht die Kamera gegenläufig.
  // Kippen nach vorne (rx) um die Waagrechte, Drehen der Kappe (rz) um
  // die Senkrechte des Bilds, seitlich kippen (ry) um die Blickachse.
  const drehen = (a, winkel) => {
    if (!winkel) return;
    q.setFromAxisAngle(achse.copy(a).normalize(), winkel);
    versatz.applyQuaternion(q);
    kamera.up.applyQuaternion(q);
    rechts.applyQuaternion(q); oben.applyQuaternion(q); blick.applyQuaternion(q);
  };
  drehen(rechts, -rx * DREH);
  drehen(oben, rz * DREH);
  drehen(blick, ry * DREH);

  // Schieben quer verschiebt, nach vorne / hinten zoomt
  const weite = versatz.length();
  const schieb = new THREE.Vector3()
    .addScaledVector(rechts, -tx * SCHUB * weite)
    .addScaledVector(oben, tz * SCHUB * weite);
  ziel.add(schieb);
  versatz.multiplyScalar(Math.exp(ty * SCHUB * 2.5));
  kamera.position.copy(ziel).add(versatz);
  kamera.lookAt(ziel);
}

// Für den Prüfstand: Ausschlag von Hand setzen
if (typeof window !== "undefined" && window.TEST) {
  window.TEST.spaceMaus = (werte) => { geraet = geraet || { opened: true, productName: "Test" }; Object.assign(achsen, werte); };
}
