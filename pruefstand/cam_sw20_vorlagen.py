# HOFERCAM SW-20 (seit 1.695.2): Vorlagen, G83 stehend/angetrieben aus der
# Bearbeitung und Bibliothek „Reale Werkzeuge“ auch in allen drei Kanälen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
    pg.check("[data-cam-swfront='1300'] input"); pg.wait_for_timeout(200)
    pruefe("Bibliothek-Knopf bei SW-20", pg.locator("#cam-bibliothek-auf").count() == 1)
    faelle = [("dreh", "stehend"), ("seite", "an"), ("k3dr", "stehend"), ("k3s", "an"), ("k3f", "an"),
              ("k2", "stehend"), ("k2a", "an"), ("k2b", "stehend")]
    for art, soll in faelle:
        knopf = "#cam-neu-" + art
        if pg.locator(knopf).count() == 0 or pg.is_disabled(knopf):
            pruefe(f"Knopf {art} da", False); continue
        pg.click(knopf); pg.wait_for_timeout(250)
        i = pg.locator("[data-camvorlage-auf]").count() - 1
        pg.click(f"[data-camvorlage-auf='{i}']")
        # seit 1.726.0 dazu M50 und M142, nur Kanal 1 und 3
        # seit 1.764.0 dazu Tieflochbohren mit Pilot und Zähler
        soll_n = 6 if art.startswith("k2") else 8
        pruefe(f"{art}: Auswahlbild mit {soll_n} Vorlagen", pg.locator("[data-camvorlage-bild]").count() == soll_n)
        pg.click("[data-camvorlage-bild='g83']")
        pruefe(f"{art}: G83 {soll} aus der Bearbeitung", pg.locator(f"[data-camvorlage-fest='art:{soll}']").count() == 1
               and pg.locator("[data-camvorlage-wahl^='art:']").count() == 0)
        pruefe(f"{art}: Felder passend", (pg.locator("[data-camvorlage-feld='D']").count() == 1) == (soll == "an"))
        pg.click("[data-camvorlage] .cam-vorlage__kopf button[title='Schliessen']")
        pruefe(f"{art}: Werkzeug-Knopf", pg.locator(f"[data-camwz-auf='{i}']").count() == 1)
    # Bohren angetrieben in Kanal 3 einfügen
    i = [a for a, _ in faelle].index("k3s")
    pg.click(f"[data-camvorlage-auf='{i}']"); pg.click("[data-camvorlage-bild='g83']")
    for n, v in (("D", "8"), ("N", "3"), ("W", "6"), ("Q", "1"), ("F", "0.04")):
        pg.fill(f"[data-camvorlage-feld='{n}']", v)
    vs = pg.text_content("[data-camvorlage-vorschau]") or ""
    pruefe("K3 Lochkreis", vs.split("\n") == ["G0X8.C0.", "G83W6.Q1000F0.04", "C120.", "C240.", "G80"])
    pg.click("[data-camvorlage-einfuegen]"); pg.wait_for_timeout(200)
    k3 = pg.eval_on_selector_all("[data-kanal='3'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("In Kanal 3 eingefügt", "G83W6.Q1000F0.04" in k3)
    # Bibliothek im Werkzeugfenster eines K2-Blocks
    j = [a for a, _ in faelle].index("k2a")
    pg.click(f"[data-camwz-auf='{j}']")
    pruefe("Bibliothek im Werkzeugfenster K2", pg.locator("[data-camwz-bib]").count() == 1)
    pg.screenshot(path="cam_sw20_vorlagen.png")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
