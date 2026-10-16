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

def melden(pg, mid, stk, notiz):
    pg.click(f"[data-qsmelden='{mid}']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle input").first.fill(stk)
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

    # Seite QS im Menü
    if not pg.locator("a[href='#qs'], [data-pfad='qs'], a[href='#/qs']").count():
        fehler.append("QS nicht in der Navigation")
    pg.evaluate("location.hash='#qs'"); pg.wait_for_selector(f"[data-qsmelden='{mid}']")
    if "Keine offenen Meldungen" not in pg.inner_text("#inhalt"): fehler.append("Leere Liste ohne Hinweis")
    n = pg.locator("[data-qsmelden]").count()
    soll = pg.evaluate("Object.keys(TEST.daten.jobs.filter(j => !j.ended_at && ['laeuft','ruesten'].includes(j.plan_status)).reduce((a, j) => (a[j.machine_id] = 1, a), {})).length")
    if n != soll: fehler.append(f"{soll} Maschinen mit Auftrag erwartet, {n} da")
    # Pflichtfelder: ohne Notiz kein Speichern
    pg.click(f"[data-qsmelden='{mid}']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle input").first.fill("12"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(400)
    if not pg.locator(".dialog-huelle").count(): fehler.append("Ohne Notiz gespeichert")
    pg.click(".dialog-huelle [data-nein]"); pg.wait_for_timeout(400)
    melden(pg, mid, "120", "Grat am Einstich, 120 Stk. aussortiert")
    d = pg.evaluate("TEST.daten.qs_meldungen.map(x => ({...x}))")
    if len(d) != 1 or d[0].get("stueck") != 120 or d[0].get("machine_id") != mid:
        fehler.append("Meldung falsch gespeichert: " + str(d))
    if pg.evaluate("TEST.daten.production_records.some(z => z.quantity < 0)"): fehler.append("Etwas automatisch abgezogen")
    pg.wait_for_selector("#qs-meldungen [data-qsmeldung]")
    t = pg.inner_text("#qs-meldungen")
    if "120" not in t or "Grat" not in t: fehler.append("Meldung nicht in der Liste: " + t)
    if BILDER: pg.screenshot(path=BILDER + "/qs-seite.png", full_page=True)

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

    # Quittieren auf der Seite
    pg.evaluate("location.hash='#qs'"); pg.wait_for_selector(f"[data-qsmelden='{mid}']")
    melden(pg, mid, "5", "Masshaltig nicht ok")
    pg.wait_for_selector("[data-qsquittieren]"); pg.click("[data-qsquittieren]"); pg.wait_for_timeout(900)
    if pg.evaluate("TEST.daten.qs_meldungen.length") != 0: fehler.append("Seite: Quittieren hat nicht gelöscht")
    if not pg.locator("#qs-keine").count(): fehler.append("Seite nach Quittieren nicht leer")

    # Handy
    if BILDER:
        h = seite(br, 390, 844, True)
        h.evaluate("location.hash='#qs'"); h.wait_for_selector("[data-qsmelden]")
        melden(h, h.get_attribute("[data-qsmelden]", "data-qsmelden"), "30", "Kratzer")
        h.wait_for_selector("[data-qsquittieren]"); h.screenshot(path=BILDER + "/qs-handy.png", full_page=True)
    br.close()
print("QS-Meldungen | Fehler:", "; ".join(fehler) if fehler else "keine")
