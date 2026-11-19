# HOFERTIME (1.626.0): Kommen / Gehen, Tage mit Ist, Soll, Gleitzeit,
# Ferien, Fehlermeldungen, Nachtragen, Konto nur für HOFERTIME, eigene
# App-Adresse ?app=hofertime und Stempel-Terminal.
import time, os, json
from datetime import date, timedelta, datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("ZEIT_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

# Vorgeschichte: letzte Woche ein Tag ohne Gehen
heute = date.today()
d = heute - timedelta(days=1)
while d.weekday() >= 5: d -= timedelta(days=1)
tag_fehlt = d.isoformat()
def iso(tag, hm): return datetime.fromisoformat(tag + "T" + hm).astimezone().isoformat()
STEMPEL = [{"id": "s1", "person_id": "u1", "art": "kommen", "zeit": iso(tag_fehlt, "07:00:00"), "quelle": "pc"}]
EINST = [{"person_id": "u1", "lohnart": "monat", "soll_woche_h": 42.5, "pensum": 100, "saldo_start_tag": (heute - timedelta(days=10)).isoformat(),
          "saldo_start_min": 120, "ferien_tage_jahr": 25, "ferien_uebertrag": 0}]
FERIEN = [{"person": "x", "von": (heute + timedelta(days=20)).isoformat(), "tage": 5, "abwesenheit": "ferien"}]

def start(p, rolle, adresse="hofertime/index.html", extra="", breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e.stack)[:900]))
    body = FAKE + (";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\n" % rolle) + \
        "TEST.daten.zeit_stempel = %s; TEST.daten.zeit_personen = %s; TEST.daten.zeit_verlauf = [];\n" % (json.dumps(STEMPEL), json.dumps(EINST)) + \
        "TEST.rpc.zeit_abwesenheiten = () => %s; TEST.funktionen = TEST.funktionen || {};\n" % json.dumps(FERIEN) + \
        "TEST.rpc.zeit_umbuchen = (a) => { const b = { id: 'b' + Date.now(), person_id: a.p_person, datum: a.p_datum, tage: a.p_tage, minuten: Math.round(-a.p_tage * 510), notiz: a.p_notiz }; (TEST.daten.zeit_buchungen = TEST.daten.zeit_buchungen || []).push(b); return b; };\n" + \
        "TEST.rpc.zeit_umbuchung_loeschen = (a) => { TEST.daten.zeit_buchungen = (TEST.daten.zeit_buchungen || []).filter(x => x.id !== a.p_id); return true; };\n" + \
        "TEST.funktionen['zeit-konto'] = (b) => { TEST.daten.profiles.push({ id: 'z9', email: 'z@x', full_name: b.name, role: 'mitarbeiter', is_active: true, nur_zeit: true }); return { id: 'z9' }; };\n" + extra
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/{adresse}", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt", state="attached"); pg.wait_for_timeout(1200)
    return br, pg, pf

with sync_playwright() as p:
    # Seit 1.635.1 kein Reiter HOFERTIME mehr im HoferTool
    br, pg, pf = start(p, "admin", "index.html")
    pruefe(pg.locator("a[href='#/zeit']").count() == 0, "kein Menüpunkt HOFERTIME im HoferTool")
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_timeout(800)
    pruefe(pg.locator("#ze-knopf").count() == 0, "#/zeit im HoferTool zeigt HOFERTIME nicht")
    br.close()
    br, pg, pf = start(p, "admin")
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pruefe("Kommen fehlt" in pg.inner_text("#inhalt") or "Gehen fehlt" in pg.inner_text("#ze-fehler"), "Fehlermeldung: Gehen fehlt")
    pruefe(pg.locator("#ze-verlauf circle").count() >= 2, "Gleitzeit-Verlauf als Grafik")
    st_tage = pg.locator("[data-ze-saldotag]").all_inner_texts()
    pruefe(any(x.strip() for x in st_tage), "Gleitzeit je Tag in der Liste: " + " ".join(x.strip() for x in st_tage if x.strip())[:120])
    pruefe(pg.locator("#ze-gleitzeit").count() == 1, "Gleitzeit-Saldo da: " + (pg.inner_text("#ze-gleitzeit") if pg.locator("#ze-gleitzeit").count() else ""))
    pruefe("25 Tage" in pg.inner_text("#ze-ferien") or "20 Tage" in pg.inner_text("#ze-ferien") or "Anspruch 25" in pg.inner_text("#ze-ferien"), "Ferien: " + pg.inner_text("#ze-ferien").replace("\n", " "))
    pg.screenshot(path=BILD + "/zeit-start.png")
    pg.click("#ze-knopf"); pg.wait_for_timeout(900)
    st = pg.evaluate("() => TEST.daten.zeit_stempel")
    pruefe(len(st) == 2 and st[1]["art"] == "kommen" and st[1]["person_id"] == "u1", "Kommen gestempelt")
    pruefe("Eingestempelt seit" in pg.inner_text("#ze-stand") and pg.inner_text("#ze-knopf") == "Gehen", "Stand: eingestempelt, Knopf Gehen")
    pg.click("#ze-knopf"); pg.wait_for_timeout(900)
    st = pg.evaluate("() => TEST.daten.zeit_stempel")
    pruefe(len(st) == 3 and st[2]["art"] == "gehen", "Gehen gestempelt")
    # Fehler korrigieren: zum Tag, nachtragen
    pg.click("[data-ze-fehler='%s']" % tag_fehlt); pg.wait_for_selector(".ze-offen")
    pg.click(".ze-offen [data-ze-einzeln]"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle select").first.select_option("gehen")
    pg.locator(".dialog-huelle input[type=time]").fill("16:30")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    pruefe(pg.locator("[data-ze-fehler='%s']" % tag_fehlt).count() == 0, "Nach Nachtragen kein Fehler mehr für diesen Tag")
    pruefe("07:00–16:30" in pg.inner_text("[data-ze-tag='%s']" % tag_fehlt), "Paar 07:00–16:30 angezeigt")
    pg.screenshot(path=BILD + "/zeit-woche.png", full_page=True)
    # Alle Mitarbeiter, Konto anlegen
    pg.click("#ze-reiter-alle"); pg.wait_for_selector("#ze-anwesend")
    pg.click("#ze-neues-konto"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").nth(0).fill("Max Muster"); pg.locator(".dialog-huelle input").nth(1).fill("482913")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1000)
    pr = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'pin_setzen')")
    pruefe(len(pr) == 1 and pr[0]["args"]["p_ziel"] == "z9", "PIN gesetzt für neues Konto")
    pruefe(pg.locator("[data-ze-person='z9']").count() == 1 and "nur HOFERTIME" in pg.inner_text("[data-ze-person='z9']"), "neues Konto in der Liste")
    pg.screenshot(path=BILD + "/zeit-alle.png")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Gutschrift Spätschicht (nur mit Häkchen) und Abwesend eintragen
    sp = [{"id": "g1", "person_id": "u1", "art": "kommen", "zeit": iso(tag_fehlt, "12:30:00"), "quelle": "pc"},
          {"id": "g2", "person_id": "u1", "art": "gehen", "zeit": iso(tag_fehlt, "19:00:00"), "quelle": "pc"}]
    br, pg, pf = start(p, "admin", extra="TEST.daten.zeit_stempel = %s; TEST.daten.zeit_personen[0].spaet_gutschrift = true; TEST.daten.vacations = [];" % json.dumps(sp))
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.click("#ze-monat"); pg.wait_for_timeout(600)
    zl = pg.locator("[data-ze-tag='%s']" % tag_fehlt)
    pruefe(zl.count() == 1 and "Spätschicht +2:30" in zl.inner_text() and "9:00" in zl.inner_text(), "Gutschrift Spätschicht 6:30 + 2:30 = 9:00: " + (zl.inner_text().replace("\n", " ") if zl.count() else ""))
    zl.locator(".ze-zeile").click(); pg.wait_for_selector("[data-ze-abwesend]")
    pg.click("[data-ze-abwesend]"); pg.wait_for_selector(".dialog-huelle select")
    pg.locator(".dialog-huelle select").first.select_option("kompensieren")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    v = pg.evaluate("() => TEST.daten.vacations")
    pruefe(len(v) == 1 and v[0]["abwesenheit"] == "kompensieren" and v[0]["von"] == tag_fehlt and v[0]["tage"] == 1 and v[0]["zeile"] == 1, "Abwesend eingetragen: %s" % v)
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Ungeplante Krankheit steht nicht auf der Planwand, nur hier, mit Löschen (1.641.0)
    br, pg, pf = start(p, "admin", extra="TEST.rpc.zeit_abwesenheiten_liste = () => [{id: 'k1', person: 'x', von: '%s', tage: 1, abwesenheit: 'krankheit', planwand: false}];" % tag_fehlt)
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.click("#ze-monat"); pg.wait_for_timeout(600)
    zl = pg.locator("[data-ze-tag='%s']" % tag_fehlt)
    pruefe("Krankheit" in zl.inner_text(), "Krankheit ohne Planwand zählt in HOFERTIME")
    zl.locator(".ze-zeile").click(); pg.wait_for_selector("[data-ze-abwesenheit='k1']")
    pruefe("nicht auf der Planwand" in pg.inner_text("[data-ze-abwesenheit='k1']"), "Tag zeigt „nicht auf der Planwand“")
    # Ändern (seit 1.649.0): Art auf Unfall, 2 Tage
    pg.click("[data-ze-abwesenheit='k1'] [data-ze-abw-aendern]"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle select").first.select_option("unfall")
    pg.locator(".dialog-huelle input").nth(1).fill("2")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(600)
    r = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'zeit_abwesenheit_aendern').map(x => x.args)")
    pruefe(len(r) == 1 and r[0]["p_id"] == "k1" and r[0]["p_art"] == "unfall" and r[0]["p_tage"] == 2, "Ändern ruft zeit_abwesenheit_aendern: %s" % r)
    if not pg.locator("[data-ze-abwesenheit='k1']").count(): zl.locator(".ze-zeile").click()
    pg.wait_for_selector("[data-ze-abwesenheit='k1']")
    pg.click("[data-ze-abwesenheit='k1'] [data-ze-abw-loeschen]"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(600)
    r = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'zeit_abwesenheit_loeschen').map(x => x.args)")
    pruefe(len(r) == 1 and r[0]["p_id"] == "k1", "Löschen ruft zeit_abwesenheit_loeschen: %s" % r)
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Stundenlohn: aufgelaufene Stunden im Monat (seit 1.635.0)
    sl = [{"id": "h1", "person_id": "u1", "art": "kommen", "zeit": iso(tag_fehlt, "07:00:00"), "quelle": "pc"},
          {"id": "h2", "person_id": "u1", "art": "gehen", "zeit": iso(tag_fehlt, "11:00:00"), "quelle": "pc"},
          {"id": "h3", "person_id": "u1", "art": "kommen", "zeit": iso(heute.replace(day=1).isoformat(), "08:00:00"), "quelle": "pc"},
          {"id": "h4", "person_id": "u1", "art": "gehen", "zeit": iso(heute.replace(day=1).isoformat(), "10:00:00"), "quelle": "pc"}]
    br, pg, pf = start(p, "admin", extra="TEST.daten.zeit_stempel = %s; TEST.daten.zeit_personen[0].lohnart = 'stunde';" % json.dumps(sl))
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.click("#ze-monat"); pg.wait_for_timeout(600)
    pruefe(pg.locator("section#ze-verlauf").count() == 1 and "Aufgelaufene Stunden" in pg.inner_text("section#ze-verlauf"), "Stundenlohn: Grafik aufgelaufene Stunden")
    z = pg.locator("[data-ze-saldotag='%s']" % heute.isoformat())
    erwartet = "6:00 h" if tag_fehlt >= heute.replace(day=1).isoformat() and tag_fehlt != heute.replace(day=1).isoformat() else ("4:00 h" if tag_fehlt >= heute.replace(day=1).isoformat() else "2:00 h")
    pruefe(z.count() == 1 and z.inner_text().strip() == erwartet, "Stundenlohn: Im Monat heute %s (erwartet %s)" % (z.inner_text().strip() if z.count() else "-", erwartet))
    pg.screenshot(path=BILD + "/zeit-stundenlohn.png", full_page=True)
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()
    br, pg, pf = start(p, "admin", extra="TEST.daten.zeit_stempel = %s;" % json.dumps(sp))
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.click("#ze-monat"); pg.wait_for_timeout(600)
    pruefe("Spätschicht" not in pg.inner_text("[data-ze-tag='%s']" % tag_fehlt), "ohne Häkchen keine Gutschrift")
    br.close()

    # Eigene Adresse ohne Kopf und Menü, Terminal bestätigt und meldet ab
    br, pg, pf = start(p, "mitarbeiter", "hofertime/", "localStorage.setItem('hofer.hofertime.terminal','1');", 1180, 820)
    pg.wait_for_selector("#ze-knopf")
    pruefe(pg.evaluate("document.querySelector('link[rel=manifest]').href").endswith("/hofertime/app.webmanifest"), "eigenes Manifest unter hofertime/")
    pruefe(pg.evaluate("document.title") == "HOFERTIME", "Titel HOFERTIME")
    pruefe(pg.evaluate("document.body.classList.contains('ze-app')"), "App-Modus aktiv")
    pruefe(pg.locator(".ze-appkopf").count() == 1 and not pg.locator(".nav").first.is_visible(), "eigener Kopf, kein Menü")
    pg.evaluate("location.hash='#/planwand'"); pg.wait_for_timeout(600)
    pruefe("#/zeit" in pg.evaluate("location.hash"), "andere Seite führt zurück zu HOFERTIME")
    pg.wait_for_selector("#ze-knopf"); pg.screenshot(path=BILD + "/zeit-app.png")
    pg.click("#ze-knopf"); pg.wait_for_selector("#ze-bestaetigt")
    pg.screenshot(path=BILD + "/zeit-terminal.png")
    pruefe("Eingestempelt" in pg.inner_text("#ze-bestaetigt"), "Terminal: grosse Bestätigung")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Konto nur für HOFERTIME: sieht nur die Zeiterfassung
    br, pg, pf = start(p, "mitarbeiter", "index.html", "(TEST.daten.profiles.find(x => x.id === 'u1') || {}).nur_zeit = true; TEST.daten.zeit_buchungen = [{id: 'k1', person_id: 'u1', datum: new Date().toISOString().slice(0, 10), art: 'korrektur_ferien', tage: 2, minuten: 0, notiz: 'geheim'}];", 390, 844)
    pg.wait_for_selector("#ze-knopf")
    pruefe(pg.evaluate("document.body.classList.contains('ze-app')"), "nur_zeit: App-Modus")
    pruefe(pg.locator("#ze-reiter-alle").count() == 0, "nur_zeit: keine Admin-Reiter")
    pg.screenshot(path=BILD + "/zeit-handy.png", full_page=True)
    # Selbst abwesend eintragen (1.629.0): über die Funktion in der Datenbank
    pg.evaluate("TEST.rpc.zeit_abwesend_neu = () => 'neu1'")
    pg.locator("[data-ze-tag] button.ze-zeile").first.click(); pg.wait_for_selector("[data-ze-abwesend]", timeout=8000)
    pg.click("[data-ze-abwesend]"); pg.wait_for_selector(".dialog-huelle select")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    r = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'zeit_abwesend_neu').map(x => x.args)")
    pruefe(len(r) == 1 and r[0]["p_art"] == "krankheit" and r[0]["p_tage"] == 1 and r[0]["p_geplant"] is False,
           "nur_zeit: selbst abwesend eingetragen, ungeplant (1.641.0): %s" % r)
    # Selbst umbuchen am Handy (1.650.0)
    pruefe(pg.locator("#ze-umbuchen").count() == 1, "nur_zeit: Knopf Umbuchen da")
    if pg.locator("#ze-umbuchen").count():
        pg.click("#ze-umbuchen"); pg.wait_for_selector(".dialog-huelle select")
        pg.select_option(".dialog-huelle select", "zuGleitzeit")
        pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
        r = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'zeit_umbuchen').map(x => x.args)")
        pruefe(len(r) == 1 and r[0]["p_tage"] == -1 and r[0]["p_person"] == "u1", "nur_zeit: selbst umgebucht über zeit_umbuchen: %s" % r)
        pruefe(pg.locator("[data-ze-umbuchung-weg]").count() == 1, "nur_zeit: eigene Umbuchung mit ✕")
        pg.click("[data-ze-umbuchung-weg]"); pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
        pruefe(pg.evaluate("() => (TEST.daten.zeit_buchungen || []).length") == 1, "nur_zeit: eigene Umbuchung gelöscht, Korrektur bleibt")
    # Korrekturen und Auszahlungen sieht die Person nicht (1.651.0)
    pruefe("geheim" not in pg.inner_text("body") and pg.locator("[data-ze-buchung-art='korrektur_ferien']").count() == 0, "nur_zeit: Korrektur Ferien nicht sichtbar")
    pruefe(pg.locator("#ze-buchung").count() == 0, "nur_zeit: kein Knopf Buchung")
    pruefe(pg.locator("[data-ze-buchung-tag]").count() == 0, "nur_zeit: Korrektur nicht im Tagesverlauf")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Bezahlter Feiertag ohne Stempelung, Profil mit Tagen, Umbuchen
    d2 = heute - timedelta(days=2)
    while d2.weekday() >= 5 or d2.isoformat() == tag_fehlt: d2 -= timedelta(days=1)
    br, pg, pf = start(p, "admin", extra="TEST.daten.zeit_feiertage = [{datum: '%s', name: 'Testfeiertag'}]; TEST.daten.zeit_buchungen = []; TEST.daten.zeit_ferienstufen = [{ab_alter: 0, tage: 25}, {ab_alter: 50, tage: 30}];" % d2.isoformat())
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.wait_for_timeout(500)
    pruefe("Feiertag (bezahlt)" in pg.inner_text("[data-ze-tag='%s']" % d2.isoformat()) if pg.locator("[data-ze-tag='%s']" % d2.isoformat()).count() else True, "Feiertag ohne Stempelung als bezahlt")
    pruefe(pg.locator("[data-ze-fehler='%s']" % d2.isoformat()).count() == 0, "Feiertag gibt keine Fehlermeldung")
    pg.click("#ze-monat"); pg.wait_for_timeout(600)
    with pg.expect_download(timeout=60000) as dl: pg.click("#ze-pdf")
    pd = open(dl.value.path(), "rb").read()
    pruefe(pd[:4] == b"%PDF" and "Tagessummen" in dl.value.suggested_filename, "PDF Tagessummen der Person: " + dl.value.suggested_filename)
    import shutil; shutil.copy(dl.value.path(), "/tmp/tagessummen.pdf")
    vor = pg.inner_text("#ze-gleitzeit")
    pg.click("#ze-umbuchen"); pg.wait_for_selector(".dialog-huelle select")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    b = pg.evaluate("() => TEST.daten.zeit_buchungen")
    pruefe(len(b) == 1 and b[0]["tage"] == 1 and b[0]["minuten"] == -510, "Umbuchen Gleitzeit → 1 Ferientag (-8:30): %s" % b)
    pruefe("26 Tage" in pg.inner_text("#ze-ferien") or "21 Tage" in pg.inner_text("#ze-ferien"), "Ferien mit Umbuchung: " + pg.inner_text("#ze-ferien").replace("\n", " "))
    pruefe(pg.inner_text("#ze-gleitzeit") != vor, "Gleitzeit nach Umbuchung: %s → %s" % (vor, pg.inner_text("#ze-gleitzeit")))
    # Auszahlung Überstunden (1.651.0): nur der Admin, Gleitzeit weg
    vor = pg.inner_text("#ze-gleitzeit")
    pg.click("#ze-buchung"); pg.wait_for_selector(".dialog-huelle select")
    pg.fill(".dialog-huelle [id$=wert]", "2:00")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    b = pg.evaluate("() => TEST.daten.zeit_buchungen.filter(x => x.art)")
    pruefe(len(b) == 1 and b[0]["art"] == "auszahlung_ueberstunden" and b[0]["minuten"] == -120, "Auszahlung Überstunden −2:00: %s" % b)
    pruefe(pg.inner_text("#ze-gleitzeit") != vor and pg.locator("[data-ze-buchung-art='auszahlung_ueberstunden']").count() == 1, "Admin sieht Auszahlung, Gleitzeit %s → %s" % (vor, pg.inner_text("#ze-gleitzeit")))
    pg.click("#ze-buchung"); pg.wait_for_selector(".dialog-huelle select")
    pg.select_option(".dialog-huelle select", "korrektur_ferien"); pg.fill(".dialog-huelle [id$=wert]", "-1.5")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    b = pg.evaluate("() => TEST.daten.zeit_buchungen.filter(x => x.art === 'korrektur_ferien')")
    pruefe(len(b) == 1 and b[0]["tage"] == -1.5, "Korrektur Ferien −1.5: %s" % b)
    pruefe(pg.locator("[data-ze-buchung-tag]").count() >= 2 and "Korrektur Ferien" in pg.inner_text(".ze-tage"), "Admin sieht Buchungen im Tagesverlauf: %d" % pg.locator("[data-ze-buchung-tag]").count())
    pg.click("#ze-einst"); pg.wait_for_selector("#ze-profil")
    pg.fill("#ze-p-geburtstag", "1970-03-01"); pg.fill("#ze-p-pensum", "80")
    for n, h in [("1", "8"), ("2", "8"), ("3", "0"), ("4", "8"), ("5", "4")]: pg.fill("[data-ze-p-tag='%s']" % n, h)
    pg.wait_for_timeout(200)
    pruefe("24 Tage" in pg.inner_text("#ze-p-auto-text"), "Ferien nach Alter 56 × 80 %%: " + pg.inner_text("#ze-p-auto-text"))
    pruefe("28:00" in pg.inner_text("#ze-p-summe") or "28" in pg.inner_text("#ze-p-summe"), "Woche aus Tagen: " + pg.inner_text("#ze-p-summe"))
    pg.screenshot(path=BILD + "/zeit-profil.png")
    pg.click("#ze-p-speichern"); pg.wait_for_timeout(900)
    e = pg.evaluate("() => TEST.daten.zeit_personen.find(x => x.person_id === 'u1')")
    pruefe(e.get("soll_tage", {}).get("3") == 0 and e.get("soll_tage", {}).get("5") == 4 and e.get("geburtstag") == "1970-03-01", "Profil gespeichert: %s" % e.get("soll_tage"))
    pg.click("#ze-reiter-alle"); pg.wait_for_selector("#ze-feiertage-knopf")
    pg.click("#ze-feiertage-knopf"); pg.wait_for_selector("#ze-feiertage [data-ze-feiertag]")
    pg.click("#ze-feiertage-vorschlag"); pg.wait_for_timeout(800)
    n = pg.evaluate("() => TEST.daten.zeit_feiertage.length")
    pruefe(n > 5, "Feiertage vorgeschlagen: %d" % n)
    pg.screenshot(path=BILD + "/zeit-feiertage.png")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Auswertung mit Abteilung, Grafiken und Excel
    br, pg, pf = start(p, "admin", extra="TEST.daten.zeit_feiertage = []; TEST.daten.zeit_buchungen = []; TEST.daten.zeit_ferienstufen = [];" +
        "TEST.daten.zeit_personen[0].abteilung = 'Langdreher';" +
        # Mehr als 1'000 Stempel: die Auswertung muss seitenweise holen (1.655.0)
        "for (let i = 0; i < 2400; i++) TEST.daten.zeit_stempel.unshift({id: 'alt' + i, person_id: 'u2', art: i % 2 ? 'gehen' : 'kommen', zeit: new Date(Date.now() - 86400000 * 40 + i * 1000).toISOString()});" +
        "TEST.rpc.zeit_abwesenheiten = () => [{person: 'x', von: '%s', tage: 1, abwesenheit: 'krankheit'}];" % tag_fehlt)
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.click("#ze-einst"); pg.wait_for_selector("#ze-p-abteilung")
    pruefe(pg.input_value("#ze-p-abteilung") == "Langdreher", "Profil zeigt Abteilung")
    pg.fill("#ze-p-abteilung", "Kurzdreher"); pg.click("#ze-p-speichern"); pg.wait_for_timeout(800)
    e = pg.evaluate("() => TEST.daten.zeit_personen.find(x => x.person_id === 'u1')")
    pruefe(e.get("abteilung") == "Kurzdreher", "Abteilung gespeichert: %s" % e.get("abteilung"))
    pg.click("#ze-reiter-auswertung"); pg.wait_for_selector("#ze-aus-tabelle", timeout=15000)
    pg.wait_for_timeout(500)
    t = pg.inner_text("#ze-aus-tabelle")
    pruefe("Kurzdreher" in t, "Auswertung mit Abteilung: " + t[:200].replace("\n", " "))
    n = pg.evaluate("() => TEST.protokoll.filter(x => x.tabelle === 'zeit_stempel' && x.art === 'select').length")
    pruefe(n >= 3, "Auswertung holt Stempel seitenweise (%d Abfragen)" % n)
    pruefe(pg.locator("#ze-aus-g-ist .dg-zeile").count() >= 1, "Grafik Ist je Person")
    pruefe("Krankheit" in pg.inner_text("#ze-aus-g-abw").replace("\n", " ") or "Krankheit" in pg.inner_text(".ze-aus-legende"), "Grafik Abwesenheiten mit Krankheit")
    pg.click("#ze-aus-jahr"); pg.wait_for_selector("#ze-aus-g-monate", timeout=15000)
    pruefe(pg.locator("#ze-aus-g-monate .dg-spalte").count() >= 1, "Jahr mit Verlauf je Monat")
    pg.screenshot(path=BILD + "/zeit-auswertung.png", full_page=True)
    with pg.expect_download() as dl: pg.click("#ze-aus-excel")
    pfad = dl.value.path()
    import zipfile
    z = zipfile.ZipFile(pfad); namen = z.namelist()
    blaetter = z.read("xl/workbook.xml").decode()
    pruefe("Übersicht" in blaetter and "Tage" in blaetter and "Abteilungen" in blaetter, "Excel mit Blättern: " + blaetter[-300:])
    with pg.expect_download(timeout=60000) as dl: pg.click("#ze-aus-pdf")
    pd = open(dl.value.path(), "rb").read()
    pruefe(pd[:4] == b"%PDF" and len(pd) > 5000, "PDF Tagessummen aus der Auswertung (%d Bytes)" % len(pd))
    import shutil; shutil.copy(dl.value.path(), "/tmp/tagessummen-alle.pdf")
    pruefe(pg.locator("#ze-export").count() == 1, "Karte täglicher Export")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Stempel-Panel: Person antippen, Kommen, Saldo ansehen
    leute = [{"id": "u1", "full_name": "Patrick Ruch", "bild_url": None, "da": False, "seit": None},
             {"id": "u2", "full_name": "Anna Beispiel", "bild_url": None, "da": True, "seit": iso(heute.isoformat(), "07:10:00")}]
    saldo = {"einst": EINST[0], "stempel": STEMPEL, "ferien": FERIEN, "buchungen": [], "stufen": []}
    br, pg, pf = start(p, "mitarbeiter", "index.html?app=hofertime",
        "Object.assign(TEST.daten.profiles.find(x => x.id === 'u1'), {nur_zeit: true, zeit_terminal: true, andere_nutzer: true});"
        "TEST.rpc.zeit_panel_personen = () => %s; TEST.rpc.zeit_panel_saldo = () => (%s);"
        "TEST.rpc.zeit_panel_stempeln = (a) => ({ id: 'p1', person_id: a.p_person, art: a.p_art, zeit: new Date().toISOString() });"
        "TEST.rpc.zeit_panel_zurueck = () => true;" % (json.dumps(leute), json.dumps(saldo)), 1180, 820)
    pg.wait_for_selector("[data-ze-panel]")
    pruefe(pg.locator("[data-ze-panel]").count() == 2 and pg.locator(".ze-panel__kachel--da").count() == 1, "Panel: zwei Personen, eine da")
    pg.screenshot(path=BILD + "/zeit-panel.png")
    pg.click("[data-ze-panel='u2']"); pg.wait_for_selector("#ze-panel-knopf")
    pruefe(pg.inner_text("#ze-panel-knopf") == "Gehen", "Anna ist da → Knopf Gehen")
    pg.click("#ze-panel-weg"); pg.click("[data-ze-panel='u1']"); pg.wait_for_selector("#ze-panel-knopf")
    pg.screenshot(path=BILD + "/zeit-panel-wahl.png")
    pg.click("#ze-panel-saldo-knopf"); pg.wait_for_selector("#ze-panel-saldo")
    pruefe(pg.locator("#ze-panel-gleitzeit").count() == 1 and pg.locator("#ze-panel-ferien").count() == 1, "Saldo am Panel: " + pg.inner_text("#ze-panel-saldo").replace("\n", " "))
    st = [x for x in pg.evaluate("() => TEST.protokoll") if x.get("art") == "rpc" and x.get("name") == "zeit_panel_stempeln"]
    pruefe(not st, "Saldo ansehen stempelt nicht")
    pg.screenshot(path=BILD + "/zeit-panel-saldo.png")
    pg.click("#ze-panel-saldo-zu"); pg.click("[data-ze-panel='u1']"); pg.click("#ze-panel-knopf"); pg.wait_for_selector("#ze-bestaetigt")
    st = [x for x in pg.evaluate("() => TEST.protokoll") if x.get("art") == "rpc" and x.get("name") == "zeit_panel_stempeln"]
    pruefe(len(st) == 1 and st[0]["args"] == {"p_person": "u1", "p_art": "kommen"}, "Panel stempelt Kommen")
    pg.click("#ze-panel-zurueck"); pg.wait_for_timeout(500)
    pruefe(pg.locator("#ze-bestaetigt").count() == 0, "Rückgängig schliesst die Bestätigung")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Anwesend von – bis mit Stempelart und Rest vom Tag (1.640.0)
    t2 = date.fromisoformat(tag_fehlt) - timedelta(days=1)
    while t2.weekday() >= 5: t2 -= timedelta(days=1)
    t2 = t2.isoformat()
    br, pg, pf = start(p, "admin", extra="TEST.daten.zeit_stempel = []; TEST.daten.vacations = [];")
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-knopf")
    pg.click("#ze-monat"); pg.wait_for_timeout(500)
    pg.click("[data-ze-tag='%s'] .ze-zeile" % t2); pg.wait_for_selector(".ze-offen [data-ze-anwesend]")
    pg.click(".ze-offen [data-ze-anwesend]"); pg.wait_for_selector(".dialog-huelle")
    zeiten = pg.locator(".dialog-huelle input[type=time]")
    zeiten.nth(0).fill("07:00"); zeiten.nth(1).fill("10:00")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    st = pg.evaluate("() => TEST.daten.zeit_stempel")
    pruefe(len(st) == 2 and [x["art"] for x in st] == ["kommen", "gehen"] and not st[0].get("stempelart"), "Anwesend 07:00–10:00 als Kommen und Gehen")
    pg.click("[data-ze-tag='%s'] .ze-zeile" % t2) if pg.locator(".ze-offen").count() == 0 else None
    pg.wait_for_selector(".ze-offen [data-ze-rest]")
    pruefe("5:30 h" in pg.inner_text("[data-ze-rest]"), "Rest vom Tag zeigt 5:30 h: " + pg.inner_text("[data-ze-rest]"))
    pg.click("[data-ze-rest]"); pg.wait_for_selector(".dialog-huelle")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    st = pg.evaluate("() => TEST.daten.zeit_stempel")
    kr = [x for x in st if x.get("stempelart") == "krankheit"]
    pruefe(len(st) == 4 and len(kr) == 2, "Rest vom Tag: Paar mit Krankheit angelegt")
    zeile = pg.inner_text("[data-ze-tag='%s']" % t2)
    pruefe("10:00–15:30 Krankheit" in zeile and "8:30 h" in zeile, "Tag zeigt Krankheit und 8:30 h Ist: " + zeile.replace("\n", " ")[:140])
    pg.screenshot(path=BILD + "/zeit-rest.png")
    # Kompensieren zählt nicht als Zeit
    pg.evaluate("() => TEST.daten.zeit_stempel.forEach(x => { if (x.stempelart) x.stempelart = 'kompensieren'; })")
    pg.click("#ze-woche"); pg.click("#ze-monat"); pg.wait_for_timeout(600)
    pruefe("3:00 h" in pg.inner_text("[data-ze-tag='%s']" % t2), "Kompensieren zählt nicht als Ist")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

    # Panel mit Gesichtserkennung: zuerst die Kamera, Namen erst auf Knopf
    br, pg, pf = start(p, "mitarbeiter", "index.html?app=hofertime",
        "Object.assign(TEST.daten.profiles.find(x => x.id === 'u1'), {nur_zeit: true, zeit_terminal: true, andere_nutzer: true});"
        "TEST.rpc.zeit_panel_personen = () => %s; TEST.rpc.zeit_panel_gesichter = () => [{person_id: 'u1', muster: [Array(128).fill(0.1)]}];" % json.dumps(leute), 1180, 820)
    pg.wait_for_selector("#ze-panel-ohne", timeout=20000)
    pruefe(pg.locator("[data-ze-panel]").count() == 0 and pg.locator("#ze-panel-pablo").count() == 1, "Panel startet mit Pablo, ohne Namen")
    pruefe("SCHAU MIR IN DIE AUGEN" in pg.inner_text("#ze-panel-pablo"), "Text SCHAU MIR IN DIE AUGEN")
    pruefe(pg.evaluate("getComputedStyle(document.querySelector('#ze-panel-video')).opacity") == "0", "eigenes Kamerabild unsichtbar")
    pg.wait_for_timeout(4000)
    pg.screenshot(path=BILD + "/zeit-panel-kamera.png")
    pg.click("#ze-panel-ohne"); pg.wait_for_selector("[data-ze-panel]")
    pruefe(pg.locator("[data-ze-panel]").count() == 2, "„Nicht mit Gesichtserkennung“ zeigt die Namen")
    pg.click("#ze-panel-zur-kamera"); pg.wait_for_selector("#ze-panel-ohne")
    pruefe(pg.locator("[data-ze-panel]").count() == 0, "Zurück zur Kamera")
    pruefe(pg.locator("#ze-panel-kamera-stand").count() == 0, "Kamera ohne Fehler")
    pruefe(not pf, "keine Fehler im Browser: %s" % pf)
    br.close()

print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
