# Notizbücher im Pad Mode (seit 1.63.0, Wunsch Patrick 15. Oktober 2026):
# Bücher bekommen beim Bearbeiten Parks; die Kachel statt Vorsprung zeigt
# im Pad nur die Bücher des Parks der Maschine, nur zum Lesen, sonst
# „Keine Notizen“.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.notizbuecher = [{ id: 'nbA', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, parks: [], erstellt_am: '2026-10-07T08:00:00Z' },"
  " { id: 'nbB', name: 'Büro', farbe: '#1f5fbf', reihenfolge: 2, parks: [], erstellt_am: '2026-10-07T08:00:00Z' }];"
  " daten.notizbuch_seiten = [{ id: 'sA', buch_id: 'nbA', titel: 'Spannmittel', reihenfolge: 1, inhalt: [] },"
  " { id: 'sB', buch_id: 'nbB', titel: 'Geheim', reihenfolge: 1, inhalt: [] }];\n"
  "if (typeof window !== \"undefined\") window.TEST = TEST;")
BILD = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def start(p):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 830}, device_scale_factor=1).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    return br, pg, f

def zumPad(pg, park):
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if park in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(2000)

with sync_playwright() as p:
    br, pg, f = start(p)
    # Zuweisen beim Buch selbst
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(800)
    pg.locator("[data-nbbuch='nbA']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-nbbuchbearb]").click(); pg.wait_for_timeout(500)
    haken = pg.locator(".dialog .feld--mehrfach input[type=checkbox]")
    pruefe(haken.count() == 2, "Dialog zeigt Häkchen je Park (%d)" % haken.count())
    pg.locator(".dialog .feld-haken:has-text('Langdreher') input").check()
    pg.screenshot(path=os.path.join(BILD, "notizbuch-parks-dialog.png"))
    pg.locator(".dialog [data-ja]").last.click(); pg.wait_for_timeout(900)
    b = pg.evaluate("() => TEST.daten.notizbuecher.find(b => b.id === 'nbA')")
    pruefe(b["parks"] == ["p-lang"] and b["name"] == "Werkstatt", "Park gespeichert: %s" % b["parks"])
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # Pad Langdreher: Kachel mit dem Buch
    zumPad(pg, "Lang")
    k = pg.locator("[data-padfeld='notizen']")
    pruefe(k.count() == 1, "Kachel Notizbücher da")
    pruefe(pg.locator(".pad-karte2--verzug").count() == 0, "Vorsprung weg")
    pruefe("Werkstatt" in k.inner_text() and "Büro" not in k.inner_text(), "Kachel zeigt nur Buch des Parks: " + k.inner_text().replace("\n", " | "))
    pg.screenshot(path=os.path.join(BILD, "pad-notizbuch-kachel.png"))
    k.click(); pg.wait_for_timeout(1200)
    pruefe(pg.locator(".dialog.nb").count() == 1, "Notizbücher öffnen")
    pruefe(pg.locator("[data-nbbuch]").count() == 1, "nur ein Buch in der Liste")
    pruefe(pg.locator("[data-nb='buch-neu'], [data-nb='seite-neu'], [data-nbbuchbearb], [data-nbbuchpw], [data-nbbuchweg], [data-nbseiteweg], [data-nbumschalten]").count() == 0,
           "keine Knöpfe zum Bearbeiten")
    pruefe(pg.locator(".nb-nurlesen").count() == 1, "Schild „Nur lesen“")
    t = pg.locator("[data-nbtitel]")
    pruefe(t.count() == 1 and t.get_attribute("readonly") is not None, "Titel nur lesen")
    pg.screenshot(path=os.path.join(BILD, "pad-notizbuch-fenster.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe(pg.locator(".dialog.nb").count() == 0, "Escape schliesst")
    br.close()

    # Kurzdreher: kein Buch zugewiesen
    br, pg, f2 = start(p)
    zumPad(pg, "Kurz")
    k = pg.locator("[data-padfeld='notizen']")
    pruefe(k.count() == 1 and "Keine Notizen" in k.inner_text(), "ohne Zuweisung: Keine Notizen")
    k.click(); pg.wait_for_timeout(600)
    pruefe(pg.locator(".dialog.nb").count() == 0, "ohne Zuweisung öffnet nichts")
    pg.screenshot(path=os.path.join(BILD, "pad-notizbuch-leer.png"))
    br.close()
    f += f2
print("Fehler:", "keine" if not fehler and not f else (fehler + f))
