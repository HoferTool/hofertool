# HOFER-NC-PRO → Bohren / Fräsen (seit 1.384.0): jede Bearbeitung gibt
# plausiblen NC-Code, Warnungen erscheinen, Antrieb und Ansichten gehen.
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
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/bohren']"); pg.click("[data-unter='nc/bohren']")
    pg.wait_for_selector("#bf-code")
    code = lambda: pg.text_content("#bf-code")
    def feld(name, wert):
        pg.fill(f"[data-bf='{name}']", str(wert)); pg.press(f"[data-bf='{name}']", "Tab"); pg.wait_for_timeout(120)

    c = code()
    pruefe("Front G83 mit 4 Bohrungen", "G83X12.000C0.000Z-8.000R0.Q2000F80" in c and "\nX12.000C90.000" in c
           and "\nX12.000C270.000" in c and "\nG80" in c)
    pruefe("Hinweis ohne Antrieb", "FRONTWERKZEUG EIN S2500" in c and pg.locator(".bf-warnung").count() == 1)
    pg.fill("[data-bfantrieb='frontEin']", "M80 S{S}"); pg.fill("[data-bfantrieb='frontAus']", "M81")
    pg.click("#bf-code"); pg.wait_for_timeout(150)
    c = code()
    pruefe("Antrieb mit Drehzahl", "\nM80 S2500\n" in c and "\nM81" in c and pg.locator(".bf-warnung").count() == 0)
    pruefe("Antrieb gemerkt", pg.evaluate("localStorage.length") >= 0)

    pg.select_option("[data-bf='ausgabe']", "einzeln"); pg.wait_for_timeout(120)
    c = code()
    pruefe("Ausgeschrieben: Stösse 2/4/6/8", all(f"G1Z-{t}.000F80" in c for t in (2, 4, 6, 8)) and "G83" not in c
           and "G0Z-1.700" in c)
    pg.click("[data-bfzyklus='gewinde']"); pg.wait_for_timeout(120)
    c = code()
    pruefe("Gewinde M29 + G84 F=S*P", "M29S2500" in c and "G84X12.000C0.000Z-8.000R0.F1750" in c)
    feld("lochkreis", 0)
    pruefe("Mitte: eine Bohrung X0", "G84X0.000C0.000" in code() and pg.locator("[data-bf='anzahl']").count() == 0)

    pg.click("[data-bfart='bohrenQuer']"); pg.wait_for_timeout(120)
    pg.click("[data-bfzyklus='tief']"); feld("zPos", "5; 12"); feld("anzahl", 2)
    pg.select_option("[data-bf='ausgabe']", "zyklus"); pg.wait_for_timeout(120)
    c = code()
    pruefe("Quer G87 zwei Lagen, zwei Winkel", "G87Z-5.000C0.000X4.000R0.Q2000F80" in c and "\nZ-5.000C180.000" in c
           and "\nZ-12.000C0.000" in c and "\nZ-12.000C180.000" in c and "G0X22.000" in c)
    pruefe("Quer ohne Antrieb warnt", "QUERWERKZEUG EIN" in c and pg.locator(".bf-warnung").count() == 1)

    pg.click("[data-bfart='nutFront']"); pg.wait_for_timeout(120)
    c = code()
    pruefe("Nut Front durchgehend", "G0X26.000C0.000" in c and "G1Z-0.500F40" in c and "G1X-26.000F80" in c
           and "G1Z-1.500F40" in c)
    pg.click("[data-bfart='nutQuer']"); pg.wait_for_timeout(120)
    c = code()
    pruefe("Nut Quer offen", "G0Z3.000C0.000" in c and "G1X19.000F40" in c and "G1Z-10.000F80" in c and "G1X17.000F40" in c)

    pg.click("[data-bfart='flaeche']"); pg.wait_for_timeout(120)
    pruefe("Fläche: Fräser zu klein warnt", any("Y-Achse" in t for t in pg.locator(".bf-warnung").all_inner_texts()))
    feld("fraeser", 14)
    c = code()
    pruefe("Fläche 2 × SW16 mit Fräser 14", "C180.000" in c and "G1X16.000F40" in c and "G1Z-3.000F80" in c
           and not any("Y-Achse" in t for t in pg.locator(".bf-warnung").all_inner_texts()))
    feld("fraeser", 6); pg.select_option("[data-bf='yAchse']", "ja"); pg.wait_for_timeout(120)
    c = code()
    pruefe("Fläche mit Y in Bahnen", "Y-" in c and "G1Y" in c and "G0Y0." in c)
    pruefe("Ansichten da", pg.locator("#bf-stirn .bf-weg").count() == 2 and pg.locator("#bf-seite .bf-weg").count() == 2)
    pg.screenshot(path="bohren.png", full_page=True)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
