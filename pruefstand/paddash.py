import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1180,"height":830}, device_scale_factor=2).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:220]))
    pg.on("console", lambda m: f.append("console:"+m.text[:180])
          if m.type=="error" and "404" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**"]:
        pg.route(u, lambda r: r.abort())
    # Wetter beantworten, damit die Säule vollständig ist
    pg.route("**://api.open-meteo.com/**", lambda r: r.fulfill(status=200,
        content_type="application/json", body='{"current":{"temperature_2m":14.2,"weather_code":2},'
        '"hourly":{"time":["2026-09-24T17:00","2026-09-24T18:00","2026-09-24T19:00",'
        '"2026-09-24T20:00","2026-09-24T21:00","2026-09-24T22:00"],'
        '"temperature_2m":[14,13,11,10,9,9],"weather_code":[2,61,61,3,3,3]},'
        '"daily":{"sunset":["2026-09-24T19:12"],"temperature_2m_max":[16],"temperature_2m_min":[8]}}'))
    pg.add_init_script("""window.__stände = true;""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0,i)).click(); pg.wait_for_timeout(2500)
    print("Seitenfehler:", f[:3])
    print("Pad zeigt:", (pg.evaluate("(document.getElementById('pad')||{}).innerText||'kein Pad'"))[:150].replace("\n"," | "))
    print("Spalten:", pg.evaluate("document.querySelectorAll('.pad-spalte').length"),
          "| Tagesbalken:", pg.evaluate("document.querySelectorAll('.pad-tag').length"),
          "| Knöpfe:", pg.evaluate("[...document.querySelectorAll('.pad-knopf')].map(b=>b.textContent.trim())"))
    print("Säule:", (pg.evaluate("(document.querySelector('.pad-karte2--saeule')||{}).innerText||'fehlt'"))[:150].replace("\n"," | "))
    print("HOCO:", (pg.evaluate("(document.querySelector('.pad-karte2--hoco')||{}).innerText||'fehlt'"))[:120].replace("\n"," | "))
    pg.screenshot(path="paddash.png")
    # Historie sitzt jetzt im Werkzeugwechsel
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_timeout(1500)
    print("Wechselfenster:", pg.evaluate("[...document.querySelectorAll('.dialog h2')].map(h=>h.textContent)"),
          "| Historie-Knopf:", pg.locator("[data-wzhistorie]").count())
    if pg.locator("[data-wzhistorie]").count():
        pg.locator("[data-wzhistorie]").click(); pg.wait_for_timeout(1500)
        inhalt = pg.evaluate("""() => { const d=[...document.querySelectorAll('.dialog')].pop();
          return d ? d.innerText : ''; }""")
        print("nach Historie:", inhalt[:90].replace("\n", " | "))
    print("Fehler:", f[:3] if f else "keine")
    pg.screenshot(path="paddash.png")
    br.close()
