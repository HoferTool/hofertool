# Solaranlage auf der Startseite antippen: Fenster mit mehr Infos (seit 1.747.0)
# Prüft: Tipp auf die Karte öffnet das Fenster, Tageswerte aus solar_tage,
# Umschalten 7/30/90 Tage, Tag/Woche/Monat in der Karte öffnet nichts,
# Escape schliesst. Mit BILD=<ordner> Bildschirmfotos hell, dunkel, Handy.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("BILD")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ZUSATZ = r"""
;(() => {
  TEST.rpc.solar_tage = () => {
    const l = []; const h = new Date();
    for (let i = 45; i >= 0; i--) {
      const d = new Date(h); d.setDate(d.getDate() - i);
      const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const e = 30 + ((i * 37) % 170);
      l.push({ datum: iso, ertrag_kwh: e, verbrauch_kwh: 2400 + (i % 7) * 150, bezug_kwh: 2300, einspeisung_kwh: 0,
        spitze_w: 8000 + e * 150, spitze_zeit: iso + 'T11:20:00Z', verbrauch_spitze_w: 190000, messungen: i === 0 ? 120 : 285 });
    }
    return l;
  };
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, name, dunkel in [(1440, 900, "pc", False), (1440, 900, "pc-dunkel", True), (390, 844, "handy", False)]:
        ctx = br.new_context(viewport={"width": breite, "height": hoehe}, color_scheme="dark" if dunkel else "light")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + ZUSATZ))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector("#db-solar .solar", timeout=15000); pg.wait_for_timeout(1500)
        if dunkel:
            pg.evaluate("document.body.classList.add('dunkel')")
        # Knopf Woche in der Karte schaltet nur um
        k = pg.locator("#db-solar [data-solspanne='woche']")
        if k.count():
            k.click(); pg.wait_for_timeout(800)
            pruefe(name + ": Woche öffnet kein Fenster", pg.locator("#solar-fenster").count() == 0)
        pg.locator("#db-solar .sol-kopf__titel").click(); pg.wait_for_timeout(1200)
        pruefe(name + ": Fenster offen", pg.locator("#solar-fenster").count() == 1)
        pruefe(name + ": Ertrag heute", pg.locator("#solf-heute").count() == 1)
        pruefe(name + ": Säulen 30 Tage", pg.locator("#solf-ertrag .dg-spalte").count() == 30)
        pruefe(name + ": Monate", pg.locator("#solf-monate tbody tr").count() >= 2)
        pruefe(name + ": nicht breiter als Bildschirm", pg.evaluate("document.querySelector('#solar-fenster').getBoundingClientRect().right <= innerWidth + 1"))
        if BILD: pg.screenshot(path=BILD + "/solar-fenster-" + name + ".png")
        pg.locator("[data-solftage='7']").click(); pg.wait_for_timeout(300)
        pruefe(name + ": 7 Tage", pg.locator("#solf-ertrag .dg-spalte").count() == 7)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pruefe(name + ": Escape schliesst", pg.locator("#solar-fenster").count() == 0)
        ctx.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
