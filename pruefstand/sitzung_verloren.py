# Sitzung auf dem Server beendet (3. November 2026): Entfernt Supabase
# die Sitzung selbst, weil der Schlüssel abgelehnt wurde, lädt die App
# neu und zeigt die Anmeldung, statt still weiterzulaufen und nichts zu
# speichern. Eigenes Abmelden löst das nicht aus.
from playwright.sync_api import sync_playwright
from pruefstand import server_starten, FAKE, CH, PORT

fehler = []
def pruefe(text, ok):
    print(("ok   " if ok else "FALSCH ") + text)
    if not ok: fehler.append(text)

srv = server_starten()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt", timeout=20000)
    pg.wait_for_timeout(6000)  # eigenes Abmelden beim Start liegt mehr als 5 s zurück
    pruefe("App hört auf Ereignisse der Anmeldung", pg.evaluate("() => (TEST.authHoerer || []).length > 0"))
    pg.evaluate("() => { window.__marke = 1; TEST.authHoerer.forEach((f) => f('SIGNED_OUT', null)); }")
    pg.wait_for_timeout(2500)
    pruefe("nach SIGNED_OUT neu geladen", pg.evaluate("() => window.__marke === undefined"))
    br.close()
srv.shutdown()
print("Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
