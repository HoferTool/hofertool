# Pad Mode, Maschinentyp: die Kacheln stehen kompakt in gleich vollen
# Reihen in der Mitte (8 Kacheln = 4 + 4), nicht in einer langen Zeile.
# Darüber steht gross das Hofer-Logo, auch bei Parks und Maschinen.
import time, sys
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# Sieben Typen im ersten Park, wie im Betrieb; schon beim Laden vorhanden
FAKE = FAKE + """
;(() => { const d = TEST.daten;
  const namen = ["Hanwha","SB-16","SB-16 (R)","SB-20","SR-10","SR-32","SW-20"];
  namen.forEach((n, i) => d.machine_types.push({ id: "tt" + i, name: n, is_active: true }));
  const park = d.machine_parks[0].id;
  const eigene = d.machines.filter(m => m.park_id === park);
  eigene.forEach((m, i) => m.type_id = "tt" + (i % 7));
  for (let i = 0; i < 14; i++) d.machines.push({ ...eigene[0], id: "mx" + i,
    name: "M" + i, machine_number: String(50 + i), type_id: "tt" + (i % 7) });
})();
"""
fehler = []
bild = sys.argv[1] if len(sys.argv) > 1 else None
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for breite, hoehe, reihen in [(1920, 1000, 2), (1180, 820, 2), (420, 860, 4)]:
        pg = br.new_context(viewport={"width":breite,"height":hoehe}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
        pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
        park = pg.evaluate("() => TEST.daten.machine_parks[0].id")
        pg.click(f"#pad [data-park='{park}']"); pg.wait_for_selector("#pad [data-padtyp]", timeout=8000)
        pg.wait_for_timeout(600)
        tops = pg.evaluate("() => [...document.querySelectorAll('#pad [data-padtyp]')].map(b => Math.round(b.getBoundingClientRect().top / 40))")
        if len(tops) != 8: fehler.append(f"{breite}: {len(tops)} Kacheln statt 8")
        n = len(set(tops))
        if n != reihen: fehler.append(f"{breite}px: {n} Reihen statt {reihen}")
        sw = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth")
        if sw: fehler.append(f"{breite}px: waagrechter Bildlauf")
        # Grosses Logo über Typen, Maschinen und Parks
        def logo(wo):
            h = pg.evaluate("() => { const l = document.querySelector('#pad .pad__wahllogo'); return l ? l.getBoundingClientRect().height : 0; }")
            if h < 80: fehler.append(f"{breite}px {wo}: Logo fehlt oder klein ({h:.0f}px)")
        logo("Typen")
        if bild: pg.screenshot(path=f"{bild}-{breite}.png")
        pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_selector("#pad .pad-kachel--maschine")
        logo("Maschinen")
        if bild: pg.screenshot(path=f"{bild}-{breite}-maschinen.png")
        pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-padtyp]")
        pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-park]")
        logo("Parks")
        pg.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
