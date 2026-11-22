# HOFERCAM (seit 1.710.0): Werkzeug aus „Reale Werkzeuge“ gross in 3D,
# drehen, verschieben, zoomen und zwischen zwei Punkten messen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ART = """() => {
  TEST.daten.articles.push(
    { id: "w1", article_number: "DCMT 11T304-PF 4325", name: "Wendeplatte", description: "Sandvik Wendeplatte", supplier_id: "s1", is_active: true },
    { id: "w2", article_number: "HSS-3.2", name: "Bohrer", description: "Spiralbohrer Ø3.2 HSS", supplier_id: "s2", is_active: true },
    { id: "w3", article_number: "XYZ-999", name: "Wendeplatte", description: "Unbekannt", supplier_id: "s1", is_active: true },
    { id: "w4", article_number: "MTEC 660125-R K10", name: "Ausdrehwerkzeug", description: "Ifanger Ausdreher", supplier_id: "s1", is_active: true },
    { id: "w6", article_number: "25502-6.230", name: "Ausdrehwerkzeug", description: "GT106.0847.015.22.50.R", supplier_id: "s1", is_active: true },
    { id: "w7", article_number: "RS111.0250.D2 TH35", name: "Ausdrehwerkzeug", description: "Horn Ausdreher", supplier_id: "s1", is_active: true },
    { id: "w8", article_number: "3004-3.2-6 R SP29015 UHM30 HX", name: "Wendeplatte", description: "Utilis", supplier_id: "s1", is_active: true });
  TEST.daten.cam_werkzeuge = [];
  TEST.rpc.cam_wz_nutzung = () => [];
}"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate(ART)
    pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")

    pg.click("#cam-bibliothek-auf")
    pg.wait_for_selector("[data-cam-bib-liste]")
    pg.click("[data-cam-bib-eintrag='a:w1'] [data-camwz-gross]")
    pg.wait_for_selector("[data-cam-wzg='fenster']")
    cv = pg.locator("[data-cam-wzg-cv]")
    pruefe("Grosses Bild mit Flächen", int(cv.get_attribute("data-cam-wzg-cv") or 0) > 10)
    bb = cv.bounding_box()
    pruefe("Leinwand gross " + str(int(bb["width"])) + "x" + str(int(bb["height"])), bb["width"] > 900 and bb["height"] > 500)
    pruefe("Aussenmasse stehen da", "Aussenmasse" in (pg.text_content("[data-cam-wzg-huelle]") or ""))
    bild = lambda: pg.evaluate("document.querySelector('[data-cam-wzg-cv]').toDataURL()")
    b0 = bild()
    pg.mouse.move(bb["x"] + 400, bb["y"] + 300); pg.mouse.down(); pg.mouse.move(bb["x"] + 520, bb["y"] + 340, steps=6); pg.mouse.up()
    pruefe("Ziehen dreht", bild() != b0)
    b1 = bild(); pg.mouse.wheel(0, -400); pg.wait_for_timeout(100)
    pruefe("Mausrad zoomt", bild() != b1)
    b2 = bild(); pg.keyboard.down("Shift"); pg.mouse.down(); pg.mouse.move(bb["x"] + 600, bb["y"] + 400, steps=5); pg.mouse.up(); pg.keyboard.up("Shift")
    pruefe("Shift verschiebt", bild() != b2)
    pg.click("[data-cam-wzg-ansicht='vorne']"); pg.click("[data-cam-wzg-alles]")
    # Messen: zwei Fangpunkte aus der Projektion suchen und antippen
    pg.click("[data-cam-wzg-messen]")
    gefunden = 0
    for x in range(int(bb["width"] * 0.2), int(bb["width"] * 0.8), 14):
        for y in range(int(bb["height"] * 0.2), int(bb["height"] * 0.8), 14):
            pg.mouse.click(bb["x"] + x, bb["y"] + y)
            m = pg.get_attribute("[data-cam-wzg-mass]", "data-cam-wzg-mass")
            if m: gefunden = float(m); break
        if gefunden: break
    txt = pg.text_content("[data-cam-wzg-mass]") or ""
    print(txt)
    pruefe("Abstand gemessen", gefunden > 0 and "Abstand" in txt and "dX" in txt)
    pg.screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/cam_wz_gross.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pruefe("Escape schliesst", pg.locator("[data-cam-wzg='fenster']").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
