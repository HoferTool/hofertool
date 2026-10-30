# Startseite je Person (1.166.0): Ein Admin wählt unter Einstellungen →
# Nutzer, welche Seite nach dem Anmelden aufgeht. Leer = Start wie bisher.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """if (window.START) daten.profiles[0].startseite = window.START;
if (window.ROLLE) daten.profiles[0].role = window.ROLLE;
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, vorher=""):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = false;" + vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for start, rolle, soll in [(None, None, "#/dashboard"), ("planwand", None, "#/planwand"),
                               ("bestellungen", None, "#/bestellungen"),
                               ("empfang", "langdreher", "#/dashboard"),
                               ("statistik", "extern", "#/planwand"), ("gibtsnicht", None, "#/dashboard")]:
        v = (f"window.START = '{start}';" if start else "") + (f"window.ROLLE = '{rolle}';" if rolle else "")
        pg, f = seite(br, v)
        h = pg.evaluate("location.hash"); print(start, rolle, "→", h)
        if not h.startswith(soll): fehler.append(f"{start}/{rolle}: {h} statt {soll}")
        if start == "planwand":
            # Neuladen auf einer anderen Seite bleibt dort
            pg.evaluate("location.hash = '#/rechner'"); pg.wait_for_timeout(500)
            pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
            print("nach Neuladen:", pg.evaluate("location.hash"))
            if not pg.evaluate("location.hash").startswith("#/rechner"): fehler.append("Neuladen springt auf Startseite")
        fehler += f; pg.close()

    # Admin wählt die Startseite einer anderen Person
    pg, f = seite(br)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-bearbeiten='u2']"); pg.wait_for_selector(".nutzerfenster")
    opts = pg.evaluate("[...document.querySelectorAll(\"[data-startseite='u2'] option\")].map(o => o.textContent)")
    print("Wahl:", opts)
    if opts[0] != "Start (wie bisher)" or "Planwand" not in opts or "Infoboard" in opts: fehler.append("Auswahl falsch")
    pg.select_option("[data-startseite='u2']", "planwand"); pg.wait_for_timeout(700)
    gesp = pg.evaluate("TEST.daten.profiles.find(u => u.id === 'u2').startseite"); print("gespeichert:", gesp)
    if gesp != "planwand": fehler.append("speichert nicht")
    pg.screenshot(path="/tmp/startseite-fenster.png")
    pg.select_option("[data-startseite='u2']", ""); pg.wait_for_timeout(700)
    if pg.evaluate("TEST.daten.profiles.find(u => u.id === 'u2').startseite") is not None: fehler.append("leeren geht nicht")
    fehler += f; pg.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
