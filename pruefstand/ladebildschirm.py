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
TEST.funktionen['pin-anmelden'] = (b) => new Promise((ok) => setTimeout(() => ok({ status: 'ok', token_hash: 'offen' }), window._warten || 0));
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT ") + name)
    if not ok: fehler.append(name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, dunkel, name in [(1440, 900, False, "pc"), (390, 844, False, "handy"), (1440, 900, True, "pc-dunkel")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.add_init_script("window.OHNE_SITZUNG = true; window._warten = 2500;")
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
        pg.locator(".login__kachel", has_text="Beat").click(); pg.wait_for_timeout(1300)
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
        pruefe(name + ": Logo oben", 0 <= oben < hoehe * 0.25)
        if BILD: pg.screenshot(path=os.path.join(BILD, "lade-" + name + ".png"))
        pg.wait_for_timeout(2500)
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
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
