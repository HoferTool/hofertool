// =================================================================
//  ZEICHNEN MIT DEM FINGER
//  Gemeinsame Bausteine der Skizze im Pad Mode und der Notizbücher,
//  damit beide gleich zeichnen und radieren. Ein Strich ist
//  { f: "#hex", d: Dicke / Breite, p: [x0, y0, x1, y1, …] }, alle
//  Werte geteilt durch die Breite der Fläche.
// =================================================================
// Kleine Symbole statt Wörtern, damit die Leiste in die schmale Spalte passt
export const RADIERER = "M7 21h10M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5l-3-3a1 1 0 0 1 0-.5z";
export const ZURUECK = "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11";
export const EIMER = "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3";
// Farbeimer zum Ausmalen (nicht verwechseln mit EIMER, dem Abfalleimer)
export const FARBEIMER = "M19 11 11 3l-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0zM5 2l5 5M2 13h15M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4z";
export const TEXT = "M5 7V5h14v2M12 5v14M9 19h6";
export const GROSS = "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7";
export const KLEIN = "M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7";
export function Symbol({ d }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function rund(n) { return Math.round(n * 10000) / 10000; }

// Ein Strich: { f: "#hex", d: Dicke / Breite, p: [x0, y0, x1, y1, …] }
export function strichZeichnen(c, s, w) {
  const p = s.p;
  if (!p || p.length < 2) return;
  c.strokeStyle = s.f; c.fillStyle = s.f;
  c.lineWidth = Math.max(1, s.d * w);
  c.lineCap = "round"; c.lineJoin = "round";
  if (p.length === 2) {
    c.beginPath(); c.arc(p[0] * w, p[1] * w, c.lineWidth / 2, 0, Math.PI * 2); c.fill();
    return;
  }
  // Weich durch die Mitten der Teilstücke, damit Finger-Striche nicht eckig wirken
  c.beginPath();
  c.moveTo(p[0] * w, p[1] * w);
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
    c.quadraticCurveTo(p[i] * w, p[i + 1] * w, mx * w, my * w);
  }
  c.lineTo(p[p.length - 2] * w, p[p.length - 1] * w);
  c.stroke();
}

// Liegt der Punkt (in Breitenanteilen) auf dem Strich?
export function getroffen(s, x, y, r) {
  const p = s.p, rr = r + s.d / 2;
  for (let i = 0; i < p.length; i += 2) {
    const dx = p[i] - x, dy = p[i + 1] - y;
    if (dx * dx + dy * dy <= rr * rr) return true;
    if (i + 3 < p.length) {
      // Abstand zum Teilstück, damit schnelle, lange Striche auch zählen
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const l = (bx - ax) ** 2 + (by - ay) ** 2;
      if (l > 0) {
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l));
        const qx = ax + t * (bx - ax) - x, qy = ay + t * (by - ay) - y;
        if (qx * qx + qy * qy <= rr * rr) return true;
      }
    }
  }
  return false;
}


// Farbeimer: malt die geschlossene Fläche um (sx, sy) in Gerätepunkten
// mit der Farbe hex aus, direkt in den Bildpunkten der Leinwand. Gleiche
// Fläche heisst: Farbe nah genug an der Farbe beim Startpunkt, damit die
// weichen Ränder der Striche nicht als Lücke stehen bleiben. Danach wird
// die Fläche um einen Bildpunkt erweitert, sonst bliebe am Rand ein
// heller Saum. besitzer (optional, eine Zahl je Bildpunkt) merkt sich,
// welche Füllung den Punkt gemalt hat, damit der Radierer sie findet.
export function flaecheFuellen(c, sx, sy, hex, besitzer, nr) {
  const W = c.canvas.width, H = c.canvas.height;
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
  const bild = c.getImageData(0, 0, W, H), d = bild.data;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return;
  const fr = parseInt(m[1], 16), fg = parseInt(m[2], 16), fb = parseInt(m[3], 16);
  const s = (y0 * W + x0) * 4;
  const sr = d[s], sg = d[s + 1], sb = d[s + 2], sa = d[s + 3];
  const GRENZE = 70;
  // Durchsichtig ist durchsichtig, egal welche Farbe darin steht
  const gleich = (i) => {
    const a = d[i + 3];
    if (sa < 8) return a <= GRENZE;
    return Math.abs(a - sa) <= GRENZE && Math.abs(d[i] - sr) <= GRENZE &&
      Math.abs(d[i + 1] - sg) <= GRENZE && Math.abs(d[i + 2] - sb) <= GRENZE;
  };
  const maske = new Uint8Array(W * H);
  // Zeilenweise füllen: schnell genug auch für ein grosses Blatt
  const stapel = [x0, y0];
  while (stapel.length) {
    const y = stapel.pop(), x = stapel.pop();
    let l = x;
    while (l >= 0 && !maske[y * W + l] && gleich((y * W + l) * 4)) l--;
    l++;
    let oben = false, unten = false;
    for (let r = l; r < W; r++) {
      const k = y * W + r;
      if (maske[k] || !gleich(k * 4)) break;
      maske[k] = 1;
      if (y > 0) {
        const o = k - W, ja = !maske[o] && gleich(o * 4);
        if (ja && !oben) { stapel.push(r, y - 1); oben = true; } else if (!ja) oben = false;
      }
      if (y < H - 1) {
        const u = k + W, ja = !maske[u] && gleich(u * 4);
        if (ja && !unten) { stapel.push(r, y + 1); unten = true; } else if (!ja) unten = false;
      }
    }
  }
  for (let k = 0; k < W * H; k++) {
    let ja = maske[k] === 1;
    if (!ja) {
      // ein Bildpunkt Rand dazu
      const x = k % W;
      ja = (x > 0 && maske[k - 1] === 1) || (x < W - 1 && maske[k + 1] === 1) ||
        (k >= W && maske[k - W] === 1) || (k + W < W * H && maske[k + W] === 1);
    }
    if (!ja) continue;
    const i = k * 4;
    d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
    if (besitzer) besitzer[k] = nr;
  }
  c.putImageData(bild, 0, 0);
}
