# Radio im Pausenraum: Senderliste unter Einstellungen → Allgemein,
# Vorgabe mit Schweizer Sendern und Titans of CNC, ändern und speichern
import time, json
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
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**", "**://stream.srg-ssr.ch/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(800)
    pg.evaluate("TEST.daten.app_config = TEST.daten.app_config || []")
    pg.locator("[title='Einstellungen'], #einstellungen-knopf, button:has-text('Einstellungen')").first.click()
    pg.wait_for_selector("#radio-sender")
    zeilen = pg.locator("#radio-sender .es-radio__zeile")
    pruefe("Vorgabe 14 Sender: %d" % zeilen.count(), zeilen.count() == 14)
    namen = pg.eval_on_selector_all("#radio-sender .es-radio__name", "e => e.map(x => x.value)")
    pruefe("SRF 3, SRF info und Titans of CNC dabei", "SRF 3" in namen and "SRF info" in namen and "Titans of CNC" in namen)
    pruefe("noch kein Speichern-Knopf", pg.locator("#radio-speichern").count() == 0)
    pg.click("#radio-neu")
    neu = pg.locator("#radio-sender .es-radio__zeile").last
    neu.locator(".es-radio__name").fill("Radio Test")
    neu.locator(".es-radio__adresse").fill("http://nicht-sicher.ch/strom")
    pg.click("#radio-speichern"); pg.wait_for_timeout(400)
    gesp = pg.evaluate("(TEST.daten.app_config||[]).find(r => r.schluessel === 'radio_sender')")
    pruefe("http wird abgelehnt", not gesp)
    neu.locator(".es-radio__adresse").fill("https://example.ch/strom.mp3")
    pg.click("#radio-speichern"); pg.wait_for_timeout(600)
    gesp = pg.evaluate("(TEST.daten.app_config||[]).find(r => r.schluessel === 'radio_sender')")
    liste = json.loads(gesp["wert"]) if gesp else []
    pruefe("gespeichert mit 15 Sendern: %d" % len(liste), len(liste) == 15 and liste[-1]["name"] == "Radio Test")
    # Leiste im Pausenraum (Anzeige): Sender in einer Reihe, Video darunter
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    for u in ["**://*.youtube-nocookie.com/**", "**://example.ch/**", "**://www.srf.ch/**"]:
        pg.route(u, lambda r: r.fulfill(status=200, content_type="text/html", body="<body style='background:#300'>Video</body>"))
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1000)
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector(".ib-voll [data-ib='radio']"); pg.wait_for_timeout(800)
    leiste = pg.locator(".ib-voll [data-ib='pausenraum-leiste']")
    knoepfe = leiste.locator("[data-radio-sender]")
    pruefe("15 Knöpfe in der Leiste: %d" % knoepfe.count(), knoepfe.count() == 15)
    ys = pg.eval_on_selector_all(".ib-voll [data-radio-sender]", "e => [...new Set(e.map(x => Math.round(x.getBoundingClientRect().top)))]")
    pruefe("alle in einer Reihe: " + str(ys), len(ys) == 1)
    pg.screenshot(path="/tmp/claude-0/radio-leiste.png")
    pg.locator(".ib-voll [data-radio-sender='srf3']").click(); pg.wait_for_timeout(1200)
    # Ohne den Probesender und mit Lautstärke und Stopp: alle 14 sichtbar
    rand = pg.evaluate("""() => { const c = document.querySelector('.ib-voll .pr-radio__sender');
      const t = c.querySelector('[data-radio-sender]:last-child').offsetWidth + 6;
      return [c.scrollWidth - t, c.clientWidth]; }""")
    pruefe("die 14 Sender passen samt Lautstärke in die Reihe: %s" % rand, rand[0] <= rand[1])
    pg.screenshot(path="/tmp/claude-0/radio-spielt.png")
    pruefe("SRF 3 gewählt", "pr-radio__knopf--an" in (pg.locator(".ib-voll [data-radio-sender='srf3']").get_attribute("class") or ""))
    pruefe("Stopp da", pg.locator(".ib-voll [data-radio='stopp']").count() == 1)
    pruefe("Anzeige bleibt offen", pg.locator(".ib-voll").count() == 1)
    pg.locator(".ib-voll [data-radio-sender='titans']").click(); pg.wait_for_timeout(1200)
    src = pg.locator(".ib-voll [data-radio='video']").get_attribute("src") or ""
    pruefe("Titans of CNC als Videoliste: " + src[:80], "list=UUc2lUKVOTXKlQR7Fm7h1JfQ" in src)
    pruefe("SRF 3 nicht mehr an", "pr-radio__knopf--an" not in (pg.locator(".ib-voll [data-radio-sender='srf3']").get_attribute("class") or ""))
    pg.screenshot(path="/tmp/claude-0/radio-video.png")
    pg.locator(".ib-voll [data-radio-video='srfinfotv']").click(); pg.wait_for_timeout(800)
    src = pg.locator(".ib-voll [data-radio='video']").get_attribute("src") or ""
    pruefe("SRF info live im Player von Play SRF: " + src[:90], src.startswith("https://www.srf.ch/play/embed?urn=urn:srf:video:c49c1d73"))
    # Gross über die ganze Tafel, „Kleiner“ und „Grösser“ schalten um
    b = pg.locator(".ib-voll .ib-blatt").bounding_box()
    v = pg.locator(".ib-voll [data-radio='videofeld']").bounding_box()
    pruefe("Video gross über ganze Tafel: %s %s" % (v, b),
           abs(v["x"] - b["x"]) < 2 and abs(v["y"] - b["y"]) < 2 and abs(v["width"] - b["width"]) < 2 and abs(v["height"] - b["height"]) < 2)
    pg.screenshot(path="/tmp/claude-0/radio-gross.png")
    pg.locator(".ib-voll [data-radio='kleiner']").click(); pg.wait_for_timeout(300)
    v2 = pg.locator(".ib-voll [data-radio='videofeld']").bounding_box()
    pruefe("Kleiner legt es unter die Leiste", v2["y"] > b["y"] + 100 and pg.locator(".ib-voll [data-radio='groesser']").count() == 1)
    pg.locator(".ib-voll [data-radio='groesser']").click(); pg.wait_for_timeout(300)
    pruefe("Grösser wieder gross", pg.locator(".ib-voll .pr-radio__video--gross").count() == 1)
    pg.locator(".ib-voll [data-radio='stopp-gross']").click(); pg.wait_for_timeout(300)
    pruefe("Stopp blendet Video aus", pg.locator(".ib-voll [data-radio='video']").count() == 0)
    pruefe("keine Fehler: " + str(f), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
