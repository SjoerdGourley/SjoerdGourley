"""Create one prompt page from a JSON spec: page, prompt entry, OG card, sitemap.

    ./.claude/skills/seo/.venv/bin/python tools/new-prompt-page.py spec.json

Spec keys: slug, page_title, headline, lead, description, video_title,
video_url, inbox[], community[], prompt, checklist[].
"""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "tools" / "templates"

spec = json.loads(Path(sys.argv[1]).read_text())
slug = spec["slug"]
if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,38}", slug):
    sys.exit(f"bad slug: {slug!r} — lowercase letters, digits and hyphens")

page_dir = ROOT / "p" / slug
if page_dir.exists():
    sys.exit(f"{page_dir} already exists — pick another slug or delete it first")

video_block = ""
if spec.get("video_url"):
    video_block = (
        f'<p class="prompt-video"><a href="{spec["video_url"]}" target="_blank" '
        f'rel="noopener noreferrer">Watch the video</a></p>'
    )

page = (TEMPLATES / "prompt-page.html").read_text()
for key, value in {
    "{{SLUG}}": slug,
    "{{PAGE_TITLE}}": spec["page_title"],
    "{{DESCRIPTION}}": spec["description"],
    "{{HEADLINE}}": spec["headline"],
    "{{LEAD}}": spec["lead"],
    "{{VIDEO_BLOCK}}": video_block,
    "{{INBOX_ITEMS}}": "\n".join(f"        <li>{i}</li>" for i in spec["inbox"]),
    "{{COMMUNITY_ITEMS}}": "\n".join(f"        <li>{i}</li>" for i in spec["community"]),
}.items():
    page = page.replace(key, value)
page_dir.mkdir(parents=True)
(page_dir / "index.html").write_text(page)

entry = {
    "title": spec["page_title"],
    "video": spec.get("video_title", ""),
    "videoUrl": spec.get("video_url", ""),
    "promise": spec["description"],
    "prompt": spec["prompt"],
    "checklist": spec["checklist"],
}
registry = ROOT / "api" / "_prompts.js"
js = registry.read_text()
if f'PROMPTS[{json.dumps(slug)}]' in js:
    sys.exit(f"{slug} already in api/_prompts.js")
lines = [f"PROMPTS[{json.dumps(slug)}] = {{"]
for key, value in entry.items():
    lines.append(f"  {key}: {json.dumps(value)},")
lines.append("};")
registry.write_text(js.rstrip("\n") + "\n\n" + "\n".join(lines) + "\n")

sitemap = ROOT / "sitemap.xml"
xml = sitemap.read_text()
block = (
    "  <url>\n"
    f"    <loc>https://sjoerdgourley.com/p/{slug}/</loc>\n"
    f"    <lastmod>{date.today().isoformat()}</lastmod>\n"
    "    <changefreq>monthly</changefreq>\n"
    "    <priority>0.7</priority>\n"
    "  </url>\n"
)
sitemap.write_text(xml.replace("</urlset>", block + "</urlset>"))

subprocess.run([sys.executable, str(ROOT / "tools" / "render-prompt-og.py"), sys.argv[1]], check=True)

print(f"""
page      p/{slug}/index.html
entry     api/_prompts.js
image     assets/og/{slug}.jpg
sitemap   updated

YouTube description snippet:

The prompt from this video, plus the checklist I run on what it gives back:
https://sjoerdgourley.com/p/{slug}/
""")
