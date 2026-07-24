# Legal & Privacy — Datenschutz, Footer, Attribution

> ⚠️ **Retroactive doc — written after the fact.** Reconstructed on **2026-07-24** from the
> merged branch `feature/legal-privacy` (PR #18, commit `d6a395c`), its diff, and the Claude
> Code session that produced it (`9be6f766`, 2026-07-21). It reports the decisions as they can
> be recovered, not as a contemporaneous log. The **decision entry of record remains
> [`DESIGN.md` → D17](../../DESIGN.md).**
>
> **Not legal advice.** The legal reasoning below is the project's own recorded decision,
> captured so it isn't silently re-litigated — not a legal opinion.

> Topic design doc. The legal slice of the "web basics" pass (**Q10**): why the site ships *no*
> Impressum but *does* ship a Datenschutzerklärung, the always-visible footer + author
> attribution, the bilingual (DE/EN) privacy-and-credits dialog, and the dialog keyboard
> contract that the accessibility pass ([`accessibility.md`](accessibility.md), D18) later
> **extracted** rather than reinvented. Sibling passes: [`site-metadata.md`](site-metadata.md)
> (D16) and accessibility (D18). Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D17).
**Last updated:** 2026-07-24 (retroactive).

---

## 1. The legal decision — no Impressum, but a privacy notice

*(Recorded decision, not legal advice.)*

- **No Impressum.** § 5 DDG binds *geschäftsmäßige* digital services; this is an unmonetized
  personal project — no ads, affiliates, or client work — so it rests on the private-use
  exemption. Weighed against the alternative (a private person's Impressum needs a
  *ladungsfähige Anschrift*, and a P.O. box does not satisfy case law — i.e. publishing a home
  address), the exemption is the better trade at this project's profile. **Revisit if** the
  site is ever monetized, used commercially, or fronts paid work.
- **A Datenschutzerklärung still ships.** DSGVO Art. 13 is separate and applies regardless of
  commercial character: GitHub Pages logs visitor IPs via a US provider, so a short privacy
  notice is owed. It is cheap and honest to give here because the site genuinely does nothing —
  no cookies, no analytics, no CDN fonts, dataset bundled into the JS (verified, §6).
- **The GitHub-profile link is attribution, not an Impressum.** It triggers no legal obligation
  and satisfies none, so it is pure upside — the honest middle ground where anyone who wants to
  know who built this can find out, without a home address being published.

## 2. The footer — one line, its own element

An always-visible ~25px line: *"Built by Yannic Bachmann · Source on GitHub · Privacy &
credits."* It is its **own element**, deliberately *not* placed inside `.timeline-info` — that
hint box is `display: none` on phones (D10's compact chrome, see
[`responsive-layout.md`](responsive-layout.md) §5), and a privacy notice has to stay reachable
at *every* breakpoint. It is kept to a single line because chart height is this layout's scarce
resource. Machine-checked visible and in-viewport at desktop, phone, and short-landscape.

## 3. Copy as data, bilingual

`src/legalContent.js` holds the modal copy as **data, not JSX**: `sections[]` of
`{ h, blocks[] }`, where a block is `{ p: Para }` (a paragraph) or `{ ul: Para[] }` (a list),
and `Para` is an array of strings and `{ text, href }` links concatenated in order. Three
reasons for the shape:

1. The two languages stay **structurally identical**, so a missing section is obvious at a glance.
2. The renderer needs no `dangerouslySetInnerHTML`.
3. A plain data module keeps Fast Refresh happy — component files must export only components
   (the same reason `format.js` / `data.js` exist).

Keeping links as data is what lets **one renderer serve both languages**. The dialog opens in
German on German-locale browsers and English otherwise, with a toggle (verified in both
directions). Its seven sections cover the controller, GitHub Pages hosting (server logs,
Art. 6(1)(f), the US transfer + the Data Privacy Framework), the app's own no-data behavior,
and the source attribution (§5).

## 4. The dialog — built right, and it became the template

The Q10 audit that came with D16 ([`site-metadata.md`](site-metadata.md)) had just catalogued
the *older* Timeline modals' accessibility defects (no Escape, no focus trap, no
`role="dialog"`). So `LegalModal` was built correctly from the start — `role="dialog"`, Escape
to close, focus-in on open, a Tab focus-trap, and focus restore. Two decisions are worth
keeping:

- **Not reusing `.event-modal-overlay`.** Timeline's double-tap handler keys off that exact
  class to decide a tap hit a backdrop (D11, [`touch-gestures.md`](touch-gestures.md)), so
  sharing it would let a double-tap on this dialog drive timeline zoom. Separate `.legal-*`
  classes keep the surfaces uncoupled.
- **Focus restore belongs to the opener, not the dialog.** A genuine bug the verifier caught:
  restoring from whatever `document.activeElement` was at mount silently fails when the trigger
  was never focused — Safari doesn't focus buttons on click, and a programmatic `.click()`
  doesn't either — dumping focus on `<body>`, a real keyboard dead-end. Fix: `SiteFooter` holds
  a ref to its own trigger button and restores focus to it on close; only the owner reliably
  knows the trigger.

This dialog's keyboard contract is exactly what the accessibility pass (D18,
[`accessibility.md`](accessibility.md)) **extracted into a shared dialog shell** rather than
reinventing — the older Timeline modals were then retrofitted onto it.

## 5. Source attribution (settles a licensing tension)

Before this feature the app had **zero outbound links** (the schema's `sources` field was
rendered nowhere). The dialog's credits section provides on-site source attribution, which also
settles the tension between the repository's all-rights-reserved `LICENSE` and a dataset derived
in part from CC-BY-SA sources.

## 6. Verification

The privacy copy's central claim — *no cookies, no storage, no requests after load* — was
verified against the source, not assumed: **zero** storage APIs, **zero** `fetch`/XHR/beacon
calls, and **zero** external URLs anywhere in `src/`. A `check-footer` probe then ran 22
assertions: footer reachable and in-viewport at three breakpoints, Escape closes the dialog, the
language toggle works in both directions, and focus restores to the trigger.

## 7. Scope & open items

- **Closes the legal slice of Q10**; the siblings are site identity (D16) and the accessibility
  pass (D18).
- Two decisions the maintainer owned explicitly: the **contact email** (defined in
  `legalContent.js`) and **German + English** (defaulting to the browser locale).
- *Not legal advice* — recorded so the Impressum stance isn't silently re-litigated. Revisit if
  the project's commercial profile ever changes (§1).
