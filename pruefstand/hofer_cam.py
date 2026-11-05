# NC-PRO → Hofer Cam (seit 1.395.0): Kopf und Ende der Star SB-20RG mit
# Feldern, zwei Kanäle nebeneinander, Marken auf derselben Zeile.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
  for OHNE in (True, False):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    MIT = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { camSehen: true };\n"
    if OHNE: MIT = FAKE
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/kontur']")
    if OHNE:
        pruefe("Ohne Vermerk kein Hofer Cam", pg.locator("[data-unter='nc/cam']").count() == 0
               and pg.locator("[data-rech='cam'], #rech-inhalt .cam").count() == 0)
        br.close(); continue
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    k = lambda n: pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")
    pg.fill("[data-cam='nr']", "458"); pg.fill("[data-cam='hoco']", "10870-0002")
    pg.fill("[data-cam='A']", "20"); pg.fill("[data-cam='schlicht']", "-0,2"); pg.fill("[data-cam='annaehern']", "-12")
    k1, k2 = k(1), k(2)
    pruefe("Kanal 1 Nummer und G266", "O0458(10870-0002)" in k1 and "G266A20.W15.125S3000X-0.8Z167.85F0.03B1.5" in k1)
    pruefe("Kanal 2 = +1000", "O1458(10870-0002)" in k2)
    pruefe("Schlichtzugabe", "G0Z-0.2T0(SCHLICHTZUGABE)" in k1)
    pruefe("Annähern", "G0Z-12.(EILGANG 12MM VOR STUCK)" in k2)
    pg.fill("[data-cam='plan']", "0.3")
    pruefe("Zugabe Plan hinten", "G0W0.3(ZUGABE PLANDREHEN HINTEN)" in k(1))
    pruefe("Gleich viele Zeilen", len(k1) == len(k2))
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    sync2 = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='2'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken auf gleicher Zeile", sync == sync2 == ["M200", "M20", "M800", "M82", "M40", "M41", "M83"])
    pruefe("Keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.fill("[data-cam='nr']", "1000")
    pruefe("Nr. über 999 rot", pg.locator(".cam-feld--fehler [data-cam='nr']").count() == 1)
    pg.fill("[data-cam='nr']", "458")
    # Seit 1.396.0: Bearbeitung mit Drehwerkzeug T100–T600 zwischen Kopf und Ende
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='bez']", "aussen plan")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X-0.8F0.05\n\nG0Z0.5")
    t = [x for x in k(1) if x]
    a, b = t.index("(Ende Kopf)"), t.index("(Start Ende)")
    pruefe("Drehblock zwischen Kopf und Ende", t[a+1:b] == ["T100(AUSSEN PLAN)", "M1881D4", "M3S3000T1", "G0X[#531+1.]Z0.",
        "G1X-0.8F0.05", "G0Z0.5", "G1X[#531+0.2],A45.F0.05", "G0X30.", "M1891", "T0", "M1"])
    pg.fill("[data-block='0'] [data-camblock='wegA']", "")
    pg.select_option("[data-block='0'] [data-camblock='hd']", "")
    t = [x for x in k(1) if x]
    pruefe("Ohne Winkel und Hochdruck", "G1X[#531+0.2]F0.05" in t and "M1881D4" not in t and "M1891" not in t)
    pg.fill("[data-block='0'] [data-camblock='wegA']", "45")
    pg.select_option("[data-block='0'] [data-camblock='hd']", "4")
    pg.click("#cam-neu-dreh")
    pruefe("Zweiter Block nimmt freien Platz", pg.input_value("[data-block='1'] [data-camblock='platz']") == "200")
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken nach Blöcken weiter gepaart", len(sync) == 7 and pg.locator(".cam-zeile--fehler").count() == 0)
    pg.click("[data-camblock-weg='1']")
    pruefe("Block entfernen", pg.locator(".cam-block").count() == 1)
    pg.screenshot(path="hofer_cam.png", full_page=False)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.screenshot(path="hofer_cam_dunkel.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
