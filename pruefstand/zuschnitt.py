# Bilder zuschneiden (111.39.0): gemeinsames Fenster für Lieferanten-Logos
# und Nutzerbilder. Ziehen, Regler, zwei Finger, Ergebnis aus dem
# Original. Fehlt suppliers.logo_url, kommt eine deutliche Meldung und
# das Logo-Fenster bleibt offen.
import base64, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

# Breites Testbild 600 x 200: links rot, rechts blau
BILD = """(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 200;
  const x = c.getContext('2d'); x.fillStyle = '#d00'; x.fillRect(0, 0, 300, 200);
  x.fillStyle = '#00d'; x.fillRect(300, 0, 300, 200); return c.toDataURL('image/png').split(',')[1]; })()"""

# Farbe eines Punkts im Ergebnis (data:-Adresse oder Blob-Adresse)
PIXEL = """async ([adr, x, y]) => { const b = new Image(); b.src = adr; await b.decode();
  const c = document.createElement('canvas'); c.width = b.naturalWidth; c.height = b.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(b, 0, 0);
  return [b.naturalWidth, ...g.getImageData(x, y, 1, 1).data]; }"""

def seite(p, breite, hoehe, touch=False):
    ctx = p.new_context(viewport={"width": breite, "height": hoehe}, has_touch=touch)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**",
              "**://*.supabase.co/**", "**://api.open-meteo.com/**", "**://www.google.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    return pg

def logoFenster(pg):
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(600)
    pg.click("[data-best='lieferanten']"); pg.wait_for_timeout(500)
    pg.locator(".bs-lief .bs-logoknopf").first.click(); pg.wait_for_selector(".dialog-huelle [data-logoart]")
    pg.click(".dialog-huelle [data-logoart='eigen']")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br, 1400, 900)
    png = base64.b64decode(pg.evaluate(BILD))
    datei = {"name": "logo.png", "mimeType": "image/png", "buffer": png}

    # 1) Logo: ganzes breites Bild passt hinein, Rand durchsichtig
    logoFenster(pg)
    pg.set_input_files("[data-logodatei]", datei)
    pg.wait_for_selector("#zs-leinwand"); pg.wait_for_timeout(300)
    pg.screenshot(path="zuschnitt-logo.png")
    pg.click("#zs-ja"); pg.wait_for_timeout(400)
    pruefe("Zuschnitt zu", pg.locator("#zs-leinwand").count() == 0)
    pruefe("Logo-Fenster noch offen", pg.locator(".dialog-huelle [data-logoart]").count() == 3)
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    wert = pg.evaluate("TEST.daten.suppliers.find(x => x.id === 's2').logo_url") or ""
    pruefe("Logo als PNG gespeichert", wert.startswith("data:image/png"))
    if wert:
        b, r, g, bl, a = pg.evaluate(PIXEL, [wert, 80, 5])
        pruefe("160 Pixel gross", b == 160)
        pruefe("oben am Rand durchsichtig", a == 0)
        _, r, g, bl, a = pg.evaluate(PIXEL, [wert, 20, 80])
        pruefe("links rot (ganzes Bild drin)", r > 180 and bl < 60 and a > 200)
        _, r, g, bl, a = pg.evaluate(PIXEL, [wert, 140, 80])
        pruefe("rechts blau (ganzes Bild drin)", bl > 180 and r < 60)

    # 2) Ziehen und Regler: grösser machen und nach links schieben → nur blau
    logoFenster(pg)
    pg.set_input_files("[data-logodatei]", datei)
    pg.wait_for_selector("#zs-leinwand"); pg.wait_for_timeout(200)
    pg.locator("#zs-zoom").fill("60"); pg.wait_for_timeout(100)
    k = pg.locator("#zs-leinwand").bounding_box()
    mx, my = k["x"] + k["width"] / 2, k["y"] + k["height"] / 2
    pg.mouse.move(mx, my); pg.mouse.down(); pg.mouse.move(mx - 400, my, steps=8); pg.mouse.up()
    pg.click("#zs-ja"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    wert = pg.evaluate("TEST.daten.suppliers.find(x => x.id === 's2').logo_url") or ""
    if wert:
        _, r, g, bl, a = pg.evaluate(PIXEL, [wert, 80, 80])
        pruefe("nach Ziehen Mitte blau", bl > 180 and r < 60)
    else: pruefe("Logo nach Ziehen gespeichert", False)

    # 3) Abbrechen im Zuschnitt lässt das Logo unverändert
    vorher = wert
    logoFenster(pg)
    pg.set_input_files("[data-logodatei]", datei); pg.wait_for_selector("#zs-nein")
    pg.click("#zs-nein"); pg.wait_for_timeout(300)
    pruefe("Abbrechen schliesst nur den Zuschnitt", pg.locator(".dialog-huelle [data-logoart]").count() == 3)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Abbrechen ändert nichts", pg.evaluate("TEST.daten.suppliers.find(x => x.id === 's2').logo_url") == vorher)

    # 4) Spalte fehlt: deutliche Meldung, Fenster bleibt offen
    pg.evaluate("TEST.fehlendeSpalten = { suppliers: ['logo_url'] }")
    logoFenster(pg)
    pg.click(".dialog-huelle [data-logoart='keins']"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    text = pg.inner_text("body")
    pruefe("Meldung nennt das SQL", "lieferant-logo.sql" in text and "nicht gespeichert" in text)
    pruefe("Fenster bleibt offen", pg.locator(".dialog-huelle [data-logoart]").count() == 3)
    pg.screenshot(path="zuschnitt-fehlt.png")
    pg.evaluate("TEST.fehlendeSpalten = null")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 5) Nutzerbild: quadratisch 400, kein Durchsichtiges, mittig
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_selector("[data-bild='u2']", state='attached')
    pg.set_input_files("[data-bild='u2']", {"name": "foto.png", "mimeType": "image/png", "buffer": png})
    pg.wait_for_selector("#zs-leinwand"); pg.wait_for_timeout(200)
    pg.screenshot(path="zuschnitt-nutzer.png")
    pg.click("#zs-ja"); pg.wait_for_timeout(900)
    adr = pg.evaluate("TEST.daten.profiles.find(u => u.id === 'u2').bild_url") or ""
    pruefe("Nutzerbild gespeichert", bool(adr))
    br.close()

    # 6) Tablet mit Fingern: zwei Finger vergrössern
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br, 820, 1180, touch=True)
    logoFenster(pg)
    pg.set_input_files("[data-logodatei]", datei)
    pg.wait_for_selector("#zs-leinwand"); pg.wait_for_timeout(200)
    vor = int(pg.input_value("#zs-zoom"))
    k = pg.locator("#zs-leinwand").bounding_box()
    mx, my = k["x"] + k["width"] / 2, k["y"] + k["height"] / 2
    pg.evaluate("""([mx, my]) => { const c = document.querySelector('#zs-leinwand');
      const e = (typ, id, x, y) => c.dispatchEvent(new PointerEvent(typ, { pointerId: id, clientX: x, clientY: y,
        pointerType: 'touch', bubbles: true, isPrimary: id === 1 }));
      e('pointerdown', 1, mx - 20, my); e('pointerdown', 2, mx + 20, my);
      for (let i = 1; i <= 10; i++) { e('pointermove', 1, mx - 20 - i * 6, my); e('pointermove', 2, mx + 20 + i * 6, my); }
      e('pointerup', 1, mx - 80, my); e('pointerup', 2, mx + 80, my); }""", [mx, my])
    pg.wait_for_timeout(200)
    nach = int(pg.input_value("#zs-zoom"))
    pruefe("Zwei Finger vergrössern (%d → %d)" % (vor, nach), nach > vor + 10)
    pruefe("Leinwand passt aufs Tablet", k["width"] <= 820)
    pg.screenshot(path="zuschnitt-tablet.png")
    br.close()

    # 7) Handy: Fenster ragt nicht hinaus
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br, 375, 740, touch=True)
    pg.evaluate("location.hash='#einstellungen'")
    logoFenster(pg)
    pg.set_input_files("[data-logodatei]", datei)
    pg.wait_for_selector("#zs-leinwand"); pg.wait_for_timeout(200)
    k = pg.locator("#zs-leinwand").bounding_box()
    pruefe("Handy: Leinwand im Bild", k["x"] >= 0 and k["x"] + k["width"] <= 375)
    pg.screenshot(path="zuschnitt-handy.png")
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
