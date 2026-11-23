# Reklamationsmanagement (1.742.0, Wunsch Patrick 23. November 2026):
# Reiter in der Qualitätssicherung, Reklamation zur HOCO Nr. erfassen,
# 8D mit Häkchen, Häkchen einer früheren Reklamation derselben HOCO Nr.
# übernehmen, 8D-Bericht als PDF.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("RK_BILDER", "")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    # Eine frühere Reklamation derselben HOCO Nr.
    pg.evaluate("""() => { TEST.daten.reklamationen = [{ id: 'rk1', nr: 'RK26-001', art: 'kunde', partner: 'Kunde A',
        eingang: '2026-10-02', hoco_nr: '10000-0301', fehler: 'Durchmesser zu gross', fehlerart: 'Mass ausser Toleranz',
        status: 'abgeschlossen', dateien: [], achtd: { d4: ['Werkzeugverschleiss'], d5: ['Werkzeug gewechselt'], d8: ['Massnahmen wirksam'] } }]; }""")
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(1200)
    tab = pg.locator("[data-reiter='reklamationen'], button:has-text('Reklamationsmanagement')").first
    if not tab.count(): fehler.append("Reiter Reklamationsmanagement fehlt")
    tab.click(); pg.wait_for_selector("#rk")
    if not pg.locator("#rk-leer").count() and pg.locator("[data-rk]").count(): fehler.append("Abgeschlossene im Filter Offen")
    pg.click("[data-rkstand='alle']"); pg.wait_for_selector("[data-rk='RK26-001']")
    if BILDER: pg.screenshot(path=BILDER + "/rk-liste.png")
    # Neue Reklamation
    pg.click("#rk-neu"); pg.wait_for_selector("#rk-fenster")
    pg.fill("#rk-f-partner", "Kunde B")
    pg.fill("#rk-f-hoco_nr", "10000-0301"); pg.locator("#rk-f-hoco_nr").blur(); pg.wait_for_timeout(600)
    if not pg.locator("#rk-frueher [data-rkuebernehmen='RK26-001']").count(): fehler.append("Frühere Reklamation nicht angezeigt")
    pg.click("[data-rkuebernehmen='RK26-001']"); pg.wait_for_timeout(300)
    an = pg.locator(".rk-haken__punkt.an").all_inner_texts()
    if not any("Werkzeugverschleiss" in x for x in an): fehler.append("Häkchen nicht übernommen: " + str(an))
    if any("Massnahmen wirksam" in x for x in an): fehler.append("D8 wurde mit übernommen")
    pg.click("[data-rk8d='d3'] [data-rkhaken='Ersatzlieferung']")
    pg.fill("#rk-f-fehler", "Gewinde nicht gängig")
    if BILDER: pg.screenshot(path=BILDER + "/rk-fenster.png", full_page=True)
    # Bericht speichert zuerst und lädt ein PDF
    with pg.expect_download(timeout=30000) as d:
        pg.click("#rk-bericht")
    if not d.value.suggested_filename.startswith("8D-Bericht RK"): fehler.append("PDF-Name: " + d.value.suggested_filename)
    z = pg.evaluate("() => TEST.daten.reklamationen.find(r => r.partner === 'Kunde B')")
    if not z: fehler.append("Neue Reklamation nicht gespeichert")
    else:
        if "Ersatzlieferung" not in (z.get("achtd") or {}).get("d3", []): fehler.append("D3 nicht gespeichert: " + str(z.get("achtd")))
        if z.get("nr") != "RK26-002": fehler.append("Nummer: " + str(z.get("nr")))
    pg.click("#rk-fenster [data-zu]"); pg.wait_for_timeout(500)
    # Dunkel
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.click("[data-rk='RK26-001']"); pg.wait_for_selector("#rk-fenster")
    pg.wait_for_timeout(800)
    if BILDER: pg.screenshot(path=BILDER + "/rk-dunkel.png")
    br.close()

print("Fehler:", "keine" if not fehler else "\n  " + "\n  ".join(fehler))
