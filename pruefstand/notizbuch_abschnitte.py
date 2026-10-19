# Notizbücher mit Abschnitten wie in OneNote (seit 1.101.0, Wunsch
# Patrick 19. Oktober 2026): Buch → Abschnitt → Seite. Ein altes Buch
# ohne Abschnitt bekommt einen mit seinem Namen, die Seiten bleiben.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.notizbuecher = [{ id: 'nbA', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, parks: [], erstellt_am: '2026-10-07T08:00:00Z' }];"
  " daten.notizbuch_seiten = [{ id: 'sA', buch_id: 'nbA', titel: 'Rüsten', reihenfolge: 1, inhalt: [] },"
  " { id: 'sB', buch_id: 'nbA', titel: 'Werkzeuge', reihenfolge: 2, inhalt: [] }];\n"
  "if (typeof window !== \"undefined\") window.TEST = TEST;")
BILD = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1200)
    ab = lambda: pg.evaluate("() => (TEST.daten.notizbuch_abschnitte || []).map(a => a.name)")
    liste = lambda: [e.inner_text() for e in pg.locator(".nb-seiten [data-nbseite]").all()]

    # --- Altes Buch: ein Abschnitt mit dem Namen des Buchs, Seiten bleiben ---
    pruefe(ab() == ["Werkstatt"], "Abschnitt mit dem Namen des Buchs angelegt: %s" % ab())
    pruefe(pg.locator(".nb-baum [data-nbabschnitt]").count() == 1, "Abschnitt eingerückt unter dem Buch")
    pruefe(liste() == ["Rüsten", "Werkzeuge"], "alte Seiten im Abschnitt: %s" % liste())

    # --- Neuer Abschnitt mit einer leeren Seite ---
    pg.locator("[data-nb='abschnitt-neu']").click(); pg.wait_for_timeout(300)
    pg.locator(".dialog").last.locator("input").first.fill("Messmittel")
    pg.locator(".dialog .knopf--haupt").last.click(); pg.wait_for_timeout(1200)
    pruefe(ab() == ["Werkstatt", "Messmittel"], "zweiter Abschnitt: %s" % ab())
    pruefe(pg.locator(".nb-eintrag.aktiv [data-nbabschnitt]").inner_text() == "Messmittel", "neuer Abschnitt offen")
    pruefe(liste() == ["Ohne Titel"], "darin eine leere Seite: %s" % liste())
    pg.locator("[data-nb='seite-neu']").click(); pg.wait_for_timeout(900)
    neu = pg.evaluate("() => TEST.daten.notizbuch_seiten.filter(s => s.abschnitt_id === TEST.daten.notizbuch_abschnitte[1].id).length")
    pruefe(neu == 2 and len(liste()) == 2, "neue Seite kommt in den offenen Abschnitt")
    pg.screenshot(path=os.path.join(BILD, "abschnitte-pc.png"))

    # --- Wechseln ---
    pg.locator("[data-nbabschnitt]").first.click(); pg.wait_for_timeout(800)
    pruefe(liste() == ["Rüsten", "Werkzeuge"], "zurück im ersten Abschnitt")
    pruefe(pg.locator(".nb-titel").first.input_value() == "Rüsten" if pg.locator("input.nb-titel").count() else True, "erste Seite offen")

    # --- Umbenennen ---
    pg.locator(".nb-baum [data-nbabbearb]").click(); pg.wait_for_timeout(300)
    pg.locator(".dialog").last.locator("input").first.fill("Allgemein")
    pg.locator(".dialog .knopf--haupt").last.click(); pg.wait_for_timeout(900)
    pruefe(ab()[0] == "Allgemein" and pg.locator("[data-nbabschnitt]").first.inner_text() == "Allgemein", "umbenannt")

    # --- Löschen mit Seiten, dann Rückgängig ---
    pg.locator("[data-nbabschnitt]").nth(1).click(); pg.wait_for_timeout(800)
    pg.locator(".nb-baum [data-nbabweg]").click(); pg.wait_for_timeout(300)
    pruefe("2 Seiten" in pg.locator(".dialog").last.inner_text(), "Löschen fragt einmal, mit Zahl der Seiten")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(1200)
    pruefe(ab() == ["Allgemein"] and pg.evaluate("() => TEST.daten.notizbuch_seiten.length") == 2, "Abschnitt samt Seiten gelöscht")
    pruefe(pg.locator(".nb-baum [data-nbabweg]").count() == 0, "letzter Abschnitt lässt sich nicht löschen")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.locator("#rueck-knopf").click(); pg.wait_for_timeout(1500)
    pruefe(sorted(ab()) == ["Allgemein", "Messmittel"] and pg.evaluate("() => TEST.daten.notizbuch_seiten.length") == 4,
           "Rückgängig holt Abschnitt und Seiten")

    # --- Gemerkt nach dem Wiederöffnen ---
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-nbabschnitt]").nth(1).click(); pg.wait_for_timeout(600)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1200)
    pruefe(pg.locator(".nb-eintrag.aktiv [data-nbabschnitt]").inner_text() == "Messmittel", "zuletzt offener Abschnitt wieder offen")

    # --- Handy: Abschnitte als Leiste ---
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-nbabschnittl]").first.is_visible() and not pg.locator("[data-nbabschnitt]").first.is_visible(),
           "Handy: Abschnitte als eigene Leiste")
    pg.locator("[data-nbabschnittl]").first.click(); pg.wait_for_timeout(800)
    pruefe(liste() == ["Rüsten", "Werkzeuge"], "Handy: Wechsel über die Leiste")
    pg.screenshot(path=os.path.join(BILD, "abschnitte-handy.png"))
    br.close()
print("Fehler:", "keine" if not fehler and not f else (fehler + f))
