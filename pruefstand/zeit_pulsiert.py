# Stückzeit fehlt (1.26.0): Die Kachel Stückzeit im Pad pulsiert, solange
# keine Zeit eingetragen ist, und hört damit auf, sobald eine da ist.
# Die Bilder setzt ein Admin unter Einstellungen → Symbole (1.29.0).
# Ebenso die Kachel Stückzahl, solange heute keine Stückzahl gemeldet ist (1.28.0).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FALSCH ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("(TEST.daten.hoco_type_data || []).forEach(z => z.stueckzeit_s = null)")
    # Heute noch nichts gemeldet
    pg.evaluate("""() => { const h = new Date(); const iso = h.getFullYear() + '-' + String(h.getMonth()+1).padStart(2,'0') + '-' + String(h.getDate()).padStart(2,'0');
      TEST.daten.production_records = TEST.daten.production_records.filter(z => z.record_date !== iso
        && !String(z.updated_at || z.created_at || '').startsWith(iso)); }""")
    pg.evaluate("""() => TEST.daten.app_config.push({ schluessel: 'pad_mahnbilder', wert: JSON.stringify({
      stueckzeit: { person: 'mb' } }) })""")
    # Ein Testbild als Profilfoto (ein rotes Pixel)
    pg.evaluate("""() => { const p = TEST.daten.profiles; const v = p[0];
      p.push(Object.assign({}, v, { id: 'mb', full_name: 'Test Person', email: 'tp@test',
        bild_url: 'data:image/gif;base64,R0lGODlhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs=' })); }""")    # Bild für die Stückzahl unter Einstellungen → Symbole wählen
    import base64, io, os
    png = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "icon-192.png")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='symbole']").click(); pg.wait_for_timeout(1000)
    pruefe("Abschnitt Bilder im Pad Mode da", pg.locator("#mahnbilder [data-mahnbild='stueckzahl']").count() == 1)
    with pg.expect_file_chooser() as fc: pg.click("#mahnbilder [data-mahnbild='stueckzahl'] .sym-bild")
    fc.value.set_files(png); pg.wait_for_selector("#zs-ja"); pg.click("#zs-ja"); pg.wait_for_timeout(1500)
    gesp = pg.evaluate("(TEST.daten.app_config.find(z => z.schluessel === 'pad_mahnbilder') || {}).wert || ''")
    pruefe("Bild gespeichert, Person bleibt", '"stueckzahl":{"bild":"data:image' in gesp and '"person":"mb"' in gesp)
    pruefe("Vorschau zeigt beide Bilder", pg.locator("#mahnbilder img").count() == 2)
    pg.screenshot(path="/tmp/mahnbilder-einst.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0, i)).click(); pg.wait_for_timeout(2500)
    k = ".pad-karte2--zeit"
    pruefe("Kachel pulsiert ohne Stückzeit", pg.locator(k + ".pad-karte2--zeitfehlt").count() == 1)
    pruefe("Animation läuft", pg.evaluate(f"getComputedStyle(document.querySelector('{k}')).animationName") == "pad-zeit-nervt")
    werte = set()
    for _ in range(6):
        werte.add(pg.evaluate(f"getComputedStyle(document.querySelector('{k}'), '::after').opacity")[:3]); pg.wait_for_timeout(130)
    print("     Rot-Schicht:", sorted(werte))
    pruefe("rote Schicht wechselt", len(werte) > 2)
    pruefe("Foto steht in der Kachel", pg.locator(k + " .pad-zeit-foto").count() == 1)
    s = ".pad-karte2--stk"
    import datetime
    werktag = datetime.date.today().weekday() < 5
    if werktag:
        pruefe("Stückzahl-Kachel mahnt (heute nichts gemeldet)", pg.locator(s + ".pad-karte2--stkfehlt").count() == 1)
        pruefe("Bild in der Stückzahl-Kachel", pg.locator(s + " .pad-zeit-foto").count() == 1
               and pg.evaluate(f"document.querySelector('{s} .pad-zeit-foto').naturalWidth") > 0)
    pg.wait_for_timeout(400); pg.screenshot(path="/tmp/zeit-pulsiert.png")
    # Zeit eintragen: Kachel antippen, Zahl, Eintragen
    pg.locator(k).click(force=True); pg.wait_for_timeout(600)
    pg.wait_for_selector(".zifferblock [data-zbja]")
    pg.keyboard.type("42"); pg.wait_for_timeout(200)
    pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1500)
    print("     Kachel:", pg.inner_text(k).replace("\n", " | "))
    pruefe("nach dem Eintragen ruhig", pg.locator(k + ".pad-karte2--zeitfehlt").count() == 0)
    pruefe("Foto wieder weg", pg.locator(k + " .pad-zeit-foto").count() == 0)
    # Stückzeit wieder löschen (1.28.0): Knopf im Zifferblock, eine Rückfrage
    pg.locator(k).click(force=True); pg.wait_for_selector(".zifferblock [data-zbloeschen]")
    pg.wait_for_timeout(800); pg.screenshot(path="/tmp/zeit-loeschen.png")
    pg.click(".zifferblock [data-zbloeschen]"); pg.wait_for_timeout(500)
    pg.locator(".dialog-huelle button:has-text('Löschen')").last.click(); pg.wait_for_timeout(1500)
    pruefe("Stückzeit gelöscht, Kachel mahnt wieder", pg.locator(k + ".pad-karte2--zeitfehlt").count() == 1
           and "42" not in pg.inner_text(k))
    if werktag:
        pg.locator(s).click(force=True); pg.wait_for_selector(".zifferblock [data-zbja]")
        pg.keyboard.type("120"); pg.wait_for_timeout(200)
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(900)
        pg.wait_for_timeout(500)
        if pg.locator(".dialog-huelle button:has-text('Ja')").count():
            pg.locator(".dialog-huelle button:has-text('Ja')").first.click(); pg.wait_for_timeout(1500)
        pg.wait_for_timeout(1000)
        pruefe("nach dem Melden ruhig", pg.locator(s + ".pad-karte2--stkfehlt").count() == 0)
    br.close()
print("Fehler:", "keine" if not (fehler or f) else (fehler + f)[:12])
