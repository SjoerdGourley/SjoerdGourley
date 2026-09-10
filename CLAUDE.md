# sjoerdgourley.com — project brief
*Level 2 · last updated 2026-09-10*

Sjoerd Gourley's personal brand hub. One page tying together Fidestay, the
English-language YouTube channel, the paid community, and client work. It is
not a Fidestay site — if a change makes Fidestay the centre of gravity again,
that is a regression, not an improvement.

| | |
|---|---|
| **Live** | https://sjoerdgourley.com (www redirects to apex) |
| **Local** | `/Users/sgourley/Documents/Web-Projects/SjoerdGourley` |
| **Repo** | https://github.com/SjoerdGourley/SjoerdGourley (`main`) |
| **Host** | Vercel, project `prj_lU51WAsnklPq8AeSvL9OdUtbrGN2` |
| **DNS** | At Vercel. Apex A record, `www` CNAME. Mail (SPF/DKIM/DMARC) still at ZXCS. |
| **Mail** | Resend, domain verified |
| **DB** | Supabase project `ezadbsekqvfzribcchek` |

## Shape

Everything is `index.html` — ~2000 lines, inline `<style>` and `<script>`.
**No build step, no package.json, no framework.** GSAP 3.12.5 + ScrollTrigger
come from cdnjs. `api/contact.js` is a dependency-free Vercel Node function.

Tracked: `index.html`, `api/contact.js`, `assets/`, the three favicon files,
`.gitignore`. `.env.local` and `.vercel/` are ignored.

```bash
python3 -m http.server 8899   # static preview; /api/contact will 404
vercel dev                    # needed to exercise the contact form locally
```

Deploy is `git push origin main`. Vercel builds automatically; a change is
live in roughly 40 seconds. Cache headers are `public, max-age=0,
must-revalidate`, so there is no stale-HTML problem — if a change is not
visible, it has not deployed.

## Secrets

`RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` live in Vercel's environment
and nowhere else. **Do not create, fetch, or print them** — Sjoerd adds them
himself with `vercel env add` precisely so they never enter a conversation.
Never write a key into a tracked file.

`ip_hash` in the database is a salted SHA-256 prefix, never a raw IP. This is
deliberate (EU project); keep it that way.

## The contact form

`POST /api/contact` stores the message in Supabase **first** and mails it
second, so a Resend outage loses a notification but never the message. It
sends two mails: a notification to `hello@`, and a confirmation to the sender
from `hello@` (not `noreply@` — it invites a reply).

`public.contact_messages`: id, created_at, name, email, subject, message,
user_agent, ip_hash, delivered, confirmed. RLS is on with no policies; access
is via `service_role`, which needed explicit table GRANTs — RLS bypass alone
was not enough, and the symptom was a silent 42501 on insert while mail still
went out. Confirmation caps: 10 per IP per hour, 2 per address per day.

## Conventions that are easy to break

- **Never put a CSS `transition` on a property GSAP animates on the same
  element.** Both then own it: GSAP writes a value per frame, the browser eases
  toward it, and the element trails its own tween by the transition duration.
  The card entrances hit this and produced a staircase of full-opacity cards.
  `enterCards()` in the script suspends the transition via `.is-entering` for
  the length of the tween; use it for any new reveal on a hover-lifting element.
- `overflow-x: hidden` on `body` breaks `position: sticky`. Use `clip`.
- Anything sized in `vw` needs its companion offsets sized in `vw` too. A flat
  px lift tuned at 1440 overshoots at 900 (see the hero's ghost word).
- The hero centres its flex column, so a margin change on one child moves it
  only half as far and pushes its sibling the other way. Compensate on the
  opposite side when you want one element to move alone.
- Reduced-motion needs CSS-level start states reset, not just GSAP ones —
  `.small-team .word > span` is a `transform` in CSS and stayed invisible.

## Content rules

No invented numbers, view counts, revenue, testimonials, or implied track
record. Anything unverifiable comes out. Social handles get HTTP-checked
before they are linked. The dashboard screenshots are demo data (confirmed);
De Parel van Haelen is Sjoerd's mother's B&B, so no confidentiality applies.

Sjoerd is not "based in Limburg" — Limburg is Fidestay's launch market.

## Decisions (do not relitigate)

- Single file, no build step. A contact form is not a reason to add one.
- GitHub repos stay private until the code is representative; the tile links
  to the profile anyway.
- The channels block is a centred head, a logo strip between hairlines, and one
  line underneath. It is the only centred head on the page, on purpose.
- The hero deck does not fan out below 768px — it caused horizontal scroll.

## SEO status as of 2026-09-10

Tooling: the `claude-seo` plugin (AgriciDaniel/claude-seo v2.3.0) is vendored
**project-scoped** in `.claude/skills` + `.claude/agents`, with its own Python
venv at `.claude/skills/seo/.venv`. The whole `.claude/` tree is gitignored, so
a fresh clone has no `/seo` command until it is reinstalled. Run scripts with
`./.claude/skills/seo/scripts/claude-seo run <script>.py`; `... doctor` reports
runtime health.

**Was already right:** `<title>`, `<meta name="description">`, `lang="en"`, one
`<h1>`, four `<h2>`, three `<h3>`, descriptive `alt` on the four content images,
`alt=""` on the seven decorative hero images, `width`/`height` everywhere,
`loading="lazy"` below the fold, favicon set, `www` 308s to apex.

**Added 2026-09-10:** `<link rel="canonical">` to the apex, `theme-color`, the
full Open Graph + Twitter `summary_large_image` set, `robots.txt` (disallows
`/api/` and the OG card), `sitemap.xml`, and a JSON-LD `@graph` with
`ProfilePage` / `WebSite` / `Person` / `ImageObject`. The `Person` carries
`sameAs` to the four channels — all four were HTTP-checked 200 before shipping.

`assets/og-image.jpg` (1200x630, 86 KB) is **generated**, not hand-made:
`assets/og-card.html` is the source. It is `noindex` and robots-disallowed so it
never competes with the real page. Change the card and re-render — **never edit
the JPEG.** The render is deterministic; an unchanged card produces a
byte-identical file.

`tools/` holds the three scripts this needs, all run through the venv above:

| | |
|---|---|
| `tools/install-seo-tooling.sh` | Reinstalls claude-seo into *this* repo's `.claude/`, never `~/.claude`. Run it after a fresh clone. |
| `tools/render-og-image.py` | `assets/og-card.html` -> `assets/og-image.jpg`. |
| `tools/measure-lcp.py` | Reports the LCP element, LCP time and CLS against a local server. |

These are maintenance scripts, not a build step — the site still deploys as
static files with nothing to compile.

Measured, not guessed: the LCP element is the `builds` text span (~176 ms local,
CLS 0.004), so **no image needs `fetchpriority="high"`**. Do not add one to the
hero cards on a hunch; re-measure first. `agent_ux_check` scores 96/100, the one
deduction being an input without a `label[for]` in the contact form.

**Still open:** verify the live OG render in a real scraper (X / LinkedIn /
Slack unfurl) after deploy; no Search Console property is connected, so there is
no impression data to act on; PageSpeed Insights needs an API key to avoid the
shared-quota 429.
