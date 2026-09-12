"""Render one prompt page's share card to assets/og/<slug>.jpg at 1200x630.

    ./.claude/skills/seo/.venv/bin/python tools/render-prompt-og.py spec.json

Generated, never hand-edited: change the card template or the spec, run again.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
spec = json.loads(Path(sys.argv[1]).read_text())
slug = spec["slug"]

card = (ROOT / "tools" / "templates" / "prompt-og-card.html").read_text()
card = card.replace("{{HEADLINE}}", spec.get("card_headline", spec["page_title"]))
card = card.replace("{{SUBTITLE}}", spec.get("card_subtitle", spec["description"]))
card = card.replace("{{SLUG}}", slug)

out_dir = ROOT / "assets" / "og"
out_dir.mkdir(parents=True, exist_ok=True)
jpg = out_dir / f"{slug}.jpg"

with tempfile.NamedTemporaryFile("w", suffix=".html", dir=str(ROOT / "tools" / "templates"), delete=False) as fh:
    fh.write(card)
    tmp = Path(fh.name)

png = out_dir / f".{slug}.png"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=2)
        page.goto(tmp.as_uri())
        page.wait_for_timeout(2500)
        page.screenshot(path=str(png))
        browser.close()
finally:
    tmp.unlink()

subprocess.run(["sips", "-Z", "1200", str(png), "--out", str(png)], check=True, stdout=subprocess.DEVNULL)
subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88", str(png), "--out", str(jpg)],
               check=True, stdout=subprocess.DEVNULL)
png.unlink()
print(f"wrote {jpg.relative_to(ROOT)} ({jpg.stat().st_size // 1024} KB)")
