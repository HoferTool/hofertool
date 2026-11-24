# Startseite (seit 1.612.0): Umfragen mit Vorschlägen und Bildern,
# abstimmen mit Namen, Ergebnis danach, Admin legt neue an
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
SP = "/tmp/claude-0/-home-user/b4de6780-b9b6-56fd-b3ec-af0e4ff596b0/scratchpad/"
BILD = "data:image/svg+xml;utf8," + "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='30'><rect width='40' height='30' fill='%2389a'/></svg>"
DAZU = """
TEST.daten.umfragen = [{ id: "u-1", titel: "Wohin geht der Firmenausflug?", beschreibung: "Bitte bis Freitag abstimmen.",
  bild_url: null, mehrfach: false, offen: true, erstellt_am: "2026-11-17T10:00:00Z",
  umfrage_vorschlaege: [
    { id: "v-1", umfrage_id: "u-1", text: "Europapark", bild_url: "%s", sort: 0 },
    { id: "v-2", umfrage_id: "u-1", text: "Brauereibesuch", bild_url: "%s", sort: 1 },
    { id: "v-3", umfrage_id: "u-1", text: "Bowling", bild_url: null, sort: 2 }],
  umfrage_stimmen: [{ id: "s-1", vorschlag_id: "v-2", name: "Tristan" }] }];
TEST.rpc.umfrage_abstimmen = (a) => {
  const u = TEST.daten.umfragen.find((x) => x.id === a.p_umfrage);
  u.umfrage_stimmen = u.umfrage_stimmen.filter((s) => s.name.toLowerCase() !== a.p_name.toLowerCase());
  a.p_vorschlaege.forEach((v) => u.umfrage_stimmen.push({ id: "s" + Math.random(), vorschlag_id: v, name: a.p_name }));
  return null;
};
""" % (BILD, BILD)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, art in [(1440, 900, "pc"), (390, 844, "handy")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DAZU))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(900)
        pruefe(art + ": Karte da", pg.locator("#db-umfragen .umf").count() == 1)
        pruefe(art + ": drei Vorschläge", pg.locator("[data-umfvorschlag]").count() == 3)
        if art == "pc":
            pg.locator("#db-umfragen").screenshot(path=SP + "umfrage_vorher.png")
            # 1.768.0: am PC Umfrage und Kalender nebeneinander
            if pg.locator("#db-kalender").count():
                a = pg.locator("#db-umfragen").bounding_box(); k = pg.locator("#db-kalender").bounding_box()
                pruefe("Kalender neben der Umfrage", abs(a["y"] - k["y"]) < 4 and k["x"] > a["x"] + a["width"] - 4)
            pg.screenshot(path=SP + "umfrage_start_pc.png", full_page=True)
            # 1.770.0: Karte nur so breit wie nötig
            w = pg.locator(".umf-karte").bounding_box()["width"]
            pruefe("Umfrage nicht volle Breite", w < 900)
            # auch im neuen Look (Klasse neues-menue)
            pg.evaluate("document.documentElement.classList.add('neues-menue'); location.hash = '#/material'")
            pg.wait_for_timeout(500); pg.evaluate("location.hash = '#/dashboard'"); pg.wait_for_timeout(1200)
            pruefe("neuer Look: Umfrage schmal", pg.locator(".sn2 .start-umf .umf-karte").count() == 1
                   and pg.locator(".sn2 .umf-karte").bounding_box()["width"] < 900)
            pg.screenshot(path=SP + "umfrage_start_neu.png", full_page=True)
            pg.evaluate("document.documentElement.classList.remove('neues-menue'); location.hash = '#/material'")
            pg.wait_for_timeout(500); pg.evaluate("location.hash = '#/dashboard'"); pg.wait_for_timeout(1200)
            pg.click("[data-umfabstimmen]"); pg.wait_for_timeout(100)
            pruefe("ohne Wahl Hinweis", pg.locator(".umf .feld-fehler").count() == 1)
            pg.click("[data-umfvorschlag='v-1']")
            pruefe("gewählt", pg.locator("[data-umfvorschlag='v-1'].umf-v--an").count() == 1)
            pg.click("[data-umfvorschlag='v-3']")
            pruefe("nur einer gewählt", pg.locator(".umf-v--an").count() == 1)
            pg.fill("#umf-name-u-1", "Saheesan"); pg.click("[data-umfabstimmen]"); pg.wait_for_timeout(600)
            st = pg.evaluate("TEST.daten.umfragen[0].umfrage_stimmen.map(s => s.name + ':' + s.vorschlag_id).join(',')")
            pruefe("Stimme gespeichert", "Saheesan:v-3" in st)
            pruefe("danach abgestimmt", pg.locator(".umf__danke").count() == 1)
            pruefe("Ergebnis mit Balken", pg.locator(".umf-v__balken").count() == 3)
            pg.locator("#db-umfragen").screenshot(path=SP + "umfrage_nachher.png")
            # Neue Umfrage
            pg.click("#umf-neu"); pg.wait_for_selector(".umf-bearbeiten")
            pg.fill("#umf-titel", "Pizza oder Döner?")
            f = pg.locator(".umf-b__v input")
            f.nth(0).fill("Pizza"); f.nth(1).fill("Döner")
            pg.check("#umf-mehrfach")
            pg.screenshot(path=SP + "umfrage_neu.png")
            pg.click("#umf-speichern"); pg.wait_for_timeout(700)
            n = pg.evaluate("TEST.daten.umfrage_vorschlaege ? TEST.daten.umfrage_vorschlaege.length : 0")
            pruefe("neue Umfrage mit 2 Vorschlägen", n == 2 and pg.evaluate("TEST.daten.umfragen.length") == 2)
            # Seit 1.760.0: ein einziger Vorschlag genügt
            pg.click("#umf-neu"); pg.wait_for_selector(".umf-bearbeiten")
            pg.fill("#umf-titel", "Grillabend am Freitag?")
            pg.locator(".umf-b__v input").nth(0).fill("Ich komme")
            pg.click("#umf-speichern"); pg.wait_for_timeout(700)
            pruefe("Umfrage mit nur einem Vorschlag gespeichert", pg.evaluate("TEST.daten.umfragen.length") == 3
                   and pg.locator(".umf-bearbeiten").count() == 0)
            # Seit 1.760.0: Admin sortiert die Umfragen am Griff
            pg.wait_for_timeout(500)
            reihe = lambda: pg.evaluate("[...document.querySelectorAll('#umf-liste-offen > li')].map(l => l.getAttribute('data-zieh'))")
            vorher = reihe()
            pruefe("drei Umfragen mit Griff", len(vorher) == 3 and pg.locator("#umf-liste-offen .ziehliste__griff").count() == 3)
            letzte = pg.locator("#umf-liste-offen > li").nth(2).locator(".ziehliste__griff")
            erste = pg.locator("#umf-liste-offen > li").nth(0).bounding_box()
            b = letzte.bounding_box()
            pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2); pg.mouse.down()
            for i in range(1, 16):
                pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + (erste["y"] - 150 - b["y"]) * i / 15)
                pg.wait_for_timeout(20)
            pg.mouse.up(); pg.wait_for_timeout(1200)
            nachher = reihe()
            pruefe("Reihenfolge geändert", len(nachher) == 3 and nachher[0] == vorher[2])
            sorts = pg.evaluate("Object.fromEntries(TEST.daten.umfragen.map(u => [u.id, u.sort]))")
            pruefe("Sortierung gespeichert", sorts[vorher[2]] < sorts[vorher[0]] < sorts[vorher[1]])
            pg.locator("#db-umfragen").screenshot(path=SP + "umfrage_sortiert.png")
        else:
            pg.locator("#db-umfragen").screenshot(path=SP + "umfrage_handy.png")
            sw = pg.evaluate("document.documentElement.scrollWidth")
            pruefe("handy: kein seitliches Rollen", sw <= breite)
        pg.context.close()
    # Seit 1.773.0: auch Mitarbeiter legen Umfragen an, Namen sichtbar mit Häkchen
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    MA = DAZU + "TEST.daten.profiles[0].role = 'mitarbeiter'; TEST.daten.umfragen[0].namen_zeigen = true; TEST.daten.umfragen[0].erstellt_von = 'u9';"
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + MA))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(900)
    pruefe("Mitarbeiter: Plus da", pg.locator("#umf-neu").count() == 1)
    pruefe("Mitarbeiter: fremde Umfrage nicht verwalten", pg.locator("[data-umfbearb='u-1']").count() == 0)
    pg.click("[data-umfvorschlag='v-1']"); pg.fill("#umf-name-u-1", "Zoe"); pg.click("[data-umfabstimmen]"); pg.wait_for_timeout(700)
    pruefe("Mitarbeiter: Namen sichtbar", pg.locator(".umf-v__namen").count() >= 1)
    pg.click("#umf-neu"); pg.wait_for_selector(".umf-bearbeiten")
    pg.fill("#umf-titel", "Kaffee oder Tee?"); pg.locator(".umf-b__v input").nth(0).fill("Kaffee")
    pg.click("#umf-speichern"); pg.wait_for_timeout(900)
    neu = pg.evaluate("TEST.daten.umfragen.find(u => u.titel === 'Kaffee oder Tee?')")
    pruefe("Mitarbeiter: Umfrage angelegt mit Ersteller", bool(neu) and neu.get("erstellt_von") == "u1")
    pruefe("Mitarbeiter: eigene verwalten", pg.locator(f"[data-umfbearb='{neu['id'] if neu else ''}']").count() == 1)
    pg.context.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
