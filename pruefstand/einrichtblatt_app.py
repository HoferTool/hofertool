# Einrichtblatt in der App (Test): Excel einlesen, Blatt je Typ nach
# Vorlage (Star, Index), Kopf direkt im Blatt ausfüllen (Stammdaten,
# Stückzeit, Blatt), Werkzeug nur wählen wie beim Bestellen, auch
# Spezialwerkzeuge, Bild am Artikel gemerkt, „Blatt ist gut“ löscht das
# Excel, Hinweis im Pad Mode beim Auftragsstart.
# Beispiel-Excel: node pruefstand/einrichtblatt_app_beispiel.mjs und
# node pruefstand/einrichtblatt_index_beispiel.mjs
import time, base64, os, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
HIER = os.path.dirname(os.path.abspath(__file__))
def xl(name):
    return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64.b64encode(
        open(os.path.join(HIER, name), "rb").read()).decode()
XL, XL_INDEX = xl("einrichtblatt-app-beispiel.xlsx"), xl("einrichtblatt-index-beispiel.xlsx")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""([XL, XI]) => {
      const D = TEST.daten;
      D.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: XL, stueckzeit_s: null });
      D.machine_types.find(t => t.id === 't2').name = 'Index';
      D.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't2', blatt_url: XI, stueckzeit_s: null });
      D.einrichtblatt_app = []; D.artikel_bild = []; D.eb_bilder = [];
      D.articles.find(a => a.id === 'a1').description = 'R0.40 CCMT';
      D.designations = ['Bohrer', 'Wendeplatte', 'Stechplatte'].map((name, i) => ({ id: 'd' + i, name }));
      D.articles.push({ id: 'a9', article_number: 'SPZ-77', name: 'Sonderhalter', unit: 'Stück', description: null,
        supplier_id: 's2', is_active: true, spezial: true });
    }""", [XL, XL_INDEX])
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_selector(".betrachter"); pg.wait_for_timeout(800)

    k = pg.locator("[data-dokextra='einrichtblatt']")
    pruefe("Knopf „Ins App-Blatt umwandeln“", k.count() == 1 and "umwandeln" in k.inner_text())
    k.click(); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(600)
    # Seit 1.178.0: das Blatt geht zum Bearbeiten auf, liest sich selbst aus
    # dem Excel vor und wird erst mit Speichern gespeichert
    pg.wait_for_selector("[data-eba-vorgelesen]:has-text('Aus dem Excel vorgelesen')")
    pruefe("Vorgelesen, noch nichts gespeichert", pg.evaluate("TEST.daten.einrichtblatt_app.length") == 0
           and pg.locator("[data-eba-speichern]").count() == 1)
    pruefe("Programm im Entwurf", "O1111" in pg.inner_text("[data-eba-seite]") or pg.locator("[data-eba-feld^='prg:']").count() > 0)
    pg.screenshot(path="einrichtblatt_app_vorgelesen.png")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    pruefe("Keine Stammdaten-Frage mehr", pg.locator(".dialog-huelle .dialog:has-text('Stimmen die Stammdaten')").count() == 0)
    b = pg.evaluate("TEST.daten.einrichtblatt_app[0]")
    print(json.dumps(b, ensure_ascii=False)[:500])
    pruefe("Blatt angelegt", b and b["hoco_nr"] == "10000-0301" and b["type_id"] == "t1")
    pruefe("Programme", b["programme"].get("1") == "O1111" and b["programme"].get("3") == "O3333")
    pruefe("Platz T100 eingelesen", b["plaetze"]["T100"].get("taetigkeit") == "Abstechen" and b["plaetze"]["T100"].get("standzeit") == 1000)
    t4 = b["plaetze"].get("T400", {})
    pruefe("Mass nach Leerzeile, Lieferant und Artikel-Nr. unten", t4.get("taetigkeit") == "Bohren" and t4.get("mass") == "Ø 3.50"
           and t4.get("hersteller") == "Muster AG" and t4.get("werkzeug") == "HYP-HP-3D Ø3.50")
    pruefe("Artikel aus Werkzeugtext erkannt", b["plaetze"]["T100"].get("article_id") == "a1")
    pruefe("Maschinen-Nr.", b["maschine_nr"] == "Nr.7")
    pruefe("Material auf einer Zeile", pg.evaluate("""() => { const e = document.querySelector('[data-eba-eine-zeile]');
      return !!e && e.getBoundingClientRect().height < 30 && e.scrollWidth <= e.parentElement.clientWidth; }"""))
    td = pg.evaluate("TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1')")
    pruefe("Stückzeit ergänzt", td.get("stueckzeit_s") == 33)
    s = pg.inner_text("[data-eba-seite]")
    pruefe("Star-Vorlage", pg.locator("[data-eba-vorlage='star']").count() == 1 and "Werkzeug- Protokoll-Star SR-32J" in s)
    pruefe("Star-Plätze T100–T600, T1100, kein T3100 beim SR-32",
           all(pg.locator(f"[data-platz='T{n}']").count() == 1 for n in (100, 600, 700, 1000, 1100, 2400))
           and pg.locator("[data-platz='T3100']").count() == 1)   # T3100 steht im Excel, kommt hinten dazu
    pruefe("Kopf mit Programm Nr., Artikel Bezeich, N1000", "Path 1" not in s and all(x in s for x in ("Programm Nr.:", "111, 333", "Artikel Bezeich", "N1000", "Deckel")))
    pruefe("Werkzeugtext aus dem Excel nur im Bearbeiten markiert", pg.locator("[data-platz='T200'] .eba-wz--frei").count() == 0)
    pg.screenshot(path="einrichtblatt_app_ansicht.png")
    # Immer ein A4 quer, alle Werkzeugfelder gleich hoch, nichts ragt
    # hinaus (Wunsch Patrick, 24. Oktober 2026)
    m = pg.evaluate("""() => { const s = document.querySelector('[data-eba-seite]').getBoundingClientRect();
      const h = [...document.querySelectorAll('.eba-platz')].map(e => Math.round(e.getBoundingClientRect().height));
      const voll = [...document.querySelectorAll('.eba-kopf, .eba-platz')].filter(e => e.scrollHeight > e.clientHeight + 1).length;
      return { b: Math.round(s.width), h: Math.round(s.height), hoehen: [...new Set(h)], voll }; }""")
    pruefe("Blatt A4 quer, eingepasst: " + str(m), abs(m["b"] / m["h"] - 1123 / 794) < 0.01 and m["b"] >= 1123)
    pruefe("Werkzeugfelder gleich hoch", max(m["hoehen"]) - min(m["hoehen"]) <= 1)
    pruefe("Nichts abgeschnitten", m["voll"] == 0)
    pruefe("Kein Autom.-Nr. und keine FA Nr. im Blatt", "Autom" not in s and "Fabrik" not in s)

    # Bearbeiten: Kopf direkt ausfüllen
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(300)
    pruefe("Werkzeugtext aus dem Excel markiert", pg.locator("[data-platz='T200'] .eba-wz--frei").count() == 1)
    pg.fill("[data-eba-feld='stamm:bezeichnung']", "Deckel neu")
    pruefe("Keine FA Nr. und keine Autom.-Nr. im Kopf", pg.locator("[data-eba-feld='kopf:fa_nr'], [data-eba-feld='blatt:maschine_nr']").count() == 0)
    pg.fill("[data-eba-feld='kopf:n1000']", "N1000 ja")
    pg.fill("[data-eba-feld='typ:stueckzeit_s']", "41")
    pg.fill("[data-eba-feld='prg:nr']", "236")
    pg.select_option("[data-eba-feld='stamm:waschgebinde']", "Typ 2 fein")
    pruefe("Material nur ein Feld", pg.locator("[data-eba-feld='stamm:material_groesse']").count() == 0)
    pg.fill("[data-eba-feld='stamm:material']", "1.4305 X8CrNiS18-9 rd Ø21h9 gezogen, Stange 3 m, Debrunner")

    # Platz T200: Werkzeug wählen statt schreiben
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pf = pg.locator("[data-platzfenster='T200']")
    pruefe("Kein freies Werkzeugfeld", pf.locator("input[data-pf='werkzeug'], input[data-pf='hersteller']").count() == 0)
    pruefe("Excel-Text mit Hinweis", "HSS Bohrer 4.2" in pf.inner_text() and "Noch nicht hinterlegt" in pf.inner_text())
    pf.locator("[data-pf='hd']").click()
    pf.locator("[data-pf='standzeit']").fill("2500")
    pf.locator("[data-pf-waehlen]").click(); pg.wait_for_selector("[data-werkzeugwahl]")
    w = pg.locator("[data-werkzeugwahl]")
    pruefe("Fenster wie beim Bestellen, ohne eigenen Knopf Spezialwerkzeuge (1.271.0)", w.locator("[data-pd-spezial]").count() == 0
           and pg.input_value("#pd-such") == "HSS Bohrer 4.2")
    pg.fill("#pd-such", "MTEC"); pg.wait_for_timeout(700)
    w.locator(".pd-zeile[data-w='a1']").click(); pg.wait_for_timeout(200)
    w.locator("#pd-ja").click(); pg.wait_for_timeout(500)
    pruefe("Artikel am Platz", "MTEC-452410" in pf.inner_text() and "Vischer & Bolli AG" in pf.inner_text())
    pf.locator("[data-pf-bild]").click()
    PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    pf.locator("[data-bib-hoch]").set_input_files({"name": "mein-werkzeug.png", "mimeType": "image/png", "buffer": PNG})
    pg.wait_for_timeout(1200)
    eb = pg.evaluate("TEST.daten.eb_bilder")
    pruefe("Eigenes Bild hochgeladen", len(eb) == 1 and pf.locator("[data-pf-bild] .eba-svg--foto").count() == 1)
    pg.screenshot(path="einrichtblatt_app_platz.png")
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(500)
    schl = "eigen:" + eb[0]["id"]
    pruefe("Bild am Artikel gemerkt", pg.evaluate("TEST.daten.artikel_bild.find(x => x.article_id === 'a1')?.bild") == schl)
    # Drei Zeilen: Lieferant, Artikel-Nr., Beschreibung (1.209.0)
    t200 = "[data-platz='T200'] "
    zeilen = [pg.inner_text(t200 + k).strip() for k in (".eba-her", ".eba-wz", ".eba-wz-bez")]
    pruefe("Blatt: Lieferant, Artikel-Nr., Beschreibung je eine Zeile", zeilen == ["Vischer & Bolli AG", "MTEC-452410", "R0.40 CCMT"])
    pruefe("Zeilen in dieser Reihenfolge", pg.evaluate("""[...document.querySelector("[data-platz='T200']").children].slice(-3).map(e => e.className).join(' ')""") == "eba-her eba-wz eba-wz-bez")
    pruefe("T100 bekommt das Artikelbild auch", pg.locator(f"[data-platz='T100'] [data-bild='{schl}']").count() == 1)

    # Sinnbilder der Norm in der Bibliothek (1.184.0)
    pg.click("[data-platz='T400']"); pg.wait_for_selector("[data-platzfenster='T400']")
    pf = pg.locator("[data-platzfenster='T400']")
    pf.locator("[data-pf-bild]").click(); pg.wait_for_timeout(200)
    pruefe("Sinnbilder in der Auswahl", pf.locator(".eba-pf-bib--norm").count() >= 16)
    pf.locator("[data-bib='gewinde']").click(); pg.wait_for_timeout(200)
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(400)
    pruefe("Sinnbild Gewinde am Platz", pg.locator("[data-platz='T400'] [data-bild='gewinde'] svg").count() == 1)

    # Platz T300: Spezialwerkzeug
    pg.click("[data-platz='T300']"); pg.wait_for_selector("[data-platzfenster='T300']")
    pf = pg.locator("[data-platzfenster='T300']")
    pf.locator("[data-pf-waehlen]").click(); pg.wait_for_selector("[data-werkzeugwahl]")
    w = pg.locator("[data-werkzeugwahl]")
    pg.fill("#pd-such", "SPZ"); pg.wait_for_timeout(700)
    pruefe("Spezialwerkzeug in derselben Suche", w.locator(".pd-zeile[data-w='a9']").count() == 1)
    w.locator(".pd-zeile[data-w='a9']").click(); w.locator("#pd-ja").click(); pg.wait_for_timeout(500)
    pruefe("Spezialwerkzeug am Platz", "Spezialwerkzeug" in pf.inner_text() and "SPZ-77" in pf.inner_text())
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pg.screenshot(path="einrichtblatt_app_bearbeiten.png")
    pruefe("Stern beim Lieferanten des Spezialwerkzeugs (1.272.0)", pg.locator("[data-platz='T300'] .eba-her [data-eba-stern]").count() == 1
           and pg.locator("[data-platz='T200'] [data-eba-stern]").count() == 0)

    # Eingelesene Werkzeuge ohne hinterlegten oder bestätigten Artikel
    # sind rot (1.185.0): T100 selbst zugeordnet, T400 nur Text
    pruefe("T100 rot, selbst zugeordnet", pg.locator("[data-platz='T100'].eba-platz--pruefen").count() == 1)
    pruefe("T400 rot, nur Text", pg.locator("[data-platz='T400'].eba-platz--pruefen").count() == 1)
    pruefe("T200 nicht rot, gewählt", pg.locator("[data-platz='T200'].eba-platz--pruefen").count() == 0)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf = pg.locator("[data-platzfenster='T100']")
    # Kein „Ja, stimmt“ mehr: „Auswählen“ mit dem Excel-Text in der Suche (1.188.0)
    pruefe("T100 ohne Ja-Knopf", pf.locator("[data-pf-bestaetigen]").count() == 1 and pf.locator("[data-pf-stimmt]").count() == 0)
    excel = pg.evaluate("() => TEST.daten.einrichtblatt_app.map(b => b.plaetze && b.plaetze.T100).find(Boolean)?.werkzeug || ''")
    pf.locator("[data-pf-waehlen]").click(); pg.wait_for_selector("[data-werkzeugwahl]"); pg.wait_for_timeout(700)
    w = pg.locator("[data-werkzeugwahl]")
    print("Suche T100:", pg.input_value("#pd-such"), "| Excel:", excel)
    pruefe("Suche mit Excel-Text gefüllt", pg.input_value("#pd-such") != "" and (not excel or pg.input_value("#pd-such") == excel))
    w.locator(".pd-zeile[data-w='a1']").click(); w.locator("#pd-ja").click(); pg.wait_for_timeout(500)
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pruefe("T100 nach Bestätigen nicht mehr rot", pg.locator("[data-platz='T100'].eba-platz--pruefen").count() == 0)
    pg.click("[data-platz='T400']"); pg.wait_for_selector("[data-platzfenster='T400']")
    pf = pg.locator("[data-platzfenster='T400']")
    # Kein eigenes „Werkzeug hinterlegen“ mehr: neu anlegen nur im Fenster von Bestellen (1.191.0)
    pruefe("Kein Knopf Werkzeug hinterlegen", pf.locator("[data-pf-hinterlegen-knopf]").count() == 0 and "hinterlegen" not in pf.locator("[data-pf-wzweg]").inner_text())
    pf.locator("[data-pf-waehlen]").click(); pg.wait_for_selector("[data-werkzeugwahl]"); pg.wait_for_timeout(700)
    such = pg.input_value("#pd-such")
    print("Suche T400:", such)
    pruefe("T400: Suche mit Excel-Text", such.startswith("HYP-HP-3D") or "HYP" in such)
    pruefe("T400: neu anlegen im Bestellfenster", pg.locator("[data-werkzeugwahl] [data-neuartikel]").count() == 1)
    pg.click("[data-werkzeugwahl] [data-neuartikel]"); pg.wait_for_timeout(400)
    pruefe("Neuer Artikel: Nummer aus dem Excel", "Neuen Artikel anlegen" in pg.inner_text("body")
           and such in pg.evaluate("() => [...document.querySelectorAll('.dialog-huelle input')].filter(e => e.id !== 'pd-such').map(e => e.value)"))
    pg.screenshot(path="einrichtblatt_app_hinterlegen.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Zurück im Platz", pg.locator("[data-werkzeugwahl]").count() == 0 and pf.count() == 1)
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    # Übrige rote Plätze leeren, damit EB OK geht; vorher sperrt EB OK
    rot = pg.evaluate("[...document.querySelectorAll('.eba-platz--pruefen')].map(e => e.dataset.platz)")
    print("noch rot:", rot)
    for nr in rot:
        pg.click(f"[data-platz='{nr}']"); pg.wait_for_selector(f"[data-platzfenster='{nr}']")
        q = pg.locator(f"[data-platzfenster='{nr}']")
        q.locator("[data-pf-wzweg]").click(); q.locator("[data-pf-ok]").click(); pg.wait_for_timeout(200)

    # Dunkler Modus: HD-Knopf und Auswahl Waschgebinde lesbar (1.191.0)
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    hdf = pg.evaluate("""() => { const b = document.querySelector('[data-platzfenster=T200] [data-pf=hd]'); const c = getComputedStyle(b);
      return [c.color, c.backgroundColor, c.webkitTextFillColor]; }""")
    print("HD dunkel:", hdf)
    pruefe("HD im dunklen Modus lesbar", hdf[0] != hdf[1] and "255, 255, 255" not in hdf[1])
    pg.screenshot(path="einrichtblatt_app_hd_dunkel.png")
    pg.locator("[data-platzfenster='T200'] [data-pf-zu]").click(); pg.wait_for_timeout(200)
    opt = pg.evaluate("""() => { const o = document.querySelector('select.eba-ein option'); if (!o) return null; const c = getComputedStyle(o);
      return [c.color, c.backgroundColor]; }""")
    print("Waschgebinde-Auswahl dunkel:", opt)
    pruefe("Waschgebinde-Auswahl lesbar", opt is None or (opt[0] == "rgb(0, 0, 0)" and opt[1] == "rgb(255, 255, 255)"))
    pg.evaluate("document.body.classList.remove('dunkel')")

    # Geo-Offset von Hand, Bild daneben kleiner
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf = pg.locator("[data-platzfenster='T100']")
    pf.locator("[data-pf='geo']").fill("X 0.12\nZ -0.05")
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pruefe("Geo-Offset im Feld", "X 0.12" in pg.inner_text("[data-platz='T100'] .eba-geo"))
    # Notiz ohne Bild: waagrecht und senkrecht mittig, ans Feld angepasst (1.256.0)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf.locator("[data-pf='ohneBild']").check()
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    gm = pg.evaluate("""() => { const g = document.querySelector('[data-platz="T100"] .eba-geo'), f = g.parentElement;
      const a = g.getBoundingClientRect(), b = f.getBoundingClientRect();
      return { dx: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2), dy: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
        gross: parseFloat(getComputedStyle(g).fontSize), passt: a.bottom <= b.bottom + 1 && a.top >= b.top - 1 && a.right <= b.right + 1,
        hoch: a.height / b.height }; }""")
    print("Notiz ohne Bild:", gm)
    pruefe("Notiz mittig", gm["dx"] < 2 and gm["dy"] < 2)
    pruefe("Notiz grösser und passt", gm["gross"] > 11 and gm["passt"])
    pg.locator("[data-platz='T100']").screenshot(path="einrichtblatt_app_notiz_mitte.png")
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf.locator("[data-pf='ohneBild']").uncheck()
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    hd = pg.evaluate("""() => { const t = document.querySelector('[data-platz="T200"] .eba-tk');
      const l = t.querySelector('.eba-tk-links').getBoundingClientRect(), r = t.querySelector('.eba-tk-rechts').getBoundingClientRect();
      return l.left < r.left; }""")
    pruefe("Standzeit links, HD rechts", hd)

    # Weitere Seite wie in Word, unten als Reiter
    pg.click("[data-eba-seite-neu]"); pg.wait_for_selector("[data-eba-zseite]")
    pg.fill("[data-eba-seite-name]", "Geo-Offset")
    pg.click("[data-eba-seite-quer]"); pg.wait_for_timeout(200)
    z = pg.evaluate("(() => { const r = document.querySelector('[data-eba-zseite]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
    pruefe("Seite quer: " + str(z), z == [1123, 794])
    pg.click("[data-eba-seite-inhalt]"); pg.wait_for_selector(".ib-te__seite .ib-text__blatt")
    pg.click(".ib-te__seite .ib-text__blatt"); pg.keyboard.type("Offset T100 X 0.12")
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(400)
    pruefe("Inhalt auf der Seite", "Offset T100" in pg.inner_text("[data-eba-zseite]"))
    pruefe("Reiter mit Namen", "Geo-Offset" in pg.inner_text("[data-eba-reiter]"))
    pg.screenshot(path="einrichtblatt_app_seite.png")
    pg.click("[data-eba-seite-nr='0']"); pg.wait_for_timeout(200)

    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app[0]")
    pruefe("Seite gespeichert", len(b.get("seiten") or []) == 1 and b["seiten"][0]["name"] == "Geo-Offset"
           and b["seiten"][0]["quer"] is True and "Offset T100" in b["seiten"][0]["html"])
    pg.locator("[data-eba-seite]").screenshot(path="einrichtblatt_app_geo.png")
    pruefe("Geo gespeichert", "X 0.12" in (b["plaetze"]["T100"].get("geo") or ""))
    t2 = b["plaetze"]["T200"]
    pruefe("T200 gespeichert", t2.get("hd") is True and t2.get("standzeit") == 2500 and t2.get("article_id") == "a1"
           and t2.get("werkzeug") == "MTEC-452410" and t2.get("hersteller") == "Vischer & Bolli AG")
    pruefe("T300 mit Spezialwerkzeug", b["plaetze"]["T300"].get("article_id") == "a9")
    pruefe("Kopf am Blatt", "fa_nr" not in b["kopf"] and b["kopf"].get("n1000") == "N1000 ja" and b["programme"].get("nr") == "236")
    pruefe("Langes Material auf einer Zeile", pg.evaluate("""() => { const e = document.querySelector('[data-eba-eine-zeile]');
      return !!e && e.textContent.includes('Debrunner') && e.getBoundingClientRect().height < 30 && e.scrollWidth <= e.clientWidth && !!e.style.fontSize; }"""))
    hp = pg.evaluate("TEST.daten.hoco_parts.find(x => x.hoco_nr === '10000-0301')")
    pruefe("Stammdaten", hp.get("bezeichnung") == "Deckel neu" and hp.get("waschgebinde") == "Typ 2 fein" and hp.get("material") == "1.4305 X8CrNiS18-9 rd Ø21h9 gezogen, Stange 3 m, Debrunner" and not hp.get("material_groesse"))
    td = pg.evaluate("TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1')")
    pruefe("Stückzeit je Typ", td.get("stueckzeit_s") == 41)
    s = pg.inner_text("[data-eba-seite]")
    pruefe("Blatt zeigt alles", all(x in s for x in ("Deckel neu", "236", "41 Sek./Stk.", "Ø21h9", "SPZ-77")))

    pruefe("Nach dem Speichern keine roten Werkzeuge", pg.locator("[data-eba-rot]").count() == 0
           and pg.evaluate("TEST.daten.einrichtblatt_app[0].plaetze.T100.ungeprueft") is None)
    # Blatt ist gut: Excel weg
    pruefe("Knopf heisst EB OK", pg.inner_text("[data-eba-gut]").strip() == "EB OK")
    pg.click("[data-eba-gut]"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    td = pg.evaluate("TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1')")
    b = pg.evaluate("TEST.daten.einrichtblatt_app[0]")
    pruefe("Excel aus der Datenbank", not td.get("blatt_url") and b.get("gut_am"))
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_timeout(1000)
    pruefe("Wieder öffnen: gleich das App-Blatt", pg.locator("[data-eba-seite]").count() == 1)
    # Platz antippen bestellt das Werkzeug (1.271.0)
    pg.click("[data-platz='T200'].eba-platz--bestellbar"); pg.wait_for_selector("#pd-gewaehlt")
    pruefe("Platz antippen: Bestellposition mit dem Werkzeug", "MTEC-452410" in pg.inner_text("#pd-gewaehlt")
           and "T200" in pg.input_value("#pd-notiz") and "10000-0301" in pg.input_value("#pd-notiz"))
    vorher = pg.evaluate("TEST.daten.order_items.length")
    pg.fill("#pd-menge", "3"); pg.click("#pd-ja"); pg.wait_for_timeout(800)
    neu = pg.evaluate("TEST.daten.order_items")[vorher:]
    pruefe("Unter Offen bestellt", len(neu) == 1 and neu[0]["article_id"] == "a1" and neu[0]["quantity"] == 3 and neu[0].get("status", "offen") == "offen")
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)

    # Index: drei Revolver mit T1 bis T10
    pg.locator("[data-blatt-typ='t2']").click(); pg.wait_for_selector(".betrachter"); pg.wait_for_timeout(800)
    pg.locator("[data-dokextra='einrichtblatt']").click(); pg.wait_for_selector("[data-eba-vorlage='index']")
    pg.wait_for_selector("[data-eba-vorgelesen]:has-text('Aus dem Excel vorgelesen')")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    bi = pg.evaluate("TEST.daten.einrichtblatt_app.find(x => x.type_id === 't2')")
    print(json.dumps(bi, ensure_ascii=False)[:500])
    pl = bi["plaetze"]
    pruefe("Index: Plätze je Revolver", pl.get("R1-T1", {}).get("taetigkeit") == "R1 Tät 1" and pl.get("R2-T7", {}).get("taetigkeit") == "R2 Tät 7"
           and pl.get("R3-T10", {}).get("taetigkeit") == "R3 Tät 10" and pl.get("R2-T3", {}).get("werkzeug") == "Werkzeug R2"
           and len([k for k in pl if k.startswith("R")]) == 30)
    pruefe("Index: Kopf", "fa_nr" not in bi["kopf"] and bi["kopf"].get("festanschlag") == "55.5"
           and bi["kopf"].get("anschlag_von") == "Revolver 2" and bi["maschine_nr"] == "Nr.3")
    s = pg.inner_text("[data-eba-seite]")
    pruefe("Index: ohne Programm Nr., mit Festanschlag und Legende", "Path 1" not in s and "Programm Nr" not in s and "Festanschlag" in s
           and "Revolver 3" in s and pg.locator("[data-eba-seite] .eba-platz").count() == 30)
    farbe = pg.evaluate("getComputedStyle(document.querySelector('.eba-tk')).color")
    pruefe("Index: Platznummern schwarz", farbe == "rgb(0, 0, 0)")
    pg.screenshot(path="einrichtblatt_app_index.png")
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Pad Mode: neuer Auftrag beginnt, Hinweis zum Einrichtblatt
    pg.evaluate("""() => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1'); m.type_id = 't1';
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      D.hoco_type_data.push({ hoco_nr: '10000-0302', type_id: 't1', blatt_url: 'data:,excel' });
      D.jobs.push({ id: 'tH', job_number: '10000-0302', machine_id: 'm-k1', plan_status: 'geplant', ended_at: null,
        planned_days: 3, target_quantity: 1000, planned_from: new Date().toISOString().slice(0, 10) });
    }""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count():
        pg.locator("#pad [data-padtyp='t1']").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad [data-maschine='m-k1']").first.click()
    pg.wait_for_selector("#pad [data-padstatus]"); pg.wait_for_timeout(500)
    # Ohne laufenden Auftrag heisst der Knopf „Auftrag starten“
    pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='ruesten'], .dialog-huelle [data-ja]")
    if pg.locator(".dialog-huelle [data-w='ruesten']").count(): pg.click(".dialog-huelle [data-w='ruesten']"); ziel = "ruesten"
    else: pg.locator(".dialog-huelle [data-ja]").last.click(); ziel = "laeuft"
    pg.wait_for_timeout(1200)
    h = pg.locator("[data-eba-padhinweis]")
    pruefe("Hinweis im Pad", h.count() == 1 and "am PC" in h.inner_text() and "EB OK" in h.inner_text()
           and h.locator("[data-eba-padbearbeiten]").count() == 1)
    pg.screenshot(path="einrichtblatt_app_pad.png")
    if h.count(): h.locator("[data-ja]").click(); pg.wait_for_timeout(300)
    pruefe("Auftrag begonnen", pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tH').plan_status") == ziel)

    # Im Pad: App-Blatt erst nach „Blatt ist gut“, und nur zum Lesen
    pg.evaluate("""() => TEST.daten.einrichtblatt_app.push({ id: 'eb2', hoco_nr: '10000-0302', type_id: 't1', programme: {},
      plaetze: { T100: { taetigkeit: 'Pad-Test' }, T200: { taetigkeit: 'Notiz', geo: 'Achtung\\nlinks', ohneBild: true } }, kopf: {}, seiten: [{ name: 'Notizen', quer: false, html: '<p>Hallo Pad</p>' }],
      gut_am: null })""")
    pg.click("#pad [data-padreiter='blatt']"); pg.wait_for_timeout(1200)
    pruefe("Pad: nicht bestätigt → Excel, kein App-Blatt", pg.locator("[data-eba-seite]").count() == 0
           and pg.locator("[data-dokextra='einrichtblatt']").count() == 1)
    # Seit 1.236.0: im Pad bearbeiten (Knopf beim Excel führt ins App-Blatt)
    pg.click("[data-dokextra='einrichtblatt']"); pg.wait_for_selector("[data-eba-speichern]"); pg.wait_for_timeout(600)
    pruefe("Pad: noch nicht bestätigt → bearbeiten", pg.locator("[data-eba-speichern]").count() == 1)
    pg.click("[data-eba-abbrechen]"); pg.wait_for_timeout(300)
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)
    pg.evaluate("TEST.daten.einrichtblatt_app.find(x => x.id === 'eb2').gut_am = new Date().toISOString()")
    pg.click("#pad [data-padreiter='blatt']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Pad: bestätigt → App-Blatt", "Pad-Test" in pg.inner_text("[data-eba-seite]"))
    gm = pg.evaluate("""() => { const g = document.querySelector('[data-platz="T200"] .eba-geo'), f = g.parentElement;
      const a = g.getBoundingClientRect(), b = f.getBoundingClientRect();
      return { dx: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2), dy: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
        passt: a.bottom <= b.bottom + 1 && a.top >= b.top - 1, gross: parseFloat(getComputedStyle(g).fontSize) }; }""")
    print("Pad Notiz:", gm)
    pruefe("Pad: Notiz mittig und angepasst", gm["dx"] < 2 and gm["dy"] < 2 and gm["passt"] and gm["gross"] > 11)
    pg.locator("[data-eba-seite]").screenshot(path="einrichtblatt_app_pad_notiz.png")
    pg.click("[data-eba-seite-nr='1']"); pg.wait_for_timeout(300)
    pruefe("Pad: weitere Seite lesbar", "Hallo Pad" in pg.inner_text("[data-eba-zseite]")
           and pg.locator(".eba-zseite--bearbeiten").count() == 0)
    pg.click("[data-eba-seite-nr='0']"); pg.wait_for_timeout(300)
    pruefe("Pad: Bearbeiten da", pg.locator("[data-eba-bearbeiten]").count() == 1)
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_selector("[data-eba-speichern]"); pg.wait_for_timeout(500)
    pg.screenshot(path="einrichtblatt_app_pad_bearbeiten.png")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(800)
    pruefe("Pad: gespeichert", pg.locator("[data-eba-speichern]").count() == 0 and pg.locator("[data-eba-bearbeiten]").count() == 1)
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(300)

    br.close()
print("Fehler:", fehler[:4] if fehler else "keine")
