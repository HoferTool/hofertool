# Unterreiter in der Seitenleiste: Unter dem Punkt der offenen Seite
# stehen ihre Reiter. Ein Klick dort wechselt den Reiter auf der Seite,
# ein Reiterwechsel auf der Seite wird in der Leiste mitgeführt. Auf
# dem Handy (Leiste unten) sind sie unsichtbar.
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
    pg = br.new_context(viewport={"width": 1300, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**",
              "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#db-notizen .karte"); pg.wait_for_timeout(500)
    pruefe("Start hat keine Unterreiter", pg.locator(".nav__unter").count() == 0)

    pg.click(".nav__punkt[data-nav='bestellungen']")
    pg.wait_for_selector(".nav__unterpunkt"); pg.wait_for_timeout(300)
    texte = pg.evaluate("[...document.querySelectorAll('.nav__unterpunkt')].map(b => b.textContent)")
    pruefe("Bestellungen zeigt seine Reiter in der Leiste", texte == ["Offen", "Bestellt", "Historie", "Artikel", "Bezeichnungen", "Lieferanten"])
    pruefe("Unterreiter stehen direkt unter dem Punkt", pg.evaluate(
        "document.querySelector('.nav__punkt[data-nav=bestellungen]').nextElementSibling.classList.contains('nav__unter')"))
    pruefe("Offen ist markiert", pg.evaluate("document.querySelector('.nav__unterpunkt.aktiv').textContent") == "Offen")

    pg.click(".nav__unterpunkt[data-unter='bestellungen/lieferanten']"); pg.wait_for_timeout(400)
    pruefe("Klick in der Leiste wechselt den Reiter", pg.evaluate("document.querySelector('.reiter__knopf.aktiv').textContent") == "Lieferanten")
    pruefe("Leiste zeigt Lieferanten markiert", pg.evaluate("document.querySelector('.nav__unterpunkt.aktiv').textContent") == "Lieferanten")

    pg.click(".reiter__knopf[data-best='artikel']"); pg.wait_for_timeout(300)
    pruefe("Reiter auf der Seite führt die Leiste mit", pg.evaluate("document.querySelector('.nav__unterpunkt.aktiv').textContent") == "Artikel")

    # Rechner: Reiter in der Leiste wählen und wieder zurück zur Seite
    pg.click(".nav__punkt[data-nav='rechner']"); pg.wait_for_selector(".nav__unterpunkt[data-unter='rechner/gravur']")
    pg.click(".nav__unterpunkt[data-unter='rechner/gravur']"); pg.wait_for_timeout(400)
    pruefe("Rechner: Gravur über die Leiste", pg.evaluate("document.querySelector('.reiter__knopf.aktiv').textContent") == "Gravur")
    pg.click(".nav__punkt[data-nav='produktion']"); pg.wait_for_selector(".nav__unterpunkt[data-unter='produktion/fortschritt']")
    pg.click(".nav__unterpunkt[data-unter='produktion/fortschritt']"); pg.wait_for_timeout(500)
    pruefe("Produktion: Fortschritt über die Leiste", pg.evaluate("document.querySelector('.reiter__knopf.aktiv').textContent") == "Fortschritt")
    pg.screenshot(path="unterreiter.png")

    # Eingeklappt und am Handy: nicht sichtbar
    pg.click("#nav-klapp"); pg.wait_for_timeout(300)
    pruefe("Eingeklappt unsichtbar", not pg.locator(".nav__unter").is_visible())
    pg.click("#nav-klapp"); pg.wait_for_timeout(300)
    pg.set_viewport_size({"width": 420, "height": 800}); pg.wait_for_timeout(300)
    pruefe("Am Handy unsichtbar", not pg.locator(".nav__unter").is_visible())
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
