# Reiter QM (1.458.0, Wunsch Patrick 10. November 2026): vorerst leer,
# nur mit dem Vermerk qmSehen am Konto, nie für Externe.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("QM_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def laden(pg, zusatz):
    pg.unroute("**/cdn.jsdelivr.net/**")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + zusatz))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    laden(pg, "")
    pruefe(pg.locator("[data-nav='qm']").count() == 0, "ohne Vermerk kein QM, auch für Admins")
    VERMERK = ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { qmSehen: true };\n"
    laden(pg, VERMERK)
    pruefe(pg.locator("[data-nav='qm']").count() > 0, "QM im Menü mit Vermerk")
    pg.evaluate("location.hash='#/qm'"); pg.wait_for_selector("#qm-leer", timeout=5000)
    pruefe("QM" in pg.locator("h1.seitentitel").inner_text(), "Seite QM geht auf")
    pg.screenshot(path=BILD + "/qm-reiter.png")
    laden(pg, VERMERK + "(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = 'extern';\n")
    pruefe(pg.locator("[data-nav='qm']").count() == 0, "Externe sehen QM nicht, auch mit Vermerk")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
