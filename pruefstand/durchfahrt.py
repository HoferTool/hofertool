# Startseite und Infoboard: Im Band oben zieht die Person aus Patricks Bild
# einen Schlitten mit drei Hühnern drin, mal nach links, mal nach rechts,
# hält einmal an und sagt einen Spruch zu Zerspanen und Crossfit (seit
# 1.555.0, Wunsch Patrick 15. November 2026; 1.495.0 bis 1.554.x Tänzer mit
# Nocco-Dosen). Die Pausen werden hier verkürzt.
# Bild nur zum Anschauen: PERSON_FOTO=<Datei mit data:-Adresse> (das Bild
# steht nie im Repository, nur in der Datenbank).
import os, time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("BILDER", "")

def seite(br, vp, hash_=""):
    pg = br.new_context(viewport=vp).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.add_init_script("""(() => { const st = window.setTimeout;
      window.setTimeout = (f, ms, ...r) => st(f, ms > 5500 ? 300 : ms, ...r); })();""")
    if os.environ.get("PERSON_FOTO"):
        url = open(os.environ["PERSON_FOTO"]).read().strip()
        pg.add_init_script("""(() => { const t = setInterval(() => { if (window.TEST && TEST.daten) {
          TEST.daten.app_config.push({ schluessel: 'durchfahrt_person', wert: %s }); clearInterval(t); } }, 5); })();""" % json.dumps(url))
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
    pg.wait_for_selector(wurzel + " .durchfahrt .wm-zug", state="attached", timeout=20000)
    if pg.locator(".gm-taenzer, .gm-dose, .tr-tristan").count(): fehler.append(f"{name}: Tänzer oder Dosen noch da")
    richtung, sprueche, bild = set(), set(), 0
    for i in range(1500):
        info = pg.evaluate("""(w) => { const z = document.querySelector(w + ' .wm-zug');
            if (!z) return null;
            const k = document.querySelector(w + ' .durchfahrt').getBoundingClientRect();
            const p = z.querySelector('.wm-person').getBoundingClientRect();
            const b = document.querySelector(w + ' .wm-blase');
            return { links: z.classList.contains('wm-links'), steht: z.classList.contains('wm-steht'),
                     huehner: z.querySelectorAll('.wm-schlitten .umzug-huhn').length,
                     bilder: z.querySelectorAll('.wm-person img').length,
                     oben: p.top - k.top, unten: k.bottom - p.bottom, hoch: k.height,
                     blase: b ? b.textContent : '', blaseRaus: b ? (() => { const r = b.getBoundingClientRect();
                        const raus = r.left < k.left - 1 || r.right > k.right + 1 || r.top < k.top - 1 || r.bottom > k.bottom + 1; return raus ? JSON.stringify([r.left,r.right,r.top,r.bottom,k.left,k.right,k.top,k.bottom]) : false; })() : false } }""", wurzel)
        if info:
            richtung.add("links" if info["links"] else "rechts")
            bild = max(bild, info["bilder"])
            if info["huehner"] != 3: fehler.append(f"{name}: {info['huehner']} Hühner im Schlitten"); break
            if info["oben"] < -4: fehler.append(f"{name}: Person ragt oben aus dem Band ({info['oben']:.0f})"); break
            if not tafel and info["unten"] < -2: fehler.append(f"{name}: Person unter dem Band"); break
            if info["blase"]:
                sprueche.add(info["blase"])
                if not info["steht"]: fehler.append(f"{name}: Spruch ohne Halt"); break
                if info["blaseRaus"]: fehler.append(f"{name}: Sprechblase ausserhalb des Bands {info['blaseRaus']}"); break
                if BILDER and len(sprueche) <= 2:
                    pg.wait_for_timeout(400)
                    pg.screenshot(path=os.path.join(BILDER, f"durchfahrt_{name}_{len(sprueche)}.png"))
        if len(richtung) == 2 and len(sprueche) >= 2: break
        pg.wait_for_timeout(100)
    alle = pg.evaluate("TEST.weihnachtsmann && TEST.weihnachtsmann.SPRUECHE")
    if not alle or any(s not in alle for s in sprueche): fehler.append(f"{name}: unbekannter Spruch {sprueche}")
    if bild != 3: fehler.append(f"{name}: Bild nicht dreiteilig ({bild})")
    if len(richtung) < 2: fehler.append(f"{name}: fährt nur nach {richtung}")
    if len(sprueche) < 2: fehler.append(f"{name}: nur {len(sprueche)} Sprüche")
    print(name, "Richtungen", sorted(richtung), "Sprüche", len(sprueche))

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
