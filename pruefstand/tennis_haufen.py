# Infoboard-Anzeige: die Tennisbälle bleiben liegen und stapeln sich, bis
# die Tafel voll ist, danach laufen sie über (Wunsch Patrick 10. November
# 2026, seit 1.477.0). In der Gestaltung verschwinden sie weiter.
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
        if pg.evaluate("TEST.tennis.liegen()") >= 3: break
    n0 = pg.evaluate("TEST.tennis.liegen()")
    pruefe(n0 >= 3, "Bälle der Kanone bleiben liegen: %d" % n0)
    pruefe(pg.locator("#infoboard .gm-ball").count() == 0, "keine verschwindenden Bälle mehr")
    # Viele einwerfen, bis voll
    t0 = time.time(); voll = False
    while time.time() - t0 < 240:
        if pg.evaluate("TEST.tennis.fliegt.length") < 60: pg.evaluate("TEST.tennis.regen(25)")
        pg.wait_for_timeout(400)
        if pg.evaluate("TEST.tennis.voll()"): voll = True; break
    liegen = pg.evaluate("TEST.tennis.liegen()")
    pruefe(voll, "Tafel füllt sich bis oben: %d Bälle liegen" % liegen)
    pg.screenshot(path=os.path.join(BILDER, "tennis_voll.png"))
    # Überlaufen: weitere Bälle fallen hinaus, der Haufen wächst kaum noch
    for i in range(30):
        if pg.evaluate("TEST.tennis.fliegt.length") < 3: break
        pg.wait_for_timeout(500)
    for runde in range(6):
        pg.evaluate("TEST.tennis.regen(40)"); pg.wait_for_timeout(4000)
        if runde == 4: pg.screenshot(path=os.path.join(BILDER, "tennis_fluss.png"))
    pg.wait_for_timeout(6000)
    raus = pg.evaluate("TEST.tennis.raus()"); fl = pg.evaluate("TEST.tennis.fliegt.length")
    pruefe(raus >= 120 and fl < 40, "läuft über: %d von 240 fielen aus der Tafel, %d fliegen noch" % (raus, fl))
    # Liegen innerhalb der Tafel
    fps = pg.evaluate("""() => new Promise(r => { let n = 0; const t = performance.now();
      const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })""")
    print("Bilder je Sekunde", fps)
    pg.screenshot(path=os.path.join(BILDER, "tennis_ueberlauf.png"))
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
