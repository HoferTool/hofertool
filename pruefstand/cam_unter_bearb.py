# HOFERCAM (seit 1.737.0): im Feld für den anderen Kanal (Wartemarken,
# M50/M51, M142/M143) lässt sich eine Bearbeitung dieses Kanals starten.
# Ihr Kopf steht vor der ersten Marke, ihr Ende nach der zweiten.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def kanal(pg, k):
    return [t.strip() for t in pg.eval_on_selector_all(f"[data-kanal='{k}'] .cam-text", "e => e.map(x => x.textContent)") if t.strip()]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    # SB-20RG: Wartemarken in Kanal 1, Bearbeitung Kanal 2
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(250)
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X5.Z-1.F0.1\nM350\nM360\nG1X6.")
    pg.wait_for_timeout(300)
    w = "[data-camunter-wahl='2:M350-M360'] select"
    pruefe("SB-20RG Wahl Kanal 2", pg.locator(w).count() == 1)
    pg.select_option(w, "k2"); pg.wait_for_timeout(300)
    pruefe("Felder der Bearbeitung", pg.locator("[data-camunter='k2'] [data-camblock='S']").count() == 1)
    pg.fill("[data-camunter='k2'] [data-camblock='code']", "G1X3.F0.05")
    pg.fill("[data-camunter='k2'] [data-camblock='bez']", "INNEN")
    pg.wait_for_timeout(400)
    k2 = kanal(pg, 2)
    try:
        a = k2.index("M350"); e = k2.index("M360")
        pruefe("Kanal 2 Kopf vor M350", any("T21" in z and "INNEN" in z for z in k2[:a]) and k2[a - 1] != "M350")
        pruefe("Kanal 2 Code zwischen", "/G1X3.F0.05" in k2[a:e] or "G1X3.F0.05" in k2[a:e])
        pruefe("Kanal 2 Ende nach M360", any(z.startswith("T0") or z == "M1" for z in k2[e + 1:]))
    except ValueError:
        pruefe("Kanal 2 hat M350/M360", False)
    pg.click("[data-camunter-weg]"); pg.wait_for_timeout(300)
    pruefe("entfernt: wieder Feld", pg.locator("[data-camk1='M350-M360']").count() == 1)
    pruefe("Code bleibt", "G1X3.F0.05" in (pg.input_value("[data-camk1='M350-M360'] textarea")))
    # SW-20: M50 mit Bearbeitung Kanal 3
    pg.once("dialog", lambda d: d.accept())
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(500)
    b = pg.locator(".dialog button:has-text('Wechseln'), .dialog button:has-text('Ja')")
    if b.count(): b.first.click(); pg.wait_for_timeout(300)
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(250)
    i = pg.locator("[data-block]").count() - 1
    pg.fill(f"[data-block='{i}'] [data-camblock='code']", "M50X[13]\nG1X3.6Z-0.5F0.2\nM51\nM300P13\nM310P13")
    pg.wait_for_timeout(300)
    pruefe("SW-20 Wahl M50 Kanal 3", pg.locator("[data-camunter-wahl='3:M50-M51'] select").count() == 1)
    opts = pg.eval_on_selector_all("[data-camunter-wahl='3:M50-M51'] option", "e => e.map(x => x.value)")
    pruefe("nur Kanal-3-Arten", set(opts) - {""} <= {"k3dr", "k3s", "k3f", "k3ff", "k3d"} and "k3dr" in opts)
    pg.select_option("[data-camunter-wahl='3:M50-M51'] select", "k3dr"); pg.wait_for_timeout(300)
    pruefe("vor/nach weg", pg.locator("[data-camsync='m50'] [data-camk1$=':vor']").count() == 0)
    pg.select_option("[data-camunter-wahl='3:M300-M310'] select", "k3d"); pg.wait_for_timeout(300)
    pg.fill("[data-camunter='k3d'] [data-camblock='code']", "G1Z5.F0.05")
    pg.wait_for_timeout(400)
    k3 = kanal(pg, 3)
    try:
        a = k3.index("M50X[13]"); e = k3.index("M51")
        pruefe("Kanal 3 T1100 vor M50", any(z.startswith("T1100") for z in k3[max(0, a - 12):a]))
        pruefe("Kanal 3 Ende nach M51", any("T0" in z for z in k3[e + 1:e + 12]))
        m = k3.index("M300P13"); n = k3.index("M310P13")
        pruefe("Kanal 3 T1600 vor M300", any(z.startswith("T16") for z in k3[e:m]))
        pruefe("Kanal 3 Code zwischen M300/M310", "G1Z5.F0.05" in k3[m:n])
    except ValueError as x:
        pruefe("Kanal 3 Marken da " + str(x), False)
    pruefe("keine roten Marken", pg.locator(".cam-zeile--rot").count() == 0)
    # Seit 1.738.0: die Bearbeitung im Feld hat ihr Werkzeug in der Simulation
    pg.fill("[data-camunter='k3d'] [data-camblock='bez']", "UNTERBOHR")
    pg.click("[data-camunter='k3d'] [data-camwz-auf]"); pg.wait_for_timeout(250)
    pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "3.2"); pg.fill("[data-camwz='winkel']", "140"); pg.fill("[data-camwz='laenge']", "20")
    pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pruefe("Werkzeug am Feld", "3.2" in pg.text_content("[data-camunter='k3d'] [data-camwz-auf]"))
    pg.click("#cam-sim-auf"); pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(600)
    namen = pg.eval_on_selector_all("[data-cam-sim-schritt]", "e => e.map(x => x.className + '|' + x.textContent)")
    print(namen)
    st = [n for n in namen if "UNTERBOHR" in n]
    pruefe("eigener Schritt in der Simulation", len(st) == 1)
    pruefe("mit Werkzeug (nicht rot)", bool(st) and "--fehlt" not in st[0])
    pruefe("Kanal-3-Code im Schritt", bool(st) and "leer" not in st[0].split("|")[0])
    pg.screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/unter.png", full_page=False)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
