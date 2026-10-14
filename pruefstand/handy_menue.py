# Menü am Handy (1.57.0): statt der Leiste unten ein breiter Knopf, ein
# Tipp öffnet ein Fenster mit allen Symbolen in möglichst gleich vollen
# Zeilen. Externe behalten die Leiste. Am Computer bleibt alles links.
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
EXTERN = "daten.profiles[0].role = window.ALS_EXTERN ? 'extern' : daten.profiles[0].role;"
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", EXTERN + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []

def seite(br, breite=390, hoehe=844, dunkel=False, vorher=""):
    pg = br.new_context(viewport={"width": breite, "height": hoehe}, device_scale_factor=2,
                        is_mobile=breite < 780, has_touch=breite < 780).new_page()
    pg.on("pageerror", lambda e: fehler.append("Seitenfehler: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    if vorher: pg.add_init_script(vorher)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2600)
    if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
    return pg

def sichtbar(pg, s):
    return pg.evaluate("(s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).display !== 'none'; }", s)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # 1. Handy: Knopf statt Leiste
    pg = seite(br)
    print("Leiste:", sichtbar(pg, ".nav"), "| Knopf:", sichtbar(pg, ".handymenue__knopf"))
    if sichtbar(pg, ".nav"): fehler.append("Leiste am Handy noch sichtbar")
    if not sichtbar(pg, ".handymenue__knopf"): fehler.append("Menüknopf fehlt")
    b = pg.evaluate("document.querySelector('.handymenue__knopf').getBoundingClientRect().width")
    print("Knopfbreite:", b)
    if b < 340: fehler.append("Knopf zu schmal")
    print("Knopf zeigt:", pg.locator(".handymenue__knopftext").text_content())
    pg.wait_for_timeout(700); pg.screenshot(path=f"{BILD}/handymenue-zu.png")

    # 2. Öffnen: alle Punkte, 8 → 4 + 4
    pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(900)
    zeilen = pg.evaluate("[...document.querySelectorAll('.handymenue__zeile')].map(z => z.children.length)")
    namen = pg.evaluate("[...document.querySelectorAll('.handymenue__text')].map(t => t.textContent)")
    print("Zeilen:", zeilen, "| Punkte:", namen)
    if sum(zeilen) != len(pg.evaluate("[...document.querySelectorAll('.nav__punkt')]")): fehler.append("nicht alle Punkte im Menü")
    if max(zeilen) - min(zeilen) > 1: fehler.append("Zeilen ungleich")
    pg.screenshot(path=f"{BILD}/handymenue-offen.png")

    # 3. Escape schliesst nur das Menü
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    if sichtbar(pg, ".handymenue__fenster"): fehler.append("Escape schliesst nicht")
    if pg.locator(".dialog-huelle").count(): fehler.append("Escape hat zusätzlich etwas geöffnet")

    # 4. Tipp auf Planwand: Seite wechselt, Menü zu, Knopf zeigt Planwand
    pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(600)
    pg.locator(".handymenue__punkt", has_text="Planwand").click(); pg.wait_for_timeout(1500)
    print("Nach Tipp:", pg.evaluate("location.hash"), "| Knopf:", pg.locator(".handymenue__knopftext").text_content(),
          "| Fenster offen:", sichtbar(pg, ".handymenue__fenster"))
    if "planwand" not in pg.evaluate("location.hash"): fehler.append("Seite nicht gewechselt")
    if sichtbar(pg, ".handymenue__fenster"): fehler.append("Menü bleibt offen")
    if pg.locator(".handymenue__knopftext").text_content() != "Planwand": fehler.append("Knopf zeigt nicht die Seite")

    # 5. Daneben tippen schliesst
    pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(600)
    pg.mouse.click(195, 150); pg.wait_for_timeout(400)
    if sichtbar(pg, ".handymenue__fenster"): fehler.append("Tipp daneben schliesst nicht")
    pg.close()

    # 6. Dunkel
    pg = seite(br, dunkel=True)
    pg.wait_for_timeout(700); pg.screenshot(path=f"{BILD}/handymenue-dunkel-zu.png")
    pg.locator(".handymenue__knopf").click(); pg.wait_for_timeout(900)
    pg.screenshot(path=f"{BILD}/handymenue-dunkel-offen.png")
    pg.close()

    # 7. Externe: Leiste wie bisher, kein Knopf
    pg = seite(br, vorher="window.ALS_EXTERN = true;")
    print("Extern Leiste:", sichtbar(pg, ".nav"), "| Knopf:", sichtbar(pg, ".handymenue__knopf"))
    if not sichtbar(pg, ".nav") or sichtbar(pg, ".handymenue__knopf"): fehler.append("Externe sollen die Leiste behalten")
    pg.close()

    # 8. Computer: Leiste links, kein Knopf
    pg = seite(br, breite=1440, hoehe=900)
    print("PC Leiste:", sichtbar(pg, ".nav"), "| Knopf:", sichtbar(pg, ".handymenue__knopf"))
    if not sichtbar(pg, ".nav") or sichtbar(pg, ".handymenue__knopf"): fehler.append("am Computer falsch")
    pg.close()

    br.close()

# Die Verteilung selbst gleich hier nachrechnen wie in menueZeilen
def menue_zeilen(n):
    import math
    zeilen = math.ceil(n / 4); basis, mehr = divmod(n, zeilen)
    return [basis + (1 if i < mehr else 0) for i in range(zeilen)]
for n, z in {5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [4, 3, 3]}.items():
    if menue_zeilen(n) != z: fehler.append(f"Verteilung {n} falsch")
print("Fehler:", "; ".join(fehler) if fehler else "keine")
