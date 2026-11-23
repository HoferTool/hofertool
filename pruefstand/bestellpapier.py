# Briefkopf der Bestellung (1.739.0): Logo links, Adresse in der Mitte,
# ISO-9001-Siegel rechts, keine Zeile mit Telefon, Mail, Fax, Homepage
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
HIER = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page(); ctx.set_default_timeout(15000)
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**", "**://cdnjs.cloudflare.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#bestellungen", wait_until="domcontentloaded")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(800)
    with ctx.expect_page() as neu:
        pg.locator("[data-bestellpdf]").first.click()
    bl = neu.value
    bl.wait_for_selector(".blatt .balken")
    pruefe("Siegel im Briefkopf", bl.locator(".balken img.briefsiegel").count() == 1
           and bl.evaluate("document.querySelector('.balken img.briefsiegel').naturalWidth") > 0)
    t = bl.inner_text(".blatt")
    pruefe("Kontakt im Balken", "Tel:" not in t and "032 677 55 70" in bl.inner_text(".balken") and "www.hoferco.ch" in bl.inner_text(".balken"))
    pruefe("Firmenname über der Adresse", "Hofer + Co. Präzisionsdrehteile" in bl.locator(".balken .adresse").inner_text())
    pruefe("Gleich verteilt", bl.evaluate("""(() => { const k = [...document.querySelector('.balken').children].map(e => e.getBoundingClientRect());
      const l = k.slice(1).map((r, i) => r.left - k[i].right);
      return l.length === 3 && Math.max(...l) - Math.min(...l) < 4; })()"""))
    bl.locator(".blatt").screenshot(path=os.path.join(os.environ.get("BILDER", HIER), "bestellpapier.png"))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
