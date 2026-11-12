# Tänzer mit Nocco-Dosen im Band (seit 1.495.0, Wunsch Patrick 12. November
# 2026): kein Mobil, keine Kanone mehr, ein tanzender Mann läuft durch und
# wirft Dosen. Das Foto steht nur in der Datenbank; hier ein Ersatzbild.
import os, time, base64, struct, zlib
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
FOTO = os.environ.get("TAENZER_FOTO")
if FOTO:
    url = "data:image/webp;base64," + base64.b64encode(open(FOTO, "rb").read()).decode()
else:
    url = ""
FAKE = FAKE.replace('app_config: [{ schluessel: "planwand_pin", wert: "0000" }],',
  'app_config: [{ schluessel: "planwand_pin", wert: "0000" }' + (', { schluessel: "durchfahrt_taenzer", wert: "%s" }' % url if url else '') + '],')
fehler = []
BILDER = os.environ.get("BILDER", "/tmp")
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_selector(".durchfahrt")
    pruefe(pg.locator(".gm-mobil").count() == 0 and pg.locator(".gm-kanone").count() == 0, "kein Mobil, keine Kanone")
    pg.wait_for_selector(".gm-taenzer", state="visible", timeout=15000)
    if url:
        pg.wait_for_selector(".gm-koerper img", timeout=5000)
        pruefe(True, "Foto aus der Datenbank")
    else:
        pruefe(pg.locator(".gm-koerper svg").count() == 1, "ohne Foto gezeichnete Figur")
    n = 0
    for i in range(30):
        pg.wait_for_timeout(500)
        n = max(n, pg.locator(".gm-dose").count())
        if n >= 1 and pg.locator(".gm-note").count(): break
    pruefe(n >= 1, "wirft Dosen: %d" % n)
    pruefe(pg.locator(".gm-note").count() >= 1, "Noten steigen auf")
    t1 = pg.evaluate("document.querySelector('.gm-koerper').style.transform")
    pg.wait_for_timeout(150)
    t2 = pg.evaluate("document.querySelector('.gm-koerper').style.transform")
    pruefe(t1 != t2 and "rotate" in t1, "tanzt: " + t1)
    for i in range(4):
        pg.wait_for_timeout(700)
        pg.locator(".kopfkarte").first.screenshot(path=os.path.join(BILDER, "taenzer_%d.png" % i))
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
