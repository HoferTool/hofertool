# Lager für eigene Teile (1.557.0, Wunsch Patrick 15. November 2026):
# nur Admins sehen den Reiter, einbuchen von einem Auftrag der Planwand,
# ausbuchen, Bestand je HOCO Nr., Buchung löschen. Andere Rollen nicht.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("LAGER_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def start(p, rolle, breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\nTEST.daten.lager_buchungen = [];\n" % rolle
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return br, pg, pf

with sync_playwright() as p:
    br, pg, pf = start(p, "mitarbeiter")
    pruefe(pg.locator("a[href='#/lager']").count() == 0, "Mitarbeiter: kein Menüpunkt Lager")
    br.close()

    br, pg, pf = start(p, "admin")
    pruefe(pg.locator("a[href='#/lager']").count() >= 1, "Admin: Menüpunkt Lager")
    pg.evaluate("location.hash='#/lager'"); pg.wait_for_selector("#lager-ein:not([disabled])")
    pruefe("Noch nichts an Lager" in pg.inner_text("#inhalt"), "leerer Bestand mit Hinweis")
    hoco = pg.evaluate("() => TEST.daten.planwand.find(j => j.job_number && j.plan_status === 'laeuft').job_number")
    jid = pg.evaluate("() => TEST.daten.planwand.find(j => j.job_number && j.plan_status === 'laeuft').id")
    pg.click("#lager-ein"); pg.wait_for_selector(".dialog-huelle select")
    pg.locator(".dialog-huelle select").select_option(jid)
    felder = pg.locator(".dialog-huelle input")
    felder.nth(1).fill("1'200"); felder.nth(2).fill("Regal A")
    pg.screenshot(path=BILD + "/lager-einbuchen.png")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    b = pg.evaluate("() => TEST.daten.lager_buchungen")
    pruefe(len(b) == 1 and b[0]["hoco_nr"] == hoco and b[0]["menge"] == 1200 and b[0]["job_id"] == jid and b[0]["ort"] == "Regal A",
           "Einbuchen vom Auftrag gespeichert: %s" % b)
    pruefe(pg.locator("[data-lager='%s']" % hoco).count() == 1 and "1'200 Stk" in pg.inner_text("[data-lager='%s']" % hoco), "Bestand 1'200 angezeigt")

    pg.click("#lager-ein"); pg.wait_for_selector(".dialog-huelle select")
    felder = pg.locator(".dialog-huelle input")
    felder.nth(0).fill("99999-0001"); felder.nth(1).fill("50")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-lager='99999-0001']").count() == 1, "Einbuchen ohne Auftrag mit HOCO Nr.")

    pg.click("[data-lager='%s'] .lager-zeile" % hoco); pg.wait_for_selector(".lager-offen")
    pg.click(".lager-offen .mat-kopf .knopf:not(.knopf--haupt)"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").nth(0).fill("200"); pg.locator(".dialog-huelle input").nth(1).fill("LS 4711")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    aus = [x for x in pg.evaluate("() => TEST.daten.lager_buchungen") if x["menge"] < 0]
    pruefe(len(aus) == 1 and aus[0]["menge"] == -200 and aus[0]["ort"] == "Regal A" and aus[0]["notiz"] == "LS 4711", "Ausbuchen gespeichert: %s" % aus)
    pruefe("1'000 Stk" in pg.inner_text("[data-lager='%s']" % hoco), "Bestand jetzt 1'000")
    pg.screenshot(path=BILD + "/lager-bestand.png")

    # Mehr ausbuchen als da: Rückfrage
    pg.click("#lager-aus"); pg.wait_for_selector(".dialog-huelle select")
    pg.locator(".dialog-huelle select").select_option("99999-0001")
    pg.locator(".dialog-huelle input").nth(0).fill("80")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(500)
    pruefe("Mehr als an Lager" in pg.inner_text("body"), "Rückfrage bei zu viel")
    pg.click(".dialog-huelle [data-nein]"); pg.wait_for_timeout(400)
    pruefe(len(pg.evaluate("() => TEST.daten.lager_buchungen")) == 3, "abgebrochen, nichts gebucht")

    pg.click("#lager-reiter-buchungen"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".lager-buchung").count() == 3, "Alle Buchungen: 3")
    pg.locator("#lager-filter").fill("LS 4711"); pg.wait_for_timeout(200)
    pruefe(pg.locator(".lager-buchung").count() == 1, "Suche nach Notiz")
    pg.locator("#lager-filter").fill("")
    pg.locator(".lager-buchung").first.locator(".knopf--gefahr").click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    pruefe(len(pg.evaluate("() => TEST.daten.lager_buchungen")) == 2, "Buchung gelöscht")
    pg.screenshot(path=BILD + "/lager-buchungen.png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

    br, pg, pf = start(p, "admin", 390, 844)
    pg.evaluate("location.hash='#/lager'"); pg.wait_for_selector("#lager-ein")
    sw = pg.evaluate("() => document.documentElement.scrollWidth")
    pruefe(sw <= 392, "Handy ohne seitliches Rollen: %s" % sw)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
