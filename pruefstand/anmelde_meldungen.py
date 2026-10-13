# Wunsch Patrick 13. Oktober 2026: Meldung, die jeder nach dem Anmelden
# zuerst quittieren muss (neue Funktionen erklären); verwalten unter
# Einstellungen → Allgemein. Gerätekonten bekommen keine.
import time, sys, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)
BILD = sys.argv[1] if len(sys.argv) > 1 else None
# Ein Bild für die Meldung: das Logo aus public/
PROBE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "icon-512.png")

VORAB = """(() => { let t; Object.defineProperty(window, 'TEST', { configurable: true,
  get() { return t; }, set(v) { t = v;
    v.daten.anmelde_meldungen = [
      { id: 'm1', titel: 'Neu: Letzten Eintrag löschen', text: 'Unter <b>Produktion → Erfassen</b> steht jetzt\\n„Letzten Eintrag löschen“.<!--bilder:[\\"https://bild.test/a.png\\"]-->', aktiv: true, erstellt: '2026-10-13T08:00:00Z' },
      { id: 'm2', titel: 'Schon gelesen', text: 'x', aktiv: true, erstellt: '2026-10-10T08:00:00Z' },
      { id: 'm3', titel: 'Ausgeschaltet', text: 'y', aktiv: false, erstellt: '2026-10-11T08:00:00Z' },
      { id: 'm4', titel: 'Zweite neue', text: 'Vorher<br>[Bild 1]<br>Nachher<!--bilder:[\\"https://bild.test/b.png\\"]-->', aktiv: true, erstellt: '2026-10-13T09:00:00Z' },
      { id: 'm5', titel: 'Mit Seiten', aktiv: true, erstellt: '2026-10-13T10:00:00Z', text: '<!--seiten:' + JSON.stringify([
        { ueber: 'Eins', text: 'Erste Seite', bilder: ['https://bild.test/a.png'] },
        { ueber: 'Zwei', text: 'Zweite Seite', bilder: ['https://bild.test/b.png', 'https://bild.test/c.png'] },
        { ueber: 'Drei', text: 'Dritte Seite', bilder: [] }]) + '-->' }];
    v.daten.anmelde_quittungen = [{ meldung_id: 'm2', user_id: 'u1', am: '2026-10-10T09:00:00Z' },
                                  { meldung_id: 'm1', user_id: 'u2', am: '2026-10-13T09:30:00Z' }];
    if (window.GERAET) v.daten.profiles[0].andere_nutzer = true;
  } }); })();"""

def seite(br, geraet=False):
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    if geraet: ctx.add_init_script("window.GERAET = true;")
    ctx.add_init_script(VORAB)
    pg = ctx.new_page()
    pg.route("https://bild.test/**", lambda r: r.fulfill(status=200, content_type="image/png", body=open(PROBE, "rb").read()))
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
    pruefe("Bild in der Meldung", pg.locator(".anmeldemeldung__bild img").count() == 1)
    pruefe("Kein Bild-Vermerk im Text", "bilder:" not in pg.locator(".anmeldemeldung__text").inner_text())
    pg.wait_for_timeout(500)
    gr = pg.evaluate("() => { const r = document.querySelector('.dialog.anmeldemeldung').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }")
    pruefe(f"Fenster gross und mittig ({gr})", gr[0] >= 780 and abs(gr[1] - 720) < 4 and abs(gr[2] - 450) < 40)
    pruefe("Zähler 1 von 3", "1 von 3" in pg.locator(".anmeldemeldung__datum").inner_text())
    if BILD: pg.screenshot(path=BILD + "/meldung-anmelden.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe("Escape tut nichts, keine Abmelde-Frage", sperre() == 1 and pg.locator(".dialog-huelle").count() == 0)
    pg.mouse.click(10, 10); pg.wait_for_timeout(300)
    pruefe("Klick daneben tut nichts", sperre() == 1)
    pg.locator("#am-gelesen").click(); pg.wait_for_timeout(600)
    pruefe(f"Danach die zweite ({titel()!r})", titel() == "Zweite neue")
    folge = pg.evaluate("() => [...document.querySelector('.anmeldemeldung__text').children].map(c => c.querySelector('img') ? 'BILD' : c.textContent.trim()).join('|')")
    pruefe(f"[Bild 1] steht an seinem Platz ({folge})", folge == "Vorher|BILD|Nachher")
    pg.locator("#am-gelesen").click(); pg.wait_for_timeout(600)
    # Meldung mit Seiten: Schritt für Schritt, Bilder je Seite
    seite_txt = lambda: pg.locator(".anmeldemeldung-huelle .anmeldemeldung__seitenzahl").inner_text()
    ueber = lambda: pg.locator(".anmeldemeldung-huelle .anmeldemeldung__ueber").inner_text()
    bilder = lambda: pg.locator(".anmeldemeldung-huelle .anmeldemeldung__bild img").count()
    pruefe(f"Seiten: {titel()!r} {seite_txt()!r}", titel() == "Mit Seiten" and seite_txt() == "Seite 1 von 3")
    pruefe("Seite 1: Überschrift, Text, ein Bild, Weiter statt Gelesen", ueber() == "Eins" and bilder() == 1
           and pg.locator("#am-gelesen").count() == 0 and pg.locator("#am-weiter").count() == 1 and pg.locator("#am-zurueck").count() == 0)
    if BILD: pg.screenshot(path=BILD + "/meldung-seite-1.png")
    pg.locator("#am-weiter").click(); pg.wait_for_timeout(300)
    pruefe("Seite 2 mit ihren zwei Bildern und Zurück", seite_txt() == "Seite 2 von 3" and ueber() == "Zwei" and bilder() == 2
           and pg.locator("#am-zurueck").count() == 1)
    if BILD: pg.screenshot(path=BILD + "/meldung-seite-2.png")
    pg.locator("#am-zurueck").click(); pg.wait_for_timeout(300)
    pruefe("Zurück auf Seite 1", ueber() == "Eins")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape blättert nicht und schliesst nicht", sperre() == 1 and ueber() == "Eins")
    pg.locator("#am-weiter").click(); pg.wait_for_timeout(200); pg.locator("#am-weiter").click(); pg.wait_for_timeout(300)
    pruefe("Letzte Seite: Gelesen", ueber() == "Drei" and bilder() == 0 and pg.locator("#am-gelesen").count() == 1)
    pg.locator("#am-gelesen").click(); pg.wait_for_timeout(600)
    pruefe("Nach dem letzten Gelesen ist sie weg", sperre() == 0)
    q = pg.evaluate("() => TEST.daten.anmelde_quittungen.filter(x => x.user_id === 'u1').map(x => x.meldung_id).sort().join(',')")
    pruefe(f"Quittungen gespeichert ({q})", q == "m1,m2,m4,m5")

    # Einstellungen → Allgemein → Verwalten
    pg.evaluate("() => document.querySelector('[data-seite=einstellungen], #einstellungen-knopf, .kopf__einstellungen') && 0")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    if pg.locator(".dialog-huelle").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.evaluate("() => { const b = [...document.querySelectorAll('button,a')].find(x => /Einstellungen/.test(x.title || x.getAttribute('aria-label') || x.textContent)); b && b.click(); }")
    pg.wait_for_selector(".dialog--einstellungen"); pg.wait_for_timeout(400)
    pg.locator("[data-einst=allgemein]").click(); pg.wait_for_timeout(300)
    pruefe("Knopf Verwalten in Allgemein", pg.locator("#am-verwalten").count() == 1)
    pg.locator("#am-verwalten").click(); pg.wait_for_selector(".anmeldemeldungen"); pg.wait_for_timeout(400)
    pruefe("Alle 5 Meldungen in der Liste", pg.locator(".anmeldemeldungen__eintrag").count() == 5)
    pruefe("Liste zeigt die Seitenzahl", "3 Seiten" in pg.locator("[data-meldung=m5]").inner_text())
    zahl = pg.locator("[data-leser=m1]").inner_text()
    pruefe(f"Gelesen-Zahl stimmt ({zahl})", zahl == "Gelesen: 2 von 3")
    pg.locator("[data-leser=m1]").click(); pg.wait_for_timeout(300)
    pruefe("Leser aufgeklappt mit Noch nicht", "tristan" in pg.locator(".anmeldemeldungen__leser").inner_text().lower())
    if BILD: pg.screenshot(path=BILD + "/meldungen-verwalten.png")
    pg.locator("#am-neu").click(); pg.wait_for_timeout(500)
    pg.locator("#am-titel-feld").fill("Neu: Meldungen")
    pg.locator(".am-seite").nth(0).locator(".am-seite__ueber").fill("Erste")
    pg.locator(".am-seite").nth(0).locator(".stilfeld").click(); pg.keyboard.type("Hallo zusammen")
    with pg.expect_file_chooser() as fc:
        pg.locator("[data-bilddazu='0']").click()
    fc.value.set_files(PROBE); pg.wait_for_timeout(1200)
    pruefe("Bild hochgeladen in zeichnungen/meldungen", pg.evaluate("() => TEST.protokoll.some(x => x.art === 'upload' && x.ablage === 'zeichnungen' && /^meldungen\\//.test(x.pfad) && x.typ === 'image/jpeg')"))
    pruefe("Bild bei Seite 1", pg.locator(".am-seite").nth(0).locator(".am-bilder__eins img").count() == 1)
    pg.locator("#am-seite-dazu").click(); pg.wait_for_timeout(300)
    pruefe("Zweite Seite dazu", pg.locator(".am-seite").count() == 2)
    pg.locator(".am-seite").nth(1).locator(".am-seite__ueber").fill("Zweite")
    pg.locator(".am-seite").nth(1).locator(".stilfeld").click(); pg.keyboard.type("Und noch das")
    for _ in range(2):
        with pg.expect_file_chooser() as fc:
            pg.locator("[data-bilddazu='1']").click()
        fc.value.set_files(PROBE); pg.wait_for_timeout(900)
    pruefe("Zwei Bilder bei Seite 2, Seite 1 behält eins", pg.locator(".am-seite").nth(1).locator(".am-bilder__eins img").count() == 2
           and pg.locator(".am-seite").nth(0).locator(".am-bilder__eins img").count() == 1)
    if BILD: pg.screenshot(path=BILD + "/meldung-neu.png")
    # Vorschau am PC und am Handy, mit dem ungespeicherten Stand
    pg.locator("#am-vorschau").click(); pg.wait_for_timeout(500)
    pruefe("Vorschau PC zeigt Titel und Text", pg.locator(".am-geraet--pc h2").inner_text() == "Neu: Meldungen"
           and "Hallo zusammen" in pg.locator(".am-geraet--pc .anmeldemeldung__text").inner_text())
    pruefe("Vorschau zeigt das Bild der Seite 1", pg.locator(".am-geraet--pc .anmeldemeldung__bild img").count() == 1)
    pg.locator(".am-geraet--pc [data-am-weiter]").click(); pg.wait_for_timeout(300)
    pruefe("Vorschau blättert auf Seite 2", "Und noch das" in pg.locator(".am-geraet--pc .anmeldemeldung__text").inner_text()
           and pg.locator(".am-geraet--pc .anmeldemeldung__bild img").count() == 2)
    bb = pg.locator(".am-vorschau__buehne").bounding_box()
    pruefe(f"Vorschau passt aufs Fenster ({int(bb['width'])}×{int(bb['height'])})", bb["width"] <= 1440 - 40 and bb["height"] <= 900)
    if BILD: pg.screenshot(path=BILD + "/meldung-vorschau-pc.png")
    pg.locator("[data-geraet=handy]").click(); pg.wait_for_timeout(400)
    pruefe("Vorschau Handy", pg.locator(".am-geraet--handy .anmeldemeldung").count() == 1)
    if BILD: pg.screenshot(path=BILD + "/meldung-vorschau-handy.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Escape schliesst nur die Vorschau", pg.locator(".am-vorschau").count() == 0 and pg.locator("#am-speichern").count() == 1)
    pruefe("Nichts gespeichert durch die Vorschau", not pg.evaluate("() => TEST.daten.anmelde_meldungen.some(x => x.titel === 'Neu: Meldungen')"))
    pg.locator(".dialog-huelle").last.locator(".knopf--haupt").click(); pg.wait_for_timeout(800)
    n = pg.evaluate("() => TEST.daten.anmelde_meldungen.find(x => x.titel === 'Neu: Meldungen')")
    pruefe("Neue Meldung gespeichert", bool(n) and "Hallo" in (n or {}).get("text", ""))
    st = pg.evaluate("() => { const t = TEST.daten.anmelde_meldungen.find(x => x.titel === 'Neu: Meldungen').text; const m = t.match(/^<!--seiten:([\\s\\S]*)-->$/); return m ? JSON.parse(m[1]).map(x => x.ueber + ':' + x.bilder.length + ':' + (x.text.includes('Hallo') || x.text.includes('noch'))) : t.slice(0, 40); }")
    pruefe(f"Mit Seiten gespeichert ({st})", st == ["Erste:1:true", "Zweite:2:true"])
    pg.locator("[data-ambearbeiten=m1]").click(); pg.wait_for_timeout(600)
    pruefe("Bearbeiten zeigt vorhandenes Bild", pg.locator(".am-bilder__eins img").count() == 1)
    pg.locator("[data-bildweg='0']").click(); pg.locator("#am-speichern").click(); pg.wait_for_timeout(700)
    t1 = pg.evaluate("() => TEST.daten.anmelde_meldungen.find(x => x.id === 'm1').text")
    pruefe("Bild entfernt, Text bleibt", "bilder:" not in t1 and "Erfassen" in t1)
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
