# QS-Meldungen (1.77.0, Wunsch Patrick 16. Oktober 2026): Seite QS,
# Ausschuss zu einem laufenden Auftrag melden (Stück + Notiz), die
# Meldung steht im Pad der Maschine anstelle des Wetters, Quittieren
# im Pad oder auf der Seite löscht sie, danach ist das Wetter zurück.
# Den Zustand „QS Check“ gibt es nicht mehr.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("QS_BILDER", "")

def seite(br, b, h, mobil=False):
    ctx = br.new_context(viewport={"width": b, "height": h}, has_touch=mobil, is_mobile=mobil)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return pg

def zumPad(pg):
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(700)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)
    return pg.evaluate("""() => { const nr = document.querySelector('#pad .pad-wert--gross').textContent;
        const j = TEST.daten.jobs.find(x => x.job_number === nr && !x.ended_at); return j && j.machine_id; }""")

def zuQsCheck(pg):
    if pg.locator("#pad").count(): pg.click("#pad [data-padzu]"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(700)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='qs']")
    pg.click("#pad [data-padwo='qs']"); pg.wait_for_selector("#pad [data-qsfort]")

def melden(pg, mid, stk, notiz):
    pg.click(f"#pad [data-qsfort='{mid}']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    feld = pg.locator(".dialog-huelle input").first
    if feld.get_attribute("readonly") is None: feld.fill(stk)
    else:
        # Touch-Gerät: Tipp aufs Feld öffnet den Zifferblock (1.92.1)
        feld.click(); pg.wait_for_selector(".zifferblock")
        for z in stk: pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle textarea").first.fill(notiz)
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1000)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = seite(br, 1400, 950)
    # Pad: welche Maschine, und ohne Meldung steht das Wetter
    mid = zumPad(pg)
    if "WETTER" not in pg.inner_text("#pad .pad-karte2--saeule").upper(): fehler.append("Ohne Meldung kein Wetter")
    if pg.locator("#pad-qsmeldung").count(): fehler.append("Meldung ohne Meldung")
    # Zustand QS Check nicht mehr wählbar
    pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w]")
    if pg.locator(".dialog-huelle [data-w='qs']").count(): fehler.append("QS Check im Pad noch wählbar")
    pg.click(".dialog-huelle [data-nein]") if pg.locator(".dialog-huelle [data-nein]").count() else pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(700)

    # Keine Seite QS mehr im Menü (seit 1.310.0), gemeldet wird im QS Check des Pads
    if pg.locator("a[href='#qs'], [data-pfad='qs'], a[href='#/qs']").count():
        fehler.append("QS noch in der Navigation")
    pg.evaluate("location.hash='#qs'"); pg.wait_for_timeout(800)
    if pg.locator("[data-qsmelden]").count(): fehler.append("Seite QS noch erreichbar")
    zuQsCheck(pg)
    if pg.inner_text("#pad [data-padmeldungenzahl]") != "0": fehler.append("Zahl am Knopf ohne Meldung nicht 0")
    pg.click("#pad [data-padmeldungen]"); pg.wait_for_selector("#qs-offen-fenster #qs-keine")
    pg.click("#qs-offen-fenster [data-nein]"); pg.wait_for_timeout(300)
    melden(pg, mid, "120", "Grat am Einstich, 120 Stk. aussortiert")
    d = pg.evaluate("TEST.daten.qs_meldungen.map(x => ({...x}))")
    if len(d) != 1 or d[0].get("stueck") != 120 or d[0].get("machine_id") != mid:
        fehler.append("Meldung falsch gespeichert: " + str(d))
    if pg.evaluate("TEST.daten.production_records.some(z => z.quantity < 0)"): fehler.append("Etwas automatisch abgezogen")
    pg.wait_for_timeout(800)
    if pg.inner_text("#pad [data-padmeldungenzahl]") != "1": fehler.append("Zahl am Knopf nach Meldung nicht 1")
    if "pad__meldungen--offen" not in (pg.get_attribute("#pad [data-padmeldungen]", "class") or ""):
        fehler.append("Knopf nicht rot mit offener Meldung")
    pg.click("#pad [data-padmeldungen]"); pg.wait_for_selector("#qs-offen-fenster #qs-meldungen [data-qsmeldung]")
    t = pg.inner_text("#qs-offen-fenster")
    if "120" not in t or "Grat" not in t: fehler.append("Meldung nicht in der Liste: " + t)
    if BILDER: pg.wait_for_timeout(900); pg.screenshot(path=BILDER + "/qs-offen-fenster.png")
    pg.click("#qs-offen-fenster [data-nein]"); pg.wait_for_timeout(300)
    if BILDER: pg.screenshot(path=BILDER + "/qs-pad-knopf.png")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(700)

    # Im Pad anstelle des Wetters
    zumPad(pg)
    pg.wait_for_selector("#pad-qsmeldung", timeout=8000)
    s = pg.inner_text("#pad .pad-karte2--saeule")
    if "120" not in s or "Grat" not in s: fehler.append("Pad zeigt Meldung nicht: " + s)
    if "WETTER" in s.upper(): fehler.append("Wetter trotz Meldung")
    if BILDER: pg.screenshot(path=BILDER + "/qs-pad.png")
    pg.click("#pad [data-padqsquittieren]"); pg.wait_for_timeout(900)
    if pg.locator("#pad-qsmeldung").count(): fehler.append("Nach Quittieren noch da")
    if "WETTER" not in pg.inner_text("#pad .pad-karte2--saeule").upper(): fehler.append("Wetter nicht zurück")
    if pg.evaluate("TEST.daten.qs_meldungen.length") != 0: fehler.append("Quittieren hat nicht gelöscht")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(700)

    # Quittieren im Fenster „Offene Meldungen“
    zuQsCheck(pg)
    melden(pg, mid, "5", "Masshaltig nicht ok")
    pg.click("#pad [data-padmeldungen]"); pg.wait_for_selector("#qs-offen-fenster [data-qsquittieren]")
    pg.click("#qs-offen-fenster [data-qsquittieren]"); pg.wait_for_timeout(900)
    if pg.evaluate("TEST.daten.qs_meldungen.length") != 0: fehler.append("Fenster: Quittieren hat nicht gelöscht")
    if not pg.locator("#qs-offen-fenster #qs-keine").count(): fehler.append("Fenster nach Quittieren nicht leer")
    pg.click("#qs-offen-fenster [data-nein]"); pg.wait_for_timeout(300)
    # Rückgängig von „Ausschuss melden“ vermerkt zuerst zurueck, damit die
    # Datenbank die Menge auch aus der Statistik nimmt (1.186.1); jedes
    # andere Löschen zählt dort als Quittieren
    melden(pg, mid, "3", "Falsch gemeldet")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(700)
    vorher = pg.evaluate("TEST.protokoll.length")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(1000)
    arten = pg.evaluate(f"TEST.protokoll.slice({vorher}).filter(x => x.tabelle === 'qs_meldungen' && x.art !== 'select').map(x => x.art)")
    if arten[:2] != ["update", "delete"]: fehler.append("Rückgängig ohne Vermerk zurueck: " + str(arten))
    if pg.evaluate("TEST.daten.qs_meldungen.length") != 0: fehler.append("Rückgängig hat die Meldung nicht entfernt")

    # Pad, QS Check: der Fortschritt ist ein Knopf und öffnet das grosse Fenster (1.78.0)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(700)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='qs']")
    pg.click("#pad [data-padwo='qs']"); pg.wait_for_selector(f"#pad [data-qsfort='{mid}']")
    pg.click(f"#pad [data-qsfort='{mid}']"); pg.wait_for_selector("#qs-fenster")
    t = pg.inner_text("#qs-fenster")
    nr = pg.evaluate(f"TEST.daten.jobs.find(j => j.machine_id === '{mid}' && !j.ended_at && ['laeuft','ruesten'].includes(j.plan_status)).job_number")
    if nr not in t: fehler.append("Grosses Fenster ohne HOCO Nr.: " + t[:200])
    if "Stück am Counter abziehen" not in t: fehler.append("Fenster ohne Stückfeld")
    pg.fill("#qsf-stueck", "44"); pg.fill("#qsf-notiz", "Durchmesser zu gross")
    pg.wait_for_timeout(900)
    if BILDER: pg.screenshot(path=BILDER + "/qs-fenster-pad.png")
    pg.click("#qs-fenster [data-ja]"); pg.wait_for_timeout(1000)
    if pg.locator("#qs-fenster").count(): fehler.append("Fenster nach Melden noch offen")
    d = pg.evaluate("TEST.daten.qs_meldungen.map(x => ({...x}))")
    if len(d) != 1 or d[0].get("stueck") != 44 or d[0].get("machine_id") != mid: fehler.append("Pad-Meldung falsch: " + str(d))
    # Nochmals öffnen: die offene Meldung steht im Fenster und lässt sich quittieren
    pg.click(f"#pad [data-qsfort='{mid}']"); pg.wait_for_selector("#qs-fenster [data-qsfquittieren]")
    if BILDER: pg.screenshot(path=BILDER + "/qs-fenster-offen.png")
    pg.click("#qs-fenster [data-qsfquittieren]"); pg.wait_for_timeout(800)
    if pg.evaluate("TEST.daten.qs_meldungen.length") != 0: fehler.append("Im Fenster nicht quittiert")
    pg.click("#qs-fenster .qsf__zu"); pg.wait_for_timeout(400)
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(700)

    # iPad mit Finger: Stück über den Zifferblock der App, keine Tastatur;
    # Quittieren-Knopf mit heller Schrift auf dunklem Grund (1.92.1)
    ip = seite(br, 820, 1180, True)
    zuQsCheck(ip)
    ip.click(f"#pad [data-qsfort='{mid}']"); ip.wait_for_selector("#qsf-stueck")
    if ip.get_attribute("#qsf-stueck", "inputmode") != "none": fehler.append("iPad: Stückfeld holt Tastatur")
    if ip.get_attribute("#qsf-notiz", "inputmode") not in (None, "text"): fehler.append("iPad: Notiz ohne normale Tastatur")
    ip.click("#qsf-stueck"); ip.wait_for_selector(".zifferblock")
    for z in "17": ip.click(f".zifferblock [data-zb='{z}']")
    ip.click(".zifferblock [data-zbja]"); ip.wait_for_timeout(400)
    if ip.input_value("#qsf-stueck") != "17": fehler.append("iPad: Zifferblock trägt nicht ein")
    if not ip.locator("#qs-fenster").count(): fehler.append("iPad: Fenster nach Zifferblock zu")
    ip.fill("#qsf-notiz", "Grat"); ip.click("#qs-fenster [data-ja]"); ip.wait_for_timeout(1000)
    d = ip.evaluate("TEST.daten.qs_meldungen.map(x => ({...x}))")
    if len(d) != 1 or d[0].get("stueck") != 17: fehler.append("iPad: Meldung über Zifferblock falsch: " + str(d))
    ip.click("#pad [data-padzu]"); ip.wait_for_timeout(500)
    zumPad(ip); ip.wait_for_selector("#pad [data-padqsquittieren]", timeout=8000)
    farbe = ip.evaluate("""() => { const c = getComputedStyle(document.querySelector('#pad [data-padqsquittieren]'));
        return [c.color, c.webkitTextFillColor, c.backgroundColor]; }""")
    if farbe[0] != "rgb(255, 255, 255)" or farbe[1] != "rgb(255, 255, 255)" or farbe[2].startswith("rgb(255"):
        fehler.append("Quittieren-Knopf schlecht lesbar: " + str(farbe))
    if BILDER: ip.screenshot(path=BILDER + "/qs-pad-ipad.png")
    ip.click("#pad [data-padqsquittieren]"); ip.wait_for_timeout(900)
    if ip.evaluate("TEST.daten.qs_meldungen.length") != 0: fehler.append("iPad: nicht quittiert")

    # Handy: Knopf ohne Text, nur die Zahl
    if BILDER:
        h = seite(br, 390, 844, True)
        zuQsCheck(h); h.screenshot(path=BILDER + "/qs-pad-handy.png")
    br.close()
print("QS-Meldungen | Fehler:", "; ".join(fehler) if fehler else "keine")
