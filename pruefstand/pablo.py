# Pablo, der Sprachassistent auf der Planwand (1.362.0, Wunsch Patrick
#  3. November 2026): hört von selbst auf „Pablo“, kleines Zeichen unten
#  rechts, Einblendung mit Frage und Antwort, Sprachausgabe; Antworten aus
#  den Planwand-Daten, Befehle wie „öffne die Zeichnung von …“; nicht für
#  Externe. Spracherkennung und -ausgabe sind hier nachgebaut.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def zusatz(extern):
    return """
(() => {
  %s
  const m = daten.machines[0];
  daten.jobs.push({ id: 'jp1', job_number: '10844-0049', machine_id: m.id, planned_from: arbeitstagPlus(montag, 0),
    planned_days: 8, plan_status: 'laeuft', target_quantity: 5000, color: '#ff0000', fa_nr: 'FA-4711',
    material_bez: 'X8CrNiS18-9 rd 12 h9', material_menge: '3 Stangen da', material_platz: 'Regal B3',
    abruf_info: 'Abruf 1 von 3, Liefertermin KW 47', plan_note: 'Fase 0.3 beachten',
    drawing_url: 'data:application/pdf;base64,JVBERi0xLjQK' });
  daten.jobs.push({ id: 'jp2', job_number: '10844-0050', machine_id: m.id, planned_from: arbeitstagPlus(montag, 9),
    planned_days: 3, plan_status: 'geplant', target_quantity: 800, color: '#ff0000', material_bez: '1.4404 rd 8' });
})();
""" % ("daten.profiles[0].role = 'extern';" if extern else "")

ERKENNUNG = """
(() => {
  window.__gesagt = [];
  class FakeErk {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; }
    start() { window.__erk = this; window.__starts = (window.__starts || 0) + 1; }
    stop() { this.abort(); }
    abort() { if (window.__erk === this) window.__erk = null; const f = this.onend; if (f) setTimeout(() => f(), 0); }
  }
  window.SpeechRecognition = FakeErk;
  window.__sag = (text, final) => {
    const e = window.__erk; if (!e || !e.onresult) return false;
    const r = [{ transcript: text }]; r.isFinal = final !== false;
    e.onresult({ resultIndex: 0, results: [r] });
    return true;
  };
  window.__sagViele = (lesarten) => {
    const e = window.__erk; if (!e || !e.onresult) return false;
    const r = lesarten.map((t) => ({ transcript: t })); r.isFinal = true;
    e.onresult({ resultIndex: 0, results: [r] });
    return true;
  };
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [], addEventListener() {}, cancel() {},
    speak(u) { window.__gesagt.push(u.text); setTimeout(() => u.onend && u.onend(), 30); } } });
})();
"""

def seite(p, extern):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1500, "height": 950})
    ctx.add_init_script(ERKENNUNG)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            zusatz(extern) + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(2200)
    return br, pg

def befehl(pg, t):
    pg.fill("#pablo-eingabe", t); pg.press("#pablo-eingabe", "Enter"); pg.wait_for_timeout(900)
    print("   ", t)

def frage(pg, t):
    pg.fill("#pablo-eingabe", t); pg.press("#pablo-eingabe", "Enter")
    pg.wait_for_selector("#pablo-antwort"); pg.wait_for_timeout(250)
    a = pg.inner_text("#pablo-antwort"); print("   ", t, "→", a); return a

with sync_playwright() as p:
    br, pg = seite(p, False)
    pruefe("Zeichen unten rechts da, ohne Einblendung", pg.locator("#pablo-zeichen").count() == 1 and pg.locator("#pablo").count() == 0)
    pruefe("Kein Knopf in der Kopfleiste", pg.locator("#pw-pablo").count() == 0)
    pruefe("Hört von selbst zu", pg.evaluate("!!window.__erk && window.__erk.continuous"))
    pruefe("Zeichen zeigt Lauschen", "pablo-zeichen--lauscht" in pg.get_attribute("#pablo-zeichen", "class"))
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/da0acc45-2bf3-5a47-96fd-e28b16df273f/scratchpad/pablo-zeichen.png")

    # Ohne „Pablo“ passiert nichts
    pg.evaluate("__sag('was läuft auf der L 1001')"); pg.wait_for_timeout(300)
    pruefe("Ohne Weckwort keine Einblendung", pg.locator("#pablo").count() == 0)

    # „Pablo“ allein: Einblendung, dann die nächste Aussage
    pg.evaluate("__sag('Pablo', false)"); pg.wait_for_timeout(200)
    pruefe("Schon beim Zwischenergebnis „Pablo“ geht die Einblendung auf", pg.locator("#pablo.pablo--hoert").count() == 1)
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/da0acc45-2bf3-5a47-96fd-e28b16df273f/scratchpad/pablo-hoert.png")
    pg.evaluate("__sag('Pablo')"); pg.wait_for_timeout(400)
    pg.evaluate("__sag('was steht im Auftrag 10844 0049')")
    pg.wait_for_selector("#pablo-antwort"); pg.wait_for_timeout(400)
    a = pg.inner_text("#pablo-antwort"); print("   →", a)
    pruefe("Antwort zum Auftrag (läuft, Maschine, Menge)", "10844-0049 läuft auf der L-1001" in a and "5'000 Stück" in a)
    pruefe("Nichts vorgelesen (ohne Stimme)", len(pg.evaluate("__gesagt")) == 0)
    pruefe("Nennt weiteren offenen Auftrag nicht (andere Nr.)", "weitere" not in a)
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/da0acc45-2bf3-5a47-96fd-e28b16df273f/scratchpad/pablo-antwort.png")

    # 1.365.0: anders geschriebener Name und zweite Lesart zählen auch
    for name in ["Bablo", "Paolo", "Pablu", "pablo escobar", "Pablo, Escobar"]:
        pg.evaluate("document.querySelector('#pablo .pablo__x') && document.querySelector('#pablo .pablo__x').click()"); pg.wait_for_timeout(200)
        pg.evaluate(f"__sag('{name} wo läuft 10844-0049')")
        try:
            pg.wait_for_selector("#pablo-antwort", timeout=3000); pg.wait_for_timeout(300)
            a = pg.inner_text("#pablo-antwort")
        except Exception:
            a = ""
        pruefe(f"Weckwort „{name}“ erkannt", "L-1001" in a)
        pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#pablo .pablo__x') && document.querySelector('#pablo .pablo__x').click()"); pg.wait_for_timeout(200)
    pg.evaluate("__sagViele(['Tablo wo läuft 10844-0049', 'Pablo wo läuft 10844-0049'])")
    try:
        pg.wait_for_selector("#pablo-antwort", timeout=3000); a = pg.inner_text("#pablo-antwort")
    except Exception:
        a = ""
    pruefe("Weckwort in der zweiten Lesart erkannt", "L-1001" in a)
    pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#pablo .pablo__x') && document.querySelector('#pablo .pablo__x').click()"); pg.wait_for_timeout(200)
    pg.evaluate("__sag('Paul wo läuft 10844-0049')"); pg.wait_for_timeout(400)
    pruefe("„Paul“ weckt Pablo nicht", pg.locator("#pablo").count() == 0)
    pg.click("#pablo-zeichen"); pg.wait_for_selector("#pablo")
    v = pg.inner_text("#pablo")
    pruefe("Einblendung zeigt, was zuletzt verstanden wurde", "Zuletzt verstanden" in v and "Paul" in v)
    pg.click("#pablo .pablo__x"); pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
    pruefe("Danach hört er wieder zu", pg.evaluate("!!window.__erk"))

    # In einem Satz mit „Pablo Escobar“
    pg.evaluate("__sag('Pablo Escobar ist das Material da bei 10844-0049')")
    pg.wait_for_timeout(700); a = pg.inner_text("#pablo-antwort"); print("   →", a)
    pruefe("Material: vorhanden und Platz", "3 Stangen da" in a and "Regal B3" in a and "X8CrNiS18-9" in a)

    pruefe("Abruf", "KW 47" in frage(pg, "zeig mir den Abruf von 10844-0049"))
    pruefe("Liefermenge", "5'000 Stück" in frage(pg, "liefermenge von 10844 0049"))
    pruefe("Nachfrage ohne Nummer: Notiz", "Fase 0.3" in frage(pg, "und was steht in der Notiz"))
    pruefe("Läuft es schon", "läuft" in frage(pg, "läuft 10844-0049 schon"))
    a = frage(pg, "was läuft auf der L 1001")
    pruefe("Maschine: läuft und als Nächstes", "10844-0049 läuft" in a and "10844-0050" in a)
    pruefe("Wann frei", "frei ab" in frage(pg, "wann ist die L-1001 frei").lower())
    pruefe("Auslastung je Park", "Prozent" in frage(pg, "wie ist die Auslastung"))
    pruefe("Probleme", "Problem" in frage(pg, "gibt es Probleme"))
    pruefe("Unklar: Hilfe", "Frag mich" in frage(pg, "wie wird das Wetter"))
    pruefe("Wo ist der Auftrag", "L-1001" in frage(pg, "wo ist der Auftrag 10844-0050"))

    # Befehle
    befehl(pg, "öffne die Zeichnung von 10844-0049")
    pg.wait_for_timeout(600)
    pruefe("Zeichnung geht auf", pg.locator(".dialog-huelle").count() >= 1)
    pruefe("Einblendung danach weg", pg.locator("#pablo").count() == 0)
    pg.evaluate("document.activeElement && document.activeElement.blur()")  # nicht ins PDF klicken, sonst hat es die Tasten
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Zeichnung wieder zu", pg.locator(".dialog-huelle").count() == 0)
    pg.click("#pablo-zeichen"); pg.wait_for_selector("#pablo")
    befehl(pg, "öffne das Auftragsfenster von 10844-0049"); pg.wait_for_timeout(1500)
    pruefe("Auftragsfenster geht auf", pg.locator(".dialog-huelle").count() >= 1)
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe("Auftragsfenster wieder zu", pg.locator(".dialog-huelle").count() == 0)

    # Escape schliesst nur die Einblendung
    pg.click("#pablo-zeichen"); pg.wait_for_selector("#pablo")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst die Einblendung", pg.locator("#pablo").count() == 0)
    pruefe("Escape fragt nicht nach Abmelden", pg.locator(".dialog-huelle").count() == 0)

    # Überall im Tool: auf einer anderen Seite holt Pablo die Aufträge selbst
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1600)
    pruefe("Auf der Produktion ist Pablo da und hört zu", pg.locator("#pablo-zeichen").count() == 1 and pg.evaluate("!!window.__erk"))
    pg.evaluate("__sag('Pablo wo läuft 10844-0049')"); pg.wait_for_selector("#pablo-antwort"); pg.wait_for_timeout(500)
    a = pg.inner_text("#pablo-antwort"); print("   →", a)
    pruefe("Antwort auch ausserhalb der Planwand", "10844-0049 läuft auf der L-1001" in a)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); pg.click("#pablo-zeichen"); pg.wait_for_selector("#pablo")
    befehl(pg, "gehe zu Bestellungen"); pg.wait_for_timeout(800)
    pruefe("Gehe zu Bestellungen", "bestellungen" in pg.evaluate("location.hash"))
    pg.click("#pablo-zeichen"); pg.wait_for_selector("#pablo")
    befehl(pg, "öffne den Pad Mode"); pg.wait_for_timeout(1200)
    pruefe("Pad Mode geht auf, Pablo bleibt da", pg.locator("#pad").count() == 1 and pg.locator("#pablo-zeichen").count() == 1)
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/da0acc45-2bf3-5a47-96fd-e28b16df273f/scratchpad/pablo-pad.png")
    pg.evaluate("__sag('Pablo gehe zur Planwand')"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('[data-padzurueck]') && 0")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)

    # Dunkler Modus: Einblendung lesbar
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.click("#pablo-zeichen"); pg.wait_for_selector("#pablo"); frage(pg, "hilfe")
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/da0acc45-2bf3-5a47-96fd-e28b16df273f/scratchpad/pablo-dunkel.png")
    br.close()

    br, pg = seite(p, True)
    pruefe("Externe: kein Pablo", pg.locator("#pablo-zeichen").count() == 0 and not pg.evaluate("!!window.__erk"))
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
