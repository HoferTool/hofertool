# Wunsch Patrick 12. Oktober 2026: Escape schliesst nur das Fenster und
# geht nicht noch zusätzlich zurück (Unterreiter, HOCO-Ebene, Seite).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#produktion", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    fenster = lambda: pg.locator(".dialog-huelle").count()

    def reiter_text():
        return pg.evaluate("""() => { const a = document.querySelector('#inhalt .reiter .aktiv, #inhalt [aria-selected=true], #inhalt .reiter__knopf--aktiv, #inhalt .aktiv');
          return a ? a.textContent.trim() : ''; }""")

    # Produktion: auf den Unterreiter Fortschritt, dann Fenster auf und Esc
    pg.get_by_text("Fortschritt", exact=True).first.click(); pg.wait_for_timeout(800)
    vorher = reiter_text()
    pg.keyboard.press("Control+f"); pg.wait_for_timeout(700)
    pruefe("Suche über alles ist offen", fenster() >= 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruefe("Fenster zu", fenster() == 0)
    nachher = reiter_text()
    pruefe(f"Unterreiter bleibt ({vorher!r} → {nachher!r})", vorher == nachher and "Fortschritt" in nachher)
    pruefe("Seite bleibt Produktion", "produktion" in pg.evaluate("location.hash"))

    # Ohne Fenster geht Escape weiter eine Ebene zurück
    pg.locator("body").click(position={"x": 5, "y": 5}); pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruefe("Ohne Fenster: Escape geht auf Erfassen", reiter_text() != nachher)

    # Planwand: Auftragsfenster mit Esc zu, Seite bleibt, Zurück-Verlauf stimmt
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    pg.locator(".pw-balken").first.dblclick(); pg.wait_for_timeout(900)
    pruefe("Auftragsfenster offen", fenster() >= 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(1000)
    pruefe("Auftragsfenster zu", fenster() == 0)
    pruefe("Seite bleibt Planwand", "planwand" in pg.evaluate("location.hash") and pg.locator(".pw-tafel").count() == 1)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
