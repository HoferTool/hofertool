# Notizbücher (111.80.0): Buch-Knopf bei den Notizen, grosses Fenster mit
# Büchern und Seiten, zeichnen, Text mit Durchgestrichen, Bild und PDF
# einfügen, verschieben, Rückgängig auf der Seite und in der App,
# Hinweis ohne SQL, Handy-Ansicht. Dazu: Skizze im Pad hat Durchgestrichen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
def pdf_bauen(b, h, seiten):
    # Kleinstes gültiges PDF: je Seite ein Rahmen und ein Kreuz
    obj = []
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(seiten))
    obj.append("<< /Type /Catalog /Pages 2 0 R >>")
    obj.append(f"<< /Type /Pages /Kids [{kids}] /Count {seiten} >>")
    for i in range(seiten):
        inhalt = f"4 w 0 0 1 RG 10 10 {b - 20} {h - 20} re S 1 0 0 RG 10 10 m {b - 10} {h - 10} l S"
        obj.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {b} {h}] /Contents {4 + 2 * i} 0 R >>")
        obj.append(f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream")
    aus = "%PDF-1.4\n"; pos = []
    for n, o in enumerate(obj, 1):
        pos.append(len(aus)); aus += f"{n} 0 obj\n{o}\nendobj\n"
    xref = len(aus)
    aus += f"xref\n0 {len(obj) + 1}\n0000000000 65535 f \n" + "".join(f"{p:010d} 00000 n \n" for p in pos)
    aus += f"trailer\n<< /Size {len(obj) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return aus.encode("latin-1")

server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                 "daten.notizbuecher = []; daten.notizbuch_seiten = []; daten.pad_skizzen = [];\ndaten.todos = [{ id: 'td1', text: 'Spannzangen bestellen', is_done: false, due_date: null, created_at: '2026-10-07T07:00:00Z' }];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
BILDORDNER = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000020000000108020000007b40e8dd0000000f4944415478da63f8cfc0f01f0005fe02fe2d0d4a6e0000000049454e44ae426082")

def seite(pg):
    pg.wait_for_timeout(900)
    return pg.evaluate("() => TEST.daten.notizbuch_seiten.map(s => ({ id: s.id, titel: s.titel, inhalt: s.inhalt || [] }))")

def oeffnen(pg):
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)

def start(p, breite=1400, hoehe=900, touch=False, fehlend=False):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, has_touch=touch, device_scale_factor=1)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    if fehlend: pg.add_init_script("window.FEHLENDE_TABELLEN = ['notizbuecher', 'notizbuch_seiten'];")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    return br, pg, f

with sync_playwright() as p:
    # ---------- Ohne SQL: Hinweis, kein Absturz ----------
    br, pg, f = start(p, fehlend=True)
    oeffnen(pg)
    pruefe(pg.locator(".nb-fehlt:has-text('notizbuecher.sql')").count() == 1, "ohne SQL: Hinweis auf notizbuecher.sql")
    pruefe(not f, "ohne SQL: keine Fehler")
    br.close()

    # ---------- Normal ----------
    br, pg, f = start(p)
    k = pg.locator("#db-notizen .karte__kopf #notizbuch-knopf")
    pruefe(k.count() == 1, "Buch-Knopf bei den Notizen")
    pruefe(pg.locator("#db-notizen .notiz").count() > 0, "normale Notizen weiter da")
    if k.count():
        kb = k.bounding_box(); kk = pg.locator("#db-notizen .karte__kopf").bounding_box()
        pruefe(kb["x"] + kb["width"] > kk["x"] + kk["width"] - 4, "Knopf ganz rechts")
        pruefe(k.inner_text().strip() == "" and k.locator("svg").count() == 1, "nur ein Zeichen, kein Wort")
    nn = pg.locator("#db-notizen #notiz-neu")
    pruefe(nn.count() == 1 and nn.inner_text().strip() == "" and nn.locator("svg").count() == 1, "Neue Notiz nur als Plus")
    pg.locator("#db-notizen .karte").scroll_into_view_if_needed()
    pg.locator("#db-notizen .karte").screenshot(path=os.path.join(BILDORDNER, "notizbuch-knopf.png"))
    oeffnen(pg)
    d = pg.locator(".dialog.nb").bounding_box()
    pruefe(d and d["width"] > 1300 and d["height"] > 820, "grosses Fenster (%dx%d)" % (d["width"], d["height"]) if d else "Fenster fehlt")

    # Neues Buch, Farbe mit dem Farbwähler (Pipette) statt Liste
    pg.locator("[data-nb='buch-neu']").click(); pg.wait_for_timeout(300)
    pruefe(pg.locator(".dialog input[type=color]").count() == 1 and pg.locator(".dialog select").count() == 0, "Buchfarbe mit Farbwähler")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-buchfarbe.png"))
    pg.locator(".dialog input[type=color]").evaluate("e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#7b3fb3'); }")
    pg.locator(".dialog input").first.fill("Besprechungen")
    pg.locator(".dialog .knopf--haupt").last.click(); pg.wait_for_timeout(900)
    b = pg.evaluate("() => TEST.daten.notizbuecher")
    pruefe(len(b) == 1 and b[0]["name"] == "Besprechungen" and b[0]["farbe"] == "#7b3fb3", "Buch angelegt, Farbe gewählt")
    pruefe(len(seite(pg)) == 1, "neues Buch hat gleich eine Seite")
    pruefe(pg.locator("[data-nbblatt]").count() == 1, "Blatt zu sehen")

    # Titel
    pg.locator("[data-nbtitel]").fill("Montag 7. Oktober")
    pruefe(seite(pg)[0]["titel"] == "Montag 7. Oktober", "Titel gespeichert")
    pruefe(pg.locator("[data-nbseite]").first.inner_text() == "Montag 7. Oktober", "Seitenliste zeigt Titel")

    # Schreiben ist Start: Ziehen mit der Maus zeichnet nichts
    pruefe(pg.locator("[data-nbwerkzeug='text'].aktiv").count() == 1, "Start mit Schreiben")
    bl = pg.locator("[data-nbblatt]").bounding_box()
    x0, y0 = bl["x"] + 100, bl["y"] + 300
    pg.mouse.move(x0, y0); pg.mouse.down()
    for i in range(25): pg.mouse.move(x0 + i * 12, y0 + (i % 5) * 6)
    pg.mouse.up()
    pruefe(len([e for e in seite(pg)[0]["inhalt"] if not e.get("t")]) == 0, "ohne Stift kein Strich")

    # Stift: zeichnen mit Farbe
    pg.locator("[data-nbwerkzeug='stift']").click()
    pg.locator("[data-nbfarbe]").evaluate("e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#d32f2f'); e.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.mouse.move(x0, y0); pg.mouse.down()
    for i in range(25): pg.mouse.move(x0 + i * 12, y0 + (i % 5) * 6)
    pg.mouse.up()
    s = seite(pg)[0]["inhalt"]
    pruefe(len(s) == 1 and s[0]["f"] == "#d32f2f" and len(s[0]["p"]) > 20, "Strich mit Farbe gespeichert")
    farbig = pg.evaluate("""() => { const c = document.querySelector('.nb-leinwand'); const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i+1] < 90) n++; return n; }""")
    pruefe(farbig > 100, "Strich auf der Fläche zu sehen")

    # Knopf T: Hinweis, dann Feld dort, wo man klickt, direkt tippen
    pg.locator("[data-nb='text']").click(); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbtipp]").count() == 1, "Hinweis: dort hintippen")
    kx, ky = bl["x"] + 80, bl["y"] + 70
    pg.mouse.click(kx, ky); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-nbtipp]").count() == 0, "Hinweis weg nach dem Tipp")
    ed = pg.locator("[data-nbedit]")
    pruefe(ed.count() == 1, "Feld offen")
    if ed.count():
        eb = ed.bounding_box()
        pruefe(abs(eb["x"] - kx) < 12 and abs(eb["y"] + eb["height"] / 2 - ky) < 20, "Feld dort, wo geklickt (%d,%d)" % (eb["x"] - kx, eb["y"] - ky))
    st = pg.evaluate("() => [...document.querySelectorAll('[data-nbedit] [data-stil]')].map(e => e.dataset.stil)")
    pruefe(st == ["bold", "italic", "underline", "strikeThrough"], "Knöpfe B, I, U, S am Feld (%s)" % st)
    pg.keyboard.type("Alter Termin neuer Termin")
    pg.locator("[data-nbfeld]").evaluate("""e => { const t = e.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 12);
       const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator("[data-nbedit] [data-stil='strikeThrough']").click(); pg.wait_for_timeout(100)
    pg.locator("[data-nbschrift]").select_option("gross")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-schreiben.png"))
    # Daneben klicken schliesst nur, legt kein neues Feld an
    pg.mouse.click(bl["x"] + 500, bl["y"] + 600); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-nbedit]").count() == 0, "daneben klicken schliesst das Feld")
    s = seite(pg)[0]["inhalt"]
    t = [e for e in s if e.get("t") == 1]
    print("  Text:", t)
    pruefe(len(t) == 1 and "<s>Alter Termin</s>" in t[0]["h"] and t[0]["g"] == "gross", "Text durchgestrichen gespeichert")
    pruefe(pg.locator("[data-nbtext] s").count() == 1, "Durchgestrichen zu sehen")

    # Einfach irgendwo hinklicken und schreiben, Escape schliesst nur das Feld
    pg.mouse.click(bl["x"] + 100, bl["y"] + 450); pg.wait_for_timeout(300)
    pg.keyboard.type("Zweite Zeile")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".dialog.nb").count() == 1, "Escape lässt das Fenster offen")
    t = [e for e in seite(pg)[0]["inhalt"] if e.get("t") == 1]
    pruefe(len(t) == 2 and t[1]["h"] == "Zweite Zeile", "Klick aufs Blatt und tippen")

    # Feld antippen: bearbeiten; Breite und Lage mit den Griffen
    el = pg.locator("[data-nbtext='%d']" % [i for i, e in enumerate(seite(pg)[0]["inhalt"]) if e.get("t") == 1][0])
    el.click(); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-nbedit]").count() == 1, "Antippen öffnet das Feld")
    gb = pg.locator("[data-nbbreite]").bounding_box()
    pg.mouse.move(gb["x"] + 4, gb["y"] + 10); pg.mouse.down()
    for i in range(10): pg.mouse.move(gb["x"] + 4 - i * 25, gb["y"] + 10)
    pg.mouse.up()
    zb = pg.locator("[data-nbtextziehen]").bounding_box()
    pg.mouse.move(zb["x"] + 10, zb["y"] + 10); pg.mouse.down()
    for i in range(10): pg.mouse.move(zb["x"] + 10 + i * 12, zb["y"] + 10 + i * 5)
    pg.mouse.up()
    pg.locator("[data-nbtitel]").click(); pg.wait_for_timeout(200)
    t2 = [e for e in seite(pg)[0]["inhalt"] if e.get("t") == 1][0]
    print("  nach Griffen:", t2)
    pruefe(t2.get("b") and t2["b"] < 0.3, "Breite des Felds gezogen")
    pruefe(t2["x"] > t[0]["x"] + 0.05 and t2["y"] > t[0]["y"] + 0.02, "Feld verschoben")
    pruefe(pg.locator("[data-nbtext]").first.bounding_box()["height"] > 60, "schmaleres Feld bricht um")

    # Strg + Z im Fenster nimmt die Änderung zurück
    pg.locator(".nb-leiste").click(position={"x": 700, "y": 20})
    pg.keyboard.press("Control+z")
    t3 = [e for e in seite(pg)[0]["inhalt"] if e.get("t") == 1][0]
    pruefe(abs(t3["x"] - t[0]["x"]) < 1e-6 and not t3.get("b"), "Strg + Z nimmt Verschieben und Breite zurück")

    # Bild und PDF einfügen
    pdf = pdf_bauen(595, 842, 2)
    pg.locator("[data-nbdatei]").set_input_files([
        {"name": "foto.png", "mimeType": "image/png", "buffer": PNG},
        {"name": "zeichnung.pdf", "mimeType": "application/pdf", "buffer": pdf}])
    pg.wait_for_function("() => !document.querySelector('.nb-laeuft')", timeout=30000)
    s = seite(pg)[0]["inhalt"]
    bilder = [e for e in s if e.get("t") == "bild"]
    print("  Meldungen:", pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.textContent)"))
    print("  Bilder:", [(e.get("n"), e.get("s"), round(e["y"], 3)) for e in bilder])
    pruefe(len(bilder) == 3, "Bild und zwei PDF-Seiten eingefügt")
    pruefe(sum(1 for e in bilder if e.get("q")) == 2, "PDF-Seiten wissen ihr PDF")
    up = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload').map(x => [x.ablage, x.typ])")
    pruefe(len(up) == 4 and all(a == "notizbuecher" for a, _ in up), "4 Dateien in die Ablage notizbuecher (%s)" % up)
    pruefe(pg.locator("[data-nbbild]").count() == 3, "Bilder auf dem Blatt")
    hoehe = pg.locator("[data-nbblatt]").bounding_box()["height"]
    pruefe(hoehe > bl["width"] * 2.2, "Blatt wächst mit den PDF-Seiten")
    pg.locator(".nb-rolle").evaluate("e => e.scrollTop = 0"); pg.wait_for_timeout(300)

    # Bild wählen und entfernen, Rückgängig holt es
    pg.locator("[data-nbwerkzeug='text']").click()
    pg.locator("[data-nbbild]").first.click(); pg.wait_for_timeout(200)
    pruefe(pg.locator(".nb-bild--wahl [data-nbgriff]").count() == 1, "gewähltes Bild hat Griff")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-fenster.png"))
    pg.locator("[data-nbbildweg]").click()
    pruefe(len([e for e in seite(pg)[0]["inhalt"] if e.get("t") == "bild"]) == 2, "Bild entfernt")
    pg.locator("[data-nb='zurueck']").click()
    pruefe(len([e for e in seite(pg)[0]["inhalt"] if e.get("t") == "bild"]) == 3, "Rückgängig holt Bild zurück")

    # Radierer nimmt Strich weg
    pg.locator("[data-nbwerkzeug='radierer']").click()
    pg.mouse.move(x0 + 50, y0 - 20); pg.mouse.down()
    for i in range(15): pg.mouse.move(x0 + 50 + i * 2, y0 - 20 + i * 4)
    pg.mouse.up()
    pruefe(len([e for e in seite(pg)[0]["inhalt"] if not e.get("t")]) == 0, "Radierer nimmt Strich weg")

    # Spalten Bücher und Seiten breiter ziehen, bleibt beim nächsten Öffnen
    tb = pg.locator("[data-nbteiler='0']").bounding_box()
    w0 = pg.locator(".nb-buecher").bounding_box()["width"]
    pg.mouse.move(tb["x"] + 5, tb["y"] + 200); pg.mouse.down()
    for i in range(10): pg.mouse.move(tb["x"] + 5 + i * 9, tb["y"] + 200)
    pg.mouse.up(); pg.wait_for_timeout(200)
    w1 = pg.locator(".nb-buecher").bounding_box()["width"]
    pruefe(w1 > w0 + 60, "Spalte Bücher breiter gezogen (%d -> %d)" % (w0, w1))

    # Zweite Seite, dann löschen (einmal nachfragen)
    pg.locator("[data-nb='seite-neu']").click(); pg.wait_for_timeout(900)
    pruefe(len(seite(pg)) == 2 and pg.locator("[data-nbseite]").count() == 2, "zweite Seite")
    pg.locator("[data-nbseiteweg]").click(); pg.wait_for_timeout(300)
    pruefe(pg.locator(".dialog-huelle .dialog [data-ja]").count() == 1, "Löschen fragt einmal")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(900)
    pruefe(len(seite(pg)) == 1, "Seite gelöscht")
    pruefe(pg.locator(".dialog-huelle .dialog [data-ja]").count() == 0, "keine zweite Frage")

    # Schliessen, dann Rückgängig der App holt die Seite zurück
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe(pg.locator(".dialog.nb").count() == 0, "Escape schliesst")
    pg.locator("#rueck-knopf").click(); pg.wait_for_timeout(1200)
    pruefe(len(seite(pg)) == 2, "Rückgängig der App holt die gelöschte Seite zurück")

    # Wieder öffnen: alles noch da, zuletzt offenes Buch
    oeffnen(pg)
    pruefe(pg.locator("[data-nbbild]").count() == 3 and pg.locator("[data-nbtext]").count() == 2, "Inhalt nach Neuöffnen da")
    w2 = pg.locator(".nb-buecher").bounding_box()["width"]
    pruefe(abs(w2 - w1) < 2, "Spaltenbreite gemerkt (%d)" % w2)
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-wieder.png"))

    # Buch löschen und zurückholen
    pg.locator("[data-nbbuchweg]").click(); pg.wait_for_timeout(300)
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(900)
    pruefe(pg.evaluate("() => TEST.daten.notizbuecher.length") == 0 and len(seite(pg)) == 0, "Buch mit Seiten gelöscht")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.locator("#rueck-knopf").click(); pg.wait_for_timeout(1500)
    pruefe(pg.evaluate("() => TEST.daten.notizbuecher.length") == 1 and len(seite(pg)) == 2, "Rückgängig holt Buch und Seiten")
    br.close()
    fehler += f

    # ---------- Handy ----------
    br, pg, f = start(p, 390, 844, touch=True)
    pg.evaluate("""() => { TEST.daten.notizbuecher.push({ id: 'nb1', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, erstellt_am: '2026-10-07T08:00:00Z' });
      TEST.daten.notizbuch_seiten.push({ id: 'ns1', buch_id: 'nb1', titel: 'Spannzangen', reihenfolge: 1, erstellt_am: '2026-10-07T08:00:00Z',
        inhalt: [{ t: 1, h: '<b>Bestellen</b> <s>erledigt</s>', x: 0.05, y: 0.05, g: 'mittel', f: '#1d2430', p: [] },
                 { f: '#1f5fbf', d: 0.005, p: [0.1, 0.3, 0.4, 0.35, 0.7, 0.3] }] }); }""")
    oeffnen(pg)
    d = pg.locator(".dialog.nb").bounding_box()
    pruefe(d["width"] >= 389, "Handy: Fenster über die ganze Breite")
    sw = pg.evaluate("() => document.querySelector('.nb-haupt').scrollWidth <= document.querySelector('.nb-haupt').clientWidth + 1")
    pruefe(sw, "Handy: nichts ragt seitlich hinaus")
    pruefe(pg.locator("[data-nbtext] s").count() == 1, "Handy: Text zu sehen")
    pg.screenshot(path=os.path.join(BILDORDNER, "notizbuch-handy.png"))
    br.close()
    fehler += f

    # ---------- Pad-Skizze: Durchgestrichen auch dort, Info bleibt B I U ----------
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    pg.locator("[data-skizze='text']").tap(); pg.wait_for_timeout(400)
    st = pg.evaluate("() => [...document.querySelectorAll('.dialog [data-stil]')].map(e => e.dataset.stil)")
    pruefe("strikeThrough" in st, "Pad-Skizze: Knopf Durchgestrichen da")
    feld = pg.locator(".dialog [data-stilfeld]")
    feld.evaluate("e => e.focus()"); pg.keyboard.type("Alt")
    feld.evaluate("""e => { const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.locator(".dialog [data-stil='strikeThrough']").tap(); pg.wait_for_timeout(100)
    pg.locator(".dialog .knopf--haupt").first.click(); pg.wait_for_timeout(900)
    h = pg.evaluate("() => ((TEST.daten.pad_skizzen[0] || {}).striche || []).filter(s => s.t).map(s => s.h)")
    pruefe(h == ["<s>Alt</s>"], "Pad-Skizze: durchgestrichen gespeichert (%s)" % h)
    pruefe(pg.locator("[data-skizzetext] s").count() == 1, "Pad-Skizze: durchgestrichen zu sehen")
    g = pg.locator("[data-skizzebreite]").bounding_box()
    cdp = ctx.new_cdp_session(pg)
    pkt = [(g["x"] + g["width"] / 2 + i * 15, g["y"] + g["height"] / 2) for i in range(12)]
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": pkt[0][0], "y": pkt[0][1]}]})
    for x, y in pkt[1:]: cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(1000)
    sk = pg.evaluate("() => ((TEST.daten.pad_skizzen[0] || {}).striche || []).filter(s => s.t)")
    pruefe(sk and sk[0].get("b") and sk[0]["b"] > 0.1, "Pad-Skizze: Breite des Textfelds gezogen (%s)" % (sk[0].get("b") if sk else None))
    pruefe(pg.locator(".dialog").count() == 0, "Pad-Skizze: Griff öffnet kein Fenster")
    br.close()

print("Fehler:", fehler if fehler else "keine")
