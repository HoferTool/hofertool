# Andere Nutzer nie abmelden (111.111.0, Wunsch Patrick 8. Oktober 2026):
# Planwand, Päckli Pad und Co. bleiben angemeldet, egal wie sie
# hereinkommen: keine Abmeldung nach fünf Minuten Ruhe, Schlüssel bleibt
# auf dem Gerät, in den Einstellungen sind die Schalter fest an.
# Personen bleiben wie bisher: nach fünf Minuten kommt die Abmeldung.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.login_kacheln = [
  { email: 'andrea@hoferco.ch', full_name: 'Andrea Meier', role: 'kurzdreher', andere_nutzer: false },
  { email: 'planwand@hoferco.ch', full_name: 'Planwand', role: 'planwand', andere_nutzer: true, ohne_passwort: true },
  { email: 'paeckli@hoferco.ch', full_name: 'Päckli Pad', role: 'mitarbeiter', andere_nutzer: true },
  { email: 'saheesan.hudson@hoferco.ch', full_name: 'Marco Steiner', role: 'langdreher', andere_nutzer: false }];
// Das angemeldete Profil u1 ist je nach Test ein anderer Nutzer oder eine Person
if (window.PROFIL_ANDERE) { daten.profiles[0].andere_nutzer = true; daten.profiles[0].email = window.SITZUNG_MAIL; }
if (window.PROFIL_OHNE_SPALTE) { daten.profiles[0].role = 'planwand'; daten.profiles[0].email = window.SITZUNG_MAIL; }
TEST.funktionen['pin-anmelden'] = (b) => b.offen
  ? (b.email === 'planwand@hoferco.ch' ? { status: 'ok', token_hash: 'offen' } : { status: 'passwort' })
  : { status: 'falsch', rest: 4 };
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

def seite(br, vorher="", uhr=False):
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    if uhr: pg.clock.install()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script(vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2300)
    return pg, f

def gemerkt(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('hofer.geraet.sitzungen') || '{}')")

def angemeldet(pg):
    return pg.evaluate("!document.getElementById('lg-auswahl') && !document.getElementById('lp')")

def andere_oeffnen(pg):
    pg.locator("#lg-andere").click(); pg.wait_for_timeout(600)

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FEHLT"), name)
    if not ok: fehler.append(name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Planwand, offenes Konto: ein Tipp, drin, und der Schlüssel bleibt auf dem Gerät
    pg, f = seite(br, "window.OHNE_SITZUNG = true; window.SITZUNG_MAIL = 'planwand@hoferco.ch'; window.PROFIL_ANDERE = true;", uhr=True)
    andere_oeffnen(pg)
    pg.locator(".login__kachel", has_text="Planwand").click(); pg.wait_for_timeout(2500)
    pruefe("Planwand: mit einem Tipp angemeldet", angemeldet(pg))
    pruefe("Planwand: Schlüssel auf dem Gerät aufgehoben", gemerkt(pg).get("planwand@hoferco.ch") == "r-1")

    # 2. Sechs Minuten ohne Bedienung: keine Warnung, keine Abmeldung
    pg.clock.fast_forward(6 * 60 * 1000); pg.wait_for_timeout(800)
    pruefe("Planwand: nach 6 Minuten noch angemeldet", angemeldet(pg))
    pruefe("Planwand: keine Abmeldewarnung", pg.locator(".leerlauf-hinweis").count() == 0)
    pruefe("Planwand: keine Meldung „Automatische Abmeldung“", "Automatische Abmeldung" not in pg.evaluate("document.body.textContent"))

    # 3. Einstellungen: beide Schalter fest an
    pg.evaluate("document.getElementById('kopf-einstellungen').click()"); pg.wait_for_timeout(1200)
    s = pg.evaluate("""(() => { const a = document.getElementById('e-angemeldet'), m = document.getElementById('mk-merken');
      return { a: a && a.checked && a.disabled, m: m && m.checked && m.disabled,
        t: document.body.textContent }; })()""")
    pruefe("Einstellungen: „Angemeldet bleiben“ fest an", bool(s["a"]))
    pruefe("Einstellungen: „Auf diesem Gerät merken“ fest an", bool(s["m"]))
    pruefe("Einstellungen: Hinweis „nie von selbst abgemeldet“", "nie von selbst abgemeldet" in s["t"])
    pg.screenshot(path="/tmp/andere_einstellungen.png")
    fehler += f; pg.close()

    # 4. Päckli Pad mit Passwort: kein Häkchen, nur der Hinweis, und trotzdem gemerkt
    pg, f = seite(br, "window.OHNE_SITZUNG = true; window.SITZUNG_MAIL = 'paeckli@hoferco.ch'; window.PROFIL_ANDERE = true;")
    andere_oeffnen(pg)
    pg.locator(".login__kachel", has_text="Päckli").click(); pg.wait_for_timeout(900)
    pruefe("Päckli: kein Häkchen, dafür Hinweis", pg.locator("#lmerk").count() == 0 and pg.locator("#lmerk-immer").count() == 1)
    pg.screenshot(path="/tmp/andere_paeckli_feld.png")
    pg.evaluate("window.OHNE_SITZUNG = false")
    pg.fill("#lp", "geheim"); pg.locator("#lk").click(); pg.wait_for_timeout(1800)
    pruefe("Päckli: angemeldet", angemeldet(pg))
    pruefe("Päckli: Schlüssel aufgehoben", gemerkt(pg).get("paeckli@hoferco.ch") == "r-1")
    fehler += f; pg.close()

    # 5. Schon angemeldet vor diesem Stand (Sitzung da, nichts gemerkt): beim Start wird der Schlüssel aufgehoben
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'planwand@hoferco.ch'; window.PROFIL_ANDERE = true;")
    pruefe("Alte Sitzung: Schlüssel beim Start aufgehoben", gemerkt(pg).get("planwand@hoferco.ch") == "r-1")
    fehler += f; pg.close()

    # 6. Ohne sql/andere-nutzer.sql (Profil kennt das Häkchen nicht): Rolle Planwand zählt
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'planwand@hoferco.ch'; window.PROFIL_OHNE_SPALTE = true;", uhr=True)
    pruefe("Ohne Spalte: Rolle Planwand gemerkt", gemerkt(pg).get("planwand@hoferco.ch") == "r-1")
    pg.clock.fast_forward(6 * 60 * 1000); pg.wait_for_timeout(800)
    pruefe("Ohne Spalte: nach 6 Minuten noch angemeldet", angemeldet(pg))
    fehler += f; pg.close()

    # 7. Eine Person bleibt wie bisher: nach fünf Minuten abgemeldet, Häkchen im Formular da
    pg, f = seite(br, "window.OHNE_SITZUNG = false; window.SITZUNG_MAIL = 'saheesan.hudson@hoferco.ch';", uhr=True)
    pruefe("Person: angemeldet", angemeldet(pg))
    pg.clock.fast_forward(6 * 60 * 1000); pg.wait_for_timeout(1500)
    pruefe("Person: nach 6 Minuten abgemeldet", not angemeldet(pg))
    pruefe("Person: nichts gemerkt", not gemerkt(pg))
    pg.locator(".login__kachel", has_text="Marco").click(); pg.wait_for_timeout(900)
    pruefe("Person: Häkchen „Auf diesem Gerät merken“ da", pg.locator("#lmerk").count() == 1)
    fehler += f; pg.close()
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
