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
        else:
            pg.locator("#db-umfragen").screenshot(path=SP + "umfrage_handy.png")
            sw = pg.evaluate("document.documentElement.scrollWidth")
            pruefe("handy: kein seitliches Rollen", sw <= breite)
        pg.context.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
