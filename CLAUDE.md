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

## SEO baseline as of 2026-09-10

Nothing has been done here yet. Current state, verified against the live site:

**Present:** `<title>`, `<meta name="description">`, `lang="en"`, one `<h1>`,
four `<h2>`, three `<h3>`, descriptive `alt` on all four content images,
`alt=""` on the seven decorative hero images (correct), `width`/`height` on
every image, `loading="lazy"` below the fold, favicon set.

**Absent:** Open Graph and Twitter card tags, `<link rel="canonical">`,
`robots.txt` (404), `sitemap.xml` (404), any JSON-LD — a `Person` /
`ProfilePage` block is the obvious first one, with `sameAs` pointing at the
four channels.

Watch out for: it is one page with no routes, so a sitemap is nearly trivial
and a canonical matters mostly for the `www`/apex pair. There is no server-side
rendering question — the HTML is fully static and complete before JavaScript
runs, so crawlers see everything.
