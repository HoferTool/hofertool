# Zwei Tabs mit derselben Sitzung (Wunsch Patrick 19. Oktober 2026: mit
# einem Konto auf mehreren Geräten und Fenstern arbeiten): Erneuert ein
# Tab den Schlüssel, übernimmt der andere ihn, damit er nie mit dem
# alten erneuert. Fremde Sitzungen bleiben unberührt.
import json
from playwright.sync_api import sync_playwright
from pruefstand import server_starten, FAKE, CH, PORT

fehler = []
def pruefe(text, ok):
    print(("ok   " if ok else "FALSCH ") + text)
    if not ok: fehler.append(text)

srv = server_starten()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 900})
    seiten = []
    for _ in range(2):
        pg = ctx.new_page()
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt", timeout=20000)
        seiten.append(pg)
    a, b = seiten
    K = "sb-test-auth-token"
    alt_ = json.dumps({"user": {"id": "u1"}, "refresh_token": "alt"})
    neu = json.dumps({"user": {"id": "u1"}, "refresh_token": "neu"})
    fremd = json.dumps({"user": {"id": "u2"}, "refresh_token": "fremd"})
    b.evaluate("([k, v]) => sessionStorage.setItem(k, v)", [K, alt_])
    a.evaluate("([k, v]) => new BroadcastChannel('hofer-sitzung').postMessage({ erneuert: { [k]: v } })", [K, neu])
    b.wait_for_timeout(300)
    pruefe("anderer Tab übernimmt den neuen Schlüssel",
           json.loads(b.evaluate("(k) => sessionStorage.getItem(k)", K))["refresh_token"] == "neu")
    a.evaluate("([k, v]) => new BroadcastChannel('hofer-sitzung').postMessage({ erneuert: { [k]: v } })", [K, fremd])
    b.wait_for_timeout(300)
    pruefe("Sitzung einer anderen Person bleibt unberührt",
           json.loads(b.evaluate("(k) => sessionStorage.getItem(k)", K))["refresh_token"] == "neu")
    b.evaluate("(k) => sessionStorage.removeItem(k)", K)
    a.evaluate("([k, v]) => new BroadcastChannel('hofer-sitzung').postMessage({ erneuert: { [k]: v } })", [K, neu])
    b.wait_for_timeout(300)
    pruefe("ohne eigene Sitzung wird nichts angelegt", b.evaluate("(k) => sessionStorage.getItem(k)", K) is None)
    br.close()
srv.shutdown()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
