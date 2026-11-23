# HOFERCAM SW-20 (seit 1.726.0): Vorlagen Synchronsteuerung M50 / M51 und
# Superposition M142 / M143. Die Vorlage kommt in die führende Bearbeitung,
# M50 … M51 bzw. M142 … M143 kommen auch in den anderen Kanal (1 ↔ 3) mit
# Feldern davor, dazwischen und danach.
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
    pg = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    # SB-20RG: keine Synchron-Vorlagen
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(250)
    pg.click("[data-camvorlage-auf='0']")
    pruefe("SB-20RG ohne M50", pg.locator("[data-camvorlage-bild='m50']").count() == 0)
    pg.click("[data-camvorlage] .cam-vorlage__kopf button[title='Schliessen']")
    pg.once("dialog", lambda d: d.accept())
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(500)
    if pg.locator("[data-camvorlage-auf]").count():
        # Rückfrage in der App statt Browser-Dialog
        b = pg.locator(".dialog button:has-text('Wechseln'), .dialog button:has-text('Ja')")
        if b.count(): b.first.click(); pg.wait_for_timeout(300)
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(250)
    i = pg.locator("[data-camvorlage-auf]").count() - 1
    pg.click(f"[data-camvorlage-auf='{i}']")
    pruefe("Bild M50", pg.locator("[data-camvorlage-bild='m50'] svg").count() == 1)
    pruefe("Bild M142", pg.locator("[data-camvorlage-bild='m142'] svg").count() == 1)
    pg.click("[data-camvorlage-bild='m50']")
    pruefe("Kanal 1: fünf Achsen-Wahlen", pg.locator("[data-camvorlage-wahl^='achse:']").count() == 5)
    pg.click("[data-camvorlage-wahl='achse:Y[-13]']")
    pg.fill("[data-camvorlage-feld='wege']", "G1X3.6Z-0.5F0.2\nG1Z-2.F0.05")
    vs = (pg.text_content("[data-camvorlage-vorschau]") or "").split("\n")
    pruefe("Vorschau M50", vs == ["M50Y[-13]", "G1X3.6Z-0.5F0.2", "G1Z-2.F0.05", "M51"])
    pg.click("[data-camvorlage-einfuegen]"); pg.wait_for_timeout(300)
    pruefe("Drei Felder für Kanal 3", pg.locator(f"[data-camsync='m50'] [data-camk-kanal='3']").count() == 3)
    felder = pg.locator("[data-camsync='m50'] textarea")
    felder.nth(0).fill("T1100\nG0X11.T1\nG141")
    felder.nth(2).fill("G0T0\nG28U0\nG140")
    pg.wait_for_timeout(400)
    k3 = [t.strip() for t in pg.eval_on_selector_all("[data-kanal='3'] .cam-text", "e => e.map(x => x.textContent)") if t.strip()]
    try:
        a = k3.index("G0X11.T1") - 1
        pruefe("Kanal 3 Reihenfolge", k3[a:a + 7] == ["T1100", "G0X11.T1", "G141", "M50Y[-13]", "M51", "G0T0", "G28U0"])
    except ValueError:
        pruefe("Kanal 3 hat T1100", False)
    k1 = [t.strip() for t in pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)") if t.strip()]
    pruefe("Kanal 1 hat M50 und Wege", "M50Y[-13]" in k1 and "G1Z-2.F0.05" in k1 and "M51" in k1)
    rot = pg.locator(".cam-zeile--rot, .cam-zeile--ohne").count()
    pruefe("keine roten Marken", rot == 0)
    # Superposition aus Kanal 3
    pg.click("#cam-neu-k3dr"); pg.wait_for_timeout(250)
    j = pg.locator("[data-camvorlage-auf]").count() - 1
    pg.click(f"[data-camvorlage-auf='{j}']")
    pg.click("[data-camvorlage-bild='m142']")
    pg.fill("[data-camvorlage-feld='wege']", "G0X0Z-0.5\nG1Z8.F0.03")
    vs = (pg.text_content("[data-camvorlage-vorschau]") or "").split("\n")
    pruefe("Vorschau M142", vs == ["M142", "G0X0Z-0.5", "G1Z8.F0.03", "M143"])
    pg.click("[data-camvorlage-einfuegen]"); pg.wait_for_timeout(300)
    pruefe("Felder für Kanal 1", pg.locator("[data-camsync='m142'] [data-camk-kanal='1']").count() == 3)
    f2 = pg.locator("[data-camsync='m142'] textarea")
    f2.nth(1).fill("G1X9.6W0.7F0.03")
    pg.wait_for_timeout(400)
    k1 = [t.strip() for t in pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)") if t.strip()]
    try:
        a = k1.index("M142")
        pruefe("Kanal 1 M142 mit Weg", k1[a:a + 3] == ["M142", "G1X9.6W0.7F0.03", "M143"])
    except ValueError:
        pruefe("Kanal 1 hat M142", False)
    # Kanal 3 Vorlage M50 nur X[31]
    pg.click(f"[data-camvorlage-auf='{j}']"); pg.click("[data-camvorlage-bild='m50']")
    pruefe("Kanal 3: nur X[31]", pg.locator("[data-camvorlage-wahl^='achse:']").count() == 1
           and pg.locator("[data-camvorlage-wahl='achse:X[31]']").count() == 1)
    pg.screenshot(path="cam_sync_vorlagen.png", full_page=False)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
