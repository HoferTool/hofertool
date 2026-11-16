# Startseite und Infoboard: Im Band oben laufen wieder die weisslichen
# Hühner vom Anfang herum, legen Eier und verlieren Federn, dazu je
# Jahreszeit Schnee, Blätter, Blüten, Blümchen von unten und im Sommer ein
# Wasserball (seit 1.574.0, Wunsch Patrick 16. November 2026; 1.555.0 bis
# 1.573.x die Person mit dem Schlitten). Die Pausen werden hier verkürzt.
# BILDER=<Ordner> legt Bildschirmfotos ab.
import os, time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("BILDER", "")

def seite(br, vp, zeit, hash_=""):
    pg = br.new_context(viewport=vp).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.add_init_script("""(() => { const st = window.setTimeout;
      window.setTimeout = (f, ms, ...r) => st(f, ms > 5500 ? 300 : ms, ...r);
      const t = setInterval(() => { if (window.TEST) { TEST.jahreszeit = %s; clearInterval(t); } }, 1); })();""" % json.dumps(zeit))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    if hash_: pg.evaluate("h => location.hash = h", hash_)
    return pg

ERWARTET = {"winter": ".hof-fall--schnee", "herbst": ".hof-fall--blatt",
            "fruehling": ".hof-fall--bluete", "sommer": ".hof-blume"}

def beobachten(pg, name, wurzel, tafel, zeit):
    d = wurzel + " .durchfahrt"
    pg.wait_for_selector(d, state="attached", timeout=20000)
    if pg.locator(".wm-zug, .wm-blase, .gm-taenzer").count(): fehler.append(f"{name}: Schlitten noch da")
    gesehen = {"huhn": 0, "ei": 0, "feder": 0, "art": 0, "ball": 0}
    for i in range(400):
        info = pg.evaluate("""([d, s]) => { const k = document.querySelector(d);
            const kr = k.getBoundingClientRect();
            const h = [...k.querySelectorAll('.huhn')].map(e => e.getBoundingClientRect());
            return { huhn: h.length, ei: k.querySelectorAll('.huhn-ei').length, feder: k.querySelectorAll('.huhn-feder').length,
                     art: k.querySelectorAll(s).length, ball: k.querySelectorAll('.hof-ball').length,
                     falsch: k.querySelectorAll('.hof-fall, .hof-blume').length - k.querySelectorAll(s).length
                       - (s === '.hof-blume' ? 0 : s === '.hof-fall--bluete' ? k.querySelectorAll('.hof-blume').length : 0),
                     raus: h.some(r => r.top < kr.top - 6 || r.bottom > kr.bottom + 6), zeit: k.dataset.jahreszeit || '' } }""", [d, ERWARTET[zeit]])
        for k in gesehen: gesehen[k] = max(gesehen[k], info[k])
        if info["raus"] and not tafel: fehler.append(f"{name}: Huhn ragt aus dem Band"); break
        if info["falsch"] > 0: fehler.append(f"{name}: Teilchen einer anderen Jahreszeit"); break
        if BILDER and i == 60: pg.screenshot(path=os.path.join(BILDER, f"huehner_{name}_{zeit}.png"))
        if gesehen["huhn"] and gesehen["ei"] and gesehen["feder"] and gesehen["art"] and (zeit != "sommer" or gesehen["ball"]) and i > 60: break
        pg.wait_for_timeout(100)
    for k in ["huhn", "ei", "feder", "art"]:
        if not gesehen[k]: fehler.append(f"{name} {zeit}: kein {k}")
    if zeit == "sommer" and not gesehen["ball"]: fehler.append(f"{name}: kein Wasserball im Sommer")
    if zeit != "sommer" and gesehen["ball"]: fehler.append(f"{name}: Wasserball ausserhalb des Sommers")
    print(name, zeit, gesehen)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for zeit in ["winter", "herbst", "fruehling", "sommer"]:
        pg = seite(br, {"width":1300,"height":900}, zeit)
        beobachten(pg, "pc", "#inhalt", False, zeit)
        pg.context.close()
    pg = seite(br, {"width":390,"height":844}, "sommer")
    beobachten(pg, "handy", "#inhalt", False, "sommer")
    pg.context.close()
    # Infoboard seit 1.575.0: Hühner nur im blauen Band wie auf der
    # Startseite, Schnee über die ganze Tafel, Solaranlage ohne Hühner
    pg = seite(br, {"width":1080,"height":1920}, "sommer", "#/infoboard")
    pg.wait_for_selector(".ib-gestalten [data-ibtafel]")
    beobachten(pg, "infoboard", ".ib-gestalten [data-ibtafel] .kopfkarte", False, "sommer")
    pg.context.close()
    pg = seite(br, {"width":1080,"height":1920}, "winter", "#/infoboard")
    pg.wait_for_selector(".ib-gestalten [data-ibtafel] .durchfahrt--himmel", state="attached", timeout=20000)
    pg.wait_for_timeout(4000)
    info = pg.evaluate("""() => { const t = document.querySelector('.ib-gestalten [data-ibtafel]');
        const h = t.querySelector('.durchfahrt--himmel'), b = t.querySelector('.kopfkarte .durchfahrt');
        const hr = h.getBoundingClientRect(), tr = t.getBoundingClientRect();
        return { schnee: h.querySelectorAll('.hof-fall--schnee').length, huhnHimmel: h.querySelectorAll('.huhn').length,
                 fallBand: b ? b.querySelectorAll('.hof-fall').length : -1, band: !!b,
                 solarHuhn: t.querySelectorAll('.ib-kopf .durchfahrt').length - 1,
                 ganz: hr.height >= tr.height * .95 } }""")
    print("infoboard winter", info)
    if not info["band"]: fehler.append("infoboard: keine Hühner im Band")
    if info["schnee"] < 3: fehler.append("infoboard: kein Schnee über die Tafel")
    if info["huhnHimmel"]: fehler.append("infoboard: Hühner ausserhalb des Bands")
    if info["fallBand"]: fehler.append("infoboard: Schnee doppelt im Band")
    if info["solarHuhn"]: fehler.append("infoboard: noch Hühner über der Solaranlage")
    if not info["ganz"]: fehler.append("infoboard: Schnee nicht über die ganze Tafel")
    if BILDER: pg.screenshot(path=os.path.join(BILDER, "huehner_infoboard_winter.png"))
    pg.context.close()
    br.close()

print("Fehler:", "keine" if not fehler else "\n" + "\n".join(fehler[:20]))
