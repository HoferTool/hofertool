# Kleine Blase beim Markieren (1.915.0): in reinen Textfeldern erscheint
# beim Markieren eine Blase mit Zeichen, ein Tipp ersetzt das Markierte.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
def lauf(p, vp, touch, name):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport=vp, has_touch=touch).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    blase = pg.locator(".markier-blase")
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    pg.locator(".pw-balken").first.dblclick(); pg.wait_for_timeout(1200)
    ta = pg.locator(".dialog textarea:not([readonly])").first
    ta.scroll_into_view_if_needed(); ta.click(); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete"); pg.keyboard.type("Bohrung D 6")
    pg.wait_for_timeout(200)
    pruefe(not blase.is_visible() if blase.count() else True, name + ": ohne Markierung keine Blase")
    # "D" markieren
    ta.evaluate("t => { t.focus(); t.setSelectionRange(8, 9); t.dispatchEvent(new Event('select', {bubbles:true})); }")
    pg.wait_for_timeout(250)
    pruefe(blase.is_visible(), name + ": Blase beim Markieren")
    bb = blase.bounding_box(); vw = vp["width"]
    pruefe(bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= vw, name + ": Blase im Bildschirm")
    pg.screenshot(path=f"s_markier_blase_{name}.png")
    pg.locator(".markier-blase__knopf", has_text="Ø").first.click(); pg.wait_for_timeout(250)
    pruefe(ta.input_value() == "Bohrung Ø 6", name + ": Ø ersetzt Markierung (" + ta.input_value() + ")")
    pruefe(not blase.is_visible(), name + ": Blase nach Einfügen weg")
    # Form-/Lage aufklappen und einfügen
    ta.evaluate("t => { t.focus(); t.setSelectionRange(0, 7); t.dispatchEvent(new Event('select', {bubbles:true})); }")
    pg.wait_for_timeout(250)
    pg.locator(".markier-blase__mehr").click(); pg.wait_for_timeout(150)
    pruefe(pg.locator(".markier-blase__formlage").is_visible(), name + ": Form/Lage aufgeklappt")
    pg.locator(".markier-blase__formlage button[aria-label^='Position']").click(); pg.wait_for_timeout(200)
    pruefe(ta.input_value().startswith("⌖"), name + ": ⌖ eingefügt")
    # Escape schliesst nur die Blase, das Fenster bleibt
    ta.evaluate("t => { t.focus(); t.setSelectionRange(0, 1); t.dispatchEvent(new Event('select', {bubbles:true})); }")
    pg.wait_for_timeout(250)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    pruefe(not blase.is_visible() and pg.locator(".dialog textarea").count() > 0, name + ": Escape schliesst nur die Blase")
    # Zahlenfeld: keine Blase
    z = pg.locator(".dialog input[type=number]").first
    if z.count():
        z.evaluate("t => { t.focus(); try { t.select(); } catch(e){} t.dispatchEvent(new Event('select', {bubbles:true})); }"); pg.wait_for_timeout(250)
        pruefe(not blase.is_visible(), name + ": Zahlenfeld ohne Blase")
    pruefe(not f, name + ": keine Seitenfehler " + str(f[:2]))
    br.close()
with sync_playwright() as p:
    lauf(p, {"width":1280,"height":800}, False, "pc")
    lauf(p, {"width":1024,"height":768}, True, "ipad")
    lauf(p, {"width":390,"height":844}, True, "handy")
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
