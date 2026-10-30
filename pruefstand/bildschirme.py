# Bildschirme (1.315.0, Wunsch Patrick 30. Oktober 2026: „Alle Bildschirme
# zu einem Reiter machen“): ein Punkt im Menü, darunter Infoboard, Empfang
# und Pausenraum; ihre Adressen (#/infoboard …) gehen weiter direkt auf.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

MIT = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { empfangSehen: true };\n"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, handy in [(1400, 900, False), (390, 844, True)]:
        pg = br.new_page(viewport={"width": breite, "height": hoehe})
        pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        w = "Handy" if handy else "PC"
        nav = pg.evaluate("[...document.querySelectorAll('.nav__punkt')].map(a => a.dataset.nav)")
        pruefe("bildschirme" in nav and not any(x in nav for x in ("infoboard", "empfang", "pausenraum")),
               w + ": ein Punkt Bildschirme statt drei: %s" % nav[-4:])
        if handy:
            pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(900)
            namen = pg.evaluate("[...document.querySelectorAll('.handymenue__text')].map(t => t.textContent)")
            pruefe("Anzeigen" in namen and "Infoboard" not in namen, "Handy-Menü: Bildschirme: %s" % namen[-3:])
            pg.locator(".handymenue__punkt", has_text="Anzeigen").click(); pg.wait_for_timeout(1200)
        else:
            pg.click("[data-nav='bildschirme']"); pg.wait_for_timeout(1200)
        pg.wait_for_selector("#bs-wahl")
        kacheln = pg.evaluate("[...document.querySelectorAll('[data-bs]')].map(a => a.dataset.bs)")
        pruefe(kacheln == ["infoboard", "empfang", "pausenraum"], w + ": Wahl mit allen drei: %s" % kacheln)
        pg.screenshot(path=BILD + "/bildschirme-%s.png" % w.lower())
        if not handy:
            unter = pg.evaluate("[...document.querySelectorAll('[data-unter]')].map(b => b.dataset.unter)")
            pruefe(unter == ["bildschirme/infoboard", "bildschirme/empfang", "bildschirme/pausenraum"], "Unterpunkte in der Leiste: %s" % unter)
            pg.click("[data-unter='bildschirme/empfang']"); pg.wait_for_timeout(1500)
            pruefe(pg.evaluate("location.hash") == "#/empfang", "Unterpunkt öffnet den Empfang: %s" % pg.evaluate("location.hash"))
            pruefe(pg.locator(".nav__punkt.aktiv").get_attribute("data-nav") == "bildschirme", "Bildschirme bleibt markiert")
            pruefe(pg.locator(".nav__unterpunkt.aktiv[data-unter='bildschirme/empfang']").count() == 1, "Empfang als Unterpunkt markiert")
            pg.screenshot(path=BILD + "/bildschirme-empfang.png")
        else:
            pg.click("[data-bs='pausenraum']"); pg.wait_for_timeout(1500)
            pruefe(pg.evaluate("location.hash") == "#/pausenraum", "Kachel öffnet den Pausenraum")
        # Die alten Adressen gehen weiter direkt auf
        for pfad in ("infoboard", "pausenraum"):
            pg.evaluate("location.hash = '#/%s'" % pfad); pg.wait_for_timeout(1200)
            pruefe(pg.evaluate("location.hash") == "#/" + pfad and pg.locator(".ib-gestalten").count() > 0, w + ": #/%s geht weiter auf" % pfad)
        pruefe(not pf, w + ": keine Skriptfehler: %s" % pf[:2])
        pg.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
