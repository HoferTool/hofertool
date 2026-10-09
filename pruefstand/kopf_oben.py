# Kopfzeile oben deckend (Wunsch 9. Oktober 2026): nichts darf beim Rollen
# über oder durch die Kopfzeile scheinen, im Pad ist der Kopf deckend.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for w,h,name in [(1180,820,"quer"),(820,1180,"hochkant")]:
      for dunkel in (False, True):
        pg = br.new_context(viewport={"width":w,"height":h}, is_mobile=True, has_touch=True).new_page()
        f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:120]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
            content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
                  "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        if dunkel: pg.evaluate("document.body.classList.add('dunkel')")
        pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(300)
        m = pg.evaluate("""() => { const k=document.querySelector('.kopf'), s=getComputedStyle(k);
          return {oben:k.getBoundingClientRect().top, hoehe:k.getBoundingClientRect().height,
                  rahmen:getComputedStyle(document.querySelector('.rahmen')).paddingTop,
                  grund:s.backgroundColor, schatten:s.boxShadow, glas:s.backdropFilter}; }""")
        art = name + ("-dunkel" if dunkel else "-hell")
        if m["oben"] != 0 or round(m["hoehe"]) != 54 or m["rahmen"] != "54px": fehler.append(art+" Mass "+str(m))
        if "rgba" in m["grund"] or m["glas"] not in ("none", ""): fehler.append(art+" durchsichtig "+str(m))
        pg.screenshot(path=f"kopf-{art}.png")
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad .pad__kopf")
        pg.wait_for_timeout(600)
        k = pg.evaluate("""() => { const s=getComputedStyle(document.querySelector('#pad .pad__kopf'));
          return {grund:s.backgroundColor, glas:s.backdropFilter, oben:s.paddingTop}; }""")
        if k["glas"] not in ("none",""): fehler.append(art+" Pad durchsichtig "+str(k))
        pg.screenshot(path=f"kopf-pad-{art}.png")
        print(art, m, k, f[:2] if f else "")
        fehler += f
        pg.context.close()
    br.close()
print("Fehler:", fehler if fehler else "keine")
