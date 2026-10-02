import time, email, base64, re
from email import policy
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
H2C = "window.html2canvas = async function () { var c = document.createElement('canvas'); c.width = 794; c.height = 1123; return c; };"
JSPDF = "window.jspdf = { jsPDF: function () { return { addImage: function () {}, output: function () { return new Blob(['%PDF-1.4\\n%%EOF'], { type: 'application/pdf' }); } }; } };"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1400,"height":950}, accept_downloads=True)
    pg = ctx.new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("TEST.daten.suppliers.forEach(s => { s.email = 'sales@diametal.com'; })")
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(1800)
    with ctx.expect_page() as neu:
        pg.locator("[data-bestellpdf]").first.click()
    blatt = neu.value
    blatt.wait_for_load_state(); blatt.wait_for_timeout(1500)
    blatt.evaluate(H2C + JSPDF)
    with blatt.expect_download(timeout=20000) as d:
        blatt.locator("#mailknopf").click()
    roh = open(d.value.path(), "rb").read()
    m = email.message_from_bytes(roh, policy=policy.default)
    print("An:", m["To"], "| Betreff:", m["Subject"], "| Entwurf:", m["X-Unsent"], "| Grösse:", len(roh) // 1024, "KB")
    def baum(t, tiefe=0):
        print("  " * tiefe + "-", t.get_content_type(), (t.get("Content-ID") or ""), (t.get_filename() or ""))
        if t.is_multipart():
            for k in t.iter_parts(): baum(k, tiefe + 1)
    baum(m)
    html = next(t for t in m.walk() if t.get_content_type() == "text/html").get_content()
    text = next(t for t in m.walk() if t.get_content_type() == "text/plain").get_content()
    print("Links im HTML:", re.findall(r'href="([^"]+)"', html))
    print("Bilder im HTML:", re.findall(r'src="(cid:[^"]+)"', html))
    print("Klartext endet mit:", text.strip().splitlines()[-2:])
    # So würde Outlook die Mail zeigen: Bilder aus den Teilen einsetzen
    bilder = {t["Content-ID"].strip("<>"): base64.b64encode(t.get_payload(decode=True)).decode()
              for t in m.walk() if t.get_content_type() == "image/png"}
    for cid, b in bilder.items(): html = html.replace("cid:" + cid, "data:image/png;base64," + b)
    v = ctx.new_page(); v.set_viewport_size({"width": 700, "height": 520}); v.set_content(html); v.wait_for_timeout(400)
    v.screenshot(path="mail_vorschau.png")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
