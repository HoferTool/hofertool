# Titelbild (Vorschaubild) des Videos: poster.html als 1920 x 1080 Bild
import os
from playwright.sync_api import sync_playwright
HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    pg = br.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto("file://" + os.path.join(HIER, "poster.html")); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(HIER, "titelbild.png")); br.close()
