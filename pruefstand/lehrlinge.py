# Seite Lehrlinge mit KI-Lernhilfe (1.148.0, Wunsch Patrick 22. Oktober 2026):
# Knopf im Menü, Hinweis „ersetzt deinen Ausbildner nicht“, Themen-Knöpfe,
# Frage geht mit Anmeldung an die Server-Funktion, Antwort kommt Stück für
# Stück und wird mit Code und Liste dargestellt, Gespräch bleibt nach
# Neuladen, „Neues Gespräch“ leert es, Fehler ohne Schlüssel verständlich.
# Externe sehen die Seite nicht (seiteSichtbar). Bilder am Computer und Handy.
import time, os, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("LEHR_BILDER", "")
ANTWORT = ("Für **M6** nimmst du ein Kernloch von **5 mm**.\n\n"
           "- Steigung 1 mm\n- Kernloch = Nenn-Ø − Steigung\n\n"
           "```\nG00 X5. Z1. (anfahren)\nG01 Z-10. F0.1 (bohren)\n```\n\n"
           "| Gewinde | Kernloch |\n|---|---|\n| M5 | 4,2 |\n| M6 | 5,0 |")
anfragen = []
modus = {"art": "gut"}

def ki(route):
    anfragen.append({"kopf": route.request.headers, "daten": json.loads(route.request.post_data or "{}")})
    if modus["art"] == "ohne":
        route.fulfill(status=503, content_type="application/json", body='{"fehler":"schluessel_fehlt"}')
    else:
        route.fulfill(status=200, content_type="text/plain; charset=utf-8", body=ANTWORT)

def seite(br, b, h, mobil=False, rolle=None):
    ctx = br.new_context(viewport={"width": b, "height": h}, timezone_id="Europe/Zurich",
                         has_touch=mobil, is_mobile=mobil)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**/functions/v1/lehrlinge-ki", ki)
    if rolle:
        pg.add_init_script("window.__rolle = %s" % json.dumps(rolle))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = seite(br, 1400, 900)
    pg.evaluate("location.hash='#/lehrlinge'"); pg.wait_for_timeout(700)
    if not pg.locator(".lehr").count(): fehler.append("Seite Lehrlinge fehlt")
    if "ersetzt deinen Ausbildner nicht" not in pg.inner_text(".lehr__hinweis"): fehler.append("Hinweis fehlt")
    if pg.locator(".lehr__thema").count() < 8: fehler.append("Themen fehlen")
    if BILDER: pg.screenshot(path=BILDER + "/lehrlinge-leer.png")
    # Frage eintippen und mit Enter senden
    pg.fill(".lehr__feld", "Wie gross ist das Kernloch für M6?")
    pg.press(".lehr__feld", "Enter")
    pg.wait_for_selector(".lehr__ki pre", timeout=5000)
    a = anfragen[-1]
    if a["kopf"].get("authorization") != "Bearer t-test": fehler.append("ohne Anmeldung gesendet: " + str(a["kopf"].get("authorization")))
    if a["daten"]["nachrichten"] != [{"rolle": "ich", "text": "Wie gross ist das Kernloch für M6?"}]:
        fehler.append("Nachrichten falsch: " + str(a["daten"]))
    txt = pg.inner_text(".lehr__ki")
    if "5 mm" not in txt or "G00" not in txt: fehler.append("Antwort fehlt: " + txt[:100])
    if pg.locator(".lehr__ki b").count() < 2 or pg.locator(".lehr__ki li").count() != 2: fehler.append("Fett/Liste nicht dargestellt")
    if pg.locator(".lehr-tabelle tr").count() != 3: fehler.append("Tabelle nicht dargestellt")
    if "```" in txt or "**" in txt: fehler.append("Markdown roh sichtbar")
    if BILDER: pg.screenshot(path=BILDER + "/lehrlinge-antwort.png")
    # Zweite Frage schickt den Verlauf mit
    pg.locator(".lehr__thema").count()
    pg.fill(".lehr__feld", "Und M8?"); pg.click("button:has-text('Fragen')")
    pg.wait_for_function("document.querySelectorAll('.lehr__ki pre').length === 2", timeout=5000)
    if len(anfragen[-1]["daten"]["nachrichten"]) != 3: fehler.append("Verlauf nicht mitgeschickt")
    # Nach Neuladen noch da
    pg.reload(); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    if pg.locator(".lehr__ich").count() != 2: fehler.append("Gespräch nach Neuladen weg: %d" % pg.locator(".lehr__ich").count())
    # Neues Gespräch
    pg.click("button:has-text('Neues Gespräch')"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle button:has-text('Neu beginnen')").click(); pg.wait_for_timeout(300)
    if pg.locator(".lehr__ich").count(): fehler.append("Neues Gespräch leert nicht")
    # Ohne Schlüssel auf dem Server: verständliche Meldung
    modus["art"] = "ohne"
    pg.locator(".lehr__thema").first.click()
    pg.wait_for_selector(".lehr__fehler", timeout=5000)
    if "Schlüssel fehlt" not in pg.inner_text(".lehr__fehler"): fehler.append("Fehlertext: " + pg.inner_text(".lehr__fehler"))
    modus["art"] = "gut"
    # Menü zeigt den Knopf
    if not pg.locator("[href='#/lehrlinge'], [data-seite='lehrlinge']").count() and "Lehrlinge" not in pg.inner_text("body"):
        fehler.append("Kein Knopf im Menü")
    # Handy
    ph = seite(br, 390, 844, mobil=True)
    ph.evaluate("location.hash='#/lehrlinge'"); ph.wait_for_timeout(700)
    ph.fill(".lehr__feld", "Wie gross ist das Kernloch für M6?"); ph.click("button:has-text('Fragen')")
    ph.wait_for_selector(".lehr__ki pre", timeout=5000)
    breite = ph.evaluate("document.documentElement.scrollWidth")
    if breite > 392: fehler.append("Handy: seitlich zu breit %d" % breite)
    if BILDER: ph.screenshot(path=BILDER + "/lehrlinge-handy.png", full_page=False)
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
