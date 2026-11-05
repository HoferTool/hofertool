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
    pg.fill("[data-cam='plan']", "0.3")
    pruefe("Zugabe Plan hinten", "G0W0.3(ZUGABE PLANDREHEN HINTEN)" in k(1))
    pruefe("Gleich viele Zeilen", len(k1) == len(k2))
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    sync2 = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='2'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken auf gleicher Zeile", sync == sync2 == ["M200", "M20", "M800", "M82", "M40", "M41", "M83"])
    pruefe("Keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.fill("[data-cam='nr']", "1000")
    pruefe("Nr. über 999 rot", pg.locator(".cam-feld--fehler [data-cam='nr']").count() == 1)
    pg.fill("[data-cam='nr']", "458")
    # Seit 1.396.0: Bearbeitung mit Drehwerkzeug T100–T600 zwischen Kopf und Ende
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='bez']", "aussen plan")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X-0.8F0.05\n\nG0Z0.5")
    t = [x for x in k(1) if x]
    a, b = t.index("(Ende Kopf)"), t.index("(Start Ende)")
    pruefe("Drehblock zwischen Kopf und Ende", t[a+1:b] == ["T100(AUSSEN PLAN)", "M1881D4", "M3S3000T1", "G0X[#531+1.]Z0.",
        "G1X-0.8F0.05", "G0Z0.5", "G1X[#531+0.2],A45.F0.05", "G0X30.", "M1891", "T0", "M1"])
    pg.fill("[data-block='0'] [data-camblock='wegA']", "")
    pg.select_option("[data-block='0'] [data-camblock='hd']", "")
    t = [x for x in k(1) if x]
    pruefe("Ohne Winkel und Hochdruck", "G1X[#531+0.2]F0.05" in t and "M1881D4" not in t and "M1891" not in t)
    pg.fill("[data-block='0'] [data-camblock='wegA']", "45")
    pg.select_option("[data-block='0'] [data-camblock='hd']", "4")
    pg.click("#cam-neu-dreh")
    pruefe("Zweiter Block nimmt freien Platz", pg.input_value("[data-block='1'] [data-camblock='platz']") == "200")
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken nach Blöcken weiter gepaart", len(sync) == 7 and pg.locator(".cam-zeile--fehler").count() == 0)
    pg.click("[data-camblock-weg='1']")
    pruefe("Block entfernen", pg.locator(".cam-block").count() == 1)
    # Seit 1.398.0: angewählte Bearbeitung hervorgehoben
    pg.click("[data-block='0'] [data-camblock='code']")
    akt = pg.eval_on_selector_all("[data-kanal='1'].cam-zeile--aktiv .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Bearbeitung hervorgehoben", akt[:1] == ["T100(AUSSEN PLAN)"] and akt[-1:] == ["M1"] and len(akt) == 11
           and pg.locator(".cam-block--aktiv[data-block='0']").count() == 1)
    # Seit 1.399.0: NC-Code ein- und ausklappen
    pg.click("[data-camblock-pfeil='0']")
    pruefe("Eingeklappt", pg.locator("[data-block='0'] [data-camblock='code']").count() == 0
           and "2 Zeilen" in pg.text_content("[data-camblock-auf='0']") and "G0Z0.5" in [x for x in k(1) if x])
    pg.click("[data-camblock-pfeil='0']")
    pruefe("Ausgeklappt", pg.input_value("[data-block='0'] [data-camblock='code']").startswith("G1X-0.8"))
    # Seit 1.397.0: Speichern und Öffnen in nc_programme (art "cam")
    pg.evaluate("TEST.daten.nc_programme = TEST.daten.nc_programme || []")
    pg.click("#camab-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "10870-0002"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    gesp = pg.evaluate("TEST.daten.nc_programme.filter(z => z.art === 'cam')")
    pruefe("Hofer Cam gespeichert", len(gesp) == 1 and gesp[0]["daten"]["nr"] == "458" and len(gesp[0]["daten"]["bloecke"]) == 1
           and "T100(AUSSEN PLAN)" in gesp[0]["nc"] and "O1458" in gesp[0]["nc"])
    pruefe("Stand gespeichert", "Gespeichert als" in (pg.text_content("#camab-stand") or ""))
    pg.click("#camab-neu"); pg.fill("[data-cam='nr']", "12"); pg.click("[data-camblock-weg='0']")
    pg.click("#camab-oeffnen"); pg.wait_for_selector("[data-ncgesp='10870-0002']")
    pg.click("[data-ncgesp='10870-0002'] .kt-gesp__name"); pg.wait_for_timeout(200)
    pruefe("Geöffnet wie gespeichert", pg.input_value("[data-cam='nr']") == "458" and pg.locator(".cam-block").count() == 1
           and pg.input_value("[data-block='0'] [data-camblock='bez']") == "AUSSEN PLAN")
    pg.fill("[data-cam='S']", "2500")
    pruefe("Geändert seit Speichern", "Geändert seit" in (pg.text_content("#camab-stand") or ""))
    pg.fill("[data-cam='S']", "3000")
    # Seit 1.398.0: Kanäle im eigenen Browserfenster, live
    with pg.expect_popup() as auf:
        pg.click("#cam-fenster")
    pop = auf.value; pop.wait_for_selector("#cam-kanaele")
    pk = lambda: pop.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Eigenes Fenster zeigt Kanal 1", "O0458(10870-0002)" in pk() and pg.locator("#cam-imfenster").count() == 1
           and pg.locator("#cam-kanaele").count() == 0)
    pruefe("Im Fenster hervorgehoben", pop.locator("[data-kanal='1'].cam-zeile--aktiv").count() == 11)
    pg.fill("[data-cam='nr']", "459"); pop.wait_for_timeout(150)
    pruefe("Eigenes Fenster rechnet live", "O0459(10870-0002)" in pk())
    pop.screenshot(path="hofer_cam_fenster.png")
    pg.fill("[data-cam='nr']", "458")
    pg.click("#cam-zurueck"); pg.wait_for_selector("#cam-kanaele")
    pruefe("Zurückgeholt", pop.is_closed() or pop.locator("#cam-kanaele").count() == 0)
    pg.screenshot(path="hofer_cam.png", full_page=False)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.screenshot(path="hofer_cam_dunkel.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
