# Pad Mode, Liste der Maschinen eines Parks (1.742.0, Wunsch Patrick
# 23. November 2026: „Felder etwas kleiner, dass man alle auf einmal
# sehen kann“): mit 14 Maschinen am iPad quer und hoch ohne Rollen.
import os, sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("BILDER_ORDNER", "/tmp")
zusatz = """
;(() => { const daten = TEST.daten;
  const vorlage = daten.machines[0];
  const park = vorlage.park_id;
  for (let i = 0; i < 14; i++) {
    daten.machines.push(Object.assign({}, vorlage, { id: 'mk' + i, name: 'Star SB-20RG', machine_number: String(130 + i), park_id: park, sort_order: 100 + i }));
  }
})();
"""
K = FAKE + zusatz
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("quer", {"width":1180,"height":820}), ("hoch", {"width":820,"height":1180})]:
        pg = br.new_context(viewport={"width":1400,"height":950}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=K))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
        pg.click("#pad-knopf"); pg.wait_for_selector("#pad [data-padwo='parks']")
        pg.set_viewport_size(vp); pg.wait_for_timeout(400)
        pg.click("#pad [data-padwo='parks']"); pg.wait_for_timeout(800)
        if pg.locator("#pad [data-park]").count():
            park = pg.evaluate("TEST.daten.machines[0].park_id")
            pg.locator(f"#pad [data-park='{park}']").first.click(); pg.wait_for_timeout(800)
        typ = pg.evaluate("TEST.daten.machines[0].type_id")
        if pg.locator(f"#pad [data-padtyp='{typ}']").count():
            pg.locator(f"#pad [data-padtyp='{typ}']").first.click(); pg.wait_for_timeout(800)
        pg.wait_for_selector("#pad [data-maschine]")
        n = pg.locator("#pad [data-maschine]").count()
        unten = pg.evaluate("Math.max(...[...document.querySelectorAll('#pad [data-maschine]')].map(e => e.getBoundingClientRect().bottom))")
        rollt = pg.evaluate("(() => { const els=[...document.querySelectorAll('#pad, #pad *')]; return els.some(e => e.scrollHeight > e.clientHeight + 2 && ['auto','scroll'].includes(getComputedStyle(e).overflowY)); })()")
        print(name, "Maschinen:", n, "unterste Kante:", round(unten), "von", vp["height"], "rollt:", rollt)
        if n < 14: fehler.append(f"{name}: nur {n} Maschinen")
        if unten > vp["height"]: fehler.append(f"{name}: unterste Kachel bei {round(unten)} > {vp['height']}")
        if len(sys.argv) > 1: pg.screenshot(path=f"{BILDER}/pad-maschinen-{name}.png")
        pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
