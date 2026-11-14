# 1×1 Rider (1.546.0, Wunsch Patrick 14. November 2026): Reihen lernen auf
# Tempo, nur mit dem Vermerk reihenSehen. Prüft Menü, Runde mit richtig,
# falsch und Zeit um, Ende mit Punkten und Level, Stand am Konto.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("RR_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def oeffnen(br, vp, mit=True, **kw):
    ctx = br.new_context(viewport=vp, **kw)
    pg = ctx.new_page(); pf = []
    pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
    body = FAKE + (";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { reihenSehen: true };\n" if mit else "")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1000)
    return ctx, pg, pf

def frage(pg):
    t = pg.locator("[data-rr-frage]").inner_text().replace("×", "x")
    a, b = [int(x) for x in t.split("x")]
    return a * b

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx, pg, pf = oeffnen(br, {"width": 1400, "height": 900}, mit=False)
    pruefe(pg.locator("[data-nav='reihen']").count() == 0, "ohne Vermerk kein 1×1 Rider, auch für Admins")
    ctx.close()

    ctx, pg, pf = oeffnen(br, {"width": 1400, "height": 900})
    pruefe(pg.locator("[data-nav='reihen']").count() > 0, "1×1 Rider im Menü mit Vermerk")
    pg.evaluate("location.hash='#/reihen'"); pg.wait_for_selector("[data-rr-los]", timeout=15000); pg.wait_for_timeout(1500)
    pg.screenshot(path=BILD + "/rr-menue-pc.png")
    # Nur die 7er, 10 Aufgaben, 3 Sekunden
    for n in range(1, 10):
        if pg.locator(f"[data-rr-reihe='{n}']").get_attribute("class").find(" an") >= 0: pg.click(f"[data-rr-reihe='{n}']")
    pg.click("[data-rr-reihe='7']"); pg.click("[data-rr-zeit='3']"); pg.click("[data-rr-anzahl='10']")
    pg.click("[data-rr-los]", force=True)
    pg.wait_for_selector("[data-rr-frage]", timeout=6000)
    pg.wait_for_timeout(300)
    pg.screenshot(path=BILD + "/rr-fahrt-pc.png")
    # 1: richtig mit dem Zifferblock
    l = frage(pg)
    pruefe(l % 7 == 0, "nur 7er Reihe: %s" % l)
    for d in str(l): pg.locator(f"[data-rr-ziffer='{d}']").dispatch_event("pointerdown")
    pg.wait_for_timeout(150)
    pruefe(pg.locator(".rr-frage--gut").count() == 1, "richtige Antwort grün")
    pg.wait_for_timeout(250); pg.screenshot(path=BILD + "/rr-richtig.png")
    pg.wait_for_timeout(700)
    # 2: falsch mit der Tastatur
    l = frage(pg)
    falsch = "1" if l > 9 else str((l + 1) % 10)
    falsch = (falsch + "1") if l > 9 else falsch
    for d in falsch: pg.keyboard.press(d)
    pg.wait_for_timeout(200)
    pruefe(pg.locator(".rr-frage--schlecht").count() == 1, "falsche Antwort rot")
    pruefe(str(l) in pg.locator("[data-rr-antwort]").inner_text(), "Lösung steht da")
    pg.wait_for_timeout(500); pg.screenshot(path=BILD + "/rr-falsch.png")
    pg.wait_for_timeout(1500)
    # 3: Zeit um
    pg.wait_for_timeout(3400)
    pruefe("ZEIT UM" in pg.inner_text(".rr"), "nach 3 s Zeit um")
    pg.wait_for_timeout(1800)
    # Pause mit Escape
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pruefe(pg.locator(".rr-pause").count() == 1, "Escape pausiert")
    pg.wait_for_timeout(1500)
    pg.click("text=▶ Weiter")
    # Rest richtig
    for i in range(10):
        if pg.locator("[data-rr-ende]").count(): break
        pg.wait_for_selector("[data-rr-frage], [data-rr-ende]", timeout=5000)
        if pg.locator("[data-rr-ende]").count(): break
        l = frage(pg)
        for d in str(l): pg.keyboard.press(d)
        pg.wait_for_timeout(800)
    pg.wait_for_selector("[data-rr-ende]", timeout=6000); pg.wait_for_timeout(1500)
    pg.screenshot(path=BILD + "/rr-ende-pc.png")
    t = pg.inner_text(".rr-karte--ende")
    pruefe("8/10" in t, "8 von 10 richtig: %s" % t[:120].replace("\n", " "))
    pruefe("XP" in t and "LEVEL UP" in t, "XP und Level up")
    stand = pg.evaluate("(TEST.daten.profiles.find(x => x.id === 'u1').einstellungen || {}).reihen_stand || ''")
    pruefe('"xp"' in stand and '"7x' in stand or 'x7"' in stand, "Stand am Konto gespeichert")
    pg.click(".rr-ende__knoepfe >> text=Menü"); pg.wait_for_selector("[data-rr-los]")
    pruefe(pg.locator("[data-rr-fehler]").is_enabled(), "Fehler-Training mit Fehlern frei")
    pg.click("[data-rr-garage]"); pg.wait_for_timeout(300)
    pruefe(not pg.locator("[data-rr-skin='gelbschwarz']").is_disabled(), "Gelb-Schwarz ab Level 2 frei")
    pg.click("[data-rr-skin='gelbschwarz']"); pg.wait_for_timeout(600)
    pg.screenshot(path=BILD + "/rr-garage.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("text=📊 Meine Reihen"); pg.wait_for_timeout(300); pg.screenshot(path=BILD + "/rr-reihen.png")
    pg.keyboard.press("Escape"); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe(pg.locator(".rr").count() == 0 and "dashboard" in pg.evaluate("location.hash"), "Escape schliesst zur Startseite")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    ctx.close()

    for name, kw in [("ipad", dict(viewport={"width": 1180, "height": 820}, has_touch=True)),
                     ("handy", dict(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2))]:
        ctx, pg, pf = oeffnen(br, kw.pop("viewport"), **kw)
        pg.evaluate("location.hash='#/reihen'"); pg.wait_for_selector("[data-rr-los]", timeout=15000); pg.wait_for_timeout(1200)
        pg.screenshot(path=BILD + f"/rr-menue-{name}.png")
        pruefe(pg.evaluate("document.querySelector('.rr-menue').scrollHeight <= innerHeight + 2"), f"{name}: Menü ohne Rollen")
        pg.tap("[data-rr-zeit='0']")  # ohne Zeit, sonst läuft sie beim Bildschirmfoto ab
        pg.tap("[data-rr-los]", force=True); pg.wait_for_selector("[data-rr-frage]", timeout=6000); pg.wait_for_timeout(400)
        pg.screenshot(path=BILD + f"/rr-fahrt-{name}.png")
        box = pg.locator("[data-rr-ziffern]").bounding_box(); fr = pg.locator(".rr-frage").bounding_box()
        pruefe(box["y"] + box["height"] <= kw.get("h", 2000) and fr["y"] + fr["height"] < box["y"] or box["x"] > fr["x"] + fr["width"], f"{name}: Frage und Zifferblock überlappen nicht")
        l = frage(pg)
        for d in str(l): pg.tap(f"[data-rr-ziffer='{d}']")
        pg.wait_for_timeout(150)
        pruefe(pg.locator(".rr-frage--gut").count() == 1, f"{name}: Tippen geht")
        pruefe(not pf, f"{name}: keine Fehler: {pf}")
        ctx.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
