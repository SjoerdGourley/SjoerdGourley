"""Render .github/banner.html to .github/banner.png for the GitHub profile README.

    ./.claude/skills/seo/.venv/bin/python tools/render-github-banner.py
"""
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / ".github" / "banner.html"
PNG = ROOT / ".github" / "banner.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 420}, device_scale_factor=2)
    page.goto(HTML.as_uri())
    page.wait_for_timeout(2500)
    page.screenshot(path=str(PNG), omit_background=True)
    browser.close()

subprocess.run(["sips", "-Z", "1920", str(PNG), "--out", str(PNG)], check=True,
               stdout=subprocess.DEVNULL)
print(f"wrote {PNG} ({PNG.stat().st_size // 1024} KB)")
