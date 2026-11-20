# HOFERCAM 3D-Simulation SW-20 (seit 1.669.0): Kanal 1 und Kanal 3 an der
# Hauptspindel, Kanal 3 nach M133 bzw. M131. Mit Patricks O1272/O2272/O3272
# (nur gelesen, nie im Repository): ORDNER=<Ordner mit 1272.nc, 2272.nc, 3272.nc>
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = os.environ.get("ORDNER", "/mnt/project-files/hofercam/sw20")
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
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
    dateien = [ORDNER + "/" + n for n in ("1272.nc", "2272.nc", "3272.nc")]
    if not all(os.path.exists(d) for d in dateien):
        print("Patricks Programme fehlen, Test übersprungen"); br.close(); print("Fehler: keine"); raise SystemExit
    pg.set_input_files("#cam-einlesen input", dateien); pg.wait_for_timeout(1000)
    pg.click("#cam-sim-auf"); pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(600)
    namen = pg.eval_on_selector_all("[data-cam-sim-schritt]", "e => e.map(x => (x.disabled ? '(leer) ' : '') + x.textContent)")
    print("\n".join(namen))
    k3 = [i for i, n in enumerate(namen) if "K3" in n and not n.startswith("(leer)")]
    k1 = [i for i, n in enumerate(namen) if "K1" in n and not n.startswith("(leer)")]
    pruefe("Kanal-3-Bearbeitungen in der Liste", len(k3) >= 3)
    pruefe("Kanal 3 zwischen Kanal-1-Bearbeitungen (an der Stelle von M133)", k3 and k1 and min(k1) < min(k3))
    sw = lambda: pg.evaluate("() => document.querySelector('#cam-sim-bild').__sw")
    lagen = []
    for i in k3[:6]:
        pg.locator('[data-cam-sim-schritt]').nth(i).click(); pg.wait_for_timeout(250)
        lagen.append(sw())
    print(lagen)
    pruefe("Bei Kanal 3 ist Träger 3 aktiv", all(l and l.get("pfad") == 3 for l in lagen))
    pg.locator('[data-cam-sim-schritt]').nth(k1[0]).click(); pg.wait_for_timeout(250)
    pruefe("Bei Kanal 1 ist Träger 1 aktiv", (sw() or {}).get("pfad") == 1)
    pruefe("Quader beider Träger da", pg.evaluate("() => (document.querySelector('#cam-sim-bild').__quader || []).length > 5"))
    kopf = pg.locator(".cam-sim-kopf, #cam-sim").first.text_content()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
