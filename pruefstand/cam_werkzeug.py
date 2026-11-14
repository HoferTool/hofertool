# HOFERCAM Werkzeug je Bearbeitung (seit 1.545.0): Drehplatte mit
# Schneidenlage (Ausrichtung in der Skizze), Einstechplatte mit Breite,
# Bohrer am Frontwerkzeug, gespeichert am Block, NC unverändert.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    k1 = lambda: pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pg.click("#cam-neu-dreh")
    vorher = k1()
    pg.click("[data-camwz-auf='0']")
    pruefe("Fenster Werkzeug offen", pg.locator(".cam-wz").count() == 1)
    pg.click("[data-camwz-form='D']")
    pruefe("Radius fehlt rot", pg.locator("[data-camwz] .cam-feld--fehler [data-camwz='r']").count() == 1)
    pruefe("Schneidenlage fehlt rot", pg.locator(".cam-wz__lage.cam-feld--fehler").count() == 1)
    pruefe("Knopf rot solange unvollständig", pg.locator("[data-camwz-auf='0'].cam-wz-knopf--fehler").count() == 1)
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pruefe("Keine Fehler mehr", pg.locator("[data-camwz] .cam-feld--fehler").count() == 0)
    t = pg.text_content("[data-camwz-auf='0']")
    pruefe("Knopf zeigt Werkzeug: " + t, "D 55°" in t and "R0.4" in t and "unten rechts" in t)
    # Ausrichtung: bei „unten rechts“ zeigt die Spitze nach unten rechts,
    # die Platte liegt oben links davon
    def lage():
        return pg.evaluate("""() => { const s = document.querySelector('[data-camwz-skizze]');
          const c = s.querySelector('.cam-wz__spitze'); const pts = s.querySelector('.cam-wz__platte').getAttribute('points')
            .split(' ').map(x => x.split(',').map(Number));
          const mz = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
          return [Number(c.getAttribute('cx')) - mz, Number(c.getAttribute('cy')) - my]; }""")
    d = lage(); pruefe("Spitze unten rechts der Platte %s" % d, d[0] > 0 and d[1] > 0)
    pg.click("[data-camwz-sl='ol']"); d = lage(); pruefe("Spitze oben links %s" % d, d[0] < 0 and d[1] < 0)
    pg.click("[data-camwz-sl='u']"); d = lage(); pruefe("Spitze unten %s" % d, abs(d[0]) < 1 and d[1] > 0)
    pg.click("[data-camwz-form='E']")
    pruefe("Einstech: Breite fehlt", pg.locator(".cam-feld--fehler [data-camwz='breite']").count() == 1)
    pg.fill("[data-camwz='breite']", "2"); pg.click("[data-camwz-sl='ur']")
    pruefe("Einstech vollständig", pg.locator("[data-camwz] .cam-feld--fehler").count() == 0)
    pruefe("Einstech im Knopf", "Einstechplatte B2" in pg.text_content("[data-camwz-auf='0']"))
    d = lage(); pruefe("Einstech Spitze unten rechts %s" % d, d[0] > 0 and d[1] > 0)
    pruefe("NC-Programm unverändert", k1() == vorher)
    # Frontwerkzeug: zuerst Bohr-/Fräswerkzeug
    pg.click("#cam-neu-front"); pg.click("[data-camwz-auf='1']")
    pruefe("Front: Wahl Dreh oder Bohr", pg.locator("[data-camwz-art]").count() == 2 and pg.locator("[data-camwz-art='fraes'].aktiv").count() == 1)
    pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "3.2"); pg.fill("[data-camwz='winkel']", "140"); pg.fill("[data-camwz='laenge']", "20")
    pruefe("Bohrer im Knopf", "Bohrer · Ø3.2 · 140° · L20" in pg.text_content("[data-camwz-auf='1']"))
    pruefe("Hinweis 0.5 mm", "0.5 mm" in pg.text_content("[data-camwz]"))
    pg.click("#cam-neu-seite")
    pg.click("[data-camwz-auf='2']")
    pruefe("Querangetrieben nur Bohr/Fräs", pg.locator("[data-camwz-art]").count() == 0 and pg.locator("[data-camwz-form='kugel']").count() == 1)
    pg.click("[data-camwz-form='eck']"); pg.fill("[data-camwz='d']", "4"); pg.fill("[data-camwz='r']", "3"); pg.fill("[data-camwz='laenge']", "8")
    pruefe("Eckradius grösser Ø/2 rot", pg.locator(".cam-feld--fehler [data-camwz='r']").count() == 1)
    pg.fill("[data-camwz='r']", "0.5")
    pruefe("Eckradius gut", pg.locator("[data-camwz] .cam-feld--fehler").count() == 0)
    # Felder liegen im Massbild
    pruefe("Felder im Massbild", pg.locator("[data-camwz-massbild] [data-camwz='d']").count() == 1 and pg.locator("[data-camwz-massbild] [data-camwz='laenge']").count() == 1)
    pg.screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/cam_wz.png", full_page=False)
    pg.click(".cam-wz [title='Schliessen']")
    pruefe("Zu: Angaben bleiben am Block", "Eckradiusfräser" in pg.text_content("[data-camwz-auf='2']") and pg.locator(".cam-wz").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
