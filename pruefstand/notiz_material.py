# Material-Bestellung aus der Notiz (111.37.0): Tippt man im
# Auftragsfenster „Mat BE: Metalix 2025007893 500kg 24.09.26“ in die
# Notiz, stehen Menge und Liefertermin sofort in ihren Feldern und
# werden gespeichert. Eine Startseiten-Notiz mit HOCO Nr. trägt die
# Bestellung in den nächsten geplanten Auftrag dieser Nummer ein.
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

    # 1. Auftragsfenster: Notiz tippen füllt Menge und Termin
    balken = pg.locator(".pw-balken[data-auftrag]").first
    jid = balken.get_attribute("data-auftrag")
    pg.evaluate(f"(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}'); j.material_menge = null; j.material_liefertermin = null; j.plan_note = null; }})()")
    balken.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.fill("#pl-notiz", "1. Los 5'000Stk.\nMat BE: Metalix 2025007893 500kg 24.09.26")
    pg.wait_for_timeout(200)
    if pg.input_value("#pl-menge-mat") != "500 kg · Metalix 2025007893":
        fehler.append("Menge nicht aus Notiz: " + pg.input_value("#pl-menge-mat"))
    if pg.input_value("#pl-liefer") != "24.09.26":
        fehler.append("Termin nicht aus Notiz: " + pg.input_value("#pl-liefer"))
    if not pg.locator("#pl-ausnotiz").count(): fehler.append("Kein Hinweis 'aus der Notiz'")
    # Weitertippen ohne neue Bestellung lässt Handgeändertes stehen
    pg.fill("#pl-liefer", "KW40")
    pg.fill("#pl-notiz", "1. Los 5'000Stk.\nMat BE: Metalix 2025007893 500kg 24.09.26\neilt")
    pg.wait_for_timeout(200)
    if pg.input_value("#pl-liefer") != "KW40": fehler.append("Hand-Termin überschrieben")
    pg.screenshot(path="notiz_material.png")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    for _ in range(2):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(800)
    j = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}')")
    if j["material_menge"] != "500 kg · Metalix 2025007893": fehler.append("Menge nicht gespeichert: " + str(j["material_menge"]))
    if j["material_liefertermin"] != "KW40": fehler.append("Termin nicht gespeichert: " + str(j["material_liefertermin"]))

    # 2. Beim Öffnen: leere Felder aus vorhandener Notiz (infoBoard)
    pg.evaluate(f"(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}'); j.material_menge = null; j.material_liefertermin = null; j.plan_note = 'Notz 2026008351 150kg für 0002+0003\\n30.04.26\\n(aus infoBoard)'; }})()")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    if pg.input_value("#pl-menge-mat") != "150 kg · Notz 2026008351": fehler.append("Beim Öffnen nicht gefüllt: " + pg.input_value("#pl-menge-mat"))
    if pg.input_value("#pl-liefer") != "30.04.26": fehler.append("Termin beim Öffnen: " + pg.input_value("#pl-liefer"))
    pg.click("#pl-nein"); pg.wait_for_timeout(400)

    # 3. Startseite: Notiz mit HOCO Nr. geht in den Auftrag
    ziel = pg.evaluate("""(() => { const j = TEST.daten.jobs.find(x => x.plan_status === 'geplant' && x.job_number);
        j.material_menge = null; j.material_liefertermin = null; j.plan_note = 'alt'; return { id: j.id, nr: j.job_number }; })()""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_selector("#notiz-neu")
    pg.click("#notiz-neu"); pg.wait_for_selector(".dialog-huelle textarea")
    pg.fill(".dialog-huelle textarea", ziel["nr"] + " Mat BE: SWS 10kg 2026008657 KW41")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1500)
    j = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{ziel['id']}')")
    if j["material_menge"] != "10 kg · SWS 2026008657": fehler.append("Startseiten-Notiz: Menge " + str(j["material_menge"]))
    if j["material_liefertermin"] != "KW41": fehler.append("Startseiten-Notiz: Termin " + str(j["material_liefertermin"]))
    if not str(j["plan_note"]).startswith("Mat BE: SWS 10kg 2026008657 KW41\nalt"): fehler.append("Zeile nicht in Auftragsnotiz: " + repr(j["plan_note"]))
    toasts = pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' ')")
    if "Material für Auftrag" not in toasts: fehler.append("Keine Meldung: " + toasts[:200])
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
