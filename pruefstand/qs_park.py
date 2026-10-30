# QS-Meldungen nur für den eigenen Park (1.85.0, Wunsch Patrick
# 16. Oktober 2026: „nur für seinen Park, ausser Admin“). Ein
# Kurzdreher sieht im Fenster „Offene Meldungen“ oben im Pad (seit
# 1.310.0, vorher Seite QS) nur Meldungen aus dem Park Kurzdreher, ein
# Admin alles. Die Datenbank prüft dasselbe
# (qs_darf_maschine), das bildet der Nachbau nicht nach.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []

VORHER = """
(() => {
  const lang = daten.machines.find(m => m.park_id === daten.machine_parks[0].id);
  const kurz = daten.machines.find(m => m.park_id === daten.machine_parks[1].id);
  daten.qs_meldungen = [
    { id: "q1", machine_id: lang.id, hoco_nr: "1-1", stueck: 11, notiz: "Lang-Meldung", erstellt_am: new Date().toISOString() },
    { id: "q2", machine_id: kurz.id, hoco_nr: "2-2", stueck: 22, notiz: "Kurz-Meldung", erstellt_am: new Date().toISOString() }];
})();
"""

def seite(br, rolle):
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        "daten.profiles[0].role = '" + rolle + "';" + VORHER + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg = br.new_context(viewport={"width": 1400, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append(rolle + " SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padmeldungen]")
    pg.wait_for_timeout(1200)
    return pg

def fenster(pg):
    pg.click("#pad [data-padmeldungen]"); pg.wait_for_selector("#qs-offen-fenster #qs-meldungen, #qs-offen-fenster #qs-keine")
    t = pg.inner_text("#qs-offen-fenster"); pg.click("#qs-offen-fenster [data-nein]"); pg.wait_for_timeout(300)
    return t

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br, "kurzdreher")
    if pg.inner_text("#pad [data-padmeldungenzahl]") != "1": fehler.append("Kurzdreher: Zahl am Knopf nicht 1")
    t = fenster(pg)
    if "Kurz-Meldung" not in t: fehler.append("Kurzdreher sieht eigene Meldung nicht")
    if "Lang-Meldung" in t: fehler.append("Kurzdreher sieht Meldung vom Langdreherpark")

    pg = seite(br, "admin")
    if pg.inner_text("#pad [data-padmeldungenzahl]") != "2": fehler.append("Admin: Zahl am Knopf nicht 2")
    t = fenster(pg)
    if "Kurz-Meldung" not in t or "Lang-Meldung" not in t: fehler.append("Admin sieht nicht alle Meldungen")
    br.close()
print("QS nach Park | Fehler:", "; ".join(fehler) if fehler else "keine")
