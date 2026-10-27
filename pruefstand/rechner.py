# Rechner: Prüft Drehzahl (rechnet beim Tippen), behält Eingaben beim
# Seitenwechsel, alle Reiter zeigen Inhalt, Winkel und G-Code rechnen
# richtig. C-Achse, Gravur und DXF haben eigene Tests.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#rechner'")
    pg.wait_for_selector("#r-d"); pg.wait_for_timeout(300)

    # Aluminium, Hartmetall (Vc 700), Durchmesser 10 → 22'282 1/min
    pg.click("[data-werkstoff='2']")
    pg.fill("#r-d", "10")
    wert = pg.inner_text(".ergebnis__wert").split("1/min")[0].strip()
    if wert != "22’282" and wert != "22'282":
        fehler.append("Drehzahl falsch: " + repr(wert))
    pg.fill("#r-z", "3"); pg.fill("#r-fz", "0.05")
    if pg.locator(".ergebnis").count() != 2: fehler.append("Vorschub fehlt")
    pg.screenshot(path="rechner.png")

    # Jeder Reiter zeigt etwas
    for reiter, merkmal in [("winkel", "input"), ("gcode", "textarea, input"), ("cachse", "svg, canvas, input"),
                            ("gravur", "input, canvas"), ("dxf", "input, button")]:
        pg.click(f"[data-rech='{reiter}']"); pg.wait_for_timeout(250)
        if not pg.locator(f"#rech-inhalt").locator(merkmal).count():
            fehler.append("Reiter leer: " + reiter)
        if pg.locator("#rech-inhalt").count() != 1: fehler.append("rech-inhalt doppelt bei " + reiter)
    pg.click("[data-rech='winkel']"); pg.wait_for_timeout(200)
    # Dreieck: a = 3, b = 4 → c = 5, β = 53,13°
    pg.fill("#w-a", "3"); pg.press("#w-a", "Tab"); pg.fill("#w-g", "4"); pg.press("#w-g", "Tab"); pg.wait_for_timeout(200)
    erg = pg.locator(".karte--ergebnis").first.inner_text().replace("\n", " ")
    if "5mm" not in erg.replace(" ", "") or "53.13" not in erg.replace(",", ".").replace("’", ""):
        fehler.append("Dreieck falsch: " + erg)
    if "c = 5" not in pg.locator("svg.zeichnung").first.text_content(): fehler.append("Zeichnung zeigt c nicht")
    # Fase: b = 1 und 30° → t = 1,732
    pg.click("[data-fwinkel='30']"); pg.wait_for_timeout(200)
    if "1.732" not in pg.locator(".karte--ergebnis").nth(1).inner_text().replace(",", "."):
        fehler.append("Fasentiefe falsch")
    pg.click("#w-leer"); pg.wait_for_timeout(200)
    if pg.input_value("#w-a") != "": fehler.append("Zurücksetzen geht nicht")
    pg.locator("#rech-inhalt input").first.fill("12"); pg.locator("#rech-inhalt input").first.press("Tab")
    pg.wait_for_timeout(200)

    # G-Code: Fase 1 × 45° auf Ø20, mit und ohne A-Programmierung
    pg.click("[data-rech='gcode']"); pg.wait_for_timeout(250)
    prog = pg.inner_text("pre.gcode")
    if "G0X22.00Z0.00" not in prog or ",A45." not in prog: fehler.append("G-Code falsch: " + prog[:80])
    pg.check("#g-ohnea"); pg.wait_for_timeout(200)
    if ",A" in pg.inner_text("pre.gcode") or "G3X" not in pg.inner_text("pre.gcode"): fehler.append("Ohne A falsch")
    pg.uncheck("#g-radan"); pg.wait_for_timeout(200)
    if pg.locator("#g-radius").count() or "G3X" in pg.inner_text("pre.gcode"): fehler.append("Radius aus wirkt nicht")
    pg.fill("#g-dm", "30"); pg.press("#g-dm", "Enter"); pg.wait_for_timeout(200)
    if "G0X32.00" not in pg.inner_text("pre.gcode"): fehler.append("Durchmesser wirkt nicht")
    pg.check("#g-radan"); pg.uncheck("#g-ohnea"); pg.fill("#g-dm", "20"); pg.press("#g-dm", "Tab")
    pg.click("[data-rech='winkel']"); pg.wait_for_timeout(200)

    # Seitenwechsel und zurück: Eingaben bleiben, Reiter bleibt
    pg.evaluate("location.hash='#einkauf'"); pg.wait_for_timeout(600)
    if pg.locator("#r-d").count(): fehler.append("Rechner nach Seitenwechsel noch da")
    pg.evaluate("location.hash='#rechner'"); pg.wait_for_timeout(400)
    if not pg.locator("[data-rech='winkel'].aktiv").count(): fehler.append("Reiter nicht gemerkt")
    pg.click("[data-rech='drehzahl']"); pg.wait_for_timeout(200)
    if pg.input_value("#r-d") != "10": fehler.append("Durchmesser nicht gemerkt")
    for i in range(6):   # schnelles Hin und Her darf nichts kaputt machen
        pg.evaluate("location.hash='#einkauf'"); pg.wait_for_timeout(60)
        pg.evaluate("location.hash='#rechner'"); pg.wait_for_timeout(60)
    pg.wait_for_timeout(500)
    if pg.locator("h1.seitentitel").count() != 1: fehler.append("Seitentitel doppelt")
    br.close()
print("Rechner | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
