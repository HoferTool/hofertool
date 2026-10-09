# Balken unter der Maus hervorheben (1.2.0, Wunsch Patrick 9. Oktober 2026):
# weisser Rand mit dunklem Saum, heller, über den Nachbarn. Weg, wenn die
# Maus geht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

STIL = """(sel) => { const b = document.querySelector(sel); const s = getComputedStyle(b);
  return { outline: s.outlineStyle + ' ' + s.outlineColor, schatten: s.boxShadow, filter: s.filter, z: s.zIndex }; }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken[data-auftrag]"); pg.wait_for_timeout(900)
    id_ = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 80).dataset.auftrag")
    sel = f'.pw-balken[data-auftrag="{id_}"]'
    vorher = pg.evaluate(STIL, sel)
    # Dünner grauer Rahmen (1.9.0) an einem Balken, der nicht läuft
    rahmen = pg.evaluate("""() => { const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')]
      .find(x => !x.classList.contains('pw-balken--laeuft')); return getComputedStyle(b).boxShadow; }""")
    print("     rahmen", rahmen)
    pruefe("dünner grauer Rahmen", "rgba(110, 116, 124, 0.85)" in rahmen and "inset" in rahmen and " 1px" in rahmen)
    pg.hover(sel); pg.wait_for_timeout(300)
    drauf = pg.evaluate(STIL, sel)
    print("     vorher", vorher); print("     drauf ", drauf)
    pruefe("weisser Rand beim Darüberfahren", drauf["outline"].startswith("solid rgb(255, 255, 255)"))
    pruefe("dunkler Saum", "rgba(0, 0, 0, 0.7)" in drauf["schatten"])
    pruefe("heller", "brightness" in drauf["filter"])
    pruefe("über den Nachbarn", drauf["z"] == "6")
    pg.screenshot(path="/tmp/balken_hover.png", clip={"x": 0, "y": 80, "width": 1600, "height": 500})
    pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    weg = pg.evaluate(STIL, sel)
    pruefe("weg, wenn die Maus geht", weg == vorher)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.hover(sel); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/balken_hover_dunkel.png", clip={"x": 0, "y": 80, "width": 1600, "height": 500})
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
