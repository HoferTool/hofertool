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
    pruefe("Gleich viele Zeilen", len(k1) == len(k2))
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    sync2 = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='2'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken auf gleicher Zeile", sync == sync2 == ["M200", "M20", "M800", "M82", "M40", "M41", "M83"])
    pruefe("Keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.fill("[data-cam='nr']", "1000")
    pruefe("Nr. über 999 rot", pg.locator(".cam-feld--fehler [data-cam='nr']").count() == 1)
    pg.fill("[data-cam='nr']", "458")
    pg.screenshot(path="hofer_cam.png", full_page=False)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.screenshot(path="hofer_cam_dunkel.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
