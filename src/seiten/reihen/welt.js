// =================================================================
//  HOFER + CO ZAHLENSPRINT: die 3D-Welt mit three.js
//  Seit 1.552.0 im Stil von Hofer + Co (Wunsch Patrick 15. November 2026:
//  „das Spiel umbauen auf Hofer + Co mit HoferTool-Stil und Themen“):
//  Ein Mechaniker im Hofer-Overall fährt mit dem Stapler durch die
//  Werkhalle, links und rechts Drehmaschinen mit Signalsäulen,
//  Stangenlager in den Werkstofffarben, Paletten mit Kisten. Portalkrane
//  mit der Aufgabe kommen auf ihn zu und erreichen ihn genau dann, wenn
//  die Zeit um ist.
//  Richtig: Banner wird grün, der Stapler springt mit Drehung durch,
//  Späne und Drehteile fliegen. Falsch: Banner wird rot und zeigt die
//  Lösung, der Stapler überschlägt sich.
//  Alles eigene Formen und Farben aus Klötzen.
// =================================================================
import * as THREE from "three";

const D0 = 60;           // so weit weg erscheint ein neuer Kran
const LANG = 280;        // Länge der Strecke mit Maschinen und Lager
const HOFER = 0x003884;  // Hofer-Blau wie im HoferTool (--marke)

function zufall(a, b) { return a + Math.random() * (b - a); }
function wahl(liste) { return liste[Math.floor(Math.random() * liste.length)]; }

function leinwand(b, h) { const c = document.createElement("canvas"); c.width = b; c.height = h; return c; }
function textur(c, rx, ry) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Hallenboden: grauer Beton mit Fugen, in der Mitte die Fahrspur mit
// gelben Rändern und weisser Mittellinie wie in der Halle in Lohn.
function bodenTextur() {
  const c = leinwand(1024, 256), g = c.getContext("2d");
  g.fillStyle = "#aeb6c0"; g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(90,100,115,.18)" : "rgba(255,255,255,.22)";
    g.fillRect(Math.random() * 1024, Math.random() * 256, 2, 2);
  }
  // Fugen der Betonplatten
  g.fillStyle = "rgba(70,80,95,.35)";
  for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 2, 256);
  g.fillRect(0, 0, 1024, 2); g.fillRect(0, 128, 1024, 2);
  // Fahrspur: 220 Einheiten breit = 1024 Punkte, Spur ±8.5 um die Mitte
  const m = 512, halb = 40;
  g.fillStyle = "#c4cad2"; g.fillRect(m - halb, 0, halb * 2, 256);
  g.fillStyle = "#ffcc00"; g.fillRect(m - halb - 5, 0, 7, 256); g.fillRect(m + halb - 2, 0, 7, 256);
  g.fillStyle = "#ffffff"; g.fillRect(m - 2, 20, 4, 90); g.fillRect(m - 2, 148, 4, 90);
  // Gelb-schwarze Schraffur neben der Spur (Sicherheitszone)
  for (let y = -16; y < 256; y += 32) {
    for (const x0 of [m - halb - 26, m + halb + 8]) {
      g.fillStyle = "#ffcc00"; g.fillRect(x0, y, 18, 32);
      g.fillStyle = "#1b1b1b"; g.beginPath(); g.moveTo(x0, y + 8); g.lineTo(x0 + 18, y - 10); g.lineTo(x0 + 18, y + 6); g.lineTo(x0, y + 24); g.fill();
    }
  }
  return textur(c, 1, 40);
}

// Hallendecke mit Lichtbändern; die Textur wandert, das gibt Tempo.
function deckeTextur() {
  const c = leinwand(256, 256), g = c.getContext("2d");
  g.fillStyle = "#4a5566"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#3b4553"; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 256);
  g.fillStyle = "#fffbe8"; g.fillRect(70, 30, 26, 120); g.fillRect(160, 30, 26, 120);
  return textur(c, 6, 30);
}

// Hallenwand: hell, unten ein Band im Hofer-Blau, oben Fenster.
function wandTextur() {
  const c = leinwand(256, 256), g = c.getContext("2d");
  g.fillStyle = "#e6eaf0"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#003884"; g.fillRect(0, 176, 256, 34);
  g.fillStyle = "#ffcc00"; g.fillRect(0, 210, 256, 6);
  g.fillStyle = "#c9d2dd"; g.fillRect(0, 216, 256, 40);
  for (let x = 14; x < 256; x += 64) {
    const v = g.createLinearGradient(0, 30, 0, 120); v.addColorStop(0, "#bfe0ff"); v.addColorStop(1, "#7fb2e6");
    g.fillStyle = v; g.fillRect(x, 30, 36, 90);
    g.fillStyle = "#9aa6b5"; g.fillRect(x + 16, 30, 4, 90); g.fillRect(x, 72, 36, 4);
  }
  return textur(c, 30, 1);
}

function streifenTextur() {
  const c = leinwand(32, 128), g = c.getContext("2d");
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#1b1b1b" : "#ffcc00"; g.fillRect(0, i * 16, 32, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Schild an der Maschine mit Typ und Nummer wie auf der Planwand
function schildTextur(oben, nr) {
  const c = leinwand(256, 128), g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#003884"; g.fillRect(0, 0, 256, 44);
  g.font = "900 30px 'Arial Black', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#ffffff"; g.fillText(oben, 128, 23);
  g.fillStyle = "#003884"; g.font = "900 64px 'Arial Black', system-ui, sans-serif"; g.fillText(nr, 128, 88);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FARBEN = {
  kommt: ["#002b66", "#0b55b8", "#ffcc00"],
  gut: ["#0b6b3a", "#1fb866", "#ffffff"],
  schlecht: ["#8f1410", "#d8362c", "#ffffff"],
};

// Sechskantmutter als Zierde in den Ecken des Banners
function mutter(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = "rgba(255,255,255,.22)"; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fillStyle = "rgba(0,0,0,.3)"; g.fill();
}

function bannerZeichnen(tor, text, art) {
  const c = tor.leinwand, g = c.getContext("2d"), [f1, f2, rand] = FARBEN[art] || FARBEN.kommt;
  g.clearRect(0, 0, c.width, c.height);
  const v = g.createLinearGradient(0, 0, 0, c.height); v.addColorStop(0, f2); v.addColorStop(1, f1);
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = rand; g.lineWidth = 18; g.strokeRect(9, 9, c.width - 18, c.height - 18);
  mutter(g, 70, 70, 34); mutter(g, c.width - 70, 70, 34); mutter(g, 70, c.height - 70, 34); mutter(g, c.width - 70, c.height - 70, 34);
  g.font = "900 190px 'Arial Black', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  let s = 190; while (g.measureText(text).width > c.width - 220 && s > 60) { s -= 10; g.font = "900 " + s + "px 'Arial Black', system-ui, sans-serif"; }
  g.lineWidth = 16; g.strokeStyle = "rgba(0,0,0,.5)"; g.strokeText(text, c.width / 2, c.height / 2 + 8);
  g.fillStyle = "#ffffff"; g.fillText(text, c.width / 2, c.height / 2 + 8);
  tor.textur.needsUpdate = true;
}

// Farben der Werkstoffe wie auf der Planwand
const WERKSTOFFE = [0xd8362c, 0x9aa3ad, 0x2f6fd0, 0xf28c1b, 0xf1f3f5, 0xf2d33a, 0x8e5bd0, 0xf2a7c3];

export function weltBauen(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const szene = new THREE.Scene();
  szene.background = new THREE.Color(0xdfe6ef);
  szene.fog = new THREE.Fog(0xdfe6ef, 50, 230);
  const kamera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

  szene.add(new THREE.HemisphereLight(0xffffff, 0x8f9aab, 1.25));
  const licht = new THREE.DirectionalLight(0xffffff, 1.5); licht.position.set(-30, 60, 25); szene.add(licht);

  // ---------- Halle ----------
  const welt = new THREE.Group(); welt.rotation.x = -0.05; szene.add(welt);
  const bodenT = bodenTextur(), deckeT = deckeTextur(), wandT = wandTextur();
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(220, 420), new THREE.MeshLambertMaterial({ map: bodenT }));
  boden.rotation.x = -Math.PI / 2; boden.position.z = -170; welt.add(boden);
  const decke = new THREE.Mesh(new THREE.PlaneGeometry(160, 420), new THREE.MeshBasicMaterial({ map: deckeT }));
  decke.rotation.x = Math.PI / 2; decke.position.set(0, 24, -170); welt.add(decke);
  for (const seite of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(420, 24), new THREE.MeshLambertMaterial({ map: wandT }));
    w.rotation.y = -seite * Math.PI / 2; w.position.set(seite * 46, 12, -170); welt.add(w);
  }
  // Stirnwand hinten in Hofer-Blau mit dem weissen Logo, steht fest wie früher die Berge
  const stirn = new THREE.Mesh(new THREE.PlaneGeometry(130, 30), new THREE.MeshBasicMaterial({ color: HOFER, fog: false }));
  stirn.position.set(0, 11, -330); szene.add(stirn);
  const hallentor = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshBasicMaterial({ color: 0xc9d2dd, fog: false }));
  hallentor.position.set(0, 3.5, -329.5); szene.add(hallentor);
  // Hofer-Logo: einmal als Schild (Hofer-Blau, weisses Logo) gezeichnet und
  // überall in der Halle verwendet: Stirnwand, Wandbanner, Deckenbanner, Krane
  // (Wunsch Patrick 15. November 2026: „das Logo soll in der Halle ersichtlich sein“)
  const logoC = leinwand(1024, 400), logoT = new THREE.CanvasTexture(logoC);
  logoT.colorSpace = THREE.SRGBColorSpace; logoT.anisotropy = 4;
  {
    const k = logoC.getContext("2d");
    k.fillStyle = "#003884"; k.fillRect(0, 0, 1024, 400);
    k.strokeStyle = "rgba(255,255,255,0.55)"; k.lineWidth = 10; k.strokeRect(14, 14, 996, 372);
    const logoBild = new Image();
    logoBild.onload = () => {
      const b = 800, h = b * 240 / 643;
      k.drawImage(logoBild, (1024 - b) / 2, (400 - h) / 2, b, h);
      logoT.needsUpdate = true;
    };
    logoBild.src = import.meta.env.BASE_URL + "logo-weiss.svg";
  }
  const logoMat = new THREE.MeshBasicMaterial({ map: logoT, side: THREE.DoubleSide });
  const logoFern = new THREE.Mesh(new THREE.PlaneGeometry(64, 25), new THREE.MeshBasicMaterial({ map: logoT, fog: false }));
  logoFern.position.set(0, 15, -329.4); szene.add(logoFern);

  const deko = [];
  const mat = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
  const grauHell = mat(0xe8ecf1), grauMittel = mat(0x9aa4b1), grauDunkel = mat(0x3a4250), schwarzM = mat(0x1b1b1b);
  const blauM = mat(HOFER), glasM = new THREE.MeshLambertMaterial({ color: 0x9fd0ff, emissive: 0x3a7fd0, emissiveIntensity: 0.6 });
  const gelbM = mat(0xffcc00), holzM = mat(0xc89a5b);
  const blinker = [];

  const TYPEN = [["SB-20RG", 123], ["SB-20RG", 125], ["SW-20", 121], ["SW-20", 127], ["SB-16", 113], ["SR-32", 111], ["INDEX", 301], ["SB-20RG", 130], ["SR-10", 116], ["XP-16", 201]];
  let typNr = 0;
  // CNC-Drehmaschine: Gehäuse hell, Tür im Hofer-Blau mit leuchtendem
  // Fenster, Bedienpult, Signalsäule grün/gelb/rot und Schild mit Nummer
  function maschine(seite) {
    const g = new THREE.Group();
    const korpus = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 6), grauHell); korpus.position.y = 1.7; g.add(korpus);
    const sockel = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.5, 6.1), grauDunkel); sockel.position.y = 0.25; g.add(sockel);
    const tuer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 3.4), blauM); tuer.position.set(-seite * 1.62, 1.9, 0.4); g.add(tuer);
    const fenster = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 2.4), glasM); fenster.position.set(-seite * 1.64, 2.05, 0.4); g.add(fenster);
    const pult = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 1), grauDunkel); pult.position.set(-seite * 1.75, 2.1, -2.3); g.add(pult);
    const bild = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.7), new THREE.MeshBasicMaterial({ color: 0x5ad1ff })); bild.position.set(-seite * 2.02, 2.35, -2.3); g.add(bild);
    const [typ, nr] = TYPEN[typNr++ % TYPEN.length];
    const schild = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: schildTextur(typ, String(nr)) }));
    schild.rotation.y = -seite * Math.PI / 2; schild.position.set(-seite * 1.62, 3.0, 2.3); g.add(schild);
    // Signalsäule
    const lampen = [0x1fd16b, 0xffcc00, 0xff3b3b].map((c, i) => {
      const m = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 });
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), m); l.position.set(0, 3.75 + (2 - i) * 0.32, -2.6); g.add(l);
      return m;
    });
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), grauDunkel); st.position.set(0, 3.5, -2.6); g.add(st);
    blinker.push({ lampen, art: Math.random() < 0.75 ? 0 : Math.random() < 0.6 ? 1 : 2, phase: zufall(0, 6) });
    return g;
  }
  // Stangenlager: Gestell mit Stangen in den Werkstofffarben
  function lager() {
    const g = new THREE.Group();
    for (const z of [-2.6, 0, 2.6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25), blauM); p.position.set(0, 2, z); g.add(p);
      for (let e = 0; e < 4; e++) { const a = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.12), gelbM); a.position.set(0, 0.6 + e * 1, z); g.add(a); }
    }
    for (let e = 0; e < 4; e++) {
      const farbe = wahl(WERKSTOFFE), m = mat(farbe);
      // ein Bund Stangen je Fach als ein Klotz, schont das iPad
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.26, 6.4), m); s.position.set(0, 0.78 + e * 1, 0); g.add(s);
    }
    return g;
  }
  // Palette mit blauen Kisten voller Drehteile
  function palette() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2), holzM); p.position.y = 0.15; g.add(p);
    const hoehe = 1 + Math.floor(Math.random() * 3);
    for (let h = 0; h < hoehe; h++) for (const x of [-0.6, 0.6]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.8), blauM); k.position.set(x, 0.62 + h * 0.64, 0); g.add(k);
    }
    return g;
  }
  // Hallenstütze: Stahlträger mit gelb-schwarzem Anfahrschutz
  const streifen = new THREE.MeshLambertMaterial({ map: streifenTextur() });
  function stuetze() {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.7, 24, 0.7), grauMittel); t.position.y = 12; g.add(t);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), streifen); s.position.y = 0.8; g.add(s);
    return g;
  }

  for (let i = 0; i < 18; i++) {
    const seite = i % 2 ? 1 : -1, z = -Math.floor(i / 2) * (LANG / 9) - zufall(0, 6);
    const m = maschine(seite); m.position.set(seite * zufall(13, 16), 0, z); welt.add(m); deko.push({ o: m, art: "maschine" });
  }
  for (let i = 0; i < 12; i++) {
    const seite = i % 2 ? 1 : -1;
    const l = lager(); l.position.set(seite * zufall(24, 30), 0, -zufall(0, LANG)); welt.add(l); deko.push({ o: l, art: "lager" });
    const p = palette(); p.position.set(seite * zufall(10, 11.2), 0, -zufall(0, LANG)); p.rotation.y = zufall(-0.3, 0.3); welt.add(p); deko.push({ o: p, art: "palette" });
  }
  for (let i = 0; i < 16; i++) {
    const seite = i % 2 ? 1 : -1, n = Math.floor(i / 2);
    const s = stuetze(); s.position.set(seite * 19.5, 0, -n * (LANG / 8)); welt.add(s); deko.push({ o: s, art: "stuetze" });
  }

  // Grosse Logo-Banner an beiden Wänden und unter der Decke, ziehen mit vorbei
  for (let i = 0; i < 8; i++) {
    const seite = i % 2 ? 1 : -1, z = -Math.floor(i / 2) * (LANG / 4) - 20;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(20, 7.8), logoMat);
    b.rotation.y = seite * -Math.PI / 2; b.position.set(seite * 45.6, 15, z); welt.add(b); deko.push({ o: b, art: "logo" });
  }
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.5), logoMat); g.add(b);
    for (const x of [-5, 5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 6, 0.06), schwarzM); s.position.set(x, 5.75, 0); g.add(s); }
    g.position.set(0, 14.5, -40 - i * (LANG / 3)); welt.add(g); deko.push({ o: g, art: "logo" });
  }

  // ---------- Stapler mit Mechaniker aus Klötzen ----------
  const fahrer = new THREE.Group(); welt.add(fahrer);
  fahrer.scale.setScalar(1.25);
  const koerper = new THREE.Group(); fahrer.add(koerper);
  const m = {
    jacke: new THREE.MeshLambertMaterial(), hose: new THREE.MeshLambertMaterial(), helm: new THREE.MeshLambertMaterial(),
    brille: new THREE.MeshLambertMaterial({ emissive: 0x000000 }), brett: new THREE.MeshLambertMaterial(), brett2: new THREE.MeshLambertMaterial(),
    haut: new THREE.MeshLambertMaterial({ color: 0xf1c27d }), schwarz: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    stahl: new THREE.MeshLambertMaterial({ color: 0x6b7480 }), kiste: new THREE.MeshLambertMaterial({ color: HOFER }),
    messing: new THREE.MeshLambertMaterial({ color: 0xf2b53a, emissive: 0x6b4a00, emissiveIntensity: 0.3 }),
  };
  // Dunkler Umriss um jeden Klotz, damit der Stapler sich vom hellen Boden abhebt
  const umriss = new THREE.MeshBasicMaterial({ color: 0x0b1530, side: THREE.BackSide });
  const box = (b, h, t, mm, x, y, z, eltern) => {
    const geo = new THREE.BoxGeometry(b, h, t), k = new THREE.Mesh(geo, mm); k.position.set(x, y, z);
    const r = new THREE.Mesh(geo, umriss); r.scale.set(1 + 0.08 / b, 1 + 0.08 / h, 1 + 0.08 / t); k.add(r);
    (eltern || koerper).add(k); return k;
  };
  // Fahrzeug (fährt Richtung −z, Gabel vorne)
  const brett = new THREE.Group(); fahrer.add(brett);
  box(1.5, 0.6, 2.1, m.brett, 0, 0.6, 0.1, brett);                 // Rahmen
  box(1.55, 0.5, 0.5, m.brett2, 0, 0.8, 1.08, brett);             // Gegengewicht hinten, tief, damit man den Fahrer sieht
  box(1.3, 0.12, 0.9, m.schwarz, 0, 0.95, 0.15, brett);           // Boden der Kabine
  box(0.55, 0.12, 0.5, m.schwarz, 0, 1.05, 0.35, brett);           // Sitz
  box(0.55, 0.45, 0.1, m.schwarz, 0, 1.28, 0.62, brett);           // Lehne
  const rad = [];
  for (const [x, z, r] of [[-0.78, -0.65, 0.36], [0.78, -0.65, 0.36], [-0.78, 0.8, 0.3], [0.78, 0.8, 0.3]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 14), m.schwarz);
    w.rotation.z = Math.PI / 2; w.position.set(x, r, z); brett.add(w); rad.push(w);
    const nabe = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.32, 8), m.brett2); w.add(nabe);
  }
  // Schutzdach mit vier Stangen in Gelb-Schwarz
  for (const [x, z] of [[-0.62, -0.35], [0.62, -0.35], [-0.62, 0.7], [0.62, 0.7]]) box(0.09, 1.9, 0.09, m.schwarz, x, 1.85, z, brett);
  box(1.4, 0.08, 1.2, m.brett2, 0, 2.82, 0.17, brett);
  // Hubmast, Gabel und eine Hofer-Kiste mit Drehteilen
  box(0.12, 2.5, 0.14, m.stahl, -0.45, 1.35, -1.05, brett); box(0.12, 2.5, 0.14, m.stahl, 0.45, 1.35, -1.05, brett);
  box(1.0, 0.1, 0.12, m.stahl, 0, 2.5, -1.05, brett);
  const gabel = new THREE.Group(); brett.add(gabel);
  box(1.0, 0.35, 0.08, m.stahl, 0, 0.45, -1.15, gabel);
  box(0.13, 0.06, 1.1, m.stahl, -0.3, 0.3, -1.7, gabel); box(0.13, 0.06, 1.1, m.stahl, 0.3, 0.3, -1.7, gabel);
  box(1.0, 0.55, 0.95, m.kiste, 0, 0.62, -1.72, gabel);
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), m.messing);
    d.rotation.x = Math.PI / 2; d.rotation.z = zufall(-0.4, 0.4); d.position.set(-0.33 + (i % 3) * 0.33, 0.95, -1.88 + Math.floor(i / 3) * 0.34); gabel.add(d);
  }
  // Mechaniker auf dem Sitz: Overall, Helm, Schutzbrille
  const beinV = box(0.22, 0.25, 0.6, m.hose, -0.15, 1.18, 0.05), beinH = box(0.22, 0.25, 0.6, m.hose, 0.15, 1.18, 0.05);
  box(0.6, 0.75, 0.4, m.jacke, 0, 1.55, 0.35);
  box(0.62, 0.12, 0.42, m.hose, 0, 1.2, 0.35);
  box(0.62, 0.14, 0.05, m.brett2, 0, 1.65, 0.14);                  // Reflexstreifen
  box(0.6, 0.1, 0.55, m.schwarz, 0, 1.55, -0.25, brett);           // Lenkrad
  const armV = new THREE.Group(), armH = new THREE.Group(); armV.position.set(-0.38, 1.85, 0.35); armH.position.set(0.38, 1.85, 0.35);
  koerper.add(armV, armH);
  box(0.18, 0.6, 0.18, m.jacke, 0, -0.28, 0, armV); box(0.2, 0.18, 0.2, m.schwarz, 0, -0.62, 0, armV);
  box(0.18, 0.6, 0.18, m.jacke, 0, -0.28, 0, armH); box(0.2, 0.18, 0.2, m.schwarz, 0, -0.62, 0, armH);
  const kopf = new THREE.Group(); kopf.position.set(0, 2.18, 0.35); koerper.add(kopf);
  box(0.46, 0.46, 0.46, m.haut, 0, 0, 0, kopf);
  box(0.54, 0.24, 0.54, m.helm, 0, 0.26, 0, kopf);
  box(0.62, 0.06, 0.3, m.helm, 0, 0.15, -0.3, kopf);               // Schirm vom Helm
  box(0.44, 0.13, 0.06, m.brille, 0, 0.04, -0.25, kopf);
  box(0.16, 0.08, 0.04, m.schwarz, 0, -0.13, -0.24, kopf);
  const schatten = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: 0x1a2a50, transparent: true, opacity: 0.35, depthWrite: false }));
  schatten.rotation.x = -Math.PI / 2; schatten.position.y = 0.02; welt.add(schatten);

  let skin = null;
  function skinSetzen(s) {
    skin = s;
    m.jacke.color.setHex(s.jacke); m.hose.color.setHex(s.hose); m.helm.color.setHex(s.helm);
    m.brille.color.setHex(s.brille); m.brille.emissive.setHex(s.brille); m.brille.emissiveIntensity = 0.4;
    m.brett.color.setHex(s.brett); m.brett2.color.setHex(s.brett2);
  }

  // ---------- Portalkrane mit der Aufgabe ----------
  const stangeMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  function torBauen() {
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 6.6, 0.45), streifen), p2 = p1.clone();
    p1.position.set(-4.2, 3.3, 0); p2.position.set(4.2, 3.3, 0); g.add(p1, p2);
    const traeger = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.5, 0.6), gelbM); traeger.position.y = 6.7; g.add(traeger);
    const katze = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.8), grauDunkel); katze.position.set(2.8, 6.25, 0); g.add(katze);
    const seil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), schwarzM); seil.position.set(2.8, 5.6, 0); g.add(seil);
    const haken = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 6, 10, Math.PI * 1.4), gelbM); haken.position.set(2.8, 5.05, 0); g.add(haken);
    const c = leinwand(1024, 300), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(7.4, 2.1, 0.18), [stangeMat, stangeMat, stangeMat, stangeMat,
      new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })]);
    banner.position.y = 5.2; g.add(banner);
    // Logo-Schild oben auf dem Kranträger
    const schildLogo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.72), logoMat); schildLogo.position.set(0, 7.85, 0); g.add(schildLogo);
    const halter = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 0.3), gelbM); halter.position.set(0, 6.98, 0); g.add(halter);
    g.visible = false; welt.add(g);
    return { g, banner, leinwand: c, textur: t, zustand: "aus", z: -D0, start: 0, dauer: 0, weg: 0 };
  }
  const tore = [torBauen(), torBauen()];
  let torAktiv = null;

  // ---------- Teilchen (Späne, Funken, Drehteile) ----------
  const N = 700, pos = new Float32Array(N * 3), farbe = new Float32Array(N * 3);
  const tl = Array.from({ length: N }, () => ({ leben: 0, vx: 0, vy: 0, vz: 0, schwer: 1 }));
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); tGeo.setAttribute("color", new THREE.BufferAttribute(farbe, 3));
  const teilchen = new THREE.Points(tGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true }));
  teilchen.frustumCulled = false; welt.add(teilchen);
  let tNaechst = 0;
  const hilfsFarbe = new THREE.Color();
  function spritz(x, y, z, vx, vy, vz, hex, leben, schwer) {
    const i = tNaechst; tNaechst = (tNaechst + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    hilfsFarbe.setHex(hex); farbe[i * 3] = hilfsFarbe.r; farbe[i * 3 + 1] = hilfsFarbe.g; farbe[i * 3 + 2] = hilfsFarbe.b;
    Object.assign(tl[i], { leben, vx, vy, vz, schwer });
  }
  function explosion(x, y, z, farben, anzahl, kraft) {
    for (let i = 0; i < anzahl; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, k = zufall(0.4, 1) * kraft;
      spritz(x, y, z, Math.cos(a) * Math.cos(b) * k, Math.abs(Math.sin(b)) * k + 2, Math.sin(a) * Math.cos(b) * k, farben[i % farben.length], zufall(0.8, 1.6), 1);
    }
  }
  const SPAENE = [0xc9d1da, 0xf2b53a, 0x9aa3ad, 0xffffff];
  // Staub, der im Hallenlicht schwebt
  const fallN = 260, fallPos = new Float32Array(fallN * 3);
  for (let i = 0; i < fallN; i++) { fallPos[i * 3] = zufall(-30, 30); fallPos[i * 3 + 1] = zufall(0, 20); fallPos[i * 3 + 2] = zufall(-80, 10); }
  const fallGeo = new THREE.BufferGeometry(); fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
  const fall = new THREE.Points(fallGeo, new THREE.PointsMaterial({ size: 0.12, color: 0xfff3c4, transparent: true, opacity: 0.6 }));
  fall.frustumCulled = false; welt.add(fall);

  // ---------- Zustand ----------
  let modus = "menu", tempo = 9, zielTempo = 9, pause = false, serie = 0;
  let schnitt = false, sprung = null, sturz = null, jubel = 0, wackeln = 0, t = 0, ohneZeit = false;
  const kamPos = new THREE.Vector3(5.5, 2.8, 6), kamZiel = new THREE.Vector3(0, 1.2, 0), blick = new THREE.Vector3(0, 1.2, 0);
  kamera.position.copy(kamPos);
  // Freier Streifen zwischen Aufgabe und Zifferblock (Pixel ab oben). Ist er
  // gesetzt, schiebt die Kamera das Bild so, dass der Stapler darin steht und
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
    deckeT.offset.y -= weg / (420 / 30);
    wandT.offset.x += weg / (420 / 30);
    for (const d of deko) {
      d.o.position.z += weg;
      if (d.o.position.z > 20) d.o.position.z -= LANG;
    }
    // Signalsäulen: meist grün (läuft), ab und zu gelb oder rot blinkend
    for (const b of blinker) {
      const an = b.art === 0 ? 1 : (Math.sin(t * 5 + b.phase) > 0 ? 1 : 0.1);
      b.lampen.forEach((l, i) => { l.emissiveIntensity = i === b.art ? 0.9 * an : 0.08; });
    }
    for (let i = 0; i < fallN; i++) {
      fallPos[i * 3 + 1] += Math.sin(t * 0.7 + i) * dt * 0.2; fallPos[i * 3 + 2] += weg * 0.6 + dt * 0.3; fallPos[i * 3] += Math.cos(t * 0.5 + i) * dt * 0.2;
      if (fallPos[i * 3 + 2] > 12) { fallPos[i * 3 + 1] = zufall(0, 20); fallPos[i * 3 + 2] = zufall(-80, -40); }
    }
    fallGeo.attributes.position.needsUpdate = true;

    for (const tor of tore) {
      if (!tor.g.visible) continue;
      if (tor.zustand === "kommt" && !pause) {
        tor.start += dtW;
        tor.z = ohneZeit ? Math.min(-12, -D0 + tor.start * 14) : -D0 * (1 - Math.min(1, tor.start / tor.dauer));
      } else if (tor.zustand === "gut") tor.z += weg + dtW * 40;
      else if (tor.zustand === "schlecht" && !sturz) tor.z += weg;
      else if (tor.zustand === "weg") { tor.weg += dt; tor.g.scale.setScalar(Math.max(0.01, 1 - tor.weg * 4)); if (tor.weg > 0.25) tor.g.visible = false; }
      tor.g.position.z = tor.z;
      if (tor.z > 14) tor.g.visible = false;
    }

    // Stapler: Slalom auf der Spur, Sprung, Überschlag, Jubel
    const kurve = Math.sin(t * 1.1);
    const zielX = modus === "ende" ? 0 : kurve * (modus === "menu" ? 2.2 : 1.4);
    fahrer.position.x += (zielX - fahrer.position.x) * Math.min(1, dt * 3);
    let y = 0;
    koerper.rotation.set(0, 0, 0); fahrer.rotation.set(0, 0, 0);
    armV.rotation.set(0.95 + Math.sin(t * 2) * 0.08, 0, 0); armH.rotation.set(0.95 - Math.sin(t * 2) * 0.08, 0, 0);
    beinV.position.y = 1.18; beinH.position.y = 1.18; koerper.position.y = 0;
    gabel.position.y = Math.max(0, Math.sin(t * 0.8)) * 0.25;
    for (const w of rad) w.rotation.x -= weg * 2.6;
    fahrer.rotation.z = -Math.cos(t * 1.1) * 0.08 * (modus === "ende" ? 0 : 1);
    fahrer.rotation.y = Math.cos(t * 1.1) * 0.22 * (modus === "ende" ? 0 : 1);
    if (sprung) {
      sprung.t += dt; const p = Math.min(1, sprung.t / sprung.dauer);
      y = Math.sin(p * Math.PI) * sprung.hoehe;
      fahrer.rotation.y = p * Math.PI * 2 * sprung.drehungen;
      if (sprung.flip) fahrer.rotation.x = -p * Math.PI * 2;
      armV.rotation.set(2.9, 0, 0.3); armH.rotation.set(2.9, 0, -0.3); koerper.position.y = 0.08;
      if (skin && Math.random() < 0.8) spritz(fahrer.position.x, y + 0.6, 0.6, zufall(-1, 1), zufall(-1, 1), 3, skin.spur[Math.floor(Math.random() * skin.spur.length)], 0.6, 0.2);
      if (p >= 1) { sprung = null; for (let i = 0; i < 26; i++) spritz(fahrer.position.x + zufall(-0.8, 0.8), 0.1, zufall(-0.8, 1.2), zufall(-3, 3), zufall(1.5, 4), zufall(0, 3), 0xb9c1cb, 0.7, 1); }
    }
    if (sturz) {
      sturz.t += dt;
      if (sturz.t < 0.9) {
        const p = sturz.t / 0.9;
        fahrer.rotation.x = p * Math.PI * 2; fahrer.rotation.z = p * 1.2; y = Math.sin(p * Math.PI) * 1.3;
        if (Math.random() < 0.9) spritz(fahrer.position.x + zufall(-1, 1), 0.6, zufall(-1, 1), zufall(-4, 4), zufall(2, 6), zufall(-2, 3), wahl(SPAENE), 0.9, 1);
      } else if (sturz.t < 1.6) {
        fahrer.rotation.z = 0.5; y = 0.1;
      } else if (sturz.t < 2.1) {
        const p = (sturz.t - 1.6) / 0.5; fahrer.rotation.z = 0.5 * (1 - p); y = 0.1 * (1 - p);
      } else sturz = null;
    }
    if (modus === "ende") {
      jubel += dt;
      const h = Math.abs(Math.sin(jubel * 4)) * 0.6; y = Math.max(y, h);
      fahrer.rotation.y = Math.sin(jubel * 2) * 0.6 + (jubel % 4 < 0.8 ? (jubel % 4) / 0.8 * Math.PI * 2 : 0);
      armV.rotation.set(Math.PI - Math.sin(jubel * 8) * 0.4, 0, 0.4); armH.rotation.set(Math.PI + Math.sin(jubel * 8) * 0.4, 0, -0.4);
      gabel.position.y = 0.4 + Math.abs(Math.sin(jubel * 3)) * 0.8;
      if (Math.random() < 0.6) {
        const farben = WERKSTOFFE.concat([HOFER, 0xffcc00]);
        spritz(zufall(-8, 8), 12, zufall(-8, 2), zufall(-1, 1), 0, zufall(-0.5, 0.5), wahl(farben), 3.5, 0.08);
      }
    }
    fahrer.position.y = y;
    schatten.position.x = fahrer.position.x; schatten.scale.setScalar(Math.max(0.4, 1 - y * 0.25));
    // Späne hinter den Rädern, in den Farben der Ausrüstung ab einer Serie von 5
    if (!pause && modus !== "ende" && !sprung && !sturz && tempo > 2) {
      const n = tempo > 15 ? 2 : 1;
      for (let i = 0; i < n; i++) spritz(fahrer.position.x + (Math.random() < 0.5 ? -1 : 1) * 0.95, 0.1, 1.2, zufall(-1, 1), zufall(0.4, 1.4), zufall(0.5, 1.5), wahl(SPAENE), 0.35, 1);
      if (serie >= 5 && skin) for (let i = 0; i < 2; i++) spritz(fahrer.position.x + zufall(-0.4, 0.4), 0.4, 1.5, zufall(-0.5, 0.5), zufall(0.3, 1.5), 2 + tempo * 0.3, skin.spur[Math.floor(Math.random() * skin.spur.length)], 0.7, 0.3);
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
      kamZiel.set(4.5 + Math.sin(t * 0.25) * 2, 3, 6.6); blick.set(fahrer.position.x, 1.5, -1);
    } else if (modus === "ende") {
      const quer = kamera.aspect > 1.2;
      kamZiel.set(quer ? 3.4 : 1.2, 2.8, -7.5); blick.set(quer ? 2.8 : 0, 1.8, 0);
    } else {
      if (kamera.aspect < 0.8) { kamZiel.set(fahrer.position.x * 0.5, 4.4, 9.8); blick.set(fahrer.position.x * 0.6, 2, -10); }
      else { kamZiel.set(fahrer.position.x * 0.5, 3.6, 7.2); blick.set(fahrer.position.x * 0.6, 1.9, -10); }
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
      zielTempo = 34; tempo = Math.max(tempo, 26);
      const hoch = serieJetzt >= 10;
      sprung = { t: 0, dauer: hoch ? 0.95 : 0.75, hoehe: hoch ? 3.2 : 2.2, drehungen: hoch ? 2 : 1, flip: serieJetzt > 0 && serieJetzt % 5 === 0 };
      const farben = skin ? skin.spur.concat([0xffcc00, 0xffffff]) : [0xffcc00];
      explosion(0, 4.4, tor.z, farben, 60, 9);
      explosion(fahrer.position.x, 1.5, 0, [0xf2b53a, 0xc9d1da, 0xffffff], 24, 5);
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
