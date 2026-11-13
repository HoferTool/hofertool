# Entgraten (seit 1.527.0): Kanten im 3D-Bild mit einem Rechteck wählen.
# Gewählt sind genau die Kanten ganz im Rechteck, der Rest nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/entgraten']"); pg.click("[data-unter='nc/entgraten']")
    pg.wait_for_selector("#eg-code")
    pg.click("#eg-rechteck-knopf"); pg.wait_for_timeout(100)
    pruefe("Knopf an", "an" in pg.inner_text("#eg-rechteck-knopf"))
    gewaehlt = lambda: pg.locator("#eg-3d .eg-kante.gewaehlt").count()
    haken = lambda: [pg.is_checked(f"[data-egkante='loch{i}']") for i in range(4)]
    dreh0 = pg.get_attribute("#eg-3d .eg-kante", "d")
    def ziehe(x0, y0, x1, y1, shift=False):
        if shift: pg.keyboard.down("Shift")
        pg.mouse.move(x0, y0); pg.mouse.down()
        pg.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=4)
        pruefe("Rechteck sichtbar beim Ziehen", pg.locator("#eg-rechteck").count() == 1)
        pg.mouse.move(x1, y1, steps=4); pg.mouse.up()
        if shift: pg.keyboard.up("Shift")
        pg.wait_for_timeout(150)
    # Rechteck um genau eine Bohrung
    bb = pg.locator("[data-eg3d='loch0']").bounding_box()
    ziehe(bb["x"] - 4, bb["y"] - 4, bb["x"] + bb["width"] + 4, bb["y"] + bb["height"] + 4)
    pruefe("Eine Kante gewählt, Rest nicht", gewaehlt() == 1 and haken() == [True, False, False, False])
    pruefe("Rechteck danach weg", pg.locator("#eg-rechteck").count() == 0)
    pruefe("Nicht gedreht", pg.get_attribute("#eg-3d .eg-kante", "d") == dreh0)
    pruefe("NC nur eine Bohrung", pg.text_content("#eg-code").count("( Bohrung") == 1)
    # Rechteck über alles
    sb = pg.locator("#eg-3d").bounding_box()
    ziehe(sb["x"] + 3, sb["y"] + 3, sb["x"] + sb["width"] - 3, sb["y"] + sb["height"] - 3)
    pruefe("Alle vier gewählt", gewaehlt() == 4)
    # Halb über eine Kante: zählt nicht
    ziehe(bb["x"] - 4, bb["y"] - 4, bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] + 4)
    pruefe("Halb drin zählt nicht", gewaehlt() == 0)
    # Modus aus: Ziehen dreht wieder, Shift + Ziehen wählt
    pg.click("#eg-rechteck-knopf"); pg.wait_for_timeout(100)
    ziehe(bb["x"] - 4, bb["y"] - 4, bb["x"] + bb["width"] + 4, bb["y"] + bb["height"] + 4, shift=True)
    pruefe("Shift + Ziehen wählt eine", gewaehlt() == 1)
    pg.mouse.move(sb["x"] + 100, sb["y"] + 100); pg.mouse.down(); pg.mouse.move(sb["x"] + 160, sb["y"] + 130, steps=5); pg.mouse.up()
    pg.wait_for_timeout(150)
    pruefe("Ohne Shift dreht es", pg.get_attribute("#eg-3d .eg-kante", "d") != dreh0 and gewaehlt() == 1)
    pg.locator("#eg-3d").screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/eg.png")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
