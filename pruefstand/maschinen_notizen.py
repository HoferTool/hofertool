# Eigene Maschinen-Notizen (1.221.0, Wunsch Patrick 27. Oktober 2026):
# Unterlagen → „+ Notiz“ öffnet den Texteditor des Infoboards über
# mehrere Seiten, gespeichert als PDF und Text (inhalt); „Bearbeiten“
# öffnet den Text wieder im Editor und legt ein neues PDF ab.
import time, os, re
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("MU_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def seiten(pg, pfad):
    t = pg.evaluate("""async (p) => { const d = TEST.dateien[p]; if (!d) return '';
      const b = new Uint8Array(await d.arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return s; }""", pfad)
    with open(os.path.join(BILD, "notiz.pdf"), "wb") as f: f.write(t.encode("latin-1"))
    return len(re.findall(r"/Type\s*/Page[^s]", t)), t[:5]

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1280, "height": 860}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(700); pg.wait_for_selector("[data-mpark]")
    pg.locator("[data-mpark]:has-text('Kurz')").first.click(); pg.wait_for_selector("[data-mmaschine]")
    mid = pg.locator("[data-mmaschine]").first.get_attribute("data-mmaschine")
    pg.locator("[data-mmaschine]").first.click(); pg.wait_for_selector(".unterlagen--seite"); pg.wait_for_timeout(500)

    pg.click("#unterlagen-notiz"); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle").last.locator("input").first.fill("Kühlmittel nachfüllen")
    pg.locator(".dialog-huelle button:has-text('Weiter zum Text')").click()
    pg.wait_for_selector(".ib-te"); pg.wait_for_timeout(500)
    pruefe(pg.locator(".ib-te__platz--rollen").count() == 1, "Editor rollt über mehrere Seiten")
    pg.locator(".ib-te .ib-text__blatt").click()
    pg.keyboard.press("Control+b"); pg.keyboard.type("Wichtig"); pg.keyboard.press("Control+b")
    for i in range(70):
        pg.keyboard.press("Enter"); pg.keyboard.type("Zeile %d: Kühlmittel prüfen und nachfüllen" % (i + 1))
    pg.wait_for_timeout(300)
    hoch = pg.evaluate("() => document.querySelector('.ib-te .ib-text').offsetHeight")
    platz = pg.evaluate("() => document.querySelector('.ib-te__platz').clientHeight")
    pruefe(hoch > platz, "Blatt wächst mit dem Text (%d > %d)" % (hoch, platz))
    pruefe(pg.locator(".ib-te__warnung").count() == 0, "keine Warnung „länger als das Feld“")
    pg.screenshot(path=os.path.join(BILD, "notiz-editor.png"))
    pg.click("[data-ibte='fertig']")
    pg.wait_for_function("() => (TEST.daten.maschinen_unterlagen || []).length === 1", timeout=20000)
    pg.wait_for_timeout(600)
    u = pg.evaluate("() => TEST.daten.maschinen_unterlagen[0]")
    pruefe(u["art"] == "notizen" and u["machine_id"] == mid, "als Notiz der Maschine gespeichert")
    pruefe("<b>Wichtig</b>" in (u.get("inhalt") or "") and "Zeile 70" in u["inhalt"], "Text mitgespeichert")
    pruefe(u["pfad"].startswith("maschinen/" + mid + "/") and u["dateiname"].endswith(".pdf"), "PDF in maschinen/: %s" % u["pfad"])
    n, kopf = seiten(pg, u["pfad"])
    pruefe(kopf == "%PDF-" and n >= 2, "echtes PDF mit %d Seiten" % n)
    t = pg.locator(".unterlagen--seite").inner_text().lower()
    pruefe("eigene maschinen-notizen" in t and "kühlmittel nachfüllen" in t, "Gruppe in der Liste")
    pg.screenshot(path=os.path.join(BILD, "notiz-liste.png"))

    # Wieder öffnen und ändern
    pg.click(f"[data-notiz-bearbeiten='{u['id']}']"); pg.wait_for_selector(".ib-te"); pg.wait_for_timeout(500)
    inhalt = pg.locator(".ib-te .ib-text__blatt").inner_text()
    pruefe("Wichtig" in inhalt and "Zeile 70" in inhalt, "Editor zeigt den gespeicherten Text")
    pg.evaluate("""() => { const b = document.querySelector('.ib-te .ib-text__blatt'); b.focus();
      const r = document.createRange(); r.selectNodeContents(b); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.keyboard.press("Enter"); pg.keyboard.type("Neu dazu")
    pg.click("[data-ibte='fertig']")
    pg.wait_for_function("(alt) => TEST.daten.maschinen_unterlagen[0].pfad !== alt", arg=u["pfad"], timeout=20000)
    u2 = pg.evaluate("() => TEST.daten.maschinen_unterlagen[0]")
    pruefe("Neu dazu" in u2["inhalt"] and u2["url"] != u["url"], "neue Fassung mit neuem PDF")

    # Abbrechen ändert nichts
    pg.click(f"[data-notiz-bearbeiten='{u['id']}']"); pg.wait_for_selector(".ib-te"); pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.evaluate("() => TEST.daten.maschinen_unterlagen[0].pfad") == u2["pfad"], "Abbrechen lässt alles")

    # Rückgängig holt die vorige Fassung
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1200)
    pruefe(pg.evaluate("() => TEST.daten.maschinen_unterlagen[0].pfad") == u["pfad"], "Rückgängig: vorige Fassung")

    # Öffnen zeigt das PDF im Betrachter
    pg.locator(".unterlagen__oeffnen").first.click(); pg.wait_for_timeout(1000)
    pruefe(pg.locator(".betrachter-huelle").count() == 1, "öffnet im Betrachter")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # Im Pad Mode an der Maschine: Editor liegt über allem
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for elp in pg.query_selector_all("#pad [data-park]"):
        if "Kurz" in (elp.inner_text() or ""): elp.click(); break
    pg.wait_for_timeout(1200)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(2000)
    pg.click("[data-padunterlagen]"); pg.wait_for_selector("#unterlagen"); pg.wait_for_timeout(600)
    pruefe(pg.locator("#unterlagen [data-notiz-bearbeiten]").count() == 1, "Pad zeigt die Notiz mit Bearbeiten")
    pg.click("#unterlagen #unterlagen-notiz"); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle").last.locator("input").first.fill("Pad-Notiz")
    pg.locator(".dialog-huelle button:has-text('Weiter zum Text')").click()
    pg.wait_for_selector(".ib-te"); pg.wait_for_timeout(500)
    oben = pg.evaluate("() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest('.ib-te')")
    pruefe(oben, "Editor im Pad zuoberst")
    pg.screenshot(path=os.path.join(BILD, "notiz-pad.png"))
    pg.keyboard.type("Hallo vom Pad"); pg.click("[data-ibte='fertig']")
    pg.wait_for_function("() => TEST.daten.maschinen_unterlagen.length === 2", timeout=20000)
    pg.wait_for_timeout(600)
    pruefe("Pad-Notiz" in pg.locator("#unterlagen").inner_text(), "Pad-Notiz in der Liste")
    pruefe(not pf, "keine Seitenfehler %s" % pf)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
