"""Measure the LCP element, LCP time and CLS of the local site.

The point is the LCP *element*, not the millisecond number -- localhost timings
mean nothing. As of 2026-09-10 the LCP element is the "builds" text span, which
is why no image carries fetchpriority="high". Re-run before ever adding one.

    python3 -m http.server 8899 &
    ./.claude/skills/seo/.venv/bin/python tools/measure-lcp.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8899/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(URL, wait_until="load")
    page.wait_for_timeout(4000)
    print(json.dumps(page.evaluate("""() => new Promise(resolve => {
      const out = {lcp: null, element: null, cls: 0};
      new PerformanceObserver(list => {
        const e = list.getEntries().pop();
        out.lcp = Math.round(e.startTime);
        out.element = e.element
          ? e.element.tagName + (e.element.getAttribute('src') || e.element.className || '')
          : String(e.url || '');
      }).observe({type: 'largest-contentful-paint', buffered: true});
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
      }).observe({type: 'layout-shift', buffered: true});
      setTimeout(() => resolve(out), 600);
    })"""), indent=2))
    browser.close()
