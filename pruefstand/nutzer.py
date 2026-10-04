# Einstellungen → Nutzer: Name, Rolle (mit Rückfrage), Bearbeiten, Plant
# mit vorgeschlagenem Kürzel, Kürzel, Geburtstag, Deaktivieren, Parks,
# Personen ohne Login anlegen, ändern, löschen
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def ja(pg):
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(600)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_selector("[data-rolle]")
    prof = lambda id, feld: pg.evaluate(f"TEST.daten.profiles.find(u => u.id === '{id}')['{feld}']")

    pruefe("Eigene Zeile ohne Rollenwahl", pg.locator("[data-rolle='u1']").count() == 0 and pg.locator("[data-rolle='u2']").count() == 1)
    # Name
    pg.fill("[data-name='u2']", "Ramona Jordi"); pg.press("[data-name='u2']", "Enter"); pg.wait_for_timeout(500)
    pruefe("Name gespeichert", prof("u2", "full_name") == "Ramona Jordi")
    # Rolle: abbrechen lässt alles, bestätigen ändert
    pg.select_option("[data-rolle='u2']", "mitarbeiter"); pg.wait_for_selector(".dialog-huelle [data-nein]")
    pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(400)
    pruefe("Abbrechen lässt die Rolle", prof("u2", "role") == "langdreher" and pg.input_value("[data-rolle='u2']") == "langdreher")
    pg.select_option("[data-rolle='u2']", "kurzdreher"); ja(pg); pg.wait_for_timeout(600)
    pruefe("Rolle geändert", prof("u2", "role") == "kurzdreher" and pg.input_value("[data-rolle='u2']") == "kurzdreher")
    # Bearbeiten
    pg.check("[data-bearb='u3']"); pg.wait_for_timeout(500)
    pruefe("Bearbeiten erlaubt", prof("u3", "darf_bearbeiten") is True)
    # Plant: ohne Kürzel kommt der Vorschlag aus dem Namen
    pg.fill("[data-plan-kuerzel='u3']", ""); pg.locator("h1").first.click(); pg.wait_for_timeout(500)
    pruefe("Kürzel geleert", prof("u3", "initialen") is None)
    pg.fill("[data-name='u3']", "Tristan Ecker"); pg.press("[data-name='u3']", "Enter"); pg.wait_for_timeout(500)
    pg.check("[data-plan-ist='u3']"); pg.wait_for_timeout(600)
    pruefe("Plant mit Kürzel-Vorschlag", prof("u3", "ist_planer") is True and prof("u3", "initialen") == "TE"
           and pg.input_value("[data-plan-kuerzel='u3']") == "TE")
    pg.fill("[data-plan-kuerzel='u3']", "tx"); pg.press("[data-plan-kuerzel='u3']", "Enter"); pg.wait_for_timeout(500)
    pruefe("Kürzel gross gespeichert", prof("u3", "initialen") == "TX" and pg.input_value("[data-plan-kuerzel='u3']") == "TX")
    # Geburtstag
    pg.fill("[data-geb='u3']", "1990-05-17"); pg.wait_for_timeout(500)
    pruefe("Geburtstag gespeichert", prof("u3", "geburtstag") == "1990-05-17")
    # Deaktivieren
    pg.locator("[data-aktiv='u3']").click(); ja(pg); pg.wait_for_timeout(600)
    pruefe("Deaktiviert", prof("u3", "is_active") is False and pg.inner_text("[data-aktiv='u3']") == "Aktivieren")
    pruefe("Geburtstag nach Neuladen noch da", pg.input_value("[data-geb='u3']") == "1990-05-17")
    # Parks
    park = pg.evaluate("TEST.daten.machine_parks.find(p => p.is_active !== false).id")
    pg.check(f"[data-pu='u2'][data-pp='{park}']"); pg.wait_for_timeout(500)
    pruefe("Park freigegeben", park in prof("u2", "parks"))
    pg.uncheck(f"[data-pu='u2'][data-pp='{park}']"); pg.wait_for_timeout(500)
    pruefe("Park wieder entzogen", park not in prof("u2", "parks"))
    # Bild vom Admin: Klick aufs Bild wählt eine Datei, Zuschnitt, dann gespeichert; × nimmt es weg
    pruefe("Bildwahl bei jeder Person", pg.locator("[data-bild='u2']").count() == 1 and pg.locator("[data-bildweg='u2']").count() == 0)
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f00f0004010180b198ca180000000049454e44ae426082")
    pg.set_input_files("[data-bild='u2']", {"name": "foto.png", "mimeType": "image/png", "buffer": png})
    pg.wait_for_selector("#zs-ja"); pg.click("#zs-ja"); pg.wait_for_timeout(900)
    pruefe("Bild gespeichert", str(prof("u2", "bild_url") or "").startswith("data:image") and pg.locator("[data-bildweg='u2']").count() == 1)
    pg.locator("[data-bildweg='u2']").click(force=True); pg.wait_for_timeout(500)
    pruefe("Bild entfernt", prof("u2", "bild_url") is None and pg.locator("[data-bildweg='u2']").count() == 0)

    # Personen ohne Login
    pg.click("#pe-neu"); pg.wait_for_selector("#pd-name")
    pruefe("Name hat den Fokus", pg.evaluate("document.activeElement.id") == "pd-name")
    pg.fill("#pd-name", "Hans Muster"); pg.fill("#pd-geb", "1970-01-02"); pg.click("#pd-ja"); pg.wait_for_timeout(700)
    neu = pg.evaluate("(TEST.daten.people || []).find(x => x.name === 'Hans Muster')")
    pruefe("Person angelegt", bool(neu) and neu["geburtstag"] == "1970-01-02" and "Hans Muster" in pg.inner_text("#personenliste"))
    pg.locator(f"[data-pe='{neu['id']}']").click(); pg.wait_for_selector("#pd-name")
    pruefe("Bearbeiten zeigt Werte", pg.input_value("#pd-name") == "Hans Muster")
    pg.fill("#pd-name", "Hans Muster-Meier"); pg.click("#pd-ja"); pg.wait_for_timeout(700)
    pruefe("Person geändert", "Hans Muster-Meier" in pg.inner_text("#personenliste"))
    pg.locator(f"[data-pe='{neu['id']}']").click(); pg.wait_for_selector("#pd-name"); pg.click("#pd-nein"); pg.wait_for_timeout(300)
    pruefe("Abbrechen schliesst", pg.locator("#pd-name").count() == 0 and pg.locator(".dialog--einstellungen").count() == 1)
    pg.locator(f"[data-peweg='{neu['id']}']").click(); ja(pg)
    pruefe("Person gelöscht", "Hans Muster" not in pg.inner_text("#personenliste"))
    pruefe("Einstellungen noch offen", pg.locator(".dialog--einstellungen").count() == 1)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
