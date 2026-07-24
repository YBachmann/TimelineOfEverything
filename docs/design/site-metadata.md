# Site Identity & Link Previews

> ⚠️ **Retroactive doc — written after the fact.** Reconstructed on **2026-07-24** from the
> merged branch `feature/site-metadata` (PR #17, commit `fecdcb7`), its diff, and the Claude
> Code session that produced it (`9be6f766`, 2026-07-21). It reports the decisions as they can
> be recovered, not as a contemporaneous log. The **decision entry of record remains
> [`DESIGN.md` → D16](../../DESIGN.md).**

> Topic design doc. The first slice of the "generic web basics" pass (**Q10**): a favicon /
> icon set, Open Graph + Twitter link-preview cards, a description + canonical URL, and a web
> manifest — with every raster asset **generated from one artwork definition** rather than
> hand-drawn. Sibling passes: legal ([`legal-privacy.md`](legal-privacy.md), D17) and
> accessibility ([`accessibility.md`](accessibility.md), D18). Indexed from the main
> [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D16).
**Last updated:** 2026-07-24 (retroactive).

---

## 1. Problem

The app still shipped Vite's default `vite.svg` favicon and a bare `<head>`, so sharing the URL
anywhere — chat, social, a bookmark — produced a naked, untitled link. For a project whose
entire value proposition is *visual*, that is the worst possible first impression. Q10's first
pass gives the page an identity and a share preview.

## 2. Generated, not hand-drawn — the key choice

Every raster asset is derived from a **single `iconSvg()` definition** in
`scripts/make-icons.mjs` (`npm run icons`): the SVG favicon, the PWA icons (192, 512, and a
512 maskable), the Apple touch icon, and the 1200×630 Open Graph card. Deriving them from one
source means they **can never drift apart**. The committed output is checked in, so the script
only re-runs when the artwork itself changes — it is a reproducible generator, not a pile of
mystery binaries.

- **Rasterization reuses the no-Playwright path.** This machine has no `sharp`/`resvg` and no
  Playwright, so the generator screenshots **headless Edge over CDP**, sizing a page exactly to
  each target — the same approach the mobile harness established (see
  [`responsive-layout.md`](responsive-layout.md) §7, [`mobile-polish.md`](mobile-polish.md) §6).
- **The mark** is the project's own visual language reduced to what survives 16px: a timeline
  spine with three category-colored dots whose gaps shrink rightward — the symlog compression of
  recent history that defines the app. Three `r=6` dots is the most that stays legible at favicon
  size; four would mush.
- **Maskable vs plain vs Apple.** The maskable icon renders the mark smaller inside a 40% safe
  zone; the favicon/PWA icons are rounded; the Apple touch icon stays *square* (iOS applies its
  own mask, and a pre-rounded source shows a doubled corner). A single `radius` value in
  viewBox units scales to every output. *(Bug worth remembering: passing that radius in pixels
  made it land in the 64-unit viewBox and rendered the icon as a full circle.)*
- **The OG card** (1200×630) uses real events, real dates, and one span bar, so it reads as a
  timeline rather than decoration.

## 3. The document head

Added to `index.html`: a `description`, `canonical`, and `author`; the Open Graph set
(`type`/`site_name`/`locale`/`url`/`title`/`description`/`image` + width/height/`alt`); the
Twitter `summary_large_image` set; and links to the manifest, Apple touch icon, and favicon,
plus `theme-color`. The web manifest (`public/manifest.webmanifest`) makes the app installable —
consistent with the mobile work in D10/D11/D13.

## 4. Two base-path traps (the subtle part)

The site deploys under `/TimelineOfEverything/`, so Vite's `base` handling decides whether asset
URLs resolve. The reusable lesson: **Vite rewrites element attributes it can parse, not strings
it can't see.**

- **Rewritten:** root-relative `href`/`src` in `index.html` (`/favicon.svg` →
  `/TimelineOfEverything/favicon.svg`) — which is why the icon links just work.
- **Not rewritten — `<meta content="…">`:** so `og:image` would stay base-less. Social scrapers
  reject relative URLs anyway, so the OG/Twitter image URLs are **hardcoded to the full origin**.
- **Not rewritten — `public/` file contents** like `manifest.webmanifest` (JSON Vite never
  parses). The manifest sidesteps this *without* hardcoding the base at all: per spec its
  `src`/`start_url` resolve against the **manifest's own URL**, so plain relative values (`"./"`,
  `"icon-192.png"`) land correctly under any base.

## 5. Deliberately not added

- **`robots.txt` / `sitemap.xml`.** A project site lives at `/TimelineOfEverything/`, so crawlers
  only ever read `ybachmann.github.io/robots.txt`; one in the subpath is dead weight.
- **A cookie banner** — nothing to consent to (see §6).
- **A CSP meta** — no runtime network calls to constrain.
- Also removed the unreferenced `vite.svg` / `react.svg` template leftovers.

## 6. Verification

Not merely "the files exist": a `check-meta` probe confirmed every declared asset **resolves
over HTTP** against the built site under its base path. A companion audit found **zero storage
APIs, zero runtime network calls, zero external resources** — which both backs the
installable/offline story and, bridging to D17, is what lets the privacy notice
([`legal-privacy.md`](legal-privacy.md)) be genuinely short and truthful.

## 7. Scope & what came next

- This is the **first** of Q10's three passes; the others are the legal/privacy pass
  ([`legal-privacy.md`](legal-privacy.md), D17) and the accessibility pass
  ([`accessibility.md`](accessibility.md), D18).
- The always-visible footer, "built by" credit, and on-site source attribution that came up
  while shipping this landed in **D17** — before it the app had *zero* outbound links (the
  schema's `sources` field was rendered nowhere).
