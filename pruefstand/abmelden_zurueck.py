# Abmeldung nach einer Minute, Countdown, zurück an denselben Ort
# (1.32.0, Wunsch Patrick 12. Oktober 2026): nach 1 Minute Ruhe wird
# eine Person abgemeldet, die letzten 10 Sekunden zählen im roten Feld
# oben rückwärts. Meldet sie sich am selben Tag wieder an, landet sie
# dort, wo sie war; an einem neuen Tag auf der Startseite.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { email: 'saheesan.hudson@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher', andere_nutzer: false }];
TEST.funktionen['pin-anmelden'] = (b) => ({ status: 'passwort' });
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT"), name)
    if not ok: fehler.append(name)

def angemeldet(pg):
    return pg.evaluate("!document.getElementById('lg-auswahl') && !document.getElementById('lp')")

def seite(br):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.clock.install()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch';")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/bestellungen", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def wieder_anmelden(pg):
    pg.locator(".login__kachel", has_text="Marco").click(); pg.wait_for_timeout(900)
    pg.fill("#lp", "geheim"); pg.locator("#lk").click(); pg.wait_for_timeout(2500)

def hinweis(pg):
    el = pg.locator(".leerlauf-hinweis")
    return el.inner_text() if el.count() else ""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Countdown und Abmeldung nach einer Minute
    pg, f = seite(br)
    pruefe("angemeldet auf Bestellungen", angemeldet(pg) and "bestellungen" in pg.evaluate("location.hash"))
    pg.clock.fast_forward(45 * 1000); pg.wait_for_timeout(300)
    pruefe("nach 45 Sekunden noch kein rotes Feld", hinweis(pg) == "")
    pg.clock.fast_forward(6 * 1000); pg.wait_for_timeout(300)
    t1 = hinweis(pg)
    import re
    def zahl(t):
        m = re.search(r"Abmeldung in (\d+) Sekunde", t)
        return int(m.group(1)) if m else None
    n1 = zahl(t1)
    pruefe("rotes Feld mit Countdown höchstens 10 (" + (t1.splitlines()[0] if t1 else "leer") + ")", n1 is not None and 1 <= n1 <= 10)
    pg.screenshot(path="/tmp/abmelden_countdown.png")
    pg.clock.fast_forward(4 * 1000); pg.wait_for_timeout(300)
    t2 = hinweis(pg)
    n2 = zahl(t2)
    pruefe("Countdown zählt herunter (" + (t2.splitlines()[0] if t2 else "leer") + ")", bool(n1) and n2 is not None and 3 <= n1 - n2 <= 5)
    pg.clock.fast_forward(7 * 1000); pg.wait_for_timeout(1500)
    pruefe("nach einer Minute abgemeldet", not angemeldet(pg))

    # 2. Wieder anmelden: zurück auf Bestellungen
    wieder_anmelden(pg)
    pruefe("wieder angemeldet", angemeldet(pg))
    pruefe("wieder auf Bestellungen (" + pg.evaluate("location.hash") + ")", "bestellungen" in pg.evaluate("location.hash"))

    # 3. Neuer Tag: Startseite
    pg.clock.fast_forward(70 * 1000); pg.wait_for_timeout(1500)
    pruefe("wieder abgemeldet", not angemeldet(pg))
    pg.evaluate("""(() => { const z = JSON.parse(localStorage.getItem('hofer.nachAbmeldung'));
      z.tag = '2000-01-01'; localStorage.setItem('hofer.nachAbmeldung', JSON.stringify(z)); })()""")
    wieder_anmelden(pg)
    pruefe("neuer Tag: Startseite (" + pg.evaluate("location.hash") + ")", "dashboard" in pg.evaluate("location.hash"))
    pruefe("neuer Tag: Stand verworfen", pg.evaluate("localStorage.getItem('hofer.nachAbmeldung')") is None)

    # 3b. Länger als 4 Stunden weg, selber Tag: auch Startseite (1.163.0)
    pg.evaluate("location.hash = '#/bestellungen'"); pg.wait_for_timeout(800)
    pg.clock.fast_forward(70 * 1000); pg.wait_for_timeout(1500)
    pruefe("3b abgemeldet", not angemeldet(pg))
    pg.evaluate("""(() => { const z = JSON.parse(localStorage.getItem('hofer.nachAbmeldung'));
      z.um = Date.now() - 5 * 3600 * 1000; localStorage.setItem('hofer.nachAbmeldung', JSON.stringify(z)); })()""")
    wieder_anmelden(pg)
    pruefe("nach 5 Stunden: Startseite (" + pg.evaluate("location.hash") + ")", "dashboard" in pg.evaluate("location.hash"))

    # 4. Abmelden von Hand merkt sich nichts
    pg.evaluate("location.hash = '#/einkauf'"); pg.wait_for_timeout(800)
    pg.evaluate("setTimeout(() => window.abmeldenFragen(), 0)"); pg.wait_for_timeout(800)
    pg.locator(".dialog-huelle button", has_text="Abmelden").last.click(timeout=5000); pg.wait_for_timeout(1500)
    pruefe("von Hand abgemeldet", not angemeldet(pg))
    pruefe("von Hand: nichts gemerkt", pg.evaluate("localStorage.getItem('hofer.nachAbmeldung')") is None)
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
