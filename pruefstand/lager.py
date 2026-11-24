# Lager mit Logik (1.791.0, Wunsch Patrick 24. November 2026): nur Admins,
# externe Arbeitsschritte und Ablauf je HOCO Nr. in den Stammdaten,
# einbuchen aus der Produktion als teilfertig mit Index, „→ Schritt“ an die
# externe Firma, zurück einbuchen wird ganz fertig, Vorbereiten mit
# Ankündigung, Index wird nie zusammengezählt.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("LAGER_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

VOR = """
TEST.daten.lager_buchungen = []; TEST.daten.lager_extern = []; TEST.daten.lager_ablauf = []; TEST.daten.lager_avis = [];
(function () {
  const j = TEST.daten.planwand.find(j => j.job_number && j.plan_status === 'laeuft');
  const d = new Date(); d.setDate(d.getDate() + 6);
  j.planned_to = d.toISOString().slice(0, 10); j.ended_at = null;
  TEST.daten.hoco_parts = TEST.daten.hoco_parts || [];
  let h = TEST.daten.hoco_parts.find(x => x.hoco_nr === j.job_number);
  if (!h) { h = { hoco_nr: j.job_number }; TEST.daten.hoco_parts.push(h); }
  h.index_nr = 'B'; h.bezeichnung = h.bezeichnung || 'Probeteil';
})();
"""

def start(p, rolle, breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\n" % rolle + VOR
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return br, pg, pf

def dialog_feld(pg, label, wert):
    pg.locator(".dialog-huelle .feld", has_text=label).locator("input, textarea").first.fill(wert)

with sync_playwright() as p:
    br, pg, pf = start(p, "mitarbeiter")
    pruefe(pg.locator("a[href='#/lager']").count() == 0, "Mitarbeiter: kein Menüpunkt Lager")
    br.close()

    br, pg, pf = start(p, "admin")
    pruefe(pg.locator("a[href='#/lager']").count() >= 1, "Admin: Menüpunkt Lager")
    pg.evaluate("location.hash='#/lager'"); pg.wait_for_selector("#lager-ein:not([disabled])")
    job = pg.evaluate("() => TEST.daten.planwand.find(j => j.job_number && j.plan_status === 'laeuft')")
    hoco, jid = job["job_number"], job["id"]

    # Stammdaten: externer Schritt Härten, 5 AT, 3 AT vorher informieren
    pg.click("#lager-reiter-stamm"); pg.wait_for_selector("#lager-ext-neu")
    pg.click("#lager-ext-neu"); pg.wait_for_selector(".dialog-huelle input")
    dialog_feld(pg, "Arbeitsschritt", "Härten"); dialog_feld(pg, "Firma", "Härterei Muster")
    dialog_feld(pg, "Dauer", "5"); dialog_feld(pg, "Vorher informieren", "3"); dialog_feld(pg, "Kontakt", "haerten@beispiel.ch")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    ext = pg.evaluate("() => TEST.daten.lager_extern")
    pruefe(len(ext) == 1 and ext[0]["dauer_tage"] == 5 and ext[0]["vorlauf_tage"] == 3, "Externer Schritt gespeichert: %s" % ext)
    pg.wait_for_selector("[data-ext]")

    # Ablauf für die HOCO Nr.
    pg.click("#lager-ablauf-neu"); pg.wait_for_selector(".dialog-huelle input, [data-lager-ablauf]")
    if pg.locator("[data-lager-ablauf]").count() == 0:
        pg.locator(".dialog-huelle input").first.fill(hoco); pg.click(".dialog-huelle [data-ja]")
        pg.wait_for_selector("[data-lager-ablauf]")
    pg.select_option("#la-wahl", ext[0]["id"]); pg.click("#la-dazu")
    pg.screenshot(path=BILD + "/lager-ablauf.png")
    pg.click("[data-lager-ablauf] [data-ja]"); pg.wait_for_timeout(800)
    ab = pg.evaluate("() => TEST.daten.lager_ablauf")
    pruefe(len(ab) == 1 and ab[0]["hoco_nr"] == hoco and ab[0]["schritte"] == [ext[0]["id"]], "Ablauf gespeichert: %s" % ab)

    # Einbuchen aus der Produktion: teilfertig mit Index B
    pg.click("#lager-ein"); pg.wait_for_selector("[data-lager-buchen] #lb-job")
    pg.select_option("#lb-job", jid); pg.wait_for_timeout(200)
    pruefe(pg.locator("#lb-art [data-art='teil'].knopf--haupt").count() == 1, "Art teilfertig vorgeschlagen (Ablauf hat Härten)")
    pruefe(pg.input_value("#lb-index") == "B", "Index aus den Stammdaten")
    pg.fill("#lb-menge", "1'000"); pg.fill("#lb-ort", "Regal A")
    pg.screenshot(path=BILD + "/lager-einbuchen.png")
    pg.click("[data-lager-buchen] [data-ja]"); pg.wait_for_timeout(800)
    b = pg.evaluate("() => TEST.daten.lager_buchungen")
    pruefe(len(b) == 1 and b[0]["menge"] == 1000 and b[0]["art"] == "teil" and b[0]["index_nr"] == "B" and b[0]["job_id"] == jid and b[0]["grund"] == "produktion",
           "Einbuchen gespeichert: %s" % b)

    # Dieselbe HOCO Nr. mit altem Index A: eigene Linie
    pg.click("#lager-ein"); pg.wait_for_selector("[data-lager-buchen] #lb-grund")
    pg.select_option("#lb-grund", "kunde"); pg.wait_for_timeout(200)
    pg.fill("#lb-hoco", hoco); pg.fill("#lb-index", "A"); pg.fill("#lb-menge", "30")
    pg.click("[data-lager-buchen] [data-ja]"); pg.wait_for_timeout(800)

    pg.click("#lager-reiter-bestand"); pg.wait_for_selector("[data-lager='%s']" % hoco)
    pg.click("[data-lager='%s'] .lager-zeile" % hoco); pg.wait_for_selector(".lager-offen")
    pruefe(pg.locator(".lager-offen [data-linie]").count() == 2, "Index A und B getrennt")
    pruefe(pg.locator(".lager-offen .lager-schild--warn").count() == 1, "alter Index markiert")
    pg.screenshot(path=BILD + "/lager-bestand.png")

    # → Härten
    pg.click(".lager-offen [data-weiter]"); pg.wait_for_selector("[data-lager-buchen='aus']")
    pruefe(pg.input_value("#lb-ext") == ext[0]["id"], "nächster Schritt Härten vorgewählt")
    pruefe(pg.input_value("#lb-zurueck") != "", "zurück bis vorgeschlagen")
    pg.fill("#lb-menge", "1000")
    pg.click("[data-lager-buchen] [data-ja]"); pg.wait_for_timeout(800)
    raus = [x for x in pg.evaluate("() => TEST.daten.lager_buchungen") if x["menge"] < 0]
    pruefe(len(raus) == 1 and raus[0]["grund"] == "extern_raus" and raus[0]["ext_id"] == ext[0]["id"] and raus[0]["index_nr"] == "B", "an Härterei ausgebucht: %s" % raus)

    pg.click("#lager-reiter-extern"); pg.wait_for_selector("[data-unterwegs]")
    pruefe("1'000 Stk" in pg.inner_text("[data-unterwegs]"), "Bei externen Firmen: 1'000 Stk")
    pg.screenshot(path=BILD + "/lager-extern.png")
    pg.locator("[data-unterwegs] .knopf--haupt").click(); pg.wait_for_selector("[data-lager-buchen='ein']")
    pruefe(pg.locator("#lb-art [data-art='fertig'].knopf--haupt").count() == 1, "zurück: ganz fertig vorgeschlagen")
    pg.click("[data-lager-buchen] [data-ja]"); pg.wait_for_timeout(800)
    zur = [x for x in pg.evaluate("() => TEST.daten.lager_buchungen") if x.get("grund") == "extern_zurueck"]
    pruefe(len(zur) == 1 and zur[0]["menge"] == 1000 and zur[0]["art"] == "fertig" and zur[0]["stufe"] == 1 and zur[0]["bezug_id"] == raus[0]["id"], "zurück eingebucht: %s" % zur)
    pruefe(pg.locator("[data-unterwegs]").count() == 0, "nichts mehr extern")

    # Vorbereiten
    pg.click("#lager-reiter-vorbereiten"); pg.wait_for_selector("[data-vorbereiten]")
    t = pg.inner_text("[data-vorbereiten]")
    pruefe("Härten" in t and hoco in t, "Vorbereiten zeigt den Auftrag: %s" % t[:120])
    pg.screenshot(path=BILD + "/lager-vorbereiten.png")
    pg.click("[data-vorbereiten] [data-avis]"); pg.wait_for_timeout(800)
    pruefe(len(pg.evaluate("() => TEST.daten.lager_avis")) == 1, "Informiert gespeichert")

    pg.click("#lager-reiter-buchungen"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".lager-buchung").count() == 4, "Alle Buchungen: 4")
    pg.screenshot(path=BILD + "/lager-buchungen.png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

    br, pg, pf = start(p, "admin", 390, 844)
    pg.evaluate("location.hash='#/lager'"); pg.wait_for_selector("#lager-ein")
    sw = pg.evaluate("() => document.documentElement.scrollWidth")
    pruefe(sw <= 392, "Handy ohne seitliches Rollen: %s" % sw)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
