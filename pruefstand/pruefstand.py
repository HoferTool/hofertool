import sys, threading, http.server, functools, time, os, glob
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
# Webserver liefert den Repo-Ordner aus, damit index.html, logo.png usw. direkt gehen
WURZEL = os.path.dirname(HIER)
PORT = int(os.environ.get("PRUEF_PORT", "8899"))
# Bildschirmfotos landen hier (nicht im Repo, siehe .gitignore)
BILDER = os.path.join(HIER, "bilder")
os.makedirs(BILDER, exist_ok=True)


def chrome_finden():
    """Chrome-Pfad: PRUEF_CHROME, sonst Playwright-Browser, sonst None (Playwright entscheidet)."""
    if os.environ.get("PRUEF_CHROME"):
        return os.environ["PRUEF_CHROME"]
    for muster in ["/opt/pw-browsers/chromium-*/chrome-linux/chrome",
                   os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux/chrome")]:
        treffer = sorted(glob.glob(muster))
        if treffer:
            return treffer[-1]
    return None


CH = chrome_finden()

def server_starten():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=WURZEL)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

FAKE = open("/tmp/claude-0/-home-user-hofer/24e89aa2-598a-5dd1-9cad-e426c963ddc8/scratchpad/Hofer-Tool/pruefstand/fake-supabase.js", encoding="utf-8").read()

def lauf(datei="index.html", breite=1600, hoehe=1000, mobil=False,
         schuss="wand.png", nachher=None, tage=None):
    fehler = []
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=CH,
                               args=["--no-sandbox", "--disable-dev-shm-usage",
                                     "--force-device-scale-factor=1"])
        ctx = br.new_context(viewport={"width": breite, "height": hoehe},
                             device_scale_factor=1,
                             is_mobile=mobil, has_touch=mobil)
        pg = ctx.new_page()
        pg.on("console", lambda m: fehler.append(m.type + ": " + m.text)
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)))

        # Die Supabase-Bibliothek durch den Nachbau ersetzen
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(
            status=200, content_type="application/javascript", body=FAKE))
        # Alles andere von aussen abklemmen
        pg.route("**://fonts.googleapis.com/**", lambda r: r.abort())
        pg.route("**://fonts.gstatic.com/**", lambda r: r.abort())
        pg.route("**://esm.sh/**", lambda r: r.abort())
        pg.route("**://*.supabase.co/**", lambda r: r.abort())

        pg.goto(f"http://127.0.0.1:{PORT}/{datei}", wait_until="domcontentloaded")

        # Warten, bis das Gerüst steht
        pg.wait_for_selector("#inhalt", timeout=20000)
        pg.evaluate("location.hash = '#planwand'")
        pg.wait_for_selector(".pw-tafel", timeout=20000)
        if tage:
            pg.fill("#pw-zoomwert", str(tage))
            pg.press("#pw-zoomwert", "Enter")
            pg.wait_for_timeout(500)
        pg.wait_for_timeout(700)

        werte = pg.evaluate("""() => {
          const t = document.querySelector('.pw-tafel');
          const zeile = [...document.querySelectorAll(".pw-zeile")].find((z) => z.querySelector(".pw-spuren:not(.pw-spuren--fein)"));
          const name = document.querySelector('.pw-zeile:not(.pw-zeile--kopf) .pw-name');
          const balken = document.querySelector('.pw-balken');
          const cs = (el) => el ? getComputedStyle(el) : null;
          const ueberlappt = [];
          document.querySelectorAll('.pw-spuren').forEach((sp) => {
            const bs = [...sp.querySelectorAll('.pw-balken')].map((b) => ({
              von: +b.dataset.von, dauer: +b.dataset.dauer, nr: b.textContent.trim().slice(0, 12) }));
            bs.sort((a, c) => a.von - c.von);
            for (let i = 1; i < bs.length; i++) {
              if (bs[i].von < bs[i-1].von + bs[i-1].dauer) ueberlappt.push([bs[i-1].nr, bs[i].nr]);
            }
          });
          return {
            tage: t ? t.style.getPropertyValue('--pw-tage') : null,
            skala: t ? t.style.getPropertyValue('--pw-s') : null,
            spalte: t ? t.style.getPropertyValue('--pw-spalte') : null,
            zeilenhoehe: zeile ? Math.round(zeile.getBoundingClientRect().height) : null,
            namensschrift: name ? cs(name).fontSize : null,
            namenzeilen: name ? name.innerHTML.includes('<span') : null,
            balkenfarbe: balken ? cs(balken).color : null,
            balkenschrift: balken ? cs(balken).fontSize : null,
            balkengewicht: balken ? cs(balken).fontWeight : null,
            anzahlMaschinen: document.querySelectorAll('.pw-zeile:not(.pw-zeile--kopf):not(.pw-zeile--kw):not(.pw-zeile--park):not(.pw-zeile--fein)').length,
            sichtbareMaschinen: [...document.querySelectorAll('.pw-zeile:not(.pw-zeile--kopf):not(.pw-zeile--kw):not(.pw-zeile--park):not(.pw-zeile--fein)')]
              .filter((z) => z.getBoundingClientRect().bottom < window.innerHeight).length,
            ueberlappungen: ueberlappt,
            infofenster: document.querySelectorAll('.pw-info').length,
            monatszeile: !!document.querySelector('.pw-monat'),
            tagKopf: [...document.querySelectorAll('.pw-tag')].slice(0, 3).map((e) => e.textContent),
            ferienzeilen: document.querySelectorAll('.pw-zeile--fein').length,
          };
        }""")

        if nachher:
            werte["nachher"] = nachher(pg)

        pg.screenshot(path=os.path.join(BILDER, schuss), full_page=False)
        ctx.close(); br.close()
    return werte, fehler

if __name__ == "__main__":
    server_starten()
    time.sleep(0.5)
    datei = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    w, f = lauf(datei=datei)
    for k, v in w.items():
        print(f"{k:22} {v}")
    print("--- Meldungen ---")
    for z in f[:15]:
        print(" ", z[:160])
