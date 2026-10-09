# Jede Stunde kurz neu laden (111.113.0, Wunsch Patrick 8. Oktober 2026):
# nach einer Stunde lädt die Seite neu, Anmeldung und Seite bleiben; mit
# offenem Fenster oder Schreibmarke im Feld wartet sie, bis es ruhig ist;
# im Pad landet sie danach wieder im Pad. Eine offene Zeichnung hält sie
# nicht auf und ist danach wieder offen (1.7.0).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { email: 'planwand@hoferco.ch', full_name: 'Planwand', role: 'planwand', andere_nutzer: true, ohne_passwort: true }];
daten.profiles[0].andere_nutzer = true; daten.profiles[0].email = 'planwand@hoferco.ch';
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
STUNDE = 61 * 60 * 1000

def seite(br, hash=""):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.clock.install()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'planwand@hoferco.ch';")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html" + hash, wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def marke(pg): pg.evaluate("window.__marke = 1")
def neu_geladen(pg): return pg.evaluate("window.__marke === undefined")
def angemeldet(pg): return pg.evaluate("!document.getElementById('lg-auswahl')")

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT"), name)
    if not ok: fehler.append(name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Nach 30 Minuten nichts, nach einer Stunde neu geladen, Seite und Anmeldung bleiben
    pg, f = seite(br, "#/planwand")
    marke(pg)
    pg.clock.fast_forward(30 * 60 * 1000); pg.wait_for_timeout(500)
    pruefe("nach 30 Minuten nicht neu geladen", not neu_geladen(pg))
    pg.clock.fast_forward(31 * 60 * 1000); pg.wait_for_timeout(2500)
    pruefe("nach einer Stunde neu geladen", neu_geladen(pg))
    pruefe("danach angemeldet", angemeldet(pg))
    pruefe("danach dieselbe Seite", pg.evaluate("location.hash") == "#/planwand")
    fehler += f; pg.close()

    # 2. Mit offenem Fenster wartet es; zu, dann kommt es in der nächsten Minute
    pg, f = seite(br)
    marke(pg)
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1000)
    pg.clock.fast_forward(STUNDE); pg.wait_for_timeout(500)
    pruefe("Einstellungen offen: nicht neu geladen", not neu_geladen(pg) and pg.locator(".dialog-huelle").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe("Einstellungen zu", pg.locator(".dialog-huelle").count() == 0)
    pg.clock.fast_forward(2 * 60 * 1000); pg.wait_for_timeout(2500)
    pruefe("Fenster zu: in der nächsten Minute neu geladen", neu_geladen(pg))
    fehler += f; pg.close()

    # 3. Schreibmarke im Suchfeld: wartet; Feld verlassen und eine halbe Minute Ruhe: neu geladen
    pg, f = seite(br)
    marke(pg)
    pg.evaluate("document.querySelector('#kopf-suche input, input[type=search], input')?.focus()")
    im_feld = pg.evaluate("/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)")
    pg.clock.fast_forward(STUNDE); pg.wait_for_timeout(500)
    pruefe("Schreibmarke im Feld: nicht neu geladen", im_feld and not neu_geladen(pg))
    pg.evaluate("document.activeElement.blur()")
    pg.mouse.click(700, 500); pg.wait_for_timeout(200)   # Berührung: ab jetzt 30 Sekunden Ruhe nötig
    pg.clock.fast_forward(90 * 1000); pg.wait_for_timeout(2500)
    pruefe("nach Ruhe neu geladen", neu_geladen(pg))
    fehler += f; pg.close()

    # 4. Im Pad: nach einer Stunde neu geladen und wieder im Pad
    pg, f = seite(br)
    pg.evaluate("document.getElementById('pad-knopf') ? document.getElementById('pad-knopf').click() : null"); pg.wait_for_timeout(1200)
    im_pad = pg.evaluate("!!document.getElementById('pad')")
    marke(pg)
    pg.clock.fast_forward(STUNDE); pg.wait_for_timeout(3000)
    pruefe("Pad: neu geladen", im_pad and neu_geladen(pg))
    pruefe("Pad: danach wieder im Pad", pg.evaluate("!!document.getElementById('pad')"))
    fehler += f; pg.close()

    # 5. Offene Zeichnung hält das Neuladen nicht auf und ist danach wieder offen (1.7.0)
    pg, f = seite(br, "#/planwand")
    jz = pg.evaluate("(() => { const ids = new Set(TEST.daten.planwand.filter(j => j.drawing_url).map(j => j.id));"
                     " const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag) && b.getBoundingClientRect().width > 40);"
                     " return b && b.dataset.auftrag; })()")
    pg.locator(f".pw-balken[data-auftrag='{jz}']").first.click(); pg.clock.fast_forward(1500); pg.wait_for_timeout(800)
    offen = pg.locator(".betrachter-huelle").count() == 1
    marke(pg)
    pg.clock.fast_forward(STUNDE); pg.wait_for_timeout(3500)
    pruefe("Zeichnung offen: trotzdem neu geladen", offen and neu_geladen(pg))
    pg.clock.fast_forward(1500); pg.wait_for_timeout(1500)
    pruefe("Zeichnung danach wieder offen", pg.locator(".betrachter-huelle").count() == 1)
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
