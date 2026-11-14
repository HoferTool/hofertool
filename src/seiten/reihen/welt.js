// =================================================================
//  1×1 RIDER: die 3D-Welt mit three.js
//  Eine endlose Abfahrt im Klötzchen-Stil: der Fahrer carvt durch den
//  Schnee, Tore mit der Aufgabe kommen auf ihn zu. Das Tor erreicht den
//  Fahrer genau dann, wenn die Zeit um ist (die Zeit wird sichtbar).
//  Richtig: Tor wird grün, Fahrer springt mit Drehung durch, Funken.
//  Falsch: Tor wird rot und zeigt die Lösung, Fahrer stürzt in den Schnee.
//  Alles eigene Formen und Farben, keine Figuren aus Spielen.
// =================================================================
import * as THREE from "three";

const D0 = 60;           // so weit weg erscheint ein neues Tor
const LANG = 280;        // Länge der Strecke mit Bäumen und Fahnen

function zufall(a, b) { return a + Math.random() * (b - a); }

function leinwand(b, h) { const c = document.createElement("canvas"); c.width = b; c.height = h; return c; }

function schneeTextur() {
  const c = leinwand(256, 256), g = c.getContext("2d");
  g.fillStyle = "#f4f9ff"; g.fillRect(0, 0, 256, 256);
  // Rillen wie frisch präpariert (Cord), dazu feines Glitzern
  for (let x = 0; x < 256; x += 8) { g.fillStyle = x % 16 ? "#e8f1fb" : "#dde9f6"; g.fillRect(x, 0, 3, 256); }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(190,210,235,.5)" : "rgba(255,255,255,.9)";
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 40);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function streifenTextur() {
  const c = leinwand(32, 128), g = c.getContext("2d");
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#111111" : "#ffd400"; g.fillRect(0, i * 16, 32, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FARBEN = {
  kommt: ["#1d3b8f", "#2f7bff", "#ffd400"],
  gut: ["#0b8a3e", "#1fd16b", "#ffffff"],
  schlecht: ["#9e0d0d", "#ff3b3b", "#ffffff"],
  titel: ["#111111", "#333333", "#ffd400"],
};

function bannerZeichnen(tor, text, art) {
  const c = tor.leinwand, g = c.getContext("2d"), [f1, f2, rand] = FARBEN[art] || FARBEN.kommt;
  g.clearRect(0, 0, c.width, c.height);
  const v = g.createLinearGradient(0, 0, 0, c.height); v.addColorStop(0, f2); v.addColorStop(1, f1);
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = rand; g.lineWidth = 18; g.strokeRect(9, 9, c.width - 18, c.height - 18);
  // Karierte Ecken wie bei einer Zielflagge
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) {
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(24 + i * 18, 24 + j * 18, 18, 18); g.fillRect(c.width - 96 + i * 18, 24 + j * 18, 18, 18);
  }
  g.font = "900 190px 'Arial Black', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  let s = 190; while (g.measureText(text).width > c.width - 220 && s > 60) { s -= 10; g.font = "900 " + s + "px 'Arial Black', system-ui, sans-serif"; }
  g.lineWidth = 16; g.strokeStyle = "rgba(0,0,0,.55)"; g.strokeText(text, c.width / 2, c.height / 2 + 8);
  g.fillStyle = "#ffffff"; g.fillText(text, c.width / 2, c.height / 2 + 8);
  tor.textur.needsUpdate = true;
}

export function weltBauen(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const szene = new THREE.Scene();
  szene.fog = new THREE.Fog(0xd8ecff, 45, 230);
  const kamera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

  // ---------- Himmel ----------
  const himmel = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { oben: { value: new THREE.Color(0x1f6fe0) }, unten: { value: new THREE.Color(0xd8ecff) } },
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 oben; uniform vec3 unten; varying float h; void main(){ gl_FragColor = vec4(mix(unten, oben, clamp(h*2.2,0.0,1.0)),1.0); }",
  }));
  szene.add(himmel);
  const sonne = new THREE.Mesh(new THREE.CircleGeometry(18, 24), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  sonne.position.set(-140, 150, -420); szene.add(sonne);

  szene.add(new THREE.HemisphereLight(0xffffff, 0x9cb8dc, 1.15));
  const licht = new THREE.DirectionalLight(0xffffff, 1.6); licht.position.set(-30, 60, 25); szene.add(licht);

  // ---------- Berge (fest, weit hinten) ----------
  const bergMat = new THREE.MeshLambertMaterial({ color: 0x6f86a8, flatShading: true });
  const kappeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  [[-260, 150, 95], [-150, 210, 120], [-40, 170, 90], [70, 240, 140], [190, 180, 100], [300, 220, 120], [-360, 190, 110]].forEach(([x, hoehe, r]) => {
    const b = new THREE.Mesh(new THREE.ConeGeometry(r, hoehe, 6), bergMat);
    b.position.set(x, hoehe / 2 - 40, -470 + zufall(-40, 40)); b.rotation.y = zufall(0, 3);
    const k = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, hoehe * 0.38, 6), kappeMat);
    k.position.y = hoehe * 0.31; b.add(k);
    szene.add(b);
  });
  const wolken = [];
  const wolkeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 7; i++) {
    const w = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const s = zufall(10, 20), m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.8, s * 0.6, s), wolkeMat);
      m.position.set(j * 12 - 18, zufall(-3, 3), zufall(-4, 4)); w.add(m);
    }
    w.position.set(zufall(-400, 400), zufall(110, 190), -380 - zufall(0, 100)); szene.add(w); wolken.push(w);
  }

  // ---------- Piste (geneigt, damit es bergab geht) ----------
  const welt = new THREE.Group(); welt.rotation.x = -0.11; szene.add(welt);
  const schnee = schneeTextur();
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(220, 420), new THREE.MeshLambertMaterial({ map: schnee }));
  boden.rotation.x = -Math.PI / 2; boden.position.z = -170; welt.add(boden);

  const deko = [];
  const stammMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const nadelMat = [0x1f7a3a, 0x2a8f46, 0x17633a].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  const weissMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  function baum() {
    const g = new THREE.Group(), s = zufall(0.8, 1.6), m = nadelMat[Math.floor(Math.random() * 3)];
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), stammMat); st.position.y = 0.7; g.add(st);
    // Tannen aus Klötzen, oben mit Schnee
    [[3.4, 1.6], [2.6, 3.0], [1.8, 4.2], [1.0, 5.2]].forEach(([b, y]) => {
      const k = new THREE.Mesh(new THREE.BoxGeometry(b, 1.3, b), m); k.position.y = y; g.add(k);
      const w = new THREE.Mesh(new THREE.BoxGeometry(b * 0.8, 0.22, b * 0.8), weissMat); w.position.y = y + 0.72; g.add(w);
    });
    g.scale.setScalar(s); return g;
  }
  for (let i = 0; i < 46; i++) {
    const b = baum(), seite = i % 2 ? 1 : -1;
    b.position.set(seite * zufall(11, 55), 0, -zufall(0, LANG)); b.rotation.y = zufall(0, 3);
    welt.add(b); deko.push({ o: b, art: "baum" });
  }
  // Hügel aus Schnee am Rand
  const huegelMat = new THREE.MeshLambertMaterial({ color: 0xf2f7ff, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(zufall(8, 16), 0), huegelMat), seite = i % 2 ? 1 : -1;
    h.position.set(seite * zufall(40, 80), -3, -zufall(0, LANG)); h.scale.y = 0.5; welt.add(h); deko.push({ o: h, art: "huegel" });
  }
  // Fahnen gelb und schwarz links und rechts der Strecke
  const fahneGelb = new THREE.MeshLambertMaterial({ color: 0xffd400 }), fahneSchwarz = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const stangeMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  for (let i = 0; i < 40; i++) {
    const g = new THREE.Group(), seite = i % 2 ? 1 : -1, n = Math.floor(i / 2);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), stangeMat); st.position.y = 1.3; g.add(st);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.3), n % 2 ? fahneSchwarz : fahneGelb); f.position.set(0, 2.1, -0.65); g.add(f);
    g.position.set(seite * 8.5, 0, -n * (LANG / 20)); welt.add(g); deko.push({ o: g, art: "fahne", f });
  }

  // ---------- Fahrer aus Klötzen ----------
  const fahrer = new THREE.Group(); welt.add(fahrer);
  const koerper = new THREE.Group(); fahrer.add(koerper);
  const mat = {
    jacke: new THREE.MeshLambertMaterial(), hose: new THREE.MeshLambertMaterial(), helm: new THREE.MeshLambertMaterial(),
    brille: new THREE.MeshLambertMaterial({ emissive: 0x000000 }), brett: new THREE.MeshLambertMaterial(), brett2: new THREE.MeshLambertMaterial(),
    haut: new THREE.MeshLambertMaterial({ color: 0xf1c27d }), schwarz: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  };
  const box = (b, h, t, m, x, y, z, eltern) => { const k = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), m); k.position.set(x, y, z); (eltern || koerper).add(k); return k; };
  // Brett längs zur Fahrt, Fahrer steht quer darauf
  const brett = new THREE.Group(); fahrer.add(brett);
  box(0.62, 0.09, 2.3, mat.brett, 0, 0.06, 0, brett);
  box(0.22, 0.1, 1.7, mat.brett2, 0, 0.07, 0, brett);
  box(0.62, 0.09, 0.3, mat.brett, 0, 0.14, -1.2, brett).rotation.x = 0.5;
  box(0.62, 0.09, 0.3, mat.brett, 0, 0.14, 1.2, brett).rotation.x = -0.5;
  box(0.66, 0.12, 0.3, mat.schwarz, 0, 0.15, -0.42, brett); box(0.66, 0.12, 0.3, mat.schwarz, 0, 0.15, 0.42, brett);
  const beinV = box(0.3, 0.85, 0.3, mat.hose, 0, 0.62, -0.42), beinH = box(0.3, 0.85, 0.3, mat.hose, 0, 0.62, 0.42);
  box(0.46, 0.85, 0.95, mat.jacke, 0, 1.42, 0);
  box(0.5, 0.18, 0.99, mat.hose, 0, 1.02, 0);
  const armV = new THREE.Group(), armH = new THREE.Group(); armV.position.set(0, 1.75, -0.55); armH.position.set(0, 1.75, 0.55);
  koerper.add(armV, armH);
  box(0.24, 0.75, 0.24, mat.jacke, 0, -0.36, 0, armV); box(0.27, 0.22, 0.27, mat.schwarz, 0, -0.78, 0, armV);
  box(0.24, 0.75, 0.24, mat.jacke, 0, -0.36, 0, armH); box(0.27, 0.22, 0.27, mat.schwarz, 0, -0.78, 0, armH);
  const kopf = new THREE.Group(); kopf.position.y = 2.18; koerper.add(kopf);
  box(0.56, 0.56, 0.56, mat.haut, 0, 0, 0, kopf);
  box(0.64, 0.36, 0.64, mat.helm, 0, 0.18, 0, kopf);
  box(0.5, 0.18, 0.08, mat.brille, 0, 0.05, -0.32, kopf);
  box(0.2, 0.12, 0.04, mat.schwarz, 0, -0.16, -0.29, kopf); // Lächeln, als Klotz
  koerper.rotation.y = 0; kopf.rotation.y = 0;
  const schatten = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.22, depthWrite: false }));
  schatten.rotation.x = -Math.PI / 2; schatten.position.y = 0.02; welt.add(schatten);

  let skin = null;
  function skinSetzen(s) {
    skin = s;
    mat.jacke.color.setHex(s.jacke); mat.hose.color.setHex(s.hose); mat.helm.color.setHex(s.helm);
    mat.brille.color.setHex(s.brille); mat.brille.emissive.setHex(s.brille); mat.brille.emissiveIntensity = 0.4;
    mat.brett.color.setHex(s.brett); mat.brett2.color.setHex(s.brett2);
  }

  // ---------- Tore ----------
  const polMat = new THREE.MeshLambertMaterial({ map: streifenTextur() });
  function torBauen() {
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.6, 0.32), polMat), p2 = p1.clone();
    p1.position.set(-3.6, 2.3, 0); p2.position.set(3.6, 2.3, 0); g.add(p1, p2);
    const c = leinwand(1024, 300), textur = new THREE.CanvasTexture(c); textur.colorSpace = THREE.SRGBColorSpace; textur.anisotropy = 4;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(7.4, 2.1, 0.18), [stangeMat, stangeMat, stangeMat, stangeMat,
      new THREE.MeshBasicMaterial({ map: textur }), new THREE.MeshBasicMaterial({ map: textur })]);
    banner.position.y = 4.4; g.add(banner);
    g.visible = false; welt.add(g);
    return { g, banner, leinwand: c, textur, zustand: "aus", z: -D0, start: 0, dauer: 0, weg: 0 };
  }
  const tore = [torBauen(), torBauen()];
  let torAktiv = null;

  // ---------- Teilchen (Schneespritzer, Funken, Konfetti) ----------
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
  // Schneefall um die Kamera
  const fallN = 500, fallPos = new Float32Array(fallN * 3);
  for (let i = 0; i < fallN; i++) { fallPos[i * 3] = zufall(-40, 40); fallPos[i * 3 + 1] = zufall(0, 30); fallPos[i * 3 + 2] = zufall(-80, 10); }
  const fallGeo = new THREE.BufferGeometry(); fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
  const fall = new THREE.Points(fallGeo, new THREE.PointsMaterial({ size: 0.16, color: 0xffffff, transparent: true, opacity: 0.85 }));
  fall.frustumCulled = false; welt.add(fall);

  // ---------- Zustand ----------
  let modus = "menu", tempo = 9, zielTempo = 9, pause = false, serie = 0;
  let schnitt = false, sprung = null, sturz = null, jubel = 0, wackeln = 0, t = 0, ohneZeit = false;
  const kamPos = new THREE.Vector3(5.5, 2.8, 6), kamZiel = new THREE.Vector3(0, 1.2, 0), blick = new THREE.Vector3(0, 1.2, 0);
  kamera.position.copy(kamPos);

  function groesse() {
    const b = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(b, h, false); kamera.aspect = b / h;
    // Hochkant (Handy) etwas weiter weg, damit Tor und Fahrer Platz haben
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

    // Tempo der Welt
    if (torAktiv && torAktiv.zustand === "kommt" && !pause) {
      if (ohneZeit) zielTempo = torAktiv.z < -14 ? 14 : 0;
      else zielTempo = D0 / torAktiv.dauer;
    }
    tempo += (zielTempo - tempo) * Math.min(1, dt * 4);
    const weg = tempo * dtW;
    schnee.offset.y += weg / (420 / 40);
    for (const d of deko) {
      d.o.position.z += weg;
      if (d.o.position.z > 20) {
        d.o.position.z -= LANG;
        if (d.art === "baum") { d.o.position.x = (Math.random() < 0.5 ? -1 : 1) * zufall(11, 55); d.o.rotation.y = zufall(0, 3); }
      }
      if (d.art === "fahne") d.f.rotation.y = Math.sin(t * 6 + d.o.position.z) * 0.25;
    }
    for (let i = 0; i < fallN; i++) {
      fallPos[i * 3 + 1] -= dt * 3; fallPos[i * 3 + 2] += weg * 0.6 + dt * 0.5; fallPos[i * 3] += Math.sin(t + i) * dt * 0.3;
      if (fallPos[i * 3 + 1] < 0 || fallPos[i * 3 + 2] > 12) { fallPos[i * 3 + 1] = zufall(15, 30); fallPos[i * 3 + 2] = zufall(-80, 0); }
    }
    fallGeo.attributes.position.needsUpdate = true;
    for (const w of wolken) { w.position.x += dt * 2; if (w.position.x > 450) w.position.x = -450; }

    // Tore
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

    // Fahrer: carven links und rechts, Sprung, Sturz, Jubel
    const carve = Math.sin(t * 1.1);
    const zielX = modus === "ende" ? 0 : carve * (modus === "menu" ? 2.2 : 1.4);
    fahrer.position.x += (zielX - fahrer.position.x) * Math.min(1, dt * 3);
    let y = 0;
    koerper.rotation.set(0, 0, 0); fahrer.rotation.set(0, 0, 0);
    armV.rotation.set(0.5 + Math.sin(t * 2) * 0.1, 0, 0); armH.rotation.set(-0.5 - Math.sin(t * 2) * 0.1, 0, 0);
    beinV.position.y = 0.62; beinH.position.y = 0.62; koerper.position.y = 0;
    fahrer.rotation.z = -Math.cos(t * 1.1) * 0.22 * (modus === "ende" ? 0 : 1);
    fahrer.rotation.y = Math.cos(t * 1.1) * 0.15;
    if (sprung) {
      sprung.t += dt; const p = Math.min(1, sprung.t / sprung.dauer);
      y = Math.sin(p * Math.PI) * sprung.hoehe;
      fahrer.rotation.y = p * Math.PI * 2 * sprung.drehungen;
      if (sprung.flip) fahrer.rotation.x = -p * Math.PI * 2;
      armV.rotation.set(1.6, 0, 0.3); armH.rotation.set(-1.6, 0, -0.3); koerper.position.y = -0.15;
      if (skin && Math.random() < 0.8) spritz(fahrer.position.x, y + 0.3, 0.3, zufall(-1, 1), zufall(-1, 1), 3, skin.spur[Math.floor(Math.random() * skin.spur.length)], 0.6, 0.2);
      if (p >= 1) { sprung = null; for (let i = 0; i < 26; i++) spritz(fahrer.position.x + zufall(-0.6, 0.6), 0.1, zufall(-0.5, 1), zufall(-3, 3), zufall(1.5, 4), zufall(0, 3), 0xffffff, 0.7, 1); }
    }
    if (sturz) {
      sturz.t += dt;
      if (sturz.t < 0.9) {
        const p = sturz.t / 0.9;
        fahrer.rotation.x = p * Math.PI * 2.5; fahrer.rotation.z = p * 1.5; y = Math.sin(p * Math.PI) * 1.2;
        if (Math.random() < 0.9) spritz(fahrer.position.x + zufall(-1, 1), 0.3, zufall(-1, 1), zufall(-4, 4), zufall(2, 6), zufall(-2, 3), 0xffffff, 0.9, 1);
      } else if (sturz.t < 1.6) {
        fahrer.rotation.x = Math.PI * 0.5; fahrer.rotation.z = 0; y = 0.25;
      } else if (sturz.t < 2.1) {
        const p = (sturz.t - 1.6) / 0.5; fahrer.rotation.x = Math.PI * 0.5 * (1 - p); y = 0.25 * (1 - p);
      } else sturz = null;
    }
    if (modus === "ende") {
      jubel += dt;
      const h = Math.abs(Math.sin(jubel * 4)) * 0.9; y = Math.max(y, h);
      fahrer.rotation.y = Math.sin(jubel * 2) * 0.6 + (jubel % 4 < 0.8 ? (jubel % 4) / 0.8 * Math.PI * 2 : 0);
      armV.rotation.set(Math.PI, 0, 0.4); armH.rotation.set(-Math.PI, 0, -0.4);
      armV.rotation.x = Math.PI - Math.sin(jubel * 8) * 0.4;
      if (Math.random() < 0.6) {
        const farben = [0xffd400, 0x111111, 0x2f7bff, 0xff3b3b, 0x1fd16b, 0xffffff];
        spritz(zufall(-8, 8), 12, zufall(-8, 2), zufall(-1, 1), 0, zufall(-0.5, 0.5), farben[Math.floor(Math.random() * 6)], 3.5, 0.08);
      }
    }
    fahrer.position.y = y;
    schatten.position.x = fahrer.position.x; schatten.scale.setScalar(Math.max(0.4, 1 - y * 0.25));
    // Spur aus Schnee beim Carven, in Farbe ab einer Serie von 5
    if (!pause && modus !== "ende" && !sprung && !sturz && tempo > 2) {
      const n = tempo > 15 ? 2 : 1;
      for (let i = 0; i < n; i++) spritz(fahrer.position.x - Math.cos(t * 1.1) * 0.4, 0.1, 0.9, -Math.cos(t * 1.1) * zufall(1, 3), zufall(0.6, 1.8), zufall(0.5, 1.5), 0xffffff, 0.35, 1);
      if (serie >= 5 && skin) for (let i = 0; i < 2; i++) spritz(fahrer.position.x + zufall(-0.3, 0.3), 0.25, 1.2, zufall(-0.5, 0.5), zufall(0.3, 1.5), 2 + tempo * 0.3, skin.spur[Math.floor(Math.random() * skin.spur.length)], 0.7, 0.3);
    }
    // Teilchen bewegen
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
      kamZiel.set(4.5 + Math.sin(t * 0.25) * 2, 2.6, 6.2); blick.set(fahrer.position.x, 1.4, -1);
    } else if (modus === "ende") {
      // Von vorne, Fahrer etwas rechts der Mitte (die Karte steht links)
      const quer = kamera.aspect > 1.2;
      kamZiel.set(quer ? 3.2 : 1.2, 2.4, -7); blick.set(quer ? 2.6 : 0, 1.7, 0);
    } else {
      kamZiel.set(fahrer.position.x * 0.4, 3.6, 8.2); blick.set(fahrer.position.x * 0.5, 1.6, -10);
    }
    if (schnitt) { kamPos.copy(kamZiel); schnitt = false; }
    kamPos.lerp(kamZiel, Math.min(1, dt * 2.5));
    kamera.position.copy(kamPos);
    if (wackeln > 0) { wackeln -= dt; kamera.position.x += zufall(-1, 1) * wackeln * 0.6; kamera.position.y += zufall(-1, 1) * wackeln * 0.6; }
    kamera.lookAt(blick);
    renderer.render(szene, kamera);
  }
  raf = requestAnimationFrame(schritt);

  return {
    skin: skinSetzen,
    modus(m) {
      // Kamera springt beim Wechsel von und zum Ende, sonst flöge sie durch den Fahrer
      if (m === "ende" || modus === "ende") schnitt = true;
      modus = m; jubel = 0; if (m === "menu") zielTempo = 9; if (m === "ende") { zielTempo = 0; for (const tor of tore) if (tor.g.visible) { tor.zustand = "weg"; tor.weg = 0; } } },
    pause(w) { pause = !!w; if (w) zielTempo = 0; },
    serie(n) { serie = n; },
    // Neues Tor mit Aufgabe; dauerS = 0 heisst ohne Zeit
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
      const farben = skin ? skin.spur.concat([0xffd400, 0xffffff]) : [0xffd400];
      explosion(0, 4.4, tor.z, farben, 60, 9);
      explosion(fahrer.position.x, 1.5, 0, [0xffd400, 0xffe57f], 24, 5);
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
