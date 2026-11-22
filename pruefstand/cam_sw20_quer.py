# HOFERCAM (seit 1.678.0): SW-20 Querangetrieben T500–T700 (Kanal 1) und
# T1300–T1500 (Kanal 3) nach der Vorlage der SB-20RG, nur Plätze ohne
# Frontbohrapparat, Einlesen erkennt beide wieder, Simulation ohne Fehler.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = "/tmp/claude-0/cam_sw20_quer"; os.makedirs(ORDNER, exist_ok=True)
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
    k = lambda n: [t.strip() for t in pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")]
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
    pruefe("Knopf Querangetrieben Kanal 1 mit T500, T600, T700", "T500, T600, T700" in pg.inner_text("#cam-neu-seite"))
    pruefe("Knopf Querangetrieben Kanal 3 mit T1300, T1400, T1500", "T1300, T1400, T1500" in pg.inner_text("#cam-neu-k3s"))
    # T600 mit Frontbohrapparat → nicht mehr querangetrieben
    pg.click("[data-cam-swfront='600'] input"); pg.wait_for_timeout(200)
    pruefe("T600 mit Frontbohrapparat fällt weg", pg.inner_text("#cam-neu-seite").strip().endswith("T500, T700"))
    pg.click("#cam-neu-seite"); pg.wait_for_timeout(300)
    pg.fill("[data-block='0'] [data-camblock='bez']", "QUERBOHREN D2")
    pg.fill("[data-block='0'] [data-camblock='code']", "G87X2.0Q500F0.05\nG80"); pg.wait_for_timeout(300)
    k1 = k(1)
    i = k1.index("T500(QUERBOHREN D2)") if "T500(QUERBOHREN D2)" in k1 else -1
    pruefe("Kanal 1: T500 mit M1883D3 und G0T05", i >= 0 and k1[i + 1] == "M1883D3" and k1[i + 2] == "G0T05")
    pruefe("Kanal 1: M36S6000 und G0X[#531+1.]Z0.", i >= 0 and k1[i + 3] == "M36S6000" and k1[i + 4].startswith("G0X[#531+1.]Z0"))
    pruefe("Kanal 1: G1Y0.C0.F1. und Code", "G1Y0.C0.F1." in k1 and "G87X2.0Q500F0.05" in k1)
    pg.click("#cam-neu-k3s"); pg.wait_for_timeout(300)
    pg.fill("[data-block='1'] [data-camblock='bez']", "NUT")
    pg.fill("[data-block='1'] [data-camblock='code']", "G1X8.0F0.02\nG1Z3.0F0.05"); pg.wait_for_timeout(300)
    k3 = k(3)
    j = k3.index("T1300(NUT)") if "T1300(NUT)" in k3 else -1
    pruefe("Kanal 3: T1300 mit G0T13", j >= 0 and "G0T13" in k3[j:j + 4])
    pruefe("Kanal-3-Schild K3", pg.inner_text("[data-camblock-kanal='1']").strip() == "K3")
    pruefe("Keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.screenshot(path=ORDNER + "/quer.png", full_page=True)
    # Einlesen
    def datei(name, zeilen, neu):
        alt = next(z for z in zeilen if z.startswith("O")).split("(")[0]
        open(ORDNER + "/" + name, "w").write("%\n" + "\n".join(z for z in zeilen if z != "%").replace(alt, neu) + "\n%\n")
    datei("K1.NC", k(1), "O1272"); datei("K2.NC", k(2), "O2272"); datei("K3.NC", k(3), "O3272")
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/K1.NC", ORDNER + "/K2.NC", ORDNER + "/K3.NC"]); pg.wait_for_timeout(800)
    pruefe("Nach Einlesen zwei Bearbeitungen, keine wie eingelesen", pg.locator("[data-blockid]").count() == 2 and pg.locator("[data-camblock-frei]").count() == 0)
    violett = [v for v in pg.eval_on_selector_all(".cam-zeile--ein", "e => e.map(x => x.textContent)") if not v.lstrip("0123456789").startswith("O")]
    pruefe("Nichts violett " + str(violett[:5]), len(violett) == 0)
    # Simulation öffnet ohne Fehler
    pg.click("#cam-sim-auf"); pg.wait_for_timeout(2000)
    pruefe("Simulation offen", pg.locator("canvas").count() > 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
