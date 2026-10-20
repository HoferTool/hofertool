# Material im Haus (1.91.0, Wunsch Patrick 17. Oktober 2026): Geht ein
# Auftrag mit rotem M auf und liegt passendes Restmaterial im Haus, kommt
# über der Zeichnung ein GIF mit der Frage, ob man es nutzen will; „Ja, nutzen“ trägt das
# Material bei „Menge vorhanden oder bestellt“ ein. Das Bild im Test ist
# ein gezeichneter Kreis, keine Person (das echte steht nur in der Datenbank).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

BILD = "data:image/svg+xml," + "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='4' fill='orange'/%3E%3C/svg%3E"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1500, "height": 950}, timezone_id="Europe/Zurich").new_page()
    pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""(bild) => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1');
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      const basis = { machine_id: 'm-k1', maschine: m.name, maschine_nr: m.machine_number, ended_at: null,
        planned_days: 3, target_quantity: 5000, stand: 0, color: 'rosa' };
      const mat = 'X14CrMoS17 rd 024 mm h9';
      D.jobs.push({ ...basis, id: 'iA', job_number: '10777-0001', plan_status: 'geplant', material_bez: mat, planned_from: '2026-10-14' });
      D.jobs.push({ ...basis, id: 'iB', job_number: '10777-0002', plan_status: 'geplant', material_bez: mat, planned_from: '2026-10-19',
        material_menge: '300 kg bestellt' });
      D.planwand = D.jobs;
      const p = (id, material, menge, mehr) => ({ id, material, menge, einheit: 'kg', ort: 'Restelager', art: 'lager',
        weg_am: null, erstellt_am: '2026-10-01T08:00:00Z', ...mehr });
      D.material_posten = [
        p('p1', mat, 200, { platz: 'Regal 3' }),
        p('p2', 'X14CrMoS17 rd 024 mm h8', 50, { ort: 'Halle' }),
        p('p3', mat, 70, { job_id: 'anderer' }),
        p('p4', mat, 500, { art: 'bestellt' }),
        p('p5', 'X14CrMoS17 rd 020 mm h9', 90, {}),
        p('p6', mat, 40, { weg_am: '2026-10-05T08:00:00Z' }),
      ];
      D.app_config.push({ schluessel: 'pad_mahnbilder', wert: JSON.stringify({ material: { bild } }) });
    }""", BILD)
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken[data-auftrag='iA']", timeout=8000); pg.wait_for_timeout(1500)

    # Auftrag mit Menge: keine Einblendung
    pg.locator(".pw-balken[data-auftrag='iB']").first.dblclick()
    pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(1200)
    pruefe("Mit eingetragener Menge keine Einblendung", pg.locator("#imhaus").count() == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Auftrag mit rotem M: Einblendung über der Zeichnung, kein Fenster
    pg.locator(".pw-balken[data-auftrag='iA']").first.dblclick()
    pg.wait_for_selector("#imhaus", timeout=5000); pg.wait_for_timeout(600)
    pruefe("Über der Zeichnung im Auftragsfenster", pg.locator(".dialog--auftrag .auf-zeichnung #imhaus").count() == 1)
    pruefe("Kein eigenes Fenster", pg.locator(".dialog-huelle").count() == 1)
    txt = pg.inner_text("#imhaus")
    pruefe("Überschrift und Frage", "Hey, wir haben noch Material im Haus" in txt and "Wollt ihr es nutzen?" in txt)
    pruefe("GIF aus der Datenbank", pg.get_attribute("#imhaus .imhaus__gif", "src") == BILD)
    li = pg.locator("#imhaus-liste li")
    alles = " | ".join(li.all_inner_texts())
    pruefe("Nur passende Posten (2): " + alles, li.count() == 2 and "200 kg" in alles and "50 kg" in alles)
    pruefe("Genaues zuerst, andere Toleranz als ähnlich", "ähnlich" in li.nth(1).inner_text() and "ähnlich" not in li.nth(0).inner_text())
    # Man kann daneben weiterarbeiten: Feld links bleibt bedienbar
    pg.fill("#pl-menge-mat", "")
    pg.click("#pl-menge-mat"); pg.keyboard.type("x")
    pruefe("Daneben weiterarbeiten", pg.input_value("#pl-menge-mat") == "x" and pg.locator("#imhaus").count() == 1)
    pg.fill("#pl-menge-mat", "")
    pg.screenshot(path="/tmp/material_im_haus.png")
    pg.click("#imhaus-ja"); pg.wait_for_timeout(400)
    pruefe("Einblendung weg, Auftragsfenster bleibt", pg.locator("#imhaus").count() == 0 and pg.locator(".dialog--auftrag").count() == 1)
    menge = pg.input_value("#pl-menge-mat")
    pruefe("Eingetragen: " + menge, "200 kg Restelager, Regal 3" in menge and "50 kg Halle" in menge and "Restmaterial" in menge)
    pruefe("Noch nicht gespeichert", not pg.evaluate("TEST.daten.jobs.find(j => j.id === 'iA').material_menge"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Nochmals öffnen: Nein blendet nur aus
    pg.locator(".pw-balken[data-auftrag='iA']").first.dblclick()
    pg.wait_for_selector("#imhaus", timeout=5000)
    pg.click("#imhaus-nein"); pg.wait_for_timeout(300)
    pruefe("Nein blendet aus, nichts eingetragen", pg.locator("#imhaus").count() == 0 and pg.input_value("#pl-menge-mat") == ""
           and pg.locator(".dialog--auftrag").count() == 1)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
