# Zeichnung drehen (seit 1.252.0, Wunsch Patrick 29. Oktober 2026):
# „Drehen ↻“ im Betrachter dreht die PDF selbst um 90°, legt sie neu in
# die Ablage und trägt die neue Adresse bei HOCO Nr., Aufträgen und
# Dokumenten ein, mit Vermerk zeichnung_drehung. Rückgängig holt alles
# zurück. Eine neue Fassung derselben Ordner-Datei dreht die App von
# selbst wieder gleich (drehungNachholen).
import time, base64
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
PDF = base64.b64decode("JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCA5Nwo+PgpzdHJlYW0KeJwr5HIK4TJQAMGidC59j9ScstSSzOREXXMDSwsTCwNzC0sFEwOFkDQuIxOFEB8uQ7BSQwVTIAHEIblcNqaOJqYmlibGJhYmrqamJq4m5nYKIVlcIVpcriFcgVwAYVMVqgplbmRzdHJlYW0KZW5kb2JqCgo3IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9UeXBlIC9PYmpTdG0KL04gNQovRmlyc3QgMjYKL0xlbmd0aCAzNjEKPj4Kc3RyZWFtCnic1VJRS8MwEH7Pr7hHfZAkbde0Mgbb2irIUDZBUXzI2jAqI5E2lfnvvWs7xx7EZylHct99Sb7rfRIEBBBFEIJKIIJJGMAElJQwnTL++PVhgD/onWkZv6urFl6RI2ANb4wvXWc9SDabsRN3qb3eux0bDoEk8pHx0LiqK00D0yIvCiGUECKOMGIhggzXJUaKEWCOtSDBPYaKxkBMhUKEc6wVQ8RqOEP1njsZz+e4IjcmTjZwo2TIf96lt/LhjuAvPemM8ZWrMu0NXGTXgQhiiagUIomil0v8HY3R3v3f5nr9tbO/dng2ZxovDbkx5IF+ynxtWtc1JY6deIXDCm1uzf7T+LrUV0qkCepUSYoeG43Bn++376bsqZTmB3+z8aRhAAhbmarWC3dA9wn8sAPA7smDc2udJ1f2frQe1VAWjx49k0yCGN90W9+nBErGF7o1vdSTThRhS1fVdgf8qbZz29ZHgG78Bho2xdwKZW5kc3RyZWFtCmVuZG9iagoKOCAwIG9iago8PAovU2l6ZSA5Ci9Sb290IDIgMCBSCi9JbmZvIDMgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9UeXBlIC9YUmVmCi9MZW5ndGggNDAKL1cgWyAxIDIgMiBdCi9JbmRleCBbIDAgOSBdCj4+CnN0cmVhbQp4nBXEsREAIAwDsbfDHS1jsxLTJViFgG6zISk5VVrigHg/XxhhAgOMCmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgo2NDgKJSVFT0Y=")
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    ADR = f"http://127.0.0.1:{PORT}/zeichnung-test/alt.pdf"
    NEU = f"http://127.0.0.1:{PORT}/zeichnung-test/neue-fassung.pdf"
    pg.route("**/zeichnung-test/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("""(ADR) => { const mit = new Map(TEST.daten.planwand.filter(j => j.job_number).map(j => [j.id, j]));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => mit.has(b.dataset.auftrag) && b.getBoundingClientRect().width > 40);
      if (!b) return null; const j = mit.get(b.dataset.auftrag);
      j.drawing_url = ADR; const jj = (TEST.daten.jobs || []).find(x => x.id === j.id); if (jj) jj.drawing_url = ADR;
      TEST.daten.hoco_parts = TEST.daten.hoco_parts.filter(t => t.hoco_nr !== j.job_number);
      TEST.daten.hoco_parts.push({ hoco_nr: j.job_number, zeichnung_url: ADR, zeichnung_quelle: { pfad: '\\\\srv\\z\\1.pdf', url: ADR } });
      TEST.daten.dokumente = TEST.daten.dokumente || [];
      TEST.daten.dokumente.push({ id: 'dok-z-1', art: 'zeichnung', hoco_nr: j.job_number, titel: j.job_number, dateiname: 'x.pdf', datei_url: ADR, erstellt_am: new Date().toISOString() });
      return b.dataset.auftrag; }""", ADR)
    if not jid: fehler.append("kein Balken mit HOCO Nr.")
    else:
        nr = pg.evaluate(f"() => TEST.daten.planwand.find(j => j.id === '{jid}').job_number")
        pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_timeout(1200)
        pg.locator(".auf-vorschau__gross").first.click()
        pg.wait_for_selector(".betrachter canvas", timeout=8000); pg.wait_for_timeout(800)
        knopf = pg.locator("[data-drehen]")
        pruefe("Knopf „Drehen“ da", knopf.count() == 1)
        breit = pg.evaluate("() => { const c = document.querySelector('.betrachter canvas'); return c.width > c.height; }")
        pruefe("vorher quer", breit)
        knopf.click(); pg.wait_for_timeout(700)
        hoch = pg.evaluate("() => { const c = document.querySelector('.betrachter canvas'); return c.height > c.width; }")
        pruefe("sofort hochkant", hoch)
        pg.wait_for_timeout(2500)
        t = pg.evaluate(f"() => TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}')")
        neu = t["zeichnung_url"]
        pruefe("HOCO Nr. mit neuer Adresse", neu and neu != ADR)
        d = t.get("zeichnung_drehung") or {}
        pruefe("Vermerk Drehung 90 von alter Adresse", d.get("grad") == 90 and d.get("von") == ADR and d.get("url") == neu and d.get("pfad"))
        pruefe("Pfad zeigt auf neue Adresse", (t.get("zeichnung_quelle") or {}).get("url") == neu)
        a = pg.evaluate(f"() => (TEST.daten.jobs || TEST.daten.planwand).filter(j => j.job_number === '{nr}' && j.drawing_url === {neu!r}).length")
        pruefe("Auftrag mit neuer Adresse", a >= 1)
        pruefe("Dokument mit neuer Adresse", pg.evaluate(f"() => TEST.daten.dokumente.find(x => x.id === 'dok-z-1').datei_url") == neu)
        rot = pg.evaluate("""async () => { const k = Object.keys(TEST.dateien || {}).filter(k => k.endsWith('-gedreht.pdf'));
          return k.length ? (await TEST.dateien[k[k.length - 1]].text()).match(/[/]Rotate (\\d+)/)?.[1] : null; }""")
        pruefe("Datei selbst gedreht (/Rotate 90)", rot == "90")
        # Zweimal weiter: zählt zusammen
        knopf.click(); pg.wait_for_timeout(200); knopf.click(); pg.wait_for_timeout(3000)
        d = pg.evaluate(f"() => TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}').zeichnung_drehung")
        pruefe("zweimal weiter = 270, von bleibt", d and d.get("grad") == 270 and d.get("von") == ADR)
        uploads = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload' && /gedreht/.test(x.pfad)).length")
        pruefe("zwei Tipps kurz nacheinander = ein Speichern", uploads == 2)
        # Neue Fassung derselben Ordner-Datei: App dreht von selbst wieder
        pg.evaluate(f"""() => {{ const t = TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}');
          t.zeichnung_url = {NEU!r}; t.zeichnung_quelle = Object.assign({{}}, t.zeichnung_quelle, {{ url: {NEU!r} }}); }}""")
        n = pg.evaluate("() => TEST.drehungNachholen()")
        t = pg.evaluate(f"() => TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}')")
        pruefe("neue Fassung wieder gedreht", n == 1 and t["zeichnung_url"] != NEU and t["zeichnung_drehung"]["von"] == NEU and t["zeichnung_drehung"]["grad"] == 270)
        # Von Hand ersetzt (Quelle stimmt nicht): bleibt, wie sie ist
        pg.evaluate(f"() => {{ TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}').zeichnung_url = 'http://x/hand.pdf'; }}")
        pruefe("von Hand ersetzte nicht gedreht", pg.evaluate("() => TEST.drehungNachholen()") == 0)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
