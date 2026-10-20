# Gemeldete Probleme auf der Startseite nur noch für Admins (seit
# 1.111.0, Wunsch Patrick 20. Oktober 2026). Alle anderen sehen keine
# Karte, das Warndreieck am Balken der Planwand aber schon.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
ROLLE = '''role: "admin", is_active: true, geburtstag: null, bild_url: null, parks: [],'''
assert ROLLE in FAKE
def als(rolle, parks):
    return FAKE.replace(ROLLE, 'role: "%s", is_active: true, geburtstag: null, bild_url: null, parks: %s,' % (rolle, parks))
FAELLE = [("Admin", FAKE, True), ("Langdreher", als("langdreher", '["p-lang"]'), False),
          ("Kurzdreher", als("kurzdreher", '["p-kurz"]'), False),
          ("Mitarbeiter", als("mitarbeiter", '[]'), False)]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, fake, soll in FAELLE:
        pg = br.new_context(viewport={"width":1300,"height":900}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", (lambda f: lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=f))(fake))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector(".gruss", timeout=15000); pg.wait_for_timeout(1500)
        da = pg.locator("#db-probleme").count() > 0
        if da != soll: fehler.append(name + ": Problemkarte " + ("fehlt" if soll else "sichtbar"))
        if soll and "Material fehlt" not in pg.inner_text("#db-probleme"): fehler.append(name + ": Problem fehlt")
        if name == "Kurzdreher": pg.screenshot(path="probleme_park.png")
        # Auf der Planwand steht das Warndreieck für alle
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
        try: pg.wait_for_selector(".pw-balken__warnung", timeout=15000)
        except Exception: fehler.append(name + ": Warndreieck auf der Planwand fehlt")
        pg.context.close()
    br.close()
print("Probleme je Park | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
