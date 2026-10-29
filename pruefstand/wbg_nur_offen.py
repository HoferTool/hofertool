# WBGs nie an abgeschlossene Aufträge, nur an laufende oder geplante
# (Wunsch Patrick 29. Oktober 2026): Einstellungen → Dokumente → Dateien
# hochladen zeigt die Zuordnung
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """Object.assign(daten.jobs[0], { job_number: '10999-0001', fa_nr: '20268566', plan_status: 'fertig', ended_at: '2026-10-27T10:00:00Z' });
Object.assign(daten.jobs[1], { job_number: '10999-0001', fa_nr: null, plan_status: 'laeuft', ended_at: null });
Object.assign(daten.jobs[2], { job_number: '10999-0002', fa_nr: null, plan_status: 'fertig', ended_at: '2026-10-20T10:00:00Z' });
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1500)
    pdf = b"%PDF-1.4\n%%EOF\n"
    with pg.expect_file_chooser() as fc:
        pg.locator("#dok-neu").click()
    fc.value.set_files([
        {"name": "20268566 10999-0001.pdf", "mimeType": "application/pdf", "buffer": pdf},
        {"name": "20267777 10999-0001.pdf", "mimeType": "application/pdf", "buffer": pdf},
        {"name": "20265555 10999-0002.pdf", "mimeType": "application/pdf", "buffer": pdf}])
    pg.wait_for_selector("#pool-los", timeout=5000); pg.wait_for_timeout(500)
    zeilen = {}
    for tr in pg.locator("tr:has([data-pool])").all():
        t = tr.inner_text().replace("\n", " | "); print("Zeile:", t)
        zeilen[t.strip().strip("| ").split(" ")[0]] = (t, tr.locator("[data-pool]").is_checked())
    a = zeilen.get("20268566", ("", True)); b = zeilen.get("20267777", ("", False)); c = zeilen.get("20265555", ("", True))
    pruefe("FA auf fertigem Auftrag: nicht zugeordnet", not a[1] and "abgeschlossenen Auftrag" in a[0])
    pruefe("Neue FA an laufenden Auftrag", b[1] and "FA 20267777" in b[0])
    pruefe("Nur fertiger Auftrag der HOCO Nr.: nicht zugeordnet", not c[1] and "kein offener Auftrag" in c[0])
    pruefe("Keine Fehler: " + str(f), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
