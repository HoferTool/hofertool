# HOFERCAM seit 1.624.0: im Programmfenster zeigt ein Strich an der
# Zeilennummer, woher die Zeile kommt (NC-Code der Bearbeitung, Kopf/Ende der
# Bearbeitung, Programmkopf/-ende), auch nach einer Änderung von Hand.
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
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    pg.wait_for_timeout(300)
    def her(text):
        return pg.evaluate("""t => { const z = [...document.querySelectorAll("[data-kanal='1']")].find(e => e.querySelector('.cam-text')?.textContent === t);
          return z ? [...z.classList].find(c => c.startsWith('cam-zeile--her-')) : null; }""", text)
    pruefe("Code der Bearbeitung grün (%s)" % her("G1Z8."), her("G1Z8.") == "cam-zeile--her-code")
    k1 = pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    vor = [z for z in k1 if z.startswith("G0X30.")]
    pruefe("Wegfahren der Bearbeitung blau (%s)" % (vor[:1]), vor and her(vor[0]) == "cam-zeile--her-vorlage")
    pruefe("Programmkopf ohne (%s)" % k1[0], her(k1[0]) == "cam-zeile--her-kopf")
    pruefe("Legende da", pg.locator("#cam-herkunft .cam-her").count() == 3)
    # von Hand eine Zeile nach dem Code einfügen: bleibt bei der Bearbeitung
    t = pg.locator("[data-kanal='1'] .cam-text", has_text="G1X17.5").first
    t.click(); pg.keyboard.press("End"); pg.keyboard.press("Enter"); pg.keyboard.type("G4U1.")
    pg.keyboard.press("Tab"); pg.wait_for_timeout(400)
    pruefe("Eingefügte Zeile im Code (%s)" % her("G4U1."), her("G4U1.") == "cam-zeile--her-code")
    pg.locator("#cam-kanaele").screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/cam_herkunft.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
