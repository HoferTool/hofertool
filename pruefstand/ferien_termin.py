# Ferien als Outlook-Termin (1.235.0): Empfänger in den Einstellungen,
# Häkchen im Ferienfenster, .eml mit .ics im Anhang zum Herunterladen
import time, base64, re
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)

    # Ohne Empfänger kein Häkchen
    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_timeout(600)
    pruefe("ohne Verteiler kein Häkchen", pg.locator("#fd-termin").count() == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Empfänger in den Einstellungen
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(700)
    pg.fill("#ferien-verteiler", "anna@hoferco.ch, ben@hoferco.ch\nkeine-adresse")
    pg.locator("#ferien-verteiler-speichern").click(); pg.wait_for_timeout(600)
    wert = pg.evaluate("(TEST.daten.app_config.find(c => c.schluessel === 'ferien_verteiler') || {}).wert")
    pruefe("gespeichert: " + str(wert), wert == "anna@hoferco.ch; ben@hoferco.ch")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_timeout(700)
    pruefe("Häkchen da und an", pg.locator("#fd-termin").is_checked())
    pruefe("Text nennt 2 Empfänger", "2 Empfänger" in pg.inner_text(".fd-termin"))
    pg.fill("#fd-person", "Testperson Ölz")
    pg.fill("#fd-notiz", "Wanderwoche, Wallis")
    with pg.expect_download() as dl:
        pg.locator("#fd-ja").click()
    d = dl.value
    pruefe("Datei " + d.suggested_filename, d.suggested_filename == "Ferien Testperson Ölz.eml")
    eml = open(d.path(), encoding="utf-8").read()
    pruefe("An", "To: anna@hoferco.ch, ben@hoferco.ch" in eml)
    pruefe("Entwurf", "X-Unsent: 1" in eml)
    import email
    m = email.message_from_string(eml)
    texte = [t.get_payload(decode=True).decode("utf-8") for t in m.walk() if not t.is_multipart()]
    pruefe("Anhang .ics", any((t.get_filename() or "").endswith(".ics") for t in m.walk()))
    ics = next((t for t in texte if "BEGIN:VCALENDAR" in t), "")
    mail = next((t for t in texte if "Guten Tag" in t), "")
    print(ics)
    pruefe("ics ganztägig", "DTSTART;VALUE=DATE:" in ics and "DTEND;VALUE=DATE:" in ics)
    pruefe("ics frei", "BUSYSTATUS:FREE" in ics)
    pruefe("ics Titel", "SUMMARY:Ferien Testperson Ölz" in ics)
    pruefe("ics Notiz maskiert", "Wanderwoche\\, Wallis" in ics)
    neu = pg.evaluate("TEST.daten.vacations.find(v => v.person === 'Testperson Ölz') || null")
    pruefe("UID am Eintrag", bool(neu) and ("UID:ferien-" + str(neu["id"])) in ics)
    pruefe("Mailtext", "Testperson Ölz ist vom" in mail)

    # Ändern: Häkchen aus, keine Datei
    pg.locator("[data-ferien='f2']").click(); pg.wait_for_timeout(600)
    pruefe("beim Ändern aus", not pg.locator("#fd-termin").is_checked())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
