# Ladebildschirm nach dem Anmelden (1.51.0): Bühne, Wellen, Lichtbogen, Gruss;
# seit 1.52.0 Logo oben und die Planwand wird dabei vorgeladen
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("BILDER_ORDNER", "")
K = """daten.login_kacheln = [
  { id: 'u4', email: 'beat@hoferco.ch', full_name: 'Beat Offen', role: 'langdreher', ohne_passwort: true },
  { id: 'u1', email: 'marco@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher' }];
// Langsamer Server: so bleibt der Ladebildschirm zum Anschauen stehen
// Profil-Einstellungen für den Farbwechsel (1.53.0)
if (window._einst) daten.profiles.forEach((p) => { p.einstellungen = window._einst; });
TEST.funktionen['pin-anmelden'] = (b) => new Promise((ok) => setTimeout(() => ok({ status: 'ok', token_hash: 'offen' }), window._warten || 0));
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT ") + name)
    if not ok: fehler.append(name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, dunkel, name in [(1440, 900, False, "pc"), (390, 844, False, "handy"), (1440, 900, True, "pc-dunkel"), (1024, 768, False, "ipad-quer"), (1366, 650, False, "laptop-klein")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.add_init_script("window.OHNE_SITZUNG = true; window._warten = 2500;")
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
        pg.locator(".login__kachel", has_text="Beat").click(); pg.wait_for_timeout(850)
        z = pg.evaluate("""(() => ({ buehne: !!document.querySelector('.login__buehne'),
          wellen: document.querySelectorAll('.login__wellen i').length,
          ring: !!document.querySelector('.login__flieger .login__ring'),
          gruss: (document.querySelector('.login__gruss') || {}).textContent || '',
          name: (document.querySelector('.login__flieger-name') || {}).textContent || '' }))()""")
        print(name, z)
        pruefe(name + ": Bühne", z["buehne"]); pruefe(name + ": drei Wellen", z["wellen"] == 3)
        pruefe(name + ": Lichtbogen", z["ring"]); pruefe(name + ": Gruss", z["gruss"].startswith("Gute"))
        pruefe(name + ": Name", "Beat" in z["name"])
        oben = pg.evaluate("(() => { const e = document.querySelector('.login__buehne-logo'); return e ? e.getBoundingClientRect().top : -1; })()")
        pruefe(name + ": Logo oben", 0 <= oben < hoehe * 0.12)
        # 1.52.3: Die grösste Welle (112 % der Kachel, 2,5-fach) bleibt unter dem Logo
        abstand = pg.evaluate("""(() => { const l = document.querySelector('.login__buehne-logo').getBoundingClientRect();
          const k = document.querySelector('.login__flieger').getBoundingClientRect();
          return Math.round((k.top + k.height / 2) - k.width * 1.12 * 2.5 / 2 - l.bottom); })()""")
        print(name, "Abstand Welle zu Logo:", abstand)
        pruefe(name + ": Wellen berühren das Logo nicht", abstand > 0)
        if BILD: pg.screenshot(path=os.path.join(BILD, "lade-" + name + ".png"))
        # Im dunklen Fall läuft danach noch die Farbwelle zurück zu Blau
        pg.wait_for_timeout(4300)
        drin = pg.evaluate("!document.getElementById('lg-auswahl') && !document.querySelector('.login__buehne')")
        pruefe(name + ": danach angemeldet, Bühne weg", drin)
        # 1.52.0: Die Planwand wurde während des Wartens schon geholt
        # und steht beim Öffnen sofort da, ohne „Planung wird geladen“
        vor = pg.evaluate("TEST.protokoll.filter((p) => p.tabelle === 'planwand').length")
        pruefe(name + ": Planwand vorgeladen", vor > 0)
        pg.evaluate("location.hash = '#/planwand'")
        pg.wait_for_timeout(250)
        sofort = pg.evaluate("!!document.querySelector('.pw-tafel') && !document.querySelector('.laedt')")
        pruefe(name + ": Planwand steht sofort", sofort)
        fehler += f; pg.close()

    # 1.53.2: Keine Themenfarbe mehr; immer eine Welle, weiss mit dunklem
    # Logo oder im dunklen Modus dunkel mit weissem Logo
    for einst, name, soll, logo, grund in [("{thema: 'rot'}", "rot", "rot", True, True),
                              ("{thema: 'gruen', dunkel: true}", "gruen-dunkel", "gruen", False, True),
                              ("{dunkel: true}", "blau-dunkel", None, False, True),
                              ("{}", "blau", None, True, True)]:
        pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.add_init_script("window.OHNE_SITZUNG = true; window._warten = 300; window._einst = " + einst + ";")
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
        pg.locator(".login__kachel", has_text="Beat").click(); pg.wait_for_timeout(1500)
        welle = pg.locator(".login__farbwelle").count()
        logofarbe = pg.locator(".login__logo-dunkel").count()
        if BILD: pg.screenshot(path=os.path.join(BILD, "farbe-" + name + "-mitte.png"))
        pg.wait_for_timeout(700)
        if BILD: pg.screenshot(path=os.path.join(BILD, "farbe-" + name + ".png"))
        pruefe(name + ": Welle über den Grund " + ("da" if grund else "keine"), (welle == 1) == grund)
        pruefe(name + ": Logo dunkel " + ("ja" if logo else "nein"), (logofarbe == 1) == logo)
        pg.wait_for_timeout(2500)
        thema = pg.evaluate("document.body.getAttribute('data-thema')")
        pruefe(name + ": App danach im Thema", thema == soll)
        fehler += f; pg.close()

    # 1.53.3: Liegt auf dem Server eine neue Fassung (Tab lange offen),
    # lädt die Seite erst nach der Animation neu, nicht mitten drin
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = true; window._warten = 300;")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    pg.route("**/index.html?stand=*", lambda r: r.fulfill(status=200, content_type="text/html",
             body='<script type="module" src="./assets/index-NEU123.js"></script>'))
    pg.evaluate("window._nichtNeu = 1")
    pg.locator(".login__kachel", has_text="Beat").click()
    pg.wait_for_timeout(1500)
    noch = pg.evaluate("window._nichtNeu === 1 && !!document.querySelector('.login__buehne')")
    pruefe("neue Fassung: Animation läuft noch, kein Neuladen mittendrin", noch)
    pg.wait_for_timeout(3000)
    neu = pg.evaluate("window._nichtNeu === undefined")
    pruefe("neue Fassung: danach neu geladen", neu)
    fehler += f; pg.close()

    # 1.54.4: Der Grund der Seite (am iPhone der Rand oben) wechselt, wenn
    # die Welle oben ankommt: vorher blau, danach weiss bzw. dunkel
    for einst, name, soll in [("{}", "hell", "rgb(255, 255, 255)"), ("{dunkel: true}", "dunkel", "rgb(28, 34, 41)")]:
        pg = br.new_context(viewport={"width": 390, "height": 844}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.add_init_script("window.OHNE_SITZUNG = true; window._warten = 300; window._einst = " + einst + ";")
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
        pg.evaluate("""window._lauf = []; window._t0 = performance.now(); (function mess() {
          const w = document.querySelector('.login__farbwelle');
          const r = w ? parseFloat((getComputedStyle(w).clipPath.match(/circle\(([\d.]+)px/) || [])[1] || 0) : 0;
          const oben = w ? r >= innerHeight / 2 + 24 : false;
          window._lauf.push({ t: performance.now(), oben, klasse: document.documentElement.className });
          if (document.querySelector('.login')) requestAnimationFrame(mess); })();""")
        pg.locator(".login__kachel", has_text="Beat").click()
        pg.wait_for_timeout(5000)
        lauf = pg.evaluate("window._lauf")
        t_oben = next((x["t"] for x in lauf if x["oben"]), None)
        t_klasse = next((x["t"] for x in lauf if "login-oben" in x["klasse"]), None)
        print(name, "Welle oben:", t_oben and round(t_oben), "Klasse:", t_klasse and round(t_klasse))
        pruefe(name + ": Rand oben wechselt, wenn die Welle oben ist", t_oben and t_klasse and abs(t_klasse - t_oben) < 150)
        fehler += f; pg.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
