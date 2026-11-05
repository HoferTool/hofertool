# NC-PRO → Hofer Cam (seit 1.394.0): Vorlagen je Maschine anlegen, Code
# aus Bohren / Fräsen übernehmen, Programm mit Kopf, Start/Ende und Ende.
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
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/bohren']"); pg.click("[data-unter='nc/bohren']")
    pg.wait_for_selector("#bf-code")
    bf = pg.text_content("#bf-code")
    pg.click("[data-incam='bohren']"); pg.wait_for_timeout(200)

    pg.click("[data-unter='nc/cam']"); pg.wait_for_selector("#cam-code")
    pruefe("Bearbeitung aus Bohren da", pg.locator("[data-cambearb]").count() == 1
           and "G83" in pg.input_value("[data-cambearb='1'] [data-camfeld='nc']"))
    # Vorlagen der ersten Maschine
    pg.click("[data-camansicht='vorlagen']")
    opt = pg.eval_on_selector("#cam-v-maschine", "s => s.options[1].value")
    pg.select_option("#cam-v-maschine", opt)
    pg.fill("[data-camvorlage='kopf']", "%\nO{PRG} ( {NAME} )")
    pg.fill("[data-camvorlage='ende']", "M30\n%")
    pg.fill("[data-camvorlage='bohren-start']", "( {NR} {TITEL} )\nT{T}\nM80 S{S}")
    pg.fill("[data-camvorlage='bohren-ende']", "M81")
    pg.click("#cam-v-speichern"); pg.wait_for_timeout(300)
    pruefe("Gespeichert", pg.locator("#cam-v-speichern").is_disabled())

    pg.click("[data-camansicht='programm']")
    pg.select_option("#cam-maschine", opt)
    pg.fill("[data-cam='prg']", "4711"); pg.fill("[data-cam='name']", "TEST")
    pg.fill("[data-cambearb='1'] [data-camfeld='titel']", "Querbohrung")
    pg.fill("[data-cambearb='1'] [data-camfeld='t']", "1212")
    pg.fill("[data-cambearb='1'] [data-camfeld='s']", "3000")
    pg.wait_for_timeout(150)
    c = pg.text_content("#cam-code")
    pruefe("Kopf", c.startswith("%\nO4711 ( TEST )\n( 1 Querbohrung )\nT1212\nM80 S3000\n"))
    pruefe("Code drin", bf.strip().split("\n")[1] in c)
    pruefe("Ende", c.endswith("M81\nM30\n%"))
    # Zweite Bearbeitung von Hand, verschieben
    pg.click("#cam-hinzu"); pg.click(".dialog [data-w='frei']"); pg.wait_for_timeout(150)
    pg.fill("[data-cambearb='2'] [data-camfeld='nc']", "G0X99.")
    pg.click("[data-cambearb='2'] [title='Nach oben']"); pg.wait_for_timeout(150)
    c = pg.text_content("#cam-code")
    pruefe("Frei zuerst", c.index("G0X99.") < c.index("M80 S3000"))
    pg.screenshot(path="hofer_cam.png", full_page=True)
    pg.click("[data-camansicht='vorlagen']"); pg.wait_for_timeout(200)
    pg.screenshot(path="hofer_cam_vorlagen.png", full_page=True)
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.click("[data-camansicht='programm']"); pg.wait_for_timeout(200)
    pg.screenshot(path="hofer_cam_dunkel.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
