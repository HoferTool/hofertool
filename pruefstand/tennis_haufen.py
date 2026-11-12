# Seit 1.495.0 wirft ein Tänzer Nocco-Dosen statt der Tennisbälle; der Haufen bleibt gleich.
# Infoboard-Anzeige: die Tennisbälle bleiben liegen und stapeln sich, bis
# die Tafel voll ist (seit 1.477.0); reicht der Haufen bis unter den
# Kalender, fliesst alles unten ab und füllt sich neu (Wunsch Patrick
# 11. November 2026, seit 1.481.0). In der Gestaltung verschwinden sie weiter.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
FAKE = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.profiles[0].andere_nutzer = true;\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
BILDER = os.environ.get("BILDER", "/tmp")
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 540, "height": 960}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector("[data-ib='anzeige']")
    pruefe(pg.locator(".ib-gestalten .gm-leinwand").count() == 0, "Gestaltung: Bälle verschwinden wie bisher")
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector("#infoboard .gm-leinwand", timeout=15000)
    # Echte Schüsse der Kanone bleiben liegen
    for i in range(40):
        pg.wait_for_timeout(1000)
        if pg.evaluate("TEST.dosen.liegen()") >= 3: break
    n0 = pg.evaluate("TEST.dosen.liegen()")
    pruefe(n0 >= 3, "Dosen des Tänzers bleiben liegen: %d" % n0)
    pruefe(pg.locator("#infoboard .gm-dose").count() == 0, "keine verschwindenden Dosen mehr")
    gr = pg.evaluate("TEST.dosen.grenze()")
    pruefe(450 < gr < 1000, "Grenze unter dem Kalender: %.0f Punkte" % gr)
    # Viele einwerfen, bis der Haufen den Kalender erreicht
    def fuellen():
        t0 = time.time()
        while time.time() - t0 < 240:
            if pg.evaluate("TEST.dosen.fliegt.length") < 60: pg.evaluate("TEST.dosen.regen(25)")
            pg.wait_for_timeout(400)
            if pg.evaluate("TEST.dosen.voll()"): return True
        return False
    voll = fuellen()
    pruefe(voll, "Tafel füllt sich bis unter den Kalender")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(BILDER, "tennis_abfluss.png"))
    # Abfliessen: alles rinnt unten hinaus, danach ist die Tafel leer
    raus0 = pg.evaluate("TEST.dosen.raus()")
    for i in range(40):
        if not pg.evaluate("TEST.dosen.voll()"): break
        pg.wait_for_timeout(250)
    raus = pg.evaluate("TEST.dosen.raus()") - raus0
    pruefe(not pg.evaluate("TEST.dosen.voll()") and pg.evaluate("TEST.dosen.abfluss()") == 0,
      "fliesst ab: %d Bälle unten hinaus" % raus)
    pruefe(raus > 300 and pg.evaluate("TEST.dosen.liegen()") < 30, "Tafel danach leer: %d liegen" % pg.evaluate("TEST.dosen.liegen()"))
    # Und füllt sich wieder
    pg.evaluate("TEST.dosen.regen(25)"); pg.wait_for_timeout(5000)
    pruefe(pg.evaluate("TEST.dosen.liegen()") >= 15, "füllt sich neu: %d liegen" % pg.evaluate("TEST.dosen.liegen()"))
    voll2 = fuellen()
    pruefe(voll2 and pg.evaluate("TEST.dosen.runden()") >= 2, "zweite Runde bis unter den Kalender")
    # Liegen innerhalb der Tafel
    fps = pg.evaluate("""() => new Promise(r => { let n = 0; const t = performance.now();
      const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })""")
    print("Bilder je Sekunde", fps)
    pg.screenshot(path=os.path.join(BILDER, "tennis_neu.png"))
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
