# Gemeldete Probleme auf der Startseite nur aus den eigenen Parks
# (Wunsch Patrick 15. Oktober 2026). Das Beispielproblem liegt im
# Langdreher-Park: Admin und Langdreher sehen es, ein Kurzdreher mit
# zugewiesenem Kurzdreher-Park nicht, mit beiden Parks wieder schon.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
ROLLE = '''role: "admin", is_active: true, geburtstag: null, bild_url: null, parks: [],'''
assert ROLLE in FAKE
def als(rolle, parks):
    return FAKE.replace(ROLLE, 'role: "%s", is_active: true, geburtstag: null, bild_url: null, parks: %s,' % (rolle, parks))
FAELLE = [("Admin", FAKE, True), ("Langdreher", als("langdreher", '["p-lang"]'), True),
          ("Kurzdreher", als("kurzdreher", '["p-kurz"]'), False),
          ("Kurzdreher mit beiden", als("kurzdreher", '["p-kurz","p-lang"]'), True)]
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
        pg.wait_for_selector("#db-probleme h2", timeout=15000); pg.wait_for_timeout(1000)
        text = pg.inner_text("#db-probleme")
        if ("Material fehlt" in text) != soll: fehler.append(name + ": Problem " + ("fehlt" if soll else "sichtbar"))
        if not soll and "Keine Probleme" not in text: fehler.append(name + ": ohne Leertext")
        if name == "Kurzdreher": pg.screenshot(path="probleme_park.png")
        pg.context.close()
    br.close()
print("Probleme je Park | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
