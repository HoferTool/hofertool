// =================================================================
//  HOFER + CO ZAHLENSPRINT: die 3D-Welt mit three.js
//  Seit 1.578.0 im Affenwald (Wunsch Patrick 16. November 2026: „ein
//  anderes Thema, Thema Affenwald“, „ein richtiger 3D-Dschungel“, „mit
//  Makaken, aber richtig coole, mit YB-Shirts und -Caps“): Ein Makak im
//  gelb-schwarzen Trikot, Cap verkehrt herum, rennt auf einem Pfad durch
//  den dichten Dschungel: Urwaldriesen, Palmen, Farne, Lianen,
//  Lichtstrahlen durchs Blätterdach, Blumen, Felsen, Papageien, hinten ein
//  Wasserfall. Am Wegrand sitzen weitere Makaken in Gelb-Schwarz und
//  jubeln. Das Tor mit der Aufgabe (zwei Bäume, Holzschild an Lianen)
//  erreicht den Makaken genau dann, wenn die Zeit um ist.
//  Richtig: Schild wird grün, der Makak springt mit Salto durch, Bananen
//  und Blätter fliegen. Falsch: Schild wird rot und zeigt die Lösung, der
//  Makak stolpert und purzelt.
//  Alles eigene Formen und Farben, keine Logos von Vereinen oder Spielen;
//  Gelb-Schwarz nur als Farben.
//  Die Pflanzen stecken in vier Abschnitten zu je 70 Einheiten, jeder mit
//  wenigen InstancedMesh: so wird der Wald dicht, und das iPad zeichnet
//  trotzdem nur rund 50 Teile je Bild.
// =================================================================
import * as THREE from "three";

const D0 = 60;           // so weit weg erscheint ein neues Tor
const AB_L = 70;         // Länge eines Waldabschnitts
const AB_N = 4;          // Anzahl Abschnitte, zusammen 280
const NEBEL = 0xa7c99a;  // Dunst im Dschungel, gleich wie der Himmel am Horizont

function zufall(a, b) { return a + Math.random() * (b - a); }
function wahl(liste) { return liste[Math.floor(Math.random() * liste.length)]; }
function leinwand(b, h) { const c = document.createElement("canvas"); c.width = b; c.height = h; return c; }
function textur(c, rx, ry) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

// Waldboden: Moos und Laub, in der Mitte ein Erdpfad mit Wurzeln und Steinen.
function bodenTextur() {
  const c = leinwand(1024, 256), g = c.getContext("2d");
  g.fillStyle = "#2f5a25"; g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = wahl(["rgba(80,130,50,.5)", "rgba(25,60,20,.5)", "rgba(120,160,60,.35)", "rgba(110,80,40,.35)"]);
    const x = Math.random() * 1024, y = Math.random() * 256;
    g.beginPath(); g.ellipse(x, y, zufall(2, 6), zufall(1, 3), Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  // Pfad: 220 Einheiten breit = 1024 Punkte, Pfad ±7 um die Mitte
  const m = 512, halb = 34;
  const v = g.createLinearGradient(m - halb - 14, 0, m + halb + 14, 0);
  v.addColorStop(0, "rgba(122,86,48,0)"); v.addColorStop(0.18, "#8a6238"); v.addColorStop(0.5, "#a57846"); v.addColorStop(0.82, "#8a6238"); v.addColorStop(1, "rgba(122,86,48,0)");
  g.fillStyle = v; g.fillRect(m - halb - 14, 0, (halb + 14) * 2, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = wahl(["rgba(70,45,20,.45)", "rgba(190,150,100,.35)", "rgba(60,90,40,.3)"]);
    g.fillRect(m + zufall(-halb, halb), Math.random() * 256, zufall(1, 4), zufall(1, 4));
  }
  // Steine im Pfad
  for (let i = 0; i < 18; i++) {
    g.fillStyle = wahl(["#8d8a7e", "#76736a", "#a09d91"]);
    g.beginPath(); g.ellipse(m + zufall(-halb + 4, halb - 4), Math.random() * 256, zufall(2, 5), zufall(2, 4), 0, 0, Math.PI * 2); g.fill();
  }
  // Wurzeln quer über den Pfad
  g.strokeStyle = "#5b3b1c"; g.lineCap = "round";
  for (const y0 of [40, 150, 210]) {
    g.lineWidth = zufall(3, 5); g.beginPath(); g.moveTo(m - halb - 20, y0);
    g.bezierCurveTo(m - 10, y0 + zufall(-14, 14), m + 10, y0 + zufall(-14, 14), m + halb + 20, y0 + zufall(-8, 8)); g.stroke();
  }
  return textur(c, 1, 40);
}

// Rinde für die Stämme
function rindeTextur() {
  const c = leinwand(128, 256), g = c.getContext("2d");
  g.fillStyle = "#6b4a2b"; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = wahl(["#4b321c", "#7f5a36", "#3c2814", "#5f6b3a"]); g.lineWidth = zufall(2, 6);
    const x = Math.random() * 128; g.beginPath(); g.moveTo(x, 0);
    g.bezierCurveTo(x + zufall(-10, 10), 80, x + zufall(-10, 10), 170, x + zufall(-6, 6), 256); g.stroke();
  }
  // Moosflecken
  for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(90,140,50,.45)"; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 256, zufall(3, 9), 0, 7); g.fill(); }
  return textur(c, 1, 2);
}

// Hintergrund: Himmel im Dunst, Berge, Wasserfall und drei Schichten
// Dschungel-Silhouetten, die nach vorne dunkler werden.
function hintergrundTextur() {
  const c = leinwand(2048, 640), g = c.getContext("2d");
  const v = g.createLinearGradient(0, 0, 0, 640);
  v.addColorStop(0, "#e8f6d8"); v.addColorStop(0.55, "#c6e2b4"); v.addColorStop(1, hex(NEBEL));
  g.fillStyle = v; g.fillRect(0, 0, 2048, 640);
  // Sonne im Dunst
  const s = g.createRadialGradient(1300, 170, 10, 1300, 170, 320);
  s.addColorStop(0, "rgba(255,250,215,1)"); s.addColorStop(0.25, "rgba(255,240,180,.7)"); s.addColorStop(1, "rgba(255,240,180,0)");
  g.fillStyle = s; g.fillRect(0, 0, 2048, 640);
  // Felswand mit Wasserfall
  g.fillStyle = "#8fae8a";
  g.beginPath(); g.moveTo(700, 640); g.lineTo(760, 250); g.lineTo(860, 200); g.lineTo(1000, 215); g.lineTo(1090, 300); g.lineTo(1150, 640); g.fill();
  const wf = g.createLinearGradient(0, 220, 0, 640); wf.addColorStop(0, "rgba(255,255,255,.95)"); wf.addColorStop(1, "rgba(220,245,255,.6)");
  g.fillStyle = wf; g.fillRect(905, 214, 46, 430);
  g.fillStyle = "rgba(255,255,255,.5)"; for (let i = 0; i < 14; i++) g.fillRect(905 + zufall(0, 40), 214, 3, 430);
  g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.ellipse(928, 600, 120, 40, 0, 0, 7); g.fill();
  // Drei Schichten Bäume
  const schichten = [["#7fa577", 330, 70], ["#5e8a58", 400, 55], ["#3f6b3c", 470, 45]];
  for (const [farbe, basis, gr] of schichten) {
    g.fillStyle = farbe;
    g.fillRect(0, basis + 30, 2048, 640);
    for (let x = -40; x < 2100; x += gr * zufall(0.6, 1.1)) {
      const r = gr * zufall(0.6, 1.2), h = zufall(-50, 30);
      g.beginPath(); g.arc(x, basis + h, r, 0, 7); g.fill();
      if (Math.random() < 0.25) { // Palme mit Wedeln
        g.fillRect(x - 3, basis + h - r * 2.2, 6, r * 2.2);
        for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x, basis + h - r * 2.2, r * 0.9, 8, -0.4 + k * 0.6, 0, 7); g.fill(); }
      }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Holzschild des Tors: Bretter, Rand, Aufgabe gross in Weiss.
const FARBEN = {
  kommt: ["#6b4220", "#9a6532", "#ffd400"],
  gut: ["#0b6b3a", "#1fb866", "#ffffff"],
  schlecht: ["#8f1410", "#d8362c", "#ffffff"],
};
function bannerZeichnen(tor, text, art) {
  const c = tor.leinwand, g = c.getContext("2d"), [f1, f2, rand] = FARBEN[art] || FARBEN.kommt;
  g.clearRect(0, 0, c.width, c.height);
  const v = g.createLinearGradient(0, 0, 0, c.height); v.addColorStop(0, f2); v.addColorStop(1, f1);
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  // Bretterfugen und Maserung
  g.fillStyle = "rgba(0,0,0,.25)"; for (let y = 100; y < c.height; y += 100) g.fillRect(0, y, c.width, 5);
  g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) { const y = Math.random() * c.height; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(300, y + 10, 700, y - 10, 1024, y + 4); g.stroke(); }
  g.strokeStyle = rand; g.lineWidth = 18; g.strokeRect(9, 9, c.width - 18, c.height - 18);
  // Nägel in den Ecken
  for (const [x, y] of [[50, 50], [c.width - 50, 50], [50, c.height - 50], [c.width - 50, c.height - 50]]) {
    g.fillStyle = "#2b2b2b"; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.45)"; g.beginPath(); g.arc(x - 4, y - 4, 5, 0, 7); g.fill();
  }
  g.font = "900 190px 'Arial Black', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  let s = 190; while (g.measureText(text).width > c.width - 200 && s > 60) { s -= 10; g.font = "900 " + s + "px 'Arial Black', system-ui, sans-serif"; }
  g.lineWidth = 18; g.strokeStyle = "rgba(0,0,0,.55)"; g.strokeText(text, c.width / 2, c.height / 2 + 8);
  g.fillStyle = "#ffffff"; g.fillText(text, c.width / 2, c.height / 2 + 8);
  tor.textur.needsUpdate = true;
}

// Rücken des Trikots: eigene Gestaltung, Grundfarbe mit Band an den
// Schultern und grosser Nummer. Vorne nur ein Streifen quer.
function trikotZeichnen(c, grund, akzent, nr, vorne) {
  const g = c.getContext("2d");
  g.fillStyle = hex(grund); g.fillRect(0, 0, 128, 128);
  g.fillStyle = hex(akzent);
  if (vorne) { g.fillRect(0, 44, 128, 16); g.fillRect(52, 0, 24, 14); }
  else {
    g.fillRect(0, 0, 128, 18);
    g.font = "900 80px 'Arial Black', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(nr, 64, 74);
  }
}

const BLATT = [0x2e7d32, 0x388e3c, 0x43a047, 0x1b5e20, 0x558b2f, 0x2f6b2a, 0x4caf50, 0x33691e];
const BLUMEN = [0xff3d6e, 0xff9100, 0xffd400, 0xe040fb, 0xff5252, 0xffffff];

export function weltBauen(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const szene = new THREE.Scene();
  szene.background = new THREE.Color(NEBEL);
  szene.fog = new THREE.Fog(NEBEL, 28, 175);
  const kamera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

  szene.add(new THREE.HemisphereLight(0xfff4d6, 0x2d5a27, 1.15));
  const licht = new THREE.DirectionalLight(0xffe7b0, 1.45); licht.position.set(-25, 60, 10); szene.add(licht);

  const welt = new THREE.Group(); welt.rotation.x = -0.05; szene.add(welt);
  const bodenT = bodenTextur();
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(220, 420), new THREE.MeshLambertMaterial({ map: bodenT }));
  boden.rotation.x = -Math.PI / 2; boden.position.z = -170; welt.add(boden);
  // Hintergrund steht fest wie früher die Berge, im Dunst
  const fern = new THREE.Mesh(new THREE.PlaneGeometry(700, 220), new THREE.MeshBasicMaterial({ map: hintergrundTextur(), fog: false }));
  fern.position.set(0, 60, -340); szene.add(fern);

  // Hofer-Logo als kleine Tafeln an manchen Bäumen am Weg
  const logoC = leinwand(1024, 400), logoT = new THREE.CanvasTexture(logoC);
  logoT.colorSpace = THREE.SRGBColorSpace; logoT.anisotropy = 4;
  {
    const k = logoC.getContext("2d");
    k.fillStyle = "#003884"; k.fillRect(0, 0, 1024, 400);
    k.strokeStyle = "#7a5230"; k.lineWidth = 30; k.strokeRect(15, 15, 994, 370);
    const logoBild = new Image();
    logoBild.onload = () => { const b = 760, h = b * 240 / 643; k.drawImage(logoBild, (1024 - b) / 2, (400 - h) / 2, b, h); logoT.needsUpdate = true; };
    logoBild.src = import.meta.env.BASE_URL + "logo-weiss.svg";
  }
  const logoMat = new THREE.MeshLambertMaterial({ map: logoT, side: THREE.DoubleSide });

  const rindeM = new THREE.MeshLambertMaterial({ map: rindeTextur() });
  const weissM = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const blattM = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const lianeM = new THREE.MeshLambertMaterial({ color: 0x3e5a22 });
  const steinM = new THREE.MeshLambertMaterial({ color: 0x7b8170, flatShading: true });
  const strahlM = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const geo = {
    stamm: new THREE.CylinderGeometry(0.55, 1, 1, 8, 1),
    blob: new THREE.IcosahedronGeometry(1, 0),
    wedel: (() => { const gg = new THREE.BoxGeometry(0.5, 0.04, 1); gg.translate(0, 0, 0.5); return gg; })(),
    liane: (() => { const gg = new THREE.CylinderGeometry(0.05, 0.05, 1, 5); gg.translate(0, -0.5, 0); return gg; })(),
    stein: new THREE.DodecahedronGeometry(1, 0),
    blume: new THREE.IcosahedronGeometry(0.22, 0),
    strahl: new THREE.PlaneGeometry(1, 1),
  };
  const dummy = new THREE.Object3D(), farbeH = new THREE.Color();

  // Eine Sammlung Instanzen: erst sammeln, dann als InstancedMesh anlegen
  function sammler(g, m, eltern, mitFarbe) {
    const liste = [];
    return {
      add(x, y, z, sx, sy, sz, rx, ry, rz, f) { liste.push([x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0, f]); },
      bauen() {
        if (!liste.length) return null;
        const im = new THREE.InstancedMesh(g, m, liste.length);
        liste.forEach((e, i) => {
          dummy.position.set(e[0], e[1], e[2]); dummy.scale.set(e[3], e[4], e[5]); dummy.rotation.set(e[6], e[7], e[8], "YXZ");
          dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          if (mitFarbe) { farbeH.setHex(e[9] != null ? e[9] : 0xffffff); im.setColorAt(i, farbeH); }
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        eltern.add(im); return im;
      },
    };
  }

  // ---------- Makaken aus Klötzen ----------
  // Ein Makak: Fell graubraun, Gesicht rot, Trikot und Hosen, Cap verkehrt
  // herum. mitUmriss für den Spieler (hebt sich vom Wald ab), ohne für die
  // Zuschauer am Weg, damit das iPad nicht zu viel zeichnen muss.
  function makakBauen(farben, mitUmriss, nr) {
    const mm = {
      fell: new THREE.MeshLambertMaterial({ color: farben.fell }),
      gesicht: new THREE.MeshLambertMaterial({ color: farben.gesicht }),
      shirt: new THREE.MeshLambertMaterial({ color: farben.shirt }),
      shirt2: new THREE.MeshLambertMaterial({ color: farben.shirt2 }),
      cap: new THREE.MeshLambertMaterial({ color: farben.cap }),
      schild: new THREE.MeshLambertMaterial({ color: farben.schild }),
      brille: new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x000000 }),
      weiss: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      schwarz: new THREE.MeshLambertMaterial({ color: 0x141414 }),
    };
    const rueckC = leinwand(128, 128), vornC = leinwand(128, 128);
    trikotZeichnen(rueckC, farben.shirt, farben.shirt2, nr, false); trikotZeichnen(vornC, farben.shirt, farben.shirt2, nr, true);
    const rueckT = new THREE.CanvasTexture(rueckC), vornT = new THREE.CanvasTexture(vornC);
    rueckT.colorSpace = vornT.colorSpace = THREE.SRGBColorSpace;
    const rueckM = new THREE.MeshLambertMaterial({ map: rueckT }), vornM = new THREE.MeshLambertMaterial({ map: vornT });
    const umriss = new THREE.MeshBasicMaterial({ color: 0x0d1a08, side: THREE.BackSide });
    const wurzel = new THREE.Group(), koerper = new THREE.Group(); wurzel.add(koerper);
    const box = (b, h, t, mat, x, y, z, eltern) => {
      const gg = new THREE.BoxGeometry(b, h, t), k = new THREE.Mesh(gg, mat); k.position.set(x, y, z);
      if (mitUmriss) { const r = new THREE.Mesh(gg, umriss); r.scale.set(1 + 0.06 / b, 1 + 0.06 / h, 1 + 0.06 / t); k.add(r); }
      (eltern || koerper).add(k); return k;
    };
    // Beine mit Drehpunkt an der Hüfte
    const beine = [-0.16, 0.16].map((x) => {
      const b = new THREE.Group(); b.position.set(x, 0.66, 0); koerper.add(b);
      box(0.25, 0.24, 0.27, mm.shirt2, 0, -0.08, 0, b);            // Hose
      box(0.19, 0.32, 0.2, mm.fell, 0, -0.34, 0, b);
      box(0.21, 0.08, 0.32, mm.gesicht, 0, -0.54, -0.05, b);        // Fuss
      return b;
    });
    // Rumpf im Trikot: hinten mit Nummer, vorne mit Streifen
    const rumpfG = new THREE.BoxGeometry(0.58, 0.6, 0.4);
    const rumpf = new THREE.Mesh(rumpfG, [mm.shirt, mm.shirt, mm.shirt, mm.shirt, rueckM, vornM]); rumpf.position.set(0, 0.98, 0); koerper.add(rumpf);
    if (mitUmriss) { const r = new THREE.Mesh(rumpfG, umriss); r.scale.set(1.1, 1.1, 1.15); rumpf.add(r); }
    box(0.6, 0.06, 0.42, mm.shirt2, 0, 1.25, 0);                     // Kragen
    box(0.08, 0.08, 0.26, mm.fell, 0, 0.74, 0.26).rotation.x = -0.7; // kurzer Makakenschwanz
    // Arme mit Drehpunkt an der Schulter
    const arme = [-0.37, 0.37].map((x) => {
      const a = new THREE.Group(); a.position.set(x, 1.2, 0); koerper.add(a);
      box(0.19, 0.24, 0.2, mm.shirt, 0, -0.08, 0, a);               // Ärmel
      box(0.15, 0.36, 0.15, mm.fell, 0, -0.36, 0, a);
      box(0.17, 0.13, 0.17, mm.gesicht, 0, -0.6, 0, a);             // Hand
      return a;
    });
    // Kopf: Fell, rotes Gesicht, Schnauze, Augen, Ohren, Backenbart, Cap verkehrt
    const kopf = new THREE.Group(); kopf.position.set(0, 1.52, 0); koerper.add(kopf);
    box(0.5, 0.44, 0.46, mm.fell, 0, 0, 0, kopf);
    box(0.36, 0.3, 0.06, mm.gesicht, 0, -0.03, -0.235, kopf);
    box(0.22, 0.12, 0.1, mm.gesicht, 0, -0.12, -0.28, kopf);
    box(0.1, 0.03, 0.02, mm.schwarz, 0, -0.1, -0.335, kopf);          // Nasenlöcher
    box(0.42, 0.06, 0.06, mm.fell, 0, 0.12, -0.24, kopf);           // Stirnwulst
    const augen = [-0.08, 0.08].map((x) => {
      const a = box(0.09, 0.08, 0.02, mm.weiss, x, 0.04, -0.27, kopf);
      box(0.045, 0.06, 0.02, mm.schwarz, x * 1.05, 0.035, -0.282, kopf);
      return a;
    });
    const brille = box(0.44, 0.1, 0.04, mm.brille, 0, 0.045, -0.29, kopf);
    for (const x of [-0.29, 0.29]) box(0.08, 0.14, 0.1, mm.gesicht, x, 0.02, -0.02, kopf);   // Ohren
    for (const x of [-0.24, 0.24]) box(0.08, 0.26, 0.32, mm.fell, x, -0.07, -0.08, kopf);    // Backenbart
    box(0.54, 0.16, 0.5, mm.cap, 0, 0.29, 0.01, kopf);              // Cap
    box(0.44, 0.04, 0.26, mm.schild, 0, 0.23, 0.33, kopf);          // Schild nach hinten
    box(0.08, 0.04, 0.08, mm.schild, 0, 0.385, 0, kopf);            // Knopf oben
    box(0.16, 0.1, 0.02, mm.schild, 0, 0.3, -0.25, kopf);           // Abzeichen vorne, eigene Form
    function farbenSetzen(f) {
      mm.fell.color.setHex(f.fell); mm.gesicht.color.setHex(f.gesicht); mm.shirt.color.setHex(f.shirt); mm.shirt2.color.setHex(f.shirt2);
      mm.cap.color.setHex(f.cap); mm.schild.color.setHex(f.schild);
      if (f.brille) { mm.brille.color.setHex(f.brille); mm.brille.emissive.setHex(f.brille); mm.brille.emissiveIntensity = 0.35; }
      brille.visible = !!f.brille; for (const a of augen) a.visible = !f.brille;
      trikotZeichnen(rueckC, f.shirt, f.shirt2, nr, false); trikotZeichnen(vornC, f.shirt, f.shirt2, nr, true);
      rueckT.needsUpdate = true; vornT.needsUpdate = true;
    }
    farbenSetzen(farben);
    return { wurzel, koerper, beine, arme, kopf, farbenSetzen };
  }

  // Zuschauer am Weg, immer in Gelb-Schwarz, mal mit Sonnenbrille
  const FANS = [
    { fell: 0x8a7a66, gesicht: 0xd9675e, shirt: 0xffd400, shirt2: 0x111111, cap: 0x111111, schild: 0xffd400, brille: 0 },
    { fell: 0x9c8a72, gesicht: 0xe07a6c, shirt: 0x111111, shirt2: 0xffd400, cap: 0xffd400, schild: 0x111111, brille: 0x111111 },
    { fell: 0x7a6c5a, gesicht: 0xcf5d55, shirt: 0xffd400, shirt2: 0x111111, cap: 0xffd400, schild: 0x111111, brille: 0 },
  ];
  const fans = [];

  // ---------- Waldabschnitte ----------
  const abschnitte = [];
  function abschnittBauen(nr) {
    const g = new THREE.Group(); g.position.z = -nr * AB_L; welt.add(g);
    const stamm = sammler(geo.stamm, rindeM, g, false);
    const blob = sammler(geo.blob, blattM, g, true);
    const wedel = sammler(geo.wedel, blattM, g, true);
    const liane = sammler(geo.liane, lianeM, g, false);
    const stein = sammler(geo.stein, steinM, g, false);
    const blume = sammler(geo.blume, blattM, g, true);
    // Urwaldriesen links und rechts, hinten dichter
    for (let i = 0; i < 26; i++) {
      const s = i % 2 ? 1 : -1, x = s * zufall(8.5, 42), z = -zufall(0, AB_L);
      const h = zufall(14, 26), r = zufall(0.6, 1.3) * (Math.abs(x) > 20 ? 1.4 : 1);
      stamm.add(x, h / 2, z, r, h, r, 0, Math.random() * 6, 0);
      // Brettwurzeln
      for (let k = 0; k < 3; k++) { const a = Math.random() * 6; stamm.add(x + Math.cos(a) * r * 0.9, 0.6, z + Math.sin(a) * r * 0.9, r * 0.35, 1.4, r * 0.35, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); }
      const kr = zufall(3.5, 6.5);
      for (let k = 0; k < 4; k++) blob.add(x + zufall(-kr, kr) * 0.6, h + zufall(-1.5, 1.5), z + zufall(-kr, kr) * 0.6, kr * zufall(0.7, 1), kr * zufall(0.45, 0.7), kr * zufall(0.7, 1), 0, Math.random() * 6, 0, wahl(BLATT));
      // Lianen hängen aus der Krone
      if (Math.abs(x) < 20) for (let k = 0; k < 2; k++) {
        const lx = x - s * zufall(1, 3), lz = z + zufall(-2, 2), ll = zufall(5, h - 2);
        liane.add(lx, h - 0.5, lz, 1, ll, 1, zufall(-0.06, 0.06), 0, zufall(-0.06, 0.06));
        for (let b = 0; b < 3; b++) wedel.add(lx, h - 0.5 - ll * zufall(0.3, 1), lz, 0.5, 1, 0.5, 0.9, Math.random() * 6, 0, wahl(BLATT));
      }
    }
    // Blätterdach über dem Pfad, mit Lücken für die Lichtstrahlen
    for (let i = 0; i < 9; i++) {
      const z = -i * (AB_L / 9) - zufall(0, 4);
      if (Math.random() < 0.3) continue;
      blob.add(zufall(-9, 9), zufall(17, 22), z, zufall(4, 7), zufall(1.5, 2.5), zufall(4, 7), 0, Math.random() * 6, 0, wahl(BLATT));
    }
    // Palmen nah am Weg
    for (let i = 0; i < 7; i++) {
      const s = i % 2 ? 1 : -1, x = s * zufall(7.5, 14), z = -zufall(0, AB_L), h = zufall(6, 10), neig = s * zufall(0.1, 0.25);
      stamm.add(x - Math.sin(neig) * h / 2, h / 2, z, 0.28, h, 0.28, 0, 0, neig);
      const kx = x - Math.sin(neig) * h, ky = h * Math.cos(neig);
      for (let k = 0; k < 9; k++) wedel.add(kx, ky, z, zufall(1.4, 2), 1, zufall(3.2, 4.2), zufall(0.25, 0.6), k * 0.7, 0, wahl(BLATT));
      blob.add(kx, ky, z, 0.5, 0.4, 0.5, 0, 0, 0, 0x6b4a2b);
    }
    // Farne, Büsche und Riesenblätter am Wegrand
    for (let i = 0; i < 30; i++) {
      const s = i % 2 ? 1 : -1, x = s * zufall(4.2, 11), z = -zufall(0, AB_L);
      if (Math.random() < 0.55) {
        const n = 6 + Math.floor(Math.random() * 4), gr = zufall(0.8, 1.6);
        for (let k = 0; k < n; k++) wedel.add(x, 0.1, z, gr * 0.8, 1, gr * zufall(1.3, 2), zufall(-0.9, -0.4), (k / n) * 6.28, 0, wahl(BLATT));
      } else blob.add(x, zufall(0.3, 0.8), z, zufall(1, 2.2), zufall(0.8, 1.6), zufall(1, 2.2), 0, Math.random() * 6, 0, wahl(BLATT));
    }
    // Weiter hinten dichtes Unterholz, damit keine Lücken sind
    for (let i = 0; i < 26; i++) {
      const s = i % 2 ? 1 : -1;
      blob.add(s * zufall(12, 44), zufall(0.5, 2.5), -zufall(0, AB_L), zufall(2, 4.5), zufall(1.5, 3.5), zufall(2, 4.5), 0, Math.random() * 6, 0, wahl(BLATT));
    }
    // Blumen und Steine
    for (let i = 0; i < 26; i++) {
      const s = Math.random() < 0.5 ? 1 : -1;
      blume.add(s * zufall(3.6, 9), zufall(0.15, 0.7), -zufall(0, AB_L), 1, 1, 1, 0, 0, 0, wahl(BLUMEN));
    }
    for (let i = 0; i < 9; i++) {
      const s = Math.random() < 0.5 ? 1 : -1, r = zufall(0.4, 1.4);
      stein.add(s * zufall(4.5, 12), r * 0.3, -zufall(0, AB_L), r, r * 0.7, r, 0, Math.random() * 6, 0);
    }
    stamm.bauen(); blob.bauen(); wedel.bauen(); liane.bauen(); stein.bauen(); blume.bauen();
    // Lichtstrahlen durchs Blätterdach
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(geo.strahl, strahlM);
      st.scale.set(zufall(2.5, 5), 26, 1); st.position.set(zufall(-7, 7), 10, -zufall(5, AB_L - 5));
      st.rotation.set(0, zufall(-0.4, 0.4), zufall(0.25, 0.4)); g.add(st);
    }
    // Hofer-Tafel an einem Baum am Weg
    if (nr % 2 === 0) {
      const s = nr % 4 ? 1 : -1, z = -zufall(10, AB_L - 10);
      stamm.add(s * 8.4, 6, z, 0.7, 12, 0.7);
      const tafel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.64), logoMat);
      tafel.position.set(s * 7.55, 4.2, z); tafel.rotation.y = -s * Math.PI / 2 + s * 0.35; g.add(tafel);
      // Stamm dazu als eigenes Stück, weil die Instanzen schon gebaut sind
      const st = new THREE.Mesh(geo.stamm, rindeM); st.scale.set(0.7, 12, 0.7); st.position.set(s * 8.4, 6, z); g.add(st);
    }
    // Zwei Makaken-Fans: auf einem Felsen oder einem Ast am Weg
    for (let i = 0; i < 2; i++) {
      const s = (nr + i) % 2 ? 1 : -1, f = makakBauen(FANS[(nr * 2 + i) % FANS.length], false, String(1 + ((nr * 7 + i * 3) % 30)));
      const aufAst = Math.random() < 0.4, z = -zufall(8, AB_L - 8);
      const x = s * (aufAst ? zufall(5, 6.5) : zufall(4.6, 6));
      const y = aufAst ? zufall(3.5, 5) : 0.55;
      if (aufAst) {
        const ast = new THREE.Mesh(geo.stamm, rindeM); ast.scale.set(0.3, 6, 0.3); ast.rotation.z = Math.PI / 2; ast.position.set(x + s * 2.5, y - 0.1, z); g.add(ast);
      } else {
        const fels = new THREE.Mesh(geo.stein, steinM); fels.scale.set(0.8, 0.55, 0.8); fels.position.set(x, 0.2, z); g.add(fels);
      }
      f.wurzel.position.set(x, y - 0.55, z); f.wurzel.rotation.y = s * 1.2; f.wurzel.scale.setScalar(1.15); g.add(f.wurzel);
      // sitzen: Beine nach vorne
      for (const b of f.beine) b.rotation.x = -1.4;
      f.koerper.position.y = -0.3;
      fans.push(Object.assign(f, { phase: zufall(0, 6), jubel: 0 }));
    }
    return g;
  }
  for (let i = 0; i < AB_N; i++) abschnitte.push(abschnittBauen(i));

  // Papageien fliegen ab und zu quer über den Weg
  const voegel = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    const farbe = [0xe53935, 0x1e88e5, 0xffd400][i];
    const km = new THREE.MeshLambertMaterial({ color: farbe });
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.9), km); g.add(k);
    const sch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.7), new THREE.MeshLambertMaterial({ color: i === 1 ? 0xffd400 : 0x1e88e5 })); sch.position.set(0, -0.05, 0.7); g.add(sch);
    const kopfV = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), km); kopfV.position.set(0, 0.15, -0.5); g.add(kopfV);
    const schnabel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.16), new THREE.MeshLambertMaterial({ color: 0xffe082 })); schnabel.position.set(0, 0.1, -0.72); g.add(schnabel);
    const fl = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.17, 0.08, -0.05); g.add(p);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.5), km); f.position.x = s * 0.45; p.add(f);
      return p;
    });
    g.visible = false; welt.add(g);
    return { g, fl, t: -zufall(2, 10), dauer: 0, von: 0, bis: 0, y: 0, z: 0 };
  });

  // ---------- Spieler ----------
  const spieler = makakBauen({ fell: 0x8a7a66, gesicht: 0xd9675e, shirt: 0xffd400, shirt2: 0x111111, cap: 0x111111, schild: 0xffd400, brille: 0x111111 }, true, "10");
  const fahrer = spieler.wurzel; welt.add(fahrer);
  fahrer.scale.setScalar(1.45);
  const koerper = spieler.koerper, [armV, armH] = spieler.arme, [beinV, beinH] = spieler.beine, kopf = spieler.kopf;
  const schatten = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0x10240c, transparent: true, opacity: 0.4, depthWrite: false }));
  schatten.rotation.x = -Math.PI / 2; schatten.position.y = 0.02; welt.add(schatten);

  let skin = null;
  function skinSetzen(s) { skin = s; spieler.farbenSetzen(s); }

  // ---------- Tore: zwei Bäume, Ast oben, Holzschild an Lianen ----------
  function torBauen() {
    const g = new THREE.Group();
    for (const x of [-4.6, 4.6]) {
      const st = new THREE.Mesh(geo.stamm, rindeM); st.scale.set(0.55, 9, 0.55); st.position.set(x, 4.5, 0); g.add(st);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(geo.blob, blattM.clone()); b.material.color.setHex(wahl(BLATT));
        b.scale.set(zufall(1.8, 2.6), zufall(1.2, 1.8), zufall(1.8, 2.6)); b.position.set(x + zufall(-1.4, 1.4), 9 + zufall(-0.5, 0.8), zufall(-1, 1)); g.add(b);
      }
    }
    const ast = new THREE.Mesh(geo.stamm, rindeM); ast.scale.set(0.32, 10, 0.32); ast.rotation.z = Math.PI / 2; ast.position.y = 7.4; g.add(ast);
    for (const x of [-2.8, 2.8]) { const l = new THREE.Mesh(geo.liane, lianeM); l.scale.set(1.3, 1.2, 1.3); l.position.set(x, 7.4, 0); g.add(l); }
    const holz = new THREE.MeshLambertMaterial({ color: 0x6b4220 });
    const c = leinwand(1024, 300), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(7.4, 2.1, 0.22), [holz, holz, holz, holz,
      new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })]);
    banner.position.y = 5.2; g.add(banner);
    // ein Makak sitzt oben auf dem Ast und feuert an
    const f = makakBauen(FANS[Math.floor(Math.random() * FANS.length)], false, "7");
    f.wurzel.position.set(zufall(-2, 2), 7.25, 0); for (const b of f.beine) b.rotation.x = -1.4; f.koerper.position.y = -0.3; g.add(f.wurzel);
    fans.push(Object.assign(f, { phase: zufall(0, 6), jubel: 0, amTor: true }));
    g.visible = false; welt.add(g);
    return { g, banner, leinwand: c, textur: t, zustand: "aus", z: -D0, start: 0, dauer: 0, weg: 0 };
  }
  const tore = [torBauen(), torBauen()];
  let torAktiv = null;

  // ---------- Teilchen (Blätter, Erde, Bananen) ----------
  const N = 700, pos = new Float32Array(N * 3), farbe = new Float32Array(N * 3);
  const tl = Array.from({ length: N }, () => ({ leben: 0, vx: 0, vy: 0, vz: 0, schwer: 1 }));
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); tGeo.setAttribute("color", new THREE.BufferAttribute(farbe, 3));
  const teilchen = new THREE.Points(tGeo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true }));
  teilchen.frustumCulled = false; welt.add(teilchen);
  let tNaechst = 0;
  const hilfsFarbe = new THREE.Color();
  function spritz(x, y, z, vx, vy, vz, hx, leben, schwer) {
    const i = tNaechst; tNaechst = (tNaechst + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    hilfsFarbe.setHex(hx); farbe[i * 3] = hilfsFarbe.r; farbe[i * 3 + 1] = hilfsFarbe.g; farbe[i * 3 + 2] = hilfsFarbe.b;
    Object.assign(tl[i], { leben, vx, vy, vz, schwer });
  }
  function explosion(x, y, z, farben, anzahl, kraft) {
    for (let i = 0; i < anzahl; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, k = zufall(0.4, 1) * kraft;
      spritz(x, y, z, Math.cos(a) * Math.cos(b) * k, Math.abs(Math.sin(b)) * k + 2, Math.sin(a) * Math.cos(b) * k, farben[i % farben.length], zufall(0.8, 1.6), 1);
    }
  }
  const BLAETTER = [0x3f8f3a, 0x7cc243, 0x9b6a3c, 0xc7e27a];
  const ERDE = [0x8a6238, 0xa57846, 0x5b3b1c];
  const BANANE = [0xffe135, 0xffd400, 0xfff176];
  // Glühwürmchen und Pollen, die im Licht schweben
  const fallN = 260, fallPos = new Float32Array(fallN * 3);
  for (let i = 0; i < fallN; i++) { fallPos[i * 3] = zufall(-30, 30); fallPos[i * 3 + 1] = zufall(0, 16); fallPos[i * 3 + 2] = zufall(-80, 10); }
  const fallGeo = new THREE.BufferGeometry(); fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
  const fall = new THREE.Points(fallGeo, new THREE.PointsMaterial({ size: 0.14, color: 0xeaff9a, transparent: true, opacity: 0.75 }));
  fall.frustumCulled = false; welt.add(fall);

  // ---------- Zustand ----------
  let modus = "menu", tempo = 9, zielTempo = 9, pause = false, serie = 0;
  let schnitt = false, sprung = null, sturz = null, jubel = 0, wackeln = 0, t = 0, ohneZeit = false, schrittPhase = 0, fanJubel = 0;
  const kamPos = new THREE.Vector3(5.5, 2.8, 6), kamZiel = new THREE.Vector3(0, 1.2, 0), blick = new THREE.Vector3(0, 1.2, 0);
  kamera.position.copy(kamPos);
  // Freier Streifen zwischen Aufgabe und Zifferblock (Pixel ab oben). Ist er
  // gesetzt, schiebt die Kamera das Bild so, dass der Makak darin steht und
  // nicht unter dem Zifferblock verschwindet (Wunsch Patrick 14. November 2026)
  let frei = null, schieben = 0;
  const fussPunkt = new THREE.Vector3();

  function groesse() {
    const b = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(b, h, false); kamera.aspect = b / h;
    kamera.fov = b / h < 0.8 ? 74 : 60; kamera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(groesse); ro.observe(canvas); groesse();

  let letzte = performance.now(), lauf = true, raf = 0;
  function schritt(jetzt) {
    if (!lauf) return;
    raf = requestAnimationFrame(schritt);
    const dt = Math.min(0.05, (jetzt - letzte) / 1000); letzte = jetzt;
    if (document.hidden) return;
    t += dt;
    const dtW = pause ? 0 : dt;

    if (torAktiv && torAktiv.zustand === "kommt" && !pause) {
      if (ohneZeit) zielTempo = torAktiv.z < -14 ? 14 : 0;
      else zielTempo = D0 / torAktiv.dauer;
    }
    tempo += (zielTempo - tempo) * Math.min(1, dt * 4);
    const weg = tempo * dtW;
    bodenT.offset.y += weg / (420 / 40);
    for (const a of abschnitte) {
      a.position.z += weg;
      if (a.position.z > AB_L + 15) a.position.z -= AB_L * AB_N;
    }
    for (let i = 0; i < fallN; i++) {
      fallPos[i * 3 + 1] += Math.sin(t * 0.7 + i) * dt * 0.25; fallPos[i * 3 + 2] += weg * 0.6 + dt * 0.3; fallPos[i * 3] += Math.cos(t * 0.5 + i) * dt * 0.25;
      if (fallPos[i * 3 + 2] > 12) { fallPos[i * 3 + 1] = zufall(0, 16); fallPos[i * 3 + 2] = zufall(-80, -40); }
    }
    fallGeo.attributes.position.needsUpdate = true;

    // Zuschauer: wippen, winken, bei richtig springen sie auf
    if (fanJubel > 0) fanJubel -= dt;
    for (const f of fans) {
      const p = t * 3 + f.phase, laut = fanJubel > 0 || modus === "ende";
      f.arme[0].rotation.set(laut ? Math.PI - Math.abs(Math.sin(p * 3)) * 0.6 : 0.3 + Math.sin(p) * 0.25, 0, 0.3);
      f.arme[1].rotation.set(laut ? Math.PI - Math.abs(Math.cos(p * 3)) * 0.6 : (Math.sin(p * 0.5) > 0.6 ? Math.PI - Math.sin(p * 4) * 0.4 : 0.3), 0, -0.3);
      f.kopf.rotation.set(Math.sin(p * 0.7) * 0.1, Math.sin(p * 0.4) * 0.35, 0);
      f.koerper.position.y = -0.3 + (laut ? Math.abs(Math.sin(p * 2.5)) * 0.35 : 0);
    }
    // Papageien
    for (const v of voegel) {
      v.t += dtW;
      if (v.t < 0) continue;
      if (!v.g.visible) {
        const s = Math.random() < 0.5 ? 1 : -1;
        Object.assign(v, { von: s * 30, bis: -s * 30, y: zufall(7, 13), z: -zufall(12, 45), dauer: zufall(3.5, 6) });
        v.g.visible = true; v.g.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      const p = v.t / v.dauer;
      v.g.position.set(v.von + (v.bis - v.von) * p, v.y + Math.sin(p * 9) * 0.5, v.z);
      v.fl[0].rotation.z = Math.sin(t * 16) * 0.7; v.fl[1].rotation.z = -Math.sin(t * 16) * 0.7;
      if (p >= 1) { v.g.visible = false; v.t = -zufall(3, 10); }
    }

    for (const tor of tore) {
      if (!tor.g.visible) continue;
      if (tor.zustand === "kommt" && !pause) {
        tor.start += dtW;
        tor.z = ohneZeit ? Math.min(-12, -D0 + tor.start * 14) : -D0 * (1 - Math.min(1, tor.start / tor.dauer));
      } else if (tor.zustand === "gut") tor.z += weg + dtW * 40;
      else if (tor.zustand === "schlecht" && !sturz) tor.z += weg;
      else if (tor.zustand === "weg") { tor.weg += dt; tor.g.scale.setScalar(Math.max(0.01, 1 - tor.weg * 4)); if (tor.weg > 0.25) tor.g.visible = false; }
      tor.g.position.z = tor.z;
      tor.banner.rotation.x = Math.sin(t * 2 + tor.z * 0.1) * 0.04;
      if (tor.z > 14) tor.g.visible = false;
    }

    // Makak: rennt im Zickzack über den Pfad, Sprung, Purzeln, Jubel
    const kurve = Math.sin(t * 1.1);
    const zielX = modus === "ende" ? 0 : kurve * (modus === "menu" ? 1.8 : 1.2);
    fahrer.position.x += (zielX - fahrer.position.x) * Math.min(1, dt * 3);
    let y = 0;
    schrittPhase += dtW * (5 + Math.min(tempo, 30) * 0.35);
    const sw = Math.sin(schrittPhase), laeuft = tempo > 1 && modus !== "ende";
    koerper.rotation.set(laeuft ? -0.18 : 0, 0, 0); fahrer.rotation.set(0, 0, 0);
    beinV.rotation.set(laeuft ? sw * 0.95 : 0, 0, 0); beinH.rotation.set(laeuft ? -sw * 0.95 : 0, 0, 0);
    armV.rotation.set(laeuft ? -sw * 0.9 : 0.2, 0, 0.12); armH.rotation.set(laeuft ? sw * 0.9 : 0.2, 0, -0.12);
    koerper.position.y = laeuft ? Math.abs(Math.cos(schrittPhase)) * 0.12 : 0;
    kopf.rotation.set(laeuft ? 0.12 : 0, Math.sin(t * 0.9) * 0.15, 0);
    fahrer.rotation.y = Math.cos(t * 1.1) * 0.25 * (modus === "ende" ? 0 : 1);
    fahrer.rotation.z = -Math.cos(t * 1.1) * 0.06 * (modus === "ende" ? 0 : 1);
    if (sprung) {
      sprung.t += dt; const p = Math.min(1, sprung.t / sprung.dauer);
      y = Math.sin(p * Math.PI) * sprung.hoehe;
      fahrer.rotation.y = p * Math.PI * 2 * sprung.drehungen;
      if (sprung.flip) fahrer.rotation.x = -p * Math.PI * 2;
      armV.rotation.set(Math.PI - 0.2, 0, 0.35); armH.rotation.set(Math.PI - 0.2, 0, -0.35);
      beinV.rotation.set(-0.9, 0, 0); beinH.rotation.set(-0.5, 0, 0); koerper.position.y = 0.05;
      if (skin && Math.random() < 0.8) spritz(fahrer.position.x, y + 0.9, 0.5, zufall(-1, 1), zufall(-1, 1), 3, skin.spur[Math.floor(Math.random() * skin.spur.length)], 0.6, 0.2);
      if (p >= 1) { sprung = null; for (let i = 0; i < 22; i++) spritz(fahrer.position.x + zufall(-0.6, 0.6), 0.1, zufall(-0.6, 0.8), zufall(-3, 3), zufall(1.5, 3.5), zufall(0, 3), wahl(ERDE), 0.7, 1); }
    }
    if (sturz) {
      sturz.t += dt;
      if (sturz.t < 0.9) {
        // stolpert und purzelt vorwärts
        const p = sturz.t / 0.9;
        fahrer.rotation.x = -p * Math.PI * 2; fahrer.rotation.z = p * 0.5; y = Math.sin(p * Math.PI) * 1.1;
        armV.rotation.set(2.4, 0, 0.8); armH.rotation.set(2.4, 0, -0.8);
        if (Math.random() < 0.9) spritz(fahrer.position.x + zufall(-0.8, 0.8), 0.5, zufall(-0.8, 0.8), zufall(-3, 3), zufall(2, 5), zufall(-2, 3), wahl(BLAETTER), 0.9, 1);
      } else if (sturz.t < 1.6) {
        // sitzt benommen da, Kopf dreht
        y = 0; koerper.position.y = -0.3; beinV.rotation.set(-1.4, 0, 0.2); beinH.rotation.set(-1.4, 0, -0.2);
        armV.rotation.set(0.2, 0, 0.5); armH.rotation.set(0.2, 0, -0.5);
        kopf.rotation.set(0, Math.sin(sturz.t * 14) * 0.4, Math.sin(sturz.t * 9) * 0.2);
      } else if (sturz.t < 2.1) {
        const p = (sturz.t - 1.6) / 0.5; koerper.position.y = -0.3 * (1 - p);
        beinV.rotation.set(-1.4 * (1 - p), 0, 0); beinH.rotation.set(-1.4 * (1 - p), 0, 0);
      } else sturz = null;
    }
    if (modus === "ende") {
      jubel += dt;
      const h = Math.abs(Math.sin(jubel * 4)) * 0.7; y = Math.max(y, h);
      fahrer.rotation.y = Math.sin(jubel * 2) * 0.6 + (jubel % 4 < 0.8 ? (jubel % 4) / 0.8 * Math.PI * 2 : 0);
      armV.rotation.set(Math.PI - Math.sin(jubel * 8) * 0.4, 0, 0.4); armH.rotation.set(Math.PI + Math.sin(jubel * 8) * 0.4, 0, -0.4);
      beinV.rotation.set(-0.3 * Math.abs(Math.sin(jubel * 4)), 0, 0.15); beinH.rotation.set(-0.3 * Math.abs(Math.sin(jubel * 4)), 0, -0.15);
      if (Math.random() < 0.6) spritz(zufall(-8, 8), 12, zufall(-8, 2), zufall(-1, 1), 0, zufall(-0.5, 0.5), wahl(BANANE.concat([0x111111, 0x7cc243])), 3.5, 0.08);
    }
    fahrer.position.y = y;
    schatten.position.x = fahrer.position.x; schatten.scale.setScalar(Math.max(0.4, 1 - y * 0.25));
    // Erde und Blätter hinter den Füssen, ab einer Serie von 5 in den Farben der Ausrüstung
    if (!pause && modus !== "ende" && !sprung && !sturz && tempo > 2) {
      if (Math.random() < 0.6) spritz(fahrer.position.x + zufall(-0.3, 0.3), 0.08, 0.5, zufall(-0.8, 0.8), zufall(0.5, 1.4), zufall(0.5, 1.5), wahl(Math.random() < 0.7 ? ERDE : BLAETTER), 0.35, 1);
      if (serie >= 5 && skin) for (let i = 0; i < 2; i++) spritz(fahrer.position.x + zufall(-0.4, 0.4), 0.7, 0.8, zufall(-0.5, 0.5), zufall(0.3, 1.5), 2 + tempo * 0.3, skin.spur[Math.floor(Math.random() * skin.spur.length)], 0.7, 0.3);
    }
    for (let i = 0; i < N; i++) {
      const p = tl[i]; if (p.leben <= 0) continue;
      p.leben -= dt;
      if (p.leben <= 0) { pos[i * 3 + 1] = -100; continue; }
      p.vy -= 9.8 * p.schwer * dt;
      pos[i * 3] += p.vx * dt; pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + p.vy * dt); pos[i * 3 + 2] += p.vz * dt + weg;
    }
    tGeo.attributes.position.needsUpdate = true; tGeo.attributes.color.needsUpdate = true;

    // Kamera
    if (modus === "menu") {
      kamZiel.set(4.2 + Math.sin(t * 0.25) * 2, 2.8, 6.2); blick.set(fahrer.position.x, 1.6, -1);
    } else if (modus === "ende") {
      const quer = kamera.aspect > 1.2;
      kamZiel.set(quer ? 3.2 : 1.1, 2.6, -6.8); blick.set(quer ? 2.6 : 0, 1.8, 0);
    } else {
      if (kamera.aspect < 0.8) { kamZiel.set(fahrer.position.x * 0.5, 4.2, 9.4); blick.set(fahrer.position.x * 0.6, 2, -10); }
      else { kamZiel.set(fahrer.position.x * 0.5, 3.4, 7); blick.set(fahrer.position.x * 0.6, 1.9, -10); }
    }
    if (schnitt) { kamPos.copy(kamZiel); schnitt = false; }
    kamPos.lerp(kamZiel, Math.min(1, dt * 2.5));
    kamera.position.copy(kamPos);
    if (wackeln > 0) { wackeln -= dt; kamera.position.x += zufall(-1, 1) * wackeln * 0.6; kamera.position.y += zufall(-1, 1) * wackeln * 0.6; }
    kamera.lookAt(blick);
    let schiebZiel = 0;
    if (frei && modus !== "menu" && modus !== "ende") {
      kamera.clearViewOffset(); kamera.updateMatrixWorld();
      const h = canvas.clientHeight || 1;
      fussPunkt.set(fahrer.position.x, 0, 0); welt.localToWorld(fussPunkt); fussPunkt.project(kamera);
      const py = (1 - fussPunkt.y) / 2 * h;
      const ziel = frei.unten - Math.max(14, (frei.unten - frei.oben) * 0.06);
      schiebZiel = Math.max(0, Math.min(h * 0.45, py - ziel));
    }
    schieben += (schiebZiel - schieben) * Math.min(1, dt * 6);
    if (schieben > 0.5) {
      const b = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      kamera.setViewOffset(b, h, 0, schieben, b, h);
    } else kamera.clearViewOffset();
    renderer.render(szene, kamera);
  }
  raf = requestAnimationFrame(schritt);

  return {
    skin: skinSetzen,
    modus(mm) {
      if (mm === "ende" || modus === "ende") schnitt = true;
      modus = mm; jubel = 0; if (mm === "menu") zielTempo = 9; if (mm === "ende") { zielTempo = 0; for (const tor of tore) if (tor.g.visible) { tor.zustand = "weg"; tor.weg = 0; } } },
    frei(oben, unten) { frei = unten > oben + 40 ? { oben, unten } : null; },
    pause(w) { pause = !!w; if (w) zielTempo = 0; },
    serie(n) { serie = n; },
    tor(text, dauerS) {
      for (const alt of tore) if (alt.g.visible && alt.zustand !== "gut") { alt.zustand = "weg"; alt.weg = 0; }
      const tor = tore.find((x) => !x.g.visible) || tore[0];
      ohneZeit = !dauerS;
      Object.assign(tor, { zustand: "kommt", start: 0, dauer: dauerS || 1, z: -D0, weg: 0 });
      tor.g.scale.setScalar(1); tor.g.position.z = -D0; tor.g.visible = true;
      bannerZeichnen(tor, text, "kommt");
      torAktiv = tor; sturz = null;
    },
    richtig(text, serieJetzt) {
      serie = serieJetzt;
      const tor = torAktiv; if (!tor) return;
      tor.zustand = "gut"; bannerZeichnen(tor, text, "gut");
      zielTempo = 34; tempo = Math.max(tempo, 26); fanJubel = 1.6;
      const hoch = serieJetzt >= 10;
      sprung = { t: 0, dauer: hoch ? 0.95 : 0.75, hoehe: hoch ? 3.2 : 2.3, drehungen: hoch ? 2 : 1, flip: serieJetzt > 0 && serieJetzt % 5 === 0 };
      const farben = skin ? skin.spur.concat(BANANE) : BANANE;
      explosion(0, 4.4, tor.z, farben, 60, 9);
      explosion(fahrer.position.x, 1.5, 0, BLAETTER.concat(BANANE), 24, 5);
    },
    falsch(text) {
      serie = 0;
      const tor = torAktiv; if (tor) { tor.zustand = "schlecht"; bannerZeichnen(tor, text, "schlecht"); }
      zielTempo = 0; tempo *= 0.3; sturz = { t: 0 }; sprung = null; wackeln = 0.5;
    },
    zerstoeren() {
      lauf = false; cancelAnimationFrame(raf); ro.disconnect();
      szene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose();
    },
  };
}
