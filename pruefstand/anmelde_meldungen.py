# Wunsch Patrick 13. Oktober 2026: Meldung, die jeder nach dem Anmelden
# zuerst quittieren muss (neue Funktionen erklären); verwalten unter
# Einstellungen → Allgemein. Gerätekonten bekommen keine.
import time, sys
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)
BILD = sys.argv[1] if len(sys.argv) > 1 else None

VORAB = """(() => { let t; Object.defineProperty(window, 'TEST', { configurable: true,
  get() { return t; }, set(v) { t = v;
    v.daten.anmelde_meldungen = [
      { id: 'm1', titel: 'Neu: Letzten Eintrag löschen', text: 'Unter <b>Produktion → Erfassen</b> steht jetzt\\n„Letzten Eintrag löschen“.', aktiv: true, erstellt: '2026-10-13T08:00:00Z' },
      { id: 'm2', titel: 'Schon gelesen', text: 'x', aktiv: true, erstellt: '2026-10-10T08:00:00Z' },
      { id: 'm3', titel: 'Ausgeschaltet', text: 'y', aktiv: false, erstellt: '2026-10-11T08:00:00Z' },
      { id: 'm4', titel: 'Zweite neue', text: 'Noch etwas.', aktiv: true, erstellt: '2026-10-13T09:00:00Z' }];
    v.daten.anmelde_quittungen = [{ meldung_id: 'm2', user_id: 'u1', am: '2026-10-10T09:00:00Z' },
                                  { meldung_id: 'm1', user_id: 'u2', am: '2026-10-13T09:30:00Z' }];
    if (window.GERAET) v.daten.profiles[0].andere_nutzer = true;
  } }); })();"""

def seite(br, geraet=False):
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    if geraet: ctx.add_init_script("window.GERAET = true;")
    ctx.add_init_script(VORAB)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2000)
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br)
    sperre = lambda: pg.locator(".anmeldemeldung-huelle").count()
    titel = lambda: pg.evaluate("() => (document.querySelector('.anmeldemeldung-huelle h2') || {}).textContent || ''")
    pruefe("Meldung liegt nach dem Anmelden über allem", sperre() == 1)
    pruefe(f"Älteste ungelesene zuerst ({titel()!r})", titel() == "Neu: Letzten Eintrag löschen")
    pruefe("Fett aus dem Text", pg.locator(".anmeldemeldung__text b, .anmeldemeldung__text strong").count() == 1)
    pruefe("Zähler 1 von 2", "1 von 2" in pg.locator(".anmeldemeldung__datum").inner_text())
    if BILD: pg.screenshot(path=BILD + "/meldung-anmelden.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe("Escape tut nichts, keine Abmelde-Frage", sperre() == 1 and pg.locator(".dialog-huelle").count() == 0)
    pg.mouse.click(10, 10); pg.wait_for_timeout(300)
    pruefe("Klick daneben tut nichts", sperre() == 1)
    pg.locator("#am-gelesen").click(); pg.wait_for_timeout(600)
    pruefe(f"Danach die zweite ({titel()!r})", titel() == "Zweite neue")
    pg.locator("#am-gelesen").click(); pg.wait_for_timeout(600)
    pruefe("Nach dem letzten Gelesen ist sie weg", sperre() == 0)
    q = pg.evaluate("() => TEST.daten.anmelde_quittungen.filter(x => x.user_id === 'u1').map(x => x.meldung_id).sort().join(',')")
    pruefe(f"Quittungen gespeichert ({q})", q == "m1,m2,m4")

    # Einstellungen → Allgemein → Verwalten
    pg.evaluate("() => document.querySelector('[data-seite=einstellungen], #einstellungen-knopf, .kopf__einstellungen') && 0")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    if pg.locator(".dialog-huelle").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.evaluate("() => { const b = [...document.querySelectorAll('button,a')].find(x => /Einstellungen/.test(x.title || x.getAttribute('aria-label') || x.textContent)); b && b.click(); }")
    pg.wait_for_selector(".dialog--einstellungen"); pg.wait_for_timeout(400)
    pg.locator("[data-einst=allgemein]").click(); pg.wait_for_timeout(300)
    pruefe("Knopf Verwalten in Allgemein", pg.locator("#am-verwalten").count() == 1)
    pg.locator("#am-verwalten").click(); pg.wait_for_selector(".anmeldemeldungen"); pg.wait_for_timeout(400)
    pruefe("Alle 4 Meldungen in der Liste", pg.locator(".anmeldemeldungen__eintrag").count() == 4)
    zahl = pg.locator("[data-leser=m1]").inner_text()
    pruefe(f"Gelesen-Zahl stimmt ({zahl})", zahl == "Gelesen: 2 von 3")
    pg.locator("[data-leser=m1]").click(); pg.wait_for_timeout(300)
    pruefe("Leser aufgeklappt mit Noch nicht", "tristan" in pg.locator(".anmeldemeldungen__leser").inner_text().lower())
    if BILD: pg.screenshot(path=BILD + "/meldungen-verwalten.png")
    pg.locator("#am-neu").click(); pg.wait_for_timeout(500)
    pg.locator(".dialog-huelle").last.locator("input").first.fill("Neu: Meldungen")
    pg.locator(".dialog-huelle").last.locator(".stilfeld").click(); pg.keyboard.type("Hallo zusammen")
    if BILD: pg.screenshot(path=BILD + "/meldung-neu.png")
    pg.locator(".dialog-huelle").last.locator(".knopf--haupt").click(); pg.wait_for_timeout(800)
    n = pg.evaluate("() => TEST.daten.anmelde_meldungen.find(x => x.titel === 'Neu: Meldungen')")
    pruefe("Neue Meldung gespeichert", bool(n) and "Hallo" in (n or {}).get("text", ""))
    pg.locator("[data-amaktiv=m4]").click(); pg.wait_for_timeout(600)
    pruefe("Ausschalten speichert", pg.evaluate("() => TEST.daten.anmelde_meldungen.find(x => x.id === 'm4').aktiv") is False)
    pg.locator("[data-amweg=m3]").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle").last.locator(".knopf--gefahr").click(); pg.wait_for_timeout(600)
    pruefe("Löschen nach einer Rückfrage", not pg.evaluate("() => TEST.daten.anmelde_meldungen.some(x => x.id === 'm3')"))
    pg.context.close()

    # Gerätekonto: keine Meldung
    pg = seite(br, geraet=True)
    pruefe("Gerätekonto bekommt keine Meldung", pg.locator(".anmeldemeldung-huelle").count() == 0)
    pg.context.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
