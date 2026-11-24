# Handy-Menü (1.790.0): nur Hauptpunkte; ein Hauptpunkt mit Unterpunkten
# schiebt eine zweite Ebene herein, „‹ Zurück“ und Escape führen zurück.
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
    "TEST.neuesMenue = !!window.NEU_MENUE;\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []

def seite(br, neu, dunkel=False):
    pg = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    pg.on("pageerror", lambda e: fehler.append("Seitenfehler: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    if neu: pg.add_init_script("window.NEU_MENUE = true;")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2800)
    if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
    return pg

def offen(pg):
    return pg.locator(".handymenue__fenster").count() > 0

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for neu in (True, False):
        tag = "neu" if neu else "alt"
        pg = seite(br, neu)
        print(tag, "neues-menue:", pg.evaluate("document.documentElement.classList.contains('neues-menue')"))
        pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(900)
        punkte = pg.evaluate("[...document.querySelectorAll('[data-handy-punkt]')].map(a => a.dataset.handyPunkt)")
        unter = pg.evaluate("[...document.querySelectorAll('[data-handy-punkt].handymenue__punkt--unter')].map(a => a.dataset.handyPunkt)")
        print(tag, "Punkte:", punkte, "| mit Unter:", unter)
        haupt = pg.evaluate("window.__h = [...document.querySelectorAll('.nav > .nav__punkt, .nav > a.nav__punkt')].map(a => (a.getAttribute('href')||'').replace('#/','')); window.__h")
        if neu and ("material" in punkte or "bestellungen" in punkte): fehler.append(tag + ": Unterpunkte zwischen den Hauptpunkten")
        if not unter: fehler.append(tag + ": kein Hauptpunkt mit Unterpunkten")
        pg.screenshot(path=f"{BILD}/hm-unter-{tag}-haupt.png")
        ziel = "planwand" if neu and "planwand" in unter else unter[0]
        pg.locator(f"[data-handy-punkt='{ziel}']").click(); pg.wait_for_timeout(700)
        if not offen(pg): fehler.append(tag + ": Menü ging zu statt Unterpunkte")
        liste = pg.evaluate("[...document.querySelectorAll('[data-handy-unter]')].map(b => b.dataset.handyUnter)")
        print(tag, ziel, "→", liste, "| Adresse:", pg.evaluate("location.hash"))
        if not liste: fehler.append(tag + ": keine Unterpunkte")
        pg.screenshot(path=f"{BILD}/hm-unter-{tag}-ebene.png")
        # Zurück-Knopf
        pg.locator("[data-handy-zurueck]").click(); pg.wait_for_timeout(600)
        if pg.locator("[data-handy-ebene]").count() or not pg.locator("[data-handy-punkt]").count(): fehler.append(tag + ": Zurück geht nicht")
        # Escape: zuerst zurück, dann zu
        pg.locator(f"[data-handy-punkt='{ziel}']").click(); pg.wait_for_timeout(600)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
        if not offen(pg) or pg.locator("[data-handy-ebene]").count(): fehler.append(tag + ": Escape nicht zurück")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
        if offen(pg): fehler.append(tag + ": zweites Escape schliesst nicht")
        if pg.locator(".dialog-huelle").count(): fehler.append(tag + ": Escape hat Abmelden gefragt")
        # Unterpunkt wählen wechselt die Seite
        pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(700)
        pg.locator(f"[data-handy-punkt='{ziel}']").click(); pg.wait_for_timeout(600)
        wahl = liste[-1]
        pg.locator(f"[data-handy-unter='{wahl}']").click(); pg.wait_for_timeout(1500)
        print(tag, "nach Wahl", wahl, ":", pg.evaluate("location.hash"), "| offen:", offen(pg))
        if offen(pg): fehler.append(tag + ": Menü bleibt offen nach Wahl")
        if neu and ziel == "planwand" and wahl not in pg.evaluate("location.hash"): fehler.append(tag + ": Seite nicht gewechselt")
        # Ein Punkt ohne Unterpunkte wechselt direkt
        ohne = [x for x in punkte if x not in unter]
        if ohne:
            pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(700)
            pg.locator(f"[data-handy-punkt='{ohne[0]}']").click(); pg.wait_for_timeout(1200)
            if offen(pg) or ohne[0] not in pg.evaluate("location.hash"): fehler.append(tag + ": Punkt ohne Unter wechselt nicht direkt")
        pg.close()
    pg = seite(br, True, dunkel=True)
    pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(800)
    u = pg.evaluate("[...document.querySelectorAll('.handymenue__punkt--unter')].map(a => a.dataset.handyPunkt)")
    pg.locator(f"[data-handy-punkt='{u[-1]}']").click(); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{BILD}/hm-unter-dunkel.png")
    pg.close(); br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
