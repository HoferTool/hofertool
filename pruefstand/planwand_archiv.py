# Planwand-Archiv (1.22.0): eigener Ordner, jeden Tag eine HTML-Datei mit
# der ganzen Planwand, die sich ohne App im Browser öffnen lässt; alte
# Dateien werden aufgeräumt. Danach die Datei selbst: Balken, Vorschau,
# Suche, Blättern, keine Fehler, keine Adressen nach aussen.
import time, re, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

ORDNER = """
(() => {
  const dateien = new Map();
  window.ORDNER = dateien;
  const datei = (name) => ({ kind: 'file', name,
    getFile: async () => { const d = dateien.get(name); if (!d) throw new DOMException('weg', 'NotFoundError');
      return new File([d.daten], name, { lastModified: d.zeit }); },
    createWritable: async () => { const teile = [];
      return { write: async (x) => { teile.push(x instanceof Uint8Array ? x.slice() : x); },
        close: async () => { dateien.set(name, { daten: new Uint8Array(await new Blob(teile).arrayBuffer()), zeit: Date.now() }); } }; },
    move: async (neu) => { dateien.set(neu, dateien.get(name)); dateien.delete(name); },
  });
  const ordner = { kind: 'directory', name: 'Planwand-Archiv',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFileHandle: async (name, o) => { if (!dateien.has(name)) { if (!(o && o.create)) throw new DOMException('weg', 'NotFoundError');
      dateien.set(name, { daten: new Uint8Array(0), zeit: Date.now() }); } return datei(name); },
    removeEntry: async (name) => { dateien.delete(name); },
    entries: async function* () { for (const n of [...dateien.keys()]) yield [n, datei(n)]; },
  };
  window.showDirectoryPicker = async () => ordner;
  // Alte Dateien: vier von 2025, die neuesten drei bleiben trotzdem
  ['2025-01-01-1800', '2025-01-02-1800', '2025-01-03-1800', '2025-01-04-1800'].forEach((d, i) =>
    dateien.set('Hofer-Planwand-' + d + '.html', { daten: new Uint8Array([60]), zeit: Date.UTC(2025, 0, 1 + i) }));
  dateien.set('anderes.txt', { daten: new Uint8Array([1]), zeit: Date.now() });
})();
"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.add_init_script(ORDNER)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    start = time.time()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pg.evaluate("""() => TEST.daten.app_config.push({ schluessel: 'planwand_archiv', wert: JSON.stringify({ stunde: 0, behalten: 30 }) })""")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='backup']").click(); pg.wait_for_selector("#pa-ordner"); pg.wait_for_timeout(300)
    pruefe("Sicherung bleibt oben", pg.locator("#si").count() == 1)
    pruefe("Noch kein Ordner", "Noch kein Ordner gewählt" in pg.inner_text("#pa"))
    pg.select_option("#pa-behalten", "365"); pg.click("#pa-speichern"); pg.wait_for_timeout(400)
    pg.click("#pa-ordner"); pg.wait_for_timeout(600)
    k = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'planwand_archiv').wert)"); print("Einstellung:", k)
    pruefe("Dieses Gerät, eigener Ordner, Behalten gespeichert", k["geraet"]["ordner"] == "Planwand-Archiv" and k["behalten"] == 365 and k["stunde"] == 0)
    pruefe("Sicherung unberührt", not pg.evaluate("TEST.daten.app_config.some(x => x.schluessel === 'sicherung' && JSON.parse(x.wert).geraet)"))

    # Täglich von selbst: der Wächter schaut 25 Sekunden nach dem Start
    pg.wait_for_function("[...window.ORDNER.keys()].some(n => n.startsWith('Hofer-Planwand-') && !n.startsWith('Hofer-Planwand-2025'))",
                         timeout=max(1000, int((50 - (time.time() - start)) * 1000)))
    pg.wait_for_timeout(1500)
    st = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'planwand_archiv_status').wert)")
    print("Stand:", {k: v for k, v in st.items() if k != "liste"})
    pruefe("Datei gemeldet", st["letzte"]["datei"].endswith(".html") and st["letzte"]["auftraege"] > 0 and not st.get("fehler"))
    namen = pg.evaluate("[...window.ORDNER.keys()].sort()"); print("Ordner:", namen)
    pruefe("Alte aufgeräumt (über 365 Tage), neueste drei bleiben", "Hofer-Planwand-2025-01-01-1800.html" not in namen
           and "Hofer-Planwand-2025-01-02-1800.html" not in namen and "Hofer-Planwand-2025-01-04-1800.html" in namen and "anderes.txt" in namen)
    neu = [n for n in namen if n.startswith("Hofer-Planwand-") and not n.startswith("Hofer-Planwand-2025")][0]
    html = pg.evaluate("n => new TextDecoder().decode(window.ORDNER.get(n).daten)", neu)
    pruefe("Keine Adressen nach aussen", not re.search(r'(src|href)="https?:', html) and "supabase.co/storage" not in html)
    pruefe("Keine Zeichnungs-Adressen", "drawing_url" not in html and ".pdf" not in html)
    # Liste in den Einstellungen
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(300)
    pg.locator("[data-einst='backup']").click(); pg.wait_for_selector("#pa-liste"); pg.wait_for_timeout(300)
    pruefe("Liste mit Ansehen", pg.locator("#pa-liste tbody tr").count() == 3 and pg.locator("#pa-liste button").count() == 3)
    pruefe("Stand angezeigt", "Letzte Datei" in pg.inner_text("#pa-stand"))
    pg.locator("#pa").screenshot(path="planwand_archiv_einstellung.png")
    fehler += f

    # Die Datei selbst, ganz ohne App und ohne Netz
    open("planwand_archiv_datei.html", "w", encoding="utf-8").write(html)
    v = ctx.new_page(); vf = []
    v.on("pageerror", lambda e: vf.append(str(e)[:200]))
    netz = []
    v.on("request", lambda r: netz.append(r.url) if not r.url.startswith(("data:", "file:")) else None)
    v.goto("file://" + os.path.abspath("planwand_archiv_datei.html")); v.wait_for_timeout(500)
    pruefe("Nur Reiter Planwand", v.locator("header .reiter").count() == 1 and v.inner_text("header .reiter") == "Planwand")
    n0 = v.locator(".balken").count(); print("Balken:", n0)
    pruefe("Balken gezeichnet", n0 > 0)
    pruefe("Maschinen und Parks", v.locator(".parkzeile").count() >= 2)
    b = v.locator(".balken").first; b.hover(); v.wait_for_timeout(200)
    pruefe("Vorschau beim Darüberfahren", v.locator(".info").is_visible() and ("Stück" in v.inner_text(".info") or "Fertigungsmenge" in v.inner_text(".info")))
    v.screenshot(path="planwand_archiv.png")
    t0 = v.inner_text("#titel"); v.click("#vor"); v.wait_for_timeout(200)
    pruefe("Blättern", v.inner_text("#titel") != t0)
    v.click("#heute"); v.wait_for_timeout(200)
    pruefe("Stand-Tag zurück", v.inner_text("#titel") == t0)
    nr = v.evaluate("JSON.parse(document.getElementById('daten').textContent).parks.flatMap(p => p.maschinen.flatMap(m => m.balken))[0].nr")
    v.fill("#suche", nr); v.wait_for_timeout(500)
    pruefe("Suche findet und markiert", v.locator(".balken.fund").count() == 1 and "/" in v.inner_text("#treffer"))
    v.select_option("#wochen", "2"); v.wait_for_timeout(200)
    pruefe("Zeitraum 2 Wochen", v.locator(".zeile.kopf").nth(2).locator(".tag").count() == 10)
    v.set_viewport_size({"width": 390, "height": 800}); v.wait_for_timeout(300)
    pruefe("Handy: Seite ohne Überlauf", v.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pruefe("Kein Netz gebraucht", not netz)
    fehler += vf
    print("Fehler:", fehler if fehler else "keine")
    br.close()
