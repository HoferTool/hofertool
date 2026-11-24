# Eintägige Abwesenheit (1.756.4): Doppelklick öffnet den Eintrag, auch
# wenn er über einem Griff liegt.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
    "daten.profiles[0].role = 'mitarbeiter'; daten.vacations.forEach(v => { if (v.id === 'f1') v.tage = 1; });\nif (typeof window !== \"undefined\") window.TEST = TEST;")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    pruefe("Eintrag f1 eintägig", pg.evaluate("document.querySelector(\"[data-ferien='f1']\")?.dataset.dauer") == "1")
    pg.locator("[data-ferien='f1']").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    g = pg.locator("[data-ferien='f1'] [data-fgriff='rechts']").bounding_box()
    x = g["x"] + g["width"] / 2; y = g["y"] + g["height"] / 2
    pruefe("Griff liegt oben", pg.evaluate(f"!!document.elementFromPoint({x},{y})?.closest('[data-fgriff]')"))
    pg.mouse.click(x, y); pg.wait_for_timeout(500)
    pruefe("Balken bleibt an seiner Stelle", pg.evaluate("getComputedStyle(document.querySelector(\"[data-ferien='f1']\")).getPropertyValue('--von').trim()") == pg.evaluate("document.querySelector(\"[data-ferien='f1']\").dataset.von"))
    pruefe("Ein Klick auf den Griff öffnet nichts", pg.locator("#fd-person").count() == 0)
    pg.wait_for_timeout(500)
    pg.mouse.dblclick(x, y); pg.wait_for_timeout(600)
    pruefe("Doppelklick auf Griff öffnet Fenster", pg.locator("#fd-person").count() == 1)
    pruefe("Nur ein Fenster", pg.locator("#fd-person").count() <= 1)
    tage = pg.evaluate("TEST.daten.vacations.find(v => v.id === 'f1').tage")
    pruefe(f"Dauer unverändert ({tage})", tage == 1)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
