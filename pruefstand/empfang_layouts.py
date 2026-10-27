# Layouts am Empfang (1.213.0, Wunsch Patrick 27. Oktober 2026): den ganzen
# Bildschirm mit Inhalt unter einem Namen speichern und später aktivieren.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

MIT = FAKE + """;
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { empfangSehen: true };
TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-20T10:00:00Z', aufbau: { frei: true, teile: [] } },
  { id: 'empfang', geaendert_am: '2026-10-20T10:00:00Z', aufbau: { frei: true,
    teile: [{ id: 'a', art: 'text', html: 'Willkommen A', x: 100, y: 400, w: 600, h: 300 }], farben: { kopf: '#ff0000' } } }];
"""
def knopf(pg, text):
    pg.locator(".dialog-huelle").last.locator("button", has_text=text).last.click(); pg.wait_for_timeout(700)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_page(viewport={"width": 1400, "height": 1000})
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/empfang'"); pg.wait_for_selector(".ib-gestalten--empfang"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-ib='layouts']").count() == 1, "Bereich Layouts am Empfang")
    pruefe(pg.locator("[data-iblayout]").count() == 0, "noch keine Layouts")

    # Speichern als „Sommer“
    pg.click("[data-ib='layout-speichern']"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").last.fill("Sommer"); knopf(pg, "Speichern")
    z = pg.evaluate("() => TEST.daten.infoboard.filter(z => z.id.startsWith('empfang-layout-')).map(z => z.aufbau)")
    pruefe(len(z) == 1 and z[0]["name"] == "Sommer" and z[0]["layout"]["teile"][0]["html"] == "Willkommen A"
           and z[0]["layout"]["farben"]["kopf"] == "#ff0000", "Layout mit Inhalt und Farben gespeichert")
    pruefe(pg.locator(".ib-layout--aktiv[data-iblayout='Sommer']").count() == 1, "Sommer als aktiv markiert")

    # Bildschirm ändern: neuer Text, dann als „Winter“ speichern
    pg.click("[data-ib='neu-text']"); pg.wait_for_selector(".ib-te .ib-text__blatt"); pg.wait_for_timeout(300)
    pg.locator(".ib-te .ib-text__blatt").click(); pg.keyboard.type("Winter B")
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(800)
    pruefe(pg.locator(".ib-layout--aktiv").count() == 0, "nach Änderung kein Layout aktiv")
    pg.click("[data-ib='layout-speichern']"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").last.fill("Winter"); knopf(pg, "Speichern")
    pruefe(pg.locator("[data-iblayout]").count() == 2, "zwei Layouts")

    # Sommer aktivieren: Bildschirm wieder wie vorher
    pg.locator("[data-iblayout='Sommer'] [data-ib='layout-aktivieren']").click(); pg.wait_for_selector(".dialog-huelle")
    knopf(pg, "Aktivieren")
    e = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'empfang').aufbau")
    pruefe(len(e["teile"]) == 1 and e["teile"][0]["html"] == "Willkommen A" and e["farben"]["kopf"] == "#ff0000",
           "Sommer auf dem Bildschirm gespeichert")
    pruefe(pg.locator(".ib-gestalten .ib-teil").count() == 1, "Tafel zeigt Sommer")
    pruefe(pg.locator(".ib-layout--aktiv[data-iblayout='Sommer']").count() == 1, "Sommer wieder aktiv")
    pg.screenshot(path=BILD + "/empfang-layouts.png")

    # Gleicher Name ersetzt nach Rückfrage
    pg.click("[data-ib='layout-speichern']"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").last.fill("winter"); knopf(pg, "Speichern"); knopf(pg, "Ersetzen")
    z = pg.evaluate("() => TEST.daten.infoboard.filter(z => z.id.startsWith('empfang-layout-')).map(z => [z.aufbau.name, z.aufbau.layout.teile.length])")
    pruefe(sorted(z) == [["Sommer", 1], ["winter", 1]], "Winter ersetzt, nicht doppelt: %s" % z)

    # Löschen
    pg.locator("[data-iblayout='winter'] [data-ib='layout-loeschen']").click(); pg.wait_for_selector(".dialog-huelle")
    knopf(pg, "Löschen")
    pruefe(pg.locator("[data-iblayout]").count() == 1, "Layout gelöscht")
    pruefe(pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'empfang').aufbau.teile.length") == 1, "Bildschirm unberührt")

    # Infoboard hat keine Layouts
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten--haupt"); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-ib='layouts']").count() == 0, "Infoboard ohne Layouts")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
