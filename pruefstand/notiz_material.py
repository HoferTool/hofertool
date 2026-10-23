# Material-Bestellung aus der Notiz: Von 111.37.0 bis 1.157.0 füllte
# „Mat BE: Metalix 2025007893 500kg 24.09.26“ in der Notiz Menge und
# Liefertermin aus. Seit 1.158.0 nicht mehr (Wunsch Patrick 23. Oktober
# 2026: „die Phase ist durch“): Notiz bleibt, wie sie ist, Felder leer,
# schon Eingetragenes bleibt. Eine schon übernommene Bestellung steht
# weiter nicht doppelt in der Notiz.
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

    # 1. Auftragsfenster: Notiz tippen füllt nichts mehr aus (seit 1.158.0)
    balken = pg.locator(".pw-balken[data-auftrag]").first
    jid = balken.get_attribute("data-auftrag")
    pg.evaluate(f"(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}'); j.material_menge = null; j.material_liefertermin = null; j.plan_note = null; }})()")
    balken.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    text = "1. Los 5'000Stk.\nMat BE: Metalix 2025007893 500kg 24.09.26"
    pg.fill("#pl-notiz", text)
    pg.wait_for_timeout(200)
    if pg.input_value("#pl-menge-mat") != "": fehler.append("Menge aus Notiz gefüllt: " + pg.input_value("#pl-menge-mat"))
    if pg.input_value("#pl-liefer") != "": fehler.append("Termin aus Notiz gefüllt: " + pg.input_value("#pl-liefer"))
    if pg.locator("#pl-ausnotiz").count(): fehler.append("Hinweis 'aus der Notiz' noch da")
    pg.screenshot(path="notiz_material.png")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    for _ in range(2):
        if pg.locator(".dialog-huelle [data-nein]").count():
            pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(800)
    j = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}')")
    if j["material_menge"]: fehler.append("Menge gespeichert: " + str(j["material_menge"]))
    if j["material_liefertermin"]: fehler.append("Termin gespeichert: " + str(j["material_liefertermin"]))
    if j["plan_note"] != text: fehler.append("Notiz verändert: " + repr(j["plan_note"]))

    # 2. Beim Öffnen: Bestellung in der Notiz füllt leere Felder nicht
    pg.evaluate(f"(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}'); j.material_menge = null; j.material_liefertermin = null; j.plan_note = 'Notz 2026008351 150kg für 0002+0003\\n30.04.26'; }})()")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    if pg.input_value("#pl-menge-mat") != "": fehler.append("Beim Öffnen gefüllt: " + pg.input_value("#pl-menge-mat"))
    if pg.input_value("#pl-liefer") != "": fehler.append("Termin beim Öffnen: " + pg.input_value("#pl-liefer"))
    if "2026008351" not in pg.input_value("#pl-notiz"): fehler.append("Notiz beim Öffnen gekürzt: " + repr(pg.input_value("#pl-notiz")))
    pg.click("#pl-nein"); pg.wait_for_timeout(400)

    # 3. Schon Eingetragenes bleibt: Menge und Termin stehen weiter da
    pg.evaluate(f"(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}'); j.material_menge = '500 kg · Metalix 2025007893'; j.material_liefertermin = '24.09.26'; j.plan_note = 'eilt'; }})()")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    if pg.input_value("#pl-menge-mat") != "500 kg · Metalix 2025007893": fehler.append("Alte Menge weg: " + pg.input_value("#pl-menge-mat"))
    if pg.input_value("#pl-liefer") != "24.09.26": fehler.append("Alter Termin weg: " + pg.input_value("#pl-liefer"))
    pg.click("#pl-nein"); pg.wait_for_timeout(400)

    # 4. Startseite: Notiz mit HOCO Nr. trägt nichts mehr in den Auftrag ein
    ziel = pg.evaluate("""(() => { const j = TEST.daten.jobs.find(x => x.plan_status === 'geplant' && x.job_number);
        j.material_menge = null; j.material_liefertermin = null; j.plan_note = 'alt'; return { id: j.id, nr: j.job_number }; })()""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_selector("#notiz-neu")
    pg.click("#notiz-neu"); pg.wait_for_selector(".dialog-huelle textarea")
    pg.fill(".dialog-huelle textarea", ziel["nr"] + " Mat BE: SWS 10kg 2026008657 KW41")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1500)
    j = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{ziel['id']}')")
    if j["material_menge"] or j["material_liefertermin"]: fehler.append("Startseiten-Notiz füllt Auftrag: " + str(j["material_menge"]) + " " + str(j["material_liefertermin"]))
    toasts = pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' ')")
    if "Material für Auftrag" in toasts: fehler.append("Meldung noch da: " + toasts[:200])

    # 5. Planwand: Notiz, die nur aus der übernommenen Bestellung besteht,
    # zeigt kein ✎ mehr und im Infofenster „keine Notiz“
    pg.evaluate(f"""(() => {{ const j = TEST.daten.jobs.find(x => x.id === '{jid}');
        j.plan_note = 'Mat BE: Metalix 2025007893 500kg 24.09.26 |';
        j.material_menge = '500 kg · Metalix 2025007893'; j.material_liefertermin = '24.09.26'; }})()""")
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(f".pw-balken[data-auftrag='{jid}']"); pg.wait_for_timeout(800)
    if pg.locator(f".pw-balken[data-auftrag='{jid}'] .pw-balken__zeichen[title='Notiz']").count():
        fehler.append("✎ trotz leerer Notiz")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
