"""Render assets/og-card.html to assets/og-image.jpg at 1200x630.

The OG image is generated, never hand-edited: change the card, run this.
Needs the venv from tools/install-seo-tooling.sh:

    ./.claude/skills/seo/.venv/bin/python tools/render-og-image.py
"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CARD = ROOT / "assets" / "og-card.html"
PNG = ROOT / "assets" / ".og-image.png"
JPG = ROOT / "assets" / "og-image.jpg"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=2)
    page.goto(CARD.as_uri())
    page.wait_for_timeout(2500)  # let the Google Fonts webfonts land
    page.screenshot(path=str(PNG))
    browser.close()

# 2x down to 1200 wide, then JPEG at q88 -- keeps it well under the 300 KB
# that scrapers start balking at.
subprocess.run(["sips", "-Z", "1200", str(PNG), "--out", str(PNG)], check=True,
               stdout=subprocess.DEVNULL)
subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88",
                str(PNG), "--out", str(JPG)], check=True, stdout=subprocess.DEVNULL)
PNG.unlink()
print(f"wrote {JPG} ({JPG.stat().st_size // 1024} KB)")
