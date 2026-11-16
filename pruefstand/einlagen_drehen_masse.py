# Einlagen Generator: Werkzeuge in der Einlage stufenlos drehen und Länge/Breite sehen
# (1.569.0, Wunsch Patrick 16. November 2026).
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(1500)
    f = lambda: pg.frames[1]
    f().evaluate("""() => { setMode('layout');
      lay.items = [{id: 1, name: 'Probe', polys: [{outer: [[-30,-10],[30,-10],[30,10],[-30,10]], holes: []}], x: 150, y: 100, ang: 0, depth: 15, grips: []}];
      lay.sel = 0; lay.mode = 'move'; layChanged(); }""")
    pg.wait_for_timeout(500)
    # Drehen am runden Anfasser: Zielwinkel 37.3° (früher rastete das bei 4° Nähe auf 30/45 bzw. auf ganze Grad)
    def dreheAuf(grad):
        f().evaluate("""(g) => { const it = lay.items[0], r = lcv.getBoundingClientRect(), s = lay.scale, M = lay.M;
          const h = layHandle(it), cl = q => [r.left + (q[0] + M) * s, r.top + (q[1] + M) * s];
          const a = g * Math.PI / 180, z = [it.x + 50 * Math.sin(a), it.y - 50 * Math.cos(a)];
          const p0 = cl(h), p1 = cl(z), ev = (t, p) => lcv.dispatchEvent(new PointerEvent(t, {clientX: p[0], clientY: p[1], pointerId: 1, bubbles: true}));
          ev('pointerdown', p0); ev('pointermove', p1); ev('pointerup', p1); }""", grad)
        pg.wait_for_timeout(200)
        return f().evaluate("lay.items[0].ang")
    for ziel in [37.3, 44, 91.5, -12.7]:
        w = dreheAuf(ziel)
        pruefe(abs(w - ziel) < 0.3, "stufenlos gedreht auf %s°: %s" % (ziel, w))
    # Winkel mit Komma eintippen
    f().evaluate("""() => { const e = document.getElementById('itA'); e.value = '22.5'; e.dispatchEvent(new Event('change')); }""")
    pg.wait_for_timeout(200)
    pruefe(f().evaluate("lay.items[0].ang") == 22.5, "Winkel 22.5 eingetippt: %s" % f().evaluate("lay.items[0].ang"))
    pruefe(f().evaluate("document.getElementById('itA').step") == "any", "Winkelfeld nimmt Kommazahlen")
    # Masse: Texte, die gezeichnet werden, mitschneiden
    texte = f().evaluate("""() => { const t = []; const o = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { t.push(String(s)); return o.call(this, s, ...a); };
      layRender(); CanvasRenderingContext2D.prototype.fillText = o; return t; }""")
    pruefe("Breite 300 mm" in texte, "Breite der Einlage steht: " + str(texte))
    pruefe("Länge 200 mm" in texte, "Länge der Einlage steht")
    pruefe(any(x.endswith(" mm") and x[0].isdigit() and "·" not in x for x in texte), "Masse des gewählten Werkzeugs stehen")
    if BILD:
        pg.locator("iframe.einlagen-rahmen").screenshot(path=BILD + "-einlage.png")
    pruefe(not pf, "keine Seitenfehler: " + str(pf))
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
