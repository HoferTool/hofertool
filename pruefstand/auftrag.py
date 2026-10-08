# Auftragsfenster (React): Ab/Tage/Bis gekoppelt, Werkstoff erkannt,
# Ändern speichert, doppelte FA Nr. wird abgelehnt, neuer Auftrag
# übernimmt die Stammdaten der HOCO Nr., Löschen und Strg+Z.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1600,"height":950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    # Einen offenen Auftrag öffnen
    balken = pg.locator(".pw-balken[data-auftrag]").first
    jid = balken.get_attribute("data-auftrag")
    balken.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.fill("#pl-von", "2026-10-05"); pg.fill("#pl-tage", "3"); pg.wait_for_timeout(100)
    if pg.input_value("#pl-bis") != "2026-10-07": fehler.append("Bis folgt Tage nicht: " + pg.input_value("#pl-bis"))
    pg.fill("#pl-bis", "2026-10-09"); pg.wait_for_timeout(100)
    if pg.input_value("#pl-tage") != "5": fehler.append("Tage folgt Bis nicht: " + pg.input_value("#pl-tage"))
    pg.fill("#pl-mat-bez", "1.4305 rd 12"); pg.wait_for_timeout(500)
    if "V2A" not in pg.inner_text("#pl-werkstoff"): fehler.append("Werkstoff nicht erkannt: " + pg.inner_text("#pl-werkstoff"))
    pg.fill("#pl-menge", "1234")
    pg.select_option("#pl-zustand", "ruesten")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    for _ in range(2):   # Rückfrage "Material auch beim Teil ändern?"
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(800)
    j = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}')")
    if j["target_quantity"] != 1234: fehler.append("Menge nicht gespeichert")
    if j["planned_days"] != 5 or j["planned_from"] != "2026-10-05": fehler.append("Zeit nicht gespeichert")
    if j["material_bez"] != "1.4305 rd 12": fehler.append("Material nicht gespeichert")
    if j["plan_status"] != "ruesten": fehler.append("Zustand nicht gespeichert: " + str(j["plan_status"]))
    if j["color"] != "rot": fehler.append("Farbe nicht aus dem Werkstoff: " + str(j["color"]))
    if pg.locator(".dialog--auftrag").count(): fehler.append("Fenster bleibt nach Speichern offen")

    # Doppelte FA Nr.: Meldung, Fenster bleibt offen
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.fill("#pl-fa-nr", "2026-9999"); pg.click("#pl-ja"); pg.wait_for_timeout(1000)
    if not pg.locator(".dialog--auftrag").count(): fehler.append("Doppelte FA Nr. schliesst das Fenster")
    if "schon bei" not in pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' ')"):
        fehler.append("Keine Meldung zur doppelten FA Nr.")
    pg.click("#pl-nein"); pg.wait_for_timeout(500)

    # Neuer Auftrag: HOCO Nr. mit Stammdaten
    vorher = pg.evaluate("TEST.daten.jobs.length")
    ziel = pg.evaluate("""() => { for (const z of document.querySelectorAll('[data-zelle]')) {
        const r = z.getBoundingClientRect(); const x = r.x + r.width/2, y = r.y + r.height/2;
        if (document.elementFromPoint(x, y) === z && r.y > 260 && r.y < innerHeight - 80)
          return { x, y }; } return null; }""")
    pg.mouse.click(ziel["x"], ziel["y"]); pg.wait_for_selector("#pl-nr")
    pg.fill("#pl-nr", "10000-0301"); pg.wait_for_timeout(1200)
    if pg.input_value("#pl-mat-bez") != "CW400J": fehler.append("Material nicht aus Stammdaten: " + pg.input_value("#pl-mat-bez"))
    # Artikelbezeichnung ist seit 111.100.0 weg, das Material steht da
    if "CW400J" not in pg.inner_text("#pl-hoco-info") or "Deckel" in pg.inner_text("#pl-hoco-info"): fehler.append("Stammdaten nicht angezeigt")
    if not pg.locator("#pl-pdfreihe [data-pdfzeigen]").count(): fehler.append("Zeichnung nicht übernommen")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    if pg.evaluate("TEST.daten.jobs.length") != vorher + 1: fehler.append("Neuer Auftrag nicht angelegt")
    neu = pg.evaluate("TEST.daten.jobs[TEST.daten.jobs.length-1]")
    if neu["job_number"] != "10000-0301" or neu["material_bez"] != "CW400J": fehler.append("Neuer Auftrag falsch")

    # Löschen und zurücknehmen
    pg.wait_for_timeout(500)
    pg.locator(f".pw-balken[data-auftrag='{neu['id']}']").first.dblclick(); pg.wait_for_selector("#pl-loeschen")
    pg.click("#pl-loeschen"); pg.wait_for_timeout(800)
    if pg.locator(".dialog-huelle [data-nein]").count():   # Lücke schliessen?
        pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(800)
    if pg.evaluate(f"TEST.daten.jobs.some(x => x.id === '{neu['id']}')"): fehler.append("Nicht gelöscht")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1500)
    if not pg.evaluate("TEST.daten.jobs.some(x => x.job_number === '10000-0301' && x.material_bez === 'CW400J')"):
        fehler.append("Strg+Z holt den Auftrag nicht zurück")
    br.close()
print("Auftrag | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
