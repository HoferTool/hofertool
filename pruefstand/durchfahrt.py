# Startseite und Infoboard: Im Band oben läuft ein Tänzer durch und wirft
# Nocco-Dosen (seit 1.495.0, Wunsch Patrick 12. November 2026; 1.442.0 bis
# 1.494.x Seniorenmobil mit Tennisballkanone). Auf der Startseite bleiben
# die Dosen im Band, im Infoboard fliegen sie über die ganze Tafel. Die
# Pausen werden hier verkürzt.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("BILDER", "")

def seite(br, vp, hash_=""):
    pg = br.new_context(viewport=vp).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.add_init_script("""(() => { const st = window.setTimeout;
      window.setTimeout = (f, ms, ...r) => st(f, ms > 4000 ? 300 : ms, ...r); })();""")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    if hash_: pg.evaluate("h => location.hash = h", hash_)
    return pg

def beobachten(pg, name, wurzel, tafel):
    pg.wait_for_selector(wurzel + " .kopfkarte .durchfahrt .gm-strasse", timeout=20000)
    if pg.locator(".spuk, .spuk-erde, .spuk-grab").count(): fehler.append(f"{name}: Zombies noch da")
    richtung, baelle, weit = set(), 0, False
    for i in range(1200):
        info = pg.evaluate("""(w) => { const m = document.querySelector(w + ' .gm-taenzer');
            if (!m || m.style.visibility === 'hidden') return null;
            const r = m.getBoundingClientRect(), k = document.querySelector(w + ' .kopfkarte').getBoundingClientRect();
            return { x: r.left, unten: k.bottom - r.bottom, hoch: k.height, oben: r.top - k.top,
                     spiegel: m.style.transform.includes('scaleX(-1)') } }""", wurzel)
        b = pg.evaluate("""([w, t]) => { const k = document.querySelector(w + ' .kopfkarte').getBoundingClientRect();
            const bs = [...document.querySelectorAll(w + ' .gm-dose')].map(e => e.getBoundingClientRect());
            return { n: bs.length, weit: bs.some(r => r.top > k.bottom + 40) } }""", [wurzel, tafel])
        baelle = max(baelle, b["n"]); weit = weit or b["weit"]
        if info and i % 10 == 0:
            if info["oben"] < -2: fehler.append(f"{name}: Mobil ragt oben aus dem Band")
            if not (0 <= info["unten"] <= info["hoch"] * .15): fehler.append(f"{name}: Mobil nicht auf der Strasse ({info['unten']:.0f})")
            richtung.add("links" if info["spiegel"] else "rechts")
        if BILDER and info and i in (60, 120):
            pg.screenshot(path=os.path.join(BILDER, f"durchfahrt_{name}_{i}.png"))
        if len(richtung) == 2 and baelle >= 2 and (weit or not tafel) and i > 80: break
        pg.wait_for_timeout(100)
    if not baelle: fehler.append(f"{name}: keine Bälle")
    if tafel and not weit: fehler.append(f"{name}: Bälle fliegen nicht über die Tafel")
    if not tafel and weit: fehler.append(f"{name}: Bälle verlassen das Band")
    if len(richtung) < 2: fehler.append(f"{name}: fährt nur nach {richtung}")
    print(name, "Bälle", baelle, "Richtungen", sorted(richtung), "weit", weit)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("pc", {"width":1300,"height":900}), ("handy", {"width":390,"height":844})]:
        pg = seite(br, vp)
        beobachten(pg, name, "#inhalt", False)
        pg.context.close()
    pg = seite(br, {"width":1080,"height":1920}, "#/infoboard")
    pg.wait_for_selector(".ib-gestalten [data-ibtafel]")
    beobachten(pg, "infoboard", ".ib-gestalten [data-ibtafel]", True)
    pg.context.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
